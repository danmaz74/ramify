# Iteration 2 results: reviewed additions to the frozen gates

**Date:** 2026-09-22. **Branch:** `feat/plan8-baseline-i2`.
**Owners:** `scripts/validate-final-contracts.ts`, `scripts/reference-harness/`.

The final-contract gate exits 0 again. Every change since the archived reviews
is now a named layer that records the plan which reviewed it. No archived
review document, no reviewed table and no assertion inventory was edited in
place, and `scripts/reference-harness/relocation.ts`, whose form iteration 2
copies, is untouched.

## What the gate found

`npx tsx scripts/validate-final-contracts.ts` reported nine errors at the
iteration base: seven owners whose selections differ from the archived review,
the package exports, and the owner set itself. Two causes stand apart.

- **KI-2, package entries.** The manifest holds ten export keys, and
  `./module-tree.css` is a string target the gate could neither type nor probe.
- **KI-3, declaration drift.** The archived reviews describe eleven owners and
  453 selections. The project holds fifteen owners and 797 selections, so 344
  net selections and four owners arrived after the last review.

## Owners the layer adds, and the plan each is named after

All four owners entered the tree in `d5c2498` (2026-09-16), the commit KI-3
names as the start of the drift. Ramify **Plan 6 (project explorer)** reviewed
their headers: its
[contracts](../../../../../docs/plans/iteration-6-project-explorer/contracts.md#module-declarations-and-exposure-paths)
records all four under "Module declarations and exposure paths". Plan 6A, which
shipped in the same commit, states that it needs no new module.

| Owner | Directory | Plan that reviewed it |
| --- | --- | --- |
| `project-view` | `subs/presentation/subs/project-view/` | Plan 6 (project explorer) |
| `explorer` | `subs/explorer/` | Plan 6 (project explorer) |
| `service-api` | `subs/service-api/` | Plan 6 (project explorer) |
| `integration-tests` | `subs/integration-tests/` | Plan 6 (project explorer) |

`addedOwners` in `scripts/validate-final-contracts.ts` records each one's
header and its README purpose paragraph. `reviewedOwners` still expands the
archived reviews alone and still returns exactly eleven; the new
`layeredOwners` applies the layers over that untouched map and returns fifteen.

## Selection layers, by the plan that reviewed them

Each selection was attributed by replaying every `module.ramify` version from
`d5c2498` to `HEAD` and recording the first version that holds it. No selection
was left unattributed.

| Layer | Net selections | Owners it reaches |
| --- | ---: | --- |
| Plan 6 (project explorer) | 91 | root, `presentation`, `daemon`, `explorer`, `service-api`, `project-view` |
| Plan 6B (resident explorer server) | 12 | root, `cli`, `service-api` |
| Plan 6C (module tree view) | 17 | root, `presentation`, `project-view` |
| Plan 6D (behavioral dependency diagram) | 69 | root, `analysis`, `typescript`, `presentation`, `daemon`, `service-api`, `project-view` |
| Plan 2B (generated views) | 25 | root, `analysis` |
| Plan 2C (module measurements) | 14 | root, `analysis` |
| Plan 8 (signature companions) | 110 added, 1 statement withdrawn | root, `analysis`, `model`, `typescript`, `presentation`, `daemon`, `explorer`, `service-api`, `project-view` |
| The module-tree canvas entry | 8 | `presentation`, `project-view` |

The withdrawal is Ramify Plan 8's: `43b6bb9` narrowed a signature and dropped
`expose-src planApiViewRequests, projectApiView from "api-view.ts" to parent`
from `analysis`. The layer records it as a withdrawal named after that plan,
because a reviewed selection that simply disappears is not an addition.

The last row is the layer for the canvas entry, reviewed in `56b0c38` and
`26bba1e`. Its values come from the capability plan's package-surface table at
[`initial-hypothesis-vs-implemented-module-tree.proposal.md`](../../03-autonomous-implementation-loop/initial-hypothesis-vs-implemented-module-tree.proposal.md).
The toolkit never names this project, so the constants in Ramify's own script
cite the toolkit-side records instead: `module-tree-consumer.ts`, which already
holds both entry targets, and `scripts/reference-harness/README.md`.

`expectedManifest` applies the layers as atomic selections. A layer that
restates a selection the archived declaration already holds, or withdraws one
it does not hold, is itself an error, so a layer cannot conceal archived drift.

## The `PackageMetadata` widening (KI-2, BR04)

`PackageMetadata.exports` now admits `EntryPair | string`. `ExpectedPackage`
narrows its own `exports` back to the reviewed pairs, so the reviewed eight
stay a pair map and `validatePackageEntries` still returns 8; the existing
`[11, 8]` shape is preserved on its package half.

`reviewedAdditions` names exactly `./module-tree` and `./module-tree.css`, with
the targets the package surface reviewed. `validatePackageEntries` now verifies
that

- the reviewed eight are all present and each value is unchanged,
- the only other keys are the recorded additions, each with its recorded value,
- every target, reviewed or added, is a file on disk, and
- a string target is resolved under both the `import` and the `types`
  condition, read with `statSync`, and never imported.

The probe skips `await import` for a string target, because Node cannot
evaluate a stylesheet. `final-contracts.test.ts` proves the rule: the fixture's
stylesheet holds `throw new Error("stylesheet was imported")`, the gate still
returns 8, and removing the file fails with `ENOENT`. An unrecorded extra key
fails with `Final package exports beyond the reviewed entries`.

Export key order was never a contract: the previous check compared the two
maps with `assert.deepEqual`, which ignores key order. The layered check
compares sorted key lists, so `./cli` and `./layout` having swapped places
since the review is still accepted, as it always was.

## Gates that received the relocation form

`relocation.ts` keeps nine entry functions, a `stylesheetEntries` list and
separate assertions for entry imports and stylesheet files. That form was
copied, not moved, into:

- `plan5-completion-cases.ts` — the reviewed entry map, the recorded additions
  and a check that each stylesheet addition is a string target.
- `plan2a-completion-cases.ts` — the same three assertions over the repository
  manifest, replacing the single "exactly eight package export entries".
- `plan2b-cases.ts` — `equalToBaseline` now means that the reviewed entries
  equal the `577b980` baseline and the remaining keys are exactly the recorded
  additions. `EntryEvidence.manifest` also reports `additions` and
  `stylesheetAdditions`.
- `plan2b.test.ts` — `equalToBaseline` still asserts `true`, and the additions
  and the stylesheet addition are asserted by name.

`completion-cases.ts` and `plan5-completion-cases.ts` also carried
`[value.owners, value.packageEntries] === [11, 8]` for the final-contract
process. The validator reports the inventory's owner count, which is fifteen,
so both now assert `[15, 8]`, as does the same assertion in
`plan2a-completion-cases.ts`. The reviewed package count stays 8.

## The Plan 1 regression record

`completion-regression.ts` looked for the assertion "all eight actual package
entry imports executed" and an eight-entry observation. `relocation.ts` renamed
that assertion to "every actual package entry import executed" and added the
canvas entry, so the record failed whatever the package gate did. The same
record pinned eleven owner ids, which Plan 6 carried to fifteen.

Both are recorded as named revisions beside the archived tables, which stay
exactly as Plan 1 wrote them:

- `revisedAssertionNames` pairs each archived assertion name with its revision
  and the plan that reviewed it.
- `revisedOwners` adds Plan 6's four owner ids to the archived eleven.
- `revisedEntries()` inserts the canvas entry after `ramify.ts/presentation`,
  where the installed manifest resolves it.
- `revisedStylesheets` records `ramify.ts/module-tree.css`, and the record now
  also requires the relocation gate's stylesheet assertion and its
  `relocation-installed-stylesheets` observation.

`completion-regression-controls.ts` received the matching rewrite: the control
fixture restates the revised names, the fifteen owner ids, the entry order with
the canvas entry inserted and the client entry appended, and the new stylesheet
observation. `completion-composition.test.ts` carries the same rewrite, because
`assertPlan1Composition` verifies the same record.

### The restated `I1-09` definition, and the counts it moved

Reviewed and approved after the first pass, and repaired here as its own named
revision, distinct from KI-2 and KI-3.

`assertPlan1Regression` requires a report's `evidence.instances` to equal the
current inventory, and then requires every record a later plan did not revise
to stay byte-identical to the archived definitions in
`evidence/plan1-complete.json.gz`. Ramify Plan 8's `ff01212` restated one
record's text when the reference example declared its signatures. Comparing
the archive with the inventory shows exactly one record differing:
**`I1-09:signature-only-type`**, in its expectation summary and its variant
details. All 307 others are identical, and the id order is unchanged.

The revision is named, not loosened, and the archive is untouched:

- `restatedByPlan8` names that one record and cites `ff01212`.
- `revisedDefinitions` is the union of Plan 2's three expectation revisions and
  that restatement; `unaffected` filters by the union.
- `unchangedRecordCount` is the single source for the byte-identity count,
  exported so no reader can hold a different number.
- `readPlan1Regression` and `readPlan1Composition` now return
  `restatedRecords` beside `revisedExpectationRecords`, so a receipt says which
  records were revised and why, rather than only how many were not.

The control fixtures carry the current inventory as their `evidence.instances`,
which is what a real run records; the archived definitions stay the comparison
basis. Nothing is neutralised or skipped.

**Archived counts moved from 305 to 304, each named:**

| Place | Why |
| --- | --- |
| `completion-regression.ts` — the equality, the failure message and the doc comment | 308 records less four revisions, not three |
| `completion-regression.ts` — `unchangedRecords` in the receipt | Same count, now from the exported constant |
| `completion-composition.ts` — `unchangedRecords` in the composed receipt | Same count, now from the same constant |
| `completion-cases.ts` — `I2-30:plan1-regression`'s "all unaffected Plan 1 definitions preserved" | Asserts the receipt's count |
| `completion-regression-controls.ts` — the `305 frozen definitions` control label | Names what the control proves |
| `plan2-instances.ts` and `subcases.md` — `I2-30:plan1-regression`'s required result | The executable record and its reviewed row must agree byte for byte; the row also carried the stale eleven-owner and eight-entry literals |
| `scripts/reference-harness/README.md` | Describes what the handler requires today |
| `docs/development/resident-verification.md` | Same |

Two mentions of 305 were deliberately left: the Plan 2 migration narrative in
`subcases.md` and `main-plan.md`, and the Plan 2 iteration 14 records. Both
state what was true of Plan 2's own migration, and rewriting them would
misreport history rather than correct a rule.

## The renamed `self-check-eleven` instances

Reviewed and approved after the first pass as a change to a frozen inventory,
not a layer. `I2-30:self-check-eleven` and `I5-14:self-check-eleven` both run
`check:self` through `assertToolkit`, which has required "exact fifteen
implemented owners" since `1bbd588`. Only their ids and required results still
said eleven. Both are now `self-check-fifteen`, with "Fifteen owners" in their
required results.

Renamed together, because an executable record and its reviewed row are
compared byte for byte:

| File | Change |
| --- | --- |
| `docs/plans/done/iteration-2-resident-verification/subcases.md` | The `I2-30` leaf row: id and required result |
| `docs/plans/done/iteration-2-resident-verification/main-plan.md` | The `I2-30` matrix row's backticked subcase name |
| `scripts/reference-harness/plan2-instances.ts` | The executable record |
| `scripts/reference-harness/completion-cases.ts` | The handler id |
| `docs/plans/iteration-5-fast-incremental-checks/subcases.md` | The `I5-14` leaf row |
| `docs/plans/iteration-5-fast-incremental-checks/main-plan.md` | The `I5-14` matrix row |
| `scripts/reference-harness/plan5-instances.ts` | The executable record |
| `scripts/reference-harness/plan5-completion-cases.ts` | The handler id and its isolated-project instance id |

**There is no earlier instance rename in this harness.** `supersessions`
(`plan.ts`) records an instance another one replaces, which is a different
thing: a superseded instance stops executing. Nothing else maps an id across a
change. The mapping is therefore recorded explicitly, as `renamedInstances` in
`scripts/reference-harness/instances.ts`:

```text
I2-30:self-check-eleven  -> I2-30:self-check-fifteen
I5-14:self-check-eleven  -> I5-14:self-check-fifteen
```

Its comment states why each was renamed and which archived artifacts keep the
old id: the acceptance JSON under
`docs/plans/done/iteration-2-resident-verification/evidence/`. No harness code
reads those files, so nothing resolves an old id at run time; the table is what
a reader follows. `plan2.test.ts` and `plan5.test.ts` each gained a test that
the new id is in the inventory and the runtime, the old id is in neither, and
the rename table names the pair.

The Plan 3 documents were left alone. `docs/plans/iteration-3-project-inspection`
carries its own `I3-14:self-check-eleven`, and `I2A-13:plan3-preserved` requires
that tree to equal Git tree `71643d5` byte for byte.

## Verification

Run from `/tmp/ramify-plan8-i2` after `npm install` and `npm run build`, which
the plan's precondition requires.

```console
$ npx tsx scripts/validate-final-contracts.ts
{"owners":15,"files":454,"expandedStatements":163,"packageEntries":8,"bin":"dist/src/ramify"}
$ echo $?
0
```

```console
$ npx vitest run --config scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan2b.test.ts
 ❯ scripts/reference-harness/plan2b.test.ts (6 tests | 1 failed) 111898ms
     × materializes the reference project and the toolkit, matches the expectation, writes nothing on a repeat and stops its daemons

 FAIL  Plan 2B real runs (AV29, AV31) > materializes the reference project ...
AssertionError: reference: expected { …(11) } to match object { …(8) }
-   "metrics": "unavailable",
+   "metrics": "measured",

 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
   Duration  112.70s
```

AV34, the entry case this iteration rewrote, passes. The one failure is AV29
and predates this iteration: the same test fails identically at the base commit
`b77b6f6`, where the architect view reports `metrics: measured` and the test
still expects `unavailable`. Verified by running that test alone on the stashed
tree (72.00 s, same assertion, same two lines). It belongs to Ramify Plan 2C's
measurements, not to the frozen gates.

```console
$ npm run type-check
> tsc --noEmit && tsc -p tsconfig.portable.json && tsc -p tsconfig.scripts.json && tsc -p scripts/reference-harness/tsconfig.json
(no output; exit 0)
```

```console
$ npx vitest run --config scripts/reference-harness/vitest.config.ts \
    completion.test plan5-completion.test completion-regression.test \
    completion-composition.test final-contracts.test instances.test verify.test
 Test Files  7 passed (7)
      Tests  46 passed (46)
   Duration  47.88s
```

`completion-regression.test.ts` and `completion-composition.test.ts` pass with
nothing neutralised.

```console
$ npx vitest run --config scripts/reference-harness/vitest.config.ts plan5.test
 Test Files  1 passed (1)
      Tests  10 passed (10)

$ npx vitest run --config scripts/reference-harness/vitest.config.ts plan2.test
 Test Files  1 failed (1)
      Tests  3 failed | 8 passed (11)
```

The three `plan2.test.ts` failures are pre-existing and are described below.
The rename test added in the same file passes.

`plan2b.test.ts` needs the harness's own Vitest configuration; the repository
configuration includes only `src/tests/` and `subs/**`.

## Completion suites not run

The suites under `npm run reference:verify -- --plan N` are long real-process
runs and were not run here. Iteration 6 covers them. On reading, the cases that
failed only on the package entries or the KI-3 drift should now pass:

| Suite | Expectation | Reason |
| --- | --- | --- |
| Plan 1 | Still failing | Its regression record is repaired, but `assertPlan1Regression` compares the archived record definitions with the current inventory, and those differ for an unrelated reason recorded below. |
| Plan 2 | `I2-30:declarations-final` passes | The gate exits 0 and the assertion now reads `[15, 8]`. `I2-30:self-check-eleven` needs iteration 1's analysis-limit work. |
| Plan 2A | `I2A-13:declarations-package` passes | Same gate, plus the reviewed entries and the recorded additions. `I2A-13:predecessor-regressions` still depends on the Plan 1 record below. |
| Plan 5 | `I5-14:declarations-final` and `I5-14:package-entries` pass | Same gate and the relocation form. `I5-14:self-check-eleven` needs iteration 1. |

## Still red, and none of it this plan's doing

Each was confirmed by running the same file on the tree as it stood before
this iteration's changes.

- **AV29's `metrics` expectation** in `plan2b.test.ts`. The architect view
  reports `metrics: measured` and the test still expects `unavailable`. It
  fails identically at the base commit `b77b6f6`, in 72.00 s, on the same two
  lines. Restated here so iteration 6 does not read it as this plan's doing.
  It belongs with Ramify Plan 2C's measurements.
- **Three `plan2.test.ts` failures**, all from `14c5c2a`
  ("chore(measurements): 40-cycle repeated-edit plateau instead of 200"). That
  commit changed `I2-29:repeated-edit-plateau` in `plan2-instances.ts` to 40
  cycles and last-30 growth, and changed Plan 3's documents, but left Plan 2's
  `subcases.md` row saying 200 cycles and last-100. So
  `validateInstanceRecords` reports `Instance differs from reviewed metadata:
  I2-29:repeated-edit-plateau`, and the two Plan 2 iteration-2 execution tests
  fail behind it. The same commit is also why
  `git diff --quiet 71643d5 -- docs/plans/iteration-3-project-inspection` exits
  1, which is what `I2A-13:plan3-preserved` asserts. One reviewed-row
  correction repairs all four, but it is a measurement decision, not a frozen
  gate, so iteration 2 leaves it and names it here.

## A note on attribution

**The four owners are Plan 6's, not Plans 2B, 2C or 8's.** The plan's
iteration 2 text expects the owners and selections to come from Plans 2B, 2C,
8 and the capability plan. The selections do; the owners do not. They arrived
with Plan 6 in `d5c2498`, which is why the gate has reported them since
2026-09-16.

## Acceptance

| ID | Result |
| --- | --- |
| BR03 | Met. The gate exits 0, the archived reviews and reviewed tables are byte-unchanged, and every addition is a named layer. |
| BR04 | Met. A string export target is resolved under both conditions, read as a file and never imported, proved by a fixture whose stylesheet would throw on import. |

Beyond BR03 and BR04, and reviewed separately: the Plan 1 regression record now
passes with nothing neutralised, and the two `self-check-eleven` instances are
renamed with their mapping recorded.
