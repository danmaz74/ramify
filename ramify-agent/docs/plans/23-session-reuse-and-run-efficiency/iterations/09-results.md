# Iteration 9 results: predetermined forks and API retirement

**Engineering result:** W03–W07 implementation and ordinary owner checks passed. Coordinator review and joined qualification are separate. Native Git/toolkit/provider, live requests, browser acceptance and the full configured audit remain iteration 14; none was run or claimed here.

## Identity and exact boundary

Worktree `/home/app/ramify-plan23-09-forks`, branch `feat/plan23-09-forks`; accepted iteration-8 base `4bca992b59ad45611731d0cc89e09ae9b5780713`. Independent `npm ci` was completed before assignment; dependency pins and lockfiles did not change. Contract: execution v1 / C3, acceptance W03–W07, frozen F1/F2.

Implementation commit `a7b73fc9c3d78f922626697591b39c88cd287453` has the executable delta first handed off as `2cabc51e014043e82810cfdc9dd44452c5d97b43` (coordinator cherry-pick `f53d2126`), plus two corrected internal reference/fallback comments. Amending a handed-off review hash was a delivery mistake; subsequent changes are append-only. Standalone directory follow-up/source head: **2bb28379d08765eb7f69a8f2ec8540d172043b34**. Delivery HEAD is the receipt-only commit; resolve exactly using `git log -1 --format=%H -- ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/09-results.md`.

All 53 source/test paths below were checked against the coordinator's exact iteration-9 reservations, including approved retirement/test/helper and `sessions/single.ts`, `sessions/records.ts` additions. No declaration, manifest, registry, dependency, other worker or main-checkout index was edited. Ordinary/testing foreign views were searched separately for accepted SessionOperations, SessionStore, generic points, package APIs and Pi built-in declarations. No generated view was edited/imported.

Changed paths relative to `ramify-agent/`:

- `subs/harness/src/architecture/records.ts`
- `subs/harness/src/deviations/records.ts`
- `subs/harness/src/interfaces/protocol/transcripts.ts`
- `subs/harness/src/probes/pi-fork.probe.ts`
- `subs/harness/src/probes/plan13-module-local.probe.ts`
- `subs/harness/src/reviews/inputs.ts`
- `subs/harness/src/run/log.ts`
- `subs/harness/src/run/records.ts`
- `subs/harness/src/run/service.ts`
- `subs/harness/src/run/session-operations.ts`
- `subs/harness/src/sessions/records.ts`
- `subs/harness/src/sessions/single.ts`
- `subs/harness/src/tests/capability-consultation.test.ts`
- `subs/harness/src/tests/capability-delegation.test.ts`
- `subs/harness/src/tests/capability-recovery.test.ts`
- `subs/harness/src/tests/context-selection-runtime.test.ts`
- `subs/harness/src/tests/helpers/reviews.ts`
- `subs/harness/src/tests/helpers/session-fixture.ts`
- `subs/harness/src/tests/iteration-gate.test.ts`
- `subs/harness/src/tests/iteration-source-delivery.test.ts`
- `subs/harness/src/tests/placement.test.ts`
- `subs/harness/src/tests/plan13-composed-functional.test.ts`
- `subs/harness/src/tests/plan23-continuing-work.test.ts`
- `subs/harness/src/tests/reconciliation.test.ts`
- `subs/harness/src/tests/review-questions.test.ts`
- `subs/harness/src/tests/review-stop.test.ts`
- `subs/harness/src/tests/run-bounds.test.ts`
- `subs/harness/src/tests/single-session.test.ts`
- `subs/harness/src/tests/transcript-run.test.ts`
- `subs/harness/src/tests/union-values.test.ts`
- `subs/harness/src/tests/writer-settlement.test.ts`
- `subs/harness/subs/agent/src/interfaces/port.ts`
- `subs/harness/subs/agent/src/scripted.ts`
- `subs/harness/subs/agent/src/tests/helpers/spec.ts`
- `subs/harness/subs/agent/src/tests/port-additions.test.ts`
- `subs/harness/subs/agent/src/tests/port-observations.test.ts`
- `subs/harness/subs/agent/src/tests/scripted.test.ts`
- `subs/harness/subs/agent/src/tests/tool-actions.test.ts`
- `subs/harness/subs/agent/src/tests/transcript-content.test.ts`
- `subs/harness/subs/agent/subs/pi/src/pi-agent.ts`
- `subs/harness/subs/agent/subs/pi/src/session-operations.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/compaction-policy.test.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/context-budget.test.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/fork-isolation.test.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/guard-installed.test.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/guarded-writes.test.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/helpers/session.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/model-choice.test.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/pi-agent.test.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/session-modes.test.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/tool-actions.test.ts`
- `subs/harness/subs/agent/subs/pi/src/tests/transcript-content.test.ts`
- `subs/harness/src/tests/plan23-fork-workflows.test.ts`
- `docs/plans/23-session-reuse-and-run-efficiency/iterations/09-results.md` (this receipt)

## Final operation/source inventory

Anchors refer to `subs/harness/src/run/service.ts` unless another path is stated.

| C3 workflow | Final source/operation and durable authority |
| --- | --- |
| Initial selector / re-selection | `orientAndSelectWorkContext` / `selectElements` around 4880/5082 and re-selection around 5700: fork exact accepted orientation initially; re-selection captures requesting result id/ref/session before subsequent parent activity. Hash-verified recorded packet/selection remain the named lost-context recovery authority. |
| Local architect orientation, assignment, repair, qualification | Around 5545/5616 and `coordinateCapabilityNeed` 7367: continue recorded settled point and accepted appended briefs. Explicit fresh reconstruction retains the named durable work package and replaced session. |
| Engineer consultation | `consultCapabilityConsumer` 7843: fork `CapabilityRequest.continuation.point` and request.invocation, for every child. Accepted answer changes the durable exchange, never advances/replaces the original consumer source. Truthful lineage reason is `capability-consultation`. Valid missing history permits only the named current-request/suspended-source/current-plan recovery; malformed/cross-run references fail. |
| Scope review | `reviewStart` 1396: fork captured `iteration-assigned`/`capability-assigned` architectRef after matching its accepted invocation outcome. Current reviewer role, read-only tools and snapshot/candidate are rebound. Only the existing complete recorded scope-review reconstruction handles genuinely unavailable history. |
| Design review | `reviewInputs` 1094 / `orientation` 1449: identity binds captured guidance hashes, package, agent/model, reviewer context, work/project scope and complete-history/no-compaction/current-snapshot configuration. Changed/unknown identity gets explicit fresh orientation; matching identity forks its exact settled point. Failed/unavailable orientation remains unavailable, with no replacement reviewer dispatch. |
| Code review | `reviewStart` point:none stays independently fresh; existing current candidate/snapshot grounds and rejection controls remain. |
| Reconciliation | `reconciliationStart` 1961: fork accepted completion-request/capability handback point. Accepted assessment returns via stable idempotent brief append. Actual missing recorded history uses the existing complete reconciliation packet recovery; conflicting accepted point correlation fails. |
| Global placement / unresolved | Requests capture `globalSource` at 6092/6347; execution uses request.globalSource at 6143/6421. Generation/session/ref/initial orientation point/appended/pending identities are recorded when the request is committed. Later moving global head never substitutes this inherited source. Current required decisions/registry/view facts enter separately as current revision-bound task inputs. Missing initial orientation fails; only positively recorded `global-context-rebuilt` permits named fresh reconstruction. |
| Capability actions / nested qualification | `runCapabilityCoordinator` 7598 / `coordinateNestedCapability` 8116: continue same captured coordinator; first task stays fresh. Replaying an accepted action retains its original point for assignment/review authority, while its next Continue uses the separately recorded recovery-append checkpoint. No second original action/report/writer dispatch. |
| Engineer repair / capability return | `takeIteration` 8437: same-iteration repair/return continues exact saved engineer point. Bounded original lost-session reconstruction uses assignment/source/work records and unchanged counters. New accepted iteration stays fresh. Raw hard limit fails with work unfinished, no fabricated accepted return or unrequested fresh dispatch. |
| Contract repair | `takeContract` 8998 / `runContractSession` 9183: first contract engineer stays fresh, repairs continue; named reconstruction retains original registration/request/assignment authority. |
| NFR and other fresh boundaries | NFR action/investigation/repair/assessment at 3689/3722/3792/3930 remain existing fresh policy. Intake/catalog/principles/check/extraction/initial architecture/orientation, failure analysis at 10362, standalone `sessions/single.ts` remain fresh. NFR task requirements now use the owning selected/complete NFR package instead of uncited captured raw-plan recommendations. |

The harness makes no semantic choice of strategy. Source points come from the owning accepted records; neutral internal references contain harness run plus AgentSessionPoint. The old AgentPort.startSession/appendContext methods, Pi file/ref reconstruction, legacy SDK-wrapper path, obsolete executor directories and two unused development probes are retired. Internal SessionSpec remains a private one-task adapter input; ScriptedAgent's callback perception includes inherited messages, while its actual record/current emitted user and delivered packet remain current-only. `ScriptedAgent.loseSession(point)` is an explicit injected fixture-store read loss, not durable transcript decoding. The gate loss fixture now loses the original engineer exactly once at its failing gate, never the replacement during settlement.

New display-transcript IO failure remains the existing transcript-incomplete observation gap and does not reject the authoritative new operation. Original-operation restoration still requires readable matching transcript/input correlations. Standalone plain records now create their own parent directory; no removed per-invocation executor directory is recreated.

## Independent controls and actual delivery

New `plan23-fork-workflows.test.ts` executes these five fixed controls:

- “F1/F2 sibling forks preserve exact numbered checkpoints while later parent briefs remain independent”: T1/C1 siblings, later C2 excluded, literal role instructions appended, immutable initial head and unchanged complete parent, current C2/S2 environment.
- “inherited write and old submission declarations cannot affect current read-only child outcomes”: retained historical definitions, actual inactive call refusal observations, current submission active, original submission accept counter unchanged. An unused probe counter was removed; it was not write-boundary evidence.
- “a valid but missing point remains unavailable and causes no replacement model dispatch”.
- “design identity binds scope, guidance, package, model and complete-history execution independently”.
- “actual workflow records bind placement and context-selector forks to accepted request-time invocations”, with new-engineer fresh checks. Its initial default 5s test bound failed; the owning scenario helper's existing whole-workflow 180s bound is used for this new case. Existing test deadlines were unchanged.

`capability-consultation.test.ts` positively executes two independent children from the SAME original request point: both durable invocation.session.from values match it; child two inherits neither the first consultation question nor its answer; the original parent's current point remains unchanged. Its second case verifies actual original-parent store loss and explicitly recorded named reconstruction. `capability-recovery.test.ts` verifies accepted action/report replay once, original assignment point T1, separately appended coordinator C1 (same session/turn, different checkpoint), exactly one inherited recovery brief and no current duplicate. Review/placement/reconciliation controls keep exact source relations, candidate/snapshot evidence and failed/unavailable outcomes. Global controls distinguish inherited briefs through the request from later accepted decisions and verify pending-brief loss/rebuild handling.

Canonical package delivery is structural, not semantic hash guessing. `InvocationRequest.task.literalSections` supplies explicit `support:work-item-package`, `support:assignment-package` and `support:selected-plan-package` sections. The adapter's model-free `append(ref,key,text,briefingSectionKey?)` explicitly records the accepted package section in captured briefing history; unchanged later sections deduplicate against that named revision, while genuinely fresh/reconstructed inputs retain the full exact package. Private script callback history still sees those inherited bytes. Current user packets/manifests verify unchanged complete package is not appended again and its inherited source/hash occurs once. Human goal/requirements remain required canonical inputs.

Supported Pi controls use scripted provider requests through the preserving SDK path: exact immutable prefix, current user/task event bytes, guard/hook action parity, tools/schema, raw structured submission, thinking level, model-free append/replay and unavailable transport/model zero-dispatch. Allowed compaction permission is retained unchanged; preserving completion succeeds without compaction events. Current user observations are actual admitted task text, not reconstructed history or proof of HTTP dispatch.

## Executed verification and failure history

All commands ran from this worktree's `ramify-agent/`, with focused Vitest `--maxWorkers=2`, scripted external/provider boundaries and no new skips/deadlines. Logs are external `/tmp` evidence. Counts below are actual completed runner output, not requested selector counts.

**Required/affected workflow gate**, `/tmp/plan23-09-final-workflows.log`:

```sh
npm run test:quick -- subs/harness/src/tests/plan23-fork-workflows.test.ts subs/harness/src/tests/nonfunctional-recovery.test.ts subs/harness/src/tests/session-reducer.test.ts subs/harness/src/tests/capability-consultation.test.ts subs/harness/src/tests/capability-delegation.test.ts subs/harness/src/tests/capability-recovery.test.ts subs/harness/src/tests/iteration-gate.test.ts subs/harness/src/tests/iteration-source-delivery.test.ts subs/harness/src/tests/plan13-composed-functional.test.ts subs/harness/src/tests/review-stop.test.ts subs/harness/src/tests/transcript-run.test.ts subs/harness/src/tests/context-selection-runtime.test.ts subs/harness/src/tests/placement.test.ts subs/harness/src/tests/reconciliation.test.ts subs/harness/src/tests/review-questions.test.ts subs/harness/src/tests/plan23-continuing-work.test.ts subs/harness/src/tests/plan23-session-store.test.ts subs/harness/subs/agent/src/tests/plan23-session-engine.test.ts subs/harness/src/tests/union-values.test.ts --maxWorkers=2
```

18 files / 201 cases passed, 176.01s. The requested `plan23-session-engine.test.ts` selector was nonexistent and matched no file; it is not counted or qualified. The real `plan23-session-operations.test.ts` was explicitly executed in the next gate.

**Final provider/retirement/lifecycle gate**, `/tmp/plan23-09-final-retirement-lifecycle.log`:

```sh
npm run test:quick -- subs/harness/src/tests/capability-consultation.test.ts subs/harness/src/tests/reconciliation.test.ts subs/harness/src/tests/session-lifecycle.test.ts subs/harness/subs/agent/src/tests/plan23-session-operations.test.ts subs/harness/subs/agent/src/tests/port-additions.test.ts subs/harness/subs/agent/src/tests/port-observations.test.ts subs/harness/subs/agent/src/tests/scripted.test.ts subs/harness/subs/agent/src/tests/tool-actions.test.ts subs/harness/subs/agent/src/tests/transcript-content.test.ts subs/harness/subs/agent/subs/pi/src/tests/pi-agent.test.ts subs/harness/subs/agent/subs/pi/src/tests/session-modes.test.ts subs/harness/subs/agent/subs/pi/src/tests/fork-isolation.test.ts subs/harness/subs/agent/subs/pi/src/tests/guarded-writes.test.ts subs/harness/subs/agent/subs/pi/src/tests/model-choice.test.ts subs/harness/subs/agent/subs/pi/src/tests/guard-installed.test.ts subs/harness/subs/agent/subs/pi/src/tests/context-budget.test.ts subs/harness/subs/agent/subs/pi/src/tests/compaction-policy.test.ts subs/harness/subs/agent/subs/pi/src/tests/transcript-content.test.ts subs/harness/subs/agent/subs/pi/src/tests/tool-actions.test.ts subs/harness/subs/agent/subs/pi/src/tests/plan23-prefix-preservation.test.ts subs/harness/subs/agent/subs/pi/src/tests/plan23-native-request-artifact.test.ts --maxWorkers=2
```

21 files / 156 cases passed, 72.99s, including unchanged session-lifecycle (its original 180s bound), actual generic operations and both source-point consultation controls.

**Remaining caller gate**, `/tmp/plan23-09-final-remaining-callers.log`:

```sh
npm run test:quick -- subs/harness/src/tests/run-bounds.test.ts subs/harness/src/tests/single-session.test.ts subs/harness/src/tests/writer-settlement.test.ts subs/harness/src/tests/context-selection-delivery.test.ts --maxWorkers=2
```

4 files / 35 cases: 25 passed, 10 failed, 274.93s. The three non-single files passed all 22 cases; three single cases also passed. Ten single-session ENOENT failures exposed removal of the records parent mkdir. This failed gate is not passing evidence.

**Repaired standalone gate**, `/tmp/plan23-09-standalone-ledger-final.log`:

```sh
npm run test:quick -- subs/harness/src/tests/single-session.test.ts --maxWorkers=2
```

1 file / 13 cases passed, 6.99s after the final absence/shared-ledger control.

After restoring mkdir(records), the first standalone rerun passed 12/13 and failed only the old stat(records/session) expectation. Replacing it with absence of that retired directory and presence/nonempty authoritative shared session-operations/store/session-ledger.jsonl preserves the actual durable-store control. No old directory was recreated.

Earlier intermediate failures are retained: workflow-first (7 files, 19 failed/38 passed of 57), workflow-third (5 files, 4 failed/31 passed of 35), then workflow-fourth (5 files/35 passed). The initial broad affected gate `/tmp/plan23-09-affected-first.log` failed 8/36 files, 17 failed/329 passed of 346 (385.58s). Affected-second failed 6/9 files, 8 failed/47 passed of 55, plus iteration-gate transform failure from duplicate fixture variable. Affected-third failed 2/6 files, 3 failed/49 passed of 52 (57.73s); exact saved coordinator error was “Expected point is stale or session active”. Recovery-fourth passed 2 files/17 cases (32.59s). Fixes retained original assertions/deadlines: current-versus-inherited prompt expectations, last current scripted basis/submission routing under immutable heads, strict Git completion/previews, accepted recovery point, truthful compaction fixture responses, and display transcript gap behavior. Type-check intermediate failures were stale retired fields, test union narrowing/event names and that duplicate fixture variable; all were repaired. No failed or missing run is counted as a pass.

Final `npm run type-check`: **passed (exit 0)**, all four configured scopes (root, web, scripts, browser-acceptance), log `/tmp/plan23-09-types-delivery.log`. Final `npm run check:self`: **completed/passed (exit 0)**, log `/tmp/plan23-09-structure-delivery.log`; 12 owners/667 source files/50 resources, 0 errors, 0 warnings, 317 analysis limits, partial static coverage. `git diff --check` and exact reservation comparison passed.

Ordinary process receipts are under `node_modules/.cache/ramify-agent-test-processes/f9b1e2487ed898449a45340faafe85091d93afe43859e43f08514ce53ac19925/`. `/tmp/plan23-09-final-process-receipts.json` enumerates the final 18+21 gates' 39 receipts (37 distinct files), exact starts/ends/file/cwd/IDs: all native:false, allowed:[], refused:[]. Guard SHA `af06ff2a7e01558bb334f12694d81ae7b703c501eee11afd62c6d0fa3da7806d`, registry SHA `6d6492712cbe67ba7e0f525ca368d2ed54e41eca2bef1b750f4ea8959b4cbc6c`. Final standalone receipt `990c587c-25e9-4cc0-983b-055b1ad409e8.json` likewise records native:false, allowed:[], refused:[]. Caller receipts are retained in the same directory; failures remain distinct from guard evidence.

## Retirement search and successor handoff

The final source/caller searches are `/tmp/plan23-09-final-sites.txt` and `/tmp/plan23-09-retirement-search.txt`. Searching root src/scripts and all harness/agent/Pi src/tests explicitly, excluding generated `.ramify`, found no actual startSession caller/definition, no old AgentPort.appendContext call, no sessionDirectory or executorSession field/reader. Remaining `.appendContext()` calls are the intended public SessionOperations method and its controls. SessionManager.inMemory/appendMessage remain ONLY inside the Pi preserving owner; the harness has no provider-file/SDK decoding. Literal startSession remains an explicit absent-member assertion and one unedited historical current-test comment in stop-before-start (not an executable caller). Historical planning evidence and README cleanup are coordinator/final-14 scope, not silently rewritten here.

For iteration 10: use current neutral source/correlation records and declared task.literalSections; when a complete package is already delivered by model-free append, pass its exact canonical section identity so current briefing revision structurally deduplicates it. Fresh inputs must still deliver its complete text. Current required post-point facts belong to current revision-bound task inputs, never label them inherited through the captured global request point. Preserve named recovery bounds/source proof, exact response schemas, read-only snapshots and original action versus explicitly appended resume point. The small taskSupportSections Markdown heading-fence correction remains deliberately 10-owned and unchanged here.

For iteration 11: accepted-8 start() still uses its existing agent-operation-existence probe to choose Retry; the coordinator's approved public original-operation lookup replaces that separately. New append() no longer decodes agent-private operation receipt journals: it observes public inspect additions/stable keys and relies on engine conflict/idempotency validation. Enrich observation/delivery producers from actual current/inherited manifests and original operation identity, never from package union or opaque transcript decoding. Durable environment policy keeps safe facts and environment names; no credential/environment values were added here.

For iteration 14: migrate public README/probe claims after integrated consumers qualify; actual native preservation/SDK request dispatch, installed commands, browser fixture and final live/full configured audit remain open. These ordinary scripted requests and user observations do not claim HTTP dispatch or native/live qualification.
