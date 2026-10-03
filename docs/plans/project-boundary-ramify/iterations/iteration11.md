# Iteration 11: Batch boundary decisions and reports

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 10](iteration10.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Analysis decisions/report capability plus required strict serialization consumers. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Apply definite tree-boundary diagnostics before symbol selection/same-owner exemptions; include value/type/symbol-free/re-export/lazy forms and preserve resolution coverage limits.

## Read first

- [Contracts](../contracts.md): Source and exposure provenance; Reports, affected queries and freshness.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-12, PB1-14, PB1-15, PB1-16 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/src/analyze-project.ts`.
- `subs/analysis/src/report.ts`.
- `subs/analysis/src/report-data.ts`.
- `subs/analysis/src/interfaces/analysis.ts`.
- `subs/analysis/subs/model/src/decisions.ts`.
- `subs/analysis/src/evaluate-accesses.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Apply definite tree-boundary diagnostics before symbol selection/same-owner exemptions; include value/type/symbol-free/re-export/lazy forms and preserve resolution coverage limits.
2. Assign auxiliary ordinary profiles and provenance; source targets and report counts reflect actual interpreted inputs. Migrate changed report shapes and mechanical strict consumers together.
3. Add project-boundary-analysis.test.ts through public analyzeProject with independently expected denials, allowed same-owner/legal foreign controls and linked-package external answers.

## Matrix rows executed here

Exercise PB1-12, PB1-14, PB1-15, PB1-16 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-12, PB1-14, PB1-15, PB1-16.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/analysis/src/tests/project-boundary-analysis.test.ts
npm run build
npm run check:self
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

PB1-12/14/15/16 pass through real batch analysis; source stage completeness and definite errors remain independently reported.

Record `iteration11-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Completed batch behavior and report fixtures for retained/integration consumers.
