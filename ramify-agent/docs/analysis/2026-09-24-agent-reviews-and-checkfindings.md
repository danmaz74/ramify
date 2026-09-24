# Agent reviews and CheckFindings in the implementation loop

**Date:** 2026-09-24. **Status:** design analysis, not an implementation plan.

The [CheckFinding architecture](../architecture/check-findings.md) now defines
the proposed module boundaries, records, review lifecycle and reconciliation
contracts for these use cases. This analysis retains the review alternatives
and evidence that motivated them.

## Recommendation

Pilot three focused, read-only reviews after each passing iteration gate:
**code correctness**, **semantic scope**, and **design quality**, which includes
possible simplifications, refactoring targets and applicable principles. Run
the reviews concurrently against the same immutable candidate, overlapping
with the next iteration when there is one. They share one CheckFinding model,
but each records its own question, evidence and coverage. Do not wait for an
ordinary review result before assigning the next iteration.

At the **module work-item** completion proposal, settle outstanding reviews.
If they produced no open CheckFindings, skip any additional local-architect
findings assessment and run the ordinary work-item gate. If there are findings,
the local architect assesses them together against the current tree, repairs,
supersedes or explicitly defers them within its authority, and then requests
completion. This avoids an extra agent turn for the expected clean case and
avoids premature fixes that later iterations might replace. It still costs
reviewer tokens and background capacity; the last review or a backlog can
delay completion. Treat all reviews as judgments under the
[CheckFinding principles](../check-findings.principles.md), while the existing
gate retains authority over test, Ramify, type and scenario results.

A plan-coverage review before accepting the initial analysis may catch omitted
work before it is scheduled. An independent work-item gap review and a
cumulative final review are later options; first measure whether the three
iteration reviews and work-item reconciliation already catch material gaps.

## Method and current boundary

The architect view was refreshed for `ramify-agent/` on 2026-09-24 at revision
`rev/1:4478f4c8-fbd7-44b1-86eb-521172b4c7d0:1`. Its nine-module production
dependency and test-reference views were measured. This analysis read its
`_meta.json`, root map, and the `harness`, `agent`, `audit`, `ledger` and `web`
module records. The module-architect guidance used was `discovery.md`,
`placement.md`, `cognitive-decomposition.md` and `report.md`. Source files read:
`run/{service,gates,mutations}.ts`,
`checks/{accepted,checkpoint,diagnostics,gate,records,verify}.ts`,
`work/{assignment,engineer,engineer-equipment,iterations,scope,session,frontier}.ts`,
`analysis/submission.ts`, `interfaces/protocol/runs.ts`, the agent port's
`interfaces/port.ts`, and pi's `pi-agent.ts` and adapter README. Studio
comparison read the installed `0.7.0`
`iteration-scope-review.md` prompt and `check-engine.ts` handler.

Today the harness has no agent code, semantic scope or gap reviewer. Its
[roles](../../subs/harness/src/interfaces/protocol/runs.ts) are initial
architect, global fork, local architect, engineer and contract engineer.
[Checkpoint policy](../../subs/harness/src/checks/checkpoint.ts) runs tests,
type checks, a complete Ramify check and, where configured, scenarios. The
[gate attempt](../../subs/harness/src/checks/records.ts) records command
outcomes, scenario results, guarded changes and harness rules. The
[gate policy](../../subs/harness/src/checks/gate.ts) already chooses repair,
infrastructure retry or return to the local architect. `outsideScope` is an
observation of changed paths, not an agent assessment of whether a change
serves the assignment. The [settled mutation snapshot](../../subs/harness/src/run/mutations.ts)
reports paths outside the captured write scope without blocking them; shell
commands can make such changes. The optional `approve-analysis` command is a
person's approval of the initial analysis, not an agent review.

The engineer's `completion-proposed.findings` and `IterationResult.findings`
are free-text handoffs. They can inform a reviewer, but they have no issue
identity or disposition and should not be reinterpreted as durable
CheckFindings. The [accepted commit query](../../subs/harness/src/checks/accepted.ts)
advances on a passing committing gate; a review layer must keep “the checks
passed” distinct from “the review concern was resolved.”

## Candidate reviews

| Review | Boundary and input | Distinct value | Response to an actionable judgment | Priority |
| --- | --- | --- | --- | --- |
| **Iteration code correctness** | After the engineer's gate passes, review its immutable audited commit against the prior accepted boundary, assignment, relevant requirements, tests and gate coverage. [The iteration may close](../../subs/harness/src/run/service.ts) while review runs. | Finds plausible behavior defects, missing cases and weak tests that the required checks do not establish. | Produce a CheckFinding only for an actionable concern; defer ordinary repair to work-item reconciliation. | **First pilot.** A focused background session. |
| **Iteration semantic scope** | In parallel, compare the same candidate diff with the immutable assignment, referenced plan passages and necessary adjacent work. | Finds unrelated or harmful changes even when paths are authorized. Mechanical write boundaries remain deterministic gate policy. | Produce a CheckFinding with the assignment clause and diff evidence; the local architect may later accept or supersede the scope judgment. | **First pilot.** A separate focused background session. |
| **Iteration design and principles** | In parallel, inspect changed design against applicable principles at captured revisions, module guidance and source evidence. | Finds material simplifications, duplication, misplaced responsibility and plausible conflicts with explicit principles. | Produce a CheckFinding with a concrete improvement or cited principle conflict and a bounded remedy; the local architect decides whether to repair, supersede or defer. | **First pilot.** One design session covering simplification and principles. |
| **Plan coverage gap** | Before [initial analysis acceptance](../../subs/harness/src/run/service.ts), compare the captured plan with proposed entry capabilities, plan and generated scenarios, and their requirement and acceptance references. | Catches a requested behavior that was omitted before work was scheduled. Existing validation checks reference form and scenario structure, not semantic completeness. | Return a concrete gap to the initial architect for a bounded revision before analysis is committed. A judgment may be superseded with rationale; a direct conflict with an explicit requirement goes to the established authority boundary. | **Next.** Requires staging an analysis before `analysis-accepted`; no current revision path exists after that event. |
| **Work-item implementation gap** | Before the [work-item gate](../../subs/harness/src/run/service.ts), compare the item's requirements, accepted outline, scenarios, provider obligations, iteration results and audited source. | Asks whether the behavior was actually delivered, beyond the existing mechanical checks for open obligations and scenario states. | The same local architect assigns a correction iteration before requesting completion; a reasoned reassessment can supersede an unfounded concern. | **Later option.** First test whether reconciliation of iteration findings provides enough gap coverage. |
| **Final cumulative gap or risk review** | Between the final gate and `job-completed`, over the full run diff and plan. | Could catch cross-item omissions or emergent integration hazards. | Would need a defined path to reopen completed work items or create a correction item, then repeat the final gate. | **Defer.** The current final path ends the run on a passing gate and has no correction loop. |

These are proposed review points, not claims that the current agent port or
workflow implements them. Each review should be read-only, with a bounded
submission naming the candidate revision, the question examined, evidence,
coverage limits and concrete concerns. A malformed or unavailable review is
“not verified”; policy may continue best effort with that gap recorded, but
cannot claim a clean review.

## Studio checks still uncovered or only partly covered

The installed Studio `0.7.0` `nodejs-react` profile assembles regression and
static commands with scenario coverage, code and scope review, sealed-file
verification and non-executable constraint review. Code review is disabled by
default unless its pipeline option enables it; scenario coverage applies
when the manifest names design features. Studio also has final gap and risk
reviews, documentation maintenance and focused flaky-test confirmation
outside that basic check list. The three agent reviews proposed here cover
only code, iteration scope and design judgments. They do not imply that these
other checks have been implemented in ramify-agent.

| Studio check or review | Coverage under this proposal | Remaining difference |
| --- | --- | --- |
| Regression and static commands | **Existing mechanical gate, partly equivalent.** ramify-agent runs selected or all project tests, type checks, a complete `ramify check` and configured scenarios at its checkpoints. | Studio's adapter-specific command list can also include lockfile, lint, dependency, runtime-import and export checks. Those are not automatically in ramify-agent's gate; the test selection and final full run also differ by project configuration. |
| Iteration code review | **Proposed.** The code lane examines each audited iteration candidate. | Studio can add an optional peer code reviewer; this proposal has one code judgment per candidate. |
| Iteration scope review | **Proposed.** A local-architect fork compares each candidate with its assignment. | Studio also runs scope review over the final or parallel-group diff. No cumulative scope review is proposed yet. |
| Scenario coverage | **Partly covered mechanically.** ramify-agent tracks declared scenarios, requires work-item scenario completion and runs all tracked scenarios at the final gate. | Studio's final check maps every manifest design scenario to an implementation. ramify-agent does not yet independently detect requested behavior omitted from the initial scenario set or from all work items; plan and work-item gap reviews remain candidates. |
| Active non-executable constraints | **Partly addressed by design review.** It examines relevant principles and architecture guidance. | Studio selects active constraints, carries planning selections forward, verifies their content hashes and asks an agent about contradictions. The proposal has no equivalent registry or complete constraint-selection check. |
| Sealed files | **Separate follow-up analysis.** ramify-agent protects its scenario artifacts and enforces some scoped writes. | The proposed [immediate edit hook and justified-save path](2026-09-24-sealed-file-edit-hooks.md) would detect conditional sealed edits during engineer work, create a CheckFinding for each saved exception and retain a final hash check. It needs a follow-up implementation plan; hard-denied files stay distinct. |
| Final gap and cumulative risk reviews | **Not included.** Work-item reconciliation only assesses findings already produced by iteration reviews. | Cross-item omissions, emergent interactions and full-plan risks can escape. Adding a work-item or final review requires a correction path for already completed work. |
| Documentation maintenance | **Not included.** A design reviewer might notice a specific stale document. | There is no systematic end review that checks whether implementation changes require documentation updates. |
| Focused flaky-test confirmation | **Principle only.** The CheckFinding principles require same-test rerun evidence and explicit flaky classification. | The current harness has no Studio-style focused rerun runner or stable failing-test identity across all test runners. This needs its own deterministic failure-triage work, not another agent review lane. |
| Merge audit and delivery | **Outside the current run boundary.** ramify-agent's final gate verifies its accepted tree. | Studio has merge-audit and publication flows; ramify-agent has no equivalent delivery stage yet. |

The most consequential uncovered judgment is **whether the whole requested
behavior was planned and delivered**. Consider plan coverage before analysis
acceptance and a work-item gap review after the iteration pilot. Cumulative
scope and risk review come next if cross-item escapes justify their correction
path. Focused flaky-test confirmation is independently important because it
addresses factual failure evidence. Project-specific lint should be selected
by the project's check policy. For sealed files, the
[separate analysis](2026-09-24-sealed-file-edit-hooks.md) proposes explicit
seal selection, immediate feedback and justified saves within ramify-agent,
under the project's authority.

## Scope review without Studio iteration briefs

Studio's iteration scope reviewer reads an iteration plan from its manifest
and compares it with a diff. Its installed `0.7.0` template
(`prompts/implementation-studio/iteration-scope-review.md`) looks for test
weakening, feature removal and unrelated changes, while allowing justified
adjacent edits. Its handler lives in
`core/runtime/check-execution/check-engine.ts`. The useful question transfers;
the plan-file lookup, `revert`/`partial-revert`/`flag` verdicts and automatic
human flagging do not fit this run model.

ramify-agent's equivalent source of intent is the immutable
[iteration assignment](../../subs/harness/src/work/iterations.ts), produced
by the local architect. It names the goal, approach, outline stage,
requirement references, completion evidence, scenarios expected to bind,
external capabilities, scope rationale and any exceptional guarded-file
authorization. The [engineer briefing](../../subs/harness/src/work/engineer.ts)
renders that assignment with current API views and repair evidence. A scope
review should read the structured assignment and its referenced outline and
plan passages directly. It needs no separately authored iteration brief.

The review compares the assignment's **intended change** with the change from
the accepted source boundary at that iteration's first invocation to its
audited candidate commit. The first invocation records its `base`; the review
attempt should record that base, the assignment reference, candidate commit
and gate ID explicitly, so a later repair cannot silently reuse the old
judgment. The assignment's captured scope states which paths were authorized,
and guarded edit/write tools enforce that boundary. Shell writes outside it
are currently observations. A deterministic candidate-diff check could make
path escapes a gate failure if that policy is adopted; an agent's opinion
should not decide whether a path is authorized. Semantic scope instead asks
whether each behavior change serves the assigned goal, is a necessary adjacent
change, or affects unrelated behavior within authorized paths.

A focused question for the scope reviewer is:

> Which changed behavior or test obligation cannot be justified by this
> assignment, its referenced requirement, or a necessary supporting change?
> Name the diff evidence, the affected behavior and the consequence. Distinguish
> an unrelated change from an uncertain or incomplete assignment.

The scope review has its own coverage statement and evidence. It shares the
candidate snapshot with the code and design reviewers, but answers this
question independently so a code-quality concern does not substitute for a
judgment about the assignment's intended boundary.

Pay particular attention to weakened or deleted tests, removed behavior,
changed defaults or error handling outside the goal, and broad configuration
changes. A change to a shared type, import, test fixture or nearby assertion
may be necessary to complete the assignment even if the architect did not
list that file. The reviewer must not turn the assignment into an exhaustive
file checklist or repeat a deterministic path verdict. If the assignment
lacks enough intent to decide, record the coverage limit and return a focused
question to the local architect; do not invent scope drift.

An actionable scope judgment becomes a CheckFinding only when it needs a
repair or reassessment across attempts. It points to the assignment clause,
diff hunk and exact candidate. The engineer can remove or justify the change
within its authority; the local architect can supersede the judgment with a
reasoned interpretation or assign a separate iteration when the extra change
is useful but outside the original goal. Restoring an entire file is never an
automatic consequence of the reviewer suggesting it, because the same file
may contain necessary work. Routine resolutions remain quiet; material choices
are reported with the fix.

## Design, simplification and principles review

The third review asks whether the new code is needlessly complex or duplicates
an existing responsibility, and whether its design plausibly conflicts with
an applicable principle. Combining these in one focused design review makes
sense initially: the same architectural evidence often explains both a
refactoring opportunity and a principle concern. It is separate from the
scope review because a change can serve the assignment while still choosing
an unnecessarily costly design. It is separate from code correctness because
passing behavior may still warrant a simpler implementation.

Principles are selected for the work, not loaded as one universal bundle. The
reviewer starts from the project's guidance entry point and the affected
module's onboarding, then reads the documents governing the changed behavior
at captured revisions. In this repository, for example, harness work may
invoke the [harness principles](../harness.principles.md), ownership work the
[module architect principles](../../../docs/agents/module-architect.principles.md),
measurement work the [measurement principles](../metrics/measurement-principles.md),
and model changes the relevant
[model principles](../../../docs/model/cross-module-importability.principles.md).
The review attempt records which documents and passages were actually read,
their revisions and any applicability or access limit. An unexamined document
must not be represented as covered. If guidance changes before reconciliation,
the local architect assesses the finding against the current authority.

A principles finding cites the exact passage and the source behavior that may
conflict with it. The passage is an authoritative constraint; the assertion
that this change violates it is still a reviewer judgment that can be
reasonably challenged. A direct conflict can often be fixed in code without
asking anyone. Changing or overriding an explicit principle, a protected
contract, or an approved acceptance obligation follows its owner and approval
rules. The [harness principles](../harness.principles.md#need-to-know-does-not-forbid-asking)
also reserve structural changes for a person's approval; a review suggestion
alone cannot authorize a module restructure.

For simplification, require a concrete current cost and a bounded improvement:
the redundant logic, needless coupling, avoidable state, or confusing
abstraction; what would change; why behavior and obligations remain protected;
and why the benefit justifies the edit. A style preference or speculative
future-proofing is a reviewer note, not a durable CheckFinding. Do not turn
every possible refactor into required work. The local architect may reject an
unfounded suggestion, fix a worthwhile local issue now, or explicitly defer a
larger improvement with its owner and reason. A deferred suggestion is not a
verified fix, and a proposed broad structural refactor must respect the
existing approval boundary.

## Reusing reviewer context

**Design review:** A retained pi orientation session could read the applicable
principles and architecture guidance once, then supply a pinned fork point for
each design review using that guidance revision. Start the orientation while
the work item's engineering begins, so its own reading need not extend the
completion tail. Each fork receives the new candidate diff and any local
architecture evidence, and must cite the actual governing passages rather
than trusting a parent's summary. Use a new orientation point if a governing
document changes. Different modules may need different document sets; a
single project-wide session loaded with every principle would defeat bounded
context. A one-iteration item may not amortize the orientation cost.

The [agent port](../../subs/harness/subs/agent/src/interfaces/port.ts) supports
forking from a pinned `SessionRef`, and the [pi adapter](../../subs/harness/subs/agent/subs/pi/src/pi-agent.ts)
branches that history into a separate session file. Its system prompt is set
for each start. This makes the warm-context design feasible at the port level,
but neither pi nor the port promises that inherited context has zero input
cost or will be faster. It may save repeated reading and benefit from provider
cache behavior; it also spends tokens to create the parent and carries that
history into every fork. Measure total tokens, cache usage, elapsed time and
review quality against a fresh reviewer with a compact, revision-bound
document bundle before making the warm session mandatory. A lost fork point
must fall back to that bundle, with actual session mode recorded.

**Scope review:** Fork the local architect's retained context at the exact
point where it assigned the iteration. That fork inherits the intent,
constraints and tradeoffs behind the assignment while the parent continues
planning. Give it a read-only scope-review prompt and the immutable assignment
and candidate diff; it produces only review judgments and cannot revise the
parent's decision. The [local architect loop](../../subs/harness/src/run/service.ts)
already keeps its session across iterations, and the port's fork ref names a
point rather than a moving session head. The harness would need to capture
that point with each assignment. Forking from the latest head later could
include subsequent plans or outcomes and bias the review of an older change.

The shared architect context is both the advantage and the risk. It may reduce
reorientation and clarify why an adjacent change was necessary, but it may
also inherit the architect's blind spots and rationalize its own assignment.
Ask the fork to challenge the diff against the recorded assignment and plan,
not to approve its parent. Keep code and design reviewers independent of this
fork. Compare scope findings from architect forks with fresh scope reviewers
in the pilot. If the fork degrades to fresh or the architect context is lost,
the assignment and cited plan passages still provide a complete fallback.

Both forks must review an isolated candidate snapshot. The current pi adapter
can change the working directory for a session, but it has not been verified
here that a fork of a local-architect session can safely read a separate
snapshot while preserving the intended context. That needs a focused port
probe. More importantly, the current harness stores a single active
`run.session` and `run.invocationDone` for stop and wait handling; it does not
yet manage several simultaneous invocations. Background reviews require that
concurrency lifecycle and serialized records before either fork strategy can
run as proposed. The port capability alone does not implement the workflow.

## Review each iteration, reconcile at the work-item boundary

The natural batch boundary is a **module work item**, not a module forever. A
work item may span several iterations, and a later provider obligation may
create another work item in the same module. The local architect already
assesses each iteration and proposes completion; the harness already requires
a passing work-item gate before `work-item-completed`. Settle the item's review
attempts after that completion proposal and before that gate. The harness can
skip the extra findings assessment when the open CheckFinding set is empty.
When it is nonempty, the architect evaluates the findings together. If source
changes are needed, it assigns a correction iteration through its normal
path, then proposes completion again. A batch is one assessment and scheduling
step, not a promise that every issue can be repaired in one engineer invocation.

For each passing iteration gate, durably record pending code, scope and design
review attempts against one captured assignment, base, audited commit, gate
and relevant guidance revisions. Start their read-only sessions independently
against that immutable input. The engineer and local architect can proceed to
the next iteration while they run. Record each completed attempt and promote
only concerns needing later action to CheckFindings; an empty review creates
none. Keep completed findings available to the architect as concise context
without repeatedly pasting the full set into each turn. An observed failed
test or required gate remains on its immediate repair path; deferral applies
only to judgmental review concerns.
If an early review result indicates that dependent work may rely on a wrong
contract, weakens a required test obligation, or crosses an authority
boundary, the architect can act at the next safe decision point. An in-flight
iteration cannot be assumed to have seen a late review result.

Each reviewer must inspect the captured commit and references, not whatever
tree the next engineer happens to be editing. Reviews need isolated read
access to that snapshot, sessions independent of the writer, and serialized
run-log writes for their results. They can share one evidence bundle and one
attempt schema with a review-kind field; separate finding stores or lifecycle
rules add no value. A resumed run must discover pending reviews and
either resume or retry them from the same captured input, or record why they
were not verified. Start with a bounded review queue rather than unbounded
parallel reviewers; otherwise fast iterations can create a growing backlog
and move the wait to work-item completion. These are real implementation costs
of the proposed overlap, though they do not require parallel engineers or a
new module.

At the completion proposal, wait a bounded time for the work item's reviews.
An attempt that cannot finish is recorded as **not verified**, with the
unfinished reviewer stopped or its result explicitly rejected; it cannot
silently produce a new finding after the item closes. Best-effort policy may
allow completion with that coverage gap, but must never report it as a clean
review. If there are **no open CheckFindings**, the harness runs the normal
work-item gate without another local-architect invocation for findings. The
architect's ordinary completion proposal is still required. An unavailable
review is a coverage gap, not a synthetic finding; whether it blocks
completion follows the review's best-effort policy. If there **are** findings,
the local architect assesses all of them together against the current audited
tree. Later iterations may already have fixed a concern,
made it irrelevant, or exposed a shared cause behind several reports. Neither
the passage of time nor a later review's silence closes an earlier finding:
record the new evidence and a reasoned superseding judgment, or a verified
repair. Keep distinct issues separate unless a supported relation identifies
one underlying problem. The architect may defer a worthwhile but nonblocking
improvement with an owner and reason, without representing it as fixed. Group
surviving repairs into the smallest sensible correction assignment(s), choose
the responsible engineer, and run the ordinary iteration and work-item gates
afterward.
Re-review changed behavior where review coverage is available; otherwise keep
that coverage gap explicit under the best-effort policy. If no valid concern
survives, completion proceeds without a repair round. The system usually
resolves this quietly and reports only material choices and residual risk.
Bound the correction and re-review cycle so new judgments cannot keep the
work item open indefinitely.

| Effect | Advantage | Cost or risk |
| --- | --- | --- |
| Three focused reviews per iteration in parallel with subsequent work | Small diff and separate questions make judgments easier to ground; most reviewer time overlaps the next iteration. Independent scope and design attention may catch concerns a code review overlooks. | Three reviews consume more model tokens and may compete with engineering for capacity. A slow or failed lane can leave a backlog, and a one-iteration work item has no next iteration with which to overlap review. |
| Defer ordinary remediation | One architect assessment can supersede stale concerns, combine related repairs, and avoid edits that the remaining planned work would replace. | A real defect can propagate into subsequent work, increasing the eventual repair. Early escalation needs a narrow rule for dependent work. |
| Assess findings only when they exist | A clean set goes directly from the normal architect completion proposal to the work-item gate, with no extra agent call. A nonempty set uses the existing architect and correction-iteration path. | Findings may be stale or duplicated across lanes; the architect needs current-tree evidence and bounded reconciliation. Multiple correction iterations can still be necessary. |

The expected latency is roughly the slowest review or queue backlog left when
the architect proposes completion, plus reconciliation and correction work
only when findings exist. It is not the sum of all review durations if the
review lanes keep pace with iterations. The tail is largest for a
one-iteration item or a saturated reviewer queue. A single review at
work-item end uses fewer tokens and simpler scheduling, but its larger diff
weakens iteration attribution. The pilot should measure the marginal value of
each lane and compare per-iteration review with one end-of-item review before
choosing a default; targeted review remains an alternative if a lane's yield
is low.

## Minimal CheckFinding integration

1. **Keep source observations where they belong.** Gate attempts continue to
   own failed tests, scenario outcomes, structured Ramify diagnostics and
   unverified commands. A review attempt records what an agent examined and
   asserted. Neither creates a persistent finding merely by existing.
2. **Promote only an issue needing continuity.** When a review concern requires
   repair, reassessment, a material report or a decision across attempts, give
   it a finding identity and link the review, exact source revision and work
   item or iteration. Do not merge two concerns because they touch one file.
3. **Use an empty-set fast path.** Settle outstanding reviews before work-item
   completion. If there are no open CheckFindings, skip a separate architect
   findings assessment. Otherwise the local architect assesses them against
   the current audited tree and assigns bounded correction work, supersedes a
   judgment, or explicitly defers a nonblocking improvement. The harness
   records each disposition and enforces its scope. A separate adjudication
   agent is unnecessary. Report material choices and fixes; ask the user only
   at a strong authority conflict.
4. **Verify the claim that was made.** A source repair needs a fresh gate and
   a review of the changed candidate when that review is available; otherwise
   its coverage remains explicitly unverified under the run's policy. A
   judgment may be superseded without a source change, but the reasons and
   earlier judgment remain inspectable.
   Absence from a narrower or unavailable review does not close it. A test
   failure still needs the same test to pass; review cannot waive a required
   gate or scenario.
5. **Preserve recovery and source identity.** Record reviewer output and each
   disposition through the harness's existing run log. A review tied to one
   commit does not silently apply to another. A resumed run can derive which
   concerns still need action without repeating already recorded decisions.

## Ownership and smallest implementation shape

The `harness` owns review timing, candidate identity, disposition policy,
repair scheduling and durable records. Its existing `agent` port can run a
read-only reviewer session, but the harness protocol needs a reviewer role,
three review kinds and concurrent-invocation lifecycle. One reviewer role
with kind-specific prompts and results is enough initially. `evidence`
supplies source and diff facts; `audit`
continues to verify commits; `ledger` remains generic storage; `web` renders
the harness's projection. The combined
[CheckFinding architecture](../architecture/check-findings.md#ownership-and-modular-boundaries)
now recommends a small pure `harness/findings` child for the shared identity,
supersession, verification and reopening rules across the identified producers.
Review orchestration stays in the harness. This refines the earlier option of
keeping the first pilot entirely in harness folders; no module declaration
has been changed.

Preserving the current checks and adding no review has no new runtime cost,
but supplies no independent semantic assessment. The strongest alternative
for adding review is to make every current check diagnostic a
CheckFinding and add a separate review or adjudication workflow for each
kind. It would duplicate the gate's verdict and repair policy, add states for
objective failures, and require synchronization with scenario and requirement
records. The selected design adds durable identity only where it changes a
decision. It does require a clear distinction between a gate-passed commit,
an iteration with a pending or unverified background review, and a work item
awaiting reconciliation. The current `acceptedCommit` projection advances at
the gate, so this boundary needs an explicit implementation contract before
reviews can run past iteration closure while still holding work-item
completion.

## Evidence to require from a pilot

Use scripted and real project cases for a clean change, a planted code defect,
a semantic scope drift within permitted paths, a worthwhile simplification,
an unfounded refactoring suggestion, a plausible principle conflict with an
exact citation, malformed review output, and a repair that changes the audited
commit. Include
multi-iteration items where a later iteration fixes a concern, leaves it in
place, or builds on it; a one-iteration item with review tail latency; and a
slow review queue that is recovered after interruption. Show that the right
owner acts, a superseded judgment does not require a code edit, an unverified
review is visible as a gap, no-finding items skip the extra architect call,
and no review decision changes a gate result. Measure each lane's findings
per reviewed iteration, actionable findings still valid at item completion,
findings made obsolete by later work, duplicate or noisy suggestions,
correction rounds, escaped defects, reviewer tokens, overlapped time and wait
at the completion barrier. Compare the same work items with one end-of-item
review before making three per-iteration reviews the default.

This is source and architecture analysis, not a live review-quality trial or
an implementation. The refreshed architect view reports measured dependencies
and test references; it does not establish the accuracy of proposed agent
judgments.
