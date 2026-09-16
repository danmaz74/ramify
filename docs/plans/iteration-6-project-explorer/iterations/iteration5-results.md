# Iteration 5 results: Web process and connected explorer

**Date:** 2026-09-16. **Result:** completed.

## Implemented behavior

- `service-api` now owns a real tRPC router with exactly `projectView`,
  `explorerDetails` and `contextStatus`. `projectView` asks the injected resident
  service for report scope with non-waiting published freshness, optionally at
  the named revision, and passes only a matching published report to the pure
  projection. Pending/cold, invalid, evicted, unavailable and bounded-projection
  outcomes stay distinct from ready data.
- The production Express host binds port zero on `127.0.0.1`, serves the built
  browser assets and readiness document, writes the frozen process record
  atomically with mode `0600`, validates the exact `Host`, validates API
  `Origin`, rejects preflight and emits a same-origin CSP with framing disabled.
- The new `explorer [ui, browser, dispatch]` owner adapts cucumber-viz's
  connected page at commit `44b7f30e0fdfda79ead8363ef4c85c100e36fda0`.
  It retains selection, filter reconciliation, breadcrumb walking, drill-down
  and handler wiring while replacing host queries and file-watcher events with
  the frozen three-procedure client.
- The page polls status every three seconds only while visible. A later sequence
  marks the displayed view stale but never replaces it; refresh is explicit.
  View and status response sequencing rejects late older results. A response
  whose model and envelope revisions differ is visibly unavailable.
- Valid module, edge, filter, scope and expansion identities are reconciled to
  objects from the refreshed model. Removed identities are cleared. Detail
  cache state is revision-bound: refresh cancels the prior display request and
  reloads an expanded export against the new revision. Superseded or unavailable
  details remain explicit.
- Vite has a browser-only development/build entry. Normal production hosting
  serves `dist/explorer/index.html` and its hashed assets; Vite is not loaded by
  the local production host.

No CLI parsing, browser opener, launcher/reuse workflow, real-browser acceptance
or resource measurement was added; those remain iterations 6 and 7.

## Acceptance evidence

| Rows | Fixture and expected outcome | Command | Result |
| --- | --- | --- | --- |
| EX22, EX23 | Temporary real project through the quick environment, resident service, real tRPC router and direct caller; current/exact reports project, malformed token/revision is rejected; the connected page renders the serialized result of that real router | `npm test -- subs/integration-tests/src/explorer-router.test.ts subs/explorer/src/tests/ProjectExplorerPage.test.tsx` | Passed |
| EX24, EX25, EX26 | Connected React page; later status offers refresh, two overlapping refreshes retain the newest response and valid selection, and the late response is ignored | `npm test -- subs/explorer/src/tests/ProjectExplorerPage.test.tsx` | Passed |
| EX35 | Real current-revision detail succeeds, publication supersedes the old detail and one-revision retention makes its old view unavailable; connected page drops the late old detail and reloads the expanded export at the current revision | the two focused tests above | Passed |
| Local HTTP contract | Loopback process, readiness document, static fallback, exact Host, API Origin/preflight, CSP, record mode and stopped record | `npm test -- subs/service-api/src/tests/web-process.test.ts` | Passed |

The combined focused command completed five tests in three files. The router
test uses real context publication and the existing retained compiler detail
provider; the page timing cases use controlled promises so response order is
deterministic.

## Build and conformance

- `npm run type-check` passed all toolkit, portable, script and reference-harness
  compiler configurations.
- `npm run build` passed the inventory-selected production compilation and the
  production browser build. Vite emitted `index.html` plus hashed CSS and JS.
  Its advisory warning records a 646 kB minified JavaScript chunk; bundle tuning
  is not an iteration 5 acceptance condition.
- An isolated `npm run check:self` passed all fifteen current owners with zero
  findings and complete coverage; the owned daemon was stopped afterward.

## Handoff

Iteration 6 receives `startExplorerWebProcess`, the exact process record and
readiness response, the production asset directory, and the browser path shape
`/explore/<context>/<generation>`. It still owns process discovery/reuse,
launch coordination, daemon connection assembly, URL construction, platform
browser opening and CLI exits. Iteration 7 receives the complete HTTP
application and connected browser surface for real-browser acceptance and
measurements.
