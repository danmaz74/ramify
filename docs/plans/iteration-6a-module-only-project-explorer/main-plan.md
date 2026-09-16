# Plan 6A: Module-only project explorer

**Date:** 2026-09-16. **Status:** completed. This is a focused successor to the completed
[Plan 6](../iteration-6-project-explorer/main-plan.md). Plan 6's artifacts and
completion evidence remain historical records and are not rewritten.

## Product decision

The project explorer displays Ramify modules and observed imports between
different Ramify modules. It does not display npm packages, Node builtins,
TypeScript standard-library targets, files outside modules or unresolved
targets as graph nodes, graph edges, selectable rows or explorer metrics.

This decision changes only the explorer projection and presentation. Ramify's
source analysis continues to resolve and report every target category because
checking, diagnostics and coverage depend on those facts. The work does not
delete package or builtin imports from project source and does not weaken the
importability model.

## Runnable outcome

```sh
ramify explore
ramify explore --root examples/collection-review
```

Both commands keep the Plan 6 workflow, but every graph node represents an
`ExplorerModule` and every selectable dependency edge represents a
cross-owner application access. Out-of-view nodes remain available because
they are Ramify modules outside the current drill-down scope. Module exports,
purpose, files, coverage notices, revision refresh and symbol details remain.

## Scope and prerequisites

The implemented Plan 6 report projection, pure project view, connected page,
web process, CLI launcher and browser runner are prerequisites. The change
starts at the report-to-explorer projection boundary:

- the retained `AnalysisReport` remains authoritative and unchanged;
- `ProjectExplorerModel` stops transporting non-application access groups;
- graph, details and connected selection state lose their target variants; and
- acceptance proves the omitted facts still exist in the source report.

There are no analysis/session, contexts, daemon, transport-procedure, CLI
syntax, process-lifecycle or model-principle changes.

## Frozen semantic boundary

The companion [view-model amendment](view-model-amendment.md) is the frozen
contract. Its central rules are:

1. A visible dependency is one `SourceAccess` whose target kind is
   `application` and whose importer owner differs from its target-file owner.
2. Only those visible accesses contribute to explorer access, symbol, denied
   and limited counts. Same-owner and non-application accesses contribute to
   none of those explorer metrics.
3. `ProjectExplorerModel.otherTargets`, `ExplorerTargetGroup`,
   `ExplorerSummary.otherTargets` and `ExplorerCoverage.targetIds` are removed,
   not retained as hidden payload.
4. Every `SourceLimit` remains in explorer coverage. It keeps source-owner
   association when available and module-edge association when applicable;
   limits concerning omitted targets may therefore be global or module-only.
5. Removing a presentation category never changes the report outcome,
   diagnostics, coverage completeness or published revision.

These rules avoid a misleading partial change in which external nodes are
hidden while external imports still inflate module summaries.

## Ownership and changed surfaces

| Owner | Planned change |
| --- | --- |
| `service-api [dispatch]` | Narrow the public DTO and projection; scope metrics and coverage associations to visible module edges. |
| `presentation/subs/project-view [ui, browser]` | Remove target nodes, target edges, target selection and target details while preserving module/out-of-view behavior. |
| `explorer [ui, browser, dispatch]` | Reconcile only module and module-edge selection across revision refreshes. |
| `integration-tests [testing, ui, dispatch]` | Prove through real reports, HTTP and Chromium that analyzed external accesses never become explorer entities. |

No new module, package entry, dependency or exposure channel is required.
Removing `ExplorerTargetGroup` may remove now-unused type imports and test
helpers, but must not broaden any module exposure.

## Iterations

| # | Title | Outcome |
| --- | --- | --- |
| 1 | Module-only contract and baseline | Freeze the DTO removal, counting units, coverage behavior and before-change witnesses. |
| 2 | Module-only report projection | Stop serializing non-application targets and recompute all explorer metrics from visible cross-module accesses. |
| 3 | Module-only project view | Remove external target nodes, edges, selections and details from the reusable presentation owner. |
| 4 | Connected workflow and browser gate | Simplify refresh reconciliation and prove the behavior through the real router, HTTP process and browser. |

The provider contract changes before either UI consumer. The final iteration
runs the complete [acceptance matrix](acceptance.md) and writes a completion
report; passing an earlier owner test does not complete the plan.
Each manifest entry is self-contained for execution by a separate subagent in
order, using the preceding iteration's recorded handoff rather than conversation
history.

## Verification strategy and budgets

Use three independent evidence layers:

- projection tests whose input report deliberately contains application,
  package, builtin, standard-library, outside-module and unresolved accesses;
- component tests that inspect actual React Flow nodes/edges and selection
  callbacks; and
- the existing real router, actual HTTP process and `/usr/bin/chromium` runner
  against the reference project, Ramify and an isolated mutation fixture.

Positive controls are mandatory: the same fixtures must contain at least two
Ramify modules and one cross-module application access, so an empty graph
cannot pass. Tests inspect the input report before projection to prove omitted
external categories were actually present.

The existing 16 MiB encoded-response refusal remains enforced. For identical
captured reports, the module-only encoded model must be no larger than the
pre-change model. Ten revision refreshes must return to the existing settled
baseline with no additional retained model, listener or timer. Timing and
process-memory values are recorded for comparison but have no new performance
threshold; this plan removes data rather than introducing a performance claim.

## Completion boundary

The plan is complete when every `MX` acceptance row has current evidence, the
public type no longer admits non-module targets, real report projection contains
only module-to-module access data, the real browser shows only module nodes and
module dependency edges, and the ordinary analysis/check results for the same
fixture still contain the original external target facts.

## Deliberate deferrals

- A separate external-dependency inventory or package graph.
- Filters that optionally restore npm, builtin or unresolved targets.
- Changes to resolution, source checking, diagnostics or coverage policy.
- Suppressing a revision publication when an edit changes only omitted data.
- Replacing the compatibility model with a new general inspection API.

Those are separate product choices. This plan removes non-module imports from
the explorer contract rather than preserving dormant switches for them.
