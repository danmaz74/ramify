# Iteration 3: Project the architect view in the session

**Plan:** [Plan 2B: Generated architect view](../main-plan.md).
**Prerequisites:** iterations 1 and 2.
**Owners:** `analysis`.

## Goal

Build the revision-bound architect projection from the retained session's
facts and compiler, and serve it as `RetainedSession.architectView` through
the session worker, exactly as `apiView` is served.

## Read first

- [Contracts C3](../contracts.md#c3-architect-projection-and-session-query)
  and AV08–AV11.
- The specification's [scope](../../../architecture/architect-view.spec.md#scope),
  [`module.json`](../../../architecture/architect-view.spec.md#modulejson),
  [`behavior.jsonl`](../../../architecture/architect-view.spec.md#behaviorjsonl)
  and [`tests.jsonl`](../../../architecture/architect-view.spec.md#testsjsonl).
- `subs/analysis/src/api-view.ts` (`planApiViewRequests`, `projectApiView`)
  as the template for planning and projection.
- `subs/analysis/src/session-engine.ts` (`apiView`, `#rehydrate`),
  `session-facts.ts` (`SessionFacts`), `session-messages.ts`,
  `session-worker.ts`, `session-host.ts` and `interfaces/session.ts`.
- `subs/analysis/subs/model/src/interfaces/model.ts` (`Exposure`, `Original`,
  `ModuleRecord`) and `subs/analysis/subs/project/src/interfaces/project.ts`
  (`InventoryModule`, `ModulePurpose`, `InventoryFile`).
- `subs/analysis/src/tests/api-view.test.ts`, `api-view-session.test.ts`,
  `session-worker.test.ts` and `session-test-fixture.ts`.

## Deliverables

1. Add C3's types and `planArchitectView` and `projectArchitectView` in
   `analysis` (`src/architect-view.ts`).
2. Add `RetainedSession.architectView` in the engine, the worker protocol and
   the host, following `apiView`'s serialization, sequence check, rehydration
   and outcome mapping. The worker reads `.feature` files from disk and
   compares their SHA-256 with the revision's captured input.
3. Expose the new names from `analysis` to its parent in
   `subs/analysis/module.ramify`.
4. Add the `architect` fixture and tests for AV08–AV11, including a real
   worker test and the counter witness that checks, watch updates and
   changed-file checks never classify shapes or read titles.

## Matrix rows executed here

AV08–AV11.

## Verification

```sh
npx vitest run subs/analysis/src/tests/architect-view.test.ts
npx vitest run subs/analysis/src/tests/architect-view-session.test.ts
npx vitest run subs/analysis/src/tests/api-view.test.ts subs/analysis/src/tests/api-view-session.test.ts
npx vitest run subs/analysis/src/tests/session-worker.test.ts subs/analysis/src/tests/retained-session.test.ts
npm run type-check
npm run build
npm run check:self
```

## Exit criteria

AV08–AV11 pass; the API view's session tests pass unchanged.

## Handoff

`ArchitectViewProjection`, `RetainedSession.architectView`, the `architect`
fixture, and the projection's size and latency on the toolkit measured
in-process.
