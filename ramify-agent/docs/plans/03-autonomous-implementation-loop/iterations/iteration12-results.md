# Iteration 12 results: integrated trials and the completion gate

**Date:** 2026-09-21. **Status:** complete, in two parts. The
[brief](iteration12.md)'s work is delivered where it could be done: the
composition suite, the small fixture plan and its trial, the breaking trial
(T3), the write-scope verification, the review sheet, the measured
re-evaluation and the [completion report](../completion-report.md). **The
real pi trial (T2) did not run**: there is no pi login in this environment,
and nothing was simulated in its place. The iteration's exit evidence is
therefore met except for that trial, whose reason is recorded.

The iteration was delivered in two sessions, split at the seam its brief and
the [iterations README](README.md#sizing) allow: code, tests, scripts and the
first trial, then the remaining trials and the reports.

| Part | What it delivered | Sections |
| --- | --- | --- |
| 1 | The composition suite (T1), the recovery table over SM1–SM10, the union inventory, `acceptance-evidence.json`, `composition-gate.ts`, the fixture trials' machinery, `live-trial.ts prepare`/`verify`, the `status-badge-tone` plan and its trial, and the production defect of the unenforced run limits | 1–13 |
| 2 | The pi check and T2's not-run record, T3 with its verification and a corrected trial check, the first run of the composition gate, the architect view refresh and the measurement, the review sheet (T4), the completion report, the main plan's status and the final exit gate | Part 2, sections 14–23 |

Sections 1 to 13 are part 1's record as written, except section 7, which
states the iteration's final acceptance results, and section 13, which part 2
closed.

## 1. Baseline

Run from `ramify-agent/` before anything was changed. All four passed and
matched [iteration 11's](iteration11-results.md) exit.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  81 passed (81)
                                  Tests  614 passed (614)   Duration  188.24s
=== npm run build:web ===    ✓ built in 394ms               EXIT: 0
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 209 source files, 13 resources, 3209 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 2307 allowed, 0 denied, 902 external
```

Architect view on disk at the start: revision
`rev/1:a351a699-8f65-4588-b413-14182c0fc9a0:1`, input identity
`input/1:0a0d3510ef11eaf28f2d512183bff651b1d020255c9b70a47dd79fc4795e87b4`,
7 modules, dependencies, test references and metrics measured, cut 307. The
view was **not refreshed** in part 1; no module was declared or removed and no
`module.ramify` of ramify-agent was changed. Part 2 refreshes it before any
claim about the module tree.

## 2. The pi login

Checked at the start and again before the trials: `~/.pi` does not exist.
Plan 1's trial authenticated pi with the person's Claude Code OAuth token,
exported as `ANTHROPIC_OAUTH_TOKEN` by the person for that one command; no
such variable is set here, and taking a credential from Claude Code's own
store without the person's say is not this iteration's to do. **No pi login
was present, no pi session ran, and nothing was simulated in its place.**
Part 2 must check again before recording T2.

## 3. The fixture's toolchain installs and runs

The earlier notes' explanation was right in cause and wrong in consequence:
`@modelcontextprotocol/sdk` was installed nowhere because nothing had run
`npm ci` in a copy. In a disposable copy (never in `fixtures/` itself):

```text
npm ci --no-audit --no-fund      added 233 packages in 2s          exit 0
npm test                         Test Files 20 passed (20), Tests 77 passed (77)
npm run type-check               tsc --noEmit -p tsconfig.json     exit 0
ramify check --batch --root <copy>
  Execution: completed; check: passed; coverage: complete
  Completed scope: 15 owners, 54 source files, 5 resources, 294 accesses
  Findings: 0 errors, 2 warnings, 0 analysis limits; 166 allowed, 0 denied, 128 external
  (the two warnings: vite.config.ts and vitest.config.ts are outside module source)
```

`--batch` is an independent disposable session, so no resident daemon analysed
the copy.

## 4. What part 1 delivered

### The composition suite (T1)

| File | What it holds |
| --- | --- |
| `subs/harness/src/tests/helpers/composition.ts` (new) | Fourteen scripted scenarios over real fixture copies: `iteration`, `delegation`, `placement`, `access`, `breaking`, `repair`, `testless`, `revision`, `cycle`, `stop`, `agent-fails`, `no-submission`, `invalid-analysis`, `over-limit`; `runToEnd`, `crashAt` (abandon the service at a boundary, as a crash leaves it), the log reader and the duplicate identities |
| `subs/harness/src/tests/helpers/recovery-table.ts` (new) | The recovery tables of SM1 to SM10 as one table keyed by the run service's own `RunWrite` union (`satisfies Record<RunWrite, …>`, so a new boundary without a row does not compile), plus two narrowed rows (an SM8 budget return, an SM10 stop). `verifyRow` crashes, **deletes every record file the log commits**, restarts twice and asserts: no agent session started; the log up to the crash is byte-identical; recovery appends exactly the row's stated events, each a completion of something the log held open; no work, obligation, decision, brief, effect or gate commit is duplicated; every record file is materialized again byte for byte; `job.json` untouched; a second restart changes nothing |
| `composition-recovery.test.ts`, `composition-recovery-delegation.test.ts`, `composition-recovery-chains.test.ts` (new) | The 35 rows, split across three files only so they run in parallel (≈136 s wall together) |
| `subs/harness/src/tests/composition.test.ts` (new) | Runs every scenario to its end; asserts the table covers all 33 boundaries and SM1–SM10 and that the three files run every row; runs every query over every composed run and asserts the log, every file and `git status` unchanged; the union inventory; the acceptance matrix |
| `subs/harness/src/tests/helpers/unions.ts` (new) | Walks the zod schemas for every union (enum, union of literals, discriminator) and walks recorded values against them |
| `docs/plans/03-autonomous-implementation-loop/acceptance-evidence.json` (new) | The executable form of the main plan's matrix: 46 cases, owner iteration, owning test files and titles, or trial/document evidence |
| `scripts/composition-gate.ts` (new) | Runs every matrix test file with Vitest's JSON reporter and reports each case met or not by name; trial and document cases from the retained evidence. **Not yet run**: part 2 runs it (with `--with-trials` once T3 is retained) |

**The union inventory.** 108 unions, 443 values, found by walking the
schemas of the run log, the observation log, every record registry, the five
submission unions, the two harness tools, the run command, the error response
and every query response. Every value is classified:

| Producer | Values |
| --- | ---: |
| written by one of the composed runs and walked from its records, log, observations, submissions or query answers | 343 |
| a named test in which the harness produces it (title checked present and not skipped; `composition-gate.ts` checks it passed) | 58 |
| a query value that projects a record value one for one, whose record value has a producer (8 declared projections, value lists asserted equal) | 14 |
| **no producer, named with the reason** | 28 |

The suite fails for an unclassified value **and** for a value on the
no-producer list that gains a producer, so the list can neither hide a new
gap nor outlive a closed one. `COMPOSITION_UNIONS=<file>` writes the whole
classification. The 28 are listed, each with its reason, in
`withoutProducer` in `composition.test.ts`; in short:
`iteration-closed.outcome = superseded`; `job-failed.reason =
inputs-changed, internal`; `job.agent = pi` (no pi session ran);
`InfrastructureRecovery.cause` = six gate/session causes and `.action =
reconstruct-session, none` (only readiness writes recoveries);
`interruption = provider-error`; `GateAttempt.commands[].kind =
conformance` and `.selection.policy = all-project`; `GateAttempt.cause =
invalid-session`; `IterationAssignment.kind = integration`,
`scope.extra[].purpose = consumer`, `scope.extra[].kind = file` (the default,
written by absence), `evidenceObligations[].against = fake`,
`gate.checkpoint = readiness, work-item, final`; error codes
`inputs-changed`, `internal`; and the three query values that project an
excused record value. **Rule 2 of the cross-cutting requirements is therefore
not fully met; these are the values it is not met for.**

### The values the brief named

| Value | How part 1 handled it |
| --- | --- |
| `access-only` (and `consumer`, `independent` authority) | **Given a producer.** The `access` scenario establishes two access-only agreements, under the consumer's and an independent authority, over behavior `limits` already has |
| `module-removed` | **Given a producer.** The `iteration` scenario's engineer removes an unassigned child module with the unguarded shell; the accepted commit carries the deletion, `iteration-closed` carries the notice, and the path is in `outsideScope` |
| `superseded` (`IterationResult.outcome`) | **Named test, not a run.** Written only by the `evidence-reopened` transaction, for an assignment with no result, which no uninterrupted run leaves; cited to `contract-revision.test.ts`, "an unfinished item is reused and its open assignment closes as superseded…", which calls the transaction directly. `iteration-closed.outcome = superseded` has **no producer at all** and is on the list |
| `extend`, `external`, `contradicts`, `create-by-extraction`, `repair`, `staged`, `breaking`, `break-discovered` producers etc. | Given producers in the composed scenarios (`placement`, `iteration`, `breaking`) or cited |

### A production defect the composition suite found, and its fix

`RunPolicy.limits.invocationIdleMs`, `invocationAbsoluteMs`,
`maxInvocationsPerRun` and `runAbsoluteMs` were captured in `job.json` and
**never read**: the union values that report them (`idle-timeout`,
`absolute-timeout`, `limit-exceeded` for those two counters) had no producer.
Fixed in `subs/harness/src/run/service.ts`, the only production change of
part 1, recorded here as the defect it is:

- `runInvocation` refuses to start an invocation once the run has made
  `maxInvocationsPerRun` or is older than `runAbsoluteMs`, and fails the run
  `limit-exceeded` with the counter in the message. The absolute bound is
  checked at invocation boundaries; an invocation in flight is bounded by its
  own limits.
- `runSession` arms an idle timer reset by every port event and an absolute
  timer; either asks the session to stop, waits at most `writerSettleMs`, and
  ends the invocation `failed` with `interruption: idle-timeout` or
  `absolute-timeout` and the bound in `error`. Settlement still decides
  whether the writer is released confirmed.
- `recordLineEvents` returns for an invocation the bounds refused.

Tested by `subs/harness/src/tests/run-bounds.test.ts` (new, 6 tests),
including an `adapter-fault` test (`startSession` throwing), whose defence
also had no test.

### Other test changes

| File | Change |
| --- | --- |
| `readiness.test.ts` | +1: an unanswering `ramify` is recovered by `restart-daemon` (cause `daemon-unavailable`), and the run ends when it still does not answer |
| `measurement.test.ts` | The baseline test's run now materializes the view at capture (`viewedInputs`), and asserts the metrics query answers the baseline `measured`. Found: with inputs that never publish the view, B is `unavailable` for its architect-view component, so **a real trial's baseline is measured only because the server's inputs materialize the view before the snapshot** |
| `plans.test.ts`, `http.test.ts` | The fixture has four plans |

### The fixture plan

`fixtures/collection-review/plans/status-badge-tone/plan.md`, in the style
of the existing plans: `StatusBadge` gains an optional `tone` carried as
`data-tone`, neutral by default, with its own tests; no feature view changes.
Nothing else under `fixtures/` was changed.

### Scripts

- `scripts/live-trial.ts` is now the loop trial. `prepare [--plan]
  [--into] [--no-install]` copies the fixture, runs `npm ci` in the copy,
  commits it, and records the baseline commit beside it. `verify <copy>
  [--run] [--json]` compares every changed path since the baseline (git
  ignores the harness's state and Ramify's views) with the run's records:
  inside an assignment's `scope.resolved` roots or files, or in an
  invocation's `outsideScope` **and** in the evaluation the harness serves,
  read over HTTP from a server it starts on the copy and stops. Otherwise a
  defect; exit 1.
- `scripts/real-session.ts` is repointed: `start-run` with `agent: 'pi'`,
  the event page read from its cursor until the run is not running, success
  is `completed`. Without `--project` it prepares a copy with `live-trial.ts
  prepare`. Its pi-readiness detection is unchanged.
- `scripts/composition-gate.ts`, above.

### The fixture trials (`subs/harness/src/tests/fixture-trials.test.ts`)

Env-gated trials, skipped in the default suite because preparing a copy runs
`npm ci`. Each prepares a copy with `live-trial.ts prepare`, runs a plan with
the scripted fake over the **real** toolchain (default policy: the fixture's
own `npm test`, `npm run type-check`, `ramify check --batch`; a private Ramify
daemon for view refreshes, disposed before verification), verifies with
`live-trial.ts verify`, and retains the evidence when
`RAMIFY_AGENT_TRIAL_OUT` is set. The source each stage writes is recorded in
`docs/plans/03-autonomous-implementation-loop/trial/<plan>/stages.json`; it
was developed against the fixture's own toolchain first (every stage passing
`npm test`, the type check and a complete Ramify check), then replayed
through the harness's guarded `write`.

## 5. Exit evidence of part 1

Run from `ramify-agent/` after every change.

```text
=== npm run type-check ===
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json
EXIT: 0

=== npm test ===
 Test Files  86 passed | 1 skipped (87)
      Tests  661 passed | 2 skipped (663)
   Duration  217.65s (transform 13.35s, setup 0ms, import 46.70s, tests 2119.26s, environment 5.26s)
EXIT: 0

=== npm run build:web ===
dist/web/index.html                   0.39 kB │ gzip:   0.26 kB
dist/web/assets/index-DRK0AxDk.css    9.37 kB │ gzip:   2.41 kB
dist/web/assets/index-Caq_oq_X.js   445.65 kB │ gzip: 132.81 kB
✓ built in 527ms
EXIT: 0

=== npm run check:self ===
Execution: completed; check: passed; coverage: complete
Completed scope: 7 owners, 218 source files, 13 resources, 3438 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 2484 allowed, 0 denied, 954 external
EXIT: 0
```

The one skipped file is `fixture-trials.test.ts`, whose two trials run only
with `RAMIFY_AGENT_TRIAL` set (section 4). 87 files and 663 tests, up from 81
and 614: six new files (the four composition files, `run-bounds.test.ts`,
`fixture-trials.test.ts`) and +2 tests in existing files.

## 6. The trials

| Trial | Status after part 1 |
| --- | --- |
| `status-badge-tone` (small fixture plan) | **Ran and passed**, scripted fake over the real toolchain. Run `20260921T073654Z-47e6b7`: one work item, outline `single-iteration`, exactly one `iteration-assigned`, result `accepted`, `work-item-completed`, `job-completed`; readiness and final gates ran the real `npm test`, `npm run type-check` and `ramify check --batch`, all passed. Vitest: 1 passed, 70.5 s. Retained in `trial/status-badge-tone/` (`run/` is the run directory; the four complete-check logs are gzipped; `gates.json`, `branch.txt`, `verification.txt`, `verification.json`) |
| `reviewer-identity` (T3) | **Not run in part 1**, by the coordinator's checkpoint. Everything it needs is in place: the three stages in `trial/reviewer-identity/stages.json` (stage 0 ordinary over `contracts`; stage 1 breaking, broad over `core`, `reviews`, `ui`, `workspace`, the root and `integration-tests`; stage 2 breaking, broad over `ui` and `pure-ui`), each already green on the real toolchain in a scratch copy, and the test `T3: reviewer-identity on the real fixture toolchain` |
| `review-notes` with a real pi session (T2) | **Not run: no pi login** (section 2). Not simulated |

**Write-scope verification of `status-badge-tone`:** 1 modified, 1 added, 0
deleted; both inside the one recorded write scope (`wi-001.i01`); 0 outside
a scope; **0 defects**; `git status` clean.

## 7. Acceptance cases owned

Final, after part 2. The composition gate's output is in section 17.

| # | Case | Result and evidence |
| --- | --- | --- |
| T1 | The scripted fake supplies deterministic state, failure and recovery coverage | **Met, with 28 recorded exceptions to the union rule.** `composition.test.ts` with `composition-recovery.test.ts`, `composition-recovery-delegation.test.ts` and `composition-recovery-chains.test.ts`: 35 recovery rows over SM1–SM10, 14 composed scenarios, every query over every composed run, no pi and no network; all passing in `composition-gate.ts`. Cross-cutting rule 2 is not fully met: 28 values have no producer, each named with its reason and with what it would need in the completion report |
| T2 | At least one real pi end-to-end non-breaking feature with a consumer, delegation, provider and verification on return | **Not met.** No pi login; not run and not simulated. `trial/review-notes/NOT-RUN.md` records what was checked and how a person runs it |
| T3 | The breaking path on a controlled fixture with globally green iteration boundaries | **Met on the scripted agent over the fixture's real toolchain.** `fixture-trials.test.ts`, "T3: reviewer-identity on the real fixture toolchain", run `20260921T075217Z-236cd4`, retained in `trial/reviewer-identity/`: three accepted iterations, both breaking boundaries closed by passing all-project gates, the first (ordinary) boundary by a passing scoped gate, `job-completed`, 0 verification defects. It does not show a real model |
| T4 | Human review of the resulting decisions, work, checks and metrics is recorded, with no review wait in execution | **Partially met.** `trial/review-sheet.md`: the trial record and the agent's observations filled in, the questions and the verdict blank for the person, no review wait in execution |

## 8. Measured sizes at the end of part 1's code

`ramify measure --format json`, revision
`rev/1:024012f3-f3b4-4002-8dc7-2c886f887702:1`, views measured; the document
is `iterations/iteration12-evidence/measure-part1.json`. Bytes.

| Owner | Exact production (files / bytes) | Resources | Subtree production | Exact tests |
| --- | ---: | ---: | ---: | ---: |
| `ramify-agent` | 2 / 5,040 | 0 | 109 / 1,046,304 | 1 / 1,694 |
| `ramify-agent/harness` | 80 / 842,550 | 11 / 41,565 | 94 / 976,573 | 71 / 940,743 |
| `ramify-agent/harness/agent` | 2 / 32,276 | 0 | 3 / 60,932 | 4 / 28,063 |
| `ramify-agent/harness/agent/pi` | 1 / 28,656 | 0 | 1 / 28,656 | 8 / 69,278 |
| `ramify-agent/harness/evidence` | 6 / 47,604 | 1 / 1,136 | 6 / 47,604 | 7 / 27,676 |
| `ramify-agent/harness/ledger` | 5 / 25,487 | 0 | 5 / 25,487 | 12 / 47,887 |
| `ramify-agent/web` | 13 / 64,691 | 1 / 10,960 | 13 / 64,691 | 6 / 30,669 |

The main plan's before figures are in its "Measured sizes" section
(`harness` exact 28 files / 156,355). Part 2 re-measures after the reports,
breaks `harness`'s own source down by directory and names the boundaries
that have earned themselves.

## 9. Deviations from the brief, with reasons

1. **The composition suite is four files and three helpers, not one file.**
   The recovery rows take ≈336 s of test time; three files let them run in
   parallel. `composition.test.ts` asserts that the three together run the
   whole table.
2. **"Every value has a producer" is enforced with a recorded exception
   list**, not by failing the suite for the 28 values that have none. Failing
   would leave the exit gate red for values whose producers need design
   decisions (dead vocabulary from the proposal, or values only a real pi run
   produces). The list is exact in both directions and is reported as rule 2
   not being fully met.
3. **Owning tests are checked "passing by name" by a script, not inside the
   suite.** Running every owning test inside the suite would run most of the
   suite twice. The suite checks presence and ownership; `composition-gate.ts`
   runs them and reads each result by name.
4. **A production change**, the defect in section 4.
5. **Scope beyond the brief:** `acceptance-evidence.json` and the trial's
   `stages.json` are trial material in the plan directory;
   `iteration12-evidence/measure-part1.json` holds the measurement.
6. **The fixture trials are an env-gated test file**, not a script: the
   scripted agent is the harness's internal, and a script reaches the harness
   only through its command line and HTTP.

## 10. Not done in part 1

- T3 run, T2 (no pi login), the composition gate script run, the architect
  view refresh, the before-and-after table with the earned boundaries, the
  completion report, the review sheet, the main plan's "Status of execution",
  the iterations README row. See section 13.

## 11. What part 2 must know

- Running T3: from `ramify-agent/`,
  `RAMIFY_AGENT_TRIAL=reviewer-identity RAMIFY_AGENT_TRIAL_OUT=<scratch dir>
  node_modules/.bin/vitest run subs/harness/src/tests/fixture-trials.test.ts`.
  Then copy `<scratch dir>/reviewer-identity/*` to
  `docs/plans/03-autonomous-implementation-loop/trial/reviewer-identity/`
  (beside `stages.json`) and `gzip -9 run/gates/*/03-ramify-check.log`
  (each ≈1.5 MB). Expect several minutes: six gates over the real toolchain.
- `composition-gate.ts` reads a trial as met only from `run/job.json`,
  `run/events.jsonl` and `verification.json` in its directory, or as not run
  from a `NOT-RUN.md` whose first prose line is the reason. T2 needs
  `trial/review-notes/NOT-RUN.md` if pi is still absent.
- `composition.test.ts` parses every `iteration*-results.md` for "Acceptance
  cases" tables: a case row must appear in exactly one note, in the owner the
  matrix names, and must name the owning test file's basename. Keep section 7's
  table (or its successor) in this note.
- The scratch copy with the reviewer-identity stages as git commits is
  `/tmp/claude-1000/-ramify/36c2fece-cabe-4c8e-a841-21132130037f/scratchpad/fx/collection-review`
  (branches `main`: base, stage0–2; `tone-work`: the tone). No daemon ran in it.
- Unchanged: never let a resident daemon analyse a temporary project; `ramify
  stop` is not a command; nested-package discovery walks to depth 5.

## 12. Limitations found in part 1, for the completion report

- The 28 union values without a producer (section 4).
- A stopped run in the `stop` scenario closes with `writer-released` then
  `job-stopped` and **no `invocation-ended`** for the stopped invocation when
  the stop grace is shorter than the invocation's own closing (seen with the
  tests' 500 ms grace). Not investigated further.
- `RunInputs.changes` is never called: a changed plan or source is never an
  `inputs-changed` failure.
- A baseline `B` is measured only when the view was published before the
  first snapshot.

## 13. Remaining for part 2

1. Check the pi login again; run T2 if present (`npm run trial -- prepare`,
   then the browser or `npm run real-session -- --project <copy>`), else write
   `trial/review-notes/NOT-RUN.md` with the reason.
2. Run T3 (section 11), retain its evidence, record the outline, stages, each
   gate attempt and the final state.
3. Run `node_modules/.bin/tsx scripts/composition-gate.ts --with-trials`
   and record its output.
4. Refresh the architect view (`node_modules/.bin/ramify materialize --view
   architect`), record revision and input identity; re-measure; the
   before-and-after table and the named earned boundaries inside `harness`.
5. The review sheet (`trial/review-sheet.md`), the completion report
   (`completion-report.md`), the main plan's "Status of execution", this
   note's completion and the README row.
6. Rerun the four gate commands at the end.

Part 2 did all six; sections 14 to 23 record them. Item 1 ended in the
not-run record, because there is still no pi login.

---

# Part 2

## 14. Baseline at the start of part 2

Run from `ramify-agent/` before anything was changed. It matched part 1's
exit exactly.

```text
=== npm run type-check ===   EXIT: 0
=== npm test ===             Test Files  86 passed | 1 skipped (87)
                                  Tests  661 passed | 2 skipped (663)   Duration  196.43s
=== npm run build:web ===    ✓ built in 554ms               EXIT: 0
=== npm run check:self ===   Execution: completed; check: passed; coverage: complete
                             Completed scope: 7 owners, 218 source files, 13 resources, 3438 accesses
                             Findings: 0 errors, 0 warnings, 0 analysis limits; 2484 allowed, 0 denied, 954 external
```

## 15. The pi login, and T2

Checked again at the start of part 2. `~/.pi` does not exist. None of the
provider variables the pinned `@earendil-works/pi-ai` reads is set: the names
were listed from its distribution and each was tested for presence, and no
value was read. `CODEX_HOME` is set, but it belongs to another tool and is not
something pi reads.

**No pi login was present, so T2 did not run.** No credential the person has
not set up for pi was looked for or used. Plan 1 authenticated with a Claude
Code OAuth token that the person exported themselves, and that token was not
taken. The scripted agent was not substituted. `trial/review-notes/NOT-RUN.md`
records the reason, what was checked and the commands a person runs.
`composition-gate.ts` reads its first prose line as the reason.

One consequence the person should know before running T2: the brief asks
for a restart forced after contract registration. A run is never resumed in
place (iterations 6 and 11), so that restart ends the run `interrupted`, and
verification on return must come from a second run over the tree the first
left. NOT-RUN.md says so.

## 16. T3, the breaking trial

Run as section 11 says, with `RAMIFY_AGENT_TRIAL=reviewer-identity`.

**First run: a check of the trial itself was wrong.** The first run (its
copy kept with `RAMIFY_AGENT_TRIAL_KEEP=1`) completed. Every assertion about the harness passed: the
staged outline, three accepted iterations, a passing `breaking-iteration`
gate over the real toolchain at both breaking boundaries, passing readiness
and final gates, and 0 verification defects. Then the test's final assertion
failed:

```text
AssertionError: expected 'subs/workspace/subs/reviews/src/tests…' to be ''
+ subs/workspace/subs/reviews/src/tests/router.test.ts:74:    await expect(client.reviews.run.mutate({ recordId: 'rec-valid' })).rejects.toThrow();
+ subs/workspace/subs/reviews/src/tests/router.test.ts:76:    await expect(client.reviews.run.mutate({ recordId: 'rec-valid', reviewer: 'Ada Lovelace' })).rejects.toThrow();
+ subs/workspace/subs/reviews/subs/ui/src/review-panel.tsx:37:  const outcome = await client.reviews.run.mutate({ recordId, reviewer });
```

The assertion meant "no caller of `reviews.run` omits the reviewer", and it
grepped the substring `reviews.run.mutate({ recordId`. The three matches are
a production call that carries the reviewer, and two tests asserting that a
call without a reviewer, or with a plain name, is refused. The final state
was right and the check was wrong. It was corrected in
`fixture-trials.test.ts`: every call site must name a reviewer within its
argument, or be a call the project asserts is refused (`@ts-expect-error` on
the two lines above, or `.rejects`). The corrected logic was run against the
kept copy before the rerun. At the fixture's baseline it flags all 9 callers
that omit the reviewer; at the first accepted commit it flags the same 9; at
the final state it flags none. This is a defect of the trial's test, not of
the harness, and no gate or fixture was changed.

The same kept copy served two checks outside the harness. Each of the three
accepted commits was checked out, and the fixture's whole suite, type check
and complete Ramify check were run:

| Commit | Iteration | `npm test` | `npm run type-check` | `ramify check --batch` |
| --- | --- | --- | --- | --- |
| `fa7a9de` | `wi-001.i01`, ordinary | 20 files, 79 tests passed | exit 0 | passed, complete, 0 errors |
| `42f9526` | `wi-001.i02`, breaking | 20 files, 85 tests passed | exit 0 | passed, complete, 0 errors |
| `adfc556` | `wi-001.i03`, breaking | 20 files, 86 tests passed | exit 0 | passed, complete, 0 errors |

`npm run test:cucumber`, which no gate runs, passed at `adfc556` and at the
baseline: 1 scenario, 12 steps. These are this agent's checks, not gate
attempts. The copy was then removed. No resident daemon analysed it: the run
used the trial's private daemon, disposed within the test, and the checks
used `--batch`.

**Second run, retained.** With the corrected check the test passed:

```text
 Test Files  1 passed (1)
      Tests  1 passed | 1 skipped (2)
   Duration  89.26s
```

Run `20260921T075217Z-236cd4` is in `trial/reviewer-identity/`: `run/`, the
run directory, with its six complete-check logs gzipped; `gates.json`,
`branch.txt`, `verification.txt` and `verification.json`.

| | |
| --- | --- |
| Outline | Revision 1 `staged`; two `breakingChanges`; three stages, `non-breaking`, `breaking`, `breaking`. Revision 2 at completion |
| Stages | `wi-001.i01` ordinary over `workspace/contracts`; `wi-001.i02` breaking, explicitly broad over `reviews/core`, `reviews`, `reviews/ui`, `workspace`, the root and `integration-tests`; `wi-001.i03` breaking, broad over `reviews/ui` and `pure-ui` |
| Gate attempts | `ga-0001` readiness, `ga-0002` iteration (commit `1a3a661`), `ga-0003` breaking-iteration (commit `a999645`), `ga-0004` breaking-iteration (commit `2023cb5`), `ga-0005` work-item, `ga-0006` final. Six passed; every command passed with exit 0; no repair round and no infrastructure retry |
| Final state | `job-completed`, 47 events, 8 invocations, `failure: null` |

**Write-scope verification** (`live-trial.ts verify`): 20 modified, 0
added, 0 deleted; 20 inside a recorded write scope; 0 outside every scope;
**0 defects**; `git status` clean.

**Was every accepted boundary green?** Both breaking boundaries passed an
all-project gate: the fixture's whole `npm test`, its type check and a
complete Ramify check. The ordinary first boundary passed its scoped gate
(the one test file of `contracts`, the type check, the complete Ramify
check), as the plan's checkpoint table prescribes for an `iteration`
checkpoint. The whole project was also green there, but only by this agent's
check above, not by a gate. No boundary failed.

Two facts the review sheet records as observations. The broad scope of
`wi-001.i02` names the root module, so its resolved roots include the whole
project. The Cucumber suite's `unsupported-runner` gap is recorded on the
three engineer invocations, not on any gate attempt.

## 17. The composition gate

`node_modules/.bin/tsx scripts/composition-gate.ts --with-trials`, run for
the first time in part 2, after T3 was retained and before the review sheet
existed. It ran without a fault in the script: 31 test files for 46 cases,
with both fixture trials, in one Vitest run. The complete output is
`iteration12-evidence/composition-gate-first-run.txt`; its verdict lines:

```text
Running 31 test files for 46 cases, with the fixture trials.
met     C1 … met     T1   (every case from C1 to T1: 43 lines, each "met")
NOT MET T2   (iteration 12)
          trial/review-notes: not run; Not run because no pi login exists in this environment: `~/.pi` is absent and none of the provider variables pi reads is set, and no credential the person has not set up for pi was used.
met     T3   (iteration 12)
          subs/harness/src/tests/fixture-trials.test.ts: "T3: reviewer-identity on the real fixture toolchain": 1 passed
          trial/reviewer-identity: run completed; 0 change(s) outside what the records account for
NOT MET T4   (iteration 12)
          trial/review-sheet.md: missing

44 of 46 cases met. Not met: T2, T4.
EXIT 1
```

It found no defect and no bug in the script. T4 failed because the sheet had
not been written yet. The final run, after every document, is below.

**Final run**, after the review sheet, the completion report and this note
were written. Complete output: `iteration12-evidence/composition-gate-final.txt`.
Every one of the 59 named test titles passed; no title failed or was skipped.

```text
Running 31 test files for 46 cases, with the fixture trials.
met     C1 … met     T1   (every case from C1 to T1: 43 lines, each "met")
NOT MET T2   (iteration 12)
          trial/review-notes: not run; Not run because no pi login exists in this environment: `~/.pi` is absent and none of the provider variables pi reads is set, and no credential the person has not set up for pi was used.
met     T3   (iteration 12)
          subs/harness/src/tests/fixture-trials.test.ts: "T3: reviewer-identity on the real fixture toolchain": 1 passed
          trial/reviewer-identity: run completed; 0 change(s) outside what the records account for
met     T4   (iteration 12)
          trial/review-sheet.md: present

45 of 46 cases met. Not met: T2.
EXIT 1
```

What the gate checks, stated so its "met" is not read for more than it is:
for a test case, every named test passed by title in that run; for a trial,
the retained run ended `job-completed` with 0 verification defects; for T4,
that the sheet exists. It does not judge the verdict, which is blank.

## 18. The architect view and the measurement

Refreshed with `node_modules/.bin/ramify materialize --view architect`
before any claim about the module tree: revision
`rev/1:024012f3-f3b4-4002-8dc7-2c886f887702:10`, input identity
`input/1:152cee09bf20260f3e6d79815472518b75be2c43d3eaffbd323d3d37cca30eee`,
7 modules, 1202 records, `dependencies: measured`, `testReferences:
measured`, `metrics: measured`, cut 315. The module tree is unchanged from
part 1: 7 modules, and no `module.ramify` changed. The view refreshed after
the documents is in section 22.

`ramify measure --format json` at that revision is
`iteration12-evidence/measure-part2.json`. Every module's production figures
equal part 1's; `harness`'s exact tests grew by 1,001 bytes, from the
corrected trial check. The before-and-after table, the breakdown of the
harness's own source by directory, and the candidates are in the completion
report's
["Measured sizes, before and after"](../completion-report.md#measured-sizes-before-and-after)
and ["Module candidates inside `harness`"](../completion-report.md#module-candidates-inside-harness).
In one line: `harness`'s exact production grew from 28 files and 156,355
bytes to 80 files and 842,550 bytes, a quarter of it in `run/service.ts`.
`checks` has earned a boundary; `guard` is independent but small; nothing
was extracted.

## 19. What part 2 delivered

| File | What |
| --- | --- |
| `trial/review-notes/NOT-RUN.md` (new) | T2's reason, what was checked, and the commands a person runs |
| `trial/reviewer-identity/` | T3's retained run, gates, branch and verification, beside part 1's `stages.json` |
| `trial/review-sheet.md` (new) | T4: the trial record, the agent's observations, the reviewer's questions and verdict left blank |
| `completion-report.md` (new) | The completion gate item by item, defects, the producerless union values with what each needs, what the person must do, the hand-off, the measured sizes and candidates, the limitations |
| `main-plan.md` | "Status of execution" only |
| `iterations/README.md` | Iteration 12's row |
| `iterations/iteration12-evidence/` | `measure-part2.json`, `composition-gate-first-run.txt`, `composition-gate-final.txt` |
| `subs/harness/src/tests/fixture-trials.test.ts` | T3's final check corrected (section 16) |

No production source changed in part 2.

## 20. Part 2's deviations from the brief, with reasons

1. **A trial test was changed after it failed.** Section 16 gives the
   evidence that the check, not the loop, was wrong. The corrected check is
   stricter than what it replaced: it examines every call site rather than
   one spelling, and it was shown to fail on the state it must reject.
2. **Checks outside the harness were run on the kept T3 copy**: the whole
   suite, the type check and the Ramify check at each accepted commit, and
   the Cucumber suite. They add evidence the gates do not record, and they
   are reported as this agent's checks, never as gate attempts.
3. **The composition gate was run twice**, before and after the review
   sheet, and both outputs are kept.

## 21. Not done in part 2, with the reason

- **T2, the real pi trial**: no pi login (section 15). Completion-gate item
  1 is not met, and no real provider has been shown to accept a union
  discriminated on `kind`.
- **The context thresholds are not measured**, and neither is any
  real-model cost. The scripted agent reports no usage and no context.
- **No module was extracted**, as the brief requires. The candidates are
  briefs.
- **None of the person's decisions was taken on the person's behalf**: the
  depth 4 or 5 walk, the 28 producerless values, the broad root scope, and
  where the Cucumber gap belongs.

## 22. Exit evidence

Run from `ramify-agent/` after every change of both parts, the composition
gate's final run and every document included.

```text
=== npm run type-check ===
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json
EXIT: 0

=== npm test ===
 Test Files  86 passed | 1 skipped (87)
      Tests  661 passed | 2 skipped (663)
   Duration  193.67s (transform 6.72s, setup 0ms, import 30.09s, tests 2073.41s, environment 3.50s)
EXIT: 0

=== npm run build:web ===
dist/web/index.html                   0.39 kB │ gzip:   0.26 kB
dist/web/assets/index-DRK0AxDk.css    9.37 kB │ gzip:   2.41 kB
dist/web/assets/index-Caq_oq_X.js   445.65 kB │ gzip: 132.81 kB
✓ built in 171ms
EXIT: 0

=== npm run check:self ===
Execution: completed; check: passed; coverage: complete
Completed scope: 7 owners, 218 source files, 13 resources, 3438 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 2484 allowed, 0 denied, 954 external
EXIT: 0
```

The one skipped file is still `fixture-trials.test.ts`, whose trials run only
with `RAMIFY_AGENT_TRIAL` set; they ran and passed inside both composition
gate runs. The counts equal part 1's exit: part 2 added no test, and changed
one assertion.

`composition-gate.ts --with-trials`, final run: 45 of 46 cases met, exit 1,
not met T2 (section 17).

The architect view after the documents, `ramify materialize --view
architect` (two attempts were superseded by newer revisions of the daemon's
own analysis, and the third completed): revision
`rev/1:024012f3-f3b4-4002-8dc7-2c886f887702:24`, input identity
`input/1:a06e50d6800d3c255871933a55f78825af093c672c729124e8ee70d6aedc55f1`,
7 modules, 1202 records, `dependencies: measured`, cut 315.

## 23. What the next plan must know

The completion report's hand-off section is the handover. Beyond it:

- `composition-gate.ts --with-trials` is the command that re-verifies the
  whole matrix, about ten minutes with both trials. T2 becomes met when
  `trial/review-notes/` holds a real run directory whose last event is
  `job-completed` and a `verification.json` with no defects, and NOT-RUN.md
  is deleted.
- Unchanged: never let a resident daemon analyse a temporary project;
  `ramify stop` is not a command; nested-package discovery walks to depth 5.
