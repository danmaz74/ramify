Preview: this item exists only once a consumer reports a need for one of its capabilities.

```text
Role: engineer.  Scope: ramify/presentation/project-view and its descendants.
Map revision: 1.

Goal
  why-panel: Render a hypothetical-import answer beside the module tree: with
  a module selected and a symbol name entered, show whether the import would
  be allowed, the single reason when it is refused, the proposed declarations
  when the cause is a missing exposure, the exposure path with each step's
  module, file and line, and the import to write when it is allowed. While an
  answer is shown, highlight in the tree the modules the exposure path passes
  through. Show the candidates for an ambiguous name, the named limit for an
  uncertain answer, and the pending and failure states. The rendering decides
  nothing and computes no rule: it shows only what it is given. It is done
  when each of those states renders from given data alone, the highlighting
  follows the shown path, and the panel is empty until a symbol name is
  entered.            <- map: newCapabilities.goal

Modules in your scope that the map expects to change
  - ramify/presentation/project-view [heavy]: It owns the module tree and its
  detail panel, so the answer panel, the exposure-path highlighting in the
  tree, and the candidate, uncertain and failure states are its rendering
  work.

Obligations: seams you provide
  - why-panel, consumed by ramify/explorer: conformance tests at <from the contract item's result>

Planned, outside your scope
  (none)
  If you need one of these, write a fake of only what you lack, make your
  behavioral tests pass against it, and report the need by its identifier.
  Anything else you lack and cannot build within your scope is an unplanned need.

Known interfaces
  - why-panel: ExposureHop (ramify/analysis/model), VisibilityDecision (ramify/analysis/model), ImportReason (ramify/analysis/model); for ramify/presentation/project-view src
      available. Import: import type { ExposureHop, ImportReason, VisibilityDecision } from '../../../../analysis/subs/model/src/interfaces/model.js';
      Record: subs/presentation/subs/project-view/src/.ramify/external/subs/analysis/subs/model/src/interfaces/model.ts.md

Report one outcome with submit_outcome: goal reached | partial, with needs |
contract needs revision | cannot be satisfied as specified | the map is wrong.
```
