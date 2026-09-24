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
