# Iteration 1 results: Ramify declares its inferred signatures

**Recorded:** 2026-09-22. **Status:** complete for its scope. The four reference
self-check instances are deferred to iteration 6.

Work in `/tmp/ramify-plan8-i1`, branch `feat/plan8-baseline-i1`, cut from
`b77b6f6`. This iteration closes [KI-1](../main-plan.md#known-issues) and
answers BR01 and BR02's toolkit half. It applies Ramify Plan 8's
[iteration 7](../../../../../docs/plans/iteration-8-signature-companions/iterations/iteration7-results.md)
pattern to the toolkit: every declared type states exactly what the compiler
already inferred, so no behavior and no type changed.

## Precondition

`/tmp/ramify-plan8-i1` ran `npm install` and `npm run build` before its first
check, as the plan requires. `ramify-agent`'s own dependencies were not needed.

## 1. The ten declared signatures

The check reported ten `signature-inferred` analysis limits. It now reports
none.

| Symbol | File | Declaration |
| --- | --- | --- |
| `createControlledClock` | `subs/daemon/subs/contexts/src/tests/controlled-ports.ts:25` | `initialTime: number = 0` |
| `LAYOUT` | `subs/presentation/subs/layout/src/geometry.ts:95` | `LayoutGeometry`, a written-out interface whose 65 readonly members repeat the literal types |
| `wrapText` | `subs/presentation/subs/layout/src/geometry.ts:298` | `maxLines: number = Number.POSITIVE_INFINITY` |
| `MIN_SCALE`, `MAX_SCALE` | `subs/presentation/subs/layout/src/viewport.ts:21-22` | `: 0.5`, `: 4` |
| `wheelFactor` | `subs/presentation/subs/layout/src/viewport.ts:114` | `deltaMode: number = 0` |
| `DRAG_THRESHOLD` | `subs/presentation/subs/layout/src/viewport.ts:120` | `: 5` |
| `createProjectExplorerModel` | `subs/service-api/src/project-view.ts` | `ExplorerProjectionResult` |
| `createExplorerRouter` | `subs/service-api/src/router.ts` | `ExplorerRouter` |
| `probeExplorerReadiness` | `subs/service-api/src/web-discovery.ts:80` | `timeoutMs: number = 250` |

Three new types carry the eleventh name of the plan's table:

- **`LayoutGeometry`** (`geometry.ts`) writes out the layout budget's literal
  types, member for member, so the `as const` object declares its own shape.
- **`ExplorerProjectionResult`** (`project-view.ts`) names the projection's
  two answers: the unavailable reason with its optional encoded-size limit, and
  the ready revision with its view. Its members are written exactly as the
  projection produced them, including the mutable arrays and the
  `signature` union with its `reason?: undefined` and `request?: undefined`
  members.
- **`ExplorerProcedures`** (`router.ts`) writes out the four query procedures'
  parsed inputs and answers, and `ExplorerRouter` is now
  `TRPCBuiltRouter<{ ctx: object; meta: object; errorShape: TRPCDefaultErrorShape;
  transformer: false }, TRPCDecorateCreateRouterOptions<ExplorerProcedures>>`.
  This follows the reference example's `ProtocolRouter`. `ExplorerRouter` keeps
  the name `subs/explorer/src/browser-app.tsx:4` imports; it is no longer
  `ReturnType<typeof createExplorerRouter>` but the spelled-out type that
  factory now declares.

The type imports each declaration needed are `ResolvedTagRegistry`,
`BindingRequest`, `SourceOrigin`, `ModulePurpose`, `WrittenForm`,
`ContextRevision`, `ContextStatus` and `SymbolDetail`, all already visible to
`service-api` through the root's existing to-descendants statements.

## 2. Exposure changes

Each new type is a signature companion, so every module that exposes the symbol
also exposes the type; the parent or descendant that receives the symbol
receives the type with it.

| Description | Statement |
| --- | --- |
| `subs/presentation/subs/layout/module.ramify` | new: `expose-src LayoutGeometry from "geometry.ts" to parent` |
| `subs/service-api/module.ramify` | `+ ExplorerProjectionResult` on the `project-view.ts` statement |
| `subs/service-api/module.ramify` | `+ ExplorerProcedures` on the `router.ts` statement |
| `module.ramify` (root, P4) | `+ ExplorerProjectionResult` on `expose-sub … from service-api to descendants` |
| `module.ramify` (root, P9) | `+ ExplorerProcedures` on the router's `expose-sub … from service-api to descendants` |

`LAYOUT` is exposed only by `layout` to its parent, so one statement is enough;
`presentation` does not re-expose it. `LayoutGeometry` is exposed untagged, as
the other layout type statements are: `browser` is a required-symbol tag and is
never assigned automatically, and `layout`'s header carries no required-importer
tag, so the companion tag rule is satisfied. `ExplorerProjectionResult` and
`ExplorerProcedures` take `service-api`'s `dispatch` tag by default, which the
symbols they accompany also carry.

No `package.json` export changed.

## 3. Proving that no type changed (BR01)

**Temporary identity check.** The pre-change `project-view.ts`, `router.ts`,
`geometry.ts` and `viewport.ts` were restored from `HEAD` beside their new
versions, and a temporary module asserted the compiler's own type-identity
relation between each original inferred type and its declaration:

```ts
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
export const modelIdentical: Exact<ReturnType<typeof originalModel>, ExplorerProjectionResult> = true;
export const routerIdentical: Exact<ReturnType<typeof originalRouter>, ExplorerRouter> = true;
export const layoutIdentical: Exact<typeof originalLayout, LayoutGeometry> = true;
```

`npx tsc --noEmit -p tsconfig.json` exited 0 with all six assertions in place,
including the three above and the `MIN_SCALE`, `MAX_SCALE` and `DRAG_THRESHOLD`
literals. A negative control — widening the expected model result by one union
member — failed with `TS2322: Type 'true' is not assignable to type 'false'`, so
the check is not vacuous. The copies and the check were then removed.

The five remaining declarations are identical by construction: an untyped
default parameter of a numeric literal infers `number`, which is what each now
declares.

**Permanent compile-time identity tests.** `subs/service-api/src/tests/router-typing.test.ts`
restates the projection and router contracts independently, in the form of the
reference example's `protocol-typing.test.ts`. Vitest's `toEqualTypeOf` reports
a union-valued subject through a per-key difference that does not decide
identity, so the assertions compare the compiler's identity relation against
`true` instead, which rejects a wider and a narrower restatement alike. The
router's answers are read from `ExplorerProcedures` rather than
`inferRouterOutputs`, whose client-facing transform is not the declared type.
The file pins the projection's unavailable member, its summary and metrics
records, its file and capability vocabularies, every procedure input through
`inferRouterInputs<ExplorerRouter>`, and every procedure answer.

## 4. BD24 restored

`src/tests/dependency-diagram-daemon.test.ts` now expects what it expected
before the Plan 7 branch relaxed it:

- `expect(revision.outcome).toEqual({ execution: 'completed', check: 'passed', coverage: 'complete' })`
- `expect(ready.diagram.coverage).toEqual({ state: 'complete', unknownDependencies: 0, limitIds: [] })`

The hard-coded six-file, ten-limit expectation, the `checked.report` source
coverage read and the `productionLimitIds` computation are gone, together with
the two comments that explained them. The second assertion takes the plan's
explicit form rather than the pre-merge `toBe('complete')`, which it implies.

## 5. Verification

Every command ran from `/tmp/ramify-plan8-i1`.

| Command | Result |
| --- | --- |
| `npm install`, `npm run build` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` (`npm run type-check`) | exit 0 |
| `npm run check:self` | exit 0, complete coverage, 0 analysis limits |
| `npx vitest run src/tests/dependency-diagram-daemon.test.ts` | 1 file, 1 test passed |
| `npx vitest run subs/explorer subs/service-api subs/presentation/subs/layout` | 14 files, 83 tests passed |

`check:self`:

```text
Root: /tmp/ramify-plan8-i1 (given)
Configuration: /tmp/ramify-plan8-i1/tsconfig.json
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 15 owners, 438 source files, 17 resources, 6571 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 4569 allowed, 0 denied, 2002 external
```

BD24:

```text
 RUN  v4.1.11 /tmp/ramify-plan8-i1

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  19:32:33
   Duration  18.60s (transform 125ms, setup 0ms, import 154ms, tests 18.35s, environment 0ms)
```

The focused suites:

```text
 Test Files  14 passed (14)
      Tests  83 passed (83)
```

## 6. Deferred and limitations

1. **The four reference self-check instances are deferred to iteration 6.**
   `scripts/reference-harness/verify.ts` accepts only `--plan`, `--iteration`,
   `--format` and `--preserve-on-failure`; there is no instance filter, so
   `I1-27:self-check`, `I1-27:self-negative`, `I2-30:self-check-eleven` and
   `I5-14:self-check-eleven` cannot be run without a full completion suite.
   Those are long real-process runs, and the plan directs them to iteration 6.
   `I2-30:self-check-eleven` and `I5-14:self-check-eleven` also pin eleven
   owners, while `check:self` now completes fifteen; that drift is iteration 2's
   KI-3, not this iteration's.
2. **MT09 is sensitive to machine load.** `subs/explorer/src/tests/ModuleTreePage.test.tsx`
   MT09 failed its budget once while BD24's daemon and analyzer processes ran
   concurrently, and passed alone and in the focused run afterwards. It is a
   timing budget under contention, not a regression from this iteration.
3. **The full suite was not run**, as the plan directs; iteration 6 audits both
   suites on one commit.
