# Iteration 7 results: the reference example declares its signatures

**Recorded:** 2026-09-21. **Status:** complete for its scope; SC26 still fails.
A follow-up to [iteration 5](iteration5-results.md)'s open item 6, authorized by
Dan as direct work on the same branch. Every Plan 1 failure that pinned the
reference example now passes. **The Plan 1 gate passes 274 of 308 instances**,
up from 212. The 34 that remain are not pins of the reference example: 30 fail
on the `signature-inferred` note of the fixture F constant `value`, 2 on the
toolkit's own ten notes, and 2 failed before Plan 8.

Direct work in `/tmp/ramify-plan8-signature-companions`, branch
`feat/plan8-signature-companions`, on `1b9ef43`.

## Decisions applied

Dan's decisions of 2026-09-21:

1. The coverage pins stay `complete`. The reference example declares its
   inferred signatures explicitly, so its coverage is complete again.
2. Count pins take the conforming example's values, after each change is
   explained.
3. `I1-09:signature-only-type` tests both halves of the rule, with a dated
   amendment to its Plan 1 row.
4. The `src/tests` pins follow the conforming example.

## 1. Declared signatures in the reference example

The check reported 11 `signature-inferred` notes. It now reports none.

- **Eight vocabulary schemas** in `contracts/src/interfaces/vocabulary.ts`
  declare their exact zod types, such as
  `z.ZodObject<{ id: z.ZodString; predecessor: z.ZodNullable<z.ZodString> }>`.
  A composed schema names its parts with `typeof`, as in
  `z.ZodArray<typeof revisionSchema>`. A temporary compile-time identity check
  against the committed file proved that each declared schema type, and the
  `z.infer` types derived from them, are identical to the inferred ones.
- **The three router factories** declare their return types. The new
  `ProtocolRouter<TRecord>` in the root's `src/interfaces/protocol.ts` writes out
  the configured runtime's root types over a procedure record. Each feature
  declares its own record, `CatalogProcedures` and `ReviewsProcedures`, next to
  its factory. A record's input is the parser's zod input type, such as
  `z.input<typeof recordIdSchema>`. Its answer is written in the shared
  vocabulary, not as `CatalogSummary` or `ReviewOutcome`, so those types still
  stop where they did. `assembleRouter` returns
  `ProtocolRouter<{ catalog: CatalogProcedures; reviews: ReviewsProcedures }>`,
  and `AppRouter` remains `ReturnType<typeof assembleRouter>`. The same identity
  check proved that the application router's root types and its client inputs
  and outputs are unchanged. A factory whose declared output is narrower than
  its implementation fails to compile. tRPC compares procedure inputs
  covariantly, so the example's own compiler tests pin the inputs exactly.

The contract change the rule then required:

| Statement | Change |
| --- | --- |
| R3 | + `ProtocolRouter` |
| R4, new | `expose-sub CatalogProcedures, ReviewsProcedures, RecordId, recordIdSchema, revisionScopeSchema, ReviewStatus, reviewStatusSchema, Finding, findingSchema, Observation, observationSchema from workspace to descendants` |
| A1, RV1 | + the feature's procedure record |
| W2, W4 | + the feature's procedure record |

R3 exposes `assembleRouter` to every descendant of the root. The records its
return type names, and the vocabulary those records name, must therefore be
visible there as well. W1 already makes the vocabulary visible below
`workspace`. R4 adds `workspace` itself and the testing module
`integration-tests` as destinations of the root's own exposure.
`ProtocolRouter` joins R3 rather than R1. Removing R1's two iteration 4
companions therefore restores exactly its four-name statement from before
Plan 8, as `I1-09:signature-only-type` requires.
There are now 34 statements. The example type-checks, passes its 77 Vitest
tests and its Cucumber scenario, and `ramify check --batch` exits 0 with 0
errors, 2 warnings, 0 analysis limits and complete coverage.

The descriptions' comments, the root and `reviews` READMEs, `protocol.ts` and
the [contract map](../../reference-project/contract-map.md) record the change.

## 2. Count and statement pins

Every changed count is explained by iteration 4's added imports plus this
iteration's type imports. This iteration adds 5 external type imports: three
tRPC types in `protocol.ts` and one procedure type in each router. It adds 10
application type imports: `RecordId` and `ProtocolRouter` in the catalog
router; `Finding`, `Observation`, `RecordId`, `ReviewStatus` and
`ProtocolRouter` in the review router; and the two records and `ProtocolRouter`
in the assembly.

| Pin | Before Plan 8 | Iteration 4 | Now |
| --- | ---: | ---: | ---: |
| Static occurrences (`static-cases.ts`) | 292 | 296 | 311 |
| Application decisions (`static-cases.ts`, `tags-origin-cases.ts`) | 164 | 167 | 177 |
| Static external scope (`static-cases.ts`) | 128 | 129 | 134 |
| Baseline summary originals (`reference-baseline.ts`, `resident-expectations.ts`) | — | 92 | 95 |
| Baseline accesses / allowed / external | — | 298 / 169 / 129 | 313 / 179 / 134 |
| Baseline coverage notes | — | 11 | 0 |
| Reference statements (`linking-expectations.ts`, `linking-cases.ts`) | 33 | 33 | 34 |
| Non-behavioral dependencies (`dependency-analyzer-process.test.ts`) | 48 | 50 | 58 |

The last row counts distinct type-only module-to-original dependencies. Eight
are new: `RecordId` and `ProtocolRouter` from `catalog`; `Finding`,
`Observation`, `ReviewStatus` and `ProtocolRouter` from `reviews`, which
already imported `RecordId`; and the two records from the root.

Statement pins follow the contract: `referenceContracts` gains R4 and the new
names, as do the parser fixtures in `descriptions.test.ts` and the catalog
expectations in `catalog.test.ts`. The W2 edit anchor now includes
`CatalogProcedures` in `static-cases.ts`, `relocation.ts`,
`resident-mutations.ts`, `cli-cases.ts` and the measurement scripts. The W3
anchor of `I1-16:remove-fixture-hop` in `tags-origin-cases.ts` now includes
`CatalogFixtureRecord`, which iteration 4 added. The measurement assertions pin
no `signature-inferred` note for the reference.

The resident `wildcard-remove` edit now removes `RevisionChain` instead of
`RecordId`. R4 names `RecordId`, so removing that export would invalidate the
root's description. `RevisionChain` is selected by the wildcards alone and is
still imported by the catalog core, which keeps the case's intent: a consumer
receives `missing-export` and the contract shrinks. The Plan 2 row names no
symbol.

## 3. `I1-09:signature-only-type`

The Plan 1 row carries a dated amendment in
[subcases.md](../../done/iteration-1-project-verifier/subcases.md). Its original
text is kept. The handler removes `ToolInputSchema` and `ToolResult` from R1 and
then asserts:

- **Nothing is exposed automatically.** The description is valid, both types
  are retained as unexposed private originals, and R1 selects exactly
  `InvocationContext`, `McpToolContribution`, `ProtocolFacilities` and
  `ToolInvocation`.
- **The rule reports each missing companion.** `ramify check --batch
  --format json` exits 1 with a completed execution, a failed check and no
  denied import. It reports exactly two diagnostics, both
  `exposed-without-companion` of category `exposure` at R1's line, column 1.
  Each names `McpToolContribution` as its original and the descendants
  destination, and relates to that type's position in `McpToolContribution`'s
  signature. The expected positions and messages are computed independently
  from the files.

It passes.

## Checks run

| Check | Result |
| --- | --- |
| `npm run type-check` | passes |
| Example `type-check`, `vitest run`, `test:cucumber` | pass: 77 tests, 1 scenario of 12 steps |
| `ramify check --batch` on the example | exit 0, complete coverage, 0 analysis limits |
| `npm run check:self -- --batch` | exit 0: 0 errors, 10 analysis limits, coverage `partial`, unchanged |
| `npm run reference:verify -- --plan 1` | **274 of 308 pass**, 34 fail (below) |
| Harness `catalog.test.ts`, `instances.test.ts` | pass |
| Harness `resident-fixtures.test.ts` | 16 of 18 pass; the 2 failures are fixture F's `value` note, and 5 failed on `1b9ef43` |
| `descriptions.test.ts`, `dependency-analyzer.test.ts`, `dependency-analyzer-process.test.ts`, `ProjectExplorerView.test.tsx`, `companion-cli.test.ts` | pass |
| `dependency-view-server.test.ts` (BD28) | passes |
| `dependency-diagram-daemon.test.ts` (BD24) | fails, on the toolkit's coverage (below) |
| `companion-assertions.test.mjs`, `fast-fixture.test.mjs` | pass |

## What remains

These failures are not pins of the reference example. Each needs a decision.

1. **Fixture F's `value` (30 Plan 1 instances and 2 resident-fixture tests).**
   F's `subs/provider/src/interfaces/api.ts` exposes `export const value = 1;`,
   and a literal-initialized constant sets `signature-inferred`. This is
   iteration 5's open item 2. The fixture text is part of the reviewed Plan 1
   recipe ([subcases.md](../../done/iteration-1-project-verifier/subcases.md),
   fixture conventions), and `plan5-catalog-cases.ts` pins it too. Either the
   rule should treat a literal initializer as declared, or the recipe should be
   amended to `export const value: number = 1;`. The instances are `I1-24`
   (7), `I1-26` (4), `I1-27` cancellation, read-failure, dispose and retention
   (6), `I1-28` compiled CLI (8), `I1-29` (3) and `I1-30` testing-module (2).
2. **The toolkit's ten notes (`I1-27:self-check`, `I1-27:self-negative` and
   BD24).** `createControlledClock`, `wrapText`, `wheelFactor` and
   `probeExplorerReadiness` have untyped default parameters. `MIN_SCALE`,
   `MAX_SCALE` and `DRAG_THRESHOLD` are literal constants, and `LAYOUT` is an
   object literal. `createProjectExplorerModel` and `createExplorerRouter`
   infer their return types; `ExplorerRouter` is
   `ReturnType<typeof createExplorerRouter>`. Declaring these is toolkit work
   comparable to this iteration's router work, and was not in scope.
3. **Failures from before Plan 8.** `I1-28:relocated-package` fails because the
   relocated toolkit test suite exits 1. The relocated compiled and installed
   reference checks inside it pass with complete coverage.
   `I1-30:production-selection/toolkit` pins a build file list without the
   explorer assets.
4. **Plan 5 and Plan 2 rows that name the reference example's vocabulary. None
   of these was run.**
   - `I5-06:export-removed-missing` removes the export of `revisionScopeSchema`,
     which R4 now names. The root's description would then be invalid, where the
     row expects only `missing-export` at the three importers. Its edit anchor
     is updated for the declared type. The reviewed row needs an amendment,
     either another symbol or the new outcome.
   - `I5-06:wide-fanin-bounded` pins 56 importing accesses of the vocabulary file
     in its reviewed row and handler. The conforming example has 61: the two
     routers' new type imports.
   - The Plan 5 edits that add `import type { RevisionScope }` to the review
     router still apply. The router keeps its `ProtocolFacilities` import line
     and does not import `RevisionScope`, and it takes `ProtocolRouter` on a
     line of its own.
