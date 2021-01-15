import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback } from 'homebridge';

import { NX595EPlatform } from './platform';
import { NX595ESecuritySystem } from "./NX595ESecuritySystem";
import { SecuritySystemAreaCommand } from "./definitions";
import { SecuritySystemZoneCommand } from "./definitions";
import { AreaState } from "./definitions";

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class NX595EPlatformSecurityAreaAccessory {
  private alarmService: Service;
  private chimeService: Service;

  constructor(
    private readonly platform: NX595EPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly securitySystem: NX595ESecuritySystem,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'CaddX')
      .setCharacteristic(this.platform.Characteristic.Model, 'Alarm Area')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.uniqueID)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.firmwareVersion);

      this.alarmService = this.accessory.getService(this.platform.Service.SecuritySystem) || this.accessory.addService(this.platform.Service.SecuritySystem);

      this.alarmService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);
      this.alarmService.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState).setProps({
          validValues: [
            this.platform.Characteristic.SecuritySystemTargetState.STAY_ARM,
            this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM,
            this.platform.Characteristic.SecuritySystemTargetState.DISARM,
          ],
      });
      this.alarmService.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState)!
        .on('set', this.setTargetState.bind(this));

      this.chimeService = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);

      this.chimeService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName + " Chime");
      this.chimeService.getCharacteristic(this.platform.Characteristic.On)!
        .on('set', this.setChimeState.bind(this));
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  setTargetState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // implement your own code to turn your device on/off
    const current = this.alarmService.getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState).value;
    const isNotReady = (this.securitySystem.getAreaStatus(this.accessory.context.device.bank) === AreaState.Status[AreaState.State.NOT_READY]) ? true : false;
    if (isNotReady && value !== this.platform.Characteristic.SecuritySystemTargetState.DISARM) {
      const error = new Error("Area is not ready for arming")
      this.platform.log.error(error.message);
      callback(error);
      return;
    }

    if (current !== this.platform.Characteristic.SecuritySystemTargetState.DISARM &&
      value !== this.platform.Characteristic.SecuritySystemTargetState.DISARM) {
        const error = new Error("Attempting to arm already armed area")
        this.platform.log.error(error.message);
        callback(error);
        return;
      }
    let command: SecuritySystemAreaCommand = SecuritySystemAreaCommand.AREA_DISARM;
    switch (value) {
      case this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM: {
        command = SecuritySystemAreaCommand.AREA_AWAY;
        break;
      }
      case this.platform.Characteristic.SecuritySystemTargetState.STAY_ARM: {
        command = SecuritySystemAreaCommand.AREA_STAY;
        break;
      }
      case this.platform.Characteristic.SecuritySystemTargetState.DISARM: {
        command = SecuritySystemAreaCommand.AREA_DISARM;
        break;
      }
      default: {
        callback(null);
        return;
      }
    }
    this.securitySystem.sendAreaCommand(command, this.accessory.context.device.bank);

    this.platform.log.debug('Set Characteristic On ->', value);

    // you must call the callback function
    callback(null);
  }

  setChimeState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // implement your own code to turn your device on/off
    this.securitySystem.sendAreaCommand(SecuritySystemAreaCommand.AREA_CHIME_TOGGLE, this.accessory.context.device.bank);

    this.platform.log.debug('Set Characteristic On ->', value);

    // you must call the callback function
    callback(null);
  }
}

class NX595EPlatformSensorAccessory {
  private bypassService: Service;

  constructor(
    protected readonly platform: NX595EPlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    this.bypassService = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);

    this.bypassService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName + " Bypass");
    this.bypassService.getCharacteristic(this.platform.Characteristic.On)!
      .on('set', this.setBypassState.bind(this));
  }

  setBypassState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // implement your own code to turn your device on/off
    const isArmed = this.platform.securitySystem.getAreaArmStatus(this.accessory.context.device.associatedArea);
    if (isArmed) {
      const error = new Error("Area is armed; cannot change bypass status")
      this.platform.log.error(error.message);
      callback(error);
      return;
    }

    this.platform.securitySystem.sendZoneCommand(SecuritySystemZoneCommand.ZONE_BYPASS, this.accessory.context.device.bank);

    this.platform.log.debug('Set Characteristic On ->', value);

    // you must call the callback function
    callback(null);
  }
}

export class NX595EPlatformContactSensorAccessory extends NX595EPlatformSensorAccessory {
  private service: Service;

  constructor(platform: NX595EPlatform, accessory: PlatformAccessory) {
    super(platform, accessory);
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'CaddX')
      .setCharacteristic(this.platform.Characteristic.Model, 'Contact Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.uniqueID);

    this.service = this.accessory.getService(this.platform.Service.ContactSensor) || this.accessory.addService(this.platform.Service.ContactSensor);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);
  }

}

export class NX595EPlatformRadarAccessory extends NX595EPlatformSensorAccessory {
  private service: Service;

  constructor(platform: NX595EPlatform, accessory: PlatformAccessory) {
    super(platform, accessory);
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'CaddX')
      .setCharacteristic(this.platform.Characteristic.Model, 'Motion Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.uniqueID);

    this.service = this.accessory.getService(this.platform.Service.MotionSensor) || this.accessory.addService(this.platform.Service.MotionSensor);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);
  }
}
