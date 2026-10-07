# Iteration 0: provider and responsibility contract review

**Plan:** [Plan 21](../main-plan.md). **Prerequisites:** none for inspection.
**Owners:** harness coordinator; provider repairs remain in their own projects.
**Status:** in progress, incomplete. Earlier [results](iteration0-results.md)
retain their original witnesses; expanded prerequisites have not passed.

## Goal

Establish an executable adoption baseline and freeze the smallest declaration,
continuation and execution contracts needed by the expanded plan.

## Read first

[Source state](../source-state.md), [analysis](../../../analysis/2026-10-07-agent-declarations-and-audit-responsibilities.md),
[contracts](../contracts.md), [provider requirements](../provider-requirements.md),
[provider review](../provider-contract-review.md), [protected wording](../protected-wording-proposal.md),
[execution](../execution.md), current principles/specifications and provider handoffs.

## Deliverables

1. Commit the planning package and Dan's principles edit first, as a
   documentation commit, so that the baseline names a committed state. Then
   record clean source, live worktree/branch, exact installed pins and
   protected hashes. Retrieve Plan 20 evidence with its original identities.
   Rerun the applicability query at that commit; the earlier query at
   `d1497178` is history. Confirm full-baseline applicability or obtain the
   required baseline through the installed released audit.
2. Keep P1 withdrawn; qualify released P2/P5 and exact package artifacts.
   Obtain the ramify-audit release that exposes P3's committed-configuration
   operation publicly, qualified in its own project, and demonstrate the
   operation through that installed package; record it as the adopted audit
   pin so iteration 1 bumps the pins once. Run revised P4 configured committed
   execution witnesses against the same release; require an owner-reviewed
   extension only for a concrete failing need. No assignment/scenario
   certification and no dirty diagnostic witness.
3. Trace current initial/local/capability architect submissions and registration
   records. Freeze authoritative actor/obligation ownership, registration choice,
   done-report timing, optional `where`, explicit judgment revision and duplicate
   handling in existing schemas/events. Support reporting during coordination,
   not only terminal submissions. No second registry/state machine.
4. Trace generated feature eligibility, scenario-result association, integration
   scheduling, capability coverage and handback. Specify the minimal replacement
   for each audit-driven semantic dependency. Keep original requirements and
   agent authoring tools; test inclusion/readiness are explicit agent decisions.
   Freeze the three-state lifecycle, `pending`, `bound` and `done`, the
   engineer's per-ID `fakes` list and integration due on sub-scenario done
   reports, in existing events and submissions.
   Freeze the structural completeness rule for engineer proposals: the
   assignment's named scenarios become required declarations, a missing one is
   a rejected submission under the existing bound, and partial work is exempt.
   Inventory `run_scope_tests`, its scoped-test timeout, the harness scenario
   check and the `acceptance` configuration section for removal in iteration
   9, with the briefing text and committed Cucumber checks that replace them.
   Freeze the single `included` list and the readiness full-audit request.
5. Freeze the rejection of completion/handback requests missing a report,
   under the existing per-turn bound, and durable recovery. Reuse the existing
   rejected-submission seam rather than a continuation, counter or retry
   system. Define what change/audit context the
   architect can retrieve without automatic declaration invalidation.
6. Prepare exact coordinated protected/document/prompt patches and removal
   inventory, including the two
   [scope hunks](../protected-wording-proposal.md#proposed-scope-hunks) that
   iteration 3 needs and the
   [acceptance principle](../protected-wording-proposal.md#principle-needing-dans-decision)
   clarification Dan accepted and applied on 2026-10-07. Record named authorization
   for protected changes needed by later work, or leave those entry conditions
   pending. Refresh receiving API views before proposing cross-owner access.
7. Probe disposable adoption for newly analyzed auxiliary source, companions,
   fixture/root and tooling issues. Record bounded repairs; no dependency or
   runtime implementation is implied by the probe.

## Verification

PB3-T06 is the revised real F2 execution witness, not assignment union coverage.
PB3-P01's F3 witness requests a committed definition differing from working bytes.
Verify public artifact resolution/integrity and actual process/results identity.
Review proposed protocol against PB3-D01–D10 and PB3-C01–C06: identify the owning
seam and test fixture for each case. That review is not passing runtime evidence.

## Exit criteria

The iteration has two tracks and one gate: execution is serial, so iteration
1 starts only when both tracks have passed, as the manifest encodes.

The provider track: deliverables 1, 2 and 7. Baseline and exact compatible
provider artifacts are recorded. P3 and revised P4 have public executable
witnesses; P5 is confirmed. The scope hunks of deliverable 6 are authorized
and applied.

The responsibility track: deliverables 3, 4, 5 and the rest of 6.
Declaration authority, registration, feature/scheduling, handback, rejection
and recovery contracts are concrete enough to implement, and the protected
patches they need have named approval. Dan's accepted acceptance-principle
clarification is already applied, and the 2026-10-07 decisions settle most of
this track on paper.

A missing contract stays pending; do not guess an API or weaken a
requirement.

## Handoff

Update `provider-receipt.md` and `iteration0-results.md` with current witnesses,
contract decisions, authorization/hashes and bounded adoption inventory. Preserve
historical evidence; do not relabel old P4 probes as new acceptance.
