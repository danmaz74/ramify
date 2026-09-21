# Iteration 7 results: the shell, mutations and hooks

**Date:** 2026-09-20. **Status:** complete. The [brief](iteration7.md) is
satisfied: an engineer has a shell, every settled mutation is observed and
checked, what the guard could not see appears in `git status` and in
`outsideScope`, a read that leaves the scope is an excursion, and the MVP's
limits are stated in the records rather than implied by a count of zero
blocked calls.

A run over the `collection-review` fixture writes one file through the
unguarded shell, outside the scope its assignment recorded. Nothing refuses
it. The file is in the tree, in the writer's settlement snapshot, in
`InvocationOutcome.outsideScope`, in the `unguarded-shell` coverage gap and
in the projection that names which tools were guarded. That is this
iteration's exit evidence and it is executable.

## 1. Baseline

Run from `ramify-agent/` before anything was changed. All four pass, and each
matches [iteration 6's](iteration6-results.md) exit exactly.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  62 passed (62)
                                  Tests  454 passed (454)
=== npm run build:web ===    ✓ 280 modules transformed.   ✓ built in 249ms
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 156 source files, 8 resources, 2059 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 1322 allowed, 0 denied, 737 external
```

## 2. The architect view this iteration worked from

| | Before | After |
| --- | --- | --- |
| Revision | `rev/1:6c1dcc7d-3ec9-4dfc-98b1-fbf7bad3c69e:1` | `rev/1:6053072d-b9d6-42a5-a1cc-511af1d275ce:1` |
| Input identity | `input/1:170e4c68655a6fba89b8952f5700f7b0381a3b8c0decdc23a8f6ff9deaf2c6b7` | `input/1:e5e47d2864b4a5723dc7662b9880d6d9fc8302e17753279e9ccc38362653dfd0` |
| Modules | 7 | 7 |
| Dependencies | measured | measured |
| Cut | 188 | 195 |

The before column is the view that was on disk when this iteration started,
read from `.ramify-architect/_meta.json` before anything was changed. The
after view was materialized from a stopped daemon, before any claim below
about the module tree: 7 modules, 836 records, dependencies measured. Its cut
is 195, so an absent detail in it is not evidence that behavior is absent.
`_meta.json` records no coverage limits and no unknown shapes.

### The module tree is unchanged

Seven modules, as before; this iteration declares none and removes none.

| Module | `uses` | `usedBy` |
| --- | --- | --- |
| `ramify-agent` | `harness` | — |
| `ramify-agent/harness` | `evidence`, `ledger`, `agent` | `ramify-agent`, `web` |
| `ramify-agent/harness/evidence` | — | `harness` |
| `ramify-agent/harness/ledger` | — | `harness` |
| `ramify-agent/harness/agent` | — | `harness`, `agent/pi` |
| `ramify-agent/harness/agent/pi` | `agent` | — |
| `ramify-agent/web` | `harness` | — |

One exposure was added, on a channel that already existed:
`harness/evidence` exposes `outputTailBytes` to its parent, so that the
shell's description and its test name the executor's own bound instead of
restating a figure. No exposure crossed a new boundary, and `harness`
exposes nothing new to its parent or to its descendants.

## 3. What was delivered

### The shell

`src/tools/shell.ts` is the harness tool decision 12 asks for, and the
implementation's own shell stays withheld. Its input is
`{ command: string; timeoutMs?: number }`, strict, with the JSON Schema the
agent is shown taken from the same definition that validates it. The command
runs through the lifted executor from the working directory: its own process
group, `cleanEnvironment`, a bounded timeout, an 8 KiB tail to the agent and
the complete output in `invocations/<inv>/shell/<nnn>.log`. How it ended
comes from the executor's outcome and never from what it printed.

The tool declares itself `mutating`, which is what iteration 3 put that field
there for: the guard is asked about it and the post-write hook check follows
it. The guard allows it with no verdict recorded, because a shell call names
no target to judge; the first call of an invocation records the
`unguarded-shell` coverage gap instead. The call itself is the `activity`
observation the port's own `tool-started` event produces, which now carries
the command text.

`settle()` ends every command still running and waits for it. Aborting the
executor sends TERM to the wrapper that leads the command's group, and the
wrapper kills that group, so a descendant the command left goes with it.
The run calls it through `Equipment.settle`, before the writer is released.

### Mutations

Every settled mutating call is a `mutation` observation with
`observedBy: 'tool'`, including when the tool failed. For `edit` and `write`
it names the path the guard resolved and is `attributable`; for the shell it
names none and is not, because an unknown changed set is a different thing
from an empty one.

When the writer settles, `src/run/mutations.ts` reads `git status` for every
path changed since the last accepted commit. That is one further `mutation`
observation with `observedBy: 'snapshot'`, and it is the only observation
that sees a write no guard saw. It is not attributable: it covers everything
since the last accepted commit, which may include an earlier session of the
same iteration. Comparing those paths with the write scope fills
`InvocationOutcome.outsideScope`, which was `[]` for every invocation until
now. The comparison is lexical and takes no `realpath`, because a path the
snapshot names may have been deleted and a deletion outside the scope is as
much an outside change as a write.

Nothing of this blocks anything. The accepted commit that follows carries
what the shell wrote, and the record is what says it was outside the scope.

### Hook checks

`src/hooks/post-write.ts` runs after each settled mutation, installed by the
harness itself because the adapter disables automatic extension discovery.
It runs `ramify check --changed <paths> --format json` with the policy's
`hookTimeoutMs` and records a `hook-check` observation with the paths, the
mode, the outcome, the reason, the newly introduced findings and the log
reference.

| Input | What runs | What is recorded |
| --- | --- | --- |
| Paths inside the project | The changed check | One `hook-check`, `changed` |
| A named configuration file among them | Nothing, then the complete check | `not-checked` naming the file, then `complete` |
| No path the harness could establish | Nothing, then the complete check | `not-checked`, the `changed-paths-unknown` gap, then `complete` |
| Exit 2 | Nothing further | `not-checked` with the CLI's reason |

Exit 2 is never a pass: it permits continued editing, the engineer is told
that nothing was verified, and no complete check is forced by it. The two
fallback rows are the harness's own answer, given at once, so that a changed
check is never claimed to have covered what it does not cover.

New findings and every not-checked reason reach the engineer before its next
step, as text appended to that call's result. A finding this invocation has
already been told about is not newly introduced and is not reported twice;
`FindingsSeen` holds that set for the invocation. Both report shapes are
read: `findings` of `ramify.check/1` and `diagnostics` of
`ramify.analysis/1`.

### Read excursions

`src/run/excursions.ts` watches the reads of an invocation that holds a
scope. The first read into another module is one `excursion` observation and
one concise reminder; a later read of the same module is neither, because a
warning at every line is noise rather than a boundary. What Ramify generates
is never an excursion, and neither is a path no module's own contents hold.

The reminder reaches the agent through the one channel the port has for text
that reaches a running session: the result of a mutating call, the same
channel the hook check uses. That is recorded as a limitation in section 8.

### Line events, with real content

`kpi/lines.ts` now answers what the brief asks of it. A binary file carries
its byte count and no invented line count, which needed `bytes` on the
line-event record and on `worktreeLineChanges`. A path no module's own
contents hold is `unmapped` and is never charged to the root: `ownerOf` asks
whether a module's source areas or its two declaration files hold the path,
rather than whether its directory is a prefix, so the root owns its own
`src/` and not the whole project. An invocation that used the shell reports
`coverage: 'partial'` with an `unguarded-shell` gap, because two snapshots
see the tree and not the history between them: a command that changed a file
and put it back is invisible to them.

### The stated limits

`kpi/guarding.ts` is the projection an evaluation carries beside its counts.
It is a pure function of one invocation's observations and names the tools
the guard judged, the tools that mutated without passing it, the verdict
counts, the excursions, the coverage gaps, and whether the guarded calls
account for every mutation. While they do not, its `statement` says in one
sentence that a count of blocked calls is not evidence that every write
respected its scope. `complete` is false whenever an unguarded tool mutated
or an `unguarded-shell` gap was recorded.

No sandbox and no allowlist were built. The plan's non-goals forbid both and
forbid any claim that shell mutations are prevented.

## 4. Exit evidence

All four run from `ramify-agent/` after every change, with the architect view
already refreshed from a stopped daemon.

```text
=== npm run type-check ===

> ramify-agent@0.0.0 type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json

EXIT: 0

=== npm test ===

> ramify-agent@0.0.0 test
> vitest run

 RUN  v4.1.11 /ramify/ramify-agent

 Test Files  67 passed (67)
      Tests  484 passed (484)
   Duration  124.28s (transform 4.44s, setup 0ms, import 19.30s, tests 740.58s, environment 2.74s)

=== npm run build:web ===

> ramify-agent@0.0.0 build:web
> NODE_ENV=production vite build --config subs/web/vite.config.ts

vite v8.3.0 building client environment for production...
✓ 280 modules transformed.
dist/web/index.html                   0.39 kB │ gzip:   0.27 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DIDBJLm_.js   402.20 kB │ gzip: 121.78 kB
✓ built in 256ms

=== npm run check:self ===

> ramify-agent@0.0.0 check:self
> ramify check --batch --root .

Root: /ramify/ramify-agent (given)
Configuration: /ramify/ramify-agent/tsconfig.json
Mode: batch
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 7 owners, 166 source files, 8 resources, 2244 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 1448 allowed, 0 denied, 796 external
```

### The brief's exit evidence, item by item

| Item | Where it is proved |
| --- | --- |
| A hook check with findings | `hook-checks.test.ts`, "findings are reported with their count, and the same finding reported again is not new" |
| One with a timeout | `hook-checks.test.ts`, "a deadline that expires is not checked with the CLI's reason, and is never a pass", beside "an executable that never answers within the harness's own bound is not checked either" |
| One on a configuration file that falls back to a complete check | `hook-checks.test.ts`, "a named configuration file is answered at once as not checked, and a complete check runs instead": the changed form is a stub that exits 9 if it is ever run, and it is not run |
| None of the three recorded as a pass | The same three tests assert `outcome` is `findings` or `not-checked`, never `passed`, and that the engineer is told nothing was verified |
| A mutation by a tool that failed, still observed | `hook-checks.test.ts`, "an edit that matched nothing changed no file, and is still a mutation with its hook check": two `mutation` observations, `toolFailed` true then false, one hook check each |
| A `LineEventSummary` with an unmapped bucket | `line-events.test.ts`, "a path no module's contents hold is unmapped, and is never attributed to the root" |
| …and one with a binary file | `line-events.test.ts`, "a binary file carries its byte count and no invented line count" |
| A shell command that leaves a descendant is settled by its process group | `shell-tool.test.ts`, "a command that leaves a descendant is settled by its process group": the group is read from the command itself, it is not this process's, and `pgrep -g` finds nothing afterwards |
| A write through the shell outside the scope appears in `git status` and in `outsideScope`, reported and not blocked | `unguarded-write.test.ts` |
| A schema violation returns its errors and runs nothing | `shell-tool.test.ts`, "a schema violation returns its errors and runs nothing" |
| `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self` | Above |

## 5. Acceptance cases owned

| # | Case | The tests that prove it |
| --- | --- | --- |
| C3 | Stop is bounded; late tool writes settle before a new writer or check; a late result cannot complete superseded work | `late-writes.test.ts`, "is settled with its process group, and its result completes nothing". A scripted engineer runs a command that would write a file twenty seconds later; the stop arrives while it is in flight. The file never arrives. `writer-released` is in the log with `confirmed: true` and before `job-stopped`; no second writer is acquired; no `gate-attempted` and no `iteration-closed` follow. The invocation's outcome is retained with `disposition: 'superseded'`, its observations included, and no iteration result exists. Beside it `writer-settlement.test.ts` holds the rule that an unconfirmed release blocks the next writer and the next gate |
| X6 | One outside read and one unguarded shell mutation make the MVP's limits visible rather than reported as complete enforcement | `unguarded-write.test.ts`. Two reads of another module give exactly one `excursion` on first entry; one shell command writes outside the scope and is not refused; the file is on disk, in the settlement snapshot's paths, and in `outcome.outsideScope`, while the guarded write inside the scope is not; the `unguarded-shell` gap is recorded once; `guardingReport` answers `guarded: ['edit']`, `unguarded: ['shell']`, `complete: false` and a statement containing "not evidence"; the line events are `partial` with the same gap; and the accepted commit carries the file, because the harness never reverts |

## 6. Guards owned

| Guard | Test | What it asserts |
| --- | --- | --- |
| A write the guard cannot see appears in `git status` when the writer settles and in `outsideScope` | `subs/harness/src/tests/unguarded-write.test.ts` | The X6 row above. The snapshot holds both the guarded and the unguarded path; `outsideScope` holds only the one outside the scope; `attributable` is false, because the snapshot is not one call's doing |

The cross-cutting JSON validation rule applies to the one harness tool this
iteration adds.

| Subject | Schema-break test | Rule-break test |
| --- | --- | --- |
| `shell` | `shell-tool.test.ts`, "a schema violation returns its errors and runs nothing": an unknown field, a missing command and a timeout beyond the bound, each with its path, each running nothing, and a corrected input accepted. `union-values.test.ts`, "the shell takes a command and an optional timeout, and nothing else" | The tool's rules are its schema's: a command is a non-empty string and a timeout is a positive number within the bound, which the schema holds. The shell has a `ToolInputJudge` of its own, with the same `rejectedToolInputsPerTurn` bound as `run_scope_tests` and its own count, and `endedAs` reports either judge's exhaustion as `invalid-submission` |

No submission union member was added, so no submission schema changed.

## 7. Every union value has a producer and a test

`union-values.test.ts` gained three cases.

| Union | Values written and read back | Values with no producer in a run yet |
| --- | --- | --- |
| `Observation.type` | All ten. `mutation`, `hook-check` and `excursion` gain producers in a run here | — |
| `coverage-gap.kind` | All six. `unguarded-shell` and `changed-paths-unknown` gain producers with the shell and the snapshot; `observation-truncated` gains one in recovery | — |
| `mutation.observedBy` | Both, each with a producer: `tool` after every settled mutating call, `snapshot` when the writer settles | — |
| `hook-check.mode` | Both: `changed` for the ordinary case, `complete` for the two fallbacks | — |
| `hook-check.outcome` | All three, with producers for `findings` and `not-checked` in a run and for `passed` at the unit level | A run test's `ramify` answers its version and nothing else, so `passed` has no producer in a run; it is proved against a chosen `ramify` in `hook-checks.test.ts` |
| `activity.kind` | Unchanged; the `tool` member gained an optional `command`, written and read back | — |
| `GateAttempt.cause` | Unchanged from iteration 6 | `guarded-change` still has no producer: an unguarded write to a guarded configuration file would give it one, and iteration 10 owns that |

## 8. The tests

67 files, 484 tests. Five test files are new; three existing files were
extended.

| File | Tests | What it covers |
| --- | ---: | --- |
| `shell-tool.test.ts` | 7 | The shell over real commands: the tail and the file, a timeout, rule 10, a descendant settled by its group, and settlement of a command still running |
| `hook-checks.test.ts` | 8 | The post-write check over a `ramify` whose answers the test chooses, and a run in which a failed tool is still a mutation |
| `read-excursions.test.ts` | 6 | The soft read boundary: first entry, a second module, the scope itself, generated views, unowned paths, and an invocation with no scope |
| `unguarded-write.test.ts` | 1 | The guard this plan names, and X6 |
| `late-writes.test.ts` | 1 | C3 |
| `union-values.test.ts` | 20 → 23 | Section 7 |
| `run-recovery.test.ts` | 18 → 19 | One new row of the recovery table |
| `line-events.test.ts` | 6 → 9 | The unmapped bucket, a binary file, and the shell's gap |

### The recovery table, extended

Iteration 6's eighteen rows stand. One is added.

| Crash after | What recovery does | Duplicate avoided |
| --- | --- | --- |
| `writer-released`, with a file the shell wrote in the tree | Keeps the file exactly as it is, closes the invocation `failed`/`session-lost`, records the `observation-truncated` gap on its observation log, then interrupts | No second release, no second writer, no gate and no second commit |

## 9. Deviations from the brief, with reasons

1. **The write scope was widened beyond the brief's five locations.** The
   brief names `src/hooks/`, `src/tools/`, `src/run/`, `src/kpi/` and the
   `module.ramify` of `harness`. Also changed:
   - `src/interfaces/protocol/jobs.ts` and `src/jobs/activity.ts`: the brief
     requires that each shell call be "an `activity` observation holding the
     command text", and the activity vocabulary had nowhere to hold one. The
     `tool` member gained an optional `command`, filled from any tool input
     that carries a string `command` field, which is additive and leaves
     every existing line valid.
   - `src/run/records.ts`: `bytes` on a line-event path, for the brief's
     "binary files with byte counts", and two `runLayout` entries for the
     shell's output and the hook check's log.
   - `subs/evidence/src/git.ts` with its `module.ramify`:
     `worktreeLineChanges` had no byte count to report, and the shell's
     description names the executor's tail bound, so `outputTailBytes`
     crosses.
   - `src/work/engineer.ts`, `src/prompts/engineer.system.md` and
     `src/prompts/engineer.procedure.md`: the role is given a tool, so its
     package must offer it, and the two prompts said in as many words that
     it had no shell.
   - `subs/harness/README.md` and `subs/evidence/README.md`: the
     responsibilities they describe changed.
2. **`WriterOwnership.register` is still not called, and the shell settles
   itself.** The plan's SM9 settles "registered process groups". The lifted
   executor's wrapper script *is* the group leader, and the process Node
   spawns is the wrapper, which sits in the harness's own process group:
   registering that identifier and killing `-pid` would kill the harness.
   The shell therefore settles through the executor, by aborting each
   in-flight command, which sends TERM to the wrapper, whose trap kills the
   group it leads with TERM and then KILL. `Equipment.settle` runs before
   the writer is released, so the ordering the plan requires is unchanged.
   `shell-tool.test.ts` proves both halves: the descendant of a finished
   command and the group of a command still running.
3. **A `not-checked` from the CLI does not force a complete check.** The
   brief asks for the complete fallback in two cases — a named configuration
   file and a changed set that cannot be established — and those are the two
   the harness decides itself, at once, without running anything. An exit of
   2 for any other reason, such as a cold daemon or an expired deadline, is
   recorded with the CLI's reason and permits continued editing, as the main
   plan's command table says. Forcing a complete check on every expired
   5-second deadline would run the project's whole analysis after most
   edits.
4. **The excursion reminder is delivered through the next mutating call's
   result.** The port reaches a running session with text in exactly one
   place, `afterMutation`, and a read is not a mutation. The observation is
   recorded when the read happens; the reminder waits for the next mutating
   call and is given once per module. An invocation that reads outside its
   scope and then mutates nothing is never told, which is recorded in
   section 11 rather than papered over.
5. **`ownerOf` no longer treats the root module's directory as owning the
   project.** The brief requires an `unmapped` bucket "never attributed to
   the root", and with a prefix rule the root owns every path. A module owns
   a path when its own source areas or its two declaration files hold it,
   which is the same definition an assignment's write scope uses. The guard
   observation's `owner` field uses the same function, so a write to a path
   no module's contents hold now records `owner: null` instead of the root.
6. **`observation-truncated` gained its producer here.** It had none. An
   invocation the harness was interrupted in has an observation log appended
   without a transaction, by decision 2, so its last lines may be missing;
   recovery records the gap on that log rather than leaving the silence to
   be read as an invocation that observed nothing more.
7. **`late-writes.test.ts` runs with the policy's own stop grace, not the
   test helper's.** `openRuns` uses `stopGraceMs: 500` to keep tests quick.
   Settling a real command and reading the tree takes longer than that, and
   the run's terminal event is its last write, so the invocation the driver
   had open would have been closed after it and refused. The test passes
   30,000 ms, which is `stopSettleMs` from the policy table. No production
   code was changed for it; a run under the real policy has the real bound.

## 10. The measured size of the owners this iteration changed

From `ramify measure`, with the daemon stopped.

| Owner | Production files | Production bytes | Test files | Test bytes |
| --- | ---: | ---: | ---: | ---: |
| `ramify-agent/harness`, after iteration 6 | 53 | 415,701 | 40 | 401,869 |
| `ramify-agent/harness`, now | 58 | 456,001 | 45 | 450,154 |
| `ramify-agent/harness/evidence`, now | 6 | 47,604 | 7 | 27,676 |
| `ramify-agent/harness/agent`, now | 2 | 32,276 | 4 | 28,063 |
| `ramify-agent/harness/agent/pi`, now | 1 | 28,656 | 8 | 69,278 |
| `ramify-agent/harness/ledger`, now | 5 | 25,487 | 12 | 47,887 |
| `ramify-agent` (root), now | 2 | 4,576 | 1 | 1,694 |
| `ramify-agent/web`, now | 10 | 19,159 | 5 | 10,430 |

`harness` grew by five production files — `tools/shell.ts`,
`hooks/post-write.ts`, `run/mutations.ts`, `run/excursions.ts` and
`kpi/guarding.ts` — and five test files.

## 11. What the next iteration must know

- **The shell is unguarded and that is the design.** Nothing in the harness
  prevents a shell write, and nothing may claim it does. An evaluation that
  reports blocked calls carries `guardingReport` beside them, which states
  which tools were guarded and refuses `complete` while an unguarded tool
  mutated. Iteration 11's KPI projections read it rather than inventing a
  second statement.
- **`InvocationOutcome.outsideScope` is filled for writers only.** It comes
  from `git status` at settlement compared with the invocation's
  `guarded` scope. An invocation that holds no scope reports every changed
  path as outside it, which is why `takeMutationSnapshot` is given the scope
  and not the assignment.
- **A writer invocation now passes `guarded` to `runInvocation`.** Iteration
  6 gave `equip` the scope through a closure; the snapshot and the excursion
  watcher need it too, so it is a field of the request. A later writer role,
  such as iteration 9's contract engineer, sets `writer`, `guarded` and
  `equip` together or it gets neither the snapshot nor the excursions.
- **`Equipment` gained `afterMutation` and `settle`.** A role that gives its
  session a mutating tool supplies both: the mutation observation and the
  hook check live in `afterMutation`, and whatever the tools started is
  ended in `settle`, which runs before the writer is released.
- **The hook check is per invocation, not per run.** `FindingsSeen` is
  built in `equip`, so a finding is newly introduced relative to the
  invocation that is being told about it. A repair round is a new invocation
  and hears about the findings again, which is what a repair round is for.
- **A shell call makes the invocation's line events `partial`.** Two
  snapshots cannot see a change a command made and reverted. Any KPI that
  divides by a line count must read `coverage` first.
- **Do not let a resident Ramify daemon analyse a temporary project.**
  Unchanged from iterations 4 and 6, and unchanged by the hook check: run
  tests get a `ramify` that answers its version and nothing else, so their
  hook checks are `not-checked` with that stub's reason.
- **Stop the daemon before the materialization an iteration reports.**
  Unchanged.
- **`scripts/real-session.ts` still has no command to send** and `src/cli.ts`
  still parses `--agent` and `--model`, as iterations 5 and 6 recorded.
  Outside this brief's scope and left alone.
- **Nested-package discovery still walks to depth 5, not the plan's 4.**
  Unchanged and still flagged where the constant is defined.
- **`subs/harness/src/.ramify/` and `subs/harness/src/tests/.ramify/` are
  still stale**, as iterations 1 to 6 recorded. `npm run check:self` does not
  read them.

## 12. Not done, with the reason

- **No pi session with a real provider was run.** This iteration is not one
  of the three the iterations README permits to touch pi. That the real
  adapter guards a harness tool declaring itself `mutating`, calls
  `afterMutation` for it, and withholds pi's own `bash`, is already proved by
  iteration 3's `guarded-writes.test.ts` against the offline scripted
  provider; the shell is such a tool and needed no new pi test. Whether a
  real provider calls a tool whose schema has an optional field is open
  beside iteration 3's other provisional answers, and iteration 12's live
  trial settles them.
- **An excursion by an invocation that never mutates is recorded but not
  reminded.** See deviation 4. Giving the port a hook for a non-mutating
  call would change the port, which this brief does not scope; it is noted
  for whoever next revises the port.
- **A shell command's own process group is not registered with the writer.**
  See deviation 2. `WriterOwnership.register` therefore still has no
  production caller, and `Settlement.groupsKilled` is 0 for every run. What
  settles a command is the executor and the tool's own `settle()`, which is
  what the tests exercise.
- **The snapshot observation is lost if the harness is interrupted between
  the release and the read of the tree.** The release event is appended
  first, because it is the record of settlement; the observation follows.
  Decision 2 accepts that an interrupted invocation may lose its last
  observations, and recovery now records `observation-truncated` on that log
  so the loss is visible. `outsideScope` is then `[]` for that invocation,
  and its `ended`/`interruption` pair says why.
- **`hook-check` observations are not deduplicated across a replay.** They
  carry no `callId`, so the observation log's `(callId, type)` rule does not
  apply to them. Nothing replays a hook check today: it is run by
  `afterMutation` during a live session, never re-derived from a record.
- **No projection of hook checks or excursions is exposed.**
  `guardingReport` is the harness's own, read by tests. Iteration 11 owns
  the protocol and decides what a client receives.
