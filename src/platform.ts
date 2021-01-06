import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { NX595ESecuritySystem } from "./NX595ESecuritySystem";

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { NX595EPlatformSecurityAreaAccessory } from './platformAccessory';
import { NX595EPlatformContactSensorAccessory } from './platformAccessory';
import { NX595EPlatformRadarAccessory } from './platformAccessory';
import { AreaState } from './definitions';

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
  private areaDelta: number[] = [];
  private zoneDelta: number[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    const username = <string>this.config.username;
    const pin = <string>this.config.pin;
    const ip = <string>this.config.ip;
    this.pollTimer = <number>this.config.pollTimer;
    this.securitySystem = new NX595ESecuritySystem(ip, username, pin);
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
        this.areaDelta = new Array(this.securitySystem.getAreas().length);
        this.zoneDelta = new Array(this.securitySystem.getZones().length);
        this.areaDelta.fill(-1);
        this.zoneDelta.fill(-1);
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
      if (this.zoneDelta[zone.bank] !== zone.sequence) {
        this.zoneDelta[zone.bank] = zone.sequence;
        const accessoriesUpdated = this.accessories.filter(accessory => accessory.context.device.bank === zone.bank);
        if (accessoriesUpdated.length) {
          accessoriesUpdated.forEach(accessory => {
            if (accessory.context.device.type === "sensor")
              if (accessory.context.device.isRadar) {
                accService = accessory.getService(this.Service.MotionSensor);
                if (accService) accService.getCharacteristic(this.Characteristic.MotionDetected).updateValue(this.securitySystem.getZoneState(zone.bank));
              } else {
                accService = accessory.getService(this.Service.ContactSensor);
                if (accService) accService.getCharacteristic(this.Characteristic.ContactSensorState).updateValue(this.securitySystem.getZoneState(zone.bank));
              }
          });
        }
      }
    });

    this.securitySystem.getAreas().forEach(area => {
      if (this.areaDelta[area.bank] !== area.sequence) {
        this.areaDelta[area.bank] = area.sequence;
        const accessoriesUpdated = this.accessories.filter(accessory => accessory.context.device.bank === area.bank);
        if (accessoriesUpdated.length) {
          accessoriesUpdated.forEach(accessory => {
            if (accessory.context.device.type === "area") {
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

    this.securitySystem.getAreas().forEach(area => {
      devices.push({
        type: "area",
        uniqueID: area.bank + '#' + area.name,
        bank: area.bank,
        displayName: area.name,
        firmwareVersion: this.securitySystem.getFirmwareVersion()
      });
    });

    this.securitySystem.getZones().forEach(zone => {
      devices.push({
        type: "sensor",
        uniqueID: zone.bank + '#' + zone.name,
        bank: zone.bank,
        bank_state: this.securitySystem.getZoneBankState(zone.bank),
        displayName: zone.name,
        isRadar: zone.isRadar
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

      if (existingAccessory) {
        // the accessory already exists
        if (device) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          this.log.debug(device.bank_state);

          // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
          // existingAccessory.context.device = device;
          // this.api.updatePlatformAccessories([existingAccessory]);

          // create the accessory handler for the restored accessory
          // this is imported from `platformAccessory.ts`
          existingAccessory.context.device = device;
          if (device.type === "area")
            new NX595EPlatformSecurityAreaAccessory(this, existingAccessory, this.securitySystem);
          else if (device.type === "sensor")
            if (device.isRadar)
              new NX595EPlatformRadarAccessory(this, existingAccessory);
            else new NX595EPlatformContactSensorAccessory(this, existingAccessory);
          // update accessory cache with any changes to the accessory details and information
          this.api.updatePlatformAccessories([existingAccessory]);
        } else if (!device) {
          // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
          // remove platform accessories when no longer present
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
        }
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.displayName);
        this.log.debug(device.bank_state);

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.displayName, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        if (device.type === "area")
          new NX595EPlatformSecurityAreaAccessory(this, accessory, this.securitySystem);
        else if (device.type === "sensor")
          if (device.isRadar)
            new NX595EPlatformRadarAccessory(this, accessory);
          else new NX595EPlatformContactSensorAccessory(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
