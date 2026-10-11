# Iteration 1: protocol projections and client

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and boundary

Clean committed baseline. Owners: harness protocol contracts, run snapshot
projection and the `/debug` HTTP route; the root CLI debug client's fixtures;
the web client and its test stub. No UI component changes and no CLI behavior
change in this iteration. No new event, command or record.

## Deliverables

- `runSnapshotSchema.breakpoint`: the selector the run was started with, or
  `null`, with a schema default of `null` so that legacy answers and existing
  fixtures parse. Project it from `record.breakpoint` wherever the snapshot
  is built, including the run list.
- `debugStateResponseSchema.interventions`: a required array, complete over
  the whole log and independent of the `after` cursor and its page window, in
  log order, each `{ kind: 'message' | 'resume', sequence, at, pauseId,
  revision, commandId, message: string | null, exchange: DebugExchange | null }`.
  A message entry comes from `debug-exchange-admitted`; its `exchange` is
  exactly what the existing `debugResult` returns for that command ID at query
  time, so it is `admitted` until settled and `stopped` or `interrupted` when
  the run ended first, never null. A resume entry comes from `debug-resumed`
  with its optional message and a null exchange. Keep `current`, `reached`,
  `cursor` and `more` as they are. Interventions are bounded by the run's
  invocation bounds, so no cap is needed.
- The CLI debug client in `src/debug-client.ts` changes no behavior; its test
  fixtures in `src/tests/debug-client.test.ts` gain the required field.
- Web client methods `getDebugState(planId, runId)`,
  `getDebugInspection(planId, runId, pauseId)` and
  `getDebugExchange(planId, runId, commandId)` over the existing
  `protocolPaths.runDebug*`, validated by the protocol schemas, and the
  matching stub-client answers (`debug`, `inspections`, `exchanges` per run).
- Two sentences in the harness specification's debugger section naming both
  projections.

## Verification and exit

Own U01, U02 and U03. Extend the existing HTTP debug test with the
intervention list after a message (status `admitted`), after its settlement,
after a resume with text, with an `after` cursor beyond the admission event,
and with a stop before settlement; add the snapshot cases for both selector
values and the legacy omission. Add a web client test for the three methods
and migrate the CLI client fixtures. Update any exact union or key inventory
that the new fields affect. Run focused guarded tests for the harness protocol,
snapshot, HTTP debug route, CLI debug client and web client,
`npm run type-check` and `npm run check:self`. Commit and write `01-results.md` with the candidate
commit and the final shape of both projections.
