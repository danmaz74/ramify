# Qualified native boundaries

The exact registry is [root testing data](../../../src/tests/test-boundaries.json).
Public discovery on the qualified source selects 282 files: 217 ordinary Node, 17 ordinary web and 48
native files. [The final inventory](final-configured-files.json) records every
selected file, its nearest module owner, treatment, cases and configuration
hashes. Imports and suffixes do not decide membership. All registered owning
case references match collected titles, except the two explicitly conditional
fixture trials whose existing skip provenance is retained.

Mixed families were split across cuts1–12. Native source, index, Git object,
installed provider/materializer/CLI and kernel/process claims remain actual.
The automatic guard driver is itself native because its claims require actual
configured Vitest children, including deliberately failing ordinary sentinels
that launch no Git. Its children are isolated fixtures outside normal discovery.

| Exact file | Required native claim |
| --- | --- |
| `subs/harness/subs/evidence/src/tests/git.test.ts` | Git object, branch, commit, trailer and failure behavior |
| `subs/harness/subs/evidence/src/tests/candidate-tree.test.ts` | Native Git candidate object bytes and index isolation |
| `subs/harness/subs/evidence/src/tests/scratch-git.test.ts` | Native Git index and effective ignore rules |
| `subs/harness/subs/evidence/src/tests/provisional-git.boundary.test.ts` | Native staged paths and object reads |
| `subs/harness/subs/evidence/src/tests/project-boundary.test.ts` | Installed CLI project-root and package boundary behavior |
| `subs/harness/subs/evidence/src/tests/run-command.boundary.test.ts` | Actual command streams, exit, timeout, process-group cleanup and wrapper signals |
| `subs/harness/subs/audit/src/tests/audit-conformance.test.ts` | Published audit SDK producer, reports, Git refs, cancellation and recovery conformance |
| `subs/harness/subs/audit/src/tests/workspace-preparation.boundary.test.ts` | Committed provider definitions, private object bundle and native environment projection |
| `subs/harness/subs/audit/src/tests/test-lock.boundary.test.ts` | Actual private kernel-lock contention, expiry and cancellation |
| `subs/harness/src/tests/capability-acceptance.boundary.test.ts` | Composed actual Git, test failure, repair, review and handback |
| `subs/harness/src/tests/capability-dependencies.boundary.test.ts` | Actual accepted dependency commits and produced tests |
| `subs/harness/src/tests/capability-delegation.boundary.test.ts` | Actual composed delegated module creation and commits |
| `subs/harness/src/tests/write-guard.boundary.test.ts` | Actual shell writes and native Git candidate protection |
| `subs/harness/src/tests/measurement.boundary.test.ts` | Installed measurement and command adapters over actual project files |
| `subs/harness/src/tests/capability-recovery.boundary.test.ts` | Actual Git commit idempotency and crash/recovery object history |
| `subs/harness/src/tests/nonfunctional-run.boundary.test.ts` | Actual audit and accepted Git tree for composed nonfunctional work |
| `subs/harness/src/tests/readiness.boundary.test.ts` | Actual output reuse, owned workspace cancellation and Git scratch lifecycle |
| `subs/harness/src/tests/hook-checks.boundary.test.ts` | Actual executable timeout and observed child disappearance |
| `subs/harness/src/tests/writer-settlement.boundary.test.ts` | Actual process group liveness and late writer settlement |
| `subs/harness/src/tests/shell-tool.boundary.test.ts` | Actual shell output, bounds, timeout and descendant settlement |
| `subs/harness/src/tests/single-session.boundary.test.ts` | PB3-S04 actual permitted shell mutation versus protected candidate |
| `subs/harness/src/tests/audit-check-execution.boundary.test.ts` | Actual configured provider runner truth, reuse and publication |
| `subs/harness/src/tests/audit-workspace-recovery.test.ts` | Actual owned Git workspace lifecycle, crash and recovery |
| `subs/harness/src/tests/test-lock-gate.test.ts` | Actual private kernel holder and harness gate wait/cancellation |
| `subs/harness/src/tests/late-writes.test.ts` | Actual process writer lifetime and gate settlement |
| `subs/harness/src/tests/unguarded-write.test.ts` | Actual shell mutation and guarded candidate check |
| `subs/harness/src/tests/plan21-workflows.integration.test.ts` | Actual installed nested partial/full gates and scoped architect workflow |
| `subs/harness/src/tests/run-git.integration.test.ts` | Actual commit recovery, unchanged commits and producer composition |
| `subs/harness/src/tests/project-boundary-audit.integration.test.ts` | Actual nested producer discovery, recovery and cancellation |
| `subs/harness/src/tests/fixture-check.test.ts` | Installed checker validates fresh target fixture |
| `subs/harness/src/tests/requirement-architect-view.test.ts` | Installed materializer generates architect fake/real symbol evidence |
| `subs/harness/src/tests/integration-scenarios-integration.test.ts` | Installed checker accepts ancestor imports only through declared exposure |
| `subs/harness/src/tests/module-creation-integration.test.ts` | Installed materializer refreshes created module architectural evidence |
| `subs/harness/src/tests/iterations-integration.test.ts` | Actual installed CLI, public provider and Git accepted gate objects |
| `subs/harness/src/tests/single-session-integration.test.ts` | Actual shell and completion command session |
| `subs/harness/src/tests/run-protocol-materialization.integration.test.ts` | Installed materialized placement views and unchanged native Git status |
| `subs/harness/src/tests/iteration-gate-integration.test.ts` | Actual failing test, repair and accepted Git checkpoint |
| `subs/harness/src/tests/review-snapshot.integration.test.ts` | Actual audited Git objects versus subsequently changing live files |
| `subs/harness/src/tests/check-findings-composition.integration.test.ts` | Actual audited trees and revision-grounded checks |
| `subs/harness/src/tests/fixture-trials.test.ts` | Existing opt-in live fixture trial workflow (two optional skipped cases) |
| `subs/harness/subs/ledger/src/tests/killed-writer.test.ts` | Actual killed ledger writer and crash-safe durable recovery |
| `src/tests/session-command.test.ts` | Actual production CLI session input/output and termination |
| `src/tests/test-boundaries.integration.test.ts` | Actual configured Vitest worker guard, bypass and discovery controls |
| `subs/harness/src/tests/breaking-work.boundary.test.ts` | Breaking feature green boundaries and unauthorized shell writes |
| `subs/harness/src/tests/engineer-api-preparation.boundary.test.ts` | Installed materializer source-area refresh and descendant API generation |
| `subs/harness/src/tests/recorded-environment.boundary.test.ts` | Actual child environment observation |
| `subs/harness/src/tests/lock.boundary.test.ts` | Kernel lock holder identity and takeover |
| `subs/harness/src/tests/contract-delegation-integration.test.ts` | Consumer tests enforce delegated provider conformance |

Full audit observations and their counting limits are in [final-process-evidence.json](final-process-evidence.json). The optional fixture workflow remains optional; the complete configured audit preserves its two skipped cases. No skip was added by this plan.
