# Iteration 5: Relay dependency views in the explorer server

**Plan:** [Plan 6D: Behavioral dependency diagram](../main-plan.md).
**Prerequisites:** iterations 1–4, including BD19–BD24 and the daemon client
method.
**Owner:** `service-api [dispatch]`.

## Goal

Add the browser-facing `dependencyView` procedure that relays to the daemon,
maps a ready result into the explorer DTO and keeps bounded per-binding state,
without loading compiler or analysis runtime code in the explorer server.

## Read first

- [Contracts C5–C6](../contracts.md#c5-explorer-dependency-dto) and BD25–BD29.
- Main plan router table and “Lifecycle and consistency”.
- `subs/service-api/src/router.ts`, `project-view.ts`, `project-binding.ts`,
  `web-process.ts` and `interfaces/explorer-service.ts`.
- `subs/service-api/src/tests/project-binding-fakes.ts`, `project-view.test.ts`,
  `web-process.test.ts` and `subs/integration-tests/src/explorer-router.test.ts`.

## Deliverables

1. Define C5's DTO and outcome and C6's `DependencyViewResult` in
   `service-api` interfaces, receiving C2 declarations through root relays.
2. Implement pure `createExplorerDependencyModel`: unit names, one row per
   diagram module, breakdowns, evidence copied from boundary facts, self-barrel
   omission from imported edges, deterministic IDs and order, identity and
   headline checks, and 16 MiB refusal.
3. Add per-binding state: one in-flight daemon request and one settled DTO for
   the newest requested revision, a one-second busy memory, abort on another
   revision, release on newer publication and on close.
4. Add `dependencyView({ revision })` following the router table. Existing
   procedures remain unchanged.
5. Extend binding fakes with controllable daemon outcomes, busy reasons, sizes
   and counters.
6. Update the browser client type and real tRPC adapter with `dependencyView`;
   no page calls it until iteration 7.
7. Produce a DTO fixture from a real daemon result for iteration 6.

## Matrix rows executed here

BD25–BD29.

## Verification

```sh
npx vitest run subs/service-api/src/tests/dependency-model.test.ts
npx vitest run subs/service-api/src/tests/dependency-view.test.ts
npx vitest run subs/service-api/src/tests/project-view.test.ts
npx vitest run subs/service-api/src/tests/web-process.test.ts
npx vitest run subs/integration-tests/src/explorer-router.test.ts
npx vitest run subs/explorer/src/tests/ProjectExplorerPage.test.tsx
npm run type-check
npm run build
npm run check:self
```

Use binding fakes for router state tests and at least one real daemon and
explorer server for BD28. An awaited request that hides the pending state does
not satisfy BD26. BD28 inspects the server process's loaded modules rather than
its import declarations.

## Exit criteria

BD25–BD29 pass; a real request reaches ready at one input ID through the
daemon; the explorer server loads no compiler or analysis runtime module; close
leaves no in-flight request, DTO or timer.

## Handoff

Iteration 6 receives the real-result DTO fixture, its encoded size and the
status evidence. Iteration 7 receives the client operation, server state
contract and counters to observe.
