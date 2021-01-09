export enum Vendor {
  COMNAV = "COMNAV",
  UNDEFINED = "NONE"
}

export enum SecuritySystemAreaCommand {
  AREA_CHIME_TOGGLE = 1,
  AREA_DISARM = 16,
  AREA_AWAY = 17,
  AREA_STAY = 18
}

export enum SecuritySystemZoneCommand {
  ZONE_BYPASS = 1
}

export enum SecuritySystemCLIScenes {
  "chime" = SecuritySystemAreaCommand.AREA_CHIME_TOGGLE,
  "disarm" = SecuritySystemAreaCommand.AREA_DISARM,
  "away" = SecuritySystemAreaCommand.AREA_AWAY,
  "stay" = SecuritySystemAreaCommand.AREA_STAY
}

export interface Area {
  bank: number;
  name: string;
  priority: number;
  sequence: number;
  bank_state: number[];
  status: string;
  states: {};
}

export interface Zone {
  bank: number;
  associatedArea: number;
  name: string;
  priority: number;
  sequence: number;
  bank_state: number[];
  status: string;
  isBypassed: boolean;
  autoBypass: boolean;
}

export interface SequenceResponse {
  areas: number[];
  zones: number[];
}

export enum AreaBank {
  ARMED = 0,
  PARTIAL = 1,
  UNKWN_02 = 2,
  UNKWN_03 = 3,
  UNKWN_04 = 4,
  UNKWN_05 = 5,
  UNKWN_06 = 6,
  EXIT_MODE01 = 7,
  EXIT_MODE02 = 8,
  UNKWN_09 = 9,
  UNKWN_10 = 10,
  UNKWN_11 = 11,
  UNKWN_12 = 12,
  UNKWN_13 = 13,
  UNKWN_14 = 14,
  CHIME = 15,
  UNKWN_16 = 16
}

enum _AreaState  {
  ARMED_AWAY = 0,
  ARMED_STAY,
  READY,

  ALARM_FIRE,
  ALARM_BURGLAR,
  ALARM_PANIC,
  ALARM_MEDICAL,

  DELAY_EXIT_1,
  DELAY_EXIT_2,
  DELAY_ENTRY,

  SENSOR_BYPASS,
  SENSOR_TROUBLE,
  SENSOR_TAMPER,
  SENSOR_BATTERY,
  SENSOR_SUPERVISION,

  NOT_READY,
  NOT_READY_FORCEABLE,
  DISARMED
}

export class AreaState {
  static readonly State = _AreaState;

  static readonly Priority: number[] = [
    AreaState.State.ALARM_FIRE,
    AreaState.State.ALARM_BURGLAR,
    AreaState.State.ALARM_PANIC,
    AreaState.State.ALARM_MEDICAL,

    AreaState.State.DELAY_EXIT_1,
    AreaState.State.DELAY_EXIT_2,
    AreaState.State.DELAY_ENTRY,

    AreaState.State.ARMED_AWAY,
    AreaState.State.ARMED_STAY,

    AreaState.State.SENSOR_BYPASS,
    AreaState.State.SENSOR_TROUBLE,
    AreaState.State.SENSOR_TAMPER,
    AreaState.State.SENSOR_BATTERY,
    AreaState.State.SENSOR_SUPERVISION,

    AreaState.State.READY
  ]

  static readonly Status: string[] = [
    'Armed Away',
    'Armed Stay',
    'Ready',
    'Fire Alarm',
    'Burglar Alarm',
    'Panic Alarm',
    'Medical Alarm',
    'Exit Delay 1',
    'Exit Delay 2',
    'Entry Delay',
    'Sensor Bypass',
    'Sensor Trouble',
    'Sensor Tamper',
    'Sensor Low Battery',
    'Sensor Supervision',
    'Not Ready',
    'Not Ready',
    'Disarm'
  ]
}

enum _ZoneState  {
  UNKWN_00 = 0,
  UNKWN_01 = 1,
  UNKWN_02 = 2,
  BYPASSED = 3,
  UNKWN_04 = 4,
  UNKWN_05 = 5,
  UNKWN_06 = 6,
  UNKWN_07 = 7,
  AUTOBYPASS = 8,
  UNKWN_09 = 9,
  UNKWN_10 = 10,
  UNKWN_11 = 11,
  UNKWN_12 = 12,
  UNKWN_13 = 13
}

export class ZoneState {
  static readonly State = _ZoneState;
  static NotReady = "Not Ready";
  static Ready = "Ready";

  static readonly Status: string[] = [
    ZoneState.NotReady,
    'Tamper',
    'Trouble',
    '',
    'Inhibited',
    'Alarm',
    'Low Battery',
    'Supervision Fault',
    'Test Fail',
    '',
    'Entry Delay',
    '',
    'Test Active',
    'Activity Fail',
    'Antimask'
  ]
}
