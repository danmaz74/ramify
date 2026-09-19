# Harness client protocol

> **Superseded** on 2026-09-19 by the [harness principles](../../../harness.principles.md) and the
> [harness architecture](../../../architecture.md). Kept for comparison; not current. See the
> [archive index](../../README.md) for what may be reused.

**Plan:** [Pi architectural planning MVP](main-plan.md).
**Status:** proposed public boundary for the first web client and a future CLI.

## Process and authority

The harness is a standalone Node service, started independently of any client.
A working launcher shape is `ramify-pi serve --project <root>`. This starts one
local harness for that project; opening its web page is optional. This bootstrap
command is not the future interactive/automation CLI client.

The service owns the project lock, planning state, pi workers and durable files.
Browser and future CLI clients connect through the same HTTP interface. Neither
client imports the harness runtime or operates pi directly. Workers report to
the harness, never directly to a browser. Stopping a job is distinct from
shutting down the service. A service shutdown records interrupted work and
reaps workers; recovery reconciles recorded state before another worker starts.

The service may serve the compiled web assets. With those assets absent, its
API still works. Support one configured project per process in this MVP;
multi-project registration and discovery are later additions.

## Queries and projections

Use JSON under `/api/v1`. All file access is resolved by the harness from
registered/discovered IDs; clients do not submit arbitrary filesystem paths.

| Query | Projection |
| --- | --- |
| `GET /api/v1/project` | Project identity, readiness and configured runtime/provider status, without credentials |
| `GET /api/v1/plans` | Discovered plan IDs, titles, input hashes and latest planning state; Refresh repeats this query |
| `GET /api/v1/plans/:planId` | Read-only plan text, content hash and metadata |
| `GET /api/v1/documents/:documentId` | An allowed referenced project document resolved by the harness |
| `GET /api/v1/plans/:planId/architectures` | Published revision IDs, source/input identity and freshness |
| `GET /api/v1/plans/:planId/architectures/:revision` | The canonical completed architecture artifact |
| `GET /api/v1/jobs/:jobId` | Authoritative job snapshot: state/version, input references, activity, pending decision, allowed commands and event cursor |
| `GET /api/v1/jobs/:jobId/inputs/:documentId` | Captured plan or used reference document, identified by the job's input manifest |
| `GET /api/v1/jobs/:jobId/metrics` | Harness-computed scope/planning KPI projection with snapshot/baseline IDs, policy, units, raw terms and coverage; implementation-only metrics not started |
| `GET /api/v1/jobs/:jobId/events?after=<sequence>&limit=<count>` | A bounded ordered page of durable public events after the given job-local cursor |

Project/plan projections include latest and active job IDs so another client
can attach without receiving a browser's local state. Snapshots carry the last
included event sequence from the same committed state. An event is identified
by job ID and monotonic sequence. Event pages carry a next cursor and whether
more entries remain; limits are bounded by the harness.

Job snapshots may include a bounded recent-event window for initial display.
Fetch the snapshot, then subsequent events after its cursor; on reconnect,
fetch a fresh snapshot before continuing. Clients may deduplicate/reorder their
feed by sequence, but they do not derive authoritative workflow state from raw
pi messages. Refresh the job snapshot to reconcile that state. An unavailable
or invalid cursor requires a new snapshot and never implies job completion.

The metrics query uses the [consumer KPI contract](../../../measurements-and-kpis.md).
Pi usage, activity and all KPI calculation stay in the harness. It returns the
same values to browser and Node clients; clients do not query Ramify or rebuild
metrics independently. This adds a read projection, not a new control command.

Public event examples are job started/stopped/failed, activity changed,
architecture published and decision required/resolved. Events reference artifacts
and native pi session/tool records rather than duplicating entire transcripts.
The browser owns graph layout and selection. The service supplies the design,
state, freshness and eligibility of actions.

## Commands

Send `POST /api/v1/commands` with a discriminated JSON command. Every command has
`commandId` and `type`, plus its target and required preconditions. Type schemas
are shared by the HTTP adapter and thin client library. A frontend may validate
for usability; the harness performs the authoritative validation.

| Type | Target/preconditions | Effect |
| --- | --- | --- |
| `planning.start` | Plan ID, expected plan hash and source commit | Capture inputs and start a new planning job while the project is idle |
| `planning.regenerate` | Plan ID, displayed architecture revision, expected current plan hash and source commit | Start a new planning job from current inputs, retaining old revisions |
| `job.stop` | Job ID and expected state version | Record explicit cancellation and settle/terminate its worker |
| `job.resume` | Job ID and expected state version | Reconcile and continue a recoverable stopped/failed planning job |
| `decision.respond` | Job ID, expected state version, exact proposal ID/hash and accept/keep-original choice | Record the decision and continue the architect within its resulting commitments |

The server checks project exclusivity and current state even if a client shows
a stale enabled button. Full input freshness is rechecked at job admission;
plan hashes alone do not prove that source or used references are unchanged.
There is no edit-plan, arbitrary-prompt, arbitrary-shell or implementation-start
command in this release.

A successful admission returns a durable receipt containing command ID, job ID
and accepted state version. Acceptance schedules work; completion arrives through
job state and events. Rejection returns a structured reason and current state
or active job reference where useful, so every client can handle the same error.

Persist admission before starting its worker. Repeating a command ID with the
same payload returns the same receipt/outcome; changing that payload is a
conflict. Different start IDs racing for the same project produce at most one
job; the other response identifies the active job. Expected state versions
reject stale stop/resume/decision requests. Check an existing receipt before
re-evaluating a retry's now-stale preconditions.
The state version changes when command eligibility or decision state changes;
ordinary activity events advance the event sequence without needlessly
invalidating a pending Stop command.

A lost response does not cancel accepted work. After a service restart, recover
command receipts and pending work, reconcile any old worker and then continue.
This does not claim exactly-once model calls after a crash; interrupted attempts
are recorded and safely reconciled before an explicit retry. Command admission,
job transitions and their event cursor must agree after recovery.

## Boundaries and client lifecycle

One source of truth remains in the harness's durable records. Client caches are
disposable. Browser tab closure, network loss, missing assets and absent polling
cannot stop jobs or prevent routine progress. A substantial decision may remain
pending with no connected client; any later client can retrieve and answer it.

Keep protocol schemas and a small fetch-based client independent of Node
filesystem/pi code and browser component libraries. The web app uses that
client for every read and command. Tests can use the same client from Node,
proving that a later CLI needs presentation/argument handling rather than a
second workflow engine. No production CLI is built in this phase.

Listen locally. Validate any browser Origin against the app's configured local
origin; local non-browser clients can use the same API without a browser Origin.
Keep credentials and raw credential errors out of public projections. Remote
hosting and multi-user access are separate future scope.

## Acceptance obligations

PW21 proves standalone boot and query use without web assets. PW22 proves a
planning job can start/complete with no browser and be observed by a later
client. PW23 proves command admission, idempotency and stale-state conflicts.
PW24 proves snapshot/event reconciliation and the browser/client import boundary.
See the [acceptance matrix](acceptance.md) for ownership and final gates.
