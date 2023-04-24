import * as Utilities from './utility';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Logger } from 'homebridge';
import * as parser from 'fast-xml-parser';
import { Mutex, MutexInterface } from 'async-mutex';
import { Vendor, Area, Zone, Output, SequenceResponse, AreaBank, AreaState, ZoneState, SecuritySystemAreaCommand, SecuritySystemZoneCommand } from './definitions';
export const retryDelayDuration: number = 3000;

export class NX595ESecuritySystem {
  protected username: string;
  protected passcode: string;
  protected IPAddress: string;
  protected httpPrefix: string;
  protected log: Logger;

  protected client: AxiosInstance;

  private readonly lock: Mutex = new Mutex();
  protected sessionID = '';
  protected vendor: Vendor = Vendor.UNDEFINED;
  protected version = '';
  protected release = '';

  protected _isMaster = false;
  protected _isInstaller = false;

  protected lastUpdate: Date = new Date();
  protected areas: Area[] = [];
  protected zones: Zone[] = [];
  protected outputs: Output[] = [];
  protected zoneNameCount: number = 0;
  protected __extra_area_status: string[] = [];
  protected zonesSequence: number[] = [];
  protected zonesBank: number[][] = [];
  protected _zvbank: number[][] = [];

  constructor(address: string, userid: string, pin: string, log: Logger, useHTTPS: Boolean = false) {
    this.IPAddress = address;
    this.username = userid;
    this.passcode = pin;
    this.log = log;
    this.httpPrefix = (useHTTPS)?'https://':'http://';
    this.client = axios.create({
      baseURL: this.httpPrefix + this.IPAddress,
      timeout: 10000,
      method: "post",
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      // Makes sure that 30x status codes are not considered errors so that we
      // cand handle them properly when making network calls, but at the same
      // time forbid the axios library from automatically following redirects
      maxRedirects: 0,
      validateStatus: function (status) {
        return (status >= 200 && status < 400);
      }
    });
    this.client.interceptors.response.use(
      response => response,
      error => {
        // We really want to throw the error so it is handled and we don't get
        // an unhandledrejection error. By throwing here, we are handling the
        // rejection, and bubbling up to the closest error handler (try/catch or
        // catch method call on a promise).
        throw error;
      }
    );
  }

  async login() {
    // Parameter checks before logging in
    if (!(Utilities.checkAddress(this.IPAddress))) { throw new Error('Not a valid IP address or hostname'); }
    if (typeof this.username == 'undefined' || this.username == "") { throw new Error('Did not specify a username'); }
    if (typeof this.passcode == 'undefined' || this.passcode == "") { throw new Error('Did not specify a user PIN'); }

    // Attempting login
    this.log.debug('Attempting login...');
    const payload = {'lgname': this.username, 'lgpin': this.passcode};
    try {
      // Lock the session ID mutex; we are attempting to log in, so we can't
      // have requests being made before acquiring a new session
      const response = await this.makeRequest('login.cgi', payload, false);
      if (response == undefined) throw new Error("Login unsuccessful");

      const data = response.data;

      // Login confirmed, parsing session ID
      const session = data.match(/getSession\(\)\{return \"([A-Z0-9]*)\"/)?.[1];
      this.sessionID = session;
      this.log.debug("Session ID: ", this.sessionID);

      // Parsing panel vendor and software details
      const vendor = data.match(/script src=\"\/([a-zA-Z0-9._-]+)\/.*\.js/)?.[1];
      const vendorDetails = vendor.split(/[/_-]/);
      switch (vendorDetails[1]) {
        case "CN": { this.vendor = Vendor.COMNAV; break; }
        default: { throw new Error("Unrecognized vendor"); }
      }
      this.version = vendorDetails[2];
      this.release = vendorDetails[3];
      this.log.debug("Vendor Details: ", this.vendor, this.version, this.release);

      this.lastUpdate = new Date();
      this.log.debug('Logged in successfully.');

      // Our new session is acquired and the session ID is stored, so we can
      // unlock the mutex; the next function calls rely on network requests,
      // so if the mutex stays locked we are heading straight into a deadlock

      // Start retrieving area and zone details; pass through the initial Response
      await this.retrieveAreas(response);
      await this.retrieveZones();
      await this.retrieveOutputs();
    } catch (error) {
      this.sessionID = "";
      // Make sure to unlock the mutex to avoid potential deadlocks
      throw (error);
    }
  }

  async logout() {
      if (this.sessionID === "") return;

      // Logout gracefully
      this.sessionID = "";
      await this.makeRequest('logout.cgi', {}, false).catch(() => {});
      this.log.debug('Logged out.');
  }

  async sendAreaCommand(command: SecuritySystemAreaCommand = SecuritySystemAreaCommand.AREA_CHIME_TOGGLE, areas: number[] | number = []) {
    try {
      if (this.sessionID === "") {
        await this.login();
        if (this.sessionID === "") throw(new Error('Could not send area command; not logged in'));
      }

      if (!(command in SecuritySystemAreaCommand)) throw new Error('Invalid command ' + command);

      // Load actual area banks to local table for ease of use
      let actionableAreas: number[] = [];
      let actualAreas: number[] = [];
      for (let i of this.areas) actualAreas.push(i.bank);

      // Decipher input and prepare actionableAreas table for looping through
      if (typeof(areas) == 'number') actionableAreas.push(areas);
      else if (Array.isArray(areas) && areas.length > 0) actionableAreas = areas;
      else actionableAreas = actualAreas;

      // For every area in actionableAreas:
      for (let i of actionableAreas) {
        // Check if the actual area exists
        if (!actualAreas.includes(i)) throw new Error('Specified area ' + i + ' not found');
        else {
          // Prepare the payload according to details
          const payload = {
            'comm': 80,
            'data0': 2,
            'data1': (1 << i % 8),
            'data2': command
          };

          this.log.debug('Sending area command: ' + command + " for area: " + i + "...");
          // Finally make the request
          await this.makeRequest('user/keyfunction.cgi', payload);
          this.log.debug("Command send successfully.");
        }
      }
      return true;
    } catch (error) { throw(error); }
  }

  private async retrieveAreas (response: AxiosResponse | undefined = undefined) {
    if (this.sessionID == "")
      throw(new Error('Could not retrieve areas; not logged in'));

    try {
      this.log.debug("Retrieving areas...");
      // If we are passed an already loaded Response use that, otherwise reload area.htm
      if (response == undefined) {
        response = await this.makeRequest('user/area.htm', { "sess": this.sessionID }, false);
      }

      // Get area sequence
      let regexMatch: any = response.data.match(/var\s+areaSequence\s+=\s+new\s+Array\(([\d,]+)\);/);
      let sequence: number[] = regexMatch[1].split(',');

      // Get area states
      regexMatch = response.data.match(/var\s+areaStatus\s+=\s+new\s+Array\(([\d,]+)\);/);
      let bank_states = regexMatch[1].split(',');

      // Get area names
      regexMatch = response.data.match(/var\s+areaNames\s+=\s+new\s+Array\((\"(.+)\")\);/);
      let area_names: string[] = regexMatch[1].split(',');
      area_names.forEach((item, i, arr) => { arr[i] = decodeURI(item.replace(/['"]+/g, '')); })

      // Pad sequence table to match the length of area_names table
      if (area_names.length - sequence.length > 0) {
        let filler = new Array(area_names.length - sequence.length);
        filler.fill(0);
        sequence = sequence.concat(filler);
      }

      // Reset class areas tables...
      this.areas.length = 0;

      // ... and populate it from scratch
      area_names.forEach((name, i) => {
        // If the name is "!" it's an empty area; ignore it
        if (name == "%21" || name == "!") return;

        const startingState: number = Math.floor(i / 8) * 17;
        // Create a new Area object and populate it with the area details, then push it
        let newArea: Area = {
          bank: i,
          name: (name == "" ? 'Area ' + (i+1): name),
          priority: 6,
          sequence: sequence[i],
          bank_state: bank_states.slice(startingState, startingState + 17),
          status: "",
          states: {}
        };

        this.areas.push(newArea);
      });

      if (this.areas.length == 0) throw new Error('No areas found; check your installation and/or user permissions');

      this.log.debug("Retrieved " + this.areas.length + " areas successfully.");
      this.processAreas();
    } catch (error) { throw(error); }

    return;
  }

  private async retrieveZones() {
    if (this.sessionID == "")
      throw(new Error('Could not retrieve zones; not logged in'));

    try {
      this.log.debug("Retrieving zones...");
      // Retrieve zones.htm for parsing
      const response = await this.makeRequest('user/zones.htm', { "sess": this.sessionID }, false);

      // Get Zone sequences from response and store in class instance
      let regexMatch: any = response.data.match(/var\s+zoneSequence\s+=\s+new\s+Array\(([\d,]+)\);/);
      this.zonesSequence = regexMatch[1].split(',').filter((x: string) => x.trim().length && !isNaN(parseInt(x))).map(Number);

      // Get Zone banks from response and store in class instance
      this.zonesBank.length = 0;
      regexMatch = response.data.match(/var\s+zoneStatus\s+=\s+new\s+Array\((.*)\);/);
      regexMatch = regexMatch[1].matchAll(/(?:new\s+)?Array\((?<states>[^)]+)\)\s*(?=$|,\s*(?:new\s+)?Array\()/g);
      for (const bank of regexMatch) {
        this.zonesBank.push(bank[1].split(',').filter((x: string) => x.trim().length && !isNaN(parseInt(x))).map(Number));
      }

      // Retrieve zone names
      regexMatch = response.data.match(/var zoneNames\s*=\s*(?:new\s+)?Array\(([^)]+)\).*/);
      let zone_names: string[] = regexMatch[1].split(',');
      zone_names.forEach((item, i, arr) => { arr[i] = decodeURI(item.replace(/['"]+/g, '')); })

      // Firmware versions from 0.106 below don't allow for zone naming, so check for that
      let zoneNaming: boolean = (parseFloat(this.version) > 0.106) ? true : false;

      // Finally store the zones
      // Reset class zones tables...
      this.zones.length = 0;

      // ... and populate it from scratch
      this.zoneNameCount = zone_names.length;
      this.zones = Array(this.zoneNameCount).fill(undefined);
      zone_names.forEach((name, i) => {
        // If the name is "!" it's an empty area; ignore it
        if (name == "%21" || name == "!" || name == "%2D" || name == "-" || (zoneNaming && name == "")) {
          i++;
          return;
        }

        // Create a new Zone object and populate it with the zone details, then push it
        let newZone: Zone = {
          bank: i,
          associatedArea: -1,
          name: (zoneNaming?(name == "" ? 'Sensor ' + (i+1) : name) : ('Sensor ' + (i+1))),
          priority: 6,
          sequence: 0,
          bank_state: [],
          status: "",
          isBypassed: false,
          autoBypass: false
        };

        this.zones[i] = newZone;
      });

      this.log.debug("Retrieved " + this.zones.length + " zones successfully.");
      this.processZones();
    } catch (error) { throw(error); }

    return;
  }

  private async retrieveOutputs (response: AxiosResponse | undefined = undefined) {
    if (this.sessionID == "")
      throw(new Error('Could not retrieve outputs; not logged in'));

    try {
      this.log.debug("Retrieving outputs...");
      // If we are passed an already loaded Response use that, otherwise reload outputs.htm
      if (response == undefined) {
        response = await this.makeRequest('user/outputs.htm', { "sess": this.sessionID }, false);
      }

      if (response == undefined)
        throw new Error('Response came back undefined from the panel');

      // Reset class outputs tables...
      this.outputs.length = 0;

      // Get output names
      let regexMatch: any = response.data.matchAll(/var\s+oname\d+\s+=\s+decodeURIComponent\s*\(\s*decode_utf8\s*\(\s*\"(.*)\"\)\);/g);
      let outputNames: string[] = [];
      for (const name of regexMatch) outputNames.push(name[1]);

      // Get output values
      regexMatch = response.data.matchAll(/var\s+ostate\d+\s+=\s+\"([0,1]{1})\";/g);
      let outputValues: Boolean[] = [];
      for (const value of regexMatch) outputValues.push(+(value[1]) == 1);

      for (let i = 0; i < outputNames.length; i++) {
        // Create a new Output object and populate it with the output details, then push it
        let newOutput: Output = {
          bank: i,
          name: (outputNames[i] == "" ? 'Output ' + (i+1): outputNames[i]),
          status: outputValues[i]
        };

        this.outputs.push(newOutput);
      }
    } catch (error) { throw(error); }

    this.log.debug("Retrieved " + this.outputs.length + " outputs successfully.");
    return;
  }

  private processAreas() {
    if (this.sessionID == "")
      throw(new Error('Could not process areas; not logged in'));

    // Loop through detected areas
    this.areas.forEach(area => {
      // Define mask for said area
      let mask = (1 << (area.bank % 8));

      // Create virtual states table for ease and readability
      let vbank: number[] = [];
      area.bank_state.forEach(state => {
        vbank.push(state & mask);
      });

      // (Partially) Armed state, exit mode and chime setting booleans
      let st_partial = Boolean(vbank[AreaBank.PARTIAL]);
      let st_armed = Boolean(vbank[AreaBank.ARMED]);
      let st_exit1 = Boolean(vbank[AreaBank.EXIT_MODE01]);
      let st_exit2 = Boolean(vbank[AreaBank.EXIT_MODE02]);
      let st_chime = Boolean(vbank[AreaBank.CHIME]);

      // Priority starts from 6, which is the lowest; can go up to 1
      let priority = 6;

      let status: string = "";

      // Start with index -1
      let index = -1;

      while (status == "") {
        // Increment the index by 1
        index++;
        if (index >= AreaState.Priority.length) {

          // If there are extra area status messages set go into this
          if (this.__extra_area_status.length > 0) {
            status = this.__extra_area_status[index - AreaState.Priority.length];

            // Convert 'No System Faults' to 'Not Ready'
            if (status == "No System Faults") status = AreaState.Status[AreaState.State.NOT_READY_FORCEABLE];
            else status = AreaState.Status[AreaState.State.READY];
          }
          continue;
        }

        // Get virtual index based on priority
        let v_index = AreaState.Priority[index];

        if (vbank[v_index]) {
          if (!(st_armed || st_partial) || AreaState.Status[v_index] !== AreaState.Status[AreaState.State.READY]) {
            status = AreaState.Status[v_index];
          }

          if (AreaState.Status[v_index] !== AreaState.Status[AreaState.State.DELAY_EXIT_1]) {
            // Bump to DELAY_EXIT_2, as it will eventually max out the while loop and move past that
            index++;
          }
        } else if (AreaState.Status[v_index] == AreaState.Status[AreaState.State.READY] && !(st_armed || st_partial)) {
          status = AreaState.Status[AreaState.State.NOT_READY];
        }

        if (vbank[AreaBank.FIRE_ALARM] || vbank[AreaBank.BURGLAR_ALARM] || vbank[AreaBank.PANIC_ALARM] || vbank[AreaBank.MEDICAL_ALARM]) {
          priority = 1;
        } else if (vbank[AreaBank.UNKWN_11] || vbank[AreaBank.UNKWN_12] || vbank[AreaBank.UNKWN_13] || vbank[AreaBank.UNKWN_14] || this.__extra_area_status.length > 0) {
          priority = 2;
        } else if (vbank[AreaBank.UNKWN_10] || st_partial) {
          priority = 3;
        } else if (st_armed) {
          priority = 4;
        } else if (vbank[AreaBank.UNKWN_02]) {
          priority = 5;
        }

        // Update the area with details
        area.priority = priority;
        area.status = status;
        area.states = {
          'armed': st_armed,
          'partial': st_partial,
          'chime': st_chime,
          'exit1': st_exit1,
          'exit2': st_exit2
        };
      }
    });

    return;
  }

  private processZones() {
    if (this.sessionID == "")
      throw(new Error('Could not process zones; not logged in'));

    this._zvbank = Array(this.zoneNameCount).fill([]);

    // Loop through detected areas
    this.zones.forEach(zone => {
      if (zone == undefined) return;
      // Set our mask and initial offset
      let mask: number = 1 << zone.bank % 16;
      let index: number = Math.floor(zone.bank / 16);

      // Set initial priority, starting with 5, which is the lowest
      let priority = 5;

      // Create a virtual zone state table for ease of reference
      let vbank: boolean[] = [];
      this.zonesBank.forEach(element => {
        let value: boolean = Boolean(element[index] & mask);
        vbank.push(value);
        this._zvbank[zone.bank].push(value ? 1 : 0);
      });

      // Red zone status
      if (vbank[ZoneState.State.UNKWN_05]) priority = 1;

      // Blue zone status
      if (vbank[ZoneState.State.UNKWN_01] || vbank[ZoneState.State.UNKWN_02] || vbank[ZoneState.State.UNKWN_06] || vbank[ZoneState.State.UNKWN_07]) priority = 2;

      // Yellow zone status
      if (vbank[ZoneState.State.BYPASSED] || vbank[ZoneState.State.UNKWN_04]) priority = 3;

      // Grey zone status
      if (vbank[ZoneState.State.UNKWN_00]) priority = 4;

      let bank_no: number = 0;
      let status: string = "";

      while (status == "") {
        if (vbank[bank_no]) status = ZoneState.Status[bank_no];
        else if (bank_no == 0) status = ZoneState.Ready;
        bank_no++;
      }

      // Update our sequence
      let sequence: number = zone.bank_state.join() !== this._zvbank[zone.bank].join() ? Utilities.nextSequence(zone.sequence) : zone.sequence;

      // Update the zone with details
      zone.priority = priority;
      zone.status = status;
      zone.bank_state = this._zvbank[zone.bank];
      zone.sequence = sequence;
      zone.isBypassed = vbank[ZoneState.State.BYPASSED];
      zone.autoBypass = vbank[ZoneState.State.AUTOBYPASS];
      zone.associatedArea = index;
    });

    return;
  }

  async poll() {
    // Requesting a sequence response is a means of polling the panel for
    // updates; if the sequence value changes, it means something has changed
    // The index of the area or zone that changed indicates the entry that
    // needs updating, but it is up to the user to call the corresponding
    // update functions to perform the actual update

    if (this.sessionID == "")
      return false;

    try {
      const response = await this.makeRequest('user/seq.xml');
      const json = parser.parse(response.data)['response'];
      const seqResponse: SequenceResponse = {
        areas: typeof(json['areas']) == 'number'? [json['areas']]: json['areas'].split(',').filter((x: string) => x.trim().length && !isNaN(parseInt(x))).map(Number),
        zones: typeof(json['zones']) == 'number'? [json['zones']]: json['zones'].split(',').filter((x: string) => x.trim().length && !isNaN(parseInt(x))).map(Number)
      };

      let performAreaUpdate: boolean = false;
      let performZoneUpdate: boolean = false;

      let index = 0;

      // Check for zone updates first
      for (index = 0; index < seqResponse.zones.length; index++) {
        if (seqResponse.zones[index] != this.zonesSequence[index]) {
          // Updating sequence and zone details now
          this.zonesSequence[index] = seqResponse.zones[index];
          await this.zoneStatusUpdate(index);
          performZoneUpdate = true;
        }
      }

      // Now check for area update
      for (index = 0; index < seqResponse.areas.length; index++) {
        if (seqResponse.areas[index] != this.areas[index].sequence) {
          // Updating sequence and zone details now
          this.areas[index].sequence = seqResponse.areas[index];
          await this.areaStatusUpdate(index);
          performAreaUpdate = true;
        }
      }

      this.outputStatusUpdate();

      // Trigger zone and area updates according to changes detected
      if (performZoneUpdate) this.processZones();
      if (performAreaUpdate) this.processAreas();
    } catch (error) { throw(new Error("Error while polling: " + (<Error>error).message)); }

    return;
  }

  private async zoneStatusUpdate(bank: number) {
    if (this.sessionID == "")
      throw(new Error('Could not fetch zone status; not logged in'));

    // Fetch zone update
    try {
      const response = await this.makeRequest('user/zstate.xml', {'state': bank});
      const json = parser.parse(response.data)['response'];
      const zdat = typeof(json['zdat']) == 'number'? [json['zdat']]: json['zdat'].split(',').filter((x: string) => x.trim().length && !isNaN(parseInt(x))).map(Number);
      this.zonesBank[bank] = zdat;
    } catch (error) { throw(error); }

    return;
  }

  private async outputStatusUpdate() {
    if (this.sessionID == "")
      throw(new Error('Could not fetch output status; not logged in'));

    // Fetch zone update
    try {
      const response = await this.makeRequest('user/outstat.xml');
      const json = parser.parse(response.data)['response'];
      const values = Object.values(json);
      for (let i: number = 0; i < this.outputs.length; i++) {
        this.outputs[i].status = (values[i] == 0)?false:true;
      }
    } catch (error) { throw(error); }

    return;
  }

  private async areaStatusUpdate(bank: number) {
    if (this.sessionID == "")
      throw(new Error('Could not fetch area status; not logged in'));

    // Fetch area update
    try {
      const response = await this.makeRequest('user/status.xml', {'arsel': bank});
      const json = parser.parse(response.data)['response'];
      if (json.hasOwnProperty('sysflt')) this.__extra_area_status = json['sysflt'].split('\n');
      else this.__extra_area_status = [];
      this.areas[bank].bank_state.length = 0;
      for (let index: number = 0; index < 17; index++) {
        this.areas[bank].bank_state.push(json["stat"+index]);
      }
    } catch (error) { throw(error); }

    return;
  }

  // This is a helper function that handles all network requests necessary,
  // from logging in to polling for system changes and issuing area and zone
  // commands. The payload contains all necessary parameters for the actual
  // request, except for the session ID, which is supplied before the call
  // itself takes place. attemptLogin is a special flag that is set to true
  // only when calling makeRequest from the login and logout functions, and
  // is used to check for invalid logins and to bypass the mutex lock for
  // acquiring a new session on expiration
  private async makeRequest(address: string, payload = {}, shouldLock = true) {
    let _shouldLock = shouldLock;
    let release: MutexInterface.Releaser = (() => {});

    try {
      if (this.sessionID === "") _shouldLock = false;

      // Unless we are attempting to log in for the first time or if the session
      // has expired, we should wait on our mutex to make sure that no calls are
      // processed while the session ID is changing
      if (_shouldLock) release = await this.lock.acquire();

      // Finish the payload by including the current session ID
      // Fun fact: the NX-595E implementation of HTTP server *demands* that the
      // session ID comes first in the payload, otherwise the call returns 302,
      // therefore we have to create a local final payload with the 'sess' value
      // first in the object before passing it to the axios client
      const _payload = { ...(_shouldLock)?{ 'sess': this.sessionID }:{}, ...payload };

      // Make the actual call with the complete payload
      const response = await this.client({
        url: address,
        data: _payload
      });

      // If the response status code is in the 30x range, we have been sent
      // back to the login page, which - in turn - means that either the session
      // has expired, or we actually attempted to log in and our login info was
      // invalid; in all other cases, return the response to the caller
      if (response.status < 300) return response;
      else {
        // If we are attempting to log in, the credentials provided were invalid
        // and we have to abort...
        if (!_shouldLock) throw new Error("Login unsuccessful.");

        // ... otherwise our session has expired and we need to log in again to
        // refresh it; bear in mind that the three retrieving functions of the
        // plugin (retrieveAreas, retrieveZones and retrieveOutputs) are called
        // only from the login function, so they are called by definition as not
        // locking, as they would deadlock the program in the first attempt to
        // refresh the session
        this.log.debug("Session expired; attempting to reacquire...");
        await this.login();
        this.log.debug("Reacquired session successfully.");

        // We'll create a new local payload with the new session ID and retry
        this.log.debug("Reattempting request...");
        const _newPayload = { ...{ 'sess': this.sessionID }, ...payload };
        const newResponse = await this.client({
          url: address,
          data: _newPayload
        });
        this.log.debug("Request sent successfully.");
        if (newResponse.status >= 300) throw new Error("Request denied by server with code " + newResponse.status);
        return newResponse;
      }
    } catch (error) {
      throw error;
    } finally {
      // Call release before exiting the function; if a lock was requested, it
      // will unlock the mutex, otherwise it will call an empty arrow function
      // that does nothing ( () => {} ).
      release();
    }
  }

  async sendOutputCommand(command: Boolean, output: number) {
    try {
      if (this.sessionID === "") {
        await this.login();
        if (this.sessionID === "")throw(new Error('Could not send output command; not logged in'));
      }

      if ((output >= this.outputs.length) || (output < 0)) throw new Error('Specified output ' + output + ' is out of bounds');

      // Prepare the payload according to details
      const payload = {
        'onum': output + 1,
        'ostate': (command)?1:0
      };

      // Finally make the request
      this.log.debug('Sending output command: ' + command + " for output: " + output + "...");
      await this.makeRequest('user/output.cgi', payload);
      this.log.debug("Command sent successfully.");

      return true;
    } catch (error) { throw(error); }
  }

  async sendZoneCommand(command: SecuritySystemZoneCommand = SecuritySystemZoneCommand.ZONE_BYPASS, zones: number[] | number = []) {
    try {
      if (this.sessionID === "") {
        await this.login();
        if (this.sessionID === "") throw(new Error('Could not send zone command; not logged in'));
      }

      if (!(command in SecuritySystemZoneCommand)) throw new Error('Invalid zone state ' + command);

      // Load actual area banks to local table for ease of use
      let actionableZones: number[] = [];
      let actualZones: number[] = [];
      for (let i of this.zones) {
        if (i == undefined) continue;
        actualZones.push(i.bank);
      }

      // Decipher input and prepare actionableAreas table for looping through
      if (typeof(zones) == 'number') actionableZones.push(zones);
      else if (Array.isArray(zones) && zones.length > 0) actionableZones = zones;
      else actionableZones = actualZones;

      // For every area in actionableAreas:
      for (let i of actionableZones) {
        // Check if the actual area exists
        if (!actualZones.includes(i)) throw new Error('Specified area ' + i + ' not found');
        else {
          // Prepare the payload according to details
          const payload = {
            'comm': 82,
            'data0': i
          };

          // At present the only zone command is zone bypass so no need to pass on an actual command
          // payload['data1'] = String(command);

          // Finally make the request
          this.log.debug('Sending zone command: ' + command + " for zone: " + i + "...");
          await this.makeRequest('user/zonefunction.cgi', payload);
          this.log.debug("Command sent successfully.");
        }
      }
      return true;
    } catch (error) { throw(error); }
  }

  // All the following are accessor functions for system details
  getZones(): Zone[] {
    return this.zones;
  }

  getOutputs(): Output[] {
    return this.outputs;
  }

  getAreas(): Area[] {
    return this.areas;
  }

  getZoneState(zone: number): boolean{
    return !(this.zones[zone].status == ZoneState.Ready);
  }

  getOutputState(output: number): boolean{
    return (this.outputs[output].status == true);
  }

  getZoneBankState(zone: number): string{
    return (this.zones[zone].bank_state.join(''));
  }

  getAreaStatus(area: number): string {
    return (this.areas[area].status);
  }

  getAreaChimeStatus(area: number): boolean {
    return (this.areas[area].states["chime"]);
  }

  getAreaArmStatus(area: number): boolean {
    return (this.areas[area].states["armed"] || this.areas[area].states["partial"] || this.areas[area].states["exit1"] || this.areas[area].states["exit2"]);
  }

  getFirmwareVersion(): string {
    return ('v' + this.version + '-' + this.release);
  }
}
