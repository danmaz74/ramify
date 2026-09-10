# Owners, final declarations and activation stages

**Prepared:** 2026-09-09. **State:** complete proposed final contracts for review,
not declarations installed by this iteration and not evidence of acceptance.
The definitive [description principles](../../../model/module-description.principles.md)
and [importability principles](../../../model/cross-module-importability.principles.md)
remain authoritative. The [contract definitions](contracts.md) fix source-file
names and public signatures. Every edge in this tree is a physical `subs/` edge.

In iteration 2 create each owner's directory, README and empty `src/` and
`src/tests/`. Install only its first two declaration lines below. Later activate
each exposure together with the actual export and its provider contracts.
An interface wildcard expands only definitions currently implemented in that
file; do not create future empty types or fake values to make a final line link.
The final texts below contain all exposures by iteration 13. Comment IDs are
review evidence identifiers, not description syntax or access-control fields.

## Root: ramify

**Directory:** `./`. **README first paragraph:**

> Ramify assembles the command line entry and lazy batch analysis, maps completed reports to invocation results, and keeps executable dispatch separate from portable model and presentation entries.

Complete final `module.ramify`:

```ramify
ramify 1
module "ramify" tagged [dispatch]

// R1: invocation originals; required by CLI, never by the engine.
expose-src * from "interfaces/batch.ts" to descendants
// R2: unchanged model originals received through analysis.
expose-sub ModuleId, TagName, TagKind, TagDefinition, ResolvedTagRegistry, SourceLocation, ModelIssue, ModelResult, SourceArea, ModuleRecord, OriginalId, SourceOrigin, Original, Destination, Exposure, ModelInput, Model, ExposureHop, VisibilityDecision, BindingRequest, ImportQuestion, TagRequirement, ImportReason, ImportDecision, resolveTagRegistry, createDefaultTagRegistry, deriveSourceAreas, assignOriginalTags, originalKey, buildModel, explainVisibility, explainImport from analysis to descendants
// R3: analysis report and operation vocabulary.
expose-sub Capability, StageId, RunControl, AnalysisLimits, AnalysisInputs, InventoryInputs, InventorySnapshot, InventoryRun, ValidationRun, CapabilityExecution, StageExecution, AnalysisCode, AnalysisDiagnostic, AccessResult, AnalysisSnapshot, AnalysisSummary, AnalysisReport, AnalysisRun, AnalysisSession from analysis to descendants
// R4: foreign types a report consumer may name explicitly.
expose-sub TextSpan, DescriptionToken, DescriptionIssue, NamedSelection, DescriptionSelection, DescriptionStatement, DescriptionDocument, ParsedDescription, DescriptionParser, LinkInputs, ExpandedSelection, LinkIssue, LinkedDescriptions, ProjectRequest, ProjectScope, CapturedInput, InventoryArea, ModulePurpose, InventoryModule, InventoryFile, ExactReference, OutsideSourceWarning, ProjectInventory, ProjectIssue, AcquisitionLimits, ProjectInputView, ProjectReadOptions, ProjectRead, CatalogOriginal, CatalogExport, FileExports, SourceCatalog, SourceTarget, WrittenForm, AccessSelection, SourceAccess, SourceLimit, SourceWorkLimits, SourceAnalysisInputs, SourceAnalysis from analysis to descendants
// R5: declaration-only UI relay; root source imports none of these.
expose-sub DiagramDefinition, TreeDiagramDefinition, FocusDiagramDefinition, ModelDiagramProps, ModelDiagramInteractiveProps, TreeDiagramProps, FocusDiagramProps, ModelDiagram, ModelDiagramSvg, TreeDiagram, TreeDiagramSvg, FocusDiagram, FocusDiagramSvg, shopDiagram, example1Diagram, example1aDiagram, example1bDiagram, example2Diagram, example3Diagram, example4Diagram, shopTreeDiagram, shopFocusDiagram from presentation to descendants
```

## Analysis

**Directory:** `subs/analysis/`. **README first paragraph:**

> Analysis composes one captured project view, source facts, descriptions and model decisions into disposable batch work and immutable reports. It owns stage outcomes and input identity so every client consumes the same completed analysis.

Complete final `module.ramify`:

```ramify
ramify 1
module analysis

// A1: real validation assembly, available before migration.
expose-src validateProject from "validation.ts" to parent
// A2: inventory/profile assembly for the production build tool.
expose-src acquireInventory from "inventory.ts" to parent
// A3: complete batch session and convenience binding.
expose-src createAnalysisSession from "session.ts" to parent
expose-src analyzeProject from "analyze-project.ts" to parent
// A4: all entries in this file are analysis-owned definitions.
expose-src * from "interfaces/analysis.ts" to parent
// A5: the portable model contract travels unchanged.
expose-sub * from model to parent, descendants
// A6-A8: explicit foreign vocabulary, passed between children by assembly.
expose-sub TextSpan, DescriptionToken, DescriptionIssue, NamedSelection, DescriptionSelection, DescriptionStatement, DescriptionDocument, ParsedDescription, DescriptionParser, LinkInputs, ExpandedSelection, LinkIssue, LinkedDescriptions from descriptions to parent, descendants
expose-sub ProjectRequest, ProjectScope, CapturedInput, InventoryArea, ModulePurpose, InventoryModule, InventoryFile, ExactReference, OutsideSourceWarning, ProjectInventory, ProjectIssue, AcquisitionLimits, ProjectInputView, ProjectReadOptions, ProjectRead from project to parent, descendants
expose-sub CatalogOriginal, CatalogExport, FileExports, SourceCatalog, SourceTarget, WrittenForm, AccessSelection, SourceAccess, SourceLimit, SourceWorkLimits, SourceAnalysisInputs, SourceAnalysis from typescript to parent, descendants
```

## Model

**Directory:** `subs/analysis/subs/model/`. **README first paragraph:**

> The model defines canonical module and original identities, validates the shared tag registry, derives source profiles, and explains visibility and importability from grounded exposure evidence without filesystem, compiler or UI dependencies.

Complete final `module.ramify`:

```ramify
ramify 1
module model tagged [browser]

// M1: portable owned vocabulary.
expose-src * from "interfaces/model.ts" to parent
// M2-M6: values explicitly promise browser-safe transitive closures.
expose-src resolveTagRegistry, createDefaultTagRegistry from "registry.ts" tagged [browser] to parent
expose-src deriveSourceAreas, assignOriginalTags from "profiles.ts" tagged [browser] to parent
expose-src originalKey from "identity.ts" tagged [browser] to parent
expose-src buildModel from "model.ts" tagged [browser] to parent
expose-src explainVisibility, explainImport from "decisions.ts" tagged [browser] to parent
```

## Descriptions

**Directory:** `subs/analysis/subs/descriptions/`. **README first paragraph:**

> Descriptions parses the version 1 language with original source locations and links exact selections and child contracts against supplied inventory and export facts. It preserves declaration evidence and rejects invalid contracts without reading files or loading a compiler.

Complete final `module.ramify`:

```ramify
ramify 1
module descriptions tagged [browser]

// D1-D2: standalone syntax contract.
expose-src parseDescription from "parse.ts" tagged [browser] to parent
expose-src * from "interfaces/syntax.ts" to parent
// D3-D4: supplied-data linker contract.
expose-src linkDescriptions from "link.ts" tagged [browser] to parent
expose-src * from "interfaces/linking.ts" to parent
```

## Project

**Directory:** `subs/analysis/subs/project/`. **README first paragraph:**

> Project selects and acquires one real project, validates its physical ownership layout and exact paths, and supplies coherent captured input reads. It records raw source areas, configuration selection, outside-module warnings and README purpose metadata without deciding import permissions.

Complete final `module.ramify`:

```ramify
ramify 1
module project

// P1-P2: acquisition service and owned vocabulary.
expose-src readProject from "read-project.ts" to parent
expose-src * from "interfaces/project.ts" to parent
```

## TypeScript

**Directory:** `subs/analysis/subs/typescript/`. **README first paragraph:**

> The TypeScript adapter owns compiler sessions and resolution state, extracts complete export and original catalogs, and records bounded source-access facts. It separates real resource identity from declaration shims and returns plain data and explicit analysis limits.

Complete final `module.ramify`:

```ramify
ramify 1
module typescript

// T1-T2: compiler service and detached source vocabulary.
expose-src createSourceAnalysis from "source-analysis.ts" to parent
expose-src * from "interfaces/source.ts" to parent
```

## Presentation

**Directory:** `subs/presentation/`. **README first paragraph:**

> Presentation prepares and renders the teaching diagrams and their interactions from the definitive model. It owns diagram meaning, rows, labels, colors and React components, and supplies neutral geometry inputs to its layout child.

Complete final `module.ramify`:

```ramify
ramify 1
module presentation tagged [ui, browser]

// V1-V3: rendering values keep UI coupling and explicit browser promises.
expose-src ModelDiagram, ModelDiagramSvg from "ModelDiagram.tsx" tagged [ui, browser] to parent
expose-src TreeDiagram, TreeDiagramSvg from "TreeDiagram.tsx" tagged [ui, browser] to parent
expose-src FocusDiagram, FocusDiagramSvg from "FocusDiagram.tsx" tagged [ui, browser] to parent
// V4-V7: owned props, no implicit exposure of types they mention.
expose-src ModelDiagramProps, ModelDiagramInteractiveProps from "ModelDiagram.tsx" to parent
expose-src TreeDiagramProps from "TreeDiagram.tsx" to parent
expose-src FocusDiagramProps from "FocusDiagram.tsx" to parent
expose-src DiagramDefinition from "diagram-definition.ts" to parent
expose-src TreeDiagramDefinition from "tree-diagram.ts" to parent
expose-src FocusDiagramDefinition from "focus-diagram.ts" to parent
// V8-V15: independently owned teaching fixtures.
expose-src shopDiagram from "diagrams/shop.ts" tagged [ui, browser] to parent
expose-src example1Diagram from "diagrams/example1.ts" tagged [ui, browser] to parent
expose-src example1aDiagram from "diagrams/example1a.ts" tagged [ui, browser] to parent
expose-src example1bDiagram from "diagrams/example1b.ts" tagged [ui, browser] to parent
expose-src example2Diagram from "diagrams/example2.ts" tagged [ui, browser] to parent
expose-src example3Diagram from "diagrams/example3.ts" tagged [ui, browser] to parent
expose-src example4Diagram from "diagrams/example4.ts" tagged [ui, browser] to parent
expose-src shopTreeDiagram, shopFocusDiagram from "diagrams/shop-tree.ts" tagged [ui, browser] to parent
```

## Layout

**Directory:** `subs/presentation/subs/layout/`. **README first paragraph:**

> Layout computes geometry and viewport transformations from neutral keys, ordered edges and measured dimensions. It owns its coordinate vocabulary and has no dependency on model decisions, parent presentation types or React.

Complete final `module.ramify`:

```ramify
ramify 1
module layout tagged [browser]

// L1: every interface definition is neutral and layout-owned.
expose-src * from "interfaces/layout.ts" to parent
// L2-L8: prepared inputs only; no model or parent UI types.
expose-src placeNodes from "node-placement.ts" tagged [browser] to parent
expose-src placeLanes from "lane-placement.ts" tagged [browser] to parent
expose-src placeChords from "chord-placement.ts" tagged [browser] to parent
expose-src placeLegend from "legend-placement.ts" tagged [browser] to parent
expose-src placeTree from "tree-placement.ts" tagged [browser] to parent
expose-src placeFocus from "focus-placement.ts" tagged [browser] to parent
expose-src measureBounds from "bounds.ts" tagged [browser] to parent
// L9-L10: the existing neutral geometry and viewport contract.
expose-src LAYOUT, headerBandHeight, r, polyline, textWidth, rowLabelDx, wrapText from "geometry.ts" tagged [browser] to parent
expose-src CENTER, DRAG_THRESHOLD, MAX_SCALE, MIN_SCALE, clampPan, isReset, normalizeWheelDelta, panBy, scaleOf, wheelFactor, zoomAt from "viewport.ts" tagged [browser] to parent
```

## CLI

**Directory:** `subs/cli/`. **README first paragraph:**

> The CLI parses supported arguments, invokes an injected batch operation, formats its completed report and selects the documented process exit code. It contains no checking algorithm and keeps help and version independent of compiler and server startup.

Complete final `module.ramify`:

```ramify
ramify 1
module cli tagged [dispatch]

// C1-C2: dispatch-classified behavior and vocabulary.
expose-src runCli from "run-cli.ts" to parent
expose-src * from "interfaces/cli.ts" to parent
```

## Foreign signature types

A source import may target the original defining file or a supported named entry;
Ramify permission follows the path in this table, not the filesystem hop count.
`X → parent → descendants` means exposure to the direct parent followed by that
parent's explicit exposure to all proper descendants. Every row preserves the
original owner and tags. The complete finite type-name sets below are the names
in each corresponding TypeScript block of contracts.md, not wildcard assumptions
about future source exports.

| Consumer | Foreign originals it names | Named exposure path | Form and tags |
| --- | --- | --- | --- |
| Analysis | All model definitions and operations in M1–M6 | model → analysis (M1–M6) | Type vocabulary `[]`; values `[browser]`. Analysis ordinary `[]` may import both. |
| Project | `ParsedDescription`, `DescriptionParser` (their token/document/span types are also available if explicitly named) | descriptions D2 → analysis A6 → descendants | Type imports, `[]`; no runtime parser dependency, parse operation is injected by analysis/harness. Available I5 from I4. |
| Descriptions linker | `ResolvedTagRegistry`, `ModelInput`, `ModuleId`, `OriginalId`, `SourceLocation`, `assignOriginalTags`, `deriveSourceAreas` | model M1/M3 → analysis A5 → descendants | Types `[]`; functions `[browser]` for descriptions `[browser]`. Available only I7, after model. |
| Descriptions linker | `ProjectInventory` and its project-owned component types; `SourceCatalog` and its adapter-owned component types | project P2 → analysis A7 → descendants; typescript T2 → analysis A8 → descendants | Erased type imports `[]`; no Node/compiler values enter the portable linker. |
| TypeScript adapter | `OriginalId`, `ModuleId`, `SourceArea`, `SourceLocation`, `SourceOrigin`, `BindingRequest`, `originalKey` | model M1/M4 → analysis A5 → descendants | Types `[]`, value `[browser]`, compatible with adapter `[]`. |
| TypeScript adapter | `ProjectInputView`, `ProjectInventory` and component types it names | project P2 → analysis A7 → descendants | Type imports `[]`; the live input object is supplied by analysis. |
| Analysis | Every description, project and source type referenced by `AnalysisInputs`, `AnalysisLimits`, `InventorySnapshot`, `ValidationRun`, `AnalysisSnapshot`, `AnalysisReport` | D2/D4, P2, T2 → analysis | Each is explicitly exposed to parent; no signature implies exposure. Runtime parse/link/read/create functions D1/D3/P1/T1 stay analysis-only. |
| Root batch assembly | Analysis operation inputs/results/limits and session functions; model registry constructors | A1–A5 → root | Analysis originals `[]`; registry functions `[browser]`; root `[dispatch]` has no required-symbol constraint. |
| CLI | `BatchOperation`, `BatchInvocation`, `BatchResult`; `RunControl`, `AnalysisReport`, `AnalysisDiagnostic`, `AnalysisSummary`, `StageExecution`, `CapabilityExecution` and related analysis vocabulary | root R1 → descendants; analysis A4 → root R3 → descendants | Batch types `[dispatch]`; analysis types `[]`; CLI `[dispatch]` satisfies coupling. No engine value import. |
| CLI formatter | Explicit project/module/purpose/scope types, source access/coverage types, model decision/location/tag/identity types; description types if rendering expanded evidence | child type contracts → analysis A5–A8 → root R2/R4 → descendants | All original types `[]`. R2/R4 names each type; report typing does not supply these paths. |
| Presentation preparation and its tests | Model vocabulary `Model`, `ModelInput`, `ModuleRecord`, `ModuleId`, `OriginalId`, `Original`, `SourceArea`, `SourceOrigin`, `Exposure`, `ImportQuestion`, `ImportDecision`, `VisibilityDecision`, `TagDefinition`, `ResolvedTagRegistry`, `BindingRequest`, `Destination`; model registry/profile/identity/build/decision operations | model M1–M6 → analysis A5 → root R2 → descendants | Types `[]`; all imported model values `[browser]`. Presentation ordinary `[ui,browser]` and tests `[testing,ui]` are compatible. No legacy evaluator remains. |
| Presentation geometry preparation/rendering | Every neutral type in L1; L2–L10 operations/constants | layout → presentation | Types `[]`; values explicitly `[browser]`. Layout never imports a presentation type, including type-only aliases. |
| Root declaration relay / future compatible UI consumers | V1–V15 component/props/definition/fixture names | presentation → root R5 → descendants | Types `[ui]`; values `[ui,browser]`. Root can relay them but cannot source-import either with its dispatch-only profile. |
| Independent scripts/site/package clients | Their explicitly imported component and definition types, model and layout types when needed; analysis reports for harness/build | Supported owning package/source entries from contracts.md | Separate compiler scopes, no invented toolkit ownership. TypeScript package access is not an internal Ramify exposure. |

React `ReactElement`, `Ref`, pointer-event types, Node's `AbortSignal` ambient
equivalent, and compiler dependency types are external vocabulary; resolution
must establish that external scope. React types stay in presentation. No
compiler types occur in a public report or cross-owner source contract.
Other presentation-owned helper types mentioned in its props can be inferred
by existing consumers; they stay private unless a consumer explicitly needs to
name one. Model and layout types those helpers mention already have the named
paths above. `ViewRect` reaches presentation from L1, and it is exported from
the separate `./layout` package entry for an external renderer that names it.
No foreign type is redefined as an owned alias just to bypass a tag.

## Activation manifest

This is planning data, not new `module.ramify` syntax. For a named relay, use
only the subset listed as available at that stage; for an owned wildcard, the
corresponding interface file contains only the real definitions listed for that
stage. Interface file names stay fixed while their real contracts grow.

| Iteration | Added originals and exposures | Required provider availability / package entry |
| --- | --- | --- |
| 2 | All nine two-line headers and README purposes only; no exposure statements | Empty sources; legacy sources remain at root until I8. No new package entry. |
| 3 | Model M1–M6, analysis A5; root R2 | Complete model definitions/functions from contracts.md. Provider is model; no dependency on parser/project. Model source `index.ts` is usable by independent harness, package entry waits I8. |
| 4 | Descriptions D1/D2, syntax-name portion of A6 | `interfaces/syntax.ts` and `parse.ts` only, standalone from model. R4's syntax-name portion can activate now. No D3/D4 or linking types. |
| 5 | Project P1/P2, A7, project-name portion of R4 | Uses D2 types; no I3 dependency. Short-lived configuration-only compiler client is owned by project. No source-analysis program. |
| 6 | TypeScript T1/T2; source-name portion A8/R4 | Model and project contracts exist. `SourceAnalysis` exposes catalog/dispose only until I9; only catalog-required source types exist. No fake accesses member. |
| 7 | Descriptions D3/D4; linking-name portion A6/R4; analysis A1 and validation-required portion A4/R3 | `Capability`, `StageId`, `RunControl`, `AnalysisLimits`, `AnalysisInputs`, `InventorySnapshot`, `ValidationRun`, `AnalysisCode`, `AnalysisDiagnostic` become real analysis vocabulary. `validateProject` consumes the actual parser, acquisition, catalog and linker. `validation-entry.ts` is source-only. Validate all current declarations against exports from this stage onward. |
| 8 | Presentation V1–V15, layout L1–L10, root R5; analysis A2; inventory subset A4/R3 | Add `InventoryInputs`, `InventoryRun`; existing `InventorySnapshot` remains owned analysis. Migrate legacy source/tests, build/tool/site consumers. Activate `./model`, `./presentation`, `./layout`, `./analysis/inventory` package entries. Validation continues through source validation-entry. |
| 9 | `SourceAnalysis.accesses`, `SourceAccess`, `SourceTarget`, `WrittenForm`, `AccessSelection`, `BindingRequest` usage and access-limit types as required; add corresponding A8/R4 names | Actual static interpreter, no placeholder namespace/lazy claims. Model `BindingRequest` itself has existed since I3. No additional runtime exposure function is needed. |
| 10–11 | Implement tag/origin and bounded namespace/lazy/symbol-free forms behind the existing source API | Capability records reflect actual handlers and assertions. Declaration shape changes only if real types are added; missing forms stay unavailable, not empty success. |
| 12 | Analysis A3; complete A4/R3, T2/A8/R4 including coverage/resource/access types | Full `AnalysisSession`, `AnalysisRun`, `AnalysisSnapshot`, `AnalysisReport`, `AnalysisSummary`, `AccessResult`, `CapabilityExecution`, `StageExecution`, `createAnalysisSession`, `analyzeProject`; full `.`/`./analysis` package entries. Final resource/coverage behavior works. |
| 13 | Root R1; CLI C1/C2; complete final declarations with every name above active | `runBatch`, `BatchInvocation`, `BatchResult`, `BatchOperation`, `runCli`, `CliEnvironment`, `CliExitCode`; executable bin and `./cli`. Validate final package exports and all nine descriptions against actual exports. No pending exposure remains. |
| 14–15 | No planned new public originals/exposures | Reference gate, self-check/negative, relocation and measurements consume the complete final contract. A contract correction first revises this package. |

A future contexts `AnalysisDriver` type is reviewed in contracts.md only. Its
owner, relays through daemon/root, and resident operations arrive in Plan 2;
there is no placeholder daemon/contexts directory or exposure in these texts.

## Manual description review

The [description validation rules](../../../model/module-description.principles.md#validation-distinguishes-invalid-descriptions-from-ineffective-exposure)
were applied through the following review checklist on 2026-09-09. This is a manual contract review
record; no unimplemented loader/linker result or architectural acceptance is claimed.

| Review obligation | Evidence in this draft |
| --- | --- |
| One version/header and valid decoded names | All nine begin `ramify 1`; reserved root `ramify` is quoted. Header tag sets are exactly the main-plan tree. |
| Valid physical boundaries and raw source roots | Every non-root directory above lies below its direct parent's `subs/`; no description in `src/`, `src/tests/` or a container root. |
| Exact paths and real staged exports | Every `from` source names one explicit `.ts`/`.tsx` file relative to `src/`. The stage table prohibits future exports in actual declarations. Missing exports are still errors. |
| Owned wildcards select only owned originals | Only `interfaces/model.ts`, syntax/linking.ts, project.ts, source.ts, analysis.ts, batch.ts, cli.ts and layout.ts use source wildcards. They contain locally defined types, no foreign re-exports. |
| Foreign signatures need independent paths | The full table above and R2–R4/A5–A8 enumerate foreign type names. Interface syntax mentioning a foreign type creates no new exposure. |
| Expose-sub names direct children and complete hops | Analysis refers only to its four children; root only to analysis/presentation; no source-based sibling permission. Layout exposes only to presentation. |
| Exposure and availability remain separate | R5 relays UI values/types without root source-imports. Node types can cross into browser linker only as erased imports. Model and layout values explicitly promise browser. |
| Mandatory tags and immutable originals | Root/CLI values/types default `[dispatch]`; presentation `[ui]` plus explicit browser on values; other ordinary types default `[]`. No relay includes `tagged`, and no alias creates a new owned claim. |
| Profile derivation and testing-origin guard | Root/CLI tests `[testing,dispatch]`; presentation tests `[testing,ui]`; model/descriptions/layout tests `[testing]`; analysis/project/typescript tests `[testing]`. No test-profile override or exposed test fixture is required. |
| Names, destinations and collisions | Every public name has one original. All declarations use parent/descendants only. Named root relay lists contain no duplicate or ambiguous exposed name; wildcard child model contract is deliberately forwarded whole. |
| Empty, ineffective and growth semantics | Header-only owners are valid; root has no to-parent exposure; empty interfaces may expand empty. Adding foreign exports to an owned wildcard invalidates it; adding an owned export deliberately expands its contract and requires package review. |
| Public/private and independent scopes | Only selected presentation entries leave their owner. Internal exported helpers remain private. Root combined barrel is removed; tools/site/example remain explicit independent scopes. |

Missing README prose affects metadata completeness, not importability validity.
The paragraphs above are exact planned first prose paragraphs, not inferred
fallback descriptions. I8 preserves site/diagram semantics while adapting their
model inputs; it must not weaken model rules to retain old fixture decisions.
