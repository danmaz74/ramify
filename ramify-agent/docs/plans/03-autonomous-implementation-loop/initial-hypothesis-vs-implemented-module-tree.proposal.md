# Capability progress visualizations: implementation plan

**Date:** 2026-09-21. **Status:** proposed; its contracts await review.
Execution has not started. A dependency-graph prototype is wired into the
current working tree, but is not accepted implementation evidence. The
nested-list module-tree prototype is rejected and is not implementation
evidence for this plan.

This file keeps the name it was proposed under. It is the implementation plan
for both capability-progress diagrams, not an unspecified later phase of a
predecessor.

This plan uses two implemented foundations:

- the initial-analysis and capability-progress records delivered by
  [Plan 3](main-plan.md); and
- Ramify's current React Flow module tree delivered by
  [Ramify Plan 6C](../../../../docs/plans/iteration-6c-module-tree-view/main-plan.md).

Both projects share this repository for now, so this one plan carries the
Ramify work as well: its first two iterations change Ramify's
`presentation/project-view`, package manifest and reference harness, and the
rest change `ramify-agent`. Ramify's source and documents still never name
the agent or its capabilities.

## Product decision

Progress has two diagrams over the same harness-owned capability meaning:

- **By module** compares initial module associations with capabilities verified
  at their current owners.
- **Dependencies** shows every returned capability once, its dependencies and
  its current `todo`, `working` or `completed` state.

Neither diagram invents another lifecycle or infers progress from changed
source. Both call `completed` **verified in run**, never deployed.

### By module

Show one current module tree that answers:

> Which capabilities did the initial architect associate with each module,
> and which capabilities are implemented in each module now?

Capability IDs are listed directly in their module nodes. Each row has two
independent indications:

- **Initial** — revision-1 entry assignments and hypotheses associated the
  capability with this module.
- **Implemented** — the current capability-progress projection says the same
  capability is `completed` and currently owned by this module.

There are no `initial 1`, `both 1` or similar summary markers. When both facts
hold, one capability row displays both indications. When placement changed,
the same capability ID appears with Initial in one module and Implemented in
the other. A completed capability absent from the initial analysis appears
only with Implemented. The comparison needs no derived "implemented elsewhere"
or "unexpected implementation" status.

A module proposed by an entry assignment is styled and labelled **proposed at
start**. This describes the initial module hypothesis, not the capability's
progress. If that module now exists, it occupies its current declared position.
If it does not yet exist, its recorded proposed parent supplies a provisional
position. No other missing module is attached to the tree by guesswork.

Implemented means verified for this run. It does not mean deployed. The module
view does not distinguish `todo` from `working`, show iteration activity, or
show accepted changes, commits, changed paths or line counts.

### Dependencies

Show the capability dependency graph specified by the
[autonomous-loop architecture](../../architecture/autonomous-implementation-loop.md#follow-up-presentation).
Consumers appear to the left of their dependencies, shared dependencies appear
once, tentative nodes and edges remain visibly distinct, and cycles are shown
explicitly rather than presented as a valid execution order.

Each capability displays its existing state directly:

| State | Meaning |
| --- | --- |
| `todo` | A registered capability's work has not started, or a tentative capability remains forecast-only. |
| `working` | Work has started but implementation, a dependency or current verification remains open. |
| `completed` | The capability has current verification evidence for this run. |

A registered `todo` is committed work that has not started. A tentative
`todo` is a forecast only and schedules no work. A capability that started and
then waited for a provider remains `working`; its retained reason explains the
wait.

There is no capability-level `failed` state. Iterations may be partial,
unsuitable, exhausted or superseded, and the run may fail, but none of those
facts establishes a terminal capability failure. The run page shows run
failure at run level and links capability detail to the existing work-item
history when failed attempts matter.

## Runnable outcome

From a run page, open **Progress → By module**. The page shows Ramify's current
top-down module tree with its existing pan, zoom, minimap, collapse, keyboard
and selection behavior. Every returned capability association is readable in
the tree without selecting a module. Selecting a capability or module exposes
its initial roles, completion reason and evidence.

The dependency graph is **Progress → Dependencies**. Only the selected progress
view is mounted, so the page does not load both large visualizations at once.
By module is the default because it answers the run's initial-versus-current
placement question; Dependencies retains detailed `todo`, `working` and
`completed` state.

For example:

```text
notes
  review-note    Initial: entry owner       Implemented: yes
  note-search    Initial: suggested owner
```

The labels and state indications are text as well as color.

## Scope

In scope:

- one reusable module-tree canvas owned and packaged by Ramify, with node
  bodies and sizes supplied by the package consumer;
- its package entry, stylesheet entry and React peer dependency;
- a harness-owned, bounded comparison projection and HTTP query;
- the existing harness-owned capability-progress response as the dependency
  graph's only progress model;
- direct capability rows in `ramify-agent`'s Run page, drawn in the canvas
  Ramify packages;
- one React runtime across the web module and the packaged canvas;
- the dependency graph's deterministic layout, coverage and selected detail;
- development previews for both diagrams, with the module preview rebuilt on
  the shared component;
- component, projection, transport, both Run-page diagrams and browser
  acceptance tests.

Out of scope:

- changing Ramify's module or importability model;
- another capability lifecycle or a client-derived progress state;
- deployment state, effort percentages or time estimates;
- source-change or commit attribution;
- fuzzy or semantic capability-name matching;
- making Ramify understand hypotheses, capabilities, runs or agent policy;
- publishing either project to a registry. The consumed surface must work with
  today's `"ramify.ts": "file:.."` dependency and with a later versioned release.

## Current state and correction

Ramify's current [ModuleTreeView](../../../../subs/presentation/subs/project-view/src/ModuleTreeView.tsx)
owns a React Flow canvas, orthogonal hierarchy edges, collapse state, selection,
auto-fit, controls and a minimap. Its pure
[tree helpers](../../../../subs/presentation/subs/project-view/src/module-tree.ts)
currently lay out fixed 184 by 64 nodes. The component consumes the complete
`ProjectExplorerModel` and renders explorer-specific node contents and detail.

Ramify's `module.ramify` declarations expose `ModuleTreeView` to the
presentation parent, but no package entry reaches it: `ramify.ts/presentation`
exports the teaching diagrams only. `ramify-agent`, as a separate project, may
not import Ramify source by relative path, and today imports no `ramify.ts`
entry at all.

Ramify lists `react` and `react-dom` as dependencies, and `file:..` links
its checkout with its own `node_modules`. A consumer with its own React would
therefore load two React instances once it renders a packaged component with
hooks. Neither
[vite.config.ts](../../../subs/web/vite.config.ts) nor the `web` project of
[vitest.config.ts](../../../vitest.config.ts) deduplicates React.

The rejected preview copied the older `ramify-agent/web` nested-list tree and
summarized capabilities as counts. This plan does not extend that implementation.
The existing implementation-map tree may remain for its current consumers, but
the capability view never imports or wraps it. The temporary
`module-activity-tree.tsx` prototype and its count-marker styles and tests are
removed when the shared tree is wired.

The dependency-graph prototype already consumes `CapabilityProgress`, lays out
dependencies and cycles, reports bounded-response gaps and is mounted from the
Run page. It is retained as predecessor work, not accepted unchanged: this plan
must verify it against the contract below, distinguish current from suggested
owners, and include it in the executable and browser completion evidence.

`ModuleTreeView.tsx` imports `./project-view.css` and `./module-tree.css` for
their side effects, and `project-view.css` imports
`@xyflow/react/dist/style.css`. The production selection promotes both files
beside the emitted JavaScript in `dist/`.

Ramify's [relocation check](../../../../scripts/reference-harness/relocation.ts)
packs the built package, installs the tarball in a bare consumer and imports one
named symbol from every entry under plain Node. It reads every `exports` value
as a `{ types, import }` pair, and its consumer installs no React.

The harness already serves the current module tree:
[app.ts](../../../subs/harness/src/http/app.ts) calls `loadModuleTree` from the
evidence module and maps a failure to `{ status: 'unavailable', message }`.

## Capability dependency contract

Dependencies needs no new harness projection. It consumes the existing
`CapabilityListResponse` from:

```text
GET /api/v1/plans/:planId/runs/:runId/capabilities
```

The web uses the public response and `CapabilityProgress` types directly:

```ts
interface CapabilityDependencyGraphProps {
  capabilities: CapabilityListResponse['capabilities'];
  total: CapabilityListResponse['total'];
}
```

It retains `entry`, `tentative`, `state`, `reason`, `dependsOn`, `workItems`
and `evidence`; it defines neither a reduced progress record nor a state
mapping. A selected node exposes the retained reason, dependencies, work items
and verification evidence.

For a registered capability, `owner` is labelled **current owner**. For a
tentative capability, the same protocol field is labelled **suggested owner**
and the forecast treatment remains visible independently of `todo`. The client
does not describe either as source participation.

The endpoint returns at most 500 capabilities and supplies `total`. When the
returned length is less than `total`, the graph visibly reports
`capabilities.length / total`; displayed state counts are labelled as counts of
the returned set. A dependency target omitted from the response is listed as
unavailable and no node is invented for it.

The graph is deterministic for one response. Consumers precede dependencies
by longest dependency depth, shared capabilities appear once, and strongly
connected capabilities occupy an explicit cycle group with their internal
edges. Tentative edges remain dashed. Layout never turns dependency order into
an execution schedule.

The Progress area remains visible while data is loading, empty or unavailable
and states which condition applies. An empty or unavailable response is never
converted into `todo`.

## Ownership and dependency direction

```text
ramify/presentation/project-view
  owns ModuleTreeCanvas, hierarchy rendering and tree interaction
          |
          | packaged as ramify.ts/module-tree and ramify.ts/module-tree.css
          v
ramify-agent/web
  supplies capability rows and Run-page presentation
          ^
          |
ramify-agent/harness
  owns capability progress, comparison meaning, protocol and projection
```

The dependency remains one-way: `ramify-agent` depends on `ramify.ts`; Ramify
does not import, name or model agent capabilities. The harness remains the only
owner of protocol meaning. The browser renders the response and never joins
revision history or module placement itself.

### Why a package import

`ramify-agent` already depends on `ramify.ts`, and a package entry survives the
repository split where a relative path would not. Copying the canvas would
guarantee two trees that drift, and building another React Flow canvas on
`ramify.ts/layout` would share geometry but duplicate edges, collapse,
keyboard handling, minimap and auto-fit.

Until now that dependency was the CLI and generated files only. This plan adds
the first Ramify code that runs in the web bundle, under the
[web-module exception](../../../AGENTS.md#dependency-direction): the web module
may render a presentation component a package entry exports, and never copies
or re-implements one. The harness and every other Node owner stay on types and
schemas. The cost of the exception is the shared React runtime below, and a
component contract Ramify must keep stable for this consumer.

## Shared Ramify component contract

Extract the graph portion of the current `ModuleTreeView` into
`ModuleTreeCanvas` in `ramify/presentation/project-view`. Both Ramify's existing
`ModuleTreeView` and `ramify-agent` render this same component. They may have
different page headers, sidebars and node bodies; there is only one hierarchy
canvas, layout path and interaction implementation.

The public contract is neutral:

```ts
export type ModuleTreeCanvasEmphasis = 'normal' | 'muted' | 'provisional';

export interface ModuleTreeCanvasNode {
  readonly id: string;
  /** Default accessible name and minimap title. */
  readonly name: string;
  readonly parent: string | null;
  readonly children: readonly string[];
  /** Accent of the node shell and its minimap mark. */
  readonly color: string;
  readonly width: number;
  readonly height: number;
  /** Shell treatment; `normal` when omitted. */
  readonly emphasis?: ModuleTreeCanvasEmphasis;
}

export interface ModuleTreeCanvasProps {
  readonly nodes: readonly ModuleTreeCanvasNode[];
  readonly rootNodeId?: string;
  readonly selectedNodeId: string | null;
  readonly collapsedNodeIds: ReadonlySet<string>;
  readonly ariaLabel: string;
  renderNodeBody(node: ModuleTreeCanvasNode): React.ReactNode;
  ariaLabelOf?(node: ModuleTreeCanvasNode): string;
  onSelectNode(id: string | null): void;
  onToggleCollapsed(id: string): void;
  onOpenNode?(id: string): void;
  readonly centerNodeId?: string | null;
}
```

Exact names may change during contract review, but these semantics do not:

1. The shared component owns React Flow, node shells and handles, hierarchy
   edges, collapse controls with hidden-descendant counts, selection, keyboard
   input, background, controls, minimap and auto-fit.
2. The consumer supplies identity, hierarchy, size, accent, emphasis, the node
   body and accessible names. It supplies nothing else.
3. Layout uses every node's supplied width and height. No two placed nodes
   overlap, a parent is centered over its visible children, and each edge ends
   on a node boundary. Ramify's existing explorer adapter supplies 184 by 64
   and retains its current rendering. Several roots keep today's synthetic
   project node.
4. `muted` and `provisional` are shell treatments the canvas owns: reduced
   contrast, and a dashed border. Both are distinguishable without color. A
   consumer adds no shell CSS of its own.
5. A consumer cannot add graph edges or bypass hierarchy placement through the
   render callback.
6. Collapse and selection state are controlled by the consumer, as they are in
   `ModuleTreeView` today.

### Interactive node bodies

A body may contain focusable controls. For an event whose target is a
`button`, `a`, `input`, `[role="button"]` or `[tabindex]` element in the body:

- a click does not select, open, drag or pan;
- a key press does not reach the shell's `Enter`, arrow or `o` handling;
- focus order is the node shell, its body's controls in document order, then
  its collapse control.

The canvas applies React Flow's `nodrag` and `nopan` behavior to those targets
itself; a consumer adds no React Flow class names.

### Package surface

| Entry | Target |
| --- | --- |
| `ramify.ts/module-tree` | `dist/subs/presentation/src/module-tree-entry.js` and its declarations: `ModuleTreeCanvas`, `ModuleTreeCanvasProps`, `ModuleTreeCanvasNode`, `ModuleTreeCanvasEmphasis`. |
| `ramify.ts/module-tree.css` | One stylesheet holding the canvas rules and the React Flow base rules it needs. |

- The canvas module has no side-effect stylesheet import. `ModuleTreeView`
  keeps importing the styles it needs, so the explorer is unchanged.
  `ramify-agent` imports `ramify.ts/module-tree.css` once and copies neither
  the tree CSS nor the layout code.
- `ramify.ts/presentation` is unchanged. Importing it still evaluates neither
  `@xyflow/react` nor a stylesheet, which its plain-Node consumers rely on.
- `module-tree-entry.ts` is `presentation` source that forwards what
  `project-view` exposes to its parent. `project-view/module.ramify` exposes
  the canvas tagged `[ui, browser]` and its types untagged, with every
  signature companion.
- `react` and `react-dom` move to `peerDependencies`, marked optional in
  `peerDependenciesMeta` because the CLI needs neither, and stay in
  `devDependencies` for Ramify's own build, site and explorer. `@xyflow/react`
  stays a dependency and resolves the consumer's React through its peer range.
- The relocation check follows the manifest: its consumer installs React so
  `ramify.ts/presentation` still loads, its entry table gains
  `ramify.ts/module-tree`, and it accepts the stylesheet entry's string target.

Ramify's existing `ModuleTreeView` remains its product-level composition over
`ProjectExplorerModel`; its route, node contents, detail panel, props and
exposure are unchanged, and `indexModuleTree`, `collapsibleAtDepth`,
`ancestorsOf` and `ModuleTreeIndex` keep their signatures. The extraction is
successful only when its existing tests pass without weakening their assertions.

### Layout budgets

| Workload | Budget |
| --- | --- |
| 500 nodes at 184 by 64 | Plan 6C's MT07 median, unchanged. |
| 500 nodes, heights from 64 to 2,000 in a fixed seeded sequence | Median of 20 layouts within twice the MT07 median; the measured value is recorded. |

### One React runtime

`react` and `react-dom` become optional peers of `ramify.ts`, but the linked
checkout still holds Ramify's development copies, and
`@xyflow/react` resolves from Ramify's `node_modules`. The web module
therefore:

- sets `resolve.dedupe: ['react', 'react-dom']` in `subs/web/vite.config.ts`
  and in the `web` project of `vitest.config.ts`; and
- inlines `ramify.ts` and `@xyflow/react` in the `web` Vitest project, so
  neither is externalized to Node resolution and Ramify's React copy.

Both settings are harmless after the split, when one installed React remains.

## Harness comparison contract

Add one query:

```text
GET /api/v1/plans/:planId/runs/:runId/module-capabilities
```

The harness loads one complete current module-tree publication and projects it
with one committed run view. The response is self-contained:

```ts
interface ModuleCapabilityComparisonResponse {
  identityPolicy: 'exact-capability-slug/1';
  runVersion: number;
  initialView: ViewIdentity | null;
  tree: ModuleTree;
  modules: Array<{
    module: string;
    placement: 'declared' | 'proposed' | 'unplaced';
    proposedAtStart: null | {
      parent: string;
      purpose: string;
      tags: string[];
    };
    capabilities: Array<{
      capability: string;
      initial: Array<{
        role: 'entry-owner' | 'suggested-owner' | 'involved';
        hypothesis: string | null;
      }>;
      implementedHere: null | {
        reason: string;
        evidence: string[];
      };
    }>;
  }>;
  coverage:
    | { state: 'complete'; capabilities: number; implemented: number }
    | {
        state: 'partial';
        knownCapabilities: number;
        knownImplemented: number;
        totalCapabilities: number | null;
        gaps: string[];
      }
    | { state: 'unavailable'; reason: string };
}
```

The Zod schema and inferred public type live with the harness protocol. The
projection is pure over the committed `RunView` and the loaded `ModuleTree`;
the query adapter performs the read, and neither path writes a record or event.
The adapter and the existing module-tree route load the tree through one shared
function, so both report the same `unavailable` result for the same failure.

`placement` is the harness's answer to where a module is drawn:

| Placement | Meaning |
| --- | --- |
| `declared` | The module is in the returned `tree`. `proposedAtStart` may still be set when an entry proposed it and it now exists. |
| `proposed` | The module is absent from the tree and one recorded proposal supplies its parent, which is `declared` or `proposed`. |
| `unplaced` | Anything else, including every module when the tree is unavailable. |

### Initial layer

- Every entry assignment associates its capability with its revision-1 owner
  as `entry-owner`.
- An entry's recorded module proposal supplies `proposedAtStart`.
- Every revision-1 hypothesis associates its capability with its suggested
  owner and each explicitly involved module.
- Duplicate associations of one capability with one module appear once while
  retaining distinct roles and hypothesis references.
- Anticipated consumers are not implementation-module associations.
- Later hypothesis revisions and placement decisions never rewrite this layer.

### Implemented layer

- Start from the complete internal `capabilityProgressOf` result, before the
  existing list endpoint's response slice.
- Only a registered row (`tentative: false`) with `state: 'completed'` produces
  `implementedHere`.
- `owner` supplies its current module; `reason` and `evidence` are preserved.
- A reopened capability is not implemented now merely because its earlier
  evidence remains in history.
- Tentative forecast-only rows never appear as implemented.

### Identity and ordering

Current records do not retain a separate forecast-to-registry link. Under the
versioned interim policy `exact-capability-slug/1`, identical capability slugs
are one comparison identity. There is no fuzzy or semantic matching.

Capability order is deterministic: entry capabilities in assignment order,
then revision-1 hypothesis capabilities in record order, then registered
capabilities first discovered during the run in registry order. Module order is
the current tree's deterministic order, with `proposed` modules inserted under
their recorded parent in name order and `unplaced` modules after them in name
order. Evidence arrays retain their existing deterministic order.

### Bounds

Two bounds apply, both in `runQueryLimits`:

| Bound | Value | Counts |
| --- | ---: | --- |
| `capabilities` | 500, the existing capability query bound | Distinct capability IDs, taken in capability order. |
| `moduleCapabilityRows` | 2,000 | Module-capability rows of the retained capabilities, taken in the same order. A capability is kept with all of its rows or dropped whole. |

When either bound drops a capability, coverage is `partial`, a gap names the
bound with the returned and total counts, and `totalCapabilities` carries the
total. Omitted rows are not inferred. Because capabilities first discovered
during the run come last in capability order, they are dropped first:
`knownImplemented` is then a lower bound, and the gap text says so.

### Coverage

`coverage` is the only count and coverage statement; `tree.status` reports the
tree alone. These invariants are enforced by the schema's refinement and
covered in `protocol-contract.test.ts`:

| Condition | `coverage.state` | Also |
| --- | --- | --- |
| The initial analysis is pending or unreadable | `unavailable` | `initialView` is null and `modules` is empty. |
| The current module tree is unavailable | `partial` | Every module is `unplaced`; the gap repeats the tree's message. |
| The recorded architect view or analysis submission reports coverage limits | `partial` | One gap per recorded limit. |
| A referenced module is absent and has no recorded proposed parent | `partial` | The module is `unplaced`. |
| Conflicting proposal metadata prevents one provisional placement | `partial` | The module is `unplaced` and `proposedAtStart` is null. |
| A bound dropped a capability | `partial` | `totalCapabilities` is set. |
| None of the above | `complete` | No module is `unplaced`. |

A complete count is shown as, for example, **3 of 5 capabilities
implemented**. A partial result shows known subtotals and its gaps, never an
exact ratio or percentage. Missing evidence is never converted into no
hypothesis, no implementation or zero. The response retains the initial view
identity, the current tree's revision and input identity, and the current run
version so the UI names the compared states.

## By-module web presentation contract

The Run page maps the comparison response into `ModuleTreeCanvasNode` values.
It does not create `ProjectExplorerModel`, fill unavailable metrics with zero,
decide placement, or import Ramify source.

Each module node contains:

1. the module's leaf name and full path on focus or hover;
2. **proposed at start** when supplied by the projection, with the
   `provisional` shell when `placement` is `proposed`;
3. one row for every returned capability associated with or implemented in
   that module;
4. the literal capability ID;
5. an outlined Initial indication with its role text where initial associations
   exist; and
6. a filled green Implemented indication where `implementedHere` exists.

The row, not a module summary count, is the unit of comparison. Node height is
derived from the number of displayed rows, so every returned capability ID is
visible in the canvas. The tree may become large, and one module may hold many
rows; the existing canvas pan, zoom, minimap and collapse controls handle
navigation. The client does not hide rows behind `+N` or truncate them again.

Each row is a `button` in the node body. Activating it by click, `Enter` or
`Space` records the selected capability and shows its complete initial roles,
hypothesis IDs, completion reason and evidence in the Run-page detail area; it
does not also select the module. Selecting the module shell shows the module's
returned capability list. Row selection is Run-page state; shell selection is
the canvas's `selectedNodeId`. Capability rows remain readable without
selection.

Branches without returned capability rows use the `muted` shell. They remain
present when the current tree is available. `unplaced` modules appear with
their rows in an explicit unavailable list beside the canvas.

The view shows its initial analysis identity, current module-tree identity,
run version, coverage state and gaps. It never labels completion as
deployment or progress by effort.

## Iterations

### Iteration 1: Shared Ramify module-tree canvas

**Owner:** `ramify/presentation/project-view`. Run its commands from the
repository root.

**Goal:** make the current tree renderer reusable without changing Ramify's
module-tree page.

**Work:**

- Record the MT07 median before editing, as the layout budget's baseline.
- Generalize the tree index and layout in `module-tree.ts` to neutral hierarchy
  fields and per-node dimensions, keeping the existing helper signatures.
- Extract `ModuleTreeCanvas.tsx` with the node contract, shell emphasis and
  interactive-body rules. It imports no explorer model type and no stylesheet.
- Move the canvas rules into `module-tree-canvas.css`, which `ModuleTreeView.tsx`
  imports beside its existing stylesheets.
- Compose the existing `ModuleTreeView` from the shared canvas with its current
  184 by 64 node body and detail panel.
- Expose the four canvas symbols from `project-view/module.ramify` to the parent.

**Verification:**

```sh
npx vitest run subs/presentation/subs/project-view/src/tests/module-tree.test.ts
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleTreeView.test.tsx
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleTreeCanvas.test.tsx
npx vitest run subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx
npm run type-check
npm run check:self
```

Add focused cases for mixed node heights, no overlaps, edge endpoints at node
boundaries, several roots, collapse counts, both emphasis shells, body-control
clicks and keys, focus order, selection, keyboard behavior, auto-fit and both
layout budgets. Existing MT01–MT07 expectations remain positive regression
controls. An `exposed-without-companion` finding is an expected intermediate
failure until every type the canvas props name is exposed with them.

**Exit:** MT01–MT07 pass with unchanged assertions, the new canvas cases pass,
and Ramify's type check and self-check are clean.

### Iteration 2: Ramify package surface

**Owner:** `ramify/presentation`, Ramify's package manifest and
`scripts/reference-harness`. Run its commands from the repository root.

**Prerequisite:** iteration 1.

**Goal:** publish the canvas through `ramify.ts/module-tree` with one
stylesheet entry and a single React runtime, proven on the packed tarball.

**Work:**

- Add `subs/presentation/src/module-tree-entry.ts`, following
  `subs/analysis/src/inventory-entry.ts`, and re-expose the four symbols from
  `presentation/module.ramify`.
- Add the `./module-tree` and `./module-tree.css` entries, and move `react` and
  `react-dom` to optional peers and development dependencies.
- Package one stylesheet holding the canvas and React Flow base rules. If the
  production selection cannot emit a combined file, record the chosen mechanism
  and keep the single consumer import.
- Update the relocation check as the package surface requires.
- Add a package-consumer fixture under `scripts/reference-harness` with its own
  manifest and React, installed from the `npm pack` tarball: a type check, a
  Vite build and a jsdom render of a hook-using body in variable-height nodes.
- Add a plain-Node probe showing `ramify.ts/presentation` loads neither
  `@xyflow/react` nor a stylesheet, with `ramify.ts/module-tree` as its
  negative control.

**Verification:**

```sh
npm run type-check
npm run build
npm run check:self
npx tsx scripts/reference-harness/<module-tree consumer runner>.ts
npx tsx scripts/reference-harness/<relocation runner>.ts
```

Name the two runners after inspecting how the reference harness starts its
cases. The relocation check failing on `ramify.ts/presentation` is an expected
intermediate failure between the manifest change and the check's update. A
linked or relative consumer does not establish this iteration's rows. Drive
`/modules/latest` on the rebuilt explorer with Chromium, following Plan 6C's
MT14 procedure, and record the explorer bundle's size delta.

**Exit:** Ramify's `/modules/latest` view is behaviorally unchanged, every
earlier package entry still imports, and the tarball consumer renders custom
variable-height node bodies through `ramify.ts/module-tree` with one React and
no deep or relative import.

### Iteration 3: Harness comparison projection and protocol

**Owner:** `ramify-agent/harness`.

**Prerequisite:** implemented Plan 3 records and progress projection. The
projection imports no UI, so this iteration is independent of iterations 1 and
2 and may execute beside them.

**Goal:** publish one bounded, revision-explicit answer containing everything
the browser needs.

**Work:**

- Add the response schema with its coverage refinement, the inferred type, both
  query limits and the protocol path.
- Implement the pure comparison projection from revision-1 assignments and
  hypotheses, current capability progress and one supplied current tree.
- Move the module-tree route's load into one function shared with the new query
  adapter, preserving its unavailable result.
- Expose the query through `RunQueries`, Express and the browser-safe harness
  contracts; update the `module.ramify` re-exposures explicitly, with every
  signature companion.
- Extend `ProtocolClient` and its stub with `getModuleCapabilities`.
- Cover pending analysis, exact-slug joins, all three initial roles, duplicate
  associations, changed placement, unforecast implementation, reopened
  completion, the three placements, conflicting proposals, an unavailable
  tree, both bounds with their lower-bound gap, and deterministic order.
- Extend the projection-purity test so this query cannot write or append.

**Verification:**

```sh
npx vitest run subs/harness/src/tests/protocol-contract.test.ts
npx vitest run subs/harness/src/tests/projections-pure.test.ts
npx vitest run subs/harness/src/tests/run-protocol.test.ts
npx vitest run subs/harness/src/tests/progress.test.ts
npx vitest run subs/harness/src/tests/http.test.ts
npm run type-check
npm run check:self
```

**Exit:** one real completed scripted run returns the comparison over HTTP with
the expected initial/current placements, identities and coverage, and the query
leaves every run file and event unchanged.

### Iteration 4: Progress subviews and the Dependencies diagram

**Owner:** `ramify-agent/web`.

**Prerequisite:** implemented Plan 3 and its `/capabilities` query. It needs
neither the canvas nor the comparison query, so it may execute beside
iterations 1 to 3.

**Goal:** give Progress its two subviews and bring the dependency-graph
prototype to the [capability dependency contract](#capability-dependency-contract).

**Work:**

- Add By module and Dependencies subviews to Progress and mount only the active
  one. Until iteration 5, By module states that it is not available yet and
  Dependencies is the default.
- Keep the Progress area visible for loading, empty and unavailable responses,
  naming the condition.
- Retain the dependency graph as a direct consumer of
  `CapabilityListResponse`; verify its dependency depth, shared nodes, cycle
  groups, tentative edges, state text, selected detail and bounded coverage,
  and correct what differs.
- Label a registered node's module as current owner and a tentative node's
  module as suggested owner. Do not infer state by parsing `reason`.
- Show run failure at run level only, with capability detail linking to the
  work-item history.
- Rebuild the dependency preview from existing `progress.test.ts` cases.

**Verification:**

```sh
npx vitest run subs/web/src/tests/capability-graph.test.tsx
npx vitest run subs/web/src/tests/run-page.test.tsx
npm run type-check
npm run check:self
```

**Exit:** CM15–CM20 pass in component and Run-page tests, and the prototype's
differences from the contract are recorded with their corrections.

### Iteration 5: By module on the packaged canvas

**Owner:** `ramify-agent/web`, with the root's Vite and Vitest configuration.

**Prerequisites:** iterations 2, 3 and 4, with Ramify rebuilt from the
repository root so the linked package carries the new entries.

**Goal:** replace the rejected module preview with the shared tree and make By
module the default subview.

**Work:**

- Apply the [one React runtime](#one-react-runtime) settings, and add a test
  that renders a hook-using row in the packaged canvas.
- Build capability node bodies, their variable dimensions and their emphasis
  from the response; import the canvas only from `ramify.ts/module-tree` and
  its styles only from `ramify.ts/module-tree.css`.
- Render every returned capability ID directly in its module node with Initial
  and Implemented indications and initial-role text.
- Add row and module selection detail, identities, coverage states and the
  `unplaced` list.
- Make By module the default subview.
- Rebuild the module preview from existing `run-protocol.test.ts` cases on the
  shared component.
- Remove the rejected `module-activity-tree.tsx` implementation, its test, its
  preview, its count badges and its bespoke tree/layout CSS. Do not remove the
  older implementation-map `module-tree.tsx` while it still has another consumer.

**Verification:**

```sh
npx vitest run subs/web/src/tests/capability-module-tree.test.tsx
npx vitest run subs/web/src/tests/run-page.test.tsx
npx vitest run subs/web/src/tests/client.test.ts
npm run type-check
npm run build:web
npm run check:self
```

An invalid-hook-call error is an expected intermediate failure until the React
runtime settings are in place.

**Exit:** CM02–CM12 pass at component level for the web module; the module page
and preview use the packaged Ramify canvas, and no old nested-list or copied
module-tree layout remains in the capability view.

### Iteration 6: Browser acceptance and completion gate

**Owner:** `ramify-agent/web` tests and the plan's result report. No product
source changes except defects this evidence finds, each recorded with its fix.

**Prerequisites:** iterations 1 to 5.

**Goal:** prove both diagrams on the real built page and close the plan.

**Work:**

- Serve a scripted-run fixture, not static markup, from the real harness and
  the built web client.
- Drive Chromium at desktop and narrow widths and record screenshots of
  matching placement, changed placement, implemented-only placement,
  proposed-at-start, a module with 60 rows, dependency depth, a shared
  dependency, a cycle, tentative progress and partial coverage.
- Exercise keyboard selection in both diagrams, including a row in a node;
  exercise collapse, pan and zoom through the shared module canvas; confirm
  only the selected subview is mounted and no console error occurs.
- Run the [completion gate](#completion-gate), including the one complete
  `npm test`, and the searches of its item 5.
- Write the result report mapping CM01–CM24 to tests and browser artifacts.

**Verification:**

```sh
npm run build:web
npm test
npm run type-check
npm run check:self
```

**Exit:** every completion-gate item holds with recorded evidence.

## Acceptance matrix

| ID | Required result | Iteration |
| --- | --- | ---: |
| CM01 | Ramify's module-tree page and the agent capability tree render the same packaged hierarchy canvas; the web module has no Ramify source import, no copied tree CSS or layout and no shell CSS of its own | 1, 2, 5 |
| CM02 | Every returned capability ID is listed directly in each associated or implementing module node | 5, 6 |
| CM03 | Entry owner, suggested owner and involved module remain distinct Initial roles; anticipated consumers do not become rows | 3, 5 |
| CM04 | Only non-tentative current `completed` progress displays Implemented; reopened, `todo` and `working` do not | 3, 5 |
| CM05 | The same exact capability slug can show Initial in one module and Implemented in another without a mismatch status | 3, 5, 6 |
| CM06 | A completed registered capability absent from revision 1 appears with Implemented only | 3, 5, 6 |
| CM07 | `declared`, `proposed` and `unplaced` come from the harness; a proposed entry module is labelled proposed at start and placed only from its recorded parent; the client makes no placement decision | 3, 5, 6 |
| CM08 | Every row of the coverage invariant table holds in the schema and the projection; no unknown is rendered as zero or absence | 3, 5, 6 |
| CM09 | By module renders none of the words activity, commit, changed, lines, deployed or a `%` sign for the full scripted fixture, and the response schema carries no such field | 3, 5 |
| CM10 | A consumer installed from the packed tarball type-checks, builds and renders a hook-using body with one `react` in its dependency tree; the same row renders in the agent's Vitest and built page with no invalid-hook-call error | 2, 5, 6 |
| CM11 | Collapse, shell selection, row selection by click and keyboard, focus order, pan, zoom, minimap and auto-fit work with variable-height capability nodes | 1, 5, 6 |
| CM12 | Both layout budgets hold with measured values recorded; a fixture beyond each response bound returns `partial` with the named bound, totals and the lower-bound statement; a 60-row module lays out without overlap and stays navigable | 1, 3, 5, 6 |
| CM13 | Ramify's existing MT01–MT07 behavior and visual node content remain unchanged after extraction, and `/modules/latest` behaves as in Plan 6C's MT14 on the rebuilt explorer | 1, 2 |
| CM14 | The comparison response is deterministic, carries initial/current/run identities and is a read-only projection | 3 |
| CM15 | Dependencies renders every returned capability once with the harness's literal `todo`, `working` or `completed` state and never derives state from reason text | 4 |
| CM16 | Registered `todo` and tentative forecast-only `todo` remain distinguishable; current and suggested owners are labelled accurately | 4, 6 |
| CM17 | Dependency edges run from consumer to dependency, shared dependencies appear once, and cycles retain explicit internal edges without implying execution order | 4, 6 |
| CM18 | A bounded capability response reports shown versus total, labels displayed state counts as returned-set counts and lists omitted dependency targets without inventing nodes | 4, 6 |
| CM19 | For a failed run whose capability has exhausted attempts, the node's state text is its literal `working` or `todo`, the word failed appears only in the run-level status and the work-item history, and `capabilityStateSchema` still has three members | 4 |
| CM20 | Progress offers By module and Dependencies, keeps the section visible for loading, empty and unavailable states, and mounts only the selected large visualization | 4, 6 |
| CM21 | `muted` and `provisional` shells differ from `normal` by class and by a non-color cue; a click or key press on a body control neither selects, toggles nor opens its node | 1 |
| CM22 | `ramify.ts/presentation` evaluates under plain Node without loading `@xyflow/react` or a stylesheet; the same probe on `ramify.ts/module-tree` reports `@xyflow/react` | 2 |
| CM23 | The tarball holds the entry, its declarations and the stylesheet; `react` and `react-dom` are optional peers and absent from `dependencies`; the consumer's built CSS holds the canvas and React Flow base rules from one import; the relocation check passes with every earlier entry importable | 2 |
| CM24 | `ModuleTreeCanvas.tsx` imports no explorer model type, no stylesheet and nothing from `ModuleTreeView.tsx`; no Ramify file names the agent or a capability | 1, 2 |

## Completion gate

1. CM01–CM20 have executable evidence, each mapped to the named tests and
   browser artifacts in the iteration results.
2. Ramify passes its focused tree tests, type check, production build, batch
   self-check, relocation check and tarball consumer after the extraction.
3. `ramify-agent` passes its complete type check, test suite, web build and
   batch self-check against the built Ramify package.
4. A real HTTP query over the scripted fixture and a Chromium Run-page session
   demonstrate initial-only, implemented-only, same-module, changed-placement,
   proposed-at-start, dependency depth, shared dependency, tentative, cycle and
   partial-coverage cases across the two diagrams.
5. Search confirms the capability view has no relative import from Ramify, no
   copy of the tree layout/React Flow implementation and no reference to the
   rejected nested-list component.
6. The result report distinguishes structural checks, executable component and
   protocol tests, browser behavior and any unavailable live evidence.

## Review decisions

1. `unavailable` is reserved for a missing initial analysis; an unavailable
   tree is `partial` with every module `unplaced`. The alternative treats both
   as `unavailable` and shows nothing.
2. The 2,000-row bound and whole-capability truncation. The alternative bounds
   rows per module and needs a per-module gap.
3. Whether this plan takes a number of its own under `docs/plans/` once
   accepted, or stays beside Plan 3.

## Deliberately deferred

- A durable forecast-to-registry identity distinct from exact capability slug.
- Deployment observation.
- Effort-weighted progress or time remaining.
- Source-change attribution by module.
- Exporting `ModuleTreeView`, `ProjectExplorerView` or the explorer model
  through a package entry.
- A registry-published package release; the public entry and tarball consumer
  prepare for it without making release part of this plan.
