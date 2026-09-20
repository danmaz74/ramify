Preview: this item exists only once a consumer reports a need for one of its capabilities.

```text
Role: engineer.  Scope: ramify/analysis and its descendants.
Map revision: 1.

Goal
  hypothetical-import-decision: Given one project's resolved module,
  source-area and symbol facts, an importing source area identified either by
  its module or by one file within it, and a symbol name, answer whether a
  source file in that area could import that symbol even though no such import
  exists anywhere in the project. An allowed answer carries, in order, every
  module that exposes the symbol on the way to the importer, each with the
  source position of the declaration that does it, so a caller can show the
  path. A refused answer carries exactly one first refusing rule, drawn from
  the rules the importability model already distinguishes: the symbol does not
  reach the importer, the importer lacks a tag the symbol requires of its
  importers, the symbol lacks a tag the importer requires of its symbols, or
  the importer's classification forbids reaching testing source. When the name
  has more than one original in the project and no owner was named, the answer
  lists those candidates and decides nothing. No importability rule changes:
  for a question that corresponds to an import the project really contains,
  the answer agrees with the decision an ordinary check makes about that
  import. It is done when each of those outcomes is produced from facts alone,
  for both ordinary and testing importers, and nothing is written.            <- map: newCapabilities.goal
  exposure-steps: For a refusal caused by the symbol not reaching the
  importer, produce the ordered exposure changes that would make the very same
  question answer allowed: for each module between the symbol's owner and the
  importer, which symbol that module would have to expose and to which side,
  together with any declaration it already has that does not take effect.
  Produce exactly the steps that are needed and no others, produce none for a
  refusal with any other cause, and change nothing. The result is data,
  carrying no concrete declaration syntax, and it is done when applying the
  described changes by hand turns the refusal into an allowed answer for every
  case the owner's own verification covers.            <- map: newCapabilities.goal
  declaration-spelling: Render one proposed exposure change as the exact
  single line a module's description would need, in the same version 1
  declaration language this owner already parses, and never touch a file while
  doing it. It is done when parsing a rendered line yields the change it was
  rendered from, for every kind of exposure the language can express, and when
  an unrepresentable change is reported as such instead of being rendered
  approximately.            <- map: newCapabilities.goal
  why-answer: From one analyzed project's completed facts, answer the question
  whether a named importer could import a named symbol, and return the whole
  answer as data: the decision and its single reason, the exposure path with
  the file and line of each declaration along it, the import a source file
  would write, the declarations that would be needed when the refusal is a
  missing exposure, or the candidate owners when the symbol name is ambiguous
  and no owner was named. An importer given as a file beneath a module's tests
  is answered under that testing area's profile, and the same module's
  ordinary source is answered under its ordinary profile. When a fact the
  answer depends on is missing or limited, the answer is explicitly uncertain
  and names the limit instead of reporting allowed or refused. Answering uses
  only what the analysis already holds: it starts no compiler, acquires no
  project state of its own, and writes nothing. It is done when an allowed, a
  refused, an ambiguous and an uncertain question each produce their complete
  answer, and the answer carries the identity of the analysis it came from.            <- map: newCapabilities.goal

Modules in your scope that the map expects to change
  - ramify/analysis/model [heavy]: It already owns the importability decision,
  the exposure evidence and the tag rules, so forming a hypothetical question,
  resolving an ambiguous symbol name and deriving the exposure steps that
  would allow the import belong to it.
  - ramify/analysis [heavy]: It composes the whole answer from the facts one
  analysis already holds: it resolves the importer given as a module or a
  file, obtains the decision, renders the proposed declarations, and reports
  an analysis limit as an explicit uncertainty.
  - ramify/analysis/descriptions [light]: It owns the version 1 declaration
  language, so it gains the rendering of one proposed exposure change as the
  exact line that language would parse.

Obligations: seams you provide
  - why-answer, consumed by ramify/daemon/contexts: conformance tests at <from the contract item's result>

Planned, outside your scope
  (none)
  If you need one of these, write a fake of only what you lack, make your
  behavioral tests pass against it, and report the need by its identifier.
  Anything else you lack and cannot build within your scope is an unplanned need.

Known interfaces
  - why-answer: explainImport (ramify/analysis/model), explainVisibility (ramify/analysis/model); for ramify/analysis src
      available. Import: import { explainImport, explainVisibility } from '../subs/model/src/index.js';
      Record: subs/analysis/src/.ramify/children/subs/analysis/subs/model/src/decisions.ts.md

Report one outcome with submit_outcome: goal reached | partial, with needs |
contract needs revision | cannot be satisfied as specified | the map is wrong.
```
