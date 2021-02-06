import * as Utilities from './utility';
import * as superagent from 'superagent';
import * as parser from 'fast-xml-parser';
import { Vendor } from './definitions';
import { Area } from './definitions';
import { Zone } from './definitions';
import { SequenceResponse } from './definitions';
import { AreaBank } from './definitions';
import { AreaState } from './definitions';
import { ZoneState } from './definitions';
import { SecuritySystemAreaCommand } from './definitions';
import { SecuritySystemZoneCommand } from './definitions';


export class NX595ESecuritySystem {
  protected username: string;
  protected passcode: string;
  protected IPAddress: string;

  protected sessionID = '';
  protected vendor: Vendor = Vendor.UNDEFINED;
  protected version = '';
  protected release = '';

  protected _isMaster = false;
  protected _isInstaller = false;

  protected lastUpdate: Date = new Date();
  protected areas: Area[] = [];
  protected zones: Zone[] = [];
  protected __extra_area_status: string[] = [];
  protected zonesSequence: number[] = [];
  protected zonesBank: number[][] = [];
  protected _zvbank: number[][] = [];

  constructor(address: string, userid: string, pin: string) {
    if (Utilities.CheckIPAddress(address)) {
      this.IPAddress = address;
    } else { throw new Error('Not a valid IP address'); }

    if (typeof userid!='undefined' && userid) { this.username = userid; }
    else { throw new Error('Did not specify a username'); }

    if (typeof pin!='undefined' && pin) { this.passcode = pin; }
    else { throw new Error('Did not specify a user PIN'); }
  }

  async login() {
    try {
      // Attempting login
      let payload = ({lgname: this.username, lgpin: this.passcode});
      const response = await this.makeRequest('http://' + this.IPAddress + '/login.cgi', payload, false);
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
      if (correctLine.substr(25,7) === 'Sign in')
            throw new Error('Login Unsuccessful');

      // Login confirmed, parsing session ID
      correctLine = lines2[sessionIDLine].trim();
      this.sessionID = correctLine.substr(30, 16);

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
      return (true);
    } catch (error) { console.error(error); return (false); }
  }

  async logout() {
    try {
      if (this.sessionID === "")
        throw new Error('Not logged in');

      // Logout gracefully
      await this.makeRequest('http://' + this.IPAddress + '/logout.cgi', {}, true, true);
      this.sessionID = "";
    } catch (error) { console.error(error); return (false); }
  }

  async sendAreaCommand(command: SecuritySystemAreaCommand = SecuritySystemAreaCommand.AREA_CHIME_TOGGLE, areas: number[] | number = []) {
    try {
      if (this.sessionID === "" && !(this.login())) return (false);
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
          await this.makeRequest('http://' + this.IPAddress + '/user/keyfunction.cgi', payload);
        }
      }
      return true;
    } catch (error) { console.error(error); return false; }
  }

  async sendZoneCommand(command: SecuritySystemZoneCommand = SecuritySystemZoneCommand.ZONE_BYPASS, zones: number[] | number = []) {
    try {
      if (this.sessionID === "" && !(this.login())) return (false);
      if (!(command in SecuritySystemZoneCommand)) throw new Error('Invalid zone state ' + command);

      // Load actual area banks to local table for ease of use
      let actionableZones: number[] = [];
      let actualZones: number[] = [];
      for (let i of this.zones) actualZones.push(i.bank);

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
          await this.makeRequest('http://' + this.IPAddress + '/user/zonefunction.cgi', payload);
        }
      }
      return true;
    } catch (error) { console.error(error); return false; }
  }

  private async retrieveAreas (response: superagent.Response | undefined = undefined) {
    if (this.sessionID == "") {
      console.log('Could not retrieve areas; not logged in');
      return false;
    }
    // If we are passed an already loaded Response use that, otherwise reload area.htm
    if (response == undefined) {
      response = await this.makeRequest('http://' + this.IPAddress + '/user/area.htm', {'sess': this.sessionID})
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
      if (name == "" || name == "%21" || name == "!") return;

      // Create a new Area object and populate it with the area details, then push it
      let newArea: Area = {
        bank: i,
        name: (name == "" ? 'Area ' + (i+1): name),
        priority: 6,
        sequence: sequence[i],
        bank_state: bank_states.slice(Math.floor((i / 8) * 17), (Math.floor((i / 8) * 17) + 17)),
        status: "",
        states: {}
      };

      this.areas.push(newArea);
    });

    this.processAreas();

    return (true);
  }

  private processAreas() {
    if (this.sessionID == "") {
      console.log('Could not process areas; not logged in');
      return false;
    }

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

        if (vbank[AreaBank.UNKWN_03] || vbank[AreaBank.UNKWN_04] || vbank[AreaBank.UNKWN_05] || vbank[AreaBank.UNKWN_06]) {
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
    if (this.sessionID == "") {
      console.log('Could not retrieve zones; not logged in');
      return false;
    }

    // Retrieve zones.htm for parsing
    const response = await this.makeRequest('http://' + this.IPAddress + '/user/zones.htm', {'sess': this.sessionID})

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
    zone_names.forEach((name, i) => {
      // If the name is "!" it's an empty area; ignore it
      if (name == "" || name == "%21" || name == "!") {
        i++;
        return;
      }

      // Create a new Zone object and populate it with the zone details, then push it
      let newZone: Zone = {
        bank: i,
        associatedArea: -1,
        name: (zoneNaming?(name == "" ? 'Sensor ' + (i+1) : name) : ""),
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

    return (true);
  }

  private processZones() {
    if (this.sessionID == "") {
      console.log('Could not process zones; not logged in');
      return false;
    }

    this._zvbank.length = 0;

    // Loop through detected areas
    this.zones.forEach(zone => {
      // Set our mask and initial offset
      let mask: number = 1 << zone.bank % 16;
      let index: number = Math.floor(zone.bank / 16);

      // Set initial priority, starting with 5, which is the lowest
      let priority = 5;

      // Create a virtual zone state table for ease of reference
      let vbank: boolean[] = [];
      this._zvbank.push([]);
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
      console.log('Could not process zones; not logged in');
      return false;
    }

    const response = await this.makeRequest('http://' + this.IPAddress + '/user/seq.xml', {'sess': this.sessionID});
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

    // Trigger zone and area updates according to changes detected
    if (performZoneUpdate) this.processZones();
    if (performAreaUpdate) this.processAreas();

    return (true);
  }

  private async zoneStatusUpdate(bank: number) {
    if (this.sessionID == "") {
      console.log('Could not process zones; not logged in');
      return false;
    }

    // Fetch zone update
    const response = await this.makeRequest('http://' + this.IPAddress + '/user/zstate.xml', {'sess': this.sessionID, 'state': bank});
    const json = parser.parse(response.text)['response'];
    const zdat = typeof(json['zdat']) == 'number'? [json['zdat']]: json['zdat'].split(',').filter((x: string) => x.trim().length && !isNaN(parseInt(x))).map(Number);
    this.zonesBank[bank] = zdat;

    return (true);
  }

  private async areaStatusUpdate(bank: number) {
    if (this.sessionID == "") {
      console.log('Could not process zones; not logged in');
      return false;
    }

    // Fetch area update
    const response = await this.makeRequest('http://' + this.IPAddress + '/user/status.xml', {'sess': this.sessionID, 'arsel': bank});
    const json = parser.parse(response.text)['response'];
    if (json.hasOwnProperty('sysflt')) this.__extra_area_status = json['sysflt'].split('\n');
    else this.__extra_area_status = [];
    this.areas[bank].bank_state.length = 0;
    for (let index: number = 0; index < 17; index++) {
      this.areas[bank].bank_state.push(json["stat"+index]);
    }

    return (true);
  }

  private nextSequence (last: number) {
    if (last < 256)
      return (last + 1);
    return 1;
  }

  private async makeRequest(address: string, payload = {}, retryOnFail: boolean = true, allowRedirect:boolean = false) {
    let response: any;
    try {
      response = await superagent.post(address).type('form').send(payload).redirects(allowRedirect?1:0);
    } catch (error) {
      if (!retryOnFail) throw(error);
      else {
        try {
          await this.login();
          try {
            (<any>payload)['sess'] = this.sessionID;
            response = await this.makeRequest(address, payload, false, allowRedirect);
          } catch (error) { throw (error); }
        } catch (error) { throw (error); }
      }
    }
    return response;
  }

  getZones(): Zone[] {
    return this.zones;
  }

  getAreas(): Area[] {
    return this.areas;
  }

  getZoneState(zone: number): boolean{
    return !(this.zones[zone].status == ZoneState.Ready);
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
