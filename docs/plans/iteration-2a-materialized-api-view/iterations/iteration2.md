# Iteration 2: Generated-output isolation and harness ledger

**Plan:** [Plan 2A: Materialized API discovery](../main-plan.md).
**Prerequisites:** Iteration 1 contracts and bounds are frozen.
**Owners:** `analysis/project`, daemon watcher filtering, root/reference ignore
files and `scripts/reference-harness`. This iteration is independent of
iterations 3 and 4.

## Goal

Make final and transient materialization paths invisible to every application
input/revision boundary before any code can write them, and register the full
Plan 2A evidence ledger.

## Read first

- [Scope: generated-output isolation](../scope.md#generated-output-isolation)
  and [owner map](../owners.md#analysisproject).
- `subs/analysis/subs/project/src/inventory.ts`, capture/input-list/reference
  helpers, `observer.ts` and their nearest tests.
- `subs/daemon/src/filesystem-watcher.ts`, context watcher tests and Plan 5
  observer/sweep tests.
- Current reference harness runner, Plan 5 instance registration and
  [the 104 Plan 2A leaves](../subcases.md#required-leaves).

## Deliverables

1. Implement and expose the one canonical generated-path segment predicate for
   `.ramify`, `.ramify.tmp-*` and `.ramify.old-*`, with near-miss controls.
2. Apply it before inventory classification, explicit compiler selection,
   reference/exposure resolution, captured-input admission, observer/sweep
   processing and watcher debounce/counters.
3. Prove generated create/change/delete/rename/overflow events cannot change
   input ID, testing-area presence, context sequence or reconciliation count.
4. Add final/transient ignore rules to the toolkit and reference fixture. Do
   not add agent instructions yet because the command is not runnable.
5. Add `plan2a-instances.ts`, gate/runtime shells and parser support for the
   literal `--plan 2a`; register exactly all reviewed leaves as future work.
   Preserve Plan 1/2/5 records and meanings.
6. Add harness negative controls for missing records, duplicate IDs, failed or
   empty assertions and iteration prerequisite filtering.

## Matrix rows executed here

I2A-02: all twelve leaves. Other leaves remain `not-executed` with
`future-iteration`.

## Verification

Run focused project inventory/reference/capture/observer tests, daemon watcher
tests and Plan 2A harness-control tests. Run `npm run reference:verify -- --plan
2a --iteration 2` and require exactly iterations 1–2, with iteration 1 review
evidence and all twelve I2A-02 leaves accounted for. Confirm a real neighboring
source event remains visible, so filtering everything cannot pass.

## Exit criteria

All generated names are excluded at every listed boundary, near-miss paths stay
ordinary, no absent tests directory is created, and the 104-slot gate rejects
missing or false evidence.

## Handoff

The shared predicate and registered ledger go to projection/publication and
final acceptance. Iteration 5 waits for this iteration plus iterations 3–4.
