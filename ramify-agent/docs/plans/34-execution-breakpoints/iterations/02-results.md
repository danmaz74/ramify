# Iteration 2 results: engineer conversation

[Iteration](02-engineer-conversation.md) · [Acceptance](../acceptance.md)

Implemented in source commit `147b71de5e66ac107255f5c83c7558f32e95ac79`,
based on the accepted iteration 1 handoff
`27f0dccbae44162ea29430707d281194fd35a689` (implementation
`70c2adbdadbbda06b6296dcde7a154d372f1b926`). Work used branch
`feat/plan34-breakpoints-implementation` in the isolated checkout
`/home/app/ramify-plan34-breakpoints-implementation`. The checks below ran
against its final implementation files before the source commit. This receipt
is a subsequent documentation-only commit. No push was performed; other
checkouts, including `/ramify`, were preserved.

## Delivered behavior and contracts

- Read-only input inspection composes the ordinary task without allocating an
  invocation, equipping tools, invoking a model or claiming delivery. It presents
  full role instructions, effective inherited procedure/environment/briefing
  blocks, ordered inherited input and current additions, current tool declarations,
  task scope, execution bounds and the source point. Missing retained context is
  explicitly unavailable, with its reason and the ordinary fresh fallback preview.
- Caller text is appended verbatim after the complete ordinary task before
  immutable session-operation admission. Both request hashing and delivered-input
  accounting include it. The normal role procedure, task, tools, authority,
  scope, validator and submission contract remain active.
- A plain ended reply remains pending only when explicitly requested by the
  debugger and after confirmed settlement at a retained session point. Ordinary
  missing-submission behavior is unchanged. Follow-ups and resumed implementation
  continue the latest settled logical session with both provider transcript
  history and harness briefing ancestry, using current invocation bindings.
- Accepted completion, partial and capability-needed actions are held until
  resume, which handles the accepted action once without another model call.
  Actual final rejection, failure and context-budget exhaustion are also held;
  further messages are refused. Known reusable-context loss follows ordinary
  fresh fallback, retaining the current caller text and recording continuity loss.
- Message admission is serialized and durable before execution, returns the
  existing receipt immediately and releases the command/run mutex before model
  execution. Exact command retries return that receipt before checking a newer
  interaction revision; changed content conflicts. Stale and concurrent commands
  are refused. Settled results remain queryable after another exchange, resume
  or server restart, with actual verdicts and invocation/evidence correlations.
- The review queue stays suspended throughout exchanges. Caller-wait intervals
  close at exchange admission and reopen at exchange settlement; model/tool time
  consumes normal execution bounds. Resume rechecks captured documents, writer
  settlement and the ordinary runner's source/context/authority bindings.
- Stop wins before invocation admission and during model execution. Admitted
  exchange lifetime is part of the run's completion barrier, including server
  shutdown. An unfinished exchange is reported stopped or interrupted rather
  than settled; restart never replays a debug-enabled conversation or workflow.
- Unconfirmed tool/session settlement prevents another exchange, resume and
  gates. The shared runner now propagates equipment settlement failure into the
  writer barrier. A reusable-context refusal before dispatch also releases the
  acquired writer after confirming equipment settlement before ordinary fallback.

Runtime and tests are confined to the harness. The normal, contract and
nonfunctional repair engineer request paths provide declarations matching their
actual per-invocation tools. No Pi adapter, HTTP route or CLI implementation was
added. `docs/harness.spec.md` describes the implemented behavior.

## Evidence

The exact clean baseline full audit supplied by the coordinator is recorded in
[iteration 1's receipt](01-results.md):
`f60a12de799b146228ed7b5f31184109fafb8102`, complete configured coverage
328/328 with 2,956 passing tests, one existing skipped file and two existing
skipped tests. That audit qualifies the prerequisite source, not this commit.
This iteration did not run the whole suite or a full audit.

The final checks ran from the isolated checkout's `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/execution-breakpoints-conversation.test.ts subs/harness/src/tests/execution-breakpoints-capability.test.ts subs/harness/src/tests/nonfunctional-repair.test.ts subs/harness/src/tests/execution-breakpoints.test.ts subs/harness/src/tests/union-values.test.ts subs/harness/src/tests/plan23-live-session.test.ts subs/harness/src/tests/plan23-continuing-work.test.ts subs/harness/src/tests/plan25-task-packets.test.ts subs/harness/src/tests/plan25-discovery-delivery.test.ts subs/harness/src/tests/review-queue.test.ts subs/harness/src/tests/run-bounds.test.ts
npm run type-check
npm run check:self
git diff --check
```

All exited 0. The guarded focused run passed **11 files and 176 tests**, with
no failures or skips. Type checking used the project-declared four TypeScript
configs. The module check passed with 13 owners, 752 source files, 65 resources
and 15,270 accesses; zero errors and zero warnings. It explicitly reported
**partial coverage**, with 349 analysis limits. Local final outputs are
`/tmp/plan34-iteration02-focused.txt` and
`/tmp/plan34-iteration02-check-self.txt`.

The executable witnesses cover B05–B11 and the exchange portions of B03/B04/B14:
fresh and continued effective previews; normal task and exact caller bytes;
two explanatory returns and resumed implementation; both retained histories;
completion, partial and capability action retention; actual rejection verdicts;
explicit context-loss fallback; scope-guard refusal; unconfirmed settlement;
command retry/conflict/stale/concurrency behavior; caller wait versus model
bounds; queued code/design reviews remaining suspended during the exchange;
stop before invocation-started and during exchange; shutdown/restart during an
admitted exchange without replay. Existing ordinary delivery, task packets,
continuation, review queue and run-bound regressions passed in the same group.
External process/Git/provider boundaries were scripted under the ordinary test
guard; these witnesses do not establish native Pi or CLI lifetime behavior.

## Successor handoff and limits

Iteration 3 can expose the following in-process interfaces through HTTP and CLI:

- `RunService.debugState(planId, runId)` returns the current occurrence or null.
- `RunService.debugInspect(planId, runId, pauseId)` asynchronously returns a
  detached `DebugInspection` preview. It rejects a stale occurrence/revision if
  the run progresses during inspection. `input.roleInstructions` contains the
  complete role text; `input.message` and `input.additions` describe the prepared
  invocation delta, while `input.effective` includes inherited active blocks.
- `RunService.execute(debug-message)` admits payload
  `{ planId, jobId, pauseId, expectedRevision, message }` with the ordinary
  `commandId` and `expectedVersion`. Its `Receipt` acknowledges admission rather
  than awaiting model execution; preserve immediate HTTP 202 behavior.
- `RunService.debugResult(planId, runId, commandId)` returns null for an unknown
  exchange, otherwise a durable `DebugExchange` with status `admitted`, `settled`,
  `stopped` or `interrupted`. Settled results include answer, actual outcome,
  rejection/acceptance verdicts, error/continuity-loss reason, harness invocation
  and session IDs, logical point reference and evidence paths relative to the
  run directory. Interrupted results retain available invocation/outcome evidence.
- `debug-resume` accepts the same occurrence/revision plus optional `message`.
  The message accompanies resumed ordinary implementation when still pending.
  An accepted or terminal held outcome is consumed without another model call.

Protocol schemas and durable `debug-exchange-admitted`/`debug-exchange-settled`
events are exposed alongside existing breakpoint state. Historical command
results must be presented as retained results, separately from current live
`debugState`; retrying an old command does not acquire ownership of a newer
occurrence. The logical session point and harness invocation/session identifiers
are distinct correlations. Caller text is in the admission event and actual
delivered packet, not just in a display annotation.

Iteration 3 owns explicit attachment, HTTP transport, CLI polling/waiting,
disconnect handling and current-state versus historical receipt presentation.
Iteration 4 owns combined qualification, the exact final candidate configured
audit, registered native witnesses and separately recorded real-plan exercise.
These focused tests and the supplied baseline audit do not establish full Plan
34 acceptance, native history/process behavior, real target delivery or any
cache/performance benefit.
