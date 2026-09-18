# Iteration 9 results: Fix the defects the real runs found

**Date:** 2026-09-18. **Mode:** direct work in worktree `/tmp/ramify-plan2b-architect-view`,
branch `feat/plan2b-architect-view`. It is based on `5625b3d`, the amendment that added this iteration after
iteration 8's results. The code commits are `e04f8ae` (finding 2), `2a59f81` (finding 3), `ef7a6f2` (stage cleanup and
marker files), `1bbd588` (predecessor expectations) and `27f661e` (measurement witnesses); the results commit adds
this file, the refreshed evidence and the specification's measured values. Every verification command was run on
`27f661e`.

**Outcome.** AV40, AV41, AV42 and AV43 pass, and AV29–AV34 pass again on the fixed build. `npm run reference:cases`
passes, 386 of 386. Every budget holds except hit cost, which exceeds its thresholds on the toolkit for five of the
six terms as iteration 8 measured; by the user's decision of 2026-09-18 that is recorded, not fixed here. A context
reached by another invocation form now materializes measured dependencies in 3.3–3.8 s on the reference project and
8.9–9.0 s on the toolkit, against the 90 s budget; iteration 8's witness waited 125.7 s and published without them.

## Prerequisites

- Iteration 8's handoff held:
  - the view at the worktree root was the one its results record, revision `rev/1:1b07e9b5-…:1`;
  - `evidence/plan2b-measurements.json` held iteration 8's hit-cost table and its two defect witnesses;
  - the five `reference:cases` failures were the ones its Verification section lists.
- The user's decision of 2026-09-18, recorded in the main plan's budgets paragraph, held: fix the clear defects, keep
  the view format, treat hit cost, record length and the lock held through the dependency wait as later work.
- The worktree was clean, and its build was current for `5625b3d`, which changed documents only.

## Built

### Finding 2: the analyzer after a change of invocation form (`daemon/contexts`, `analysis`)

- **Cause, confirmed.** In-process reads of the reference project under four invocation forms showed that the
  captured inputs differ only in root discovery: the absent `module.ramify` of each ancestor for a found root, the
  invocation directory when the root is given from elsewhere, and absent `module.ramify` probes of in-root directories
  when the root is found from a subdirectory. The analyzer requires every input it reads to be recorded in the report,
  so it failed whenever its request probed more than the capture had.
- **Context manager.** `LiveContext` gains `sessionProject`, the request the live session was opened with (set when
  `driver.open` answers `opened`, cleared when the session is released), and `publishedProject`, the request the
  published revision's inputs were captured with (set from `sessionProject` when `publish` admits a revision, cleared
  when the history is replaced). `runDiagram` reads `publishedProject` when it checks the job's publication and passes
  it to the runner; the report still names the latest invocation. A cold context keeps `publishedProject` with its retained
  report, so a diagram requested after cooling uses the request of the session that captured it.
- **Session.** `SessionState.project` holds the opening request, and every acquisition uses it: the open, the retry
  after an invalid open (`#reopen`) and the invalid-facts capture (`captureInvalidFacts`). The retry previously used the
  latest invocation, so a session opened over an invalid capture and recovered by another invocation form captured its
  inputs with that form, and the context manager could not know which. `RetainedSession.update` states the contract:
  a session captures every input with its opening request, and an invocation changes only the request its reports
  echo. The observer's structural rebuild already used its opening request.
- **Analyzer.** Unchanged. `DependencyAnalyzerInput.project` and `DependencyDiagramRunner` now document that `project`
  is the request the report's inputs were captured with.
- **Why the context manager.** It already owns the session's opening and publication, and the report must keep
  echoing the caller's invocation (`root-resolution.test.ts` requires it). Excluding discovery inputs in the analyzer
  would need `analysis/project` to expose which captured inputs came from root discovery, and would weaken the
  analyzer's own verification of what it reads. Reconstructing the request from the report's captured scope was tried
  in a scratch probe and is inexact: from a symlinked working directory with a relative `--root`, the reconstructed
  request probes the real invocation directory, which the capture never recorded.
- **Tests.**
  - `subs/daemon/subs/contexts/src/tests/dependency-diagram.test.ts`, AV40: a context opened with a given root is
    reached by a check that finds it from `subs/workspace`; the republished revision (sequence 2, cause `request`, same
    input identity) has a report naming the second request, and the runner receives the opening request. An
    `inputs-changed` outcome still answers `busy`. After cooling, a diagram run from the retained report receives the
    opening request; a session later opened by the second form captures with that form's request, and the runner
    receives it.
  - `subs/analysis/src/tests/retained-session.test.ts`: a session opened over an invalid capture with a given root and
    recovered by an update that finds the root from `subs/consumer` has the opening request's batch input identity and
    inputs, not the second form's, while its report names the second form.
  - `src/tests/resident-cli.test.ts`, AV40 end to end through the quick environment's real service and sessions, with
    the analyzer in process: `check` from the root, then `materialize --view architect --root <root>` from another
    directory; and `check --root .`, then `materialize --view architect` from the root. Each prints `dependencies
    measured` after one analyzer run answering `ready`, the context's revision is sequence 2 with cause `request`, the
    runner's request is the opening one, and editing `subs/consumer/src/use.ts` afterwards makes the same request and
    report answer `inputs-changed` with that path.

### Finding 3: generated directories at session open (`analysis/typescript`)

- `RetainedSourceState.#listing` omits reserved names from `readdirSync`'s result before reporting the listing to the
  observer and returning it, so `#readDirectory` never probes a generated member either. The predicate is
  `isRamifyGeneratedPath` applied to the bare name, as `configuration.ts` does.
- **Exposure.** No declaration changed. `analysis/project` exposes `isRamifyGeneratedPath` to its parent (P5), and
  `analysis` re-exposes it to parent and descendants (A7), so `analysis/typescript` already receives it; both owners
  are untagged. `isRamifyGeneratedSegment` is not exposed and is not needed, since the path predicate checks a bare
  segment directly. `check:self` verifies the new value import.
- **Tests.**
  - `retained-source-analysis.test.ts`: with the architect view, its stage, a backup marker, `src/.ramify`, an API
    stage and marker on disk and a near miss `.ramify-architects/`, no reported read, probe, absence or listing names a
    reserved path (checked with an independent pattern), the root listing keeps the near miss, the `src` listing is
    exactly the owned files, and the catalog and accesses equal the finite helper's.
  - `retained-session.test.ts`, AV41: a session opened with nine generated paths present (views, stages and markers at
    the root and in two source areas) equals a batch check field by field, its revision and report have the input
    identity of a batch check made before the views existed, and no input names a reserved path.

### Stage cleanup (`daemon`)

- `removeMarked(fs, dir)` removes a marked sibling directory and answers whether it is gone, checking with `lstat`
  after a failed removal, so a directory that never existed counts as gone.
- `cleanupTmp` removes a stage's marker only when the stage is gone. `recoverSiblings` does the same for a stage and for
  a backup beside a live target; it previously swallowed the directory's removal failure and removed the marker, the
  same defect. See [Deviations](#deviations).
- **Tests.**
  - `api-view-publisher.test.ts` and `architect-view-publisher.test.ts`, AV42: a staged write fails and only the
    stage's removal fails; the stage and its marker remain, and the next publication removes both and reports the
    previous view unchanged.
  - `api-view-publisher.test.ts`: when the next publication's recovery cannot remove the stage either, the marker stays,
    and a third publication reclaims it.
  - Iteration 5's architect leftover-stage test queued two removal failures for the old cleanup's two removals. The
    second now fires in the next publication's recovery, so the test expects the marked stage to survive that
    publication and a third one to reclaim it.

### Marker files and Git

- The toolkit's and the reference project's `.gitignore` add `.ramify.tmp-*.marker.json`, `.ramify.old-*.marker.json`,
  `.ramify-architect.tmp-*.marker.json` and `.ramify-architect.old-*.marker.json` beside the unchanged directory
  patterns; the toolkit's comment names the marker files. `.ramify/` and `.ramify-architect/` are unchanged.
- **Test.** `architect-view-publisher.test.ts`, AV42: in a temporary Git repository with each ignore file, the four
  marker forms at the root and in `mod/src/` are ignored (`git check-ignore` names all eight), and `git status
  --porcelain --untracked-files=all` lists only `.gitignore` and four near misses (`.ramify.tmp.marker.json`,
  `.ramify-architect.tmp.marker.json`, `.ramify-other.tmp-<hex>.marker.json`, `.ramify-architects.old-<hex>.marker.json`).

### Predecessor expectations (`scripts/reference-harness`)

- `linking.test.ts`: "validates all fifteen current toolkit descriptions", with the four owners Plans 6B–6D added in
  the expected list.
- `self-cases.ts` (I1-27:self-check and I1-27:self-negative): the owner list has fifteen entries and the assertion is
  "exact fifteen implemented owners". `ramify/integration-tests` is a separately declared testing module whose tests are
  its ordinary source, so the per-owner test assertion looks there for it, and a new assertion requires its header to
  carry `testing`. The self-negative case, the dispatch violation from `presentation/layout`, is unchanged and passes.
- `project-cases.ts` (I1-29:scope-report, which `verify.test.ts` iterations 5 and 6 execute): "fifteen toolkit
  skeleton owners", 15.
- `plan5-completion-cases.ts`: the check "status states that MCP and overlays are not implemented" requires "The MCP
  adapter and unsaved-content overlays are not implemented" in `daemon.md`, `memory-lifecycle.md` and
  `processes-and-clients.md`. The first and last already said so; `memory-lifecycle.md` still said the explorer was
  not implemented and now matches.

### Measurement witnesses (`scripts/measurements/plan2b.mjs`)

- `mixed-invocation` runs two sequences on one reference copy, each with its own daemon and the view removed between
  them: `check` from the root, then `materialize --view architect --root <root>` from another directory and a
  materialization from the root; and `check --root .`, then `materialize --view architect` from the root. Its budget
  entry requires every materialization to exit 0 with measured dependencies within 90 s.
- `open-with-view` is unchanged in its steps; its pattern also counts stage and backup paths, and a budget entry
  requires the session opened beside views to record no generated input and have the batch check's input identity and
  input count.
- `scripts/measurements/README.md` describes both as checks of the fixes.

### Documentation

- `docs/architecture/daemon.md`: the dependency diagram row says the analyzer acquires with the request the revision's
  inputs were captured with.
- `docs/architecture/materialized-api-view.spec.md`: the known gap is replaced by the retained compiler's omission of
  reserved names, and the marker files are named beside the reserved directories.
- `docs/architecture/architect-view.spec.md`: the implementation status carries this iteration's measured values, and
  the two known gaps are recorded as fixed; macOS remains a gap.
- Owner READMEs: `daemon/contexts` (the captured request), `analysis/typescript` (listings omit reserved names) and
  `daemon` (markers stay with a directory whose removal failed). First paragraphs are unchanged.

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| AV40 | contexts and end-to-end tests above; toolkit real runs; `mixed-invocation` | pass |
| AV41 | `retained-session.test.ts`, `retained-source-analysis.test.ts`; `open-with-view` | pass |
| AV42 | publisher tests for both targets; Git test; worktree check | pass |
| AV43 | `npm run reference:cases`: 36 files, 386 tests passed | pass |
| AV29 | `plan2b.test.ts` real runs; `evidence/plan2b-cases.json` | pass |
| AV30 | `plan2b.test.ts` invariance | pass |
| AV31 | `plan2b.test.ts` real runs | pass on Linux; macOS unexecuted, no macOS host |
| AV32 | `evidence/plan2b-measurements.json`, hit cost | measured; **toolkit exceeds the thresholds**, as recorded |
| AV33 | `evidence/plan2b-measurements.json`, budgets | pass: every budget holds except hit cost |
| AV34 | `plan2b.test.ts` regressions; 57 Plan 2A handlers; verification commands | pass |

AV40 witnesses:

- **Measurement, reference project, installed CLI and real daemon.** Every materialization exited 0 with dependencies
  measured, one analyzer job each and `dependencyDiagramInputChanges` 0:

  | Sequence | Opening check | Materialization | Revision after | Time |
  | --- | --- | --- | --- | ---: |
  | 1 | `check` from the root | `--root <root>` from another directory | 2, `request` | 3,620 ms |
  | 1 | | from the root, no `--root` | 3, `request` | 3,319 ms |
  | 2 | `check --root .` | from the root, no `--root` | 2, `request` | 3,843 ms |

  Iteration 8's witness of sequence 1's first step took 125,705 ms and published `unavailable (wait-limit)`.
- **Toolkit, built CLI, owned daemon (`/tmp/rp2b9-v`).** After `npm run check:self` (`check --root .`) opened the
  context, `ramify materialize --view architect` from the worktree root published revision 2, cause `request`, with
  dependencies measured in 8,871 ms; `ramify materialize --view architect --root <worktree>` from `/tmp/rp2b9-else`
  published revision 3 in 8,995 ms. The daemon counted 2 analyzer jobs and 0 changed-input answers.
- **Unit and end to end.** The contexts test, the session test and the two quick end-to-end cases above pass.
- **A real input change.** The end-to-end cases edit a consumer file after materializing and run the analyzer with the
  captured request and the same report: it answers `inputs-changed` with that path. A newer revision still supersedes
  the wait: BD21 in `dependency-diagram.test.ts` and AV27's `superseded` case in `service.test.ts` pass unchanged.
- **Mutations.** Passing `report.request.project` again makes the contexts AV40 test fail and both end-to-end cases
  time out in the dependency wait, which waits on the quick environment's controlled clock. Restoring `#reopen`'s use of
  the latest invocation makes the session test fail: its inputs become the second form's.
- **Explorer answer.** `dependencyDiagram` still answers without test references; `explorer-router.test.ts` and the
  Plan 6D tests pass (see [Verification](#verification)).

AV41 witnesses:

- **Measurement.** On a reference copy, a daemon opened after the API and architect views were published recorded 3,610
  inputs, none generated, with input identity `input/1:d0d9a331…` equal to the batch check's with views, the batch
  check's without views and the resident check's before the views existed. Iteration 8's run recorded 3,640 inputs,
  30 of them generated, and another identity. Publishing a changed view afterwards still started no revision.
- **Mutations.** Without the filter, the retained listing test reports 15 reserved paths and the session test differs
  from the batch check.

AV42 witnesses:

- **Publisher.** The tests above pass for both targets; each fails with the old `cleanupTmp`, and the recovery tests
  fail with the old `recoverSiblings`.
- **Git, temporary repositories.** The test above passes with both ignore files and fails with the previous ones.
- **Git, this worktree.** Eight marker files, the four forms at the worktree root and the four in
  `examples/collection-review/`, were created. `git status --porcelain --untracked-files=all` listed none of them, and
  `git check-ignore -v` attributed each to its new line (`.gitignore:39`, `:40`, `:44`, `:45`; the reference's
  `:11`, `:12`, `:16`, `:17`). They were then removed.

AV43 witness: `npm run reference:cases` passed 36 files and 386 tests in 323 s, where iteration 8 passed 381 and
failed the five predecessor tests. No Plan 2A or Plan 2B case changed; `plan2a.test.ts` and `plan2b.test.ts` passed.

AV29–AV34 witnesses, re-run on the fixed build:

- **AV29, AV31.** `plan2b.test.ts` passed within `reference:cases`, with `RAMIFY_PLAN2B_EVIDENCE` writing
  `evidence/plan2b-cases.json`: the reference view equals both expectations; the toolkit view has 15 modules and 1,595
  records (four more than iteration 8, from this iteration's tests); unchanged repeats wrote 0 bytes; views were
  byte-identical within a daemon and, with the revision and input identity replaced, across daemons and paths. Its
  latencies ran beside the other harness files and are not measurements. Both harness daemons stopped with exit 0,
  not running, every recorded process exited unsignalled, and their directories were removed.
- **AV30.** The invariance case passed: identical reports, sequences and invariant counters with and without
  interleaved materialization, and no revision from publishing.
- **AV32, AV33.** See [Measurements](#measurements).
- **AV34.** The API view without `--view` is byte-identical to `577b980`'s build on both projects (reference 29
  targets, 153 files, 124,460 bytes; toolkit 29 targets, 890 files, 2,104,253 bytes); the eight package entries and the `./cli` and `./client` closures are unchanged.
  The 57 Plan 2A materialize handlers, run with `.reference-work/plan2a-materialize-driver.ts` (ignored) under an
  owned, empty endpoint directory `/tmp/rp2b9-h`, passed 57 of 57, the ten `I2A-07` publication cases and
  I2A-09:compact-wire among them; the directory stayed empty.

## Measurements

`npm run measure:plan2b` on `27f661e`, 2026-09-18 14:53–14:56 UTC, exit 0 with no failure. Its two tracked changes
were this file's companions, the specification text and `evidence/plan2b-cases.json`, which no module reads. Exceeded
entries: toolkit hit cost and the mean-record evidence target.

| Budget | Limit | Measured | Holds |
| --- | --- | --- | --- |
| Architect session query, warm, toolkit | 15 s | hot 0.64–0.81 s; after `releaseCompiler` 1.70 s | yes |
| Whole `materialize --view architect`, warm, toolkit, analyzer included | 90 s | 8.64–8.93 s (median 8.705 s); new daemon and context 14.7 s | yes |
| Whole `materialize --view architect` after another invocation form (AV40) | 90 s | reference 3.3–3.8 s; toolkit 8.9–9.0 s (built CLI, above) | yes |
| Session opened beside generated views (AV41) | no generated input, batch identity | 0 generated of 3,610; identities equal | yes |
| Unchanged repeat | 0 bytes | 0 on the toolkit, the reference project and S100 | yes |
| View size, toolkit | 8 MiB | 812,267 bytes, 62 files | yes |
| `maxProjectionBytes` | 64 MiB | configured 64 MiB; toolkit projection 1,206,867 bytes | yes |
| `maxArchitectBytes` | 64 MiB | configured 64 MiB; largest view 812,267 bytes | yes |
| Dependency wait | 250 ms, 125 s | as configured; no run reached it | yes |
| Hit cost per term, toolkit and reference | 200 lines, 64 KB | toolkit exceeded for five terms; reference within | **no, toolkit** |
| Mean behavior record, toolkit | 300 characters, evidence | 402.1 characters, longest 793 | evidence only |

Hit cost, `rg -n -i <term> .ramify-architect/` from the root; the reference project's values are iteration 8's exactly:

| Term | Toolkit lines | Toolkit bytes | Reference lines | Reference bytes |
| --- | ---: | ---: | ---: | ---: |
| `revision` | 187 | 114,298 | 54 | 21,860 |
| `project` | 549 | 325,296 | 0 | 0 |
| `session` | 214 | 125,847 | 22 | 9,499 |
| `publish` | 118 | 85,058 | 1 | 682 |
| `watch` | 40 | 23,517 | 0 | 0 |
| `create` | 202 | 148,011 | 37 | 16,469 |

The small toolkit increases come from this iteration's tests, which add test records and titles.

| Project | Cold | Repeat | Retained facts | Warm, analyzer | API only | Both views | Peak combined RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Reference | 5.53 s | 0.39 s | 0.41 s | 3.42–3.50 s | 0.42 s | 3.71 s | 459 MiB |
| Toolkit | 14.72 s | 1.11 s | 1.13 s | 8.64–8.93 s | 1.23 s | 14.72 s | 1.07 GiB |
| S100 | 8.04 s | 0.81 s | 0.90 s | 4.57–4.80 s | 0.43 s | 6.85 s | 462 MiB |

- The three scale workloads and both `mixed-invocation` sequences counted `dependencyDiagramInputChanges` 0. Every
  measurement daemon stopped with exit 0, not running, its PID gone, and its directory removed.
- Other sessions' idle daemon and explorers ran on the host, as the report's `concurrentActivity` records.

## Materialized view at the worktree root

After the code commits, at `27f661e` (the results commit changes no module input), the built CLI ran at the worktree
root with a new owned endpoint, `/tmp/rp2b9-root`, from the root without `--root`:

```text
$ ramify materialize --view architect
Root: /tmp/ramify-plan2b-architect-view
Materialized: revision 1; 1 target(s), 1595 entries, 812267 bytes written, 0 unchanged
Architect view: .ramify-architect, 15 modules, 1595 records, dependencies measured
exit 0; elapsed 14105 ms

$ ramify materialize --view architect
Root: /tmp/ramify-plan2b-architect-view
Materialized: revision 1; 1 target(s), 1595 entries, 0 bytes written, 1 unchanged
Architect view: .ramify-architect, 15 modules, 1595 records, dependencies measured
exit 0; elapsed 1078 ms
```

- **Revision** `rev/1:ed24f37f-2394-4d57-8226-f46a04529361:1`, published by the opening (`open`), input
  `input/1:ed766c24604243180f3c3485992a051d1aea54eff6db59c640cd24601e754cee`.
- **`_meta.json`:**

  ```json
  {"schema":"ramify.architect-view/1","revision":"rev/1:ed24f37f-2394-4d57-8226-f46a04529361:1","input":"input/1:ed766c24604243180f3c3485992a051d1aea54eff6db59c640cd24601e754cee","modules":15,"dependencies":"measured","dependencyScope":"production","testReferences":"measured","metrics":"unavailable","cut":351,"detailsUnavailable":1,"dynamicTitles":21}
  ```

- **Files.** 62 files, 812,267 bytes. The SHA-256 of its manifest (`<sha256> <path>` per file, paths in byte order)
  is `09b6e2581bb911b1c2fee9196b080a0e94071d07862f2bdf1073cfaa64d22a76`.
- **Ignored.** `git check-ignore` names `.gitignore:41`; `git status` lists nothing from it; `rg -n -i
  createProjectBinding .` returns no line from it (its one hit mentioning the view is iteration 8's results text),
  while `rg -n -i createProjectBinding .ramify-architect/` returns 7.
- **Daemon.** The daemon (PID 621109) was stopped with `daemon stop`; the PID is gone, `daemon status` answers not
  running, no process of this worktree remains, and the endpoint directory was removed. The view stays on disk.

## Verification

On `27f661e`, in this order, with owned endpoint directories:

```sh
npm run build                 # built
npm run type-check            # clean, all four scopes
npm run check:self            # passed: 15 owners, 413 source files, 15 resources, 6128 accesses, 0 errors, 0 warnings, 0 analysis limits, 0 denied
npm run check:reference       # passed: 15 owners, 54 source files, 5 resources, 294 accesses, 0 errors, 2 warnings, 0 denied
RAMIFY_PLAN2B_EVIDENCE=docs/plans/iteration-2b-generated-views/evidence/plan2b-cases.json \
  npm run reference:cases     # 36 files, 386 passed, 323 s
npm run measure:plan2b        # exit 0: no failure; exceeded: toolkit hit cost, the mean-record evidence target
```

Focused files for each changed owner, on the code later committed unchanged:

```sh
npx vitest run subs/analysis/src/tests/dependency-analyzer.test.ts subs/analysis/src/tests/retained-session.test.ts \
  subs/analysis/src/tests/session-worker.test.ts subs/analysis/src/tests/root-resolution.test.ts \
  subs/analysis/src/tests/architect-view-session.test.ts subs/analysis/src/tests/api-view-session.test.ts \
  subs/analysis/src/tests/report-publication.test.ts subs/analysis/subs/typescript/src/tests/retained-source-analysis.test.ts \
  subs/analysis/subs/typescript/src/tests/retained-membership.test.ts subs/analysis/subs/project/src/tests/
  # 18 files, 254 passed
npx vitest run subs/daemon/subs/contexts/src/tests/ subs/daemon/src/tests/ subs/integration-tests/src/explorer-router.test.ts \
  src/tests/resident-cli.test.ts src/tests/dependency-analyzer-process.test.ts src/tests/quick-environment.test.ts \
  src/tests/resident-assembly.test.ts src/tests/publication-queue.test.ts
  # 36 files, 413 passed: contexts dependency tests, publisher and crash recovery, service, explorer router
npx vitest run src/tests/dependency-diagram-daemon.test.ts src/tests/dependency-view-server.test.ts
  # 2 passed: Plan 6D's built daemon (BD24) and the dependency view server
```

- **Endpoints.** `check:self` and `check:reference` started daemon 581483 in `/tmp/rp2b9-v`; after the toolkit AV40
  runs it was stopped with `daemon stop`, the PID was gone, status answered not running, and the directory was
  removed. `reference:cases` ran with the empty, owned `/tmp/rp2b9-rc`, which stayed empty; its process cases own their
  daemons. The measurement's daemons (`/tmp/rp2b-m-*`) and the harness's (`/tmp/rp2b-*`) each stopped as recorded;
  no such directory remains.
- **Other processes.** The daemon and explorer of the `ramify-plan6d-behavioral-diagram` worktree, two explorers of
  `/ramify` and the old `/tmp/ri11-Rkvfqi` directory belong to other sessions and were not touched. No process of this
  worktree remains.
- **Full suite.** The full Vitest suite was not run; it runs through the cucumber-viz audit.

## Deviations

- **Session contract.** The iteration preferred passing the captured request from the context manager, which this
  does. The context manager can only know that request if the session captures with a request it can see, so
  `#reopen` and `captureInvalidFacts` now use the opening request, and `RetainedSession.update` states the contract.
  Before, a session opened over an invalid capture and recovered by another invocation form captured with that form.
- **Recovery.** Deliverable 3 names `cleanupTmp`; `recoverSiblings` removed a marker after failing to remove its
  stage or backup in the same way, and now keeps it too. Iteration 5's architect leftover-stage test had queued a
  removal failure for the marker that the fixed cleanup never attempts; the failure now reaches the next recovery, and
  the test expects a third publication to reclaim the stage.
- **Marker patterns.** The ignore files add four marker lines instead of widening the directory patterns, because
  AV23's test requires the three directory lines and the marker lines match only the marker form.
- **Document.** `memory-lifecycle.md`'s status line said the explorer was not implemented; it now says what
  `daemon.md` and `processes-and-clients.md` say, so one pattern checks all three. The check was renamed to match.
- **Testing module.** The self-check's per-owner test assertion looks for `ramify/integration-tests`' tests in its
  ordinary source, which the directory specification places there for a separately declared testing module, and a
  new assertion requires that module's `testing` tag.
- **Measurement shape.** `mixed-invocation` now records `sequences` rather than iteration 8's `steps`, and the dependency
  wait entry no longer quotes a run that reached the limit.
- **Specification values.** The architect view specification's implementation status carries this run's values,
  because the evidence file it links now holds them.

## Limitations

- **Hit cost** exceeds the trial thresholds on the toolkit for `revision`, `project`, `session`, `publish` and
  `create`; the mean behavior record is 402.1 characters. Both are later performance work by the user's decision.
- **Remaining document inaccuracies.** `CLAUDE.md` says "`npm run check:self` checks all eleven toolkit owners"; it
  was left untouched because another session is editing it in `/ramify`. `daemon.md`'s status line says "Implemented
  across eleven owners". Historical gates outside `reference:cases` still encode eleven owners: Plan 2's
  I2-30:self-check-eleven and its Plan 1 regression check (`completion-regression.ts`), Plan 2A's
  I2A-12:toolkit-scale and completion case, and Plan 5's I5-14 cases, all run by `reference:verify` for their plans.
- **Reconstruction.** Deriving the captured request from a report's scope alone is inexact with symlinked working
  directories; nothing does it now, but a future consumer of published reports needs the context's captured request.
- AV31's macOS half is unexecuted.
- The publication lock is still held through the dependency wait, as the user's decision leaves for later.

## Handoff

- **Iteration 10** receives:
  - the fixed build, `27f661e`, and the view at the worktree root
    ([above](#materialized-view-at-the-worktree-root)): revision `rev/1:ed24f37f-2394-4d57-8226-f46a04529361:1`,
    62 files, 812,267 bytes, 15 modules, 1,595 records, dependencies and test references measured;
  - `evidence/plan2b-measurements.json` and `evidence/plan2b-cases.json`, rebuilt on this build, with the hit-cost
    table above;
  - no command form to avoid: a context reached by another invocation form measures its dependencies, so the trial
    root may be materialized from any directory with or without `--root`, and a session opened while views exist is
    unaffected by them. Materializing with a fresh daemon from the trial root, as the iteration plans, remains the
    simplest form to record;
  - the documentation still owed by AV37: the specification's status header ("iterations 1–8", "stops before its agent
    trials"), the roadmap's Plan 2B row and the remaining inaccuracies above.
