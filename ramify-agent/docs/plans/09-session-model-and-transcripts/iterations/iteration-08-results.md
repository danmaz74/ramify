# Iteration 8 results: diagram markers

**Date:** 2026-09-23. **Owner:** `web`, and the served progress fixture
under the harness's test helpers. **Branch:** `feat/plan9-session-model`.

The progress diagrams now show where agents are working. Capability nodes
and By-module bodies are marked with their live sessions by role, and with
their suspended and interrupted sessions apart. Selecting one lists its
sessions, each opening its transcript. A run-level strip holds the sessions
that no drawn element reaches. The served fixture now holds sessions in every
state and every lineage relation, and a live run whose engineer takes one
step per control request. The web receives only the iteration 6 protocol and
adds no exposure.

## Final names

### Web

| File | Holds |
| --- | --- |
| [session-marks.tsx](../../../../subs/web/src/session-marks.tsx) | `DiagramSessions` (`{ planId, runId, sessions }`); `capabilityOf(reach)`, `moduleOf(reach)`, `sessionsBy(sessions, elementOf)`; `isMarked`, `marksText` (such as `1 live (engineer), 1 suspended`); `SessionMarks`; `panelOrder`; `ElementSessions`; `RunSessionStrip`; `SessionMarksLegend` |
| [capability-graph.tsx](../../../../subs/web/src/capability-graph.tsx) | `CapabilityDependencyGraph` takes `sessions?: DiagramSessions`. `layoutCapabilityGraph(capabilities, marksHeight = 0)`. `sessionMarksHeight` (24 px) |
| [capability-module-tree.tsx](../../../../subs/web/src/capability-module-tree.tsx) | `CapabilityModuleTree` takes `sessions?: DiagramSessions`. `comparisonNodes(comparison, sessions = new Map())`, keyed by module |
| [run-page.tsx](../../../../subs/web/src/run-page.tsx) | `Progress` reads `getRunSessions` as `useRunQuery('progress-sessions:<run>', version, …)` and passes it to both views |

**What is marked.**

- A capability node is marked with the sessions whose reach names its
  capability: a `work-item` reach, or a global fork's `request` reach.
- A module body is marked, through the web module's own `renderNodeBody`,
  with the sessions whose `work-item` reach names that module.
- Markers attach by capability ID and by module. A session whose element is
  not drawn is shown on the strip, so a marker follows whatever the graph
  draws.

**What a mark shows.**

- `N live` (filled), with one `role-chip` per role, `×n` when several
  sessions share a role.
- `N suspended` (dashed).
- `N interrupted` (outlined red).
- A finished session makes no mark.
- The node's accessible name gains `, sessions: <marksText>`.
- Classes: `.session-marks`, `.session-mark-live`, `.session-mark-suspended`,
  `.session-mark-interrupted`, `.role-chip`.

**Layout.**

- Given sessions, every capability node keeps a 24 px marks line, empty or
  not, so a mark never moves a node.
- A module's marks sit in its header, `.capability-module-heading`, beside
  its name. The node widens to hold them, and its height is unchanged.

**The side panel.**

- `ElementSessions` is labelled `Sessions of <element>`. It is in:
  - the capability graph's `CapabilityDetail`;
  - By module's `ModuleDetail`, for the sessions of the module;
  - By module's `RowDetail`, for the sessions of the row's capability.
- Order (`panelOrder`): live, then suspended, then interrupted, each by
  opening sequence; then finished, latest change first.
- Each entry links `sessionHref(ref)`. A live one also shows
  `awaiting <invocation>`, which links `chapterHref`. A finished one shows
  its reason.

**The strip.**

- `RunSessionStrip` is labelled `Sessions without an element here`. It sits
  above the graph's canvas, and in By module between the header and the
  canvas.
- It holds `run` reaches, and any session whose element this view does not
  draw, with its `reachText`. In By module that includes a global fork, whose
  `request` reach names no module. It carries the strip's own marks.
- Unfinished sessions are listed. Finished ones are under
  `<details>` `N finished`.

**Following.** Every change of a session's state is a run event. So the
Progress query reloads when the run poll (`useRunProgress`, 1 s while
running) reads a new version: a mark changes within one poll of the change.
A failed sessions query leaves both diagrams unmarked. It shows
`The sessions are not marked: <message>` (`role="status"`).

### Harness test support

| Name | Where | What |
| --- | --- | --- |
| `{ kind: 'await', until: () => Promise<unknown> }` | [scripted.ts](../../../../subs/harness/subs/agent/src/scripted.ts) `ScriptStep` | Waits until `until()` settles, ending early on Stop: a script its test paces |
| `runSessionScenario({ root?, port? })` | [session-scenario.ts](../../../../subs/harness/src/tests/helpers/session-scenario.ts) | `root` runs the scenario in an existing copy. `port` now receives the `ScriptedAgent`. The final check reads the run by its ID, not `onlyRun` |
| `writeArchitectTreeFixture(root)` | [progress-fixture.ts](../../../../subs/harness/src/tests/helpers/progress-fixture.ts) | now exported, to write the tree again after modules are added |
| `sessionPlans`, `addSessionRuns(root)`, `Pacer`, `liveRunSettings(root, pacer)`, `startLiveRun(origin, root)` | [session-fixture.ts](../../../../subs/harness/src/tests/helpers/session-fixture.ts) | the session fixture |

## The served fixture

[serve-progress-fixture.ts](../../../../subs/harness/src/tests/helpers/serve-progress-fixture.ts)
serves the five progress runs, unchanged, and three session runs.

**`lineage`** (plan `review-notes`, completed). This is the session scenario
on the served copy. It adds the `reviews/notes` and `reviews/limits` modules,
and the architect tree is written again so that By module draws them. The
executor forgets each engineer session once it ends, and the first local
architect's session after its placement request. Every session is finished.

| Session | Role | Relations |
| --- | --- | --- |
| `ses-0001` | initial-architect | reaches the run; one append (`gd-001`); forked by `ses-0003` |
| `ses-0002` | local-architect | `inv-0002`, `inv-0004` continued (`placement-answered`, **degraded**: continue requested, fresh actual), `inv-0007` continued (`iteration-closed`) |
| `ses-0003` | global-fork | fork from `ses-0001` at `inv-0001` (`placement-request`, generation 1) |
| `ses-0004` | engineer | its `inv-0005` requested the contract sub-session |
| `ses-0005` | contract-engineer | `requestedBy` `inv-0005` (`contract-needed`) |
| `ses-0006`, `ses-0009` | local-architect | two segments each, `iteration-closed` |
| `ses-0007` | engineer | finished `replaced` |
| `ses-0008` | engineer | **replaces** `ses-0007` (`reconstructed`) |
| `ses-0010` | engineer | the resumed consumer's engineer |

The fixture's `placements` run already holds four global forks and their
appends to the architect context.

**`interrupted`** (plan `reviewer-identity`, stopped). Its initial architect
ignores the stop past its grace. `ses-0001` shows `interrupted`, awaiting
`inv-0001`, on the run-level strip.

**`live`** (plan `status-badge-tone`, running). The serving process starts
and drives this run, through the command endpoint, with a scripted agent
whose engineer is paced.

| Session | Role | State | Reaches |
| --- | --- | --- | --- |
| `ses-0001` | initial-architect | suspended (kept for forks, one append) | the run: the strip |
| `ses-0002` | local-architect | suspended; `inv-0004` continued `placement-answered` | `wi-001`, `badge-tone`, `collection-review/workspace/shared-ui` |
| `ses-0003` | global-fork | finished `not-kept` | request `pr-001`, `badge-tone` |
| `ses-0004` | engineer | **live**, awaiting `inv-0005` | `wi-001`, `badge-tone`, shared-ui |

- The capability graph draws `badge-tone` (marked `1 live`, `engineer`,
  `1 suspended`), `tone-palette` (the fork's decision) and the forecast
  `tone-legend`.
- By module marks `shared-ui`.
- The Sessions page lists the live engineer first, then the suspended ones,
  and the interrupted architect among the rest.

### Serving it and driving the live session (for iteration 11)

From `ramify-agent/` in the worktree:

```sh
npm run build:web
npx tsx subs/harness/src/tests/helpers/serve-progress-fixture.ts \
  --port 4196 --control-port 4197 --out <scratchpad>/fixture.json &
```

- Building takes about 5 s. The JSON printed, and written to `--out`, names:
  - `url`, `pid` and `sessionsPage` (`<url>/#/sessions`);
  - `runs.<name>.page` for the five progress runs;
  - `sessionRuns.lineage.page` and `sessionRuns.interrupted.page`;
  - `sessionRuns.live.page`, `.engineer` (`ses-0004`) and `.transcript`, the
    live engineer's transcript route;
  - `control.step`, `control.finish` and `control.status`.
  Wait for the file to exist before opening a page.
- **Step:** `curl -s -X POST http://127.0.0.1:4197/step`. It releases one
  step of the engineer, which is 40 by default (`--live-steps N`). Steps
  alternate a thinking-and-text message (two in three) and a `read` of
  `status-badge.tsx` with its result. The transcript page receives the new
  entries within its 1 s poll. It answers `{ stepped, released, steps,
  finished }`. After the last step it answers `stepped: false`.
- **Pace instead:** `--pace <ms>` releases a step every `ms` milliseconds.
- **Finish:** `curl -s -X POST http://127.0.0.1:4197/finish`. It releases
  every remaining step at once, and the engineer submits.
  - The iteration gate passes and its commit is unchanged.
  - The local architect is continued, and requests completion. The work item
    and the final verification pass, and the run completes.
  - Within a poll or two, every mark of the run disappears.
  - The transcript page says "It became finished while this page was open".
  - Finishing cannot be undone. For a live session again, restart the
    fixture.
- **Status:** `curl -s http://127.0.0.1:4197/status`.
- **Drive it with `curl` from the shell, never with `fetch` from the page.**
  The control server sends no CORS headers, so an in-page request logs two
  console errors.
- **Do not press Stop or Start on the live run.** Stop ends the paced wait,
  and was not exercised against the fixture's scripted Git. Start would run
  the paced script's roles on another plan.
- **Stop the fixture** with `kill -TERM <pid>`, the `pid` the JSON names. It
  closes both servers and removes the copy. Never kill node processes by
  name.

## Changes from the design

1. **Interrupted sessions are marked too,** apart from suspended ones. The
   plan names live and suspended marks. An interrupted session is neither
   working nor released. Leaving it unmarked would hide where a stopped run
   was cut off.
2. **The strip also holds sessions whose element is not drawn.** The plan's
   strip is "for sessions without an element". A global fork has no module,
   so in By module it goes on the strip. So does a session whose capability
   is outside a bounded response. This keeps every session on some element
   of each view.
3. **A capability row's detail lists the sessions of its capability.** The
   plan names only a node's list.
4. **The harness's agent module changed**: the scripted fake gained the
   `await` step, with a test in `scripted.test.ts`. The fixture needs a
   session that waits for its test. No existing step could do that, and
   the `session` command's JSON scripts do not accept the new step.
5. **The served server uses `FakeRamifyCli`** rather than `stubRamify()`.
   The live run's materializations are answered at once instead of spawning
   the stub with its retry waits.
6. **The Run page's Sessions area and Measurements table are untouched,** for
   iteration 9.

## Exit evidence

From `ramify-agent/`:

```sh
npx vitest run subs/web/src/tests
# 10 files, 95 tests passed (session-marks 10 new)
npx vitest run subs/harness/src/tests/session-fixture.test.ts subs/harness/src/tests/progress-fixture.test.ts \
  subs/harness/subs/agent/src/tests/scripted.test.ts subs/harness/src/tests/session-queries.test.ts \
  subs/harness/src/tests/session-lifecycle.test.ts subs/harness/src/tests/transcript-run.test.ts
# 6 files, 24 tests passed
npm run type-check     # passed
npm run build:web      # built
npm run check:self
# Execution: completed; check: passed; coverage: partial
# Findings: 0 errors, 0 warnings, 132 analysis limits (unchanged)
```

The second group covers the fixture's own test, the progress fixture, the
scripted fake, and every user of the session scenario.

[session-marks.test.tsx](../../../../subs/web/src/tests/session-marks.test.tsx)
(ST11) covers:

- **Counts and role chips.** One live engineer with one suspended
  architect. Two live engineers (`engineer ×2`) with an interrupted session.
  A node of finished sessions has no mark.
- **The suspended mark.** It has its own class and words. Every node keeps
  the marks line, as the layout heights show.
- **The element list.** A capability node lists its sessions live, then
  suspended, then finished, latest first: `ses-0002`, `ses-0004`, `ses-0005`,
  `ses-0003`. Each links to its transcript. The live one also links its
  awaited chapter. A node with no session says so. A module and a row each
  list theirs.
- **The run-level strip.** The architect, and a session on a capability
  that is not drawn. In By module, also the global fork.
- **Within one poll.** A `RunPage` whose run reads are released one at a
  time. After one released poll reads version 16, the `shop/reviews` body
  changes from `1 live engineer, 1 suspended` to `1 live local-architect`. The
  Dependencies view shows the same without another poll.
- **Unreadable sessions** leave the diagrams unmarked, and say so.

[session-fixture.test.ts](../../../../subs/harness/src/tests/session-fixture.test.ts)
reads the fixture over HTTP:

- `lineage` holds a fork, an append, `iteration-closed` continuations, a
  `contract-needed` request, a `reconstructed` replacement and a degraded
  continuation.
- `interrupted` is stopped, with `ses-0001` interrupted.
- `live` holds the four sessions above, and the project list puts live and
  suspended first.
- One `Pacer.step()` adds an entry the poll answers, with no state change.
  `finish()` completes the run. The next poll answers `ses-0001`, `ses-0002`
  and `ses-0004` finished. Every scripted Git answer was used.

**Browser sanity check** (not the acceptance evidence, which is iteration
11):

- The fixture was served on ports 4196 and 4197, then stopped by its PID.
- At 1440×1000, on the live run:
  - By module marked `shared-ui` with `1 live`, `engineer`, `1 suspended`.
  - A row selection listed `ses-0004` (live, awaiting `inv-0005`),
    `ses-0002` (suspended) and `ses-0003` (finished, `not-kept`).
  - The strip showed `ses-0001` suspended, with one finished.
  - Dependencies marked `badge-tone` alike, and its strip held only
    `ses-0001`.
- The engineer's transcript grew from 5 to 6 entries at the first step.
  After two more steps, entries 6 and 7 were visible at the bottom of the
  followed view.
- After `finish`, the run read `completed`, no node carried a mark, and the
  strip listed one finished session.
- At 390×844 the page had no horizontal overflow.
- The only console errors came from a `fetch` of the control URL made from
  inside the page, as described above.

## Open items

- **Iteration 9's timeline** can use the `lineage` run for forks, an
  append, continuations, a degraded start, a replacement and a request. The
  `live` run's `ses-0002` has a suspension gap open now, and `ses-0001` holds
  an append.
- **Iteration 11** records markers on both diagrams from the `live` run
  before finishing it, and a live transcript receiving entries through
  `control.step`.
- **Stop on the live run is untested.** It ends the paced wait. The Git calls
  a stop makes mid-iteration are not scripted in this fixture.
- **The first read of the sessions** lays the capability graph out once
  without the marks line, then with it. Later reloads keep the previous
  answer, so no node moves again.
