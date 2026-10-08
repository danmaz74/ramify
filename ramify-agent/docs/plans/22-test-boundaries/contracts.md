# Plan 22 contracts

**Status:** proposed implementation contract for [Plan 22](main-plan.md).

## 1. The ordinary test boundary

Ordinary tests run real harness logic, validation, write guards, ledger writes,
replay, projections and in-process services. Git, frozen candidate reads,
Ramify CLI results, configured audit results, agent responses and external
command outcomes come from explicitly supplied scripts. Fixture preparation
does not initialize a Git repository or invoke a command to compute an answer.

The same rule covers root, harness, child-owner and web tests. A test's owner or
name does not exempt it. Vitest's own worker startup, the outer audit's Git
operations and runner discovery are infrastructure outside the guarded test
runtime. Existing explicit browser/live-session workflows retain their own
contracts and do not become ordinary Vitest tests.

## 2. Strict external responses

Reuse `GitService`, `CandidateSource`, `ConfiguredAuditPort`, the fake Ramify
adapter and existing scripted agent port. Test helpers must supply both Git
and candidate boundaries, rather than letting `RunService` default candidate
reads to `gitCandidateSource`. Production defaults stay production defaults.

Each scenario declares its initial head, tree identities, changes, commit or
no-change outcomes, trailer lookup answers, candidate contents and required
audit outcomes. Unknown operations, unexpected arguments, exhausted scripts
and unused required answers fail at teardown even when application code catches
their errors. A failure expected by the scenario is an explicit answer, not an
unscripted operation. Keep responses at operation/observable-behavior level;
do not couple every case to incidental ordering of independent reads.

Scratch status remains explicit fixture input. `fixtureScratchGit` may supply
the documented standard clean/ignored fixture only when that precondition is
declared. It must not hide a scratch behavior under test; those cases use
successive explicit `trackedPaths`/`ignoreStatus` answers. No fixture double
shells out, hashes a Git tree, infers a commit or implements Git semantics.

Scripted audit evidence is labelled synthetic harness-policy evidence. It
cannot substitute for provider conformance, an actual audited revision or
responsible-architect semantic assessment.

## 3. Guard and regression controls

Place the shared guard in root testing source,
`src/tests/helpers/process-guard.ts`, by moving/adapting the existing harness
test implementation. Root owns setup and the enforcement recorder. For the
compatibility/control access descendants still need, propose named root
`expose-test` selections of `SpawnAttempt`, `ProcessSpawnGuardError`,
`guardedChildProcess` and `spawnAttempts` from that file to descendants;
signature companions are included. Reset remains internal to root runner
hooks, not a descendant-facing escape. Retire or forward the old harness
helper through the declared root testing contract without changing its owner.
Inspect refreshed testing API views and type-check/check:self before accepting
these exposures; the missing root testing view at authoring does not establish
that another usable exposure is absent. No production source imports this code.

Root testing setup installs a process guard before application/test helper
imports for every ordinary project. It refuses `spawn`, `spawnSync`, `exec`,
`execSync`, `execFile`, `execFileSync` and `fork`; named/default exports,
promisified use, both Node builtin spellings and the require paths actually
used by this codebase receive executable bypass controls. If the current
Vitest mock mechanism misses one route, correct installation at that route
before claiming the invariant.

Record each attempted launch before throwing. A runner hook verifies zero
attempts after the test and its teardown, including caught or late attempts.
Setup/teardown violations fail their file; recorders cannot be reset mid-test
to erase a violation. Existing per-file guards and helper resets must be made
compatible with the automatic guard. The guard's own negative tests use an
isolated recorder, leaving the global enforcement recorder intact.

Controls must exercise: a normal scripted flow; missing candidate injection;
a real Git call during setup; a real Ramify call; a caught spawn refusal;
default/named/promisified access; teardown access; and a previously reset
attempt. Negative controls run in isolated test fixtures and assert failure
without creating a real Git process. Do not weaken ordinary enforcement with
an environment-variable opt-out or a per-test bypass.

Use root `src/tests/test-process-guard.test.ts` for in-process guard controls
with an isolated recorder. Use root
`src/tests/test-boundaries.integration.test.ts` as an explicitly registered
runner-boundary driver for actual installation and configuration controls: it
may launch Vitest over temporary sentinel files, but those ordinary sentinel
files must refuse their attempted Git/process launch. A caught refusal must
still make the child Vitest run fail. The driver asserts the independently
expected failing exit and diagnostics; no real Git command executes. Sentinel
data stays outside default discovery, and no intentional failing case enters
the ordinary production suite. The driver is part of the complete audit.

## 4. Configured runner partition

Proposed Vitest project names are `node`, `web` and `boundaries`. Keep the
current ordinary Node/JSDOM environments, React setup and machine-lock setup.
Create another boundary environment only if inventory finds an actual need.

A committed project-root testing manifest lists exact boundary file paths and
the actual boundary each verifies, why a fake cannot establish that claim,
and its owning cases. It is consumed by `vitest.config.ts`; ordinary discovery
uses the existing configured include/exclude rules minus those exact paths.
Boundary discovery selects those paths. No filename suffix or source-content
heuristic decides membership, and no broad owner-directory exemption is allowed.
Split mixed files so ordinary matrices do not inherit a real-boundary exemption.

Proposed package scripts:

| Command | Selection |
| --- | --- |
| `npm run test:quick -- <filters>` | Ordinary `node` and `web` projects; guard always active. |
| `npm run test:boundaries -- <filters>` | Explicit registered real-boundary projects. |
| `npm test -- <filters>` | Complete project configuration, all ordinary and boundary projects. |

The committed `agent-tests` audit check continues to execute the complete
configuration with four workers and existing timeout policy. It must never
change to `test:quick` alone. Preserve configured Cucumber and other audit
checks. Validate runner partition against actual Vitest discovery, including
a newly added ordinary test, invalid registration, missing registration file,
duplicate path, a fixture file and `src/tmp/` exclusion. Registry errors fail
configuration, not silently narrow execution.

These project names/scripts are proposed and do not exist at authoring time.
Runner partition is developer configuration; no inventory or classification
code enters production harness readiness, affected selection or audit logic.

## 5. Real-boundary evidence

Keep focused actual tests for Git branch/commit behavior, unchanged commits,
exact trailer recovery without duplicate commits, candidate object reads,
staged/worktree/untracked/deleted bytes, effective ignore/index status,
Ramify CLI/generated views, public audit discovery/execution and process
registration/settlement. Existing owner tests are preferred to duplicate witnesses.

Retain one composed multi-owner capability migration with real Git, real test
commands, repair, review and handback. Keep additional composed variants only
where their cross-boundary assertion is independently necessary, named in the
registry. Restart tables about ledger/state progression remain ordinary;
actual Git idempotency and actual process-crash recovery have dedicated real
witnesses. No real model calls are introduced.

## 6. Cleanup behavior

Preserve the start barrier, stdin bytes, group registration before command
execution, original exit/outcome classification and output bounds. After
`wait`, TERM targets only the owned process/group. A failed TERM because the
target no longer exists needs no grace sleep. A successful TERM retains a
bounded grace period and KILL escalation where live descendants remain.
Apply equivalent no-target behavior to the fallback single-process branch.

Do not replace group cleanup with a parent-PID check: the command may have
exited while descendants in its group remain. Preserve PID/kernel-identity
protections in the parent executor. A deterministic wrapper probe controls
TERM outcomes and records sleep/KILL calls; separate actual-process witnesses
prove descendants and TERM-resistant children are settled. Millisecond timing
alone is not the regression assertion.

## 7. Preservation and qualification

Iteration 0 records old file/title/acceptance ID, independently expected
behavior, destination, treatment (stay/move/replace with equivalent), and real
boundary rationale where applicable. Mechanical tooling checks identities and
membership; the responsible architect reviews semantic equivalence. Every
restart point and negative path remains represented. Test counts may change
only through explained moves/splits or reviewed equivalent-case consolidation;
required behaviors cannot disappear.

Full qualification follows the installed committed-audit configuration on a
clean candidate. Lock-blocked, skipped, failed, missing or unrun checks retain
their actual status. Existing opt-in/skipped cases keep their provenance and
are not counted as successful real-boundary evidence. Any necessary previously
opt-in boundary witness is explicitly invoked with its declared setup.

Archive baseline/final source IDs, configuration hashes, runner discovery,
case mapping, audit report references, process/Git/CLI counts and timings.
An engineer reports observations; a responsible architect assesses preservation
and declares completion. Neither an audit pass nor a speedup makes that judgment.
