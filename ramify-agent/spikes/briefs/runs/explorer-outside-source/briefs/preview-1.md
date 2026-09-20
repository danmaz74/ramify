Preview: this item exists only once a consumer reports a need for one of its capabilities.

```text
Role: engineer.  Scope: ramify/analysis and its descendants.
Map revision: 1.

Goal
  outside-source-classification: For every compiler-selected source file that
  lies outside every module's owned source area, the completed analysis of a
  revision reports, besides the file's path, why it is outside - it sits in a
  sibling tests directory, in a sibling interfaces directory, loose beneath a
  subs directory, or beside a module's own source directory - and the
  directory of the nearest module that contains it, or that no module contains
  it. The classification is derived from the captured input of that same
  revision, is deterministic and stably ordered, and adds no filesystem reads
  beyond the ones the revision already makes. These files remain warnings: the
  existing warning records, their counts and their ordering keep the shape and
  content they have today, so the command-line check's output for the same
  project is unchanged. Done when a project holding a sibling tests directory,
  a loose file beneath subs, and a file beside a module's source directory
  reports all three with the correct reason and nearest module, a project with
  no such file reports none, and the command-line check's output for both
  projects is identical to what it is today.            <- map: newCapabilities.goal

Modules in your scope that the map expects to change
  - ramify/analysis/project [heavy]: It already validates the project's
  physical ownership layout and reports the files outside every module, so the
  reason each file is outside and its nearest containing module are derived
  here.
  - ramify/analysis [exposure-only]: It relays its project child's vocabulary
  to its parent and descendants by name, so any new vocabulary name must be
  added to that relay.

Obligations: seams you provide
  - outside-source-classification, consumed by ramify/service-api: conformance tests at <from the contract item's result>

Planned, outside your scope
  (none)
  If you need one of these, write a fake of only what you lack, make your
  behavioral tests pass against it, and report the need by its identifier.
  Anything else you lack and cannot build within your scope is an unplanned need.

Known interfaces
  (none)

Report one outcome with submit_outcome: goal reached | partial, with needs |
contract needs revision | cannot be satisfied as specified | the map is wrong.
```
