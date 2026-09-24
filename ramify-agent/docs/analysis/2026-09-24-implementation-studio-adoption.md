# What ramify-agent should take from Implementation Studio

**Date:** 2026-09-24. **Status:** analysis and recommendation, not an implementation plan.

The [CheckFinding architecture](../architecture/check-findings.md) develops
the proposed application boundaries and lifecycle for the recommendations
below, including their integration with existing harness responsibilities.

## Recommendation

This broad assessment is refined for review placement by
[Agent reviews and CheckFindings](2026-09-24-agent-reviews-and-checkfindings.md):
pilot parallel background code, scope and design reviews for each passing
iteration. The design review covers simplification and applicable principles.
Reconcile findings before the module work item completes. Consider
plan-coverage and work-item gap reviews later. Treat cumulative final review
as a later option.

Establish one durable finding model across checks and reviews, with the
[CheckFinding principles](../check-findings.principles.md) distinguishing
observed results, agent judgments and dispositions. Let the reviews overlap
the next iteration when there is one. At the work-item boundary, skip an
additional architect findings assessment if no open CheckFindings exist;
otherwise assess them together against the current tree. An observed test
failure needs a passing rerun of the same test to claim a fix;
a review judgment may instead be superseded by a reasoned later judgment.
This is a promising way to improve the quality and repairability of accepted
changes without serial review delays on every iteration. Pilot these focused
reviews on representative work items before making them a default.

Later, assess whether separate plan or work-item gap reviews catch omissions that the
work-item reconciliation misses, and add focused reruns for identifiable test
failures. Routine finding resolution should be automatic from the start;
Studio's broader waiver and follow-up-plan machinery, parallel worktree
scheduler and publication flow require later design work.

These are **impact judgments**, not measured quality gains. There is no
controlled comparison of Studio and ramify-agent outputs in the inspected
material. A pilot should measure actionable defects caught, escaped defects,
accepted scenario coverage, repair rounds, latency and token cost.

## What exists today

The installed cucumber-viz package is `0.7.0`; this analysis inspected its
`src/domain-sub-apps/implementation-studio/` source on 2026-09-24. Its Studio
has iteration code and scope review, primary and optional peer reviewers,
structured CheckFindings, final gap and risk review, automated finding decisions,
focused flaky-test confirmation, documentation maintenance, isolated parallel
iterations and merge/verification flows. The source paths in the table below
are relative to that package's `src/`. They are provenance, not ramify-agent
imports or governing architecture.

ramify-agent already has capability and module work items, local architects,
bounded engineer iterations, run sessions and transcripts, scoped checks,
repair, durable gate attempts, commit-bound audit evidence, and Gherkin
scenarios tied to entry capabilities. Plan 10 added a human review stop for the
initial scenario analysis, and requires all tracked scenarios to pass in full
mode at the final gate. The run is still distinct from merge or delivery.
See [Plan 3's execution status](../plans/03-autonomous-implementation-loop/main-plan.md#status-of-execution),
[Plan 7's commit audit](../plans/07-commit-audit-integration/main-plan.md),
[the acceptance-scenario architecture](../architecture/acceptance-scenarios.md)
and [the future registry](../future/README.md). Plan 3's old deferred list
predates Plans 7, 9 and 10, so it is not a current feature inventory.

The existing [cucumber-viz lessons](../cucumber-viz-lessons/README.md) cover
state recovery, checks, sessions and low-level code reuse. This document
assesses Studio's **output-improving workflow features** against the newer
ramify-agent model. The future registry already captures code review, findings,
session exploration and isolated delivery; none of those entries alone means
the feature is implemented.

## Checks outside the first review proposal

The parallel code, scope and design reviews leave these Studio checks or
review stages uncovered or only partly covered:

- **Plan, work-item and final gap reviews:** Ramify verifies its tracked
  scenarios, but an omitted requested behavior may never enter that set.
- **Cumulative scope and risk reviews:** iteration reviewers do not inspect
  the combined change across work items.
- **Non-executable constraints and sealed files:** principles review and
  ramify-agent's existing guards cover some concerns. A
  [separate sealed-edit analysis](2026-09-24-sealed-file-edit-hooks.md) proposes
  immediate hook feedback, justified saves and later CheckFinding assessment;
  constraint selection remains separate.
- **Focused flaky-test confirmation:** the CheckFinding principle is proposed;
  stable test identity and focused rerun execution are not implemented.
- **Documentation maintenance, optional peer code review, and project-specific
  static commands:** these are not supplied by the three review lanes.
- **Merge audit and delivery checks:** ramify-agent's implementation run ends at a
  verified tree, before a merge or publication stage.

The [detailed coverage table](2026-09-24-agent-reviews-and-checkfindings.md#studio-checks-still-uncovered-or-only-partly-covered)
distinguishes checks that ramify-agent's existing gate partly covers from reviews
and delivery stages that have no equivalent yet.

## Feature assessment

Impact means expected reduction in accepted defects or missing requirements;
effort means adaptation to ramify-agent, not the size of Studio's implementation.
Both are qualitative estimates.

| Studio feature and evidence | Benefit and current ramify-agent position | Adaptation | Recommendation |
| --- | --- | --- | --- |
| **Unified CheckFindings and remediation.** `core/workflow/check-findings/`, `core/runtime/finding-lifecycle/`, `core/runtime/finding-store/`. Studio normalizes several check producers, assigns issue identity, reconciles reruns, tracks remediation and exposes decisions. | Prevents the same issue being rediscovered as unrelated text on every attempt. ramify-agent has gate attempts and repair history, but no cross-attempt issue identity. | **Medium for the core; large for Studio's full policy and UI.** Map findings to work items, capability and scenario obligations, and the producer that can verify factual failures or reassess judgments. | **P1 foundation for review.** Implement identity, evidence, lifecycle, owner rerun for factual failures, judgment supersession and bounded automatic routing. Defer broad waivers and follow-up plan drafting. |
| **Iteration code review.** `core/runtime/check-execution/check-engine.ts`, `codeReviewHandler`; `core/workflow/audit-composition/plugins/code-review-plugin.ts`. Reviews an iteration diff with plan context; can run a peer reviewer. | Catches defects that tests and Ramify's structural check miss. ramify-agent records iterations, sessions and audited commits, but its future registry still lists automated review as Captured. | **Medium for the review; additional work for background execution.** Bind input to an immutable candidate and assignment, persist pending attempts, and reconcile late results at work-item completion. | **P1, pilot first.** Run a focused code review after a passing gate in parallel with scope and design reviews and the next iteration. Defer ordinary remediation to the work-item boundary. |
| **Scope review.** `check-engine.ts`, `scopeReviewHandler`; `core/workflow/audit-composition/plugins/scope-review-plugin.ts`. Compares the diff with an iteration plan and proposes revert or flag actions. | Prevents apparently passing changes from satisfying the wrong assignment or adding unrelated behavior. ramify-agent already has mechanical write scopes and `outsideScope`; semantic conformance is the new value. | **Medium.** Fork the local architect at its assignment point when available, and compare the candidate diff with the immutable assignment and plan evidence. Check whether inherited assumptions bias results. | **P1, separate review lane.** A read-only scope fork produces CheckFindings; no new revert agent initially. |
| **Design, simplification and principles review.** Reuse Studio's review idea, but select relevant Ramify and project guidance rather than copying another Studio subsystem. | Finds avoidable complexity, duplicate responsibilities and plausible conflicts with explicit principles that behavior checks may miss. | **Medium, plus session-lifecycle work.** Pilot a pi session oriented on the applicable principles and architecture guidance, then fork it for each candidate at those guidance revisions. Cite exact passages and require a bounded improvement. | **P1, separate review lane.** Material suggestions become CheckFindings; do not create findings for style preferences or speculative refactors. |
| **Final gap analysis.** `core/workflow-service/gap-analysis-services.ts`, `handleGapAnalysis`. Uses final check failures, acceptance criteria and classified findings to append fix iterations. | Prevents a run ending with a passing suite while a requirement remains unimplemented. ramify-agent already has required capability and scenario states and a final gate. | **Medium.** A Studio manifest edit does not fit capability-rooted work. A gap must name a required capability or scenario and become a new or reopened work item with a module owner. | **P2 for plan coverage and work-item gaps.** Review at boundaries that can still correct the work; defer a cumulative final review until reopening completed work is designed. |
| **Risk review and automatic adjudication.** `core/runtime/risk-review/risk-review-handler.ts`; `review/check-finding-adjudication-handler.ts`. Reviews the cumulative diff with a primary and peer model, then proposes decisions. | Finds cross-iteration hazards and can reduce manual triage. It also adds another fallible model decision layer. | **Medium for a read-only final review and bounded routine disposition; large for Studio's full decision vocabulary.** Must respect approved scenarios and material architecture decisions. | **P1 automatic routine disposition at work-item reconciliation; defer cumulative final review.** The harness validates outcomes and owns transitions; ask the user only at a strong authority conflict. |
| **Focused flaky-test confirmation.** `core/runtime/flaky-followup/flaky-confirmation-runner.ts`. Two focused passes distinguish an intermittent failure from a reproduced one, with evidence. | Avoids wasting engineer repair rounds on some transient failures. The current harness already distinguishes check failure from runner error and records attempts. | **Small** once a test runner reports a stable failing test identity; **medium** across multiple runners. | **P2 after review pilot.** Apply only to identifiable tests; keep the failing gate unaccepted and record the rerun conclusion. |
| **Diff and check evidence views.** `ui/components/ChecksTimeline.tsx`, `CheckDetailPanel.tsx`, `CheckFindingDetailsPanel.tsx`, `WorkflowTaskSessionPanel.tsx`. | Makes a bad result actionable. ramify-agent already has run, gate, session and transcript pages, with a Plan 11 map proposed. | **Small to medium.** Project existing records first; add review records when they exist. | **P2.** Put findings beside the candidate diff, scenario result, gate and repair session; avoid a separate Studio-style workflow dashboard. |
| **Documentation maintenance.** `core/runtime/review/docs-maintenance-handler.ts` runs during end review. | Reduces stale documentation in an otherwise correct implementation. | **Small for a final scoped task; medium** if docs become a required audited gate. | **P3.** Start with evidence-backed docs findings; let a normal work item repair them and rerun checks. |
| **Parallel isolated iterations, tiered merge and publication.** `core/runtime/merge/merge-orchestrator.ts`, `core/workflow-service/spawn-iterations.ts`, `core/runtime/publication/`. | Improves throughput and delivery, but integration conflicts can erase quality gains. ramify-agent's writer ownership and provider obligations currently serialize important boundaries. | **Large.** Requires dependency and conflict scheduling over capability/module work, revision-bound integration audits, branch ownership and recovery. | **Later.** Design as a separate delivery and concurrency project after sequential quality is measured. |
| **Sealed-file edits and constraint review.** `core/runtime/sealed-files/`; `CLAUDE.md`'s challenge and review rules. | Protects selected files and makes exceptions visible. ramify-agent already guards its materialized scenarios and scoped writes. | **Medium for a focused hook and justified-save path; large** if Studio's transaction and waiver system is copied. Selecting active non-executable constraints is a separate concern. | **Follow-up plan.** Use the [sealed-edit analysis](2026-09-24-sealed-file-edit-hooks.md): immediate feedback after mutations, a saved justification linked to a CheckFinding, final hash verification and work-item assessment. Preserve hard-denied files. |

## How to add review without changing the planning model

### The CheckFinding core

Studio's `check-finding.ts`, normalizers, classifier, reconciliation and store
show the useful structure: a normalized issue from a named producer, one owner
for remediation, durable status, rerun evidence and a decision history. Its
journal is authoritative and its JSON artifacts are projections. ramify-agent
already has one authoritative run log, so finding transitions belong in that
log and records are materialized through the existing ledger.

Studio added CheckFindings after its initial workflow design. ramify-agent can
design the finding path with that experience in hand. The target is the least
machinery that supports the [principles](../check-findings.principles.md), not
Studio's accumulated statuses, actions or separate store. Existing gate
attempts should retain check results; a finding is needed only for an issue
that requires continuity across attempts or a disposition.

Keep three identities distinct. A `GateAttempt` says which checks ran on which
commit and what they concluded. A `ReviewAttempt` says what one reviewer
examined and submitted about one candidate tree. A `Finding` is the issue that
may persist across several attempts. A command that was not verified is an
attempt outcome, not evidence that a code defect exists or has disappeared.

The first candidate sources should be structured Ramify findings, tracked
scenario failures from Cucumber messages, guarded write violations and
code, scope and design review submissions. Their raw outcomes stay with their attempts;
create a durable finding when an issue needs continuity or a disposition. A
failing command with no stable test identity stays an attempt failure with its
log; an infrastructure or unavailable check stays
`not-verified`, never a source defect invented from text. Later test-runner
adapters can add stable test identities.

Start with a stable finding ID, an issue key when the producer supplies one,
and references to the attempt, source tree, evidence and responsible work.
Record dispositions with their rationale and verification references in the
existing run log; derive the current view from those records. Add fields only
when a decision or recovery path needs them. Preserve separate issues when
identities are uncertain. Studio's classifier can treat two cross-producer
findings touching the same file as duplicates; file overlap alone is too weak
to merge them reliably.

Avoid committing to Studio's status vocabulary. A repair claim, a later
judgment that supersedes an earlier one, and an owner-check rerun are different
events. A failed test needs the same test to pass on a comparable rerun before
a fix can be claimed. An inconclusive or omitted check cannot verify a factual
fix. A review judgment can be superseded by a fresh, reasoned judgment without
a source change. The run-log events must suffice to recover the current
disposition after interruption.

The harness groups duplicate reports only when a producer identity or an
explicit validated relation supports it, records one responsible owner, and
keeps the other reports as related evidence. At work-item reconciliation the
local architect chooses correction assignments for ordinary engineers;
ownership, contract or scope questions stay with the appropriate architect.
Required scenarios and structural gate failures
remain hard obligations; a finding disposition cannot turn their unverified
gate into a pass. User-approved exceptions, if later supported, need authority,
scope, reason and expiry or revalidation recorded separately from check truth.

The [combined architecture](../architecture/check-findings.md#ownership-and-modular-boundaries)
recommends a small pure `harness/findings` child for the identified common
identity and disposition rules, while using the harness's existing ledger and
keeping review timing, authority and repair scheduling in the harness. The
`agent` child drives review sessions, `evidence` obtains project facts, `audit`
verifies commits, and `web` renders harness projections. Neither a checker nor
the UI owns the run's decisions.

1. **Launch background reviews of an exact iteration candidate.** After its
   gate passes, capture its audited commit and accepted boundary from when
   the assignment began, with the assignment, plan references, relevant
   decisions and gate coverage. Read-only code, scope and design reviewers
   examine that immutable input while the next iteration proceeds. A scope
   reviewer may fork the local architect at its assignment point; a design
   reviewer may fork a pi session oriented on relevant principles and
   architecture guidance. Both need a fresh-context fallback.
2. **Validate the result.** Require bounded concerns with evidence and a
   consequence, or an explicit no-concerns judgment. An invalid response,
   absent reviewer or incomplete diff is `not-verified`, not a clean review.
   Promote a concern to a durable finding only when it needs continuity or a
   disposition.
3. **Reconcile at work-item completion only when needed.** Settle the item's
   outstanding reviews with a bounded wait, marking unfinished attempts not
   verified and stopping them. If there are no open CheckFindings, run the
   ordinary work-item gate without another architect findings assessment.
   Otherwise the local architect reassesses the findings against the current
   audited tree, supersedes an unfounded or obsolete judgment with reasons,
   assigns correction work, or explicitly defers a nonblocking improvement. A
   correction reruns its gate and is reviewed against its own commit; a review
   decision cannot waive a required scenario or change a gate verdict.
4. **Check gaps where correction is local.** Later, consider plan coverage
   before the analysis is accepted and an independent work-item gap review
   before that item closes. Defer the cumulative final review until it has a
   bounded way to reopen completed work.

This maps Studio's *review behavior* to ramify-agent's existing responsibilities:
the harness owns records and transitions, reviewers supply evidence and
recommendations, local architects choose module work, and the audit verifies
the eventual commit. It avoids making Studio iteration files or its CheckFinding
store an authority in ramify-agent.

### Specific Studio behavior to correct while adapting it

Studio's `parseReviewFindings` and `parseScopeReviewFindings` in
`check-engine.ts` return an empty list for malformed JSON. `codeReviewHandler`
then treats an empty list as a pass. `scopeReviewHandler` also returns a pass
when `agentChat` is absent. Those are source-observed behaviors, not a claim
about how often they happen. ramify-agent's review path must distinguish
**clean**, **findings** and **not verified**; it must test invalid JSON, missing
inputs, peer failure, empty diff and a tree changed after review. The optional
peer's absence should be recorded as coverage, not silently presented as a
two-reviewer result.

## Why the larger Studio mechanisms should wait

Studio's manifest is a sequence of authored iteration files. ramify-agent's
work originates in required capabilities, module ownership, local architect
assignments, provider obligations and frozen scenarios. Its next repair may
belong to a different module or reopen a consumer after a provider change.
Consequently, copying Studio's gap-analysis manifest mutation, check-finding
actions, or parallel iteration scheduler would create a second source of work
and ambiguous authority. The useful abstraction is a revision-bound finding
that points to the obligation it threatens, followed by a normal assignment
and an audited correction.

Studio's complete finding system also carries waivers, user decisions,
constraint challenges and follow-up plan drafting. Those require separate
authority and recovery rules. A small automatic disposition path belongs with
the core finding lifecycle, while the richer decision actions can be added
when actual unresolved findings show which ones are needed.

## Suggested delivery sequence and evidence

| Step | Deliverable | Acceptance evidence |
| --- | --- | --- |
| **1. Finding foundation** | Reuse gate attempts for raw results. Add run-log-owned identity and disposition only for issues that need continuity; distinguish factual verification from judgment supersession and make routine dispositions automatically. | The same issue persists across attempts, a missing rerun cannot verify a factual fix, a reasoned second judgment may supersede the first, unrelated issues in one file remain separate, and restart reproduces the same states. |
| **2. Review pilot** | Launch code, scope and design reviewers after each passing iteration gate against an immutable candidate; overlap them with the next iteration. Pilot a local-architect fork for scope and a guidance-oriented pi fork for design. Assess open findings before work-item completion, skipping the extra architect turn when there are none. | Planted correctness, scope, simplification and cited-principle concerns are found; clean work skips findings assessment; malformed output records a coverage gap; lost fork points fall back; a late review and restart recover. Measure each lane's useful findings, overlap, tail wait, reviewer tokens, orientation savings and false positives. |
| **3. Plan and work-item gaps** | Plan-coverage review before analysis acceptance and a work-item implementation gap review before item completion, introduced separately after the iteration pilot. | An omitted requested behavior is caught before work is scheduled, or an unmet item requirement returns to its local architect for a correction; a reasoned reassessment can supersede a mistaken concern. |
| **4. Focused failure triage and views** | Stable failing-test identity, two focused reruns for eligible failures, findings shown with gates and transcripts. | A repeated failure still blocks; two focused passes are recorded as suspected flakiness, with no accepted gate inferred; an ineligible runner reports unavailable. |
| **5. Concurrency and delivery** | Separate design for isolated parallel work and merge, using the measured sequential quality path as its baseline. | Independent work integrates with revision-bound checks; conflicts and interrupted merges preserve ownership and do not claim completion. |

Before broad rollout, compare several representative plans with and without
the reviewer using the same frozen plan and acceptance scenarios. Report defect
counts with denominators, review coverage, false positives, repair iterations,
elapsed time and model tokens. The existing Plan 10 live trial demonstrates a
real scenario path, but it does not establish that any proposed Studio-derived
review feature improves quality.

## Source limits

This was a source and document analysis, not an end-to-end Studio or
ramify-agent run. The installed Studio version may differ from future releases.
The inspected source establishes feature wiring and some failure semantics;
it does not establish production frequency or comparative output quality.
Current ramify-agent status comes from the cited plans and the inspected
`subs/harness/src/` contracts; unmerged proposals in `docs/analysis/` and
`docs/plans/` are treated as proposals.
