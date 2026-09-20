# Capability mapping report

## Request

- **As understood:** Add an accessible action to the module-tree detail panel that copies the selected real module's full canonical identifier from the displayed model, reports success or failure without moving focus, leaves a manual-copy value on failure, and prevents a pending result from appearing for a later selection. The action must not affect selection, collapse state, graph position, analysis, or project files, and it does not apply to the synthetic project node or an empty selection.
- **Question type:** discovery, then placement
- **Requesting module:** `ramify/presentation/project-view` as the identified module-tree detail-panel owner

## Method

- **Architect revision:** `rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:4`; input `input/1:9ca31c2bf2f66f17d0a67b2adcba33af79e9c59821900865c32637c2c876f3f9`
- **Guidance read:** `.agents/skills/module-architect/references/discovery.md`, `.agents/skills/module-architect/references/placement.md`, `.agents/skills/module-architect/references/cognitive-decomposition.md`, and `.agents/skills/module-architect/report.md`
- **Project and invocation guidance read:** `CLAUDE.md`, `ramify-agent/AGENTS.md`, `ramify-agent/docs/spikes/work-brief-examples/protocol.md`, `ramify-agent/docs/spikes/work-brief-examples/examples/copy-module-id/request.md`, and the supplied `mapping-prompt.txt`
- **Source read:** `subs/presentation/subs/project-view/src/ModuleTreeView.tsx`, `subs/presentation/subs/project-view/src/interfaces/project-view.ts`, and `subs/explorer/src/ModuleTreePage.tsx`
- **Verification performed:** Used the coordinator's shared architect/API snapshot without refreshing it. Searched the architect view in three narrowing groups: clipboard/copy terms, module-detail/selection terms, and announcement/accessibility/feedback terms. Opened the `ramify/presentation/project-view`, `ramify/explorer`, and `ramify/service-api` candidate records. Inspected the project-view and explorer ordinary API metadata, confirmed `ModuleTreeView` in the explorer's generated API view, and read bounded source where cut signatures did not establish detail rendering, selection ownership, or canonical identifier use. No implementation or tests were run.

## Evidence

- The shared architect view records 15 modules, measured production dependencies, measured test references and metrics, 366 cut details, one unavailable detail, and 21 dynamic titles at this revision (`.ramify-architect/_meta.json:1`).
- `ramify/presentation/project-view` explicitly owns a collapsible module tree with a module detail panel, carries `browser` and `ui` tags, and has no child modules (`.ramify-architect/presentation/project-view/module.json:3`, `.ramify-architect/presentation/project-view/module.json:6`, `.ramify-architect/presentation/project-view/module.json:7`, `.ramify-architect/presentation/project-view/module.json:12`).
- `ModuleTreeView` is exposed by `ramify/presentation/project-view`, is behaviorally used by `ramify/explorer`, and is re-exposed through the presentation and root modules (`.ramify-architect/presentation/project-view/behavior.jsonl:2`).
- The existing module-tree tests cover keyboard selection, every detail section for a selected module, the no-selection summary, opening a real module, and the synthetic project node remaining neither selectable nor openable (`.ramify-architect/presentation/project-view/tests.jsonl:2`).
- `ExplorerModule` contains distinct `id`, `name`, and `directory` fields, so the displayed model already distinguishes the canonical identifier from the short name and filesystem directory (`subs/presentation/subs/project-view/src/interfaces/project-view.ts:33`).
- `ModuleTreeView` obtains the selected real module from the current index and renders the summary instead when no real module is selected; the synthetic node carries no module data and is marked non-selectable (`subs/presentation/subs/project-view/src/ModuleTreeView.tsx:178`, `subs/presentation/subs/project-view/src/ModuleTreeView.tsx:188`, `subs/presentation/subs/project-view/src/ModuleTreeView.tsx:245`, `subs/presentation/subs/project-view/src/ModuleTreeView.tsx:320`).
- The current detail header displays the module's short name and directory and offers an import-explorer action using `module.id`; it does not currently display a distinct canonical-id copy action (`subs/presentation/subs/project-view/src/ModuleTreeView.tsx:372`, `subs/presentation/subs/project-view/src/ModuleTreeView.tsx:384`, `subs/presentation/subs/project-view/src/ModuleTreeView.tsx:385`, `subs/presentation/subs/project-view/src/ModuleTreeView.tsx:397`).
- `ramify/explorer` owns the connected browser page and page-level selected and collapsed identifiers, then supplies them to `ModuleTreeView`; it does not own the detail rendering (`.ramify-architect/explorer/module.json:12`, `subs/explorer/src/ModuleTreePage.tsx:18`, `subs/explorer/src/ModuleTreePage.tsx:22`, `subs/explorer/src/ModuleTreePage.tsx:55`).
- The project-view ordinary API snapshot has full recorded coverage (`1`) at the same revision (`subs/presentation/subs/project-view/src/.ramify/_meta.json:1`).
- The explorer ordinary API snapshot also has full recorded coverage (`1`) at the same revision and contains `ModuleTreeView`, establishing its availability to that requester (`subs/explorer/src/.ramify/_meta.json:1`, `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/ModuleTreeView.tsx.md:1`).

## Answer

The requested behavior is an extension of `ramify/presentation/project-view`, not a new module capability or a service/analysis capability. That owner already renders the selected real module's detail panel, receives the canonical identifier in `ExplorerModule.id`, and separates real modules from the synthetic project node. The copy action, exact payload choice, accessible result announcement, manual fallback, and module-keyed pending outcome all require the same selected-detail knowledge and fit one local presentation responsibility.

No existing clipboard-writing behavior was found in the three bounded discovery searches. The closest unrelated matches in `ramify/service-api` describe copying analysis evidence into a browser model, not writing text to the browser clipboard. This negative result is not proof of absence beyond the inspected evidence.

The map separates the existing detail and identity capabilities from two extensions: copying the selected module identity and reporting a module-scoped asynchronous outcome. This expresses semantic responsibilities without selecting work items, implementation sequence, or an API design.

## Alternatives

Preserving the current module tree is the recommended placement. The new behavior is small, browser-only, and cohesive with the detail panel's existing selected-module rendering. A new child would add a contract and navigation boundary while leaving the parent responsible for the selected module and the rendered panel, so it would not reduce the implementation knowledge needed for this capability.

The strongest rejected alternative is `ramify/explorer`. It owns page composition and the persistent selected/collapsed identifiers, but it consumes `ModuleTreeView` and does not render the detail panel. Moving clipboard and feedback state there would require widening the component boundary and coordinating a panel-local asynchronous outcome with page-level tree state. The request does not require a server, service model, or analysis change.

## Proposed changes

No module declaration, ownership move, or new module is proposed. The capability map assigns both extensions to the existing `ramify/presentation/project-view` owner.

## Not verified

The architect metadata reports 366 cut details, one unavailable detail, and 21 dynamic test titles. The candidate source inspection resolved the cut `ModuleTreeView` signature and the relevant selection/detail questions, but semantic search remains imperfect.

No clipboard helper or clipboard-specific behavior was found, which is not proof of absence outside the bounded candidates. Exact feedback wording, presentation duration, and the always-visible versus failure-specific manual-copy treatment remain local engineering choices. No browser behavior, clipboard permissions, accessibility tree, source mutation, tests, or implementation was exercised.

## Next step

The coordinator should review `capability-map.json` for schema shape, capability-only content, and supported availability claims. Stage A selects no engineering task or implementation brief.
