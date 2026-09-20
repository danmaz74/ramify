```text
Role: engineer.  Scope: ramify/explorer and its descendants.
Map revision: 1.  Plan: ramify-agent/spikes/briefs/plans/explorer-outside-source/plan.md (read it when the goal is unclear).

Goal
  In a project with a sibling tests directory and a loose file beneath subs,
  the explorer's home page shows the count of files outside every module and
  the module tree page lists both files under their nearest modules with the
  right reasons; moving one of them into a module's source directory removes
  it from the open page without a reload; a project with no such files shows
  no count and no list; and the command-line check's output is unchanged.            <- map: entryPoint.acceptance
  outside-source-count: The explorer's home page states how many source files
  lie outside every module for the revision it is showing, and shows nothing
  about them when there are none. The number comes from what the resident
  analysis has already published for that revision; the page performs no
  analysis and reads no project files. When a newer revision is published, the
  number follows it without the viewer reloading the page, and a number from
  one revision is never shown as belonging to another. Done when a project
  with files outside every module shows the count on the home page, a project
  with none shows nothing about them, and moving such a file into a module's
  source directory changes the number on the open page.            <- map: newCapabilities.goal
  outside-source-page: The module tree page gives the tree the outside-source
  groups published for the revision it is showing, and keeps the page's
  selected module in step with the group the viewer chooses, so choosing a
  group highlights that module in the tree while every existing tree behavior
  stays as it is. The page follows the published revision: when a file is
  moved into a module's source directory while the page is open, it leaves the
  list without a reload, and a group whose module is gone leaves no stale
  selection behind. The page asks the server for nothing beyond what it
  already asks for the tree, performs no analysis, and never shows files from
  one revision beside a tree from another. Done when the page shows the
  published groups under their modules, choosing a group highlights its
  module, a move that empties a group removes it from the open page without a
  reload, and a project with no outside files shows no list.            <- map: newCapabilities.goal

Modules in your scope that the map expects to change
  - ramify/explorer [light]: It derives no new fact: the home page requests
  the published model it does not request today and shows the count, and the
  module tree page passes the published groups to the view and keeps the
  selection in step.

Planned, outside your scope
  - outside-source-projection owner: ramify/service-api
  The browser-facing project model published for one revision carries the
  source files that lie outside every module: a total count, and a
  deterministically ordered sequence of groups, one per nearest containing
  module, each naming that module and listing its files with the reason each
  one is outside. Every value is copied from the completed analysis of that
  same revision; the projection reads no project files, runs no analysis, and
  never mixes two revisions. The sequence is bounded: when more than 200 files
  are outside, it carries the first 200 and still reports the true total, so
  the published model stays within the size limit it already respects. When
  nothing is outside, the model carries a zero count and no groups rather than
  an absent or partial model. Done when a revision whose analysis reports
  outside files publishes exactly those files, grouped under their nearest
  modules with their reasons and the true total; a revision with none
  publishes a zero count and no groups; and a revision with more than 200
  publishes 200 entries and the true total.
  - outside-source-model owner: ramify/presentation/project-view
  The revision-bound project model this module defines for the browser can
  describe the source files that lie outside every module: a total count, and
  an ordered sequence of groups, each identifying the module whose directory
  most closely contains its files and listing those files with the reason each
  one is outside - a sibling tests directory, a sibling interfaces directory,
  loose source beneath subs, or a file beside a module's source directory. The
  description states that the sequence may be shorter than the total because
  its producer bounded it, and it keeps these files distinct from modules and
  from errors, so no consumer can present them as either. A model for a
  revision in which nothing is outside carries a zero count and no groups.
  Done when the description expresses all three cases - nothing outside, some
  outside, and more outside than the bound - and a model produced by the
  server for a real revision is accepted unchanged against it.
  - outside-source-list owner: ramify/presentation/project-view
  The module tree a viewer sees lists the source files that lie outside every
  module, grouped under the module that most closely contains them, each with
  the reason it is outside, and shows nothing at all - no heading and no empty
  list - when no file is outside. When the given data is bounded, the list
  says how many files it is showing out of the true total. Choosing a group
  reports that group's module as the viewer's selection, so the tree
  highlights that module exactly as choosing it in the tree does, and every
  other tree behavior is unchanged. The list presents these files as warnings,
  never as errors, never as modules, and never as something a viewer can open
  as a module. It renders only from the data it is given for the revision on
  screen and requests nothing itself. Done when data with two groups renders
  both with their files and reasons, choosing either highlights its module in
  the tree, data with no outside files renders nothing, and bounded data shows
  the shown-of-total wording.
  If you need one of these, write a fake of only what you lack, make your
  behavioral tests pass against it, and report the need by its identifier.
  Anything else you lack and cannot build within your scope is an unplanned need.

Known interfaces
  - outside-source-page: ProjectExplorerModel (ramify/presentation/project-view), ExplorerModule (ramify/presentation/project-view); for ramify/explorer src
      available. Import: import type { ProjectExplorerModel, ExplorerModule } from '../../presentation/subs/project-view/src/interfaces/project-view.js';
      Record: subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/interfaces/project-view.ts.md
  - outside-source-page: ModuleTreeView (ramify/presentation/project-view), ModuleTreeViewProps (ramify/presentation/project-view); for ramify/explorer src
      available. Import: import { ModuleTreeView } from '../../presentation/subs/project-view/src/ModuleTreeView.js';
      Record: subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/ModuleTreeView.tsx.md

Report one outcome with submit_outcome: goal reached | partial, with needs |
contract needs revision | cannot be satisfied as specified | the map is wrong.
```
