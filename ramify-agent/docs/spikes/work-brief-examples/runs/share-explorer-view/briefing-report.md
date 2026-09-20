# Stage B briefing report: share-explorer-view

## Decision

Status: `ready-for-first-implementation`.

The selected bounded consumer work item is `share-current-import-explorer-view`, owned by `ramify/explorer` with `subs/explorer` as its one subtree boundary. Its overall goal includes canonical view links, browser navigation, copy behavior and recoverable failures. Only the next iteration is fixed: canonical URL representation, delayed restoration and browser-history synchronization. The Copy view link action and clipboard/manual-copy behavior remain local continuation, not silently dropped requirements.

No implementation agent was launched. No source, tests, fakes, contracts or module declarations were written. The reviewed map's approval is used only as the required `simulation-assumption`; it is not implementation authorization.

Planning agent: `/root/brief_share`  
Model: `gpt-5.6-sol`

## Why this consumer and iteration

`ramify/explorer` owns the browser startup, page state, latest project/dependency loading and notices. Its requester-specific API view confirms that the controlled `ProjectExplorerView`, `DependencySettings`, `GraphSelection` and own-source helpers are available at the shared revision. That makes canonical navigation a consumer-local first step with no demonstrated provider write.

The first iteration is observable: a fresh or reloaded address restores a meaningful view, and Back and Forward move among view states. It also establishes executable evidence for delayed restoration and loop avoidance. Starting with the copy control would expose a link before that link had proven restoration semantics; starting with a standalone codec or a provider change would not give the first agent a meaningful user-visible goal.

## Exact evidence read

- `CLAUDE.md`: repository boundaries, generated-view rules and writing conventions.
- `docs/development/README.md`: local workflow and skill routing.
- `.agents/skills/planning/SKILL.md`: planning artifact, evidence and handoff requirements.
- `docs/development/implementation-workflow.md`: iteration scope, verification and handoff expectations.
- `ramify-agent/AGENTS.md`: ramify-agent isolation, dependency direction and module constraints.
- `ramify-agent/docs/spikes/work-brief-examples/runs/share-explorer-view/briefing-prompt.txt`: case-specific Stage B instruction and stop boundary.
- `ramify-agent/docs/spikes/work-brief-examples/runs/share-explorer-view/briefing-correction.txt`: coordinator review corrections for scope identity, context, verification and outcomes.
- `ramify-agent/docs/spikes/work-brief-examples/runs/share-explorer-view/briefing-correction-2.txt`: final clarification separating adapter events from semantic outcomes and limiting contract revision to actual contracts.
- `ramify-agent/docs/spikes/work-brief-examples/protocol.md`: Stage B schemas, simulation gate and partial-result protocol.
- `ramify-agent/docs/spikes/work-brief-examples/examples/share-explorer-view/request.md`: requirements, acceptance and explicit exclusions.
- `ramify-agent/docs/spikes/work-brief-examples/runs/share-explorer-view/capability-map.json`: accepted capability ownership, relationships, reuse evidence, seams and open questions.
- `ramify-agent/docs/spikes/work-brief-examples/runs/share-explorer-view/map-review.json`: passed shape/reference review, same-owner-seam correction and simulation-only approval.
- `.ramify-architect/_meta.json`: shared architect revision, input identity and `detailsUnavailable: 1` limitation.
- `.ramify-architect/explorer/module.json`: explorer purpose, ownership and observed dependencies.
- `subs/explorer/src/.ramify/_meta.json`: requester API revision and complete ordinary-area coverage (`coverage: 1`).
- `subs/explorer/README.md`: current project/dependency revision behavior and page-local dependency settings.
- `subs/explorer/module.ramify`: existing module identity and exposures; no declaration change is needed or authorized.
- `subs/explorer/src/ProjectExplorerPage.tsx` lines 1-206: controlled state, default class initialization, data reconciliation, legacy focus, callbacks, notices and current URL helper.
- `subs/explorer/src/browser-app.tsx` lines 1-43 and `subs/explorer/src/browser-entry.tsx` lines 1-7: route selection, legacy query parsing and one-time location handoff.
- `subs/explorer/src/tests/ProjectExplorerFocus.test.tsx` lines 1-107: current focus mapping, missing-module notice and encoded module links.
- `subs/explorer/src/tests/ProjectExplorerPage.test.tsx` lines 1-280: existing real-router, revision, late-response, stale-refresh and dependency test foundations.
- `subs/presentation/subs/project-view/src/interfaces/dependency-view.ts` lines 1-150: dependency edge identities, phases and the four existing display settings.
- `subs/presentation/subs/project-view/src/ProjectExplorerView.tsx` lines 57-220 and 299-316: controlled inputs/callbacks and current missing-edge reconciliation.
- `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/ProjectExplorerView.tsx.md`: requester-visible controlled view contract.
- `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/interfaces/dependency-view.ts.md`: requester-visible dependency settings and state.
- `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/moduleGraphShared.ts.md`: requester-visible `GraphSelection` identity.
- `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/dependency-graph.ts.md`: requester-visible dependency defaults and own-source helpers.
- `package.json` scripts: existing focused-test runner, type check and self-check command names.
- A targeted outcome-name search also surfaced `ramify-agent/docs/implementation-loop.md` lines 225-256 and the outcome-protocol excerpt in `ramify-agent/docs/spikes/work-brief-examples/runs/copy-module-id/first-work-brief.md` lines 72-84. The coordinator correction remained the authority; no sibling case was otherwise inspected or used to select scope or behavior.

`mapping-report.md`, `example-selection.md` and superseded designs were not read. The shared generated views were not refreshed during this planning simulation. Source inspection stayed within the selected consumer and the directly consumed presentation contract needed to understand restoration identities, apart from the bounded outcome-protocol search disclosed above.

## Requirement coverage in the first iteration

The brief carries scope, every supported selection kind, deliberate empty presentation classes, all existing dependency display settings, deterministic query ordering, slash-safe identifiers, latest-analysis semantics, delayed project/dependency restoration, Back/Forward/reload behavior, absence of history effects for non-navigation interactions, legacy `?module=` compatibility, malformed-value tolerance, missing-target notices and preservation of independent valid settings.

The acceptance asks for executable consumer tests rather than assuming existing evidence. It explicitly separates initialization/restoration from user-originated navigation so delayed effects and `popstate` cannot create extra entries or loops.

The future engineer's required context is now self-contained and omits the full global request. The brief carries the relevant requirements, edge cases, exclusions and acceptance directly. Generated revision metadata is provenance rather than a permanent prohibition on refreshing stale views in the future environment.

## Deferred requirements

The Copy view link action is deferred to local continuation after canonical restoration exists. That continuation must copy the canonical current address, distinguish clipboard success from failure, and retain the address for manual copying after failure. Complete fresh-tab copy-and-open acceptance also remains outstanding.

All request exclusions remain excluded: cross-machine/project sharing, stable addresses across server restarts, historical analysis, graph coordinates, chat state and module-tree sharing.

## Decisions beyond the map

- `showOutsideScope` is included in canonical state. Although the request's detailed list names the other three dependency controls, this existing setting materially changes the visible dependency graph. Omitting it would make distinct views serialize identically.
- The copy action follows URL restoration within the same consumer work item. This is sequencing of one local continuation, not a fixed multi-iteration backlog.
- A dependency link is restored only after scope, settings and matching dependency data make its identity meaningful. The exact implementation remains local engineering; the brief does not invent a new identifier or provider API.
- The engineer must decide and test push-versus-replace behavior per transition while preserving the product-level Back/Forward outcome. The plan does not freeze an unsupported transition table.
- The handoff uses the closed semantic outcomes `goal-reached`, `partial-with-needs`, `contract-revision-needed`, `cannot-satisfy` and `map-wrong`. A completed first iteration still reports `partial-with-needs` because the local copy-action continuation remains. Iteration completion, local continuation and external needs belong in the payload. Ordinary compile and test failures are handled within the invocation; crashes, timeouts and malformed submissions remain adapter events and are never converted into semantic outcomes. `contract-revision-needed` is limited to an actual contract revision, while scope or ownership changes return to architect/map handling.

## Assumptions, blockers and external needs

There is no blocker before the first implementation invocation. The ordinary explorer API view reports coverage `1`, and the required controlled inputs are already available. The architect snapshot has one unavailable detail, so the plan does not use absence from that view as proof of nonexistence.

The only candidate external need is the existing `ramify/presentation/project-view` controlled surface. The implementation agent must validate that dependency edge IDs remain usable after restoring scope and settings against the latest dependency model. If a missing callback or identity agreement appears, it must report that evidence through the external-needs protocol rather than editing another module. Browser History and Location behavior is local platform integration, with the push-versus-replace choice intentionally left to evidence-driven local engineering.

## Validation and process findings

The three artifacts use the protocol's required top-level fields, refer only to capability IDs present in the accepted map, use `ramify/explorer` as the canonical scope root, and keep `subs/explorer/src/` as the filesystem write boundary. The brief is self-contained for a fresh scoped agent: it carries the goal, requirements, map slice, exact read-first paths, acceptance evidence, remaining obligations, the five semantic outcomes and restart behavior. It specifies `/ramify` as the command working directory and names the existing focused Vitest, type-check and self-check commands; none were run during Stage B.

The coordinator corrections changed the scope root from a filesystem path to the canonical module ID, removed the global request from future engineer context, corrected the briefing-prompt evidence path, made verification commands concrete, treated generated revision metadata as provenance, replaced four invented report labels with the closed five semantic outcomes, separated adapter events from those outcomes, and reserved contract revision for actual contracts. The map-review correction had already removed same-owner seams before this stage.

This exercise exposes a useful separation in the proposed process: capability mapping can establish ownership and requester-visible reuse without choosing tasks, while Stage B can select a consumer-local observable slice and still preserve unresolved provider evidence as a conditional external need. It also shows why work-item completion, next-iteration completion and feature acceptance need separate fields: otherwise a passing URL codec or clipboard fake could be mistaken for a shareable explorer view.
