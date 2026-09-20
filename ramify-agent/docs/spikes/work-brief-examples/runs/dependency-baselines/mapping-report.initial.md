# Capability mapping report

## Request

- **As understood:** Add named, durable, project-scoped snapshots of Ramify's existing production dependency view and compare a chosen snapshot with one coherent current analysis through terminal and browser surfaces. Preserve canonical ownership, existing classifications and counts, side-specific evidence and coverage; make lifecycle failures, incompatibility, limits and staleness explicit.
- **Question type:** discovery, access, then placement
- **Requesting module:** none; the request names terminal and explorer consumers

## Method

- **Architect revision:** `rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:4`, input `input/1:9ca31c2bf2f66f17d0a67b2adcba33af79e9c59821900865c32637c2c876f3f9`
- **Guidance read:** `.agents/skills/module-architect/SKILL.md`; `.agents/skills/module-architect/references/discovery.md`; `.agents/skills/module-architect/references/access.md`; `.agents/skills/module-architect/references/placement.md`; `.agents/skills/module-architect/references/cognitive-decomposition.md`; `.agents/skills/module-architect/report.md`; `CLAUDE.md`; `ramify-agent/AGENTS.md`; `ramify-agent/docs/spikes/work-brief-examples/protocol.md`
- **Source read:** none
- **Verification performed:** Used the coordinator's shared generated snapshot without refreshing it. Read `.ramify-architect/_meta.json` and the architect map; searched generated behavior and test records; opened the analysis, daemon/contexts and service-api candidate records; checked ordinary requester API views for each availability assertion. No implementation or tests were run.

## Evidence

- The architect snapshot identifies 15 modules at revision `rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:4`; production dependencies, test references and metrics are measured. It also records 366 cuts, one unavailable detail and 21 dynamic titles (`.ramify-architect/_meta.json:1`).
- `ramify/analysis` owns captured input identity, immutable reports, retained revision computation and the dependency diagram projection. The projection describes production facts from one completed analysis (`.ramify-architect/README.md:23`; `.ramify-architect/analysis/behavior.jsonl:1`; `.ramify-architect/analysis/behavior.jsonl:95`).
- Existing dependency behavior already deduplicates architectural units and preserves partial coverage and classifier limits rather than turning uncertainty into zero (`.ramify-architect/analysis/tests.jsonl:28`; `.ramify-architect/analysis/tests.jsonl:43`; `.ramify-architect/analysis/tests.jsonl:44`).
- `ramify/daemon/contexts` isolates projects, serializes requests and updates, and atomically publishes immutable revisions. Its exact-history behavior refuses unavailable exact revisions rather than substituting current data (`.ramify-architect/README.md:44`; `.ramify-architect/daemon/contexts/tests.jsonl:3`; `.ramify-architect/daemon/contexts/tests.jsonl:22`).
- The existing context history is bounded process state: it excludes full input graphs, admits or rejects entries atomically, and evicts older versions. It therefore does not satisfy restart-persistent named storage by itself (`.ramify-architect/daemon/contexts/tests.jsonl:19`).
- `ramify/daemon` owns the resident service, client, wire codec and real filesystem ports, making it the current owner closest to project-scoped durable service state (`.ramify-architect/README.md:41`).
- `ramify/service-api` already relays an on-demand dependency request and maps one ready diagram into a bounded deterministic browser model without analysis runtime code; it refuses identity mismatches and oversized results without partial output (`.ramify-architect/README.md:61`; `.ramify-architect/service-api/behavior.jsonl:12`; `.ramify-architect/service-api/behavior.jsonl:13`; `.ramify-architect/service-api/tests.jsonl:1`).
- `ramify/cli` owns parsing and terminal formatting, while `ramify/explorer` owns the resident browser pages and `ramify/presentation/project-view` owns the pure browser dependency diagram and detail panel (`.ramify-architect/README.md:38`; `.ramify-architect/README.md:47`; `.ramify-architect/README.md:58`).
- Ordinary API views at the same revision show `analyzeDependencyDiagram` available to `ramify`, `DependencyDiagramFacts` available to both `ramify/cli` and `ramify/service-api`, and `ProjectExplorerView` available to `ramify/explorer` (`src/.ramify/children/subs/analysis/src/dependency-analyzer.ts.md:1`; `subs/cli/src/.ramify/external/subs/analysis/src/interfaces/dependency-diagram.ts.md:22`; `subs/service-api/src/.ramify/external/subs/analysis/src/interfaces/dependency-diagram.ts.md:22`; `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/ProjectExplorerView.tsx.md:19`). Each requester API `_meta.json` records coverage 1 at the architect revision.

## Answer

The map keeps the current module tree. Ramify already has the authoritative dependency projection and coherent current-revision machinery. The missing semantic capability is a deterministic two-sided comparison owned by `ramify/analysis`; the missing lifecycle capability is a durable named baseline repository and shared operations owned by `ramify/daemon`. Existing surface owners then extend their current responsibilities: `ramify/cli` formats terminal interactions, `ramify/service-api` projects bounded browser data, `ramify/explorer` owns browser workflow state, and `ramify/presentation/project-view` renders the comparison and evidence detail.

This attribution treats capability ownership as architectural judgment. The generated facts establish current responsibilities and reusable behavior, but do not themselves prescribe the future storage schema, service vocabulary or browser interaction.

## Alternatives

Preserving the existing structure is preferred. Baseline persistence and service lifecycle are cohesive with the daemon's resident service, codec and filesystem ports; dependency comparison is cohesive with analysis-owned dependency meaning and coverage. The presentation and interaction extensions fit their existing pure-view and page-state owners.

The strongest alternative is a new baseline child beneath `ramify/daemon`. It could hide file layout, atomic replacement, compatibility and storage-limit knowledge. It loses at this stage because those invariants and their coordination cost are not yet concrete enough to show that an additional boundary lowers total cognitive burden. A named responsibility and broad acceptance surface alone do not justify a module.

Placing comparison in `ramify/service-api` was also rejected: that owner explicitly maps analysis facts without running or reconstructing analysis, while comparison must preserve the existing dependency meaning and side-specific uncertainty.

## Proposed changes

No module declaration or structural change is proposed. The capability map assigns new or extended behavior to existing canonical module IDs. Any later child-module proposal requires concrete evidence that it hides durable-storage knowledge and reduces the concepts the daemon must understand.

## Not verified

The architect metadata reports 366 cut fields, one unavailable detail and 21 dynamic test titles. The `analyzeDependencyDiagram` documentation is cut, so its full evidence and limit behavior was not established from the generated view. No source was read, and no runtime, storage or comparison behavior was executed.

The request leaves the durable format, name grammar, storage location, compatibility identities, resource limits, comparison JSON schema and historical evidence envelope undefined. Existing API availability proves current reuse only; it does not prove that future baseline operations or result types are exposed. The browser API view establishes `ProjectExplorerView` availability but does not settle whether comparison should be a mode or a separate component.

## Next step

Review the two mapping artifacts for schema shape, capability-only descriptions and evidence-backed availability. Selection of an initial consumer, iteration scope or implementation brief belongs to stage B and is intentionally absent here.
