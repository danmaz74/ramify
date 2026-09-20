# Plan 1 completion report

**Date:** 2026-09-19. **Status:** implemented, including the live items, run
with the person's own Claude Code OAuth credentials on
`anthropic/claude-sonnet-5`:

- the real session of iteration 3, which found and fixed a real harness
  defect (see [iteration 3](iterations/iteration3-results.md#the-real-session));
- the live trial of iteration 4, which produced a real, saved map for the
  toolkit's own affected-modules plan (see
  [iteration 4](iterations/iteration4-results.md#the-live-trial)).

**What is still open is only the person's own verdict** on the trial map,
against the [review sheet](trial/review-sheet.md)'s three questions and the
harness principles; the agent's own factual observations on the session are
filled in there, kept apart from that verdict.

The iteration results hold the detail:
[0](iterations/iteration0-results.md), [1](iterations/iteration1-results.md),
[2](iterations/iteration2-results.md), [3](iterations/iteration3-results.md)
and [4](iterations/iteration4-results.md).

## Completion gate

| # | Gate item | Result |
| ---: | --- | --- |
| 1 | The runnable outcome works end to end in a browser with a real pi session on a real plan. | **Met.** A real session on `anthropic/claude-sonnet-5`, driven through the browser, chose the toolkit's **Affected modules** plan, started a job, watched it to completion and read the saved map. See the note below the table for what was deliberately left to the person. |
| 2 | A mapping job completes with no client connected. | **Met.** In iteration 2, `jobs-http.test.ts` watches only the file system until `job-completed`; a client attached afterwards reads the same snapshot and events, also after a restart. In iteration 3, a job ran over `curl` with no browser. |
| 3 | The target project's source, `module.ramify` files and `plan.md` are unchanged by mapping; Ramify's generated views are refreshed. | **Met.** Fixture, toolkit-clone dry run, and now the trial run itself: `npm run trial -- verify` reported 0 changed, 0 added and a clean `git status` outside `plans/` after the real session. See the note below the table. |
| 4 | ramify-agent passes its own `npm run check:self`, type check and tests. | **Met.** See the note below the table. |
| 5 | The completion report records the trial and hands the next plan the map schema, a produced map, the agent port, the job lifecycle and the protocol. | **Met.** The hand-off is below, now with the trial's own real map alongside the scripted fake's, each labeled by its origin. |
| – | The live trial, reviewed by a person against the principles. | **Map produced; the person's verdict is still open.** Job `20260919T190102Z-637d1a` saved revision 1 of a real map for the toolkit's affected-modules plan. The review sheet's trial record and the agent's own observations (heavy modules, reuse, seams, tool errors, cost) are filled in; the three-questions tables and the reviewer's verdict are blank, for a person to complete. |

**Gate 1.** Every part of the outcome has now run in a real browser, and the
model call and the login are no longer the untested part:

- choosing a plan and reading it (iteration 1; also the live trial, real
  session);
- starting a job and watching its progress (iteration 2; also the live
  trial, real session);
- reading the saved map, selecting revisions, approving, and seeing a stale
  approval refused (iteration 4, scripted fake).

The scripted-fake browser checks (iterations 1, 2 and 4) remain as they were,
each with real Ramify views. The live trial adds a real model call, through
the browser, on a real plan: it chose the plan, started the job, watched
Progress to completion and read the saved map. It deliberately did not press
Approve — approval's mechanics were already proven end to end against a real
saved map in iteration 4, and do not depend on whether the map came from the
scripted fake or a real session; approving the trial's own map is the
reviewer's decision, not a plumbing gap. The pi adapter's own tests still run
pi's real agent loop against a scripted model provider, for the parts a real
model call cannot exercise deterministically (retries, Stop mid-stream, the
correction bound's edges).

**Gate 3.** Tests and the browser checks ran on copies of the fixture. No
`.harness`, `map`, `.ramify` or `.ramify-architect` ever appeared under
`fixtures/`. A test compares every file outside the harness's directories and
Ramify's views before and after a job (`mapping.test.ts`).

On a toolkit clone, a job and an approval by the scripted fake ended with
`npm run trial -- verify` reporting:

- 1641 files compared, 34 of them `module.ramify`;
- 0 changed and 0 added;
- `git status` clean outside `plans/`.

The views were materialized fresh at each job's capture. The live trial's own
real session, on a fresh clone at commit `3593eae42a29…`, ended with the same
result after job `20260919T190102Z-637d1a` saved its map: 1641 files and
`plan.md` compared, 34 `module.ramify`, 0 changed, 0 added, `git status`
clean outside `plans/`, `HEAD` unchanged.

**Gate 4.** All three were run from `ramify-agent/`, after the live items and
the fix they found:

- `npm run type-check`: exit 0.
- `npm test`: 21 files and 160 tests passed (158 before iteration 3's real
  session added the two `unwrapStringifiedFields` tests).
- `npm run check:self`: passed with complete coverage. The scope was 8 owners,
  73 source files and 776 accesses. It found 0 errors, 0 warnings and
  0 analysis limits.

## What the person must do

The pipeline has run; only the reviewer's own judgment is left. From
`ramify-agent/`:

1. Read the saved map,
   [`trial-map-001.json`](trial/trial-map-001.json), and the two
   screenshots in `docs/plans/01-implementation-map/trial/`
   (`trial-map-unapproved.png`, `trial-job-activity.png`) — or reopen it live
   by running `npm run trial -- prepare`, `npm run build:web` and
   `npm run serve -- --project <clone> --agent pi` again on a fresh clone.
2. Fill in the [review sheet](trial/review-sheet.md)'s three-questions
   tables (heavy modules, reuse findings, seams) against the map, using the
   agent's own observations there only after answering from your own
   knowledge first, then the withheld reference
   (`docs/plans/iteration-7-affected-modules/` in the toolkit checkout) last.
3. Record the verdict: approve, regenerate or reject, and whether you would
   plan the next iterations from this map.
4. If approving on a live rerun: press **Approve** in the browser, then stop
   the harness and run `npm run trial -- verify <clone>` again.

The trial targets the toolkit, on a disposable clone. The review sheet gives
the reasons:

- the reviewer knows the toolkit;
- the plan is real and unimplemented, and its own draft is withheld from the
  clone, so the reviewer can compare the map with it;
- the toolkit's views have complete coverage, so `unavailable` findings can
  occur;
- the plan needs a module that does not exist yet, MCP — the map handles
  this by proposing `ramify/mcp` and marking its one reuse finding `unknown`,
  not `available` or `unavailable`.

## Hand-off to the next plan

### The map schema

`contracts/map`, `subs/contracts/subs/map/src/interfaces/map.ts`, exposed to
the root and to `contracts`' descendants:

- **`mapSubmissionSchema`:** what an architect submits.
  - The summary: the change and what it preserves.
  - The modules touched: heavy, light or exposure only, and a `proposed`
    block with parent, purpose and tags.
  - Reuse, whose availability is `available` with its record and import
    spelling, `unavailable` with the exposure declarations, or `unknown` with
    a reason.
  - New capabilities, seams, the entry point and acceptance, work items,
    assumptions, and evidence with citations.
- **`implementationMapSchema`** (`ramify-agent.implementation-map/1`): a saved
  revision. It is `identity: {planId, revision, jobId, manifest}` plus the
  submission.
- **`inputManifestSchema`:** the plan hash, the source commit and whether the
  checkout is dirty, and four versions (prompt, procedure, skill and Ramify).
  It also holds the architect view's revision, input identity and coverage
  limits.
- **`mapApprovalSchema`** (`ramify-agent.map-approval/1`): the record written
  once at approval.
- **`validateMapSubmission`:** the shape and internal-consistency checks.
  `harness/src/mapping/validate.ts` adds the checks against the views.

The schema is the one iteration 2 fixed. The live trial may show sections the
work loop needs changed. The schema string carries a version, `/1`, for that
reason.

### A produced map

Two, by origin:

- [`trial/trial-map-001.json`](trial/trial-map-001.json) — **the first real
  architect map**, produced by `anthropic/claude-sonnet-5` on the toolkit's
  own affected-modules plan (the live trial, job
  `20260919T190102Z-637d1a`). Not yet approved; the review sheet's verdict
  is open.
- [`iterations/iteration4-evidence/fake-produced-map-001.json`](iterations/iteration4-evidence/fake-produced-map-001.json),
  with its approval record beside it — **produced by the scripted fake, not
  by an architect.** The fake submitted the fixed review-notes map of the
  harness's tests on a temporary copy of the fixture. One proposed module
  was added to show the shape. Real parts: the harness validated it against
  the architect view and the API view it materialized, and the manifest is
  a real one. Its contents are test data, kept as a second, deterministic
  example of the schema now that the trial's map is real.

### The agent port

`harness/agent`, `subs/harness/subs/agent/src/interfaces/port.ts`:

```ts
interface AgentPort { readonly name: string; startSession(spec: SessionSpec): AgentSession }
interface SessionSpec {
  role; scope: { workingDirectory }; systemPrompt; prompt;
  builtinTools: ('read' | 'grep' | 'ls' | 'find')[];
  tools: ToolDefinition[];          // name, description, JSON Schema input, execute(input, signal)
  submission: SubmissionTool;       // name, description, JSON Schema input, accept(input, signal) -> verdict
  sessionDirectory; onEvent(event: AgentEvent): void;
}
interface AgentSession { outcome: Promise<SessionOutcome>; stop(): Promise<void> }
```

**Rules.**

- `startSession` never throws.
- `outcome` never rejects, and it is one of `submitted`, `ended`, `failed` or
  `stopped`.
- `stop` is cooperative, and the harness bounds its wait.
- Only an accepted submission counts; a closing message is never a result.

**Implementations.**

- `createScriptedAgent` (steps `tool`, `message`, `submit`, `wait`, `stall`,
  `hang`, `fail`, `end`).
- `createPiAgent` in `agent/pi`:
  - pi 0.85.1, in process;
  - an exact system prompt, with all discovery off;
  - a permissive submission schema, so that every call reaches `accept`;
  - the session file written into the job's `session/`.

A work-loop role, such as an engineer or a contract engineer, is another
`SessionSpec`. The port needs no change for write tools, since `tools` and
`builtinTools` are per session, but pi's `write` and `edit` are not yet in
`BuiltinTool`.

### The job lifecycle

**Files.**

```text
plans/.harness/lock                                     held for the server's life
plans/<plan-id>/map/<n>.json, <n>.approval.json          immutable; written once
plans/<plan-id>/.harness/jobs/<job-id>/job.json          manifest, written once
  input/plan.md, events.jsonl, output/map.json, session/
```

Every harness directory holds a `tsconfig.json` that selects no files, so that
the harness's writes stay out of Ramify's input identity.

**The event log.** `events.jsonl` is the only authority. It has
`job-started`, `activity`, `api-view-materialized`, `submission-rejected`,
`submission-accepted`, `stop-requested` and `map-validated`. It ends with one
terminal event: `job-completed`, `job-failed` (with a reason),
`job-stopped` or `job-interrupted`. After `job-completed` only, a single
`map-approved` may follow.

**Commands.** Each carries a command ID and an expected version.

- An identical retry returns the original receipt.
- A reused ID with other content is `conflict`.
- A stale expected version is `stale-version` with the current version.
- One job runs at a time (`busy`).

**Publication and recovery.** Publication is four ordered writes, and
recovery follows the table in the main plan. Approval is event first, record
second, and a restart completes the record.

**Failure reasons.** `agent-failed`, `no-submission`, `invalid-submission`
(after two corrections), `inputs-changed`, `revision-conflict`,
`evidence-unavailable` and `internal`.

The seam for the work loop is `MappingProcedure`
(`capture`, `forJob`, `approvalChanges`). A work item's job needs its own
procedure and probably its own job kind. `job.json` has `kind: 'mapping'` for
that reason.

### The protocol

`contracts/protocol`, HTTP JSON under `/api/v1`. Every response is validated
against its schema on both sides.

| Method and path | Answer |
| --- | --- |
| `GET /project` | The project and the plan-file pattern. |
| `GET /project/modules` | The architect view's module tree, or `unavailable`. |
| `GET /plans` | Plans with their latest mapping state; unreadable entries. |
| `GET /plans/:id` | One plan's Markdown and mapping state. |
| `GET /plans/:id/jobs`, `/jobs/:job` | Job snapshots, newest first. |
| `GET /plans/:id/jobs/:job/events?after=<n>` | Up to 500 events after the cursor, the snapshot, `cursor` and `more`. |
| `GET /plans/:id/maps`, `/maps/:n` | Saved revisions with approvals; one revision's map. |
| `POST /commands` | `start-mapping`, `stop-job`, `approve-map` → `202 {receipt}`. |

The error codes are `invalid-request`, `not-found`, `unreadable`,
`conflict`, `stale-version`, `busy`, `unavailable`, `inputs-changed` and
`internal`. Progress is polling after a cursor, with no WebSocket.

## Module candidates in `harness/src/`

| Directory | Size | Finding |
| --- | --- | --- |
| `mapping/` | 909 lines, 6 files, plus 2 prompt files | **The strongest candidate.** It hides a dependency worth hiding: the `ramify` CLI, the daemon endpoint, and the architect and API view formats (`ramify-cli.ts`, `views.ts`). It has three consumers: the job's run, approval (`approvalChanges`) and the module-tree query (`http/app.ts` reads `views.ts`). A first cut would be a child module `evidence` owning `ramify-cli.ts` and `views.ts`, with `validate.ts` staying with the procedure. The architect prompt and procedure could follow as `mapping` once the work loop adds a second procedure. |
| `jobs/` | 1074 lines, 6 files | Heavy, and the part the work loop extends. It has one consumer, the HTTP adapter, and no hidden dependency. Extract it when a second job kind exists, not before. |
| `store/` | 304 lines, 4 files | Stable file primitives used by `jobs/` and `maps/`. There is little to hide; it is a candidate only if another module needs the same primitives. |
| `maps/`, `plans/`, `http/` | 98, 102 and 332 lines | Light. No extraction is indicated. |

None was extracted in Plan 1. The rule is to extract when the justification
exists, and `mapping/` gained its second consumer in the last iteration.
Extracting it is a first task for the next plan, before the work loop adds to
it.

## Known limitations

### Toolkit observations for the user

These come from using Ramify as a consumer. They were not investigated in the
toolkit, since the work stayed within `ramify-agent/`.

1. **A daemon context stops measuring dependencies after a structural
   change.** Once a file or directory had been added to the project, every
   later `ramify materialize --view architect` in that daemon context waited
   about 125 s. It then published `dependencies unavailable (wait-limit)`.
   This happened even at an unchanged revision, and three times in a row.
   Content-only changes re-materialized in about 1 s with dependencies
   measured. The harness works around it with a private daemon
   (`RAMIFY_ENDPOINT_DIR`) that it restarts before each job's capture. This
   looks like a toolkit defect worth reporting.
2. **The input identity covers every directory listing, hidden ones
   included.** A tool that writes its own records into a project, as the
   harness does in `plans/`, changes the identity unless each directory
   carries an empty-selection `tsconfig.json`. That marker is an undocumented
   reliance on independent-scope discovery. A documented way to exclude a
   tool's state directory would be sturdier.
3. `ramify --version` reports `0.0.0`, so the Ramify version in every
   manifest cannot tell toolkit builds apart.

### Harness limitations

- **The live items ran; found one prompt/schema gap, fixed, and one left as
  an observation.** A real model exhausted the correction bound once (three
  identical stringified-field rejections) before the fix; see
  [iteration 3](iterations/iteration3-results.md#the-real-session). After
  the fix, two further sessions (the fixture and the live trial) together
  used the correction bound normally: a `proposed: null` vs. omitted-key
  mismatch and a wrong file citation each self-corrected within it. The
  `null` pattern is recorded as a possible prompt/schema improvement, not
  fixed, since it never exhausted the bound; see the review sheet's
  [agent observations](trial/review-sheet.md#the-agents-observations).
- **Commands that hold the command mutex.** Capture runs inside the start
  command, so the receipt comes after the materialization: about 2.5 s on
  the fixture and about 18 s cold on the toolkit. Approval also materializes
  while it holds the mutex, for a few seconds on the toolkit, and a Stop sent
  meanwhile waits.
- **The fixture's views always report coverage limits,** since the fixture
  has no `node_modules`. So `unavailable` is exercised only on constructed
  views; the toolkit clone gives complete views.
- **Staleness is found only at approval.** The Map page shows no freshness
  label. The module tree is the latest materialization, and the page notes
  when its identity differs from the map's.
- **The job snapshot names the view only as `materialized`.** The page reads
  the manifest from the saved map.
- **Stop is cooperative.** pi runs in process, so a tool that never settles
  keeps its session. The job is still marked stopped after the bound, and late
  output is discarded.
- **`serve --agent pi` creates `~/.pi/agent/`** with empty files when it is
  missing, as pi's `ModelRuntime.create` does.
- **Validation is mechanical only,** as the plan intends. Whether a map is
  good architecture is the reviewer's judgment.
- **Web client:** the bundle is 430 kB, mostly `react-markdown`, and the plan
  title appears twice on the Plan page.
