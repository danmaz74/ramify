# Iteration 2: New owner skeletons, harness `--plan 2` and synthetic generators

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iteration 1's accepted package; its draft inventory is
enough to start. Implemented capability: Plan 1's `harness-gate` under
`--plan 1`. **Owners touched:** `subs/daemon/` and
`subs/daemon/subs/contexts/` as header-only owners; root's `src/tests/`
tracing helpers; the independent `scripts/reference-harness/`,
`scripts/probes/fixtures/` and `scripts/measurements/` scopes.

## Goal

Make the eleven-owner tree real with two empty owners, register every I2
instance as not executed under `--plan 2` with Plan 2's prerequisite map, give
the later `ipc` and `process` instances a tracing helper that records socket
activity, and parameterize the synthetic owner generator so the 100, 500 and
1,000-owner fixtures exist before iterations 8, 11 and 13 consume them. After
this iteration nothing in Plan 2 is green by omission.

## Read first

- Main plan: Implementation ownership, Declaration stages, Harness
  implementation and evidence, Iteration sequence.
- [owners.md](../owners.md): The eleven-owner tree, Daemon, Contexts and the
  iteration 2 row of the Activation manifest.
- [subcases.md](../subcases.md): Membership and intermediate gates, Fixture
  and evidence conventions, Instance counts by iteration.
- [Reference harness README](../../../../scripts/reference-harness/README.md)
  and `scripts/reference-harness/{instances,plan,plan1-instances,verify,runtime,gate-cases}.ts`;
  the I1-30 harness-discipline handlers are the pattern for I2-28.
- `src/tests/process.ts`, `src/tests/process-probe.mjs`,
  `scripts/probes/fixtures/hundred-owners.ts` and
  `scripts/measurements/materialize.ts` as they are today.
- [Harness plan](../../reference-project/harness.md): Separate execution from
  semantic readiness.

## Deliverables

1. Owners: `subs/daemon/module.ramify` reading `ramify 1` and
   `module daemon tagged [dispatch]`; `subs/daemon/subs/contexts/module.ramify`
   reading `ramify 1` and `module contexts`; each with the README first
   paragraph from owners.md verbatim and empty `src/` and `src/tests/`
   directories (`.gitkeep`). No exposure statement and no source file.
   `npm run check:self` reports eleven owners with no findings or limits.
2. Instance records: `scripts/reference-harness/plan2-instances.ts`
   transcribing all 176 leaves of subcases.md with id, iteration, families,
   capability, fixture code, evidence kind, mutation and expectation.
   `instances.ts` adds fixture codes `Q`, `P`, `S100`, `S500` and `S1000` and
   an evidence-kind field (`api`, `unit`, `quick`, `ipc`, `process`,
   `measurement`); `M` and `H` keep their letters with Plan 2 recipes recorded
   per instance and stay non-disk. The capability vocabulary gains
   `increment`, `contexts`, `daemon-service`, `ipc`, `client`,
   `daemon-process`, `lifecycle`, `equivalence`, `resident-measure` and
   `completion`. The Plan 2 runtime keeps its own availability set, initially
   empty: Plan 1's registered `cli` and `harness-gate` never satisfy a Plan 2
   instance.
3. `plan.ts`: a Plan 2 reader over `docs/plans/iteration-2-resident-verification/{main-plan,subcases}.md`
   that validates 176 leaves, 30 matrix groups, the fourteen-row sequence
   table by index and title, and the prerequisite map
   `{2:[1], 3:[2], 4:[3], 5:[4], 6:[5], 7:[5], 8:[7], 9:[6,8], 10:[9], 11:[10], 12:[10], 13:[10], 14:[11,12,13]}`.
   Iterations 1 and 7 own no instance: 1 is satisfied by the accepted package
   and 7 by its owner tests. Plan 1's reader, records and `--plan 1` behavior
   are untouched.
4. `verify.ts`: `--plan 2` accepted; `--iteration <n>` requires n and its
   transitive prerequisites and lists every other instance as not executed,
   titled as Plan 2 iteration verification; the unfiltered `--plan 2` requires
   all 176 and fails until iteration 14. `npm run reference:report` gains the
   Plan 2 capability inventory; `npm run reference:cases` validates both
   plans' records and pointers.
5. I2-28 handlers over fixture `H`: membership count against this document,
   removed-record failure, injected-failing-assertion failure, and the
   `--iteration` filter for 5 (exactly iterations 2 to 5) and 9 (iterations 2
   to 9, with 7 contributing no instance).
6. Tracing: `src/tests/process-probe.mjs` records `connect` to a socket path,
   Unix-socket `listen`, `spawn`, `exit` and loaded modules for any entry;
   `src/tests/process.ts` adds a traced-process helper beside `cliProcess`
   that takes an entry path, argv and environment including
   `RAMIFY_ENDPOINT_DIR`. Plan 1's process tests keep their behavior.
7. Generator: `scripts/probes/fixtures/synthetic-owners.ts` parameterized by
   owner count, with a test asserting that its 100-owner output is
   byte-identical to the frozen `hundred-owners.ts` map; S100, S500 and S1000
   materialize through `scripts/measurements/materialize.ts` into ignored
   directories, never checked in. Iteration 13 adds only the measurement
   recipe over these fixtures.

## Matrix rows executed here

- I2-28: `required-membership` (every leaf registered; count 176);
  `removed-record-fails` (gate and iteration commands fail);
  `failing-assertion-fails` (both fail; the report retains the failure);
  `iteration-filter` (`--iteration 5` requires 2, 3, 4 and 5; `--iteration 9`
  requires 2 to 9 with 7 contributing none; the rest `not-executed`).

## Verification

```sh
npm run build && npm run type-check && npm test
npm run check:self                                   # eleven owners, no findings
npm run reference:cases
npm run reference:report -- --dry-run
npm run reference:verify -- --plan 2                 # must fail: only harness-gate available
npm run reference:verify -- --plan 2 --iteration 2   # passes with the four I2-28 instances
npm run reference:verify -- --plan 1 --iteration 2   # Plan 1 discipline unchanged
git diff --check
```

Evidence kind: unit over `H`; no quick, ipc or process evidence exists yet.
The traced-process helper is proven by its own test against a script that
listens on and connects to a temporary socket.

## Exit criteria

- Eleven owners are declared and the self-check accepts them; the two new
  owners contain no source.
- Every I2 instance has a record and reports not executed; a missing
  capability, removed record, unrun or failed assertion fails both the gate
  and the iteration command, proven by I2-28.
- The prerequisite map validates against the main plan's table.
- The generator's 100-owner output is byte-identical to the frozen map; S500
  and S1000 materialize.

## Handoff

Iterations 3 to 14 register capabilities and handlers in the Plan 2 runtime;
`--iteration <n>` is their intermediate gate. The traced-process helper is the
base for every `ipc` and `process` instance; the generator supplies S100 to
iterations 8 and 11 and S100, S500 and S1000 to iteration 13.
