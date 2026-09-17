# Modularity candidate evaluation: Candidates A and B

**Date:** 2026-09-17. **Status:** Measured evaluation and recommendation. No
source, `module.ramify` declaration or module tree is changed by this document;
every candidate below still needs owner review before a step-7 move.

**Revision:** `d9aa856156cc959ead01fbacce53b85672b3cf0d`, clean worktree. The
analysis revision is
`batch:input/1:37bbe45442bcc4521fc6868ad6afe8ea55bffaef32f5600c20919f4fccc6c7b5`,
with check `passed` and complete analysis and modularity coverage in every
evaluation.

This document is execution step 6 of the
[project modularity analysis](2026-09-17-project-modularity-analysis.md#6-evaluate-the-first-two-candidates).
Measures, units and verdict directions follow the
[modularity report specification](../architecture/modularity-report.spec.md).
The authoritative evidence is
[`candidates-ab.json`](../../scripts/probes/results/modularity/candidates-ab.json),
rendered as [`candidates-ab.md`](../../scripts/probes/results/modularity/candidates-ab.md).

## Method

### Commands

```sh
npm run build
npm run probe:modularity -- \
  --candidate scripts/probes/modularity/candidates/A1-mechanics-13.json \
  --candidate scripts/probes/modularity/candidates/A2-retained-session-15.json \
  --candidate scripts/probes/modularity/candidates/A3-retained-session-14-api-view-in-parent.json \
  --candidate scripts/probes/modularity/candidates/A4-retained-session-15-with-report-core.json \
  --candidate scripts/probes/modularity/candidates/B1-projection-child.json \
  --candidate scripts/probes/modularity/candidates/B2-projection-child-with-service-contracts.json \
  --name candidates-ab
```

One disposable batch analysis with `dependency-behavior` produced the declared
evaluation and all six candidate evaluations. Change affinity used the probe
defaults: range `HEAD`, all parents, merges excluded, `minOwnerCommits` 5,
`minSharedCommits` 3 and `maxOwnersPerCommit` 5.

The exposure a candidate would need is not a probe output (see
[What the tooling could not measure](#what-the-tooling-could-not-measure)). It
was derived read-only by joining each candidate's `boundaryChanges` with the
selections of the same access ids in `./dist/src/ramify check --batch --root .
--format json` at the same revision, and with that report's effective declared
exposures. Every boundary-change access id was found.

### Declared figures moved since the baseline

[`baseline.md`](../../scripts/probes/results/modularity/baseline.md) was
recorded at `be4175c`. Iteration 5 added candidate-ownership source and tests,
so the declared production view now has 200 files, 2,309 application
occurrences, 740 cross-owner occurrences and 48 edges. The comparison uses only
the declared evaluation from the same run.

### Candidate definitions

All mappings were written against the current source after reading each
moved file's imports and responsibilities.

**Shared decisions.**

- The modularity projection (`modularity*.ts`, `change-affinity.ts`,
  `interfaces/modularity.ts`) stays with `analysis` in every candidate, as the
  specification places it. The A comparison therefore isolates the
  retained-session move.
- New modules take the header tags of the owner they split from: `[]` for
  every new `analysis` child and for the service-api projection child (see
  Candidate B).
- **Tests follow their subject.** A test file, fixture or witness whose subject
  is moved source moves with it; a test of source that stays remains. The
  production view is unaffected by this choice, because the production filter
  reads only production importers. The test view and boundary-change counts
  depend on it.

**A1, `A1-mechanics-13`.** New `ramify/analysis/retained-session` with the
13-file mechanics group from the analysis: `api-view.ts`, `retained-session.ts`,
`session-audit.ts`, `session-engine.ts`, `session-facts.ts`, `session-host.ts`,
`session-messages.ts`, `session-processes.ts`, `session-revision.ts`,
`session-source-loader.ts`, `session-supervisor.ts`,
`session-supervisor-messages.ts` and `session-worker.ts`. Moved tests:
`api-view.test.ts`, `api-view-session.test.ts`, `explorer-details.test.ts`,
`membership-differential.test.ts`, `report-publication.test.ts`,
`retained-session.test.ts`, `root-resolution.test.ts`, `rss-sampling.test.ts`,
`session-audit.test.ts`, `session-input-witness.ts`,
`session-revision.test.ts`, `session-test-fixture.ts`,
`session-worker-fixture.ts` and `session-worker.test.ts`.

**A2, `A2-retained-session-15`.** A1 plus `interfaces/session.ts` and
`session-supervisor-entry.ts`, with the same tests. `session.ts`, the one-shot
batch session, stays with `analysis`.

**A3, `A3-retained-session-14-api-view-in-parent`.** A2 without `api-view.ts`
and its two tests. It answers the analysis's question whether API-view
projection belongs with the retained-session child.

**A4, `A4-retained-session-15-with-report-core`.** A2 plus a second new child,
`ramify/analysis/report`, owning `report.ts`, `report-data.ts`,
`report-copy.ts` and `evaluate-accesses.ts` with their tests
(`evaluate-accesses.test.ts`, `report-capacity.test.ts`,
`report-copy.test.ts`). It was added after A1-A3 showed a runtime cycle caused
by the retained session's runtime use of these files, which the batch session
also uses.

**B1, `B1-projection-child`.** New `ramify/service-api/projection` owning
`project-view.ts` and `tests/project-view.test.ts`.

**B2, `B2-projection-child-with-service-contracts`.** B1 plus
`interfaces/explorer-service.ts`.

**B placement.** `project-view.ts` imports only analysis vocabulary and
`ExplorerProjectionInput`; it has no filesystem, compiler, transport or
browser code. It therefore needs neither `dispatch` nor `ui`, and it must not
be `browser`, because it never runs in the browser. Header tags `[]` let a
future non-dispatch client import it. A child of `service-api` was chosen
over the alternatives:

- Under `analysis` it would add an outgoing edge from the closed analysis
  subtree to `daemon/contexts` through `ContextRevision`.
- Under `presentation` it would join a `ui`/`browser` subtree that only
  renders.
- As a root child it would need a new root relay. As a `service-api` child,
  root's existing `service-api` relays keep their names; `service-api` replaces
  `expose-src createProjectExplorerModel` with `expose-sub`.

The candidate format assigns whole files. `interfaces/explorer-service.ts`
holds `ExplorerProjectionInput` beside the web-host contracts
(`ExplorerDetailsInput`, `ServerStatusResult`, `ExplorerProcessRecord`), so the
intended pure projection with only its input contract lies between B1 and B2.

## Results

### Project comparison

Production view, all loads unless stated. `candidates-ab.md` gives each value's
verdict against declared ownership in the direction the
[decision rule](2026-09-17-project-modularity-analysis.md#decision-rule)
prefers.

| Measure | Declared | A1 | A2 | A3 | A4 | B1 | B2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Exact locality | 68.0% | 63.8% | 64.9% | 64.6% | 63.8% | 67.9% | 67.7% |
| Exact locality, runtime | 83.3% | 80.9% | 81.0% | 81.2% | 79.6% | 83.2% | 83.2% |
| Cross-owner occurrences | 740 | 836 | 810 | 817 | 835 | 742 | 745 |
| Cross-owner occurrences, runtime | 147 | 168 | 167 | 166 | 180 | 148 | 148 |
| Edges | 48 | 54 | 58 | 58 | 65 | 52 | 50 |
| Runtime edges | 18 | 24 | 24 | 24 | 26 | 19 | 19 |
| Runtime cycle components (owners) | 0 | 1 (2) | 1 (2) | 1 (2) | 0 | 0 | 0 |
| Type-only cycle components (owners) | 2 (7) | 2 (7) | 2 (7) | 2 (7) | 3 (10) | 2 (8) | 2 (7) |
| Behavioral dependencies | 69 | 86 | 85 | 87 | 92 | 70 | 70 |
| Non-behavioral dependencies | 347 | 412 | 414 | 410 | 434 | 350 | 350 |
| Test exact locality | 81.8% | 77.9% | 78.9% | 77.8% | 78.9% | 81.8% | 81.8% |
| Test cross-owner occurrences | 233 | 283 | 271 | 285 | 271 | 233 | 233 |
| Sufficient change-affinity pairs | 9 | 12 | 10 | 10 | 12 | 9 | 9 |
| Boundary changes (both filters) | n/a | 426 | 515 | 489 | 573 | 24 | 42 |

No candidate improves any project-level row. That result is structural rather
than decisive. Splitting one owner turns same-owner occurrences into
cross-owner occurrences and edges, and it adds a consumer module to the
behavioral deduplication unit. A split can never improve these rows; they
measure the cost of the new boundary. The per-owner rows below carry the
evidence that could justify that cost.

### Candidate A: owner boundaries

Exact-owner production boundaries, all loads. Symbols are distinct selected
symbols, and the contract surface is the incoming selected symbols.

| Evaluation | Owner | Internal | Outgoing (symbols, file pairs, providers) | Incoming (symbols, consumers) | Locality | Runtime locality |
| --- | --- | ---: | --- | --- | ---: | ---: |
| Declared | `analysis` | 442 | 270 (104, 96, 4) | 71 (25, 5) | 62.1% | 81.5% |
| A1 | `analysis` | 282 | 216 (108, 71, 5) | 160 (47, 6) | 56.6% | 79.3% |
| A1 | `retained-session` | 64 | 150 (78, 51, 5) | 7 (7, 1) | 29.9% | 56.2% |
| A2 | `analysis` | 253 | 229 (129, 68, 5) | 85 (23, 6) | 52.5% | 80.0% |
| A2 | `retained-session` | 119 | 111 (58, 48, 5) | 56 (28, 5) | 51.7% | 56.8% |
| A3 | `analysis` | 257 | 245 (128, 73, 5) | 86 (25, 6) | 51.2% | 80.5% |
| A3 | `retained-session` | 108 | 102 (57, 44, 5) | 62 (26, 5) | 51.4% | 56.3% |
| A4 | `analysis` | 226 | 226 (135, 65, 6) | 78 (15, 7) | 50.0% | 69.4% |
| A4 | `retained-session` | 119 | 111 (58, 48, 6) | 56 (28, 5) | 51.7% | 56.8% |
| A4 | `report` | 2 | 28 (21, 12, 5) | 32 (12, 2) | 6.7% | 50.0% |

The `analysis` subtree keeps 100% locality (1,158 internal, no outgoing
occurrences) in every A candidate; the moves stay within the subsystem.

At this revision the A2 child has the 119 internal occurrences the analysis
recorded at `d5c2498`. Its 42 occurrences to the `analysis` parent and 28 from
`index.ts` also match. The analysis counted only the exact `analysis` owner.
The complete child boundary adds 69 outgoing occurrences to the four
`analysis` children and 28 incoming occurrences from `ramify`, `cli`, `daemon`
and `daemon/contexts`, which import `interfaces/session.ts`.

**Runtime cycle.** A1-A3 each create a runtime component
`{analysis, analysis/retained-session}`. The parent side is the package entry:
`index.ts` re-exports `openRetainedSession` and, except in A3, the API-view
functions. The child side is 17 runtime occurrences in A1 and A2 (18 in A3)
from `session-engine.ts`, `session-facts.ts`, `session-host.ts`,
`session-revision.ts` and, in A1 and A2, `api-view.ts` into `report.ts`, `report-data.ts`, `report-copy.ts` and
`evaluate-accesses.ts`. The batch session and validation use the same report
core. A4 removes the runtime cycle but leaves a new type-only component
`{analysis, analysis/report, analysis/retained-session}` (95 occurrences, 33
runtime, 51 symbols). Its `report` child has 2 internal against 28 outgoing
occurrences, and `evaluate-accesses.ts` is disconnected from the other three
files, so those four files do not form a cohesive owner.

**Connectedness.** In the declared tree `session-source-loader.ts` is the only
isolate in `analysis`. It remains an isolate in every A child, as the analysis
predicted. `session-host.ts` loads it by `new URL('./session-source-loader.js',
import.meta.url)`, which the static graph does not see, and
`session-supervisor.ts` loads `session-supervisor-entry.ts` the same way. A1
leaves `session-supervisor-entry.ts` in the parent as a new isolate whose only
three accesses go to the child. Both files are process entries of the
retained session's worker tree. Their relative URLs also require them to stay
in the same directory as their loaders, which confirms the analysis's
instruction to decide them by runtime ownership: they belong with the child.

**API view (A2 against A3).** With `api-view.ts` in the parent, the parent's
outgoing occurrences rise from 229 to 245 and its file pairs from 68 to 73. The
child must also receive `planApiViewRequests` and `projectApiView` from its
parent, and `api-view.ts` crosses into the child for `SessionFacts`. The child
is smaller (14 files, 156,103 bytes, against 15 and 173,949), but its locality
and contract breadth do not improve. API-view projection belongs with the
retained-session child rather than with `analysis`. A smaller inspection child
was not evaluated.

### Candidate B: owner boundaries

| Evaluation | Owner | Internal | Outgoing (symbols, file pairs, providers) | Incoming (symbols, consumers) | Locality |
| --- | --- | ---: | --- | --- | ---: |
| Declared | `service-api` | 15 | 32 (29, 12, 7) | 12 (11, 3) | 31.9% |
| B1 | `service-api` | 13 | 18 (17, 9, 6) | 13 (12, 4) | 41.9% |
| B1 | `service-api/projection` | 0 | 16 (16, 5, 5) | 1 (1, 1) | 0.0% |
| B2 | `service-api` | 9 | 16 (14, 10, 3) | 9 (9, 3) | 36.0% |
| B2 | `service-api/projection` | 1 | 21 (19, 7, 5) | 8 (4, 2) | 4.5% |

- **B1** narrows `service-api`: providers 7 to 6, outgoing symbols 29 to 17 and
  outgoing file pairs 12 to 9. The projection is one file with no internal
  accesses and 16 type-only outgoing occurrences. It is a one-file adapter
  over analysis vocabulary, not a cohesive subsystem. Its single
  `ExplorerProjectionInput` access to its parent adds the projection to the
  type-only component `{ramify, cli, daemon, service-api}` (7 to 8 owners).
- **B2** narrows `service-api` further: providers 7 to 3, outgoing symbols 29
  to 14 and incoming symbols 11 to 9. It adds no cycle member. Most of the gain,
  though, comes from moving web-host contracts into the projection:
  `service-api` then imports `ServerStatusResult` and `ExplorerProcessRecord`
  from its child, `explorer` gains the projection as a
  fifth provider, and the projection gains a `daemon/contexts` dependency. B2
  is not the pure projection the analysis described.
- The runtime graph gains only `router.ts -> project-view.ts` (one occurrence)
  in both B candidates. No runtime cycle appears.

### Boundary changes and the exposure they would require

The table lists new cross-owner production relations and the originals whose
exposure would have to change. "Not received today" means no effective
declared exposure delivers that original to the candidate consumer's
position.

| Candidate | New relation | Originals | Exposure change required |
| --- | --- | ---: | --- |
| A1 | child -> `analysis` | 41 | `analysis` exposes all 41 to descendants: report core (`ReportDraft`, `byteOrder`, `WorkLimit`, `copyReport`, `detached`, `diagnostic`, `projectDiagnostics`, `evaluateAccessesAsync`, `availableCapabilities`, ...), analysis types and every `interfaces/session.ts` type |
| A2 | child -> `analysis` | 18 | `analysis` exposes the report core and seven analysis types to descendants |
| A3 | child -> `analysis` | 20 | as A2, plus `planApiViewRequests` and `projectApiView` |
| A4 | `retained-session` -> `report`; `report` -> `analysis`; `retained-session` -> `analysis` | 11; 9; 7 | `report` exposes the core to its parent, `analysis` re-exposes it to descendants, and `analysis` exposes analysis types to descendants |
| A1-A4 | child -> sibling `analysis` children | 11 | `analysis` additionally re-exposes `parseDescription`, `linkDescriptions`, `readProject`, `observeProject`, `resolveProjectRoot`, `createRetainedSourceAnalysis`, `RetainedSourceAnalysis`, `AccessInterpreter`, `CatalogDelta`, `FileDescription` and `MembershipReach` to descendants; today it re-exposes only types and `isRamifyGeneratedPath` from those three children |
| A2-A4 | `ramify`, `cli`, `daemon`, `daemon/contexts` -> child | 3-10 each | Child exposes `interfaces/session.ts` to parent; `analysis` replaces `expose-src` with `expose-sub`; root relay names are unchanged |
| A1-A4 | `analysis` -> child | 7-28 | Child exposes `openRetainedSession`, the API-view functions (A1, A2, A4) and, from A2, the session types to parent |
| B1 | projection -> `service-api` | 1 | `service-api` exposes `ExplorerProjectionInput` to descendants |
| B1, B2 | `service-api` -> projection | 1-3 | Projection exposes `createProjectExplorerModel` (and in B2 the service contracts) to parent; `service-api` uses `expose-sub`; root relays are unchanged |
| B1, B2 | projection -> analysis owners (B2 also `daemon/contexts`) | 15-16 (B2 +3) | None: root's existing relays to descendants already reach a `service-api` child |

Every A candidate would widen exposure. The parent would have to expose report
internals to descendants for the first time, and the sibling concrete
operations would reach all of its descendants, including the four existing
children. The decision rule counts that widening against a candidate. B needs
one or two narrow additions.

### Context size

Production exact-owner context (files, bytes, originals).

| Evaluation | Parent | New child | Second child |
| --- | --- | --- | --- |
| Declared | `analysis` 36, 330,210, 227 | - | - |
| A1 | 23, 170,439, 159 | 13, 159,771, 68 | - |
| A2 | 21, 156,261, 135 | 15, 173,949, 92 | - |
| A3 | 22, 174,107, 138 | 14, 156,103, 89 | - |
| A4 | 17, 121,587, 121 | 15, 173,949, 92 | `report` 4, 34,674, 14 |
| Declared | `service-api` 7, 59,623, 35 | - | - |
| B1 | 6, 41,965, 33 | 1, 17,658, 2 | - |
| B2 | 5, 39,627, 26 | 2, 19,996, 9 | - |

In the test view, `analysis` owns 27 test files (423,509 bytes). Under A2 that
becomes 13 files (184,201) in the parent and 14 (239,308) in the child.

Candidate A roughly halves the owned context of both a batch/analysis task and
a retained-session task. The halves are not independent: a retained-session
change still needs the report core and the analysis contract, 18 originals in
A2 and 41 in A1. Candidate B saves 17-20 KiB in an owner that is already small.

### Change affinity

`analysis` has 34 sampled commits under declared ownership. Under A2 the
parent has 15 and the child 22, sharing 4 (4/33). The child also pairs with
`analysis/project` (7/30) and `daemon/contexts` (5/31). The history therefore
shows the retained session changing more often with the project child and the
resident contexts than with the rest of `analysis`, which weakly supports a
separate owner. Moving files raises one more commit above
`maxOwnersPerCommit` (3 to 4 broad exclusions, 88 to 87 sampled), so the A
samples differ slightly from the declared sample.

The B owners have one or two commits and no sufficient pair. The change
affinity gives no evidence for or against B.

## Candidate C

Step 6 permits Candidate C only if the first report shows that the
`{analysis/descriptions, analysis/project, analysis/typescript}` type-only
component materially harms contract breadth or independent change. It does
not. The component is identical in every evaluation: 16 occurrences, none
runtime, 7 selected symbols and 10 files. No sufficient change-affinity pair
links `descriptions` with either member, and `project`/`typescript` share 3 of
39 commits. **Candidate C is not warranted** by this evaluation.

## Recommendations

These are recommendations for owner review only.

| Candidate | Recommendation | Reason |
| --- | --- | --- |
| A1 | Reject | The child's locality is 29.9%; the parent must expose 41 originals to descendants; a runtime cycle appears; it strands `session-supervisor-entry.ts`, whose URL load needs it beside its loader |
| A2 | Needs owner review; not accepted for a step-7 move as mapped | Strongest A mapping: child locality 51.7%, the parent's contract surface narrows from 25 to 23 symbols, owned context roughly halves and the subtree stays closed. The runtime cycle through the shared report core and the exposure widening (18 parent originals plus 11 sibling operations to descendants) fail the decision rule's acyclicity and exposure clauses |
| A3 | Reject | Worse than A2 on the parent's outgoing breadth and the child's contract; API view belongs with the retained-session child |
| A4 | Reject | Removes the runtime cycle only by creating a 6.7%-locality `report` owner and a three-owner type-only component |
| B1 | Needs owner review; defer | `service-api` narrows (providers 7 to 6, outgoing symbols 29 to 17), but the projection is a one-file owner, joins a type-only component through `ExplorerProjectionInput` and has no second client today |
| B2 | Reject as mapped | Its narrowing comes from moving web-host contracts into the projection, which gives `explorer` a new provider; it contradicts the pure-projection intent |

**For owners.**

- **A.** Before any retained-session move, decide who owns the report core
  (`report.ts`, `report-data.ts`, `report-copy.ts`, `evaluate-accesses.ts`) that
  batch and retained sessions share. Also decide whether descendants of
  `analysis` should receive concrete operations of its children. A2 with
  `session-source-loader.ts` and `session-supervisor-entry.ts` in the child is
  the mapping to revisit once that is settled.
- **B.** The analysis made acceptance conditional on material contract
  narrowing or a second client. The narrowing is modest and no second client
  exists. If one appears, such as a CLI materialization or MCP consumer of the
  explorer model, reevaluate the B1 shape with `ExplorerProjectionInput`
  separated from the web-host contracts in `interfaces/explorer-service.ts`.

## What the tooling could not measure

- **Exposure under candidates.** Repository interface use and exposed originals
  are unavailable by specification. The exposure changes above come from a
  one-off join outside the probe, which does not evaluate the model. The probe
  did not verify that the candidate declarations would pass `ramify check`,
  including tag compatibility.
- **Sub-file ownership.** A candidate reassigns whole files, so the intended B
  shape with only `ExplorerProjectionInput` moved could not be expressed.
- **Split-biased project rows.** A split cannot improve project exact locality,
  cross-owner occurrences, edges or behavioral totals. The comparison's
  "improves: none" for every candidate reflects that, and owner-level rows must
  carry the review.
- **Dynamic loads.** URL-based worker and loader entries are invisible to the
  static access graph, so connectedness reports them as isolates.
- **Test choice.** Test-view results depend on the "tests follow their subject"
  mapping stated above.
- **History.** Commits are attributed through current paths only, and the
  explorer-era owners remain below the sufficiency thresholds.

No tooling defect was found; no code was changed.
