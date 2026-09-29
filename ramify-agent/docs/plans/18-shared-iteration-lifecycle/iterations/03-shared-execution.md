# Iteration 3: one engineer executor with usable API views

[Plan 18](../main-plan.md) · [Provider contract](../provider-contract.md) ·
[Acceptance](../acceptance.md)

## Prerequisites and owners

Iterations 1–2. Harness owns dispatch, preparation, gates and repair; use the
audit child's established access contract. Toolkit materialization is consumed
through its existing public CLI boundary.

## Goal and read first

Read assignCapabilityWork, takeIteration, iterationViews, iterationMessage,
work/session.ts apiViewsOf/iterationApiViews, engineer equipment/validation,
checks/checkpoint.ts, checks/gate.ts and capability fixture helpers.

## Deliverables

- Build full common assignments from both architect actions and run them through
  the ordinary executor. Delete the duplicate capability invocation,
  reconstruction and provisional-settlement loop.
- Reuse selected requirement delivery, source-area onboarding, scenario briefing,
  scope enforcement, measurement, bounds and all normal engineer tools.
- Explicitly fix missing API views: invoke the common materialization and briefing
  before every fresh, continued or reconstructed engineer invocation. Derive
  selected modules from the same common assignment scope, including supported
  child/multi-module selections.
- For each existing ordinary/testing source area, materialize its distinct
  generated view, verify that its metadata is readable and name its actual path
  and coverage in the briefing. Preserve the generated revision through shared
  view records/briefing instead of dropping it. An absent source area is distinct
  from an existing area whose generated view is missing.
- Refresh after a source/API change. Preserve failed/partial materialization
  reasons and qualification; old files remaining on disk must never be described
  as current after an unsuccessful refresh. A successful result missing an
  expected area's metadata is an explicit preparation gap, not silent omission.
  Keep the same handling policy for both coordinators.
- Scope.resolved.view remains architect-view provenance for scope resolution.
  It cannot certify API materialization. Never synthesize or edit generated
  catalogs and never merge ordinary and testing discovery.
- A completion proposal runs the ordinary kind-derived gate/commit/repair path
  and records its actual result/reviews. Keep capability-needed suspension and
  read-only consultation equipment changes.
- Delete scopeProbe planning/execution, outsideAssignment, and path/count-based
  repair-owner inference, including automatic escalation of Ramify diagnostics.
  Retain actual unauthorized-write checks and writer settlement.
- Deliver iteration failure evidence to the same engineer for normal repair.
  Explicit agent needs/partial outcomes, architectural decisions and ordinary
  exhausted-attempt handling return control to the issuing architect. No new
  triage agent or capability-only failure path is introduced.
- Consume composition.verdict directly. Failure or indeterminate composition
  blocks acceptance even with run-local pass; missing fields remain unavailable.

## Verification and exit criteria

SI01–SI07, SI09, SI16–SI18; AE01–AE04 and AE07–AE13 as applicable.
Use real fixture files, guarded writes, Git commits and scripted agents, plus
real toolkit materialization for the API-view regression.

Start without generated Analysis/Model views, while the requesting CLI has its
view. Before the first scripted engineer request assert applicable _meta.json,
correct source-area paths and a known importable symbol's searchable contents.
Also cover no generated views at all, selected children, multi-module scope,
provider API changes, same-session repair and lost-session reconstruction.
A file-existence assertion or fake materialize success alone is insufficient.

Inject failed/partial refresh with old files present and missing expected-area
metadata; require explicit limitations and independent expected outcomes.
For repair, include a root test fixed in Analysis and an in-scope test needing
another owner. Neither test location chooses the next engineer.

Exit: capability completion proposals enter real ordinary iteration gates;
each engineer has usable current API evidence or an honest ordinary limitation,
and audit results reach the repairing agent without probe reruns.

## Handoff

Record the deleted loop/heuristics, before/after engineer briefs, source/view
identities and executed cases in iteration3-results.md. Do not mark task
handback accepted until the shared completion work is verified.
