# Iteration 3 results: Model availability enumeration

**Status:** complete. **Plan:** [Plan 2A](../main-plan.md). **Iteration:**
[iteration3.md](iteration3.md).

## Summary

Added `listAvailableOriginals(model, consumer)` to `analysis/model`, sharing
`explainImport`'s testing-origin, visibility and tag-requirement rules through
two extracted private helpers (`testingBlocked`, `requirementsFor`) in
`decisions.ts`. `explainImport` itself was refactored to call the same
helpers; its decisions, reasons, requirements and order are unchanged, which
was verified byte-for-byte (not just by inspection) against the real R and T
catalogs -- 3,920 and 25,980 exhaustive `explainImport` questions respectively,
0 mismatches either side. `listAvailableOriginals` was independently
cross-checked against `explainImport` over the same real catalogs (557 + 3,264
listed entries, 1,935 + 13,136 absences, 0 violations), plus 14 focused unit
tests covering all eight `I2A-03` leaves. Only the owned `module.ramify` line
was added, exactly as reviewed. No parallel owner's files were touched.

## Files changed (owner: `analysis/model` only)

- `subs/analysis/subs/model/src/interfaces/model.ts` -- added `AvailableForm`,
  `AvailableOriginal` (additive; no existing type changed).
- `subs/analysis/subs/model/src/decisions.ts` -- extracted `testingBlocked`
  and `requirementsFor` (both newly exported, not part of the public barrel)
  from the inline logic `explainImport` used; `explainImport`'s body now
  calls them instead of duplicating the logic. No behavioral line changed.
- `subs/analysis/subs/model/src/availability.ts` -- **new**.
  `listAvailableOriginals(model, consumer)` plus a private `requireArea`
  (canonical-area validation, throws `TypeError` like the existing decision
  functions) and a private `byOwnerFileBinding` comparator.
- `subs/analysis/subs/model/src/index.ts` -- added
  `export { listAvailableOriginals } from './availability.js';`.
- `subs/analysis/subs/model/src/tests/available-originals.test.ts` -- **new**,
  14 tests.
- `subs/analysis/subs/model/module.ramify` -- added exactly the reviewed line:
  `expose-src listAvailableOriginals from "availability.ts" tagged [browser] to parent`.
- `subs/analysis/subs/model/README.md` -- one new paragraph documenting the
  enumeration's sharing of `explainImport`'s rules (prose only, no contract
  change).
- `scripts/reference-harness/plan2a-availability-cases.ts` -- **new**, real R/T
  enforcement-equivalence case (see [Enforcement-equivalence handoff](#enforcement-equivalence-handoff-for-iteration-2)
  below). **Not registered** in any ledger/runtime file.

No file under `analysis/project`, `analysis/typescript`, `analysis` (the
assembly), `daemon`, `cli` or root was touched. `subs/**` outside
`subs/analysis/subs/model` shows only pre-existing, untracked or
already-modified files from the parallel iteration 2/4 sessions (verified via
`git status`, none overlapping this iteration's file list).

## Implementation

`decisions.ts` adds:

```ts
export function testingBlocked(profile: readonly string[], area: SourceArea): boolean {
  return !profile.includes('testing') && area.profile.includes('testing');
}

export function requirementsFor(model: Model, importerProfile: readonly string[], original: Original,
  request: BindingRequest): TagRequirement[] { /* identical loop explainImport used inline */ }
```

`explainImport`'s `blockingOrigins` line now reads
`checkedOrigins.filter(({ area }) => testingBlocked(importer.area.profile, area))`
(equivalent to the old short-circuited form: `testingBlocked` returns `false`
for every origin once the importer's own profile includes `testing`, so the
filter result is identical). Its inline required-importer/required-symbol
loop was replaced by one call to `requirementsFor(model, importer.area.profile,
original, question.selection!.request)`, producing the exact same
`TagRequirement[]` in the exact same order.

`availability.ts`:

```ts
export function listAvailableOriginals(model: Model, consumer: SourceArea): readonly AvailableOriginal[] {
  const area = requireArea(model, consumer);          // canonical-area check; throws TypeError otherwise
  const results: AvailableOriginal[] = [];
  for (const original of model.originals) {
    if (original.id.owner === area.owner) continue;                         // same-owner excluded
    if (testingBlocked(area.profile, original.origin.area)) continue;       // testing-origin blocks both forms
    if (!explainVisibility(model, area.owner, original.id).visible) continue;
    const requirements = requirementsFor(model, area.profile, original, 'value');
    if (requirements.some(({ kind, satisfied }) => kind === 'required-importer' && !satisfied)) continue; // blocks both forms
    const valueBlocked = requirements.some(({ kind, satisfied }) => kind === 'required-symbol' && !satisfied);
    const form = original.hasValue && !valueBlocked ? 'value' : original.hasType ? 'type-only' : null;
    if (form) results.push({ original: original.id, form });
  }
  return immutable(results.sort(byOwnerFileBinding));   // unique by construction (one entry per model.originals member); byte order by owner, file, binding
}
```

`requireArea` matches a `SourceArea` structurally (owner, kind, root and
exact profile set) against one of `model.modules[*].areas`; a mismatch on any
field throws `TypeError`, mirroring `requireModule`/`requireOriginal`'s
existing caller-error convention. Uniqueness holds because the loop visits
`model.originals` (already deduplicated by `buildModel`) exactly once per
original; a redundant exposure path changes `explainVisibility`'s `visible`
boolean, never the iteration count.

## Matrix leaves executed (I2A-03, all eight)

| ID | Evidence | Result |
| --- | --- | --- |
| `I2A-03:value-available` | `available-originals.test.ts`: "lists a value-only original as value", "lists a value/type original as value only, never both" | Passed |
| `I2A-03:pure-type` | `available-originals.test.ts`: "lists a pure type original as type-only" | Passed |
| `I2A-03:required-symbol-fallback` | `available-originals.test.ts`: "falls back to type-only ...", "a value-only original with an unsatisfied required-symbol tag and no type binding is entirely absent" | Passed |
| `I2A-03:required-importer-block` | `available-originals.test.ts`: "a missing required-importer tag blocks both forms entirely, unlike a required-symbol shortfall" (positive control included) | Passed |
| `I2A-03:testing-origin` | `available-originals.test.ts`: "a testing-classified original is absent from a non-testing consumer and present from a testing one" | Passed |
| `I2A-03:test-complete-reclassification` | `available-originals.test.ts`: "the tests area repeats ordinary-visible originals and independently upgrades/downgrades their form ..." | Passed |
| `I2A-03:same-owner-absent` | `available-originals.test.ts`: "excludes same-owner originals even when otherwise fully exposed" | Passed |
| `I2A-03:enforcement-equivalence` | Fixture F: `available-originals.test.ts` "agrees with explainImport for every combination in a mixed catalog", "a redundant exposure path ... never duplicates", "is unique by original and byte-ordered ...". Real R/T: [Enforcement-equivalence evidence](#enforcement-equivalence-evidence) below | Passed (fixture F, unit-test-executed); Passed (real R/T, script-executed; checked-in case file not yet wired -- see handoff) |

All 14 tests in `available-originals.test.ts` pass; see
[Commands run](#commands-run) below.

## Enforcement-equivalence evidence

### explainImport pre/post byte-equivalence (decisions.ts refactor)

Method: the pre-refactor `decisions.ts` (captured verbatim via `git show
HEAD:...`, before any edit) and the post-refactor source were both loaded
(different absolute module paths, same real R/T `Model` data dumped once via
`sessionReport`), then run over every `(module source area, foreign original,
applicable request)` triple -- `value` only when `original.hasValue`,
`type-only` always -- and the serialized `ImportDecision` compared byte for
byte.

| Fixture | Questions | Mismatches |
| --- | --- | --- |
| R (`examples/collection-review`) | 3,920 | 0 |
| T (this toolkit) | 25,980 | 0 |

### listAvailableOriginals vs. explainImport (real catalogs)

Method: for every module x source area, `listAvailableOriginals` was compared
against per-original `explainImport` calls: a listed form must be
`explainImport`-allowed; an original absent from the list must be
`explainImport`-denied for every request its own bindings support (`value`
only if `hasValue`, `type-only` only if `hasType` -- `explainImport` does not
itself guard a `type-only` request against a missing type binding, which is
the adapter's/enumeration's classification responsibility per the model's
README, so a request without a real binding is not evidence either way).
Uniqueness and byte order were asserted per module/area (would have thrown
immediately on violation; none did).

| Fixture | Listed entries checked | Absences checked | Violations |
| --- | --- | --- | --- |
| R | 557 | 1,935 | 0 |
| T | 3,264 | 13,136 | 0 |

Scripts (not checked in; per the brief, temp evidence for a comparison this
large is acceptable where a fast checked-in test isn't):
`/tmp/claude-1000/-ramify/plan2a/it3/dump-models.ts` (dumps real R/T `Model`
JSON via `scripts/reference-harness/session-expectations.ts`'s
`sessionReport`), `/tmp/claude-1000/-ramify/plan2a/it3/compare.ts` (the
comparison above), raw results in
`/tmp/claude-1000/-ramify/plan2a/it3/comparison-results.json` and
`run.log`. Both scripts were run by temporarily copying them into `/ramify`
(required for Node's ESM self-reference/`import.meta` resolution to work
inside this package) and deleting the copy immediately after each run --
verified via `git status` after each (no residue).

R's originals count in this run (89) matches iteration 1's scale-baseline
figure exactly; T's (820 originals / 611 exposures, vs. iteration 1's 808/601)
differs slightly because the toolkit's own source has grown since iteration 1
(new Plan 2A files, including this iteration's own additions) -- expected
drift, not a discrepancy in either probe.

### Fixture-F unit equivalence (checked in)

`available-originals.test.ts`'s "agrees with explainImport for every
combination in a mixed catalog" test builds a small, fully independent
7-original x 4-consumer x 2-area catalog (registry with `ui`/`browser`/
`testing`) and asserts the same listed-must-be-allowed /
absent-must-be-denied property inline, synchronously, as part of the normal
model test suite (no real project needed).

## Enforcement-equivalence handoff for iteration 2

`scripts/reference-harness/plan2a-availability-cases.ts` exports:

```ts
export const plan2aAvailabilityHandlers: ReadonlyMap<string, InstanceHandler> = new Map([
  ['I2A-03:enforcement-equivalence', { kind: 'memory', run: async ({ assertions }) => { ... } }],
]);
```

It runs the real-R/T comparison above (via `sessionReport` over
`examples/collection-review` and the toolkit root), records the full
violation list via `recordObservation('plan2a-availability-equivalence', ...)`,
and asserts zero violations over the real catalogs. It was smoke-run directly
with `tsx` (not through the harness runner) and produces the same 0/0/0/0
violation counts as the temp script above. It is a plain `kind: 'memory'`
handler like `entry-boundary-cases.ts`'s and `completion-cases.ts`'s
`I2-19`/`I2-30` entries -- no new harness capability or fixture kind was
needed. The smoke run (invoking the exported handler directly with a minimal
`Assertions` stand-in, not through the full harness runner) produced: R 557
listed / 1,935 absent, T 3,266 listed / 13,134 absent, all four assertions
passed, 0 violations recorded. T's exact counts drift by a handful between
runs of either script (3,264 vs 3,266 listed) because T is this toolkit's own
source tree, which iteration 3's own edits (and any concurrent iteration 2/4
edits) change between runs; R's counts were stable across every run. This is
expected drift in a self-referential fixture, not a discrepancy between the
temp script and the checked-in case file, which run the identical comparison
logic against whatever real graph exists at run time.

**Not registered.** Per the coordinator's note, iteration 2 owns
`instances.ts`/`plan2a-instances.ts` and the capability ledger
(`plan2aGroupCapabilities['I2A-03'] = 'availability'` already exists there).
To wire it in: import `plan2aAvailabilityHandlers` and merge it into whichever
map `plan2a-instances.ts`/`runtime.ts` assembles for the `I2A-03` group (the
same pattern `plan2a-isolation-cases.ts`'s handlers presumably use for
`I2A-02`), and add an `I2A-03:enforcement-equivalence` seed record (fixture
code `R,T`, evidence kind `session`/`memory` per the leaf table's `A/R,T, api`
column) if `plan2a-instances.ts` requires one per handler key.

## Commands run

- `npx vitest run subs/analysis/subs/model/src/tests/` -- 9 files, 198 tests,
  all passed (includes the 14 new tests plus all pre-existing model tests,
  confirming no regression from the `decisions.ts` refactor).
- `npx tsc --noEmit` (root project, includes all `subs/**/src/**`) -- passed,
  no errors.
- `npx tsc -p tsconfig.portable.json` (covers exactly `analysis/model`,
  `analysis/descriptions`, `presentation/layout`) -- passed, no errors. This
  is the `[browser]` tag's enforcement mechanism (`"types": []`, no Node
  ambient types); `availability.ts` imports only `./interfaces/model.js`,
  `./data.js` and `./decisions.js`, all already portable.
- `npx tsc -p tsconfig.scripts.json` -- **fails**, but only in files owned by
  the parallel iterations 2/4 sessions (untracked/in-progress
  `plan2a-isolation-cases.ts`, and `runner.ts` which iteration 2 is mid-editing
  for the new Plan 2A capability names): `plan2a-isolation-cases.ts(125,...)`
  (`ProjectInventory`/`ProjectInputView` shape mismatches),
  `runner.ts(83,...)` (`Readonly<Record<VerificationCapability,...>>` missing
  the new Plan 2A capability keys), `runner.ts(262,...)` (a `'2a'` plan-id
  literal not yet in a union). None reference my files; confirmed with
  `grep plan2a-availability-cases` on the error output (no match). Re-run
  yourself to see whether it has cleared once those iterations finish.
- `npx tsc -p scripts/reference-harness/tsconfig.json` -- same result/cause
  as above (same tsconfig covers both).
- `npx vitest run subs/analysis/src/tests/evaluate-accesses.test.ts
  subs/presentation/src/tests/layout.test.ts
  subs/presentation/src/tests/model-access.test.ts
  subs/presentation/src/tests/focus-diagram.test.ts
  subs/presentation/src/tests/example1-stages.test.ts
  subs/presentation/src/tests/example2.test.ts
  subs/presentation/src/tests/example3.test.ts
  subs/presentation/src/tests/example4.test.ts
  subs/presentation/src/tests/validate.test.ts` -- the diagram/analysis
  consumers of `explainImport` identified by `grep -rl explainImport` outside
  `analysis/model`; 9 files, 161 tests, all passed (no regression).
- Root `npx tsc --noEmit` also separately surfaced one pre-existing failure
  unrelated to both this iteration and to iterations 2/4's `scripts/`
  changes: `subs/analysis/src/tests/session-test-fixture.ts(107,3)` (a mock
  missing `RetainedSourceAnalysis.details`, iteration 4's new method from its
  own `interfaces/source.ts` extension) -- owned by iteration 4, not touched.

Not run (per the brief): full `npm test`/bare `vitest run`, `npm run build`,
non-dry `reference:report`, full `reference:verify` gates (the `--plan 2a
--iteration <n>` selector does not exist yet).

## Contract deviations

None. The signature, semantics, ordering rule, `module.ramify` line and
handoff all match `contracts.md`'s "Model provider" section and
`owners.md`'s reviewed declaration exactly; no principles-document or
`contracts.md`/`scope.md`/`owners.md` edit was needed.

## Remaining limits

- The real-R/T equivalence evidence lives in a non-registered case file and a
  temp script, not a wired, CI-visible gate; see the handoff above for exactly
  what iteration 2 needs to do to make it one.
- `listAvailableOriginals` was validated against the *current* real R/T
  catalogs at commit time; it is not re-verified continuously (that is what
  wiring `plan2a-availability-cases.ts` into the ledger will provide).
- No path mapping, Markdown rendering or compiler lookup was added to
  `model`, as the iteration's handoff requires; `AvailableOriginal.original`
  is exactly an `OriginalId`, with defining-file/document-path resolution left
  to iteration 5's provider layer.

## Handoff (for iteration 5)

- `listAvailableOriginals(model: Model, consumer: SourceArea):
  readonly AvailableOriginal[]`, exported from
  `subs/analysis/subs/model/src/index.ts` (and thus from the `model` package
  entry once built).
- `AvailableForm = 'value' | 'type-only'` and `AvailableOriginal = { original:
  OriginalId; form: AvailableForm }`, in
  `subs/analysis/subs/model/src/interfaces/model.ts` (carried by the existing
  `expose-src * from "interfaces/model.ts" to parent` wildcard -- no separate
  `module.ramify` line was needed for the types, only for the function).
- Unknown/non-canonical `consumer` throws `TypeError`, matching
  `explainVisibility`/`explainImport`'s existing caller-error convention.
- Join `AvailableOriginal.original.file` against `SourceCatalog.files` (owned
  elsewhere) to resolve the defining-file export and generated document path,
  per scope.md's "Defining names and files" section -- `model` performs no
  such join itself.
