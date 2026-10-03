# Phase 1: Ramify project boundaries

**Date:** 2026-10-03. **Status:** draft implementation plan; contracts proposed,
implementation and acceptance pending. **Coordinator:**
[project-boundary master plan](../project-boundary-sequential/main-plan.md).

## Runnable outcome

A project declares its nested trees in `module.ramify`. Ramify checks every
owned compiler-source file outside those exclusions, including scripts outside
`src/`, enforces imports across the boundaries, and answers ownership and
affected queries for existing, new and deleted paths. The batch CLI, resident
service, changed-file hook and generated views describe the same revision.
Ramify's own checkout adopts the model and produces a verified local package
artifact for ramify-audit's Phase 2.

## Scope and prerequisites

Only the toolkit project is changed. `ramify-agent/` and `/ramify-audit` are
outside every iteration's write scope, including dependency installation,
generated files and documentation. The site and reference example are toolkit
migration targets under their declared owned-ignored trees. No audit-policy
implementation, grouped Vitest selection, `fullAuditPaths`, nested audit
execution or harness write/scratch lifecycle is implemented here.

This is an alpha migration: replace superseded toolkit contracts directly.
No compatibility adapter, old schema decoder or dual behavior is required.
Update toolkit consumers and legal exposure channels in the producing slice;
the old audit's partial mode and the old agent are not acceptance gates.

The adopted model documents and updated master plan are prerequisites, not
evidence of runtime support. [Source state](source-state.md) records what was
verified in this checkout; refresh it at execution.

The user reviews decisions R1–R6 of the [contracts](contracts.md) before
iteration 1 starts. R2, R4 and R6 already carry the user's decisions of
2026-10-03. Iteration 1 adopts the accepted
wording into the owning specifications and records the review receipt; it
does not decide them. No implementation iteration starts before that receipt.

## Agent coordination and protected documents

Execute with directly coordinated agents. The phase coordinator applies the
[master policy](../project-boundary-sequential/main-plan.md#agent-coordination-and-protected-documents)
and the [protected-document procedure](execution.md#protected-principles-and-specifications)
at every iteration. Each brief repeats the prohibition and requires a reviewed
protected-file comparison in its handoff; replacement and resumed agents
receive the same rule and current authoritative revision.

Project-owned `.principles.md` and `.spec.md` files are read-only for
implementation agents unless the coordinator authorizes a named file and exact
patch for a documented reason. The coordinator records the baseline, checks
actual changes and reviews their meaning before accepting work. Specification
corrections may express already accepted decisions; foundational changes or
new behavioral policy return to the user. A passing test gate cannot replace
this review.

Iteration 1's specification adoption covers only exact patches implementing
reviewed R1–R6 decisions. Its model/architecture write scope is not blanket
permission to edit protected documents. No principle change is expected.
Later protected changes require their own rationale and authorization, with
affected briefs and evidence updated after adoption.

## Contract and acceptance package

- [Contracts](contracts.md): concrete proposed grammar, ownership, source,
  report, freshness, transport and projection changes, with review decisions.
- [Authority alignment](alignment.md): proposal-to-specification-to-acceptance
  mapping and document owners.
- [Acceptance matrix](acceptance.md) and [case register](cases.json): independent
  expected results, fixtures, producing iterations and final qualification.
- [Fixture topology](fixtures.md): written reproducible provider expectations;
  consumer projects reconstruct it independently, without copying fixture files.
- [Execution and gates](execution.md): coordinator-owned protected-document
  baselines, approvals and handoff reviews; full-audit preflight, focused checks,
  explicit reference-command gates, direct-verification fallback and evidence.
- [Budgets](budgets.md): correctness-first policy, current numeric capacities and resource cases.
- [Handoff](handoff.md): immutable artifact, contract and receipt requirements
  for Phase 2, and the later registry publication requirement.

## Ordered iterations

The schedule is sequential. Each slice owns one capability or one module,
including the mechanical type/exposure relays that capability needs. Each is
bounded for one 250k-token context and has its own read-first list, verification,
exit and handoff. [Context sizing](sizing.md) explains the bounded read policy. [The manifest](iterations/manifest.json) registers this order.
Only the acceptance columns' named slices can close their cases; a declaration
or new type alone cannot claim behavior.

| Iteration | Capability / principal owner | Completion boundary |
| --- | --- | --- |
| [1](iterations/iteration1.md) | Contracts and verification readiness | User-accepted grammar/schema choices adopted in owning specs, baseline, audit-mode switch point and fallback recipe. |
| [2](iterations/iteration2.md) | Descriptions | New statement parser, spans and linker partition; existing exposure semantics retained. |
| [3](iterations/iteration3.md) | Project ownership | One pure containment/exclusion provider and revision-bound boundary metadata. |
| [4](iterations/iteration4.md) | Source provenance vocabulary | Auxiliary origin and boundary-target types propagated through toolkit producers and fixtures. |
| [5](iterations/iteration5.md) | Tooling access | Legal provider APIs for the root scripts and measurements. |
| [6](iterations/iteration6.md) | Reference harness boundary | No analyzed toolkit code imports from the harness tree; the tree leaves the scripts compiler scope; commands and test inventory unchanged. |
| [7](iterations/iteration7.md) | Toolkit boundary declarations | Explicit toolkit boundaries, fixture declarations and compiler/scratch exclusions prepared. |
| [8](iterations/iteration8.md) | Project discovery | Declared pruning, auxiliary inventory, migration diagnostics and compiler-selection warnings active. |
| [9](iterations/iteration9.md) | TypeScript resolution | Actual package-resolution provenance and explicit nested-tree targets. |
| [10](iterations/iteration10.md) | Exposure linking | Auxiliary originals cannot be exposed, including through forwarding aliases. |
| [11](iterations/iteration11.md) | Batch analysis | Boundary decisions, auxiliary imports, new reports and independent denial/positive cases. |
| [12](iterations/iteration12.md) | Project observation | Structural boundary updates, excluded observation retirement and auxiliary membership. |
| [13](iterations/iteration13.md) | Retained analysis | Incremental results match independent expectations and fresh batch results. |
| [14](iterations/iteration14.md) | Affected selection | Containment seeds, excluded outcomes, reverse-import closure and provider topology. |
| [15](iterations/iteration15.md) | Context synchronization | Explicit path dispositions without requiring excluded content to become observed input. |
| [16](iterations/iteration16.md) | Daemon/root transport | New schemas/codecs, legal relays, worker/IPC round trips and boundary-aware watcher registration. |
| [17](iterations/iteration17.md) | CLI | Changed-check outcomes, Git advisory warning, affected JSON and unchanged root selection. |
| [18](iterations/iteration18.md) | Projections | Architect boundary metadata, API views and explorer/measurement consistency. |
| [19](iterations/iteration19.md) | Site and teaching migration | Site consumes exported package entries; package version set to 0.2.0; current guides teach implemented behavior. |
| [20](iterations/iteration20.md) | Integration acceptance | All PB1 cases and full toolkit/reference regression on the exact candidate revision. |
| [21](iterations/iteration21.md) | Artifact and handoff | Packed isolated-install smoke, digest-bound receipt, merge qualification and Phase 2 inputs. |

Provider work precedes consumer wiring. Iterations 3–7 prepare facts and legal
imports before iteration 8 widens discovery. Interim slices may leave the
whole-tree behavior incomplete, and record what later slices still lack, but
each passes every required check of its own gate. Only iteration 20
establishes semantic acceptance. A substantial
defect reopens its producing slice and invalidates dependent receipts, rather
than turning the acceptance slice into an unrestricted repair assignment.

## Verification and phase completion

Each iteration gate audits a clean committed candidate with the existing
audit executable. Gates use the ordinary partial audit until the first
iteration that changes the affected output, expected to be iteration 14, and
explicit **full** mode from then on, as at the baseline and the final gate. A bounded executable probe of
installed `ramify-audit@0.3.2` passed without any Ramify executable in its
fixture; [the receipt](evidence/full-audit-preflight.json) proves that small
case, not compatibility with the future toolkit. Iteration 1 and every candidate
gate confirm the actual command/configuration used, following [execution.md](execution.md).

Every iteration gate additionally runs `npm run reference:cases` explicitly,
under the audit's machine test lock and its unchanged configuration. The toolkit audit definition does
not acquire that check or new audit-policy fields in Phase 1. Focused tests are
diagnostics; full regression, provider behavior, audit verdict and reference
acceptance are recorded separately.

Correctness under the new rules comes first: no rule is weakened to meet a
limit or timing target, and a missed earlier timing target is reported to the
user in the final handoff without stopping the plan, as [budgets.md](budgets.md#policy)
sets out.

The phase completes only when all PB1 cases pass, the full toolkit and reference
gates pass, public/CLI/resident/process behavior is demonstrated, and a clean
candidate's local package artifact and written topology are handed off. Any
old-audit incompatibility uses the defined direct-verification fallback, without
changes to audit or agent. Record a direct gate as direct evidence, not as an
audit pass. Runtime or contract defects in Ramify remain failures to fix.

Phase 1 may merge with that gate and local artifact. Until Phase 2's first audit
release, every subsequent toolkit commit is verified in full by the same policy;
toolkit-targeted harness runs remain unsupported during this interval. A Phase 2
consumer can start against the local artifact, but its completion requires the
published Ramify version, 0.2.0, and exact committed registry pin. Publication and any
provider repair follow the [handoff lifecycle](handoff.md), not a compatibility
implementation in this phase.
