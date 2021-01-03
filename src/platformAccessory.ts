import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback } from 'homebridge';

import { NX595EPlatform } from './platform';
import { NX595ESecuritySystem } from "./NX595ESecuritySystem";
import { SecuritySystemCommand } from "./definitions";

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
    const current = this.alarmService.getCharacteristic(this.platform.Characteristic.SecuritySystemTargetState).value;
    if (current !== this.platform.Characteristic.SecuritySystemTargetState.DISARM &&
      value !== this.platform.Characteristic.SecuritySystemTargetState.DISARM) {
        callback(new Error("Attempting to rearm already armed area"));
        return;
      }
    let command: SecuritySystemCommand = SecuritySystemCommand.AREA_DISARM;
    switch (value) {
      case this.platform.Characteristic.SecuritySystemTargetState.AWAY_ARM: {
        command = SecuritySystemCommand.AREA_AWAY;
        break;
      }
      case this.platform.Characteristic.SecuritySystemTargetState.STAY_ARM: {
        command = SecuritySystemCommand.AREA_STAY;
        break;
      }
      case this.platform.Characteristic.SecuritySystemTargetState.DISARM: {
        command = SecuritySystemCommand.AREA_DISARM;
        break;
      }
      default: {
        callback(null);
        return;
      }
    }
    this.securitySystem.sendCommand(command, this.accessory.context.device.bank);

    this.platform.log.debug('Set Characteristic On ->', value);

    // you must call the callback function
    callback(null);
  }

  setChimeState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // implement your own code to turn your device on/off
    this.securitySystem.sendCommand(SecuritySystemCommand.AREA_CHIME_TOGGLE, this.accessory.context.device.bank);

    this.platform.log.debug('Set Characteristic On ->', value);

    // you must call the callback function
    callback(null);
  }}

export class NX595EPlatformContactSensorAccessory {
  private service: Service;

  constructor(
    private readonly platform: NX595EPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'CaddX')
      .setCharacteristic(this.platform.Characteristic.Model, 'Contact Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.uniqueID);

    this.service = this.accessory.getService(this.platform.Service.ContactSensor) || this.accessory.addService(this.platform.Service.ContactSensor);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);
  }

}

export class NX595EPlatformRadarAccessory {
  private service: Service;

  constructor(
    private readonly platform: NX595EPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'CaddX')
      .setCharacteristic(this.platform.Characteristic.Model, 'Motion Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.uniqueID);

    this.service = this.accessory.getService(this.platform.Service.MotionSensor) || this.accessory.addService(this.platform.Service.MotionSensor);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);
  }
}
