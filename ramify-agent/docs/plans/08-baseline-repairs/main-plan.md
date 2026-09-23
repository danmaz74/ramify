# Plan 8: Baseline repairs

**Date:** 2026-09-22. **Status:** completed on 2026-09-23; see
[results](results.md). Eight acceptance rows are met; BR02's second half, the
four reference self-check instances, was deferred by decision and is
unverified. Revised after the Plan 7 merge (`80c9bb9`), which fixed the
harness side of the original baseline.

At `6ebff8e`, the merge of the
[capability progress plan](../03-autonomous-implementation-loop/initial-hypothesis-vs-implemented-module-tree.proposal.md),
both projects' complete suites and several frozen reference gates were red.
Most failures followed from Ramify's signature-companion rule landing without
every older expectation, fixture and test datum being updated. Plan 7's
[baseline failures](../07-commit-audit-integration/baseline-failures.md)
diagnosed the harness failures BF-1 to BF-5, and its final commit `d2fca15`
corrected them; its [runtime profile](../07-commit-audit-integration/test-runtime-profile.md)
records the corrected suite passing. What remains is on Ramify's side, in
the capability views' layout, and in the audit evidence. This plan makes
Ramify's own check complete again, brings the frozen gates up to date with
reviewed additions, guards the fixture, fixes the layout defects, and binds
both suites' evidence to one commit.

Both projects share this repository, so one plan carries both sides, as the
capability progress plan did. Ramify's source and documents still never name
the agent or its capabilities. This is ramify-agent's Plan 8; Ramify's own
Plan 8 is the signature-companion plan, and is named as such below.

## Runnable outcome

```text
cucumber-viz audit, repository root          -> PASS (static, regression)
ramify-audit of ramify-agent, same commit    -> PASS, request recorded
npx tsx scripts/validate-final-contracts.ts  -> exit 0
ramify check --batch on Ramify               -> coverage: complete
Run page, Progress -> By module at 1440x1000 -> rows readable at the fitted zoom
```

## Known issues

| ID | Project | Issue | Evidence | Owner |
| --- | --- | --- | --- | ---: |
| KI-1 | Ramify | Ten `signature-inferred` analysis limits in Ramify's own source make its check report `coverage: partial`. The Plan 7 branch changed BD24 (`src/tests/dependency-diagram-daemon.test.ts:87`, `:90`, `:136`) to expect `partial` and to hard-code the ten limits, so the toolkit suite passes while the limits stand. The reference self-checks `I1-27:self-check`, `I1-27:self-negative`, `I2-30:self-check-eleven` and `I5-14:self-check-eleven` still fail on the same limits. | Ramify Plan 8's [iteration 7](../../../../docs/plans/iteration-8-signature-companions/iterations/iteration7-results.md) lists the ten. The audit of `d2fca15` (`refs/audited/runs/2026-09-22T18-54-47Z-d2fca150e`) shows BD24 passing with the revised expectation. | `presentation/layout`, `service-api`, `daemon/contexts` tests, `src/tests/` |
| KI-2 | Ramify | Frozen package-entry gates compare against the reviewed eight entries exactly. The capability plan added `./module-tree` and `./module-tree.css`; the second is a string target that `validate-final-contracts.ts:30` cannot type and `:136` cannot probe. | Code reading; not run, since `npm test` never executes them. | `scripts/`, `scripts/reference-harness/` |
| KI-3 | Ramify | Separately and earlier, the same final-contract gate reports every `module.ramify` selection (`validate-final-contracts.ts:126`) and the eleven-owner set (`:103`, `:191`) as changed since 2026-09-16 (Ramify Plans 2B, 2C and 8). | `npx tsx scripts/validate-final-contracts.ts` exits 1. | `scripts/` |
| KI-8 | ramify-agent | By module fits at about 0.18 zoom at 1440×1000. The selector `.run-page main` (`web/src/styles.css:154`) matches nothing, because `<main>` (`app.tsx:35-39`) is the parent of `.run-page` (`run-page.tsx:65`). So `main { max-width: 52rem }` (`styles.css:41`) caps the page at 832 px, the canvas has a fixed `height: 38rem` (`:198`), and the detail panel takes a third of the width. | Capability plan iteration 6, layout issue 1; code reading | `web` |
| KI-9 | Ramify | Keyboard focus on an off-screen row or shell does not bring it into view. Nodes are `focusable: false` (`ModuleTreeCanvas.tsx:225`), which disables React Flow's own pan-on-focus. The canvas already centers on selection with `setCenter(…, { zoom: 1 })` at `:253`. | Iteration 6, issue 2 | `presentation/project-view` |
| KI-10 | Ramify | React Flow's default 200×150 minimap (`ModuleTreeCanvas.tsx:281`, styled only with `bottom: 12`) covers much of a narrow canvas. | Iteration 6, issue 3 | `presentation/project-view` |
| KI-11 | Ramify | Space on a body control reaches React Flow's pan-activation key. The canvas contract says a body control's key press does not reach the shell. | Iteration 6, issue 4 | `presentation/project-view` |
| KI-12 | both | No audit of one commit covers both suites. The root cucumber-viz audit runs only Ramify's checks; its last run at `5b834f2` failed on BD24. The ramify-agent suite was audited by ramify-audit at `d2fca15` (all five checks pass; `agent-vitest` 93 s with `--maxWorkers=4`), but that request is not recorded in the repository, and its `parent-daemon-test` runs BD24 alone. | `cucumber-viz.config.ts`; `refs/audited/runs/2026-09-22T18-54-47Z-d2fca150e` `reports/audit/summary.json` | audit requests |

Resolved before this plan, at `d2fca15` (tree identical to the merged
`80c9bb9`), and retained here so the IDs stay stable:

- **KI-4 (BF-1).** The fixture's eight affected `module.ramify` files, of
  its fifteen, now expose the 23 companions beside their symbols. No test
  checks the fixture alone; [iteration 3](#iteration-3-fixture-guard) adds
  one.
- **KI-5 (BF-2).** `local-authority.test.ts:117` carries
  `changesExistingSymbols: false`.
- **KI-6 (BF-4).** `RunServiceOptions.now` (`service.ts:190-191`, read at
  `:366`) is the wall clock; `run-bounds.test.ts:154` advances it by 201 ms
  inside the first session start and `:174` asserts one start.
- **KI-7 (BF-5).** `close()` (`service.ts:3995-4021`) resolves only after
  every driver's `run.done` settles, bounded by the largest
  `policy.limits.stopSettleMs`; on expiry it throws and keeps the project
  lock. `run-protocol.test.ts:377` awaits the corrected run's terminal state,
  `:381` proves no write follows resolution, and `:527` proves the expiry
  error.
- **BF-3.** `helpers/constructed.ts:74` gained `changesExistingSymbols: false`
  in the capability progress plan's iteration 3 (`fafb864`).

Out of scope:

- The captured preview data in `web/src/examples/`, which no test ties to the
  projection. It is a development preview, and it is recorded in the
  capability plan's results.
- Ramify's own explorer layout. It stays MT14-unchanged.
- The harness suite's duration. Plan 7's profile reduced it to 91 s at four
  workers; further reductions are its own recommended corrections.

## Precondition

`/ramify/dist` predates the merge, which changed the root manifest. Every
`ramify-agent` test that calls the real checker fails with `Missing or
incomplete daemon build` until the root build runs. Each iteration runs
`npm install` and `npm run build` from its worktree root before its first
check. The main checkout is rebuilt once, when the plan merges.

Worktrees are cut from `ramify-agent` at `80c9bb9` or later. Nothing here
waits on an unmerged branch.

## Iterations

Iterations 1 to 4 can execute in parallel, one worktree each. Iteration 5
needs 4, and iteration 6 needs all of them.

### Iteration 1: Declare Ramify's inferred signatures

**Owners:** `presentation/layout`, `service-api`, the `daemon/contexts` test
support, and the BD24 test in `src/tests/`.

**Goal:** Ramify's own check reports `coverage: complete` again, and BD24
asserts it as it did before the Plan 7 branch relaxed it. This is the
[iteration 7](../../../../docs/plans/iteration-8-signature-companions/iterations/iteration7-results.md)
pattern of Ramify Plan 8, applied to the toolkit.

**Work:** declare each signature so that the declared type equals the one
inferred today:

| Symbol | Location | Declaration |
| --- | --- | --- |
| `createControlledClock` | `subs/daemon/subs/contexts/src/tests/controlled-ports.ts:25` | `initialTime: number = 0` |
| `LAYOUT` | `subs/presentation/subs/layout/src/geometry.ts:15` | a written-out interface |
| `wrapText` | `geometry.ts:218` | `maxLines: number = Number.POSITIVE_INFINITY` |
| `MIN_SCALE`, `MAX_SCALE`, `DRAG_THRESHOLD` | `viewport.ts:21, 22, 120` | literal types (`: 0.5`, `: 4`, `: 5`) |
| `wheelFactor` | `viewport.ts:114` | `deltaMode: number = 0` |
| `createProjectExplorerModel` | `subs/service-api/src/project-view.ts:175` | a named result type |
| `createExplorerRouter` | `subs/service-api/src/router.ts:34` | a spelled-out router type. `ExplorerRouter` (`router.ts:106`) stays the name `subs/explorer/src/browser-app.tsx:4` uses; it is the alias of `createExplorerRouter`'s result, which is why the table has eleven names for ten limits. |
| `probeExplorerReadiness` | `subs/service-api/src/web-discovery.ts:80` | `timeoutMs: number = 250` |

Every new type the signatures name must be exposed with them, or the check
reports `exposed-without-companion`. Add compile-time identity tests for the
router and model types, as iteration 7 did for the example. No `package.json`
export changes.

Then restore BD24: `src/tests/dependency-diagram-daemon.test.ts:87` expects
`coverage: 'complete'` again, `:136` expects
`{ state: 'complete', unknownDependencies: 0, limitIds: [] }` or the
pre-merge form, and the hard-coded ten-file list at `:88-100` and the
`productionLimitIds` computation are removed. A ramify-agent branch relaxed a
toolkit test; this plan puts the toolkit's own expectation back.

**Verification:**

```sh
npm run type-check
npm run build
npm run check:self    # coverage: complete, 0 analysis limits
npx vitest run src/tests/dependency-diagram-daemon.test.ts
npx vitest run subs/explorer subs/service-api subs/presentation/subs/layout
```

Run the four reference self-check instances by filter if
`scripts/reference-harness/verify.ts` supports it. Otherwise record them for
iteration 6.

**Exit:** BD24 passes at both of its coverage assertions with `complete`,
and `check:self` reports no analysis limit.

### Iteration 2: Reviewed additions to the frozen gates

**Owners:** `scripts/validate-final-contracts.ts`, `scripts/reference-harness/`.

**Goal:** frozen gates keep asserting exactly what their plans reviewed, and
accept later changes only as named, reviewed layers. That is the precedent of
Plan 2's `./client`, of `reviewedNodeEntry` (`validate-final-contracts.ts:37`)
and of Plan 2A's `materialized` owners (`:59`, `:102`). No gate is loosened
to a bare subset check.

**Work:**

- **Package entries (KI-2).**
  - Add a `reviewedAdditions` layer naming exactly `./module-tree` and
    `./module-tree.css`, sourced from the capability plan's package-surface
    table (`initial-hypothesis-vs-implemented-module-tree.proposal.md:364-368`).
  - Widen `PackageMetadata.exports` (`validate-final-contracts.ts:30`) to
    admit a string target, and make `validatePackageEntries` (`:132`) assert
    that the reviewed eight are present and unchanged, that the only other
    keys are the recorded additions, and that a string target is probed as a
    file and never imported. Keep the returned reviewed count (`:166`), so
    existing `[11, 8]` expectations hold.
  - `scripts/reference-harness/relocation.ts` already has this form: nine
    entry functions including `ramify.ts/module-tree` (`:18-23`), a
    `stylesheetEntries` list (`:26`), and separate assertions for entry
    imports and stylesheet files (`:229-231`). Copy it, rather than change it,
    into `plan5-completion-cases.ts:130-139`,
    `plan2a-completion-cases.ts:208-214`, `plan2b-cases.ts:960-968` and
    `plan2b.test.ts:153-158`. In `plan2b-cases.ts`, `equalToBaseline` means
    that the reviewed entries equal the `577b980` baseline and the remaining
    keys are exactly the recorded additions, so `plan2b.test.ts:157` still
    asserts `true`.
- **Plan 1 regression record.** `completion-regression.ts:59-62` looks for the
  assertion "all eight actual package entry imports executed" and an
  eight-entry observation (`:22-29`); `relocation.ts:229` has already renamed
  it to "every actual package entry import executed", so this record fails
  regardless of KI-2. Record the renamed assertion and the added entries as a
  named revision, like its existing `revised` set, and add the corresponding
  rewrite to `completion-regression-controls.ts:18-26`.
- **Owners and declarations (KI-3), as [review decision 1](#review-decisions)
  settled it.** Add reviewed layers for the owners and `module.ramify` selections added by
  Ramify Plans 2B, 2C and 8 and by the capability plan.

**Verification:**

```sh
npx tsx scripts/validate-final-contracts.ts   # exit 0
npx vitest run scripts/reference-harness/plan2b.test.ts
npm run type-check
```

The completion suites under `npm run reference:verify -- --plan N` are long
real-process runs. Run them once each for Plans 1, 2, 2A and 5 only after
asking, and record their durations.

**Exit:** the final-contract gate exits 0. Each named case that failed only
on package entries or on the KI-3 drift passes. No reviewed table was edited
in place.

### Iteration 3: Fixture guard

**Owner:** the `ramify-agent` harness tests.

**Goal:** `fixtures/collection-review` cannot drift from Ramify's rules
unnoticed again. Plan 7 corrected the 23 companion exposures, but the only
tests that prove the fixture checks clean do so on the way to another
assertion, and 49 test files copy it.

**Work:** add one harness test that copies a fresh fixture with
`copyFixture()` (`helpers/fixture.ts:16`), runs the real checker over it and
requires zero errors and zero warnings, reporting each finding's code and
location on failure. It runs in the ordinary suite; the opt-in
`fixture-trials.test.ts` is not a substitute.

**Verification (from `ramify-agent/`):**

```sh
npx vitest run subs/harness/src/tests/<the new file>
npm run type-check
npm run check:self
```

**Exit:** the guard passes on the corrected fixture and fails on a copy with
one companion exposure removed (verified once by hand, not kept as a test).

### Iteration 4: Canvas focus, Space and minimap

**Owner:** Ramify's `presentation/project-view`.

**Goal:** close the canvas-owned defects without changing
`ModuleTreeCanvasProps` or the explorer's MT14 behavior.

**Work:**

- **Focus into view (KI-9).** In `ModuleTreeCanvasNodeView`
  (`ModuleTreeCanvas.tsx:94`), add a focus handler on the shell. It acts only
  on `:focus-visible` targets outside the canvas viewport, then centers on
  the focused element at the current zoom with `setCenter`. It centers on the
  element, not the node, because a tall node would miss its lower rows. The
  existing selection centering at `:253` uses `{ zoom: 1 }`; the two rules
  differ deliberately: selection is a user's choice of one node, focus is
  navigation that must not change the fitted zoom. State this in the canvas
  contract. A focus pan counts as a user move for auto-fit, through an
  internal `markMoved` in `auto-fit.ts`.
- **Space isolation (KI-11).** On the body wrapper, stop propagation of Space
  from a body control. The control still activates, and the shell and pane
  keep their Space behavior.
- **Minimap (KI-10), as [review decision 2](#review-decisions) settled it.**
  `module-tree-canvas.css` makes the canvas a size container and hides the
  minimap below a 480 px canvas width.
- **Tests.** Add canvas tests beside the collapse-control test
  (`tests/ModuleTreeCanvas.test.tsx:169`): one for focus panning, one for
  Space not arming panning, and one for the minimap rule.

**Verification:**

```sh
npx vitest run subs/presentation/subs/project-view/src/tests
npm run type-check
npm run build
npm run check:self
npx tsx scripts/reference-harness/module-tree-consumer.ts
npm run measure:project-explorer -- --only tree   # MT14
```

**Exit:** the new canvas tests pass, MT01–MT07 and MT14 pass unchanged, and
the tarball consumer passes.

### Iteration 5: By-module layout

**Owner:** `ramify-agent/web`.

**Prerequisite:** iteration 4, with Ramify rebuilt.

**Goal:** By module is readable at its fitted zoom on a desktop viewport.

**Work:**

- **Width cap (KI-8).** Fix the width cap on the Run route with
  `main:has(.run-page)` or a route class on `<main>` in `app.tsx`. Keep a
  readable measure on the Run page's text areas.
- **Canvas size.** Give `.capability-module-canvas` the viewport height, not
  the fixed `38rem`. Stack the detail panel below the canvas under a
  breakpoint the evidence justifies, and record the chosen value.
- **Evidence.** Re-record iteration 6's `placements` and 60-row screenshots at
  1440×1000 and 390×844, including the fitted zoom and a focused off-screen
  row.

**Verification (from `ramify-agent/`):**

```sh
npx vitest run subs/web/src/tests
npm run type-check
npm run build:web
npm run check:self
npx tsx subs/harness/src/tests/helpers/serve-progress-fixture.ts --port 4190
```

Then run a Chromium session against the served fixture.

**Exit:** the fitted zoom of `placements` at 1440×1000 is at least twice the
recorded 0.177. A keyboard-focused `check-060` is inside the canvas viewport.
There is no console error.

### Iteration 6: Audited evidence for both suites

**Owner:** the audit requests and this plan's results.

**Prerequisites:** iterations 1 to 5.

**Goal:** both complete suites pass under audits bound to one commit, and the
ramify-agent request is reproducible from the repository.

**Work:**

- **ramify-agent request (KI-12).** Record the ramify-audit request that
  produced `refs/audited/runs/2026-09-22T18-54-47Z-d2fca150e` as a file under
  `ramify-agent/` (its universe `ramify-external-tool-fake-rollout` and five
  checks: `agent-check-self`, `agent-typecheck`,
  `agent-vitest` with `--maxWorkers=4`, `dependency-diagram-daemon`,
  `git-diff-check`), renamed for this plan's claim. Its commands run from the
  repository root with `npm --prefix ramify-agent`, after
  `npm run worktree:prepare` and the root `npm run build`. cucumber-viz 0.7.0
  cannot host it: its `checks` block has one static and one regression scope
  and its `CommandSpec` has a `timeoutMs` but no working directory, so a
  second scope would mean absorbing the suite into the root audit. The root
  audit stays Ramify's.
- **Audits.** Run the root cucumber-viz audit with `use_existing_head` and the
  recorded ramify-audit request on the plan's final commit.
- **Frozen gates.** Run the frozen gates repaired by iteration 2, as approved
  there, and the four reference self-check instances if iteration 1 could not.
- **Plan 7 record.** Add a resolution note to Plan 7's
  `baseline-failures.md` status line: its five findings were corrected in
  `d2fca15`, with the audit ref above as evidence. Its diagnostic text stays
  as written.
- **Results.** Write `results.md` mapping BR01–BR09 to evidence.

**Exit:** both audits pass on the same commit, and each audit report ref is
recorded.

## Acceptance

| ID | Required result | Iteration |
| --- | --- | ---: |
| BR01 | Ramify's batch check on itself reports `coverage: complete` with no analysis limit, and no signature's type changed | 1 |
| BR02 | BD24 passes with its `complete` expectations restored and no hard-coded limit list; the four reference self-check instances pass | 1, 6 |
| BR03 | The final-contract gate exits 0; frozen tables are unchanged and the additions are named reviewed layers | 2 |
| BR04 | String export targets are accepted by every package gate without being imported | 2 |
| BR05 | A test in the ordinary suite checks a fresh fixture copy with the real checker and requires zero errors | 3 |
| BR06 | Keyboard focus brings an off-screen row or shell into view, and Space on a body control does not arm pan | 4, 5 |
| BR07 | The minimap follows review decision 2; MT01–MT07 and MT14 are unchanged, and `ModuleTreeCanvasProps` is unchanged | 4 |
| BR08 | The By module fitted zoom at 1440×1000 is at least twice 0.177, with browser evidence at both widths | 5 |
| BR09 | The root audit and the recorded ramify-audit request pass on the same commit | 6 |

## Review decisions

Both were settled on 2026-09-22, each on its recommendation.

1. **KI-3's older declaration drift.** Iteration 2 adds reviewed layers for the
   owners and `module.ramify` selections added by Ramify Plans 2B, 2C and 8 and
   by the capability plan. The Plan 2 final-contract gate keeps running: the
   precedent does this, and a historical gate verifies nothing about current
   source.
2. **Minimap below 480 px.** The canvas hides it, with a container query in
   `module-tree-canvas.css`. This also changes Ramify's explorer below 480 px
   canvas width, where MT14 does not look; the web module does not touch a
   React Flow class.

Settled by Plan 7, and recorded so they are not reopened:

- **`RunService.close()` contract.** It guarantees a quiescent store: it
  awaits every driver bounded by the largest `stopSettleMs`, and on expiry
  it throws and keeps the project lock rather than resolving over a writing
  driver.
- **Audit tool for ramify-agent.** ramify-audit, as Plan 7 adopted and as the
  `d2fca15` audit already used. cucumber-viz stays the root's audit.
