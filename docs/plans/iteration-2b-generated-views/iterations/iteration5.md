# Iteration 5: Reserve and publish the architect target

**Plan:** [Plan 2B: Generated architect view](../main-plan.md).
**Prerequisites:** none. It shares no files with iterations 1–4.
**Owners:** `analysis/project` (reserved names), `daemon` (publisher).

## Goal

Make `.ramify-architect` generated output everywhere Ramify reads inputs, and
let the publisher publish a rendered architect view at the project root in
the same transaction as the API view's targets.

## Read first

- [Contracts C5](../contracts.md#c5-reserved-names),
  [C6](../contracts.md#c6-publisher) and [C8](../contracts.md#c8-failure-and-preservation),
  and AV19–AV23.
- The specification's [materialization](../../../architecture/architect-view.spec.md#materialization)
  and [generated-output isolation](../../../architecture/architect-view.spec.md#generated-output-isolation).
- `subs/analysis/subs/project/src/generated-path.ts` and its call sites:
  `inventory.ts`, `configuration.ts`, `capture.ts`, `observer.ts` and
  `subs/daemon/src/filesystem-watcher.ts`.
- `subs/daemon/src/api-view-publisher.ts`, `api-view-documents.ts` and
  `interfaces/daemon.ts`.
- `subs/daemon/src/tests/api-view-publisher.test.ts`,
  `api-view-publisher-crash-recovery.test.ts` and `api-view-fixtures.ts`;
  `subs/analysis/subs/project/src/tests/generated-path.test.ts`.
- The toolkit's and `examples/collection-review`'s `.gitignore`.

## Deliverables

1. Extend `isRamifyGeneratedSegment` as C5 states, with tests at every call
   site that already has one for `.ramify`.
2. Add the `.gitignore` patterns to the toolkit and the reference project,
   and update the comment that names near misses.
3. Change the publisher's input to `PublishInput`, add the architect target,
   its recognition rule, its limit and its place in the transaction, and add
   `view` and nullable `module` and `area` to `MaterializedTarget`. The
   daemon service keeps compiling by passing `{ api: projection, architect: null }`.
4. Add `maxArchitectBytes` to the publisher limits in `src/resident-assembly.ts`.
5. Tests for AV19–AV23 with the controlled filesystem, including a switch
   failure on the architect target after an API target switched, and a crash
   recovery of leftover architect siblings.
6. The `rg` visibility case (AV23) as a test that creates a Git repository in
   a temporary directory.

## Matrix rows executed here

AV19–AV23.

## Verification

```sh
npx vitest run subs/analysis/subs/project/src/tests/generated-path.test.ts
npx vitest run subs/analysis/subs/project/src/tests/observer.test.ts subs/analysis/subs/project/src/tests/capture.test.ts
npx vitest run subs/daemon/src/tests/watcher.test.ts
npx vitest run subs/daemon/src/tests/api-view-publisher.test.ts subs/daemon/src/tests/api-view-publisher-crash-recovery.test.ts
npx vitest run subs/daemon/src/tests/service.test.ts src/tests/resident-assembly.test.ts
npm run type-check
npm run build
npm run check:self
npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan2a.test.ts
```

## Exit criteria

AV19–AV23 pass; the API view publisher's existing tests and the Plan 2A
harness pass unchanged.

## Handoff

`PublishInput`, the architect target, `maxArchitectBytes` and the reserved
names.
