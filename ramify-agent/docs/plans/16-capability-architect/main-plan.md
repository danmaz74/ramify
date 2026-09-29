# Plan 16: a fresh architect coordinates each requested capability

**Execution correction:** [Plan 18](../18-shared-iteration-lifecycle/main-plan.md)
replaces the separate capability engineer lifecycle with the ordinary assignment,
preparation, gate, review and recovery path, including generated foreign API views.
Plan 16's trial reports and acceptance status below remain historical evidence;
the correction does not retroactively accept those runs.

**Date:** 2026-09-28. **Status:** implementation in progress; final acceptance
remains open. [Iteration 7 results](iterations/iteration7-results.md) and the
[implementation report](implementation-report.md) distinguish committed code,
audits and the two live gates. **Source inspected:** `5a1934aa844c5ab95013653f15c7aeb422690b13`
with the existing uncommitted prompt and documentation edits preserved.
This inspection state is not the execution baseline; the clean-baseline
prerequisite below must be completed before iteration 1.
The [review responses](review-responses.md) record the authority, scheduling
and execution-readiness clarifications incorporated into this revision.

## Outcome

An implementation engineer encountering a capability it needs records the need,
actual calling code, known constraints and example tests. Its architect checks
reuse and placement and delegates the work to a fresh capability architect.
That architect coordinates interface design, provider implementation,
compatibility repairs and real consumer verification. It can read A's and B's
code and speak directly to the requesting engineer. It returns a verified
capability and a continuation brief to the original architect and engineer.

From delegation until explicit handback, the capability architect performs
every A-architect task needed for X. This includes X's effects on A's
architecture, assignments in affected owners, compatibility decisions,
integration and verification. Ordinary X decisions do not recall A-architect.
Responsibility changes outside A and B still go to the architect responsible
for that boundary, with the capability architect retaining coordination of X.

The rollout replaces the contract-engineer/fake-first path for new runs.
Historical runs remain inspectable. The user confirmed replacement during
authoring; there is no optional legacy workflow for new runs.

```text
A-engineer requests X → A-architect qualifies and delegates X
                              │ suspended for X
                              ▼
                    fresh capability architect
                      ↕                   ↕
                 A-engineer       scoped implementation engineers
                                  in B and affected owners
                              │
                 real consumer checks and handback
                              ▼
                  A-architect / A-engineer continue
```

## Why this approach

The [first trial](evidence/2026-09-27-capability-plan-cooperation-trial.md)
showed that consumer feedback on a real implementation can expose a wrong test
expectation and reopen design. The [second trial and comparison](evidence/2026-09-28-fresh-capability-architect-trial.md)
retained that feedback with one active capability architect. Architect turns
fell from 15 to 9, including one unnecessary A-architect invocation. At the
comparable three-case milestone, summed Pi time was approximately unchanged:
47.851 versus 47.612 minutes. Later engineering and stronger checks increased
the second run's total cost. These are individual trials with methodological
differences, not proof of a speed or quality advantage.

The recommendation is based on the simpler coordination structure and its
demonstrated ability to guide a bounded provider/consumer implementation.
It adopts the second report's authority clarification. It does not adopt the
trial's diagnostic algorithm or treat its bounded result as feature acceptance.

Production work must address what the temporary driver did not establish:

- Compatibility changes were partly made by the external coordinator.
- The final provider engineer exhausted context without a structured result.
- The last reference run demonstrated baseline parity, not a clean full pass.
- The complete original feature remained unfinished.

The [archived plan snapshots](evidence/README.md) retain these limitations and
their provenance independently of the temporary trial directories.

## Existing behavior and changes required

Paths below are evidence and implementation entry points, not file assignments.

| Existing behavior | Source | Required change |
| --- | --- | --- |
| Engineer submits `contract-needed`; the report closes its session and assignment | `subs/harness/src/work/engineer.ts`, `subs/harness/src/run/service.ts:takeIteration` | A capability request suspends the unfinished assignment and retains the engineer for consultation and continuation. |
| Exact registry lookup starts a contract session, without a new semantic review when a key is found | `subs/harness/src/run/service.ts:takeContract` | A-architect qualifies reuse and provider placement; the registry records its decision. |
| Contract engineer registers interface, fake and conformance artifacts | `subs/harness/src/contracts/submission.ts`, `subs/harness/src/contracts/records.ts` | A fresh read-only architect coordinates scoped engineers through a revisable capability plan. |
| Consumer yields for provider obligations, then resumes in a fresh local session | `subs/harness/src/work/frontier.ts`, `subs/harness/src/work/submission.ts`, `subs/harness/src/run/service.ts:takeWorkItem` | Suspend the requesting architect; capability coordination handles provider and consumer work before handback. |
| Assignments use module scopes; the guard also supports named extra locations | `subs/harness/src/work/assignment.ts`, `subs/harness/src/work/scope.ts` | New capability work uses module scopes for ordinary source and tests, including compatibility changes. Existing outside-module mechanisms remain for project configuration and independent test packages. |
| One writer and settled process groups precede checks | `subs/harness/src/run/writer.ts`, `subs/harness/src/run/mutations.ts` | Reuse for every participant. Consultation grants no write permission. |
| Session port supports fresh/continue, supplied tools, validation feedback and compaction | `subs/harness/subs/agent/src/interfaces/port.ts`, `subs/harness/subs/agent/subs/pi/src/pi-agent.ts` | Reuse through harness orchestration; new agent-port APIs are not a prerequisite. |
| Harness owns durable records; ledger provides intents and replay | `subs/harness/src/run/log.ts`, `subs/harness/src/run/records.ts`, `subs/harness/src/work/committed.ts`, `subs/harness/subs/ledger/` | Add capability requests, plan revisions, exchanges, assignments and handbacks as durable run transitions. |
| Plan 14 renders captured requirement elements consistently | `subs/harness/src/context-selection/`, `subs/harness/subs/plan-evidence/` | Use the same package creator and selection rules for the capability and its assignments. |
| Execution map and session views assume current role/work relationships | `subs/harness/src/interfaces/protocol/`, `subs/harness/src/projections/`, `subs/web/src/` | Show delegation, the active coordinator, consultations, verification and handback. |

The generated architect view identifies harness as owner of orchestration and
durable run meaning, agent as owner of the session port, and web as its browser
consumer. The view reports cuts; the source above was inspected to confirm the
specific behavior used by this plan.

## Architecture and contracts

The [contract appendix](contract-appendix.md) defines proposed records,
actions, state transitions, authority and acceptance. Its names are proposed
implementation contracts, not claims about existing exports.
The [model amendments](model-amendments.md) distinguish a requested capability
from the durable task coordinating it and list every affected principle.

1. **One capability task, one active architect.** The task links the original
   request, suspended work and plan revisions. It may coordinate several
   owner-scoped assignments, including A's integration, under one goal.
2. **Fresh at delegation, continuing within the task.** The initial capability
   architect always starts fresh. It retains its context across iterations;
   loss or exhaustion reconstructs from durable records and is recorded.
3. **One plan, revised as evidence changes.** Preserve the original request.
   Examples may contain explicit pseudocode and suggested signatures. Neither
   freezes the final interface or a wrong expected result.
4. **Direct consultation.** The capability architect asks A-engineer questions
   and requests bounded integration experiments. The harness records and
   delivers them; no A-architect relay is needed.
5. **Scoped implementation and compatibility repair.** Every engineer receives
   a module scope. The capability architect can coordinate existing-owner
   repairs required by X without an external coordinator editing the tree.
6. **Real evidence before handback.** The architect coordinates B and A checks,
   reviews requirement coverage and requests handback. The harness verifies
   recorded checks and current candidate identity before resuming A's work.

Fakes remain available when useful, with existing explicit naming and exposure
rules. They are optional implementation aids. An unchanged fake test suite is
no longer a universal prerequisite for provider work or the sole definition of
its obligation. Required behavior survives API revisions and executable tests
must be adapted with an explicit reason when their representation changes.

## Scheduling and existing provider work

Execution is depth-first on one delegation stack. While X is active, the run
does not advance unrelated frontier work items, even during a consultation,
gate, external decision or recovery wait. Only X's current coordinator and
the agents/checks it requests are dispatched. A nested task suspends X until
that child returns. The writer lock remains an additional protection.

B's own entry work item is **deferred**, not absorbed or completed by X. The
capability architect reads B's recorded constraints, accepted work and relevant
outline before assigning B. It starts no B-local architect session for X. A
previously retained B-local session has no active assignment authority while
the stack owns coordination. When B's item is later selected, its architect
receives the intervening changes and handback evidence, refreshes its design
and revalidates unexecuted assignments before using them. B's remaining entry
requirements still need B's own completion gate. Changes to previously
completed work trigger explicit follow-up work when its guarantees need
reverification; the original completion stays historical.

Capability assignments belong to X, with one sequence across B, A and other
owners. They do not consume or reuse B's entry iteration numbers. The appendix
defines task and run limits so fresh sessions, owner changes and nested tasks
cannot reset the relevant counters.

For new runs, an ordinary work item cannot complete with an unresolved request
or a delegated task lacking an accepted handback. This replaces its old
fake-requirement/provider-obligation refusal condition; normal iteration,
scenario, review and final project gates continue to apply.

## Ownership and delivery boundaries

The harness owns the capability task, protocol, prompt packages, scheduling,
gates and durable records. Keep these in harness internals. Existing ledger,
agent, evidence, scenario and plan-evidence interfaces supply their current
responsibilities; this plan does not create a new module merely to hold shared
record types. Any required child API change must be established with its owner
and ordinary/testing API view before implementation.

The web module consumes harness-owned browser-safe projections. It never reads
internal run records or decides whether a capability is accepted. Root changes
are limited to re-exposing any newly published protocol symbols and composing
the application.

New implementation assignments cover a module's internals or a module plus
selected direct children and their whole subtrees. Paths in requests and test
evidence are pointers to behavior; they neither restrict all other files in an
assigned module nor widen writes into another owner. Cross-owner repairs get
separate assignments. A project file outside modules follows the existing
explicit assignment mechanism and remains visible in the plan.

## Failure handling that belongs in the first implementation

**A's partial edits stay live and provisional.** Settle A's writer, capture its
actual tree including untracked source and its delta from the accepted base,
and record that snapshot with the request before delegation. Do not revert or
silently accept it. Later assignments start from that actual candidate and
scope-check only their own mutations. Whole-tree checks include A's edits; a
failure in them remains a failure and can require an explicit A-scoped repair.
Any accepted combined checkpoint reviews those inherited changes as well as
X's edits. It does not complete A's suspended original assignment. The appendix
defines attribution, recovery and the return comparison against this snapshot.

**Interface changes can break typed consumers before migration finishes.**
Allow several scoped assignments to contribute to one provisional capability
candidate. Preserve every failed check and each assignment's actual mutation
scope. A later owner can repair an earlier type failure; no intermediate
failure becomes a pass. Before a candidate is accepted or handed back, rerun
the complete required gate against the combined tree and review the combined
changes. Do not require an engineer to edit foreign owners to unblock its gate.

**Context exhaustion is unfinished work.** Preserve the tree, transcript and
failure digest; let a replacement engineer inspect and continue within the
same assignment. Only its explicit submission and subsequent gates can close
the assignment. A saved prose report or passing independent test run is not a
substitute for the missing result.

**Repairable submissions receive feedback.** Validate the action currently
being requested, report errors with field paths and continue the same session.
Offer a non-mutating prevalidation tool using the same validator; the final
submission is validated again against current state. Do not make the agent
resubmit a complete historical accounting of the task on every action.

**Nested needs use the same workflow.** A B-engineer can request C. The current
capability architect qualifies it and suspends its task while a fresh child
capability architect coordinates the dependency. Completion returns to the
requesting engineer and parent capability architect. Record dependency IDs;
exact graph cycles go back to the architect for revision. Semantic overlap or
reuse is judged by an architect, not inferred from matching module names.

**Restart must preserve who is in charge.** Delegation, each exchange, each
assignment and handback are recoverable effects. After a crash there must not
be two active coordinators for X, duplicated engineers, a forgotten request or
a second continuation of A from the same handback.

Use the existing captured run policy and assignment-specific bounds. Do not
copy the temporary runner's twelve-minute stop or impose a fixed number of
design stages. Reconstruction and run limits remain finite and visible. Policy
defaults and any changes are recorded in the implementation report.

## Implementation sequence

Each iteration file names prerequisites, module scope, deliverables, cases and
handoff. The [iteration index](iterations/README.md) defines brief and results
locations; the [manifest](iterations/manifest.json) records dependency order.

Before iteration 1, resolve the existing version-4 contract procedure change
separately from Plan 16. Preserve it, its corresponding package version and
manifest-test change in a separate precursor commit, reviewed and checked as
that change. Record its revision and later retirement in iteration 7. Do not
silently fold it into this workflow change or drop it during cleanup. If it
is instead deliberately discarded, record that separate authorized disposition.
Create the execution worktree from a clean committed baseline containing the
chosen disposition and plan; unrelated dirty work remains in its original
checkout. Record the actual baseline commit, clean status and audit result in
`iterations/iteration1-results.md`. This document review neither commits nor
discards those existing source edits.

| Iteration | Scope and outcome | Exit evidence |
| --- | --- | --- |
| [1. Records and authority](iterations/01-records.md) | Harness internals: request, plan, task, action and transition contracts; proposed principles updates | Schema/reducer tests, requirement-preserving revisions and authority checks |
| [2. Delegation and context](iterations/02-delegation.md) | Harness internals: qualify need, retain A, start fresh capability architect, render bounded packages | Scripted request reaches one fresh architect; A is suspended; source requirements delivered once |
| [3. Cooperation and assignments](iterations/03-cooperation.md) | Harness internals: consult A-engineer, assign B and compatibility owners, revise plan | Real fixture exercises A consultation and separate guarded writes in B and another owner |
| [4. Verification and handback](iterations/04-acceptance.md) | Harness internals: provisional candidates, semantic review, real checks, explicit handback | Weak tests and failed migrations cannot complete; corrected real consumer result resumes A once |
| [5. Recovery and dependencies](iterations/05-recovery.md) | Harness internals: nested requests, interruption, reconstruction and replay | Crash/stop/context-loss matrix with one writer and no fabricated completion |
| [6. Public views](iterations/06-views.md) | Harness protocol then web internals, with root exposure if required | HTTP/browser tests show current coordinator, evidence, pending failures and historical runs |
| [7. Replacement and live acceptance](iterations/07-rollout.md) | Compose new path, retire old new-run behavior, audit and run Pi through production harness | Final audit plus bounded real Pi trial with no external coordinator edits or unsubmitted engineer handoffs |

During iterations 1–6, harness-owned test helpers construct a captured run
policy with `workflow: capability-coordination/1` and inject an internal
workflow factory into the real run service. Production construction does not
register that factory until iteration 7; public run/session commands cannot
select this version or supply an arbitrary policy. Fixtures use the actual
ledger, scheduler, session and gate code, not a duplicate service. Test both
that the injected workflow runs and that production rejects this version
before rollout. At iteration 7 the same factory becomes the new-run default;
the test-only policy injector remains outside production composition. No
user-selectable experimental mode is introduced. Historical schemas and read
projections remain where needed for inspection.

## Verification and acceptance

The [acceptance matrix](acceptance.md) defines concrete scenarios, negative
controls and responsible iterations. Automated tests use the scripted agent
through the real harness, real temporary project trees and real command
execution where the claim concerns filesystem state, scope or test behavior.
They never call a model. Pure reducer tests cover replay without pretending to
establish semantic adequacy.

Run focused affected-owner tests, `npm run type-check`, `npm run check:self`
and `git diff --check` per implementation iteration from `ramify-agent/`.
Once web changes land, include `npm run build:web`. Establish a clean baseline
and a final full audit using a Plan 16 request derived from
`audit/plan14-unified-evidence-packages.request.json`, with the actual baseline
revision, changed scope and final revision recorded. Preserve failures and
their attribution; baseline parity is reported separately from a clean pass.

The final Pi witness uses `openai-codex/gpt-6-sol:medium` for comparison with
the trials, records actual model and reasoning settings, and runs through the
production run entry point. It starts from the same toolkit baseline and a
captured bounded request for the no-statement, same-file one-edit and two-hop
cases. Include the alias and quoted-name counterexamples and batch/retained
parity checks from the second trial. The input explicitly says this bounded
task does not complete the original five-code feature. Report source changes,
structured results, checks, remaining findings, handback and resumed A work.

Live acceptance has two separately reported gates. **Delivery (CA27)** requires
a verified handback with A continuing. **Failure handling (CA35)** requires a
recorded unresolved defect or controlled budget stop without false acceptance;
it may use a separate bounded run. An incomplete attempt can satisfy only the
failure-handling gate. Iteration 7 and Plan 16 remain incomplete until both
gates, the final audit and browser witness pass. No runtime implementation is
certified merely because the scripted suite passes.

## Migration and related work

Under the confirmed replacement, new runs capture a new workflow/policy version
and use capability requests instead of new contract/fake obligations. Existing
logs remain readable with their original statuses. Do not reinterpret an old
fake-backed acceptance as a new real capability handback. Resuming an old
incomplete run with the new workflow is outside this version: report the
unsupported workflow explicitly and identify the original harness revision.

[Plan 14](../14-unified-evidence-packages/main-plan.md) supplies the implemented
catalog/package path this plan reuses. [Plan 15](../15-prompt-workbench/main-plan.md)
is proposed and is not an execution prerequisite; when its capture/replay
surface exists, add the new role through its shared invocation path. Do not
build a second replay runner for this plan.

Iteration 1 records the exact [model amendments](model-amendments.md) to
[harness principles](../../harness.principles.md), [glossary](../../glossary.md)
and current architecture. Iteration 7 applies them when enabling the complete
workflow, so intermediate documentation does not assert it is already active.
Preserve explicit fake naming, exposure correctness, scoped writes, real
consumer acceptance and the harness's durable-state authority. The two
hypothesis documents remain evidence of the explored alternatives.

This plan does not implement the trial's diagnostic feature, a general agent
chat service, simultaneous writers, automatic semantic capability matching,
session-selection heuristics, or the prompt workbench. No fork-versus-fresh
experiment is needed: the capability architect starts fresh.
