# Iteration 5: View registry and re-hosted API view

**Plan:** [Plan 2B: Generated project views](../main-plan.md).
**Prerequisites:** Iterations 2 and 3.
**Owners:** new `analysis/views` owner, `analysis` session query and
composition, and the declaration and owner-count updates that a twelfth owner
requires.

## Goal

Create the views owner and registry, move the API view into it with identical
bytes, and replace the session's API query with one view-generic
`materialize` query.

## Read first

- [Views and targets](../scope.md#views-and-targets),
  [views contract](../contracts.md#views) and
  [session query](../contracts.md#session-query).
- Iteration 2 and 3 results.
- Plan 2A `api-view.ts`, `api-view-documents.ts`, their tests and fixture B.
- [Module description principles](../../../model/module-description.principles.md)
  for the new owner's declarations and relays.

## Deliverables

1. Create `subs/analysis/subs/views/` with `module.ramify`, `README.md`,
   interfaces, registry, target validation and tests.
2. Move the API projection and renderer into the owner as the `api` view.
   Prove byte identity against fixture B for R and T.
3. Replace `RetainedSession.apiView` with `materialize`, building `ViewFacts`
   and `ViewProviders` from one sequence, and remove iteration 3's temporary
   adapter.
4. Update `analysis` relays, root relays and every eleven-owner assertion.
5. Keep `ramify materialize` behavior identical; the service maps its request
   to `views: ['api']`.

## Matrix rows executed here

I2B-06: all six leaves.

## Verification

Focused views, session and harness tests; `npm run type-check`; build;
`dist/src/ramify check --batch --root .` with twelve owners and zero errors;
`npm run reference:verify -- --plan 2a`; `npx tsx
scripts/validate-final-contracts.ts`.

## Exit criteria

Twelve owners validate, the API view is byte-identical through the registry,
and the session exposes one view-generic read-only query.

## Handoff

The registry, `materialize` query and `GeneratedTarget` flow go to iteration 6.
