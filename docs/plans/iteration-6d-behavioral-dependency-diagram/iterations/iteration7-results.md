# Iteration 7 results: Connect the page and run the gate

**Date:** 2026-09-17. **Mode:** direct work in worktree `/tmp/ramify-plan6d-behavioral-diagram`,
branch `feat/plan6d-behavioral-dependency-diagram`. It is based on iteration 6 at `2e692bb`. This is Plan 6D's
completion report.

| Commit | Content |
| --- | --- |
| `ff6ca1b` | The C7 dependency hook and page wiring in `explorer`. |
| `a709d37` | Fix: the analyzer no longer treats the invocation's root selection as a changed input. |
| `516897a` | The browser gate in `integration-tests`. |
| `639177a` | Architecture documents, the raw browser artifact and the BD24 rerun artifact. |

The source revision of the gate is `516897a`. The browser gate, BD24, BD28 and the focused tests ran on a build of
that clean commit. `639177a` changes only documents and artifacts; the BD13 baselines ran on it, clean.

## Provenance

An earlier iteration 7 session hung and was stopped. It left two unreviewed inputs:

- **Kept.** An uncommitted change to `published-project-view.ts`: the hook returns `revision`, a new object on each
  successful load. The dependency hook needs it, so that a reload of an equal revision can request an unfinished
  diagram again.
- **Reworked.** A scratch draft of the dependency hook. The following were changed:
  - The first request is not sent while the page is hidden. The phase stays `idle` until a request is sent.
  - A ready result survives a reload of an equal revision without a transient empty render.
  - A ready answer is bound to the displayed revision and input ID.

Nothing else from that attempt existed.

## Prerequisites

- BD01–BD38 passed in iterations 1–6, as their results record.
- Iteration 4's client operation and counters, iteration 5's `dependencyView` procedure and server state, and
  iteration 6's `ProjectExplorerView` props were present at `2e692bb`.

## Built

### `explorer [ui, browser, dispatch]`

- `src/published-dependency-view.ts`: `usePublishedDependencyView(client, { revision, isStale })` implements C7.
  - **Start.** It requests `dependencyView({ revision })` only after the project view is ready. A hidden page issues no
    request, and a visibility change resumes.
  - **Polling.** A `pending` answer is polled again at least `minimumDependencyPollMs` (1,000 ms) later, while the page
    is visible. A `ready`, `superseded` or `unavailable` answer, and a thrown request, stop polling.
  - **Identity.** A ready answer is shown only when its revision equals the displayed revision, and both the answer's
    revision input ID and `view.inputId` equal the displayed input ID. Otherwise the answer is `unavailable`, with a
    mismatch reason.
  - **Late responses.** A response to an earlier displayed revision, or to an earlier request, is discarded.
  - **Mixing.** Data is shown only while it is bound to the displayed revision. A newly loaded project model therefore
    starts with no dependency data.
  - **Staleness.** `isStale` is the project view's, so a newer publication keeps a ready diagram displayed as stale.
  - **`refresh()`.** It requests the displayed revision again unless its result is ready.
- `src/published-project-view.ts` returns `revision`, the published revision of the displayed model.
- `src/ProjectExplorerPage.tsx`:
  - It passes `dependencies`, `dependencySettings` and `onDependencySettingsChange` to `ProjectExplorerView`.
  - Settings start from `defaultDependencySettings` on each page load and persist across refresh.
  - The page's Refresh calls only the project refresh. The newly loaded revision then requests its diagram, so the
    project view is always obtained first.
- `README.md` describes the connected behavior.
- Tests:
  - `ProjectExplorerPage.test.tsx` adds five C7 cases.
  - The existing page, focus and tree tests replace their throwing `dependencyView` stubs. The module tree stub still
    throws, because that page never requests a diagram.

### `analysis`: input verification fix

The analyzer compared the report's whole inventory with a fresh acquisition, including `scope.invokedFrom` and
`scope.selection`. A resident context publishes reports for invocations from other working directories:

1. `ramify explore` opens the context from the package directory.
2. The harness checks with the project root as its working directory.

The report of such a check records one invocation, and the analyzer acquired with another. Every diagram job after
that check answered `inputs-changed`. The explorer relayed `busy` as `waiting` and started a new analyzer every second
without end: 15 jobs in 30 seconds on the reference. `inputInventory` now removes the two invocation fields before both
comparisons. `dependency-analyzer.test.ts` adds a regression case, which failed before the fix, for a named root and a
found root from other directories. Neither field is a project input, and C3's comparison of captured inputs is
unchanged.

### `integration-tests [testing, ui, dispatch]`

`src/browser-acceptance.ts` (`npm run measure:project-explorer`):

- **Plan 6B workloads, updated.**
  - The subtitle is computed from the served dependency model.
  - The DOM check requires exactly the active links computed independently from that model, the modules in view plus
    out-of-view endpoints, and no occurrence edge.
  - Each refresh waits for a settled dependency state.
  - RS13's source step now shows the non-behavioral link and its `Supporting occurrences: 2`.
- **Two test defects fixed.**
  - The class-filter step selected the first *checked* filter again after its click, so it unchecked a second class.
    The old graph hid this.
  - Pan now starts from an empty corner of the pane, not its centre.
- **`forwarding` fixture and workload.** BD40, with partial coverage.
- **`dependencies` workload.** BD41–BD43 on an isolated `mutation` fixture, with a Collection Review copy as the other
  context.
- **Instruments.**
  - A browser request log per page.
  - A dependency state history, recorded by a `MutationObserver`.
  - Analyzer process-tree memory sampling, which reads procfs children and VmHWM every 40 ms.
  - Daemon diagram counters and settled memory.
- **Selection.** `--only` accepts `forwarding` and `dependencies`.

### Documentation

- `docs/architecture/daemon.md`: a `Dependency diagram` row in the service operation table, plus job and retention
  rules.
- `docs/architecture/processes-and-clients.md`: the analyzer process in the topology diagram and process table, the
  explorer's `dependencyView` relay and polling, and the analyzer entry.
- `docs/architecture/memory-lifecycle.md`: a diagram state row and the analyzer as a bounded subprocess.
- The roadmap row and section, and this plan's status.

## Evidence

### Matrix

| Row | Evidence | Result |
| --- | --- | --- |
| BD01–BD05 | [Iteration 1](iteration1-results.md#evidence) | pass |
| BD06 | Iteration 1, and the regression rerun below | pass |
| BD07–BD12 | [Iteration 2](iteration2-results.md#evidence) | pass |
| BD13 | Iteration 2, and the regression baselines below | pass |
| BD14–BD18 | [Iteration 3](iteration3-results.md) | pass |
| BD19–BD23 | [Iteration 4](iteration4-results.md#evidence) | pass |
| BD24 | Iteration 4, and the rerun below | pass |
| BD25–BD28 | [Iteration 5](iteration5-results.md); BD28 rerun below | pass |
| BD29 | Iteration 5, and the regression rerun below | pass |
| BD30–BD37 | [Iteration 6](iteration6-results.md#evidence) | pass |
| BD38 | Iteration 6, and the regression rerun below | pass |
| BD39 | Reference workload below | pass |
| BD40 | Forwarding workload below | pass |
| BD41 | Dependencies workload below | pass |
| BD42 | Reference and dependencies workloads below | pass |
| BD43 | Verification below | pass |

The raw artifact is [`evidence/iteration7-browser-acceptance.json`](../evidence/iteration7-browser-acceptance.json),
schema `ramify.resident-explorer-acceptance/1`, `status: passed`. It was measured from 16:51:36 to 16:54:48 UTC with
build identity `84324afd…f579e`, Chromium 151.0.7922.173 headless, Node on Linux. Each workload uses its own private
endpoint directory, project copy, real daemon and explorer server. All six workloads passed in one run: reference,
toolkit, mutations, forwarding, dependencies and tree.

### BD39: reference (Collection Review)

`ramify explore` started the server. The page's diagram became ready at `rev/1:1ae2e5a1…:1`,
`input/1:c62fa9e2…55ff`, 3.6 s after the page opened.

- **Model.** Complete coverage, 17 behavioral and 48 non-behavioral dependencies, 28 imported-module and 28
  original-owner edges, 116,219 B.
- **Before the page.** The daemon counters were `behaviorRuns 0, dependencyDiagrams 0`. After ready they were 1/1.
- **Default.** The subtitle was `Showing 2 of 15 modules, 2 displayed links`. The drawn links equalled the independently
  computed behavioral imported-module links, and no occurrence edge was drawn.
- **Project panel.** The cards read 17 and 48 with `not drawn`, then 2 displayed links, `Complete` and the input ID.
- **Controls.** All four combinations of `Show non-behavioral dependencies` and `Link targets` drew exactly their
  independent link sets and out-of-view modules:

  | Setting | Links | Out-of-view modules | Non-behavioral note |
  | --- | ---: | ---: | --- |
  | imported, with non-behavioral | 3 | 3 | `shown` |
  | owners, with non-behavioral | 3 | 3 | `shown` |
  | owners, behavioral | 2 | 2 | `not drawn` |
  | imported, behavioral | 2 | 2 | `not drawn` |

- **Module panel.** For `collection-review/workspace`, `Uses` read 2/1, `Used through this module` 0/0, and `Links
  displayed` matched. The export signature loaded.
- **Imported-module link panel.** `workspace -> catalog/ui` read 1/0, with 1 original owner and 1 referenced original.
- **Original-owner link panel.** The same pair read 1/0, imported through 1 module. Switching projection cleared the
  imported selection.
- **Scope.** Inside `collection-review/workspace`, 6 links and 5 out-of-view modules equalled the independent
  calculation.
- **Other interactions.** Sidebar resize, zoom, pan and a class filter worked.
- **No requests.** Browser `dependencyView` requests were 4 before the controls and 4 afterwards.

### BD40: forwarding

The modules are `fixture`, `a`, `b`, `b/a`, `c`, `d` and `e`:

- `b` forwards `act` and `secret`, which `b/a` owns. Only `act` is exposed.
- `a` has one access through `b` that selects `act` and `secret`, and an unused import of `c`'s `helper`.
- `d` uses `act` through `b` and directly through `b/a`.
- `e` uses `c`'s `any` value.

The check fails with 2 `not-visible` denials for `secret`, and publishes.

- **Model.** Partial coverage with 1 unknown dependency, 2 behavioral and 3 non-behavioral. The page state was
  `partial`, with `Partial coverage: 1 unknown dependency omitted`, `Partial: 1 omitted` and the warning.
- **B versus B/A.**
  - The default links are `a>b`, `d>b` and `d>b/a`, with `b/a` out of view.
  - With original owners, `a` links to `b/a`, imported through `b`. There is no `a>b/a` imported link and no `a>b`
    owner link.
- **Per-original status.**
  - Link `a>b` is `denied`.
  - Its evidence rows are `act` behavioral/allowed and `secret` non-behavioral/denied, each with `Supporting
    occurrences: 1`. The owner link shows the same rows.
- **Unused and unknown.** No link touches `c` or `e` in either projection.
- **Both boundaries.**
  - `d` has two default links, each 1/0, and one owner link `d>b/a` of 1/0, imported through `b` and `b/a`.
  - Its evidence has one original with two paths. `Uses` reads 1/0 and `Links displayed` 2.
- **No requests.** Control changes sent no request: 2 requests in total, both before the controls.

### BD41: mutation

The `dependencies` workload's fixture has a `consumer` that uses `provider`'s `act`, `helper` and `Shape`. Each edit
publishes a new input ID.

- **After analysis.**
  - Revision 5 published while the page showed a ready revision 4.
  - The page kept revision 4, its link and its cards (1/1) and showed `Stale dependency diagram for input
    input/1:08e40d46…`.
  - Refresh loaded revision 5, then its diagram: `input/1:bc10e625…`, cards 2/1.
- **During analysis.**
  1. The page's refresh started an analyzer for revision 8.
  2. While that analyzer was alive, the consumer was edited and revision 9 published.
  3. The analyzer exited 51 ms after the edit. The page showed `superseded` (history `idle, analyzing, superseded`).
  4. No request followed in 3 s, and no link was drawn for the revision 8 model. `behaviorRuns` did not change, and
     `dependencyDiagramInputChanges` stayed 0: the job was superseded.
  5. Refresh obtained revision 9. Its module list, cards and input ID equal the served model and the published report.

  The first attempt reached a running job.
- **Late response.**
  1. The page's request for revision 10 was held at the network layer.
  2. Once revision 10 was ready on the server, the held request was replayed and a real `ready` body of 6,444 B was
     captured.
  3. Revision 11 then published, and the page refreshed to its ready diagram.
  4. The held revision 10 answer was then delivered.

  After 1.5 s the page still showed revision 11, `input/1:9113261a…`, its cards and `complete`. The settled page had no
  timeout.

### BD42: lifecycle and memory

- **Ten settled refreshes of one revision** (reference). Each of ten reloads sent 1 `dependencyView` request.
  - The server answered it from its settled model.
  - `behaviorRuns` and `dependencyDiagrams` stayed 1/1, and `retainedBytes` stayed 1,358,816.
  - Every reload settled to the baseline: 24 listeners, 1 interval and 0 timeouts.
- **Ten publications with refresh** (reference). Each new revision ran one diagram, so the counters went from 1/1 to
  11/11 with no input change. Listeners and timers returned to the baseline each time, and the counts stayed 17/48.
- **Hidden-page polling.**
  1. Another context's diagram job (Collection Review) held the daemon slot.
  2. The page refreshed to revision 6. Server answers over HTTP during the job were mostly `pending/waiting`, with a
     `pending/analyzing` on each expired busy memory.
  3. The page was hidden while the other job still ran. In 3.1 s it sent 0 requests and remained `analyzing`.
  4. Made visible, it resumed with 2 requests and reached ready.

  The smallest visible gap between polls was 1,009 ms.
- **Unavailable.** Killing the analyzer during a job gave `Dependency diagram unavailable: analysis-failed: …exited with
  SIGKILL.` Polling stopped for 3 s, and the modules stayed drawn with no link.
- **Server close.**
  1. SIGINT was sent to the server while its analyzer ran.
  2. The server exited in 101 ms.
  3. The analyzer was observed exited 9 ms after the signal.
  4. `dependencyDiagrams` counted the job, `behaviorRuns` did not change, and the daemon had no analyzer afterwards.

**Daemon settled memory.** "Without" is after the checks, before the page. "With" is after the diagram, with the
analyzer exited and 1 s of settling. Tree RSS includes session supervisors and compiler servers.

| Project | `retainedBytes` without / with | Daemon RSS without / with | Daemon heap used without / with | Daemon tree RSS without / with |
| --- | --- | --- | --- | --- |
| Reference | 1,311,004 / 1,358,816 (+47,812) | 73.6 / 87.5 MiB | 9.5 / 18.5 MiB | 382.8 / 411.0 MiB |
| Toolkit | 20,603,814 / 20,937,296 (+333,482) | 89.2 / 141.7 MiB | 20.0 / 41.4 MiB | 818.6 / 909.3 MiB |
| Mutation | 143,576 / 144,947 (+1,371) | 62.9 / 63.2 MiB | — | 204.9 / 206.9 MiB |

**Analyzer peak memory** (per-process VmHWM) in the real workflow:

| Project | Analyzer | Configuration helper | Compiler helper | Native compiler | Combined peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reference | 135.6 MiB | 59.0 MiB | 117.9 MiB | 154.8 MiB | 389.3 MiB |
| Toolkit | 246.5 MiB | 60.1 MiB | 240.2 MiB | 366.0 MiB | 831.6 MiB |
| Mutation | 79.6 MiB | 60.1 MiB | 87.0 MiB | 42.5 MiB | 203.6 MiB |

**Explorer server RSS.**

- Reference: 120.2 MiB at the end of its workload.
- Toolkit: 146.3 MiB, peak 168.7 MiB.
- Mutation: 79.9 MiB at start, 82.1 MiB after ready and 78.1 MiB before close, with a peak of 84.9 MiB.

The toolkit model is 653,834 B, and the page reached ready 10.8 s after opening.

### BD43 and regressions

**Zero `behaviorRuns` for ordinary and changed-file checks.** Before any diagram request, the dependencies workload
ran three checks against its isolated daemon:

- `ramify check --root` (exit 0);
- `ramify check --root --changed subs/consumer/src/use.ts` after an edit (exit 0);
- a client `check`.

The counters were then `behaviorRuns 0, dependencyDiagrams 0, dependencyDiagramInputChanges 0`. The reference and
toolkit workloads also recorded 0/0 after `ramify explore` and their checks.

**BD24.** `RAMIFY_BD24_ARTIFACT=…/bd24-ramify-iteration7.json npx vitest run src/tests/dependency-diagram-daemon.test.ts`
passed on `516897a`, recorded in `scripts/probes/results/dependency-diagram-daemon/bd24-ramify-iteration7.json`:

- The job ran for 7,093 ms, with 70/367 dependencies, 487 boundaries and 333,482 B. It was still running after the
  watch update and the hook.
- Load and spawn counts:
  - the daemon loaded the analyzer 0 times;
  - the resident tree loaded the analyzer and classifier 0 times and spawned 0 helpers;
  - other traced processes loaded the classifier 0 times;
  - the analyzer tree loaded the classifier once and spawned one helper.
- Both hooks recorded 0 classifier runs. The counters were 1/1 after ready and 1/1 after the edit.

**BD06.** `dependency-behavior-capability.test.ts` and `session-counters.test.ts` passed (5 tests).

**BD13.** `npm run probe:modularity` ran on a clean worktree at `639177a`. The source is the same as `516897a`. Results
are in `scripts/probes/results/modularity/`:

| Artifact | Input ID | Coverage | Headline |
| --- | --- | --- | ---: |
| `plan6d-toolkit-iteration7` | `input/1:6fae64ff…0f9e` | complete | 70 / 367 |
| `plan6d-reference-iteration7` | `input/1:7e21fb92…d6cf` | complete | 17 / 48 |

- **Reference.** Its input ID equals iteration 2's baseline, and its counts equal it.
- **Toolkit.** Its counts equal the toolkit browser workload and BD24 on the same source. They differ from iteration 2's
  69/348 because iterations 3–7 added source.
- **Input IDs.** An input ID covers the inventory scope, including the root path. The browser workloads' copies
  therefore have their own input IDs; the gate compares them with the baselines by source commit and counts.

**BD28 and BD29.**

- `npx vitest run src/tests/dependency-view-server.test.ts` passed (BD28).
- `explorer-router.test.ts` passed within the focused run below (BD29).
- The Plan 6B and 6C workloads (RS13–RS17, MT14–MT16) passed in the same gate. MT16's added gzip is 9,356 B over the
  Plan 6B baseline, within its 25 KiB budget.

**BD38.** The project-view component tests passed in the focused run.

## Verification

```sh
npx vitest run subs/explorer/src/tests/ProjectExplorerPage.test.tsx subs/explorer/src/tests/revision-freshness.test.ts \
  subs/service-api/src/tests/dependency-view.test.ts subs/daemon/subs/contexts/src/tests/dependency-diagram.test.ts \
  subs/analysis/src/tests/dependency-behavior-capability.test.ts                      # 5 files, 28 passed
npx vitest run subs/explorer/src/tests subs/analysis/src/tests/dependency-analyzer.test.ts \
  subs/daemon/src/tests/session-counters.test.ts subs/integration-tests/src/explorer-router.test.ts \
  subs/presentation/subs/project-view/src/tests subs/service-api/src/tests/dependency-model.test.ts  # 14 files, 111 passed
npx vitest run subs/analysis/src/tests/dependency-behavior-capability.test.ts subs/daemon/src/tests/session-counters.test.ts  # 5 passed
npm run type-check                                                                     # clean
npm run build                                                                          # built
npm run check:self   # passed: 15 owners, 395 source files, 0 errors, 0 warnings, 0 analysis limits, 0 denied
npm run measure:project-explorer -- --output docs/plans/iteration-6d-behavioral-dependency-diagram/evidence/iteration7-browser-acceptance.json
                                                                                       # passed, all six workloads, 3 min 18 s
RAMIFY_BD24_ARTIFACT=$PWD/scripts/probes/results/dependency-diagram-daemon/bd24-ramify-iteration7.json \
  npx vitest run src/tests/dependency-diagram-daemon.test.ts                           # 1 passed
npx vitest run src/tests/dependency-view-server.test.ts                                # 1 passed
npm run probe:modularity -- --name plan6d-toolkit-iteration7 --out <scratch>           # clean 639177a
npm run probe:modularity -- --root examples/collection-review --name plan6d-reference-iteration7 --out <scratch>
```

Cleanup:

- `dist/src/ramify daemon stop` stopped the resident daemon that `check:self` used.
- Every browser workload, BD24 and BD28 started and stopped its own daemon and server in a private endpoint directory.
- The only processes signalled were the servers and analyzers those tests started, by PID.

The full test suite and a cucumber-viz audit were not run, so this is not the full-suite gate of the implementation
workflow.

## Deviations

- **Analyzer fix.** The fix in `a709d37` belongs to iteration 3's owner. It changes no contract: an invocation's
  directory and root selection were never inputs. Without it, BD41 and BD42 could not pass after any check from another
  client.
- **Refresh.** The page's Refresh calls only the project refresh. The dependency hook's own `refresh()` exists for C7,
  but the connected page does not need it.
- **Waiting in the browser.**
  - C6 remembers a busy answer for exactly one second, and C7 polls no more often than once per second. A browser poll
    therefore arrives at the edge of the memory: in the gate, the server answered `waiting` to a faster HTTP poller, but
    the page's history showed only `analyzing` during the other job.
  - Waiting over actual HTTP is witnessed at the server, and in the browser through iteration 6's component evidence
    (BD38).
  - No decision was changed. A later revision could extend the busy memory, or have the browser keep `waiting` until a
    non-busy answer.
- **Unavailable.** The page's unavailable state was produced by killing the analyzer, which the runner reports as
  `analysis-failed`. `resource-limit` is not reachable from the browser without configuration, and remains witnessed
  by BD22 and BD25.
- **Status after closure.** The retained diagram is observed through `retainedBytes` differences. Its release on newer
  publication is witnessed by BD22 and BD24, not in the browser workload, where history growth dominates
  `retainedBytes`.

## Limitations

- **Inputs-changed retries.** A persistent `inputs-changed` would start one analyzer per second while a page polls,
  because the router treats `busy/inputs-changed` like any busy answer. The accepted design assumes a publication
  follows promptly. The fixed defect showed the cost of an unexpected persistent cause.
- **Daemon heap after a diagram.** The daemon's heap used grows after a diagram beyond the retained bytes: +9.0 MiB for
  the reference and +21.4 MiB for the toolkit, sampled 1 s after settling. The growth includes response framing, and no
  plateau measurement over repeated diagrams on the toolkit was made. On the reference, ten publications kept listeners
  and timers stable, but daemon RSS was not sampled per cycle.
- **Sampling.** Analyzer peaks come from sampled VmHWM. A process shorter than one 40 ms sample can be missed, such as a
  native compiler that runs very briefly.
- **Browser edge cases.** Hidden-page and late-response evidence use a visibility override and network interception in
  Chromium, over the real server and daemon.
- **Coverage limits.** They are unchanged from iterations 1–3: `any` or unresolved references and unsupported syntax
  are unknown, and an escaping namespace creates no fact. The first release draws production source only.

## Handoff

- **Public contracts.**
  - Daemon: `ServiceConnection.dependencyDiagram({ token, requestId, revision })`, with the outcomes in iteration 4.
  - Server: `ExplorerClient.dependencyView({ revision })`, with the C6 results.
  - Browser: `usePublishedDependencyView` implements C7.
  - Presentation: `ProjectExplorerView`'s `dependencies`, `dependencySettings` and `onDependencySettingsChange`.
- **Baselines.**
  - Collection Review: 17/48 at `input/1:7e21fb92…d6cf`, unchanged.
  - Ramify: 70/367 at `639177a`.
- **Browser fixtures.** `forwardingProject`, `dependencyMutationProject` and the reference and toolkit copies in
  `browser-acceptance.ts`. They run with `--only forwarding|dependencies|reference|toolkit`.
- **Analyzer time and memory.**
  - Against a full batch: iteration 3's table.
  - In the real workflow: the table above, 389 MiB combined for Collection Review and 832 MiB for Ramify.
- **Daemon and server memory.** The tables above.
- **Reuse.** A later MCP or CLI client, test filter, trends or module-redesign plan can call the daemon's
  `dependencyDiagram` operation through the lightweight client without another compiler feature:
  - it is revision-bound and on demand;
  - it runs in its own process and leaves the retained session untouched.

  Such a client must poll or retry `busy` itself, as the explorer server does. It must treat `superseded` as final for
  its revision. Test source filters need the testing view that the projection already computes, and a new DTO field.
- **Deferrals.** Test-source filters, runtime and type-load filtering, trends, confidence estimates, alternative
  layouts, pushed events and module-move suggestions.
