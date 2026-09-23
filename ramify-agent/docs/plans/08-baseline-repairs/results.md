# Plan 8 results: baseline repairs

**Date:** 2026-09-23. **Status:** complete. **Branch:**
`feat/plan8-baseline-repairs`, iterations 1 to 5 merged at `1945eaa` and this
iteration's work on top.

The plan set out to make Ramify's own check complete again, bring the frozen
gates up to date as reviewed layers, guard the fixture, fix the layout defects,
and bind both suites' evidence to one commit. Eight of the nine acceptance rows
are met. BR02's second half is not: the four reference self-check instances
were deferred by explicit decision and remain unverified.

## Acceptance

| ID | Required result | Iteration | Commit | Observed |
| --- | --- | ---: | --- | --- |
| BR01 | Ramify's batch check on itself reports `coverage: complete` with no analysis limit, and no signature's type changed | 1 | `3328923` | **Met.** Re-run at this commit: `Execution: completed; check: passed; coverage: complete`, `0 errors, 0 warnings, 0 analysis limits; 4569 allowed, 0 denied, 2004 external`, over 15 owners and 438 source files. |
| BR02 | BD24 passes with its `complete` expectations restored and no hard-coded limit list; the four reference self-check instances pass | 1, 6 | `3328923` | **First half met, second half unverified.** BD24 passes with both `complete` expectations and no limit list. The four instances were deferred; see [BR02's second half](#br02s-second-half-the-four-reference-self-check-instances). |
| BR03 | The final-contract gate exits 0; frozen tables are unchanged and the additions are named reviewed layers | 2 | `33b1de4`, `4ab6a9e`, `e609c4d`, and this iteration | **Met, after one repair here.** The gate exits 0 with `{"owners":15,"files":455,"expandedStatements":164,"packageEntries":8,"bin":"dist/src/ramify"}`. Merging iterations 1 and 2 reintroduced drift in three declarations, which this iteration closed with one more named layer; see [the gate repair](#the-gate-repair-at-integration). |
| BR04 | String export targets are accepted by every package gate without being imported | 2 | `33b1de4` | **Met.** `PackageMetadata.exports` admits a string target, `./module-tree.css` is resolved under the `import` and `types` conditions and read with `statSync`, and `final-contracts.test.ts` proves it through a fixture stylesheet that throws on import. That test passes here. |
| BR05 | A test in the ordinary suite checks a fresh fixture copy with the real checker and requires zero errors | 3 | `dda60ac` | **Met.** `subs/harness/src/tests/fixture-check.test.ts` runs `ramify check --batch` over a fresh `copyFixture()` copy and requires 0 errors and 0 denied. Its warning set is frozen rather than empty; see [the fixture's two warnings](#the-fixtures-two-standing-warnings). |
| BR06 | Keyboard focus brings an off-screen row or shell into view, and Space on a body control does not arm pan | 4, 5 | `d527588`, `00f8c7b` | **Met for focus, by iteration 5's browser evidence; met for Space by unit test only.** See [BR06's two halves](#br06s-two-halves). |
| BR07 | The minimap follows review decision 2; MT01–MT07 and MT14 are unchanged, and `ModuleTreeCanvasProps` is unchanged | 4 | `d527588` | **Met.** `module-tree-canvas.css` makes the canvas a size container and hides `.react-flow__minimap` below 480 px of canvas width. `npm run measure:project-explorer -- --only tree` reported `{"status":"passed","passed":true,"failures":[]}`, with MT14's 15 nodes and 15 minimap marks at 1031 px and 691 px. `ModuleTreeCanvasProps` is unchanged, so the web module's call site needed no edit. |
| BR08 | The By module fitted zoom at 1440×1000 is at least twice 0.177, with browser evidence at both widths | 5 | `00f8c7b` | **Met.** 0.4066, 2.30 times 0.177, on a 992 × 778 canvas. Narrow evidence at 390 × 844 records 0.1398, unchanged because the width cap never bound there. 0 console messages at any level. The evidence is a Chromium session, not a test command; see [what is not repeatable](#what-is-not-repeatable-by-a-command). |
| BR09 | The root audit and the recorded ramify-audit request pass on the same commit | 6 | this commit | See [the two audits](#the-two-audits). |

## Runnable outcome, line by line

The plan's opening block, read against what this commit produces.

| Line | Holds? |
| --- | --- |
| `cucumber-viz audit, repository root -> PASS (static, regression)` | See [the two audits](#the-two-audits). |
| `ramify-audit of ramify-agent, same commit -> PASS, request recorded` | The request is recorded at [`ramify-agent/audit/ramify-agent-suite.request.json`](../../../audit/ramify-agent-suite.request.json) with its [README](../../../audit/README.md). The run is in [the two audits](#the-two-audits). |
| `npx tsx scripts/validate-final-contracts.ts -> exit 0` | **Holds.** Exit 0, after this iteration's added layer. |
| `ramify check --batch on Ramify -> coverage: complete` | **Holds.** 0 analysis limits, 15 owners. |
| `Run page, Progress -> By module at 1440x1000 -> rows readable at the fitted zoom` | **Holds on iteration 5's browser evidence,** which records every capability identifier in the fitted canvas as legible without zooming. It is a recorded session, not a command this commit can re-run. |

Note that the block's fourth line is about Ramify's own check. ramify-agent's
`check:self` reports `coverage: partial`; see [the 87 limits](#ramify-agents-87-analysis-limits).

## The two audits

Both audits ran on this commit, with the tree clean.

<!-- AUDIT-EVIDENCE -->

## Frozen gates

Run from the worktree root at this commit, after `npm install`,
`npm run build` and `npm run worktree:prepare`.

```console
$ npx tsx scripts/validate-final-contracts.ts
{"owners":15,"files":455,"expandedStatements":164,"packageEntries":8,"bin":"dist/src/ramify"}
$ echo $?
0
```

```console
$ npx vitest run --config scripts/reference-harness/vitest.config.ts \
    plan2.test plan5.test plan2a.test instances.test completion.test \
    plan5-completion.test completion-regression.test completion-composition.test \
    final-contracts.test verify.test
 Test Files  10 passed (10)
      Tests  77 passed (77)
   Duration  51.49s
```

That is iteration 2's recorded 10 files and 77 tests, reproduced here.

```console
$ npx vitest run --config scripts/reference-harness/vitest.config.ts \
    scripts/reference-harness/plan2b.test.ts
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
   Duration  133.23s
```

The one failure is AV29, on `metrics`:

```text
AssertionError: reference: expected { …(10) } to match object { …(8) }
-   "metrics": "unavailable",
+   "metrics": "measured",
```

It is pre-existing. Iteration 2 verified it fails identically at `b77b6f6`,
the plan's base, on the same two lines. It belongs with Ramify Plan 2C's
measurements, not with this plan. AV34, the entry case iteration 2 rewrote,
passes in the same run.

`npm run type-check` exits 0 at this commit, over all four compiler scopes.

### The gate repair at integration

Iterations 1 and 2 ran in separate worktrees, both cut from `b77b6f6`.
Iteration 1 added three signature companions to three declarations, and
iteration 2's reviewed layers were written against a tree without them. Merged,
the gate reported drift again:

```text
Plan 2 final contracts are incomplete
- Final selections differ: ./module.ramify
- Final selections differ: subs/presentation/subs/layout/module.ramify
- Final selections differ: subs/service-api/module.ramify
```

The repair follows iteration 2's own precedent rather than loosening anything:
one more named layer in `scripts/validate-final-contracts.ts`, **the declared
toolkit signatures**, carrying exactly the five selections iteration 1 added:

```text
./                             expose-sub ExplorerProjectionResult, ExplorerProcedures from service-api to descendants
subs/presentation/subs/layout/ expose-src LayoutGeometry from "geometry.ts" to parent
subs/service-api/             expose-src ExplorerProjectionResult from "project-view.ts" to parent
subs/service-api/             expose-src ExplorerProcedures from "router.ts" to parent
```

No archived review, reviewed table or assertion inventory was edited. The
layer's comment cites the declarations themselves and
`subs/service-api/src/tests/router-typing.test.ts`, which restates their
identity; the toolkit's own script never names this project. `files` moved
from 454 to 455 and `expandedStatements` from 163 to 164, both for iteration 1's
added test file and statement. No gate asserts either literal.

### The reviewed parser fixtures, found by the first root audit

The first root audit of this iteration's commit **failed**, and found a second
record iteration 1 had left behind. `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`
holds every current project description as a reviewed exact-text parser
fixture, and iteration 1's three declarations were still recorded without their
new companions:

```text
× parses module.ramify to the reviewed statements
× parses subs/presentation/subs/layout/module.ramify to the reviewed statements
× parses subs/service-api/module.ramify to the reviewed statements

 Test Files  1 failed | 168 passed (169)
      Tests  3 failed | 2257 passed (2260)
```

Iteration 1's focused runs covered `subs/explorer`, `subs/service-api` and
`subs/presentation/subs/layout`, and this fixture lives in
`subs/analysis/subs/descriptions`, so nothing it ran reached the record. The
three fixture entries now name `LayoutGeometry`, `ExplorerProjectionResult` and
`ExplorerProcedures` beside the symbols they accompany, and the file passes
with 31 tests. The correction is part of this iteration's commit, which was
then re-audited.

### BR02's second half: the four reference self-check instances

**Deferred by explicit decision, and therefore unverified.** The long
`reference:verify` completion suites were not run in this iteration. The four
instances are:

| Instance | Suite |
| --- | --- |
| `I1-27:self-check` | Plan 1 |
| `I1-27:self-negative` | Plan 1 |
| `I2-30:self-check-fifteen` | Plan 2 |
| `I5-14:self-check-fifteen` | Plan 5 |

Iteration 2 renamed the last two from `self-check-eleven`. Both run `check:self`
through `assertToolkit`, which has required exactly fifteen implemented owners
since `1bbd588`; only their ids and required results still said eleven. The
mapping is recorded as `renamedInstances` in
`scripts/reference-harness/instances.ts`, and `plan2.test.ts` and
`plan5.test.ts` each assert that the new id is in the inventory and the runtime
and the old id is in neither.

Iteration 2's reading of what a later run should expect, once the suites are
run:

| Suite | Expected | Why |
| --- | --- | --- |
| Plan 1 | Still failing before iteration 2's repair; its regression record is now repaired, so the recorded revisions and restatement should let it through | `assertPlan1Regression` compares the archived record definitions with the current inventory; `restatedByPlan8` names the one restated record, `I1-09:signature-only-type`, and `unchangedRecordCount` is 304. |
| Plan 2 | `I2-30:declarations-final` passes; `I2-30:self-check-fifteen` should now pass | The gate exits 0 and the assertion reads `[15, 8]`. The self-check instance needed iteration 1's analysis-limit work, which is done: `check:self` reports `complete` with 0 limits over fifteen owners. |
| Plan 2A | `I2A-13:declarations-package` passes; `I2A-13:plan3-preserved` passes | Same gate, plus the reviewed entries and the recorded additions. `I2A-13:predecessor-regressions` depends on the Plan 1 record above. |
| Plan 5 | `I5-14:declarations-final` and `I5-14:package-entries` pass; `I5-14:self-check-fifteen` should now pass | Same gate and the relocation form, plus iteration 1's work for the self-check instance. |

The two self-check instances also pinned eleven owners while `check:self`
completes fifteen; that was iteration 2's KI-3 drift, and it is closed.

## BR06's two halves

**Focus into view is met by iteration 5's browser evidence, not by iteration
4's unit tests alone.** Iteration 4 added the focus handler and three canvas
tests, and they passed. In Chromium the behavior did not work: the browser
scrolls a scrollable ancestor to reveal the element it focuses, here React
Flow's own element by 564 px left and 1108 px top, and React Flow resets that
scroll a moment later. The canvas measured the row where the browser had
briefly put it, read it as already in view, and never panned. jsdom applies no
such scroll, so nothing in the unit suite could see it.

Iteration 5 corrected it in iteration 4's own module, with an `unscroll` helper
that undoes that scroll before the canvas measures, and added a regression case
that fails against the previous implementation. The browser evidence is then
positive at both widths: with the 61-row tree at zoom 1.0459, `check-060` moved
from 1109 px right and 1714 px below the 990 × 776 viewport to 396 px, 369 px
inside it, at the unchanged zoom; narrow, from 716 px, 1421 px outside to
82 px, 229 px inside the 340 × 492 viewport.

**Space isolation is proven by unit test only.** The canvas test stands a
document `keydown` listener in for React Flow's, which `useKeyPress` attaches
to the document, and verifies that Space on a body control never reaches it
while Space on the shell and the pane does. No browser session exercised it.

So KI-9 and KI-11 both have unit-test evidence, and only KI-9 has browser
evidence, from iteration 5's session.

## The fixture's two standing warnings

Iteration 3's guard freezes the fixture's warning set rather than requiring
literal zero warnings:

```text
outside-module-source vite.config.ts
outside-module-source vitest.config.ts
```

The fixture's own `tsconfig.json` includes those two files alongside `src` and
`subs/**/src`, and they lie outside every module's `src/`. Ramify warns about
compiler-selected source outside a module without failing the check. Requiring
zero warnings would mean changing the fixture, which the iteration had to leave
untouched; the same two warnings appear in Plan 3's retained trial evidence, so
they are a standing property and not a drift. Any other warning, and any change
to these two, fails the guard.

**BR05 requires zero errors, and that is met**: 0 errors and 0 denied, with
`outcome: checked`, exit code 0, `execution: completed` and `check: passed`.
The guard was also hand-verified to fail: removing one companion from the
fixture's `pure-ui` declaration produced an `exposed-without-companion` finding
and the `not-visible` import it entails, and the fixture was restored.

## ramify-agent's 87 analysis limits

`npm --prefix ramify-agent run check:self` at this commit:

```text
Execution: completed; check: passed; coverage: partial
Completed scope: 8 owners, 276 source files, 13 resources, 4803 accesses
Findings: 0 errors, 0 warnings, 87 analysis limits; 3418 allowed, 0 denied, 1385 external
```

All 87 are `signature-inferred`: 80 in `subs/harness/src/interfaces/protocol`,
5 in `subs/harness/subs/evidence/src`, and one each in `subs/harness/src/work`
and `subs/harness/src/run`. **No iteration of this plan owns them.** Iteration 1
covered the toolkit's ten only; the plan scoped nothing to ramify-agent's own.
The check passes with no error and no warning, and the audit evidence records
`partial` for this project. Ramify's own `check:self` does report
`coverage: complete` with 0 limits.

## What is not repeatable by a command

Iteration 5's browser evidence is a recorded Chromium session driven through
the Playwright MCP server against
`subs/harness/src/tests/helpers/serve-progress-fixture.ts`, not a committed
browser script. The measurements and screenshots are retained in
[iteration5-artifacts/](iterations/iteration5-artifacts/), and
`browser-evidence.json` holds the values, but no test command reproduces them.
This is the same standing in the capability progress plan, whose iteration 6
evidence has the same form.

## Iteration 2's three reviewed changes beyond KI-2 and KI-3

Each was separately reviewed and approved, and each is recorded so it is not
read as scope creep.

1. **The `I1-09` restatement revision.** Ramify Plan 8's `ff01212` restated one
   Plan 1 record's text, `I1-09:signature-only-type`, when the reference
   example declared its signatures. `restatedByPlan8` names that one record and
   cites the commit; `revisedDefinitions` is the union of Plan 2's three
   expectation revisions and that restatement, and `unchangedRecordCount` moved
   from 305 to 304 as the single exported source of the byte-identity count.
   The archived definitions are untouched.
2. **The `self-check-fifteen` rename.** `I2-30:self-check-eleven` and
   `I5-14:self-check-eleven` became `I2-30:self-check-fifteen` and
   `I5-14:self-check-fifteen`, in eight files, with `renamedInstances`
   recording the mapping and the archived acceptance JSON keeping the old ids.
3. **The `14c5c2a` reviewed-row correction and the `I2A-13:plan3-preserved`
   reinterpretation.** `14c5c2a` took `I2-29:repeated-edit-plateau` to 40
   alternating cycles judged over the last 30 and left Plan 2's reviewed row
   saying 200 over the last 100; the row is corrected to match the executable
   record, with `correctedInstanceRows` naming the instance and the commit.
   `I2A-13:plan3-preserved` now asks its question at Plan 2A's completion,
   where the answer is settled — `git diff --quiet 71643d5 d5c2498 -- docs/plans/iteration-3-project-inspection`
   exits 0 — and additionally requires every later change to that tree to be a
   recorded approved decision, today `14c5c2a` alone.

## Plan 7's record

[`baseline-failures.md`](../07-commit-audit-integration/baseline-failures.md)
gained a resolution note on its status line: BF-1 to BF-5 were corrected in
`d2fca15`, with `refs/audited/runs/2026-09-22T18-54-47Z-d2fca150e` as the
evidence. Its diagnostic text is unchanged.

## Known issues, closed and left open

| ID | Standing |
| --- | --- |
| KI-1 | Closed by iteration 1. |
| KI-2 | Closed by iteration 2. |
| KI-3 | Closed by iteration 2, and by this iteration's added layer for iteration 1's own selections. |
| KI-8 | Closed by iteration 5. |
| KI-9 | Closed by iteration 4 and corrected by iteration 5; browser evidence at both widths. |
| KI-10 | Closed by iteration 4. |
| KI-11 | Closed by iteration 4; unit-test evidence only. |
| KI-12 | Closed by this iteration: the request is recorded, and both audits run on one commit. |

Left open, and not this plan's:

- **AV29** in `scripts/reference-harness/plan2b.test.ts`, failing identically
  at `b77b6f6`. It belongs with Ramify Plan 2C's measurements.
- **ramify-agent's 87 `signature-inferred` limits**, which no iteration owns.
- **The four reference self-check instances**, deferred as recorded above.
