# First implementation brief: canonical import-explorer navigation

You are the first scoped implementation agent for the `share-current-import-explorer-view` work item. Work only in the existing `ramify/explorer` module beneath `subs/explorer/src/`, including its owned tests. Do not change `module.ramify`, create a module, write into `ramify/presentation/project-view`, or invent a cross-module API. If the existing controlled presentation surface is insufficient, stop at the consumer boundary and report the exact missing agreement.

## Work-item goal

Let an import-explorer user copy a canonical link whose address restores the same meaningful view against the latest available analysis, participates correctly in browser history, and remains usable when requested state is malformed or no longer available.

This invocation implements only the first iteration. It does not add the Copy view link control or claim completion of the sharing feature.

## This iteration's goal

Make the import explorer's meaningful view state canonical in the current browser address, restore it only when its required current data is available, and make Back, Forward and reload reproduce supported views without navigation loops or default-state races.

The meaningful state is:

- the explored scope;
- one of module selection, dependency-link selection, own-source selection, or no selection;
- selected presentation classes, with absent state distinct from a deliberately empty selection;
- dependency depth, non-behavioral visibility, outside-scope visibility and own-source-node visibility.

Panning, zooming, sidebar size, expanded export/dependency detail and chat state are not navigation state.

## Read first

1. `ramify-agent/docs/spikes/work-brief-examples/examples/share-explorer-view/request.md` for the complete simulated product request, acceptance cases and exclusions.
2. `subs/explorer/README.md` for current explorer ownership and revision-aligned data behavior.
3. `subs/explorer/src/ProjectExplorerPage.tsx` for the current page-owned scope, selections, classes, settings, reconciliation and notices.
4. `subs/explorer/src/browser-app.tsx` and `subs/explorer/src/browser-entry.tsx` for browser startup and legacy `?module=` parsing.
5. `subs/explorer/src/tests/ProjectExplorerFocus.test.tsx` for legacy focus, missing-module and slash-encoding evidence.
6. `subs/explorer/src/tests/ProjectExplorerPage.test.tsx` for revision, delayed-result and dependency test fixtures.
7. The requester-specific generated API files:
   - `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/ProjectExplorerView.tsx.md`
   - `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/interfaces/dependency-view.ts.md`
   - `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/moduleGraphShared.ts.md`
   - `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/dependency-graph.ts.md`

Use the existing generated snapshot; do not refresh it. Its metadata is revision `rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:4`, input `input/1:9ca31c2bf2f66f17d0a67b2adcba33af79e9c59821900865c32637c2c876f3f9`, with architect details unavailable for one item and ordinary explorer API coverage `1`.

## Relevant capability slice

`ramify/explorer` already owns the browser page, latest project/dependency loading and local controlled state. Extend it to own canonical URL navigation and requested-selection reconciliation. It already receives `ProjectExplorerView`, `DependencySettings`, `GraphSelection`, `ownSourceNodeModule` and the controlled callbacks from `ramify/presentation/project-view`; the generated requester API says those symbols are available.

The browser address is navigation state, not a saved analysis. Restore the requested state against the latest available project and matching dependency view. Never encode source contents, access tokens, absolute filesystem paths or a revision snapshot.

## Required behavior

- Define one deterministic representation. Equivalent logical state must produce the same query regardless of toggle order. Encode identifiers containing slashes correctly.
- Preserve existing `?module=` focus links. A URL with no new view settings must retain current default behavior.
- Distinguish an absent presentation-class field from an explicitly empty class set. Defaults may initialize only when no requested class state exists.
- Do not let initial default effects overwrite requested state or create history entries. Restore project-backed values only after project data exists; restore a dependency link only after the matching dependency data and scope/settings can establish that visible link.
- User-driven meaningful navigation updates browser history. Back and Forward restore state without writing a new entry in response to `popstate`; reload-equivalent initialization restores the current address. Establish with tests which meaningful transitions append and which initial canonical normalization replaces the current entry.
- When a requested scope or selection no longer exists, show a useful notice and fall back to a usable view while retaining independent valid settings. Do not select an unrelated entity.
- Ignore malformed or unsupported optional values without crashing. Show a useful notice and preserve every supported independent value.
- Treat `showOutsideScope` as shared state because it changes the rendered dependency view and is already part of the controlled `DependencySettings` value.
- Preserve latest-analysis semantics: the URL identifies view state only and makes no same-revision promise.

## Iteration acceptance and evidence

Add executable consumer-owned tests that first expose the missing behavior, then make them pass. Cover:

- scope plus module, dependency-link, own-source and no-selection restoration;
- a deliberately empty class set as distinct from absent class state;
- dependency depth and all three visibility settings;
- delayed project and dependency results without requested-state loss or extra history;
- three meaningful navigation changes followed by Back and Forward, with no navigation loop;
- reload-equivalent initialization;
- missing scope and selection with a notice, usable fallback and surviving independent settings;
- malformed and unknown optional values mixed with supported values;
- slash-containing identifiers, deterministic serialization and existing legacy `?module=` behavior.

Run the focused `ramify/explorer` tests and the applicable project self-check. Report exact commands and results. Do not claim tests, browser behavior or cross-module availability that you did not execute or inspect.

## Remaining obligations

This iteration does not add the Copy view link action. A later local continuation must use this iteration's canonical current address, report clipboard failure without false success, keep the generated link available for manual copying, and run complete copy-and-open acceptance. Passing URL-state tests is not completion of the work item, a provider delegation or the end-user sharing feature.

## Outcome protocol

At the end, report one of:

- **Iteration complete:** changed paths, observable behavior, commands and results, and the remaining local copy-action continuation.
- **Useful partial result:** changed paths and executable evidence achieved, what remains locally, why it remains, and the next bounded local step. Do not call a parser, placeholder UI or fake-only pass complete.
- **External need:** the exact missing provider capability or agreement, evidence that the current requester-visible API cannot support it, the affected acceptance case and what local work remains possible. Do not write across the branch or assume authorization for another module.
- **Blocked:** the concrete missing information or authority and the safe repository state left behind.

The invocation is restartable from repository state. Before editing, inspect current status and preserve unrelated work. On restart, re-read this brief and the listed local evidence, inspect existing diffs and tests, and continue from durable files and test results rather than assuming an earlier conversation or agent outcome.
