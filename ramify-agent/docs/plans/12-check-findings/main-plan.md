# Plan 12: CheckFindings and iteration reviews, v1

**Date:** 2026-09-24. **Status:** proposed for implementation. **Starting source:** `7d6af7f` plus the uncommitted [CheckFinding architecture](../../architecture/check-findings.md) and [principles](../../check-findings.principles.md). This plan has no execution evidence. Commit both documents before preparing an execution worktree, or the worktree will not contain them.

The architecture defines the behavior and ownership; the principles govern the distinction between observations, judgments, decisions and verification. This plan orders the work, fixes the first delivery boundary and names the evidence that will establish completion. The existing gate and scenario contracts retain authority over passing a required check.

## Runnable outcome

```text
passing audited iteration gate
  -> durable code, scope and design review requests over one frozen candidate
  -> next engineer iteration may start while bounded read-only reviewers run
  -> valid empty review: covered scope, no CheckFinding
  -> actionable concern: immutable review attempt and CheckFinding in one ledger transaction
module work item requests completion
  -> settle its requests and record any missing coverage
  -> no actionable issue: ordinary work-item gate, no assessment session
  -> actionable issue: local architect assesses the current tree in one fork
  -> accepted choice, superseded judgment, deferral or ordinary correction iteration
  -> required gates still run and retain their own verdicts
Run page -> review coverage, CheckFinding history, material choices and decision requests
```

## Scope and starting evidence

**In v1:** the pure `harness/check-findings` child; ledger-backed CheckFinding history and projections; revision-bound dispositions and semantic same-issue relations; durable iteration code, scope and design review attempts; snapshot-confined, read-only background sessions; work-item reconciliation and ordinary correction work; one selected factual integration for tracked scenario failures when the existing producer can attest scenario identity and coverage; a bounded public query and decision command; work-item presentation and measurements.

**Outside v1:** a new gate engine, generic test-identity inference, a general focused flaky-test runner, sealed-file edit hooks, initial-plan review, independent work-item gap review, cumulative/final reviews, peer-review policy, cross-run backlog scheduling and delivery or merge decisions. The [sealed-edit analysis](../../analysis/2026-09-24-sealed-file-edit-hooks.md) remains a separate follow-up. A scripted inconclusive runner result must be represented honestly in the factual contract; it does not imply a delivered focused flaky runner.

The current harness has [`RunService.write`](../../../subs/harness/src/run/service.ts) and one ledger for serialized appends, but its `Run` holds one `session` and `invocationDone`. `iteration-assigned` records an invocation but no pinned session ref. A `request-completion` submission leads to an outline revision and work-item gate, without a durable fork point after that submission. The agent port already has pinned `SessionRef`, fork, guard and actual-start reporting. Existing gate attempts, scenario results and `work-item-completed` remain separate records. These are integration facts from the starting source, not completed CheckFinding behavior.

Plan 11's execution map is independent product work and can proceed separately. Its edits may overlap `run/service.ts`, projections, protocol and web. Rebase and recheck the receiving API view before an implementation iteration touches those files. Do not assume the current uncommitted documents or future-registry maturity entry describe executable code.

## Preconditions and standing rules

1. At implementation start, record the exact commit and dirty-file inventory in `results.md`; preserve unrelated edits. Run `npm run type-check`, `npm run build:web` and `npm run check:self` from `ramify-agent/`, and audit the starting commit with the recorded ramify-audit request (`audit/ramify-agent-suite.request.json`, from the repository root), recording its failures separately from plan work. The full suite is never run by hand: ramify-audit is the only way to execute it, so every full run is audited and bound to its commit. Check the current gate audit path before using an audited commit as a review source.
2. Refresh `.ramify-architect/` and the receiving `subs/harness/src/.ramify/` and `subs/web/src/.ramify/` views if absent or stale. Generated views are search evidence, never imports or edited sources. Confirm the new child's exposure and every browser-safe signature companion with `npm run check:self`.
3. Complete one iteration at a time in dependency order. Focused tests and type/self checks close each iteration; web changes also build. The full suite runs only through ramify-audit, never through `npm test`. Each handoff records changed contracts, tests and remaining coverage. A passing focused test does not erase a baseline failure.
4. All records that affect a run are committed through its existing ledger. Large immutable bodies may be stored before their referencing transaction. Projections, counts and indexes are rebuilt from accepted events. A run's terminal event remains its final decision event; late callbacks may only finish resource cleanup.
5. Agent output supplies claims and judgments. Trusted harness adapters bind source, attempt, actor, authority, check coverage and rerun witnesses. No agent submitted `passed`, urgency or authority flag is a trusted attestation.

## Contracts fixed before consumer work

| Contract | v1 decision and owning implementation |
| --- | --- |
| Domain identity | `harness/check-findings` owns `CheckFindingId`, positive revision, run-local owner, immutable reports and decisions. The harness validates `(producer, attempt, reportKey)` and its content hash under the run mutex. Exact replay is idempotent; changed content for the key is rejected. A producer issue key is scoped by owner and verification obligation. Ambiguous matches refuse automatic attachment. Prose or file overlap never forms identity. |
| Standing and verification | Derived standing is `open`, `deferred` or `closed`, always with a reason. A repair claim stays open. `verified` requires a matching trusted witness on the candidate and adequate executed coverage; `superseded` requires an attributed fresh assessment; `accepted` and `deferred` carry authority and risk or revisit fields. A judgment cannot erase a factual obligation or alter a gate. Reopening increments revision without deleting prior history. |
| Same-issue relation | An architect assessment names both IDs and captured revisions, relation, shared behavior/obligation, evidence and rationale. Earlier ID is canonical for a confirmed same issue; both histories and every factual obligation remain. `related-but-distinct`, `distinct` and `uncertain` do not coalesce dispositions. |
| Review request | One immutable key per `(run, iteration, audited candidate, kind, policy version)` for code, scope and design. It binds assignment, iteration base, gate, tree, selected requirement/guidance hashes and intended fork point, which is explicitly `none` for code review so the key does not change when iteration 4 adds forks. A retry creates another attempt under the same request. One accepted result is terminal; late results are fenced. |
| Review result | Attempt state is queued, running or finished; a finished result says complete, partial or not verified and names inspected scope and missing scope. An empty complete result is clean only for its declared scope. Invalid, unavailable and timed-out output is not verified. Valid concerns retain precise consequence, evidence, uncertainty and bounded remedy. |
| Reconciliation basis | Work-item ID, current audited source, settled request IDs and terminal attempt IDs, relevant CheckFinding IDs/revisions, owner and due-for-revisit set form one captured basis. Validate it under the run mutex when accepting the assessment and again before `work-item-completed`; a changed implementation source or report revision forces reassessment. Deterministic scenario rendering may carry its explicit expected-byte lineage only. |
| Public wire | Harness owns browser-safe `src/interfaces/protocol/check-findings.ts` with versioned, bounded lists/details, coverage and a response to a pending user decision. Include run version, total/shown coverage and explicit unavailable/stale states. The web consumes this protocol only; it cannot author dispositions locally. No generic mark-resolved action exists. |

The first iteration writes exact Zod schemas, event names, record paths, query bounds, IDs, policy values and a worked event stream into a contract appendix beside this plan. The table fixes semantics now; the appendix makes the eventual wire and ledger changes reviewable before producers depend on them. Existing run records may remain readable, but an older run with no review-request policy record must report CheckFinding coverage as unavailable rather than as clean.

## Review policy for the first trial

Use a captured per-run policy: two concurrent review readers, twelve queued requests, one retry after an execution/validation failure, and a ten-minute execution limit per attempt. At work-item reconciliation allow up to fifteen minutes from the completion request for outstanding reviews; then finish them as not verified, fence their results and stop their sessions. These are initial limits for a measured trial, not claims about throughput. Queue overflow becomes a terminal not-verified attempt, and the scheduler starts no attempt or retry that cannot complete before its work item's deadline; such a request finishes as not verified at once with that reason. The single writer receives scheduling priority. Assessment and correction use at most three reconciliation rounds per work item, a new policy value beside the existing `repairRoundsPerWorkItemGate`, which keeps its own count; a correction iteration also keeps the ordinary `repairRoundsPerIteration` bound of its own gate. Exhaustion of any counter records unresolved obligations and never manufactures a pass. Record queue delay, review duration and work-item tail to revise these values if the trial shows starvation or unnecessary waits.

For each audited candidate, the evidence owner prepares one immutable source snapshot and diff. Read/list/search tools resolve only within that snapshot and the captured evidence bundle, with path and symlink checks; no unrestricted shell, write tool or live generated view is available. A fork starts in the snapshot context, and a missing or degraded fork starts fresh with the complete captured input. A separate read-only scope fork uses the assignment point; reconciliation uses the point after the local architect's completion request. Actual start mode and lineage are recorded, so a fresh fallback is never measured as a fork saving.

## Iteration order

| Iteration | Owner and executable slice | Depends on |
| --- | --- | --- |
| 1 | CheckFinding contract, pure child, decision/replay/query fixtures | Current ledger and model |
| 2 | Atomic ledger ingestion, run serialization and recovery projection | 1 |
| 3 | Invocation registry, snapshot tools and durable review attempts; code review pilot | 2 |
| 4 | Scope and design reviews, pinned fork points and bounded scheduler | 3 |
| 5 | Work-item reconciliation, architect matching, dispositions and correction loop | 2–4 |
| 6 | Selected scenario-failure producer and factual verification | 2, 5 |
| 7 | Browser-safe query/command and web inspection | 2–6 |
| 8 | Scripted end-to-end, recovery, performance and browser acceptance | 1–7 |

### Iteration 1: Domain contract and pure reducer

**Owner:** new `subs/harness/subs/check-findings/`. Create its `module.ramify`, README, owned interface file and pure identity, decision, replay and query functions as specified by the architecture. No filesystem, agent, Git, gate or HTTP imports. The child receives opaque trusted facts and references; the harness will authenticate their origins. Define v1 event and view versions, exact rejection reasons, standing/revision transitions, source and obligation comparison, same-issue links and bounded attention query. Write the contract appendix and fixture stream with two unrelated concerns in one file, two parallel reports about one behavior, one stable producer issue key, an accepted choice, a later contradiction and a deferred revisit.

**Verification and exit:** pure tests prove exact replay and conflicting replay, ambiguous producer key refusal, revision conflicts, distinct concerns, same-issue grouping without loss of factual obligations, judgment supersession without code change, repair claim waiting for witness, same-obligation pass, wrong-test/wrong-source/partial/unrun rejection and reopening. Replay of the fixture derives identical views. `npm run type-check` and `npm run check:self` pass with actual parent exposure. Handoff names every trusted input the harness must bind.

### Iteration 2: Ledger composition and atomic ingestion

**Owner:** harness run log, records, producer adapter seam and projection. Add versioned CheckFinding events and record layout; keep check and review attempts separate from CheckFindings. Introduce a run-mutex transition function that reads current log state, checks terminal/revision/idempotency, allocates IDs, asks the child for events, and commits event plus records in one ledger transaction. Slow evidence collection occurs outside the mutex and its captured basis is revalidated under the mutex. Apply this same sequencing contract to direct ledger effects that can change relevant state. Rebuild the key index and materialized views from the ledger after restart.

**Verification and exit:** concurrent callbacks with one report key produce one issue, conflicting payloads fail, terminal runs accept no new issue, crash before commit replays once, and crash after commit rebuilds without re-invoking a producer. Fault injection confirms there is no decision record without its linked report or repair intent. Existing gate and scenario records retain their verdicts. The handoff supplies a stable ingestion API for review attempts and selected check producers.

### Iteration 3: Reader lifecycle and code review pilot

**Owners:** harness run coordinator, evidence snapshot adapter and `reviews/` integration. Replace the single active invocation fields with a registry keyed by invocation ID, permitting one writer and bounded readers. Stop and shutdown address each live invocation and retain cleanup responsibility after a result is fenced. Capture one review request per eligible passing audited iteration before the driver advances; recovery derives any missing requests idempotently from accepted iteration gates. Create immutable candidate snapshot access and a code reviewer with structured submission. Commit its terminal attempt, coverage and actionable CheckFindings together. The normal next iteration may proceed while it runs.

**Verification and exit:** scripted writer and two readers overlap without crossing snapshot boundaries; an absolute path, symlink escape and live-view read are denied. A valid empty code review is covered and makes no CheckFinding; a concern is promoted once; malformed, partial, unavailable and timed-out reviews retain correct coverage. A crash after the gate but before request creation schedules it on restart. Stop settles or fences every reader, and an old callback after closure cannot ingest a concern. One real process snapshot witness proves the tools read the audited candidate while a later writer changes the live tree.

### Iteration 4: Scope, design and bounded scheduling

**Owner:** harness review policy and prompt packages. Add scope and design questions over the same snapshot, with independent attempts and coverage. Scope uses assignment intent and the diff from the iteration base to audited candidate; design uses only selected guidance with captured hashes. Capture the assignment-producing local architect ref atomically with `iteration-assigned`, and the post-`request-completion` ref on `outline-revised`, the event that commits that submission, as the architecture specifies; no new event is added for it. If a pin is unavailable, use a complete fresh packet and record actual mode. Probe the pi adapter's fork from a pinned point in an isolated snapshot; do not infer isolation or cost from `workingDirectory` alone. Introduce queue limits, deadline, retry and engineering priority from the captured policy.

**Verification and exit:** the three requests bind one candidate and distinct questions. Scope fork sees the assignment point rather than a later parent turn; changed guidance invalidates design orientation reuse. Tests cover queue overflow, fair draining around a writer, one retry, partial coverage and a fresh fallback. The focused pi probe records actual start mode and snapshot access. Handoff gives reconciliation durable terminal request state, fork refs and explicit gaps.

### Iteration 5: Work-item assessment and ordinary repairs

**Owner:** harness local architect work flow and `reviews/` composition. Before the existing work-item gate, settle this item's review requests or record deadline gaps. Query open and due CheckFindings; an empty actionable set takes the gate path without an agent call. Otherwise submit one bounded packet to a fork at the latest captured completion-request point. Its structured answer combines match relations, each disposition, communication judgment and next ordinary action. Validate actor, basis, authority and child transitions; commit a repair decision with its correction assignment or a recoverable pending assignment intent. Commit decisions before idempotently appending their concise brief to the parent. A failed append is carried by the next architect input. New correction iterations use normal gate and review paths. Revalidate basis and gate at completion.

**Verification and exit:** concurrent duplicate reviewer concerns are grouped by a reasoned same-issue relation; same-file distinct concerns stay separate. Later iterations may already have repaired a judgmental concern; an architect may supersede it without a code edit. Weak guidance tension is resolved with a material-choice report; a strong explicit conflict creates a pending user decision with exact text/revision/options. A stale assessment, changed source, new report or expired request set refuses completion. Crash after decision but before brief append recovers once; crash after repair decision retains an assignment or intent. A missing fork pin starts fresh. Exhaustion leaves required failures failed and unresolved decisions visible. No human response is required for routine cases.

### Iteration 6: Factual scenario witness

**Owners:** harness scenario-check producer adapter and check evidence. Promote a failed tracked scenario only when it needs cross-attempt continuity. Its identity is the scenario ID and frozen obligation revision, with the selection/config identity; the scenario result already carries the ID, status, file, line and step bindings read from the run's retained Cucumber message stream (`subs/scenarios/src/messages.ts`, `checks/records.ts`). The immediate gate repair path stays in charge. A resolution witness names the same scenario and unchanged obligation on the acceptance candidate and proves it actually ran and passed; a process exit alone or absence from failures is insufficient. An authorized obligation revision is a distinct decision. Preserve an intermittent or runner-error sequence as factual attempts and an inconclusive classification without claiming a fixed defect. The project's own untracked scenarios are counted, not identified, and stay on gate attempts rather than receiving an invented identity.

**Verification and exit:** same-scenario pass with comparable inputs may verify the promoted CheckFinding; wrong scenario, changed/deleted assertion, narrower selection, timeout, launch error and missing message do not. Two passing focused results can support a provisional intermittent classification but never a required-gate pass. Required scenario gate status remains independent of CheckFinding standing. The handoff states exactly which scenario producer shapes are supported and which check failures remain unpromoted.

### Iteration 7: Protocol and work-item inspection

**Owners:** harness protocol/HTTP/projections and web. Expose bounded review and CheckFinding list/detail queries and a `RespondToCheckFindingCommand` that answers a pending user decision using its ID and expected CheckFinding revision. Include run version and coverage on every list. Put CheckFinding history beside its work item, attempt, candidate diff and repair session. Show standing/reason, review coverage, factual verification, accepted risk, material choice and pending user decision separately. Routine resolved concerns remain available in optional inspection without default notification. Web sends only typed commands and never computes a disposition or changes a gate verdict.

**Verification and exit:** protocol and HTTP tests cover paging/bounds, stale run version, old-run unavailable coverage, command retry/conflict and stale CheckFinding revision. Web tests distinguish clean, partial and unavailable review; fixed, superseded, accepted, deferred and open CheckFindings; and a decision request from a severity label. Browser build and self-check establish actual browser-safe exposure and companions.

### Iteration 8: Composition and acceptance

**Owner:** full harness and web integration. Run the scripted multi-iteration fixture through one clean item and one item with concurrent code/scope/design concerns, an accepted correction and a later changed candidate. Inject crashes at each ledger boundary named below, and run one real snapshot/process and browser witness. Inspect the final diff for owner boundaries and no parallel CheckFinding store. Record actual policy values, review tokens, warm-up cost, queue delay, work-item completion tail, retained findings, correction rounds, human decisions and missing coverage with denominators and source revisions. Compare fork and fresh starts only when actual modes and equivalent inputs are recorded; make no savings claim from an unmatched pair.

**Final gate:** `npm run type-check`, `npm run build:web` and `npm run check:self` from `ramify-agent/`; then a recorded ramify-audit request for this plan, beside `audit/plan11-execution-map.request.json`, on the final implementation commit. That audit is the only full-suite run, and its Git note and run ref are the suite evidence. Record focused, process, browser and audit results separately in `results.md`. An unavailable live-model trial is a named gap, not an invented result. Finish only when the acceptance matrix below has evidence and the plan's explicit deferrals remain visible.

## Acceptance matrix

| Case | Observable evidence | Owning iteration |
| --- | --- | --- |
| CF01 | Exact retry gives one CheckFinding; conflicting key and ambiguous issue key reject | 1–2 |
| CF02 | Judgments can be superseded without a code change, while a factual failure still needs its own witness | 1, 5–6 |
| CF03 | Two independent same-file concerns stay distinct; two parallel reports about one behavior link with rationale and retain both IDs | 1, 5 |
| CF04 | Clean, invalid, partial, timed-out and unscheduled review attempts have distinct coverage and terminal results | 3–4 |
| CF05 | Two readers overlap the writer against the audited snapshot; escaped or live reads are denied | 3–4 |
| CF06 | Gate-to-request crash, pre/post-result-commit crash and projection rebuild preserve exactly-once history | 2–3, 8 |
| CF07 | A result after closure is fenced; stop/shutdown owns all live invocations and cleanup | 3, 8 |
| CF08 | Empty actionable set reaches the ordinary work-item gate without an architect assessment call | 5 |
| CF09 | Stale source, issue revision or request set rejects an architect disposition and completion | 5 |
| CF10 | Missing fork point starts fresh; failed parent append is recovered from durable decisions | 4–5 |
| CF11 | Repair decision retains correction assignment/intent; claim stays open until verified | 1–2, 5 |
| CF12 | Routine concern resolves automatically; strong authority conflict asks with precise references; accepted risk does not pass a gate | 5, 7 |
| CF13 | Same-scenario pass can verify; wrong test, changed obligation, missing execution and inconclusive runner outcome cannot | 1, 6 |
| CF14 | Run and browser show CheckFinding reason/history, review gaps and material choices with honest count coverage | 7–8 |
| CF15 | Bounded queue, retry, wait and correction limits produce explicit gaps or unresolved work, never false success | 4–5, 8 |

## Handoff and later decisions

`results.md` is created during implementation, not as proof in this planning change. Each iteration adds its exact source revision, fixture/case IDs, commands, outcomes, deviations and handoff contract. After the first measured scripted and real-session trial, review the initial concurrency and deadline policy against queue delay and completion tail. Decide separately whether broader test producer identity, focused flaky execution, sealed edits or cumulative gap reviews merit their own plans. The v1 completion report must state supported producer coverage and any cases left on ordinary gate attempts.
