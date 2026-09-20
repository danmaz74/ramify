# harness

Serves one Ramify project to its clients and owns every durable record of the
work done on it: it is the only writer of plans' maps, job state and events.
It reads the project's plans, runs mapping jobs through the agent port, and
answers its own protocol's queries and commands over HTTP. It owns the public
contracts of that behavior: the implementation map it validates and persists,
and the HTTP protocol it serves.

## Layout

`src/interfaces/` holds this module's public contracts, the only source it
exposes beyond `startServer` and its two errors:

- `interfaces/map.ts`: the implementation map, the mapping phase's output,
  and the validation of its shape: every section an architect submits, the
  identity the harness adds when it saves a revision, the input manifest that
  identity carries, the approval record, and `validateMapSubmission`, the
  schema plus internal consistency. Modules are named by their declared-name
  path from the root, as the architect view names them. Checks that need the
  project's views belong to `mapping/validate.ts`, not here.
- `interfaces/protocol/`: the HTTP JSON protocol under `/api/v1` between the
  harness and any client, one file per concern: `ids.ts`, `queries.ts`,
  `errors.ts`, `jobs.ts`, `maps.ts` and `paths.ts`. It hides the wire
  encoding and its versioning; both sides validate what crosses the wire with
  these schemas.

Every export of those files is a Zod schema, a type inferred from one, or a
constant. They import nothing but `zod` and each other, so every export
promises browser safety and the root re-exposes it to the web client.

The remaining responsibilities below are directories in `src/`. Each is a
candidate for a child module once a second consumer, a dependency worth
hiding or measured complexity justifies it.

- `store/`: the file primitives.
  - `writeFileAtomic` replaces a file through a temporary file and a rename.
  - `writeFileExclusive` never overwrites: a flushed temporary file is
    hard-linked to the target, which fails if the target exists.
  - Append-only JSON Lines, whose trailing partial line is discarded on load
    and truncated before the next append.
  - The project lock, `plans/.harness/lock`, with the process ID and start
    time of its owner. A lock whose process is gone, or whose process ID was
    reused, is taken over. The server holds the lock for its whole life, so
    that recovery never touches another live harness's job.
  - `state-directory.ts`: every directory the harness writes,
    `plans/.harness/` and each plan's `.harness/` and `map/`, holds a
    `tsconfig.json` that selects no files. Ramify's project walk observes
    every directory listing, so a file the harness creates would change the
    input identity a job or an approval is compared by; a directory with its
    own compiler configuration is an independent scope, which the walk does
    not enter. A plan's two directories are created before a job's evidence is
    captured, so materializing after publication gives the manifest's input
    identity again.
- `jobs/`: mapping jobs.
  - `records.ts`: the job directory, `job.json` (the input manifest) and
    `input/plan.md`, both written once before the first event, and revision
    allocation as one more than the highest `map/<n>.json`.
  - `log.ts`: `events.jsonl`, the only authority. An event's sequence number
    is one more than the line before; the version is the last one. Nothing
    follows a terminal event except one `map-approved` after
    `job-completed`; a log that breaks this is not loaded.
  - `snapshot.ts` derives a job's state, version and totals from its log.
  - `service.ts`: commands and their three rules, one job at a time, the
    run, bounded correction, the bounded Stop, the four-write publication,
    approval and restart recovery.
  - `activity.ts` turns agent events into the observed activity recorded as
    events.
- `mapping/`: what a mapping job needs apart from its lifecycle.
  - `procedure.ts`: the seam. `MappingProcedure.capture` builds the input
    manifest before `job.json` is written; `forJob` returns the job's own
    `MappingJob`: its session plan, the validation of its submissions and
    the final check of its inputs. The job reports back through hooks: an
    API view materialized as evidence, or inputs that changed.
  - `architect.ts`: `architectProcedure`, the procedure on real evidence.
    - `capture` runs `ramify materialize --view architect` and records the
      view's revision, its `input` identity and its coverage limits, beside
      the plan hash, the commit and dirtiness, and the versions of the
      architect prompt, the procedure, the skill and Ramify.
    - The session is the architect prompt with the skill and the procedure
      filled in, the plan and the view's identity as the first message, the
      `read`, `grep` and `ls` tools, `materialize_api_view` and
      `submit_implementation_map`.
    - `materialize_api_view` runs
      `ramify materialize --view architect --view api --from <module dir>`,
      keeps what the requester's views list, and records them as an
      `api-view-materialized` event. A changed input identity fails the job
      as `inputs-changed`.
    - `changes` hashes the plan again and materializes once more before
      publication.
    - `approvalChanges` does the same for a saved map's manifest when it is
      approved, without restarting the daemon.
  - `architect-prompt.md` and `feature-mapping.md`: the architect prompt and
    the feature-mapping procedure, versioned files the manifest names by
    their declared version and hash. The module-architect skill in
    `skills/module-architect/` is used unchanged; the prompt bridges its
    `ramify materialize` step to the harness's evidence and tool.
  - `validate.ts`: the checks against the views, and nothing else: every
    named module exists or is proposed, every reused symbol exists under its
    owner, and every availability agrees with the requester's API view as the
    job materialized it, with only `unknown` for a requester it never
    materialized. `unavailable` needs a view without coverage limits.
  - `views.ts` reads the architect view and API views as the toolkit
    specifies them, and the module tree the Map page draws on.
  - `ramify-cli.ts`: the `ramify` command line, the harness's only way to
    Ramify. The server gives it a daemon of its own through
    `RAMIFY_ENDPOINT_DIR`, restarts that daemon before each job's capture and
    stops it on close; see below.
  - `demo-script.ts`: the script `serve --agent fake` runs, which submits a
    map labelled as a demonstration.
- `maps/`: a plan's saved revisions, `map/<n>.json`, read with their hash
  and their approval record, `map/<n>.approval.json`.
- `plans/`: discovery of `plans/<plan-id>/plan.md` in the project, with the
  title taken from the first heading. Hidden directories are skipped; an
  unreadable file is an error entry, not a failed list.
- `http/`: the Express adapter serving `/api/v1`, each response validated
  against its protocol schema, and the built web client when it exists.
  `startServer` is the module's entry point. It takes the lock, recovers
  jobs and serves; `ProjectLockError` is exposed beside it.

The child `agent` holds the agent port and the scripted fake, and relays its
child `pi`. Everything here depends on the port; only `http/server.ts`
chooses an implementation, for `serve --agent pi|fake`.

## Ramify's daemon

Materialization runs through Ramify's resident daemon. In a daemon context,
once a file or directory has been added to the project, every later
materialization waits about 125 seconds for dependency facts and then
publishes the architect view without them (`dependencies unavailable
(wait-limit)`), even at an unchanged revision. Content changes do not do
this. A new plan's directories, or a file a person adds, is such an addition.
The server therefore runs Ramify with
an endpoint directory of its own and stops that daemon before each job's
capture, so every job starts from a fresh context. Nothing else shares the
daemon, and closing the server stops it.

## Job lifecycle

- **Commands.** Every command is handled under one mutex:
  - A command whose ID and content hash match an accepted command returns
    its original receipt.
  - A reused ID with other content is a `conflict`.
  - Otherwise the expected version must equal the job's version, or the
    command is `stale-version` with the current version. A start creates a
    job, so it expects version 0.
- **Stop.** The harness records `stop-requested` and asks the session to
  stop. It waits at most `stopGraceMs` (5 seconds by default), then records
  `job-stopped` with `settled` saying whether the session became idle. A
  later submission gets a final rejection and is never published.
- **Publication.** Four writes: `output/map.json`, the `map-validated` event,
  `map/<revision>.json` by an exclusive write, and `job-completed`. Before
  the first write the inputs are checked again, and a difference fails the
  job as `inputs-changed`.
- **Evidence.** A start whose architect view cannot be materialized is
  refused as `unavailable` and creates no job. A job whose views cannot be
  read or materialized later fails as `evidence-unavailable`. A changed input
  identity at any materialization fails the job as `inputs-changed` at once
  and stops its session.
- **Approval.** `approve-map` names a revision and the job that saved it,
  and expects that job's version. It is refused as `conflict` unless that job
  completed with that revision, the map file still has the saved hash, and
  the revision has no approval yet. It is refused as `inputs-changed`, the
  stale refusal, when `plan.md` no longer has the manifest's hash or a fresh
  materialization gives another input identity. It is refused as
  `unavailable` when the manifest names no materialized view. Otherwise the
  `map-approved` event records the command and the approval record. Then
  `map/<revision>.approval.json` is written by an exclusive write. The job
  stays completed; its version grows by one. The command holds the command
  mutex while it materializes: a few seconds on the toolkit, during which
  other commands wait.
- **Recovery.** On start, a job with `map-validated` is published from its
  output and completed, unless the file at the reserved revision has
  another hash. Then the job fails as `revision-conflict` and the file is
  left alone. Any other job without a terminal event is marked interrupted.
  A directory without `job.json` is skipped with a warning. A job whose
  `map-approved` event has no approval record gets it written, as the
  report's `approvals` lists.

## Testing

Tests live in `src/tests/` and run on temporary copies of projects, with
jobs driven by the scripted fake. `map-contract.test.ts` and
`protocol-contract.test.ts` check the public contracts on their own: a
complete map example, strictness, each consistency rule, and that every
protocol schema accepts its examples and rejects unknown fields. Lifecycle tests use `shapeOnlyProcedure`
from `tests/helpers/procedures.ts`, which needs no views. `mapping.test.ts`
runs the architect procedure on real views of the fixture, through the
`ramify` CLI with a daemon of its own, which it stops at the end.
`approval.test.ts` does the same for approval: the record, retries,
stale refusals after a plan and after a source change, restart recovery and
the map queries over HTTP.
`validate.test.ts` covers the checks against constructed views, including
complete views, which the fixture cannot give: without `node_modules`, every
fixture view reports coverage limits. Recovery tests freeze a job after a chosen
publication write through the `afterPublicationWrite` hook, as a crash
would. They then replace the lock with one held by an exited process, and
reopen. The HTTP tests start the server on a system-chosen port and speak to
it with plain `fetch`, without web assets. Tests never use pi or the network
beyond the loopback interface.
