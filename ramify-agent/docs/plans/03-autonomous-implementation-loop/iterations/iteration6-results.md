# Iteration 6 results: iteration assignments, engineers and the iteration gate

**Date:** 2026-09-20. **Status:** complete. The [brief](iteration6.md) is
satisfied: a local architect fixes one executable iteration with a recorded
write scope, an engineer works it with `edit` and `write` behind the write
guard and its own `run_scope_tests`, and the harness owns the verdict, the
repair rounds, the commit at an accepted boundary and the context budget.

A run over the `collection-review` fixture assigns one iteration, an engineer
repairs a real defect with `edit`, the `iteration` checkpoint passes over the
files its policy resolved from the tree as it stands, and the harness makes
one commit with its own message. That is this iteration's exit evidence and
it is executable.

## 1. Baseline

Run from `ramify-agent/` before anything was changed. All four pass, and each
matches [iteration 5's](iteration5-results.md) exit exactly.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  52 passed (52)
                                  Tests  385 passed (385)
=== npm run build:web ===    ✓ 280 modules transformed.   ✓ built in 264ms
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 135 source files, 6 resources, 1565 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 952 allowed, 0 denied, 613 external
```

## 2. The architect view this iteration worked from

| | Before | After |
| --- | --- | --- |
| Revision | `rev/1:7acddce6-d1ba-45a6-9b64-36d2838b0ac3:1` | `rev/1:6c1dcc7d-3ec9-4dfc-98b1-fbf7bad3c69e:1` |
| Input identity | `input/1:31d2a9b81ebe8cd8abf0a41eeb28e9c3c12305d8265418454b48cc04aaff2988` | `input/1:170e4c68655a6fba89b8952f5700f7b0381a3b8c0decdc23a8f6ff9deaf2c6b7` |
| Modules | 7 | 7 |
| Dependencies | measured | measured |
| Cut | 156 | 188 |

The before column is the view that was on disk when this iteration started,
read from `.ramify-architect/_meta.json` before anything was changed. The
after view was materialized from a stopped daemon, before any claim below
about the module tree: 7 modules, 797 records, dependencies measured. Its cut
is 188, so an absent detail in it is not evidence that behavior is absent.

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

No exposure crossed a new boundary: `harness/evidence` gains four exports to
its parent (`commitNameStatus`, `worktreeLineChanges`, `changedEntries`,
`isTestingModule`) on channels it already had. Nothing new is exposed by
`harness` to its parent or to its descendants.

## 3. What was delivered

### The assignment

`assign` is the local architect's third submission member. It commits an
outline revision where it carries one, and one `IterationAssignment` of kind
`ordinary`, `verification` or `repair`, through `iteration-assigned`.

The architect states the goal, the approach, the completion evidence, the
stage of its outline and the scope's base. Everything else is the harness's
and is in no schema: the identifier, the outline reference, the bootstrap
authority the registry gives, the resolved paths, the gate, its
`TestSelectionPolicy` and the guarded hashes. `union-values.test.ts` asserts
that over `z.toJSONSchema` output.

`WriteScope.resolved` is canonical and captured once. An ordinary assignment
reaches:

- the assigned module's own source area, `<dir>/src`, and its two declaration
  files, `module.ramify` and `README.md`;
- the complete directory of each immediate child it named — a child subtree
  is wholly included or wholly excluded, so a sibling nobody named is outside
  the scope whatever lies beneath it;
- each `extra` location beyond that base;
- for a bootstrap scope, the proposed owner's directory, resolved through its
  nearest existing ancestor because it does not exist yet.

The rules beyond the schema: the module is one the refreshed view has or one
an accepted registry proposal creates, an included child is a direct child
and never a descendant, an extra path lies under a module that exists or one
this assignment may create, a named capability is one the registry holds with
the owner the registry gives it, and the stage is one the outline in force
names. Without a view the rules that need one are not applied, as iteration 5
established.

### Test selection

`checks/selection.ts` resolves a policy against the current tree: each exact
owner's own `src/tests/`, every descendant owner's for an included subtree,
the ordinary `src/` of a testing module inside the selection, and the
`extraSuites` a registered obligation requires. Owner-to-directory mapping
comes from the refreshed architect view and from nothing else.

Every gate attempt, every repair and every call of `run_scope_tests` resolves
it again. `TestSelection.resolved` is recorded on the attempt, so a reader
sees which files ran and an empty list is visible rather than absent. A
discovery that fails is `not-verified` with `discovery-error`; a required
suite that is not in the tree is `required-suite-missing`; an empty required
selection is `empty-selection`. None of them ever falls back to an earlier
list.

### The engineer

One invocation per attempt, with `read`, `grep`, `ls` and the implementation's
own `edit` and `write` behind the guard, one harness tool `run_scope_tests`,
and the `EngineerSubmission` union of `completion-proposed`, `partial` and
`unsuitable`. It is a writer: `writer-acquired` is appended before
`startSession` and `writer-released` before anything checks or writes again.

`run_scope_tests` takes nothing. The assignment, its policy and the files
that policy currently selects are the harness's, and it resolves them anew on
every call. Its result is a diagnosis; only a gate accepts an iteration.

### The write guard

[resolve-contained-path.ts](../reuse/resolve-contained-path.ts) is placed in
`src/guard/` with its provenance comment and the adjustment the main plan
requires: `resolveRealTarget` takes `realpath` of the target, or of the
nearest existing ancestor of a path that does not exist yet with the
remaining components appended and validated, before the lexical containment
check runs. The lexical check itself is unchanged.

`decideWrite` answers `allowed`, `blocked-scope` or `blocked-unresolved`. A
block returns a concise explanation naming the target, the scope and its
revision, and directing the engineer to report the need or use the delegation
mechanism; it makes no mutation, does not end the session, does not request
approval and does not widen the scope. Every guarded call — allowed and
blocked alike — is a `guard` observation with the call, the tool, the
requested and resolved targets, the owner, the scope revision, the verdict
and the reason. The run, the work item, the iteration, the invocation and the
role are not repeated in it: the log is `invocations/<inv>/observations.jsonl`
and the `Invocation` beside it names all five, as the proposal's own fields
for this observation have it. The time is the line's `at`. No proposed file
contents are stored, and the totals of guarded calls are the counts of these
lines by verdict.

### The gate, repair and the commit

`runCheckpoint` resolves an `owned-by-scope` selection and runs the
`iteration` checkpoint: the resolved files through the project's own runner,
the project's type check and a complete Ramify check.

| Cause | What follows |
| --- | --- |
| `in-scope` | Concise diagnostics to the same engineer session and one repair round; the rerun runs the complete required set |
| `infrastructure`, `timeout` | A bounded rerun of the gate, with no code-repair assignment and the original cause preserved |
| `outside-assignment`, `guarded-change`, `unknown` | The iteration closes `unsuitable` and the local architect decides |
| exhausted | The iteration closes `exhausted`, naming the cause of the *first* failing attempt |

On a pass the harness commits the working directory on the run branch, as the
fourth external effect: the intent is `gate-attempted` with `committing`, the
commit is keyed by the gate attempt, and `gate-committed` names it. A repeat
after a crash finds the commit by its `Ramify-Gate` trailer and makes no
second one. A gate that passes with nothing changed makes no commit and
records `commit: null`.

`iteration-closed` commits the `IterationResult` and carries a
`module-created` or `module-removed` notice for every `module.ramify` the
commit added or removed, with the placement decision that proposed it or
`null` when none did. The notices are read from `git show --name-status` of
the commit itself and never from what an agent said; the message lists the
same modules under `Modules created:`, read from `git status` immediately
before the commit is made.

### Context budget and line events

An invocation that ends `context-budget-reached` records the threshold, the
observed size and whether the report arrived. The counter is keyed by the
iteration, not by the session: it is counted over committed history from the
`Invocation` records the log carries, so a fresh session does not reset it
and neither does a repair round. The third return closes the iteration
`partial` and returns it to the local architect.

Each writer invocation's `LineEventSummary` is written beside it, from two
snapshots of the working directory taken around the session: `git diff
--numstat HEAD` for what git tracks, and the lines of each untracked file
beside it. A session that changed nothing has an empty summary and still
counts as a session. `kpi/sessions.ts` is the projection that counts them.

## 4. The two open questions this iteration was asked to settle

### Is a run ever resumed in place? **No, and this iteration implements that.**

A run without a terminal event is `interrupted` on load, its record files are
re-materialized from the log and each external effect whose intent has no
completion is performed again — and then it stops. It is not driven further,
and loading it a second time appends nothing.

That is what the inputs say, rather than a policy invented here:
`job-interrupted` is a terminal event of the run log, and the log refuses
anything after a terminal event. The main plan's SM10 gives recovery three
duties — replay, re-materialize, repeat the unfinished effects — and names no
fourth. The plan has no event that un-interrupts a run and no command that
resumes one; C4, which this iteration owns, asks only that a restart between
`gate-attempted` and `iteration-closed` "recovers the acceptance and makes
the one commit", which is exactly the effect being performed again.

What an interrupted run leaves is therefore what the log holds: closed work
items stay closed, accepted iterations stay accepted, the commits the harness
made stay where they are, and the dirty tree stays as the engineer left it.
A person starts a new run, which reads the tree as it stands.

`run-recovery.test.ts` proves it: a crash after `iteration-closed` leaves the
accepted result byte for byte and its one commit in place, the run is
interrupted and the work item it was working is not closed by the
interruption; and an interrupted run whose first work item was already closed
keeps that item closed, starts it again, and appends nothing on a second
load.

**What is still open, and is not this iteration's:** whether a later plan
adds a resume command. It would need an event, a protocol command and a rule
for the invocations the interruption closed. Iteration 11 owns the protocol
and is the place to raise it.

### Where does `resolve-contained-path.ts` belong? **Iteration 6, here.**

Two inputs disagreed: iteration 2's brief assigns it to iteration 7, and the
main plan's [lifted-code table](../main-plan.md#code-lifted-from-cucumber-viz)
assigns it to iteration 6, owner `harness`, in `src/guard/`.

The main plan wins, for two reasons beyond its being the authority the
iterations README names. Its own brief says so too: iteration 6's [work
section](iteration6.md) begins "Place
[resolve-contained-path.ts](../reuse/resolve-contained-path.ts) in
`src/guard/`", with the adjustments and the tests it names. And the guard
could not be built without it: the rule that a guard must be called is
testable from the guard's first day only if the guard exists on that day,
which is the decision that put `edit` and `write` in this iteration at all.

Iteration 2's brief is the outlier and was written before that decision. It
is recorded here rather than edited, since a brief is a record of what its
iteration was asked to do.

## 5. Exit evidence

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

 Test Files  62 passed (62)
      Tests  454 passed (454)
   Duration  121.35s (transform 3.55s, setup 0ms, import 16.79s, tests 676.48s, environment 3.02s)

EXIT: 0

=== npm run build:web ===

> ramify-agent@0.0.0 build:web
> NODE_ENV=production vite build --config subs/web/vite.config.ts

vite v8.3.0 building client environment for production...
✓ 280 modules transformed.
dist/web/index.html                   0.39 kB │ gzip:   0.27 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DIDBJLm_.js   402.20 kB │ gzip: 121.78 kB
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
Completed scope: 7 owners, 156 source files, 8 resources, 2059 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 1322 allowed, 0 denied, 737 external

EXIT: 0
```

The whole suite was run three times over, with the same result each time,
before these figures were taken.

### The brief's exit evidence, item by item

| Item | Where it is proved |
| --- | --- |
| A run over the fixture where one work item is assigned, executed and accepted | `iterations.test.ts`, "a local architect assigns it, an engineer works it, the gate accepts it and the harness commits": the events in order, the assignment with its derived gate, the passing attempt with its resolved selection, the repaired source on disk and the one commit with the harness's message |
| A second work item revised across three outline revisions | `iterations.test.ts`, "three outline revisions, each from its own turn of one continuing session": three assignments, three accepted iterations, four outline revisions from four invocations of one session, and every earlier result still accepted |
| An assignment naming an absent module without accepted creation authority is rejected | `module-creation.test.ts`, "an absent owner with no accepted authority is rejected…" (rejected in a run, corrected in the same session) and `local-architect-submission.test.ts`, "the module is one the view has, or one an accepted proposal creates" |
| A valid proposed entry creates a new module with nested source directories and its first test, passes the gate and emits its creation notice | `module-creation.test.ts`, "a bootstrap assignment creates the module with nested source and its first test…": the bootstrap captured from the registry, `src/store/notes.ts` in a directory that did not exist, the module in the refreshed view before the gate passed, the notice read from the commit, and `Modules created:` in the message |
| An assignment selecting a grandchild rather than a direct child is rejected | `local-architect-submission.test.ts`, "an included child is a direct child, never a descendant" |
| Two gate-time `TestSelection.resolved` lists that differ only by an included subtree | `iterations.test.ts`, "two assignments over one owner differ by exactly the included subtree's test files"; the same at resolver level in `test-selection.test.ts` |
| A newly added failing test prevents acceptance, including on repair | `iteration-gate.test.ts`, "a failing test added after the assignment, during repair, fails that attempt" |
| An initially testless owner can pass after adding its first test; leaving it testless produces `empty-selection` | `iteration-gate.test.ts`, "an owner with no test yet can add its first one; leaving it testless is not-verified" |
| A gate failing three times exhausts and returns to the local architect with the original cause | `iteration-gate.test.ts`, "a gate that fails three times exhausts and returns the original cause to the local architect" |
| A budget return followed by a fresh session that continues from files and does not reset the counter | `iterations.test.ts`, "it returns with its report, no compaction is recorded, and the third return exhausts the bound" |
| The X3 table, every row passing, on a fixture copy with a real symlink and a real new file in an existing directory | `write-guard.test.ts`, "the table: existing files, a new file, a traversal, a symlink and the assigned contract location" |
| A denied call through the real pi adapter, for the engineer and the contract-engineer roles | `subs/harness/subs/agent/subs/pi/src/tests/guard-installed.test.ts`, four tests, two per writer role |
| A gate that fails on a real defect, an engineer that repairs it with `edit`, and the one commit that follows | `iteration-gate.test.ts`, "a real failing assertion in scope returns in-scope diagnostics and one repair round" |
| `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self` | Above |

## 6. Acceptance cases owned

| # | Case | The tests that prove it |
| --- | --- | --- |
| G8 | One small work item completes in one iteration; another is revised across several without losing obligations | `iterations.test.ts`, the two tests of the `G8` describes. The first: one outline `single-iteration`, one assignment, one accepted iteration, one commit. The second: three assignments, three accepted iterations, four outline revisions, and each earlier result still accepted with its gate after the later ones committed |
| G9 | An accepted proposed entry owner reaches implementation | `module-creation.test.ts`. A valid `ModuleProposal` on an entry gives the first assignment its `bootstrap`; the engineer creates the declaration, the README, a nested `src/store/` and its first test; the refreshed view has the owner before the gate passes; the `module-created` notice is read from the commit and names no decision, because none proposed it. Beside it: an absent owner with no authority is rejected with its path, and a write outside the creation scope is `blocked-scope` and creates nothing |
| C4 | A crash after passing checks recovers the accepted result; a later source change invalidates stale evidence | `accepted-commit.test.ts`, "a crash between the gate's pass and the commit's completion makes exactly one commit" (both boundaries), and "a later source change invalidates nothing: the accepted commit stays as it is". Beside them `run-recovery.test.ts`, "a crash after iteration-closed leaves the accepted iteration accepted and its one commit where it is". By Dan's decision of 2026-09-20 a later source change invalidates nothing: it is uncommitted work for the next gate |
| K3 | Exact-owner and included-child-subtree test selection are both exercised | `iterations.test.ts`, "two assignments over one owner differ by exactly the included subtree's test files": two gate attempts over `workspace/reviews`, whose `TestSelection.resolved` differ by exactly the four test files of `reviews/core` and its two children. `test-selection.test.ts` shows the same at the resolver, with the sibling subtrees that contribute nothing |
| K5b | An invalid session, a test timeout and exhausted repair limits retain distinct causes and recovery paths | `iteration-gate.test.ts`, the two `K5b` tests and the exhaustion test. A session the implementation can no longer read is reconstructed from records, recorded on the invocation as `requested: continued`, `actual: fresh` with its reason, and the repair rounds are unchanged; a scoped run that never answers is `not-verified`/`timeout` with one infrastructure retry and then `exhausted`, proposed by the same invocation because a timeout is never repaired by the engineer; exhausted repair rounds preserve the first attempt's cause |
| X1a | An engineer threshold returns partial evidence without compaction or false completion; repeated returns do not reset limits | `iterations.test.ts`, "it returns with its report, no compaction is recorded, and the third return exhausts the bound": three invocations each ending `context-budget-reached` with threshold 140,000, the observed size and the report delivered; each after the first a fresh session with an incremented attempt; no `compaction` observation for the role, whose policy forbids it; the third closes the iteration `partial` |
| K1 | A module gate fails, returns concise diagnostics, is repaired and reruns the complete gate | `iteration-gate.test.ts`, "a real failing assertion in scope returns in-scope diagnostics and one repair round": `cause: 'in-scope'`, `next: 'repair'`, exit code 1 and the runner's own output in the tail, then a second attempt at `repairRound: 1` running the same three commands and passing. The failing attempt committed nothing and the passing one committed once |
| K2 | A global work-item gate exposes a failure outside the last engineer's scope; the local architect assigns repair and rechecks | `no-rewind.test.ts`, "the work-item gate returns it to the local architect, who assigns the owner that failed": raising the note limit breaks a consumer module's own test, the work-item gate runs the whole project beside the last assignment's selection, that selection passes while the project's tests fail, the attempt is `outside-assignment` / `return-to-local-architect`, and the architect's repair assignment over the failing owner leads to a passing work-item gate |
| K8 | Every gate resolves current tests under the captured policy | `iteration-gate.test.ts`, the three `K8` tests, and `test-selection.test.ts`. A test written after the assignment runs in the attempt that follows, including during repair; an initially testless owner is `empty-selection` and never a pass, and can add its first test; a discovery that fails is `not-verified` with an empty list rather than the earlier one; a required suite that is not in the tree is `required-suite-missing` |
| X3 | Allowed and denied `edit`/`write` targets cover existing files, new files, traversal, symlinks and explicit contract or exposure locations | `write-guard.test.ts`, the three `X3` tests. A fourteen-row table over a real directory, each row asserting the verdict and the resolved target; then that nothing of the project changed and no denied path came into being. Beside it: an excluded child subtree, and a bootstrap scope that reaches a directory that does not exist while a second module beside it stays outside |
| X4 | Denied tools do not mutate, return useful guidance and stay deduplicated across replay while a new retry is counted separately | `iterations.test.ts`, "every guarded call is an observation; a replay is dropped and a new call to the same target is not": two denied calls to one target and one allowed call give three `guard` observations with three call IDs, the denied target is unchanged on disk and the allowed one is written, and replaying the first observation into the same log is dropped while the same data under a new call ID is recorded |
| X5 | A path-resolution failure differs from a proven scope violation | `write-guard.test.ts`, the two `X5` tests: `blocked-unresolved` and `blocked-scope` with distinct verdicts, distinct reasons, and a resolved target only where one was proven. A path beneath a file and a real symlink loop are each unresolvable; a sibling module is a proven violation |
| M5 | Failed, stopped, repaired, context-limited and no-change sessions remain in usage and session counts | `line-events.test.ts`, "failed, stopped, repaired, context-limited and no-change sessions are all in the session set": five constructed invocations, all five in the session set, the no-change one contributing no change weight, and one session whose usage was unavailable making the total unavailable rather than smaller |

## 7. Guards owned

| Guard | Test | What it asserts |
| --- | --- | --- |
| A guard nothing calls: a denied call through the real adapter for every writer role | `subs/harness/subs/agent/subs/pi/src/tests/guard-installed.test.ts` | For `engineer` and `contract-engineer`: a real pi session over the scripted provider asks the guard about every mutating built-in, in order, with its call ID; a denied `write` and a denied `edit` write nothing while the allowed one does; the reason reaches the model as that call's error result and the session goes on to submit |
| Adding a work item, an iteration or a repair leaves every completed one completed | `subs/harness/src/tests/no-rewind.test.ts` | Everything the first iteration wrote is frozen the moment it closes and is byte for byte identical, with the same modification time, after a repair round, a second iteration and a second work item; one closing event per iteration and per work item; both commits on the branch; the closed work item never started again |
| A change to the working directory blocks nothing: a gate that passes is followed by one commit, and a crash between them makes one commit | `subs/harness/src/tests/accepted-commit.test.ts` | A file written between the gate's pass and its commit is in that commit; a crash at `gate-attempted` and one at `gate-committing` each leave exactly one commit carrying that gate's trailer, one `gate-committed` line and an attempt whose `commit` is not null |

The cross-cutting JSON validation rule applies to `assign`, to all three
`EngineerSubmission` members and to `run_scope_tests`.

| Subject | Schema-break test | Rule-break test |
| --- | --- | --- |
| `assign` | `local-architect-submission.test.ts`, "rejects an unknown kind, an unknown field and a missing outline…" and "an assignment carries no gate, no test selection and no guarded hashes" | The five rule tests of "the rules an assignment must satisfy", and in a run `module-creation.test.ts`'s rejection of an absent owner, corrected in the same session |
| `EngineerSubmission` | `engineer-submission.test.ts`, "it rejects an unknown kind, an unknown field and a missing summary, with a path for every error" and, in a run, "a broken schema returns every error to the same session, and a corrected input is accepted" | "a submission may not carry a line that reads as one of the commit's trailers", "a partial report names what was done or what is unfinished", and in a run "a rule the schema cannot hold is answered the same way, and the bound ends the invocation" |
| `run_scope_tests` | `engineer-submission.test.ts`, "the harness tool takes nothing, and an input with a field in it is refused" | In a run, "a harness tool's input is judged too: the call is answered with its errors and the bound ends the invocation" |

Each asserts that nothing changed, that every error carries its path, that a
corrected input is accepted, and that the bound ends the invocation as
`invalid-submission`.

## 8. Every union value has a producer and a test

`union-values.test.ts` gained five cases.

| Union | Values written and read back | Values with no producer in a run yet |
| --- | --- | --- |
| `RunEvent.type` | All twenty-one, the two new ones included | `iteration-assigned`, `iteration-closed`, `writer-acquired` and `writer-released` all have producers now |
| `Observation.type` | All ten, `scope-tests` included | — |
| `coverage-gap.kind` | All six, `unsupported-runner` included | `unguarded-shell` and `changed-paths-unknown` arrive with iteration 7's shell and mutation observation |
| `LocalArchitectSubmission.kind` | All three the package offers | `request-placement` and `yield-for-providers` are not offered to the role, so no run can produce them; they arrive with iterations 8 and 9 |
| `EngineerSubmission.kind` | All three | `contract-needed` is not in the schema and is not offered; it arrives with iteration 9 |
| `EngineerSubmission.unsuitable.reason` | `scope` | `break-discovered`, `obligation-change`, `unplaced-need` and `provider-cannot-conform` are not offered, because no iteration can act on them yet. Iterations 10, 9 and 8 add them |
| `IterationAssignment.kind` | All six | Only `ordinary`, `verification` and `repair` are assignable; `breaking` arrives with iteration 10, `contract` with iteration 9, `integration` later |
| `WriteScope.base` | Both arms | The explicitly broad arm has no producer until iteration 10's breaking scope |
| `WriteScope.extra[].purpose` | All five | Only what a local architect names today; the contract purposes gain their producer with iteration 9 |
| `IterationResult.outcome` | All five | `accepted`, `partial`, `unsuitable` and `exhausted` have producers here; `superseded` arrives with the stop and supersession path |
| `ModuleNotice.kind` | Both, with and without a decision | `module-removed` has no producer in a run yet: nothing this iteration assigns deletes a declaration. The `decision` arm gains a producer with iteration 8 |
| `GateAttempt.cause` | All values are representable | `invalid-session` has no producer as a *gate* cause: a session the implementation cannot read is an invocation-level condition, recorded on the invocation as a degraded session mode. `guarded-change` has a producer only through an unguarded write, which is iteration 7's |
| `SessionMode` | `fresh` and `continued` have producers; `fork` arrives with iteration 8 | — |

## 9. The tests

62 files, 454 tests. Ten test files are new; five existing files were
extended.

| File | Tests | What it covers |
| --- | ---: | --- |
| `write-guard.test.ts` | 8 | X3, X5, the block's text, and the lifted resolver |
| `test-selection.test.ts` | 9 | K3 and K8 at the resolver, over a real copy of the fixture |
| `iterations.test.ts` | 5 | G8, K3 at gate time, X1a, X4 |
| `iteration-gate.test.ts` | 7 | K1, K8 and K5b |
| `accepted-commit.test.ts` | 4 | The commit guard and C4, and the message as a pure function |
| `module-creation.test.ts` | 2 | G9 |
| `no-rewind.test.ts` | 2 | The no-rewind guard and K2 |
| `engineer-submission.test.ts` | 9 | Rule 10 for the engineer and for its tool |
| `line-events.test.ts` | 6 | Line events, the owner of a path, and M5 |
| `guard-installed.test.ts` (pi) | 4 | The guard guard, for both writer roles |
| `union-values.test.ts` | 16 → 20 | Section 8 |
| `run-recovery.test.ts` | 14 → 18 | Four new rows of the recovery table |
| `local-architect-submission.test.ts` | 10 → 15 | The five rules an assignment must satisfy |
| `analysis-submission.test.ts` | 19 | The prompt manifest, now three packages |
| `port-additions.test.ts` | 19 | The write built-ins, which now really write |

Two test helpers are new: `tests/helpers/views.ts` builds an architect index,
and `tests/helpers/iterations.ts` holds the submissions, the role script, the
runner and the two `RunInputs` a test can drive a run with.

### The recovery table, extended

Iteration 5's fourteen rows stand. Four are added, each one test of
`run-recovery.test.ts`, frozen at the boundary through the `afterWrite` hook.

| Crash after | What recovery does | Duplicate avoided |
| --- | --- | --- |
| `iteration-assigned`, with the assignment removed | Rewrites it from the log, then interrupts | No second assignment |
| `writer-acquired` | Closes that writer's invocation as `failed`/`session-lost`, then interrupts | No second writer acquired |
| `iteration-closed`, with the result removed | Rewrites it byte for byte, then interrupts | One commit, one closing line, and the work item not closed by the interruption |
| `iteration-assigned`, with an earlier work item already closed | Interrupts, and a second load appends nothing | The closed work item is never started again |

## 10. The measured size of the owners this iteration changed

From `ramify measure`, with the daemon stopped.

| Owner | Production files | Production bytes | Test files | Test bytes |
| --- | ---: | ---: | ---: | ---: |
| `harness`, after iteration 5 | 44 | 308,056 | 29 | 249,237 |
| `harness`, now | 53 | 415,701 | 40 | 401,869 |
| `harness/evidence`, now | 6 | 46,954 | 7 | 27,676 |
| `harness/agent`, now | 2 | 32,276 | 4 | 28,063 |
| `harness/agent/pi`, now | 1 | 28,656 | 8 | 69,278 |
| `harness/ledger`, now | 5 | 25,487 | 12 | 47,887 |
| `ramify-agent` (root), now | 2 | 4,576 | 1 | 1,694 |
| `web`, now | 10 | 19,159 | 5 | 10,430 |

`harness` is the iteration's own growth: nine production files and eleven
test files. `harness/evidence` grew by the git and view readers the run
needed; `harness/agent` by the write built-ins the fake now performs.

## 11. Deviations from the brief, with reasons

1. **The write scope was widened beyond the brief's five directories.** The
   brief names `work/`, `guard/`, `checks/`, `prompts/` and `kpi/`. Also
   changed, each because the brief's own "Established" list requires it:
   `src/run/` (the two new run-log events, the iteration loop, the scoped
   commands in the policy, the `refresh` seam, the `scope-tests` observation
   and the tool-input judge), `subs/evidence/src/` with its `module.ramify`
   (the git and view readers the scope, the selection and the notices read
   from), `subs/agent/src/scripted.ts` (below), the pi test helper and its new
   test file (which the brief names by path), `src/tests/` and
   `subs/harness/README.md`, whose responsibilities changed.
2. **The scripted fake's `edit` and `write` really write.** They reported
   their call and mutated nothing, so a scripted repair would have repaired
   nothing and the brief's "repair is real repair" could not have been shown.
   The fake is the port's second implementation and now matches pi's
   built-ins, with pi's own input shapes. `port-additions.test.ts` gained the
   assertions that a denied call leaves the file as it was and an allowed one
   changes it.
3. **`assign` carries no `localDecisions`.** The proposal's member commits
   "any local `PlacementDecision`s". `PlacementDecision` is a record iteration
   8 establishes, with a directory of its own; a field for a record that does
   not exist would have no producer and no test. `ModuleNotice.decision` is
   already `RecordRef | null` and says `null` where no decision proposed the
   module, which is every module today.
4. **`evidenceObligations` is committed empty.** Registered evidence is what
   iteration 9 registers; an architect cannot name an obligation the registry
   does not hold. `extraSuites` therefore has no producer in a run yet, and
   the `required-suite-missing` path is proved at the resolver instead of in a
   run. Iteration 9 gives it one.
5. **A failed discovery is `cause: 'infrastructure'`, not `'unknown'`.** The
   module inventory could not be refreshed, and no repair of the source would
   change that: it takes the bounded infrastructure path SM7 gives that cause,
   and never a code-repair assignment. `empty-selection` and
   `required-suite-missing` stay `unknown` and return to the local architect,
   because both are about the assignment. Found in practice: a materialization
   against a tree that has just changed can be superseded by a newer revision
   of the daemon's own analysis, and sending that to the engineer as a repair
   round would have been wrong twice over.
6. **`RamifyCli.materialize` repeats a failed request up to four times,
   waiting longer each time.** Same cause. A request superseded by a newer
   revision is transient and is the CLI's to resolve; nothing of the output is
   read to decide it, and a genuine failure costs three extra seconds and is
   then reported with its last message. `architectRunInputs` gained an
   optional `warn` so the reason reaches the harness rather than being lost;
   it has no production caller until iteration 11 starts a run from a client.
7. **`WriteScope.resolved.roots` are source areas and child directories, not
   module directories.** An owner's own contents are its `src/` plus its two
   declaration files, so the scope needs no list of carve-outs for the
   children it did not include: a child that is not named is simply not a
   root. This keeps `resolved` the proposal's `{ roots, files, view }`.
8. **A session the implementation can no longer read is detected with
   `appendContext`, and recorded on the invocation.** Before continuing, the
   harness appends a one-line note keyed by the iteration and the attempt,
   which iteration 0 verified costs zero model calls; `session-lost` is the
   answer that says the session is gone. The reconstruction is recorded as
   `session: { requested: 'continued', actual: 'fresh', degradedReason }`,
   which is what that field is for, and `sessionReconstructionsPerWork` is
   counted from those committed records. No new event and no new record type
   were needed, and `GateAttempt.cause: 'invalid-session'` is left without a
   producer rather than being invented.
9. **The work-item gate runs the last assignment's own selection beside the
   project's tests.** `cause` must derive from exit codes and never from
   output text, so the only mechanical way to tell a failure inside the last
   scope from one outside it is to run that scope's own selection too. It is
   recorded on the attempt like any other command, with its resolved files.
10. **The engineer's `unsuitable` offers one reason.** `break-discovered`,
    `obligation-change`, `unplaced-need` and `provider-cannot-conform` belong
    to iterations 10, 9 and 8; a value the prompt package offers is one a run
    can produce, so they are not in the schema yet.
11. **`test-selection.test.ts` and most run tests read the module inventory
    from the project's own `module.ramify` declarations.** The refresh itself
    is proved against the installed Ramify in `iterations.test.ts` and
    `module-creation.test.ts`, which is where it matters: a module created
    mid-run must appear in the refreshed view before its gate can pass. A
    test that only needs to know which directory an owner is in reads the same
    fact from the same tree with `treeInputs`, which costs no analysis. The
    substitution is the view reader, never the check: every command those
    tests run is spawned and its exit code read.
12. **Test discovery applies Vitest's default file patterns rather than
    reading the project's configuration.** The resolver walks each owner's
    test area for `*.test.*` and `*.spec.*`, skipping `node_modules`, `dist`,
    `coverage`, dot-directories and any directory carrying the harness's
    empty-selection marker. The fixture's own `include` is a subset of that,
    so the two agree there; a project with a narrower custom `include` could
    disagree, and that is recorded in section 13 rather than claimed.

## 12. What the next iteration must know

- **One invocation still goes through `RunService.runInvocation`.** A writer
  adds three things to the request and nothing else: `writer: true`, an
  `equip` function that is given the invocation's observation log and the
  identifier of the call in flight for each tool, and an optional `endedAs`
  for a bound only the caller can see. `equip` returns the built-ins, the
  harness tools and the guard, built once with that log, so everything the
  session does is recorded against the invocation that did it. Iteration 7's
  `shell` tool and its mutation observation belong there.
- **`writer-acquired` is appended inside `runInvocation`, before
  `startSession`, and `writer-released` inside `settleSession`.** Neither is
  the caller's to append. An unconfirmed release still blocks every writer
  and every gate that follows.
- **Every run-log write still goes through `RunService.write`.** The
  iteration phase adds two transitions and both go through it.
- **The iteration loop is `takeIteration`, with the gate loop inside it.** The
  engineer loop runs one invocation per attempt; the gate loop inside it
  reruns the same gate for an infrastructure retry without a new invocation.
  A new cause belongs in one of those two switches and nowhere else.
- **Counters are read from committed records, not from memory.** Budget
  returns are counted from the `invocation-ended` events whose `Invocation`
  names this iteration; reconstructions from the invocations of this work item
  whose requested and actual session modes differ. `work/committed.ts` reads
  assignments, results and invocations back from the log for that.
- **The guard needs the scope, not the assignment.** `guardedScopeOf` gives
  it `{ revision, roots, files }` and nothing more, so a second guarded tool
  needs no new machinery — only a target the guard can find in its input.
- **A materialization can be superseded, and the harness now retries it.**
  Four attempts with a growing pause. If a later iteration sees
  `discovery-error` in a gate, that is the bounded infrastructure path doing
  its job, not a defect in the assignment.
- **Do not let a run test share one Ramify daemon across fixture copies.**
  Iteration 4's warning holds, and this iteration found its sharper form: a
  private daemon that has analysed a temporary project which is then removed
  becomes unreliable for the next one under load. A test that needs the real
  view starts its own daemon and disposes it with the test.
- **Stop the daemon before the materialization an iteration reports.**
  Unchanged.
- **`scripts/real-session.ts` still has no command to send** and `src/cli.ts`
  still parses `--agent` and `--model`, as iteration 5 recorded. Both are
  outside this brief's scope and were left alone.
- **Nested-package discovery still walks to depth 5, not the plan's 4.** Not
  this iteration's to settle, and still flagged where the constant is defined.
- **`subs/harness/src/.ramify/` and `subs/harness/src/tests/.ramify/` are
  still stale**, as iterations 1 to 5 recorded. `npm run check:self` does not
  read them.

## 13. Not done, with the reason

- **No pi session with a real provider was run.** This iteration is not one of
  the three the iterations README permits to touch pi; its own pi test uses
  the offline scripted provider, as iteration 3's do. Whether a real provider
  accepts the `EngineerSubmission` union discriminated on `kind` is open
  beside the same question for the two earlier unions; iteration 12's live
  trial settles all three.
- **The harness's own `decideWrite` is not the guard the pi test installs.**
  `harness` does not expose the guard to its descendants, and exposing it so
  that a descendant's test could import it would be the wrong change for the
  wrong reason. The pi test proves what only it can: that the real adapter
  calls the guard for every mutating built-in of every writer role, that a
  denial mutates nothing, and that its reason reaches the model. What the
  harness decides with that contract is proved against real paths in
  `write-guard.test.ts` and through real runs in `iterations.test.ts`.
- **`extraSuites` has no producer in a run.** See deviation 4.
- **`module-removed` has no producer in a run.** Nothing this iteration
  assigns deletes a module declaration. The notice is representable, written
  and read back; iteration 10's breaking work is where a run could produce
  one.
- **A project with a custom Vitest `include` narrower than the default is not
  handled.** See deviation 12. Asking the runner what it would select — `vitest
  list` — is the honest fix and needs the target project's dependencies
  installed, which the fixture copies do not have. Recorded for whoever needs
  a project whose configuration differs.
- **The shell, mutation observation from `git status` and hook checks are not
  here.** They are iteration 7's, by decision 12. `InvocationOutcome.outsideScope`
  is still `[]` for every invocation, and zero blocked calls is not proof of
  scope compliance while an unguarded writer exists.
