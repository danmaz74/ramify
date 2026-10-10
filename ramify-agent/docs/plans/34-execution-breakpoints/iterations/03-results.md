# Iteration 3 results: CLI attachment

[Iteration](03-cli-attachment.md) · [Acceptance](../acceptance.md)

Implemented in source commit `22c7f893734fc303edde6e8cdf3dca5491ee07e3`,
based on accepted iteration 2 handoff
`1d768f28bdca87b603d970c3d5de0373efd2309b` (implementation
`147b71de5e66ac107255f5c83c7558f32e95ac79`). Work used branch
`feat/plan34-breakpoints-implementation` in the isolated checkout
`/home/app/ramify-plan34-breakpoints-implementation`. This receipt is a
subsequent documentation-only commit. Other checkouts were preserved and
nothing was pushed.

## Delivered behavior

The existing `real-session` launcher accepts attachment using explicit
`--project`, `--plan`, `--server`, `--break before-agent:engineer` and
`--command-id`, with optional `--json` and `--timeout-ms`. It compares canonical
project paths before command admission and uses the model configured by the
live server. Attached `--model`, unsupported selectors, duplicate or unknown
options and missing identity are refused. Attachment takes a separate branch
before fixture preparation or server startup/cleanup; it never spawns or kills
a server. The original owned-server/fixture launch remains available without
`--server`; breakpoint/control options require attachment.

The root entrypoint supports `debug inspect`, `message`, `resume` and `wait`.
All require server, plan and run. Inspect requires a pause ID. Message/resume
require pause ID, expected interaction revision and stable command ID; message
requires a UTF-8 message file, while resume accepts one optionally. Wait accepts
an event cursor. Argument parsing and live transport are separate from server
ownership, through injectable HTTP, clock and file boundaries.

Message submits through the existing HTTP command handler, which returns its
persisted admission immediately with status 202. The CLI then polls the
retained exchange result. Identical retries recover the original admission and
settled result; changed content conflicts. Resume acknowledges release after
admission and reading current state, without waiting for the next boundary.
Wait drains every retained event page before polling or returning an already
reached pause/terminal result. Each finite wait defaults to 120000 ms; each
request is bounded by the remaining wait and at most 10000 ms. Client timeout,
transport failure and exit send no cancellation command.

Historical reached pauses, exchange results and resume receipts are presented
separately from `current` interaction state and the current run snapshot. The
result includes current human-readable interpretation even when the retained
result names an earlier revision or occurrence. A historical pause cannot be
used as permission to mutate the current one. Exchange output includes the
answer, actual outcome/verdicts, session/point/invocation correlation and
retained evidence references.

JSON stdout contains one result object; diagnostics go to stderr, including
parse failures. Exit status 0 means a successful control return, 1 an
unsuccessful terminal run and 2 invalid/refused input, transport failure or
wait timeout. A settled rejection verdict in an unfinished run remains data
with exit 0. Error results retain known plan/run/pause/revision/command IDs,
last cursor, current state and admission receipt when available; uncertain
transport/timeout results instruct the caller to retry the identical command.

CLI help and README include the executable live-server scenario, message-file
usage, current-versus-historical identities, explicit implementation instruction
after explanatory chat, server lifetime, timeout and retry behavior.

## HTTP and output contract

The original `/api/v1/commands` shape and 202 receipt are unchanged. New
read-only paths are exposed through `protocolPaths`:

- `GET /api/v1/plans/:planId/runs/:runId/debug?after=<cursor>` returns
  `{ run, current, reached, cursor, more }`. `reached` reconstructs historical
  usable pauses from durable boundary events within the ordinary event page;
  page size/cursor/more use the existing projection limits. `current` is the
  live occurrence or null after release/stop/terminal progress.
- `GET /api/v1/plans/:planId/runs/:runId/debug/inspect?pause=<pauseId>` returns
  `{ run, current, inspection }`, with the iteration 2 preview unchanged.
- `GET /api/v1/plans/:planId/runs/:runId/debug/exchanges/:commandId` returns
  `{ run, current, exchange }`, with null for an unknown exchange and the
  durable admitted/settled/stopped/interrupted result otherwise.

The CLI spreads inspection/exchange/historical breakpoint fields into its
result and adds `current`, `run` and `currentSummary`. Resume returns
`kind: "resumed"`, requested identity, receipt, current state, run and cursor.
Terminal waits return `kind: "terminal"`. Errors return `kind: "error"`,
known identity, cursor, state, structured error and uncertainty. All queries
remain plan-scoped and invoke no model or durable mutation. Existing protocol
schemas/web readers remain compatible; new envelopes are additive.

## Verification

The coordinator's exact clean baseline audit is recorded in
[iteration 1's receipt](01-results.md). No whole suite, configured full audit,
registered native witness or authenticated provider call ran in this iteration.

Final checks ran from the isolated checkout's `ramify-agent/`:

```sh
npm run test:quick -- src/tests/cli.test.ts src/tests/debug-client.test.ts subs/harness/src/tests/execution-breakpoints-http.test.ts subs/harness/src/tests/http.test.ts subs/harness/src/tests/execution-breakpoints-conversation.test.ts subs/harness/src/tests/execution-breakpoints.test.ts subs/harness/src/tests/union-values.test.ts
npm run type-check
npm run check:self
git diff --check
```

All exited 0. Focused guarded tests passed **7 files and 110 tests**, with no
failures or skips. Exact run process-guard receipts for this cwd and the
2026-10-10 19:14:17–19:14:31 UTC window cover all seven files, with zero native
files, allowed launches or refused attempts. Type checking passed the four
project-declared configs. The module check completed all stages with 13 owners,
756 source files, 65 resources and 15,335 accesses; zero errors/warnings and
**partial coverage with 352 analysis limits**. Outputs are retained locally at
`/tmp/plan34-iteration03-focused.txt`,
`/tmp/plan34-iteration03-typecheck.txt` and
`/tmp/plan34-iteration03-check-self.txt`.

B12/B13 client witnesses cover explicit attachment, canonical match/mismatch,
model/option conflicts, legacy parsing, retained pages with already-reached
historical pauses/current later occurrences, lost replies and identical retry,
actual verdict/evidence presentation, immediate resume acknowledgement, finite
wait timeout/cursor, terminal exit status and stdout/stderr separation. The
real in-process HTTP handlers and run service additionally exercise B11
admission before a blocked model completes, exact receipt retries, changed
payload conflict, concurrent/stale refusal, continued preview, settled answer,
resume once, historical reads after release and wrong-plan refusal. Initial
local test fixture expectations for review state and the concurrent `busy`
error were corrected before final checks; no implementation defect or flaky
case was concealed. External process/provider operations remain scripted.

## Successor handoff

Iteration 4 can execute the documented entrypoint and attached launcher against
the independently hosted real server. It owns native separate-process lifetime,
Pi session history/enforcement evidence, combined workflow qualification and
the exact final candidate full audit. The actual useful-project exercise and
responsible semantic assessment remain required; client mocks and in-process
handlers do not establish those claims. The coordinator reserved a separate
real-work target concerning duplicate `serve --project`; this iteration leaves
that existing parser behavior unchanged.

No plan/model/principles status was changed. There are no known blocking
iteration 3 failures; the entire supported scenario is wired to the actual
control handlers, with native/authenticated qualification still pending.
