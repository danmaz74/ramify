# Iteration 1: Contract package, probes and review points

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** none within this plan. Plan 2 is complete and merged on
`main`: the resident daemon, the contexts manager, the lightweight client, the
installed `check`, `watch` and `daemon` commands, `npm run check:self` over
eleven owners, and the 176-instance `--plan 2` gate beside Plan 1's
308-instance gate. **Owners:** none; this iteration reviews documents and runs
executable probes only.

## Goal

Turn the draft review package into the accepted contract that iterations 2 to
13 implement, settle the open review points, and measure with five probes the
five behaviors the package assumes: snapshot update costs, per-file
description closure sizes, the interpreter's setup cost, a session in a worker
thread with `resourceLimits`, and whether the compiler's own filesystem
callbacks reproduce a batch capture's input set. No owner source, harness code
or daemon code is written here.

## Read first

- Main plan in full, especially [Resolved decisions](../main-plan.md#resolved-decisions),
  [Required behavior and diagnostics](../main-plan.md#required-behavior-and-diagnostics),
  [Iteration sequence](../main-plan.md#iteration-sequence) with its
  [Probes](../main-plan.md#probes) table, and
  [Risks and decisions to settle early](../main-plan.md#risks-and-decisions-to-settle-early)
  with its review-point table.
- [contracts.md](../contracts.md), [owners.md](../owners.md),
  [scope.md](../scope.md) and [subcases.md](../subcases.md) in full; they are
  the objects of this review.
- [Daemon and analysis](../../../architecture/daemon.md): Incremental updates
  and analysis depth; Fast incremental checks; Context identity and retained
  state; Decisions still requiring review.
- [Memory lifecycle](../../../architecture/memory-lifecycle.md): State
  ownership and bounds; Measurement and acceptance.
  [Processes and clients](../../../architecture/processes-and-clients.md): CLI
  commands; Launch, compatibility and shutdown.
  [Quick testing](../../../architecture/quick-testing.spec.md): Real flows
  with direct adapters.
- Plan 2's [iteration 1](../../done/iteration-2-resident-verification/iterations/iteration1.md)
  and its [probe record](../../done/iteration-2-resident-verification/probes.md)
  as the pattern for probe scripts and archived results, and Plan 2's
  [completion report](../../done/iteration-2-resident-verification/iterations/iteration14-results.md)
  for the implemented contracts this plan revises.
- The [spike results](../../../../scripts/spikes/fast-check/RESULTS.md) and the
  existing `scripts/probes/fast-check/README.md`, which records what the
  throwaway measurements do and do not establish.
- [Module-description specification](../../../model/module-description.spec.md)
  for the manual review of the six declaration lines this plan adds and the
  one it removes.

## Deliverables

1. Review outcome recorded in the four package documents
   ([contracts.md](../contracts.md), [owners.md](../owners.md),
   [scope.md](../scope.md), [subcases.md](../subcases.md)): each status line
   advanced from draft to accepted, or the revised text with its revision
   noted. A signature, wire schema, declaration line or activation stage
   changed during review lands in the package here, before any consumer
   exists.
2. RP-2 to RP-7 each recorded with the chosen alternative in the main plan's
   review-point table, with the recommendations as the proposal: RP-2 the
   worker thread with the child process as the fallback behind the same
   contract, RP-3 dependency-driven recomputation over the closure, RP-4 the
   Plan 2 supersession by amendment, RP-5 observing the compiler's reads so
   the session's `inputId` equals a batch capture's, RP-6 the hook targets on
   the reference and S100 binding from iteration 12's exit, RP-7 two hot
   contexts and a 30 s sweep. RP-4 and RP-6 need the user's acceptance and are
   not settled by this iteration alone. RP-1 is already decided in the draft
   and is confirmed, not reopened.
3. Probe scripts under `scripts/probes/fast-check/`, beside the existing
   throwaway probes and in the scripts scope selected by
   `tsconfig.scripts.json`: `snapshot-update-costs.mjs` (P5-1),
   `description-closure.mjs` (P5-2), `interpreter-setup.mjs` (P5-3),
   `worker-session.mjs` (P5-4) and `observed-reads.mjs` (P5-5). Each takes a
   project root or a saved batch report as the existing fast-check probes do,
   and each archives a JSON result under `scripts/probes/results/` beside the
   Plan 1 and Plan 2 results: `snapshot-update-costs.json`,
   `description-closure.json`, `interpreter-setup.json`,
   `worker-session.json` and `observed-reads.json`. The main plan's probe
   table fixes what each must establish.
4. `probes.md` beside this plan recording each probe's command, host, Node and
   `typescript@7.0.2` versions, fixture identities, result file and the
   decision it informs. Linux results are required now; macOS results are
   added when a macOS run exists.
5. The [budget tables](../scope.md#budgets) and the
   [session limits](../scope.md#session-limits-and-budgets) revised once from
   the probe results, as decision 8 requires. From this iteration's exit the
   reference and S100 hook rows are the binding targets iteration 12 asserts,
   and the S500, S1000 and memory rows stay advisory.
6. The scheduling decisions confirmed or revised in the same table: iterations
   3 and 4 may run in parallel after iteration 2; iterations 11 and 12 may run
   in parallel after iteration 10; iteration 4 depends only on iteration 2
   because the observer uses no compiler change; iteration 5 needs the
   descriptions of iteration 3 and the observation sink of iteration 4;
   iteration 6 needs both the observer and the adapter; iteration 9 is the
   only iteration that deletes Plan 2 source and lands the supersession
   amendment in the same commit. A different decision revises iterations 3, 4,
   5, 6, 9, 11 and 12 before they start.

## Matrix rows executed here

None. This iteration produces no executable acceptance evidence, and the
`--plan 5` selector does not exist until iteration 2 registers the inventory.

## Verification

```sh
npm run type-check                                              # the probes compile in the scripts scope
npm run build
node dist/src/cli-entry.js check --root examples/collection-review --batch --format json > /tmp/reference.json
node dist/src/cli-entry.js check --root . --batch --format json > /tmp/toolkit.json
node scripts/probes/fast-check/snapshot-update-costs.mjs /tmp/reference.json
node scripts/probes/fast-check/description-closure.mjs /tmp/reference.json /tmp/toolkit.json
node scripts/probes/fast-check/interpreter-setup.mjs
node scripts/probes/fast-check/worker-session.mjs
node scripts/probes/fast-check/observed-reads.mjs /tmp/reference.json
ls scripts/probes/results/{snapshot-update-costs,description-closure,interpreter-setup,worker-session,observed-reads}.json
git diff --check
```

The S100 and S1000 fixtures the probes need are materialized by
`npx tsx scripts/measurements/materialize.ts`, unchanged from Plan 2. By hand:
every exposure line and foreign type in [owners.md](../owners.md) against the
description principles' review checklist; every contract in
[contracts.md](../contracts.md) against the main plan's proposed-contract
table; the 103 rows of [subcases.md](../subcases.md) against the acceptance
matrix and the per-iteration counts. No api, session, quick, unit, ipc,
process or measurement acceptance evidence exists yet, and presenting the
package does not approve an unresolved contract change.

## Exit criteria

- The four documents carry an accepted status or a recorded revision, and
  RP-2 to RP-7 and the confirmation of RP-1 each have a recorded entry, with
  the user's acceptance recorded for RP-4 and RP-6.
- Five probe results are archived under the named files, `probes.md` cites
  them, and the budget tables name their measured starting values.
- The six added declaration lines, the removed increment line and the revised
  relay lists pass the manual description review.
- Accepted before iteration 2 starts; a later change to any signature,
  schema, declaration or budget revises this package first.

## Handoff

Iterations 2 to 13 implement exactly these signatures, wire schemas,
declarations, budgets and activation stages. P5-1 and P5-3 feed the source and
broad budget rows iteration 12 asserts; P5-2 feeds the catalog work of
iteration 3; P5-4 fixes the worker limits of iteration 8; P5-5 establishes the
observed-read equality iterations 4 and 5 assert.
