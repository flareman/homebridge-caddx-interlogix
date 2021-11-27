# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.2] - 2021-11-27
### Added
- First GitHub release! Will apply to homebridge verified plugin program :v:

### Changed
- Created CHANGELOG.md and moved the changelog there
- Removed TLSv1 requirement from network calls code

### Fixed
- Fixed a bug where smoke sensors set to be ignored would be created instead
- Fixed a bug where output switches would be recreated every other homebridge restart, even when displayOutputSwitches is set to false


## [1.2.1] - 2021-11-12
### Changed
- Attempt at fixing a bug during output accessory creation when displayOutputSwitches is set to false


## [1.2.0] - 2021-11-10
### Changed
- SSL functionality has been disabled, as the NX-595E SSL version is depreciated and not supported by newer NodeJS/OpenSSL library versions; users are advised to log in to their systems and disable SSL


## [1.1.9] - 2021-11-7
### Added
- The new option displayOutputSwitches in config.json allows for disabling the output relay control switches


## [1.1.8] - 2021-11-7
### Added
- The plugin now supports controlling the output relays

### Changed
- SSL connections now require TLSv1 protocol


## [1.1.7] - 2021-11-7
### Added
- Initial SSL support added for connecting to the network module


## [1.1.6] - 2021-05-18
### Changed
- displayBypassSwitches now defaults to false
- Alarm flag enumerations now are more descriptive

### Fixed
- Fixed a bug in the area state bitmask logic


## [1.1.5] - 2021-03-7
### Added
- Sensor tripping now supports sensor persistence


## [1.1.4] - 2021-03-7
### Fixed
- Lint error fix


## [1.1.3] - 2021-03-7
### Added
- Added support for bypassing zone sensors


## [1.1.2] - 2021-03-7
### Fixed
- Lint error fix


## [1.1.1] - 2021-03-7
### Added
- Added the option to override by zone index
- The plugin now automatically prunes old accessories for sensors that have been removed, overriden, or ignored

### Fixed
- Fixed a bug on the zone ignoring logic


## [1.1.0] - 2021-03-7
### Added
- Added capability to ignore zones
- The plugin now supports designating sensors as smoke sensors when overriding


## [1.0.15] - 2021-03-5
### Changed
- The plugin now does not prune unnamed zones for firmware versions up to .106


## [1.0.14] - 2021-03-5
### Added
- The plugin now allows for unnamed zones, which enables compatibility with pre -.106 firmware versions


## [1.0.13] - 2021-03-3
### Added
- Added debug output for testing purposes


## [1.0.12] - 2021-02-13
### Changed
- There is no way at present to determing which zones are assigned to which area using the NX-595E web interface, so the logic checking the arming status for areas before issuing a zone bypass command is pointless; it has been disabled for now


## [1.0.11] - 2021-02-13
### Fixed
- Fixed the zone bypass crashing issue


## [1.0.10] - 2021-02-13
### Changed
- Attempt at fixing a bug where zone bypass commands were causing a plugin crash


## [1.0.8] - 2021-02-13
### Changed
- Further attempts at fixing the crashing issue from v1.0.6 and v1.0.7


## [1.0.7] - 2021-02-13
### Changed
- Attempting to fix crashing behavior while parsing installations with non-sequential zone bank numbers; special thanks go to ([@mabrodeur](https://github.com/mabrodeur)) for help with debugging


## [1.0.6] - 2021-01-27
### Added
- The plugin now supports non-sequential zone setup on the installer's side; props go to Jo Lienhoop ([@](https://github.com/JoHoop)) for reporting this issue


## [1.0.5] - 2021-01-15
### Fixed
- Fixed a bug where attempting to rearm an already armed area would crash the homebridge instance


## [1.0.4] - 2021-01-9
### Added
- Added zone bypassing capabilities

### Changed
- Arming commands will not go through if an area is not ready for arming


## [1.0.3] - 2021-01-8
### Added
- Added the option to override zone sensors and set them as either contact or motion sensors


## [1.0.2] - 2021-01-6
### Fixed
- Fixed URI decoding issues in zone and area names


## [1.0.1] - 2021-01-6
### Fixed
- Fixed a bug where empty zone names would force the zone name '%20'


## [1.0.0] - 2021-01-5
### Initial release
