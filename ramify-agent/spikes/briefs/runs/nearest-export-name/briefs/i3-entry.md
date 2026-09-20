```text
Role: engineer.  Scope: ramify/analysis and its descendants.
Map revision: 1.  Plan: ramify-agent/spikes/briefs/plans/nearest-export-name/plan.md (read it when the goal is unclear).

Goal
  A completed analysis of a project whose module description misspells an
  exposed symbol still fails, and the finding for that declaration keeps its
  existing problem code, location and text while adding the close names both
  at the end of its text and as separate data on the finding; when nothing is
  close, the finding is identical to today's. This holds for a misspelt
  selection out of the owner's own source, for a misspelt selection out of the
  owner's tests, and for a misspelt selection out of a child's contract to its
  parent, and a name close only to a symbol another module owns produces no
  suggestion.            <- map: entryPoint.acceptance
  close-name-candidates: Given the symbol name a declaration asked for and the
  ordered list of names that were actually offered to it, decide which of
  those offered names are close enough to be worth showing as possible
  corrections, and return them in the order they were offered, never more than
  three. A name that differs from the asked-for name only in letter case
  always counts as close. When no offered name is close, return none rather
  than the least unlike one. The decision is deterministic: the same asked-for
  name and the same ordered list of offered names always yield the same
  answer, the answer never depends on what kind of declaration asked, and it
  never contains a name that was not in the offered list. It is done when a
  case-only difference, the ordered cap at three equally close names, and the
  empty answer for a name unlike anything offered are each demonstrated.            <- map: newCapabilities.goal
  src-selection-suggestions: When a module description names, in a declaration
  that selects exports out of one of the owner's own source files, a symbol
  that file does not offer that declaration, the resulting rejection
  additionally offers the close names among those it could have named. The
  rejection keeps everything it reports today - the same problem code, the
  same source location, and the same text - with the suggestion appended after
  that text, and it also carries the suggested names as separate data on the
  rejection so that a reader need not parse prose. The candidate names come
  only from what that declaration could validly have selected, namely exports
  the module itself owns in that file, so a misspelling resembling only a
  symbol the file passes on from another owner yields no suggestion. The
  declaration remains invalid and nothing new becomes exposed. It is done when
  a misspelling of an owned export yields that export as a suggestion, a
  misspelling resembling only a foreign-owned export yields none, and a
  misspelling resembling nothing yields exactly today's rejection.            <- map: newCapabilities.goal
  sub-contract-suggestions: When a module description names, in a declaration
  that selects from a direct child's contract to its parent, a symbol that
  contract does not contain, the resulting rejection additionally offers the
  close names drawn from the names that contract does contain and from nothing
  else. As with selections out of the owner's own source, the rejection keeps
  its existing problem code, source location and text with the suggestion
  appended, carries the suggested names as separate data, and leaves the
  declaration invalid so that the check still fails. It is done when a
  misspelt selection from a child whose contract holds a similar name yields
  that name, and a selection naming something the child has but does not offer
  its parent yields no suggestion.            <- map: newCapabilities.goal
  report-suggestion-data: The completed analysis result presents every
  suggestion produced while rejecting an exposure declaration as data on the
  corresponding finding, alongside that finding's text, so that a
  machine-readable consumer of the result reads the suggested names without
  parsing prose. A finding that has no suggestion is indistinguishable in
  shape from the one produced today, and no finding's problem code, location,
  ordering or existing text changes. The result still reports the project as
  failing. It is done when a run over a project whose description misspells an
  exposed symbol yields a machine-readable result whose finding for that
  declaration carries the suggested names as their own values in the offered
  order, and a run over a project whose misspelling resembles nothing yields a
  result identical to today's.            <- map: newCapabilities.goal

Modules in your scope that the map expects to change
  - ramify/analysis/descriptions [heavy]: It owns the linking stage that
  rejects an exposure naming a symbol its file or its child's contract does
  not provide, so the candidate names, the closeness decision, the appended
  text and the new data on the rejection all fall here.
  - ramify/analysis [light]: It turns the child's rejections into the
  completed analysis findings, so the finding gains the optional suggestion
  field and the mapping copies it through.

Obligations: seams you provide
  - report-suggestion-data, consumed by ramify/cli: conformance tests at <from the contract item's result>

Planned, outside your scope
  (none)
  If you need one of these, write a fake of only what you lack, make your
  behavioral tests pass against it, and report the need by its identifier.
  Anything else you lack and cannot build within your scope is an unplanned need.

Known interfaces
  - src-selection-suggestions: SourceCatalog (ramify/analysis/typescript); for ramify/analysis/descriptions src
      available. Import: import type { SourceCatalog } from '../../../typescript/src/interfaces/source.js';
      Record: subs/analysis/subs/descriptions/src/.ramify/external/subs/analysis/subs/typescript/src/interfaces/source.ts.md
  - report-suggestion-data: LinkIssue (ramify/analysis/descriptions); for ramify/analysis src
      available. Import: import type { LinkedDescriptions, LinkIssue } from '../../subs/descriptions/src/interfaces/linking.js';
      Record: subs/analysis/src/.ramify/children/subs/analysis/subs/descriptions/src/interfaces/linking.ts.md

Report one outcome with submit_outcome: goal reached | partial, with needs |
contract needs revision | cannot be satisfied as specified | the map is wrong.
```
