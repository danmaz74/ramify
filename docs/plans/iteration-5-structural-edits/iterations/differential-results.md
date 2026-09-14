# Structural edit differential test: results

**Date:** 2026-09-14. **Outcome:** 100 seeded sequences, 600 compared steps,
409 of them on the membership path, all equal to batch after two repairs. The
generator found one divergence, and repairing it uncovered a second. Neither is
specific to the membership path: the broad path diverged identically on the same
tree.

The plan's membership cases fix the shapes they name. This test asks a different
question: over arbitrary create, delete, restore and edit sequences, do the
retirement rule and its fallbacks keep the retained session byte-identical to a
fresh batch run? The generator answers it with seeded sequences, comparing every
published revision with batch after every step.

## What the test is

`subs/analysis/src/tests/membership-differential.test.ts`, two cases over two
fixtures. Each seed opens one session on a fresh copy of the fixture and applies
a sequence of single-file steps. After each step the test compares the published
revision with a fresh `analyzeProject` over the same disk, through the owner's
existing helpers: `equalToBatch` for the whole report, the revision's `inputs`
and `inputId` against the batch snapshot, and `audited` for the retained facts.

Every choice comes from a mulberry32 generator seeded by the sequence number, so
a seed names one sequence and reproduces it exactly. A divergence message prints
the seed, the whole step sequence with the path each step took, the differing
input rows and the single command that repeats that seed.

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `RAMIFY_DIFF_SEEDS` | 1 | Sequences per fixture |
| `RAMIFY_DIFF_SEED_START` | 1 | First seed |
| `RAMIFY_DIFF_STEPS` | 6 | Steps per sequence |
| `RAMIFY_DIFF_REPORT` | unset | Print each step's path and the run's tally |

The default run is two sequences of six steps, about 14 s for the file. A step
costs about a second: it publishes a revision, runs a whole batch analysis and
audits the retained facts against a second recomputation. Six steps is the low
end of the intended 5 to 10, so the default trades sequence count, not length.

## What the generator covers

**Fixtures.** The session fixture of `session-test-fixture.ts` with the absent
and extensionless probes the membership cases use: `consumer.ts` importing an
absent `./later.js`, `bare.ts` re-exporting `./soon`, and an unreferenced file.
The richer fixture adds an owned `src/tests/` file, a directory index with an
extensionless importer, a star re-export, a `.tsx` file, a resolved package
import with its `node_modules` manifest and declaration, and a `*.css` resource
with its declaration shim. Both keep the nested `subs/branch/subs/leaf` and the
independently accessed `subs/sibling`.

**Steps.** Create, delete, restore and a content edit as a control, each
delivered as one local update naming one path.

- **Create** writes a new owned source with up to three imports of live files,
  spelled `./x.js`, extensionless `./x`, or as the directory of an `index` file,
  and sometimes an import of a file that does not exist yet. Each import is a
  side-effect import, a namespace import, a star re-export or a type-only
  namespace import. A later create can pick one of those absent paths, which is
  how a created file satisfies a recorded probe or completes its stem. About one
  file in six is a `.tsx`, and one in seven lands in a new directory.
- **Delete** removes a live owned file, referenced or not, biased so that most
  deletions leave a sibling behind and the rest are the last source of their
  directory. Resources, declaration files and `.tsx` files are eligible.
- **Restore** rewrites a deleted path with its original bytes or with new
  generated contents.
- **Edit** appends an export to a live source, as the positive control that the
  narrow source path still agrees with batch.

## Runs

| Fixture | Seeds | Steps each | Steps compared | Wall time | Divergences |
| --- | ---: | ---: | ---: | ---: | --- |
| session | 50 (1 to 50) | 6 | 300 | 434 s | none after the repairs |
| richer | 50 (1 to 50) | 6 | 300 | 452 s | none after the repairs |

```
RAMIFY_DIFF_REPORT=1 RAMIFY_DIFF_SEEDS=50 RAMIFY_DIFF_STEPS=6 \
  npx vitest run subs/analysis/src/tests/membership-differential.test.ts -t 'on the session fixture'
RAMIFY_DIFF_REPORT=1 RAMIFY_DIFF_SEEDS=50 RAMIFY_DIFF_STEPS=6 \
  npx vitest run subs/analysis/src/tests/membership-differential.test.ts -t 'an owned test area'
```

Both runs were repeated from the same seeds after each repair and produce the
same sequences; the sequences above are the final, passing ones.

## Path coverage

Counted per step from the revision's path, the observer's retirements and, for a
reach refusal, the reach the compiler reported. A run whose every step took the
broad path would prove nothing, so each case also asserts that its run reached
the membership path.

| Path or refusal | session | richer | What produced it |
| --- | ---: | ---: | --- |
| `membership` | 210 | 199 | Creations, restores and deletions the facts and the reach bound |
| `invalid-acquisition` | 41 | 39 | A deletion that left an exposure statement without its file, and every later step until it was restored |
| `source` | 36 | 41 | The content-edit control |
| `refusal:deleted-last-in-directory` | 10 | 5 | The last source of a directory |
| `refusal:deleted-kind` | 2 | 11 | A deleted `.tsx`, resource or shim |
| `refusal:created-kind` | 0 | 2 | A restored declaration file or resource |
| `reach:program` | 0 | 2 | Deleting the sole importer of the package: its declarations left the program |
| `refusal:other-broad` | 1 | 1 | The first valid step after an invalid projection, which is stale |

Not reached by either run: `areas`, `deleted-global`, `deleted-unresolved`,
`unresolved-package`, `reach-unknown`, `global` and `unspelled`. Iteration 4's
hand-written cases cover each of those.

## Divergences

### 1. A deletion that leaves an exposure statement without its file

Found on the session fixture at seed 3, step 4, `delete subs/branch/src/provider.ts`,
and at the same step of the richer fixture. `module.ramify` of `branch` names
`provider.ts` in two `expose-src` statements.

- **Batch.** `exactReferences` reports a `missing-file` issue per statement, the
  acquisition is invalid, and the report fails validation: `inputId` null, an
  empty snapshot, and layout, metadata, descriptions and source-catalog not
  executed.
- **The session.** The observer's local update recomputed the references but
  discarded their issues by design, so the project stayed valid. The missing
  target surfaced later, at description linking, as `missing-file` diagnostics
  with different messages and identities, beside a full snapshot, an `inputId`
  and executed stages.
- **Not membership-specific.** The same tree delivered as an unknown event takes
  the broad path and diverged identically, so no fallback could repair it.
- **Repair.** `subs/analysis/subs/project/src/observer.ts`: a local update whose
  recomputed references carry issues returns `{ kind: 'invalid', inventory: null,
  issues }`, the route its invalid-description branch already takes. The session
  marks itself stale, publishes the batch's invalid envelope through
  `captureInvalidFacts`, and the next update rebuilds. 80 of the 600 steps ran
  against an invalid projection and two of them restored the file and recovered;
  the regression case below asserts that recovery directly.
- **Test.** `observer.test.ts` recorded the previous behavior; that case is now
  `rejects a local update whose exposure target lost its exact file, as the
  acquisition does`.

### 2. The parse stage of an invalid projection

Uncovered by the first repair. The session marked the parse stage invalid
whenever an invalid acquisition carried any description diagnostic; the batch run
marks it invalid only where a description failed to parse, and otherwise leaves
parse blocked by the acquisition. A validated layout that lost an exposure target
has description diagnostics and no parse failure, so the two stage tables
differed while every diagnostic agreed.

- **Repair.** `InvalidAcquisition` gained `parseInvalid`, set from the
  acquisition's own issues by `parseRefused` (an `invalid-description` issue) at
  the three places that build invalid facts, and `driveReport` uses it in place
  of the diagnostic category.
- **Test.** `session-revision.test.ts`, `invalid-exposure-target-equals-batch:
  deleting a source an exposure statement names publishes the batch validation
  report, and restoring it recovers`. It asserts the diagnostics, the blocked
  parse stage, batch equality, the audit and the recovery.

### 3. An invalid revision keeps its own inputs (no defect)

The differential first compared the revision's `inputs` and `inputId` with the
batch snapshot on every step. For an invalid projection batch publishes neither:
`inputId` is null and the snapshot inputs are empty, while the session revision
still carries the capture it observed, as
`publishes invalid current inputs without stale results` requires. The reports
agree. The test now compares the two input lists for a valid projection and
requires a non-empty one for an invalid projection.

## Remaining gaps

Shapes these sequences cannot produce. Each is covered, where it is covered, by
iteration 4's hand-written cases.

- No configuration, description or README edit, no module added or removed, and
  no rename or move: a rename reaches the session as an unrelated delete and
  create, never as one update.
- One path per update. No update carries several created or deleted files, and
  no sweep, cancellation or compiler release interleaves with a step.
- Created files are always `.ts` or `.tsx` with relative imports. The generator
  never creates a declaration file, a script, an ambient module, a triple-slash
  reference or a package import, so `global` and `reach-unknown` never arise and
  `created-kind` arises only from a restore.
- Neither fixture has an unresolved package access, so `unresolved-package` and
  `deleted-unresolved` never arise, and neither configures `baseUrl`, `rootDirs`
  or `paths`, so `unspelled` never arises.
- The session fixture has no `src/tests/`, and the richer one has it from the
  start, so no step makes a testing area appear or disappear: the `areas`
  refusal is not reached.
- No `.jsx`, `.js`, `.mjs` or `.cts` file and no JSX syntax; no symlink,
  case-mismatched reference, non-UTF-8 description or file outside a module.
- Two small fixtures only. No reference example or S100 tree, and no timing
  claim: the test compares results, never latency.

## Commands

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/src/tests/membership-differential.test.ts` | 2 tests passed, 14 s, at the defaults |
| The two 50-seed runs above | 1 test passed each, 434 s and 452 s, 600 steps compared |
| `npx vitest run subs/analysis/src/tests subs/analysis/subs/project/src/tests subs/analysis/subs/typescript/src/tests subs/analysis/subs/descriptions/src/tests subs/analysis/subs/model/src/tests` | 49 files, 911 tests passed |
| `npx vitest run subs/daemon` | 23 files, 255 tests passed |
| `npx vitest run subs/cli subs/presentation src/tests` | The filter matched every owner's tests: 102 files, 1,566 tests passed |
| `npm run type-check` | pass, including the portable, scripts and reference-harness projects |
| `npm run build` | pass |
| `npm run check:self` | completed, passed, complete coverage: 11 owners, 284 source files, 3,813 accesses, 0 errors, 0 warnings, 0 analysis limits. The daemon it started was stopped with `dist/src/ramify daemon stop` |
| `git diff --check` | clean |

Not run: `npm test`, `npm run reference:cases` and the measurement scripts. The
Plan 2 reference subcase `I2-09:invalid-description` describes the description
edit that names a missing file; it still expects an invalid revision with a
located `missing-file`, which both repairs preserve, but it was not executed
here.

## Audit

The cucumber-viz commit audit of `81a7d18`, with `use_existing_head`, passed in
3 min 15 s: worktree dependencies, type-check and the Vitest regression suite.
Evidence: `refs/audited/runs/2026-09-14T05-59-54Z-81a7d18`. This section is a
docs-only follow-up.
