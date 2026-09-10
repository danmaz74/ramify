# File migration map

**Status:** Review draft for iteration 1; no source move is performed here.
The inventory below was read from this checkout on 2026-09-09. It accounts for
all **47 existing `src/` files and seven existing `scripts/` files** before the
iteration 1 probes are added. Owner contracts and activation dates are in
[owners.md](owners.md) and [contracts.md](contracts.md).

## Destinations and timing

These prefixes are exact package-relative directories, used to keep each row
readable. A destination in a row is the prefix followed by its listed suffix.

| Prefix | Directory | Role |
| --- | --- | --- |
| M | `subs/analysis/subs/model/src/` | Definitive portable model. |
| P | `subs/presentation/src/` | Diagram preparation, fixtures, rendering and interaction. |
| L | `subs/presentation/subs/layout/src/` | Neutral geometry and layout calculations. |
| T | `scripts/` | Independent build/test orchestration; no Ramify owner. |

Iterations 2–7 create new owner code directly under its destination. The
legacy `src/model/` and `src/viz/` remain until iteration 8 can validate the
migrated declarations using the linker. Iteration 3's model supersedes legacy
algorithms; iteration 8 transfers still-useful tests and adapts callers rather
than creating a second evaluator. All rows below move or retire in iteration 8,
except the independent scripts, which stay in place throughout the plan.

## Every existing source file

| Existing file | Destination / disposition |
| --- | --- |
| `src/index.ts` | Remove the combined model/UI barrel. Separate entries in contracts.md replace it; `src/cli-entry.ts` and `src/batch.ts` are new root-owned assembly, activated in iteration 13. Update callers explicitly. |
| `src/model/tree.ts` | Split useful identity and construction/traversal behavior into M `identity.ts` and `model.ts`, with public vocabulary in M `interfaces/model.ts`. Retire the legacy file and superseded definitions. |
| `src/model/tags.ts` | Replace hard-coded tag kinds/profiles with M `registry.ts` and `profiles.ts`; public vocabulary belongs to M `interfaces/model.ts`. Retire the legacy file. |
| `src/model/availability.ts` | Replace old decisions with M `decisions.ts` and its M `interfaces/model.ts` vocabulary. Retire the legacy file; no second evaluator remains. |
| `src/model/index.ts` | M `index.ts`; replace the old barrel with the selected model entry in contracts.md. Exporting here alone creates no exposure. |
| `src/model/tree.test.ts` | M `tests/tree.test.ts`; preserve independent tree cases and use canonical IDs. |
| `src/model/tags.test.ts` | M `tests/tags.test.ts`; transfer valid cases to registry/profile expectations. |
| `src/model/availability.test.ts` | M `tests/availability.test.ts`; retain independent decisions and update superseded semantics. |
| `src/viz/geometry.ts` | L `geometry.ts` retains constants, metrics, text wrapping and point/box operations; move the `Point`/`Box` definitions into L `interfaces/layout.ts`. |
| `src/viz/viewport.ts` | L `viewport.ts` retains pure zoom/pan/wheel math; move neutral `ViewRect`/`Anchor` definitions into L `interfaces/layout.ts`. |
| `src/viz/viewport.test.ts` | L `tests/viewport.test.ts`; same pure numerical behaviors. |
| `src/viz/layout-nodes.ts` | Split P `layout-nodes.ts` (ownership, visibility, tags, rows, labels and model traversal) from L `node-placement.ts` (measured boxes, hierarchy spacing, coordinates and attachment points). |
| `src/viz/layout-lanes.ts` | Split P `layout-lanes.ts` (exposure decisions, policy association and symbol metadata) from L `lane-placement.ts` (edge/lane offsets, paths and label positions). |
| `src/viz/layout-chords.ts` | Split P `layout-chords.ts` (import decisions, reasons, expected-denial and color association) from L `chord-placement.ts` (free intervals, corridor choice, arc generation, attachment and label geometry). |
| `src/viz/layout-legend.ts` | Split P `layout-legend.ts` (convert teaching legend entries into neutral text/key inputs and attach results back to entries) from L `legend-placement.ts` (text dimensions, wrapping and positions). |
| `src/viz/layout.ts` | P `layout.ts` retains diagram context, orchestration, validation, cache and default diagram selection. Extract generic extent accumulation/view-box calculation to L `bounds.ts`. Header labels are prepared in P and supplied as measured neutral boxes. |
| `src/viz/layout.test.ts` | Split P `tests/layout.test.ts` (model-derived diagram semantics, tags, propagation and fixture composition) and L `tests/placement.test.ts` (pure spacing, path, overlap, bounds and layout invariants against neutral inputs). Each old assertion goes to the owner of the behavior it checks. |
| `src/viz/tree-diagram.ts` | Split P `tree-diagram.ts` (tree/focus context, exposure chains, row content and roles) from L `tree-placement.ts` (row measurements, subtree widths, levels, positions and connector geometry). |
| `src/viz/focus-diagram.ts` | Split P `focus-diagram.ts` (focus context and card contents) from L `focus-placement.ts` (card/column dimensions and placement, map transform). |
| `src/viz/diagram-definition.ts` | P `diagram-definition.ts`; retain teaching vocabulary and adapt `createDiagramContext` to definitive model inputs. |
| `src/viz/model-access.ts` | P `model-access.ts`; adapt current model operations reached through analysis/root exposures. Remove obsolete compatibility vocabulary after its callers move. No imports into model internals. |
| `src/viz/validate.ts` | P `validate.ts`; retain diagram-to-model semantic assertions using current decisions. |
| `src/viz/theme.ts` | P `theme.ts`; presentation palette/style vocabulary. |
| `src/viz/tree-render.tsx` | P `tree-render.tsx`; React row/card rendering with layout inputs. |
| `src/viz/ModelDiagram.tsx` | P `ModelDiagram.tsx`; React diagram rendering, selection and tour interaction. |
| `src/viz/TreeDiagram.tsx` | P `TreeDiagram.tsx`; React tree diagram rendering and interaction. |
| `src/viz/FocusDiagram.tsx` | P `FocusDiagram.tsx`; React focus diagram rendering and interaction. |
| `src/viz/index.ts` | P `index.ts`; replace with selected presentation exports. L `index.ts` is a new separate layout entry. Foreign layout/model originals need the named exposures in owners.md. |
| `src/viz/emitted-diagrams.test.ts` | P `tests/emitted-diagrams.test.ts`; preserve the seven existing file snapshot assertions listed below. |
| `src/viz/tree-diagram.test.ts` | P `tests/tree-diagram.test.ts`; keep semantic tree/focus assertions and `shop-tree.svg` snapshot. Move purely neutral positioning assertions, if extracted, to L `tests/tree-placement.test.ts`. |
| `src/viz/focus-diagram.test.ts` | P `tests/focus-diagram.test.ts`; keep semantic focus assertions and `shop-focus-payment.svg` snapshot. Move purely neutral positioning assertions, if extracted, to L `tests/focus-placement.test.ts`. |
| `src/viz/render.test.ts` | P `tests/render.test.ts`; static React markup, accessible labels and visual teaching states. |
| `src/viz/interaction.test.ts` | P `tests/interaction.test.ts`; component selection, tour, zoom/pan integration. Pure viewport tests already belong to L. |
| `src/viz/validate.test.ts` | P `tests/validate.test.ts`; semantic validation and deliberate model mismatches. |
| `src/viz/example1-stages.test.ts` | P `tests/example1-stages.test.ts`; staged fixture semantics and intended differences. |
| `src/viz/example2.test.ts` | P `tests/example2.test.ts`; diagram/model decisions. |
| `src/viz/example3.test.ts` | P `tests/example3.test.ts`; diagram/model decisions. |
| `src/viz/example4.test.ts` | P `tests/example4.test.ts`; diagram/model decisions. |
| `src/viz/diagrams/example1.ts` | P `diagrams/example1.ts`; migrate declaration data to definitive model. |
| `src/viz/diagrams/example1a.ts` | P `diagrams/example1a.ts`; migrate declaration data to definitive model. |
| `src/viz/diagrams/example1b.ts` | P `diagrams/example1b.ts`; migrate declaration data to definitive model. |
| `src/viz/diagrams/example2.ts` | P `diagrams/example2.ts`; migrate declaration data to definitive model. |
| `src/viz/diagrams/example3.ts` | P `diagrams/example3.ts`; migrate declaration data to definitive model. |
| `src/viz/diagrams/example4.ts` | P `diagrams/example4.ts`; migrate declaration data to definitive model. |
| `src/viz/diagrams/series.ts` | P `diagrams/series.ts`; teaching labels, legends and node-content choices. |
| `src/viz/diagrams/shop.ts` | P `diagrams/shop.ts`; migrate declaration data and derived fixture facts. |
| `src/viz/diagrams/shop-tree.ts` | P `diagrams/shop-tree.ts`; migrate tree/focus fixture definitions. |

## The layout split is a dependency boundary

Moving an entire framework-free file is insufficient: the current placement
files import `DiagramContext`, `DiagramDefinition`, `ColorKey`, model records
and decisions from what will become their `ui`-classified parent. Those imports
must disappear from L, including type-only imports.

P evaluates visibility, tags, exposure chains and expected decisions, then
converts the resulting content into L-owned `LayoutNodeInput`, `LayoutEdgeInput`,
`LayoutGraphInput`, `LayoutOptions` and `LegendInput`. Keys are opaque strings;
P keeps the association with originals, modules, color roles and symbols. L
returns `LayoutResult`/`LegendResult` and neutral `Point`/`Box` geometry; P joins
the results by key and validates semantic claims. No L result hides a model
object in an opaque payload. The exact signatures are in contracts.md.

| L implementation file | Public operation |
| --- | --- |
| `node-placement.ts` | `placeNodes` |
| `lane-placement.ts` | `placeLanes` |
| `chord-placement.ts` | `placeChords` |
| `legend-placement.ts` | `placeLegend` |
| `tree-placement.ts` | `placeTree` |
| `focus-placement.ts` | `placeFocus` |
| `bounds.ts` | `measureBounds` |

`d3-hierarchy` and `d3-shape` follow their numerical calculations into L.
React, theme classes, diagram defaults, model adaptation and diagram caches stay
in P. Any geometry-only helper added during the split follows L; its public
vocabulary is declared in L's owned interface file before it is exposed.

## Every existing script file

| Existing file | Target and treatment |
| --- | --- |
| `scripts/emit-diagrams.ts` | T `emit-diagrams.ts`, unchanged independent scope. Replace `../src/viz/index.js` with the selected presentation source entry corresponding to the supported package surface. Continue writing the same nine package-root SVG files. |
| `scripts/memory-probe.mjs` | T `memory-probe.mjs`, independent Node measurement orchestrator. Iteration 15 supplies a real-session setup fixture and separate repeated-use workload; it is not analysis runtime. |
| `scripts/reference-harness/cases.ts` | T `reference-harness/cases.ts`, independent family/instance inventory. Iteration 2 adds the frozen instances without inventing execution; retain authority classifications. |
| `scripts/reference-harness/cases.test.ts` | T `reference-harness/cases.test.ts`, independent inventory-integrity tests. Assertions over real source results are added in their implementing iterations. |
| `scripts/reference-harness/report.ts` | T `reference-harness/report.ts`, independent process/report orchestration. Remove the hand-written violation total when the real checker is invoked; retain dry-run inventory semantics. |
| `scripts/reference-harness/tsconfig.json` | Same file and independent scope. Select harness scripts, allowing their public analysis imports to be checked without adding scripts to toolkit source inventory. |
| `scripts/reference-harness/vitest.config.ts` | Same file and independent runner configuration; retain inventory tests and add required instance/gate verification without borrowing host-repository config. |

Iteration 1 adds the following files under the independent scripts scope.
None becomes runtime implementation or a declared module merely because its
fixture contains a directory named `src`.

| Added file | Target / disposition |
| --- | --- |
| `scripts/probes/compiler-api.ts` | Same independent probe entry. |
| `scripts/probes/compiler-lifecycle.ts` | Same independent probe entry. |
| `scripts/probes/config-input-view.ts` | Same independent probe entry. |
| `scripts/probes/async-api-feasibility.ts` | Same independent API/lifecycle comparison probe; async close alone does not establish a hard deadline. |
| `scripts/probes/supervised-compiler.ts` | Same independent process-group and parent-input-bridge feasibility probe. |
| `scripts/probes/reference-resolution.ts` | Same independent probe entry. |
| `scripts/probes/fixture-sizes.ts` | Same independent probe entry. |
| `scripts/probes/fixtures/hundred-owners.ts` | Same deterministic fixture generator; iteration 15 materializes these measured bytes. |
| `scripts/probes/fixtures/supervised-compiler-child.ts` | Same independent probe helper; later runtime helpers are implemented inside their respective project/TypeScript owners. |
| `scripts/probes/fixtures/compiler-api/tsconfig.json` | Same independent fixture configuration. |
| `scripts/probes/fixtures/compiler-api/src/alias-consumer.ts` | Same compiler probe input; not toolkit application source. |
| `scripts/probes/fixtures/compiler-api/src/consumer.ts` | Same compiler probe input. |
| `scripts/probes/fixtures/compiler-api/src/forward.ts` | Same compiler probe input. |
| `scripts/probes/fixtures/compiler-api/src/interfaces/public.ts` | Same compiler probe input. |
| `scripts/probes/fixtures/compiler-api/src/originals.ts` | Same compiler probe input. |
| `scripts/probes/results/compiler-api.json` | Same raw contract-probe evidence; no matrix execution claim. |
| `scripts/probes/results/compiler-lifecycle.json` | Same raw compiler-child lifecycle evidence. |
| `scripts/probes/results/config-input-view.json` | Same raw captured-config host evidence. |
| `scripts/probes/results/async-api-feasibility.json` | Same raw async API observations, with hard-deadline guarantee explicitly absent. |
| `scripts/probes/results/supervised-compiler.json` | Same raw forced-termination/bridge evidence; native termination does not claim reaping. |
| `scripts/probes/results/reference-resolution.json` | Same raw source/resource identity evidence. |
| `scripts/probes/results/fixture-sizes.json` | Same raw workload sizes and content-map identities. |

Commands and probe interpretation are in [probes.md](probes.md). New iteration 8
`scripts/production-files.ts` and `scripts/build-production.ts` stay independent
build orchestration and consume analysis inventory through its public entry.
Their selection algorithm is specified in [scope.md](scope.md), not a parallel
implementation of module discovery or profile rules.

## Snapshot destinations after moving tests

The artifacts stay at the package root under `site/static/diagrams/`. The
existing `../../site/...` specifiers are relative to `src/viz/`; all three moved
tests live at `subs/presentation/src/tests/` and therefore use
`../../../../site/...`. Do not regenerate a second snapshot tree beside tests.

| Test | Existing snapshot specifier | Specifier after migration |
| --- | --- | --- |
| `emitted-diagrams.test.ts` | `../../site/static/diagrams/model-core.svg` | `../../../../site/static/diagrams/model-core.svg` |
| `emitted-diagrams.test.ts` | `../../site/static/diagrams/example1.svg` | `../../../../site/static/diagrams/example1.svg` |
| `emitted-diagrams.test.ts` | `../../site/static/diagrams/example1a.svg` | `../../../../site/static/diagrams/example1a.svg` |
| `emitted-diagrams.test.ts` | `../../site/static/diagrams/example1b.svg` | `../../../../site/static/diagrams/example1b.svg` |
| `emitted-diagrams.test.ts` | `../../site/static/diagrams/example2.svg` | `../../../../site/static/diagrams/example2.svg` |
| `emitted-diagrams.test.ts` | `../../site/static/diagrams/example3.svg` | `../../../../site/static/diagrams/example3.svg` |
| `emitted-diagrams.test.ts` | `../../site/static/diagrams/example4.svg` | `../../../../site/static/diagrams/example4.svg` |
| `tree-diagram.test.ts` | `../../site/static/diagrams/shop-tree.svg` | `../../../../site/static/diagrams/shop-tree.svg` |
| `focus-diagram.test.ts` | `../../site/static/diagrams/shop-focus-payment.svg` | `../../../../site/static/diagrams/shop-focus-payment.svg` |

## Consumers and configuration outside the source inventory

| File | Required iteration 8 change |
| --- | --- |
| `package.json` | Iteration 2's `rootDir: "."` changes the temporary legacy main to `dist/src/index.js`. Iteration 8 removes that combined main and activates only implemented subpath entries from contracts.md; analysis main arrives in iteration 12 and CLI bin in iteration 13. Use the production build selection while type-check and test scripts keep complete inputs. |
| `tsconfig.json` | Set `rootDir` to `.` and cover all owned nested source; separate whole-project checking from production emitting. Exact scope is in scope.md. |
| `tsconfig.scripts.json` | Include independent scripts plus the source entries they consume and all migrated owned source. Retain Node ambient types and `noEmit`. |
| `.gitignore` | Iteration 8 adds toolkit-root `.reference-work/` for uniquely owned production-build staging; keep the existing independent example mutation-copy ignore. |
| `vitest.config.ts` | Discover tests in each owner's `src/tests/` and testing owners' ordinary source. Exclude independent example/site/scripts inputs; preserve the legacy pattern during staged migration only. |
| `site/docusaurus.config.ts` | Replace the broad `@ramify -> ../src` alias with exact `@ramify/presentation`, `@ramify/model` and `@ramify/layout` aliases targeting their owner `src/index.ts` files. Keep `.js` extension substitution and the site's single React instance. No analysis/compiler alias. |
| `site/tsconfig.json` | Add the same three precise `paths` mappings. It currently has no `@ramify` TypeScript paths; do not preserve an assumed old mapping. Keep the Docusaurus base config and its own scope. |
| `site/src/pages/index.mdx` | Replace `@ramify/viz` import with `@ramify/presentation`. |
| `site/src/pages/model.mdx` | Replace `@ramify/viz` import with `@ramify/presentation`. |
| `site/src/pages/modularity.mdx` | Replace `@ramify/viz` import with `@ramify/presentation`. |
| `site/src/pages/tags.mdx` | Replace `@ramify/viz` import with `@ramify/presentation`. |
| `site/package.json` | Update its description's `../src` claim to the migrated package surfaces; no compiler dependency is added. |

The four existing page imports select presentation exports. If a page later
names a model or layout type/value, use that surface explicitly. The independent
site/build tools may consume selected owner entry files directly during source
development; runtime Ramify modules still require the declared exposure paths.

## Migration evidence and removals

Iteration 8 verifies all old paths have been retired from imports, aliases and
snapshot specifiers; no duplicate legacy evaluator or visualization tree remains.
It validates the current module declarations against actual exports, all owned
tests' discovery, production selection, toolkit type-checking, diagram semantic
assertions and site compilation. Teaching fixtures are reviewed against the
definitive model before accepting changed diagrams. Snapshot equality is expected
only when neither the intended data nor rendering changed. These are future
verification obligations; this map does not claim them executed.
