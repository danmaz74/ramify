# Iteration 5: recovery and remaining external consumers

**Plan:** [Plan 22](../main-plan.md). **Prerequisites:** iteration 4 and iteration
0's remaining-consumer list. **Owners:** selected ordinary test owners, delivering
project-wide no-process test compatibility; work one owner at a time.

## Goal

Ordinary tests outside the capability/recovery slice cannot invoke Git or cold
Ramify commands indirectly through fixtures or child-provider defaults.

## Read first

[Ordinary boundary contract](../contracts.md#1-the-ordinary-test-boundary),
iteration 0 inventory and owner API views. Initial leads include
`capability-recovery.test.ts`, `nonfunctional-recovery.test.ts`,
`capability-{assignments,delegation,submission,consultation}.test.ts`,
`nonfunctional-{run,repair,deviation-runtime}`, `readiness`, `measurement`,
`hook-checks`, `late-writes`, `writer-settlement`, review/session/iteration
integration tests, and root/evidence/audit/agent/web selected files.

## Deliverables

Trace and migrate the exact remaining ordinary cases identified in iteration 0.
Start with capability recovery (reported 277 s), then nonfunctional recovery
(217 s), capability assignments (111 s) and delegation (95 s), unless the
post-cleanup/focused profile identifies a different remaining critical path.
Deliver and measure one family at a time; faster files do not block those
deliveries. Preserve every durable-boundary table with explicit successive
source/audit responses and exactly-once completed effects. Preserve read-only
consultation, inherited assignment scopes, protocol rejection bounds and
continuations. Split actual source-capture/process assertions into boundary
witnesses rather than turning their requirements into canned success.
Script Git and candidate facts, materialize/measure/affected outputs and audit
results through existing boundaries; preserve real behavior under test.
Split cases requiring actual process/provider behavior into focused boundary
files. Retain actual CLI/generated-view, public-audit, source snapshot and writer
cleanup claims in their owners. Prefer an existing adequate witness to adding
another full workflow. Classify opt-in/live tests truthfully. Extend root-facing
testing helpers through declared exposure rather than importing foreign internals.
Do not move tests solely by filename or exempt a whole provider owner.

## Matrix rows executed here

TB07, TB08's remaining scope cases, TB10 and TB12; F1–F5 as assigned in the case map.

## Verification

Run focused exact paths owner by owner, with the process guard installed for
ordinary cases; run each retained boundary witness at its actual boundary.
Require zero ordinary attempts and completed required scripts. Re-list the
actual runner files and update migration coverage. Run type-check/check:self
for changed helper contracts or exposure. A search alone is not zero-call proof.

## Exit criteria

Every configured case is ready for ordinary guarding or has a concrete retained
boundary destination; no unclassified real call, missing requirement or broad
owner exemption remains.

## Handoff

`iteration5-results.md`, final proposed exact boundary paths/reasons, complete
case map, remaining actual CLI command inventory and focused results.
