Preview: this item exists only once a consumer reports a need for one of its capabilities.

```text
Role: engineer.  Scope: ramify/service-api and its descendants.
Map revision: 1.

Goal
  outside-source-projection: The browser-facing project model published for
  one revision carries the source files that lie outside every module: a total
  count, and a deterministically ordered sequence of groups, one per nearest
  containing module, each naming that module and listing its files with the
  reason each one is outside. Every value is copied from the completed
  analysis of that same revision; the projection reads no project files, runs
  no analysis, and never mixes two revisions. The sequence is bounded: when
  more than 200 files are outside, it carries the first 200 and still reports
  the true total, so the published model stays within the size limit it
  already respects. When nothing is outside, the model carries a zero count
  and no groups rather than an absent or partial model. Done when a revision
  whose analysis reports outside files publishes exactly those files, grouped
  under their nearest modules with their reasons and the true total; a
  revision with none publishes a zero count and no groups; and a revision with
  more than 200 publishes 200 entries and the true total.            <- map: newCapabilities.goal

Modules in your scope that the map expects to change
  - ramify/service-api [heavy]: It owns the pure, revision-bound projection of
  a completed report into the browser model, so the count, the grouping by
  nearest module and the 200-entry bound are published from here.

Obligations: seams you provide
  - outside-source-projection, consumed by ramify/explorer: conformance tests at <from the contract item's result>

Planned, outside your scope
  - outside-source-classification owner: ramify/analysis/project
  For every compiler-selected source file that lies outside every module's
  owned source area, the completed analysis of a revision reports, besides the
  file's path, why it is outside - it sits in a sibling tests directory, in a
  sibling interfaces directory, loose beneath a subs directory, or beside a
  module's own source directory - and the directory of the nearest module that
  contains it, or that no module contains it. The classification is derived
  from the captured input of that same revision, is deterministic and stably
  ordered, and adds no filesystem reads beyond the ones the revision already
  makes. These files remain warnings: the existing warning records, their
  counts and their ordering keep the shape and content they have today, so the
  command-line check's output for the same project is unchanged. Done when a
  project holding a sibling tests directory, a loose file beneath subs, and a
  file beside a module's source directory reports all three with the correct
  reason and nearest module, a project with no such file reports none, and the
  command-line check's output for both projects is identical to what it is
  today.
  If you need one of these, write a fake of only what you lack, make your
  behavioral tests pass against it, and report the need by its identifier.
  Anything else you lack and cannot build within your scope is an unplanned need.

Known interfaces
  - outside-source-projection: AnalysisReport (ramify/analysis); for ramify/service-api src
      available. Import: import type { AnalysisReport } from '../../analysis/src/interfaces/analysis.js';
      Record: subs/service-api/src/.ramify/external/subs/analysis/src/interfaces/analysis.ts.md
  - outside-source-projection: OutsideSourceWarning (ramify/analysis/project); for ramify/service-api src
      available. Import: import type { OutsideSourceWarning } from '../../analysis/subs/project/src/interfaces/project.js';
      Record: subs/service-api/src/.ramify/external/subs/analysis/subs/project/src/interfaces/project.ts.md
  - outside-source-model: ProjectExplorerModel (ramify/presentation/project-view); for ramify/service-api src
      availability unknown: service-api's ordinary API view lists nothing owned by the presentation branch and reports one coverage note, so its absence cannot prove denial. The module header carries only [dispatch] while the model's owner is tagged [ui, browser], and ui is a required-importer tag, so the projection is expected to keep producing a structurally matching value rather than importing the model. The view was also materialized at a later revision (sequence 4) than the architect view (sequence 1), and no materialization was run in this session.

Report one outcome with submit_outcome: goal reached | partial, with needs |
contract needs revision | cannot be satisfied as specified | the map is wrong.
```
