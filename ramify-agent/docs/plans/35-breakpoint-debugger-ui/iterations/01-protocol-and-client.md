# Iteration 1: protocol projections and client

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and boundary

Clean committed baseline. Owners: harness protocol contracts, run snapshot
projection and the `/debug` HTTP route; the web client and its test stub.
No UI component changes in this iteration. No new event, command or record.

## Deliverables

- `runSnapshotSchema.breakpoint`: the selector the run was started with, or
  `null`, with a schema default of `null` so that legacy answers and existing
  fixtures parse. Project it from `record.breakpoint` wherever the snapshot
  is built, including the run list.
- `debugStateResponseSchema.interventions`: at most 500 entries in log order,
  each `{ kind: 'message' | 'resume', sequence, at, pauseId, revision,
  commandId, message: string | null, result: DebugExchange | null }`. A message
  entry comes from `debug-exchange-admitted` with its result from the existing
  `debugResult`, null until settled. A resume entry comes from `debug-resumed`
  with its optional message. Keep `current`, `reached`, `cursor` and `more`
  as they are.
- Web client methods `getDebugState(planId, runId)`,
  `getDebugInspection(planId, runId, pauseId)` and
  `getDebugExchange(planId, runId, commandId)` over the existing
  `protocolPaths.runDebug*`, validated by the protocol schemas, and the
  matching stub-client answers (`debug`, `inspections`, `exchanges` per run).
- Two sentences in the harness specification's debugger section naming both
  projections.

## Verification and exit

Own U01, U02 and U03. Extend the existing HTTP debug test with the
intervention list after a message, its settlement and a resume with text, and
the snapshot test with both selector values and the legacy omission. Add a
client test for the three methods. Update any exact union or key inventory
that the new fields affect. Run focused guarded tests for the harness protocol,
projections, HTTP debug route and web client, `npm run type-check` and
`npm run check:self`. Commit and write `01-results.md` with the candidate
commit and the final shape of both projections.
