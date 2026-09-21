# Iteration 2 results: external commands and the check engine

**Date:** 2026-09-20. **Status:** complete. The [brief](iteration2.md) is
satisfied: the three lifted files it places are placed and adjusted,
`harness/evidence` runs one of the target project's commands, reads the
measurement document, hashes the guarded files and speaks to git, `RamifyCli`
has Ramify's two check forms, and `subs/harness/src/checks/` turns a set of
commands into one `GateAttempt` with an honest verdict. No run exists to use
any of it yet, which is the point of building it here.

`runGate` is the one function that runs a gate, and its one caller is not
written yet: iteration 4's readiness and final gate is the first. Everything
it needs is in its request.

## 1. Baseline

Run from `ramify-agent/` before anything was changed. All four pass, and each
matches iteration 1's exit exactly.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  32 passed (32)
                                  Tests  231 passed (231)
=== npm run build:web ===    ✓ 287 modules transformed.   EXIT: 0
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 93 source files, 3 resources, 993 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 569 allowed, 0 denied, 424 external
                             EXIT: 0
```

## 2. The architect view this iteration worked from

| | Before | After |
| --- | --- | --- |
| Revision | `rev/1:28de61c9-1d3d-46c2-a462-630be6d5ae6a:1` | `rev/1:76dccb45-f79a-4ac6-b0c3-78c4f57519e0:1` |
| Input identity | `input/1:f7d9100d0604055b81b8071de5954fc0d102f86f5b183770c6e3a191e3c88742` | `input/1:b1c656dc701dd1f931dd4b0442289da6b8c61bb04125f151c04d85092091b96b` |
| Modules, records | 7, 401 | 7, 457 |
| Dependencies, test references, metrics | measured | measured |
| Cut | 102 | 111 |

The before column is iteration 1's recorded after view, which was the view on
disk when this iteration started. This iteration did not materialize a view of
its own before changing anything, so the before column is quoted rather than
observed; the after view was materialized from a stopped daemon, before any
claim below about the module tree. Its cut is not zero, so an absent detail in
it is not evidence that behavior is absent.

The daemon was stopped first, as iteration 1's note requires: this iteration
adds `subs/harness/src/checks/` and `subs/harness/subs/evidence/src/tests/`,
and a materialization in a daemon context that has seen a directory added
publishes `dependencies unavailable (wait-limit)`. The after view has its
dependency facts measured.

### The module tree is unchanged, and `evidence` still receives nothing

The seven modules of iteration 1 are the seven modules now; this iteration
declares none. `harness/evidence` records `uses: []` and
`usedBy: [ramify-agent/harness]` with 12 behavioral and 6 non-behavioral
references, so "it returns its own types and receives nothing from the
harness" is still enforced and not a convention. `harness` records `evidence`
among its `uses` and nothing else changed there.

### The exposed-name inventory compared

Every exposed original of every module, before and after, from the view's
`behavior.jsonl` and `supporting.jsonl`. 171 names become 190. All nineteen
additions are `harness/evidence`, all `to parent`, and nothing else differs:
`harness` exposes 113 before and after, `agent` 18, `pi` 3, `ledger` 17, and
the root 0.

| Owner | Before | After |
| --- | ---: | ---: |
| `ramify-agent` | 0 | 0 |
| `ramify-agent/harness` | 113 | 113 |
| `ramify-agent/harness/agent` | 18 | 18 |
| `ramify-agent/harness/agent/pi` | 3 | 3 |
| `ramify-agent/harness/evidence` | 20 | **39** |
| `ramify-agent/harness/ledger` | 17 | 17 |

The nineteen are `RamifyCheckResult` from `ramify-cli.ts`; `readMeasurement`
with `MeasurementDocument`, `ModuleMeasurement` and `MeasurementRead` from
`measure.ts`; `runCommand`, `cleanEnvironment`, `CommandRequest`,
`CommandRun`, `CommandOutcome` and `CommandOutput` from `run-command.ts`;
`guardedFilesHash` from `guarded-files.ts`; and `GitError`,
`isCleanRepository`, `createRunBranch`, `commitAccepted`,
`findCommitByTrailer`, `changedPaths` and `diffNumstat` from `git.ts`.
Nothing is exposed to descendants, and the root `module.ramify` was not
touched.

## 3. What was delivered

### The lifted code, placed

| Copy | Placed at | State |
| --- | --- | --- |
| `run-command-with-cleanup.sh` | `subs/harness/subs/evidence/src/run-command-with-cleanup.sh` | Body byte-identical to the reference copy; one provenance line changed, see deviation 4 |
| `exec-and-collect.ts` | inside `subs/harness/subs/evidence/src/run-command.ts` | Adjusted as the brief requires |
| `clean-env.ts` | the same file, as `cleanEnvironment` | The only builder of a child environment |

`resolve-contained-path.ts` is untouched, as the brief requires. The reference
copies in `reuse/` are unchanged; the placed code carries its own provenance
comment naming the cucumber-viz file, its version and its license.

### `runCommand`

Never throws. Every command runs as
`bash run-command-with-cleanup.sh <command> <args>` — the wrapper beside it,
resolved from the module's own directory — so the command gets a process group
of its own. How a command ended is never read from what it printed:

| Outcome | Established by |
| --- | --- |
| `completed` with its exit code | The command's own code, including 127 for a name `bash` cannot find and 128+n for one its own signal killed |
| `timed-out` with the bound | Node's `killed`, which the harness sets only by its own timeout |
| `cancelled` | The caller's `AbortSignal` |
| `runner-error` with `{ kind, message }` | Node's string `code`, such as `ENOENT` for a working directory that is gone, or a signal name where there is no exit code |

The complete output is written to the file the caller names and the answer
carries `{ path, bytes, truncated, tail }` with an 8 KiB tail;
`truncated` is the output cap, 16 MiB by default, which kills the command and
is a runner error rather than a pass. The file holds the command's standard
output followed by its standard error, which is how the executor collects
them.

`cleanEnvironment` answers a complete environment without `NODE_OPTIONS` plus
the caller's additions; `runCommand` requires `env` and never merges
`process.env` itself. `RamifyCli.run` now builds its environment through it
too, so the module has one builder and not two.

### Ramify's two check forms

`RamifyCli.checkComplete` runs `check --batch --root <project> --format json`
and `checkChanged` runs `check --changed <path>... --format json --deadline`
from the directory the paths are relative to. Both answer one
`RamifyCheckResult` read from the exit code alone: 0 `checked`, 1 `findings`,
2 `not-checked` with the CLI's reason, and any other code `not-checked`, so
nothing outside the contract can pass. The reason is the document's own
`reason` (the `ramify.check/1` form), else its `outcome.execution` (the
`ramify.analysis/1` form), else the invocation with its exit code and the
tail of what it printed.

### The git service

`git.ts`, a few thin calls over `runCommand`, each naming one git invocation
and parsing what it printed: `isCleanRepository`, `createRunBranch`,
`commitAccepted`, `findCommitByTrailer`, `changedPaths` from
`git status --porcelain -z` and `diffNumstat` from `git diff --numstat -z`.
`commitAccepted` is `git add -A` and `git commit` with `--no-verify`,
`--no-gpg-sign` and `-c user.name`/`-c user.email` for the harness's own
identity; it refuses any branch outside `ramify-agent/run-`, and answers
`null` where there was nothing to commit. No tree identity is taken or
compared anywhere in this iteration's code.

### `guardedFilesHash`

One SHA-256 per guarded file, so a change names the file that changed, and
`null` for a file that is not there. Without paths it hashes the
configuration and manifests a project has: `package.json`,
`package-lock.json`, `tsconfig.json`, and the Vitest and Vite configurations
in their three extensions. With paths it hashes exactly those, which is how a
captured set is asked for again and how the contract artifacts an assignment
names are added. A path escaping the root is refused. It compares nothing;
the comparison is the gate's.

### `readMeasurement`

Runs `ramify measure --root <project> --format json`, validates the
`ramify.measure/1` document and answers its per-module `exact` and `subtree`
buckets with the producer's own bytes beside them, for a caller that stores
the document verbatim with its hash. A producer that cannot be run, output
that is not JSON, a document of another version and a document the format
rejects are each `unavailable` with that reason. None of them is a zero.

### The check engine

`subs/harness/src/checks/`, which knows nothing of runs.

- `records.ts`: `GateAttempt` as the proposal defines it, with `CheckCommand`,
  `Checkpoint`, `TestSelectionPolicy`, `TestSelection`, `GateAttemptId`,
  `AcceptedCommit` and the closed sets of `NotVerified`, `GateCause` and
  `GateNext`.
- `verify.ts`: `verifyChecks`, which verifies every command and every
  selection before the first command runs — the executable on the command's
  own `PATH` or as a path, the working directory, an empty selection the
  checkpoint requires, a required suite the resolved selection lost, and a
  discovery the caller could not complete.
- `gate.ts`: `runGate(checkpoint, request)`, the one function that runs a
  gate. A checkpoint that cannot run what it requires runs nothing at all and
  records why. The attempt is returned, not written, and `commit` is null:
  the commit is a separate external effect its caller performs.

`verdict` is `not-verified` if any command is, else `failed` if any command
failed or a guarded change is unauthorized, else `passed`. `cause` derives
from the reasons the attempt was decided by, in the order guarded change,
timeout, infrastructure, unknown, in-scope. `next` follows the cause, and the
caller's optional limits turn `repair` and `retry-infrastructure` into
`exhausted`.

## 4. Exit evidence

Every command was run from `ramify-agent/` after the work was complete. The
output below is verbatim.

```text
=== npm run type-check ===

> ramify-agent@0.0.0 type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json

EXIT: 0

=== npm test ===

> ramify-agent@0.0.0 test
> vitest run

 RUN  v4.1.11 /ramify/ramify-agent

 Test Files  39 passed (39)
      Tests  282 passed (282)
   Duration  34.00s

EXIT: 0

=== npm run build:web ===

> ramify-agent@0.0.0 build:web
> NODE_ENV=production vite build --config subs/web/vite.config.ts

vite v8.3.0 building client environment for production...
✓ 287 modules transformed.
dist/web/index.html                   0.39 kB │ gzip:   0.26 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DJ9mvXsL.js   430.38 kB │ gzip: 129.68 kB
✓ built in 209ms
EXIT: 0

=== npm run check:self ===

> ramify-agent@0.0.0 check:self
> ramify check --batch --root .

Root: /ramify/ramify-agent (given)
Configuration: /ramify/ramify-agent/tsconfig.json
Mode: batch
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 7 owners, 109 source files, 4 resources, 1151 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 633 allowed, 0 denied, 518 external
EXIT: 0
```

Against the baseline: 93 source files become 109 and 993 accesses become
1,151, with the owners at 7, the findings at zero and coverage complete. The
fourth resource is the wrapper script, which `run-command.ts` reaches as a
same-owner resource, so no exposure declares it. 231 tests become 282; the 51
new ones are listed below. The browser build is unchanged at 287 modules,
which is the evidence that nothing the web module sees moved.

### The brief's exit evidence, item by item

| Required | Where it is shown |
| --- | --- |
| A command that spawns a descendant which outlives it: after `runCommand` returns, the descendant is gone, confirmed by its process group | `run-command.test.ts`, "settles a descendant that outlives the command, by its process group": the command prints its own process group, and `pgrep -g <group>` answers nothing afterwards, with the marker file the descendant would have written still absent |
| `NODE_OPTIONS` is absent from the child environment | `run-command.test.ts`, "leaves NODE_OPTIONS out of the child environment": the parent's `NODE_OPTIONS` is set for the test and the child prints `unset` |
| Every `not-verified` reason produced by a case | `gate-not-verified.test.ts` produces all seven: `command-missing`, `empty-selection`, `required-suite-missing`, `discovery-error`, `timeout`, `runner-error` and `interrupted` |
| An attempt with a missing command that runs nothing at all | The same file's first case: three commands, one of them a name that cannot be run, and the marker files the other two would have written are both absent |
| A timeout is distinguished from a non-zero exit | `run-command.test.ts`, "tells a non-zero exit from a timeout", and `gate-not-verified.test.ts`, "records a timeout as a timeout, not as a failure" |
| A spawn failure yields `runnerError` with its string code | `run-command.test.ts` at the executor and `gate-not-verified.test.ts` at the gate, where a first command removes the second command's working directory after verification and the gate records `ENOENT` |
| A guarded file changed and a guarded file deleted are both recorded, the deletion as `after: null` | `tree-identity.test.ts`, first case |
| `commitAccepted` succeeds where a project hook fails and where `user.email` is unset | `git.test.ts`, "commits where a project hook fails and where no identity is configured": a `pre-commit` hook that exits 1, `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` neutralized, a bare `git commit` asserted to fail first, and the commit's author asserted to be the harness |
| `commitAccepted` refuses a branch that is not a run branch | `git.test.ts`, "refuses a branch that is not a run branch": on `main` it raises and the tree is left dirty and uncommitted |
| `commitAccepted` never commits a plan's `.harness/` | `git.test.ts`, "never commits a plan's .harness/": with `plans/p1/.harness/.gitignore` holding `*` and a log file beside it, the commit's name list is exactly `src/one.ts` |
| The four gate commands | Above |

### The tests added

51 tests in 7 files, none of which touches pi, the network or the fixture
project. Every one runs in a temporary directory of its own.

| File | Tests | What it covers |
| --- | ---: | --- |
| `subs/harness/subs/evidence/src/tests/run-command.test.ts` | 10 | The four outcomes, the descendant settled by its process group, the output file and its bounded tail, the output cap, a run with no output file, and `cleanEnvironment` |
| `subs/harness/subs/evidence/src/tests/git.test.ts` | 10 | Clean and dirty, a directory that is no repository, the run branch created and found again, the commit against a failing hook and no configured identity, the refusal off a run branch, nothing to commit, `.harness/` never committed, the trailer lookup, `changedPaths` including a rename and an untracked file, and `diffNumstat` |
| `subs/harness/subs/evidence/src/tests/ramify-cli.test.ts` | 7 | The two check forms' argument vectors and every outcome the exit codes define, including a cold daemon, a named configuration file, a reason the CLI did not give, and an exit code outside the contract |
| `subs/harness/subs/evidence/src/tests/measure.test.ts` | 5 | A valid document's buckets and raw bytes, and the four ways it is unavailable |
| `subs/harness/subs/evidence/src/tests/guarded-files.test.ts` | 4 | The default set, a captured set asked for again, a change and a deletion named, and a path that leaves the project |
| `subs/harness/src/tests/gate-not-verified.test.ts` | 9 | The guard: a check that did not run says why, and an empty required selection never passes |
| `subs/harness/src/tests/tree-identity.test.ts` | 6 | The guard: evidence is bound to a content identity, not a commit |

### Every union value has a producer and a test

The closed sets this iteration adds, and where each value is produced.

| Union | Values produced and tested | Values with no producer yet |
| --- | --- | --- |
| `CommandOutcome` | `completed`, `timed-out`, `cancelled`, `runner-error` | — |
| `NotVerified` | all seven | — |
| `GateAttempt.verdict` | `passed`, `failed`, `not-verified` | — |
| `GateCause` | `in-scope`, `infrastructure`, `timeout`, `guarded-change`, `unknown`, and `null` for a pass | `invalid-session` arrives with sessions in iteration 4; `outside-assignment` with write scopes in iteration 6 |
| `GateNext` | all five | — |
| `RamifyCheckResult.outcome` | `checked`, `findings`, `not-checked` | — |

`Checkpoint` is a type only here; the policy that chooses a checkpoint arrives
in iterations 4, 6, 9 and 10, and each of its values is produced there.

### The measured size of the two owners

From the architect view's `metrics.contextSize.exact`, which the measurement
document confirms.

| Owner | Production files | Production bytes | Test files | Test bytes |
| --- | ---: | ---: | ---: | ---: |
| `harness`, after iteration 1 | 26 | 144,432 | 18 | 128,386 |
| `harness`, now | 29 | 163,324 | 20 | 142,799 |
| `harness/evidence`, after iteration 1 | 2 | 14,626 | 0 | 0 |
| `harness/evidence`, now | 6 (+1 resource, 1,136 bytes) | 40,518 | 7 | 27,676 |

`harness`'s own production source grew by three files and 18,892 bytes, which
is `src/checks/`. It is 6,969 bytes above the main plan's pre-Plan-3 record of
156,355; the reductions of iterations 0B and 1 have been spent and the check
engine is the first thing this plan adds to the harness rather than moves out
of it.

## 5. Acceptance cases owned

None. The brief assigns none: the checkpoints that use this engine arrive in
iterations 4, 6, 9 and 10, and this iteration's exit evidence is its own.

## 6. Deviations from the brief, with reasons

1. **Four names are exposed that the main plan's list does not carry.** The
   brief's "interfaces established" names `cleanEnvironment`, which the main
   plan's `expose-src` list omits; `RunPolicy.commands` is built by the
   harness, so the harness needs the one builder of a child environment. The
   other three are the types of what an exposed function takes and answers:
   `CommandRequest` for `runCommand`, `RamifyCheckResult` for the two check
   forms, and `MeasurementRead` for `readMeasurement`. A consumer that cannot
   name what it receives cannot hold it in a variable. They are additions to
   the list, not replacements; nothing the main plan lists is missing.
2. **The proposal's `RecordRef` is called `RecordReference` here.**
   `jobs/commit.ts` already exports `RecordRef` for a record body on its way
   into the log, and two exported `RecordRef`s in one module would be two
   different things under one name. `checks/records.ts` says in a comment that
   it is the proposal's `RecordRef`. Iteration 4 inherits the same collision
   for the other records that reference one.
3. **`runGate` takes the checkpoint and one request object.** The brief writes
   `runGate(checkpoint, ...)`; the rest is a named request rather than a list
   of positional arguments, because it carries thirteen fields. The rule the
   brief states, one function with one caller, is unchanged, and a commit-audit
   tool replacing the body would replace exactly this signature.
4. **The wrapper script's body is verbatim; one provenance line is not.** The
   reference copy's header ends "Reference copy: Plan 3 places it in the
   harness", which stops being true once it is placed. That sentence now reads
   "Run by run-command.ts beside it". The two lines naming the cucumber-viz
   source, its version and the license are unchanged, and everything from
   `set -uo pipefail` onwards is byte-identical to `reuse/`.
5. **`runCommand`'s output file is optional, and `CommandRun` also carries
   `stdout` and `stderr`.** The brief requires the complete output written to
   a file, which is what a gate command needs; but `git.ts` is "a few
   functions over `runCommand`" and a git invocation's answer *is* its
   standard output. A file per `git status` would be waste. The gate always
   names a file, so `GateAttempt.commands[].output.path` is always a real
   file, and `output.path` is null only where the caller asked for none.
6. **A command killed by a signal the harness did not send is a
   `runner-error` naming that signal.** The brief's four outcomes leave no
   room for it, and `completed` would have to invent an exit code the command
   never chose. Through the wrapper this is rare: the inner command's signal
   reaches the caller as bash's 128+n, so this path is for a wrapper that is
   itself killed by someone else.
7. **A Ramify check exiting 2 is `not-verified` with reason `runner-error` and
   `runnerError: null`.** The closed reason set has no `not-checked`, and
   `runnerError` is "set only by the code that spawns the command", which an
   exit code is not. The reason the CLI gave is in the attempt's output file,
   and `RamifyCli.checkComplete` answers it structurally for a caller that
   wants it. `cause` is `infrastructure` and the exit 2 is never a pass, which
   is what the brief requires of it.
8. **A command that verified but never ran is `interrupted`, and is not one of
   the reasons the cause derives from.** When one command of an attempt fails
   verification, none runs; the others are recorded `interrupted`, the only
   value in the closed set that fits. Deriving the cause from those would make
   every verification failure `infrastructure`, so the cause is derived from
   the commands that were actually decided: the ones that failed verification
   and the ones that ran. An empty required selection is therefore `unknown`
   and not `infrastructure`, which is what its recovery needs.
9. **Four evidence test files rather than the one the guards table names.**
   The table names `run-command.test.ts`; the exit evidence also requires the
   git commit's behaviors, and `measure.ts`, `guarded-files.ts` and the check
   forms arrive here with no other owner to test them. They are in the owner's
   `src/tests/`, with their own `helpers/`, since `evidence` cannot receive
   the harness's test helpers.
10. **Ramify's check forms are tested against a stand-in, not the installed
    CLI.** `check --changed` against a cold daemon starts one in the
    background, and a test suite that starts daemons is slow and leaves state.
    The installed CLI's contract was confirmed by hand instead, and is
    recorded in section 8. The first test against the real CLI belongs to
    readiness, in iteration 4.
11. **`RamifyCli.run` now strips `NODE_OPTIONS`.** Making `cleanEnvironment`
    "the only builder of a child environment" means the `ramify` invocations
    use it too. This is a behavior change to existing code inside the write
    scope: `mapping.test.ts` and `approval.test.ts` run the real executable
    through it and pass.
12. **No `union-values.test.ts` was created.** As in iteration 1, the file
    does not exist and this iteration adds no submission union member. The
    table in section 4 records every union value this iteration offers with
    the test that produces it; the file belongs to the first iteration that
    writes a submission union into a record.

## 7. What the next iteration must know

- **`runGate` has no caller.** Iteration 4 writes the first one. It supplies
  `id`, `projectRoot`, `directory` (where the output files go, beside
  `attempt.json`), `head`, the planned checks, the captured `guarded` hashes,
  any `authorizations`, and optionally `limits` so the attempt's `next` can be
  `exhausted`. It does not commit: the attempt comes back with `commit: null`
  and the caller makes the commit as a separate external effect.
- **The commit is an effect keyed on the gate attempt.** `commitAccepted`
  makes it and `findCommitByTrailer(root, 'Ramify-Gate', <id>)` is how a
  repeat after a crash finds it instead of making a second one. Both belong
  inside the ledger's `effect`, as the proposal's rule 4 requires.
- **`ensureStateDirectory` writes no `.gitignore`, and the run layout needs
  one.** The proposal says `plans/<plan-id>/.harness/` "carries a `.gitignore`
  ignoring everything in it, so the run's own log is never committed". Today
  `store/state-directory.ts` writes only the `tsconfig.json` marker. The git
  test creates the `.gitignore` by hand to prove that `git add -A` then
  commits nothing of it; iteration 4 must make the harness write it, or
  `git add -A` will commit the run's records.
- **`CheckCommand.env` is complete and built by `cleanEnvironment`.**
  `runCommand` requires `env` and never merges `process.env`, so a
  `RunPolicy.commands` entry captured without it will run with no environment
  at all. The commands and their timeouts are the main plan's table; nothing
  here hardcodes them.
- **The `not-verified` reasons a policy must supply.** `discovery-error` and
  `required-suite-missing` are established by the caller and handed to
  `runGate` as a check's `discovery`, because the engine does not discover
  tests. Iteration 6's selection resolver produces them; until then they are
  only reachable from a test.
- **`evidence` cannot receive the harness's test helpers.** It exposes nothing
  to descendants and the harness exposes nothing to them either, so its tests
  have their own `src/tests/helpers/temporary.ts` and `helpers/git.ts`.
  `helpers/git.ts` neutralizes `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` for
  the duration of a test, which is what makes "no identity is configured"
  provable; a test that commits must keep doing so.
- **The daemon's wait-limit behaviour still costs a view its dependency
  facts.** Stop the daemon before the materialization an iteration reports.
- **`subs/harness/src/.ramify/` and `subs/harness/src/tests/.ramify/` are
  still stale.** They are gitignored generated API views and predate both
  children. `npm run check:self` does not read them.

## 8. Not done, with the reason

- **No before architect view was materialized.** The rule asks for the view an
  iteration worked from; this iteration read iteration 1's recorded identity
  rather than materializing its own, so the before column of section 2 is
  quoted and not observed. The after view was materialized before every claim
  made here about the module tree, and the exposed-name comparison is against
  the file iteration 1 produced, which is the same data.
- **`resolve-contained-path.ts` is not placed, and its iteration is written
  down twice.** This brief says it belongs to iteration 7; the main plan's
  lifted-code table says iteration 6, with `harness/src/guard/` as its owner.
  Neither is this iteration, so nothing was done about it, but whoever writes
  iterations 6 and 7 should settle which one places it.
- **The check forms are not exercised against the installed CLI by a test.**
  They were exercised by hand, from `ramify-agent/`, with the installed CLI:
  `ramify check --batch --root fixtures/collection-review --format json`
  exits 0 with a `ramify.analysis/1` document whose
  `outcome` is `{execution: 'completed', check: 'passed'}`, and
  `ramify check --changed src/main.ts --format json --deadline 1` against a
  fresh endpoint directory exits 2 with a `ramify.check/1` document whose
  `outcome` is `not-checked` and whose `reason` is `cold`. Both are the shapes
  `RamifyCli` reads. That invocation also starts a daemon in the background,
  which is why it is not a test here.
- **`runGate` has no production consumer, and `checkComplete`,
  `checkChanged`, `readMeasurement`, `guardedFilesHash` and every git function
  have none either.** The brief places them ahead of the run deliberately.
  They are exercised by their own tests and not yet by anything running.
