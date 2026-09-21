# Iteration 10: Process evidence and query measurements

**Plan:** [Plan 3: Project inspection](../main-plan.md).
**Prerequisites:** iteration 9 (the join with Plan 5). If the join is still
pending because Plan 5 has not merged, this iteration runs on the Plan 2
build: the process instances and the published-answer latency rows are
measured without resident details, `latency-batch-details` is measured on the
batch path, and the I3-12 instances stay pending. **Owners:** integration
evidence and the measurement tooling under `scripts/`; no owner source
changes here except defects this iteration finds.

## Goal

Prove the three commands through the real socket, the compiled daemon and the
installed executable, and measure the query budgets on the reference project
and the scale fixtures with raw results archived beside Plan 1's and Plan 2's.

## Read first

- Main plan: [Harness implementation and evidence](../main-plan.md#harness-implementation-and-evidence)
  items 2, 4 and 6; the command table at the end of that section; matrix row
  I3-13; [Exits](../main-plan.md#exits).
- [scope.md](../scope.md#budgets): the budget table with the binding and
  advisory rows, and [Limits](../scope.md#limits).
- [owners.md](../owners.md): Placement outside every owner, for the scripts
  this iteration adds.
- [subcases.md](../subcases.md): the I3-13 rows with their fixtures and
  recorded values.
- `probes.md`: P3-1's and P3-4's measured starting values, which the budgets
  were revised from and which these measurements must be compared against.
- [Memory lifecycle](../../../architecture/memory-lifecycle.md): Measurement
  and acceptance; Repeatable setup measurements. [Daemon and analysis](../../../architecture/daemon.md):
  Acceptance evidence, DA17. [Quick testing](../../../architecture/quick-testing.spec.md):
  Complementary verification, QT05.
  [Processes and clients](../../../architecture/processes-and-clients.md):
  Launch, compatibility and shutdown; PC03.
- Source: `scripts/measurements/{run.mjs,resident.mjs,common.mjs,identities.mjs,archive.mjs,repeated.mjs,materialize.ts,README.md}`
  and `scripts/measurements/results/`; `scripts/reference-harness/{processes.ts,process-cases.ts,measurement-cases.ts,plan3-instances.ts}`;
  `src/tests/{process.ts,cli-process.test.ts}`.
- Plan 2's [scope](../../done/iteration-2-resident-verification/scope.md) for
  the context and memory budgets the daemon heap row is compared against.

## Deliverables

1. `scripts/measurements/inspect.mjs` and the `measure:inspect` script in
   `package.json`, beside `measure:resident`, running the recipe: a warm
   daemon on each fixture, repeated `available` answers at each detail level,
   a batch answer with details, the largest listing on S1000, and a
   forty-answer heap plateau run on the reference project. It reuses
   `common.mjs`, `identities.mjs`, `repeated.mjs` and `archive.mjs`, sets its
   own `RAMIFY_ENDPOINT_DIR` and stops the daemon it started in `finally`.
2. Raw results archived under `scripts/measurements/results/` with fixture and
   build identities, host, Node and `typescript@7.0.2` versions, the recipe
   name and the sample count, following the Plan 2 result files' shape.
3. Assertions of the recorded values against the budget table: the
   published-answer latency on the reference project and S100 and the report
   growth with details are binding and fail the instance when exceeded; the
   S1000 latency, the batch detail cost, the per-original description cost and
   the largest listing are recorded and compared without failing; the daemon
   heap plateau is asserted against Plan 2's context budget.
4. Process evidence in `scripts/reference-harness/inspect-process-cases.ts`:
   `available` on the reference project, `explain` on the toolkit and
   `inspect --usage`, each spawning the compiled daemon and the installed
   executable from a module's `src/` under a unique endpoint directory,
   asserting standard output, standard error and the exit, and stopping the
   daemon in `finally`. A quick or ipc run does not satisfy these instances.
5. The `inspect-measure` capability registered as available and executed in
   the `--plan 3` inventory, with the measurement instances reading the
   archived raw results rather than remeasuring inside the gate.
6. A recorded macOS run of the process instances before acceptance, as the
   plan's platform section requires; the Linux run is the default evidence and
   the macOS run is archived beside it.
7. Defects this iteration finds in the commands, the service or the renderer
   are fixed in their owning iteration's files and re-verified there; no
   budget is relaxed to make a measurement pass without an explicit plan
   revision.

## Matrix rows executed here

- I3-13: `process-available-reference`, `process-explain-toolkit`,
  `process-inspect-usage`, `latency-published-reference`,
  `latency-published-s100`, `latency-batch-details`, `listing-size-s1000`,
  `memory-details-bounded`.

## Verification

```sh
npm run build && npm run type-check
npx tsx scripts/measurements/materialize.ts                 # S100, S500 and S1000
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run measure:inspect
ls scripts/measurements/results/                            # the archived raw results of this run
npm run reference:verify -- --plan 3 --iteration 10          # requires 2 to 10
npm run reference:verify -- --plan 1 && npm run reference:verify -- --plan 2
npm run reference:verify -- --plan 5                         # once Plan 5 has merged
npm test
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kinds: `process` for the three command instances and `measurement`
for the five recorded rows; neither is satisfied by an `api` or `quick` run.
Expected intermediate failures: the unfiltered `--plan 3` gate, which still
requires the `completion` capability, and the I3-12 instances when the join is
pending. A measurement that cannot be reproduced from the archived raw results
does not satisfy its instance.

## Exit criteria

- The three commands run through the compiled daemon and the installed
  executable from a module's `src/` on both fixtures, with the documented
  output and exits, on Linux and macOS.
- `npm run measure:inspect` exists, runs the recipe and archives raw results
  with fixture and build identities.
- The binding budget rows are met on the reference project and S100, and the
  advisory rows are recorded with their measured values.
- Every I3-13 instance ran and asserted its own expectation, and the daemon
  each run started was stopped.

## Handoff

Iteration 11 cites these archived results in the completion report, records
the measured budgets in the revised architecture documents, and runs the
unfiltered `--plan 3` gate that this iteration leaves failing only on the
`completion` capability.
