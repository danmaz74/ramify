# Iteration 1: pause lifecycle

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and boundary

R34-1/R34-2 are resolved: pause the whole run; server loss interrupts it.
Start from an isolated clean committed checkout with a baseline configured full audit.
Plan 30's shared runner is present; Plan 31 is not a prerequisite.

Owner: harness run orchestration, shared runner boundary, review scheduler,
deadline accounting, protocol/record schemas and their tests. The ledger child
remains the durable writer; reuse its current API. No Pi driver or UI work.

## Deliverables

- Capture and validate the one supported selector in start-run inputs.
  Preserve no-selector behavior and legacy records.
- Park the prepared engineer request before dispatch for ordinary, repair and
  capability-task invocations. Give each occurrence a stable ID and revision;
  publish meaningful location/next-action information.
- Implement whole-run admission, settlement and deadline policy. Add
  reversible review admission control which
  also suppresses expiry/overflow and completion-triggered wakeups.
- Implement in-process inspect-state, resume and stop admission with command
  deduplication. Resume without discussion executes the ordinary request once.
- Record pause/control transitions through existing ledger conventions. Add the
  chosen server-loss behavior before recovery can replay effects or resume
  ordinary, capability or nonfunctional workflows. Cover unfinished debug-enabled
  runs before their first pause and after resume as well as while paused;
  preserve ordinary-run recovery.
- Update the harness specification's control and lifetime contract to the
  resolved decisions. Do not generalize a plugin registry or arbitrary hooks.

## Verification and exit

Own B01–B04, B14 and B15. Use controlled clocks and deferred scripted operations
to expose settlement, resume/stop and queue races. Ensure the barrier waits
outside invocation cleanup and no writer lease survives an idle pause.
Run focused `npm run test:quick -- <files>`, `npm run type-check` and
`npm run check:self` from `ramify-agent/`.

Handoff: an in-process run pauses and resumes safely without conversation,
ordinary runs retain their behavior, and the chosen server-loss policy is
executable. Commit and record evidence and affected contracts in `01-results.md`.
