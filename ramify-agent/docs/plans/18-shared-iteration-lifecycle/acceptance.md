# Plan 18 acceptance

[Main plan](main-plan.md) · [Provider contract](provider-contract.md) ·
[Iterations](iterations/README.md)

SI01–SI15 retain the original Plan 18 obligations. AE01–AE18 retain the absorbed
Plan 19 obligations, with failure routing clarified by execution stage.
SI16–SI18 explicitly verify generated API-view preparation. Iteration numbers
below refer only to the combined schedule.

Tests use independent expected outcomes and count actual process executions.
Scripted agents prove orchestration; real provider tests prove evidence fidelity;
a live agent repair proves delivery is useful. Neither substitutes for the other.
Use the same shared service and fixture for both coordinator types. Normalize
only expected task/iteration identities and role-specific context in traces.
Assert correct behavior independently as well as comparing traces.

## Shared lifecycle and discovery

| Case | Trigger and required observable result | Iterations |
| --- | --- | --- |
| SI01 | Equivalent assignments from either architect receive the same selected requirement text, available API views, scenario briefing, equipment and scope enforcement. A missing view carries the same explicit failure/limitation. | 1, 3 |
| SI02 | Engineer proposes completion with valid evidence. Both paths invoke the same kind-derived gate, record the actual candidate commit/checks, close accepted only on pass and schedule the same reviews. | 3 |
| SI03 | A check fails, then a scoped repair succeeds. Both paths preserve the failed candidate, use the same retry/session/counter rules and return equivalent results. A failed review reaches ordinary finding reconciliation and blocks completion until resolved on current source. | 3–4 |
| SI04 | Engineer explicitly returns partial, or ends without a result. Preserve changes and follow ordinary handling for that cause, including applicable reconstruction and bounds; return the ordinary outcome/failure digest at the same boundary as ordinary work. Do not invent an accepted commit or a capability-only retry or run termination. Unsettled writers still block both paths. | 1, 3–4 |
| SI05 | A suspends with tracked, staged, untracked and deleted changes. B changes a required field and fails project type checking; A/D/P repairs are separately scoped. Inherited edits are preserved and attributed once, failures remain recorded, and a later passing combined candidate does not retrospectively accept partial iterations or complete A. | 1, 3–4 |
| SI06 | A case's independent expected result is wrong. The agent explains the correction with evidence and test association; source/configuration identity is attached by the harness. Changed source or required cases cannot use stale acceptance. Configuration comparison and audit reuse follow the same policy as ordinary work. | 3, 5 |
| SI07 | An engineer binds and declares a task-relevant scenario. The common gate actually selects it and records its result. Pending parent-goal scenarios remain pending; zero selected scenarios never certify them. | 3 |
| SI08 | B requests C. The child runs depth-first through the same iteration executor, then resumes the same B assignment. Final X handback resumes original A once; unrelated frontier work does not start while a task waits. | 4 |
| SI09 | Repair, budget return, lost session and restart do not reset assignment identity or counters. X's assignments across B/A/D/P consume X's sequence/limits, not B's separate entry budget. | 1, 3–4 |
| SI10 | Historical capability runs retain their recorded verdicts and remain readable. An incompatible resume starts no writer or gate. New runs expose only the common lifecycle. | 1, 4 |
| SI11 | Served task/iteration views show partial, failed-check, accepted-iteration, review-failed and handed-back states from producer records. A commit or successful engineer submission alone never renders task completion. | 4–6 |
| SI12 | Both architects inspect Git history and all current source-change categories with the same read-only tools. No tool operation changes working files, the real index or refs; untracked files are discoverable and readable. | 5 |
| SI13 | Several assignments and a reconstructed architect receive relevant current results and artifact paths. No `read_capability_evidence` is offered or required; old assignment/event bodies are not repeatedly injected, and agents need not copy candidate/configuration hashes. | 5 |
| SI14 | Removing the history tool leaves current blockers, failed check details and reviewer findings discoverable without replaying the ledger. A fresh session can identify open work and inspect the precise result artifact. | 5 |
| SI15 | A real Pi run completes ordinary provider, compatibility and consumer iterations, current task verification, explicit handback and original A continuation through production code. A separate controlled stop preserves unfinished work without false completion. | 6 |
| SI16 | Start with no generated views for Analysis and Model in a real fixture; only CLI has been prepared. Dispatch ordinary and capability engineers to each owner through production assignment preparation. Before the first model request, the actual ordinary/testing API views exist for source areas present, and the prompt names their paths and revision/coverage. Searches for a known received symbol succeed in the correct area. Architect-view materialized status alone cannot satisfy this case. | 3, 6 |
| SI17 | A provider changes its public API between assignments. Fresh, continued and reconstructed engineer invocations materialize/synchronize the common scope-selected views before briefing. Each reads current available symbols and qualifications; ordinary and testing catalogs remain separate. Include selected-child and multi-module scopes supported by the ordinary builder. | 3, 5 |
| SI18 | Materialization fails, has partial coverage, returns no view for a source area, or cannot refresh an existing stale view. Both paths preserve the actual unavailable/coverage reason and follow the same preparation policy; neither labels startup architect metadata or stale files as a current successful API view, infers API absence, or writes a synthetic catalog. | 3, 5 |

## Producer evidence and repair

| Case | Trigger and required observable result | Iterations |
| --- | --- | --- |
| AE01 | Real supported test execution fails several tests in different modules. All identities and diagnostics supplied by ramify-audit survive the adapter; counts equal the provider's values without harness recalculation. | 2–3 |
| AE02 | A full gate fails. Exactly the required test commands execute, once each; no scope-probe rerun occurs and no inferred in/out-of-assignment cause is generated. | 2–3 |
| AE03 | A partial link has run-local pass but carried failures or indeterminate composition. Acceptance is blocked using the provider composition and reason; inherited and newly executed evidence remain distinguishable. | 2–4 |
| AE04 | Provider returns noExecution, an unselected check or legitimate reused evidence. No command duration, pass or execution is fabricated. Reuse follows the captured producer policy and applicable source/report identity; recorded configuration adds no capability-only cache key. | 2–4 |
| AE05 | Test throws a huge assertion diff, another test fails afterward, and a suite fails to load. Every reported failure remains discoverable with full diagnostics; excerpts cannot displace another failure. | 2, 5 |
| AE06 | Reporter is missing, malformed, truncated or interrupted. Preserve all available data and qualifications; absent failures/counts are unknown, never zero or a passing report. | 2, 5 |
| AE07 | An ordinary or capability-assigned engineer's iteration gate fails. The same engineer receives producer evidence and repairs; no compulsory architect triage. An explicit out-of-scope need reaches its architect through the existing protocol. | 3 |
| AE08 | A root test fails because of an Analysis defect; another root assertion is stale. Agent diagnosis determines repairs. File location/count does not choose an owner or automatically widen write scope. | 3, 6 |
| AE09 | A task-completion gate fails under each coordinator type. Evidence returns to the active architect, preserving suspended consumer and handback requirements for a capability task. This task gate never replaces per-iteration gates or sends an ordinary engineer repair directly to a capability architect. | 3–4, 6 |
| AE10 | Dirty focused test, readiness and standalone session execute through the accepted provider seam. Actual source is identified without a diagnostic-induced commit or false HEAD certification; focused checks remain focused. | 2–3, 6 |
| AE11 | Real Cucumber quick/full checks include pending, failed, undefined and passing scenarios. Producer statuses/details survive; harness associations preserve frozen identity and required lifecycle without recounting/reinterpreting runner truth. | 2–3, 5 |
| AE12 | Ramify/type-check command reports several diagnostics. Preserve available structured detail and full output. Agent decides remedy; no output keyword or error location automatically assigns repair ownership. | 2–3, 5 |
| AE13 | A suite waits for the machine lock, a focused diagnostic runs without it, and cancellation occurs while waiting/running. Preserve Plan 17 semantics, producer timing, process settlement and nested environment behavior without double locking. | 2–3, 6 |
| AE14 | Nested project audit, setup failure, exact exit/refusal, path remapping and temporary worktree cleanup. Source and artifact identities remain truthful after cleanup; no provider information is replaced by a harness guess. | 2, 4, 6 |
| AE15 | Crash after provider completion but before harness acknowledgement. Recover the exact result idempotently, without duplicate execution, duplicate reports or a mutable-latest-ref substitution. | 2, 4, 6 |
| AE16 | Read historical attempt with scope-attribution fields and start a new run. Historical evidence remains unchanged; new attempts use only the new mechanism. An incompatible legacy resume is explicit. | 1, 4–5 |
| AE17 | UI and agent inspect the same report. Counts/verdicts/diagnostics agree with the provider; complete artifacts remain accessible and unavailable details are visible. No semantic failure grouping occurs in a renderer. | 5–6 |
| AE18 | Real production repair witness has multiple failures, a focused correction and a new required audit. Fixing agent receives every relevant failure, performs repairs and submits its result; passing applicable audit and remaining harness obligations permit completion. No scope probe, new tally or external coordinator source patch. | 6 |

## Completion evidence

Record source commits and package pin, real provider conformance cases,
focused harness regressions, all required project audits and live witness
report/attempt/invocation identities. Report pass, fail, not run and blocked
separately. Preserve failures and candidate trees for investigation.

SI15 and AE18 may share a production run if it exercises both complete
capability delivery and the specified multi-failure repair. A separate bounded
failure/stop witness must preserve unfinished work. An empty scenario selection
cannot pass a required scenario. Scripted/provider fixture results do not close
the live cases; a plan check does not establish implementation or acceptance.

Retain all thirty-six case IDs. The iteration result records which cases
actually passed on which revision; listing a case in an iteration is not
evidence that it ran.
