# Plan 21: provider adoption and architect-owned completion

**Date:** 2026-10-06. **Expanded:** 2026-10-07. **Status:** implementation in
progress; iteration 0 provider and responsibility prerequisites complete.
Dan chose to consolidate provider adoption and responsibility corrections into
this plan rather than introduce another plan. At initial plan authoring, only
planning was authorized; that historical limit did not authorize runtime
implementation or protected-document edits. Dan subsequently requested
implementation of this plan with a subagent per iteration on 2026-10-07 and
approved the bounded provider public export, qualification and publication.
The coordinator approved two exact `docs/harness.spec.md` corrections for their
named later iterations, recorded in
[protected wording](protected-wording-proposal.md); no other protected edit is
implied. [Iteration 0's receipt](iterations/iteration0-results.md) records the
completed prerequisite gate and its delivery-head evidence.

## Outcome

ramify-agent adopts the current Ramify and ramify-audit providers and restores
one responsibility boundary: architects assess requirements; the harness records
their explicit judgments; audit establishes configured test-suite health.

Engineers can change their assigned modules' owned contents, including auxiliary
source, docs and owned-unwired trees. Child modules and independent project trees
need explicit inclusion through one `included` list whose kinds and owners
Ramify derives; external and generated boundaries remain enforced.
Hooks preserve actual per-path analysis dispositions. Preparation and test
execution follow project configuration through public provider operations.

Responsible architects coordinate implementation and appropriate tests, decide
what needs separate completion reporting, and declare when registered obligations
are correctly implemented and passing. The harness trusts those declarations.
Each obligation is `pending`, `bound` or `done`, moved only by an accepted
submission; an engineer's binding names the fakes it relies on. A completion
request missing a report is rejected naming the IDs, under the existing
per-turn bound, and declarations survive interruption. Optional
`where` text helps agents find the implementation; it has no validation or
completion meaning. Final verification is a full audit of the configured suite,
including the required nested projects, independent of obligation declarations.

This retains Phase 3 of the [master sequence](../../../../docs/plans/project-boundary-sequential/main-plan.md#phase-3-update-ramify-agent)
and continues completed [Plan 20](../20-project-boundary-preparation/main-plan.md).
Its scratch, Git-ignore, lifetime, tracked-file, header and fixture preparation
is retained and regression-tested rather than reimplemented.

## Planning basis

- [Responsibility analysis](../../analysis/2026-10-07-agent-declarations-and-audit-responsibilities.md)
  records the issues and Dan's adopted choices. This expanded plan carries them
  into implementation scope; remaining protocol details require iteration 0 review.
- [Source state](source-state.md) separates inspected implementation from intended changes.
- [Provider requirements](provider-requirements.md) and [contract review](provider-contract-review.md)
  define actual public integration needs. Earlier P4 assignment/scenario
  certification is withdrawn; any remaining execution gap needs its own witness.
- [Contracts](contracts.md), [acceptance](acceptance.md) and [execution](execution.md)
  define responsibilities, cases and serial delivery.
- [Protected wording proposal](protected-wording-proposal.md) separates proposed
  specification alignment from authorization to apply it.
- [Planning validation](planning-validation.md) records document validation,
  not runtime acceptance.

The current adopted pair is the exact registry releases `ramify.ts` 0.4.0 and
`ramify-audit` 0.7.2. Ramify supplies affected CLI/answer /4; audit 0.7.2
retains P3's public committed-configuration operation and evidence schema 4.
Dan decided on 2026-10-07 that iteration 0 obtains audit 0.7.1 so the agent's
pins and lockfile first change in iteration 1. Iteration 2 adopted audit 0.7.2
after its provider-owned inline-project exclusion correction; the earlier 0.7.1
qualification and receipts retain their historical identities. Published 0.7.0
remains the historical reference for earlier contracts; the
[three-kind handoff](/home/app/ramify-nested-kinds/docs/plans/nested-tree-kinds/handoff.md)
supersedes earlier ignore-list/affected-rule target versions. Provider receipts
qualify their artifacts; the agent still needs its own installed-package witnesses.
Iteration 0 records the original 0.4.0/0.7.1 pair and its qualification before
adoption; the iteration 2 receipt records the 0.7.2 provider prerequisite.
No consumer deep import or copied provider implementation is permitted.

Declare `owned-unwired "docs"` and set `ignorePaths: ["docs/**"]`.
Docs of every extension remain owned, unanalyzed and ordinarily writable;
audit ignores independently govern full reuse. P1 stays withdrawn. P3's public
committed-configuration operation is qualified in iteration 0; revised P4
concerns committed test execution, never a semantic assignment conclusion or
a dirty diagnostic path.

## Deliverables and limits

1. Atomic dependency, marked-root, fixture and public-format migration.
2. Declared preparation and configured execution, with readiness as one full
   audit request and no manifest walk, filename heuristics or harness
   test-completeness calculation.
3. Whole-owner write scopes with one derived-kind inclusion list,
   exclusion precedence and existing configuration authorization.
4. Truthful per-path hooks and complete producer diagnostics.
5. A small architect declaration protocol integrated with current submissions,
   durable records and existing authority; optional `where` stays plain text.
6. The three-state obligation lifecycle, `pending`, `bound` and `done`, with
   the engineer's fakes list and integration due on sub-scenario done reports,
   removing the derived and automatic transitions, execution matching and
   generated causal diagnosis; structural completeness of an engineer's
   completion proposal against its assigned scenarios.
7. Delegation handback based on the responsible architect's judgment, preserving
   original requirements and real integration without cited-file/pass coverage checks.
8. Structural rejection of completion requests missing reports, idempotent
   recovery and current change information for architect reassessment.
9. Applicable committed audit evidence, reuse and full nested final verification,
   with scenarios as configured checks, every harness-requested audit over a
   committed tree and no harness-resolved scoped test tool.
10. Coordinated prompts, contracts, projections, documentation and final qualification.

No new production module, reviewer role, general test registry, clarification
budget or second semantic state machine is proposed. Ordinary tests are not
automatically tracked obligations. Scope safety, other non-test gates and
existing review remain in place. Provider implementation/publication, Ramify
model changes, general specification sealing and Plan 18 live-trial gaps remain
separate work. This plan does not attribute the drift to a particular agent.

## Implementation sequence

The [manifest](iterations/manifest.json) is the single serial execution order.
Each implementation iteration ends with a commit and results receipt.

| Iteration | Deliverable | Entry condition |
| --- | --- | --- |
| [0](iterations/00-provider-convergence.md) | Baseline, public execution witnesses and reviewed declaration/lifecycle contracts | Inspection may proceed now; both its tracks gate iteration 1 |
| [1](iterations/01-provider-adoption.md) | Exact pins, roots, declared fixtures, inert docs and current readers | 0, including the P3 release |
| [2](iterations/02-preparation.md) | Committed configuration, declared preparation and readiness | 1 |
| [3](iterations/03-write-scope.md) | Whole-owner authority and one new combined run-policy boundary | 2; scope hunks authorized and applied 2026-10-07 |
| [4](iterations/04-hook-dispositions.md) | Provider hook protocol and per-path dispositions | 3 |
| [5](iterations/05-architect-declarations.md) | Explicit registration and authorized architect declarations | 4; reviewed protocol |
| [6](iterations/06-scenario-responsibilities.md) | Architect-owned acceptance state and raw failure diagnostics | 5 |
| [7](iterations/07-delegation-handback.md) | Architect-owned delegated outcome/test reporting and handback | 6 |
| [8](iterations/08-clarification-recovery.md) | Incomplete-request rejection, recovery and agent reassessment | 7 |
| [9](iterations/09-audit-delivery.md) | Configured audit execution and applicable reuse | 8; revised P4 |
| [10](iterations/10-nested-verification.md) | Nested full verification, recovery and projections | 9; P5 |
| [11](iterations/11-integration-acceptance.md) | Integrated workflows, removal inventory and full final audit | 10 |

Iterations 1–4 retain their original useful adoption work. The earlier unstarted
scope-certification iteration 5 is replaced. Earlier audit delivery/final
qualification move from 6/7 to 9–11, with audit delivery split in two. Existing iteration 0 evidence retains its
original meaning; it does not pass the expanded prerequisites. Intermediate
new-policy runtime behavior is not enabled for normal production execution
until iteration 11 qualifies the combined migration: the branch is not merged
into `ramify-agent` and no run on another project uses it before then, and the
run-policy identity iteration 3 introduces names the complete Plan 21 contract,
valid only once iteration 11 qualifies it.

## Decisions and dependencies still open

The responsibility allocation, architect-chosen registration granularity,
optional `where` string, existing per-turn rejection bounds and full-audit final
verification are adopted. Do not reopen them as implementation choices.

Iteration 0 must settle the small remaining contract details: submission timing,
structural completeness of engineer proposals, responsible architect
identifiers, revision/idempotency behavior, feature-file eligibility,
integration scheduling and completion continuation. Use existing
records and actions wherever they fit; no exact new schema is approved merely
by this plan's prose. Missing declarations must be reportable while coordinating
further work, not only at a terminal action.

P3 must have a demonstrated public committed-configuration operation. Revised
P4 must demonstrate configured committed execution with truthful source
identity and retained results; no dirty diagnostic path is required. Do not
ask the provider to receive scenario/test obligations or certify their
implementation. Apply protected changes only as exact separately authorized
patches preserving Dan's edits.

## Completion

Each required acceptance case needs actual evidence; a skipped or unrun case
does not pass. The coordinator reviews the cases and records results. This is
plan implementation validation, not a new runtime case-to-test matching system.

Final verification is the applicable full nested audit of the configured suite.
Registered implementation declarations are separate agent-owned completion
facts. The harness neither promotes nor retracts them from that audit's result.
Final receipts bind the source, package integrities, audit identities, nested
results, reviewed behavior cases and protected-file comparison. A final audit
alone does not demonstrate write safety, declaration authority, recovery or UI
behavior; those changes need their specified implementation witnesses.
