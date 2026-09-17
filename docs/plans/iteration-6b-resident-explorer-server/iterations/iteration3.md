# Iteration 3: Home page and fresher indicator

**Plan:** [Plan 6B: Resident explorer server](../main-plan.md).
**Prerequisites:** iteration 2's router and routes.
**Owner:** `explorer [ui, browser, dispatch]`.

## Goal

Serve a home page at `/` and the explorer at `/analysis/latest` without
tokens, and show fresher analysis correctly across generation changes.

## Read first

- [Main plan](../main-plan.md), contracts C3 and C4.
- `subs/explorer/src/browser-entry.tsx`, `browser-app.tsx`, `ProjectExplorerPage.tsx`.
- `subs/explorer/src/tests/ProjectExplorerPage.test.tsx`.
- `subs/service-api/src/router.ts` as changed by iteration 2.

## Deliverables

1. `browser-entry.tsx` selects the page by `location.pathname`: `/` → home,
   `/analysis/latest` → explorer, anything else → home. No routing library.
2. `HomePage.tsx`: title, project root, binding state and daemon PID from
   `serverStatus`, and a link list with one entry, "Module explorer".
3. `ExplorerClient` and `ProjectExplorerPage` lose the token; polling uses
   `serverStatus`.
4. Revision comparison per C4, as a small exported pure function with its own
   tests.
5. A one-line connection notice while the binding is not `ready`; the
   displayed model is kept.
6. `module.ramify` exposure updated for any renamed or added symbols.

## Matrix rows executed here

RS11–RS12.

## Verification

```sh
npm test -- subs/explorer/src/tests/ProjectExplorerPage.test.tsx
npm test -- subs/explorer/src/tests/HomePage.test.tsx
npm run explorer:build
npm run type-check
npm run check:self
```

RS12 cases: same revision; higher sequence in the same generation; lower
sequence in a new generation; binding `retrying` while a model is displayed.

Expected intermediate failure: `subs/cli` type errors from iteration 2 remain.

## Exit criteria

RS11–RS12 pass, the bundle builds and only the CLI errors remain.

## Handoff

Iteration 4 receives the built assets and the component evidence.
