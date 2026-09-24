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
