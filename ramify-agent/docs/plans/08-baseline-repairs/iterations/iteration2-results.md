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
$ npx vitest run --config scripts/reference-harness/vitest.config.ts final-contracts
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

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

## Left undone, with reasons

- **AV29's `metrics` expectation.** Recorded above: pre-existing, and outside
  the frozen-gate scope of this iteration.
- **A pre-existing red record, not iteration 2's.**
  `completion-regression.test.ts` and `completion-composition.test.ts` were
  already failing at the iteration base commit `b77b6f6`, both at
  `assert.deepEqual(report.evidence.instances, plan1Instances, …)`. Ramify Plan
  8's `ff01212` restated the `I1-09` record texts in `cases.ts`, so the archived
  `plan1-complete.json.gz` no longer matches the current inventory. Repairing it
  means adding `I1-09` to the `revised` set and moving the 305 unaffected-record
  literal, which several archived counts depend on. That is a separate named
  revision and is not part of KI-2 or KI-3. Verified by running both files at
  `b77b6f6`: the same assertion fails. With that one assertion temporarily
  neutralised, the control fixture reaches and passes every new assertion this
  iteration added, so the revisions themselves are correct.
- **`I2-30:self-check-eleven` and `I5-14:self-check-eleven` keep their names.**
  Their handlers call `assertToolkit`, which `1bbd588` already changed to
  "exact fifteen implemented owners", so what they verify is correct. Only the
  instance id and the required-result prose in `plan2-instances.ts` and
  `plan5-instances.ts` still say eleven, and those are reviewed inventory
  tables that archived evidence records by id. Renaming them is a reviewed
  change to a frozen inventory, not a layer, so iteration 2 leaves them and
  names them here for iteration 6.
- **The four owners are Plan 6's, not Plans 2B, 2C or 8's.** The plan's
  iteration 2 text expects the owners and selections to come from Plans 2B, 2C,
  8 and the capability plan. The selections do; the owners do not. They arrived
  with Plan 6 in `d5c2498`, which is why the gate has reported them since
  2026-09-16.

## Acceptance

| ID | Result |
| --- | --- |
| BR03 | Met. The gate exits 0, the archived reviews and reviewed tables are byte-unchanged, and every addition is a named layer. |
| BR04 | Met. A string export target is resolved under both conditions, read as a file and never imported, proved by a fixture whose stylesheet would throw on import. |
