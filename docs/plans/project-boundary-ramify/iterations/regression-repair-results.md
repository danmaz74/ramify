# Regression repair results: observed invalid roots, S1000 acquisition, checkout-free toolkit tests

**Date:** 2026-10-04. **Status:** receipt for a regression-repair slice outside
the numbered iterations, assigned by the coordinator before the Phase 1 final
gate, after [baseline repair 2](baseline-repair-2-results.md) found two Phase 1
regressions and one older toolkit-test defect. Changes are uncommitted in the
working tree and await the coordinator's review. No protected document, harness
file or reviewed instance row changed. `reference:verify -- --plan 1` now
passes 308/308. I2-14 still fails on a later step whose premise iteration 3B
changed; the harness patch that would restore it is proposed, not applied.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit | `5c41f959`, clean at assignment |
| Changed | `subs/analysis/src/session-revision.ts`, `subs/analysis/src/session-engine.ts`, `subs/analysis/subs/project/src/inventory.ts`, `subs/analysis/subs/project/src/ownership.ts`, `src/tests/dependency-diagram-daemon.test.ts`, `src/tests/dependency-view-server.test.ts`, `subs/analysis/src/tests/session-revision.test.ts` |
| Added | `src/tests/checkout-files.ts`, `subs/analysis/subs/project/src/tests/inventory-scaling.test.ts`, this receipt |
| Unchanged | `scripts/reference-harness/`, protected documents, `package.json`, lockfiles, configurations, `ramify-agent/` |
| Node | v22.23.3 |
| Evidence | `/home/app/ramify-pb1-evidence/regression-repair/` (`notes.md` indexes it) |

## Defect 1: an invalid root on an observed update (I2-14)

**Verified cause.** The observer is not at fault. When the root description
loses its marker, `observer.ts` rebuilds through acquisition and returns
`{ kind: 'invalid', inventory: null, issues: [unmarked-root-description] }`, as
`root-selection.test.ts` already asserts. Two session-side defects follow, both
exposed by iteration 3B (`97ac0664`), which moved the marker check into root
selection:

1. `captureInvalidFacts` (`session-revision.ts`) accepted an invalid
   acquisition only with sealed inputs. A root found invalid during selection
   (missing, unmarked, or a symlink) throws before any inventory, so
   `acquireProject` returns `invalid` with `sealedInputs: null`. The function
   threw with that code, and `revise` turned it into an unpublished
   `incomplete` report with acquisition `failed`. This is the reported symptom.
   Before 3B, a root without the marker that still had `invalid declaration` as
   text failed in the inventory parse and was sealed.
2. `#invocationProblem` (`session-engine.ts`). Every resident check passes its
   invocation to `update`. Since 3B a given root without the marker no longer
   resolves (status `invalid`), so the invocation check refused every such
   update as `internal-error` "The invocation does not resolve to a project".
   The case hid this because its `invalid` step was answered by a sweep, which
   has no invocation. Its next synchronized request hit it
   (`i214-probe-after.out`).

**Fix.** (1) `captureInvalidFacts` accepts every `invalid` acquisition and
records `sealedInputs ?? []`, as the cold open and the reopen already do. (2) An
invalid resolution of the session's own opening request (same `cwd`, `root`,
scope and configuration) is not an invocation problem. The update's
acquisition, made with that request, reports it as a batch read does. Any
other request that fails to resolve is still refused.

**Guarding tests** (`subs/analysis/src/tests/session-revision.test.ts`), with
expectations from `contracts.md`, "Root marker" and "Acquisition validity":

- *publishes an unmarked or missing root description as invalid, as a batch
  read reports it, and recovers when the marker returns.* Removing `root`
  publishes the next revision with outcome `invalid`/`failed`/`not-run` and
  exactly one `unmarked-root-description`, category `layout`, with the
  contract's message naming the description. The session report equals the
  batch report and the earlier valid revision's report is unchanged. The
  audit is equal. The unreadable text `invalid declaration` is then published
  through updates that carry the opening invocation, with and without a
  change. Deleting the description gives `missing-root-description`, and
  restoring it recovers the valid outcome on the broad path.
- *Positive control, the 3B sibling path:* a child that gains the marker
  publishes `undeclared-project-boundary` at `subs/sibling/module.ramify`, and
  removing the marker again recovers. This passes before and after.

Each fix was disabled separately by restoring that file's `HEAD` bytes, then
restored and checked by sha256. The first test fails without fix 1
(`i214-test-without-fix1.out`) and without fix 2 (`i214-test-without-fix2.out`).
Both tests pass with both fixes (`i214-test-after-both.out`). The 3B observer
test (gain, loss, restore) is unchanged and passes in the project owner's
directory run.

**I2-14 still fails, on a later step.** With both fixes the `invalid` step
publishes (`i214-probe-after-both.out`). The step "mismatched expected contents
stay a superseded domain value" then gets `unavailable`/`unobserved-input`
"Input was not observed: src/index.ts", not `superseded`. Under the
fast-check contract that is the correct answer: a selection-time invalid
revision observed nothing beneath the root, so the path has no observation in
the covering revision. The case's premise held before 3B, when that text was an
inventory-stage `invalid-description` whose sealed inputs included
`src/index.ts`. Iteration 3A deliberately kept `'invalid declaration\n'`
unmarked ("Nonsensical root texts kept as written"), and 3B's enforcement then
changed what the text means. The baseline-repair-2 receipt says a
contract-following report "would satisfy the case unchanged". That is
falsified here.

Proposed harness patch, **not applied** (`proposed-i214-harness.diff`): write
`'ramify 1\nroot module fixture\ninvalid declaration\n'`, a marked description
with an invalid statement. That restores the row's "invalid description"
premise and changes no assertion. With it applied temporarily, I2-14 passes
(`i214-after-both-proposed-patch.out`). The file was then restored and
`git diff` is clean. Whether the patch alone would pass at `5c41f959` was not
run. With the patch, I2-14 no longer exercises the unmarked-root path, which
the toolkit test above guards.

## Defect 2: S1000 cold open past the acquisition deadline (I5-08)

**Measured cause.** 8B's filters in `inventory.ts` tested every
compiler-selected file with `within` against every pruned root, once for the
unanalyzed set and once for the outside set. S1000 has 1,000 scratch roots and
about 11,000 selected files. Acquisition of the agent's S1000 copy
(`verify-repair/s1000-head`) took 52.4 s. The same filter alone, on the
inventory's 12,000 files, made 24,000,000 `within` calls in 48.5 s
(`s1000-acquire-before.out`). The excluded-root filter (`excludedRoots.some`)
has the same shape, bounded today only by the number of reserved and output
directories met.

**Fix.** `ownership.ts` gains `withinAnyDirectory(directories, path)`, which
looks up each prefix of a normalized project-relative path in a set. Its work
follows the path's depth. `inventory.ts` uses it for both the pruned and the
excluded filters, and the outputs keep their earlier path form. It keeps the
walk's pruned set, not `classifyProjectPath`: a declaration rejected for a
reason other than decoding (child module, overlap, external in `src/`,
always-excluded) stays pruned, as `prunedDirectories` documents, but it is not
in the ownership table. Classifying through the table would therefore start
reading such files as outside-module inputs of an invalid acquisition. The
other sites have no such shape. 8A's walk tests `pruned.has` once per entry.
`references.ts` makes one set lookup per segment. The observer and the
compiler-root filter in `synthetic.ts` call `classifyProjectPath`, which
walks a path's prefixes over the cached ownership index. The warnings, the
pruning and the root filter are unchanged, and so is the deadline.

**Equivalence.** Inventory, captured-input and issue digests are identical
before and after for a fixture with scratch, owned-ignored, external, output and
outside selections (`warn-fixture`), the same fixture with a child-module
declaration problem (`warn-invalid`, invalid), S1000, and a static toolkit
copy (`inventory-digest-*.cmp`, `inventory-digest-tcopy-*.out`).

**Timings** (evidence for a correctness deadline, not a performance target):

| Measurement | Before (`5c41f959` `inventory.ts`) | After |
| --- | --- | --- |
| S1000 batch acquisition | 52.4 s (`s1000-acquire-before.out`) | 7.5 s (`s1000-acquire-after.out`) |
| S1000 cold retained open (`i508-open.mts`) | 57.1 s, `resource-limit` "Acquisition deadline exceeded" (`i508-before.out`) | 24.3 s, opened, passed, complete (`i508-after.out`) |
| Earlier evidence | 51.3 s, 51.4 s at `a8d99307`; 23.5 s at `33d8a739` (`verify-repair/i508-*.out`) | |

**Guarding test** (`subs/analysis/subs/project/src/tests/inventory-scaling.test.ts`,
no timing). (a) With 1,000 scratch directories, `withinAnyDirectory` makes at
most one set lookup per path segment, counted by a `Set` subclass, and its
seven containment answers include near misses. (b) A project with 150 child
modules, each contributing a scratch directory, is acquired with this owner's
`within` counted through a module mock. The result must stay below
modules², 22,500, while the selected scratch file keeps its one warning and is
observed without bytes. Counts: 48,180 before the fix (the test fails), 2,576
after (`scaling-count-*.out`).

## Defect 3: BD24 and BD28 need a Git checkout (I1-28)

**Cause.** Both tests enumerated what to copy with
`git ls-files --cached --others --exclude-standard`. The relocated copy has no
`.git` by design.

**Fix.** `src/tests/checkout-files.ts` lists the same files without Git. It
walks the named paths and applies, at any depth, the ignore rules of this
package's and the example's `.gitignore`: `node_modules` (a directory or a
link), `dist`, `.reference-work`, `.history`, `.playwright-mcp`,
`.cucumber-viz`, `*.viz.feature.meta`, `cucumber-viz.config.local.json`, and
Ramify's generated directories with their transient siblings and marker files.
Symbolic links are listed, never followed. Both tests call it in place of
`git`, and nothing else in them changed.

**Same set in a checkout.** `checkout-files-vs-git.mts` compares the listing
with the original `git ls-files` commands: BD24 has 515 files on each side,
equal, and BD28 has 96, equal, with the example's ignored `.reference-work`
and `node_modules` present on disk. A second comparison added ignored entries
and near-misses under `src/` and `subs/` temporarily (`.ramify/`,
`.ramify.tmp-abc/`, a `.ramify.tmp-abc.marker.json`, `dist/`, a
`node_modules` link, `foo.viz.feature.meta/`, `.ramify-other/` and
`.ramify.tmp`): 517 on each side, equal. The entries were then removed.

**Plain copy.** `plain-copy-1` is a copy of the working tree without the
relocation copy's excluded names, so it has no `.git`. Its `node_modules` is
linked and `dist` copied. With `HEAD`'s two test files both fail ("fatal: not a
git repository"). With the changed files both pass (`bd24-bd28-plain-copy-*.out`).
In the checkout both pass (`bd24-bd28-checkout.out`).

## Commands

All test and verification commands ran with `flock /tmp/ramify-audit-tests.lock`.
The four reference commands ran once each, in order, from `run-all.sh` on a tree
whose `git status` and diff sha256 matched before and after
(`status-*-runs.txt`, `diff-before-runs.sha`), after `npm run build`.

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check` (and the two new files for trailing whitespace) | 0 | clean | `diff-check.out` |
| `npm run type-check` | 0 | passed | `type-check.out` |
| `npm run build` | 0 | built | `build-final.out` |
| `npm run check:self` | 0 | passed, complete; 15 owners, 462 source files, 17 resources, 7094 accesses; 0 errors, 0 warnings, 0 analysis limits; 4958 allowed, 0 denied, 2136 external | `check-self.out` |
| Same check of a `HEAD` tree export | 0 | 460 files, 7066 accesses, 4940 allowed, 2126 external (8B's figures). The difference is the two new files (+3, +25 accesses), `withinAnyDirectory` and `ProjectRequest` (+1 each), and `execFile`/`promisify` replaced by `checkoutFiles` in BD24 and BD28 (−1 each) | `check-count-diff.out` |
| `vitest run subs/analysis/subs/project/src/tests` | 0 | 13 files, 295 tests | `owner-project-tests.out` |
| `vitest run subs/analysis/src/tests` | 0 | 40 files, 465 tests | `owner-analysis-tests.out` |
| `vitest run subs/daemon/subs/contexts/src/tests` | 0 | 13 files, 177 tests | `owner-contexts-tests.out` |
| `vitest run src/tests/resident-cli.test.ts src/tests/resident-assembly.test.ts src/tests/batch-cli.test.ts` | 0 | 3 files, 38 tests | `root-resident-tests.out` |
| `vitest run` BD24 and BD28, checkout | 0 | 2 files, 2 tests | `bd24-bd28-checkout.out` |
| Same, plain copy without `.git` | 0 | 2 files, 2 tests | `bd24-bd28-plain-copy-after.out` |
| Single instances `I5-08:worker-nonblocking`, `I5-08:deadline-exceeded-explicit` | 0 | both passed | `i508-instances-after.out` |
| `reference:verify -- --plan 1 --format json` (23:19–23:36 UTC) | 0 | **308/308**, plan complete; report `plan1-full-8c7130d1…` | `plan1-verify.*`, `plan1-failures.txt` |
| `reference:verify -- --plan 2 --format json` (23:36–23:52) | 1 | 162/174, 12 failed; report `plan2-full-f15d163b…` | `plan2-verify.*`, `plan2-failures.txt` |
| `reference:verify -- --plan 5 --format json` (23:52–00:38) | 1 | 84/103, 19 failed; report `plan5-full-e4894cfa…` | `plan5-verify.*`, `plan5-failures.txt` |
| `npm run reference:cases` (00:38–00:44) | 0 | 37 files, 393 tests | `cases.stdout` |

## Remaining failing instances

**Plan 2 (12 failed).** The summary counts the ten superseded I2-10/I2-11
instances as passed.

| Instance | Classification |
| --- | --- |
| I2-14 `error-preservation` | Stale premise since 3B, at the step "superseded"; harness patch proposed above (decision) |
| I2-29 ×9 | No current resident measurement report (environment), as in baseline repair 2 |
| I2-30 `declarations-final` | `scripts/validate-final-contracts.ts` fails, identically at `33d8a739` (baseline repair 2, item 5) |
| I5-07 `audit-equal-sequence` (nested) | Stale since `ff01212e`, decision needed (baseline repair 2) |

I2-30 `plan1-regression` now passes because the Plan 1 gate passed on the same source.

**Plan 5 (19 failed).** I5-08 ×2 and I5-14 `plan1-regression` now pass.

| Instance | Classification |
| --- | --- |
| I5-01 ×2 | Pinned baseline-engine replay crash, pre-Phase 1 (baseline repair 2, item 6) |
| I5-06 ×3, I5-07 | Stale since `ff01212e`, decisions needed (baseline repair 2) |
| I5-10 `plan2-contexts-regression` | Only I2-14 fails among the retained regression instances |
| I5-10 `plan2-gate-amended` | The nested Plan 2 gate exits 1, from the Plan 2 failures above |
| I5-13 ×9 | No current fast measurement report (environment) |
| I5-14 `declarations-final` | Final-contract validator, as I2-30 |
| I5-14 `plan2-regression` | Names I2-14, I2-29 ×9 and I2-30 `declarations-final` |

## Protected documents

No `.principles.md`, `.spec.md` or `docs/model/glossary.md` file changed, and
none needs to. No `proposed-spec-patches.diff` was written.

## Gaps

- I2-14, and through it I5-10 and I5-14 `plan2-regression`, pass only with the
  proposed harness patch (single-instance evidence). Accepting it needs a full
  Plan 2 and Plan 5 rerun.
- A selection-time invalid revision records no inputs, as the cold open
  already did. So a synchronized request naming the root description itself
  is answered `unobserved-input`, not with the invalid report. Before 3B the
  sealed inventory capture covered it. Sealing the selection's capture would
  change open behaviour as well, so it was left for a decision.
- An invocation that resolves `unavailable` (for example `root-not-found` for a
  found root that lost its marker) is still reported as an invocation failure,
  as before. Unchanged and outside this slice.
- I2-29, I5-13 and Plan 2A were not rerun. Plan 2A was outside this slice's
  required commands.

## Coordinator review

The coordinator reviewed the two session fixes, the path-depth lookup and the
Git-free file listing. No protected document changed. The proposed harness
change to `I2-14` is accepted and applied with this slice: the case now writes
a marked root description with an invalid statement, which keeps its single
intended defect, as iteration 3A's rule for deliberately invalid roots
states; the agent ran the instance alone with it and it passed, and the full
Plan 2 and Plan 5 verifications are rerun at the next gate that includes them.
The unmarked-root path on an observed update is covered by the new toolkit
test. Recording what selection read for a root rejected at selection is left
as it is. The iteration gate runs on the committed candidate.
