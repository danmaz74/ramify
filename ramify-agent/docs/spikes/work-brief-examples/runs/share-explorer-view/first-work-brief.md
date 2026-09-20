# First implementation brief: canonical import-explorer navigation

You are the first scoped implementation agent for the `share-current-import-explorer-view` work item. Work only in the existing `ramify/explorer` module beneath `subs/explorer/src/`, including its owned tests. Do not change `module.ramify`, create a module, write into `ramify/presentation/project-view`, or invent a cross-module API. If the existing controlled presentation surface is insufficient, stop at the consumer boundary and report the exact missing agreement.

Use `/ramify` as the working directory for all listed commands.

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

1. `subs/explorer/README.md` for current explorer ownership and revision-aligned data behavior.
2. `subs/explorer/src/ProjectExplorerPage.tsx` for the current page-owned scope, selections, classes, settings, reconciliation and notices.
3. `subs/explorer/src/browser-app.tsx` and `subs/explorer/src/browser-entry.tsx` for browser startup and legacy `?module=` parsing.
4. `subs/explorer/src/tests/ProjectExplorerFocus.test.tsx` for legacy focus, missing-module and slash-encoding evidence.
5. `subs/explorer/src/tests/ProjectExplorerPage.test.tsx` for revision, delayed-result and dependency test fixtures.
6. The requester-specific generated API files:
   - `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/ProjectExplorerView.tsx.md`
   - `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/interfaces/dependency-view.ts.md`
   - `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/moduleGraphShared.ts.md`
   - `subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/dependency-graph.ts.md`

The planning evidence came from generated revision `rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:4`, input `input/1:9ca31c2bf2f66f17d0a67b2adcba33af79e9c59821900865c32637c2c876f3f9`, with architect details unavailable for one item and ordinary explorer API coverage `1`. Your environment should provide current generated API views. If they are missing or stale, refresh them according to the repository's generated-view guidance before relying on availability claims.

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

From `/ramify`, run:

```text
npx vitest run subs/explorer/src/tests/ProjectExplorerFocus.test.tsx subs/explorer/src/tests/ProjectExplorerPage.test.tsx
npm run type-check
npm run check:self
```

Report exact commands and results. Do not claim tests, browser behavior or cross-module availability that you did not execute or inspect.

## Remaining obligations

This iteration does not add the Copy view link action. A later local continuation must use this iteration's canonical current address, report clipboard failure without false success, keep the generated link available for manual copying, and run complete copy-and-open acceptance. Passing URL-state tests is not completion of the work item, a provider delegation or the end-user sharing feature.

## Outcome protocol

Report exactly one of these five semantic outcomes:

- **`goal-reached`** — the overall work-item goal and all required acceptance evidence are complete.
- **`partial-with-needs`** — useful work is preserved but the overall goal still has local continuation or external needs. Completing this first iteration while the Copy view link action remains uses this outcome.
- **`contract-revision-needed`** — an actual agreed contract cannot support required behavior and needs a concrete revision before work can continue. Scope or ownership changes belong to architect/map handling, not this outcome.
- **`cannot-satisfy`** — evidence shows the goal cannot be satisfied under the current constraints and a contract correction alone would not resolve it.
- **`map-wrong`** — repository evidence contradicts the accepted capability map in a way that changes ownership, availability or the selected consumer.

Every semantic outcome must include a payload with: whether this iteration is complete; changed files; observable behavior delivered; exact commands and results; acceptance conditions met and remaining; `localContinuation`; `externalNeeds`; and every file read beyond the read-first set. Each external need states its evidence and missing behavior without assigning another owner or designing an API. Resolve ordinary compile and test failures within the invocation. Crashes, timeouts and malformed submissions are adapter events; do not convert them into a semantic outcome.

For partial work, preserve a compiling, reviewable state and name the exact next local step. Do not call a parser, placeholder UI or fake-only pass complete. Keep local continuation separate from external needs. Passing against a fake alone is neither feature completion nor proof of a delegated provider.

The invocation is restartable from repository state. Before editing, inspect current status and preserve unrelated work. On restart, re-read this brief and the listed local evidence, inspect existing diffs and tests, and continue from durable files and test results rather than assuming an earlier conversation or agent outcome.
