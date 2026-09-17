# Iteration 1: Preserve imported-path behavior

**Plan:** [Plan 6D: Behavioral dependency diagram](../main-plan.md).
**Prerequisites:** the main plan's accepted review decisions. Reconfirm
that `dependency-behavior` is batch-only and the current aggregate classifier
tests pass before editing.
**Owner:** `analysis/typescript`.

## Goal

Extend the frozen compiler evidence so use through one import path cannot make
another unused path look referenced, while retaining the existing headline
classification. Add the compiler-side `behaviorRuns` counter that later
iterations use as the hook-isolation witness.

## Read first

- [Contracts C1](../contracts.md#c1-compiler-evidence) and BD01–BD06 in the
  [acceptance matrix](../acceptance.md).
- `subs/analysis/subs/typescript/src/behavior-classifier.ts`.
- `subs/analysis/subs/typescript/src/interfaces/dependency-behavior.ts`.
- `subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts`.
- `subs/analysis/src/tests/dependency-behavior-capability.test.ts`.
- [TypeScript source interpretation](../../../model/typescript-source-interpretation.principles.md)
  for original and access identity; this iteration does not revise it.

## Deliverables

1. Add `DependencyBehaviorAccessFact` and the ordered `accesses` field from C1.
2. Key mutable reference evidence by consumer/original/access instead of sharing
   one evidence set across all accesses. Aggregate only after each access fact
   is classified.
3. Preserve `accessIds`, aggregate `classification`, evidence and limits for
   existing modularity consumers. Assert the access-ID equality invariant.
4. Add the `path-facts` compiler fixture and BD01–BD05 cases, including separate
   aliases, separate declarations, forwarding and one isolated limit.
5. Add the `behaviorRuns` counter from C1 to the batch helper's `behavior`
   command, observable by tests, and switch the zero-invocation evidence to it.
6. Extend capability-isolation tests only where needed to prove ordinary output
   and zero-invocation behavior remain unchanged.

## Matrix rows executed here

BD01–BD06.

## Verification

```sh
npx vitest run subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts
npx vitest run subs/analysis/src/tests/dependency-behavior-capability.test.ts
npx vitest run subs/analysis/src/tests/retained-session.test.ts subs/daemon/src/tests/service.test.ts
npm run type-check
npm run build
npm run check:self
```

First demonstrate the only-B-used failure against the pre-change classifier:
both access IDs are present on one aggregate fact and cannot be distinguished.
Do not retain a test that passes merely because it never joins the IDs to their
target modules.

## Exit criteria

BD01–BD06 pass; every aggregate fact can be reproduced from its access facts;
ordinary report serialization and capability lists are unchanged; self-check
has no new exposure or dependency finding.

## Handoff

Iteration 2 receives the frozen C1 shape, ordering/precedence helpers and the
`path-facts` fixture. Iteration 3 receives the classifier entry it must reuse
for the retained `behavior` operation and the counter's location. Record any syntax that remains access-level unknown; do
not broaden it to a known classification in the handoff.
