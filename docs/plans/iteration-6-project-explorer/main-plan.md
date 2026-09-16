# Plan 6: Project explorer

**Date:** 2026-09-16. **Status:** complete; all seven iterations and the
acceptance matrix passed. This revision follows the product direction accepted on 2026-09-16:
deliver the best useful visualization available from Ramify's existing report,
using cucumber-viz's explorer as the implementation starting point. Conformance
with the older roadmap brief is not an acceptance criterion.

## Product choice

This is a **source-first visualization port**, not a new analysis project.

- Start from cucumber-viz's working module-architecture page, radial graph,
  panels, styles and tests. Preserve their component boundaries and interaction
  behavior unless Ramify has no data for the behavior or a host dependency must
  be injected.
- Obtain project structure from one revision-qualified `check` request with
  `scope: 'report'`. Pure aggregation and presentation mappings over that report
  are in scope. The existing retained symbol-detail extractor may be exposed for
  on-demand signatures; new compiler passes and semantic indexes are not.
- Never fabricate unavailable facts. Keep useful panel structure and render an
  explicit unavailable or approximate state where the report cannot supply the
  original cucumber-viz value.
- Prefer a small compatibility projection shaped for the lifted components over
  redesigning the UI around an ideal Ramify-native model. Later work may replace
  compatibility fields and labels with richer Ramify semantics.

The view may change vocabulary where retaining the old label would be false:
Ramify tags replace inferred module types, decisions replace public/deep-import
claims, and exposure destinations replace server/client barrel badges. These
are narrow adapter changes, not a broader redesign.

## Runnable outcome

```sh
ramify explore
ramify explore --root examples/collection-review
```

The command ensures a compatible daemon, starts or reuses a local web process,
opens the browser and exits. The browser provides the cucumber-viz explorer's
radial graph, breadcrumbs, tag filters, pan/zoom/minimap, out-of-view nodes,
module and edge selection, resizable details, export inventory, source
locations, decision/coverage badges and loading/error/empty states.

The header names the displayed revision. Polling detects a newer published
revision and offers an explicit refresh; the page never mixes revisions or
silently replaces the current view.

## Data boundary

The implemented service already returns a retained `AnalysisReport` for a named
published revision. The projection consumes the report plus its context revision
and computes the compatibility model in [view-model.md](view-model.md). The
procedure, detail bridge, module and local-web contracts are frozen in
[contracts.md](contracts.md).

### Directly available

- modules, parent/child structure, directories, tags, purpose and owned files;
- source accesses, written specifiers, target categories and selections;
- original identities, value/type capability, forwarding origins and exposure
  declarations;
- allowed/denied decisions, reasons, diagnostics and coverage limits;
- report summary and exact source locations.

### Pure computations

- owner-pair dependency edges and external/builtin/unresolved/outside-module
  target groups;
- owned and subtree file totals, dependency/dependent counts, access-occurrence
  counts and distinct selected-symbol counts;
- edge status: denied when any access is denied, limited when evidence is
  incomplete, allowed otherwise;
- presentation class and color from the module's declared tags;
- the source explorer's approximate complexity fallback, using owned-file and
  dependency counts and labeling it approximate;
- export aliases and exposure badges by joining catalog exports, originals and
  effective exposures.

### On-demand existing enrichment

The retained TypeScript adapter already computes bounded, body-free signatures
and first documentation paragraphs. The explorer exposes that provider through
a thin revision-bound service operation; it does not implement another
extractor. Details are available only for the session's current revision. A
superseded, cold or released compiler returns an explicit unavailable state and
the rest of the view remains usable.

### Explicitly unavailable in this delivery

- precise complexity measurements and dependency cycles;
- conversation/agent execution unless a consuming host injects the optional
  discussion component.

The export panel remains present. It loads a signature through the retained
provider when available and displays the exact truncated/unavailable outcome
otherwise; it never presents a missing detail as an empty signature.

## Reuse contract

The [lift inventory](lift-inventory.md) was verified against cucumber-viz
`44b7f30`. Implementation copies the recorded component and test files with
their provenance, then makes the smallest changes needed to:

1. replace the host type barrel with the compatibility view model;
2. inject `AgentChatPanel` and transport callbacks;
3. replace false barrel/classification/access labels;
4. add explicit limited/unavailable states and Ramify target categories; and
5. extract only the required stylesheet rules.

Each lifted file records its source path and commit. The completion report gives
a file-by-file reuse account: copied, mechanically adapted, behaviorally changed
or rewritten, with the reason for every behavioral change. No percentage target
encourages preserving code that is wrong, but an unexplained rewrite of a listed
lift candidate fails review.

## First-release service contract

The browser surface is intentionally small:

```ts
interface ProjectViewInput {
  readonly token: ContextToken;
  readonly revision?: RevisionId;
}

type ProjectViewResult =
  | { readonly status: 'ready'; readonly revision: ContextRevision;
      readonly view: ProjectExplorerModel }
  | { readonly status: 'pending'; readonly current: ContextStatus }
  | { readonly status: 'unavailable'; readonly reason: string;
      readonly current?: ContextStatus;
      readonly limit?: { readonly maximumBytes: number;
        readonly observedBytes: number } };

interface ExplorerDetailsInput {
  readonly token: ContextToken;
  readonly revision: RevisionId;
  readonly requests: readonly SymbolDetailRequest[];
}

type ExplorerDetailsResult =
  | { readonly status: 'ready'; readonly revision: ContextRevision;
      readonly details: readonly SymbolDetail[] }
  | { readonly status: 'superseded' | 'unavailable'; readonly reason: string };
```

`projectView` calls the existing daemon `check` operation with report scope and
published freshness. If `revision` is supplied, that exact retained revision is
requested. The projection runs over `{ revision, report }`; it never accesses
the filesystem, compiler or daemon internals. `explorerDetails` delegates
bounded requests to the existing retained provider and requires the displayed
revision still to be current. `contextStatus` is the third browser operation.

The complete model travels in one bounded response. This deliberately matches
cucumber-viz's existing analyze-page flow and minimizes container changes. A
response above 16 MiB is refused explicitly. Pagination is deferred until a
real project exceeds this boundary.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `presentation/subs/project-view [ui, browser]` | Lifted graph, panels, styles and interaction state. Pure props and callbacks; no service client. |
| `explorer [ui, browser, dispatch]` | Connected page, tRPC client, revision polling and browser entry. |
| `service-api [dispatch]` | Local Express/tRPC/static process, report request, pure compatibility projection and browser procedure mapping. |
| `integration-tests [testing, ui, dispatch]` | Combined route/router/service tests and real browser workflow. |

No source-interpretation algorithm changes in this plan. Analysis/session,
contexts and daemon interfaces gain only the bounded `explorerDetails` path to
the existing TypeScript detail provider. The plan does not add declaration-kind
data or a second detail implementation.

## Iterations

| # | Title | Outcome |
| --- | --- | --- |
| 1 | Reuse baseline and compatibility contract | Freeze the source snapshot, destination map, DTO, procedures and visible unavailable states. |
| 2 | Lift the radial graph | Port the graph bundle, legend, styles and graph tests with fixture data. |
| 3 | Lift the page and details | Port the page view, export/details panels and page tests with injected host slots. |
| 4 | Report projection and detail bridge | Compute the DTO from `{revision, report}` and expose the existing detail provider. |
| 5 | Web process and connected explorer | Serve assets/data, connect the lifted page and preserve revision consistency. |
| 6 | `ramify explore` | Start/reuse the web process, select the project and open the browser. |
| 7 | Browser acceptance and reuse report | Prove the visual workflow on real data and record the extraction result. |

Fixture-driven presentation work precedes runtime wiring so the original
components and tests define the visual baseline. The provider is complete
before the connected browser consumes it.

## Acceptance boundary

The strict gate is the [acceptance matrix](acceptance.md). In summary:

- the lifted graph and page retain the working cucumber-viz interactions;
- the reference project and Ramify itself render from real reports;
- every visible count has a stated unit and agrees with its report occurrences;
- unavailable/truncated signatures and incomplete coverage are not rendered as
  empty or zero;
- edits publish a newer revision and refresh without mixing data;
- the actual local HTTP process and a real browser complete the workflow; and
- the completion report accounts for reuse of every lift candidate and reusable
  source test.

Performance is observational in this delivery. Record projection time,
serialized bytes and web-process memory for the reference and toolkit fixtures;
the only enforced resource limit is the existing 16 MiB response refusal and
the absence of unbounded growth across ten refreshes. Performance tuning alone
does not block an otherwise correct visualization.

## Deliberate deferrals

- Ramify-native query schemas, pagination/cursors and ranking.
- Subscription/event delivery, browser leases, slow-consumer backpressure and
  hardened multi-client lifecycle behavior.
- A published portable package entry for `project-view`.
- Eager or historical signature enrichment, precise complexity and cycle analysis.
- A complete redesign of edge, contract and exposure presentation around the
  final Ramify model.
- Optional discussion/MCP hosting.

These deferrals are intentional product scope, not unfinished acceptance work.
The delivered component boundary and compatibility adapter make later semantic
replacement possible without discarding the lifted interaction code.
