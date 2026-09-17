# Iteration 1 results: Preserve imported-path behavior

**Date:** 2026-09-17. **Mode:** direct work in worktree `/tmp/ramify-plan6d-behavioral-diagram`,
branch `feat/plan6d-behavioral-dependency-diagram`, based on `08282e8` (Plan 6D documents).

## Prerequisites

- `dependency-behavior` is batch-only: `dependency-behavior-capability.test.ts` passed before editing.
  Retained open and update reject the capability as `unavailable-capability`.
- The aggregate classifier tests passed before editing: the two existing cases in `dependency-behavior.test.ts`.

### Pre-change failure

The `path-facts` test was added before the classifier changed. It failed with no `accesses` field. The
pre-change fact for `src/only-b.ts` shows the provider gap. After joining its access IDs to their
imported modules, one aggregate fact names both paths:

```json
{"original":{"owner":"fixture/core","binding":"act"},
 "accessIds":["access/1:ade51d2d…","access/1:fa991289…"],
 "classification":"behavioral","evidence":["call"],"limitIds":[],
 "targets":["fixture/b","fixture/c"]}
```

Only the B path calls `act`. The C path is imported but unused, and that fact cannot tell them apart.

## Built

All changes are owned by `analysis/typescript`. The only exceptions are the parent's test and fixture listed below.

- `src/interfaces/dependency-behavior.ts`: `DependencyBehaviorAccessFact` from C1 and the
  ordered `accesses` field on `DependencyBehaviorFact`. Its documentation now states the aggregate precedence and
  the rule that `limits` holds every limit that an access fact names.
- `src/behavior-classifier.ts`:
  - Mutable evidence is now a `PathDraft` keyed by consumer file, original and `SourceAccess.id`. Before, it was one set per consumer file and original.
  - `accessFact` classifies each path. `aggregateFact` then applies the fixed precedence behavioral, unknown,
    non-behavioral, unused. The aggregate's `accessIds` come from the ordered access facts, so the equality
    invariant holds by construction.
  - A module-level counter increments on every classifier run, and `behaviorRuns()` reads it.
- `src/compiler-helper.ts`: every result frame carries the helper's `behaviorRuns`. A helper lifetime that never
  classified therefore reports an explicit zero.
- `src/bridge.ts`: result frames are validated. A missing, non-integer or decreasing count is a `protocol-error`. The bridge records the latest count.
  `src/source-analysis.ts` and `src/interfaces/source.ts` add `SourceAnalysis.behaviorRuns()`, which stays
  readable after disposal.
- `docs/architecture/modularity-report.spec.md`: documents the access facts, the aggregation rule, the limits list
  and the counter.
- Tests:
  - `src/tests/dependency-behavior.test.ts` adds the `path-facts` fixture.
  - Parent `analysis`: `src/tests/dependency-behavior-capability.test.ts` now uses the counter as its
    zero-invocation evidence.
  - `src/tests/modularity-fixture.ts` gains `accesses: []` so it still type-checks.

### `path-facts` fixture

Real modules `fixture` (A, consumer files in `src/`), `fixture/b` and `fixture/c` both forward originals
owned by `fixture/core`. Every assertion joins each access fact's ID to the `SourceAccess` target's owning module.

| Consumer | Variant |
| --- | --- |
| `only-b.ts` | call through B, C imported only |
| `both.ts` | call through B, `typeof` through C |
| `neither.ts` | both imported, no reference |
| `aliases.ts` | `act, act as again` from B, repeated calls, a second unused declaration from B |
| `kinds.ts` | construction; callable reference and call; data and type; local and `export … from` forwarding |
| `limited.ts` | `any` reference through B, C unused |
| `settled.ts` | defaulted destructure from the B namespace gives an `any` local (limit); call through C |

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| BD01 | `only-b`: B `behavioral [call]`, C `unused`, aggregate `behavioral` | pass |
| BD02 | `both`: B `behavioral [call]`, C `non-behavioral [type]`, aggregate `[call, type]`; `neither`: one `unused` aggregate, both paths `unused` | pass |
| BD03 | `aliases`: one aggregate fact and three access IDs, all targeting B (two `behavioral`, one `unused`). Repeated references add nothing | pass |
| BD04 | `kinds`: `Service` construction; `act` C `[call, callable-reference]` + B `[forwarding]` → `behavioral`; `settings` B `[data]` + C `[forwarding]` → `non-behavioral`; `Shape` `[type]` | pass |
| BD05 | `limited`: B `unknown` (`unclassified-capability`), C `unused`, aggregate `unknown` with B's limit. `settled`: B `unknown` with its own limit, C `behavioral`, aggregate `behavioral` with no `limitIds`. `limits` equals the ordered set named by access facts, and the facts are frozen and JSON-stable | pass |
| BD06 | Ordinary batch: at least one helper lifetime reported and `behaviorRuns` is 0; the report bytes and capability list are unchanged. Requested batch: 1. Injected adapter failure: still 1. Retained open/update: 0, with no helper lifetime and the classifier module never loaded in-process. `retained-session.test.ts` and daemon `service.test.ts` pass unchanged | pass |

Every fact in `path-facts` is reproduced from its access facts. The test checks classification by precedence,
`limitIds` as the union when `unknown`, and `evidence` as the ordered union unless `unknown`. It also checks
`accessIds` equality and per-access invariants. The first existing case also asserts `accessIds` equality over its
wider fixture.

## Verification

```sh
npx vitest run subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts      # 3 passed
npx vitest run subs/analysis/src/tests/dependency-behavior-capability.test.ts           # 2 passed
npx vitest run subs/analysis/src/tests/retained-session.test.ts subs/daemon/src/tests/service.test.ts  # 18 passed
npx vitest run subs/analysis/src/tests/modularity.test.ts subs/analysis/subs/typescript/src/tests/lifetime.test.ts  # 32 passed
npm run type-check                                                                      # clean
npm run build                                                                           # built
npm run check:self   # passed: 15 owners, 0 errors, 0 warnings, 0 analysis limits, 0 denied
```

The full test suite was not run.

## Deviations

- **One selection per access.** The access interpreter records at most one selection per `SourceAccess`, so
  `import { act, act as again }` produces two accesses to the same imported module. The classifier still merges
  every selection of one original that shares an access ID, as C1 requires. With the current interpreter,
  however, several aliases in one declaration become separate access facts with the same boundary. BD03 is
  therefore witnessed as one aggregate fact whose access IDs all target B. Iteration 2 deduplicates them by
  `(consumer, imported module, original)`.
- **Partial evidence on unknown access facts.** An `unknown` access fact keeps the partial type, data or
  forwarding evidence observed beside its limit. This is what preserves the previous aggregate evidence exactly:
  a `behavioral` or `non-behavioral` aggregate is the union of all access evidence, as before. `unknown`
  aggregates still have empty evidence.
- **Settled limits stay in the list.** `DependencyBehaviorFacts.limits` now also contains limits named by an
  `unknown` access fact whose aggregate another path settled as `behavioral`. Before, those limits were dropped.
  Aggregate `limitIds` are unchanged, and modularity reads `limits` only for a `failed` result, so its headline
  counts and coverage are unaffected.
- **Counter access point.** The counter is readable through the added `SourceAnalysis.behaviorRuns()` member. C1
  fixes the counter but not its access point.

## Limitations

- **Access-level unknown syntax.** These cases stay `unknown` for their access and are not broadened:
  - `any`, `unknown` or unconstrained value references (`unclassified-capability`), including a local made `any`
    by a defaulted destructure;
  - unresolved local symbols or reference types (`unresolved-symbol`);
  - selection forms without a reference profile (`unsupported-syntax`);
  - a consumer file the compiler did not load, and isolated per-file compiler failures (`compiler-failure`).
    These last limits apply to every access of that file.
- **Namespace escape.** An escaping namespace import such as `export const escaped = ns` produces no resolved
  selection. It creates no behavior fact and remains an access coverage limit.
- **Retained sessions.** The retained adapter keeps its compiler in-process and has no helper. Its zero-run
  witness is therefore that no batch helper lifetime started and the classifier module was never loaded, not a
  helper-reported count.

## Handoff

- **Iteration 2** receives:
  - the frozen C1 shape, `accesses` ordered by `accessId` and equal to `accessIds`;
  - the precedence helpers `accessFact` and `aggregateFact` in `behavior-classifier.ts`, not exposed; the pure
    projection must apply the same order `behavioral, unknown, non-behavioral, unused`, as the modularity owner
    already does;
  - the `path-facts` fixture in `subs/analysis/subs/typescript/src/tests/dependency-behavior.test.ts`.

  Per-original status must come from the import decisions of each access fact's own access.
- **Iteration 3** reuses `classifyDependencyBehavior(project, inputs, accesses)` for the supplied-import
  `behavior` command in `compiler-helper.ts`. The counter is `behaviorRuns()` in `behavior-classifier.ts`; the
  bridge exposes it as `SourceAnalysis.behaviorRuns()`, which the analyzer reports.
- **Iteration 4.** For BD24, the retained session has no compiler helper (see Limitations). Its evidence is the
  in-process classifier counter or the classifier module staying unloaded.
