# Iteration 1 results: pause lifecycle

[Iteration](01-pause-lifecycle.md) · [Acceptance](../acceptance.md)

Implemented the whole-run, live-server-only pause lifecycle. The implementation
commit is `70c2adbdadbbda06b6296dcde7a154d372f1b926`, based on
`f60a12de799b146228ed7b5f31184109fafb8102`, on branch
`feat/plan34-breakpoints-implementation` in the isolated checkout
`/home/app/ramify-plan34-breakpoints-implementation`. The checks below ran against
the final implementation files before that commit; this receipt is a subsequent
documentation-only commit. No push was performed. Concurrent checkouts and the
dirty `/ramify` worktree were excluded from the implementation baseline.

## Delivered behavior and contracts

- Start inputs and immutable run records capture the optional literal selector
  `before-agent:engineer`; unsupported values are refused, and absent fields
  preserve ordinary and legacy behavior.
- The shared orchestration boundary parks a prepared request before invocation
  admission or writer acquisition. It matches the actual `engineer`,
  `contract-engineer` and `nonfunctional-repair-engineer` role strings, including
  ordinary repairs and capability-task engineers. Each new request gets a new
  occurrence; internal runner context-loss fallback stays within that request.
- `RunService.debugState(planId, runId)` returns a detached, read-only state with
  the occurrence ID, revision, role, work, goal and next action. It exposes
  `pausing` before settlement and `paused` only after confirmed settlement.
- `debug-resume` uses the existing command ledger and the current pause ID and
  interaction revision. Exact retries return the admitted receipt; changed
  content conflicts. Admission acknowledges release without waiting for the next
  boundary. Ordinary stop remains authoritative during pausing and caller wait.
- The review queue has reversible suspension. It suppresses new attempts,
  expiry, overflow and completion wakeups, while already admitted orientation
  and review pipelines finish under their existing bounds. Remaining waiting
  deadlines gain the union of suspension time; expired work gains no budget.
- The settlement barrier waits outside invocation callbacks, run mutexes,
  writer leases and ledger transactions. Gates, readiness and invocation cleanup
  settle first. Confirmed outcome records and per-run session-operation barriers
  are checked explicitly, so an empty live map cannot conceal an unsettled reader.
  Failure retains its normal outcome and prevents a usable pause.
- Fully reached caller waiting is excluded from ordinary run age, overlapping
  review-stop and debugger waits count once, and settlement and model execution
  retain ordinary bounds. Resume checks captured documents and writer settlement;
  the runner then applies its existing source/session/authority checks.
- Debug transitions are durable `debug-pausing`, `debug-paused` and
  `debug-resumed` events. Existing projections and exhaustive union witnesses
  read them. Ordinary lifecycle snapshots remain unchanged.
- Startup interrupts every unfinished debug-enabled run before replay of pending
  effects, capability reconciliation or workflow restoration. This applies before
  the first pause, while paused and after resume. Invocation/session evidence is
  retained; ordinary runs keep their current recovery behavior.

The affected contract is documented in `docs/harness.spec.md`. Runtime changes
are confined to harness protocol, records/log, run orchestration, session barrier
tracking, review scheduling and event projections. There is no Pi driver or UI
change, and no new ledger writer API or run-wide timer.

## Evidence

The coordinator supplied a terminal configured full nested baseline audit for
the exact clean source `f60a12de799b146228ed7b5f31184109fafb8102`. Its invocation
and composition passed, all six checks passed, expected-file coverage was
complete at 328/328, and discovery and the failure ledger were complete with no
failures. Configured Vitest reported 327 passed files and one existing skipped
file; 2,956 tests passed and two existing tests were skipped. The skips are not
passes. This exact-source audit was reused; it qualifies the prerequisite source,
not the implementation commit.

Baseline evidence:

- Local JSON: `/tmp/plan34-breakpoints-implementation-baseline.json`.
- Report commit: `8e320f1080493e6f81b1bd9297beba4e3263d910`.
- Run ref: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-10T18-31-37Z-f60a12de7`.
- Coordinator baseline command exited 0. This iteration did not launch another
  full audit or directly run the whole test suite.

The following final checks ran from the isolated checkout's `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/src/tests/execution-breakpoints.test.ts subs/harness/src/tests/execution-breakpoints-capability.test.ts subs/harness/src/tests/nonfunctional-repair.test.ts subs/harness/src/tests/review-queue.test.ts subs/harness/src/tests/union-values.test.ts subs/harness/src/tests/workflow-session-store.test.ts subs/harness/src/tests/plan23-live-session.test.ts subs/harness/src/tests/review-stop.test.ts subs/harness/src/tests/run-bounds.test.ts subs/harness/src/tests/run-recovery.test.ts subs/harness/src/tests/review-scheduling.test.ts subs/harness/src/tests/review-questions.test.ts
npm run type-check
npm run check:self
git diff --check
```

All exited 0. The focused test run passed 12 files and 147 tests, with no skips
or failures. Type checking covered the project-declared four TypeScript configs.
The module check passed with 13 owners, 751 source files, 65 resources, zero
errors and zero warnings; it explicitly reported **partial coverage** and 346
analysis limits. Its local output is
`/tmp/plan34-iteration01-check-self.txt`. No complete static coverage is claimed.

The executable witnesses cover the iteration-owned lifecycle portions of
B01–B04, B14 and B15: prepared pause and no held writer, actual repair and
capability paths, active code/design review pipelines and queued successor,
unconfirmed reader/session settlement, expiry/overflow/timer/completion races,
overlapping suspension, expired budget refusal, caller-wait exclusion and resumed
model budget consumption, exact resume retry/conflict, new occurrence identity,
stop during pausing and paused, captured-document change refusal, reconnect
inspection without writes, and interruption before pending materialization,
gate commit or capability reconciliation. Existing ordinary review, run bounds,
recovery and session tests also passed in the focused group. The gate-crash
witness freezes at the attempted hook while the durable pending state is
`gate-committing`, before executing the commit effect.

## Successor handoff and limits

Iteration 2 must retain the prepared request and conversation/session state on
the occurrence, add effective-input inspection and bounded caller exchanges,
and hold accepted actions until explicit resume. The current runtime state has
reserved `exchanging` and task-state values, but this iteration publishes only
`pausing`/`paused` with a pending task. It does not implement conversation.

`callerPauseMs` currently recognizes `debug-paused` to `debug-resumed` intervals.
Iteration 2 must split caller waits around exchange execution so model/tool time
counts while review admission stays suspended. It must preserve the ordinary
missing-submission and context-loss semantics by default. Exchange-specific
portions of B03/B04 and B05–B11 remain that iteration's responsibility.

Iteration 3 owns HTTP/CLI attachment, receipts and polling. Iteration 4 owns the
combined workflow, final candidate configured audit, registered native witnesses
and separately recorded real-plan exercise. The 147 scripted focused tests and
baseline audit do not establish CLI/Pi process lifetime, native history, delivery
of a real target change, or full acceptance of Plan 34.
