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
