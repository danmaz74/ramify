# Iteration 1 results: reuse baseline and compatibility contract

**Status:** complete. **Plan:** [Plan 6](../main-plan.md). **Iteration:**
[iteration1.md](iteration1.md).

## Summary

Rechecked the extraction source at the exact cucumber-viz commit, froze the
projection, procedure, detail, module and local-web contracts, and reconciled
them with Ramify's current report, session, contexts and daemon interfaces at
Ramify commit `71643d522eb053336e4c01fcf9836ec52b58fbad`. No production source
or module declaration was changed.

Two planning defects were corrected before implementation:

- one `SourceAccess` can contain several selections and decisions, so the view
  model now nests selections under one access occurrence rather than exposing
  singular selection fields that would lose facts or inflate counts;
- the reusable page-view test contains thirteen tests, not eleven. Together
  with the seven graph tests, the frozen source inventory has twenty named
  reuse obligations.

## EX01 source baseline

The clean local cucumber-viz checkout resolved to
`44b7f30e0fdfda79ead8363ef4c85c100e36fda0`. `git ls-tree` resolved all eleven
component, page, style and test paths. Their blob IDs and destinations are in
[lift-inventory.md](../lift-inventory.md). The obsolete `domain-sub-apps/`
paths do not resolve at that commit; `src/domains/module-architecture/` is the
correct source root, while the stylesheet is repository-root `ui/styles.css`.

Every lift candidate has a destination or an explicit collapse outcome.
`ModuleGraph.tsx` is the only collapse: its fourteen-line forwarding body does
not become a separate destination file. Both reusable test files have a full
named-test inventory.

## Provider and DTO review

`AnalysisReport.snapshot` supplies inventory modules/files/purposes, source
areas, catalog, linked descriptions, model, accesses and access results.
`AnalysisReport` supplies registry, coverage, outcome and summary. The view
model names the pure computations over those fields and now preserves each
multi-selection access faithfully. A successful projection requires the
complete structural snapshot; an invalid or unavailable report cannot become
an empty model.

`RetainedSourceAnalysis.details` is the existing bounded provider. The frozen
bridge adds only current-revision delegation through `RetainedSession`,
contexts and the daemon service. It uses the existing 2,048/512/8/32-MiB
detail limits, accepts at most 50 unique requests, and explicitly returns
superseded, compiler-released and unavailable states. It introduces no source
interpretation algorithm and cannot return a newer revision's details for an
older view.

## Frozen artifacts and successor handoff

- [view-model.md](../view-model.md) is the DTO, mapping, count-unit, stable-ID
  and 16-MiB projection contract for iterations 2-5.
- [contracts.md](../contracts.md) freezes `projectView`, `explorerDetails` and
  `contextStatus`; the narrow existing-owner detail additions; the four module
  headers and exposure paths; the local HTTP origin/discovery record; and the
  completion reuse categories.
- [lift-inventory.md](../lift-inventory.md) is the exact source and test
  baseline for iterations 2, 3 and 7.

The compatibility DTO remains owned once by `project-view`. The dispatch-only
projection returns a structurally inferred result and does not illegally
import a `ui`-tagged type; the integration testing owner performs the
compile-time assignment witness. This keeps the accepted four-owner layout
without duplicating the DTO or weakening tag semantics.

No provider gap or unresolved product choice remains for iterations 2-6.

## Verification

| Check | Result |
| --- | --- |
| Exact cucumber-viz revision, `git ls-tree` for all eleven source artifacts, and `wc -l` for the ten code/test files | Passed; full commit, blobs and recorded line counts agree. |
| Named test extraction with `rg -n '\b(it|test)\('` | Passed; seven graph and thirteen page-view tests. |
| Current Ramify interface review (`AnalysisReport`, `RetainedSession`, `ContextStatus`, `CheckOutcome`, `RamifyService`, `SymbolDetail*`) | Passed; every DTO field has a report source or named pure computation, and the detail bridge reaches the existing bounded provider. |
| Relative Markdown-link resolution for every Plan 6 artifact | Passed. |
| Trailing-whitespace scan over the iteration-owned artifacts | Passed. |

Full type, runtime and browser suites were not run: iteration 1 changes only
plan artifacts and its required gate is EX01 plus contract consistency.
