
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

[![Paypal](https://img.shields.io/badge/paypal-donate-green.svg)](https://paypal.me/flareman?locale.x=en_US)

</p>

# homebridge-caddx-interlogix

This is a Homebridge plugin for the [CaddX](https://caddx.gr/product/nx-595e/)/[Interlogic NetworX NX-595E](https://www.interlogix.com/intrusion/product/networx-ip-communication-module) and [Hills ComNav](https://www.hills.com.au/p/fire_security/alarms_intrusion/expansion_modules/Hills-Comnav/S2096A) network interface.


## Installation

To install, make sure you have a valid Homebridge installation, then run:

```
npm install -g homebridge-caddx-interlogix
```

After the installation you will have to edit your config.json file to include necessary parameters for the alarm system to function properly. The plugin supports the Homebridge Plugin Config schema, so you can also edit all necessary values from within the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x).

## Configuration

You need to set the following attributes:

* `platform` - this should always be `homebridge-caddx-interlogix`
* `username` - this is the username you have set in your NX-595E web interface. It is advised that you create a user just for homebridge use, as logging in from another location will log you out on the plugin side of things
* `pin` - this is the PIN code you have set in your web interface for the desired username; it is always 4 digits long
* `ip` - this is the local IP address for the NX-595E network interface. You can either set a static IP from the web interface, or use your network router interface to assign a fixed IP to the MAC address of the alarm system; in any case, you will want the IP address to remain the same, or the plugin will not be able to communicate with the alarm
* `pollTimer` - this plugin works by asking the NX-595E for changes at given time intervals, a technique otherwise known as "polling". This attribute determines the amount of time in milliseconds between polling attemps. Too small values might congest your alarm's network interface and force it to ignore incoming requests, too large ones will result in slow status updates. Based on trial and error, anywhere between 250 and 2500 is good.
* `override` - this array of items allows the user to override the names and types of zone sensors. You can either set this manually in config.json, or use the Config UI X form for an easier time. For every zone that you want to override, you specify an array item with two properties: `name` and `sensor`. Name is optional; if you define a name here, it will override the name that the plugin fetches from the network interface. Sensor is mandatory and can be either "Contact" (which is the default), or "Radar", which designates the zone sensor as either a contact or motion sensor. This does not affect the actual function or reporting of the sensor, but changes the way that it appears in Homebridge and HomeKit, which allows for more accurate Siri use and automating. The actual order of items in the `override` array should follow the order of zones in the alarm setup; additional items will be ignored.


A sample config.json platform entry would be:
```
{
  "platform" : "homebridge-caddx-interlogix",
  "name" : "homebridge-caddx-interlogix",
  "username" : "User 1",
  "pin" : "1234",
  "ip" : "192.168.1.1",
  "pollTimer" : 500,
  "override" : [
    {"name": "Front Door", "sensor": "Contact"},
    {"name": "Living Room Window", "sensor": "Contact"},
    {"sensor": "Contact"},
    {"sensor": "Contact"},
    {"sensor": "Radar"},
    {"sensor": "Contact"},
    {"name": "Hallway Radar", "sensor": "Radar"}
  ]
}
```

The example above defines the necessary parameters for connecting with the network interface, and overrides the first seven zones, overwriting the names for the first two and the seventh contacts, and defining zone sensors \#5 and \#7 as motion sensors.

## Usage

After installing and configuring the plugin, Homebridge, and subsequently Home.app, will detect your security system and its components. Areas, zones and sensors are (sic) automagically detected based on the area and zone names you have set in your NX-595E web interface, and are reported as such.

In detail, after the plugin has started up, you will have the following accessories available:

1. Areas as security systems. Every area has its own security system switch in Homebridge, with Home, Away and Disarmed functionality. The plugin intelligently updates while the alarm system is arming, and will report likewise. In order to avoid mistakes, once an area is armed in either setting, it will not allow rearming until it has been disarmed.
2. Along with every area's security system you will find included a "chime" switch. This allows you to enable/disable the alarm system's namesake function, which chimes whenever a contact sensor changes state.
3. Contact and radar sensors will present as such, and - as stated above - will inherit the names you have set in your web interface.
4. Radars will initally present as contact sensors. Motion is reported momentarily when the radar detects it, but that is enough for any automations you want to script. If you want the sensor to actually register as a motion sensor, then you have to set the override value to an array of values that define the actual names and sensor types of zones (see above).
5. Every zone sensor has a "bypass" switch included, which allows you to see or set the bypass state for a zone. Keep in mind that the plugin mimics the standard alarm control panel behavior: when an area is armed, the zone sensors bypass status can't be changed.

Feel free to assign your accessories to the rooms of your house as they really are, it helps with automating.

## Miscellany

When I started writing this plugin, there was no other option available for what I needed to do, which is integrating the NX-595E with Apple's Homekit and Home.app. After months of researching, I stumbled across the work of [Chris Caron](https://github.com/caronc) and his [UltraSync](https://github.com/caronc/ultrasync) project, which is essentially a library and CLI wrapper for the NX-595E written in Python. I started transferring the entire library to NodeJS using TypeScript, and finally ended up with [node-nx-595e](https://github.com/flareman/node-nx-595e): my own implementation of a library able to connect with the network interface, issue commands to it and report back with the system's state.

The next step was porting the library to a Homebridge plugin. homebridge-caddx-interlogix is exactly that: a plugin for Homebridge that allows for the integration I initially wanted to have. I expanded upon the original work of Chris, adding chime control and sensor reporting, and the plugin feels steady enough to use on a daily basis. Sadly, Interlogix is going out of business, which means that this will eventually grow to become a legacy support piece of software. Then again, this means that the device has an end-of-life feature lock, which would make further debug and (maybe?) feature integration more stable.

Feel free to contact me with any suggestions. I will try to keep an eye on pull requests and the issue tracker, if my day job life allows it. If you feel like it, you can [buy me a coffee](https://paypal.me/flareman?locale.x=en_US) :). Also make sure to thank [Chris](https://github.com/caronc) for his original work, it was what made this possible.

## Issues
There are a few kinks that need ironing out, namely:

1. At present, even though cached accessories are restored properly, if you define any overrides, Homebridge retains the old (overrided) sensor in its cache. Theoretically this should not work, as the accessories retain the same unique ID and are updated after they are restored from cache. It might be a Homebridge bug, I'll have to look more into it. For now, you'll just have to remove the deprecated accessories by hand from the Homebridge Config UI X.
2. Burglar alarm reporting works; however, it is the only kind of alarm that triggers the accessory. Medical, fire, panic and duress alarms do not get reported at this time. Arming/disarming/chime capabilities and sensor reporting is not affected, though.

## Ideas for improvement/expansion
1. I have an idea of adding time "persistence" to the radars, that is, if a radar detects movement, the sensor should be able to report it for more than a few seconds (e.g. for a minute or two). This is, for example, the default behavior of Xiaomi/Aqara motion sensors, albeit their implementation locks out new detections for two whole minutes, with no option for different time windows.

## Changelog

* 1.0.13 Added debug output for testing purposes
* 1.0.12 Disabled the arm status check before issuing a zone bypass command; need a way to determine which zones are assigned to which area
* 1.0.10 - 1.0.11 Fixed a bug in followup to commit 3bc2290 where zone bypass commands were crashing the plugin
* 1.0.7 - 1.0.9 Attempt to fix crashing behavior while parsing installations with non-sequential zone bank numbers; special thanks go to  ([@mabrodeur](https://github.com/mabrodeur)) for help with debugging
* 1.0.6 Changed the retrieveZones function in security system source code to modify the counter, in order to account for non-sequential zone setup on the installer's side; props go to Jo Lienhoop ([@](https://github.com/JoHoop)) for discovering this bug
* 1.0.5 Fixed a bug where attempting to rearm an already armed zone would crash the Homebridge instance
* 1.0.4 Added zone bypassing capabilities. Also, the system now will not allow an arming command to go through when an area is not ready for arming (i.e. contact sensor at fault without being bypassed)
* 1.0.3 Added override customization option to zone sensors
* 1.0.2 Fixed URI decoding in zone and area names
* 1.0.1 Fixed '%20' instead of blank in zone names
* 1.0.0 Initial release
