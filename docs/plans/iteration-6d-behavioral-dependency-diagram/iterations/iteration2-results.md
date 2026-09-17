# Iteration 2 results: Project diagram facts and baselines

**Date:** 2026-09-17. **Mode:** direct work in worktree `/tmp/ramify-plan6d-behavioral-diagram`,
branch `feat/plan6d-behavioral-dependency-diagram`. It is based on iteration 1 at `b8fe807`.
The implementation commit is `b3552cb`. Both baselines were probed from that clean commit.

## Prerequisites

- Iteration 1's per-access facts are present. `dependency-behavior.test.ts` passed before editing (3 tests), including `path-facts`.
- The modularity projection passed before editing: `modularity.test.ts`, `modularity-candidate.test.ts` and `modularity-batch.test.ts`.

## Built

All source changes are owned by `analysis`. The exceptions are the root relay, the probe and the specification.

- `src/interfaces/dependency-diagram.ts`: the C2 types `DependencyBoundaryFact`, `DependencyDiagramFacts` and
  `DependencyDiagramOutcome`, with `DependencyDiagramInput` and `DependencyDiagramLimits` for the function input.
- `src/interfaces/modularity.ts`:
  - `ModularityView` gains the required `dependencyDiagram: Metric<DependencyDiagramFacts>`, after `cycles`.
  - `ModularityReport.schemaVersion` is now `ramify.modularity/2`.
  - The `behavior` field and its unit are unchanged.
- `src/dependency-diagram.ts`:
  - `projectDependencyDiagram` projects the production view.
  - `viewDependencyDiagram` is the per-view function. `projectModularity` calls it for both views with the view's
    already computed `behavior` metric.
  - Both reuse the existing modularity helpers: `completeReport`, `resolveOwnership`, `CoverageFacts`,
    `OriginalFacts`, `viewFacts`, `behaviorByOwner`/`behaviorTotal` and `byteOrder`/`sorted`. No second access
    graph is built.
- **Projection rules**, all documented in the specification:
  - Every role is resolved under the ownership in use. The consumer comes from the consumer file, the imported
    module from each access target file and the original owner from the defining file.
  - Consumer-owned originals are skipped.
  - Unused access facts contribute nothing.
  - Boundaries apply the precedence behavioral, unknown, non-behavioral.
  - `status` and `reasons` come from the contributing access results' decisions for this original only. The
    precedence is denied, then limited, then allowed.
  - The headline is regrouped by `(consumer, original)` and compared with the `behavior` metric (behavioral,
    non-behavioral and unknown counts). A difference throws.
  - The facts are deeply frozen copies. A diagram larger than `maxResultBytes` is refused with its observed and maximum bytes.
- `src/index.ts` (the `ramify.ts/analysis` package entry) exports `projectDependencyDiagram` and the new types.
- **Exposure:**
  - `analysis/module.ramify` A14 exposes `DependencyBoundaryFact`, `DependencyDiagramFacts`,
    `DependencyDiagramOutcome` and `BehavioralDependencyMetrics` to the parent.
  - Root `module.ramify` R9 re-exposes the same four declarations to descendants.
  - No runtime function is exposed.
- `docs/architecture/modularity-report.spec.md` adds:
  - the imported-module and boundary-dependency units;
  - section 10, "Dependency diagram facts", with scope, the unused-path rule, unknown, self-links, status,
    headline equality, modules, coverage, availability, byte limit and freezing;
  - the `ramify.modularity/2` rule, boundary ordering and the exposure note;
  - the Markdown section.
  The dependency glossary is unchanged.
- **Probe:** `markdown.ts` renders "Dependency diagram facts" after the behavioral estimate: one row per view, then
  the production imported-module and original-owner link tables. `baseline.ts` prints a diagram summary with its
  encoded bytes.
- **Tests:**
  - `modularity-fixture.ts` now supplies access facts and access results. A fact without an explicit `accesses`
    list gets one access fact per matching access, and the builder refuses a fact that has none.
  - The fixture adds the `dependency-report` spec (`dependencyReportSpec`).
  - The new `dependency-diagram.test.ts` has 8 tests.
  - `modularity.test.ts` adds two supporting accesses for facts that previously had none, and the schema version is updated.
  - `modularity-batch.test.ts` adds diagram assertions over a real batch report.
  - `markdown.test.ts` adds a diagram rendering case.

### `dependency-report` fixture

Consumer `a` reaches originals owned by `a/core` through imported modules `a/b` and `a/c`. It also reaches
`helper` through its own barrel. `a/empty` and the testing module `a/tools` have no dependency.

| Consumer file | Variant |
| --- | --- |
| `main.ts` | `act` called through B and imported unused through C; `Shape` type through B; `settings` data through C (access with a source limit); `helper` through the own barrel; controls: unused import, same-owner call, symbol-free load, external, outside-module, unresolved, missing export |
| `both.ts` | `act` called through B, type use through C |
| `partial.ts` | `Config` non-behavioral through B, unknown through C |
| `mixed.ts` | one access selecting the allowed `act` and the denied `secret` |
| `barrel.ts` | forwards `helper` from `a/core` |
| `tests/a.test.ts` | `act` called through B |

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| BD07 | Nine production boundaries. `act` through B (x01, x03, x17; three consumer files) and through C (x04) gives two boundaries and one behavioral headline unit. Headline 3/2; original-owner regrouping gives six units | pass |
| BD08 | x02 (unused through C) supports no boundary. Unused, same-owner, symbol-free, external, outside-module, unresolved and missing-export controls add no fact. Only-B-used gives only `a>a/b:act`. The self-barrel `a>a:helper` keeps original owner `a/core`. Real batch: every boundary has access IDs | pass |
| BD09 | `a>a/c:Config` is `unknown` with `behavior-limit/u`; `a>a/b:Config` stays a known non-behavioral lower bound; the original-owner unit is `unknown`. Coverage is `partial` with 1 unknown dependency and no displayed count | pass |
| BD10 | The test view has only `a>a/b:act` from the test file. Candidate `merge-c` (C merged into B, `mixed.ts` moved to B) resolves all three roles from the candidate: `a/b>a/b:act`, `importedFiles` `[b, c]`, headline 4/2, equal to `projectModularity`'s candidate view. Candidate `move-act` makes `act.ts` originals consumer-owned, and they are absent. The declared `OriginalId.owner` is ignored | pass |
| BD11 | x17 gives `a>a/b:secret` `denied [not-visible]` and `a>a/b:act` `allowed [exposed]`, both from the same fixture and from a report containing only `mixed.ts` facts. A source-limited access gives `limited`. Missing access results give `limited` | pass |
| BD12 | Byte-identical JSON after reversing modules, files, originals, accesses and facts, with another run ID. The facts are deeply frozen and share no object with the report. `modules` lists all six modules. The production `dependencyDiagram` equals `projectDependencyDiagram` and has the behavior metric's coverage. Headline equals `behavior` in both views; the view property order is recorded; the schema is `ramify.modularity/2`. Exact byte limit projects; one byte less is refused with `resource-limit` and observed/maximum bytes. `not-requested`, `capability-failed` and `analysis-incomplete` refusals match the metric. A failed classification is partial with 0/0. Completed zero is a measured zero. Unused-only access facts throw the headline assertion | pass |
| BD13 | Both clean baselines below | pass |

### Baselines (BD13)

Both baselines were run from `b3552cb` with a clean worktree and without `--allow-dirty`. The Collection Review run
temporarily moved the uncommitted toolkit artifacts aside so that the worktree stayed clean; the commit is the same.

| Artifact | Input ID | Coverage | Headline (behavioral / non-behavioral) | Boundary facts (b/nb/unknown) | Imported-module links (behavioral / any) | Original-owner links (behavioral / any) | Diagram bytes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `plan6d-toolkit` production | `input/1:fe5d6352…ac436` | complete | 69 / 348 | 69/395/0 | 18 / 48 | 18 / 50 | 315,613 |
| `plan6d-toolkit` test | same | complete | 46 / 126 | 46/127/0 | 22 / 36 | 22 / 38 | 110,705 |
| `plan6d-reference` production | `input/1:7e21fb92…5d6cf` | complete | 17 / 48 | 17/48/0 | 13 / 28 | 13 / 28 | 47,812 |
| `plan6d-reference` test | same | complete | 7 / 13 | 7/13/0 | 7 / 16 | 7 / 16 | 14,831 |

Full input IDs, check outcome (`passed` for both) and commit are in the JSON artifacts. Other facts:

- In the toolkit production view, 77 boundaries have an imported module other than the original owner (forwarding),
  and 46 have imported module equal to the consumer (own barrels).
- Every fact in both artifacts is `allowed`.
- The document sizes are 1,001,658 and 407,778 bytes of JSON.

**Toolkit count change.** The recorded baseline (`baseline.json`, `be4175c`) and the plan-creation state have 347
non-behavioral dependencies; this artifact has 348. Throwaway probes of the Ramify source at `70d7f46` and
`b8fe807` gave 347 and 348, each from a scratch detached worktree using this commit's analyzer. The single
difference is `ramify/analysis` (91 → 92). Iteration 1 added the exported interface `DependencyBehaviorAccessFact`
to `dependency-behavior.ts`. The analysis package entry's existing `export type *` forwards it, which adds the
non-behavioral unit `(ramify/analysis, DependencyBehaviorAccessFact)`. Iteration 2's own import of
`BehaviorClassification` adds no unit, because the same entry already forwarded that original. Collection Review
equals the plan-creation observation of 17 and 48.

## Verification

```sh
npx vitest run subs/analysis/src/tests/modularity.test.ts                               # 20 passed
npx vitest run subs/analysis/src/tests/modularity-batch.test.ts                         # 1 passed
npx vitest run subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts      # 3 passed
npx vitest run subs/analysis/src/tests/dependency-diagram.test.ts                       # 8 passed
npx vitest run subs/analysis/src/tests/modularity-candidate.test.ts                     # 11 passed
npx vitest run subs/analysis/src/tests/change-affinity.test.ts                          # 6 passed
npx vitest run -c scripts/probes/modularity/vitest.config.ts                            # 8 passed
npm run type-check                                                                      # clean
npm run build                                                                           # built
npm run check:self    # passed: 15 owners, 377 source files, 0 errors, 0 warnings, 0 analysis limits, 0 denied
dist/src/ramify check --root . --batch                                                  # same result, batch mode
npm run probe:modularity -- --name plan6d-toolkit                                       # written, clean b3552cb
npm run probe:modularity -- --root examples/collection-review --name plan6d-reference   # written, clean b3552cb
```

The resident daemon that `check:self` used was stopped with `dist/src/ramify daemon stop`. The full test suite was not run.

## Deviations

- **Per-view function.** `projectDependencyDiagram` keeps the C2 signature and projects the production view.
  `projectModularity` calls the shared `viewDependencyDiagram` for both views, as C2 requires.
- **Unused paths.** An `unused` access fact contributes nothing to a boundary, so a boundary never lists files or
  access IDs of a path that was imported but not referenced. C2 omits unused facts but does not say whether an
  unused path can support a used boundary of the same triple. Classification is unaffected.
- **Missing decision.** An access result that is missing, or that has no decision for the original, makes the fact
  `limited`. C2 defines only the other limited causes.
- **Modules.** `modules` lists the whole ownership tree in use. Under declared ownership this is every
  `Model.modules` entry, including testing modules and modules without production files. That list matches the
  explorer's modules, so no selectable module is absent (C5).
- **Coverage.** Diagram coverage is the view's `behavior` metric coverage. A `failed` classification therefore
  projects as partial with no boundaries, as the metric does, rather than as the refusal `capability-failed`. That
  refusal means requested without facts.
- **Invalid candidate.** `DependencyDiagramOutcome` has no invalid-ownership state, so an invalid candidate throws a
  `TypeError`. The resident path never passes a candidate.
- **Package entry.** `projectDependencyDiagram` is exported from `ramify.ts/analysis`, but not through
  `module.ramify`.
- **Exposure.** `BehavioralDependencyMetrics` is exposed beside the three C2 result types, because
  `DependencyDiagramFacts.headline` names it.

## Limitations

- The projection trusts the report. An access fact that names no application access, or boundaries that disagree
  with the `behavior` metric, throws rather than returning an outcome. The analyzer in iteration 3 should treat a
  throw as `analysis-failed`.
- Both real baselines contain only `allowed` boundaries and no unknown facts. The denied, limited and unknown paths
  are therefore witnessed only by the pure fixture. Real denied and unknown evidence comes from the forwarding and
  mutation fixtures in later iterations.
- Diagram bytes are measured as compact JSON. The artifacts are pretty-printed documents and are larger.

## Handoff

- **Iteration 3** receives:
  - `projectDependencyDiagram(input: DependencyDiagramInput): DependencyDiagramOutcome` in
    `subs/analysis/src/dependency-diagram.ts`, with `maxResultBytes` (16 MiB);
  - the artifact input IDs `input/1:fe5d6352e315cd84a3fd2d15f10911417dd8f7e8f78c3bdda05c33895abac436` (toolkit) and
    `input/1:7e21fb92685210b6b8a8e61f241637bdb91c0549353da4821987bdd41515d6cf` (Collection Review), both at `b3552cb`;
  - encoded production diagram sizes of 315,613 and 47,812 bytes, with complete coverage;
  - the equality target for supplied-import classification: the production `dependencyDiagram` in
    `plan6d-toolkit.json` and `plan6d-reference.json` for the same inputs.

  The analyzer must supply a report copy that carries `snapshot.results`, because status comes from them. It must
  map a throw, or a `failed` behavior status, to `unavailable/analysis-failed` if that is the intended browser state.
- **Iterations 4 and 5** can import `DependencyDiagramFacts`, `DependencyBoundaryFact`, `DependencyDiagramOutcome`
  and `BehavioralDependencyMetrics` through root's R9 relay (`expose-sub … from analysis to descendants`). Root
  source imports none of them.
