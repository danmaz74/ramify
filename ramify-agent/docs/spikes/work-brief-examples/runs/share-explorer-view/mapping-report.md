# Capability mapping report

## Request

- **As understood:** Map the capabilities needed for an import-explorer link that canonically represents meaningful view state, survives reload and browser navigation, restores against the latest available analysis, preserves valid settings when requested entities disappear, and gives truthful clipboard feedback.
- **Question type:** discovery, then placement for behavior not found
- **Requesting module:** `ramify/explorer`

## Method

- **Architect revision:** `rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:4`; input `input/1:9ca31c2bf2f66f17d0a67b2adcba33af79e9c59821900865c32637c2c876f3f9`
- **Guidance read:** `references/discovery.md`, `references/placement.md`, `references/cognitive-decomposition.md`, `report.md`
- **Source read:** `subs/explorer/src/ProjectExplorerPage.tsx`; `subs/explorer/src/browser-app.tsx`; `subs/presentation/subs/project-view/src/ProjectExplorerView.tsx`; `subs/presentation/subs/project-view/src/interfaces/dependency-view.ts`; `subs/presentation/subs/project-view/src/dependency-graph.ts`
- **Verification performed:** Used the coordinator's shared architect/API snapshot without refreshing it. Read `_meta.json`, narrowed discovery with explorer/graph/dependency, URL/history/clipboard/navigation, and presentation/settings/selection terms, then opened the `ramify/explorer`, `ramify/presentation/project-view`, and `ramify/service-api` architect records. Checked requester-specific availability in `subs/explorer/src/.ramify/`. Validated the two authored files as JSON/Markdown artifacts only; no implementation or tests were run.

## Evidence

- The shared architect snapshot covers 15 modules at the revision above. Dependency evidence, production dependency scope, test references, and metrics are measured; the snapshot reports 366 cut fields, one unavailable detail, and 21 dynamic test titles (`.ramify-architect/_meta.json`).
- `ramify/explorer` owns the resident browser pages and currently consumes `ramify/presentation/project-view`; its generated record names `ProjectExplorerPage`, `createProjectExplorerBrowserApp`, `selectInitialModule`, and `focusModule` (`.ramify-architect/explorer/module.json`; `.ramify-architect/explorer/behavior.jsonl`).
- Current browser parsing recognizes only the `module` query parameter, and the browser app passes that value as the explorer's initial module (`subs/explorer/src/browser-app.tsx:16-34`).
- `ProjectExplorerPage` currently owns controlled dependency settings, module and edge selection, presentation-class selection, scope, and the legacy focus notice. It initializes those values locally and supplies them to `ProjectExplorerView` (`subs/explorer/src/ProjectExplorerPage.tsx:28-46,51-93,153-180`).
- The page already waits for project data before applying legacy module focus and reports a missing module, while its reconciliation effect clears some values that no longer occur in the current model (`subs/explorer/src/ProjectExplorerPage.tsx:66-93`).
- `ramify/presentation/project-view` owns pure browser-facing rendering of the revision-bound explorer model. `ProjectExplorerView` accepts controlled selection, presentation classes, scope and dependency settings and reports their changes through callbacks (`.ramify-architect/presentation/project-view/module.json`; `subs/presentation/subs/project-view/src/ProjectExplorerView.tsx:57-91,104-137`).
- The dependency settings consist of `showNonBehavioral`, `depthMode`, `showOutsideScope`, and `showOwnSourceNode`; the generated API documentation says they are local display settings and never request data (`subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/interfaces/dependency-view.ts.md:139-150`).
- The presentation tests exercise class filtering, scope roll-up, exact-link selection reconciliation and own-source selection reconciliation, providing existing behavior to preserve rather than reimplement (`.ramify-architect/presentation/project-view/tests.jsonl:3-7`).
- The generated ordinary API view for `ramify/explorer` has coverage 1 at the shared revision and makes `ProjectExplorerView`, `DependencySettings`, `GraphSelection`, and `ownSourceNodeModule` available (`subs/explorer/src/.ramify/_meta.json`; `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/ProjectExplorerView.tsx.md:19-58`; `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/interfaces/dependency-view.ts.md:139-150`; `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/moduleGraphShared.ts.md:1-8`; `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/dependency-graph.ts.md:36-39`).
- Existing `usePublishedProjectView` and `usePublishedDependencyView` behavior loads a published project view and requests dependency data for the exact displayed revision; the connected-page tests cover revision alignment, delayed dependency readiness, stale data and refresh (`.ramify-architect/explorer/behavior.jsonl`; `.ramify-architect/explorer/tests.jsonl`).
- `ramify/service-api` already projects revision-bound project and dependency data and serves the resident local web application. No requested capability requires it to store shared views or historical analysis (`.ramify-architect/service-api/module.json`; `.ramify-architect/service-api/behavior.jsonl`).

## Answer

The current module tree can own the requested capabilities. Extend `ramify/explorer` to own canonical browser navigation state, delayed restoration, current-data reconciliation, and clipboard interaction. Continue to use `ramify/presentation/project-view` for the controlled explorer presentation and its existing selection/settings behavior. Their cross-branch seam must agree which controlled values constitute navigation and distinguish user callbacks from restoration. Keep latest revision data loading in `ramify/explorer`; no server-side saved-view capability is indicated. Relationships among navigation, copying, reconciliation, and data loading within `ramify/explorer` remain local capability relationships rather than seams.

This is architectural judgment from the cited behavior. The feature is an extension of the browser page's existing state and legacy `?module=` focus rather than a new cross-project or analysis responsibility. The capability map separates the abilities and their seams without selecting work items, iterations, or future APIs.

## Alternatives

Preserving the current tree is the preferred placement. Browser address, history, delayed state application, and clipboard outcomes share the lifecycle already owned by `ProjectExplorerPage` and `createProjectExplorerBrowserApp`; the controlled rendering stays with the existing project-view owner.

The strongest rejected alternative is a new child under `ramify/explorer` for shareable-view state. It could hide parsing and canonicalization, but the evidence shows one browser page, one existing legacy query parameter, and tightly coupled page-owned state. A new boundary would add a contract and navigation cost without evidence that the current local complexity is unmanageable. Work size alone does not justify that module.

Placing canonical URL and history behavior in `ramify/presentation/project-view` also loses because that module is a pure browser-facing rendering owner with controlled inputs; it does not own the browser page lifecycle or current address. Placing it in `ramify/service-api` conflicts with the request's navigation-only, no-database constraint and that module's revision-bound service projection purpose.

## Not verified

The snapshot has one unavailable detail, 366 cut fields, and 21 dynamic test titles. Although the requester API view reports full coverage, architect-view absence remains not proof that no helper exists. No existing canonical view-state, browser-history, or copy-view capability appeared in the three bounded searches or candidate records.

The exact URL grammar, normalization rules, push-versus-replace policy, clipboard UI, notice aggregation, and stable dependency-selection representation are not established here. `showOutsideScope` exists in the current settings but is not explicitly named by the request. These uncertainties do not block identifying the bounded consumer owner; they remain local engineering decisions constrained by deterministic links, legacy compatibility, and restoration acceptance.

No source changes, module declarations, contracts, fakes, tests, or implementation checks were performed. The link's behavior across changed revisions and missing dependency links remains unverified.

## Next step

The coordinator should validate `capability-map.json` for schema shape, capability references, absence of work instructions, and support for each availability claim. This stage stops at that artifact review and does not select an implementation iteration.
