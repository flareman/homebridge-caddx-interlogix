
<p align="center">

<img src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>


# homebridge-nx-595e

This is a Homebridge plugin for the CaddX/ComNav/NetworX NX-595E network interface with Apple's Home.app.


## Installation

To install, make sure you have a valid Homebridge installation, then run:

```
npm install -g homebridge-nx-595e
```

After the installation you will have to edit your config.json file to include necessary parameters for the alarm system to function properly. The plugin supports the Homebridge Plugin Config schema, so you can also edit all necessary values from homebride-config-ui-x.

## Configuration

You need to set the following attributes:

* `platform` - this should always be `homebridge-nx-595e`
* `username` - this is the username you have set in your NX-595E web interface. It is advised that you create a user just for homebridge use, as logging in from another location will log you out on the plugin side of things
* `pin` - this is the PIN code you have set in your web interface for the desired username; it is always 4 digits long
* `ip` - this is the local IP address for the NX-595E network interface. You can either set a static IP from the web interface, or use your network router interface to assign a fixed IP to the MAC address of the alarm system; in any case, you will want the IP address to remain the same, or the plugin will not be able to communicate with the alarm
* `pollTimer` - this plugin works by polling the NX-595E for changes at given time intervals, a technique otherwise known as "polling". This attribute determines the amount of time in milliseconds between polling attemps. Too small values might congest your alarm's network interface and force it to ignore incoming requests, too large ones will result in slow status updates. Based on trial and error, anywhere between 250 and 2500 is good.

A sample config.json platform entry would be:
```
{
  "platform" : "homebridge-nx-595e",
  "name" : "homebridge-nx-595e",
  "username" : "User 1",
  "pin" : "1234",
  "ip" : "192.168.1.1",
  "pollTimer" : 500,
}
```

## Usage

After installing and configuring the plugin, Homebridge and (subsequently) Home.app will detect your security system and its components. Areas, zones and sensors are automagically detected based on the area and zone names you have set in your NX-595E web interface, and are reported as such.

In detail, after the plugin has started up, you will have the following accessories available:

1. Areas as security systems. Every area has its own security system switch in Homebridge, with Home, Away and Disarmed functionality. The plugin intelligently updates while the alarm system is arming, and will report likewise. In order to avoid mistakes, once an area is armed in either setting, it will not allow rearming until it has been disarmed.
2. Along with every area's security system you will find included a "chime" switch. This allows you to enable/disable the alarm system's namesake function, which chimes whenever a contact sensor changes state.
3. Contact sensors will present as such, and - as stated above - will inherit the names you have set in your web interface.
4. Likewise, radars will present as motion sensors, without any need for user input: the plugin infers the sensor type from the panel response. Motion is reported momentarily when the radar detects it, but that is enough for any automations you want to script.

Feel free to assign your accessories to the rooms of your house as they really are, it helps with automating.

## Miscellany

When I started writing this plugin, there was no other option available for what I needed to do, which is integrating the NX-595E with Apple's Homekit and Home.app. After months of researching, I stumbled across the work of [Chris Caron](https://github.com/caronc) and his [UltraSync]https://github.com/caronc/ultrasync project, which is essentially a library and CLI wrapper for the NX-595E written in Python. I started transfering the entire library to NodeJS using TypeScript, and finally ended up with [node-nx-595e](https://github.com/flareman/node-nx-595e): my own implementation of a library able to connect with the network interface, issue commands to it and report back with the system's state.

The next step was porting the library to a Homebridge plugin. homebridge-nx-595e is exactly that: a plugin for Homebridge that allows for the integration I initially wanted to have. I expanded upon the original work of Chris, adding chime control and sensor reporting, and the plugin feels steady enough to use on a daily basis.

Feel free to contact me with any suggestions. I will try to keep an eye on pull requests and the issue tracker, if my day job life allows it.

## Issues / TODO
There are a few kinks that need ironing out, namely:

1. Even though I have added alarm reporting code, I must be missing something from the original UltraSync source code, as the plugin will not report an alarm, even if it triggers (area status remains "Ready"). This is pretty major and I will try to find out where the bug is, and fix it. Does not affect sensor functionality or arming/disarming capabilities, though.
2. I have an idea of adding time "persistence" to the radars, that is, if a radar detects movement, the sensor should be able to report it for more than a few seconds (e.g. for a minute or two). This is, for example, the default behavior of Xiaomi/Aqara motion sensors, albeit their implementation locks out new detections for two whole minutes, with no option for different time windows. Should not be too difficult to implement, but \#1 above takes priority.
