<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 5 results: real daemon ports; shared service blocked by missing providers

**Date:** 2026-09-11. **Status:** incomplete. The filesystem watcher, system clock and independent lifecycle vocabulary are implemented. The prerequisite increment operations and context manager are absent, so the shared service, root assembly and quick environment cannot be implemented through their required public contracts in this iteration.

## Prerequisite and scope evidence

Work stayed in `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification` on `workflow/iteration-2-resident-verification`, starting at `99a3af6`. The pre-existing change to `iterations/iteration4-check-results.md` is a control-plane marker; it was preserved without editing or staging it.

Read CLAUDE.md, the iteration-work and testing skills, the development guides, the iteration 5 read-first contracts, scope, owners, quick-testing architecture, shared service boundary and predecessor handoffs. Ran `npm run worktree:prepare` successfully.

Live workflow detail reports iterations 3 and 4 completed with publication accepted and iteration 5 running. Source inspection independently establishes that:

- `subs/analysis/src/` has no `analyzeIncrement`, `resolveProject`, `IncrementRun`, `InputChange` or `RetainedAnalysis`.
- The project owner has no `resolveProjectRoot`, `ProjectResolution` or `RetainedConfiguration`.
- The contexts owner has tokens, controlled ports and standalone report history, but no `AnalysisDriver`, `ContextManager` or `createContextManager`. Its interface lacks the revision, status, event and outcome vocabulary needed by the service.
- `scripts/reference-harness/plan2-runtime.ts` registers only `harness-gate`, with neither `increment` nor `contexts`.

Iteration 5 consumes those providers; it does not own their implementation. A second manager in daemon, copied foreign types, batch substitution or fabricated service outcomes would violate the required ownership and quick-testing contracts. The absent providers prevent completing the service independently of the package documents' separately recorded pending architecture acceptance. Workflow publication does not establish either source capability or an architecture decision.

## Implemented independent work

### Real filesystem watcher

`subs/daemon/src/filesystem-watcher.ts` implements `createFilesystemWatcher(): WatcherPort` against the existing contexts-owned port.

The implementation follows the corrected arrangement in contracts.md and the iteration 1 watcher probe: recursively enumerate eligible directories and attach non-recursive native handles. It prunes `node_modules`, `.git`, `dist` and `.reference-work` at every depth before attachment and does not descend through directory symlinks. A single native recursive watcher with callback filtering would still attach inside those excluded trees.

The port:

- Emits frozen, root-relative, deduplicated batches in fixed 100 ms windows; continuous edits cannot indefinitely postpone a batch.
- Preserves native rename notifications as `renamed`, without guessing whether the operation created or deleted a path.
- Rescans membership after rename or unknown-name events, attaches new directories, closes removed handles, and replaces a handle when the directory at the same path has a different device/inode identity.
- Bounds ordinary pending paths at 10,000. Overflow discards the path queue and emits an explicit root-relative `overflow` signal; ordinary batching resumes after delivery.
- Emits `overflow` for unknown/invalid native names and `error` for watcher failures. Resource exhaustion emits both, preserving the unavailable-watcher signal for the future manager.
- Rejects failed initial attachment, closing earlier native handles. Idempotent asynchronous close drops pending events and the consumer listener, cancels the batch timer, waits for an active scan, closes all native handles and removes their listeners.

These events are hints. Periodic verification, synchronized captures, retry after watcher failure and publication remain unimplemented context-manager responsibilities. Native kernel overflow was not induced; the error and queue tests use explicit injected events.

### Real clock and vocabulary

`subs/daemon/src/system-clock.ts` implements `createSystemClock(): ClockPort`: wall-clock timestamps, nonnegative safe-integer durations, asynchronous scheduling and idempotent cancellation. Durations beyond Node's signed 32-bit timer range are split into successive supported waits rather than overflowing to one millisecond. Cancellation releases the retained callback and active timeout.

`subs/daemon/src/interfaces/daemon.ts` declares the exact independent subset from contracts.md: `DaemonInstance`, `LogEntry`, `DaemonBudgets`, `DaemonRecord`, `StopDisposition`, `Handshake` and `ConnectionState`. It defines no replacement context types and no service implementation.

Daemon's declaration activates the two implemented N1 port exposures and N4's interface wildcard over those seven types. Existing N5 remains unchanged. The owner README describes behavior, resource lifetimes and the remaining provider gap. Root R6/R8, N1's service exposure, N2 and the remaining N4 vocabulary are not activated.

### Owner tests and dependent declaration fixture

Added 20 Vitest cases:

- `subs/daemon/src/tests/watcher.test.ts`: 14 cases, counting the four invalid/unknown-name cases separately. Real filesystem cases assert nested edits, exact native attachment paths excluding subtrees and symlinks, new and replaced directories, and no delivery after close. Deterministic cases assert bounded batching, overflow, error preservation, cancellation, invalid roots and partial-attachment cleanup. Teardown checks native listeners and controlled timer counts.
- `subs/daemon/src/tests/system-clock.test.ts`: six cases covering timestamp/delivery ordering, cancellation, zero delay, long waits, cancellation between long-wait chunks and invalid durations.

The descriptions owner's exact toolkit declaration fixture now includes the daemon's three added exposure statements. This is the necessary dependent fixture update for the declaration change; exact ordering, statement/tag checks and the eleven-owner inventory remain intact. No parser implementation or assertion was weakened.

The owner tests were authored and type-checked, but their Vitest runner verdict is reserved to workflow automation. No new test failure was observed locally.

## Verification

| Command | Result and scope |
| --- | --- |
| `npm run worktree:prepare` | Passed; installed the independent example and site dependencies. |
| `npm run type-check` | Passed all four configurations after the final source changes, including both new test files. |
| `npm run build` | Passed after the final source changes. |
| `npx tsx .reference-work/iteration5-ports-smoke.ts` | Passed five direct owner assertion groups on Linux/Node v22.23.2: real nested edits and attachment pruning; directory replacement; bounded queue and injected resource error; awaited disposal; real clock scheduling/cancellation. All five native handles closed and had zero listeners afterward. |
| `npm run check:self` | Passed: completed execution, complete coverage, 11 owners, 158 source files, 11 resources, 1,887 accesses; zero errors, warnings, denials or analysis limits. Validates the implemented exposure subset. |
| `npm run reference:verify -- --plan 2 --iteration 5` | Failed, exit 1: 64 required, 4 passed, 0 failed assertions, 172 not executed overall. Required unexecuted records: 18 increment, 27 contexts, 15 daemon-service. The other 112 unexecuted records belong to future iterations. |
| `git diff --check` | Passed. |

The final build, smoke, self-check and gate followed the last cleanup change. The earlier smoke and self-check also passed. Direct smoke is owner evidence, not a Vitest result, quick-service evidence or an I2 matrix execution. No Vitest/Cucumber regression, scenario-coverage or sealed-file check was run locally, following the execution prompt's automation-only policy.

Evidence in ignored scratch space:

- `.reference-work/iteration5-ports-smoke.ts` and `iteration5-ports-smoke.json`
- `.reference-work/iteration5-self-check.log`
- `.reference-work/iteration5-plan2-gate.log`; its final line identifies the portable gate report

## Remaining exit criteria and checklist

All 15 instances of I2-01, I2-03, I2-04 and I2-13 remain unexecuted. No `daemon-service` capability or handler is registered. In particular, no cold revision, batch/resident equality, isolation, concurrent publication, request labeling or service validation/disposal outcome is established.

The complete root service interface, daemon validation and dispatch, leases, stop notifications and counters, complete service/connect/wire vocabulary, message codec, analysis driver assembly, quick environment and service/assembly tests remain absent. `WireMessage` depends on the missing contexts-owned `ContextEvent`; a partial union under that public name would misstate its contract.

The checklist records this checkpoint honestly:

- `functionalRequirementsSatisfied: false`: required providers, service behavior and all 15 quick instances are absent.
- `newCodeCoveredByTests: true`: implemented ports have 20 owner cases and the declaration change has its exact dependent parser fixture.
- `allNewTestsPass: false`: the new Vitest cases have no automated runner verdict yet. Passing direct smoke does not replace it.

The required managed results and checklist are submitted through MCP. Code is committed on this checkout's branch before draft publication. Submission of this incomplete checkpoint is not iteration completion.

## Recommendations for Next Iteration

Restore the providers through their owning workflow tasks: resolve iteration 3's recorded contract-review disposition, implement and expose real incremental analysis/project resolution, and pass its 18 instances. Then complete the contexts manager against those provider contracts and pass its 27 instances.

Resume iteration 5 after those providers exist. Wire the service and root driver through their actual public contracts, complete R6/R8 and N1/N2/N4 activation, use these real ports for production assembly and the existing controlled ports for the quick environment, and execute all 15 quick cases before treating `daemon-service` as available. Iterations 6 and 7 must not treat these ports or a passing self-check as an implemented quick service. macOS watcher behavior still needs execution on a macOS runner.
