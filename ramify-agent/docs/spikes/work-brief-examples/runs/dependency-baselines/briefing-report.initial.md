# Briefing report: dependency-baselines

## Decision

Status: `ready-for-first-implementation`.

The selected work item is the browser dependency comparison presentation in `ramify/presentation/project-view`. Its first iteration renders a supplied comparison summary and selectable detail with historical/current, scope and coverage labels and creates focused executable component evidence. It does not launch an agent or authorize implementation in this simulation.

The work item goal, first-iteration goal and remaining global requirements are separate in both artifacts. The terminal remains a required peer consumer. It was not selected first because the browser's removed-entity inspection and two-sided evidence presentation expose the most demanding information needs for a later shared result. Provider-first daemon, storage and analysis work was rejected by the consumer-first rule. `ramify/explorer` was broader than necessary because it owns workflow state while `ramify/presentation/project-view` already owns pure dependency rendering and detail.

## Exact evidence read

Experiment and project guidance:

- `ramify-agent/docs/spikes/work-brief-examples/runs/dependency-baselines/briefing-prompt.txt`
- `ramify-agent/docs/spikes/work-brief-examples/protocol.md`
- `ramify-agent/docs/spikes/work-brief-examples/examples/dependency-baselines/request.md`
- `ramify-agent/docs/spikes/work-brief-examples/runs/dependency-baselines/capability-map.json`
- `ramify-agent/docs/spikes/work-brief-examples/runs/dependency-baselines/map-review.json`
- `CLAUDE.md`
- `ramify-agent/AGENTS.md`
- `docs/development/README.md`
- `docs/development/implementation-workflow.md`
- `docs/roadmap.md` (roadmap context only; it does not govern ramify-agent)
- `.agents/skills/planning/SKILL.md`

Generated evidence, used without refresh:

- `.ramify-architect/_meta.json`
- `.ramify-architect/README.md`
- `.ramify-architect/presentation/project-view/module.json`
- `.ramify-architect/presentation/project-view/behavior.jsonl`
- `.ramify-architect/presentation/project-view/tests.jsonl`
- `.ramify-architect/service-api/behavior.jsonl`
- `.ramify-architect/explorer/behavior.jsonl`
- `.ramify-architect/analysis/behavior.jsonl`
- `subs/presentation/subs/project-view/src/.ramify/_meta.json`
- `subs/presentation/subs/project-view/src/.ramify/external/subs/analysis/src/interfaces/dependency-diagram.ts.md`
- `subs/explorer/src/.ramify/_meta.json`
- `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/ProjectExplorerView.tsx.md`
- `subs/service-api/src/.ramify/external/subs/analysis/src/interfaces/dependency-diagram.ts.md`

Bounded source and local onboarding:

- `subs/presentation/subs/project-view/README.md`
- `subs/presentation/subs/project-view/module.ramify`
- `subs/presentation/subs/project-view/src/ProjectExplorerView.tsx`
- `subs/presentation/subs/project-view/src/interfaces/project-view.ts`
- `subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx`
- root `package.json` scripts

The shared architect snapshot is revision `rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:4` and input `input/1:9ca31c2bf2f66f17d0a67b2adcba33af79e9c59821900865c32637c2c876f3f9`. It reports one unavailable cut detail. The project-view and explorer ordinary API catalogs each report coverage `1`. The briefing makes no absence claim from a cut record.

## Requirement coverage

The first iteration carries the browser-visible semantics that can be established inside one owner: canonical module and directed relationship identity; added, removed and changed categories; before/after dependency counts and classifications; inspectable removed entities; historical/current evidence labels; side identities, production scope and coverage; qualified incomplete observations; honest unavailable, retryable and resource-limit states; no-change behavior; and display-only filters with full versus filtered totals.

It also preserves two upstream constraints by refusing to implement them in presentation: repeated imports and line moves must not create architectural differences, and dependency meaning must come from Ramify's existing projection. The component consumes supplied results and does not scan TypeScript, compare occurrences or infer dependency facts.

Deferred requirements are explicit: baseline naming and lifecycle; atomic durable persistence; duplicate, corruption, compatibility and storage-limit behavior; storage exclusion from source acquisition, generated views and watchers; coherent revision selection; deterministic comparison computation and JSON; terminal formatting; browser transport and bounded detail; explorer selection, deletion and stale refresh; cross-surface agreement; restart acceptance; current-source integration; and end-to-end resource limits.

## Decisions beyond the map

- The pure presentation owner goes first, ahead of the terminal consumer, because it tests the richest evidence and uncertainty requirements while remaining a leaf consumer.
- The first iteration is a summary/detail component slice, not full diagram integration or browser lifecycle workflow.
- Interim data used for component evidence must remain private to the owner. It is a discovery aid for the later `comparison-view-model` agreement, not an invented foreign API.
- An unqualified clean result requires sufficiently complete evidence on both sides. Partial evidence may show qualified observations but cannot certify no change or a definite removal.
- Focused component tests plus the project TypeScript check are the initial executable evidence. They do not establish provider, transport or feature acceptance.

No new module, module declaration change or cross-branch write is authorized. The map's simulation approval permits this planning exercise only.

## Assumptions and blockers

There is no blocker to launching this bounded future iteration because it can operate on supplied synthetic comparison data within the existing presentation owner. The eventual provider agreement remains unresolved by design. If local implementation shows that the required evidence cannot be represented without changing an exposed type or another owner, the agent must stop at that boundary and report the needed agreement rather than widening scope.

No tests or implementation agents ran. No executable comparison evidence exists yet. Readiness means only that the brief is usable by a future scoped implementation agent.

## Process findings

The capability map was sufficient to choose a leaf consumer, but the generated view alone did not answer how an iteration could be independently observable. Bounded local inspection showed that project-view already has selection/detail, coverage, unavailable and stale presentation patterns, making a focused comparison component credible without provider work.

The exercise also exposed a useful contract-discovery boundary: a consumer can prove which labels, identities, counts, evidence and outcome states it needs using private fixtures, while the later cross-owner agreement still decides serialization, paging and limits. The partial-result protocol is essential because successful fixture tests can produce useful local continuation and precise external needs without being mistaken for a completed delegation or feature.

Planning agent: `/root/brief_baselines` using `gpt-5.6-sol`. Artifacts authored: `execution-decision.json`, `first-work-brief.md`, and `briefing-report.md`. Implementation launches: zero. Corrections during briefing: none to the accepted map; the work boundary was narrowed from the browser feature to one pure presentation owner and one summary/detail iteration.
