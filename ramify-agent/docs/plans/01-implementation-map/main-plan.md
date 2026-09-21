# Plan 1: From a chosen plan to an implementation map

**Date:** 2026-09-19. **Status:** implemented, except the live items: the
real pi session and the live trial, which need a person's pi login. The
[completion report](completion-report.md) records the gate and the steps.

This plan delivers the [mapping phase](../../architecture.md#the-mapping-phase) of
the [harness architecture](../../architecture.md) and the foundations every
later plan builds on: the harness process, its web client and the pi
integration. It follows the [harness principles](../../harness.principles.md).
The work loop is the next plan and is out of scope.

## Runnable outcome

A person starts the harness for a Ramify project, opens its web page, chooses
one of the project's plans, reads it, and starts mapping. An architect agent
running on pi works from Ramify's architect view and submits an
**implementation map**. The harness validates and saves it. The person reads
the map in the browser and approves it.

```text
choose a plan -> read it -> start mapping -> architect works on pi
                                                  |
                approve <- read the map <- validated map saved
```

## Terms

- A **plan** is the user's feature request: `plans/<plan-id>/plan.md` in the
  target project. The harness never edits it.
- The **implementation map** is the mapping phase's output: where the
  implementation of the plan falls on the module tree. It is a first
  approximation that the later work loop amends through revisions. Within this
  document it is the map.
- A **mapping job** is one run of the architect that produces a map revision.
- A **brief** belongs to a work item and to the next plan.

## What this plan fixes for later plans

1. **The harness is a standalone process** serving one project. It owns the
   project lock, agent sessions, state, persistence and recovery, and
   completes a job with no browser connected.
2. **The web client is a projection.** It renders what the harness publishes
   and sends commands. It owns only selection, layout and connection state.
3. **One HTTP JSON protocol** under `/api/v1`, usable from the browser and
   from Node: read-only queries, commands, and progress as a job snapshot with
   ordered events fetched after a cursor. No WebSocket and no broker.
4. **Commands are safe to retry.** Each carries a command ID and the job
   version it expects. An accepted command returns a receipt, never a claim
   of completion.
   - A command whose ID and content match an accepted command returns the
     original receipt and has no further effect, whatever the job's version
     now is.
   - A command that reuses an ID with different content is a conflict.
   - A new command whose expected version is not the job's version is
     rejected as stale, with the current version.
5. **Durable state is files, with one authority.** A job's event log is its
   canonical record. `job.json` holds the input manifest and is never
   rewritten. State, version and receipts derive from the log; see
   [durable state and recovery](#durable-state-and-recovery).
6. **An agent adapter port.** The harness core talks to an agent through one
   interface: start a session with a role, scope, prompt and tools; receive
   events; receive one structured submission; stop. pi is its first
   implementation and a scripted fake is its second.
7. **Structured submission through a tool.** An agent finishes by calling a
   tool whose input has a schema. A closing message is never a result.

## Module tree

The project keeps its three children: `contracts`, `harness` and `web`. A
new module is declared only where a boundary hides knowledge and a named
contract crosses it, and only in the iteration that gives it behavior.

```text
ramify-agent
  contracts           formats shared by both sides
    protocol          iteration 1
    map               iteration 2
  harness             the only writer
    agent             iteration 2: the agent port and the scripted fake
      pi              iteration 3
  web                 browser client; receives contracts only
```

| Module | Hides | What crosses the boundary |
| --- | --- | --- |
| `contracts/protocol` | The wire encoding and its versioning. | Query, command, receipt, job snapshot and event schemas, to `harness` and `web`. |
| `contracts/map` | The map's schema and the validation of its shape. | The map type and its shape validator, to `harness` and `web`. It changes with the work loop; the protocol changes with the client. |
| `harness/agent` | How a session is driven. | The port: start a session with a role, scope, prompt and tools; events; one structured submission; stop. The scripted fake implements it. |
| `harness/agent/pi` | The pi dependency, its session format and its login. | Only an implementation of the port. Nothing else in the project imports pi. |

The remaining responsibilities of `harness` start as directories in its
`src/`: jobs and the run store, plan discovery, the mapping job, and the HTTP
adapter. They are candidates for modules. One is extracted when a second
consumer, a dependency worth hiding or an evidenced assessment of local
cognitive complexity justifies it; the
completion report records what was found.

| Work | Weight | Notes |
| --- | --- | --- |
| Jobs, event log and run store | heavy | What later plans extend. |
| The mapping job | heavy | Evidence, prompt assembly, map validation, bounded correction. |
| `harness/agent/pi` | heavy, uncertain | The least known part; see the [spike](#iterations). |
| `web` | heavy | Three pages and a progress view. |
| `contracts` | light | Schemas only, but every seam passes through it. |
| Plan discovery, HTTP adapter | light | |

Seams, each defined in `contracts` so that neither side designs the other's
interface: web and harness agree on `protocol`; the mapping job and web agree
on `map`. Within `harness`, everything depends on the agent port, never on
pi.

Reuse: `ramify materialize` and the generated views through the CLI; the
module-architect skill for discovery, access and placement; the toolkit's
stack where it fits, namely Express, React, Vite and Zod.

## The implementation map

Saved as `plans/<plan-id>/map/<revision>.json` in the target project.
A saved revision is immutable and carries no approval state. An approval is
a separate record beside it. Harness state lives in hidden directories:

```text
<project>/plans/
  .harness/lock               the project lock
  <plan-id>/
    plan.md
    map/001.json              immutable map content
    map/001.approval.json     written on approval, never changed
    .harness/jobs/<job-id>/
      job.json                the input manifest; never rewritten
      input/plan.md           the captured plan
      events.jsonl            the canonical record
      output/map.json         the validated submission, before publication
      session/                the agent's own session record
```

| Section | Content |
| --- | --- |
| Identity | Plan ID, map revision, job ID and the job's [input manifest](#the-mapping-job). |
| Summary | The intended change and the constraints it preserves, in a few sentences. |
| Modules touched | Each module with a weight of heavy, light or exposure only, and one sentence on why. A proposed new module is marked as such and carries its parent, purpose and tags. |
| Reuse | Per capability: the existing symbols, their owner, the requesting module and its source area, and an availability of **available**, **unavailable** or **unknown**. Available cites the record in the requester's API view with its import spelling. Unavailable requires complete coverage in that view and carries the exact exposure declarations per affected module. Anything else is unknown, with the reason. |
| New capabilities | Per capability: a goal of one paragraph, the owner module, its consumers. |
| Seams | Every new or changed capability whose consumer is in a different branch from its owner. |
| Entry point and acceptance | The highest consumer of the feature and the feature-level behavior that decides completion. |
| Proposed work items | Which capabilities fall within one subtree and can be one vertical work item, each with its subtree root. |
| Assumptions and limits | What the architect assumed, what it could not find, and the coverage limits reported by the architect view. |
| Evidence | For each factual claim, a citation of an architect view record, a declaration or a source location. |

The harness validates what is mechanical and nothing else: the shape; that
every named module exists or is marked proposed; that every cited symbol
exists in the architect view under the named owner; that every availability
agrees with the requester's API view as materialized by this job, and that
none is stated for a requester whose view was never materialized; that each
seam's two sides are in different branches; that the entry point is a
touched module.
Whether the map is a good architecture is judged by the person who
approves it.

## The mapping job

1. Take the project lock. Capture the plan text, then write the **input
   manifest** to `job.json`: the plan's content hash; the source commit and
   whether the checkout is dirty; the versions of the architect prompt, the
   feature-mapping procedure and the module-architect skill; the Ramify
   version. The architect changes nothing, so the job runs in the project's
   checkout and needs no worktree. Uncommitted source changes are visible to
   it; the progress view says so.
2. Run `ramify materialize --view architect`. Add to the manifest the view's
   revision, its coverage limits and its **input identity**, the `input`
   value of `.ramify-architect/_meta.json`. That value, and not the commit,
   identifies the source state the evidence describes, including uncommitted
   content.
3. Start an architect session through the agent port. The working directory
   is the project root. The prompt carries the role, the captured plan, the
   map's sections, the feature-mapping procedure and the module-architect
   skill. The tools are read and search only, plus two:
   - `materialize_api_view`, which takes a requesting module. The harness
     runs `ramify materialize --view architect --view api --from <path>` and
     returns the view's paths and coverage. The architect view cannot say
     whether a module may use a symbol; the requester's API view can. The
     harness records each requester and the view's metadata as evidence.
   - `submit_implementation_map`.
4. Every materialization compares the input identity with the manifest's. A
   difference means the source changed during the job. The job fails as
   **inputs changed** and saves nothing, so no map mixes two source states.
5. Publish observed activity as events: files read, searches run, elapsed
   time and token usage where pi reports it. No invented percentages.
6. Validate the submission. On failure, return the validation errors to the
   same session, at most twice. After that the job fails with diagnostics.
7. Before publication, materialize once more and hash `plan.md` again. If
   either identity differs from the manifest, the job fails as inputs
   changed.
8. Publish the map as described under
   [durable state and recovery](#durable-state-and-recovery).

One job per project at a time. **Stop** ends the session and marks the job
stopped. **Regenerate** starts a new job and, when it succeeds, a new
revision. A failed job never replaces a saved revision.

The feature-mapping procedure is owned and versioned by the harness, beside
the architect prompt. The module-architect skill answers one question at a
time and is used unchanged, so this plan has no predecessor in the toolkit.
Whether the procedure later moves into the skill is decided after the live
trial.

### Approval

**Approve** names one revision. The harness materializes the architect view,
hashes `plan.md`, and refuses the approval as stale when either identity
differs from the map's manifest. Otherwise it writes
`map/<revision>.approval.json` once: the revision, the hash of the map file,
the manifest's plan hash and input identity, and the time. A later change to
the plan or the source does not alter the record; whoever relies on an
approval compares its identities with the current ones. Showing freshness in
the client is out of scope; approving a stale map is impossible.

### Durable state and recovery

`events.jsonl` is the only record of a job's state. Each line is one event
with a sequence number; the job's version is the last sequence number. An
accepted command is an event holding its ID, content hash and receipt. A
trailing partial line is discarded on load. `job.json` and `input/` are
written once, before the first event.

The project lock is `plans/.harness/lock`, holding the process ID and start
time of the harness that owns it. A lock whose process is gone is taken
over. Revisions are allocated only under the lock, as one more than the
highest `map/<n>.json`.

Publication is four writes, each atomic, in this order:

| After this write | A restart finds | Recovery |
| --- | --- | --- |
| 1. `output/map.json`, by rename | A running job with an unreferenced output. | Interrupted. |
| 2. Event `map-validated`, with the map's hash and the reserved revision | The event and no map file. | Publish from `output/map.json`, then complete. |
| 3. `map/<revision>.json`, by a rename that never overwrites | The event and a map file with the same hash. | Complete. |
| 4. Event `job-completed` | A completed job. | None. |

If the map file at the reserved revision has a different hash, the job fails
and the file is left alone. Any other job without a terminal event is marked
interrupted on restart; it is restarted by the person, not resumed. A saved
revision therefore always belongs to a completed job.

## The web client

| Page | Contents |
| --- | --- |
| Plans | Every `plans/*/plan.md`, by title and path, with its latest mapping state. Refresh. An empty state that says where a plan file belongs. An unreadable file is shown as an error. |
| Plan | Two views. **Plan**: the Markdown rendered read-only, without executing embedded HTML. **Map**: an empty state with Start mapping; or the running job's progress; or the latest saved map. |
| Progress | Current activity, elapsed time, an activity feed, Stop. Connection state is shown separately from job state. Reloading or closing the page does not affect the job. |
| Map | The summary, the modules touched drawn on the project's module tree with their weights, then reuse, new capabilities, seams, entry point, proposed work items, assumptions and evidence. Earlier revisions remain selectable. Approve and Regenerate. |

Nothing is editable. The person reads, approves or regenerates.

## Iterations

| Iteration | Delivers | Exit evidence |
| ---: | --- | --- |
| 0 | **pi spike**, because it is the riskiest assumption. Pin a pi release. From a throwaway script, confirm: a session driven from Node with a replacement system prompt and a restricted tool set; a custom tool with a schema that ends the turn; the event stream with tool calls and their paths; token usage per message; login through an existing subscription; loading the skill. | A short results note listing what was confirmed, what was not, and any change this plan needs. |
| 1 | **Skeleton and plan browsing.** `contracts/protocol`, declared with its README. In `harness`: the run store and event log, plan discovery, and the HTTP adapter with the project and plan queries. The `serve --project <root>` entry. The web Plans and Plan pages. A fixture target project with two plans. | The fixture's plans are listed and read in a browser. The same queries answer from a Node client with the web assets absent. `npm run check:self` passes. |
| 2 | **Jobs on a fake agent.** `harness/agent` with the port and the scripted fake. `contracts/map`. The mapping job's lifecycle: the input manifest, start, events, stop, fail, the project lock, command IDs and expected versions, publication and recovery. The Progress view. | A mapping job driven by the fake completes with no browser connected, and a client attached afterwards reads the same job. An identical retried command returns its original receipt, a reused ID with different content conflicts, and a stale expected version is rejected. A restart forced after each publication write recovers to the state in the [recovery table](#durable-state-and-recovery). |
| 3 | **The architect on pi.** `harness/agent/pi`. The mapping job on real evidence: materialization and input identity, `materialize_api_view`, prompt assembly, `submit_implementation_map`, validation against the architect and API views, bounded correction. The architect prompt and the feature-mapping procedure. | A real session on the fixture project saves a valid map. A deliberately invalid submission from the fake is corrected once and rejected after the bound. An availability that the requester's API view contradicts is rejected. A source change during a job fails it as inputs changed. |
| 4 | **Map view, approval and the live trial.** The Map page, revisions, Approve with its approval record, and Regenerate. Approval of a map whose plan or source changed is refused. A live trial on a real plan for the toolkit or the reference example, reviewed by a person against the principles: are the heavy modules right, were the reuse findings real, are the seams plausible. | The trial's map and review notes. A completion report with the limitations found. |

Iterations 1 and 2 need no pi and no subscription. The fake agent is what
the core's tests run against throughout, in the spirit of the principle that
fakes and tests guide delegation; only the live trial and iteration 3's real
session use pi.

## Completion gate

1. The runnable outcome works end to end in a browser with a real pi session
   on a real plan.
2. A mapping job completes with no client connected.
3. The target project's source, `module.ramify` files and `plan.md` are
   unchanged by mapping. Ramify's generated, gitignored views are refreshed.
4. ramify-agent passes its own `npm run check:self`, type check and tests.
5. The completion report records the trial and hands the next plan the map
   schema, a produced map, the agent port, the job lifecycle and the
   protocol.

## Out of scope

The work loop and everything in it: work items, briefs, engineers,
contract and integration agents, outcomes beyond a map submission. Also:
verification of an agent's claims beyond the mechanical validation above; a
worktree per job; resuming an interrupted session; a decision flow for
substantial changes to the request; measurements and KPIs; freshness labels
in the client for a saved map whose plan or source has since changed; editing of plans or maps;
parallel jobs; several projects per process; a command-line client; remote
hosting.

## Open decisions

1. **pi in process or in a child worker.** In process is simpler and is
   proposed here. A child worker isolates a crash and makes Stop certain. The
   spike informs the choice; the agent port hides it either way.
2. **The fixture and the trial target.** The reference example under
   `examples/collection-review` has fifteen modules and is proposed as the
   fixture. The trial could use it or the toolkit itself.
3. **Web stack.** React, Vite, Express and Zod match the toolkit and are
   proposed. The protocol is plain HTTP JSON, not tRPC, so that a client
   needs no harness types.
