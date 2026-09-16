# Iteration 5: Web process and connected explorer

**Plan:** [Plan 6: Project explorer](../main-plan.md).
**Prerequisites:** Iterations 3 and 4 plus the lightweight daemon client.
**Owners:** `service-api [dispatch]` and new root child
`explorer [ui, browser, dispatch]`.

## Goal

Serve the lifted application through a local web process and connect it to
revision-qualified reports without changing the pure view.

## Read first

- [Main plan](../main-plan.md): first-release service contract.
- [View model](../view-model.md): complete response.
- [Lift inventory](../lift-inventory.md): connected-page behavior to preserve.
- Current service/client validation and process discovery code.

## Deliverables

1. Implement the Express/tRPC/static web entry and the exact `projectView`,
   `explorerDetails` and `contextStatus` procedures.
2. `projectView` requests report scope at current or explicitly named published
   revision, then invokes the pure projection. Map pending, evicted, invalid,
   unavailable and resource-limit outcomes without stale fallback.
3. Bind locally with iteration 1's origin/access policy and serve built assets;
   keep Vite in a separate development entry.
4. Adapt the copied connected page, preserving selection state, filter
   reconciliation, breadcrumb walk and handler wiring.
5. Poll status every three seconds while visible. Offer explicit refresh for a
   newer revision and bind every view response to its revision.
6. Discard late older responses and preserve still-valid UI state across an
   explicit refresh.
7. Load signature details on expansion, preserving described, truncated and
   unavailable results. Discard cached details on revision refresh and show
   superseded rather than mixing a newer detail into the older view.

## Matrix rows executed here

EX22, EX23, EX24, EX25, EX26, EX35.

## Verification

Use the real router and a direct tRPC caller with the quick environment. Drive
real context publication over temporary files; assert validation, report-only
data flow, revision refresh, eviction and late-response handling. Build the
production browser assets.

## Exit criteria

The connected app renders real report data through the production router, never
mixes revisions and contains no duplicate analyzer or filesystem scan.

## Handoff

Iteration 6 receives the web entry, readiness/discovery behavior and browser URL.
Iteration 7 receives the complete HTTP application.
