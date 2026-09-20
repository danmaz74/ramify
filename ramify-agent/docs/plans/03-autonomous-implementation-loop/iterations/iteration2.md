# Iteration 2: External commands and the check engine

**Goal:** run one of the target project's commands safely, and turn a set of
commands into one `GateAttempt` with an honest verdict, before any run exists to
use them.

## Prerequisites

Iteration 1: `harness/evidence` exists and the harness's `src/jobs/` writes through the ledger, with their exposures.

## Write scope

`subs/harness/subs/evidence/` and `subs/harness/src/checks/`, plus the two
`module.ramify` files those touch.

## Interfaces established

- From `harness/evidence`: `runCommand`, `CommandRun`, `CommandOutcome`,
  `CommandOutput`, `cleanEnvironment`, `readMeasurement`,
  `MeasurementDocument`, `ModuleMeasurement`, the small git service,
  `guardedFilesHash`, and Ramify's complete and changed
  check forms on `RamifyCli`.
- In `harness`: the `GateAttempt` record as the
  [proposal](../core-records.proposal.md#gate-attempts) defines it, `CheckCommand`,
  `Checkpoint` and `TestSelection` as shapes; the policy that chooses them
  arrives in iterations 4, 6, 9 and 10.

## Work

### Place the lifted code

The four reference copies are in [reuse/](../reuse/README.md). Each keeps its
provenance comment naming its cucumber-viz source and version. Only the first
three are placed here; `resolve-contained-path.ts` belongs to iteration 7.

| Copy | Destination | Adjustments |
| --- | --- | --- |
| `run-command-with-cleanup.sh` | `subs/harness/subs/evidence/src/run-command-with-cleanup.sh`, a resource beside its caller | None. Verbatim |
| `exec-and-collect.ts` | inside `subs/harness/subs/evidence/src/run-command.ts` | Tell a timeout from a failure using Node's `killed` and `signal`; write the complete output to a file and return `{ path, bytes, truncated, tail }` with a fixed tail bound; surface a spawn failure's string `code` as `runnerError`; resolve the wrapper script from the module's own directory |
| `clean-env.ts` | the same file, as `cleanEnvironment` | It becomes the only builder of a child environment. `env` is complete and is never `process.env` |

`runCommand` never throws. Its outcome is `completed` with an exit code,
`timed-out`, `cancelled`, or `runner-error` with the structured error. A
failure is **never** classified from output text.

### Ramify's two check forms

`RamifyCli` gains `checkComplete` (`ramify check --batch --format json`) and
`checkChanged` (`ramify check --changed <path>... --format json --deadline`),
following the
[hook and complete check contract](../../../../../docs/architecture/cli-invocation.spec.md#hook-and-complete-checks).
Exit 0 is checked with no findings, 1 is findings or an invalid revision, 2 is
not checked with the CLI's reason. Exit 2 is never a pass. A named
configuration file is answered at once as not checked, so the caller runs a
complete check instead of claiming hook coverage.

### The git service

`git.ts` in `harness/evidence`, a few functions over `runCommand`, each one git
invocation: `isCleanRepository`, `createRunBranch`, `commitAccepted`,
`findCommitByTrailer`, `changedPaths` (from `git status --porcelain`) and
`diffNumstat`. `commitAccepted` is `git add -A` and `git commit` with
`--no-verify`, `--no-gpg-sign` and the harness's own identity, so the project's
hooks and the person's configuration cannot fail it, and it refuses any branch
that is not a run branch. No tree identity is taken or compared anywhere: a
change to the working directory blocks nothing. See the proposal's
[run the checks, then commit](../core-records.proposal.md#run-the-checks-then-commit).

`guardedFilesHash` is a SHA-256 per guarded file, the test-runner and compiler
configuration, the package manifests and the required contract artifacts, which
names the guarded file that changed.

**One function runs a gate.** `runGate(checkpoint, ...)` returns a `GateAttempt`
and has one caller. A standalone commit-audit tool, extracted from cucumber-viz,
will replace its body later; nothing of that tool is built here.

### The check engine

`subs/harness/src/checks/` owns, with no knowledge of runs:

- **Verification before execution.** Every command and every selection of the
  attempt is verified before the first command runs. A checkpoint that cannot
  run what it requires records `not-verified` and runs nothing.
- **Execution** through `runCommand`, with the writer already paused by the
  caller.
- **Classification.** `commands[].outcome` is `passed`, `failed` or
  `not-verified`, with `notVerified` one of `timeout`, `runner-error`,
  `command-missing`, `empty-selection` or `interrupted`.
  `verdict` and `cause` derive from `runnerError`, the timeout and the exit
  codes; `unknown` stays explicit.
- **Guarded changes.** `guardedChanges[]` compares the captured hashes with the
  tree, `after: null` for a deletion, `authorizedBy` naming the record that
  authorized it or null.
- **Output.** The complete output is a file beside the attempt; the record
  carries `{ path, bytes, truncated, tail }` with an 8 KiB tail.

### Measurement reader

`readMeasurement` runs `ramify measure --format json`, validates the
`ramify.measure/1` document and returns per-module buckets. An absent or
unsupported producer is `unavailable` with its reason, never zero.

## Acceptance cases owned

None. The checkpoints that use this engine arrive in iterations 4, 6, 9 and 10.

## Guards owned

| Guard | Test |
| --- | --- |
| A command leaving a descendant running is settled by its process group | `subs/harness/subs/evidence/src/tests/run-command.test.ts` |
| A check that did not run says why; an empty required selection never passes | `subs/harness/src/tests/gate-not-verified.test.ts` |
| Evidence is bound to a content identity, not a commit | `subs/harness/src/tests/tree-identity.test.ts` |

## Exit evidence

- A command that spawns a descendant which outlives it: after `runCommand`
  returns, the descendant is gone, confirmed by its process group.
- `NODE_OPTIONS` is absent from the child environment.
- Five `not-verified` reasons each produced by a real case, and an attempt with a
  missing command that runs nothing at all.
- A timeout is distinguished from a non-zero exit; a spawn failure yields
  `runnerError` with its string code.
- A guarded file changed and a guarded file deleted are both recorded, the
  deletion as `after: null`.
- `commitAccepted` succeeds where a project hook fails and where `user.email` is
  unset, refuses a branch that is not a run branch, and never commits a plan's
  `.harness/`.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
