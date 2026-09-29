# Plan 17: ramify-audit 0.3.0 — machine test lock, project configuration and the manual-test fixes

**Date:** 2026-09-29. **Status:** draft for review. **Source inspected:**
ramify-agent `fca134c9` (ramify-audit 0.2.1, ramify.ts 0.1.0); ramify-audit
`feat/module-scoped-audits` at `e27ff18` (Plan 1 iterations 0–5c, Plan 3
iterations 1–2b).

This plan spans three repositories. Part A finishes and releases ramify-audit
0.3.0; it replaces ramify-audit Plan 1 iteration 6 and Plan 3 iteration 3,
which point here. Part B moves the toolkit onto it. Part C is ramify-agent's
adoption, including the machine test lock this plan was first written for.

## Outcome

- **One audit configuration per project.** A checked-in `ramify-audit.json`
  at the project root names the project's checks. `ramify-audit audit` reads
  it; there are no request files, per-plan request copies or request READMEs.
- **Partial audits work on the toolkit and ramify-agent.** Every Vitest and
  Cucumber command is narrowed to the affected modules, with no declaration;
  the toolkit's own `ramify` answers for the audited commit.
- **The defects found by the manual test of 2026-09-29 are fixed** (the
  issues below, labelled `MT-` with the test's IDs).
- **Suite runs are serialized machine-wide; focused runs are not.** Every
  test command of a gate or a readiness check waits for the machine-wide lock
  that ramify-audit's own test commands take. Focused runs, an engineer's
  `run_scope_tests` and focused `shell` runs, never wait. Waiting never counts
  as running.

```text
gate / readiness
  -> command of kind tests or scenarios
  -> audit module's test lock wrapper -> ramify-audit withMachineTestLock
       waiting: idle bound held open, gate bound paused, "Waiting for another test run (…)"
       acquired: command runs with RAMIFY_AUDIT_TEST_LOCK_HELD=1 and its own timeout
  -> GateCommandRecord { elapsedMs (running only), lockWaitMs }
```

## Why this plan is needed

**The manual test.** On 2026-09-29, ramify-audit at `b4a5134` was run by hand
on clones of the toolkit and of ramify-agent as a nested project. Partial mode
worked end to end: a toolkit `explorer` change ran 5 of 176 test files in
52 s; a `cli` change reaching the root ran exactly the six selected modules'
63 files in 135 s against about 340 s for a full run; fix after failure
carried a failure by its file through an unrelated link and cleared it;
`scripts/probes/**` changes were reused; the opt-out marker worked both ways.
It also found the defects and rough edges fixed here. Evidence:
`/tmp/claude-1000/manual-toolkit-UcwN/` and `/tmp/claude-1000/manual-nested-TH6T/`.

**Request files.** The CLI took `--request <file>`, a JSON copy of the whole
audit request. Plans copied it per plan: `ramify-agent/audit/` holds seven
files with the same five or six checks, differing in labels
(`requestId`, `coverageClaim.change`, metadata), one timeout and the patch
check's range. Nothing decides anything from the labels. Dan never asked for
them; only the checks need writing down.

**The machine lock.** ramify-audit's Plan 3
(`/ramify-audit/docs/plans/03-machine-test-lock/main-plan.md`) restored the
machine-wide queue for test runs: a kernel `flock` on
`/tmp/ramify-audit-tests.lock`, taken only by test commands, with nested runs
passing through on `RAMIFY_AUDIT_TEST_LOCK_HELD`. It applies to commands
ramify-audit's command runner spawns. ramify-agent spawns none of its test
commands that way, so upgrading alone serializes nothing:

1. **Gates run as registered executors.** Every gate check, setup included,
   goes through the bridge in `subs/harness/subs/audit/src/check-execution.ts:124`,
   which calls ramify-agent's own `runCommand` (`:165`) or `runScenarioCheck`
   (`:141`). ramify-audit's Plan 3 decision 2 exempts registered executors.
2. **Other test runs never reach ramify-audit.** `inPlaceCheckExecution`
   (`subs/harness/src/checks/execution.ts:114`) serves single sessions
   (`subs/harness/src/sessions/single.ts:524`) and readiness
   (`subs/harness/src/run/service.ts:8278`).
3. **The nested-run variable would be dropped.** `childEnvironment`
   (`subs/harness/subs/evidence/src/run-command.ts:172`) passes only the
   allowlist at `:120`. A ramify-agent suite audited by ramify-audit holds the
   lock; a process a ramify-agent test starts would not see the variable and,
   once this plan's lock exists, would wait forever on its own audit.
4. **Bounds would count the wait.** `heldCommands`
   (`subs/harness/src/work/engineer-equipment.ts:473`) holds an engineer's
   idle bound for the command's timeout plus a margin from the call
   (`subs/harness/src/run/port-events.ts:252`), and an audited gate's bound
   is `AbortSignal.timeout(request.context.timeoutMs)` around the whole audit
   (`check-execution.ts:228`).

## What binds this plan

- ramify-audit Plan 1 decisions 1–16 (`/ramify-audit/docs/plans/01-module-scoped-audits/main-plan.md`)
  and Plan 3 decisions 1–8 with its "Reusing the lock" section.
- No requirement on a project or request author that Dan did not ask for;
  what can be inferred is inferred.
- Widening to a full audit is always the safe direction.
- The audit module's boundary (`subs/harness/subs/audit/module.ramify`):
  "No ramify-audit type crosses." The parent receives ramify-agent's own
  wrapper, never `withMachineTestLock` or its types.
- Tests supply scripted command boundaries (as `runScenarioCheck`'s `runner`
  already does): they inject the lock and never take the real one.
- The full suite runs only through ramify-audit. Alpha: no backward
  compatibility for request formats or unreleased schema v3.

## Part A: ramify-audit 0.3.0

Work in `/ramify-audit` on `feat/module-scoped-audits`.

### A1. `ramify-audit.json`, the project's audit configuration

- **Location and project.** `<projectRoot>/ramify-audit.json`. The CLI's
  project is the directory of the nearest `ramify-audit.json` at or above the
  working directory, within the repository; `--project-root` overrides it.
  The request's `projectRoot` is that directory, so a configuration can no
  longer be run as another project.
- **Contents.** A JSON object with these keys, and no others:
  - `checks` (required for a project that is audited): the check list in the
    existing check shape (id, executor with commands, timeouts, parser,
    `dependsOn`, …). Presentation fields stay optional.
  - `ignorePaths` (optional): decision 15.
  - `workspace` (optional): `{ "preparation": "nodejs", "options": {…} }` or
    `"existing-worktree"` (decision D5). The default is an isolated worktree
    with the `nodejs` preparation and default options: the source checkout's
    `node_modules` linked, then `npm run build` when the project has one, as
    cucumber-viz's audit did. Today an isolated worktree without an explicit
    preparation gets neither; this default closes that gap.
  - `enclosingProject` (optional): `"ignore"` opts the directory out of the
    enclosing project's audits (decision 11).

  An unknown key is an error for the project's own audit and a marker warning
  (`unknown-key`) for the enclosing project, which then opts out of nothing.
  A directory whose file has no `enclosingProject` does not opt out.
- **Generated, not written.** `protocolVersion`, `requestId`, `universeId`,
  `coverageClaim`, `repositoryPath`, `source` and `registeredExecutorIds` are
  built by the CLI. `universeId` is derived from the project root.
- **The CLI.** `ramify-audit audit` without `--request`; `--request` is
  removed (decision D6). The library API keeps typed requests for
  programmatic callers such as ramify-agent's gates.
- **Plan text.** Decision 11's marker rule ("exactly one key") becomes this
  file's `enclosingProject` rule; README sections on requests become the
  configuration file.
- **The package's own configuration.** ramify-audit's
  `audit/ramify-audit-suite.request.json` becomes `ramify-audit.json` after
  the release, because the release audit is run by 0.2.1, which needs
  `--request`.

### A2. Fixes

| Issue | Fix |
| --- | --- |
| MT-D1 `check-branch <ref>` fails when a branch shares a directory's name (`ramify-agent` in `/ramify`) | Add `--` after the revision arguments in `src/branch-applicability.ts:92` (`rev-list`) and `src/project-changes.ts:218` (`diff --name-only`), and for consistency at `branch-applicability.ts:160`/`:304`, `composition.ts:110`, `merge-replay.ts:119`, `project-changes.ts:257`. One test with a branch named after a tracked directory. |
| MT-D2 a half-migrated request ran as the root project and reused its record | Removed with request files (A1): the project comes from the configuration's location, and the CLI builds the request. The library keeps its `protocol-version-mismatch` refusal. |
| MT-D3 the paths passed to Vitest are not recorded as data | Add each narrowed command's appended arguments, repository-relative, to `reports/audit/partial-selection.json`; the witness stays as is. |
| MT-T1, MT-T3, MT-T4 the toolkit has no `node_modules/.bin/ramify`; a symlink points at the source checkout's build in an isolated worktree; the missing-binary advice does not fit | In `src/ramify-process.ts`, use the `ramify` bin declared by `<projectRoot>/package.json` (`bin.ramify`, or `bin` as a string for a package named `ramify`) when it exists in the checkout, else `node_modules/.bin/ramify`. Record the chosen path in `ramifyAnswer.binaryPath`. `missing-binary` names both candidates and says to install dependencies and build a project that provides its own `ramify`; the `nodejs` preparation does both. |
| MT-T2 in existing-worktree mode the query answers from the previous build | Document: an existing worktree is prepared by the caller, dependencies and build alike. The toolkit moves to the isolated worktree (B1, decision D5). |
| MT-U1 human output shows neither selected modules nor test counts | `Selected modules: …` and `Tests: <files>/<tests>, <failed> failed` in the audit's human output for v3 records. |
| MT-U2 `check-branch` shows no verdict or mode line for a full record | Print the verdict line and a `Mode:` line for every record. |
| MT-U4 `--request` resolved against `--cwd` | Removed with `--request` (A1). |
| MT-U10 `coverage.baseline.chainDepth` naming | README: it is the recording link's depth. |
| MT-U6, MT-U7, MT-U8 reruns, restored trees, depths | README sentences: `--force` on a partial link reruns only the failed files; to rerun everything use `--force --full`; depths count links, including links that ran nothing. |

Later (0.3.1): MT-U3 (`check-branch --json` carries every command's output),
MT-U5 (`--project-root` naming a missing directory), MT-U9 (name the field that
changed the definition digest).

### A3. Partial gates: when a chain goes full, and narrowing registered executors

Decision D1. Both are ramify-audit changes that ramify-agent's gates need.

- **Drift cap.** A partial audit widens to full, with reason `drift-cap`, when
  more than 25 distinct files changed between the chain's full root and the
  source commit. The count uses the diff and ignore rules the audit already
  applies (ignored paths, paths outside the project, opted-out directories);
  it is decided before the workspace exists. A fix loop that edits the same
  files does not grow it. Example reason:
  `drift-cap: 27 files changed since the full audit at <commit> (limit 25)`.
- **Chain cap.** Raised from 20 to 25 scoped links. It remains a backstop;
  the drift cap is the usual trigger. Both numbers are fixed, like the
  failure threshold. Plan 1 decision 7 and its Limits change accordingly.
- **Registered executors are narrowed.** For a registered check whose command
  is a test runner (the executor declares its parser, `vitest` or
  `cucumber`), ramify-audit hands the executor what its own command runner
  would append: the selected modules' paths (the root module's file list),
  the carried failure files, and its reporter or plugin arguments with the
  summary file and environment. The executor runs the command itself and
  returns; ramify-audit reads the summary with the same failure-list and
  completeness rules. An executor that does not accept the narrowing runs
  whole, and the record says so. Scenario checks of other runners stay whole.
- **A wait for the machine test lock is capped** (decision D3). Plan 3's lock
  waits without limit; a run that never releases it, or a nested run that
  lost `RAMIFY_AUDIT_TEST_LOCK_HELD`, would hang forever. `withMachineTestLock`
  and the command runner give up after 30 minutes of waiting: the command is
  not run and fails as `test-lock-wait-exceeded`, naming the holder when it is
  known. In an audit the check fails and its failure list is `indeterminate`;
  it is never a test failure. The cap is fixed, like the other limits.

### A4. Release 0.3.0

The former Plan 1 iteration 6 and Plan 3 iteration 3, unchanged in substance:
version 0.3.0 in `package.json`, `package-lock.json`, `RAMIFY_AUDIT_VERSION`
and the goldens; release notes listing Plan 1 (partial audits, decisions
11–16), Plan 3 (the machine test lock) and this part (the configuration file,
the fixes); the release commit audited by 0.2.1 with `--force`; publish to
`https://npm.braimax.com`; fast-forward `main`. Then `ramify-audit.json`
replaces the package's own request file.

## Part B: the toolkit

Work in `/ramify` on a branch; the working tree holds uncommitted user edits
that must be preserved.

### B1. The toolkit's configuration

- `ramify-audit.json` at the root: the checks of
  `audit/plan7-affected-modules.request.json` (patch integrity, build,
  type-check, `npm test -- --maxWorkers=4`, `check:self`);
  `"ignorePaths": ["scripts/probes/**"]`; `workspace` the `nodejs`
  preparation with `packageDirectories: ["", "examples/collection-review"]`
  (decision D5; the manual test's
  `/tmp/claude-1000/manual-toolkit-UcwN/request.v2.isolated.json` passed the
  full suite this way).
- `check:self` and `check:reference` in `package.json` use `--batch` (MT-R3).
  In an isolated worktree a resident daemon outlives the worktree; the manual
  test found a daemon, a session supervisor and a `tsc` left per audit.
- Delete `audit/plan7-affected-modules.request.json` and `audit/README.md`;
  the README's audit instructions name the configuration.

### B2. ramify-agent's configuration

- `ramify-agent/ramify-audit.json`: `"enclosingProject": "ignore"`, the
  default workspace (isolated worktree, its root `node_modules` linked, as
  cucumber-viz's implementation studio prepared execution worktrees; its
  suite requests used `existing-worktree` until now), and the checks of `ramify-agent/audit/plan14-unified-evidence-packages.request.json`,
  with these changes from the manual test's passing
  `/tmp/claude-1000/manual-nested-TH6T/agent-v2.request.json`:
  - no `--prefix ramify-agent`: checks run in the project root;
  - `parent-daemon-test` dropped: it runs a toolkit test from the repository
    root (MT-R2);
  - `agent-vitest` timeout 900 000 ms (MT-R1: the suite takes 277–350 s and timed
    out twice at 300 s; the timeout no longer counts lock waits);
  - the patch check reads the audited commit against its first parent.
- Delete `ramify-agent/audit/*.request.json` and `ramify-agent/audit/README.md`.

## Part C: ramify-agent

### C1. Upgrade to ramify-audit 0.3.0; partial gates

- Pin `ramify-audit` to exactly `0.3.0` from the registry (install with the
  project's `legacy-peer-deps` workaround; rebuild after the manifest edit).
- Gate requests (built in code, not files) move to protocol v2: `selector` is
  removed. The final gate sets `mode: 'full'`; the other committing gates
  (iteration, contract, breaking-iteration, work-item) set no mode and run
  partial audits (decision D1). `force: true` stays. `projectRoot` is the
  project's prefix within its repository, `.` when there is none (decision D2).
- A gate's test check runs the project's all-tests command through the
  registered executor, which accepts A3's narrowing; Ramify's selection
  replaces the gate's own `owned-by-scope` narrowing, which missed dependent
  modules. A gate after a failed gate reruns that gate's failed files.
- `auditOverall` reads `result.composition.verdict` instead of
  `result.summary.overall` (`check-execution.ts:287`); ramify-audit 0.3.0
  makes the composed verdict the one consumers gate on. For a full audit the
  two are equal.
- Suite audits use B2's configuration:
  `ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json`.

### C2. One wrapper, exposed by the audit module

The audit module exposes to its parent a ramify-agent-owned wrapper around a
`CommandRunner` (sketch; names are the implementer's):

```ts
export interface TestLockHooks {
  /** Another run holds the lock; `line` is ramify-audit's own waiting text. */
  readonly waiting?: (line: string) => void | Promise<void>;
  /** Called after a wait, with its length, just before the command is spawned. */
  readonly acquired?: (waitedMs: number) => void | Promise<void>;
}
export function testLockedRunner(runner: CommandRunner, owner: TestLockOwner, hooks?: TestLockHooks): CommandRunner;
```

- It calls `withMachineTestLock`, merges the environment it receives into the
  request's `env`, and returns the run with `lockWaitMs` set.
- `lock: 'unavailable'` prefixes the run's output with ramify-audit's `note`;
  `cancelled` returns ramify-agent's ordinary cancelled run.
- It takes a test-only lock override of ramify-agent's own type; ramify-audit's
  override type does not cross the boundary.

### C3. Where the lock is taken

A command takes the lock when its `CheckCommandKind` is `tests` or `scenarios`
(`subs/harness/src/checks/records.ts:112`), mirroring ramify-audit's
test-runner-only rule. That covers:

- the audited gate's registered executor, for commands and, through
  `runScenarioCheck`'s `runner` option, scenario checks;
- `inPlaceCheckExecution`, the same way (single sessions and readiness).

Focused runs never wait (decision D4): an engineer's `run_scope_tests`
(`subs/harness/src/work/engineer.ts:417`, `:479`) and focused `shell` runs
(C8). They are short, and serializing them would stall the edit-and-retest
loop behind other sessions' suites.

`setup`, `ramify-check`, `type-check`, `conformance`, recovery commands and
other `shell` commands do not wait.

### C4. The environment

- `RAMIFY_AUDIT_TEST_LOCK_HELD` joins `childEnvironment`'s allowlist, so any
  child of a nested ramify-agent process inherits it.
- A command run under the lock receives it from the wrapper as well; the
  command record names it like any other variable the child received.
- A Vitest setup file sets it for ramify-agent's suite, so no test takes the
  real lock. Lock behavior is tested with the injected override.

### C5. Bounds

- **Command timeout:** starts once the lock is held, because the wrapper runs
  before `runCommand`.
- **Idle bound:** unchanged. An engineer's own commands never wait for the
  lock, so today's hold for the command's timeout plus the margin stays.
- **Audited gate bound:** replaced by a deadline that pauses for every wait
  of the gate's commands, so `request.context.timeoutMs` bounds running time.
- **Invocation absolute bound:** pauses while a command waits for the lock,
  like the gate bound (decision D3). A3's 30-minute cap bounds each wait.

### C6. Records and visibility

- `GateCommandRecord` gains `lockWaitMs`, set only by the code that spawned
  the command, when it waited. `elapsedMs` stays the command's running time.
- A waiting command records one observation carrying ramify-audit's waiting
  line; the transcript, the execution map's gate card and the failure
  analyst's digest show it, so a slow attempt is not ascribed to its command.

### C8. Whole-suite test runs are refused in `shell`; focused runs are allowed and locked

Decision D4. `tools/shell.ts` runs `bash -c <command>` uninspected, and the
engineer prompts even suggest a timeout "such as a whole test suite".

- **Classification.** A pure module (`subs/harness/src/tools/shell-tests.ts`)
  classifies a command as `none`, `focused` or `whole-suite`. A small
  quote-aware tokenizer splits at `&&`, `||`, `;`, `|`, `&` and newlines,
  drops leading `NAME=value` assignments and the wrappers `env`, `time`,
  `nice`, `ionice` and `timeout N`, and tracks a preceding `cd <dir>`.
  - A Vitest run: argv0 `vitest` (including `node_modules/.bin/vitest`);
    `npx`, `bunx`, `pnpm`, `yarn`, `npm exec` or `pnpm exec` followed by
    `vitest`; `npm test`, `npm t`, `npm run test`, `pnpm test` or `yarn test`
    when that package's `scripts.test` is itself a Vitest run, with arguments
    after `--` appended. `cucumber-js` the same way.
  - **Whole suite:** a run with no positional filter (a file or directory;
    `-t`, `--project`, `--reporter`, `--shard` and other options do not
    focus a run, and the values of value-taking options are skipped), and
    watch mode, which never ends on its own.
  - **Focused:** at least one positional filter, `vitest related <files>`,
    or `--changed`.
  - **Not classified:** other scripts, `bash -c`, `eval`, `$(...)` and
    wrapper scripts are allowed as today. The rule is a nudge, not a guard.
- **Refusal.** A whole-suite run is not spawned; the tool returns an error
  with the explanation below and records an observation, so refusals are
  countable:

  > Refused, nothing ran: `<segment>` runs the project's whole test suite
  > (`<reason>`). The whole suite is not run from `shell`: it runs through
  > ramify-audit at the gates, a full run takes minutes and waits behind every
  > other test run on this machine, and it verifies far more than this
  > iteration is judged on. Call `run_scope_tests` to run the tests this
  > iteration is judged on. To run particular tests, name their files:
  > `npx vitest run <path/to/file.test.ts> …` or `npm test -- <path/to/file.test.ts>`.
  > Watch mode is refused for the same reason: it never ends on its own.
- **Focused runs run at once,** without the lock (decision D4).
- **Where.** `createShellTool.execute`, after `options.judge` and before the
  call is counted; `ShellOptions` gains the project's test commands from
  `RunPolicy.commands` and the locked runner, wired in
  `work/engineer-equipment.ts`. `CheckCommandKind` is unchanged.
- **Prompts and description.** `engineer.system.md` and
  `contract-engineer.system.md` drop "such as a whole test suite" and state
  the rule; the tool description and `shell.ts`'s header say it.

### C7. The flaky timeline test

`subs/web/…/session-timeline.test.tsx`'s live-timeline case failed 2 of 4
runs under load in the manual test (MT-R4). Re-run it after C3–C5, when suites
no longer overlap; fix the test if it still fails.

## Failure cases the design must prevent

| Case | Prevented by |
| --- | --- |
| A configuration runs as another project and reuses its record | The project is the configuration's directory (A1) |
| `check-branch` fails on the toolkit's own branch name | `--` in revision arguments (A2, MT-D1) |
| The toolkit's partial audits fall back to full, or answer from a stale build | The project's declared `ramify` bin, the isolated worktree (A2, B1) |
| An audit leaves resident daemons behind | `check:self --batch` (B1) |
| A ramify-agent suite audited by ramify-audit deadlocks on its own lock | The allowlisted variable and the suite's setup file (C4) |
| An engineer's edit-and-retest loop stalls behind other sessions' suites | Focused runs never wait (C3, C8) |
| A gate fails `timed-out` although its commands ran within their bounds | Paused gate deadline (C5) |
| A test takes the real `/tmp/ramify-audit-tests.lock` | Setup file and injected override (C4) |
| ramify-audit types leak into the parent | The audit module's own wrapper types (C2) |
| A gate reads a partial link's run-local pass as a pass | `composition.verdict` (C1) |
| The final gate passes on a partial audit | The final gate requests `mode: 'full'` (C1) |
| A fail/fix loop is forced into full audits | The drift cap counts distinct changed files, not links (A3) |

## Implementation order and evidence

During an iteration run focused test files, the type-check and the project's
self-check; never a full suite by hand. Commit before each audit.

| Iteration | Repository | Delivers | Evidence |
| --- | --- | --- | --- |
| 1. Configuration, fixes and partial gates | ramify-audit | A1–A3 | Focused tests: the drift cap widens at 26 distinct changed files and not for repeated edits of the same files; the chain cap at 25; a registered executor that accepts the narrowing receives the paths and reporter arguments and its summary yields the failure list, and one that does not runs whole; the CLI finds the nearest configuration and its project; unknown keys and a missing `checks` refused; a nested file with `enclosingProject` opts out, one without does not; a branch named after a directory in `check-branch`; the declared `ramify` bin answers in an isolated worktree with the commit's own build; MT-D3's arguments recorded; MT-U1/MT-U2 output. Audit with 0.2.1 from outside the repository (`repo=$(pwd); (cd "$(mktemp -d)" && npm exec --yes --registry https://npm.braimax.com --package ramify-audit@0.2.1 -- ramify-audit audit --request "$repo/audit/ramify-audit-suite.request.json" --cwd "$repo" --json)`). |
| 2. Release | ramify-audit | A4 | The release commit's 0.2.1 audit passes; `npm view ramify-audit@0.3.0 --registry https://npm.braimax.com` names it; `main` fast-forwarded. |
| 3. Toolkit and ramify-agent configurations | toolkit | B1, B2 | With 0.3.0: a full audit of the toolkit (first on its chain) and one partial link after an `explorer` change; `check-branch ramify-agent` succeeds; a full audit of ramify-agent under its own refs; no daemon survives an audit. |
| 4. Upgrade and partial gates | ramify-agent | C1 | The audit module's existing tests pass on 0.3.0; gate requests have no `selector`, the final gate's has `mode: 'full'` and the others none; an iteration gate's test check is narrowed to Ramify's selection, including a dependent module the old `owned-by-scope` selection missed; a gate after a failed gate reruns its failed file; a composed `fail` with a run-local `pass` fails the gate; the suite audit passes. |
| 5. Lock and shell rule | ramify-agent | C2–C4, C8 | `classifyShellTestRun` cases: `npm test`, `npx vitest run`, watch mode and `-t` alone refused with the explanation; `npm test -- <file>`, `npx vitest run <dir>`, two files and `vitest related <f>` allowed without the lock; chained and env-prefixed commands classified per segment; `bash -c` and other scripts allowed. Injected-lock tests: a `tests` and a `scenarios` gate command wait while the lock is held and run after release with the variable in their environment; `run_scope_tests`, focused `shell` runs, `setup`, `type-check` and `conformance` commands do not wait; a nested process under the variable does not wait; `unavailable` prefixes the note; cancelling a waiting gate records `interrupted` and runs nothing; the parent imports no ramify-audit type (`check:self` passes). |
| 6. Bounds, records and the flaky test | ramify-agent | C5–C7 | Injected-lock tests with fake time: a gate whose command waits longer than its bound completes; `lockWaitMs` and the waiting observation are recorded and projected; `elapsedMs` excludes the wait. The timeline test re-measured. Final suite audit passes. A manual check, reported separately: two gates on two clones of the same project run their suites one after the other. |

## Decisions to confirm before coding

- **D1. Gates run partial audits; the final gate runs full** (*decided
  2026-09-29 by Dan*). Most gates do not need a full audit. A chain goes full
  when more than 25 distinct files changed since its full root (the drift
  cap), or after 25 scoped links; counting links alone would force full runs
  in a fail/fix/retest loop, the most common case. The final gate always
  requests `mode: 'full'`. ramify-audit narrows registered executors (A3).
- **D2. Gate requests name the project's root** (*decided 2026-09-29 by
  Dan*). When ramify-agent works on project B inside project A's directory
  tree, it ignores A: gate requests pass B's prefix as `projectRoot`, so
  Ramify answers for B, checks run in B, changes outside B are ignored for B's
  audits (decision 11) and B's evidence sits under B's own refs. Suite audits
  (C1) do the same through B2's configuration.
- **D3. Waits count against no bound, and each wait is capped** (*decided
  2026-09-29 by Dan*). Waiting for another session's tests never ends an
  invocation, a gate or a command: the invocation's absolute bound pauses
  during waits, as the idle and gate bounds do. A single wait gives up after
  30 minutes (A3), so a lock that is never released cannot hang anything.
- **D4. `shell` refuses whole-suite test runs and allows focused ones**
  (*decided 2026-09-29 by Dan*). A whole-suite Vitest or Cucumber run from
  `shell` is refused with an explanation pointing to `run_scope_tests`; a
  focused run (named files or directories) is allowed and never waits for
  the machine test lock, here or in `run_scope_tests` (C3, C8). Only suite
  runs, in gates, readiness and audits, are serialized. cucumber-viz's hook refused only direct `vitest` calls and
  piped `npm test`, sending every run, focused or whole, through its locking
  `npm test`; refusing whole-suite runs is new, and allowing focused runs
  follows it.
- **D5. Audits run in an isolated worktree that reuses `node_modules`**
  (*decided 2026-09-29 by Dan*). Two modes, as in cucumber-viz's audit. The
  default is a detached worktree of the audited commit, with the source
  checkout's `node_modules` linked (not installed) and `npm run build` when
  the project has one; the toolkit's own `ramify` then answers from that
  build (about 4 s). `existing-worktree` runs in the caller's checkout and
  prepares nothing; the caller installs and builds. Linked dependencies are
  the source checkout's installation, not the audited commit's lockfile, as in
  cucumber-viz. The toolkit also links `examples/collection-review`; a fresh
  install such as `worktree:prepare` must never be combined with a linked
  directory, because `npm ci` would write through the link into the source
  checkout. ramify-agent links only its root, as the implementation studio
  did.
- **D6. `--request` is removed from the CLI** (*decided 2026-09-29 by Dan*). The
  configuration file replaces it; keeping both would keep the per-plan copies
  and the "which project is this" hazard alive. Programmatic callers keep the
  library's typed request.
- **D7. Reuse keeps Plan 2's rule** (*decided 2026-09-29 by Dan*): an audit of the same tree
  is reused whatever its checks, with `--force` to rerun. The manual test's
  wrong reuse came from a request that named the wrong project, which A1
  makes impossible. Requiring equal check definitions would rerun every
  audit after any check edit.

## Out of scope

- Locking commands that are not tests or scenarios.
- Issues MT-U3, MT-U5 and MT-U9 (ramify-audit 0.3.1).
- The 50-commit measurement of partial audits (a dry run over the same range
  already informed the defaults).
