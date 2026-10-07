# Proposed protected wording and reconciliation

**Revised:** 2026-10-07, with the review corrections of the same date.
**Status:** proposal for review; no protected file is
changed or authorized by this planning revision. Preserve Dan's existing
[harness principles](../../harness.principles.md) edit exactly.

The former impact-only hunk retained assignment/scope certification and scenario
obligations in audit acceptance. It is withdrawn. The expanded plan needs
consistent wording for architect-owned requirement assessment, configured audit
health and separate reporting completeness.

## Proposed verification paragraph

Target: `docs/harness.spec.md`, "Verification Follows Scope And Audit Policy".
This is a proposed replacement for the whole section body, both of its current
paragraphs, not an assertion that it has been applied or is sufficient for
every affected section. The current second paragraph's "included ignored tree"
sentence is folded in below, because the three kinds give owned-unwired and
owned-nested-project trees different verification:

> Verification executes the project's configured checks through ramify-audit.
> For committed partial audits, impact selection comes from Ramify and the
> project's audit policy; inert and excluded paths need not select their owner.
> Detected shared inputs and explicitly listed undetected configuration files
> follow the provider's full-audit policy. The harness records complete audit
> results and preserves producer verdicts. The responsible architect evaluates
> implementation, tests and relevant audit diagnostics and declares whether a
> registered requirement is correctly implemented and passing. The harness
> trusts that declaration and asks the architect about missing reports; it does
> not match declarations or references to test files or execution results.
> Final verification is a full audit of the configured suite, including required
> nested projects. Architect declarations and that audit result remain separate.
> An owned-unwired tree is verified by its owner's tests; an included
> owned-nested-project tree needs its own nested audit at the plan's final
> gate, and each project's audit result is preserved separately.
> Ownership, source classification and configured test execution are distinct.
> A not-analyzed path is never presented as passing source analysis.

## Proposed scope hunks

Target: `docs/harness.spec.md`, "Every Agent Scope Is a Cut on the Module
Tree". The live section still uses the refused `owned-ignored` kind and
requires inclusion for every such tree, which contradicts
[contract 1](contracts.md#1-ownership-and-assignment-authority) and PB3-S03.
Iteration 3 cannot implement that contract against the unchanged section, so
these two hunks need named authorization before iteration 3 starts. The
coordinator may authorize them as specification corrections expressing Dan's
accepted three-kind decision.

First paragraph, exact current wording:

> A module assignment covers its owned contents, including configuration,
> documentation and scratch, except its owned-ignored trees. Child subtrees and
> owned-ignored trees require explicit inclusion, each as a whole. External
> trees are never writable in the enclosing run.

Proposed replacement:

> A module assignment covers its owned contents, including configuration,
> documentation, scratch and owned-unwired trees, except its
> owned-nested-project trees. Child subtrees and owned-nested-project trees
> require explicit inclusion, each as a whole. External trees are never
> writable in the enclosing run.

Second paragraph, first three sentences, exact current wording:

> The issuing architect names each included tree with a reason and instructions
> for its meaning. The tree is excluded from Ramify source checks; the owner's
> tests and README define its use. Where it is a project, its own instructions
> and commands apply from its root.

Proposed replacement:

> The issuing architect names each included owned-nested-project tree with a
> reason and instructions for its meaning. The tree is excluded from Ramify
> source checks; its own instructions and commands apply from its root.

The rest of the section is unchanged.

**Authorized and applied, 2026-10-07.** Dan authorized both hunks ("use the
new naming"). The first is applied as proposed. The second is applied with
one adaptation for the single `included` list Dan accepted the same day,
under which every included tree, child subtree or owned-nested-project, is
named with a reason and instructions:

> The issuing architect names each included tree with a reason and instructions
> for its meaning. An included owned-nested-project tree is excluded from Ramify
> source checks; its own instructions and commands apply from its root.

`docs/harness.spec.md` now hashes to `f3635d7e25b8b6d175e543197be9c7d12356048f92266fbf1c5df6431ff948bc`.

## Principle needing Dan's decision

[A Plan's Acceptance Is Its Scenarios](../../harness.principles.md#a-plans-acceptance-is-its-scenarios)
says a plan is finished when every scenario passes in full mode at the final
gate. Iteration 6 replaces pass-driven `implemented` promotion with the
responsible architect's declaration, and the final gate becomes the full
configured audit without per-scenario matching. The
[analysis](../../analysis/2026-10-07-agent-declarations-and-audit-responsibilities.md#1-the-documents-express-two-different-meanings-of-acceptance)
records this tension. A principle change requires Dan's decision under the
[master procedure](../../../../docs/plans/project-boundary-sequential/main-plan.md#agent-coordination-and-protected-documents);
the coordinator cannot authorize it.

**Decided and applied, 2026-10-07.** Dan accepted this clarification of the
one sentence, and it was applied to the principles file in the planning
worktree with the rest of the principle unchanged. Exact replacement:

> A plan is finished when every scenario passes in full mode at the final
> gate.

became

> A plan is finished when every responsible architect has reported its
> registered scenarios implemented and passing, and the full audit of the
> configured suite passes at the final gate.

The iteration 6 prerequisite is satisfied. The
[planning validation](planning-validation.md#review-corrections-2026-10-07)
records the resulting protected-file hash; iteration 0's inventory starts
from it.

## Iteration 0 reconciliation

Inspect the live specification and principles, including every statement that
makes scenario execution stand for implementation or final requirement coverage.
Prepare exact minimal patches for each affected protected location, record the
live hashes and preserve unrelated wording, scratch lifetime and user edits.
The proposed paragraph above is a review input; freeze its exact replacement
range and any other necessary hunks before implementation.

Prepare corresponding changes to acceptance-scenario and autonomous-loop
architecture, submissions, prompts and projections. No principle change is
presumed necessary merely to select record fields. If an existing foundational
statement conflicts with the adopted responsibility boundary, identify it and
propose only the necessary clarification for Dan's review.

### Authorized outcome-protocol sentence, 2026-10-07

The live `docs/harness.spec.md` section "A Small Closed Set of Outcomes Is the
Whole Protocol" says:

> An accepted submission changes the orchestration; it does not claim that
> implementation is accepted.

This generalizes the engineer-proposal rule to an architect's accepted done
report and conflicts with Dan's adopted responsibility allocation. The
coordinator authorized replacing only that sentence with:

> An accepted engineer completion proposal advances orchestration to
> verification; it does not establish correct implementation. An authorized
> architect's accepted done report records that architect's judgment that its
> registered obligation is correctly implemented and passing. The harness
> trusts the report and does not infer that judgment from gate results.

The baseline `docs/harness.spec.md` SHA-256 is
`f3635d7e25b8b6d175e543197be9c7d12356048f92266fbf1c5df6431ff948bc`.
The role list and following Read/plan-update/prevalidation/current-gates
sentences remain intact. This patch and the whole verification-section
replacement above are the only new protected authorizations recorded for
later iterations; neither is applied in iteration 0. They align iteration 5/6
declaration authority and tests with the accepted actor boundary.

A coordinator applies protected changes only with exact named authorization
under [execution](execution.md). Passing tests cannot authorize them. Iteration 0
records accepted patches or keeps the affected work blocked; plan drafting
continues without modifying protected files. Later receipts compare HEAD,
index, working tree and renamed/untracked protected files against the baseline
and authorized changes. Do not reuse historical hashes as proof that Dan's
new edit is absent or unauthorized.
