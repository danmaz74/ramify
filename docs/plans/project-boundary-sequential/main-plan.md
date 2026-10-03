# Project boundary: master implementation plan

**Date:** 2026-10-03. **Status:** draft master plan; implementation pending.

Implement the [project-boundary design](../../architecture/project-boundary.proposal.md)
in three successive project updates: Ramify, then ramify-audit, then
ramify-agent. This document sets the sequence, scope and completion gates.
Each phase gets a detailed implementation plan in its owning project before
execution, with bounded iterations, concrete contracts and executable acceptance.

## Delivery policy

This is an alpha migration. Backwards compatibility is not required. Each
project adopts the new contracts directly and removes superseded behavior;
compatibility adapters and transitional support for old consumers are not
deliverables.

Phase 1 changes only Ramify. It does not edit `/ramify-audit` or
`ramify-agent/`, including their source, tests, dependencies or documentation.
The current audit and agent may stop working with the updated Ramify. Their
compatibility becomes a completion requirement when each is updated in its
own phase.

Within Ramify, update all affected internal consumers, public contracts,
transports, CLI outputs, generated views, tests and documentation together.
Breaking a previous contract does not excuse an inconsistent new one.

## Agent coordination and protected documents

Implement these phases with directly coordinated agents, without relying on
the developing ramify-agent harness to enforce document authority. Each
project's detailed plan carries this policy into every implementation brief
and handoff. The master coordinator ensures each phase coordinator applies it;
the phase coordinator owns authorization and review of protected changes.
This execution policy does not remove the phases' runtime acceptance gates.

Project-owned files ending in `.principles.md` or `.spec.md` are protected.
Before each iteration, its coordinator inventories them and records their
revision and content hashes, preserving any existing user edits. Implementation
agents read the relevant authorities but may change protected files only after
explicit authorization of a named file and exact patch. Repeat this rule when
assigning, replacing or resuming an agent; a broad documentation write scope
does not authorize protected changes.

A proposed change identifies the existing rule and section, the conflicting
requirement, why implementation cannot satisfy both, the exact replacement
wording, and its effects on behavior, tests and dependent tasks. Implementation
difficulty or failing tests alone does not justify changing a contract.
Principles change only when a foundational commitment needs to change or
requires necessary clarification; detailed rules belong in specifications.
The coordinator may authorize specification corrections that express an
already accepted decision. Foundational changes and new behavioral policy
require the user's decision before authorization.

Record the rationale, accepted decision, baseline identity, exact patch and
approval in the iteration's existing review/handoff record. Approval applies
only to that patch; subsequent changes require another review. Phase 1's
Iteration 1 specification adoption is limited to the exact patches needed for
reviewed R1–R6 decisions. This plan identifies no required principle change.

At every handoff, the coordinator runs a standalone protected-file comparison
against the recorded baseline. It covers committed, staged and working-tree
changes, new untracked protected files, deletions and both sides of renames.
Compare actual changes with the approved patches, then review their meaning
and whether tests still enforce the intended contracts. Record either no
protected changes or each approved change and its review outcome. Unexpected
changes leave the handoff unaccepted until resolved; preserve unrelated user
work. Passing tests do not replace this review. Repeat the check after later
edits or staging and before accepting the final candidate.

After an approved change, send affected agents the new authoritative revision,
update their briefs and identify which implementation or acceptance evidence
must be checked again. Later phases inherit this policy in their own plans
without editing their projects during Phase 1. The Ramify plan specifies the
[direct execution procedure](../project-boundary-ramify/execution.md#protected-principles-and-specifications).

## Sequence

| Phase | Owning project | Result required before the next phase |
| --- | --- | --- |
| 1 | Ramify (`/ramify`, excluding `ramify-agent/`) | Implemented and verified ownership, discovery, analysis and boundary contracts, with a fixed package artifact for audit to consume. |
| 2 | ramify-audit (`/ramify-audit`) | Verified audit policy, test selection and nested-project auditing against the Phase 1 Ramify artifact, with a fixed audit artifact for agent to consume. |
| 3 | ramify-agent (`/ramify/ramify-agent`) | Verified assignment scope, scratch lifecycle and verification workflows against both updated providers, followed by final integration acceptance. |

Do not begin a consumer's implementation before its provider's handoff is
complete. A handoff identifies source and configuration revisions, package
version and artifact digest, changed contracts, acceptance evidence and any
explicit limitations.

A consumer's phase starts and develops against the provider's local package
artifact; registry publication is not a prerequisite for starting. A
consumer's completion gate passes only when each provider it consumes is
published and the consumer's committed dependency is that exact registry
version. No local artifact path is committed as a dependency. A provider
defect found during consumer work is fixed in the provider and delivered as a
rebuilt local artifact until that publication.

## Consumer plans

The detailed ramify-audit and ramify-agent plans are authored when their phase
begins, from the actual provider handoff. Earlier drafts written before this
sequence were removed on 2026-10-03; they remain in each repository's history
and are not a starting point.

## Phase 1: update Ramify

**Outcome:** Ramify evaluates a project using whole-tree path ownership and
declared analysis boundaries, and exposes the facts its later consumers need.

1. Complete the nested-tree statement grammar in the
   [module-description specification](../../model/module-description.spec.md)
   before implementing it. Define the new inventory, ownership, affected-path
   and report contracts, including explicit excluded and not-analyzed outcomes.
   These contracts pass review before the first implementation iteration.
2. Implement declared `owned-ignored` and `external` trees, always-excluded
   paths and module scratch exclusions. Replace inferred independent-project
   boundaries with explicit declarations and migration diagnostics. Add the
   warnings for compiler-selected source inside an owned-ignored tree or a
   scratch directory and for repository-ignored directories Ramify would
   still enter; remove discovery's `.reference-work` special case.
3. Analyze owned compiler source outside `src/` under its owner's ordinary
   classification. Enforce exposure and testing isolation, reject exposure of
   auxiliary originals, and enforce imports across declared boundaries using
   resolution provenance, including linked packages.
4. Attribute existing, new and deleted paths by containment without
   inventorying inert files. Keep ownership separate from analysis coverage;
   affected selection follows reverse imports, without automatically selecting
   every descendant of an owner. Excluded unowned paths select nothing.
5. Carry the new facts through batch and resident analysis, observation and
   invalidation, service and wire contracts, changed-file checks, CLI diagnostics
   and materialized views. Make owned-ignored boundaries visible without
   interpreting their contents, and retire the outside-module-source warning.
6. Migrate Ramify's own layout, declarations, compiler exclusions and tooling
   to the model. Declare the site and example owned-ignored and the agent
   external; declare the reference harness owned-ignored where it is and
   remove imports from analyzed code into it; give scripts and measurements
   legal imports. Update the site's package consumption and
   affected teaching documentation as described in proposal section 11.

**Completion gate:** verify parser and layout cases, containment, auxiliary
source, boundary imports, linked-package positive controls, excluded-path
outcomes, the new warnings and incremental consistency. Confirm that CLI root
selection and production selection are unchanged. Run Ramify's build, type
checks, self-check and the full regression and acceptance suites, including
the reference harness under its unchanged configuration. Demonstrate the new
contracts through real public entry points and CLI/process flows.

This gate establishes Ramify behavior. It does not require the old audit or
agent to consume the new contracts. The existing audit obtains partial
selection from the project's own `ramify affected`, so partial audits are
expected to stop working; a full audit does not use that query and remains
the preferred gate. The detailed Ramify plan confirms this with the existing
audit executable before its first iteration. If the full audit cannot run
either, record Ramify's verification directly under a path the detailed plan
specifies; do not repair the old consumer or add compatibility behavior to
make it pass.

Phase 1 merges when this gate passes. From then until Phase 2's first audit
release, every toolkit commit is audited in full, and harness runs that
target the toolkit are not expected to work.

The audit definition does not yet run the reference harness's separate test
command, and gains it only in Phase 2. Until then every Phase 1 gate runs
that command explicitly, so the harness tests are never left unrun.

**Handoff to Phase 2:** the verified Ramify artifact and contract documentation,
with a written fixture topology and its expected ownership, exclusion and
affected answers. No fixture files are shared or copied between projects.
Each consumer builds that topology in its own tests and runs the pinned
Ramify on it, so the provider's actual answers are the evidence.
Implementation of audit policy, grouped test execution and harness write
authority belongs to the later phases.

## Phase 2: update ramify-audit

**Outcome:** the audit uses the updated Ramify to attribute changes, select
verification and report separate project results.

1. Consume Phase 1 contracts. Remove external and always-excluded unowned
   changes from project selection; attribute owned-ignored changes to their
   module. Reserve unowned-path widening for paths outside the project.
   Deliver this as the phase's first iteration and publish it as its own
   audit release, before the remaining work packages, so that partial audits
   of the updated Ramify work again. The toolkit adopts that release at once,
   through the executable named below.
2. Implement committed `fullAuditPaths` policy, including precedence over
   `ignorePaths`, both sides of renames, evidence identity and baseline/reuse
   compatibility.
3. Establish the proposal's Vitest selection fixture against the pinned
   runner before writing selection code. Implement connected module groups,
   directory filters and exclusions. Aggregate every required command and
   configuration's evidence while retaining each invocation's failures,
   incomplete results, timing and machine-lock wait.
4. Compare expected owned, tracked test files with actual combined execution
   evidence. Missing evidence requires full verification or an indeterminate
   result. Implement requested nested audits in the prepared checkout, with
   separate project records, reuse, verdicts and an aggregate caller result.

**Completion gate:** qualify full and partial audits, selection and coverage,
committed configuration and evidence reuse, nested-project execution, failure
aggregation and locking against the Phase 1 artifact. The updated audit must
work with updated Ramify; the current agent is still outside this gate. The
gate closes on the published Ramify version, pinned exactly wherever the
audit's fixtures and tests name a toolkit version.

Once audit support is verified, adopt its policy in Ramify's own audit
definition: shared inputs in `fullAuditPaths` and all required test commands,
including any separate reference configuration. Verify Ramify through the
updated audit. This configuration adoption follows provider delivery and is
part of Phase 2 integration; Phase 1 must not require unsupported audit fields.
The toolkit currently invokes the audit executable installed under
`ramify-agent/`, which stays at its old pin until Phase 3. The detailed audit
plan names the executable used here and for the first audit release of work
package 1; it must be the Phase 2 artifact and must not require a change
beneath `ramify-agent/`.

**Handoff to Phase 3:** the verified audit artifact, its Ramify dependency,
configuration and result contracts, and evidence from their integration.

## Phase 3: update ramify-agent

**Outcome:** assignments and verification honor the same project boundaries
while consuming both updated providers.

1. Update provider dependencies and adapters. Make assignment authority cover
   module-owned contents, with child subtrees and owned-ignored trees included
   only explicitly. Carry tree-specific instructions and relay not-analyzed
   results through the write hook.
2. Implement scratch setup and lifetime: preserve existing Git ignore rules,
   create the assigned module's scratch directory, retain it through repairs
   and interrupted-iteration resume, and remove every module's scratch at
   iteration closure and stale scratch at readiness.
3. Remove the `outside-modules` purpose and per-file outside suites. Align
   scoped test selection with audit ownership and exclusions. Replace nested
   package walks and readiness tests with the audit configuration's workspace
   preparation, retaining guarded-configuration authorization.
4. Migrate the agent's fixture layout, declarations, scripts and compiler
   exclusions. Adopt its shared-input audit policy. Invoke nested audits at
   the final plan gate, retaining each project's result and project identity
   in findings and evidence.

**Completion gate:** verify write denials and explicit tree inclusion, scratch
cleanup and resume, scoped selection, readiness preparation, provider adapters
and final nested-audit reporting through real harness workflows. Complete an
integration run with all three updated artifacts and revision-bound evidence.
The run uses the published Ramify and ramify-audit versions through the
agent's committed exact pins.

## Authority and next planning step

The proposal records recipes and migration guidance. Ramify's
[principles](../../model/cross-module-importability.principles.md),
[importability specification](../../model/cross-module-importability.spec.md),
[module-description specification](../../model/module-description.spec.md),
[source interpretation specification](../../model/typescript-source-interpretation.spec.md),
[glossary](../../model/glossary.md) and
[architect principles](../../agents/module-architect.principles.md) own its
contracts. Proposal section 13 identifies the audit and agent authorities;
their detailed plans must reconcile those documents with actual provider
handoffs. Planning validation does not establish implementation or acceptance.

The detailed [Ramify-only Phase 1 plan](../project-boundary-ramify/main-plan.md)
is drafted. It proposes the grammar and public contracts, maps proposal sections
3–7, the Ramify list of section 10 and the Ramify migration to acceptance cases,
and defines dependency-ordered iterations under the
[planning workflow](../../development/implementation-workflow.md).
Its contracts require review before implementation.
Audit and agent detailed plans are authored in their respective later phases.
