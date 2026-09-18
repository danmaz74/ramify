# Iteration 8 results: Real runs, invariance and hit cost

**Date:** 2026-09-18. **Mode:** direct work in worktree `/tmp/ramify-plan2b-architect-view`,
branch `feat/plan2b-architect-view`. It is based on `2a2abde`, iteration 7's completed results. The commits are
`64914b6` (harness and measurement recipe), `9f8f841` (documentation) and the results commit that adds this file,
the evidence and the specification's implementation status, with `af79737` adding one harness witness. Every
verification command was run on `af79737`.

**Outcome.** AV29, AV30, AV31 (Linux), AV33 and AV34 pass. AV32's measurement is recorded and **exceeds the trial
thresholds on the toolkit for five of the six terms**; the reference project is within them. Every other budget of
the main plan holds. Under the iteration's exit criteria and the specification's hypothesis, the plan stops here for a
user decision before iteration 9's agent trials. Two predecessor defects found by the real runs are recorded under
[Findings](#findings); neither is fixed here. `npm run reference:cases` fails five tests in four predecessor harness
files, identically at `577b980` before this plan ([Verification](#verification)).

## Prerequisites

- Iteration 7's handoff held:
  - the built `ramify materialize --view architect` published the view with measured dependencies;
  - without `--view` the request and output were Plan 2A's;
  - a `--view architect` invocation without retained facts started one analyzer job, and every synchronized
    materialize performed a required sweep;
  - `dependencyWait` in `subs/daemon/src/service.ts` held 250 ms and 125 s.
- I2A-09:compact-wire failed at `2a2abde`, as iteration 7 recorded.
- The worktree was clean and its build current.

## Built

### Harness: `scripts/reference-harness/plan2b-cases.ts` and `plan2b.test.ts`

Every case copies the reference project or the toolkit (tracked and untracked unignored files, generated names left
out, `node_modules` linked), owns an endpoint directory `/tmp/rp2b-*` with mode 0700, and runs the built launcher
`dist/src/ramify`, which executes the compiled client. `withOwnedDaemon` stops the daemon in `finally`, reads its
record, confirms `daemon status` answers not running, waits for every process it recorded (the daemon and each
context's compiler) to exit, signals by PID only a recorded process still alive, and removes the directory.
Every command runs from the project root without `--root`, so each invocation is the one that opened its context
(see [Findings](#findings)). The test file asserts; `RAMIFY_PLAN2B_EVIDENCE=<file>` writes the evidence.

- **`realRuns`** (AV29, AV31). One daemon materializes a reference copy and a toolkit copy: first run, an unchanged
  repeat 1.5 s later, and a rewrite after deleting the view. Two expectations are computed without the daemon:
  - **Declarations.** `declaredModules` reads each `module.ramify` with line patterns that share no code with the
    parser: header name and tags, owned exposures, relays and aliases. `structuralExpectation` derives the file set,
    each `module.json`'s identity, parent, children, tags and purpose state, and, for the reference project, every
    owned exposure's role and destinations (wildcard files through their export lines) and every relay's
    `reexposed` entry, resolved through each child's contract to its parent. For the toolkit it checks the file set
    and module facts.
  - **Bytes.** Before the daemon runs, `inProcessArchitectFacts` opens a retained session in the test process with
    the CLI's project request, queries `architectView` with the specification's limits, runs
    `analyzeDependencyDiagram` in process on that revision's report, and later renders with the daemon's revision
    identifier. The reference view must equal it byte for byte.

  A second daemon then materializes the same copies again, their views deleted, and a second copy of each at another
  path.
- **`invariance`** (AV30). One reference copy at one path runs the same check sequence on two fresh daemons, alone and
  with materializations interleaved, restoring its files and removing generated directories between the runs. Steps:
  check (opens); edit a production source, wait for the watcher's revision, check; edit a test file, wait, check;
  check again. The interleaved run adds `--view architect` after the first check, `--view api --view architect --all`
  after the second and `--view architect` after the third, each followed by a 1.5 s pause.
- **`apiViewIdentity`** (AV34). `git archive 577b980`, the plan's inventory commit, is built in an owned directory
  (`scripts/build-production.ts`). On the same reference and toolkit copies, that build and this one each run
  `materialize --all` without `--view` under their own daemon; the published `.ramify` trees are compared.
- **`entryClosures`** (AV34). `validatePackageEntries` against the reviewed Plan 1 and Plan 2 metadata; the manifest's
  `type`, `main`, `types`, `bin` and `exports` compared with `577b980`'s; `ramify.ts/client` and `ramify.ts/cli`
  imported from a private npm prefix under the process probe (`withSequenceProcess`).
- **Instruction block** (deliverable 3). `renderedInstructionBlock` renders a one-module view and extracts its
  `README.md` fence; the blocks in `AGENTS.md` and `CLAUDE.md` must equal it.

### Measurement: `scripts/measurements/plan2b.mjs`, `npm run measure:plan2b`

It installs the package into a private prefix, runs the installed launcher (the compiled client), and writes
`evidence/plan2b-measurements.json`. Workloads, each with its own owned endpoint and daemon stopped in `finally`:

- `reference`, `toolkit` and `synthetic-100`: cold (new daemon and context), unchanged repeat, retained facts (view
  deleted, same revision), three warm samples (edit a source file, wait for the watcher's revision, materialize, so the
  analyzer runs), API only and both views; view files, bytes and record lengths per file kind; the largest
  `behavior.jsonl`; a normalized manifest; daemon peak memory from `daemon status` polled every 100 ms; counters.
- Hit cost on the reference project and the toolkit: `rg -n -i <term> .ramify-architect/` from the root with
  `RIPGREP_CONFIG_PATH` unset; lines and bytes of output, per file kind and per file.
- `session-query`: `architectView` in process, three hot queries and one after `releaseCompiler`, on both projects.
- `mixed-invocation` and `open-with-view`: witnesses of the two findings.

Its `budgets` list sets each budget beside the measured value.

### Plan 2A compact wire

`scripts/reference-harness/plan2a-service-cases.ts`: I2A-09:compact-wire's expected key list gains `'view'`, the
orchestrator's decision; nothing else in the case changed. This is the intended wire addition of C6: every
`MaterializedTarget` names its view. The case's intent holds: only summary fields cross the codec, and the API view's
published bytes are unchanged (AV34 below).

### Documentation

- `AGENTS.md` gains "Architecture discovery" and `CLAUDE.md` a short "Architect view" section, each with the
  specification's instruction block verbatim, including "A test record's exercises names the symbols its test file
  calls." `CLAUDE.md` has no other change.
- `docs/architecture/architect-view.spec.md`: implemented status, the [implementation status](../../../architecture/architect-view.spec.md#implementation-status)
  section with the measured values and known gaps, and a determinism clarification (see [Deviations](#deviations)).
- `docs/architecture/materialized-api-view.spec.md`: `--view` in its status and Materialization section, the reserved
  architect names, and the known gap of [finding 3](#findings).
- `docs/architecture/README.md` lists the architect view; `processes-and-clients.md` gains a `materialize` row.
- `docs/development/testing.md`: the `materialize` row with `--view`, and `measure:plan2b` with the harness command.
- `scripts/measurements/README.md` and `scripts/reference-harness/README.md` describe the new recipe and cases.
- Owner READMEs, the documentation earlier iterations deferred (their "iteration 7"): `analysis/typescript`
  (`shapes`, `testTitles`), `analysis` (projection, session query, feature titles, renderer, test references),
  `analysis/project` (reserved names), `daemon` (materialize with views, the dependency wait, the architect target),
  `daemon/contexts` (`views`, `dependencyFacts`) and `cli` (`materialize --view`). First paragraphs, which are the
  modules' purposes, are unchanged.
- `package.json` gains `measure:plan2b`.

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| AV29 | `plan2b.test.ts`, real runs; `evidence/plan2b-cases.json` | pass |
| AV30 | `plan2b.test.ts`, invariance | pass |
| AV31 | `plan2b.test.ts`, real runs | pass on Linux; macOS unexecuted, no macOS host |
| AV32 | `evidence/plan2b-measurements.json`, hit cost | measured; **toolkit exceeds the thresholds** |
| AV33 | `evidence/plan2b-measurements.json`, budgets | pass: every budget holds except hit cost, which is AV32's |
| AV34 | `plan2b.test.ts`, regressions; Plan 2A handlers; verification commands | pass |

AV29 witnesses:

- **Reference.** `materialize --view architect` exited 0 with no stderr in 5.5 s: 15 modules, 123 records, 85,337
  bytes, dependencies measured. `_meta.json` names the context's revision and input identity with
  `"dependencies":"measured","dependencyScope":"production","testReferences":"measured","metrics":"unavailable"`,
  `cut` 9 and `detailsUnavailable` 2.
- **Toolkit.** 13.9 s: 15 modules, 1,591 records, 809,330 bytes, measured; `cut` 351, `detailsUnavailable` 1,
  `dynamicTitles` 20.
- **Declaration expectation.** 0 mismatches on both. On the reference project it checked the 62-file set, 15
  modules' facts, 44 owned exposures (one wildcard file) and 35 relays. Six mutations of a rendered tree, each
  applied alone, were each rejected: an exposed record made internal, a `reexposed` entry removed, a destination
  changed, module tags changed, a file removed and `_meta.json`'s input changed. A scratch script,
  `.reference-work/p2b8-structural-mutations.ts` (ignored, not committed), ran them.
- **Byte expectation.** The in-process session had the daemon's input identity, and the rendered reference view
  equals the daemon's byte for byte (in process: open 1.9 s, query 0.10 s, analyzer 3.1 s).
- **Feature titles.** The integration tests' `.feature` record equals the titles read with line patterns.
- **Unchanged repeat.** 0 bytes written, 1 unchanged; no file's bytes, size, modification time or inode changed.
- **No revision.** The published sequence and the `revisions` counter were unchanged 1.5 s after publishing.
- **Daemons stopped.** Each of the harness's daemons stopped with exit 0, `daemon status` answered not running, every
  recorded process exited on its own, none was signalled, and each endpoint directory was removed.

AV30 witnesses (reference copy at one path, two fresh daemons):

- **Reports.** The four check reports are equal field by field, `runId` aside.
- **Sequences.** Both runs published sequences 1, 2, 3, 3 with causes `open`, `watch`, `watch`, `watch`; the history,
  the session's sequence, observed inputs and fact bytes are equal at every step.
- **Counters that must stay identical** are equal at every step: `revisions`, `cancelledAnalyses`,
  `reusedRevisions`, `coalescedEvents`, `evictions`, `rejectedRequests`, `disconnectedSlowConsumers`, `audits`,
  `auditMismatches`, `coveredRequests`, `coldOutcomes`, `deadlineOutcomes` and `dependencyDiagramInputChanges`.
- **Counters a materialization changes.** Each of the three materializations changed exactly `sweeps` +1 and
  `analyses` +1 (its required sweep) and `dependencyDiagrams` +1 and `behaviorRuns` +1 (one analyzer job for a
  revision without retained facts). At every step the interleaved run's `sweeps`, `analyses`, `dependencyDiagrams`
  and `behaviorRuns` exceed the control's by exactly the sum of the preceding materializations' changes.
- **No revision.** Each materialization left the published sequence unchanged, immediately and 1.5 s later, and every
  invariant counter unchanged.
- `shapeRuns()` and `testTitleRuns()` count in the session worker and are not in daemon status; AV11 witnessed that
  checks, watch updates and changed-file checks never run them.

AV31 witnesses:

- **Same daemon.** A view deleted and rewritten at the same revision is byte-identical, on both projects.
- **Second daemon, same paths.** Identical apart from the revision identifier, whose generation differs; the input
  identity is equal.
- **Second daemon, other paths.** Identical apart from the revision and the input identity. The input identity differs
  because it records the absent `module.ramify` of each ancestor directory (see [Deviations](#deviations)); no host
  path appears in any file.
- **Revision placement.** The revision identifier occurs exactly once in `_meta.json`, `README.md` and each of the 15
  `module.json` files, and nowhere else.
- **macOS.** Unexecuted: no macOS host was available. `evidence/plan2b-measurements.json` records a SHA-256 manifest of
  each view with its revision replaced; a macOS run compares it after replacing the input identity too.

AV34 witnesses:

- **API view without `--view`.** The build of `577b980` and this build published byte-identical `.ramify` trees,
  apart from each `_meta.json`'s revision: reference 29 targets, 153 files, 124,460 bytes; toolkit 29 targets, 890
  files, 2,101,499 bytes. This build's output is Plan 2A's two lines.
- **Plan 2A harness.** `plan2a.test.ts` passes within `reference:cases`. The 57 Plan 2A materialize handlers iteration
  7 ran (every memory handler of I2A-02 and I2A-06 to I2A-11, and I2A-12:limit-preservation) pass, 57 of 57, including
  I2A-09:compact-wire. See [Plan 2A materialize handlers](#plan-2a-materialize-handlers).
- **Package entries.** All eight validate; `type`, `main`, `types`, `bin` and `exports` equal `577b980`'s.
- **Closures.** Importing `ramify.ts/client` loads exactly its eight reviewed daemon modules; importing
  `ramify.ts/cli` loads 12 files under `dist/subs/cli/src/` and `dist/subs/service-api/src/web-discovery.js`, none
  under `dist/subs/analysis/`, no session, worker or compiler module and no `typescript` package. Neither import
  spawns, launches, connects, listens or binds.
- **Commands.** Build, type-check, `check:self` and `check:reference` pass. `reference:cases` passes every Plan 2A
  and Plan 2B test and fails five predecessor tests exactly as at `577b980` (see [Verification](#verification)).

## Hit cost (AV32)

`rg -n -i <term> .ramify-architect/` from the project root. Bytes are the output an agent receives, path prefixes
included; 64 KB is read as 65,536 bytes, and every exceeded value also exceeds 64,000.

| Term | Toolkit lines | Toolkit bytes | Reference lines | Reference bytes | Within 200 lines and 64 KB |
| --- | ---: | ---: | ---: | ---: | --- |
| `revision` | 187 | 114,072 | 54 | 21,860 | toolkit: bytes exceeded |
| `project` | 546 | 322,888 | 0 | 0 | toolkit: lines and bytes exceeded |
| `session` | 214 | 125,498 | 22 | 9,499 | toolkit: lines and bytes exceeded |
| `publish` | 113 | 81,161 | 1 | 682 | toolkit: bytes exceeded |
| `watch` | 40 | 23,517 | 0 | 0 | yes |
| `create` | 198 | 145,175 | 37 | 16,469 | toolkit: bytes exceeded |

Toolkit lines and bytes per file kind:

| Term | `behavior.jsonl` | `supporting.jsonl` | `tests.jsonl` | `module.json` | `README.md` | `_meta.json` |
| --- | --- | --- | --- | --- | --- | --- |
| `revision` | 35 / 18,085 | 71 / 39,280 | 56 / 51,158 | 19 / 3,288 | 5 / 1,878 | 1 / 383 |
| `project` | 166 / 86,472 | 208 / 113,878 | 131 / 113,053 | 30 / 5,792 | 11 / 3,693 | — |
| `session` | 76 / 34,138 | 65 / 33,204 | 64 / 53,616 | 4 / 2,154 | 5 / 2,386 | — |
| `publish` | 16 / 8,630 | 39 / 20,906 | 55 / 50,342 | 1 / 534 | 2 / 749 | — |
| `watch` | 5 / 2,457 | 15 / 7,443 | 16 / 12,545 | 1 / 366 | 3 / 706 | — |
| `create` | 54 / 27,507 | 11 / 5,978 | 125 / 110,367 | — | 8 / 1,323 | — |

- **Line length.** A toolkit hit line averages 586–733 bytes; the longest is 2,370 bytes. Test records hold up to 40
  titles plus `exercises` and are the longest (2,763 characters); they return the most bytes for every term except
  `project`.
- **`revision`.** It matches the `"revision"` key of all 15 `module.json` files and `_meta.json` by construction; 19
  `module.json` lines match in all.
- **Record lengths.** The toolkit's mean behavior record is 402.0 characters (longest 793) against the 300-character
  evidence target; supporting 440.5, tests 762.0. The reference project's are 486.7, 483.7 and 388.0.
- **Baseline.** The specification's source baseline for `project` is 1,077 source lines; the view returns 546.

By the specification's [hypothesis](../../../architecture/architect-view.spec.md#hypothesis), a hit-cost measurement
above the trial thresholds because common terms return too many lines falsifies H1. On the toolkit, `project` and
`session` exceed the line threshold and five terms exceed the byte threshold. As instructed, the view format is
unchanged; the plan stops for a user decision.

## Budgets (AV33)

| Budget | Limit | Measured | Holds |
| --- | --- | --- | --- |
| Architect session query, warm, toolkit | 15 s | hot 0.67–0.85 s; after `releaseCompiler` 1.72 s; reference 0.08–0.12 s and 0.70 s | yes |
| Whole `materialize --view architect`, warm, toolkit, analyzer included | 90 s | 8.65–8.76 s (median 8.71 s); new daemon and context 14.9 s | yes |
| Unchanged repeat | 0 bytes | 0 on the toolkit, the reference project and S100 | yes |
| View size, toolkit | 8 MiB | 809,330 bytes, 62 files | yes |
| `maxProjectionBytes` | 64 MiB | configured 64 MiB; toolkit projection 1,205,296 bytes | yes |
| `maxArchitectBytes` | 64 MiB | configured 64 MiB (`residentPublishLimits`); largest view 809,330 bytes | yes |
| Dependency wait | 250 ms, 125 s | configured `dependencyWait`; the witness reached the limit in 125.7 s | yes |
| Hit cost per term, toolkit and reference | 200 lines, 64 KB | see [Hit cost](#hit-cost-av32) | **no, toolkit** |
| Mean behavior record, toolkit | 300 characters, evidence | 402.0 characters | evidence only |

Further measured values:

| Project | Cold | Repeat | Retained facts | Warm, analyzer | API only | Both views | Peak combined RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Reference | 5.65 s | 0.43 s | 0.40 s | 3.41 s (three samples) | 0.38 s | 3.62 s | 451 MiB |
| Toolkit | 14.89 s | 1.12 s | 1.11 s | 8.65–8.76 s | 1.28 s | 15.46 s | 1.10 GiB |
| S100 | 8.42 s | 0.80 s | 0.85 s | 4.57–4.87 s | 0.43 s | 6.80 s | 462 MiB |

- "Cold" includes starting the daemon and opening the context. "Retained facts" rewrites the whole deleted view at the
  same revision, so it is the session query, rendering and publication without the analyzer. "Both views" on the
  toolkit ran the analyzer for the revision that restored the edited file.
- Peak combined RSS sums the daemon, its session worker and its compiler; the toolkit daemon alone peaked at 183 MiB.
- Views: reference 62 files, 85,337 bytes, `README.md` 7,926 bytes, largest `behavior.jsonl` 2,944 bytes; toolkit 62
  files, `README.md` 9,295 bytes, largest `behavior.jsonl` 50,571 bytes (`analysis`); S100 402 files, 292,872 bytes,
  1,100 records, its test files hold no `describe`, `it` or `test` call.

## Findings

1. **Hit cost.** See [Hit cost](#hit-cost-av32). The decision belongs to the user: run the trials anyway as evidence,
   change the record format (for example, move `sig`, `doc` or test titles out of the searched lines), split the view,
   or take up a query interface.
2. **The analyzer after an invocation change (Plan 6D defect).** A context republishes its revision (cause `request`,
   same input identity) when another invocation form reaches it, for example `check` from the project root followed by
   `materialize --view architect --root <root>` from another directory, or `check --root .` followed by a command
   without `--root` from the same directory, as `npm run check:self` and a later `ramify materialize` would do. The republished report's `request.project` names the new invocation, while its
   `snapshot.inputs` are those the session captured for the opening one. `analyzeDependencyDiagram` re-acquires with
   `report.request.project`; the discovery inputs differ (the absent `module.ramify` of each ancestor of the invocation
   directory, or the invocation directory itself), so every job answers `inputs-changed`.
   - **Effect.** The `mixed-invocation` witness waited the full 125 s (125.7 s; 39 analyzer jobs, 38 answering
     `inputs-changed` and the last aborted at the limit) and published `dependencies: unavailable (wait-limit)`; the
     next materialization in the opening form measured the facts in 3.4 s. A reference copy checked with
     `--root .` and then without it republished with cause `request`, and the analyzer, run in process on that
     report, answered `inputs-changed` too. The explorer's diagram requests the same jobs, so it answers `busy` in
     that state (not run).
   - **Fix, for a decision.** Pass the analyzer the request the session's inputs were captured with
     (`daemon/contexts`), or exclude invocation-discovery inputs from its comparison (`analysis`).
3. **Generated directories at session open (retained compiler).** `RetainedSourceState.#listing` in
   `analysis/typescript` lists directories with `readdirSync` and reports every member to the observer, and
   `#readDirectory` probes each member; neither omits reserved names, unlike the configuration host.
   - **Effect.** A resident session opened while views exist records each `.ramify` and `.ramify-architect` directory
     it lists as an input. The `open-with-view` witness found 30 generated inputs (3,640 against 3,610) and a
     different input identity from a batch check of the same project. A session opened before the views existed is
     unaffected, and publishing a changed view afterwards still started no revision.
   - **Scope.** Plan 2A's `.ramify` directories are affected the same way; Plan 2A's evidence opened its sessions
     before any view existed. This also explains why the in-process expectation must open before the daemon writes.
   - **Fix, for a decision.** Omit reserved segments in `#listing`, as `configuration.ts` does.

## Materialized view at the worktree root

After the code commits, at `af79737` (the results commit changes no module input), the built CLI ran at the worktree
root with a new owned endpoint, `/tmp/rp2b8-root`, from the root without `--root`:

```text
$ ramify materialize --view architect
Root: /tmp/ramify-plan2b-architect-view
Materialized: revision 1; 1 target(s), 1591 entries, 809330 bytes written, 0 unchanged
Architect view: .ramify-architect, 15 modules, 1591 records, dependencies measured
exit 0; elapsed 14203 ms

$ ramify materialize --view architect
Materialized: revision 1; 1 target(s), 1591 entries, 0 bytes written, 1 unchanged
exit 0; elapsed 1246 ms
```

- **Revision** `rev/1:1b07e9b5-7c77-43f0-bb43-04b7de3959c3:1`, published by the opening (`open`), input
  `input/1:6268bc490a4d1354394eb659d0e3d49f491fcff4274a220c83bc38059711204f`.
- **`_meta.json`:**

  ```json
  {"schema":"ramify.architect-view/1","revision":"rev/1:1b07e9b5-7c77-43f0-bb43-04b7de3959c3:1","input":"input/1:6268bc490a4d1354394eb659d0e3d49f491fcff4274a220c83bc38059711204f","modules":15,"dependencies":"measured","dependencyScope":"production","testReferences":"measured","metrics":"unavailable","cut":351,"detailsUnavailable":1,"dynamicTitles":20}
  ```

- **Files.** 62 files, 809,330 bytes. The SHA-256 of its manifest (`<sha256> <path>` per file, paths in byte order)
  is `faedcd5ff9339d7ed5371279bad7de3be47a76317d11a92050c2aa2851aa9bb0`.
- **Ignored.** `git check-ignore` names `.gitignore:37`; `git status` does not list it; `rg -n -i createProjectBinding .`
  returns no line from it, while `rg -n -i createProjectBinding .ramify-architect/` returns 7.
- **Daemon.** The daemon (PID 556182) was stopped with `daemon stop`; the PID is gone, `daemon status` answers not
  running, and the endpoint directory was removed. The view stays on disk.

## Plan 2A materialize handlers

`.reference-work/plan2a-materialize-driver.ts` (iteration 7's scratch driver, ignored) ran the same 57 handlers with an
owned, empty `RAMIFY_ENDPOINT_DIR` (`/tmp/rp2b8-h`) on the sources later committed as `64914b6` and `9f8f841`, which
`af79737` does not change for these handlers: 57 passed, 0 failed,
including I2A-09:compact-wire (10 assertions) and I2A-10:grammar-default, whose first help line for `materialize` is
still exactly Plan 2A's. The driver started no daemon in its directory.

## Verification

All on `af79737`, in this order, with `RAMIFY_ENDPOINT_DIR=/tmp/rp2b8-v` owned by this iteration:

```sh
npm run build                 # built
npm run type-check            # clean, all four scopes
npm run check:self            # passed: 15 owners, 413 source files, 15 resources, 6118 accesses, 0 errors, 0 warnings, 0 analysis limits, 0 denied
npm run check:reference       # passed: 15 owners, 54 source files, 5 resources, 294 accesses, 0 errors, 2 warnings, 0 denied
RAMIFY_PLAN2B_EVIDENCE=docs/plans/iteration-2b-generated-views/evidence/plan2b-cases.json \
  npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan2b.test.ts   # 6 passed, 124 s
npm run reference:cases       # 381 passed, 5 failed in 4 files (below), 36 files
npm run measure:plan2b        # exit 0: no failure; exceeded: toolkit hit cost, the mean-record evidence target, the defect witness
```

- **`reference:cases` failures.** All five are in predecessor harness files, and the same five fail at `577b980`,
  before any Plan 2B change: a clone of that commit, built, ran the four files with the same result.
  - `linking.test.ts` ("validates all eleven current toolkit descriptions") and `self.test.ts` (I1-27:self-check and
    I1-27:self-negative) expect Plan 1's eleven toolkit owners; the toolkit has fifteen since Plans 6B–6D added
    `explorer`, `integration-tests`, `presentation/project-view` and `service-api`.
  - `verify.test.ts` (iterations 5 and 6): the verify command exits 1 on the same owner expectations.
  - `plan5-completion.test.ts` requires "MCP adapter, unsaved-content overlays and the explorer are not implemented" in
    `daemon.md` and `processes-and-clients.md`; the explorer is implemented, and both documents said so before this
    plan.

  Every Plan 2A and Plan 2B test in the run passed, `plan2a.test.ts` and `plan2b.test.ts` included. Updating those
  predecessor expectations is outside this iteration and needs a decision.
- **Endpoints.** `check:self` and `check:reference` started daemon 510833 in `/tmp/rp2b8-v`; it was stopped with
  `daemon stop`, the PID is gone and status answered not running before the harness ran. `reference:cases` started
  no daemon in that directory; its process cases own theirs. The harness's own daemons (eight, in `/tmp/rp2b-*`) and
  the measurement's (six, in `/tmp/rp2b-m-*`) each stopped with exit 0, not running, PID gone, none signalled,
  directory removed.
- **Other processes.** A daemon and explorer of the `ramify-plan6d-behavioral-diagram` worktree, two explorers of
  `/ramify` and an old `/tmp/ri11-Rkvfqi` directory from 2026-09-14 belong to other sessions and were not touched. No
  process of this worktree remains.
- **Measured tree.** The measurement records commit `af79737` with one tracked change, the specification's status
  text, which no module reads.
- **Full suite.** The full Vitest suite was not run; it runs through the cucumber-viz audit.

## Deviations

- **Determinism modulo two analysis identifiers.** The specification said identical inputs produce byte-identical
  views. The `revision` names the daemon context's generation (`rev/1:<generation>:<sequence>`), so two daemons differ
  in it alone; the `input` identity records the absent `module.ramify` of each ancestor directory, so copies at
  different paths differ in it too. AV31 compares with those replaced, and the specification's "Determinism and
  bounds" now says so.
- **AV29's expectation.** "An independently computed expectation" is realized twice: from the declarations with line
  patterns, and as bytes rendered from an in-process session and analyzer. The second shares the renderer and the
  session code with the daemon; it is independent of the daemon, the contexts, the wire and the publisher. Its
  session must open before any view exists ([finding 3](#findings)).
- **AV30's scope.** The invariance sequence runs on the reference project, with sessions opened before any view
  existed; the open-with-view case is a finding, measured separately.
- **AV33's "with and without dependency facts".** Measured as warm runs whose revision has no retained facts (the
  analyzer runs) and runs with retained facts; facts made unavailable by the wait limit are measured by the
  `mixed-invocation` witness. "Warm" session query is measured in process, hot and after releasing the compiler.
- **Hit-cost bytes.** Bytes of `rg` output with its path prefixes, which is what an agent receives.
- **Compact wire.** I2A-09:compact-wire's key list gained `view`, as decided by the orchestrator.
- **Rebuild after `package.json`.** Adding the script changed the package's runtime identity; the compiled client then
  refused to run until `npm run build`. Every run above used a build made after the change.

## Limitations

- The plan stops for a user decision on the hit cost; iteration 9 has not started.
- `reference:cases` does not pass because of five predecessor tests that fail identically at `577b980`; the
  completion boundary requires it to pass.
- Findings 2 and 3 are unfixed. Until finding 2 is fixed, materialize from the project root in the form that opened
  the context, or with a fresh daemon.
- AV31's macOS half is unexecuted.
- Latencies were measured on a shared host where another session's daemon and explorers were idle.
- `plan2b.test.ts` takes about two minutes and builds `577b980` in a temporary directory; it is part of
  `reference:cases`.

## Handoff

- **User decisions.**
  - H1's hit-cost criterion fails on the toolkit (table above).
  - Findings 2 and 3: fix before the trials, or record them as known gaps.
  - The five predecessor `reference:cases` failures: update their expectations to the fifteen-owner toolkit and the
    revised status statements, or record them.
- **Iteration 9**, if it proceeds, receives:
  - the materialized view at the worktree root, its commit, revision and `_meta.json`
    ([above](#materialized-view-at-the-worktree-root));
  - the hit-cost table and `evidence/plan2b-measurements.json`;
  - the rule to run every `ramify` command at the worktree root in one invocation form, or with a fresh endpoint,
    because of finding 2;
  - iteration 6's D3 and D4 checks.
