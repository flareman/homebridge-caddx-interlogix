import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { NX595ESecuritySystem } from "./NX595ESecuritySystem";

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { NX595EPlatformSecurityAreaAccessory } from './platformAccessory';
import { NX595EPlatformContactSensorAccessory } from './platformAccessory';
import { NX595EPlatformOutputAccessory } from './platformAccessory';
import { NX595EPlatformSmokeSensorAccessory } from './platformAccessory';
import { NX595EPlatformRadarAccessory } from './platformAccessory';
import { AreaState } from './definitions';
import { DeviceType } from './definitions';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class NX595EPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  securitySystem: NX595ESecuritySystem;
  private pollTimer: number;
  private areaSequences: number[] = [];
  private zoneSequences: number[] = [];
  private zoneDeltas: number[] = [];
  private radarPersistence: number = 60000;
  private smokePersistence: number = 60000;
  private displayBypassSwitches: Boolean = false;
  private displayOutputSwitches: Boolean = true;
  private useHTTPS: Boolean = false;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    const username = <string>this.config.username;
    const pin = <string>this.config.pin;
    const ip = <string>this.config.ip;
    this.pollTimer = <number>this.config.pollTimer;
    this.displayBypassSwitches = (this.config.displayBypassSwitches)? <Boolean>this.config.displayBypassSwitches: false;
    this.radarPersistence = (this.config.radarPersistence)? <number>this.config.radarPersistence: 60000;
    this.useHTTPS = (this.config.useHTTPS)?this.config.useHTTPS:false;
    this.smokePersistence = (this.config.smokePersistence)? <number>this.config.smokePersistence: 60000;
    this.securitySystem = new NX595ESecuritySystem(ip, username, pin, this.useHTTPS);
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.securitySystem.login().then(() => {
        this.discoverDevices();
        this.areaSequences = new Array(this.securitySystem.getAreas().length);
        this.zoneSequences = new Array(this.securitySystem.getZones().length);
        this.zoneDeltas = new Array(this.securitySystem.getZones().length);
        this.areaSequences.fill(-1);
        this.zoneSequences.fill(-1);
        this.zoneDeltas.fill(-1);
        setTimeout(this.updateAccessories.bind(this), this.pollTimer);
      });
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async updateAccessories() {
    let accService: Service | undefined = undefined;
    await this.securitySystem.poll();

    this.securitySystem.getZones().forEach(zone => {
      if (zone == undefined) return;
      const accessoriesUpdated = this.accessories.filter(accessory => accessory.context.device.bank === zone.bank);
      const zoneStatus = this.securitySystem.getZoneState(zone.bank);
      if (this.zoneSequences[zone.bank] !== zone.sequence) {
        this.zoneSequences[zone.bank] = zone.sequence;
        if (accessoriesUpdated.length) {
          accessoriesUpdated.forEach(accessory => {
            if (accessory.context.device.type != DeviceType.area) {
              if (this.displayBypassSwitches) {
                accService = accessory.getService(this.Service.Switch);
                if (accService) accService.getCharacteristic(this.Characteristic.On).updateValue(zone.isBypassed);
              }
              switch (accessory.context.device.type) {
                case DeviceType.radar: {
                  if (zoneStatus) {
                    this.log.debug('Persistence updated for zone ', zone.bank);
                    this.zoneDeltas[zone.bank] = Date.now();
                  }
                  break;
                }
                case DeviceType.smoke: {
                  if (zoneStatus) {
                    this.log.debug('Persistence updated for zone ', zone.bank);
                    this.zoneDeltas[zone.bank] = Date.now();
                  }
                  break;
                }
                default:
                case DeviceType.contact: {
                  accService = accessory.getService(this.Service.ContactSensor);
                  if (accService) accService.getCharacteristic(this.Characteristic.ContactSensorState).updateValue(zoneStatus);
                  break;
                }
              }
            }
          });
        }
      }

      if (accessoriesUpdated.length) {
        accessoriesUpdated.forEach(accessory => {
          if (accessory.context.device.type != DeviceType.area) {
            const currentDelta = Date.now() - this.zoneDeltas[zone.bank];
            switch (accessory.context.device.type) {
              case DeviceType.radar: {
                accService = accessory.getService(this.Service.MotionSensor);
                if (this.zoneDeltas[zone.bank] >= 0 && currentDelta < this.radarPersistence) {
                  if (accService) accService.getCharacteristic(this.Characteristic.MotionDetected).updateValue(true);
                } else {
                  this.zoneDeltas[zone.bank] = -1;
                  if (accService) accService.getCharacteristic(this.Characteristic.MotionDetected).updateValue(false);
                }
                break;
              }
              case DeviceType.smoke: {
                accService = accessory.getService(this.Service.SmokeSensor);
                if (this.zoneDeltas[zone.bank] >= 0 && currentDelta < this.radarPersistence) {
                  if (accService) accService.getCharacteristic(this.Characteristic.SmokeDetected).updateValue(true);
                } else {
                  this.zoneDeltas[zone.bank] = -1;
                  if (accService) accService.getCharacteristic(this.Characteristic.SmokeDetected).updateValue(false);
                }
                break;
              }
              default: {
                break;
              }
            }
          }
        });
      }
    });

    this.securitySystem.getAreas().forEach(area => {
      if (this.areaSequences[area.bank] !== area.sequence) {
        this.areaSequences[area.bank] = area.sequence;
        const accessoriesUpdated = this.accessories.filter(accessory => accessory.context.device.bank === area.bank);
        if (accessoriesUpdated.length) {
          accessoriesUpdated.forEach(accessory => {
            if (accessory.context.device.type === DeviceType.area) {
              const status: string = this.securitySystem.getAreaStatus(area.bank);
              const chimeState: boolean = this.securitySystem.getAreaChimeStatus(area.bank);
              let value = this.Characteristic.SecuritySystemCurrentState.DISARMED;
              switch (status) {
                case AreaState.Status[AreaState.State.ALARM_FIRE]:
                case AreaState.Status[AreaState.State.ALARM_BURGLAR]:
                case AreaState.Status[AreaState.State.ALARM_PANIC]:
                case AreaState.Status[AreaState.State.ALARM_MEDICAL]: {
                  value = this.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED;
                  break;
                }
                case AreaState.Status[AreaState.State.DELAY_EXIT_1]:
                case AreaState.Status[AreaState.State.DELAY_EXIT_2]:
                case AreaState.Status[AreaState.State.DISARMED]:
                case AreaState.Status[AreaState.State.NOT_READY]:
                case AreaState.Status[AreaState.State.SENSOR_BYPASS]:
                case AreaState.Status[AreaState.State.READY]: {
                  value = this.Characteristic.SecuritySystemCurrentState.DISARMED;
                  break;
                }
                case AreaState.Status[AreaState.State.ARMED_STAY]: {
                  value = this.Characteristic.SecuritySystemCurrentState.STAY_ARM;
                  break;
                }
                case AreaState.Status[AreaState.State.DELAY_ENTRY]:
                case AreaState.Status[AreaState.State.ARMED_AWAY]: {
                  value = this.Characteristic.SecuritySystemCurrentState.AWAY_ARM;
                  break;
                }
                default: { break; }
              }
              accService = accessory.getService(this.Service.Switch);
              if (accService) accService.getCharacteristic(this.Characteristic.On).updateValue(chimeState);
              accService = accessory.getService(this.Service.SecuritySystem);
              if (accService) {
                if (status === AreaState.Status[AreaState.State.DELAY_EXIT_2] ||
                status === AreaState.Status[AreaState.State.DELAY_EXIT_1])
                  accService.getCharacteristic(this.Characteristic.SecuritySystemTargetState).updateValue(this.Characteristic.SecuritySystemCurrentState.AWAY_ARM);
                else
                  accService.getCharacteristic(this.Characteristic.SecuritySystemTargetState).updateValue(value);
                accService.getCharacteristic(this.Characteristic.SecuritySystemCurrentState).updateValue(value);
              }
            }
          });
        }
      }
    });

    setTimeout(this.updateAccessories.bind(this), this.pollTimer);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    let devices: Object[];
    devices = [];

    if (this.displayOutputSwitches) {
      this.securitySystem.getOutputs().forEach(output => {
        this.log.debug('Detected output: ', output.name);
        devices.push({
          type: DeviceType.output,
          uniqueID: output.bank + '#' + output.name,
          bank: output.bank,
          bank_state: output.status,
          displayName: output.name,
          firmwareVersion: this.securitySystem.getFirmwareVersion()
        });
      });
    }

    this.securitySystem.getAreas().forEach(area => {
      this.log.debug('Detected area: ', area.name);
      devices.push({
        type: DeviceType.area,
        uniqueID: area.bank + '#' + area.name,
        bank: area.bank,
        bank_state: area.bank_state,
        displayName: area.name,
        firmwareVersion: this.securitySystem.getFirmwareVersion()
      });
    });

    // Populate ignore zones table from configuration
    // Zone ignoring should be declared in plugin config as a string of numbers
    // separated by commas; ranges are allowed as well
    // Negative zone indexes, invalid ranges and out-of-index zones cause an
    // exception to be thrown
    // Examples:
    // 1,2,8
    // 3-5
    // 1,4-6,8,11,23-28
    let ignores: Boolean[] = new Array(this.securitySystem.getZones().length).fill(false);
    const ignoreString: string = (this.config.ignoreZones) ? this.config.ignoreZones : undefined;
    if (ignoreString != undefined) {
      if ((new RegExp("^\\d{1,3}(?:-\\d{1,3})?(?:,\\d{1,3}(?:-\\d{1,3})?)*$")).test(ignoreString)) {
        const ignoreZones = ignoreString.split(',');
        ignoreZones.forEach(element => {
          if (new RegExp('^[0-9]+$').test(element)) {
            const ignoreIndex = parseInt(element);
            if (ignoreIndex > ignores.length) {
              throw new Error("Zone " + element + " required to ignore exceeds zone count!");
            } else {
              ignores[ignoreIndex-1] = true;
              this.log.debug('Zone ', ignoreIndex, ' ignored');
            }
          } else {
            const ignoreRange = element.split('-');
            const rangeStart = parseInt(ignoreRange[0]);
            const rangeEnd = parseInt(ignoreRange[1]);
            if (rangeStart > ignores.length || rangeEnd > ignores.length) {
              throw new Error("Zone range " + element + " required to ignore violates zone count!");
            } else {
              this.log.debug('Ignoring zone range: ', rangeStart, '-', rangeEnd);
              const rangeDiff = rangeEnd - rangeStart;
              if (rangeDiff <= 0) {
                throw new Error("Zone ranges should be declared from lower to higer zone index (zone range was: " + element + ")!");
              } else {
                for (let i = rangeStart; i <= rangeEnd; i++) {
                  ignores[i-1] = true;
                  this.log.debug('Zone ', i, ' ignored');
                }
              }
            }
          }
        })
      } else {
        throw new Error('Ignore zones string "' + ignoreString + '" has wrong syntax!');
      }
    }

    // Get override zones table from configuration
    // Overrides have a zone index specified; in case the user has declared
    // multiple overrides for the same zone index, only the last one applies
    const declaredOverrides = (this.config.override) ? this.config.override : [];
    let overrides: any[] = new Array(ignores.length).fill(undefined);
    declaredOverrides.forEach(element => {
      if (element.index < 1 || element.index > overrides.length) {
        throw new Error("Override declared for non-existent zone with index " + element.index + "!");
      }
      overrides[element.index-1] = element;
    });

    this.securitySystem.getZones().forEach(zone => {
      if (zone == undefined) return;
      const shouldOverride = (overrides[zone.bank] != undefined) ? true : false;
      const zoneName = (shouldOverride && overrides[zone.bank].name && overrides[zone.bank].name !== "") ? overrides[zone.bank].name : zone.name;
      this.log.debug('Detected zone: ', zone.name);
      let deviceType: DeviceType = DeviceType.contact;
      if (shouldOverride) {
        switch (overrides[zone.bank].sensor) {
          case "Radar": {
            deviceType = DeviceType.radar;
            break;
          }
          case "Smoke": {
            deviceType = DeviceType.smoke;
            break;
          }
          case "Contact":
          default: {
            break;
          }
        }
      }
      devices.push({
        type: deviceType,
        uniqueID: zone.bank + '#' + zone.name,
        bank: zone.bank,
        associatedArea: zone.associatedArea,
        bank_state: this.securitySystem.getZoneBankState(zone.bank),
        displayName: zoneName,
        firmwareVersion: this.securitySystem.getFirmwareVersion(),
        shouldIgnore: ignores[zone.bank]
      });
    });

    // loop over the discovered devices and register each one if it has not already been registered
    let device: any;
    for (device of devices) {

      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.uniqueID);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory && device.type == existingAccessory.context.device.type) {
        // the accessory already exists
        if (device) {
          // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
          // existingAccessory.context.device = device;
          // this.api.updatePlatformAccessories([existingAccessory]);

          // create the accessory handler for the restored accessory
          // this is imported from `platformAccessory.ts`

          if (device.type != DeviceType.area && device.shouldIgnore) {
            this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
            this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          } else {
            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
            existingAccessory.context.device = device;
            this.log.debug(device.bank_state);
            switch (device.type) {
              case DeviceType.area: {
                new NX595EPlatformSecurityAreaAccessory(this, existingAccessory, this.securitySystem);
                break;
              }
              case DeviceType.output: {
                new NX595EPlatformOutputAccessory(this, existingAccessory);
                break;
              }
              case DeviceType.radar: {
                new NX595EPlatformRadarAccessory(this, existingAccessory, this.displayBypassSwitches);
                break;
              }
              case DeviceType.smoke: {
                new NX595EPlatformSmokeSensorAccessory(this, existingAccessory, this.displayBypassSwitches);
                break;
              }
              case DeviceType.contact:
              default: {
                new NX595EPlatformContactSensorAccessory(this, existingAccessory, this.displayBypassSwitches);
                break;
              }
            }

            // update accessory cache with any changes to the accessory details and information
            this.api.updatePlatformAccessories([existingAccessory]);
          }
        } else if (!device) {
          // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
          // remove platform accessories when no longer present
          this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        }
      } else {
        if (existingAccessory) {
          this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        }
        // the accessory does not yet exist, so we need to create it
        // create a new accessory
        const accessory = new this.api.platformAccessory(device.displayName, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        if (device.type == DeviceType.area || device.type == DeviceType.output || device.shouldIgnore == false) {
          switch (device.type) {
            case DeviceType.area: {
              new NX595EPlatformSecurityAreaAccessory(this, accessory, this.securitySystem);
              break;
            }
            case DeviceType.output: {
              new NX595EPlatformOutputAccessory(this, accessory);
              break;
            }
            case DeviceType.radar: {
              new NX595EPlatformRadarAccessory(this, accessory, this.displayBypassSwitches);
              break;
            }
            case DeviceType.smoke: {
              new NX595EPlatformSmokeSensorAccessory(this, accessory, this.displayBypassSwitches);
              break;
            }
            case DeviceType.contact:
            default: {
              new NX595EPlatformContactSensorAccessory(this, accessory, this.displayBypassSwitches);
              break;
            }
          }

          // link the accessory to your platform
          this.log.info('Adding new accessory:', device.displayName);
          this.log.debug(device.bank_state);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    }
  }
}
