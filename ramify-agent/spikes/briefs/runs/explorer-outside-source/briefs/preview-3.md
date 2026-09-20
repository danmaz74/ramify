Preview: this item exists only once a consumer reports a need for one of its capabilities.

```text
Role: engineer.  Scope: ramify/presentation and its descendants.
Map revision: 1.

Goal
  outside-source-model: The revision-bound project model this module defines
  for the browser can describe the source files that lie outside every module:
  a total count, and an ordered sequence of groups, each identifying the
  module whose directory most closely contains its files and listing those
  files with the reason each one is outside - a sibling tests directory, a
  sibling interfaces directory, loose source beneath subs, or a file beside a
  module's source directory. The description states that the sequence may be
  shorter than the total because its producer bounded it, and it keeps these
  files distinct from modules and from errors, so no consumer can present them
  as either. A model for a revision in which nothing is outside carries a zero
  count and no groups. Done when the description expresses all three cases -
  nothing outside, some outside, and more outside than the bound - and a model
  produced by the server for a real revision is accepted unchanged against it.            <- map: newCapabilities.goal
  outside-source-list: The module tree a viewer sees lists the source files
  that lie outside every module, grouped under the module that most closely
  contains them, each with the reason it is outside, and shows nothing at all
  - no heading and no empty list - when no file is outside. When the given
  data is bounded, the list says how many files it is showing out of the true
  total. Choosing a group reports that group's module as the viewer's
  selection, so the tree highlights that module exactly as choosing it in the
  tree does, and every other tree behavior is unchanged. The list presents
  these files as warnings, never as errors, never as modules, and never as
  something a viewer can open as a module. It renders only from the data it is
  given for the revision on screen and requests nothing itself. Done when data
  with two groups renders both with their files and reasons, choosing either
  highlights its module in the tree, data with no outside files renders
  nothing, and bounded data shows the shown-of-total wording.            <- map: newCapabilities.goal

Modules in your scope that the map expects to change
  - ramify/presentation/project-view [heavy]: It owns the browser-facing
  project model and the module tree view, so the new model description, the
  rendered list and the selection it reports are its work.
  - ramify/presentation [exposure-only]: It relays its project-view child's
  model vocabulary to its parent by name, so a new name must be added to that
  relay.

Obligations: seams you provide
  - outside-source-model, consumed by ramify/explorer: conformance tests at <from the contract item's result>
  - outside-source-list, consumed by ramify/explorer: conformance tests at <from the contract item's result>

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
