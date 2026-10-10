# Iteration 1: consultation targets and durable records

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

R33-1 is resolved: include capability-assigned engineers. Use an isolated checkout with its
actual branch/commit recorded; preserve unrelated edits. No prerequisite
implementation from proposed Plans 27/29/31/32.

Owner: harness. Write boundary: dispatch metadata in `run/log.ts` and
`run/service.ts`, consultation records under a small `consultations/` directory,
step input schemas/construction/derivation, focused tests. Reuse existing
`iteration-assigned.architectRef` and `capability-assigned.architectRef`; do not
create another assignment-point store.

## Goal

Every supported new invocation knows the exact architect point it can consult,
and the logs can represent a consultation from start through observed outcome.
No tool is dispatched yet.

## Read first

- [Analysis](../../../analysis/2026-10-10-consult-architect.md) and main contract.
- `subs/harness/src/run/log.ts`: work dispatch and assignment events.
- `subs/harness/src/run/after-handling.ts`: `recordAssignment`.
- `subs/harness/src/architecture/context.ts` and `run/service.ts` work dispatch.
- `subs/harness/src/steps/inputs.ts`, `engineer.ts`, `local-architect.ts`,
  `from-run.ts`, `manual.ts`, and existing step-input tests.
- [Testing rules](../../../testing.spec.md).

Paths above are project-relative. Inspect other files only to resolve these changes.

## Deliverables

- A minimal serializable consultation target value. Local target comes from the
  assignment's existing `architectRef`; global target is recorded once for each
  real work dispatch and reused on recovery/continuation.
- Capability assignments use their own `architectRef`, actual capability role
  and task identity, including nested tasks. Do not substitute the consumer's
  local architect or attach an implicit upward target. No new global capture is
  needed for capability consultation.
- Optional backward-compatible event/input fields. Older absent/null targets
  remain absent; no retroactive latest-head inference. Global context may be a
  model-free append point, not necessarily an invocation end.
- New assignment uses its own local reference; same-assignment repair/handback
  keeps the original. A new local dispatch after yield captures a new global
  point; merely recovering a process does not.
- Same-run manual assignment derivation carries available local context.
  Cross-run import and standalone authorship clear executable targets while
  retaining provenance and a useful reason. Constructors can render availability
  without an agent call; actual tool activation is iteration 2.
- Consultation start/outcome representation keyed by caller invocation/tool call,
  parent link for nesting, exact source and child references, answer/delivery
  distinction and incomplete state. Reuse ledger transactions and transcript
  content references. No generic supervisor registry or new lifecycle engine.

## Cases and verification

Own C01–C04. Use small in-memory session histories G0→G1 and L0→L1,
local and capability assignments with repair/handback (including a nested task),
a yielded/resumed work item, legacy records and
same-run/cross-run manual inputs. Tests exercise actual derivation and recovery,
not just schema snapshots.

From `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/consultation-targets.test.ts subs/harness/src/tests/consultation-records.test.ts subs/harness/src/tests/steps-from-run.test.ts subs/harness/src/tests/steps-authored.test.ts
npm run type-check
npm run check:self
```

No expected failing committed tests. Tool execution and inspection remain pending
later iterations and must not be described as passing.

## Exit and handoff

C01–C04 pass; legacy logs/inputs remain readable. Commit and write
`01-results.md` with source, resolved R33-1, record/field locations, commands,
outcomes and the target values/record helpers iteration 2 consumes.

