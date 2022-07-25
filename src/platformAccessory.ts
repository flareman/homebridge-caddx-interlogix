import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

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
        .onSet(this.setTargetState.bind(this));

      this.chimeService = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);

      this.chimeService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName + " Chime");
      this.chimeService.getCharacteristic(this.platform.Characteristic.On)!
        .onSet(this.setChimeState.bind(this));

        this.platform.log.debug('Alarm system created: ', accessory.context.device.displayName);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  setTargetState(value: CharacteristicValue) {
    // implement your own code to turn your device on/off
    const current = this.alarmService.getCharacteristic(this.platform.Characteristic.SecuritySystemCurrentState).value;
    const isNotReady = (this.securitySystem.getAreaStatus(this.accessory.context.device.bank) === AreaState.Status[AreaState.State.NOT_READY]) ? true : false;
    if (isNotReady && value !== this.platform.Characteristic.SecuritySystemTargetState.DISARM) {
      const error = new Error("Area is not ready for arming");
      this.platform.log.error(error.message);
      return;
    }

    if (current !== this.platform.Characteristic.SecuritySystemTargetState.DISARM &&
      value !== this.platform.Characteristic.SecuritySystemTargetState.DISARM) {
        const error = new Error("Attempting to arm already armed area");
        this.platform.log.error(error.message);
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
        return;
      }
    }
    try {
      this.securitySystem.sendAreaCommand(command, this.accessory.context.device.bank);
      this.platform.log.debug('Set Alarm State Characteristic On ->', value);
    } catch (error) {
      this.platform.log.error((<Error>error).message);
    }

  }

  setChimeState(value: CharacteristicValue) {
    // implement your own code to turn your device on/off
    try {
      this.securitySystem.sendAreaCommand(SecuritySystemAreaCommand.AREA_CHIME_TOGGLE, this.accessory.context.device.bank);
      this.platform.log.debug('Set Chime Characteristic On ->', value);
    } catch (error) {
      this.platform.log.error((<Error>error).message);
    }
  }
}

export class NX595EPlatformOutputAccessory {
  private outputService: Service | undefined = undefined;

  constructor(
    protected readonly platform: NX595EPlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    this.outputService = this.accessory.getService(this.platform.Service.Switch);
    if (this.outputService == undefined) {
      this.outputService = this.accessory.addService(this.platform.Service.Switch);
    }
    this.outputService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);
    this.outputService.getCharacteristic(this.platform.Characteristic.On)!
      .onSet(this.setOutputState.bind(this));
    this.outputService.getCharacteristic(this.platform.Characteristic.On)!
        .onGet(this.getOutputState.bind(this));
  }

  setOutputState(value: CharacteristicValue) {
    try {
      this.platform.securitySystem!.sendOutputCommand(Boolean(value), this.accessory.context.device.bank);
      this.platform.log.debug('Set Characteristic On ->', value);
    } catch (error) {
      this.platform.log.error((<Error>error).message);
    }
  }

  getOutputState() {
    // Get the output value and return it to Homebridge

    const value: Boolean = this.platform.securitySystem!.getOutputState(this.accessory.context.device.bank);
    this.platform.log.debug('Get Characteristic On ->', value);

    return (value == true? true: false);
  }
}

class NX595EPlatformSensorAccessory {
  private bypassService: Service | undefined = undefined;

  constructor(
    protected readonly platform: NX595EPlatform,
    protected readonly accessory: PlatformAccessory,
    protected readonly displayBypassSwitches: Boolean
  ) {
    this.bypassService = this.accessory.getService(this.platform.Service.Switch);
    if (displayBypassSwitches) {
      if (this.bypassService == undefined) {
        this.bypassService = this.accessory.addService(this.platform.Service.Switch);
      }
      this.bypassService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName + " Bypass");
      this.bypassService.getCharacteristic(this.platform.Characteristic.On)!
        .onSet(this.setBypassState.bind(this));
    } else {
      if (this.bypassService) {
        this.accessory.removeService(this.bypassService);
        this.bypassService = undefined;
      }
    }
  }

  setBypassState(value: CharacteristicValue) {
    // implement your own code to turn your device on/off

    // const isArmed = this.platform.securitySystem.getAreaArmStatus(this.accessory.context.device.associatedArea);
    // if (isArmed) {
    //   const error = new Error("Area is armed; cannot change bypass status")
    //   this.platform.log.error(error.message);
    //   return;
    // }

    try {
      this.platform.securitySystem!.sendZoneCommand(SecuritySystemZoneCommand.ZONE_BYPASS, this.accessory.context.device.bank);
      this.platform.log.debug('Set Characteristic On ->', value);
    } catch (error) {
      this.platform.log.error((<Error>error).message);
    }
  }
}

export class NX595EPlatformContactSensorAccessory extends NX595EPlatformSensorAccessory {
  private service: Service;

  constructor(platform: NX595EPlatform, accessory: PlatformAccessory, displayBypassSwitches: Boolean) {
    super(platform, accessory, displayBypassSwitches);
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'CaddX')
      .setCharacteristic(this.platform.Characteristic.Model, 'Contact Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.uniqueID);

    this.service = this.accessory.getService(this.platform.Service.ContactSensor) || this.accessory.addService(this.platform.Service.ContactSensor);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

    this.platform.log.debug('Contact Sensor created: ', accessory.context.device.displayName);
  }

}

export class NX595EPlatformSmokeSensorAccessory extends NX595EPlatformSensorAccessory {
  private service: Service;

  constructor(platform: NX595EPlatform, accessory: PlatformAccessory, displayBypassSwitches: Boolean) {
    super(platform, accessory, displayBypassSwitches);
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'CaddX')
      .setCharacteristic(this.platform.Characteristic.Model, 'Smoke Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.uniqueID);

    this.service = this.accessory.getService(this.platform.Service.SmokeSensor) || this.accessory.addService(this.platform.Service.SmokeSensor);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

    this.platform.log.debug('Smoke Sensor created: ', accessory.context.device.displayName);
  }

}

export class NX595EPlatformRadarAccessory extends NX595EPlatformSensorAccessory {
  private service: Service;

  constructor(platform: NX595EPlatform, accessory: PlatformAccessory, displayBypassSwitches: Boolean) {
    super(platform, accessory, displayBypassSwitches);
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'CaddX')
      .setCharacteristic(this.platform.Characteristic.Model, 'Motion Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.uniqueID);

    this.service = this.accessory.getService(this.platform.Service.MotionSensor) || this.accessory.addService(this.platform.Service.MotionSensor);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);
    this.platform.log.debug('Radar created: ', accessory.context.device.displayName);
  }
}
