# Plan 16 acceptance matrix

[Main plan](main-plan.md) · [Contracts](contract-appendix.md)

The scripted fixture is a small real Ramify project with consumer A, provider
B, another typed consumer D and their parent P. A needs a formatter to use a
new fact returned by B. D constructs the old result type. P exposes B's result
and its signature companion. This makes interface design, real integration,
typed migration and parent exposure observable without the diagnostic trial's
domain complexity. A second fixture adds dependency C. Use existing fixture,
scripted-agent, writer and command services; create no miniature parallel
harness to make these cases pass.

Iteration 2 owns creation of `ramify-agent/fixtures/capability-coordination/`
and `ramify-agent/fixtures/capability-coordination-nested/`. These independent
fixture projects hold the source, declarations, package/test configuration and
requests; harness-owned helpers under `subs/harness/src/tests/helpers/` copy
them to temporary projects. Iterations 3–5 extend them for their cases. Include
B and an unrelated module U as independent entry work items in scheduling tests.

Fixture inputs include both a known-insufficient API and a no-known-API request,
an explicitly provisional pseudocode call, and consumer expectations defined
independently of the candidate's output. The scripted agent chooses actions
and supplies semantic judgments. Real commands establish their executable
consequences. Semantic quality itself also needs the separate live witness.

| Case | Trigger and observable result | Iteration |
| --- | --- | --- |
| CA01 | A submits each request form. Actual usage, constraints and examples survive capture and delegation. `none-known` never becomes a harness assertion of absence. | 1–2 |
| CA02 | A suggests a nonexistent registry name but a suitable API exists. A-architect identifies it semantically; A-engineer verifies use without a new provider task. A matching registry name with insufficient behavior still permits delegation. | 2 |
| CA03 | Delegation commits once, suspends A-architect and starts exactly one capability architect with actual mode `fresh`. B and U entries remain deferred throughout X; neither architect's old history is inherited. | 2 |
| CA04 | A's calling code reveals a constraint absent from the brief. The capability architect can read it and A's tests. It has no source write tool. | 2–3 |
| CA05 | A request for the same plan package across continued turns delivers its whole text once, then references it. Reconstruction receives the whole current package and selected evidence without duplicating earlier transcript bodies. | 2, 5 |
| CA06 | Capability architect consults A-engineer. The original engineer session continues read-only, its answer reaches the same capability architect, and A-architect is not invoked. Attempted mutation is refused. | 3 |
| CA07 | A real usage experiment requires edits. An explicit A-scoped assignment acquires the writer, edits and runs tests. A consultation cannot silently acquire those permissions. | 3 |
| CA08 | B adds a required field, D needs a typed fixture migration, and P needs a signature-companion exposure. The capability architect assigns the three owners and A integration without recalling A-architect or using external coordinator edits. | 3–4 |
| CA09 | An engineer edits another file within its assigned module: allowed. It edits an unselected child's internals: refused. Selecting a direct child includes its whole subtree. Evidence paths neither narrow nor widen these permissions. | 3 |
| CA10 | X changes A's formatter architecture within its responsibility: capability architect decides and consults A-engineer. A proposed responsibility redesign outside A/B goes to the responsible architect, then returns to the capability architect. | 3 |
| CA11 | An API revision changes a test signature while preserving the case. Original examples remain linked and coverage is updated. A proposed wrong-oracle correction carries evidence and a recorded agent decision; silent omission cannot close the case. | 1, 4 |
| CA12 | Fake tests pass but real A integration fails. Handback fails; failure evidence reaches the capability architect. Passing fake evidence never substitutes for the required real check. | 4 |
| CA13 | Provider and consumer tests are green with a scripted reviewer identifying a circular expected value. The finding prevents acceptance, repair is assigned, and independent assertions are rerun. This proves orchestration of judgment, not automatic detection of weak tests. | 4 |
| CA14 | B's provisional change fails whole-tree type checking until D is repaired. The failure stays recorded. D's scope comparison starts from its actual tree. The final combined gate and review pass before any acceptance of that migration candidate. | 4 |
| CA15 | A candidate change follows passing tests or a plan change alters required cases. Handback cannot cite the stale check as current acceptance. The required checks/review are refreshed. | 4 |
| CA16 | A malformed action gets field errors in the same session. Preview validation schedules nothing and consumes no rejection attempt. Final submission revalidates against changed state rather than trusting the preview. | 1–3 |
| CA17 | Valid engineer result plus provider, compatibility and real A checks permits one handback. A resumes its original goal with the result and current source; the broader feature remains open where it has other requirements. | 4 |
| CA18 | B-engineer exhausts context after modifying source without submitting. Preserve the tree and digest, reconstruct an engineer, require explicit result and gates. Passing external checks alone cannot manufacture a handoff. | 5 |
| CA19 | Crash at each intent/completion boundary for delegation, consultation, assignment and handback. Restart yields one effect, the same stack and deferred entries, correct active authority and one eventual A continuation. | 5 |
| CA20 | A writer or registered process group has not settled. No replacement writer, gate or handback starts, and the frontier cannot start B or U instead. Stop leaves an explicit unfinished task and preserves evidence. | 3, 5 |
| CA21 | B requests C: parent capability task waits; fresh child coordinates C, verifies its requesting B use and returns. Exact dependency cycles are reported; two needs in the same module alone do not count as a cycle. | 5 |
| CA22 | An existing consumer engineer session is lost before consultation or return. A replacement receives original need, prior work, current plan and question; actual fresh start and loss reason are visible. | 5 |
| CA23 | HTTP and browser views show suspended A, active capability architect, an unresolved consultation, provisional type failure, repair and final handback on matching task/plan revisions. | 6 |
| CA24 | Old contract/fake run fixtures remain readable with original verdicts. New runs invoke no contract-engineer path. An old incomplete run cannot silently resume under the new workflow. | 6–7 |
| CA25 | A post-handback integration finding creates linked revision work without overwriting the earlier accepted source/evidence. Required checks run against the new candidate. | 4–5 |
| CA26 | Captured invalid-input, repair and reconstruction limits exhaust with the original cause and unfinished state. Preview checks do not reset or spend the wrong counters. | 5 |
| CA27 | The final real Pi witness completes the bounded consumer/provider task through the production harness, including all source edits, explicit engineer results, semantic review, gates and handback. No temporary coordinator repair can substitute. | 7 |
| CA28 | B has its own queued entry and recorded decisions. X reads those decisions and defers the entry, assigning B only under X. After return, B receives the changes and replans stale assignments before execution. Its goal, sequence and completion remain distinct; a completed B entry receives explicit follow-up when needed. | 2–5 |
| CA29 | X assigns B, D and A with successive X-owned numbers; B's entry sequence is unchanged. Task limits apply across owners, repair/reconstruction cannot reset counters, and nested tasks count toward the combined work-unit and global invocation limits. | 1, 3, 5 |
| CA30 | A suspends with a tracked edit, an untracked source file and a failing test. Capture and preserve all three. B's scope diff excludes inherited A changes; its whole-tree gate still reports the failure. A-scoped repair plus combined review covers inherited source. Restart and final A continuation preserve attribution and do not falsely complete A's goal. | 2–5 |
| CA31 | Submit ordinary completion with a pending request, stopped task, unaccepted handback or reopened dependency: refuse with concrete references. Accepted current handbacks make the item eligible for its remaining gates only. Recheck the predicate at commit to prevent a stale completion attempt. | 4–5 |
| CA32 | X waits for A's answer, a gate, external decision or recovery with B/U ready on the frontier. Neither entry starts. A nested child runs depth-first; after child and X handbacks the original parent resumes before the ordinary frontier advances. | 2, 5 |
| CA33 | Before rollout, a test helper injects the capability workflow policy/factory into the real service and exercises its ledger transitions. The production constructor and public commands reject that version/policy injection. After rollout, the same factory is the production default and test-only injection stays unavailable publicly. | 2, 7 |
| CA34 | A task and a plan capability with similar names remain different typed references. The execution map links them only through recorded decisions. Handback changes task status, not B's entry completion or unrelated module-capability aggregates. | 1, 6 |
| CA35 | A bounded real Pi execution encounters an unresolved defect or a controlled budget stop. The harness retains pending source/results and reports unfinished work without handback. Report this failure-handling gate independently; it cannot pass CA27 or close iteration 7 alone. | 7 |

For recovery cases, inject a crash after durable intent but before execution,
after execution but before completion recording, and after completion before
the caller receives the result. Existing Git/effect idempotency must account
for the intermediate dirty candidate as well as the last accepted commit.

The live witness retains per-turn prompts, exact source identities, actual
session starts, actions, commands, failures and review outcomes. Report summed
agent time separately from wall time and input/output separately from cache
reads. A reduction in architect turns is informative, not an acceptance gate
requiring a faster result at the expense of correctness.

The toolkit's nine baseline-equivalent reference failures in the second trial
do not establish the harness's baseline and cannot be copied as a waiver. Each
implementation/live acceptance run establishes its own baseline and reports
clean pass, attributed baseline failure and unresolved failure distinctly.
