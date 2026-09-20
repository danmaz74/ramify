# Iteration 2: Jobs on a fake agent

**Goal:** the complete mapping-job lifecycle, durable and recoverable, driven
by a scripted fake agent, with a progress view.

## Scope

- **`harness/agent`**, declared with its README: the port as the main plan's
  [contract item 6](../main-plan.md#what-this-plan-fixes-for-later-plans)
  states it (start a session with role, scope, prompt and tools; events; one
  structured submission; stop), and the scripted fake that replays a script of
  events, tool calls and a submission, including failures and hangs.
- **`contracts/map`**, declared with its README: the map schema with every
  section of the [map table](../main-plan.md#the-implementation-map) and its
  shape validator. The mechanical checks that need the views arrive in
  iteration 3.
- **`contracts/protocol`**: the start, stop and (placeholder for iteration 4)
  approve commands; receipts; job snapshot; events; the events-after-cursor
  query.
- **`harness`**: the project lock (`plans/.harness/lock`, takeover of a dead
  owner), the job directory layout, `job.json` and `input/plan.md` written
  once before the first event, the event log as the only authority for state
  and version, command IDs and expected versions with the three rules of
  [contract item 4](../main-plan.md#what-this-plan-fixes-for-later-plans),
  one job at a time, Stop, failure, the four-write publication with
  revision allocation under the lock, and restart recovery exactly as the
  [recovery table](../main-plan.md#durable-state-and-recovery) states. The
  mapping job here uses a stub manifest and stub evidence (plan hash and
  commit are real; view identities may be placeholders marked as such).
- **`web`**: the Progress view (current activity, elapsed time, feed, Stop,
  connection state separate from job state), polling events after a cursor;
  Start mapping on the Plan page; the Plans page's latest mapping state.

## Exit evidence

- A job driven by the fake completes with no client connected; a client
  attached afterwards reads the same snapshot and events.
- Tests for the retried identical command, the conflicting reused ID and the
  stale expected version.
- A test per publication write that forces a restart after it and checks the
  recovered state against the recovery table, plus the reserved revision whose
  file has a different hash.
- Lock takeover of a dead process; refusal while a live one holds it.
- The Progress view in a real browser on the fixture with the fake agent
  (a `serve` option or environment switch selects the fake; it is never the
  default).
- Type check, tests and `npm run check:self` pass.
