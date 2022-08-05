/* eslint-disable @typescript-eslint/no-var-requires */
import * as Utilities from './utility';
import * as superagent from 'superagent';
import * as parser from 'fast-xml-parser';
import { Vendor } from './definitions';
import { Area } from './definitions';
import { Zone } from './definitions';
import { Output } from './definitions';
import { SequenceResponse } from './definitions';
import { AreaBank } from './definitions';
import { AreaState } from './definitions';
import { ZoneState } from './definitions';
import { SecuritySystemAreaCommand } from './definitions';
import { SecuritySystemZoneCommand } from './definitions';
const retryDelayDuration: number = 1500;

export class NX595ESecuritySystem {
  protected username: string;
  protected passcode: string;
  protected IPAddress: string;
  protected httpPrefix: string;

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

  constructor(address: string, userid: string, pin: string, useHTTPS: Boolean = false) {
    this.IPAddress = address;
    this.username = userid;
    this.passcode = pin;
    this.httpPrefix = (useHTTPS)?'https://':'http://';
  }

  async login() {
    try {
      // Parameter checks before logging in
      if (!(Utilities.CheckIPAddress(this.IPAddress))) { throw new Error('Not a valid IP address'); }
      if (typeof this.username == 'undefined' || this.username == "") { throw new Error('Did not specify a username'); }
      if (typeof this.passcode == 'undefined' || this.passcode == "") { throw new Error('Did not specify a user PIN'); }

      // Attempting login
      let payload = ({lgname: this.username, lgpin: this.passcode});
      const response = await this.makeRequest(this.httpPrefix + this.IPAddress + '/login.cgi', payload);
      let correctLine: string = "";
      const loginPageLine: number = 25;
      const sessionIDLine: number = 28;
      const vendorDetailsLine: number = 6;
      let data = response.text;
      let lines1 = data.split("\n");
      let lines2 = lines1;
      let lines3 = lines1;

      // Gotta check for successful login
      correctLine = lines1[loginPageLine].trim();
      if (correctLine.substring(25, 32) === 'Sign in')
            throw new Error('Login Unsuccessful');

      // Login confirmed, parsing session ID
      correctLine = lines2[sessionIDLine].trim();
      this.sessionID = correctLine.substring(30, 46);

      // Parsing panel vendor and software details
      correctLine = lines3[vendorDetailsLine].trim();
      let vendorDetails = correctLine.split(/[/_-]/);
      switch (vendorDetails[2]) {
        case "CN": { this.vendor = Vendor.COMNAV; break; }
        default: { throw new Error("Unrecognized vendor"); }
      }
      this.version = vendorDetails[3];
      this.release = vendorDetails[4];

      this.lastUpdate = new Date();

      // Start retrieving area and zone details; pass through the initial Response
      await this.retrieveAreas(response);
      await this.retrieveZones();
      await this.retrieveOutputs();

      return (true);
    } catch (error) { throw(error); }
  }

  async logout() {
    try {
      if (this.sessionID === "")
        throw(new Error('Could not log out; not logged in'));

      // Logout gracefully
      await this.makeRequest(this.httpPrefix + this.IPAddress + '/logout.cgi', {});
      this.sessionID = "";
    } catch (error) { return (false); }
  }

  async sendAreaCommand(command: SecuritySystemAreaCommand = SecuritySystemAreaCommand.AREA_CHIME_TOGGLE, areas: number[] | number = []) {
    try {
      if (this.sessionID === "" && !(this.login()))
        throw(new Error('Could not send area command; not logged in'));
      if (!(command in SecuritySystemAreaCommand)) throw new Error('Invalid alarm state ' + command);

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
          type payloadType = {[key: string]: string};
          let payload: payloadType = {};
          payload['sess'] = this.sessionID;
          payload['comm'] = '80';
          payload['data0'] = '2';
          payload['data1'] = String(1 << i % 8);
          payload['data2'] = String(command);

          // Finally make the request
          await this.makeRequest(this.httpPrefix + this.IPAddress + '/user/keyfunction.cgi', payload);
        }
      }
      return true;
    } catch (error) { throw(error); }
  }

  async sendOutputCommand(command: Boolean, output: number) {
    try {
      if (this.sessionID === "" && !(this.login()))
        throw(new Error('Could not send output command; not logged in'));

      if ((output >= this.outputs.length) || (output < 0)) throw new Error('Specified output ' + output + ' is out of bounds');

      // Prepare the payload according to details
      type payloadType = {[key: string]: string};
      let payload: payloadType = {};
      payload['sess'] = this.sessionID;
      payload['onum'] = String(output+1);
      payload['ostate'] = (command)?"1":"0";

      // Finally make the request
      await this.makeRequest(this.httpPrefix + this.IPAddress + '/user/output.cgi', payload);

      return true;
    } catch (error) { throw(error); }
  }

  async sendZoneCommand(command: SecuritySystemZoneCommand = SecuritySystemZoneCommand.ZONE_BYPASS, zones: number[] | number = []) {
    try {
      if (this.sessionID === "" && !(this.login()))
        throw(new Error('Could not send zone command; not logged in'));
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
          type payloadType = {[key: string]: string};
          let payload: payloadType = {};
          payload['sess'] = this.sessionID;
          payload['comm'] = '82';
          payload['data0'] = i.toString();
          // At present the only zone command is zone bypass so no need to pass on an actual command
          // payload['data1'] = String(command);

          // Finally make the request
          await this.makeRequest(this.httpPrefix + this.IPAddress + '/user/zonefunction.cgi', payload);
        }
      }
      return true;
    } catch (error) { throw(error); }
  }

  private async retrieveAreas (response: superagent.Response | undefined = undefined) {
    if (this.sessionID == "")
      throw(new Error('Could not retrieve areas; not logged in'));

    try {
      // If we are passed an already loaded Response use that, otherwise reload area.htm
      if (response == undefined) {
        response = await this.makeRequest(this.httpPrefix + this.IPAddress + '/user/area.htm', {'sess': this.sessionID})
        if (!response) throw new Error('Panel response returned as undefined');
      }

      // Get area sequence
      let regexMatch: any = response.text.match(/var\s+areaSequence\s+=\s+new\s+Array\(([\d,]+)\);/);
      let sequence: number[] = regexMatch[1].split(',');

      // Get area states
      regexMatch = response.text.match(/var\s+areaStatus\s+=\s+new\s+Array\(([\d,]+)\);/);
      let bank_states = regexMatch[1].split(',');

      // Get area names
      regexMatch = response.text.match(/var\s+areaNames\s+=\s+new\s+Array\((\"(.+)\")\);/);
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
      this.processAreas();
    } catch (error) { throw(error); }

    return (true);
  }

  private async retrieveOutputs (response: superagent.Response | undefined = undefined) {
    if (this.sessionID == "")
      throw(new Error('Could not retrieve outputs; not logged in'));

    try {
      // If we are passed an already loaded Response use that, otherwise reload outputs.htm
      if (response == undefined) {
        response = await this.makeRequest(this.httpPrefix + this.IPAddress + '/user/outputs.htm', {'sess': this.sessionID})
        if (!response) throw new Error('Panel response returned as undefined');
      }

      // Reset class outputs tables...
      this.outputs.length = 0;

      // Get output names
      let regexMatch: any = response.text.matchAll(/var\s+oname\d+\s+=\s+decodeURIComponent\s*\(\s*decode_utf8\s*\(\s*\"(.*)\"\)\);/g);
      let outputNames: string[] = [];
      for (const name of regexMatch) outputNames.push(name[1]);

      // Get output values
      regexMatch = response.text.matchAll(/var\s+ostate\d+\s+=\s+\"([0,1]{1})\";/g);
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

    return (true);
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

    return (true);
  }

  private async retrieveZones() {
    if (this.sessionID == "")
      throw(new Error('Could not retrieve zones; not logged in'));

    try {
      // Retrieve zones.htm for parsing
      const response = await this.makeRequest(this.httpPrefix + this.IPAddress + '/user/zones.htm', {'sess': this.sessionID});

      // Get Zone sequences from response and store in class instance
      let regexMatch: any = response.text.match(/var\s+zoneSequence\s+=\s+new\s+Array\(([\d,]+)\);/);
      this.zonesSequence = regexMatch[1].split(',').filter((x: string) => x.trim().length && !isNaN(parseInt(x))).map(Number);

      // Get Zone banks from response and store in class instance
      this.zonesBank.length = 0;
      regexMatch = response.text.match(/var\s+zoneStatus\s+=\s+new\s+Array\((.*)\);/);
      regexMatch = regexMatch[1].matchAll(/(?:new\s+)?Array\((?<states>[^)]+)\)\s*(?=$|,\s*(?:new\s+)?Array\()/g);
      for (const bank of regexMatch) {
        this.zonesBank.push(bank[1].split(',').filter((x: string) => x.trim().length && !isNaN(parseInt(x))).map(Number));
      }

      // Retrieve zone names
      regexMatch = response.text.match(/var zoneNames\s*=\s*(?:new\s+)?Array\(([^)]+)\).*/);
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

      this.processZones();
    } catch (error) { throw(error); }

    return (true);
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
      let sequence: number = zone.bank_state.join() !== this._zvbank[zone.bank].join() ? this.nextSequence(zone.sequence) : zone.sequence;

      // Update the zone with details
      zone.priority = priority;
      zone.status = status;
      zone.bank_state = this._zvbank[zone.bank];
      zone.sequence = sequence;
      zone.isBypassed = vbank[ZoneState.State.BYPASSED];
      zone.autoBypass = vbank[ZoneState.State.AUTOBYPASS];
      zone.associatedArea = index;
    });

    return (true);
  }

  async poll() {
    // Requesting a sequence response is a means of polling the panel for
    // updates; if the sequence value changes, it means something has changed
    // The index of the area or zone that changed indicates the entry that
    // needs updating, but it is up to the user to call the corresponding
    // update functions to perform the actual update

    if (this.sessionID == "") {
      console.log('Could not poll system; not logged in');
      return false;
    }

    try {
      const response = await this.makeRequest(this.httpPrefix + this.IPAddress + '/user/seq.xml', {'sess': this.sessionID});
      const json = parser.parse(response.text)['response'];
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
    } catch (error) { throw(error); }

    return (true);
  }

  private async zoneStatusUpdate(bank: number) {
    if (this.sessionID == "")
      throw(new Error('Could not fetch zone status; not logged in'));

    // Fetch zone update
    try {
      const response = await this.makeRequest(this.httpPrefix + this.IPAddress + '/user/zstate.xml', {'sess': this.sessionID, 'state': bank});
      const json = parser.parse(response.text)['response'];
      const zdat = typeof(json['zdat']) == 'number'? [json['zdat']]: json['zdat'].split(',').filter((x: string) => x.trim().length && !isNaN(parseInt(x))).map(Number);
      this.zonesBank[bank] = zdat;
    } catch (error) { throw(error); }

    return (true);
  }

  private async outputStatusUpdate() {
    if (this.sessionID == "")
      throw(new Error('Could not fetch output status; not logged in'));

    // Fetch zone update
    try {
      const response = await this.makeRequest(this.httpPrefix + this.IPAddress + '/user/outstat.xml', {'sess': this.sessionID});
      const json = parser.parse(response.text)['response'];
      const values = Object.values(json);
      for (let i: number = 0; i < this.outputs.length; i++) {
        this.outputs[i].status = (values[i] == 0)?false:true;
      }
    } catch (error) { throw(error); }

    return (true);
  }


  private async areaStatusUpdate(bank: number) {
    if (this.sessionID == "")
      throw(new Error('Could not fetch area status; not logged in'));

    // Fetch area update
    try {
      const response = await this.makeRequest(this.httpPrefix + this.IPAddress + '/user/status.xml', {'sess': this.sessionID, 'arsel': bank});
      const json = parser.parse(response.text)['response'];
      if (json.hasOwnProperty('sysflt')) this.__extra_area_status = json['sysflt'].split('\n');
      else this.__extra_area_status = [];
      this.areas[bank].bank_state.length = 0;
      for (let index: number = 0; index < 17; index++) {
        this.areas[bank].bank_state.push(json["stat"+index]);
      }
    } catch (error) { throw(error); }

    return (true);
  }

  private nextSequence (last: number) {
    if (last < 256)
      return (last + 1);
    return 1;
  }

  private async makeRequest(address: string, payload = {}) {
    let response: any;
    try {
      response = await superagent.post(address).type('form').send(payload).redirects(0);
    } catch (error) {
      const err: superagent.Response.error = error;
      if ((err.status / 100 | 0) == 3) {
          try {
            await Utilities.delay(retryDelayDuration);
            await this.login();
            (<any>payload)['sess'] = this.sessionID;
            response = await this.makeRequest(address, payload);
          } catch (error) {
            throw(error);
          }
      } else if (superagent.ERROR_CODES.has(err.code)) {
          try {
            await Utilities.delay(retryDelayDuration);
            response = await superagent.post(address).type('form').send(payload).redirects(0);
          } catch (error) {
            const err2: superagent.Response.error = error;
            if ((err2.status / 100 | 0) == 3) {
                try {
                  await Utilities.delay(retryDelayDuration);
                  await this.login();
                  (<any>payload)['sess'] = this.sessionID;
                  response = await this.makeRequest(address, payload);
                } catch (error) {
                  throw(error);
                }
            } else throw(error);
          }
        } else throw(error);
      }

    return response;
  }

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
