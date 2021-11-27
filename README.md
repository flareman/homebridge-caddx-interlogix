
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
* `displayBypassSwitches` - this option is optional and allows you to override the plugin's standard behavior and hide the bypass switches for zones. If not set, this defaults to true (see Usage below).
* `radarPersistence` and `smokePersistence` - these two settings are optional, and they allow to modify the time in milliseconds for which a radar or smoke sensor will remain triggered after the actual event. The default behavior is 60000 ms (or one minute) for both.
* `displayBypassSwitches` - this setting is optional and allows you to override the plugin's standard behavior and hide the bypass switches for zones. If not set, this defaults to true (see Usage below).
* `displayOutputSwitches` - this optional setting allows you to display switches for controlling the security system's output relays (defaults to false). Some users use the relays to control devices such as outdoor lights or garage doors, this setting exposes control of the output relays to HomeKit. Make sure to check the output settings in the NX-595E's web interface; by default, they turn back off again after a few seconds, you will have to modify that behavior to whatever you like. In any case, the plugin will reflect the current state of the relays.
* `ignoreZones` - this attribute allows the user to define certain zones that should be ignored. This is mostly necessary for older version of the network interface software (i.e. up to 0.106): newer versions denotate unused zones using "!", so we have a way of detecting those. In versions before 0.107 zone naming isn't supported, and the system reports all zones with "" names. In these cases, the user needs a way to indicate which zones the plugin should ignore, in order to avoid polluting the Homebridge/HomeKit interface with unused sensors. `ignoreZones` is defined as a string value containing comma-separated zone indexes up to 999. Zone ranges are also supported, using dashes. An example of a valid value would be `"2,4,6-8,24-36,45"`. Entries such as `-14`, `9999`, `2-4-6`, `1,--4,6`, or `6-3` are invalid. Likewise, zone indexes beyond the count determined by the system will also not be accepted.
* `override` - this array of items allows the user to override the names and types of zone sensors. You can either set this manually in config.json, or use the Config UI X form for an easier time. For every zone that you want to override, you specify an array item with three properties: `index`, `name` and `sensor`. `index` determines the index of the zone to be overriden, and is mandatory; the zone index should exist, and in case the user sets more than one overrides for the same zone index, only the last one declared is taken into account. `name` is optional; if you define a name here, it will override the name that the plugin fetches from the network interface. `sensor` is mandatory and can be either "Contact" (which is the default), "Radar", or "Smoke", which designates the zone sensor as either a contact, motion, or smoke sensor. This does not affect the actual function or reporting of the sensor, but changes the way that it appears in Homebridge and HomeKit, which allows for more accurate Siri use and automating.

A bare minimum sample config.json platform entry would be:
```
{
  "platform": "homebridge-caddx-interlogix",
  "name": "homebridge-caddx-interlogix",
  "username": "User 1",
  "pin": "1234",
  "ip": "192.168.1.1",
}
```

This example sets up the plugin with the default settings and requires as a minimum the IP address of the network interface, plus a user name and the access PIN for login.

Another sample config.json platform entry would be:
```
{
  "platform": "homebridge-caddx-interlogix",
  "name": "homebridge-caddx-interlogix",
  "username": "User 1",
  "pin": "1234",
  "ip": "192.168.1.1",
  "pollTimer": 500,
  "displayOutputSwitches": true,
  "displayBypassSwitches": false,
  "radarPersistence": 20000,
  "smokePersistence": 180000,
  "ignoreZones": "8,10-12,24-36,45",
  "override": [
    {"index": 1, "name": "Front Door", "sensor": "Contact"},
    {"index": 2, "name": "Living Room Window", "sensor": "Contact"},
    {"index": 5, "sensor": "Smoke"},
    {"index": 7, "name": "Hallway Radar", "sensor": "Radar"}
  ]
}
```

The example above defines the necessary parameters for connecting with the network interface, removes bypass switches for sensors, enables output switches, sets radar persistence time to twenty seconds and smoke sensor persistence time to three minutes, and overrides zones \#1, \#2, \#5, and \#7, renaming the first two and the seventh contacts, defining zone sensor \#5 as a smoke sensor and \#7 as a motion sensor, and indicating that zones \#8, \#45, and all zones from \#10 to \#12 and from \#24 to \#36 should be ignored.

## Usage

After installing and configuring the plugin, Homebridge, and subsequently Home.app, will detect your security system and its components. Areas, zones and sensors are (sic) automagically detected based on the area and zone names you have set in your NX-595E web interface, and are reported as such.

In detail, after the plugin has started up, you will have the following accessories available:

1. Areas as security systems. Every area has its own security system switch in Homebridge, with Home, Away and Disarmed functionality. The plugin intelligently updates while the alarm system is arming, and will report likewise. In order to avoid mistakes, once an area is armed in either setting, it will not allow rearming until it has been disarmed.
2. Along with every area's security system you will find included a "chime" switch. This allows you to enable/disable the alarm system's namesake function, which chimes whenever a contact sensor changes state.
3. Contact, radar and smoke sensors will present as such, and - as stated above - will inherit the names you have set in your web interface. Radars and smoke sensors will initially present as contact sensors. Activity is reported momentarily when the sensor detects it, but that is enough for any automations you want to script. If you want the sensor to actually register as a motion or smoke sensor, then you have to add an entry to the override array (see above), to specify which zone should appear as such.
5. Every zone sensor has a "bypass" switch included, which allows you to see or set the bypass state for a zone. Keep in mind that the plugin mimics the standard alarm control panel behavior: when an area is armed, the zone sensors bypass status can't be changed. By default, the switches are hidden, but you can use the `displayBypassSwitches` option to override this.
6. Output relays can be exposed as switches to Homebridge, so you can control those through HomeKit, if you are using them in your setup. The default behavior is disabled, but you can set the `displayOutputSwitches` to `true` to enable these.

Feel free to assign your accessories to the rooms of your house as they really are, it helps with automating.

## SSL conundrum

At version 1.1.6 [Scott Maynard](https://github.com/s-01010011) contacted me with a problem: the plugin could not connect with his installation, running on version 0.106-J of firmware. Turns out Interlogix has baked in SSL support for the web interface, with the web server providing access for both standard (http:// over port 80) and secure (https:// over port 443 by default) connections. However, the SSL version and the cipher that NX-595E uses are old and depreciated and all modern security libraries don't support it any longer (as in, the user can't even use a modern browser to connect manually to the web interface), even though the installation manual clearly states that standard HTTP connections should be allowed side-by-side with HTTPS ones. After several tries and back and forth between us, it became clear that supporting SSL connections to the network module can only be done if the end user installs a custom-built NodeJS version on their machine, one with a custom OpenSSL build to support the old protocols, which is both unsafe and impractical. With all this in mind, homebridge-caddx-interlogix does **not** support SSL connections at this time. Any users who have this issue are advised to either use an old browser version, or the Ultrasync+ mobile app, to connect to the web interface as installers and disable the SSL feature, in order to restore standard functionality. Alas, the perils of end-of-life software :shrug:

## Miscellany

When I started writing this plugin, there was no other option available for what I needed to do, which is integrating the NX-595E with Apple's Homekit and Home.app. After months of researching, I stumbled across the work of [Chris Caron](https://github.com/caronc) and his [UltraSync](https://github.com/caronc/ultrasync) project, which is essentially a library and CLI wrapper for the NX-595E written in Python. I started transferring the entire library to NodeJS using TypeScript, and finally ended up with [node-nx-595e](https://github.com/flareman/node-nx-595e): my own implementation of a library able to connect with the network interface, issue commands to it and report back with the system's state.

The next step was porting the library to a Homebridge plugin. homebridge-caddx-interlogix is exactly that: a plugin for Homebridge that allows for the integration I initially wanted to have. I expanded upon the original work of Chris, adding chime control and sensor reporting, and the plugin feels steady enough to use on a daily basis. Sadly, Interlogix is going out of business, which means that this will eventually grow to become a legacy support piece of software. Then again, this means that the device has an end-of-life feature lock, which would make further debug and (maybe?) feature integration more stable.

Feel free to contact me with any suggestions. I will try to keep an eye on pull requests and the issue tracker, if my day job life allows it. If you feel like it, you can [buy me a coffee](https://paypal.me/flareman?locale.x=en_US) :). Also make sure to thank [Chris](https://github.com/caronc) for his original work, it was what made this possible.

## Issues
There are a few kinks that need ironing out, namely:

1. Medical, fire, panic and duress alarms do not get reported at this time. Burglar alarm reporting, arming/disarming/chime capabilities and sensor reporting work normally, however.

## Ideas for improvement/expansion
2. I would like to add the option for night arming, i.e. home arming with immediate alarm triggering when the front door contact fires. HomeKit/HomeBridge offers this capability, but the network interface code (which was used for reverse engineering this plugin) does not include a clear command for this. It might be possible, but it requires testing different command codes to find the proper one, which - even if such a command exists - is essentially trial-and-error, and very time consuming.

3. Some people use several components in their security setup, which are not necessarily part of the CaddX line (i.e. separate Aqara window vibration sensors). I would like to look into the ability to manually fire an alarm, so that these people can set their own alarm rules in HomeKit.
