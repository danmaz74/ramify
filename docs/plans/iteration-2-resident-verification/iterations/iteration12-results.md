<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 12 results: process controls and missing lifecycle prerequisites

**Recorded:** 2026-09-11. **Status:** incomplete. Process signal, suspension, observation and cleanup support is implemented and verified on Linux. The remediation also prepares nine independent F project copies and verifies their isolation and cleanup. The real resident lifecycle suite cannot run because its predecessor providers are absent. No I2-18 or I2-27 instance is credited.

Work was performed in the authoritative checkout /tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification-iter-12, on branch workflow-iter/iteration-2-resident-verification/12, starting at b20455d. All edits and git operations remain in this checkout.

## Prerequisite evidence and scope

Read CLAUDE.md, the iteration-work and testing skills, development guides, iteration 12, predecessor 8–10 handoffs, the process/memory/quick-testing architecture, and the reviewed lifecycle contracts and budgets. Worktree preparation installed the independent example and site dependencies successfully.

The live workflow marks iteration 10 accepted, but its own results identify incomplete providers. Current source and a fresh build confirm these missing paths:

- src/daemon-entry.ts and dist/src/daemon-entry.js;
- subs/daemon/src/connect-daemon.ts and subs/daemon/src/start-daemon.ts;
- src/resident-assembly.ts and subs/cli/src/watch-command.ts.

The underlying incremental operations, context manager and complete service/connection interfaces are also absent. There is no separately importable client package entry. Current daemon vocabulary, codec/discovery primitives and context token/history helpers do not implement that service.

A traced run of the actual compiled CLI confirms watch, daemon status and daemon stop each exit 2 with a ramify.cli/1 invalid-invocation document stating that the resident service is not implemented. The default check still executes batch analysis, with no socket connection or daemon startup. Publication of prior partial work does not establish a resident prerequisite.

Implementing the missing predecessor owners would exceed this iteration's integration scope. No alternate daemon, substitute service, duplicated public contract, capability registration or passing lifecycle handler was introduced. Production source, package entries, model rules and reviewed plan gates are unchanged.

## Implemented process support

Added src/tests/lifecycle-process.ts, alongside the existing root process helper. Its withProcessScope function supports multiple concurrent Node entries or installed executables using the existing process-probe.mjs preload.

- Every scope owns a short, mode-0700 temporary endpoint directory and trace. Descendants inherit the same endpoint and instrumentation.
- Live controls expose stdout/stderr, stdin writes, SIGSTOP, SIGCONT, SIGINT and SIGKILL, bounded output observations and bounded exit waits.
- The existing trace retains socket listen/connect, module loads, process starts/spawns and actual exits. SIGKILL is not converted into a graceful exit or a daemon stop reason.
- Output capture and ordinary trace reads have 40 MiB limits; each process has a caller-supplied lifetime deadline. Product recovery/idle/shutdown budgets were not changed.
- Teardown tracks spawned descendants, including detached children and grandchildren. It resumes suspended processes and terminates leaves before parents, observing reaping instead of relying on a fixed sleep.
- A successful callback that leaves processes alive fails even if teardown subsequently kills them. Callback failures are preserved; trace and cleanup failures remain visible. Complete malformed trace lines fail evidence while retaining later valid descendant identities for cleanup.
- Cleanup observes pid liveness and process closure, removes the endpoint directory on every path, and has a five-second primary deadline with a separate bounded emergency cleanup path.

Added a clearly identified process-control fixture, nine shared assertion cases, their Vitest wrapper, and scripts/reference-harness/lifecycle-process-smoke.ts. The direct smoke executes the exact same case bodies as the nine new Vitest tests. The fixture implements no Ramify service. The harness README documents usage, limits and missing resident evidence.

The helper uses Node POSIX signals and process.kill(pid, 0), with no /proc inspection or GNU-only command flags. Linux execution is established; macOS execution is not.

## Focused process evidence

The final direct smoke passed all nine case bodies on Linux, Node v22.23.2:

| Case | Independent assertion |
| --- | --- |
| Suspension, resume, socket peers, interruption | A marker sent after SIGSTOP is absent while suspended and delivered after SIGCONT; actual concurrent Unix peers are traced; SIGINT exits 130 and removes the listener. |
| Abrupt kill | Actual termination signal is SIGKILL, the pid is gone, and the fixture has no invented graceful exit event. |
| Orderly detached-child release | The child is independently observed alive, then reaped after interruption, with a child-close trace. |
| Failure during suspension | The original callback error survives cleanup of a suspended root, suspended detached parent and detached grandchild; all observed pids disappear. |
| Successful callback with a leak | A live process family causes an explicit failure even though cleanup subsequently reaps it. |
| Malformed evidence | A malformed complete trace line fails the scope; valid later descendant identities still permit cleanup. |
| Missing output | The named 40 ms observation fails and its running fixture is removed. |
| Process lifetime | A 200 ms child deadline fails explicitly and leaves no live fixture. |
| Failed executable launch | ENOENT is reported and the owned endpoint is removed. |

These are process-control mechanics, not the daemon's 20-second recovery, 5/7-second stop, idle lease, disposal or eviction evidence. The fixture timing limits do not replace any product timing requirement.

## Verification

| Command | Result |
| --- | --- |
| npm run worktree:prepare | Passed; example and site dependencies installed. |
| npm run build | Passed. |
| npm run type-check | Passed all four configurations after the final helper changes. |
| npx tsx scripts/reference-harness/lifecycle-process-smoke.ts | Passed all nine shared case bodies, including failure-path cleanup. |
| npx tsx .reference-work/iteration12-current-build.ts | Passed the current-build observations: unavailable compiled resident commands and a real eleven-owner batch self-check; private endpoint and all observed processes removed. |
| node dist/src/cli-entry.js check --root . --format json, inside that isolated wrapper | Exit 0; completed, passed, complete coverage; 11 owners, 182 source files, 11 resources, 2,084 accesses; zero errors, warnings, denials and coverage notes. No daemon or socket operation. |
| npm run reference:verify -- --plan 2 --iteration 12 | Exit 1: 152 required, 6 passed, 0 failed assertions, 146 required not executed. Across all 176 records, 170 not executed includes 24 future instances. |
| npm run reference:report -- --dry-run | Passed inventory reporting; lifecycle unavailable, 13 instances unexecuted. |
| git diff --check | Passed. |

The gate requires iterations 1–10 and 12. The six passes are the existing four harness controls and two entry-boundary witnesses. All 13 iteration-12 cases remain not-executed with missing-capability; the other 133 required unexecuted cases are predecessor obligations.

The unqualified reference:report runs the full Plan 1 runtime including Vitest/Cucumber regression tiers. It was not run locally because the supplied check policy reserves regression runners to automation; --dry-run is explicitly inventory-only. No Vitest/Cucumber regression, scenario-coverage or sealed-file check was run. The nine new test bodies passed via the direct focused runner; the workflow's Vitest verdict is separate and pending.

Ignored, local evidence:

- .reference-work/iteration12-process-smoke.json;
- .reference-work/iteration12-current-build.ts and iteration12-current-build.json;
- .reference-work/iteration12-plan2-gate.log and iteration12-plan2-gate-final.log;
- .reference-work/iteration12-reference-inventory.log;
- .reference-work/reports/plan2-iteration12-37125425-b8dd-4604-a86e-7f49a007a998.json.

The portable gate report includes the source/build identity, including new untracked source bytes at execution time. These local evidence files are not committed; the focused runner and all assertion bodies are committed and reproducible.

## Remaining exit criteria

All named cases below still require real compiled daemon and installed-client evidence:

- I2-18: idle-exit, restart-after-idle, crash-recovery, explicit-stop, missed-stop-notification, new-command-after-stop, watch-lease-prevents-idle, incompatible-bounded.
- I2-27: watch-exit-releases, command-exit-releases, idle-disposal-releases, eviction-under-many-contexts, reconnect-after-crash-live.

Outstanding work includes the real lifecycle handlers and lifecycle capability activation, daemon --budgets startup, compiled watch/check SIGKILL fixtures, suspended watch across explicit stop, foreign-protocol rejection, bare idle direct connection, real ordered lease release across the prepared nine F copies, record/status/liveness observations, installed executable and direct-client recovery, and assertions of every fixed product timing bound. No daemon-lifecycle leak guarantee or Linux/macOS suite pass is claimed.

For idle disposal, preserve the current reviewed distinction: retained products, watchers and helpers reach zero at the cold transition; published history remains until eviction, when history reaches zero. Do not substitute the older shorthand that would require history zero immediately at cold transition.

## Checklist and handoff

- functionalRequirementsSatisfied: false. The required resident providers and all 13 real lifecycle witnesses are absent.
- newCodeCoveredByTests: true. The process controls have nine shared assertion cases; the nine-project allocator adds three shared cases. Both sets have discovered Vitest wrappers.
- allNewTestsPass: true for the nine process-control case bodies from the initial Linux run and the three fixture case bodies from the remediation's final Linux run. The automation-owned full Vitest/Cucumber regression verdict and macOS evidence remain pending.

Both managed deliverables are written through workflow MCP, followed by a code commit in the authoritative branch and draft submission. This is an incomplete checkpoint, not iteration-12 acceptance evidence.

## Recommendations for Next Iteration

Restore the predecessor capabilities in their owning tasks: incremental/project resolution, context manager, shared service/root assembly, lightweight connector, host/daemon entry, then resident CLI commands and final client entry. Resolve any outstanding contract review through the owning workflow; this iteration revises no contract.

Resume iteration 12 only against those real public providers. Use these process controls for the signal/concurrency portions, obtain stop reasons from the production goodbye/record contract, assert lease/history/status counters and fixed timing limits, and run all 13 Linux cases plus the required macOS suite before Plan 2 acceptance. Iteration 14 must cite actual lifecycle evidence, not this fixture smoke or an accepted publication of this checkpoint.

## One self-assessment remediation attempt

**Recorded:** 2026-09-11T09:10:05.680Z. This focused attempt started at 9ec6ac0 in the same authoritative checkout and branch. The supplied self-assessment finding concerns functionalRequirementsSatisfied only.

Re-read iteration 12, the original check policy and the iteration-work/testing skills. Rechecked the current service/context/daemon interfaces, source inventory, CLI dispatch guard, package exports and Plan 2 runtime. The incremental engine/context manager, complete service, connector, host/daemon entry, resident assembly and watch handler remain absent. There is still no client package export. No supplied new-test failure or automated regression verdict changes that prerequisite state.

### Focused change

Implemented the project-input portion of deliverable 4 in scripts/reference-harness/fixtures/plan2/lifecycle.ts. withLifecycleProjects(workRoot, run) creates exactly nine independent F roots in stable opening order, using the existing frozen createProjectFixture recipe and runIsolatedProject lifetime. It passes the roots to the caller, returns the callback value, preserves callback errors and removes the exact owned run directory after success or failure. Overlapping invocations under the same work root remain independent. Caller-owned files are preserved.

This completes nine-project materialization only. It acquires no lease, opens no service context, observes no daemon counter and makes no eviction claim. Real service calls and ordered lease release still belong to I2-27:eviction-under-many-contexts after the provider chain is implemented.

Added three shared assertion cases, a reference-harness Vitest wrapper, a focused direct runner and README usage notes. The cases assert:

1. Exactly nine canonical roots in stable order, complete unchanged F files before mutation, independent first/ninth project edits and removal after success.
2. Two overlapping nine-project scopes produce 18 distinct roots, isolate changes and preserve the outer scope when the inner scope closes.
3. Callback failure preserves the original cause and removes all nine projects, including callback-created files; the caller's work directory and sentinel survive.

### Verification for this attempt

| Command | Result |
| --- | --- |
| npx tsx scripts/reference-harness/lifecycle-fixture-smoke.ts, initial run | Two cases passed; the first failed because the new test passed basename directly to Array.map, which supplied its numeric index as basename's optional suffix. Preserved in .reference-work/iteration12-fixture-repair-smoke.json. |
| Same focused command after correcting the callback | All three shared case bodies passed on Linux, Node v22.23.2. Preserved in .reference-work/iteration12-fixture-repair-smoke-final.json. |
| npx tsc -p scripts/reference-harness/tsconfig.json | Passed for the changed harness scope and its new tests. |
| git diff --check | Passed. |

The initial test error was corrected; no failing new focused case remains. The nine earlier process-control cases were not repeated because their code and dependencies did not change. Production build, toolkit self-check, full matrix and inventory report were not repeated for these fixture-only additions. The previous gate remains historical evidence: 6/152 required passed, 146 required unexecuted, including all 13 iteration-12 lifecycle instances. Runtime registration and provider availability are unchanged.

No Vitest/Cucumber regression, scenario-coverage or sealed-file check was run locally, per the original automation-only policy. Direct execution covers the same three case bodies registered by the new Vitest wrapper; it is not a verdict from that full runner. macOS evidence remains absent.

### Current state and disposition

functionalRequirementsSatisfied remains false. The integration-only scope cannot supply the missing predecessor analysis, contexts, complete service, client, daemon host/entry and resident CLI implementations as a focused suite repair. All 13 real lifecycle cases, the actual nine-lease eviction run and every daemon timing assertion remain unexecuted. The fixture work is preparatory evidence only and receives no matrix credit.

newCodeCoveredByTests and allNewTestsPass remain true for the implemented additions and their explicitly recorded direct-run evidence: nine original process-control cases plus three new fixture cases. Full automated regression and macOS acceptance remain separate obligations.

Both managed deliverables are updated through workflow MCP, and the fixture changes are committed in the authoritative branch. No publish_iteration_draft call is made in this remediation; validation and subsequent publication belong to the workflow. The original provider-restoration recommendations remain the necessary next step, with this partial completion available for the user's reviewable finding.
