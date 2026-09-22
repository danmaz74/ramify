# External-tool fake rollout

This spike replaces external tools in the slowest recorded lifecycle scenario,
`two consumers complete revision 1, a third revises it, and the follow-ups finish the run`.
Opus implemented the initial scripted version; review replaced its generic
commit responses with an explicit scenario script, including unchanged gates.

Git is an external system, like an LLM. Consumer tests mock what its service
reports in a given situation. A mock must not rebuild Git or inspect the
scenario's deterministic writes to discover what answer to return.

## Boundary and scope

- `subs/harness/subs/evidence/src/git.ts` exposes `GitService` and the real
  `gitService`. `RunServiceOptions.git` accepts a replacement. The same
  dependency reaches readiness, commits, changed-path queries and line metrics.
- `currentHead` now executes in the Git wrapper; its old gate-module export
  forwards to it for compatibility. Production defaults are unchanged.
- `contract-revision-scripted.test.ts` replaces the original slowest scenario;
  its 33 original assertion sites are unchanged. The other four cases remain
  in `contract-revision.test.ts`.
- The Git fixture declares 19 checkpoint responses: 11 commit IDs and eight
  unchanged results. It declares changed paths beside those responses and
  selects them when the deterministic agent script names a writing turn.
  It checks project roots, accepted revisions, recovery identities and script
  exhaustion. No filesystem scanning, snapshots, hashes, diffing or history
  simulation occurs in the mock.
- Ramify returns its existing unavailable result immediately. It does not
  execute the stub CLI or wait through materialization retries. Check execution
  and readiness use direct scripted results; readiness retains no audit identity.
- Scheduling, submission validation, write guards, source writes, durable
  records, gate classification and final source assertions remain real.
  Line measurements are explicitly unavailable rather than synthetic zeroes.
- A subprocess guard refuses calls through Node's named and default
  child-process exports. The test checks the count after the scenario and
  after cleanup. A separate fixture-free negative control exercises the guard.

The dependency is per service instance; there is no global Git module mock.
Other tests and real adapter witnesses retain their own dependencies.

## Group expensive tests by coherent scenario

When tests perform expensive operations, including scripted file writes,
group related assertions into one meaningful scenario and pay setup and
cleanup once. Do not split this lifecycle into an independent fixture for each
assertion. Do not share mutable fixtures across independently runnable tests.

The wrapper's real-Git suite is consolidated from 12 cases into four coherent
integration cases, with three repositories and one non-repository directory.
It verifies our command policy, response parsing, branch recovery, exact
trailer lookup, changed paths, accepted-revision queries and error handling.
It does not need a real repository per atomic assertion.

## Initial spike measurements

Baseline: an isolated one-worker run of the original scenario took **131.86 s**.
The reviewed scripted scenario took **1.04 s**, about **126 times faster** and
**99.2% less test time**. These are scenario-body timings, including its fixture
setup, from Vitest JSON; runner startup and afterEach cleanup are separate.
This is a single-scenario comparison, not a projected whole-suite speedup.

The original profile's 132.83 s figure was collected with four workers; it is
not the baseline used for this comparison. The copied baseline includes the
original worktree's dirty changes, not just commit `eef54d1`.

From this checkout's `ramify-agent/`:

```sh
./node_modules/.bin/vitest run subs/harness/src/tests/contract-revision-scripted.test.ts --maxWorkers=1
./node_modules/.bin/vitest run subs/harness/subs/evidence/src/tests/git.test.ts --maxWorkers=1
./node_modules/.bin/vitest run subs/harness/src/tests/external-boundaries.test.ts subs/harness/src/tests/accepted-boundary.test.ts --maxWorkers=1
./node_modules/.bin/vitest run subs/harness/src/tests/line-events.test.ts --maxWorkers=1
./node_modules/.bin/vitest run subs/harness/src/tests/readiness.test.ts --maxWorkers=1 -t 'dirty working tree|directory that is no git repository|passing attempt records'
./node_modules/.bin/vitest run subs/harness/src/tests/contract-revision.test.ts --maxWorkers=1
npm run type-check
npm run check:self
```

Evidence and the patch against the copied dirty baseline are in
`/tmp/ramify-boundary-spike-evidence/`. At the spike boundary the full suite
was deliberately unrun. Validation covered the scripted scenario and boundary
controls (five cases), Git adapter (four), line metrics (nine), selected
readiness cases (three), and the remaining revision cases (four, using the
focused rerun below). Type checks passed; `check:self` reported zero errors,
zero warnings and the same 87 analysis limits as the baseline. That was partial
static-analysis coverage; the completed rollout below supersedes it.

Moving the scenario initially removed a constant still used by one pure case.
The remaining-case run passed three cases and failed that case; the constant
was restored and both pure cases then passed in a focused rerun. Raw failures
and subsequent results are retained, rather than overwritten as passing runs.

The Git integration tests retain real subprocess costs; their grouped scenario
has an explicit 30-second timeout. The first grouped run hit Vitest's default
five-second timeout; the corrected run passed all four cases in 12.43 s overall.

## Completed rollout

The boundary is now applied across the ordinary harness lifecycle, recovery,
composition, contract, projection, progress-fixture and single-session tests.
Git, Ramify, readiness commands, gate commands and engineer shell commands are
injected where those systems are not the behavior under test. Sequential fakes
consume exact scripts and assert exhaustion; deliberately generic passing
fakes are separately named. Ordinary suites install a subprocess guard, and
`openRuns` requires every caller to choose a Git service explicitly instead of
silently falling back to production Git.

Real behavior remains in named complementary witnesses, including the Git and
command adapters, readiness and process cleanup, materialization, selected
test execution, passing and failing audit publication, module bootstrap,
single-session shell behavior, and run-to-Git commit recovery. The latter
crashes after a real commit, reopens through production Git, finds the commit
by its run and gate trailers and proves that recovery creates no duplicate.
Fake-backed lifecycle tests establish harness policy only; they do not establish
provider conformance or published audit acceptance.

The final four-worker profile from this checkout is:

| Measure | Baseline | Completed rollout | Change |
| --- | ---: | ---: | ---: |
| Test files | 101 | 112 | +11 |
| Tests | 809 | 806 | -3 |
| Passed / failed / skipped | 807 / 0 / 2 | 804 / 0 / 2 | — |
| Suite wall time | 686.42 s | 90.94 s | 86.8% lower (7.55x) |
| Sum of test-file durations | 2,606.60 s | 309.51 s | 88.1% lower (8.42x) |

The test count changed because setup-heavy atomic adapter cases were grouped
into coherent scenarios and real-boundary cases were split into explicitly
named integration files. The acceptance-matrix composition test verifies the
owning titles after those moves. This is a before/after profile of the evolving
worktree, not a claim that host load and test topology were controlled.

Final verification passed:

```sh
npm test -- --maxWorkers=4 --reporter=json \
  --outputFile=/tmp/ramify-agent-final-profile.json
npm run type-check
npm run check:self
git diff --check
```

The result was 112 files, 806 tests, 804 passing, zero failing and two skipped.
`check:self` completed with zero errors, zero warnings and 87 declared analysis
limits. The modified parent-project daemon test also passed separately.
