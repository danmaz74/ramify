# Baseline repair 2 results: stale reference-verification expectations

**Date:** 2026-10-03. **Status:** receipt for a baseline-repair slice outside
the numbered iterations, assigned by the coordinator before the Phase 1 final
gate. Changes are uncommitted in the working tree and await the coordinator's
review. The slice repairs reference-harness expectations that earlier plans
left stale; it changes no runtime source, no protected document and no
reviewed instance row. It closes Plan 1's three stale-expectation classes, but
`reference:verify -- --plan 1` still fails on one instance, a toolkit-test
defect outside this slice's write scope. Plans 2, 5 and 2A were run for the
first time in this phase and fail for the reasons classified below.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit | `a8d99307`, clean at assignment (`head.txt`) |
| Comparison checkout | `/home/app/ramify-pb1-evidence/verify-origin/base` at `33d8a739` (pre-Phase 1), built |
| Write scope used | nine files under `scripts/reference-harness/`, plus this receipt |
| Unchanged | runtime source, `package.json`, lockfiles, configurations, protected documents, every `plan*-instances.ts` row, archived plans |
| Node | v22.23.3 |
| Evidence | `/home/app/ramify-pb1-evidence/verify-repair/` |

## Plan 1 classes

### A: fixture F's signature note (30 instances)

**Cause.** Plan 8 iteration 3 (`bd337e1a`, 2026-09-21) records an inferred
signature for every exported original and reports it as a nonblocking
coverage note for an exposed one ("A Declared Signature Names Its
Companions", TypeScript Source Interpretation Specification). Fixture F's
frozen recipe exposes `export const value = 1;` at
`subs/provider/src/interfaces/api.ts:1`: no type annotation and no directly
assigned callable, so its type is inferred. Every other exposed F original is
an interface with a typed member, an empty class, or a function with a
declared return type, and `privateValue` is unexposed. So an unchanged F has
exactly one note, coverage `partial` and check `passed`. The shared `clean()`
baseline expected complete coverage and no notes. **Verdict:** stale
expectation. The user decided on 2026-10-03 that Phase 1 keeps this rule.

**Changes.**

- `session-expectations.ts`: `clean(report, assertions, notes = [])` takes the
  fixture's expected notes. With none it is unchanged in strength (complete
  coverage, `coverage` keyed to `[]`); with notes it expects `partial` and
  exactly those notes, keyed by code, file, line and named original
  (`signatureNoteKey`, reused from `fixtures/plan2/project.ts`), with no
  diagnostic and no denial.
- `session-cases.ts`, `cli-cases.ts`: the F baselines pass
  `[providerValueNote]`; R baselines pass nothing.
- `gate-cases.ts`: the testing-module fixture's baseline is F before the
  testing owner is added, so it passes `[providerValueNote]`.
- `session-lifecycle.ts`, `I1-29:changed-input/once` (first run since Plan 8):
  the stable retry's outcome expects coverage `partial`, and a new assertion
  expects exactly `[providerValueNote]`. The appended `changed1` is unexposed,
  so it adds no note, and `value` stays on line 1.

Every other later assertion of the 30 instances passed once its baseline did.

### B: the packed command (1 instance, `I1-28:relocated-package`)

**Cause.** Release 0.1.0 (`42f3e54e`, 2026-09-28) added
`"!dist/src/ramify-client-*"` to `files`; its message and the README say the
package carries no Bun client and the launcher runs the Node entry. The
launcher (`src/ramify`) execs the host client only if it is executable, else
`node cli-entry.js`. `assertCommandFiles` still required the client in the
installed package. **Verdict:** stale expectation.

**Change** (`relocation.ts`). The relocated build tree keeps asserting all
three command files, including the compiled client it builds. The installed
package now asserts that the launcher and the Node entry are executable and
that `dist/src` contains no `ramify-client-*` entry. The installed reference
checks after it (JSON, implicit-root human output, denial and restore) run
that launcher through its Node entry. All 16 installed-command assertions
passed.

**Remaining failure.** With the baseline unblocked, the relocated toolkit
regression (`npm test` in the copy, the handler's required step, first reached
since 0.1.0) exits 1: 2,642 of 2,644 tests pass. Two tests call
`git ls-files` to copy the toolkit, and the relocated copy deliberately has no
`.git` (`prepareRelocatedPackage` asserts this):
`src/tests/dependency-diagram-daemon.test.ts` (BD24, added `27184cc8`,
2026-09-17) and `src/tests/dependency-view-server.test.ts` (BD28, `da371aa5`,
2026-09-17). Phase 1 (`ee9e295b`) only added `restoreOwnedIgnored` beside the
copy. **Verdict:** toolkit-test portability defect predating Phase 1, outside
the write scope; not changed. The instance's mutate and run phases have not
run since 0.1.0.

### C: the toolkit build's emitted set (1 instance, `I1-30:production-selection/toolkit`)

**Cause.** `d5c24982` (2026-09-16) made `npm run build` also run the explorer's
Vite build into `dist/explorer`, and added
`subs/presentation/subs/project-view/src/styles.d.ts`, an ambient
`declare module '*.css';`, without updating the expectation. **Verdict:**
stale expectation.

**Rule applied.** The compiler never emits a declaration input.
`promoteProductionArtifacts` copies one into `dist` only when a declared package
type reaches it by relative import or reference. A file holding only an
ambient wildcard module declaration is named by no specifier and no reference
(`rg` finds none), so it is selected, as compiler input, and never emitted.

**Change** (`gate-cases.ts`). A new assertion names the selection's
declaration inputs exactly (`[styles.d.ts]`), so a future selected declaration
input fails it and must be reasoned about. Declaration inputs are excluded
from the expected emitted set. The rest of `dist` must equal the selected
outputs plus `runtime-identity.json` and the host client, as before. The
explorer outputs must be exactly `explorer/index.html`,
`explorer/favicon.svg` (from `subs/explorer/public`), and one
`explorer/assets/index-<hash>.css` and one `explorer/assets/index-<hash>.js`,
with `<hash>` eight characters of `[A-Za-z0-9_-]`. The later assertions,
first run since `d5c24982` (test discovery after build, whole type-check, the
reference selection), passed.

## Plans 2, 5 and 2A

Each failure is classified by running the same instance, or reproducing it,
at `33d8a739`, or by bisecting. "Stale" means an expectation an earlier plan
left behind; these were repaired where the expected value follows from a
reviewed source.

| Instances | Classification | Evidence | Action |
| --- | --- | --- | --- |
| I2-09 `config-change`, `missing-file-appears` | Stale (`bd337e1a`): F's `value` note after restore | fail at base (`base-plan2-subset.out`) | repaired |
| I2-30 `package-entries`, `relocated-resident`; I5-14 `package-entries-unchanged` | Stale (`26bba1e2`, 2026-09-21): `completionEntries` lacks the reviewed addition `./module-tree` (`ModuleTreeCanvas`) | the reviewed addition is in `validate-final-contracts.ts` and Plan 1's relocation entries | repaired |
| I5-01 `namespace-lazy-equal`, `decide-indexed-equal` | Stale (`ff01212e`, Plan 8 iteration 7): R pinned at 313 accesses. The next assertion then fails because the pinned baseline engine's replay crashes on the current tree | both steps fail identically at base, the second with only the 313 change applied (`base-i501-313.out`) | count repaired; replay crash reported (item 6) |
| I2-14 `error-preservation`; I5-10 via nested Plan 2 | **Phase 1 regression** (`97ac0664`, iteration 3B) | passes at base | reported |
| I5-08 `worker-nonblocking`, `deadline-exceeded-explicit` | **Phase 1 regression** (`a8d99307`, iteration 8B) | bisected | reported |
| I2A-13 `self-reference-checks` | Runtime defect predating Phase 1 | reproduced at base | reported |
| I5-06 `import-added-self-only`, `export-removed-missing`, `wide-fanin-bounded`; I5-07 `audit-equal-sequence` | Stale (`ff01212e`), not mechanically repairable | fail identically at base | decision needed |
| I2-30, I5-14 `declarations-final`; I2A-13 `declarations-package` | `scripts/validate-final-contracts.ts` fails, outside scope | identical output at base | reported |
| I2A-13 `plan3-preserved` | `3fba41bd` (2026-10-01) renamed links in the Plan 3 tree; not a recorded decision | in base history | decision needed |
| I2-30, I5-14, I2A-13 Plan 1 regressions | need a passing full Plan 1 gate on the same source | follow I1-28 | none |
| I2-29 ×9, I5-13 ×9, I2A-12 ×6 | missing current measurement reports | environment | not run |
| I2A-12 `linux-macos-bytes` | no macOS counterpart report | recorded platform gap | none |

### Reported defects, with evidence

1. **I2-14, Phase 1 regression.** The case replaces the root `module.ramify`
   with `invalid declaration` under a live context and expects a published
   `invalid` report. The resident update now reports execution `incomplete`,
   unpublished, with `unmarked-root-description` and acquisition `failed`.
   The contract says otherwise: `contracts.md`, "Acquisition validity",
   defines that case as acquisition `invalid` with
   `unmarked-root-description`, "which also covers a change between selection
   and reading". The batch path follows it (`read-project.ts` `invalidCodes`),
   but the observer's local update maps every `AcquisitionError` to
   `incomplete` (`observer.ts` `#incomplete`). A report that followed the
   contract would satisfy the case unchanged. It passes at `33d8a739`. It
   also fails I5-10 `plan2-contexts-regression` and `plan2-gate-amended` and
   I5-14 `plan2-regression`.
2. **I5-08, Phase 1 regression.** A cold S1000 retained-session open exceeds
   the 30 s acquisition deadline (`resource-limit`, "Acquisition deadline
   exceeded") in 51.3 s and 51.4 s at `a8d99307`. It opens in 23.5 s at
   `33d8a739`. Bisection from clean archives (`i508-bisect.out`) gives
   `8c357cc8` 24.3 s, `97ac0664` 23.8 s, `ee9e295b` 24.3 s, then `a8d99307`
   56.7 s and failing, so the first bad commit is `a8d99307` (iteration 8B).
   The probable cause, not verified, is that commit's
   `isPruned` filter in `inventory.ts`: every compiler-selected file is
   tested with `within` against every pruned root, and S1000 has one scratch
   root per module.
3. **I2A-13 `self-reference-checks`, runtime defect predating Phase 1.** The
   instance's shared daemon starts with the R copy as its working directory.
   The R copy is then deleted, and the T check returns `internal-error`
   "analysis-failed: ENOENT: no such file or directory, uv_cwd" (exit 2,
   `inputId` null). A batch check of the same copy passes. Reproduced at
   `a8d99307` and at `33d8a739` with the instance's own copy commands
   (`i2a13-t-check5.out`, `i2a13-t-check5-base.out`). Without deleting R, T
   passes.
4. **I1-28 relocated regression.** Two toolkit tests require a Git checkout
   (class B above).
5. **Final contracts.** `scripts/validate-final-contracts.ts` reports
   selections differing for `./`, `subs/analysis/` and `subs/daemon/` and
   README purposes differing for `subs/cli/` and `subs/daemon/subs/contexts/`.
   It reports the same at `33d8a739` (`base-final-contracts.out`). It is
   outside this slice's write scope and the first bad commit was not
   searched.
6. **I5-01 baseline-engine replay.** With the reference count repaired, the
   pinned baseline engine (`plan5-baseline-loader.mjs` replaying nine source
   files) reports `internal-error` "Cannot read properties of undefined
   (reading 'named')" on the reference. Same at `33d8a739`. The toolkit half
   of the comparison stays hidden.

### Stale, but not repaired: decisions needed

- **I5-06 `import-added-self-only` and I5-07 step 3.** `ff01212e` added
  `import type { ProtocolRouter }` after the anchor line where the case
  inserts its new import, so the edit now also shifts that import. Two
  accesses are decided, both in the edited file. The row ("only that file is
  re-interpreted and decided") still holds. The handler's "exactly the new
  access" does not. The options are to move the insertion after the last
  import, or to expect two. Either changes what the case exercises.
- **I5-06 `export-removed-missing`.** `ff01212e` made the root expose
  `revisionScopeSchema` (statement R4), so removing that export now makes the
  root's description invalid (`missing-export` at `module.ramify`), and no
  importer finding appears. The row's premise no longer holds for this name.
- **I5-06 `wide-fanin-bounded`.** 61 importing accesses against the reviewed
  56. `ff01212e` added vocabulary imports. I could not derive 61
  independently from the sources (28 import statements name the file, 26
  before `ff01212e`), so I did not copy the observed value. The row also
  states 56.
- **I2A-13 `plan3-preserved`.** `3fba41bd` replaced five links to
  `.principles.md` documents with their `.spec.md` successors in the Plan 3
  tree. The case accepts only commits recorded in `reviewedPlan3Changes` as
  approved decisions. Recording it needs the user's or coordinator's
  approval.

### Environment, not run

I2-29 (9 instances), I5-13 (9) and I2A-12 (6) read current raw measurement
reports (`measure:resident`, `measure:fast`, `scripts/measurements/plan2a.mjs`).
None exists for this source, and no measurement was run. I2A-12
`linux-macos-bytes` requires a macOS counterpart report, the recorded platform
gap. The Plan 1 regression instances (I2-30, I5-14, I2A-13) require a passing
full Plan 1 gate on the same source. The second Plan 2 and Plan 5 runs
report no Plan 1 gate for the current source, because the round-2 edits
changed the source identity.

## Results

All commands ran in the checkout with `flock /tmp/ramify-audit-tests.lock`.
Each `reference:verify` instance count is from the report's summary. The
Plan 2 summary counts its ten superseded instances as passed.

| Command | When (UTC) | Exit | Result | Report |
| --- | --- | --- | --- | --- |
| `npm run type-check` (round 1) | before the build | 0 | passed | `type-check.out` |
| `npm run build` | before Plan 1 | 0 | built, explorer included | `build.out` |
| `reference:verify --plan 1 --format json` | 19:47–20:05 | 1 | 307/308; only `I1-28:relocated-package` fails | `plan1-full-05e86b6d…` |
| `reference:verify --plan 2 --format json` | 20:06–20:22 | 1 | 157/174, 17 failed | `plan2-full-7dcabcaa…` |
| `reference:verify --plan 5 --format json` | 20:22–21:09 | 1 | 80/103, 23 failed | `plan5-full-a458447c…` |
| `reference:verify --plan 2a --format json` | 21:09–21:21 | 1 | 93/104, 11 failed | `plan2a-full-1abd023f…` |
| `npm run type-check` (round 2) | after the round-2 repairs | 0 | passed | `type-check-2.out` |
| `reference:verify --plan 2 --format json` (rerun) | 21:35–21:51 | 1 | 161/174, 13 failed | `plan2-full-c76328c3…` |
| `reference:verify --plan 5 --format json` (rerun) | 21:51–22:39 | 1 | 81/103, 22 failed | `plan5-full-024b3d2b…` |
| `npm run reference:cases` | after all runs | 0 | 37 files, 393 tests passed | `cases.out` |

Plan 1 ran before the round-2 edits (`edit-cases.ts`, `completion-cases.ts`,
`plan5-engine-cases.ts`). Plan 1's runtime imports none of them. Plan 2A ran
before them too, and `completionEntries`, the only one of them it could
reach, is used only by Plan 2 and Plan 5 completion. Neither was rerun.
Reports are under `.reference-work/reports/` in the checkout.

The repaired instances passed on rerun: I2-09 `config-change` (17
assertions) and `missing-file-appears` (11), I2-30 `package-entries` (74) and
`relocated-resident` (79), and I5-14 `package-entries-unchanged`. I5-01 gets
past its count and now fails on item 6.

Plan 2 rerun failures: I2-14; I2-29 ×9; I2-30 `declarations-final` and
`plan1-regression`; I5-07. Plan 5 rerun failures: I5-01 ×2; I5-06 ×3; I5-07;
I5-08 ×2; I5-10 ×2; I5-13 ×9; I5-14 `declarations-final`, `plan1-regression`
and `plan2-regression`. Plan 2A failures: I2A-12 ×7; I2A-13
`self-reference-checks`, `predecessor-regressions`, `declarations-package`
and `plan3-preserved`.

## Evidence

`/home/app/ramify-pb1-evidence/verify-repair/`: the run stdout, stderr, exit,
start and end files, plus `*-failures.txt` summaries from
`verify-origin/summarize.mjs`; `repair.diff`, `repair-2.diff`;
`relocated-toolkit-tests.json` (the relocated suite's Vitest report);
`production-files-head.json`; `base-final-contracts.out`;
`base-plan2-subset.out`, `base-plan5-subset.out`, `base-i501-313.out`;
`i508-head.out`, `i508-head2.out`, `i508-base.out`, `i508-bisect.out`;
`i2a13-t-check*.out`; the reproduction scripts `some-instances.mts`,
`one-instance.mts`, `i508-open.mts`, `i2a13-t-check.mts`, `tcopy-check.mjs`;
`notes.md`. The base subset runs edited nothing in `verify-origin/base`
except a temporary one-line change for `base-i501-313.out`, reverted
(`git status` clean).

## Rows whose prose no longer describes their instance

No row was changed.

- `I1-30:production-selection/toolkit`: "build consumes identical selected
  set". The build also emits the explorer bundle from inputs outside the
  selection (`subs/explorer/index.html`, `public/favicon.svg`), and it does
  not emit the selected ambient `styles.d.ts`.
- `I2-30:package-entries`: "Resolve all eight entries". The package declares
  nine import entries since `26bba1e2`, plus a stylesheet entry.
- `I5-14:package-entries-unchanged`: "all eight package entries" and "entry
  map is unchanged from Plan 2". Same cause.
- `I5-06:wide-fanin-bounded` and `I5-06:export-removed-missing` (above),
  unrepaired.

## Remaining gaps

- The Phase 1 final gate's `reference:verify` forms do not pass. Plan 1 needs
  the BD24/BD28 Git dependency resolved. Plans 2, 5 and 2A need the two
  Phase 1 regressions fixed, the pre-Phase 1 defects and stale cases above
  decided, and current measurement reports.
- `I1-28:relocated-package`'s mutate and run phases, and I5-01's toolkit half,
  have not run, so failures may remain behind them.
- After the fixes, a full Plan 1 run on the final source is needed for the
  Plan 1 regression instances of Plans 2, 5 and 2A.

## Coordinator review

The coordinator commissioned this slice after tracing the Plan 1
verification failures to commits before the phase's base, and reviewed its
scope: expectations under `scripts/reference-harness/` only. The repaired
expectations follow the user's decision of 2026-10-03 that Phase 1 keeps
today's signature rule. The two Phase 1 regressions found here (`I2-14`
since iteration 3B, `I5-08` since iteration 8B) and the Git dependency of the
BD24 and BD28 toolkit tests go to a repair slice before iteration 8C. The
remaining failures predate the phase and are put to the user: the cases whose
premise Plan 8 changed, the missing measurement evidence, the final-contract
validator, the daemon working-directory defect and the Plan 3 link renames.
The iteration gate runs on the committed candidate.
