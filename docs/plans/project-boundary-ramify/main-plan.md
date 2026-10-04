# Phase 1: Ramify project boundaries

**Date:** 2026-10-03. **Status:** implementation plan; contracts accepted and
adopted in the owning specifications (commit `6d0c66f0`), implementation and
acceptance pending. **Coordinator:**
[project-boundary master plan](../project-boundary-sequential/main-plan.md).

## Runnable outcome

A project declares its root with the root marker and its nested trees in
`module.ramify`. Ramify checks every
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

The user reviewed and accepted decisions R1–R6 of the [contracts](contracts.md)
on 2026-10-03. Iteration 1 adopted the accepted wording into the owning
specifications (commit `6d0c66f0`) and recorded the review receipt in
[its results](iterations/iteration1-results.md); it did not decide them.
Later that day the user decided R7, the
[root marker](contracts.md#root-marker): a project root declares itself with
`root module <name>`, and root selection, `--root` and discovery validity
follow the marker. Every existing toolkit root, and every toolkit generator or
fixture that writes one, migrates to it.

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

Iteration 1's specification adoption covered only exact patches implementing
the accepted R1–R6 decisions. No principle change is expected. Later protected
changes require their own rationale and authorization, with affected briefs and
evidence updated after adoption. The user authorized R7's specification
changes: the marker's syntax and validity in the
[module description specification](../../model/module-description.spec.md),
and "Selecting the project" in the
[CLI invocation specification](../../architecture/cli-invocation.spec.md#selecting-the-project).
The coordinator adopts those exact patches, with the matching glossary and
proposal edits, before iteration 3A and records the receipt in that
iteration's handoff. The importability principles already require an explicit
application root, so R7 needs no principles edit. Iterations 3B, 17 and 19
propose their specification edits to the coordinator as exact patches; they
do not edit a protected file.

## Contract and acceptance package

- [Contracts](contracts.md): concrete accepted grammar, ownership, source,
  report, freshness, transport and projection changes, with review decisions
  and the slice where each schema version advances.
- [Authority alignment](alignment.md): proposal-to-specification-to-acceptance
  mapping and document owners.
- [Acceptance matrix](acceptance.md) and [case register](cases.json): independent
  expected results, fixtures, producing iterations and final qualification.
- [Fixture topology](fixtures.md): written reproducible provider expectations;
  consumer projects reconstruct it independently, without copying fixture files.
- [Execution and gates](execution.md): coordinator-owned protected-document
  baselines, approvals and handoff reviews; full-audit gates, focused checks,
  explicit reference-command gates, direct-verification fallback and evidence.
- [Budgets](budgets.md): correctness-first policy, current numeric capacities and resource cases.
- [Handoff](handoff.md): immutable artifact, contract and receipt requirements
  for Phase 2, and the later registry publication requirement.

## Ordered iterations

The schedule is sequential. Each slice owns one capability or one module,
including the mechanical type/exposure relays that capability needs. Each is
bounded for one 250k-token context and has its own read-first list, verification,
exit and handoff. [Context sizing](sizing.md) explains the bounded read policy. [The manifest](iterations/manifest.json) registers this order.
Iterations 3A and 3B were inserted after iteration 3 for R7 without
renumbering, so existing case, contract and receipt references keep their numbers.
Only the acceptance columns' named slices can close their cases; a declaration
or new type alone cannot claim behavior.

| Iteration | Capability / principal owner | Completion boundary |
| --- | --- | --- |
| [1](iterations/iteration1.md) | Contracts and verification readiness | User-accepted grammar/schema choices adopted in owning specs, schema inventory, full-audit baseline and fallback recipe. |
| [2](iterations/iteration2.md) | Descriptions | New statement parser, spans and linker partition; existing exposure semantics retained. |
| [3](iterations/iteration3.md) | Project ownership | One pure containment/exclusion provider and revision-bound boundary metadata. |
| [3A](iterations/iteration3a.md) | Root marker syntax and migration | Parser and header field for `root module`; every toolkit root, generator and fixture marked; selection unchanged. |
| [3B](iterations/iteration3b.md) | Root selection and validity | Nearest-marked climb, `--root` validity, unmarked-root and marked-description diagnostics, enforced on the migrated toolkit. |
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
| [17](iterations/iteration17.md) | CLI | Changed-check outcomes, Git advisory warning, affected JSON and root-marker selection through real CLI processes. |
| [18](iterations/iteration18.md) | Projections | Architect boundary metadata, API views and explorer/measurement consistency. |
| [19](iterations/iteration19.md) | Site and teaching migration | Site consumes exported package entries; package version set to 0.2.0; current guides teach implemented behavior. |
| [20](iterations/iteration20.md) | Integration acceptance | All PB1 cases and full toolkit/reference regression on the exact candidate revision. |
| [21](iterations/iteration21.md) | Artifact and handoff | Packed isolated-install smoke, digest-bound receipt, merge qualification and Phase 2 inputs. |

The baseline at `33d8a739` is red: one toolkit test and nine reference
instances fail ([iteration 1 results](iterations/iteration1-results.md#baseline-gate)).
A baseline-repair slice, outside the numbered iterations and the manifest,
repairs them before iteration 2 and passes the full gate, as
[execution.md](execution.md#before-the-first-implementation-iteration) records.

Provider work precedes consumer wiring. Iterations 3–7 prepare facts and legal
imports before iteration 8 widens discovery. Iteration 3A marks every toolkit
root before iteration 3B enforces the marker, because an unmarked root becomes
invalid the moment the rule is enforced; from 3A on, every fixture or generator
a slice adds writes a marked root and unmarked children. Interim slices may leave the
whole-tree behavior incomplete, and record what later slices still lack, but
each passes every required check of its own gate. Only iteration 20
establishes semantic acceptance. A substantial
defect reopens its producing slice and invalidates dependent receipts, rather
than turning the acceptance slice into an unrestricted repair assignment.

## Verification and phase completion

Every iteration gate audits a clean committed candidate with the existing
audit executable in explicit **full** mode:
`ramify-audit audit --cwd <checkout> --full --force --json`. Iteration 1 found
that the installed audit stops reading the candidate's affected answer by
iteration 8 at the latest, and at iteration 3 once that slice advances the
affected schemas; a full audit takes about four minutes, so no gate uses the
partial audit. A bounded executable probe of
installed `ramify-audit@0.3.2` passed without any Ramify executable in its
fixture; [the receipt](evidence/full-audit-preflight.json) proves that small
case, not compatibility with the future toolkit. Every candidate gate confirms
the actual command/configuration used, following [execution.md](execution.md#iteration-gates).

Every iteration gate additionally runs `npm run reference:cases` explicitly,
under the audit's machine test lock and its unchanged configuration. The toolkit audit definition does
not acquire that check or new audit-policy fields in Phase 1. Focused tests are
diagnostics; full regression, provider behavior, audit verdict and reference
acceptance are recorded separately.

R6 fixes the reference harness's location, commands and test inventory, not
its expected values. A slice that changes an output the harness asserts, such
as a schema identifier, warning or report field, updates the harness's expected
values for that output in the same slice. It reasons each new expectation
independently from the contracts, never by copying the candidate's output, and
deletes or skips no case. Iterations 2, 3, 3A, 3B, 4, 8, 9, 11 and 14–18 are known to
change asserted outputs; their briefs and the
[scope manifest](iteration-scope.json) include those expected values.

A document's schema version advances in the slice that first changes its
payload shape, so an outdated reader fails rather than misreads (R3). Later
slices extend that version before the phase's handoff; the
[contracts](contracts.md#schema-versions) list where each version advances.

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

## Open questions for the user

None remain open; the decided questions follow.

## Decided questions

1. **Absent tool directories in iteration 7.** Decided by the user on
   2026-10-03: iteration 7 declares all four directories `.reference-work`,
   `.history`, `.cucumber-viz` and `.playwright-mcp` as `external` in the
   toolkit root `module.ramify`. They are not always-excluded paths, so
   without a declaration discovery would enter them. An external directory may
   be absent, so the audit's fresh checkout, which lacks all four, keeps a
   valid declaration. `examples/collection-review/.reference-work` lies inside
   the declared example tree, so it needs no declaration and cannot carry one.
2. **Root selection inside an owned-ignored tree beneath `subs/`.** Resolved
   by the root marker (R7, decided by the user on 2026-10-03). The climb
   selects the nearest description carrying the marker, and unmarked
   descriptions never stop it, so a project in an owned-ignored or external
   tree beneath `subs/` is selected from inside it because its root
   description is marked. The `subs/`-based climb is replaced, and the
   proposal's statement holds without narrowing.
3. **The modularity probe's Markdown test.** Decided by the user on
   2026-10-03: `scripts/probes/modularity/markdown.test.ts` moves into the
   harness tree as `scripts/reference-harness/modularity-markdown.test.ts`
   (iteration 6), a one-file addition to the harness test inventory that R6
   fixed; `reference:cases` counts 37 files and 393 tests from that slice.
4. **Additional toolkit declarations in iteration 7.** Decided by the user on
   2026-10-03: `docs` and the probe fixture directories
   `scripts/probes/fixtures/compiler-api` and
   `scripts/probes/fixtures/plan2a-symbol-details` are `owned-ignored` at the
   root; `scripts/probes/fast-check` and `scripts/spikes` stay undeclared and
   are analyzed as auxiliary source.
5. **The explorer's browser model.** Decided by the user on 2026-10-03: its
   embedded `SourceOrigin.auxiliary` member does not advance
   `ramify.explorer-http/1`; see [schema versions](contracts.md#schema-versions).
6. **The example's own `.reference-work`.** Decided by the user on
   2026-10-04: `examples/collection-review/module.ramify` keeps
   `external ".reference-work"`, as committed in iteration 8A.
7. **Identity of originals defined in auxiliary source.** Decided by the user
   on 2026-10-04: an original keeps the `src/`-relative file form, and an
   auxiliary file's path admits a leading `../`, such as
   `../scripts/build-production.ts`, with the origin flagged `auxiliary`.
8. **The modularity and dependency-analyzer probes.** Decided by the user on
   2026-10-04: `scripts/probes/modularity` and
   `scripts/probes/dependency-analyzer` move into the analysis module as its
   own auxiliary source, with the path patch to the modularity report
   specification. Iteration 5's assumption that their package
   self-references are coverage notes was wrong: the resolver maps them to
   analysis source.
9. **JavaScript files when the configuration does not admit JavaScript.**
   Decided by the user on 2026-10-04: a `.js`, `.mjs` or `.cjs` file is
   compiler source only when the root configuration admits JavaScript;
   otherwise it is an inert owned file. The example gains no `allowJs`.
