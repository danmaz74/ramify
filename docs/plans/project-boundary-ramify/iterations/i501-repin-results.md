# I5-01 re-pin results: both sides of the Plan 5 batch equality pinned

**Date:** 2026-10-04. **Status:** receipt for a harness-only slice outside the
numbered iterations, assigned by the coordinator after the
[final-gate repair](final-gate-repair-results.md) (item 5) found that
`I5-01:namespace-lazy-equal` and `I5-01:decide-indexed-equal` could not pass
against the current engine. **This is a re-pin chosen by the coordinator on
2026-10-04**, not an expectation change: the candidate side of the comparison,
formerly the working tree's engine, is now the Plan 5 iteration 2 commit. The
user has been told and may override the choice. Changes are uncommitted and
await the coordinator's review. Both instances pass; the reviewed instance
rows, ids and counts are unchanged.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit | `9e46459a`, clean at assignment |
| Changed | `scripts/reference-harness/plan5-engine-cases.ts`, `scripts/reference-harness/plan5-report-worker.mjs`, `scripts/reference-harness/README.md` |
| Removed | `scripts/reference-harness/plan5-baseline-loader.mjs` (no remaining user) |
| Added | this receipt |
| Unchanged | `plan5-instances.ts` (all 103 rows), runtime source, protected documents, archived plans, `ramify-agent/` |
| Node | v22.23.3; typescript 7.0.2 and tsx 4.23.13 at both pins and at HEAD (same lockfile integrity) |
| Evidence | `/home/app/ramify-pb1-evidence/i501-repin/` (`notes.md` indexes it) |

## What the instances assert

Both rows (iteration 2, DA10/DA18, selection `A/R, A/T`) run `analyzeProject`
twice per fixture in separate processes over the same fixture copy, once per
engine. For R (reference example) and T (pinned toolkit) each asserts, in
order: the baseline owners, accesses and warnings (R 15/294/2, T 11/2,744/0);
a completed, passed, complete baseline with no diagnostic or coverage note;
T's 229 source files; report bytes equal except `runId`; equal
`snapshot.results` (decisions and order); equal diagnostics. The rows' own
words are "the reference reports fifteen owners, complete coverage and two
configuration warnings, and the toolkit 229 source files, 2,744 accesses and
no finding" and "Decisions, their order and their diagnostic identities equal
the recorded pre-change list".

## The two pins

- **Before: `e0be049`** (Plan 5 iteration 1 commit, 2026-09-11 21:06 UTC),
  unchanged.
- **After: `2c4ae04c`** (`2c4ae04cc144be190557a75a3b15ff0edeff5d31`,
  2026-09-11 23:22 UTC, "plan(iteration-5-fast-incremental-checks): iteration
  2 — engine changes and the --plan 5 harness"). Its only parent is `e0be049`.
  It adds `access-interpreter.ts`, the lazy spelling-filtered index in
  `namespace-uses.ts` and the indexed lookups in `decisions.ts` and `model.ts`,
  and introduces these handlers. Its message and
  `docs/plans/iteration-5-fast-incremental-checks/iterations/iteration2-results.md`
  record the reviewed comparison: `--plan 5 --iteration 2` passed 10/10, with
  R equal except `runId` at 15 owners, 294 accesses and 2 warnings, and T at
  11 owners, 229 files and 2,744 accesses. At that commit the old loader's
  "worktree" side was these sources over a build otherwise identical to
  `e0be049`, so the reviewed comparison was in effect `e0be049` against
  `2c4ae04c`.

## What changed and why

- **Whole pinned engines instead of a nine-file overlay.** The old loader
  replayed nine pinned `model`/`typescript` files over the current `dist/`.
  Since later plans changed the rest of the engine, its "baseline" became a
  hybrid: current acquisition reporting auxiliary origins to a pinned model
  that rejects them (R invalid), and current `companions.ts` reading a field
  the pinned model never builds (T crash on `named`). Overlaying `2c4ae04c`'s
  files the same way would fail the same way. Each side is now a
  `git archive` of the pin's whole `subs/analysis` owner (with its
  `package.json` and `tsconfig.json`, and a `node_modules` link) in the
  instance run directory. `plan5-report-worker.mjs` imports that tree's
  `analyzeProject` from source under tsx, with the tree as working directory.
  The pinned engine's own helper spawns already support source mode. The
  loader and its two stubs for the retained adapter and availability provider
  are deleted; those stubs existed only to make the hybrid load.
- **Registry from the pinned build.** The worker replaces the request's
  `registry` with the pinned engine's own `createDefaultTagRegistry()`. Each
  instance now asserts first that both sides received the same request. The
  current and pinned registries are equal today (`proto/registry-compare.mts`);
  the substitution keeps a later registry change from reaching either pin.
- **Fixtures as the pinned builds expect.** `toolkitFixture` is split.
  `pinnedToolkit` keeps the `e0be049` archive and `node_modules` link
  unmarked; both pins read it. `toolkitFixture` adds iteration 3A's root
  marker for the current-engine users (`I5-01:only-subset-equal`, `I5-03:*`).
  The marker must go for the pins: the `e0be049` engine reports a marked copy
  invalid (`Unknown statement root.` and 21 other errors, `proto/tm-e0be049.out`).
  The R fixture was a copy of the working-tree example. That copy has the
  root marker and later syntax that the pinned engine also rejects
  (`proto/rhead-e0be049.out`). It is now `git archive e0be049:examples/collection-review`,
  identical at `2c4ae04c`, with the unchanged `prepareReferenceEdits` and the
  same example manifests. Both sides read the same fixture bytes.
- **Baseline numbers restored to the reviewed ones.** R expects 15/294/2 again,
  the iteration 2 record and the row's "two configuration warnings". The
  318/0 figures and their Plan 8 and 8C comment tracked the current engine and
  no longer apply. T is unchanged.
- **Records.** The pin is defined with a comment saying why the candidate is
  pinned and that the coordinator re-pinned it on 2026-10-04. The
  observation records `candidateRevision`. The README Plan 5 paragraph
  describes the two pins.

## Negative controls

Both used temporary harness edits saved as diffs, then restored by copying the
final bytes back; `cmp` confirmed the file equals `plan5-engine-cases.final.ts`.

| Control | Result |
| --- | --- |
| A: candidate set to `bd337e1a` (Plan 8 iteration 3, signature companions; predates the root marker) | `I5-01:namespace-lazy-equal` **failed** at "R: complete report bytes except runId"; baseline and request assertions passed (`negative-a.diff`, `negative-a.out`) |
| B: candidate copy's exposure index perturbed (`entries.push` → `entries.unshift` in `decisions.ts`) | `I5-01:decide-indexed-equal` **failed** at "T: complete report bytes except runId"; R and all T baseline assertions passed (`negative-b.diff`, `negative-b.out`) |

## Verification

All on the final bytes unless noted; test commands held
`flock /tmp/ramify-audit-tests.lock`.

| Command | Result |
| --- | --- |
| Prototype outside the runner (`proto/worker.mjs`) | T: both pins 11/229/2,744/0, equal except `runId`; R: both 15/54 files/294/2, equal except `runId` |
| `some-instances.mts 5` for the two instances (before the controls) | Both passed (`two-instances.out`), 50 s |
| `some-instances-verbose.mts 5` for all six I5-01 and `I5-03:assembled-equals-whole`, `I5-03:closure-superset` (the other `toolkitFixture` users) | 8/8 passed; each equality instance 15/15 assertions (`group-final.out`) |
| `git diff --check` | exit 0 |
| `npm run type-check` | exit 0 |
| `npm run build` | exit 0 |
| `npm run reference:cases` | exit 0, 37 files / 393 tests passed (`cases.out`) |

`reference:verify` was not run for any plan, by assignment.

## Effect on I2A-13:predecessor-regressions

That instance (`plan2a-completion-cases.ts`) reads the newest unfiltered
`.reference-work/reports/plan2-full-*.json` and `plan5-full-*.json` whose
recorded source/build identity equals the current one, and runs Plan 1's
regression check. For Plan 5 it requires every failed id to be in
`knownPlan5Failures`: `I5-10:plan2-gate-amended`, nine `I5-13` rows,
`I5-14:plan1-regression` and `I5-14:plan2-regression`. I5-01 is not in that
set. It also requires 103 required instances and at least 91 passed. The last
gate run failed it only because of the two I5-01 instances (Plan 5 90/103). It
should pass once a fresh unfiltered `--plan 5` run on this source and build
shows no I5-01 failure, with the Plan 2 conditions unchanged and Plan 5 run
before Plan 2A. The milestone gate must confirm this; it was not run here.

## Evidence

`/home/app/ramify-pb1-evidence/i501-repin/`: `notes.md`, `proto/` (pinned
engine copies, fixtures, `worker.mjs`, reports and outputs, `registry-compare.mts`),
`some-instances*.mts`, `two-instances.out`, `negative-a.*`, `negative-b.*`,
`plan5-engine-cases.final.ts`, `group-final.out`, `type-check.out`,
`diff-check.out`, `build.out`, `cases.out`.

## Coordinator review

The coordinator chose this re-pin on 2026-10-04: both sides of the comparison
are now pinned builds of the plan that owned the case. It is the coordinator's
choice, relayed to the user, who may override it. Pinning the reference
example to its `e0be049` copy and removing the loader that mixed pinned files
into the current build are accepted: both follow from running whole pinned
engines, and both sides read the same fixture bytes. No reviewed row, count
or assertion changed. The full Plan 5 and Plan 2A verification at the
iteration 11 milestone gate confirms the instances and
`I2A-13:predecessor-regressions`.
