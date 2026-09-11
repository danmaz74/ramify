# Iteration 2: Engine changes and the `--plan 5` harness

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** iteration 1 (the accepted package, the probe results and
the revised budgets). **Owners:** `subs/analysis/subs/typescript/` and
`subs/analysis/subs/model/`; the independent `scripts/reference-harness/`
scope. Iterations 3 and 5 both start from this iteration and may run in
parallel.

## Goal

Land the two engine changes that speed up batch and session work alike and
keep every recorded report equal: the lazy spelling-filtered namespace index
with the hoisted access interpreter, and indexed model lookups. Register the
`--plan 5` gate with every instance of [subcases.md](../subcases.md) as not
executed, and execute the engine and harness rows.

## Read first

- [contracts.md](../contracts.md#typescript-descriptions-the-interpreter-and-the-retained-adapter):
  the `AccessInterpreter` declaration, the `createAccessInterpreter` and
  `namespace-uses.ts` paragraphs, and
  [Removed names](../contracts.md#removed-names) for `collectAccesses`.
- [owners.md](../owners.md): TypeScript, Unchanged owners, and the iteration 2
  rows of the activation manifest.
- Main plan: [Starting point](../main-plan.md#starting-point);
  [Scope decisions](../main-plan.md#scope-decisions);
  [Harness implementation and evidence](../main-plan.md#harness-implementation-and-evidence)
  items 1, 6 and 7; matrix rows I5-01 and I5-02.
- [scope.md](../scope.md#access-facts): Access facts; the probe results for
  P5-3 recorded in `probes.md`.
- Source: `subs/analysis/subs/typescript/src/{accesses,namespace-uses,catalog,resolution,source-analysis}.ts`
  and `interfaces/source.ts`; `subs/analysis/subs/model/src/{decisions,model}.ts`.
- Harness: `scripts/reference-harness/{plan.ts,verify.ts,runner.ts,instances.ts,plan2-instances.ts,plan2-runtime.ts,plan2.test.ts}`
  and Plan 2's [instance inventory](../../done/iteration-2-resident-verification/subcases.md)
  for the shape of a registered plan.
- Plan 1 [contracts](../../done/iteration-1-project-verifier/contracts.md):
  TypeScript: catalog, accesses and coverage.

## Deliverables

1. `subs/analysis/subs/typescript/src/access-interpreter.ts` exporting
   `createAccessInterpreter(project, inputs, host, catalog, runtime)`. The
   setup that runs per call today, the maps over catalog files and originals
   and the sorted inventory, is built once and maintained through
   `replaceDescriptions`. `interpret(files, signal?)` yields exactly the
   accesses and coverage notes a whole-project pass yields for those files,
   plus the resolution candidates each file probed, keyed by file.
   `collectAccesses` becomes a private wrapper over
   `createAccessInterpreter(...).interpret(allOwnedFiles)` and is no longer a
   public shape; `accesses.ts` keeps its interpretation rules unchanged.
2. `src/namespace-uses.ts` builds its identifier index by spelling on first
   use and resolves one spelling through the array overload of
   `getSymbolAtLocation`; a file with no namespace-bearing binding issues no
   identifier symbol query. The shorthand-property and export-specifier
   readings are unchanged, and a local declaration that shadows a namespace
   import is not a member selection.
3. `interfaces/source.ts` gains `AccessInterpreter` inside the T2 wildcard,
   and the declaration gains T3 with the real export, as
   [owners.md](../owners.md) records.
4. `subs/analysis/subs/model/src/decisions.ts` and `src/model.ts` gain indexed
   lookups, including `canonicalOrigin`, with no rule change, no public name
   change and identical decisions, ordering and diagnostic identities.
5. Harness: `plan5-instances.ts` transcribing every leaf of
   [subcases.md](../subcases.md) as a seed; `plan.ts` gaining
   `readReviewedPlan5`, which validates the transcription against this plan's
   matrix, iteration table, membership table and per-iteration counts and
   accepts the fixture codes `R`, `T`, `F`, `S100`, `S500`, `S1000`, `Q`, `M`,
   `W`, `A`, `P` and `H` and the evidence kinds `api`, `unit`, `session`,
   `quick`, `ipc`, `process` and `measurement`; `verify.ts` accepting
   `--plan 5` with `--iteration 1` to `13`; `plan5-runtime.ts` registering the
   capabilities `engine`, `catalog`, `compiler`, `observer`, `session`,
   `hosting`, `contexts`, `supersession`, `hook-cli`, `live-equivalence`,
   `fast-measure`, `harness-gate` and `completion`, with availability
   distinct from execution. Only `engine` and `harness-gate` are available at
   this iteration's exit; every other instance is registered and reported
   `not-executed`.
6. Harness handlers for I5-01 over reference, toolkit and Plan 1 fixture
   copies and for the S1000 fixture, and the `H` stubs for I5-02, following
   Plan 2's `I2-28` analogue. Every harness or scripted run that may start a
   daemon sets `RAMIFY_ENDPOINT_DIR` to a directory it owns and stops the
   daemon in `finally`.
7. Tests: `subs/analysis/subs/typescript/src/tests/access-interpreter.test.ts`
   (setup built once, `only` subsets, candidates by file, disposal);
   extensions of `src/tests/accesses.test.ts` (namespace shadowing, zero
   queries without namespaces) and of
   `subs/analysis/subs/model/src/tests/decision-lookups.test.ts` (indexed
   lookups equal to the recorded decisions).

## Matrix rows executed here

- I5-01: `namespace-lazy-equal` (reference and toolkit reports equal except
  `runId`; fifteen owners and two warnings, and 229 source files and 2,746
  accesses with no finding); `namespace-shadowing` (one access from the outer
  read, none from the shadowed one); `zero-queries-without-namespaces` (no
  identifier symbol query for a file with no namespace binding);
  `only-subset-equal` (a three-file subset equals the whole pass entry for
  entry); `hoisted-setup-bounded` (the setup maps are built once for twenty
  calls at S1000); `decide-indexed-equal` (decisions, order and diagnostic
  identities unchanged).
- I5-02: `required-membership` (103 registered leaves, every group and count
  matching); `removed-record-fails`; `failing-assertion-fails`;
  `iteration-filter` (`--iteration 4` requires 2 and 4; `--iteration 9`
  requires 2 to 9).

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/analysis/subs/typescript/src/tests/access-interpreter.test.ts \
  subs/analysis/subs/typescript/src/tests/accesses.test.ts \
  subs/analysis/subs/typescript/src/tests/catalog.test.ts \
  subs/analysis/subs/model/src/tests/decision-lookups.test.ts
npm test
npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan5.test.ts
npm run reference:verify -- --plan 5 --iteration 2      # requires iteration 2 only
npm run reference:verify -- --plan 1                    # the batch engine change keeps Plan 1's gate
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self           # fifteen and eleven owners, no finding
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kinds: `api` for I5-01 and `unit` for I5-02. Expected intermediate
failures: the unfiltered `npm run reference:verify -- --plan 5` fails until
iteration 13, and every capability other than `engine` reports as
unavailable. `check:reference` and `check:self` are resident since Plan 2, so
they run under the exported endpoint directory and the daemon is stopped in
`finally`. A report that differs from the recorded one is a defect in this
iteration, never a comparison tolerance.

## Exit criteria

- The interpreter, the lazy namespace index and the indexed model lookups are
  in place, and every recorded batch report is equal except `runId`.
- `npm run reference:verify -- --plan 5 --iteration 2` passes with the ten
  instances of this iteration executed and every other instance registered as
  not executed.
- T3 is active with its real export and `collectAccesses` is private.
- Plan 1's gate and both project checks pass on this build.

## Handoff

Iteration 3 describes files over this interpreter and replaces `buildCatalog`
with the assembly of per-file descriptions; iteration 4 needs nothing from
here beyond the registered gate, which is why it may start in parallel with
iteration 3. `AccessInterpreter.replaceDescriptions` is the seam iteration 6
uses to keep access facts current, and the registered capabilities are the
switches each later iteration turns on.
