# Iteration 3: CLI attachment

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and boundary

Iteration 2 complete. Owners: root CLI/main and real-session launcher; harness
HTTP commands, queries and exposed protocol contracts. The root consumes
legal harness exports. No direct imports of private runner or Pi source.

## Deliverables

- Add `real-session --server --break --command-id --json` with required explicit
  target project/plan, canonical project validation and clear model selection.
  Preserve legacy owned-server mode; do not spawn, kill or prepare a fixture
  when attached. Reject unsupported or conflicting option combinations.
- Add `debug inspect`, `message`, `resume` and `wait` at the existing CLI
  entrypoint, each naming the server, plan and run, with the plan's
  pause/revision, UTF-8 message-file, command ID, cursor, JSON and timeout
  options. Use existing HTTP hosting and command
  admission; add only necessary query projections.
- Implement short requests and polling. Return persisted command results after
  client disconnection; drain event pages before polling. A timeout reports
  uncertainty and stable IDs, not cancellation or permission to duplicate work.
- Give every breakpoint return a current human-readable summary. Include
  answer, actual submission verdict and evidence references after an exchange.
  Keep stdout machine-readable in JSON mode and preserve documented exit codes.
- Update CLI help and README with one working scenario using existing `serve`
  and `real-session`; clearly explain that the server must remain alive.

## Verification and exit

Own B12 and B13; rerun B11 through command/HTTP handlers. Ordinary tests call
handlers and injectable client logic in process with scripted external answers.
Cover lost replies, paginated events, an already reached pause, stale historical
receipts, timeout, canonical project mismatch and attachment/model conflicts.
Real process lifetime is qualified in iteration 4, not inferred from mocks.

Run focused guarded tests, type checking and module checks. Handoff: the entire
documented CLI scenario is wired to the real control handlers. Commit and write
`03-results.md` with the final command/output contract.
