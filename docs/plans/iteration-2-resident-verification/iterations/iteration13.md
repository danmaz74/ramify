# Iteration 13: Resident measurements and budgets

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iteration 10 (the completed package; `cli`,
`daemon-process`, `client`); the S100, S500 and S1000 fixtures from
iteration 2; iteration 1's probe floor and the targets binding since its
exit. May run in parallel with iterations 11 and 12. **Owners:** the
independent `scripts/measurements/` scope; `scope.md`'s budget tables; the
harness's `resident-measure` capability.

## Goal

Add `npm run measure:resident`, measure the resident workloads the roadmap
assigns to Plan 2 with retained raw results, and record the measured values
beside the binding budgets in scope.md: entry footprints, cold and warm
cycles by edit class on the reference and 100 owners, the 200-cycle plateau,
eight warm contexts, the slow consumer, the 500 and 1,000-owner fixtures and
publication peaks.

## Read first

- [scope.md](../scope.md): Budgets in full, especially the binding-moment
  paragraph, Latency and memory targets and Resident measurement recipe;
  Explicit deferrals (the compiler-state trigger).
- [Memory lifecycle](../../../architecture/memory-lifecycle.md): Measurement
  and acceptance; Repeatable setup measurements; ML01 to ML04, ML06, ML07.
- Main plan: Resolved decision 6; RP-2 and RP-7; matrix row I2-29; harness
  point 6.
- Plan 1's [batch measurements and agreed budgets](../../done/iteration-1-project-verifier/iterations/iteration15-results.md#batch-measurements-and-agreed-budgets)
  and the [batch recipe](../../../../scripts/measurements/README.md);
  `scripts/measurements/{run,common,repeated,session-setup}.mjs`,
  `materialize.ts` and `results/index.json`.
- Iteration 1's `probes.md`: the warm-recompute floor.

## Deliverables

1. `scripts/measurements/resident.mjs` behind `npm run measure:resident`,
   reusing the batch observer, archive format and `index.json`: it starts a
   daemon per workload in a unique `RAMIFY_ENDPOINT_DIR`, drives it with the
   installed executable and `connectDaemon`, samples RSS, heap, external,
   history and product bytes, contexts and helper counts from outside at
   50 ms, reads the daemon's own counters through `daemonStatus`, and stops
   the daemon in `finally`. The generator and fixtures come from iteration 2;
   nothing is generated here.
2. Workloads as recorded data: idle CLI help, `./client` import, daemon with
   zero contexts, daemon with one warm reference context, CLI check client;
   cold start then twenty cycles each of unchanged, README, exposure, source
   and configuration edits on the reference and S100; 200 alternating
   source-edit and revert cycles; eight warm S100 contexts; a non-reading
   subscriber during ten S100 publications; cold and one source edit on S500
   and S1000; publication peaks on the reference and S100.
3. Archived raw results with dependency versions, fixture identities and the
   build identity, indexed beside Plan 1's; `scripts/measurements/README.md`
   documents the resident recipe.
4. Budget outcome: every binding value in scope.md gains its measured value;
   a missed target is recorded as a reviewed revision with its reason, never
   a relaxed assertion. A missed source-edit target with stage reuse in place
   is recorded as the compiler-state deferral trigger; no long-lived helper
   is added here.
5. Harness: capability `resident-measure`; handlers that run the recipe and
   assert the archived values against the budget tables.

## Matrix rows executed here

- I2-29: `entry-footprints` (each entry's RSS within its row; raw recorded);
  `cold-warm-broad-reference` (medians within targets; `reused` stages as the
  model predicts); `cold-warm-broad-hundred` (same on S100);
  `repeated-edit-plateau` (last-100 growth within limits; counters balanced;
  history at budget); `many-contexts` (settled RSS and global retained bytes
  within budget); `slow-consumer` (queue bound, disconnect timing and RSS
  recovery within targets); `synthetic-500` and `synthetic-1000` (within the
  ceilings or a reviewed revision); `publication-peak` (combined peaks within
  the batch-derived limits).

## Verification

```sh
npm run build && npm run type-check
npm run measure:resident                             # archives raw results and updates index.json; owns its endpoint directories
npm run reference:verify -- --plan 2 --iteration 13  # requires 2 to 10 and 13
git diff --check
```

Evidence kind: `measurement` only, from separately instrumented real
processes; a quick run measures nothing. Expected intermediate failures are
targets missed on the first run; the response is a recorded revision through
review or an owner fix, never a relaxed assertion. Linux evidence is
established here; the values are recorded with the platform.

## Exit criteria

- Every listed instance ran and its archived values are within the budgets
  scope.md records, each now carrying its measured value.
- The measurement recipe is reproducible from the documented command with
  checked-in generators and archived raw results.
- The compiler-state deferral has a recorded trigger outcome.

## Handoff

Iteration 14 records the final budgets, entry footprints and per-platform
values in the completion report; Plans 3 to 6 start from these measured
limits and this recipe.
