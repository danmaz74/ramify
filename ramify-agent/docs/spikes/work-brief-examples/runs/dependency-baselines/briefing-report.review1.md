# Briefing report: dependency-baselines

## Corrected decision

Status: `ready-for-first-implementation`.

The selected end-user consumer is `ramify/cli`. The work item covers terminal save, list, compare and explicit delete. Its first iteration is limited to `baseline compare <name>` grammar, help, human output, deterministic JSON and exit behavior against a provisional injected fake. No implementation agent launched and no tests ran.

The initial draft chose `ramify/presentation/project-view` as a small visible renderer. Coordinator review rejected that provider-first choice because the accepted map has `browser-baseline-workflow` consume `dependency-comparison-presentation`. The corrected decision starts at an actual end-user consumer. Browser workflow remains required. Terminal compare goes first because it can establish human and deterministic machine meaning within one owner without bundling browser state, transport and rendering. Save, list and delete remain in the work-item goal and are deferred only from the next iteration.

## Evidence read

The briefing read these experiment inputs and project instructions:

- `ramify-agent/docs/spikes/work-brief-examples/runs/dependency-baselines/briefing-prompt.txt`
- `ramify-agent/docs/spikes/work-brief-examples/protocol.md`
- `ramify-agent/docs/spikes/work-brief-examples/examples/dependency-baselines/request.md`
- `ramify-agent/docs/spikes/work-brief-examples/runs/dependency-baselines/capability-map.json`
- `ramify-agent/docs/spikes/work-brief-examples/runs/dependency-baselines/map-review.json`
- `CLAUDE.md`
- `ramify-agent/AGENTS.md`
- `docs/development/README.md`
- `docs/development/implementation-workflow.md`
- `docs/roadmap.md`
- `.agents/skills/planning/SKILL.md`
- `.ramify-architect/_meta.json`
- `.ramify-architect/README.md`

The initial draft also read `.ramify-architect/presentation/project-view/module.json`, its `behavior.jsonl` and `tests.jsonl`; `subs/presentation/subs/project-view/README.md`, `module.ramify`, `src/ProjectExplorerView.tsx`, `src/interfaces/project-view.ts`, `src/tests/ProjectExplorerView.test.tsx`, and requester API metadata and dependency-diagram documentation; plus the cited explorer and service-api generated API evidence. That evidence supported the rejected provider-first choice and is retained as correction history.

The correction additionally read:

- `ramify-agent/docs/spikes/work-brief-examples/runs/dependency-baselines/briefing-correction.txt`
- `.ramify-architect/cli/module.json`
- `.ramify-architect/cli/behavior.jsonl`
- `.ramify-architect/cli/tests.jsonl`
- `subs/cli/README.md`
- `subs/cli/module.ramify`
- `subs/cli/src/run-cli.ts`
- `subs/cli/src/interfaces/cli.ts`
- `subs/cli/src/command-support.ts`
- `subs/cli/src/tests/arguments.test.ts`
- `subs/cli/src/tests/changed-command.test.ts`
- `subs/cli/src/.ramify/_meta.json`
- the file inventory beneath `subs/cli/src/.ramify/`

The planning snapshot is revision `rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:4`, input `input/1:9ca31c2bf2f66f17d0a67b2adcba33af79e9c59821900865c32637c2c876f3f9`; the CLI catalog reported coverage `1` and the architect view one cut detail. Execution uses current requester views and may refresh stale or missing views under project guidance.

## Coverage, deferral and protocol

The iteration covers compare grammar/help, human/JSON formatting, stable ordering, exit behavior and honest rendering of identities, production scope, coverage, mixed changes, historical/current evidence, no-change, partial, unavailable, missing, incompatible, corrupt, retryable and resource-limit results. It forbids CLI-side source scanning or comparison logic.

Deferred locally are save/list/delete, replacement of the fake and real-service/restart acceptance. Deferred globally are persistence and atomicity, duplicate refusal, compatibility and corruption validation, storage isolation and limits, coherent revision selection, comparison computation, all browser work and cross-surface agreement. Fake-backed tests cannot complete a delegation or feature.

`scopeRoot` is canonical module ID `ramify/cli`. External needs contain behavior, evidence and constraints without owner nomination or invented APIs. The brief defines exactly five outcomes: `goal-reached`, `partial-with-needs`, `contract-revision-needed`, `cannot-satisfy`, `map-wrong`; payloads are `iterationCompletion`, `localContinuation`, `externalNeeds`. Crashes, timeouts and malformed submissions stay outside semantic outcomes as adapter events, while ordinary compile and test failures are resolved within the invocation. Verification commands include focused tests, type checking, build, self-check and scoped diff validation; none ran during planning.

There is no launch blocker because provisional CLI-owned test fakes are permitted. Foreign contract or declaration changes remain stop boundaries.

Planning agent: `/root/brief_baselines` using `gpt-5.6-sol`. Revised artifacts: `execution-decision.json`, `first-work-brief.md`, `briefing-report.md`. Implementation launches: zero. Source, tests, fakes, contracts and declarations authored: zero.
