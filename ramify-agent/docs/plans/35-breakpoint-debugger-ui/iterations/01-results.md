# Iteration 1 results: protocol projections and client

[Iteration](01-protocol-and-client.md) · [Acceptance](../acceptance.md)

Implemented both harness projections, the web client's debug queries and their
stub answers. The candidate commit is `3fdbee24`, based on `5203b0c7`, on
branch `feat/plan35-debugger-ui` in the isolated checkout
`/home/app/ramify-plan35-debugger-ui`. The checks below ran against the files
of that commit; this receipt is a subsequent documentation-only commit. No push
was performed.

## Changed contracts

The run snapshot (`runSnapshotSchema`, in the run, run-list, events and every
debug answer) gains one field:

```ts
breakpoint: 'before-agent:engineer' | null   // breakpointSelectorSchema.nullable().default(null)
```

It is projected from `record.breakpoint` by the internal `runSnapshot` and
passed through by the public `snapshotOf`, so the run and run-list queries
carry it. An answer that omits it parses as `null`.

The debug state answer (`debugStateResponseSchema`) gains one required field,
`interventions`, beside the unchanged `run`, `current`, `reached`, `cursor` and
`more`:

```ts
interventions: Array<{
  kind: 'message' | 'resume';
  sequence: number;        // the admitting event's log sequence
  at: string;              // the admitting event's time
  pauseId: string;
  revision: number;        // the interaction revision the command named
  commandId: string;
  message: string | null;  // verbatim; null only for a resume without text
  exchange: DebugExchange | null;  // never null for a message; null for a resume
}>
```

The `/debug` route builds it from the whole run log (`runs.events`), in log
order, independent of the `after` cursor and its page window. A message entry
comes from each `debug-exchange-admitted` event; its `exchange` is
`runs.debugResult(planId, runId, commandId)` at query time (`admitted` until
settled, `settled` with its answer, or `stopped`/`interrupted` when the run ended
first). A resume entry comes from each `debug-resumed` event. The schema is
exported as `debugInterventionSchema`/`DebugIntervention`, and the inspection and
exchange answers now also export `DebugInspectionResponse` and
`DebugExchangeResponse`.

The web `ProtocolClient` gains `getDebugState(planId, runId)` over
`protocolPaths.runDebug(planId, runId, 0)`, `getDebugInspection(planId, runId,
pauseId)` over `runDebugInspect` and `getDebugExchange(planId, runId,
commandId)` over `runDebugExchange`, each validated by its response schema.
`StubRun` gains `debug`, `inspections` (by pause ID) and `exchanges` (by
command ID); an absent answer is `not-found`, and each read is recorded in
`calls` as `getDebugState:<run>`, `getDebugInspection:<run>:<pause>` or
`getDebugExchange:<run>:<command>`.

The root `module.ramify` exposes the debug contracts to its descendants:
`breakpointSelectorSchema`, `breakpointStateSchema`, `debugExchangeSchema`,
`debugInspectionSchema`, `debugInterventionSchema` and the three debug
response schemas, each with its type. The web module receives them; nothing else
in its profile changed.

The CLI debug client changes no behavior. Its test fixtures now carry
`interventions: []`, and its existing drain test still passes.
`docs/harness.spec.md` gains the two sentences in its debugger section.

## Decisions the plan did not state

- **Resume revision.** The `debug-resumed` event records the revision its release
  produced (`expectedRevision + 1`), while `debug-exchange-admitted` records the
  revision the message was admitted at. The intervention's `revision` is the
  revision the command named for both kinds, so a resume entry reports
  `event.data.revision - 1`. The schema documents it.
- **Element exposure.** Beside the response schemas the web client needs now,
  the root also exposes the element contracts the Debugger area will read
  (`BreakpointState`, `DebugExchange`, `DebugInspection`, `DebugIntervention`,
  `BreakpointSelector`). The debug command schemas stay reachable only through
  `RunCommandInput`.
- **Inventories.** The union inventory treats a single literal as no union, and
  the debug answers are not inventory roots, so no inventory entry changed. The
  command inventory is unaffected.

## Acceptance ownership

- U01: `execution-breakpoints-http.test.ts`, "U01: a run snapshot names its
  breakpoint in the run and run-list queries, and null without one", reads the
  run, run-list and debug answers of a breakpoint run, checks `runSnapshot` with
  and without the selector, and parses a snapshot that omits the field as `null`.
- U02: two tests in the same file. The first reads the list empty, then after
  admission (`admitted`, with the message verbatim, including a newline and
  double space), after settlement (`settled` with the answer, equal to
  `debugResult`), with an `after` cursor beyond the admission event (list
  unchanged, `reached` empty) and after a resume with text (message then
  resume, in sequence order). The second stops the run before settlement and
  reads `stopped` with a `terminal` task state and an error, with no settlement
  event. The CLI fixtures parse the revised answer and still drain pages.
- U03: `subs/web/src/tests/client.test.ts`, "U03: the debug queries request
  their protocol paths, validate the answers and carry harness refusals":
  encoded paths, validated answers, an answer missing `interventions` refused as
  `invalid-response`, and a harness `conflict` on each query carried as a
  `protocol` `ClientError` with the harness's message.

## Checks

All focused; no full suite, no test lock.

| Command | Outcome |
| --- | --- |
| `npm run test:quick -- subs/harness/src/tests/execution-breakpoints-http.test.ts subs/web/src/tests/client.test.ts src/tests/debug-client.test.ts subs/web/src/tests/run-page.test.tsx subs/web/src/tests/plan-page.test.tsx subs/harness/src/tests/run-projections.test.ts subs/harness/src/tests/lineage-metrics.test.ts subs/harness/src/tests/check-findings-projection.test.ts subs/harness/src/tests/run-commands.test.ts` | 9 files, 111 tests passed |
| `npm run test:quick -- subs/harness/src/tests/execution-breakpoints` | 5 files, 36 tests passed |
| `npm run test:quick -- subs/harness/src/tests/composition.test.ts` | 1 file, 14 tests passed |
| `npm run type-check` | passed |
| `npm run check:self` | passed: 0 errors, 0 warnings, 354 analysis limits |

The first `check:self` run failed with nine `not-visible` errors, the web client
and stub importing the debug response contracts. The root exposure above
corrected them.

## Remaining failures and limitations

None known. The snapshot cases run through `runSnapshot` on a constructed record
and through the HTTP routes of one breakpoint run; an ordinary run's wire snapshot
is covered by the internal projection, which `snapshotOf` passes through
unchanged. A resume without text is not exercised in the HTTP tests; its entry
projects `message: null` from the absent optional field. No interrupted
exchange is exercised through the intervention list; `debugResult` already owns
that status and its tests cover it. No configured audit ran in this iteration.
