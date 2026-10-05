# Final-gate repair results: validator layers, re-reasoned Plan 5 cases, I2A-13

**Date:** 2026-10-04. **Status:** receipt for a repair slice outside the
numbered iterations, assigned by the coordinator after iteration 8C to apply
the user's decisions of 2026-10-04 on the pre-existing `reference:verify`
failures of the [final gate](../execution.md#final-gate). The measurements are
not part of it; they run once in iteration 20. Changes are uncommitted in the
working tree and await the coordinator's review. No reviewed instance row,
count or identity changed and no case was deleted or skipped. One item,
`I5-01`, needs a decision (item 5).

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit | `a841ac72`, clean at assignment (`head.txt`) |
| Changed | `scripts/validate-final-contracts.ts`; `scripts/reference-harness/final-contracts.test.ts`, `plan5-session-cases.ts`, `plan5-session-revision-cases.ts`, `plan2a-completion-cases.ts`; the first paragraph of `subs/analysis/subs/project/README.md`; the ownership rule string in `subs/daemon/src/measure-response.ts`; `main-plan.md`, `execution.md`, `iterations/iteration20.md`, `handoff.md`; this receipt |
| Unchanged | every other runtime source, `package.json`, lockfiles, configurations, protected documents, every `plan*-instances.ts` row, archived plans, `ramify-agent/` |
| Node | v22.23.3 |
| Evidence | `/home/app/ramify-pb1-evidence/final-gate-repair/` (`notes.md` indexes it) |

## 1. Fixture F baselines

Unchanged, as decided: they stay as repaired in `5c41f959`.

## 2. Measurements

Not run. Decided question 11 in `main-plan.md`, the final gate in
`execution.md` and deliverable 2 of `iteration20.md` now state the decision:
the resident, fast and Plan 2A materialization recipes run once, on the final
candidate in iteration 20, on Linux only, with samples of 30–50, after the
expected runtime is announced to the user; `I2A-12:linux-macos-bytes` is a
known platform gap that does not fail the gate.

## 3. The final-contract validator

**Cause.** The validator compares each owner's committed `module.ramify` with
the archived reviewed declarations plus named layers, and its README purpose
with the archived purpose. Plan 7 (affected modules, `5e2504ba`, `33348a73`,
`0629ccb1`, 2026-09-28) added exposures and purpose sentences without a layer.
The validator's selection drift (`drift-head.out`) is exactly Plan 7's
reviewed manifest additions (`docs/plans/iteration-7-affected-modules/owners.md`,
"Manifest additions"): the root's eight affected types from analysis and two
context types from daemon, analysis's `interfaces/affected.ts` wildcard, and
daemon's relay of the two context types from contexts. No other plan's
exposure is missing.

`assertOwner` checks selections before the purpose and stops at the first
difference, so the purposes of the root, analysis and daemon were never
compared. Comparing every purpose separately (`purposes.mts`,
`purposes-head.out`) shows five differences, not two: each is the reviewed
purpose plus exactly the sentence Plan 7's owner list appends ("Purpose
paragraph additions") for analysis, contexts, daemon, the root and the CLI.

**Change.**

- A declaration layer `Plan 7 (affected modules)` holding those four
  statements, placed after the declared toolkit signatures and before the
  Phase 1 layers, in landing order.
- Purpose layers, the same mechanism for README purposes: a named layer
  appends a reviewed sentence or replaces one exact phrase; a layer that
  restates its sentence or whose phrase does not occur exactly once fails, so
  it cannot hide drift. The archived purposes are unchanged. Layers:
  - `Plan 7 (affected modules)` appends Plan 7's five reviewed sentences. The
    user accepted the CLI and contexts paragraphs as current. **The root,
    analysis and daemon sentences are recorded from the same reviewed source;
    the user was shown only the two the validator reported, so these three
    need the coordinator's confirmation.**
  - `Phase 1 project boundaries (auxiliary source)` replaces the Project
    phrase below.
- `final-contracts.test.ts`, in its existing layering test (no new test):
  daemon's layer list gains `Plan 7 (affected modules)`; every archived purpose
  is carried through unchanged; the purpose layers are exactly the six owners
  above.

**README paragraph changed** (`subs/analysis/subs/project/README.md`, the only
owner first paragraph this phase made stale; the validator compares every
owner's). Old:

> Project selects and acquires one real project, validates its physical ownership layout and exact paths, and supplies coherent captured input reads. It resolves the root and compiler configuration on request, records raw source areas, configuration selection, outside-module warnings and README purpose metadata, can reuse its configuration product when its captured dependencies are unchanged, and can keep its observations live for a retained session, updating the inventory locally, rebuilding it for structural changes and re-observing its whole observed set, without deciding import permissions.

New:

> Project selects and acquires one real project, validates its physical ownership layout and exact paths, and supplies coherent captured input reads. It resolves the root and compiler configuration on request, records raw source areas, auxiliary source, configuration selection, project warnings and README purpose metadata, can reuse its configuration product when its captured dependencies are unchanged, and can keep its observations live for a retained session, updating the inventory locally, rebuilding it for structural changes and re-observing its whole observed set, without deciding import permissions.

The other fourteen first paragraphs were read; none states something this
phase made false. The CLI and contexts paragraphs are unchanged, as decided.

**Result.** `npx tsx scripts/validate-final-contracts.ts` exits 0 with 15
owners, 590 files, 173 expanded statements, 8 package entries
(`validator.out`). Negative controls (`validator-negatives.out`): removing
either accepted Plan 7 sentence, restoring the old Project phrase, or dropping
any one of the three kinds of Plan 7 statement is rejected.

## 4. Plan 5 cases whose premise `ff01212e` changed

Rows byte-identical; only assertions and their comments changed.

**`I5-06:import-added-self-only` and `I5-07:audit-equal-sequence` step 3.** A
source revision decides every access of a re-interpreted file whose facts
changed by value, location included (`session-revision.ts`,
`relinkAndDecide`: an access is decided when its serialized fact differs from
the previous one). The anchor is line 10 of the reviews router; since
`ff01212e` line 11 is `import type { ProtocolRouter }`, the file's only access
below the anchor (lines 1–11 are all its imports). The insertion moves it, so
exactly two accesses are decided: the new one and that one. Both assertions
now expect 2, with the reasoning `f61213ae` recorded for `I5-12`. Every other
assertion is unchanged: one file, the source path, no model rebuild, one more
access and one more allowed decision than the cold revision, no finding.

**`I5-06:wide-fanin-bounded`: derived 61 before recording.** An access is one
selected binding (`accesses.ts` records one access per selection), and the
case counts accesses whose target is the vocabulary file.
`count-vocab-bindings.sh` lists every import statement in the committed
reference whose specifier names the vocabulary file, with its bindings:

| Statements at `ff01212e^` | Bindings | Statements at `HEAD` | Bindings |
| --- | --- | --- | --- |
| 26 | **56**, the reviewed value | 28 | **61** |

The two added statements are `ff01212e`'s: `import type { RecordId }` in the
catalog router (1) and `import type { Finding, Observation, RecordId,
ReviewStatus }` in the reviews router (4). The full enumeration is in
`wide-fanin-enumeration-head.txt` and `-before-ff01212e.txt`. No statement
re-exports, dynamically imports or type-queries the file. The derivation gives
61, the run's value, so 61 is recorded; the bound assertions are unchanged.

**`I5-06:export-removed-missing`: the removed export.** The case now removes
the export of `resolvePredecessors` from the catalog core's `history.ts`. Its
file says it "is exported for this owner's own files and its own tests. It is
not exposed". `removal-candidates.mts` (`removal-candidates.out`) lists every
reference original with its exposure, the exported originals whose
signatures name it, and its importers:

- No vocabulary export fits. The root exposes `revisionScopeSchema` and eight
  others. Every vocabulary export is exposed through the contracts wildcard,
  and each imported one the root does not expose (`revisionChainSchema`,
  `inspectionReportSchema`, `RevisionChain`, `RevisionScope`,
  `InspectionReport`, `ObservationCallback`) is named by an exposed original's
  signature. A removed export stays a module-level binding that the signature
  still names, so removal adds `exposed-without-companion`. The first choice,
  `revisionChainSchema`, failed exactly so: two such findings at
  `subs/workspace/subs/contracts/module.ramify` (`focused-plan5.out`).
- `resolvePredecessors` is named by no description and by no signature, is
  imported by two files of its owner, `catalog.ts` (ordinary) and
  `tests/catalog.test.ts` (testing), and its removal leaves every description
  valid. The case's purpose is kept: every importing access of the removed
  name reports `missing-export` at its own import statement, no other finding
  appears, and the checked set is the edited file and its importers. The
  importer list is now `[catalog.ts, tests/catalog.test.ts]`, from the
  sources; the checked-set assertion names the edited file instead of the
  vocabulary. The remaining assertions are unchanged.

## 5. `I5-01` ×2: the pinned engine's replay

**Not repaired; a decision is needed.** The replay (`i501/replay.mts`, using
the harness loader and report worker unchanged) at `HEAD`:

| Fixture | Pinned `e0be049` engine | Current engine |
| --- | --- | --- |
| R | `invalid`: "Original … `../vite.config.ts` … has inconsistent ownership or source origin", and the same for `vitest.config.ts`; 0 accesses (`i501/r1.out`) | completed, complete, 318 accesses, no finding |
| T (pinned toolkit input) | `incomplete`: `internal-error` "Cannot read properties of undefined (reading 'named')" (`i501/t1.out`) | completed, **failed**: 18 `exposed-without-companion` findings, 7 coverage notes |

Causes, each in code the comparison does not pin:

1. **Plan 8, before this phase** (`e475b961`, `bd337e1a`, 2026-09-21). Model
   originals carry signature companions and every analysis runs
   `listCompanionViolations`, which reads `symbol.companions.named`. The
   pinned `model.ts` builds originals without companions, so the unpinned
   companion check throws. This is the receipt's crash; it was hidden behind
   the access-count assertion from `ff01212e` until baseline repair 2.
2. **Plan 8, before this phase.** The pinned T input is the toolkit at
   `e0be049`, which predates the companion rule; today's engine reports 18
   `exposed-without-companion` findings on it. The row's "the toolkit … no
   finding" and the case's "complete baseline with no findings" cannot hold
   for the current engine, whatever the harness does.
3. **This phase, iteration 4** (`db477d50`). Every source origin gained
   `auxiliary`; the pinned `accesses.ts` omits it, so the "complete report
   bytes" equality fails even without 1 and 2.
4. **This phase, 8C** (`a841ac72`). R's two configuration files are root
   auxiliary source, which the pinned `model.ts` refuses, so the R baseline is
   invalid before it reaches the companion check. 8C updated the R count to
   318 but did not run Plan 5.

The loader's existing adaptations stub modules the pinned engine predates and
never calls. Here the pinned engine is called with shapes and inputs it
predates, and the current engine itself contradicts the row. Making the
comparison pass would mean forward-porting the pinned files (forbidden),
normalizing companions, origins and findings out of both reports (a weaker
assertion than "equal except `runId`"), or changing the T fixture. Options
for the decision:

- (a) Keep the instances failing as a known pre-phase gap, listed beside the
  measurement instances, and add them to the final gate's accepted list.
- (b) Re-pin the comparison so both sides are pinned engines: `e0be049`
  against Plan 5 iteration 2's own commit, over the pinned inputs. This keeps
  the evidence the instance was written for, that iteration 2's refactor
  changed no result, independent of later plans. It needs both full pinned
  builds, not nine replayed files.
- (c) Compare only what the replayed files compute (accesses and decisions)
  after removing the later reviewed additions, with the current engine's
  findings on T expected separately.

Suggested: (b). Effect on the gate: both instances fail Plan 5, and
`I2A-13:predecessor-regressions` then fails too, because they are outside its
known Plan 5 failures and leave Plan 5 at 90 passed, below its recorded 91.

## 6. `I2A-13`

- **`self-reference-checks`.** The first resident check starts the shared
  daemon, which keeps that check's working directory, the R copy; the case
  deleted R before checking T. The case now disposes every copy only after
  `withSequenceProcess` has stopped the daemon. Assertions unchanged. The
  runtime defect is filed under "Known defects carried forward" in
  `handoff.md`, with the reproduction and evidence paths.
- **`plan3-preserved`.** The harness records approved later changes to the
  Plan 3 tree in `reviewedPlan3Changes`, by commit and decision. `3fba41bd` is
  added, newest first as `git log` lists them. Its change to that tree is six
  link replacements, five to `module-description.spec.md` and one to
  `typescript-source-interpretation.spec.md`, in five files (baseline repair 2
  said five links).
- **`declarations-package`** passes with item 3.
- **`predecessor-regressions`** depends on the Plan 2 and Plan 5 reports of the
  same source and on Plan 5's known failures: see the results.

## 7. The measurement ownership rule

`independentScopes` was removed in 8A, so the rule's last paragraph named a
concept that no longer exists. In `measure-response.ts` "independent compiler
scopes" becomes "declared nested trees, scratch directories": neither is
encoded in the measure document, and a path in either is an unlisted path
the rule's step 4 cannot attribute reliably. The field and its shape are
unchanged (`ramify.measure/2`); no harness case or test pins the string's
bytes (`measure-service.test.ts` compares the constant with itself, and the
envelope-size test computes its bound). `docs/architecture/architect-view.spec.md`
states the same paragraph; the matching patch is proposed in
`proposed-spec-patches.diff` (passes `git apply --check`).

## Results

All test and verification commands ran under `flock /tmp/ramify-audit-tests.lock`.
The four verifications and `reference:cases` ran once each from `run-all.sh`,
in the order 1, 2, 5, 2A, after `npm run build`. The brief listed 2A before 5;
2A runs last because `I2A-13:predecessor-regressions` reads the Plan 2 and
Plan 5 reports of the same source. The working-tree diff hash differs before
and after the runs (`diff-*-runs.sha`, `status-*-runs.txt`) only because
another session edited `docs/plans/project-boundary-sequential/main-plan.md`
at 07:17:56 UTC, during the Plan 5 run. That file is not an input of the
harness's source identity (`artifact.ts`, `executionIdentity`) nor of any case,
and this slice did not touch it.

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check` | 0 | clean | `diff-check.out` |
| `npm run type-check` | 0 | all four scopes | `type-check-2.out` |
| `npm run build` | 0 | built | `build-2.out` |
| `npm run check:self` | 0 | passed, partial; 15 owners, 573 source files, 17 resources, 8391 accesses; 0 errors, 0 warnings, 38 analysis limits; 5399 allowed, 0 denied, 2952 external (unchanged from 8C) | `check-self.out` |
| `npx tsx scripts/validate-final-contracts.ts` | 0 | 15 owners, 590 files, 173 expanded statements, 8 package entries | `validator.out` |
| `vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/final-contracts.test.ts` | 0 | 1 file, 12 tests | `final-contracts-test.out` |
| `vitest run` the daemon measure-service and service tests and the CLI measure-command test | 0 | 3 files, 25 tests | `measure-tests.out` |
| Focused Plan 5 instances (`some-instances.mts`) | 0 | `import-added-self-only`, `wide-fanin-bounded`, `audit-equal-sequence`, `I5-14:declarations-final` passed; `export-removed-missing` failed on the first choice (item 4), then passed | `focused-plan5.out`, `focused-plan5-erm.out` |
| Focused Plan 2 instances | 0 | `I2-30:declarations-final`, nested `I5-07:audit-equal-sequence` passed | `focused-plan2.out` |
| Focused Plan 2A instances | 0 | `declarations-package`, `plan3-preserved`, `self-reference-checks` passed | `focused-plan2a.out` |
| `reference:verify -- --plan 1 --format json` (06:37–06:55 UTC) | 0 | **308/308**, plan complete; report `plan1-full-cb3725fe…` | `plan1-verify.*`, `plan1-failures.txt` |
| `reference:verify -- --plan 2 --format json` (06:55–07:12) | 1 | **165/174**, 9 failed; report `plan2-full-0cffa938…` | `plan2-verify.*`, `plan2-failures.txt` |
| `reference:verify -- --plan 5 --format json` (07:12–08:01) | 1 | **90/103**, 13 failed; report `plan5-full-b95734c3…` | `plan5-verify.*`, `plan5-failures.txt` |
| `reference:verify -- --plan 2a --format json` (08:01–08:13) | 1 | **96/104**, 8 failed; report `plan2a-full-ca5e5a0f…` | `plan2a-verify.*`, `plan2a-failures.txt` |
| `npm run reference:cases` (08:13–08:33) | 0 | **37 files, 393 tests** | `cases.stdout` |

Plan 2's summary counts its ten superseded I2-10/I2-11 instances as passed.

**Remaining failures.**

| Plan | Instance | Single reason | On the expected list |
| --- | --- | --- | --- |
| 2 | I2-29 ×9 (`entry-footprints`, `cold-warm-broad-reference`, `cold-warm-broad-hundred`, `repeated-edit-plateau`, `many-contexts`, `slow-consumer`, `synthetic-500`, `synthetic-1000`, `publication-peak`) | no current resident measurement report | yes, iteration 20 |
| 5 | I5-13 ×9 (`hook-latency-reference`, `-s100`, `-s500`, `-s1000`, `checked-set-bounded`, `repeated-edit-plateau`, `hot-warm-memory`, `cold-open`, `entry-footprints`) | no current fast measurement report | yes, iteration 20 |
| 5 | `I5-10:plan2-gate-amended` | its nested Plan 2 gate exits 1, from I2-29 ×9 only | yes, nests I2-29 |
| 5 | `I5-14:plan2-regression` | names exactly the nine I2-29 failures | yes, nests I2-29 |
| 5 | `I5-01:namespace-lazy-equal`, `I5-01:decide-indexed-equal` | the pinned engine's R baseline is invalid (item 5) | **no: decision needed** |
| 2A | I2A-12 ×6 (`reference-scale`, `toolkit-scale`, `synthetic-100`, `synthetic-500`, `synthetic-1000`, `repeat-plateau`) | no current Plan 2A measurement report; the last three read the absent report's row and fail with "Cannot read properties of undefined (reading 'status')" | yes, iteration 20 |
| 2A | `I2A-12:linux-macos-bytes` | no macOS counterpart report | yes, the known platform gap |
| 2A | `I2A-13:predecessor-regressions` | Plan 5 failures outside its known set: exactly the two I5-01 instances; the next assertion, at least 91 Plan 5 passes, would also fail at 90 | **no: follows I5-01** |

Every repaired instance passed in the full runs: `I2-30:declarations-final`
and the nested `I5-07:audit-equal-sequence` in Plan 2; the three I5-06 cases,
`I5-07:audit-equal-sequence` and `I5-14:declarations-final` in Plan 5;
`I2A-13:self-reference-checks`, `declarations-package` and `plan3-preserved`
in Plan 2A. `I2A-12:limit-preservation` passes.

## Rows whose prose no longer describes their instance

Every reviewed row stays byte-identical, as the tables are compared with the
archived `subcases.md`. This table collects, for the handoff, every row whose
prose no longer describes what its instance asserts, from the receipts of
iterations 2, 3, 3B, 4, 8B and 8C, baseline repair 2 and this slice.

| Row | Prose now stale | What the instance asserts | Since |
| --- | --- | --- | --- |
| I1-01:baseline | "the two configuration warnings are separate" | no warnings; both files are root auxiliary source | 8C |
| I1-02:stray-description | "alongside ordinary outside-source warning" | no warning; the file beneath the stray marker has no owner | 8C |
| I1-02:loose-subs-source | "One aggregated `subs` warning count 1; no ... owner" | root auxiliary source, no warning | 8C |
| I1-02:sibling-tests | "One `tests` warning count 1" | root auxiliary, ordinary; still no testing classification | 8C |
| I1-02:sibling-interfaces | "One `interfaces` warning count 1; no owner" | root auxiliary; still no exposure or third area | 8C |
| I1-27:self-check | "independent scripts/site/example absent from program" | scripts are analyzed auxiliary source; site and example stay absent | 8C |
| I1-28:compiled-cli-warnings/human, /json | "Visible aggregated warning" / "Same warning/count" | no warning; exit 0 unchanged | 8C |
| I1-28:compiled-cli-stray-description/human, /json | "marker not included in ordinary-file warning count" | no warning exists | 8C |
| I1-29:nested-project-root/root-example, /child-example | "enclosing subs ancestry does not cross nearer non-subs boundary" | the nested project is selected because its description carries the root marker | 3B |
| I1-29:outside-module-target | "Warning plus located outside-scope analysis limit" | a definite `not-visible` denial; still no allowed verdict, no external | 8C |
| I1-29:stray-files | "Warnings root config-extra count 1 and tests count 2 only; ... ignored file silent" | all four files root auxiliary, no warning | 8C |
| I1-30:production-selection/toolkit | "build consumes identical selected set" | the build also emits the explorer bundle from inputs outside the selection and does not emit the selected ambient `styles.d.ts` | `d5c24982` (baseline repair 2) |
| I2-01:cold-context | "two warnings" | zero warnings | 8C |
| I2-20:json-bare-report | "One `ramify.analysis/1` document" | `ramify.analysis/2` | 2 |
| I2-21:json-lines | "One `ramify.watch/1` object per line" | `ramify.watch/2` | 3 |
| I2-30:self-check-fifteen | "no findings or limits" | 38 nonblocking limits, all in auxiliary source; still no finding | 8C |
| I2-30:declarations-final | "Eleven declarations match owners.md" | fifteen owners, the eleven archived declarations plus named layers | Plan 6 (this slice) |
| I2-30:package-entries | "Resolve all eight entries" | nine import entries and a stylesheet entry | `26bba1e2` (baseline repair 2) |
| I2A-02:explicit-config-excluded | "as application or outside-module source" | generated output never becomes application source; outside-module source no longer exists | 8C (named in 4) |
| I2A-13:declarations-package | "Eleven declarations and eight package entries validate" | fifteen layered owners, the eight reviewed entries and the recorded additions | Plan 6 (this slice) |
| I5-01:namespace-lazy-equal | "the reference reports ... two configuration warnings"; "the toolkit ... no finding" | the reference expects no warning (8C); today's engine reports 18 companion findings on the pinned toolkit input (Plan 8) | 8C, Plan 8 (this slice) |
| I5-01:decide-indexed-equal | "the reference keeps its two warnings" | no warning | 8C (this slice) |
| I5-06:export-removed-missing | "Remove the export `revisionScopeSchema` from the vocabulary file" | removes `resolvePredecessors` from the catalog core's `history.ts`; the checked set is that file and its importers | this slice |
| I5-06:wide-fanin-bounded | "which 56 importing accesses reach"; "at most those 56" | 61 importing accesses | `ff01212e` (this slice) |
| I5-11:changed-delta-document | "Exactly one `ramify.check/1` document" | `ramify.check/2` | 8B |
| I5-11:plain-check-unchanged | "One bare `ramify.analysis/1` document" | `ramify.analysis/2` | 2 |
| I5-14:declarations-final | "All eleven declarations match owners.md, including the six added lines and the removed increment line" | fifteen layered owners | Plan 6 (this slice) |
| I5-14:package-entries-unchanged | "all eight package entries"; "entry map is unchanged from Plan 2" | nine import entries and a stylesheet entry | `26bba1e2` (baseline repair 2) |

Archived prose outside the instance tables (not edited): Plan 1's
`subcases.md` exact-reason table uses "root marker" for the root description
file (3B).

## Protected documents

No `.principles.md`, `.spec.md` or `docs/model/glossary.md` file was edited.
Proposed: `proposed-spec-patches.diff`, one paragraph of
`docs/architecture/architect-view.spec.md` (item 7).

## Gaps and decisions needed

1. **`I5-01` ×2 needs a decision** (item 5, options a–c, suggested b). Until
   it is decided, the two instances and `I2A-13:predecessor-regressions`
   fail beyond the measurement list.
2. **Three Plan 7 purposes need confirmation.** The root, analysis and daemon
   paragraphs carry Plan 7's reviewed sentences exactly as the CLI and
   contexts paragraphs do; the selection differences hid them, so the user
   decided only the two. They are recorded in the same layer.
3. **The Project paragraph** is changed as shown in item 3 and needs the
   user's review with the others.
4. **The proposed spec patch** (item 7) needs the coordinator's
   authorization; until then `architect-view.spec.md` still says
   "independent compiler scopes" while the runtime rule does not.
5. `CLAUDE.md`'s implementation section still describes outside-module
   warnings (8C receipt); it waits for iteration 19 and the user's consent.
6. Measurement instances and their nests remain for iteration 20.

## Coordinator review

The coordinator reviewed the validator's Plan 7 layers, the purpose-layer
mechanism, the re-reasoned Plan 5 assertions with the wide-fanin enumeration,
the I2A-13 changes and the plan-document entries, authorized
`proposed-spec-patches.diff` unchanged (`architect-view.spec.md`) and applied
it with this slice. The user decided items 1–5 on 2026-10-04 and chose to
accept the current `cli` and `contexts` purposes; the root, analysis and
daemon purposes carry the same Plan 7 sentences from the same reviewed owner
list and are recorded in the same layer, which is reported to the user. The
new Project README phrase is shown to the user. The two `I5-01` instances are
not repaired: their comparison pins one side to `e0be049` and the other to
the current engine, which Plan 8, iteration 4 and iteration 8C each changed.
The options are put to the user; until that is settled they, and
`I2A-13:predecessor-regressions` through them, remain failing. The agent ran
plans 1, 2, 5 and 2a and `reference:cases` on this tree; the coordinator's
gate runs the audit, build and `reference:cases` on the committed candidate.
