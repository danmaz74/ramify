# Iteration 2 results: jobs on a fake agent

**Date:** 2026-09-19. **Status:** done.

## Delivered

### Modules and declarations

| Module | Declaration | Change |
| --- | --- | --- |
| `contracts/map` (new) | `module map tagged [browser]`; `expose-src * from "interfaces/map.ts" tagged [browser] to parent` | The map schema and its shape validator. |
| `contracts` | adds `expose-sub * from map to parent` | Relays both children; the root still exposes `contracts` to descendants. |
| `contracts/protocol` | adds `expose-src * from "interfaces/ids.ts" tagged [browser] to parent` | Plan and job IDs moved to `ids.ts`, because `queries.ts` and `jobs.ts` now both need them and would otherwise import each other. |
| `harness/agent` (new) | `expose-src * from "interfaces/port.ts" to parent`; `expose-src createScriptedAgent, ScriptStep, Script, ScriptedAgent, ScriptedSessionRecord from "scripted.ts" to parent` | The agent port and the scripted fake. |
| `harness` | `expose-src startServer, ProjectRootError from "http/server.ts" to parent`; `expose-src ProjectLockError from "store/lock.ts" to parent` | Jobs, the lock and recovery are behind `startServer`. |
| `web` | unchanged | Progress view, Start mapping, mapping states. |

Every new module has a README whose first paragraph states its purpose. The
harness, protocol, web and root READMEs describe the new behavior.

### `contracts/map`

- `mapSubmissionSchema` has every section of the map table except identity:
  - summary;
  - modules touched, with weight and an optional `proposed` block holding
    parent, purpose and tags;
  - reuse, with a requester module and area and an `available`,
    `unavailable` or `unknown` availability, each with its required fields;
  - new capabilities, seams, entry point and acceptance, and work items;
  - assumptions, with `assumed`, `notFound` and `coverageLimits`;
  - evidence, whose citations are `view-record`, `declaration` or `source`
    paths.
- `implementationMapSchema` is a saved revision:
  `{schema, identity: {planId, revision, jobId, manifest}, ...submission}`.
- `inputManifestSchema` holds `planHash`, `source` (`{commit, dirty}` or
  `null` outside git), `versions` (prompt, procedure, skill, ramify; `null`
  for an input that does not exist yet), and `architectView`. The view is
  `{status: 'placeholder'}` or `{status: 'materialized', revision, input, coverageLimits}`.
- `validateMapSubmission` applies the schema and the checks that need no
  views: each module touched once, the entry point among the touched
  modules, a proposed module beneath its parent, and each seam's sides in
  different branches. Errors are `path: message` strings.
- Modules are named by declared-name path, as the architect view names
  them (`ramify/analysis`).

### The agent port (`harness/agent`)

```ts
interface AgentPort { readonly name: string; startSession(spec: SessionSpec): AgentSession }
interface SessionSpec {
  role; scope: { workingDirectory }; systemPrompt; prompt;
  builtinTools: ('read' | 'grep' | 'ls' | 'find')[];
  tools: ToolDefinition[];          // name, description, JSON Schema input, execute(input, signal)
  submission: SubmissionTool;       // name, description, JSON Schema input, accept(input, signal) -> verdict
  sessionDirectory;                 // the job's session/ directory
  onEvent(event: AgentEvent): void; // tool-started / tool-finished by callId; message with TokenUsage
}
type SubmissionVerdict = { accepted: true } | { accepted: false; errors } | { accepted: false; final: true; errors };
interface AgentSession { outcome: Promise<'submitted' | 'ended' | 'failed' | 'stopped' (+ data)>; stop(): Promise<void> }
```

- `startSession` never throws; a failure to start is an outcome.
- `outcome` never rejects.
- `stop()` aborts cooperatively and may resolve late or never. The harness
  bounds the wait.
- A closing message is never a result: only an accepted submission yields
  `submitted`.

The scripted fake replays these steps:

- `tool`: a harness tool runs for real; a built-in is only reported;
- `message` with usage, and `submit`;
- `wait`, which honors Stop;
- `stall`, which ignores Stop, optionally with `thenIgnoreStop` to keep
  running the script afterwards and submit late;
- `hang`, `fail` and `end`.

A script may be a function of the spec. `sessions` records specs, verdicts
and outcomes.

### `contracts/protocol`

- Commands go to `POST /api/v1/commands` as a discriminated union:
  - `start-mapping {planId}`, which expects version 0;
  - `stop-job {planId, jobId}`;
  - `approve-map {planId, jobId, revision}`, which is answered
    `unavailable` until iteration 4.
- The answer is `202 {receipt}`. An identical retry gets the same body.
- Queries:
  - `GET /plans/:id/jobs`, newest first;
  - `GET /plans/:id/jobs/:job`;
  - `GET /plans/:id/jobs/:job/events?after=<n>`, which returns
    `{job, events, cursor, more}` with up to 500 events per page.
- Events are typed by `type`:
  - `job-started` and `stop-requested` hold the accepted command
    (`{commandId, contentHash, receipt}`);
  - `activity` holds `read`, `search`, `tool`, `tool-error` or `message` with
    usage;
  - `submission-rejected`, `submission-accepted` and `map-validated`;
  - the terminal events `job-completed`, `job-failed` (with a reason and
    diagnostics), `job-stopped` (with `settled`) and `job-interrupted`.
- The snapshot adds these fields to iteration 1's envelope: `agent`,
  `stopRequested`, `endedAt`, `inputs` (plan hash, source, whether the view
  is a placeholder), `revision`, `failure` and `totals` (files read,
  searches, rejected submissions, token usage).
- `mappingStateSchema` has `not-mapped` and one member per job state
  (`running`, `completed`, `failed`, `stopped`, `interrupted`), each holding
  `{jobId, latestRevision}`.
- New error codes: `busy` (409, another job runs) and `unavailable` (503, no
  agent or approval). The error handler now sets `currentVersion`.

### `harness`

- **Store:**
  - `writeFileExclusive` never overwrites: a flushed temporary file is
    hard-linked to the target, which fails with `EEXIST`, and the temporary
    file is removed. The directory is then synced.
  - `acquireProjectLock` writes `plans/.harness/lock` exclusively. The lock
    holds the process ID, its start time, the kernel start ticks from
    `/proc/<pid>/stat` and a token.
  - A dead process ID, or a live one with other start ticks, meaning a
    reused ID, is taken over by moving the old lock aside. If the moved lock
    was a newer one, it is put back.
  - A live holder or an unreadable lock is refused with `ProjectLockError`.
- **Jobs:**
  - `JobLog` loads `events.jsonl`, truncates a partial line, and validates
    every event and its sequence. Appends are schema-checked and flushed.
  - `snapshotOf` derives everything from `job.json` and the log.
  - `JobService` implements the command rules, one job at a time, the run,
    the correction bound (2 by default), the bounded Stop (5 seconds by
    default), the four-write publication and recovery. It keeps each log in
    memory exactly as appended, and the command index is rebuilt from the
    logs at start.
- **Mapping:** `MappingProcedure` is the seam iteration 3 fills:
  - `capture(projectRoot, planBytes)` builds the manifest;
  - `changes(context)` lists what differs before publication;
  - `session(context)` supplies role, prompts, tools and the submission
    tool;
  - `validate(input, context)` judges a submission.

  `interimProcedure` is real where it can be:
  - the plan hash;
  - `git rev-parse HEAD` and `git status --porcelain -- . ':(exclude)plans'`;
  - `ramify --version`, which reports `0.0.0`.

  The view is a placeholder and validation checks shape only. The
  submission tool is `submit_implementation_map`, with its JSON Schema from
  `z.toJSONSchema(mapSubmissionSchema)`.
- **Entry:**
  - `serve --agent fake` selects the scripted fake with `demonstrationScript`:
    about 9 seconds of reads, searches and usage, then a valid map that says
    it is a demonstration.
  - Without `--agent`, a start is `unavailable`.
  - Start-up prints the recovery counts.

### `web`

- **Progress view** (`progress.tsx`):
  - It polls events after a cursor every second while the job runs, reads
    every page, and stops polling at a terminal state.
  - It shows the state, current activity, elapsed time (ticking while
    running, fixed at `endedAt` afterwards), totals, inputs and the activity
    feed, newest first.
  - The inputs say when an uncommitted checkout is visible to the agent,
    when the project is not a git checkout, and that the view was not
    materialized.
  - Stop is shown while the job runs.
- **Connection:** the header keeps its connection state. When disconnected,
  the Progress view adds a note that it shows the last known state, and,
  while the job runs, that the job continues.
- **Map tab:**
  - Start mapping when the plan is not mapped.
  - Otherwise the latest job's progress and the latest saved revision's
    path, with Start mapping again once the job has ended.
  - A refused start is shown, such as `busy`.
- **Plans page:** labels such as `Mapping…`, `Mapped (revision 001)` and
  `Mapping interrupted; revision 002 saved`.
- **Protocol client:** `getEvents` and `sendCommand`. A command without an
  answer is resent unchanged, up to 3 times.

## Exit evidence

All commands were run from `ramify-agent/`.

- `npm run type-check`: no output, exit 0.
- `npm test`: 16 files, 108 tests passed (node 84, web 24). No warnings on
  stderr.
- `npm run check:self`: `Execution: completed; check: passed; coverage:
  complete`. 7 owners, 55 source files, 1 resource, 492 accesses. 0 errors,
  0 warnings, 0 analysis limits; 291 allowed, 0 denied, 201 external.
- The fixture is unchanged: no `.harness/` or `map/` appeared under
  `fixtures/`. Every run used a temporary copy.

Brief items and the tests that show them:

| Brief item | Evidence |
| --- | --- |
| Completes with no client; a client attached afterwards reads the same job | `jobs-http.test.ts`. Only the file system is watched until `job-completed`. Plain `fetch` then reads the snapshot, the event page (equal to `events.jsonl` parsed), the tail after a cursor, the job list and the plan's mapping state. After a restart of the harness the same answers return. |
| Identical retry, reused ID, stale version | `jobs.test.ts` `commands`. A retry after completion returns the original receipt at version 8. A reused ID as another start or as a stop is `conflict`. A stale stop is `stale-version` with `currentVersion: 2`, and a start expecting 3 is `stale-version` with 0. Over HTTP with status codes and bodies in `jobs-http.test.ts`. |
| Restart after each publication write | `recovery.test.ts`. The job freezes in `afterPublicationWrite(k)`, the lock is replaced by one held by an exited process, and the service is reopened. After write 1: interrupted, output left unpublished, no map file. After write 2: the map is published from `output/map.json` byte for byte, then completed. After write 3: completed. After write 4: nothing to recover. |
| Reserved revision with a different hash | Same file: the job is `failed` as `revision-conflict`, and the foreign `001.json` is unchanged. |
| Other recovery | A running job is interrupted. A trailing partial line is truncated before `job-interrupted` takes sequence 2. A job with `job.json` and an empty log is interrupted. A directory without `job.json` is skipped with a warning. A retried command after a restart returns its receipt. Closing the harness leaves the job for the next start to interrupt. |
| Lock | `lock.test.ts`: refused while this live process holds it; taken over from an exited process, after which the old holder's `release` leaves the new lock; a reused process ID with other start ticks is taken over; an unreadable lock is refused. `jobs-http.test.ts`: a second `startServer` on the same project is refused. |
| Stop | A waiting session is stopped with `settled: true`. A hanging session is marked stopped after the 50 ms bound with `settled: false`, and another job can start. A late submission from a session that ignores Stop gets a final rejection, and no output or map is written. A retried stop returns its receipt; a stop after the end is `conflict`. |
| Failures and correction | A crashed session is `agent-failed`. A closing message without a submission is `no-submission`. One invalid submission is corrected. Three invalid submissions fail the job as `invalid-submission`: the third verdict is final and diagnostics are kept. A plan edited during the job is `inputs-changed`, with no output and no map. |
| `job.json` and `input/` before the first event | The fake's script, run at session start, found `job.json`, `input/plan.md` and exactly one event, `job-started`. `input/plan.md` equals the plan byte for byte, and `planHash` is its SHA-256. |
| Progress view in a real browser | See below. |

**Browser check** with Playwright MCP. `npm run build:web` was run, then
`tsx src/main.ts serve --project <scratch copy> --port 41299 --agent fake`,
started in the background and stopped only by its recorded process IDs.
Screenshots are in [iteration2-evidence/](iteration2-evidence/):

- `iteration2-running.png`: Mapping, 0:01, Stop, current activity, totals,
  inputs and the feed.
- `iteration2-completed.png`: Mapped, "Map revision 001 saved", the
  eleven-event feed, 3600 in and 940 out tokens.
- `iteration2-stopped.png`: Stop clicked during a second job. The feed shows
  "Stop requested" then "Stopped", and Start mapping again is offered.
- `iteration2-disconnected.png`: after the harness process was killed, the
  header says "The harness is not answering". The Progress view adds the
  not-connected note, and the job state stays as last known.
- `iteration2-plans.png` and `iteration2-interrupted.png`: taken after a
  sequence with no browser attached (it was on `about:blank`):
  1. `curl` started a job on `revision-diff`. It completed and saved
     `001.json`.
  2. The same command, resent, returned the same receipt.
  3. The same ID with another plan was `conflict`.
  4. `curl` started a job on `review-notes`, and the harness was killed
     with SIGKILL 3 seconds in.
  5. The restart took over the dead process's lock and printed
     `Recovered jobs: 1 interrupted`.
  6. The Plans page then showed "Mapping interrupted; revision 002 saved"
     and "Mapped (revision 001)".
- On SIGTERM the lock file was removed.

## Deviations

1. **The project lock is held for the server's lifetime, not taken per job.**
   Recovery marks every non-terminal job interrupted, which is safe only if
   no other live harness owns those jobs. So `startServer` takes the lock
   before recovery and keeps it, and a second harness on the same project is
   refused. A start also checks that the lock is still held.
2. **A start expects version 0.** The plan gives a new job no version to
   expect. The job a start creates has version 0, so a start with any other
   expected version is `stale-version` with `currentVersion: 0`.
3. **Two error codes were added:** `busy` for one job at a time, and
   `unavailable` for no agent and for approval before iteration 4.
4. **The exclusive write is a hard link, not a rename.** Node has no
   `RENAME_NOREPLACE`. `link()` gives the same guarantees: it is atomic, it
   fails if the target exists, and a reader sees no file or the whole file.
5. **Bounded correction exists already, for shape errors.** It was needed to
   give the port's verdicts real use. Iteration 3 adds view validation
   through `MappingProcedure.validate` and the pi-layer case (below).
6. **Stop in the web client resends a stale command.** Activity advances the
   version several times a second, so a person's Stop is almost always
   stale. On `stale-version` the client sends a new command, with a new ID,
   at the reported version, up to 3 times. The harness rules are unchanged.
7. **A job with `stop-requested` but no `job-stopped` at restart is marked
   interrupted,** as the plan says for any other job. `close()` writes
   nothing; the next start interrupts the job.
8. **Dirtiness ignores `plans/`.** Otherwise the harness's own job files and
   saved maps would make every later job dirty. The plan has its own hash.
9. **`not-mapped` ignores saved revisions when no job exists.** A saved
   revision always belongs to a job; this case arises only if someone
   deletes `.harness/`.
10. **`approve-map` carries `jobId`,** so that its expected version names a
    job. Iteration 4 may reshape the payload.

## What iteration 3 must know

- **`job.json` is written once, so the manifest must be complete before it
  is written.** The plan's step 2 adds the view's revision, coverage and
  input identity after materializing. Do that inside
  `MappingProcedure.capture`, which runs before `job.json` exists, or record
  those values as an event. As built, the start command holds the command
  mutex through `capture`, so a slow materialization delays the receipt.
  Accept that or move capture behind the receipt.
- **Per-job state for validation.** Checking that no availability is stated
  for an unmaterialized requester needs the set of requesters materialized
  in this job. The same `MappingContext` object is passed to `session()`
  and `validate()`, but it is readonly data. Change the procedure to a
  per-job factory, such as `forJob(context)` returning session and validate,
  or add a mutable evidence record to the context.
- **The pi adapter's mapping to the port:**
  - `accept` → accepted: return with `terminate: true`.
  - Rejected: return an error tool result without `terminate`.
  - `final`: return an error result with `terminate`, so the outcome is
    `ended`.
  - `tool_execution_start` and `tool_execution_end` → `tool-started` and
    `tool-finished`, by `toolCallId`.
  - Assistant `message_end` → `message` with `usage` mapped to
    `{input, output, cacheRead, cacheWrite, total}`.
  - `stop()` = `abort()` then idle. The harness already bounds the wait and
    discards late submissions.
  - Use `sessionDirectory` for `SessionManager.create`.
- **Counting pi's own rejections.** pi rejects a schema-invalid call before
  `execute`, so `accept` never sees it and the bound would not count it.
  Either give pi a permissive schema (`{type: 'object'}`) so that every call
  reaches `accept`, which is the simplest, or have the adapter report
  pre-validation failures to the harness. `mapSubmissionJsonSchema` exists
  if the strict schema is wanted for the model's benefit.
- **Where pi goes:** declare `pi` as a child of `harness/agent`, and have
  `agent` relay it (`expose-sub … from pi to parent`) so that `harness` can
  construct it. Add `'pi'` to `agentNames` in `src/cli.ts` and to
  `AgentChoice` in `http/server.ts`.
- **Test helpers:** `subs/harness/src/tests/helpers/jobs.ts` has
  `openJobs`, `start`, `stop`, `eventsOnDisk`, `crashLock`, `freeze`,
  `until` and `validMap`. Pass a `procedure` to `openJobs` to drive view
  validation with the fake.
- **Fixture copies are not git checkouts,** so `source` is `null` there. A
  test of dirtiness needs `git init` in the copy.
- **Activity paths** are resolved against the working directory and shown
  relative to the project root; paths outside it are shown absolute.
