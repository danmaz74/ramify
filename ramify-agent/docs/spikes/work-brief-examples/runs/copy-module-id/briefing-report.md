# Briefing report: copy-module-id

## Outcome

Status: `ready-for-first-implementation`.

The brief is ready for a future scoped implementation invocation. No implementation agent was launched, and no tests or implementation outcomes were simulated. The map transition is accepted only as `simulation-assumption`; it is not authorization to implement or to change structure.

Planning agent: `/root/brief_copy`  
Model: `gpt-5.6-sol`  
Implementation launches: `0`

Artifacts produced:

- `execution-decision.json`
- `first-work-brief.md`
- `briefing-report.md`

## Exact evidence read

- `CLAUDE.md`
- `.agents/skills/planning/SKILL.md`
- `docs/roadmap.md`
- `docs/development/implementation-workflow.md`
- `ramify-agent/AGENTS.md`
- `ramify-agent/docs/spikes/work-brief-examples/protocol.md`
- `ramify-agent/docs/spikes/work-brief-examples/examples/copy-module-id/request.md`
- `ramify-agent/docs/spikes/work-brief-examples/runs/copy-module-id/briefing-prompt.txt`
- `ramify-agent/docs/spikes/work-brief-examples/runs/copy-module-id/briefing-correction.txt`
- `ramify-agent/docs/spikes/work-brief-examples/runs/copy-module-id/briefing-correction-2.txt`
- `ramify-agent/docs/spikes/work-brief-examples/runs/copy-module-id/capability-map.json`
- `ramify-agent/docs/spikes/work-brief-examples/runs/copy-module-id/map-review.json`
- `.ramify-architect/_meta.json`
- `.ramify-architect/presentation/project-view/module.json`
- `.ramify-architect/presentation/project-view/behavior.jsonl`
- `.ramify-architect/presentation/project-view/tests.jsonl`
- `subs/presentation/subs/project-view/README.md`
- `subs/presentation/subs/project-view/module.ramify`
- `subs/presentation/subs/project-view/src/.ramify/_meta.json`
- `subs/presentation/subs/project-view/src/ModuleTreeView.tsx`
- `subs/presentation/subs/project-view/src/interfaces/project-view.ts`
- `subs/presentation/subs/project-view/src/tests/ModuleTreeView.test.tsx`
- `subs/presentation/subs/project-view/src/tests/module-tree-fixture.ts`
- `subs/presentation/subs/project-view/src/module-tree.css`
- `subs/presentation/subs/project-view/src/project-view.css`
- `package.json`
- `ramify-agent/package.json`
- `vitest.config.ts`

The generated architect snapshot was not refreshed. Its metadata is revision `rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:4`, input `input/1:9ca31c2bf2f66f17d0a67b2adcba33af79e9c59821900865c32637c2c876f3f9`, with measured production dependencies and test references, cut count 366, one unavailable detail and 21 dynamic titles. The project-view ordinary API metadata reports the same revision and coverage `1`. Those limitations do not block the local selected-detail work because the accepted map and source both identify `ExplorerModule.id` in the same owner.

`mapping-report.md`, `example-selection.md`, sibling cases and superseded designs were not read.

## Requirement coverage

The first iteration covers exact copying from `ExplorerModule.id`, a visible selectable canonical value, native keyboard activation, an accessible action name, focus-preserving announcements, success, rejection, unavailable clipboard, manual fallback, real-root behavior, duplicate short-name distinction, no action without a real selection, no fresh analysis or project mutation, callback non-interference, and suppression of stale async outcomes after selection changes. The required evidence names focused component cases plus the existing type and self-check gates; none is claimed as already passing.

The work item excludes the import explorer, links, source paths, multi-copy and persisted feedback exactly as requested. Real-browser paste proof is deferred because the current component suite uses jsdom. It is recorded as an external acceptance need rather than treated as present or scheduled without authorization.

## Decisions beyond the map

The work item and first iteration stay in `ramify/presentation/project-view`; no provider task is needed because the selected detail already owns the displayed `ExplorerModule` and its canonical `id`. The iteration combines the action and module-scoped outcome behavior because either alone would leave no meaningful complete user path.

The brief requires the canonical ID to remain visibly selectable in the detail panel. This resolves the map's non-blocking presentation question in favor of the strongest manual fallback and makes the ID independently inspectable before copying. It leaves exact copy-feedback wording and CSS treatment to local engineering while fixing the required meaning and accessibility behavior.

The brief also requires protection against an older completion overwriting a newer request. This is a local consequence of module-scoped asynchronous feedback and strengthens the explicit selection-change edge case without adding a cross-module contract.

The corrected outcome protocol preserves the five closed semantic outcomes: `goal-reached`, `partial-with-needs`, `contract-revision-needed`, `cannot-satisfy` and `map-wrong`. Iteration completion, local continuation, external needs and verification failures are payload facts. In particular, completing this first iteration while real-browser evidence remains produces `partial-with-needs`, not `goal-reached`.

The final clarification keeps ordinary compile and test failures within the active invocation, while crashes, timeouts and malformed submissions remain adapter events outside semantic outcomes and their payloads. Semantic results now contain only goal, need, contract or map facts. `contract-revision-needed` is limited to an actual inter-agent contract revision; proposed scope or ownership changes return to architecture/map reasoning instead.

## Assumptions and blockers

There are no blockers before launching the future first implementation agent. The browser Clipboard API is a platform dependency to feature-detect and handle locally, not a new module capability. No new module, public contract, cross-branch write or browser acceptance task is authorized by this decision.

Readiness means the handoff is sufficiently grounded and bounded for a fresh implementation session. It does not mean implementation exists, tests exist for the new behavior, or any verification has passed.

## Process findings

The capability-only map was enough to identify the consumer because it separated the existing selected-detail and canonical-identity capabilities from the two requested extensions. Bounded source inspection then supplied the information a fresh engineer needs but the map intentionally omits: exact files, current local state, existing test fixture, callbacks that must remain untouched and available verification commands.

This case also exposes a useful Stage-B distinction. One small owner can implement the full local interaction in one iteration, while overall acceptance can still retain a real-browser obligation. Recording that external need avoids both a generic scaffold iteration and a false claim that mocked clipboard behavior proves end-to-end paste behavior.

Review correction applied: removed invented outcome names, expressed iteration completion and needs in the outcome payload, removed the ambiguous blanket ban on changing project files, clarified that runtime copying cannot mutate the inspected target project, and fixed `/ramify` as the working directory for every verification command.
