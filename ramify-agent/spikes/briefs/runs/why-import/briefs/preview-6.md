Preview: this item exists only once a consumer reports a need for one of its capabilities.

```text
Role: engineer.  Scope: ramify/explorer and its descendants.
Map revision: 1.

Goal
  why-page-query: In the served explorer page, let a viewer select a module
  and type a symbol name, send that question to the project's local web
  service, and show the returned answer beside the tree. The page asks nothing
  while no symbol name is entered, shows the service's pending, uncertain and
  failure states as it receives them, and shows the answer of the project
  state current when it asked. It is done when selecting a module, typing a
  name and asking produces, in the served page, the same answer the command
  line gives for that question.            <- map: newCapabilities.goal

Modules in your scope that the map expects to change
  - ramify/explorer [light]: It owns the served page and its client, so it
  carries the module selection and typed symbol into a request and shows the
  returned answer.

Planned, outside your scope
  - why-procedure owner: ramify/service-api
  Offer the hypothetical-import question to the browser as one read-only
  procedure of a project's local web service: it takes an importer and a
  symbol name for the bound project, relays the question to the resident
  process for that project, and returns the answer in the browser-facing
  shape, including the revision it came from and its allowed, refused,
  ambiguous and uncertain forms, with a readable failure when the project is
  not currently bound or the resident process is unreachable. It adds no rule
  of its own and reads no project file. It is done when the answer it returns
  for a question matches, field for field in meaning, the answer the command
  line receives for the same question against the same project state.
  - why-panel owner: ramify/presentation/project-view
  Render a hypothetical-import answer beside the module tree: with a module
  selected and a symbol name entered, show whether the import would be
  allowed, the single reason when it is refused, the proposed declarations
  when the cause is a missing exposure, the exposure path with each step's
  module, file and line, and the import to write when it is allowed. While an
  answer is shown, highlight in the tree the modules the exposure path passes
  through. Show the candidates for an ambiguous name, the named limit for an
  uncertain answer, and the pending and failure states. The rendering decides
  nothing and computes no rule: it shows only what it is given. It is done
  when each of those states renders from given data alone, the highlighting
  follows the shown path, and the panel is empty until a symbol name is
  entered.
  If you need one of these, write a fake of only what you lack, make your
  behavioral tests pass against it, and report the need by its identifier.
  Anything else you lack and cannot build within your scope is an unplanned need.

Known interfaces
  - why-page-query: ProjectExplorerView (ramify/presentation/project-view); for ramify/explorer src
      available. Import: import { ProjectExplorerView } from '../../presentation/subs/project-view/src/ProjectExplorerView.js';
      Record: subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/ProjectExplorerView.tsx.md

Report one outcome with submit_outcome: goal reached | partial, with needs |
contract needs revision | cannot be satisfied as specified | the map is wrong.
```
