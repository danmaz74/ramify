# cucumber-viz lessons: state and recovery

Part of [Lessons from cucumber-viz](README.md), which explains the verdicts,
sources and path abbreviations. "The proposal" is the
[core records proposal](../plans/03-autonomous-implementation-loop/core-records.proposal.md).

## 1. Completion is the last write

**Adopt.** cucumber-viz marks an iteration's attempt completed and only then
asks for its publication:

```text
await markWorkflowAttemptCompletedInternal({ ..., attemptId, resultRef })
registerPendingPublication(iterationIndex, iterResult)
await handleRequestPublicationPrompt(workflowId, iterationIndex, chatKey, attemptId)
```

The machine keeps the completed attempt as the work unit's current attempt, so
a retry supersedes it and the outstanding publication is rejected as stale for
good. A comment in the same function names the result: a rejection there "used
to leak the pending publication resolver and leave spawnIterations unsettled —
the silent wedge." ramify-agent has met this from the outside, as a workflow
that stalls at the publication gate until it is stopped and resumed.

Recovery in cucumber-viz then had to distinguish where a run was interrupted:
drafting, checks, publication, merge or cleanup each have their own recovery
phase.

Evidence: `IS/core/workflow-service/spawn-iterations.ts:1749-1761` and
`:1785-1790`; `IS/core/workflow-service/recovery-coordinator.ts:152-158`.

Consequence:

- The architecture already says not to "mark a session complete and then
  depend on another response from it to finish publication." State it as a
  rule of the run log: the event that closes work is appended after every
  write that belongs to that work, and no agent response is needed after it.
- `iteration-closed` comes after the gate attempt, the contract registration
  and the result file, never before.
- `job-interrupted` names the step in flight, derived from the last committed
  event, so recovery selects its action from data instead of inferring it.

## 2. An idempotent repeat re-drives the transition

**Adopt.** cucumber-viz's publication service tests that a repeated publish
"replays completion on idempotent publish when restart left the workflow
waiting to advance". Detecting that the write already happened is half of
idempotency; the other half is finishing the transition that the first attempt
did not finish.

Evidence: `IS/core/runtime/publication/publication-service-idempotency.test.ts`,
cases near lines 312, 407 and 591. Not read directly.

Consequence: the proposal says a repeated registration "writes the same bytes
and appends nothing". That is right only when the commit event exists. The
rule becomes: write the same bytes, and append the commit event when it is
absent. Recovery tests cover the crash between the file and its event for
every record kind.

## 3. The harness holds the fencing token

**Adopt.** cucumber-viz injects an attempt ID into the agent's prompt and asks
the agent to pass it back on every tool call. The tool schema leaves it
optional, and the work-unit service rejects a call without it as a stale
attempt. An agent that forgets one argument is indistinguishable from a
superseded one. The newer sealed-write path stopped trusting the agent and
binds the write to the session on the server.

Evidence: `IS/server/mcp/mcp-tool-surface.ts:114` and following, where
`attemptId` is a property and not required;
`IS/core/runtime/prompt-assembly/prompt-assembly.ts:237-246`;
`IS/core/runtime/work-units/index.ts:54-67`;
`IS/core/runtime/sealed-files/sanctioned-sealed-write-service.ts:493-506`. The
last three were not read directly.

Consequence: the harness resolves invocation, role, work item and write-scope
revision from the session it started. No tool or submission schema has a field
for an ID the harness already knows, and a `guard` call receives only the tool
call. A superseded invocation is recognized by its session, not by what it
says.

## 4. An unknown schema version fails loudly

**Adopt.** cucumber-viz validates persisted state strictly, and a comment
records the cost: the schema "must accept every value the machine records or
recovery silently skips the whole workflow." A state the machine could write
but the schema did not list made a run disappear on restart. Its persistence
schemas now name a current version, a migratable earlier one and an
`unsupported_future_version` result marked recoverable.

Evidence: `IS/core/runtime/state-persistence/persistence-schemas.ts:9-35` and
`:102-106`.

Consequence: every `schema: 'ramify-agent.<name>/N'` reader has three results:
valid, unsupported version, and invalid. Neither of the last two is treated as
an absent record. A run with an unreadable committed record is listed with that
failure and its evidence; it is never omitted from a listing. A test writes
every value each union can hold and reads it back.

## 5. The log is the authority, and a bad line is not an empty log

**Confirms.** cucumber-viz's durable run store writes the snapshot before the
journal and returns an empty history when any journal line fails to parse,
discarding every valid event before it. An analysis of its state machines and
a discarded plan record lost writes and torn state from persisting snapshots
without waiting.

Evidence: `core/shared/services/durable-run-store/durable-run-store.ts:202-204`
and `:277-290`; in the repository,
`docs/analysis/2026-03-23-xstate-adoption-maturity.md` and
`docs/plans/discarded/2026-03-23-acid-workflow-state-persistence.md`, which were
not read directly.

Consequence: Plan 1 already does the opposite. The log is canonical, appends
are flushed before they count, a trailing partial line is truncated and any
other invalid line raises `CorruptJobLogError`. Keep all of it for the run log
and apply the same reader to the observation logs.

## 6. A projection never writes, and new work never rewinds

**Adopt.** Two completed fix plans record one failure each. A list query
inferred a merge from `git merge-base` and marked a workflow completed half a
second after it was created. Appending fix iterations reset the current
iteration index to zero and re-ran every completed iteration, about five hours
of work.

Evidence, in the repository and not read directly:
`docs/plans/done/2026-03-04-fix-reconcile-merge-status-false-positive/main-plan.md`
and `docs/plans/done/2026-04-09-fix-gap-analysis-iteration-restart/main-plan.md`.

Consequence:

- Snapshots, progress and KPIs are pure functions of the logs and records. A
  query never appends an event and never infers a transition from the working
  tree.
- The proposal has no stored cursor; the next work is derived from committed
  events. Keep it so, and test that adding a work item, an iteration or a
  repair leaves every completed one completed.

## 7. A derived artifact records how far it has applied the log

**Consider.** cucumber-viz's finding store treats its journal as the source of
truth and keeps `lastAppliedJournalEventId` in the derived artifact, replaying
only later entries.

Evidence: `IS/core/runtime/finding-store/check-finding-store.ts:753-808`.

Consequence: an MVP run log is small enough to fold from the start on every
load, as Plan 1 does. If a cached projection is introduced later, it records
the last sequence it applied. Until then this is unnecessary.

## 8. The position in the log separates one attempt from the next

**Confirms, with one check.** cucumber-viz found that its chat keys and
timestamps can be identical across retries, so "journal append position is
therefore the attempt boundary".

Evidence: `IS/core/workflow-service/recovery-coordinator.ts:795-799`.

Consequence: the proposal derives IDs from counts of committed records, so a
repeated step derives the same ID only while the first attempt is uncommitted,
and the rule that an uncommitted file may be replaced covers that case. A
retried invocation is committed by `invocation-started` and so receives a new
ID. The check to make in the plan: every record an agent's turn can produce
twice is either keyed by its invocation or replaced before commit, with no
third case.

## Not found

No incident report describes the completed-before-publication wedge; the
evidence is the 0.7.0 source. There is no lease, heartbeat or process liveness
check in cucumber-viz: an orphan is detected only as "state says running and
no live actor exists". ramify-agent's writer settlement needs more than that,
as [sessions and writers](sessions-and-writers.md) describes.
