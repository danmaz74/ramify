# Iteration 12: Hook and session measurements

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** iteration 10 (`hook-cli`: the installed `--changed`
command and the compact reply); the S100, S500 and S1000 fixtures and the
probe results of iteration 1. May run in parallel with iteration 11, with its
own endpoint directories. **Owners:** the independent `scripts/measurements/`
scope; [scope.md](../scope.md#budgets)'s budget tables; the harness's
`fast-measure` capability.

## Goal

Add `npm run measure:fast`, measure the hook and session workloads with
retained raw results, and record the measured values beside the budgets:
session work per edit class, hook latency end to end in both watcher
positions, checked-set sizes, the 200-cycle plateau, hot and warm memory,
cold opens on four fixtures and the unchanged entry footprints.

## Read first

- [scope.md](../scope.md#budgets): Budgets in full, including which rows are
  binding from this iteration's exit and which stay advisory;
  [Session limits and budgets](../scope.md#session-limits-and-budgets);
  [Explicit deferrals](../scope.md#explicit-deferrals) with every trigger this
  iteration evaluates.
- Main plan: [Resolved decisions](../main-plan.md#resolved-decisions) 8; RP-6
  and RP-7 in the review-point table; matrix row I5-13;
  [Harness implementation and evidence](../main-plan.md#harness-implementation-and-evidence)
  item 5.
- [Memory lifecycle](../../../architecture/memory-lifecycle.md): Measurement
  and acceptance; Repeatable setup measurements; ML01 to ML04 and ML07.
- Plan 2 [iteration 13](../../done/iteration-2-resident-verification/iterations/iteration13.md)
  and its recipe: `scripts/measurements/{resident,common,repeated,archive,process-observer,identities}.mjs`,
  `materialize.ts` and `results/index.json`; the batch recipe in
  `scripts/measurements/README.md`.
- `probes.md` from iteration 1 and the
  [spike results](../../../../scripts/spikes/fast-check/RESULTS.md) as the
  starting values the budgets were set from.

## Deliverables

1. `scripts/measurements/fast.mjs` behind `npm run measure:fast`, reusing the
   Plan 2 observer, archive format and `index.json`: it starts a daemon per
   workload in a unique `RAMIFY_ENDPOINT_DIR`, drives it with the installed
   executable and `connectDaemon`, samples RSS, heap, retained fact bytes,
   history bytes, contexts, worker threads and compiler servers from outside
   at 50 ms, reads the daemon's own counters through `daemonStatus`, and stops
   the daemon in `finally`.
2. Workloads as recorded data: twenty cycles each of an unchanged-surface
   edit, an import or export edit, a description edit, a README edit, a
   created and a deleted owned file and a configuration or dependency change,
   on the reference, S100, S500 and S1000; hook end to end with the watcher
   already published and with the hook racing the watcher; the bare Node floor
   and the client cost with zero daemon work; checked sets for the
   unchanged-surface and export edits; 200 alternating cycles on the reference
   and S100; two hot and six warm S100 contexts; cold opens on all four
   fixtures; and Plan 2's entry footprint workloads on this build.
3. Assertions against the [budget tables](../scope.md#budgets): the reference
   and S100 hook rows are binding from this iteration's exit and a miss fails;
   the S500, S1000 and memory rows are recorded against their advisory
   targets. A missed binding target is answered by an owner fix or a reviewed
   budget revision with its reason, never by a relaxed assertion.
4. Deferral triggers evaluated and recorded: the proportional relink if the
   S500 or S1000 description budget is missed; resolution-bounded narrowing if
   the created-file budget on S100 is missed; the syntactic pre-filter if
   filtered extraction of one file exceeds 10 ms on S1000; persistent
   checkpoints if the S1000 cold open exceeds its budget; the child-process
   host if a worker limit cannot be enforced or a clone cost cannot be
   bounded. The filtered extraction cost is recorded even when its trigger
   does not fire.
5. `npm run measure:resident` amended for the session driver: the Plan 2
   workloads that asserted predicted stage reuse assert the revision's path
   instead, as [scope.md](../scope.md#plan-2-supersession) records for I2-29.
6. Archived raw results with dependency versions, fixture identities and the
   build identity, indexed beside Plan 1's and Plan 2's, and
   `scripts/measurements/README.md` documenting the fast recipe. Harness: the
   `fast-measure` capability with handlers that run the recipe and assert the
   archived values.

## Matrix rows executed here

- I5-13: `hook-latency-reference` and `hook-latency-s100` (binding medians
  with the process floor recorded); `hook-latency-s500` and
  `hook-latency-s1000` (recorded against advisory targets);
  `checked-set-bounded` (one file and zero accesses for an unchanged-surface
  edit; the file and its importers for an export edit); `repeated-edit-plateau`
  (200 cycles within the growth limits); `hot-warm-memory` (two hot and six
  warm S100 contexts); `cold-open` (four fixtures); `entry-footprints`
  (unchanged from Plan 2).

## Verification

```sh
npm run build && npm run type-check
npx tsx scripts/measurements/materialize.ts             # S100, S500 and S1000 fixtures
npm run measure:fast                                    # archives raw results and updates index.json
npm run measure:resident                                # Plan 2's recipe on the session driver
npm run reference:verify -- --plan 5 --iteration 12     # requires 2 to 10 and 12
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:self && node dist/src/cli-entry.js daemon stop
git diff --check
```

Evidence kind: `measurement` only, from separately instrumented real
processes; a quick or session run measures nothing. Each recipe owns its
endpoint directories and stops every daemon it started in `finally`. Expected
intermediate failures: the unfiltered `--plan 5` gate, and targets missed on
the first run, whose response is an owner fix or a recorded revision. Linux
evidence is established here and every value is recorded with its platform.

## Exit criteria

- Every I5-13 instance ran, the binding reference and S100 rows are met, and
  every advisory value is archived with its target.
- The recipe is reproducible from `npm run measure:fast` with checked-in
  generators and archived raw results.
- Every deferral trigger has a recorded outcome, and `measure:resident`
  reports revision paths instead of predicted stage reuse.

## Handoff

Iteration 13 records these values as the plan's final budgets, and Plans 3, 4
and 6 start from this recipe and these measured limits rather than from the
spike's numbers.
