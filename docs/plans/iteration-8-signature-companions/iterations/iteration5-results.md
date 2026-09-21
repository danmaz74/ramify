# Iteration 5 results: exposing fixture, latency and memory evidence, completion

**Recorded:** 2026-09-21. **Status:** complete as an evidence iteration; the plan's
completion gate is **not fully met**. SC23 to SC26 have their evidence, and the
companion pass is within SC24's budget, but three measured budgets are exceeded:
SC23 on X100's deleted row, SC24's description-stage growth and SC25's
`factBytes` growth. SC26's Plan 1 gate fails on harness pins of the pre-plan
reference example. They are
recorded below with their causes and the proposals for Dan's decision; no budget
or expectation was relaxed. This report is also the plan's completion report:
the [plan completion](#plan-completion) section covers SC01 to SC27 and RD-1 to RD-7.

Direct work in `/tmp/ramify-plan8-signature-companions`, branch
`feat/plan8-signature-companions`, on iteration 4's `43b6bb9`. Pre-plan values
come from the same host, measured in a detached temporary worktree at `6dd9b4c`,
the plan-only commit above `49193ed`. That worktree received the conforming
reference example of iteration 4 and this iteration's measurement scripts, so
both builds measured the same input bytes with the same recipe. It was removed
afterwards.

## Prerequisites

Iteration 4's handoff holds on this build. `dist/src/ramify check --root . --batch`
exits 0: 15 owners, 432 source files, 6,486 accesses, 0 errors, 10 analysis
limits, 4,524 allowed, 0 denied. The reference example exits 0: 15 owners, 54
source files, 298 accesses, 0 errors, 2 warnings, 11 analysis limits.

## Deliverables

### 1. The exposing fixture, X100

`syntheticOwnerFiles(n, { exposures: true })` in
`scripts/probes/fixtures/synthetic-owners.ts`, materialized as `X100` by
`materialize.ts`. Every non-root owner exposes its `interfaces/api.ts` by
wildcard and its nine `run<N>` functions by name to parent. Each `run<N>`
signature names `Input` and `Output` of its own `api.ts` and the `Input` of the
preceding owner. The root is the grouping level: it re-exposes each tenth owner's
contract, and every `Input` a signature names, to descendants under
owner-suffixed aliases, since names exposed by one module must be unique.

Two deviations from the iteration text, both forced by the model:

- **The preceding owner is the nearest preceding untagged owner.** Every tenth
  owner is tagged `testing` and the root `dispatch`, and an untagged importer may
  import neither. With the literal "preceding owner", owner 11 would name owner
  10's `testing` type and fail `requires-tag`, so the fixture would not pass the
  rule.
- **`Output` and an annotated `value` were added to `api.ts`**, so that each
  signature names two `api.ts` types and the wildcard exposes no unannotated
  constant. The project then passes with complete coverage and no
  `signature-inferred` note.

The generated X100 has 100 owners, 1,402 files and 1,214,590 bytes, content map
`d58d6f58…a6ed2`. Its model has 1,200 originals, 1,385 effective exposures and
2,682 named companions. The default output is unchanged: `materialize.ts` still
asserts S100's content-map hash `d5b77b9f…0c0897`, and every S100, S500 and
S1000 byte is identical.

### 2. The two edit classes

In `fast-fixture.mjs`, for the reference example and X100:

| Class | Reference example | X100 | Expected path |
| --- | --- | --- | --- |
| `signature` | `summarizeTaskResult` gains an optional `import('./inspection-task.js').InspectionTaskInput` parameter, a type already exposed where the function is | `run0` of `m002` gains `seed?: typeof value`, `value` being exposed by wildcard | `source` |
| `companion` | the root's `ToolInputSchema, ToolResult … to descendants` loses `ToolResult`, then regains it | `m099`'s wildcard of `api.ts` becomes `Input, value`, then the wildcard again | `description` |

A removal fails the check on the final build with only `exposed-without-companion`
findings located in the edited `module.ramify`: 1 on the reference example and 9
on X100, one per `run<N>` of `m099` naming `Output`. No import is denied.

`fast-assertions.mjs` accepts the tenth timing field, `companions`, exactly when a
build reports it, and pins the `signature-inferred` notes a build enforcing the
rule adds: the reference example's eleven, and one on S100, S500 and S1000, whose
measurement setup exposes m001's literal-initialized `value` (open decision 2).
A pre-plan build must report none. `companion-assertions.test.mjs` covers these
predicates. `hook-latency-x100` is a new `measure:fast` workload and joins no
derived row or deferral trigger. `companion-stages.mjs` measures stage timings
and retained facts through a real daemon; `scripts/measurements/README.md`
documents X100, the classes and the script.

### 3. Harness defects found and fixed

Each was found by a measurement on this build and fixed in the recipe, not in
the expectation; the affected runs were repeated and are marked superseded in
`results/index.json`.

| Defect | Found by | Fix |
| --- | --- | --- |
| The racing-hook predicate's `coveringEdit` required empty coverage, so the reference example's eleven pinned notes failed every racing hook | `hook-latency-reference`, 14:13 | `coveringEdit`, `racingHookAttributed` and `completedCold` take the fixture and accept exactly its pinned notes |
| S100's exposed `value` sets `inferred`, and no note was pinned for S100 | `repeated-edit-plateau`, 14:22 | the pinned set above |
| `resident-daemon.mjs` wrote `measurement.json` in place, so a 50 ms telemetry poll could read a torn file, record null instrumentation and fail the lifetime-total predicates | `repeated-edit-plateau`, 14:22 | the snapshot is written beside the file and renamed over it. This defect predates the plan: Plan 5 waived the plateau row and never ran it |

### 4. Measurements

Every measurement ran one at a time with owned endpoint directories. The host
was shared with other agent sessions: one ran a `ramify-agent` Vitest suite and
a pi session, and one other Ramify daemon was idle. Load averages ranged from 1 to
5 on 12 logical CPUs (Xeon E-2176G, Linux 6.8, Node 22.23.2), and `RAMIFY_MEASUREMENT_ACTIVITY` records this in every
archive. A 1 s CPU-idle sampler marks the cycles that overlapped contention. The
medians below include every cycle; the medians of contention-free cycles differ
from them by less than the row-to-row noise.

## SC23: hook latency

`npm run measure:fast -- --workload hook-latency-reference` and
`--workload hook-latency-x100`, installed executable and a real daemon, twenty
cycles a row. Hook medians end to end, in milliseconds:

| Row | Reference pre-plan | Reference final | X100 pre-plan | X100 final | X100 cycles on the expected path, pre / final |
| --- | ---: | ---: | ---: | ---: | --- |
| body (racing) | 101 | 96 | 272 | 252 | 17 / 16 |
| source | 155 | 142 | 641 | 670 | 16 / 15 |
| description | 142 | 160 | 564 | 456 | 16 / 15 |
| README | 96 | 98 | 147 | 144 | 16 / 15 |
| created | 557 | 509 | 767 | 852 | 16 / 20 |
| deleted | 590 | 551 | 717 | **4,237** | 16 / 9 |
| configuration (not checked) | 101 | 119 | 94 | 96 | 20 / 20 |
| signature (new) | 456 | 464 | 194 | 499 | 0 / 15 |
| companion (new) | 162 | 154 | 350 | 518 | 16 / 15 |
| published | 112 | 103 | 92 | 91 | 16 / 15 |

The reference example's workload passes every predicate on both builds. The
configuration row's hook, answered at once as not checked, grows by 18 ms on the
reference example and 2 ms on X100, within SC23's 60 ms. The background broad
revision's session work is 1,627 and 1,716 ms on the reference example, and
3,822 and 3,788 ms on X100.

**SC23 fails on one row.** X100's deleted row has a 4,237 ms median, over the
2 s budget; every other row of both fixtures is within it. On its expected path
the deleted row's median is 801 ms, against 705 ms before the plan.

The cause is the retained-fact limit, not the rule's work. X100 retains about
16.3 MB of facts per version before the plan and 18.8 MB after it (SC25).
`maxRetainedFactBytes` is 96 MiB summed over the retained versions. The limit is
reached after six versions before the plan and after five after it. The
publication that would exceed it fails, and the next revision rebuilds broad, at
3.5 to 6.2 s. Every row therefore takes the broad path on about one cycle in five
before the plan and one in four after it. The deleted/created pairs alternate, so
after the plan the rebuild falls on every other deleted cycle, and the median
moves from the membership path to the broad path. The workload's revision-path
predicate fails on those cycles on both builds, and the pre-plan signature row
cannot take the `source` path at all: its surfaces carry no companions. X100's
workload therefore fails on both builds, on path predicates only; every other
predicate passes. S100 at 8.4 MB a version never reaches the limit.

The pre-plan signature row, 194 ms, is the `unchanged-surface` cost of the same
edit; after the plan the edit changes a surface and takes the `source` path, as
the plan intends.

## SC24: the companion pass and the description stage

`node scripts/measurements/companion-stages.mjs`, run twice on each build,
alternating builds. Each run takes a cold open, ten `tsconfig.json` target
edits on the broad path and ten `module.ramify` comment edits on the
description path per fixture. The medians below are over the 20 broad and up to
20 description revisions on their expected path. The toolkit tree is iteration 4's
conforming source on both builds.

| Fixture | `companions`, broad | `companions`, description | `companions`, cold | Budget | Hook workloads, median per row |
| --- | ---: | ---: | ---: | ---: | --- |
| Reference example | 1.02 ms | 0.92 ms | 2.2 ms | 5 ms | 0.9 to 1.6 ms |
| Toolkit | 14.4 ms | 10.5 ms | 14.7, 26.2 ms | 20 ms | not a hook fixture |
| X100 | 12.9 ms | 11.2 ms | 15.1, 13.2 ms | 20 ms | 10.6 to 12.3 ms |

**The pass is within its budget on all three**, measured as its own stage timing
inside `decide`. Single revisions exceed it: the toolkit's second cold open took
26.2 ms, and the X100 hook workload's maxima reach 53 ms on a contended cycle.
The reverse index is therefore not proposed.

| Fixture | `descriptions`, broad, pre-plan | final | Growth | Budget |
| --- | ---: | ---: | ---: | ---: |
| Reference example | 50.0 ms | 59.8 ms | +19.6 % | 15 % |
| Toolkit | 770.9 ms | 1,061.1 ms | +37.7 % | 15 % |
| X100 | 489.7 ms | 591.9 ms | +20.9 % | 15 % |

**The description stage exceeds its 15 percent budget on all three**, on the
path that describes every file. The cold-open description stage, one sample a
run, is noisier: reference example 153 and 145 ms before the plan, 193 and
214 ms after it; toolkit 1,428 and 1,367 before, 1,555 and 3,190 after; X100
750 and 683 before, 723 and 781 after. The added work is companion collection:
one batched symbol request per described file and the syntactic walk.
Iteration 2 measured it in process at 88 to 127 ms of a 730 to 1,020 ms toolkit
round. The host's contention inflates every figure but affects both builds alike;
alternating two runs each gave consistent broad-path medians. The description
path, which relinks with no compiler work, also grew: link 16 → 20 ms, 232 →
286 ms and 197 → 273 ms. The link stage carries companion facts into the model.

## SC25: retained facts, plateau and many contexts

`factBytes` per retained version is the serialized size of the session's facts,
read from the daemon after a cold open. For S100 it is the plateau's eight-version
total divided by eight.

| Fixture | Pre-plan | Final | Growth | Budget |
| --- | ---: | ---: | ---: | ---: |
| Reference example | 1,357,642 | 1,557,050 | +14.7 % | 5 % |
| Toolkit | 23,860,987 | 28,545,118 | +19.6 % | 5 % |
| X100 | 16,310,756 | 18,788,952 | +15.2 % | 5 % |
| S100 (no signature exposures) | 8,366,707 | 9,451,948 | +13.0 % | not an SC25 fixture |

**SC25's `factBytes` budget fails on all three.** A scratch decomposition,
`JSON.stringify` of every `SessionFacts` key through the real retained session
on both builds, finds the cause: the plan estimated one copy of the companion
facts, and the facts serialize it four times plus once per access decision.

| Part of the growth | Reference | Toolkit | X100 |
| --- | ---: | ---: | ---: |
| One copy of every original's `companions` | 31,521 | 574,112 | 511,650 |
| The same, in `files[*].description`, `catalog`, `linked` and `model` (4 copies) | 126,084 | 2,296,448 | 2,046,600 |
| `decisions`: each `ImportDecision.original` embeds the whole `Original` | 65,574 | 2,338,982 | 312,354 |
| Description `dependencies`, the companion resolution edges | 3,279 | 44,738 | 119,196 |
| `companions` outputs, findings and notes | 4,457 | 3,949 | 32 |
| Total growth | 199,408 | 4,684,131 | 2,478,196 |

One copy, with the dependency edges and outputs, is 39 KB (2.9 %), 623 KB
(2.6 %) and 631 KB (3.9 %): within 5 percent on all three. The in-memory objects
are shared frozen references, so heap growth is smaller than the serialized
growth. The retained-fact limit and SC25 both use the serialized size, which is
what brings X100 to the limit sooner (SC23). Empty facts on unexposed originals
cost 5,429, 79,769 and 70,801 bytes a copy; RD-2 records them deliberately.

> **Correction, 2026-09-21 ([iteration 6](iteration6-results.md)).** The
> statement that the in-memory objects are shared frozen references is wrong
> for this build. Only `catalog` and `files[*].description` shared their
> objects. `linked.modelInput` and `model` were distinct, content-equal copies:
> linking detached its model through a JSON round trip and the session built the
> model a second time. Each `ImportDecision.original` was a further copy of the
> model's original. Iteration 6 makes these layers share one frozen model and
> counts retained facts by object identity.

**The plateau and many-contexts rows hold.**

- `I5-13:repeated-edit-plateau`, 200 alternating edits on the reference example
  and S100: passes on both builds. The only ideal miss, the reference example's
  compiler server RSS, is present on both: 257.8 MB before and 277.2 MB after,
  against 192 MiB. Growth over the last 100 cycles: combined RSS 12.5 → 7.7 MB
  (reference example) and 8.1 → 0 MB (S100); worker heap beyond history 3.9 → 0
  MB and 0.06 → 0 MB; all within 64 and 16 MiB.
- `I5-13:hot-warm-memory`, Plan 5's two hot and six warm S100 contexts: passes,
  combined RSS 1,366 MiB of 1,536 MiB, 9,451,936 bytes of facts per context, on
  the final recipe.
- `I2-29:many-contexts`, the row Plan 5's addendum fixed: passes all its
  predicates. Settled RSS is 131.4 MiB of 1,024 MiB, global retained bytes
  72.3 MiB of 512 MiB, and 9,447,268 bytes of facts per context. Plan 5 closure
  recorded 134.2 MiB, 64.1 MiB and 7.98 MiB.

## SC26: regression gates

**2026-09-21:** [iteration 7](iteration7-results.md) clears the reference
example's pins: the Plan 1 gate passes 274 of 308, and the remaining failures
come from fixture F's `value` and the toolkit's own notes.

**`npm run reference:verify -- --plan 1` fails on the final build: 308 required
instances, 212 passed, 96 failed, none unexecuted** (11 min 34 s). The same gate
on the pre-plan build, with the pre-plan example, passes 306 and fails 2
(17 min 21 s), so 94 failures are new. None is a Ramify finding: every new
failure is a harness pin of the pre-plan reference example that the rule or
iteration 4's remediation changed. Iteration 4's handoff predicted this.

| Failures | Cause | Instances |
| ---: | --- | --- |
| 51 | The baseline expects `coverage: 'complete'`; the conforming example reports its 11 `signature-inferred` notes, so coverage is `partial` | `I1-01:baseline`, `I1-23`, `I1-24` and others |
| 20 | The baseline static occurrence count of the reference example, pinned at 292, is now 296: iteration 4 added imports | `I1-06`, `I1-07`, `I1-08` cases |
| 22 | The baseline application decision count, pinned at 164, is now 167, for the same reason | `I1-12`, `I1-15`, `I1-16` cases |
| 1 | `I1-09:signature-only-type` asserts that `ToolInputSchema`, a type only a signature names, is unexposed. The rule now requires its exposure, and iteration 4 exposed it | `I1-09:signature-only-type` |
| 2 | Present before the plan. `I1-28:relocated-package` fails first on the partial coverage, where it failed on an exit code before. `I1-30:production-selection/toolkit` pins a build file list without the explorer assets | `I1-28:relocated-package`, `I1-30:production-selection/toolkit` |

The pins were not updated. Updating 93 of them to the conforming example's
values is mechanical, but `I1-09:signature-only-type` asserts behaviour the rule
reverses. Its premise needs a decision, so all of them are left for Dan
(open item 6). The portable reports are archived as
`plan8-gate-plan1-final.json.gz` and `plan8-gate-plan1-preplan.json.gz`.

The focused suites of Plan 5 and the structural-edit plan are listed under
[checks run](#checks-run). They ran directly, not through the cucumber-viz
commit audit, because that audit runs the whole suite, which this assignment
excludes.

## Proposals for decision

These are recorded, not implemented. Iteration 5 owns evidence only.

1. **Retain companion facts once (SC25).** Serialize `companions` once per
   original and not in all four layers, and let `ImportDecision` carry an
   `OriginalId` or an `Original` without `companions`. The decomposition
   predicts growth of 2.6 to 3.9 percent, within SC25, and X100 would again
   reach the retained-fact limit only after six versions. This changes
   `analysis`, `descriptions` and `model` contracts. The alternative is to
   accept the measured 13 to 20 percent.
2. **Retained-fact limit behaviour (SC23).** When the retained sum would exceed
   `maxRetainedFactBytes`, the publication fails and the next edit rebuilds
   broad, which costs 3.5 to 6 s on X100. Evicting the oldest retained version
   first would keep the narrow path. That behaviour predates this plan; X100 is
   the first fixture to reach the limit. Proposal 1 alone restores the pre-plan
   rebuild frequency but not its absence.
3. **Description-stage cost (SC24).** The collection costs one batched request and a
   syntactic walk per described file. Options are to accept the measured 20 to 38 percent on
   the broad path, or to collect facts only for files whose exported originals
   are exposed, which RD-2 rejected because a `module.ramify` edit would then
   need compiler work.

## Checks run

- `node --test scripts/measurements/*.test.mjs`: 61 tests pass, including
  `companion-assertions.test.mjs` and the X100 case of `fast-fixture.test.mjs`.
- The focused suites of the structural-edit plan's closure, which cover Plan 5's
  owners, each run as its own `npx vitest run` over the directory's test files:

| Suite | Files | Tests | Result |
| --- | ---: | ---: | --- |
| `subs/analysis/src/tests` | 33 | 387 | pass |
| `subs/analysis/subs/project/src/tests` | 9 | 160 | pass |
| `subs/analysis/subs/typescript/src/tests` | 19 | 215 | pass |
| `subs/daemon/subs/contexts/src/tests` | 12 | 167 | pass |
| `subs/daemon/src/tests` | 20 | 235 | pass |
| `subs/cli/src/tests` | 7 | 205 | pass |
| `src/tests` | 19 | 88 | **3 fail** |

  The three failures reproduce alone and are pins of the pre-plan reference
  example, like the gate's: `dependency-analyzer-process.test.ts` expects 48
  non-behavioral dependencies and finds 50, after iteration 4's added imports;
  `dependency-diagram-daemon.test.ts` (BD24) expects coverage `complete`; and
  `dependency-view-server.test.ts` (BD28) expects the dependency view's state
  `complete` and finds `partial`, because the example's 11 nonblocking notes make
  its coverage partial. They belong to Plan 6D's owners and were not changed
  (open item 6).
- The measurements above, archived under `scripts/measurements/results/` and
  indexed in `results/index.json`:

| Workload | Build | Archive | Outcome |
| --- | --- | --- | --- |
| `hook-latency-reference` | pre-plan | `fast-2026-09-21T13-53-16.968Z-4df783c0-….json.gz` | passes |
| `hook-latency-x100` | pre-plan | `fast-2026-09-21T14-00-13.233Z-faf531d1-….json.gz` | path predicates fail, as above |
| `repeated-edit-plateau` | pre-plan | `fast-2026-09-21T15-03-09.859Z-2530dfac-….json.gz` | passes |
| `hook-latency-x100` | final | `fast-2026-09-21T14-35-24.787Z-d19ea3ed-….json.gz` | path predicates fail, as above |
| `hook-latency-reference` | final | `fast-2026-09-21T14-45-52.606Z-05325119-….json.gz` | passes; `verify-fast-evidence.mjs` passes |
| `repeated-edit-plateau` | final | `fast-2026-09-21T14-53-02.403Z-f611075f-….json.gz` | passes; `verify-fast-evidence.mjs` passes |
| `hot-warm-memory` | final | `fast-2026-09-21T16-01-54.380Z-468d2522-….json.gz` | passes; `verify-fast-evidence.mjs` passes |
| `I2-29:many-contexts` | final | `resident-2026-09-21T15-14-38.854Z-6fac5cf4-….json.gz` | passes |
| Stage timings | both | `companion-stages-2026-09-21T14-09-52.254Z-preplan`, `…T14-17-47.436Z-final`, `…T15-16-03.819Z-preplan`, `…T15-19-33.009Z-final` (`.json.gz`) | complete, no failure |
| Fact decomposition and index lookup | both | `plan8-fact-decomposition.json.gz`, `plan8-exposure-index.json.gz` | scratch probes |

  Four earlier final-build archives of the same day are marked superseded in the
  index: an X100 run whose recipe changed while it ran, the two runs that found
  the harness defects above, and a `hot-warm-memory` run on the recipe before
  those fixes, which passed.
- The scratch probes ran as temporary Vitest files in `subs/analysis/src/tests/`
  of each checkout and were removed. They are not committed.
- `dist/src/ramify check --root . --batch` and the reference example's batch
  check, as in [prerequisites](#prerequisites).
- Not run: S500, S1000 and macOS, as the plan states; the full toolkit suite.

## Handoff

- **Exposure index lookup cost**, over the frozen models of real batch runs:

| Measure | Reference example | Toolkit | X100 |
| --- | ---: | ---: | ---: |
| Modules, originals, effective exposures | 15, 92, 98 | 15, 1,352, 1,083 | 100, 1,200, 1,385 |
| Index build, median | 0.14 ms | 1.29 ms | 1.56 ms |
| `visibleIn`, per query | 0.69 µs | 0.45 µs | 0.38 µs |
| `explainVisibility` path search, per query | 12.2 µs | 7.7 µs | 7.0 µs |
| `listCompanionViolations` with the index, median | 0.90 ms | 4.74 ms | 7.34 ms |
| Whole pass, `companionOutputs`, median | 1.36 ms | 12.0 ms | 12.6 ms |

  A lookup is 17 to 18 times faster than the path search. This is the input the
  inspection successor and Plan 7 need for replacing `visibilityFor`'s search.
- **`signature-inferred`**: 10 notes on the toolkit and 11 on the reference
  example, no `signature-unresolved`. The `inferred` fact is set on 118 of the
  toolkit's 1,352 exported originals and 13 of the example's 92; notes are
  reported only for exposed ones.
- X100 and the two edit classes are available to later measurements. X100 reaches
  the retained-fact limit; a recipe that needs narrow paths throughout must use
  fewer cycles or follow proposal 2.

## Plan completion

### Acceptance

| ID | Iteration | Evidence | Result |
| --- | ---: | --- | --- |
| SC01–SC10 | 1 | [iteration 1 results](iteration1-results.md): plain-data models through `listCompanionViolations` and `explainImport` | pass |
| SC11–SC15, SC27 | 2 | [iteration 2 results](iteration2-results.md): the real compiler on fixture files, in process, retained and batch | pass |
| SC16–SC20 | 3 | [iteration 3 results](iteration3-results.md): batch, retained session and the installed CLI against a real daemon | pass |
| SC21–SC22 | 4 | [iteration 4 results](iteration4-results.md): toolkit and reference example conform; documents | pass |
| SC23 | 5 | X100 and reference hook rows above | **fails on X100's deleted row** (4,237 ms); every other row within 2 s; configuration row +2 and +18 ms |
| SC24 | 5 | `companions` stage timing; description stage | **pass for the pass** (1.0, 14.4, 12.9 ms); **description stage fails** (+19.6, +37.7, +20.9 %) |
| SC25 | 5 | `factBytes`; plateau; many contexts | **`factBytes` fails** (+14.7, +19.6, +15.2 %); plateau and many-contexts rows hold |
| SC26 | 5 | [SC26](#sc26-regression-gates), [checks run](#checks-run) | **fails**: the Plan 1 gate on 94 new harness pins of the pre-plan example (212 of 308 pass; 306 before the plan), and 3 `src/tests` pins; the other six focused suites pass |

### Contract decisions

| Decision | Disposition |
| --- | --- |
| RD-1, a decide-stage finding on a valid model | Delivered: `exposed-without-companion`, category `exposure`; a violation never invalidates the execution (SC17) |
| RD-2, facts for every exported original | Delivered; a `module.ramify` edit needs no compiler work (SC18, SC20). The empty facts of unexposed originals are part of SC25's growth |
| RD-3, subset test on required-importer tags | Delivered by kind, never by name (SC07, SC08) |
| RD-4, public and protected members | Delivered, including private parameter properties (SC12) |
| RD-5, facts on the original with position-free surfaces | Delivered (SC15, SC27). Its four serialized copies cause most of SC25's growth; proposal 1 |
| RD-6, delivered with the toolkit and example conforming | Delivered: both pass (SC21). Consumers such as `ramify-agent/` see the new findings when they adopt the build |
| RD-7, no closure, reverse index or verdict cache | Held. The pass is within SC24's budget, so no reverse index is proposed |

### Open items for Dan's decision

1. A `not-visible` finding can name the wrong statement when one module exposes
   the same symbol in several merged statements.
2. Literal-initialized unannotated constants, such as `export const value = 1`,
   set `inferred`; S100's measurement setup has one such note.
3. A moved finding appears as new and removed in `ramify check --changed`, since
   its message names the signature position (iteration 3).
4. Iteration 4's contract changes: the `layout` prop removed from three diagram
   components, and the `planApiViewRequests` and `projectApiView` exposure
   removed in `analysis`.
5. Proposals 1 to 3 above, for the three exceeded budgets.
6. SC26: whether to update the Plan 1 harness pins and the three `src/tests` pins
   to the conforming reference example, and how `I1-09:signature-only-type`
   should be restated under the rule. A related question: the explorer's
   dependency view now reports the reference example as `partial` because of
   nonblocking `signature-inferred` notes.
7. The plan is not moved to `docs/plans/done/`. Only Plans 1 and 2 are there, each
   moved in its own commit; completed Plans 5, 2B and 6 to 6C remain in
   `docs/plans/`.
