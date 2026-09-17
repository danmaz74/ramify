# Iteration 3 results: Home page and fresher indicator

**Date:** 2026-09-17. **Mode:** direct work on `docs/roadmap-fast-incremental-checks`, uncommitted.

## Built

- `subs/explorer/src/browser-entry.tsx`: picks the page from `window.location.pathname`
  through `selectBrowserPage`. It uses no routing library and reads no token from the URL.
- `subs/explorer/src/browser-app.tsx`:
  - `selectBrowserPage(pathname)` returns `'explorer'` for `/analysis/latest` and `'home'` for every other path.
  - `createProjectExplorerBrowserApp(container, page, client?)` renders `HomePage` or
    `ProjectExplorerPage`.
  - The tRPC client still uses `httpBatchLink({ url: '/trpc', methodOverride: 'POST' })`.
    It maps `projectView`, `explorerDetails` and `serverStatus`.
- `subs/explorer/src/HomePage.tsx`: the title "Ramify" plus the project root, binding state
  (as text and `data-binding`) and daemon PID (`none` when null) from `serverStatus`.
  A `Pages` navigation holds one link, "Module explorer" → `/analysis/latest` (`serverPages`).
  The page polls every 3 s while visible.
- `subs/explorer/src/ProjectExplorerPage.tsx`:
  - The `token` prop and every token input are gone. `ExplorerClient` is
    `{ projectView({ revision? }), explorerDetails({ revision, requests }), serverStatus() }`.
  - Polling calls `serverStatus` and compares the displayed `ContextRevision` with `published`
    through `isNewerRevision`. The old sequence refs are removed.
  - While `binding !== 'ready'`, a one-line `<p role="status">` notice appears above the view.
    The displayed model is kept. A `projectView` result of `unavailable` clears nothing
    once a model is shown; it produces the failure page only before a model exists.
  - Exported helper `bindingStateText(status)` gives the binding line used by both pages.
- `subs/explorer/src/revision-freshness.ts`: the pure C4 function
  `isNewerRevision(displayed, published)` with its input type `ComparableRevision`.
- `subs/explorer/index.html`: `<title>` is now `Ramify`, because the document also serves the home page.
- `subs/explorer/README.md`: the purpose paragraph describes the home page and the token-free service.
- Tests:
  - `tests/real-router-model.ts` builds a real `createProjectBinding` over the quick
    environment, waits until it is `ready`, then calls `projectView({})` and `serverStatus()`.
  - `tests/ProjectExplorerPage.test.tsx` is migrated to the token-free client and has three new RS12 cases.
  - New: `tests/HomePage.test.tsx` (RS11 and path selection) and `tests/revision-freshness.test.ts`.

## Evidence

| Row | Test | Harness |
| --- | --- | --- |
| RS11 | `HomePage.test.tsx`: the level-1 heading is "Ramify". The page shows the root `/work/project`, "Connected" (`data-binding="ready"`) and PID `4242`. The `Pages` navigation has exactly one link, "Module explorer", with `href="/analysis/latest"`. A `connecting` binding shows "Connecting to the project" with PID `none`. After a poll, `project-unavailable` shows its message. `selectBrowserPage`: `/` → home, `/analysis/latest` → explorer, `/analysis/other` and `/explore/a/b` → home. | component (jsdom) |
| RS12 | `revision-freshness.test.ts`: same revision → false; `A:6` over `A:5` → true; `A:4` over `A:5` → false; `B:1` over `A:5` → true; `B:7` over `A:1` → true. `ProjectExplorerPage.test.tsx`: displayed `A:5` with the same published revision keeps the control "Refresh" disabled and shows no notice. When `B:1` is published, the control becomes "Refresh (stale)" and clicking it loads `B:1` (requested revision `B:1`). `A:1` → published `A:2` gives stale. While the binding is `retrying` with a message, the notice reads "Reconnecting to the daemon: Daemon connection lost", and revision `A:3` and its modules stay displayed, even after a Refresh that returns `unavailable`. When the binding is ready at `B:1`, the notice disappears, the control goes stale and the refresh loads `B:1`. The real router case renders a report obtained through a real `ProjectBinding` and the production router. | component (jsdom); the real router case uses a quick-environment subprocess |

Commands and outcomes:

```text
npm test -- subs/explorer/src/tests/ProjectExplorerPage.test.tsx      -> 1 file, 7 passed (7)
npm test -- subs/explorer/src/tests/HomePage.test.tsx subs/explorer/src/tests/revision-freshness.test.ts -> 2 files, 6 passed (6)
npm test -- subs/explorer/src/tests                                   -> 3 files, 13 passed (13); run 2 more times, all passed
npm test -- subs/analysis/subs/descriptions/src/tests/descriptions.test.ts -> 31 passed (31) (the README changed)
npm run explorer:build                                                -> built dist/explorer (index 646.56 kB; existing chunk-size warning only)
npm run type-check                                                    -> exit 1; only the CLI error below
npm run check:self                                                    -> passed; 15 owners, 346 source files, 0 errors, 0 warnings, 0 analysis limits
```

## Remaining type errors (verbatim)

```text
src/cli-process.ts(77,114): error TS2739: Type '{ readonly token: ContextToken; }' is missing the following properties from type '{ readonly root: string; readonly projectKey: string; }': root, projectKey
```

This is the CLI error that iteration 4 owns. All six explorer errors from iteration 2 are
cleared. The `check:self` `missing-export` error is cleared too.

## Decisions and deviations

1. **No `module.ramify` change.** The new symbols `HomePage`, `serverPages`, `selectBrowserPage`,
   `BrowserPage`, `isNewerRevision`, `ComparableRevision` and `bindingStateText` are used only
   within `explorer`, including its own tests, which is same-owner access. No symbol exposed to
   the parent was renamed. `createProjectExplorerBrowserApp` keeps its name but now takes
   `page: BrowserPage` in place of the token. `ProjectExplorerPage` loses its `token` prop. Neither
   has a consumer outside the owner, so the narrowest reading of deliverable 6 adds no exposure,
   and `descriptions.test.ts` needs no change.
2. **Path selection lives in `browser-app.tsx`.** `browser-entry.tsx` runs side effects on import, so
   the pure `selectBrowserPage` sits beside the app factory where tests can import it. The entry
   still makes the selection from `location.pathname`.
3. **Stale marking.** While the binding is ready, a poll marks the control stale and remembers the
   published revision whenever `isNewerRevision(displayed, published)` holds. The earlier guard
   "higher than the newest flagged sequence" is dropped, because sequences do not compare across
   generations and the server's published revision is by definition its newest. Refresh loads that
   revision. The router ignores a revision from another generation and returns latest anyway.
4. **Keeping the model.** C4 says the page keeps its model while the binding is not ready. A
   `projectView` result of `unavailable`, such as a refresh during a daemon outage, therefore no
   longer clears a displayed model. The failure page appears only when no model has loaded yet,
   and the notice explains the state.
5. **Notice text.** The notice uses `bindingStateText`: a fixed label per binding kind (for example
   "Reconnecting to the daemon"), plus `: <message>` when the server supplies one. The notice is
   hidden while the binding is `ready`, and also before the first successful status poll. A failing
   `serverStatus` poll leaves the notice unchanged, as before.
6. **Home page styling.** Minimal inline styles only. The explorer owner cannot import the
   project-view stylesheet, and C3 asks for no visual design.
7. **Document title.** `index.html`'s title changed from "Ramify Project Explorer" to "Ramify". No test
   or consumer referred to the old title.
8. **`browser-acceptance.ts`** needed no change: it does not use the renamed explorer symbols, and
   type-check reports nothing for it.

## Handoff for iteration 4

- Build: `npm run explorer:build` produces `dist/explorer` (index.html plus one JS chunk).
  `npm run build` should now stop only on `src/cli-process.ts:77`. Once the CLI is fixed, rerun
  `npm run build` and `npm test -- src/tests/explorer-process.test.ts` in the checkout.
- Browser selectors for RS13–RS17:
  - Home (`/`): heading `Ramify`. `dd[data-binding]` holds the binding kind. The project root
    and daemon PID are text in the same `<dl>`. Nav `Pages` holds one link, "Module explorer",
    with `href="/analysis/latest"`.
  - Explorer (`/analysis/latest`): the refresh control's accessible name is `Refresh`
    (disabled) or `Refresh (stale)`. The connection notice is `p[role="status"]`
    (`.project-explorer-page__connection-notice`) and is present only while the binding is not `ready`.
    The revision label is `Revision <id>`.
- Polling interval: 3 s while the document is visible, plus an immediate poll on becoming visible. RS14 waits must allow for it.
- After a daemon kill (RS14), expect the notice, then its removal once the binding is ready
  again. The control turns stale for the new generation's revision even though its sequence is lower.
- `browser-acceptance.ts` has only iteration 2's type-level adaptations. It still opens a context itself
  before launching, and its workflow was written for the old page. Iteration 4 adapts it to the resident server
  and the selectors above.
- Component evidence does not establish RS13–RS17.
