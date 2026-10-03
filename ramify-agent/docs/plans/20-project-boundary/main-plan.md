# Plan 20: module ownership, included trees and scratch

**Date:** 2026-10-01. **Status:** draft; implementation and acceptance pending.
This is the harness project-local plan coordinated by the [single coordinating plan](../../../../docs/plans/project-boundary-sequential/main-plan.md)
for the [project-boundary design](../../../../docs/architecture/project-boundary.proposal.md).
Work executes in ramify-agent under its own instructions and workflow; this
plan follows this project's own workflow.

## Authority and existing behavior

Read [harness principles](../../harness.principles.md),
[harness specification](../../harness.spec.md), [glossary](../../glossary.md),
[CheckFinding principles](../../check-findings.principles.md) and
[specification](../../check-findings.spec.md). Keep one ordinary assignment
lifecycle as delivered by [Plan 18](../18-shared-iteration-lifecycle/main-plan.md),
and preserve [Plan 17](../17-machine-test-lock/main-plan.md)'s lock and bounds.
Their historical live-acceptance gaps are not silently closed by this plan.

Inspected enclosing commit `3fba41bdf3ce7bfd71645893c597708337f202f0`:
`subs/harness/src/work/scope.ts` scopes `src`, description and README and
still has `outside-modules` locations; `run/readiness.ts` calls nested-package
discovery; `run/audit-workspaces.ts` owns preparation integration. The existing
scope, test-selection, readiness, session-lifecycle and audit-workspace tests
are regression anchors. Recheck source before implementation and reconcile
with any continuing Plan 18 work; preserve unrelated dirty documents.

## Execution

Use this project's own agent workflow in a ramify-agent execution worktree.
Follow `AGENTS.md`; commands run from the project root. The coordinating toolkit
plan supplies handoff requirements, not this project's execution authority.

## Provider prerequisites

Accepted toolkit T8 supplies `ramify affected` v2 ownership metadata, explicit excluded
and not-analyzed outcomes, nested-tree parsing and updated generated views.
Audit A5 (`ramify-audit:docs/plans/04-project-boundary/main-plan.md`), followed by toolkit A6 adoption, supplies
public grouping/coverage operations, multi-command execution evidence,
`fullAuditPaths` and `--nested`/`includeNested`. Review provider signatures
first; do not invent harness-local equivalents while waiting.

Upgrade each exact registry pin and its lockfile together and reinstall before
acceptance. H3a adopts the audit provider. H4a adopts the host toolkit pin in
the same candidate as its required fixture/auxiliary migration, preserving a
green self-check. Before H4a, H1/H3 tests use isolated exact-toolkit-package
fixtures; they do not activate half-migrated host boundary behavior. Runtime toolkit access remains through the project-local CLI and
generated files; toolkit library imports are types/schemas only. Audit's
runtime helpers are consumed through its public package entry. No relative
toolkit imports, workspace source aliases or duplicated selection engine.

H1 begins only after the complete T8 toolkit and A6 audit phase gates.
This local plan executes eight iterations, H1 through H6, in its own manifest after the coordinator records T8/A5/A6 receipts; the toolkit Studio manifest never launches these iterations.

## Proposed implementation contracts

### Scope and ordinary assignment

An assignment covers its module's owned contents, minus unselected child
subtrees, all ignored trees unless included, and every unowned external or
always-excluded path. Scratch remains in scope. Included children mean whole
subtrees; their ignored trees still require explicit inclusion. Add
`includedTrees: { path: string; reason: string; instructions: string }[]`
to the shared assignment/scope schema for both ordinary and capability work.
Paths are project-relative and must exactly match owned-ignored declarations
of a selected owner. Require nonempty reason/instructions, deduplicate, and
reject undeclared, external or partial-tree selections.

Resolve canonical paths using the nearest existing ancestor for new files;
reject symlink escapes. Retain guarded configuration and protected-file
restrictions inside otherwise authorized ownership. Root configuration work
requires the root's authorization; a child may not grant itself root access.
Preserve module `src` as the default work/search directory; auxiliary-file
work deliberately addresses its authorized actual location.

The prompt says ignored content is not source-checked, the owner's tests and
README define its meaning, intentionally broken fixtures are not repaired,
and a contained project's instructions/commands apply from its root. Scope
expansion uses the existing architect request/`unsuitable` scope response;
there is no new iteration kind. Substantial nested-project changes use a run
rooted there. Write hooks relay not-analyzed with reason/owner; neither that
answer nor a passing owner test grants additional write authority.

Stored scope captures boundary/input identity. A boundary edit requires scope
revalidation before the next write; it must not silently widen a previously
authorized assignment. Resume retains the stored assignment and verifies it
against current facts. Old assignments using `outside-modules` require explicit
architect reissuance into owned scope; keep historical records readable and
never silently reinterpret old permission as new authority.

### Scratch lifetime

Before scratch use, harness setup adds missing anchored `<module>/src/tmp/`
rules to the project's `.gitignore`, preserving existing content and avoiding
duplicates. Verify effective ignore behavior, including later negations. This
is recorded setup authority, independent of an engineer's module write scope;
a child assignment acquires no root write permission. Repeat before scratch
creation for newly declared modules. Compiler exclusions remain the project's
responsibility; do not infer them from Git settings. A real setup failure is
explicit, but a missing rule is repaired by setup rather than assigned to a
person as a readiness prerequisite.

Create assigned-module scratch at iteration start. Preserve it through repair,
correction and interrupted resumption. On every terminal close (success,
partial, failure or abort), remove scratch for every module of this run's
project, including modules added or removed during the iteration using the
captured union of known roots. Do not cross declared external/ignored trees
or clean another project. Never follow scratch symlinks; unlink the scratch
entry or reject unsafe cleanup with explicit evidence. Readiness distinguishes
resuming the same interrupted iteration from a new run: only new-run cleanup
removes earlier-run leftovers. Preserve evidence in durable records before
cleanup; cleanup failure cannot be reported as completed cleanup. User files
in the reserved scratch directory have the same lifetime.

### Verification and preparation

Use audit's provider operations for ownership grouping and combined coverage;
select the assigned owner plus explicitly included child subtrees. Include
all required declared runner configurations. Evidence obligations do not permit
ignored fixture tests to run as enclosing tests. Remove outside-module per-file
suites and warning suppression; preserve the scoped check's provider-supported
full fallback without applying it indiscriminately to unrelated checks.
Consume producer failures/completion exactly; no shadow tally or inference of
repair responsibility from failure paths/counts.

Remove manifest walking, nested readiness test execution and its switch.
Read dependency/preparation package directories from committed audit workspace
configuration. Validate their containment and installed dependencies and use
the same set for audit-worktree links. An external package directory explicitly
listed for dependency preparation does not become writable assignment scope
or a nested audit target. Owned-tree edits receive owner tests during ordinary
iterations, and separate nested-project verification at the final gate.

Final gate requests `includeNested: true`. Store the provider invocation
envelope and each project's evidence reference; overall acceptance requires
every required project verdict. Findings identify project root, evidence key,
check ID and candidate revision, attributed to the enclosing module owning
the tree. Repair ownership remains the architect/engineer's decision. A root
check with the same name cannot settle a child failure; only that project's
same check on the repaired candidate can. A reused parent is not a shortcut
around child verification. Unknown/incomplete nested records block acceptance.

## Iterations

| Local | ID | Capability | Prerequisite / exit |
| --- | --- | --- | --- |
| 1 | H1 | Shared ownership scope and included-tree contract | T8/A5/A6; HB01–HB04; new toolkit exercised through exact-package fixtures. |
| 2 | H2 | Scratch setup and lifecycle cleanup | H1; HB05–HB07, shared lifecycle for both issuing architects. |
| 3 | H3a | Consume scoped provider verification | H2; adopt audit pin, scoped provider coverage HB08 and HB12 slice. |
| 4 | H3b | Integrate nested final-gate evidence and findings | H3a; nested final gate and project-qualified evidence HB09/HB12 slice. |
| 5 | H4a | Migrate project fixtures and auxiliary source | H3b; fixture/auxiliary migration and host toolkit pin activated atomically; HB10. |
| 6 | H4b | Use explicit package preparation at readiness | H4a; explicit package preparation/readiness/worktree links; HB11. |
| 7 | H5 | Production-path mechanics and project acceptance | H4b; deterministic provider acceptance and full project audit; no substantial feature repair. |
| 8 | H6 | Accept the complete provider-to-agent workflow | H5; workflow witness, PB15 and all 42 case accounting; defects reopen their owner. |

Local execution order is in [the manifest](iterations/manifest.json). H3 and H4
remain requirement families; their lettered slices are the executable tasks.
Each iteration has a bounded context packet and predecessor receipt. H5/H6
accept completed behavior; substantial repairs return to their implementation
owner and invalidate affected receipts. The coordinator's
`ramify:docs/plans/project-boundary-sequential/sizing.md` records the bounds.

Harness owns behavior/contracts; evidence adapters handle CLI/package calls;
composition updates new variants and web projections only as needed to retain
project identities. No new UI feature or separate orchestration loop.

## Migration

Move root `fixtures/` under `subs/harness/fixtures/` and declare the ignored
trees in their actual owning module; fix test/read paths. Declare the scenarios
sample project beneath its own owner and exclude it from compilation. Retain
`spikes` as declared ignored data or remove only obsolete content under an
explicit implementation decision; this plan proposes retaining it. Analyze
root scripts as auxiliary source and fix forbidden imports using actual
provider contracts. Add compiler scratch exclusions, shared `fullAuditPaths`,
all required runner commands and explicit audit preparation package directories.
Do not overwrite independently edited Plan 17/18 documents to claim completion.

## Acceptance ownership

HB01–HB04 close in H1; HB05–HB07 in H2; HB08 in H3a; HB09 in H3b;
HB10 in H4a; HB11 in H4b. HB12 combines H3a/H3b adapters, H4a exact
package adoption, H5 mechanical evidence and H6's complete workflow witness.
No partial slice is a passing result for the full case.

## Acceptance

All rows pending. Fixtures use the same topology/expected ownership as toolkit
PB01–PB15 and audit AB01–AB15; scope results are asserted independently.

| ID | Required observation |
| --- | --- |
| HB01 | Child may write owned docs/config/auxiliary/scratch; root and sibling writes denied; protected configuration remains guarded; new-file symlink escape denied. |
| HB02 | Ignored-tree write denied by default; exact inclusion with reason/instructions permits the whole tree only; external and partial-tree requests denied. |
| HB03 | Ordinary and capability assignments capture identical scope semantics and prompt requirements; engineer scope escalation uses existing lifecycle. |
| HB04 | Excluded hook returns not-analyzed; boundary changes revalidate; old outside-modules resume requires scope reissuance, not implicit widening. |
| HB05 | Setup adds missing effective scratch ignore rules, preserves authored rules, is idempotent, handles new modules and negations, and grants no root write authority to a child assignment. |
| HB06 | Repair/interruption/resume retain scratch; all terminal outcomes clean every project module; new-run readiness cleans old scratch. |
| HB07 | Evidence survives cleanup; removed-module scratch is handled; symlinks cannot delete external content; cleanup errors remain explicit. |
| HB08 | Audit and harness select identical expected files across main/separate configs and groups; missing reports/tests prevent pass; failures and lock waits survive aggregation. |
| HB09 | Final gate requests nested audits; failing/reused/indeterminate children remain project-qualified; another project's same-named check cannot settle the failure. |
| HB10 | Moved fixture/sample data are owned-ignored and compiler-excluded; root scripts analyzed; ordinary fixtures remain intentionally invalid where tests require it. |
| HB11 | Readiness/worktrees use declared preparation packages without manifest discovery or nested tests; missing required dependencies remain explicit readiness failure. |
| HB12 | Actual packed/released providers and project-local CLI exercise edit → commit → audit → repair/resume → final nested verdict with immutable source binding. |

Run focused owner tests first; full regression suites run only through ramify-audit, then this project's `npm run type-check`,
`npm run build` and `npm run check:self` as defined at execution.
The final clean committed audit runs with the project-local executable and
`--project-root ramify-agent --cwd . --full --nested --json` from the enclosing
Git checkout once the provider delivers the flag. Retain ordinary check budgets,
per-group lock accounting and bounded recovery; lifecycle assertions use a fake
clock and actual filesystem/process adapters where behavior requires them.
One controlled fixture workflow establishes mechanics without spending a live
model trial or claiming Plan 16/18 semantic acceptance. Archive candidate
revisions, pins, configurations, file coverage and separate project refs.
