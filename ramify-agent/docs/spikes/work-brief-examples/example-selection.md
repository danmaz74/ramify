# Example requests for the work-brief decomposition spike

**Status:** Historical input-selection note, written before the planning
runs recorded in this directory. Its verification statements describe that
earlier preparation only; see the current [spike report](results.md).

## Request

Create three independent, realistic feature requests against the Ramify
toolkit with different sizes and expected module reach. Each `request.md` is a
standalone product request with constraints and observable acceptance. These
are input plans, not toolkit roadmap plans or an implementation map.

The example requests live only in this spike's `examples/` directory. They
are not discoverable execution plans. This selection rationale is historical
input-preparation context and is not supplied to the simulated agents.

## Answer

| Input plan | Intended size and reach | What makes it useful for the spike |
| --- | --- | --- |
| [Copy a module ID](examples/copy-module-id/request.md) | Small; approximately one production owner. | A local interaction with existing data, including asynchronous failure and stale feedback. Checks whether refinement can remain local. |
| [Share an explorer view](examples/share-explorer-view/request.md) | Medium; approximately two production owners, plus integration evidence where needed. | Browser navigation and a presentation boundary; restore timing, state identity, legacy behavior and missing selections create meaningful contracts without a new analysis capability. |
| [Dependency baselines](examples/dependency-baselines/request.md) | Large; likely seven to nine production owners, plus integration evidence. | Two user surfaces, durable data, analysis meaning, revision consistency, bounded resources and recovery. It should require several iterations within some owners as well as delegation across owners. |

The sizes and counts are selection hypotheses, not required task counts or
module assignments. Work decomposition must establish the actual scope from
the current project. A large feature does not by itself justify new modules.
The examples are independent: neither sharing nor baselines requires the
copy-module-ID example to have been implemented.

## Method

- **Question type:** capability discovery to ground example requests; no
  import-access audit or capability-placement decision.
- **Architect revision:** `rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:1`.
- **Input identity:** `input/1:9ca31c2bf2f66f17d0a67b2adcba33af79e9c59821900865c32637c2c876f3f9`.
- **Checkout:** HEAD `7e6d695f55ff950a486584d75189dbbda8e4d476`, with existing
  uncommitted ramify-agent work. These examples do not claim a clean baseline.
- **Guidance read:** module-architect `references/discovery.md` and `report.md`;
  planning skill and the toolkit implementation workflow. Its roadmap iteration
  format does not apply to these raw feature requests.
- **Verification performed:** refreshed the architect view through the built
  CLI, inspected retained records, and read the bounded source files below to
  establish the user-facing behavior the compact records could not settle.

## Evidence

- The module tree's selected-module detail already receives the canonical
  module ID and directory, and presents an action to open the import explorer.
  The inspected detail has no copy action. See
  [ModuleTreeView](../../../../subs/presentation/subs/project-view/src/ModuleTreeView.tsx)
  in the toolkit.
- The explorer currently keeps its dependency settings in page state, with
  defaults on each mount, and accepts an initial module focus. See
  [ProjectExplorerPage](../../../../subs/explorer/src/ProjectExplorerPage.tsx).
- Browser entry parses `?module=` and chooses the explorer or tree page. See
  [browser-app](../../../../subs/explorer/src/browser-app.tsx).
- The current browser service exposes project view, dependency view, export
  details and server status against its project binding. See
  [router](../../../../subs/service-api/src/router.ts).
- Current CLI commands include check, watch, materialize, measure, explore and
  daemon control. Named baseline commands were not found in its parser. See
  [arguments](../../../../subs/cli/src/arguments.ts).
- The architect records describe dependency analysis, context history and
  revision-bound dependency serving. These are useful existing foundations;
  bounded searches did not establish named durable dependency comparisons.
  See the current generated [analysis behaviors](../../../../.ramify-architect/analysis/behavior.jsonl),
  [context tests](../../../../.ramify-architect/daemon/contexts/tests.jsonl)
  and [service purpose](../../../../.ramify-architect/service-api/module.json).

**Source read:** exactly the five source files linked above. Owner counts are
architectural estimates from those observations and the generated module tree,
not a frozen capability map. The broad example may involve analysis, contexts,
daemon transport, CLI, the root service contract, service API, explorer and
project-view presentation; storage exclusions may also involve project input
handling. These are discovery leads, not assigned work.

## Not verified

The refreshed view contains 15 modules, measured production dependencies,
measured test references and measured metrics. It reports 366 truncated
details, one unavailable detail and 21 dynamic test titles. See
[_meta.json](../../../../.ramify-architect/_meta.json).
Absence from the searches is not proof of absence. Generated references may
change when the view is refreshed.

No foreign API availability was asserted. No executable feature checks,
decomposition run, implementation or live agent trial was performed. The
acceptance sections describe desired outcomes, not passing evidence.

## Next step

Use one of these requests to spike the path from capability map and global
plan to a bounded consumer brief, then executable needs and provider briefs.
Assess whether the resulting work stays bounded without prescribing the
number of iterations or assuming one work item per module.
