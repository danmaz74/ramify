# Plan 12 execution results

## Starting evidence

**Starting commit:** `6da00866d4f41e468dcd305b54a43154862ded66` on branch `feat/plan12-check-findings`, worktree `/tmp/ramify-plan12-check-findings`. It contains the committed [CheckFinding architecture](../../architecture/check-findings.md) and [principles](../../check-findings.principles.md), and Plan 11's merged execution map (`cab2a90`). **Dirty files:** none. The worktree was prepared with `npm ci`, `npm run build` and `npm run worktree:prepare` at the repository root.

| Check | Result | Boundary and limit |
| --- | --- | --- |
| ramify-audit, `audit/ramify-agent-suite.request.json` from the repository root | Pass, overall `pass`, 173 s | All five checks pass: patch integrity, agent type-check, agent suite (161 files passed, 2 skipped; 1277 tests passed, 7 skipped), agent `check:self`, parent daemon case. Run ref `refs/audited/runs/2026-09-24T11-26-24Z-6da00866d`; Git note on `6da0086`. The request still carries Plan 8's claim ID `plan8-baseline-repairs`. |
| `npm run type-check` in `ramify-agent/` | Pass (inside the audit) | Harness, web and script scopes. |
| `npm run check:self` in `ramify-agent/` | Pass (inside the audit): 0 errors, 0 warnings, 190 analysis limits | 9 owners, 389 source files. The limits are `signature-inferred` coverage. |
| `npm run build:web` in `ramify-agent/` | Pass | Vite chunk-size advisory only. |

No baseline failures are carried into the plan.

## Iteration 1 — CheckFinding contract and pure child

**Starting commit:** `df6224e` on `feat/plan12-check-findings` (starting evidence recorded). **Contract appendix:** [`contract-appendix.md`](contract-appendix.md), beside the plan.

### Delivered

- New pure child `subs/harness/subs/check-findings/` with `module.ramify`, a README whose first paragraph is its purpose, and the owned contract file `src/interfaces/check-findings.ts`: Zod schemas and types for opaque sources, owners, producers, obligations, verification rules, actors, authorities, evidence, reports, decisions and their eleven actions, relations, commands (`report`, `dispose`, `relate`, `assess`), the four `check-finding-*` events (data version 1, with exported per-event data schemas), replayed state, 29 exact rejection codes, and queries and views (`check-finding-view/1`).
- `decideCheckFindingChange` (`decide.ts`): ingestion-key idempotency and conflict; issue keys scoped by owner and obligation, with ambiguous-key refusal; report form rules; automatic reopening by a contradicting same-key report; every disposition with its standing, revision and evidence rules, including the ordered witness refusals; user decision request and answer; authorized obligation revision; same-issue and other relations with self, cross-owner, stale and cycle refusals; `assess` accepted together or refused at the failing position. IDs are allocated from the replayed state.
- `applyCheckFindingEvent`, `replayCheckFindingEvents`, `emptyCheckFindingState` (`replay.ts`): derivation of standing, reason, pending request, repair and verification; `replay-conflict` for any event whose ID, revision or key does not follow. `groups.ts` derives same-issue groups from the latest assessment of each pair.
- `selectCheckFindings` (`queries.ts`): bounded, ID-ordered lists (default 50, maximum 100, `after` cursor) with owner counts; `attention` = open plus caller-named due deferrals; detail with the latest 200 reports and decisions and totals.
- The contract appendix: the child's contract (§1), ledger carriers, record paths and the mutex transition (§2), review request/attempt/submission schemas, IDs, events and concern mapping (§3), `run-policy/3` review policy values (§4), fork-point fields (§5), reconciliation basis, events and validation (§6), scenario witness mapping (§7), the browser-safe wire and command (§8), the worked stream with its carrier events (§9), and every trusted input (§10).
- Harness README: one paragraph naming the child.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| `npx vitest run subs/harness/subs/check-findings/src/tests/` | Pass, 6 files, 58 tests | Pure tests over literal input: `identity`, `decide`, `relations`, `queries`, `stream` and `purity`. No harness, ledger, agent or process involved. |
| `npm run type-check` in `ramify-agent/` | Pass | Harness, web and scripts TypeScript scopes. |
| `npm run check:self` in `ramify-agent/` | Pass: 0 errors, 0 warnings, 235 analysis limits | 10 owners, 403 source files. All 235 limits are `signature-inferred`; the 45 new ones are the child's exported Zod schema and constant declarations. A first run reported `exposed-without-companion` for a local alias in `decideCheckFindingChange`'s signature, corrected by naming `CheckFindingChange`. |
| `ramify materialize --view api --from subs/harness/src` | The harness's view lists the child's `decide.ts`, `queries.ts`, `replay.ts` and `interfaces/check-findings.ts` exports | Confirms what the parent receives. No harness source imports the child yet. |
| `git diff --check df6224e` | Clean | Whitespace only. |
| `npm run build:web` | Not run | `subs/web` unchanged. |

### Deviations

1. **Two more exposed functions.** Besides the architecture's three, `replay.ts` exposes `replayCheckFindingEvents` and `emptyCheckFindingState`: the harness needs the empty state to replay at all, and a sequence fold avoids repeating it in each caller. `groups.ts` is an internal file the proposed layout did not list.
2. **IDs are allocated by the child.** The plan has the harness allocate IDs under the mutex; the child derives each next ID from the replayed state instead, which is the same allocation when decided under the mutex over the current log, and replays identically (appendix §1.2).
3. **Carrier events.** One application transition can commit several CheckFinding events (an assessment, a review with several concerns) and a ledger transaction is one event, so the appendix carries child events in a `checkFindings` array on the run event that commits them rather than as top-level run events (§2.1). Iteration 2 implements this.
4. **Rules the architecture left open, decided within it.** A same-key report reopens a closed CheckFinding when a check verified it or when its source differs from the closing decision's; on the same source it adds evidence only; a deferral stays deferred. A pass on the source where the latest failure was observed is refused as `failure-source` (intermittent, not repair). A required check's obligation cannot be accepted or deferred (`required-obligation`), the architecture's "simplest initial rule". Relations across owners are refused (`cross-owner`), since v1 has no ownership transfer. An obligation revision needs `user-decision` or `governing-record` authority. "Narrowing" a judgment has no separate action: a narrower concern that still needs work is kept open and repaired, and a superseded one is closed.
5. **Ambiguous keys.** Because the child attaches rather than duplicates, an ambiguous key arises only when an authorized obligation revision gives a CheckFinding the key another one already holds; the test exercises exactly that case. The harness may resubmit the report without its key.
6. **Event naming.** The review request event is `review-request-recorded`, since `review-requested` already names the analysis review stop.
7. **Worked stream grouping.** The fixture decides steps 16–18 separately; §9 shows them committed by one reconciliation, and a test verifies that one `assess` of the three yields the same events.

### Acceptance matrix

| Case | Covered here | Evidence |
| --- | --- | --- |
| CF01 (pure part) | Exact retry gives one CheckFinding; conflicting key and ambiguous issue key refuse | `identity.test.ts` ingestion and issue-key cases; stream steps 5–6. Concurrent callbacks and ledger replay remain iteration 2. |
| CF02 (pure part) | A judgment is superseded without a code change; a factual failure cannot be superseded and needs its witness | `decide.test.ts` judgments; `relations.test.ts` group case; stream steps 9–10 and 15. |
| CF03 (pure part) | Two same-file concerns stay distinct; two parallel reports link with rationale and keep both IDs | `identity.test.ts`, `relations.test.ts`; stream steps 1–4 and 10. The architect's matching submission remains iteration 5. |
| CF11 (pure part) | A repair decision retains its intent; a claim stays open until verified | `decide.test.ts` factual verification; stream steps 10–12 and 15. |
| CF13 (pure part) | Same-obligation pass verifies; wrong test, changed obligation, missing execution, partial and inconclusive cannot | `decide.test.ts` witness refusals and obligation revision; stream steps 13–15. Scenario producer evidence remains iteration 6. |

### Handoff to iteration 2

- **Contract to consume:** receive the child's exports only through its `module.ramify`; compose run events from `checkFindingEventSchema` and the per-event data schemas exactly as appendix §2 specifies (`checkFindings` carrier array of at most 100, `check-findings-recorded` with its `cause`, record paths and schema literals of §2.2). Replay the state from every carrier in log order; a log without carriers is the empty state.
- **Transition:** implement §2.3 under the run mutex: terminal refusal, replay, build with basis validation, child decision, no append for a pure replay, one transaction with carrier event, its records and the CheckFinding record copies. Direct paths that change the same basis take the same mutex.
- **Trusted inputs the harness must bind** (appendix §10): `producer`; `attempt`; `reportKey`; `contentHash` (computed per §1.4 rule 2, never taken from a submission); `owner`; every `source`, witness `source` and `candidate` (audited trees); `issueKey` (only from an adapter attesting identity; `null` for reviews); `verification` including `required` and `selection`; observation `evidence`; judgment and decision `actor`; `authority`; `expectedRevision` and relation revisions (from a captured basis or command); `repair` (intent or assignment ID); claim `candidate` and `change` (the accepted correction's audited tree and iteration ID); `witness` (scenario adapter only); `due` (the harness's evaluation of revisit conditions); and the terminal run, mutex and line size, which the child knows nothing of. Agent text supplies only judgment prose, concern locations and the `suggests` hint.
- **Remaining coverage:** everything durable (CF01's concurrency and crash cases, CF06), all producers (reviews, scenario witness), reconciliation, the wire and the web remain later iterations. The fixture's hashes and tree IDs are placeholders.
- **Open gaps:** none blocking. The harness does not yet import the child, so the Ramify check verifies its exposure, not a parent access; iteration 2's import is the first receiving access.

## Iteration 2 — Ledger composition and atomic ingestion

**Starting commit:** `c51dcdb` on `feat/plan12-check-findings` (iteration 1). **Contract:** appendix §2, now implemented, with §2.4 recording the exact interface.

### Delivered

- **Carrier events** (`run/log.ts`): the new run event `check-findings-recorded { cause, checkFindings }` with the appendix's cause union (`recovery`, `user-response`, `producer`); the type `CheckFindingCarrierType` (every run event whose data has a `checkFindings` field, so later carriers join by adding the field) and `carriedCheckFindings(event)`. `RunLog.next`/`append` refuse an input carrying CheckFinding events; only the transition builds one, through `RunLog.carrier`. `RunLog.open` replays every carried event and refuses a log that does not replay as `CorruptRunLogError` naming the carrier's line. `RunLog.open` also takes the ledger's file system seam for fault injection.
- **Integration folder** `src/check-findings/`:
  - `records.ts`: the carrier field (at most 100 events), the cause schema, the record layout and schema literals of §2.2, readers for `readCommitted`, and `checkFindingRecords(events)`, one record copy per carried event.
  - `report.ts`: `checkFindingContentHash` (§1.4 rule 2, over `canonicalJson`, now exported from `jobs/commands.ts`) and `reportCommand(boundReport)`, so a producer never supplies the hash.
  - `state.ts`: `checkFindingStateOf(ledger)`, replayed from the log on first use in a process and then advanced line by line, and `replayCheckFindingState(entries)` from the empty state. The ingestion and issue key indexes are part of that state; nothing else holds them.
  - `transition.ts`: `commitCheckFindingChange(target, build, at?)` under the run mutex (terminal refusal, replay, `build` revalidates the captured basis, the child decides every command in order, an all-replay appends nothing, one `ledger.append` of the carrier, its records and the CheckFinding record copies), and `decideCheckFindingTransaction(log, build, at?)`, the same decision without the append, for a caller that already holds the mutex such as a ledger effect's completion. Refusals: `run-ended`, `stale-basis`, `check-finding` (0-based command and the child's rejection), `partial-replay`, `too-many-events`, `too-large` (the ledger's line bound, before any byte is written).
- **Run service**: `recordCheckFindings(planId, runId, { cause, commands })` commits a `check-findings-recorded` line through the transition; `checkFindings(planId, runId, query)` answers the child's selection over the replayed state; the private `commitCheckFindings(run, build)` is the entry later producers call. Recovery needs no new step: the log replays on open and `recoverCommits` rewrites missing record copies.
- The event page projects the new event (count and cause; there is no CheckFinding reference kind on the wire yet). The ledger exposes `nodeFileSystem` beside its file system type, for the harness's fault seam. Harness README and appendix §2 updated.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| `npx vitest run subs/harness/src/tests/check-findings-ledger.test.ts subs/harness/src/tests/check-findings-run.test.ts` | Pass, 2 files, 18 tests | The ledger file drives the transition over a real `RunLog` on a temporary directory; crashes are injected through the ledger's file system seam and read back through a fresh log. The fault sweep covers all 10 file system operations of one report-plus-decision commit (log write and flush, then write, flush, rename and directory sync of two record copies); a crash at the first leaves no line, each of the other 9 leaves the whole line. The run file drives `RunService` with the scripted agent, scripted Git and direct readiness: a run waiting at its review stop, then approved to completion, and a crash abandoned and restarted. No real process, Git or model. |
| Existing focused tests of touched files: `union-values`, `run-projections`, `review-stop`, `commit-recovery`, `projections-pure`, `run`, the ledger's `ledger.test.ts` and the child's six files | Pass, 13 files, 139 tests | `union-values` lists the new event type and a projection sample. |
| `run-recovery`, `execution-map-projection`, `run-protocol`, `protocol-contract`, `session-lifecycle` | Pass, 5 files, 88 tests | Recovery table and projections over the extended event union. |
| `npm run type-check` in `ramify-agent/` | Pass | Harness, web and scripts scopes. |
| `npm run check:self` in `ramify-agent/` | Pass: 0 errors, 0 warnings, 235 analysis limits | 10 owners, 410 source files; the limits are the same `signature-inferred` set as iteration 1. The harness now imports the child's `decide.ts`, `replay.ts`, `queries.ts` and interface file: the first receiving accesses. |
| `git diff --check c51dcdb` | Clean | Whitespace only. |
| `npm run build:web` | Not run | `subs/web` unchanged. |
| Full suite | Not run | Only through ramify-audit, by the orchestrator. |

### Deviations

1. **Report record body.** The report record carries `checkFinding` and `revision` beside the report, like the decision record, so a reader of one file knows what the report moved. Appendix §2.2 updated.
2. **Partial replay is refused.** A transition in which some reports are exact replays and others new is refused as `partial-replay` rather than committing the new half: one line is always the whole of one transition, and the atomic carrier makes a legitimate mixed case impossible.
3. **Decisions are idempotent by revision, not by key.** Reports replay by ingestion key; a redelivered decision is refused as `stale-revision` because it names the revision it was decided at. A carrier that must be idempotent by a key of its own (a review attempt, a reconciliation) checks the log for that key in `build` and returns `stale`. The crash sweep asserts exactly this for a redelivered report-plus-decision.
4. **No `RunWrite` freeze boundary for `check-findings-recorded`.** `recovery-table.ts` requires every `RunWrite` to be reached by a driven scenario, and no driver path writes this event yet. The crash cases use the ledger's file system seam (before, during and after the line) and an abandoned-service restart instead. The iteration that first writes a carrier from the driver adds its boundary and row.
5. **The gate effect keeps its mutex hold.** Every append site of the run already runs under `run.mutex` (checked: `write`, `endRun`, `finishSession`, `approve`, `stop`, the brief, gate-commit, materialization and withdrawal effects; `job-started` precedes any concurrency). The gate commit-and-audit effect, however, holds the mutex through its slow `perform`. It was not restructured: serialization stays correct and a CheckFinding commit that arrives during an audit only waits. Iterations 3–4 should measure that queue delay.
6. **Stricter log load.** A log whose carried events do not replay is corrupt, and its run is skipped with a warning like any other corrupt log.

### Acceptance matrix

| Case | Covered here | Evidence |
| --- | --- | --- |
| CF01 (ledger part) | Concurrent deliveries of one report key make one CheckFinding and one line; changed content under the key is refused; an ambiguous issue key is refused without appending and the keyless resubmission opens a provisional CheckFinding | `check-findings-ledger.test.ts` "CF01" (5 concurrent transitions: 1 committed, 4 replayed), conflict, ambiguous and partial-replay cases; `check-findings-run.test.ts` first case (3 concurrent `recordCheckFindings` of one report plus one other: 2 lines, 2 CheckFindings). |
| CF06 (ledger part) | A crash before the line commits once on redelivery; a crash after it rebuilds state and record copies from the log without invoking the producer; the projection rebuilt after a restart equals the live one | Fault sweep; "a crash after the commit, before the record files"; projection rebuild cases (incremental state and selections equal to a replay of a reopened log); `check-findings-run.test.ts` crash case (record copies deleted, restart rematerializes 2 files, identical list and detail, no agent session, run interrupted and refusing redelivery). Review requests and attempts remain iterations 3 and 8. |
| CF11 (ledger part) | A repair decision is committed with its report and keeps its intent through crash and restart; a claim stays open until a fresh assessment verifies it | The fault sweep never finds the decision without its report; "a repair decision keeps its intent through a restart" (open `repair-claimed`, awaiting assessment, then `verified-by-assessment`). The correction assignment and claim from `iteration-closed` remain iteration 5. |
| Gates unchanged | An open required CheckFinding leaves the run's readiness and final gates passing and the run completes; a terminal run refuses a new issue and keeps its CheckFindings | `check-findings-run.test.ts` first case. Scenario records are not exercised (the fixture run has no scenarios); iteration 6 owns them. |

### Handoff to iteration 3

- **Ingestion API** (appendix §2.4): call `this.commitCheckFindings(run, build)` in `RunService` or `commitCheckFindingChange(run, build)`. Bind each concern with `reportCommand(boundReport)` per §3.4, which computes the hash. In `build`, refuse with `stale` when the request already has a settling attempt or this attempt was fenced. Return `commands` (one `report` per concern) and a `compose` that builds `review-attempt-finished` with `checkFindings: [...decided.events]` and the attempt and submission records. The attempt record's `checkFindings` IDs are `decided.outcomes.flatMap(o => o.touched)`. A `committed` result settles; a `replayed` one is an exact redelivery; a `refused` one appends nothing and is the attempt's input to the not-verified path.
- **Adding a carrier:** give the run event a `checkFindings: checkFindingEventsField` data field (optional on an existing event). It then joins `CheckFindingCarrierType`, `RunLog.open` replays it and `RunLog.next` refuses it, so it can be committed only through the transition. Inside a ledger effect's `complete` (iteration 6's `gate-attempted`), use `decideCheckFindingTransaction(run.log, build)` under the already-held mutex. That effect must still commit the gate attempt when the CheckFinding part is refused, and it must record that refusal.
- **Trusted inputs bound here:** `contentHash`, the terminal run, the mutex and the line bound. Every other input of appendix §10 stays with its producer.
- **Queries:** `RunService.checkFindings(planId, runId, query)` returns the child's selection; iteration 7 builds the browser-safe wire on it.
- **Remaining coverage:** review requests/attempts and their crash rows (CF06), the driver-level `RunWrite` boundary for a carrier, factual promotion and witnesses (iteration 6), reconciliation and completion validation under the mutex (iteration 5), and the wire (iteration 7).
- **Open gaps:** the gate effect's mutex hold during audit (deviation 5), to be measured.

## Iteration 3 — Reader lifecycle and code review pilot

**Starting commit:** `2d38b09` on `feat/plan12-check-findings` (iteration 2). **Contract:** appendix §3.5 records the implemented interface; §2.1 and §4 are updated.

### Delivered

- **Invocation registry** (`run/service.ts`): `Run.session` and `Run.invocationDone` are replaced by `Run.live`, a map of every open invocation by ID with its role, whether it is a reader, its session and its closure. Invocation starts are serialized by `Run.starting`, since invocation and session IDs are counted from the log; the session runs outside it, so one writer and bounded readers run at once. A reader holds no writer, a run-wide bound refuses it without failing the run, and its unsettled session blocks no writer. Stop, failure, shutdown and the final settlement address every live invocation; `settled()` and shutdown quiescence wait for readers and review attempts too.
- **Policy `run-policy/3`** (`run/records.ts`, `run/policy.ts`): `reviews` (`review-policy/1`, default `kinds: ['code']`, concurrency 2, queue 12, one retry, 10 min an attempt, 15 min settlement, 20 concerns) and `limits.reconciliationRoundsPerWorkItem: 3`, both optional so `run-policy/2` runs read. The role union gains `reviewer`; the captured `context` is the five earlier roles plus an optional `reviewer`.
- **Review records and events** (`src/reviews/records.ts`, `run/log.ts`): `review-request-recorded`, `review-attempt-started`, `review-attempt-finished` (a CheckFinding carrier), the request, attempt and submission records, and their projection on the event page.
- **Candidate snapshot** (`src/reviews/snapshot.ts`, evidence `CandidateSource`): the audited commit read from Git's objects (`commitTree`, `treeEntries`, `readBlob`, `grepTree`, `diffNameStatus`, `diffPatch`, exposed by the evidence child). Four read tools, `snapshot_list`, `snapshot_read`, `snapshot_search`, `snapshot_diff`, refuse absolute paths, paths out of the candidate, `.git`, generated views, symbolic links anywhere on a path and submodules, and record what they answered. The reviewer gets no built-in tool and an empty working directory of its own.
- **Code reviewer** (`reviewer/1` package, `src/reviews/submission.ts`, `message.ts`): one structured submission, judged against what the tools answered: every changed path named once as inspected or missing, an inspected path only if a tool answered it, concern locations in the candidate.
- **Requests, attempts and commit** (run service review section): one request per kind is recorded after an engineer iteration closes accepted and before the driver passes it; `ReviewQueue` (`src/reviews/scheduler.ts`) runs at most `concurrency` readers, overflows beyond `queue`, retries an invalid, failed or timed-out attempt once and parks one that was fenced. Each terminal attempt, its submission and one report per concern are one line through `commitCheckFindingChange`; a settled request or finished attempt is fenced as stale, a terminal run as `run-ended`, and a refused concern set is recommitted as `invalid-output`. `RunService.reviews(planId, runId, workItem?)` answers requests and coverage, `unavailable` for a run without a review policy.
- **Closure and recovery:** before the final gate the run waits at most `settleMs`, then stops what remains and finishes it as `deadline`; a stop and a failure stop every reader and finish each unsettled request as `stopped` before the terminal event; a closing service records nothing. Recovery records every request an accepted iteration is owed, once, and finishes each unsettled one (`execution-failed` for a reader that was running, `stopped` for one never started); `RunRecoveryReport.reviews` lists what it did.
- **Gate audit outside the mutex:** the ledger's `EffectSpec` gains `serialize` (held for the intent and the completion, not for `perform`) and a lazily built intent; the gate's commit-and-audit uses the run mutex so, and `endRun` waits for a gate effect in flight. A gate commit's `Ramify-Invocations` trailer omits reviewer invocations.
- **Web:** the reviewer role's color, label and icon (`execution-map-tokens.ts`, `session-role.tsx`); nothing else in the web changed.
- **Documents:** harness and evidence READMEs; appendix §2.1, §3.5 and §4.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| `npx vitest run subs/harness/src/tests/review-attempts.test.ts subs/harness/src/tests/review-lifecycle.test.ts subs/harness/src/tests/review-tools.test.ts subs/harness/src/tests/review-snapshot.integration.test.ts` | Pass, 4 files, 14 tests; the first three repeated 3 times alone and twice beside `iterations`/`run-recovery` (45 tests each), all passing | Driven runs with the scripted agent, scripted gate Git (`gateGit`) and a scripted `CandidateSource`, no process started, except `review-snapshot.integration`: real Git, real snapshot tools and the scripted reviewer, no model. |
| Negative control for the gate mutex | With the audit held inside the mutex (the previous code, applied temporarily), the audit test failed: the reader's attempt was not committed within 5 s while the audit was held open | The restructured code commits it in 12–14 ms (three runs, 10 ms polling granularity) while the audit is still held; the gate's attempt and verdict follow unchanged. |
| `npx vitest run subs/harness/subs/ledger/src/tests/effects.test.ts subs/harness/subs/evidence/src/tests/git.test.ts` | Pass, 8 and 5 tests | The new serialization case; the candidate source against real Git, with a later write and commit of the live tree. |
| Final focused batch of 32 files: ledger `effects`, `ledger`; evidence `git`; harness `union-values`, `run-policy`, `analysis-submission`, `composition`, `kpi-metrics`, `compaction`, `recorded-environment`, `session-lifecycle`, `session-queries`, `transcript-run`, the four review files, `check-findings-run`, `check-findings-ledger`, `run-recovery`, `stop-before-start`, `writer-settlement`, `run-bounds`, `iterations`, `run`, `single-session`, `projections-pure`, `run-projections`, `execution-map-projection`; web `execution-map`, `session-marks`, `transcript-workspace` | 255 passed, 1 failed | The failure was the CF07 test sending its stop at a version a reader had already advanced (`stale-version`); the test now retries at the current version, and the file passes (repeats above). |
| Earlier focused batches | 37 files, 330 tests; 31 files, 233 tests | Covered the rest of the run-driving files (`review-stop`, `iteration-gate`, `late-writes`, `commit-recovery`, `run-protocol`, `session-fixture`, `measurement`, `fork-submission`, `run-commands`, `run-closing-order`, `gate-not-verified`, `contract-delegation`, `lineage-metrics`, `execution-map-*`, `placement`, `work-items`, `readiness`, `iterations-integration`, `iteration-gate-integration`, `run-git.integration`, `requirement-verification`, `contract-scheduling`, `scenario-states`, `hook-checks`, `module-creation`, `acceptance-trial`, `progress`, `http`, `no-rewind`, `accepted-commit`); their only failures were the union, policy and package assertions updated here, and one order assertion between overlapping readers, now order-independent. |
| `npm run type-check` in `ramify-agent/` | Pass | Harness, web and both script scopes. |
| `npm run check:self` in `ramify-agent/` | Pass: 0 errors, 0 warnings, 235 analysis limits | 10 owners, 422 source files; the limits are the same `signature-inferred` set. The harness now receives the evidence child's `CandidateSource` exports. |
| `npm run build:web` | Pass | Vite chunk-size advisory only. |
| `git diff --check 2d38b09` | Clean | |
| Full suite | Not run | Only through ramify-audit, by the orchestrator. |

### Deviations

1. **`review-attempt-started` has no `actualStart`.** The event is committed before the session starts, when the executor's answer is unknown; the terminal attempt record carries `actualStart`. `review-attempt-finished` carries the result kind and reason; the record holds the full result.
2. **A request recovered on restart is recorded, not scheduled.** The plan asks that a crash between the gate and the request "schedules it on restart". A recovered run is interrupted and runs nothing more in this harness, so recovery records the owed request once and finishes it as not verified (`stopped`), which keeps its coverage explicit instead of pending forever. A running attempt is finished `execution-failed`.
3. **No new `RunWrite` boundary.** The crash cases freeze at existing boundaries: `iteration-closed`, which is exactly after the gate and before the request, and the reader's own `invocation-started`. The recovery table therefore needs no new row; its existing rows run without reviews.
4. **Test policies request no reviews.** `testPolicy` drops `reviews` unless a test passes one, so every existing driven scenario keeps its invocations, IDs and events; production runs capture the default review policy.
5. **Code review only, and only engineer iterations.** The default `kinds` is `['code']` until iteration 4 adds scope and design; a captured kind this harness cannot review yet finishes `unavailable`. Contract iterations are not reviewed.
6. **Settlement before the final gate.** Iteration 5 owns the per-work-item deadline; here the run waits at most `settleMs` for all reviews before the final gate and finishes the rest as `deadline`.
7. **Stricter submission rules** than §3.2: every changed path named once, and an inspected path only if a snapshot tool answered it. An agent's claim to have read a file is not taken as evidence.
8. **A reader's unsettled session blocks no writer.** It has no write tool and starts no process, so it is recorded on its outcome and left to the run's stop and shutdown.
9. **`reviewer` joins the public role union** and the web's role tokens; the policy's `context` keeps requiring the five earlier roles.
10. **Composition union inventory.** `composition.test.ts` was already failing at `2d38b09`: iteration 2's `check-findings-recorded` values had no producer. This iteration adds the review records to its roots, cites a test for every value a run now produces and records a reason for the rest (the CheckFinding child's values no harness path produces before iterations 5–7, scope/design and forks before iteration 4, `no-time-before-deadline` before iteration 5).
11. **Gate mutex restructured,** the handoff's open gap, as standing rule 4 asks, with the measured result above. No gate verdict changed: the effect's intent and completion are appended under the mutex as before, the driver is the only writer of gates, and a terminal event waits for the effect.

### Acceptance matrix

| Case | Covered here | Evidence |
| --- | --- | --- |
| CF04 (code review) | A clean review covers its scope with no CheckFinding; a concern opens one CheckFinding once; partial, invalid (retried once), timed-out (retried once), unavailable and overflowed (unscheduled) attempts are distinct terminal results with the matching coverage | `review-attempts.test.ts` CF05 and CF04 cases; `review-lifecycle.test.ts` "a request beyond the queue's bound…" and the settlement-bound case; `review-tools.test.ts` submission and queue cases. `no-time-before-deadline` remains iteration 4–5. |
| CF05 | Two readers overlap the third iteration's writer; each reads only its own candidate while the writer changes the live store; absolute, climbing, symbolic-link, generated-view and live built-in reads are refused | `review-attempts.test.ts` CF05; `review-tools.test.ts` resolution cases; `review-snapshot.integration.test.ts`, the real-process witness: real Git, the second gate committing v3 while the reader reads v1. |
| CF06 (review part) | A crash after the gate and before the request records it on restart, once; a crash while a reader runs finishes its attempt and session; a committed result and its CheckFinding are rebuilt from the log with no reviewer; a second restart changes nothing | `review-lifecycle.test.ts` CF06 cases. |
| CF07 | A stop stops both live readers and the writer and settles each attempt before `job-stopped`; a reader that ignores its stop and submits a concern afterwards is fenced and ingests nothing; the settlement bound stops a reader that never answers and the run completes with no live session | `review-lifecycle.test.ts` CF07 cases. |
| Gates unchanged | Every gate verdict in the review runs is the one the run reached without reviews; a slow audit's attempt is unchanged | CF05 assertions; the audit test. |

### Handoff to iteration 4

- **Contracts to extend:** appendix §3.5. Add scope and design to `defaultReviewPolicy.kinds` with their own procedures and `requirements`/`guidance` capture; `runReviewAttempt` refuses any kind but `code` as `unavailable`, which is the one place to open. The prompt package is `reviewer/1` with `code-review.procedure.md`; a kind-specific procedure changes the package hash.
- **Fork points:** requests record `forkPoint: { kind: 'none' }`; `review-attempt-started.requestedStart` and the attempt's `actualStart` already admit `fork`. Readers start through `runInvocation` like every role, so a fork uses its existing `fork` relation and degradation recording.
- **Scheduling:** `ReviewQueue` holds concurrency, queue overflow, retries and parking; iteration 4 adds deadlines and `no-time-before-deadline`, and iteration 5 moves the settlement from the final gate to each work item's completion request (`settleReviews`, `stopReaders`).
- **Trusted inputs bound here:** `producer` (`review:<kind>`), `attempt`, `reportKey` by position, `owner` (the request's work item), `source` (the candidate's Git tree), `issueKey: null`, `verification: assessment`, observation evidence (submission record path and hash), judgment actor (the reader's invocation), and `suggests` only toward a CheckFinding of the same work item.
- **Open gaps:** a candidate whose tree cannot be read when its iteration closes gets no request, only a warning (recovery retries it). Review coverage is a harness query, not yet on the wire (iteration 7). The policy's first-trial values are unmeasured against a real model; no real review was run.

## Iteration 4 — Scope, design and bounded scheduling

**Starting commit:** `4c93ed1` on `feat/plan12-check-findings` (iteration 3). **Contract:** appendix §3.6 records the implemented interface; §3.2, §3.3, §4 and §5 are updated.

### Delivered

- **Fork points captured atomically** (`run/log.ts`, `run/records.ts`, `run/service.ts`): `iteration-assigned` carries `architectRef { session, ref } | null`, the local architect's pinned point at the end of the invocation that produced the assignment, in the same line as the assignment. The `outline-revised` that commits a `request-completion` submission carries the point after it; a revision committed with an assignment carries none, so its presence marks the completion request. No event was added for either.
- **Scope and design questions** (`src/reviews/inputs.ts`, `message.ts`, the run service's review section): the default policy asks `code`, `scope` and `design` of every accepted engineer iteration, three requests over one audited candidate. Scope binds the plan sections its assignment cites, each by the SHA-256 of its text, and forks the pinned assignment point (`scope-review`). Design binds a bounded guidance selection read from the candidate itself (every `*.principles.md`, then the `README.md` of each directory on the way to a changed path; at most 12 files, 64 KiB each, 192 KiB in all) and the key of its orientation. At attempt time each captured input is read again and must have the hash the request bound. The message is the question's complete input whether the reviewer forked or started fresh.
- **Design orientation:** the first design attempt of a key runs one reviewer invocation that reads the guidance inline and submits `submit_orientation`; `review-orientation-recorded` commits it with the executor's end ref. Every design review of the key forks it (`design-orientation`); a changed selection has another key and another orientation; a failed orientation is recorded once and its reviews start fresh with the reason. Concurrent attempts of one key share one orientation.
- **Fresh fallback:** a missing or unusable fork point starts fresh with the caller's degradation on the invocation record; a fork the executor cannot take is recorded as its degradation on `invocation-ended`. `requestedStart` is `fork` for scope and design; `actualStart` is what the executor answered.
- **Scheduler** (`src/reviews/scheduler.ts`): waiting requests start in recorded order; beyond the queue the newest overflow; a request whose attempt or retry could not finish before its deadline (`attemptMs` against the work item's completion request plus `settleMs`, or the run's settlement deadline) is finished at once as `no-time-before-deadline`, with a timer for a waiting request whose last start moment passes. Invocation starts use `PriorityMutex` (`jobs/mutex.ts`): a waiting writer's start goes before every waiting reader's.
- **Prompt package `reviewer/2`:** the reviewer system prompt now says a forked history is context only; scope and design procedures; the orientation's system prompt and submission schema. Every file is in the package hash.
- **Lineage:** fork reasons `scope-review` and `design-orientation`; the fork relation's `generation` is optional and named only by a fork of the architect context. The browser-safe `transcriptForkSchema` and the session pages follow.
- **pi adapter:** a fork opens its parent with the fork's working directory, so the fork's session file names the reviewer's directory instead of the project's (found by the fork-isolation test; negative control below).
- **Pi probe** `src/probes/pi-fork.probe.ts`: a development probe, never collected by Vitest, run once (below).
- **Documents:** harness README, appendix §3.2, §3.3, §3.6, §4, §5.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| `npx vitest run subs/harness/src/tests/review-questions.test.ts subs/harness/src/tests/review-scheduling.test.ts subs/harness/subs/agent/subs/pi/src/tests/fork-isolation.test.ts` | Pass, 3 files, 12 tests; repeated 3 times alone and twice beside `review-attempts`, `review-lifecycle`, `iterations` and `run-recovery` (54 tests each) | Driven runs with the scripted agent, scripted gate Git and scripted candidates; no process started. The pi test runs the real adapter on the offline scripted provider; no model. |
| Negative control for the pi fork's working directory | With the adapter change reverted, `fork-isolation.test.ts` failed: the fork's header named the project's directory | Restored; the test passes. |
| Broad focused batch: the six review files, `union-values`, `composition`, `run-policy`, `analysis-submission`, `execution-map-modules`, `execution-map-projection`, `fixture-trials`, `iterations-integration`, `iterations`, `lineage-metrics`, `local-architect-submission`, `local-authority`, `module-creation`, `placement`, `run-recovery`, `scenario-states`, `session-lifecycle`, `session-reducer`, `transcript-run`, `transcript-writer`, `work-items`; web `run-page`, `session-page`, `session-timeline`, `execution-map`, `session-marks`, `transcript-workspace`; all pi tests; ledger `effects`, `ledger`; evidence `git` | Pass, 45 files, 382 passed, 2 skipped, twice | The first runs failed only in `analysis-submission` (the package expectation updated here) and in iteration 3's CF07 stop test under load (deviation 9). |
| Iteration 3's run-driving batch (36 files: `kpi-metrics` … `readiness`, as listed in its results) | Pass, 226 passed, 2 skipped | |
| `npm run type-check` in `ramify-agent/` | Pass | Harness, web and both script scopes; the probe is type-checked with the harness. |
| `npm run check:self` in `ramify-agent/` | Pass: 0 errors, 0 warnings, 235 analysis limits | 10 owners, 427 source files; the same `signature-inferred` set. The probe receives `createPiAgent`/`piReadiness` through the agent child and `gitCandidateSource` from evidence. |
| `npm run build:web` | Pass | Vite chunk-size advisory only; the web's fork lineage text changed. |
| `git diff --check 4c93ed1` | Clean | |
| Full suite | Not run | Only through ramify-audit, by the orchestrator. |

**Pi fork probe** (`npx tsx subs/harness/src/probes/pi-fork.probe.ts --model openai-codex/gpt-5.6-luna`, run once, exit 0). Two model sessions of one short turn each: the parent (1 request, 315 tokens) and the fork (3 requests, 1,964 tokens); 2,279 tokens in all.

| Observation | Result |
| --- | --- |
| Parent | fresh, ended after one reply; its end ref is the pinned point |
| Later parent turn | appended to the parent without a model call (`appended`) |
| Fork requested from the pinned point | actual start `fork` |
| Codeword the fork submitted | `ALPHA-7`, the pinned one; the fork's session file holds `ALPHA-7` and not the later `OMEGA-9` |
| `store.ts` through `snapshot_read` | `// v1 audited`, while the live tree held `// v3 live`; the fork's file holds no live content |
| Live read | the model sent the absolute live path to `snapshot_read`, which refused it (`absolute`); pi's `read` was not offered, and the model did not call it |
| Fork session file header | names the reviewer's own directory, not the project's; names the parent file as `parentSession` |
| Fork from a point that does not exist | actual start `fresh`, with pi's reason, stopped before any model call |

### Deviations

1. **The design orientation is its own reviewer invocation, with a new event and fork point.** The appendix had `none`, `session` and `unavailable` fork points and no orientation record. An orientation must be a pinned point after the guidance was read and before any candidate, and the port has no way to make a session without a model call, so the first design attempt of a key makes one short invocation. `forkPointSchema` gains `{ kind: 'orientation', key }` and the log gains `review-orientation-recorded` with its record. The "no new event" constraint applied to the architect refs only.
2. **Fork relation and wire.** New fork reasons, and `generation` optional: a review's fork is of another role's session, not of the architect context, and inventing a generation would corrupt the fork-cost measurements that group by it. The browser-safe transcript fork schema changed the same way and the web renders the generation only where there is one.
3. **Guidance comes from the audited candidate**, not the iteration base, so the guidance and the code it judges are one snapshot and a fresh reviewer can read it through the snapshot tools. A change to the guidance by the iteration itself is therefore a new orientation key. The selection rule is a bounded heuristic of this version.
4. **The completion request's marker is the presence of `architectRef` on `outline-revised`** (null included), as appendix §5 now states, since no event may be added for it and the event had no other way to say which revision commits a completion request.
5. **Deadlines before reconciliation.** Iteration 5 owns waiting at a work item's completion. Here the deadline only governs starts: a work item's reviews that could not finish by its completion request plus `settleMs` are finished at once, and the run's final settlement sets a run-wide deadline. The final gate's wait is still iteration 3's. A consequence for tests: with `attemptMs` equal to `settleMs`, as `testReviewPolicy` has, every request still waiting at the completion request is finished at once; tests that keep reviews waiting past it set `settleMs` above `attemptMs`.
6. **Writer priority is start priority.** Readers hold no writer and never block one; the only contended step is the serialized invocation start, where a waiting writer now goes first. Nothing preempts a running reader.
7. **`requestedStart: 'fork'` also for an unusable fork point**, including a design request without guidance: the request intended a fork, and the attempt's `actualStart` (null or `fresh`) says what happened.
8. **The probe made two model sessions**, the parent and the fork, each a single short turn (4 requests in all). A parent pi session file cannot exist without an assistant message, so a pinned point needs one model reply; the later parent turn was appended without a model call.
9. **Iteration 3's CF07 stop test had a start race.** It stopped the run once the third writer's `invocation-started` was on disk, and a stop that lands before the writer's session starts leaves no engineer session to stop. Under the broad batch it failed at `4c93ed1` too (1 of 2 runs with the starting source) and in both loaded runs here. The test now also waits for the writer's session; no harness behavior changed.
10. **Test helpers:** `openRuns` accepts the scripted agent's options (a fork it lacks); `reviewRun` accepts candidates, agent options, the architect's turns, the clock and a hook with the agent, and selects scope, design and orientation scripts.

### Acceptance matrix

| Case | Covered here | Evidence |
| --- | --- | --- |
| CF04 (scope and design) | Clean scope and design reviews cover their scope; partial scope and design reviews keep their missing paths; an invalid scope submission is retried once; a design review without guidance is unavailable; overflowed and no-time requests are not verified and never started | `review-questions.test.ts` (clean 9 of 9; partial `rq-0005`, `rq-0006`; no guidance); `review-scheduling.test.ts` (retry `rq-0002`, overflow `rq-0004`–`rq-0006`, `no-time-before-deadline` `rq-0002`, `rq-0003`) |
| CF05 (with forks) | Forked scope and design readers keep a reader's equipment and read only the candidate; one reader runs beside the writer; the real pi fork read the audited `v1` while the live tree held `v3` and refused the absolute live path | `review-questions.test.ts` equipment assertions; `review-scheduling.test.ts` drain case; `fork-isolation.test.ts` (tools offered, `Tool read not found`, header); the probe |
| CF10 (fork part) | A fork the executor cannot take and a failed orientation start fresh with the same complete message and a recorded reason; a fork point that no longer exists degrades to fresh in pi | `review-questions.test.ts` "an executor that cannot fork …" and "a failed orientation …"; pi `session-modes.test.ts`; the probe's degraded fork. The failed parent-append part is iteration 5. |
| CF15 (queue, retry, deadline) | Recorded-order draining with one reader, one retry, overflow of the newest, and at-once `no-time-before-deadline` after the completion request; the queue's own deadline timer; writer start priority | `review-scheduling.test.ts`, six cases |
| Plan exit | Three requests bind one candidate and distinct questions; the scope fork sees the assignment point and not a later parent turn (`rq-0005` forks `…#0` after the append; `rq-0008`, assigned after it, holds it); changed guidance is a new orientation | `review-questions.test.ts` first case |

### Handoff to iteration 5

- **Fork refs:** the scope point is `iteration-assigned.architectRef`; the reconciliation point is the `outline-revised` with `architectRef` for the work item's latest completion request, whose `invocation` names the harness point `{ session, invocation }` to fork. Add a `reconciliation` fork reason (records and wire) and fork it as `reviewStart` does; a null or absent ref starts fresh with the complete packet and the caller's degradation.
- **Terminal request state:** `reviewStateOf(events)`, `RunService.reviews(planId, runId, workItem?)` and each attempt's record (`requestedStart`, `actualStart`, result). `reviewDeadline(run, request)` already derives a request's deadline from its work item's completion request; iteration 5 moves the wait itself from the final gate to the completion request. `stopReaders` closes the whole queue and is run-wide: a per-work-item deadline needs a stop that fences that item's attempts and leaves the queue open.
- **Policy and prompts:** `run-policy/3` with the three kinds is captured by production runs; test policies still request no reviews unless a test asks. `reviewer/2` is the package.
- **Trusted inputs bound here:** request `requirements` and `guidance` hashes (re-read and compared at attempt time), fork points from the log, the orientation key, and actual start from the executor.
- **Open gaps:** the probe did not fork a parent that pi was still writing to; a fork of a live architect session reads its file while it may be appended. Orientation cost and fork against fresh cost are unmeasured beyond the probe's token counts (iteration 8). The guidance selection is a heuristic, not a relevance judgment. The real model never called an unoffered built-in, so pi's refusal of one is evidenced by the scripted-provider test only. The scripted fake's fork inherits appended context, not turns, so the harness tests prove the pinned ref and the pi test and the probe prove the pinned history.

## Principles revision (2026-09-24)

Iteration 5 was stopped while in progress and its state committed unverified
as `8183f0a`. The revised [CheckFinding principles](../../check-findings.principles.md)
and the harness principle Trust Follows Provenance (`23a84bb` on
`ramify-agent`) were merged in as `3202ce7`. The plan and the appendix were
amended in the same change: `accept` becomes `waive` and is sticky,
`verified` becomes `fixed`, reports carry `risk`, `ground`, `credibility` and
`modules`, correction rounds have a floor, and exhaustion leaves signals
unresolved. Iteration 4b (renames, signal fields, module attribution) comes
next; iteration 5 then resumes from the wip commit against the amended §6.

## Iteration 4b — Renames, signal fields and module attribution

**Starting commit:** `6b91f7a` on `feat/plan12-check-findings` (iteration 4 at `72861aa`, the principles revision `3202ce7`, the amended plan and appendix `30be57a`, and iteration 5's wip `8183f0a` set aside). **Contract:** appendix §1.4 rule 7, §1.5, §1.6, §1.8, §3.2, §3.4 and the new §3.7 record what was implemented; §9 records the stream.

### Delivered

- **Child renames** (`subs/harness/subs/check-findings/`): `verify-by-check` → `fix-by-check`, `verify-by-assessment` → `fix-by-assessment`, `accept { authority, uncertainty }` → `waive { authority, acceptedRisk, uncertainty }`, with the reasons `fixed-by-check`, `fixed-by-assessment` and `waived`. New action `revoke-waiver { reason }` (closed `waived` → open `waiver-revoked`, repair and settlement cleared) and the rejection codes `waived` (a `reopen` of a waiver) and `not-waived` (a revocation of anything else).
- **Sticky waivers:** a same-key report never reopens a waived CheckFinding, whatever its source; it is added as evidence. A `same-issue` relation whose resulting group's canonical is waived also emits, as the harness actor, a `waive` of each newly joined open member under the canonical's waiver (`governing-record`), in the same decision; a member bound to a required check or awaiting a user's answer stays open. A required check still cannot be waived by anyone, the user included.
- **Signal fields:** judgments carry `risk` (`high | medium | low`) and `ground` (`{ ref, hash }` or null); reports carry the harness-bound `credibility` and `modules`; a decision may carry a `risk` correction. `signals.ts` (internal) derives each CheckFinding's current risk, credibility (`objective-reproduced` for two objective reports) and modules after every event; the replayed entry and every summary hold them. `invalid-report` refuses a credibility that does not fit the report's kind or ground.
- **Queries:** `list` gains `module` (CheckFindings whose modules include it; counts narrowed the same way) and `order: id | attention` (risk, then credibility, then latest report, then ID; the cursor is a position in the order).
- **Worked stream:** steps 1–20 of appendix §9 under the new names, with `cf-0006` waived, the revocation of `cf-0003`'s waiver as step 17, the re-raise `cf-0007` (step 19) and the harness waiver `cfd-0013` of step 20; 24 events, identical after a JSON-line replay.
- **Review submission and mapping** (`src/reviews/`): each concern carries the reviewer's `risk` and `ground: { path, quote? } | null`. `SnapshotTools.read()` records every file `snapshot_read` answered with the `sha256:` of its content, and a ground must be one of them (returned to the reviewer as a validation error otherwise). `signals.ts` classifies the ground's credibility and builds the candidate's own module index from its `module.ramify` files; the run service's `concernBindings` reads both before the transition takes the mutex, and `finishReview` binds ground, credibility and modules into each report. The scope question's message names the plan document when the candidate holds it.
- **Prompt package `reviewer/3`:** the system prompt explains risk and ground (version 3); the code, scope and design procedures (version 2) say what grounds a concern of their question.
- **Documents:** the child's and the harness's READMEs; the appendix.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| `npx vitest run subs/harness/subs/check-findings/src/tests/` | Pass, 6 files, 75 tests | Pure tests over literal input: renames, waivers, revocation, sticky re-raise by key and by relation, risk correction, credibility form rules, attention order, module filter, the stream. |
| `npx vitest run subs/harness/src/tests/review-signals.test.ts subs/harness/src/tests/review-tools.test.ts subs/harness/src/tests/review-attempts.test.ts subs/harness/src/tests/review-lifecycle.test.ts subs/harness/src/tests/composition.test.ts subs/harness/src/tests/check-findings-ledger.test.ts subs/harness/src/tests/check-findings-run.test.ts subs/harness/src/tests/analysis-submission.test.ts` | Pass, 8 files, 64 tests | `review-signals` is new: classifier and module-index units, and one driven run (scripted agent, scripted gate Git and candidates, no process) whose reviewer is refused a ground it had not read, reads it, and has five concerns bound. |
| Focused batch of 32 files: the child's six, the seven review files, both CheckFinding files, `union-values`, `composition`, `run-policy`, `analysis-submission`, `run-recovery`, `iterations`, `projections-pure`, `run-projections`, `execution-map-projection`, `line-events`, `run`, `session-lifecycle`, `work-items`, `iterations-integration`, `local-architect-submission`, `transcript-run`, `fixture-trials` | Pass, 31 files passed and 1 skipped; 290 tests passed, 2 skipped | The skipped file and tests are the existing opt-in ones. |
| `npm run type-check` in `ramify-agent/` | Pass | Harness, web and both script scopes. |
| `npm run check:self` in `ramify-agent/` | Pass: 0 errors, 0 warnings, 239 analysis limits | 10 owners, 430 source files. The 4 new limits are the child's new exported schemas (`signature-inferred`). |
| `git diff --check 6b91f7a` | Clean | |
| `npm run build:web` | Not run | `subs/web` unchanged. |
| Full suite | Not run | Only through ramify-audit, by the orchestrator. |

### Deviations

1. **Step 21 is not in the child's fixture.** Its `correction-floor` refusal is the harness's, before the child decides (§6), and the child has no floor. The fixture holds steps 1–20; iteration 5's reconciliation tests own step 21. Appendix §9 says so.
2. **Risk of a report without a judgment.** The appendix gives every report a risk through its judgment, but a failed check has none. The child derives `high` for a required check and `medium` otherwise; iteration 6 may supply a judgment instead if it needs another level.
3. **Credibility form rules.** Beyond the appendix, `invalid-report` refuses an objective review concern, a non-objective failed check, and a review concern whose `ungrounded` disagrees with its ground.
4. **The relation-to-waiver exception, made exact:** "newly joined" is a member of the resulting group not in the canonical's group before; the relation is always accepted; a member awaiting a user's answer stays open (a waiver would be refused `awaiting-user-decision`), as a required check does. The harness waiver's `acceptedRisk` is the member's current risk and its `uncertainty` the canonical waiver's.
5. **A revocation also ends a material choice.** The summary's material choice stops at `revoke-waiver` as it stops at `reopen`, so a revoked waiver's reported choice is no longer shown as current; it stays in the history.
6. **The approved-requirement credibility rule has nothing to match.** A ground must be a candidate file the reviewer read, and the run's records live in its gitignored state directory, so the classifier implements the three rules a candidate path can meet. Recorded in §3.7.
7. **Ground hash** is the `sha256:` of the content `snapshot_read` answered, recorded when it answered, rather than Git's blob ID, which is SHA-1 and not the `sha256:` form the child requires.
8. **The candidate module index** is built from the candidate's own `module.ramify` files (root, then each `subs/<name>/`), not from the live architect view, which describes the current tree. A module owns `src/`, `module.ramify` and `README.md`, as `ownerOf` expects; a candidate whose declarations cannot be read falls back to the work item's module with a warning.
9. **Waive and revoke authority are not validated here.** The appendix's module and rank rules (§10) are harness checks of the reconciliation (iteration 5) and the user commands (iteration 7); this iteration makes `modules` and the waiver's actor available to them.

### Acceptance matrix

| Case | Covered here | Evidence |
| --- | --- | --- |
| CF16 (4b part) | A waived CheckFinding stays closed on a same-key re-raise from the same and another source; a same-issue relation joins a re-raise to a waived canonical and waives it as the harness; revocation reopens; `reopen` of a waiver is refused; a required check cannot be waived, by an agent or the user | `identity.test.ts` "keeps a waived CheckFinding closed …"; `relations.test.ts` "a re-raise joined to a waived issue" (4 cases); `decide.test.ts` "waivers" and "refuses to waive or defer a required obligation …"; stream steps 10, 17, 19–20. Module-authority refusals remain iterations 5 and 7. |
| CF17 (4b part) | Risk comes from the reviewer, credibility and modules from the harness (a reviewer cannot declare them); credibility for a principles path, a plan path, a feature file, a test path and no ground; modules from the candidate's own tree, with the work item fallback; lists order by risk, credibility and recency and filter by module | `review-signals.test.ts` (units and the driven run); `review-tools.test.ts` ground and schema cases; `queries.test.ts` "attention order and modules"; `stream.test.ts` iteration 4b cases. The unresolved marker remains iterations 5 and 7. |

### Handoff to iteration 5

Iteration 5 resumes from `8183f0a`; its twelve files were written against the names on the left.

- **Renamed in the child** (`interfaces/check-findings.ts`, `decide.ts`, `replay.ts`): action `verify-by-check` → `fix-by-check`; action `verify-by-assessment` → `fix-by-assessment`; action `accept { authority, uncertainty }` → `waive { authority, acceptedRisk: 'high' | 'medium' | 'low', uncertainty }`; reason `verified-by-check` → `fixed-by-check`; reason `verified-by-assessment` → `fixed-by-assessment`; reason `accepted` → `waived`. No event, run event, carrier, record path or schema literal was renamed.
- **Added to the child:** action `revoke-waiver { reason }`; reason `waiver-revoked`; rejection codes `waived`, `not-waived`; decision input `risk?`; judgment `risk`, `ground` (`CheckFindingGround | null`); report input `credibility` (`CheckFindingReportCredibility`) and `modules`; entry and summary `risk`, `credibility` (`CheckFindingCredibility`), `modules`; list query `module` and `order: 'id' | 'attention'`; exported `checkFindingRiskSchema`, `checkFindingGroundSchema`, `checkFindingCredibilitySchema`, `checkFindingReportCredibilitySchema` and their types. The exposed functions are unchanged.
- **Harness:** `reviewConcernSchema` gains `risk` and `ground` (`reviewGroundSchema`); `SnapshotTools.read()`; `ReviewEvidence.read` (required); `finishReview(run, request, attempt, result, settles, submission?, bindings = [])` requires one binding per submitted concern; new `src/reviews/signals.ts` (`groundCredibility`, `candidateModuleIndex`, `concernModules`); `ReviewBriefing.planDocument`; `reviewerPackage` is `reviewer/3`.
- **Porting the wip mechanically:** in `reviews/reconciliation.ts` the mapping `case 'verified'` → `verify-by-assessment` becomes `fix-by-assessment`, and `case 'accept'` → `{ action: 'accept', authority, uncertainty }` becomes `{ action: 'waive', authority, acceptedRisk, uncertainty }` (take `acceptedRisk` from the architect or from the CheckFinding's current `risk`); the architect-facing action names `verified` and `accept` in `reconciliationActionSchema` and `prompts/reconciliation.procedure.md` should follow the principles' words (`fixed`, `waive`). `prompts/packages.ts` conflicts on the `reviewerPackage` line only: keep `reviewer/3` beside the wip's local-architect change. The wip's `service.ts` calls of `finishReview` compile unchanged with the optional `bindings`. Order the basis and the packet with `selectCheckFindings(state, { kind: 'list', …, order: 'attention' })`.
- **Trusted inputs bound here:** judgment `ground` (a path `snapshot_read` answered, and its content hash), `credibility` and `modules`. Iteration 5 binds a decision's `risk` correction, the waive actor's module authority against `modules` (§10) and the revocation rank; iteration 7 binds the user's.
- **Remaining coverage:** the floor and `correction-floor` (step 21), `insufficient-authority` for a waiver outside the local architect's module, unresolved reasons and the marker (iteration 5); per-module counts and the waive and revoke commands (iteration 7); an objective producer's risk if iteration 6 needs a level other than the derived one.
- **Open gaps:** the credibility classifier's plan rule trusts that `plans/<planId>/` holds only human-reviewed documents; an agent that writes there would be credited. No real reviewer was run with `reviewer/3`.

## Iteration 5 — Work-item assessment and ordinary repairs

**Starting commit:** `cbacc97` on `feat/plan12-check-findings` (iteration 4b). The work began at `72861aa`, was paused as the unverified wip `8183f0a` for the principles revision, set aside by `6b91f7a`, and was ported onto 4b's renames and the amended §6. **Contract:** appendix §6.1 records the implemented interface.

### Delivered

- **Per-work-item settlement** (run service): at a completion request the work item's review requests are awaited until their deadline (the completion request plus `settleMs`); what is left is finished as not verified `deadline` and only its readers are stopped, so the queue stays open. A reader whose request its deadline settled while it was being started ends at once with no session (`InvocationRequest.fenced`, and `review-attempt-started` is recorded under the mutex only for an unsettled request). `ReviewQueue.changed()` wakes the waiting driver.
- **Reconciliation** (`src/reviews/reconciliation.ts`, `reconciliation-message.ts`, the service's reconciliation section): the attention set is read in attention order (risk, credibility, recency); an empty set goes to the gate with no agent call. A round records `reconciliation-started` with its basis (source, settled requests, attention set, `due: []`, state version, fork point, floor `any | non-low | none`) and forks the local architect at the latest completion request's `architectRef` (fork reason `reconciliation`), or starts fresh with the same packet and a recorded degradation. The fork's one submission (`submit_reconciliation`) relates, disposes (`repair`, `fixed`, `supersede`, `waive`, `defer`, `request-user-decision`, `leave`, with an optional risk correction) and names the next action; the harness refuses a correction below the floor (`correction-floor`), a signal left open above it, and a waiver outside the work item's module (`insufficient-authority`), requires exactly one disposition per signal that needs one, binds a user decision's exact plan or source text with the harness's revision, and dry-runs the child's `assess` so a refusal returns to the fork.
- **Commit and brief:** the assessment is decided under the mutex against the basis (source, request set, revisions, latest round) as the intent of a ledger effect keyed `brief:<reconciliation>`; its effect appends the brief (the recorded decision and relation IDs, what was left open, the next action and the fork's account) to the architect's own session and its completion is `reconciliation-brief-appended`. Recovery performs a pending append once. A brief that did not land is quoted in the next architect input from the committed record; a lost session is finished `lost` and the next turn starts fresh.
- **Correction loop:** `next: correct` continues the architect's session (continue reason `reconciliation`) with the correction's goal and planned CheckFindings; its next assignment records `corrects`, and when that iteration closes accepted its `iteration-closed` carries `claim-repair` for each CheckFinding planned under the intent, on the audited tree. The correction goes through the ordinary gate and reviews, and the next completion request reconciles again. `await-user` waits, woken by `recordCheckFindings`, until the answer is recorded, then starts the next round.
- **Rounds and completion:** round 1 starts for any signal; a later round only for a signal of at least `laterRoundMinimumRisk` (new policy limit, `medium`) or a claimed repair or answered decision; none after `reconciliationRoundsPerWorkItem`. Before `work-item-completed` the basis is validated once more under the mutex: a changed source (beyond the expected feature-file rendering) or request set refuses the completion; a moved or new signal refuses it when a round remains and is warranted; otherwise `work-item-completed` names each open signal as `rounds-exhausted`, `below-floor` or `raised-after-last-round`. Refusals are `reconciliation-refused`.
- **Prompts:** `local-architect/3` with `reconciliation.procedure.md` and its submission schema; the parent procedure says how a correction returns to it.
- **Documents:** harness README, appendix §6.1.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| `npx vitest run subs/harness/src/tests/reconciliation.test.ts subs/harness/src/tests/reconciliation-submission.test.ts` | Pass, 2 files, 23 tests (11 driven, 12 pure) | Driven runs with the scripted agent, scripted gate Git and scripted candidates; no process, no model. The crash cases freeze inside the agent's append and restart with the same scripted agent. |
| Focused batch 1: every `review-*`, both `reconciliation*`, both `check-findings-*`, the four `composition*`, `union-values`, `run-policy`, `analysis-submission`, `run-recovery`, `iterations*`, `run`, `work-items`, `local-architect-submission`, `placement`, `local-authority`, `module-creation*`, `scenario-states`, `session-lifecycle`, `session-reducer`, `transcript-run`, `transcript-writer`, `fixture-trials`, every `execution-map-*`, `projections-pure`, `run-projections`, `lineage-metrics`, `kpi-metrics`, `line-events` | Pass, 46 files passed and 1 skipped; 387 tests passed, 2 skipped | The skipped file and tests are the existing opt-in ones. |
| Focused batch 2: every `contract-*`, `scenario-*`, `requirement-*`, `accepted-*`, `integration-scenarios*`, `readiness*`, `progress*`, `audit-*`, `run-protocol*`, `single-session*`, `iteration-gate*`, and `acceptance-trial`, `breaking-work`, `gate-not-verified`, `late-writes`, `commit-recovery`, `protocol-contract`, `http`, `run-commands`, `run-closing-order`, `run-bounds`, `stop-before-start`, `writer-settlement`, `session-fixture`, `session-queries`, `measurement`, `no-rewind`, `materialization`, `hook-checks`, `compaction`, `recorded-environment`, `engineer-briefing`, `fork-submission`, `analysis-scenarios`, `transcript-pages` | Pass, 53 files; 378 tests passed, 2 skipped | |
| `npm run type-check` in `ramify-agent/` | Pass | Harness (tests included), web and both script scopes. |
| `npm run check:self` in `ramify-agent/` | Pass: 0 errors, 0 warnings, 239 analysis limits | 10 owners, 434 source files; the same `signature-inferred` set as 4b. |
| `npm run build:web` | Pass | Vite chunk-size advisory only. The transcript protocol's fork and continue reasons gained `reconciliation`; no web source changed. |
| `git diff --check cbacc97` | Clean | |
| Full suite | Not run | Only through ramify-audit, by the orchestrator. |

### Deviations

1. **`reconciliation-refused` is a new event.** §6 names the refusals but no record of them; without one a refused assessment or completion would be invisible in the log. `reconciliation-exhausted`, drafted in the wip, was dropped: the unresolved reasons on `work-item-completed` carry exhaustion, as the amended §6 says.
2. **`leave` action.** The amended plan leaves signals below the floor unresolved, but the fork needs a way to say so for each signal while "no signal is skipped". `leave` records no child decision (so it carries no risk correction) and is refused above the floor, which keeps `below-floor` and `rounds-exhausted` accurate.
3. **Later-round start rule.** "A later round only for a signal of non-low risk" is read as: a signal of at least `laterRoundMinimumRisk` needing a disposition, or a claimed repair or answered user decision awaiting the assessment an earlier round planned. Without the second clause a first-round correction of a low-risk signal would never be confirmed. The same rule decides whether a moved or new signal refuses a completion ("clears the next round's floor" in §6, whose last round's floor is `none`).
4. **Changed source or request set always refuses a completion**, rounds or not: the next capture binds the source as it stands, so the loop converges, and a changed implementation never inherits a reconciliation. A completion refused more than `reconciliationRoundsPerWorkItem` times for one request fails the run as `repair-exhausted` rather than looping.
5. **Refusal bound.** §6 says a refused submission is returned to the fork once; the implementation uses the invocation's ordinary rejection bound (`rejectedSubmissionsPerTurn`), after which the round is refused and, bounded by the rounds, reconciled again.
6. **No revisit condition is evaluated** (`due` is always `[]`): revisit conditions are prose, and a heuristic would manufacture attention. A deferred signal stays visible history; a fork may still relate to it.
7. **The brief append moves no harness point.** Its completion event is not a session-reducer event: as with the engineer's continuation note, the executor's ref moves and the harness point stays at the end of the architect's invocation; the next continuation lists the reconciliation in its `briefs`, and the transcript records it as `note-appended`.
8. **No new `RunWrite` boundary.** As in iteration 3, the crash cases freeze at the agent's append (before it, and after it before the completion) and restart; the recovery table needs no new row.
9. **`defer` and `waive` authority** is `work-item-assessment` for every fork decision; module authority is checked against the signal's `modules` (its work item's module or beneath it). Revoking a waiver is not offered to the fork in this version.
10. **Existing test scaffolding:** `reviewRun` gains `reconcilers`, `gates` and `limits`; a reconciliation with no script ends without a submission. `composition.test.ts` names the shared CheckFinding event unions by their first carrier, now `iteration-closed`, and cites the new values' tests or states why they have none (`failed` and `no-session` append outcomes, a `partial` basis request, a `fresh` requested start, `laterRoundMinimumRisk: high`).

### Acceptance matrix

| Case | Covered here | Evidence |
| --- | --- | --- |
| CF02 (judgment part) | A judgment is superseded with no code change | `reconciliation.test.ts` "parallel reports …" (`cf-0003` superseded). The factual part remains iteration 6. |
| CF03 | Two parallel reports of one behavior are related `same-issue` with rationale and keep both IDs and histories; two same-file concerns stay distinct | same test: group `{cf-0001, cf-0004}`, `cf-0002` related-but-distinct and ungrouped |
| CF08 | No reconciliation and no assessment call for an empty attention set; the gate follows | "clean reviews take the work item to its gate …" |
| CF09 | A moved revision refuses the assessment and a new round follows; a changed source and a later warranted signal each refuse completion | "a changed revision refuses the assessment, …"; `reconciliation-submission.test.ts` basis cases |
| CF10 | A fork point that no longer exists starts fresh with the packet, recorded as requested fork, actual fresh; a failed append reaches the next architect input from the log; a crash before or after the append is recovered once | "a fork point that no longer exists …"; "a crash before/after the parent append …" |
| CF11 | A repair decision carries its intent, survives a crash, is resolved by the next assignment (`corrects`), claimed on `iteration-closed`, and stays open until the next round fixes it | "a repair is planned with its intent …"; the crash tests |
| CF12 | Routine concerns settle with no person; a weak tension is waived as a reported material choice; a strong conflict asks with the exact plan text, its revision and options, waits, and the answer is assessed next round; the gate still runs after a waiver and keeps its verdict | "parallel reports …"; "the conflict cites the plan's exact text …" |
| CF15 | A reader running at the work item's deadline is fenced and stopped while the queue stays open; the correction's review runs; the floor refuses a later-round correction of a low signal; the last round plans none and leaves signals unresolved; nothing manufactures a pass | "a reader still running at the deadline …"; "a repair is planned …"; "at the last round …"; submission rule tests |
| CF16 (iteration 5 part) | A waiver outside the architect's module is refused (driven and pure); a waived signal stays waived | "a changed revision refuses …" (`insufficient-authority: cf-0003 concerns project/cart`); submission rule tests. User commands remain iteration 7. |

### Handoff to iteration 6

- **Contracts:** appendix §6.1. Reconciliation reads the attention set with `order: 'attention'`; a factual CheckFinding awaiting a witness needs no disposition and does not by itself warrant a later round unless its risk clears the minimum. `iteration-closed` is a carrier; `gate-attempted` is iteration 6's (use `decideCheckFindingTransaction` inside the gate effect's completion, and keep the attempt when the CheckFinding part is refused).
- **Trusted inputs bound here:** actor (the fork's invocation), source (the basis tree), authority (`work-item-assessment` of the round), expected revisions, the repair intent, a conflict's revision, the claim's candidate and change, waive authority against `modules`, and the floor.
- **Remaining coverage:** factual witnesses and CF13 (iteration 6); the wire, user waive and revoke commands and the unresolved marker (iteration 7); full composition, a measured trial and the browser (iteration 8).
- **Open gaps:** no revisit condition is evaluated; `failed` and `no-session` append outcomes have no driven test; the reconciliation fork was never run with a real model; waiting for a user decision has no bound beyond a stop.

## Iteration 6 — Factual scenario witness

**Starting commit:** `13f477e` on `feat/plan12-check-findings` (iteration 5). **Contract:** appendix §7.1 records the implemented interface; §2.1 marks the `gate-attempted` carrier implemented.

### Delivered

- **Scenario producer adapter** (`src/checks/scenario-findings.ts`): `scenarioObservations` turns one committing gate attempt's scenario summary into one observation per tracked scenario it executed or selected by identity, with coverage (`complete`, `partial`, `not-run`), outcome (`passed`, `failed`, `inconclusive`), a selection identity and the run's breadth; `planScenarioFindings` decides, against the state under the run mutex, the promotion reports of a failing gate or the `fix-by-check` witnesses of a passing one, one scenario at a time, leaving each refused or unfitting scenario out as a note; `classifyScenarioAttempts` (`reproduced`, provisional `intermittent`, `inconclusive`); `coversBreadth`; `scenarioGatesToRead`.
- **Promotion only for continuity:** a failed tracked scenario is promoted when the work item's CheckFinding for `scenario:<id>` exists or an earlier gate attempt of the same work item failed it too; the line then reports the earlier failures (at most nine) and the current one, oldest first, so the CheckFinding is `objective-reproduced`, required and high-risk from the start. A first failure stays on its gate attempt and reads no tree.
- **Witness:** a passing gate offers, for each open scenario CheckFinding of its work item it observed, the same scenario at obligation revision 1 on the audited tree being accepted, with the observed coverage and outcome; the child decides. The adapter itself refuses to attest the obligation (`obligation-changed`) when the result names another file than the record or the attempt's guarded comparison reported the feature file changed. A run narrower than the one that observed the latest failure is offered as `partial`. A pass on the latest failure's tree is refused by the child as `failure-source` and carries the classification of the attempts on that tree.
- **Gate composition** (run service `scenarioGateFindings`, `gateAttempted`): the gate effect's `perform` reads the tracked scenarios, the work item's earlier gate attempts and only the audited trees a promotion or witness needs (through the candidate source), outside the mutex; `complete` plans and commits with `decideCheckFindingTransaction`. `gate-attempted` gains the optional `checkFindings` carrier and `scenarioFindings { refused, notes }`. A tree that cannot be read, or a refused transition, commits the attempt and its verdict unchanged with the refusal on the line and a warning. The verdict and `next` are computed before any of this and never read it.
- **Scenario reducer** (`subs/scenarios/src/messages.ts`): a result the stream does not hold whole carries `unfinished { pickles, steps, observed }`, so a failure a finished step observed is told from a gap.
- **Event page:** a gate's line names its CheckFinding events or its refused part.
- **Tests and scaffolding:** `scenario-findings.test.ts` (pure, real child), `scenario-findings-run.test.ts` (driven), three reducer cases; `treeCandidates` in `helpers/candidates.ts`, which `scenario-states.test.ts` now passes, since its exhaustion and withdrawal-crash runs repeat a failure and now read trees; the composition inventory.
- **Documents:** harness and scenarios READMEs; appendix §2.1 and §7.1.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| `npx vitest run subs/harness/src/tests/scenario-findings.test.ts subs/harness/src/tests/scenario-findings-run.test.ts subs/harness/subs/scenarios/src/tests/messages.test.ts` | Pass, 3 files, 41 tests (18 pure adapter, 4 driven, 19 reducer) | Pure tests over literal gate attempts and the real CheckFinding child. Driven runs use the scripted agent, answered Git, scripted trees (`treeCandidates`) and the direct scenario executor; no process starts (the process guard is installed). The crash case freezes inside the promoting gate's audit and recovers with a fresh service. The reducer cases cut the recorded real cucumber-js streams. |
| The driven file with `scenario-states` and `reconciliation`, three times | Pass, 28 tests each time | |
| Negative control: promotion on a first failure | With the continuity rule removed, 5 tests failed (2 pure, 3 driven) | Restored; they pass. |
| Wide focused batch: every harness test file whose name starts with `scenario`, `composition`, `union`, `run-recovery`, `iteration`, `reconciliation`, `review-`, `check-findings`, `acceptance`, `fixture`, `integration-scenarios`, `execution-map`, `run-projections`, `projections-pure`, `protocol-contract`, `http`, `materialization`, `analysis-scenarios`, `commit-recovery`, `gate-`, `late-writes`, `work-items`, `iterations`, `breaking`, `contract-`, `run.test`, `run-protocol`, `readiness`, `single-session`, `placement`, `requirement-`, `accepted-`, `progress`, `audit-`, `run-commands`, `run-closing-order`, `run-bounds`, `stop-before-start`, `writer-settlement`, `session-`, `measurement`, `no-rewind`, `hook-checks`, `compaction`, `recorded-environment`, `engineer-`, `fork-submission`, `transcript-`, `kpi-`, `lineage-`, `line-events`, `local-`, `module-creation`, `run-policy`, `analysis-submission`, `direct-check`, `external-boundaries`, `tree-identity`, `unguarded`, `write-guard`, `neutral`, `observation`, `plans`, `project-config`, `read-excursions`, `record-reader`, `shell-tool`, `test-selection`, `lock`, `commit.test`; the scenarios, check-findings and ledger children's tests | Pass, 141 files passed and 2 skipped; 1155 tests passed, 7 skipped | Explicit file paths, not the full suite. The skipped files and tests are the existing opt-in ones. Before the inventory was updated, `composition.test.ts` alone failed on the new union values. |
| `npm run type-check` in `ramify-agent/` | Pass | Harness (tests included), web and both script scopes. |
| `npm run check:self` in `ramify-agent/` | Pass: 0 errors, 0 warnings, 239 analysis limits | 10 owners, 437 source files; the same `signature-inferred` set as iteration 5. The adapter receives the child's `decide.ts`, `replay.ts` and interface file and the scenarios child's `scenarioIdSchema`. |
| `npm run build:web` | Not run | `subs/web` unchanged; no browser-safe protocol schema changed. |
| `git diff --check 13f477e` | Clean | |
| Full suite | Not run | Only through ramify-audit, by the orchestrator. |

### Deviations

1. **The promotion rule, made exact.** "Needs cross-attempt continuity" is read as: the same tracked scenario failed an earlier gate attempt of the same work item, or the work item already has its CheckFinding. At promotion the line reports the earlier failures too (at most nine), so the history and the reproduced credibility are there from the first CheckFinding event. The appendix's worked stream (step 7) opened at the first failure; that fixture is the child's and unchanged.
2. **Selection identity.** Appendix §7 had `<mode>/<selection kind>@<profile hash>`. The implemented selection is `<mode>/<run module>@<command hash>`, the conditions the scenario itself ran under, and the selection kind moved to the observation's breadth: a narrower run than the one that observed the latest failure is offered as `partial` and refused as `insufficient-coverage`. With the kind in the selection string, a work-item gate (`all-untagged`) could never verify an iteration gate's (`identity`) failure, and such a CheckFinding would spend correction rounds on a scenario that already passes. Another mode is still `incomparable-inputs`. The support files, setup and teardown are the run's captured configuration and cannot vary within a run.
3. **The obligation is attested by the adapter.** Scenario records are immutable, so the adapter always offers revision 1, and only when the result names the record's feature file and the attempt's guarded comparison found that file unchanged; otherwise it notes `obligation-changed` itself without asking the child. An authorized `revise-obligation` makes the child refuse a revision-1 witness. No harness path revises a scenario obligation yet.
4. **Only a passing gate is a witness.** A scenario that passes inside a failing or unverified gate is on no candidate being accepted, so it is recorded on its attempt only.
5. **Reducer change in the scenarios child.** Coverage `partial` needs to know that a pickle or step did not finish; the summary had only failure strings, so the reducer's result gains `unfinished`, present only when the stream does not hold the scenario whole. A record written before this change reads as whole; only failures are ever read from earlier records, and a witness is always the current gate.
6. **`gate-attempted.scenarioFindings`** records a refused CheckFinding part and each scenario left out, as iteration 2's handoff asked; no event was added. The refusal reasons are `source-unavailable` and `transition-refused` (the transition's reason in the message), since the plan decides every command beforehand.
7. **Trees read in the gate's `perform`.** Report and witness sources are audited trees, which only Git can answer, so they are read outside the mutex through the candidate source, and only when the gate has something to promote or witness. Tests of runs that repeat a scenario failure now script the trees; `scenario-states.test.ts` gained `treeCandidates` for that reason and no other change.
8. **Classification is computed only for a `failure-source` witness,** where one pass is present, so a note's classification is `intermittent` or `inconclusive`. There is no focused rerun producer (outside v1); `classifyScenarioAttempts` is the factual contract such a producer would use, and its `reproduced` case is tested directly.
9. **No new `RunWrite` boundary.** The crash case freezes inside the promoting gate's audit, after its commit, and recovery re-audits the commit found by its trailers; the recovery table needs no new row.
10. **Composition inventory.** The new union values cite the tests that produce them; the child's other rejection codes on a note and `transition-refused` are recorded with the reason no path reaches them. `fix-by-check`, a `complete` and `passed` witness and `check-finding-reported` now cite this iteration's driven test instead of being excused.

### Acceptance matrix

| Case | Covered here | Evidence |
| --- | --- | --- |
| CF13 | A same-scenario pass on a changed candidate fixes; a pass of another scenario, a gate that did not run it, a narrower run, another mode, the failure's own tree, a changed feature file, a revised obligation, a timeout, a launch error, a missing stream, a partial result and a result that did not pass do not; two passes on the failure's tree are provisionally intermittent and fix nothing | `scenario-findings-run.test.ts` "two failures across repair rounds …" and "failed twice and passed on one unchanged tree …"; `scenario-findings.test.ts` witness cases and the observation cases for timeouts, launch errors and missing streams |
| CF02 (factual part) | A scenario CheckFinding cannot be superseded, fixed by assessment or waived; it stays open through a passing required gate until its own witness | `scenario-findings.test.ts` "a required scenario CheckFinding lists as a high-risk objective signal …"; the unchanged-tree driven run |
| Gates unchanged | Every gate keeps the verdict its checks gave: failed, failed, passed with a CheckFinding opened and fixed; a passing gate implements its scenario while the CheckFinding stays open; a refused part commits the attempt all the same; recovery commits the promoting gate once | the four driven cases |
| Untracked scenarios | Counted on the attempt, never identified or promoted | the first driven case (one of the project's own scenarios failed, one CheckFinding in all); the observation case for the project's own scenarios |

### Handoff to iteration 7

- **Supported producer shape:** the `scenarios` command of a committing gate attempt with a work item (`iteration`, `contract`, `breaking-iteration`, `work-item`), executing (not dry), whose summary names tracked scenarios by result or identity selection. Producer `check:scenario`, issue and report key `scenario:<id>`, owner the gate's work item, obligation `{ scenario:<id>, 1 }`, `required: true`, risk `high` (derived by the child), credibility `objective` (`objective-reproduced` once two reports), modules the scenario's owner.
- **Unpromoted check failures:** a first failure of a work item, inconclusive observations, dry runs, the project's own scenarios, readiness and final gates, a gate whose scenario check selected nothing, and every other command (tests, type check, Ramify check, harness rules, guarded changes). They stay on their gate attempts.
- **Changed contracts:** `gate-attempted` carries `checkFindings` and `scenarioFindings { refused: { reason: 'source-unavailable' | 'transition-refused', message } | null, notes[] }`; the scenario reducer's result carries `unfinished`. The wire should show a scenario CheckFinding's factual verification (its `fix-by-check` witness: gate, tree, coverage, outcome) apart from review coverage, and may show the latest gate note (for example `failure-source` with its classification) as factual history. A user waive of a scenario CheckFinding is refused by the child (`required-obligation`); the command should answer that refusal.
- **Trusted inputs bound here:** `producer`, `attempt`, `reportKey`, `issueKey`, `owner`, report `source`, `verification` (obligation, selection, required), observation evidence (gate record, message stream), `credibility`, `modules`, and the whole `witness` with its `candidate`, from committed gate attempts and trees only.
- **Remaining coverage:** an open scenario CheckFinding reaching reconciliation (the architect may plan a repair or ask a user; supersede, waive, defer and fix-by-assessment are refused) has no driven test; iteration 8's composition should include one. No harness path revises a scenario obligation.
- **Open gaps:** the tree reads a promoting or witnessing gate makes (one `git rev-parse` per needed attempt, cached per commit) are unmeasured; no focused flaky rerun producer exists, so `intermittent` arises only from repeated gates on an unchanged tree.

## Iteration 7 — Protocol, HTTP, projections and work-item inspection

**Starting commit:** `d41064d` on `feat/plan12-check-findings` (iteration 6). **Contract:** appendix §8.1 records the implemented wire; §10's authority row names the implementing functions.

### Delivered

- **Browser-safe protocol** `subs/harness/src/interfaces/protocol/check-findings.ts` (`check-findings/1`, imports only `zod`, `ids.ts` and `jobs.ts`): review coverage (`available` counts, or `unavailable` with `no-review-policy` or `records-unreadable`); the CheckFinding summary, list (with `total`, `shown`, `next`, the run `version`, the echoed query and counts split by settlement), detail (report and decision views, relations, attempt links with candidate diffs, repair links with sessions), per-module counts and the review list; the commands `respond-to-check-finding`, `waive-check-finding` and `revoke-check-finding-waiver`, each with the expected CheckFinding revision and the responder. `runs.ts` adds them to `runCommandSchema`; `paths.ts` adds four query paths and `CheckFindingPathQuery`. The harness exposes the file `tagged [browser]`; the root re-exposes every name, and `CheckFindingPathQuery` beside `protocolPaths`.
- **Projections** `src/projections/check-findings.ts`, pure over the committed run view: the state replayed from the carriers, the child's attention order, coverage from the review events (scoped to the work item when one is named), unresolved reasons from `work-item-completed`, the latest-review marker, settlements, pending decisions with their conflicting text and options, and the commands a person may send now. `RunQueries` gains `checkFindings`, `checkFindingModules`, `checkFinding` and `reviews`, each refusing a named version that is not the run's as `stale-version` with the current one.
- **HTTP** (`http/app.ts`): `GET …/check-findings`, `…/check-findings/modules`, `…/check-findings/:checkFinding`, `…/reviews`, with bounded and validated query fields; commands through the existing `POST /api/v1/commands`, a refusal carrying its evidence.
- **Commands** (`src/check-findings/user-commands.ts`, the run service's `checkFindingCommand`): decided inside `commitCheckFindingChange`'s `build` under the run mutex: run version, CheckFinding, revision, pending request, authority (`authorityRank`, `mayWaive`, `mayRevoke`), then the child. One `check-findings-recorded` line per accepted command with the new cause `user-command` holding the `AcceptedCommand`; recovery remembers it, so a retry after a restart returns its receipt. The command wakes a work item waiting for the answer.
- **Web** (`subs/web/src/check-findings.tsx`, `client.ts`, `run-page.tsx`, `styles.css`): each work item's detail shows its review coverage and requests (clean, complete with concerns, partial, not verified, pending; unavailable is never clean) and its CheckFindings in the harness's order, the open ones and reported material choices by default and settled ones behind "Show settled signals". Standing, factual verification, waiver with its actor, material choice, unresolved reason with the distinct latest-review marker and the decision request are separate elements; a risk is a badge. The answer, waive and revoke forms send only the typed commands the summary names, against its revision, and resend once at the version a `stale-version` refusal names. History shows reports, decisions, relations, the attempt with its session link, gate button and candidate diff, and the repair iteration with its session links. The overview shows the modules' unsettled counts, each opening that module's list.
- **Documents:** harness and web READMEs; appendix §8.1 and §10.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| `npx vitest run subs/harness/src/tests/check-findings-projection.test.ts subs/harness/src/tests/check-findings-commands.test.ts subs/harness/src/tests/check-findings-authority.test.ts` | Pass, 3 files, 17 tests (9 projection, 2 driven, 6 pure) | The projection tests read constructed runs whose CheckFinding events the real child decided. The command tests drive `RunService` at its review stop with the scripted agent and unchanged scripted Git (process guard installed) and serve it over real HTTP on a loopback port; one restarts the service. No model. |
| `npx vitest run subs/web/src/tests/check-findings.test.tsx subs/web/src/tests/run-page.test.tsx` | Pass, 2 files, 30 tests (6 new, 1 new Run page case) | Testing Library over the stub client; every fixture is parsed by the protocol schemas. |
| Focused batch 1: every harness test file starting `check-findings`, `review-`, `reconciliation`, `composition`, `union`, `http`, `protocol-contract`, `run-protocol`, `run-projections`, `projections-pure`, `run-commands`, `scenario-findings`, `execution-map`, `session-queries`, `transcript-pages`, `line-events`, `iterations`, `run-recovery`, `work-items`, `commit-recovery`, `late-writes`, `stop-before-start`, `writer-settlement`, `run-closing-order`, `run-bounds`, `materialization`, `scenario-states`, `scenario-projections`, `progress`, `readiness`, `gate-`, and `run.test.ts`, with the child's six | 65 files, 556 passed, 1 failed | The failure was `run-commands.test.ts` asserting the exact command union; updated to the six commands with a refused `resolve-check-finding`, then passing with `composition.test.ts` (2 files, 16 tests). |
| Focused batch 2: harness files starting `single-session`, `session-`, `contract-`, `accepted-`, `requirement-`, `integration-scenarios`, `analysis-`, `fixture-`, `acceptance`, `measurement`, `kpi-`, `lineage-`, `local-`, `placement`, `module-creation`, `breaking`, `no-rewind`, `hook-checks`, `compaction`, `run-policy`, `audit-`, `engineer-`, `fork-submission`, `transcript-`, `recorded-environment`, `scenario-check`, `scenario-briefings`, and all 16 web test files | Pass, 63 files passed and 2 skipped; 469 tests passed, 7 skipped | The skipped files and tests are the existing opt-in ones. |
| `npm run type-check` in `ramify-agent/` | Pass | Harness (tests included), web and both script scopes. |
| `npm run check:self` in `ramify-agent/` | Pass: 0 errors, 0 warnings, 277 analysis limits | 10 owners, 445 source files, 0 denied accesses. The web receives the new protocol file and `CheckFindingPathQuery` through the root; no `exposed-without-companion`. The 38 new limits are the protocol file's exported schemas (`signature-inferred`). |
| `npm run build:web` | Pass | Vite chunk-size advisory only. |
| `git diff --check d41064d` | Clean | |
| Full suite | Not run | Only through ramify-audit, by the orchestrator. |

### Deviations

1. **Summary fields beyond §8.** `settlement` (a union of fixed by check with its witness, fixed by assessment, superseded, waived with actor, accepted risk and uncertainty, and deferred with its revisit) replaces `waiver`, so a factual fix and a waiver are distinct fields. `pendingUserDecision` carries the request's conflicting text and options rather than its ID, since the page must show them. Added `obligation`, `latestReview` and `userCommands`; actors are structured.
2. **A third selection, `reported`.** The principles ask that material choices be shown by default while settled signals need no notification; a waived or superseded signal with a reported choice is settled. `reported` is the open ones plus settled ones with a current material choice, and is the web's default; `attention` stays the wire default.
3. **A new cause, `user-command`,** holds the accepted command so command idempotency survives a restart; `user-response` (a command ID only) stays for the service's own callers and is cited to iteration 5's CF09 test in the composition inventory.
4. **Commands expect the run's version** (the harness's rule 3) as well as the CheckFinding's revision. The revision guards the subject; the web resends once at the version a `stale-version` refusal names, as the approval does.
5. **Unresolved derivation.** An open signal of a completed work item that its `work-item-completed` did not name, opened or reopened after it, is `raised-after-last-round`. The marker is set for an unresolved non-low signal that is `raised-after-last-round` or whose first report came from a review of the work item's latest reviewed iteration.
6. **A run that has ended accepts no command** (the transition's `run-ended`), so a signal left unresolved can be waived only while its run runs. Whether waivers reach across runs is the follow-up plan's decision.
7. **Query `version` is optional**; given and stale it is refused. `ProjectionError` gained `stale-version` and `currentVersion`; `CommandRejection` gained `evidence`. A `build` may throw, appending nothing.
8. **The candidate diff is an identity** (base commit, audited commit, tree), not the patch: queries do not ask Git.
9. **An overview table of per-module counts** that opens a module's list. It is not the execution map's badge, which stays with the follow-up plan.
10. **Tests of earlier iterations changed:** the CF12 test in `reconciliation.test.ts` now answers through `respond-to-check-finding` (resending once on `stale-version`) and asserts the `user-command` line; `run-commands.test.ts` lists the six commands; `composition.test.ts` cites the new command types, the `user-command` cause, `waive`, `revoke-waiver`, `answer-user-decision` and the `user-decision` authority to the command test, and its "no query appends" loop reads the three new run queries.
11. **Agent revocation is not offered.** `mayRevoke` implements the rank rule and is tested pure; only the user's path uses it, where it always holds.

### Acceptance matrix

| Case | Covered here | Evidence |
| --- | --- | --- |
| CF12 (iteration 7 part) | A person answers a strong conflict through the typed command, which the next round assesses; a waiver passes no gate: the run completes on its own gates after a person's waiver | `reconciliation.test.ts` "the conflict cites the plan's exact text …"; `check-findings-commands.test.ts` HTTP case (completion after the waiver) |
| CF14 (iteration 7 part) | The wire and the page show standing and reason, review coverage with clean, partial and unavailable apart, material choices, settlements, decision requests and history beside attempt, candidate diff and repair session, with total and shown counts | `check-findings-projection.test.ts`; `check-findings.test.tsx`; the Run page case in `run-page.test.tsx`. The browser witness remains iteration 8. |
| CF16 (iteration 7 part) | The user's waiver is recorded with the person and the command; a waiver of a required check is refused; the user revokes an agent's waiver, which reopens it; revoking what is not waived is refused; the rank rule refuses a lower authority's revocation (pure) | `check-findings-commands.test.ts` first case; `check-findings-authority.test.ts` |
| CF17 (iteration 7 part) | Lists order by risk, credibility and recency and filter by module; per-module counts do not sum to the run's; a non-low unresolved signal from the latest review is marked, a low one or one from an earlier review is not | `check-findings-projection.test.ts` list, filter and unresolved cases; `check-findings.test.tsx` states case |
| Plan exit | Paging and bounds, ordering, module filter, stale run version, old-run unavailable coverage, command retry and conflict, stale CheckFinding revision | `check-findings-projection.test.ts` paging case; `check-findings-commands.test.ts` (both cases) |

### Handoff to iteration 8

- **Contracts:** appendix §8.1. Queries: `RunQueries.checkFindings/checkFindingModules/checkFinding/reviews`; HTTP paths in `protocolPaths`. Commands: the three `CheckFindingUserCommand` types through `RunService.execute`; the `user-command` cause and its recovery.
- **Trusted inputs bound here:** the user actor (the command's responder), the authority `{ user-decision, commandId }`, the accepted risk (the CheckFinding's current risk), the decision's source (the latest report's), the expected revision and the run version, all under the run mutex.
- **For the composition:** a browser witness should open a work item, see its coverage and CheckFindings, answer a pending decision and waive a signal through the real server; the page reloads on the run's version, and a sent command shows "accepted" until then.
- **Open gaps:** a run that has ended accepts no command, so an unresolved signal of a completed run cannot be waived; the web shows no command for it. Agent revocation is not offered. The candidate diff is shown as commits, not patch text. The per-module table is on the overview, not the execution map. No real browser has rendered the new page (build and Testing Library only).

## Iteration 8 — Composition and acceptance

**Starting commit:** `b7e5879` on `feat/plan12-check-findings` (iteration 7). **Contract:** unchanged. No schema, event, record path or protocol field changed; the one product change is a web style class (deviation 1).

### Delivered

- **Composed fixture** (`subs/harness/src/tests/helpers/check-findings-composition.ts`): one run of two work items, reviewed by code, scope and design readers on every accepted iteration (policy `concurrency: 2`, `queue: 12`, one retry). wi-001 (notes module) is clean. wi-002 (a tags module) has two iterations; the three readers of its second candidate overlap and raise four concerns: a high-risk defect (cf-0001), a low-risk simplification in the same file (cf-0002), a medium scope concern grounded in the module README (cf-0003) and a high design concern grounded in a principles document (cf-0004) that names the defect's behavior. Round 1 relates cf-0004 to cf-0001 as the same issue and cf-0002 as related but distinct, supersedes cf-0003, waives cf-0002 as a reported material choice and plans a correction. The correction is a later changed candidate: its acceptance claims the repair on its own tree, its code reader raises one more low-risk signal (cf-0005), and round 2 (floor `non-low`) fixes the pair and leaves cf-0005 unresolved `below-floor`. The candidates carry their own `module.ramify` files, so modules come from the candidate's tree. `reviewRun` gained a `roles` option for several work items, and its script builder is exported as `reviewScript`.
- **`check-findings-composition.test.ts`**, four driven cases:
  1. The composed run end to end: 12 requests over 4 candidates, coverage 12 of 12 complete, at most two readers at once, attention order in the basis, grouping, supersession, waiver with material choice, claim on the correction's line, both rounds forked, grounds bound to what the reader read, per-module filtering, and every gate's verdict its checks' own. It computes the measurements below.
  2. **Crash sweep (CF06):** the composed log is cut before and after every review, reconciliation, CheckFinding-carrying and `work-item-completed` line (76 cuts). Each cut is a prefix of the log with every record copy deleted, which is what a crash leaves: the ledger writes whole lines only (iteration 2's fault sweep). For each cut, recovery calls no agent session, leaves the prefix unchanged, appends only recovery completions (the owed review requests, the unsettled attempts finished as not verified, the open brief append, session ends, `job-interrupted`), carries no CheckFinding event, holds every request, attempt, round and composition identity once, and replays the CheckFinding events. It leaves no request pending and owes three requests per accepted iteration. The CheckFinding list and every detail equal the child's pure selection over the replayed state, and every committed record is rematerialized byte for byte. A second restart changes nothing. Three named boundaries are asserted exactly: the gate-to-request crash of the correction, whose line also claims the repair, records `rq-0010`–`rq-0012`; a running reader's attempt is finished `execution-failed`; a committed assessment's brief is completed `session-lost` by the restart.
  3. **Shutdown (CF07):** `close()` while two of wi-002's readers are live stops both and records no review result or CheckFinding. A reader that ignores its stop submits afterwards and is refused at the tool. The restart settles every attempt once, and no CheckFinding exists.
  4. **Tightest policy (CF15):** one reader, a queue of one, one retry, one reconciliation round. Every candidate's third request overflows and never runs (3 of 9 not verified), and an invalid first review is retried once and completes. The only round is the last: its floor refuses the planned correction (`correction-floor`) and the fork leaves all three signals unresolved (`rounds-exhausted`, high, medium and low). The signals stay open and every gate passes on its own checks.
- **Iteration gaps closed:**
  - `failed` and `no-session` brief-append outcomes now have driven tests in `reconciliation.test.ts`. A failed append keeps the session, and the next architect input quotes the brief. A round after a lost session, with no architect turn between, records `no-session` and `parent: null`, and its decisions stand.
  - An open scenario CheckFinding reaching reconciliation (`scenario-findings-run.test.ts`): the fork's waiver is refused `required-obligation`, the fork plans a repair, the correction's gate fixes it by check on a changed tree, and the next completion needs no round. The composition inventory cites the new tests.
- **Real snapshot/process witness** (`check-findings-composition.integration.test.ts`): one work item over a real Git repository with code, scope and design readers on the real snapshot tools. A code concern and a design concern grounded in the committed principles document relate as one issue. The correction's commit claims both on its real tree, its reader reads the corrected limit from Git's objects, and round 2 fixes both. Request trees, report and decision sources, both bases, the claim and the ground's `sha256` are asserted against `git rev-parse`/`git show`. The agents are scripted; no model is called.
- **Browser witness** (`npm run test:browser:check-findings`, `scripts/browser-acceptance/check-findings.ts`, served by `subs/harness/src/tests/helpers/serve-check-findings-fixture.ts`): a live scripted run on the real harness server with the built web client, driven in headless Chromium. It follows the Plan 11 pattern: a development and acceptance script, outside the Vitest suite. The run waits at a pending user decision. The browser reads the overview's per-module table and decision notice, then the work item's partial review coverage and nine requests. It reads the default and settled lists in attention order and the decision request with the plan text and its revision. Through the page's own forms it waives the deferred signal, revokes the local architect's waiver and answers the decision. It then sees the run complete, the answered signal settled by round 2, the reopened low signal unresolved `below-floor`, no command on the completed run, and the history with every actor and the attempt link. It also checks a narrow viewport and that the page raised no exception. The result is 22 checks, with 4 screenshots and `browser-results.json` in [`evidence/`](evidence/).
- **Final-gate preparation:** [`audit/plan12-check-findings.request.json`](../../../audit/plan12-check-findings.request.json), derived from the Plan 11 request: the same five checks, a 600 s suite timeout, and `requestId`, `universeId` and `coverageClaim.change` set to `plan12-check-findings`, with metadata naming Plan 12. [`audit/README.md`](../../../audit/README.md) documents it.
- **Measurement helper** (`helpers/check-findings-measurements.ts`): computes the measurements from a run's log alone.

### Verification

| Check | Result | Boundary and limit |
| --- | --- | --- |
| `npx vitest run subs/harness/src/tests/check-findings-composition.test.ts` | Pass, 4 tests (about 10 s, of which the 76-cut sweep is about 8.7 s) | Scripted agent, scripted gate Git and candidates, process guard; no process, no model. |
| Negative control for the sweep | With `review-request-recorded` removed from the allowed recovery appends, the sweep failed at cut 24 (`recovery appended review-request-recorded`) | Restored. It shows the per-cut assertions run. |
| `npx vitest run subs/harness/src/tests/check-findings-composition.integration.test.ts` | Pass, 1 test, about 29 s, run twice | Real Git (`gitService`, default `gitCandidateSource`), scripted agents, no model. |
| `reconciliation.test.ts`, `scenario-findings-run.test.ts`, `composition.test.ts` with the composition file | Pass, 4 files, 27 tests | The two append-outcome cases and the scenario-reconciliation case are new. |
| Focused batch: every harness test file starting `review-`, `reconciliation`, `check-findings`, `scenario-findings`, `composition`, `union`, `run-recovery`, `iterations`, `scenario-states`, `execution-map`, `run-projections`, `projections-pure`, `http`, `run-commands`, `protocol-contract`, `run-protocol`, `work-items`, `session-lifecycle`, `transcript-run`, `acceptance-trial`, `analysis-submission`, `run-policy`, `commit-recovery`, `late-writes`, `stop-before-start`, `writer-settlement`, `run-closing-order`, `single-session`, `fixture-trials` | Pass, 55 files passed and 1 skipped; 444 tests passed, 4 skipped | Explicit file paths. The skipped file and tests are the existing opt-in ones. |
| The check-findings child's tests and all web tests | Pass, 22 files, 218 tests | Includes `check-findings.test.tsx` and `run-page.test.tsx` after the class rename. |
| `npm run test:browser:check-findings` | Pass, 22 checks, 1440×900 and 480×800 | Headless Chromium (`/usr/bin/chromium`) against the real harness server and `dist/web`. The run is scripted, Git's answers and candidates are scripted, and no model is called. Negative control: with the old section class restored and rebuilt, the check "the work item's CheckFinding section is not painted as a failure" failed. |
| `npm run type-check` in `ramify-agent/` | Pass | Harness (tests included), web, scripts and browser-acceptance scopes; the new browser script is type-checked. |
| `npm run check:self` in `ramify-agent/` | Pass: 0 errors, 0 warnings, 277 analysis limits | 10 owners, 450 source files, 0 denied accesses; the same `signature-inferred` set as iteration 7. |
| `npm run build:web` | Pass | Vite chunk-size advisory only. |
| `git diff --check b7e5879` | Clean | |
| Full suite (ramify-audit) | Not run by this iteration | The orchestrator runs `audit/plan12-check-findings.request.json` on the final commit; see "Final audit" below. |
| Live-model trial | Not run: **live-model trial pending user approval** | See open gaps. |

### Final diff inspection (`git diff 6da0086..b7e5879`, plus this iteration)

- **Owners:** the diff touches the root, `harness`, the new `harness/check-findings` child, and `evidence`, `ledger`, `scenarios`, `agent/pi` and `web`, each in its own files. Every cross-owner import names a symbol the owner exposes; `check:self` reports 0 denied accesses. The web imports only the harness's `src/interfaces/protocol/*` through the root's re-exposure. The child imports only `zod` and its own files; only its `purity.test.ts` touches `node:fs`. The ledger's new `nodeFileSystem` exposure is used by harness tests only. This iteration changed only tests, test helpers, one web class, scripts, the audit request and documents.
- **No parallel CheckFinding store:** no source writes CheckFinding, review or reconciliation state outside the ledger. Requests, orientations, attempts, submissions, bases and assessments go through `commitRecord` or a transaction's `records`, and CheckFinding records through the transition. `check-findings/state.ts` is a cache keyed by ledger sequence and replayed from carriers, and `reviews/state.ts` derives from events. The scheduler's `parked` set and the `orienting` map only coordinate the current process. The crash sweep confirms that list, detail and coverage are rebuilt from the log alone. The web holds only toggles and form input and sends typed commands the summary names.
- **Gates:** the gate verdict and `next` are computed before any CheckFinding state is read (`executePreparedGate`, `gateAttempted`), and a refused CheckFinding part commits the gate unchanged. `awaitUserDecisions` holds a work item's completion while a decision is pending; that is workflow, not a verdict. Every driven run of this iteration asserts every gate's verdict.
- **Noted, not a violation:** the hand-run probe `probes/pi-fork.probe.ts` lives in the harness's ordinary `src/` and uses `child_process`; it is excluded from Vitest by name.

### Measurements

Source: the working tree at `b7e5879` plus this iteration's changes; no harness source affecting these runs changed. Times are the log's own timestamps from scripted runs on this machine. They measure the harness's and the fake's overhead, never a model's.

| Measure | Composed run (default trial policy shape) | Tightest policy |
| --- | --- | --- |
| Captured policy | `review-policy/1`: kinds code, scope, design; concurrency 2; queue 12; retries 1; `attemptMs` 60 000; `settleMs` 60 000; `maxConcerns` 20. Limits: `reconciliationRoundsPerWorkItem` 3, `laterRoundMinimumRisk` medium, `repairRoundsPerWorkItemGate` 3, `repairRoundsPerIteration` 3 | Same kinds; concurrency 1; queue 1; retries 1; `reconciliationRoundsPerWorkItem` 1 |
| Review requests / attempts / retries | 12 / 12 / 0 | 9 / 10 / 1 |
| Coverage (of requests) | 12 complete, 0 partial, 0 not verified | 6 complete, 0 partial, 3 not verified (all `queue-overflow`) |
| Queue delay, first attempts (ms) | n 12: min 10, median 15, max 72 | n 6: min 9, median 10, max 38 |
| Review duration (ms) | n 12: min 5, median 11, max 29 | n 7: min 4, median 6, max 13 |
| Start modes (requested→actual) | fresh→fresh 4 (code), fork→fork 8 (scope, design); 2 orientations, both oriented | fresh→fresh 4, fork→fork 3; no orientation (every design request overflowed) |
| Work-item completion tail, first completion request to `work-item-completed` (ms) | wi-001 31 (settle 27); wi-002 231 (settle 3), including one correction iteration | wi-001 13; wi-002 31 |
| Retained CheckFindings (reports, decisions) | 5 (5, 8) | 3 (3, 0) |
| Signals by risk | high 2, medium 1, low 2 (of 5) | high 1, medium 1, low 1 (of 3) |
| Signals by credibility | ungrounded 3, agent-generated 1, human-reviewed 1 (of 5) | ungrounded 2, agent-generated 1 (of 3) |
| Standing at the end | fixed by assessment 2, waived 1, superseded 1, open 1 (of 5) | open 3 (of 3) |
| Waivers by actor | local architect 1 (of 1) | none |
| Unresolved at completion, with risk | cf-0005 `below-floor`, low (1 of 5) | cf-0001 high, cf-0003 medium, cf-0002 low, all `rounds-exhausted` (3 of 3) |
| Correction rounds (rounds / corrections) | wi-001 0 / 0; wi-002 2 / 1 | wi-001 0 / 0; wi-002 1 / 0 |
| Human decisions | 0 requested, 0 answered, 0 user waivers, 0 revocations | none |
| Browser witness run (separate fixture) | 1 decision requested and answered by a person, 1 user waiver, 1 user revocation, over 3 signals and 9 requests (8 complete, 1 partial) | |
| Review tokens and warm-up (orientation) cost | Not measured: the log holds no token usage, and the scripted fake reports none (`usage: null`). Any count from these runs would be a fake. | |
| Fork against fresh | No savings claim. No matched pair of actual modes with equivalent inputs was recorded, and scripted forks cost nothing. The only real datum remains iteration 4's pi probe: parent 315 tokens, fork 1,964 tokens, 2,279 in all, one short turn each, not a matched comparison. | |

These are harness-overhead figures; they cannot revise the concurrency or deadline policy. That needs the live-model trial.

### Deviations

1. **A web defect found by the browser and fixed.** Iteration 7's work-item section used the class `check-findings`, which the transcript's hook-check badge already styles as a failure (`styles.css`: red background and text). In a real browser the whole Reviews and CheckFindings section was painted as a failure, which Testing Library could not see. The section's class is now `work-item-check-findings`. The browser witness asserts it, with the negative control above.
2. **Crash points as log prefixes.** The plan asks for crashes injected at each ledger boundary. The run service's `RunWrite` hooks name no review, reconciliation or carrier boundary, and adding them would need new recovery-table rows for the whole service (iteration 2, deviation 4). The sweep instead places a crash before and after every such line as the prefix a crash leaves, with every record copy deleted. Live freezes at existing boundaries remain in iterations 2, 3, 5 and 6, and the shutdown case here is live.
3. **The live-model trial was not run**, as instructed: a real session needs the user's approval.
4. **Shared test scaffolding:** `reviewRun` gained `roles`, and its script builder `reviewScript` is exported. `scenario-findings-run.test.ts`'s `run` answers reconciliation forks from their own scripts. No existing assertion changed.
5. **The browser run is a script, not a Vitest file,** as Plan 11's is. It writes `evidence/` and is not part of the audited suite.

### Acceptance matrix (CF01–CF17)

| Case | Status | Evidence |
| --- | --- | --- |
| CF01 | Met | Pure: `identity.test.ts` (iteration 1). Ledger: `check-findings-ledger.test.ts` "CF01" (5 concurrent transitions, 1 committed), conflict and ambiguous cases; `check-findings-run.test.ts` concurrent `recordCheckFindings` (iteration 2). |
| CF02 | Met | Judgment superseded with no code change: `reconciliation.test.ts` "parallel reports …" and the composed run (cf-0003). Factual failure needs its own witness: `scenario-findings.test.ts`, and here `scenario-findings-run.test.ts` "an open scenario CheckFinding reaches the work item's reconciliation" (waiver refused `required-obligation`, fixed only by the correction's check). |
| CF03 | Met | `reconciliation.test.ts` "parallel reports …" (iteration 5). Composed run: cf-0001/cf-0004 grouped with rationale, both IDs kept; same-file cf-0002 related but distinct and ungrouped. Real Git witness: two concerns grouped over real trees. |
| CF04 | Met | `review-attempts.test.ts`, `review-lifecycle.test.ts`, `review-tools.test.ts` (iteration 3); `review-questions.test.ts`, `review-scheduling.test.ts` (iteration 4). Composition: tightest policy (overflowed, invalid-then-retried); crash sweep (execution-failed, stopped); browser shows partial coverage distinct from clean. |
| CF05 | Met | `review-attempts.test.ts` CF05, `review-tools.test.ts`, `review-snapshot.integration.test.ts` (iteration 3); pi `fork-isolation.test.ts` and the iteration 4 probe. Here: composed run (two readers overlap, never more than two), real Git witness (readers read Git's objects of each audited commit). |
| CF06 | Met (scripted; crash points modeled as log prefixes, deviation 2) | Iterations 2–3 live crashes and record-loss cases; here the 76-cut sweep over the composed log with exactly-once identities, replay, byte-for-byte rematerialization, projections equal to pure replay, and an idempotent second restart. |
| CF07 | Met | `review-lifecycle.test.ts` CF07 stop and settlement bound (iteration 3). Here: the composed shutdown case (both live readers stopped, nothing recorded, the late submission refused, the restart settles once). |
| CF08 | Met | `reconciliation.test.ts` "clean reviews …" (iteration 5); composed wi-001 (three clean reviews, no reconciliation, no assessment call). |
| CF09 | Met | `reconciliation.test.ts` CF09 case and `reconciliation-submission.test.ts` basis cases (iteration 5). Not re-driven here. |
| CF10 | Met | Missing fork point: `reconciliation.test.ts` CF10 (iteration 5), `review-questions.test.ts` (iteration 4). Parent append: `session-lost` and crash-around-append (iteration 5); here `failed` and `no-session` driven, and the sweep's open-brief recovery. |
| CF11 | Met | Iterations 1, 2 and 5. Here: composed run (repair intent, `corrects`, claim on the correction's line, open until round 2 fixes it), the real Git witness (claim on the real tree), and the sweep's cut after the claiming line. |
| CF12 | Met | `reconciliation.test.ts` CF12 (iteration 5, answered by typed command in 7); `check-findings-commands.test.ts` (waiver passes no gate). Browser: the person answers the conflict with its exact plan text and revision through the page, and routine concerns in the composed run settle with no person (0 human decisions). |
| CF13 | Met | `decide.test.ts` (iteration 1); `scenario-findings.test.ts`, `scenario-findings-run.test.ts` (iteration 6); here the correction's same-scenario pass fixes after reconciliation. |
| CF14 | Met | Wire and Testing Library (iteration 7). Here the real browser shows reason and standing, history with actors and attempt links, review coverage (partial never shown as clean), the material choice, total counts, the decision request, waiver and revocation. |
| CF15 | Met (scripted) | Iterations 4–5 unit and driven cases. Here: the tightest-policy composition (overflow, one retry, last-round floor, `rounds-exhausted` with risk, gates unchanged) and the composed run's `below-floor`. Not measured against a model. |
| CF16 | Met | Iterations 4b, 5 and 7. Here, in the browser: a person's waiver with the person as actor; the revocation of the local architect's waiver reopens the signal and history keeps it. Scenario waiver refused (`required-obligation`). |
| CF17 | Met | Iterations 4b and 7. Composed run: risk from readers, credibility and modules bound by the harness from the candidate's tree, the basis in attention order, module filter. Browser: attention order; the low unresolved signal carries no latest-review marker (the marked non-low case is iteration 7's). |

### v1 completion statement

**Supported producer coverage.** Three review questions (code, scope and design) run on every accepted engineer iteration's audited candidate. Each is a bounded, read-only reader on the candidate's snapshot, and its concerns become CheckFindings with a reviewer-proposed risk and a harness-bound credibility and modules. One factual producer, `check:scenario`, covers a tracked scenario of a committing work-item gate attempt that executed it (`iteration`, `contract`, `breaking-iteration`, `work-item`). It promotes a failure on a repeated failure of the same work item and verifies with a same-scenario pass on a changed audited tree at obligation revision 1.

**Left on ordinary gate attempts.** The following stay on their gate attempts with their gate's own verdict and are not CheckFindings:
- a first scenario failure;
- inconclusive observations;
- dry runs;
- the project's own untracked scenarios, which are counted only;
- readiness and final gates;
- a scenario check that selected nothing;
- every other command: tests, type check, Ramify check, harness rules and guarded changes.

Contract iterations are not reviewed.

**Explicit deferrals (outside v1, unchanged):**
- a new gate engine;
- generic test-identity inference;
- a general focused flaky-test runner (`intermittent` arises only from repeated gates on one tree);
- sealed-file edit hooks;
- initial-plan review;
- independent work-item gap review;
- cumulative and final reviews;
- peer-review policy;
- cross-run backlog scheduling;
- delivery and merge decisions;
- evaluation of revisit conditions (`due` is always empty);
- the execution map's per-module badge;
- whether waivers reach across runs (a completed run accepts no command).

These go to the follow-up plan.

### Handoff and open gaps

- **Live-model trial pending user approval.** No real pi session has run with `reviewer/3` or `local-architect/3`, so the policy values, queue delay, completion tail, orientation and review token cost, and any fork-against-fresh comparison are unmeasured against a model. The trial would be run from `ramify-agent/`, after the user approves the cost:
  ```sh
  npm run real-session -- --model openai-codex/gpt-5.6-luna
  ```
  That prepares a copy of the fixture and runs one implementation run with the default `run-policy/3`, which captures code, scope and design reviews. Its log can be measured with `compositionMeasurements` (`subs/harness/src/tests/helpers/check-findings-measurements.ts`). A fork saving needs a matched fresh run of the same inputs.
- **Browser observations, not fixed:**
  - The deferral and waiver lines print a doubled period when a rationale ends with one ("source.. Revisit").
  - The review table's candidate column cuts IDs at 10 characters (`revision-0`).
  - The run page's column uses about 600 px of a 1440 px viewport.
- **Unchanged from earlier iterations:**
  - Waiting for a user decision has no bound beyond a stop.
  - No harness path revises a scenario obligation.
  - Agent revocation is not offered.
  - The candidate diff is shown as commits, not patch text.
  - The credibility classifier trusts `plans/<planId>/` as human-reviewed.

### Audit follow-up: the `no-session` test's answer

**Found by the final audit of `de84358`:** 1 failed, 1483 passed, 7 skipped, run ref `refs/audited/runs/2026-09-24T19-13-10Z-de8435816`. The failing case was `reconciliation.test.ts` "a round after the architect's session was lost has no session to append to, and records no-session", refused with `stale-version: The job is at version 78, not 77`.

**Cause: a test race, not a harness defect.** The pending decision becomes visible when `reconciliation-assessed` commits (sequence 76 in this run). The run then appends two more lines: the brief effect's completion, `reconciliation-brief-appended` with `session-lost` (77), and the lost session's `session-finished` (78). The test sent the answer at the version it read and resent it only once, at the version the refusal named. Under the audit's four workers, both appends landed between its reads: 76 was refused at 77, and the resend at 77 was refused at 78. The harness behaved as specified. A command must name the run's current version (the harness's rule 3), the refusal names that version, and the CheckFinding's revision still guards the decision. Iteration 5's CF12 test resends once too, but only one line follows its assessment (the brief lands, and no session ends).

**Fix, test only:** `reconciliation.test.ts` gains `answerAtCurrentVersion`, which resends at each refusal's version, at most 10 times. Both the `no-session` case and the CF12 case use it. No harness source changed.

**Confirmed under load:** 12 of 12 passes of `reconciliation.test.ts`. They ran as 3 concurrent Vitest processes, 4 rounds, each with `check-findings-composition`, `acceptance-trial` and `run-recovery` at `--maxWorkers=4`, plus 5 passes in a 10-file run-driving batch. The race was not reproduced on demand before the fix; the log ordering above matches the audit's refusal exactly.

**Other iteration 8 tests checked for the same pattern:** the sibling `failed` case sends no command. The composition, crash-sweep, shutdown, tight-policy and real-Git tests send no person's command. The browser witness answers through the web, which resends once. That run is quiescent while it waits for the person, so only one line can come between a list's read and a click.

**Seen once, not addressed:** `review-lifecycle.test.ts` "a request beyond the queue's bound is finished as overflowed and never run" (iteration 3) failed once in about 22 loaded runs of heavy batches (413 ms, not a timeout). It passed in every later run, and its message was not captured. A likely cause, unverified, is that under load the first reader may not have started before the third request arrives, so the second request would overflow instead of the third.

### Final audit

Both runs use `audit/plan12-check-findings.request.json` from the repository root, with a clean tree. The first audit, on `de84358`, failed as described above.

| Commit | Overall | Checks | Agent suite | Evidence |
| --- | --- | --- | --- | --- |
| `de84358` | `fail`, 202 s | Patch integrity, type-check, `check:self` and the parent daemon case pass; the agent suite fails | 186 files passed, 1 failed, 2 skipped; 1483 tests passed, 1 failed, 7 skipped | `refs/audited/runs/2026-09-24T19-13-10Z-de8435816` |
| `11688f9` | **`pass`**, 202 s | All five checks pass: patch integrity, agent type-check, agent suite, agent `check:self` (0 errors, 0 warnings, 277 analysis limits; 10 owners, 450 source files; 0 denied accesses) and the parent daemon case | 187 files passed, 2 skipped; 1484 tests passed, 7 skipped | `refs/audited/runs/2026-09-24T19-25-48Z-11688f993`; Git note `git notes --ref=audit show 11688f993e503eed6c83b6ab11a0963dd9d1da16` |

`11688f9` is the audited final implementation commit, and its passing run is the plan's full-suite evidence. The commit recording this result changes only this document. The `review-lifecycle.test.ts` overflow flake above passed in this audit and remains an open item. The live-model trial remains pending the user's approval.modules/.bin/ramify-audit audit --request ramify-agent/audit/plan12-check-findings.request.json --cwd . --json` on the final Plan 12 commit (overall verdict, per-check results, suite counts, duration, run ref and Git note). Not run by iteration 8._
