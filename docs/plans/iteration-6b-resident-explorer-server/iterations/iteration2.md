# Iteration 2: Token-free server

**Plan:** [Plan 6B: Resident explorer server](../main-plan.md).
**Prerequisites:** iteration 1's `ProjectBinding`.
**Owners:** `service-api [dispatch]` and root `src/` entry and launcher.

## Goal

Make the web process a resident, token-free server for one project that PM2 or
the launcher can start with `--root` and `--port`.

## Read first

- [Main plan](../main-plan.md), contracts C1, C3 and C5.
- `subs/service-api/src/router.ts`, `web-process.ts`, `web-discovery.ts`, `web-launcher.ts`.
- `subs/service-api/src/interfaces/explorer-service.ts`.
- `src/explorer-entry.ts`, `src/explore-launcher.ts`.
- `subs/service-api/src/tests/web-process.test.ts`, `web-launcher.test.ts`,
  `subs/integration-tests/src/explorer-router.test.ts`, `src/tests/explorer-process.test.ts`.

## Deliverables

1. Router: `createExplorerRouter({ binding })` with `serverStatus`,
   `projectView({ revision? })` and `explorerDetails({ revision, requests })`
   per C3; `contextStatus` and all token inputs removed.
2. Web process: accepts `port` (default 0) and `binding`; Host/Origin policy
   for `127.0.0.1` and `localhost`; routes `/` and `/analysis/latest` to
   `index.html`, `/explore/*` redirects; static assets unchanged.
3. Discovery: per-project record, lock and log names; `root` and `context`
   fields; `explorerProjectUrl` returns `<origin>/analysis/latest`.
4. Launcher: `ensureExplorerWebProcess` takes `root` and `projectKey` and
   spawns `explorer-entry.js --root <root>`.
5. Entry: C1 arguments, derived endpoint, binding assembly with
   `start: 'if-needed'` and the installed daemon entry, `explicit` stop reason,
   binding closed on stop. Share the context setup with the CLI through the
   narrowest legal exposure.
6. `explorer-entry.ts` no longer exits when the daemon is absent at startup.

## Matrix rows executed here

RS07–RS10.

## Verification

```sh
npm test -- subs/integration-tests/src/explorer-router.test.ts
npm test -- subs/service-api/src/tests/web-process.test.ts
npm test -- subs/service-api/src/tests/web-launcher.test.ts
npm test -- src/tests/explorer-process.test.ts
npm run type-check
npm run check:self
```

RS08 opens a context, records a revision, forces eviction through the quick
environment and requests details for the old revision.

Expected intermediate failure: `subs/explorer` and `subs/cli` still use tokens
and fail type checking until iterations 3 and 4. Record the exact errors.

## Exit criteria

RS07–RS10 pass; the only type errors are the recorded consumer errors.

## Handoff

Iteration 3 receives the router type, `serverStatus` result shape and the
routes. Iteration 4 receives the launcher signature and URL function.
