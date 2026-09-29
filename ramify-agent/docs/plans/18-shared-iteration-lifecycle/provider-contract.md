# Provider contract and evidence inventory

[Plan 18](main-plan.md) · [Acceptance](acceptance.md)

**Status:** inspected baseline plus required integration contract; no new API is
claimed to exist. Inspected 2026-09-29 against installed ramify-audit **0.3.0**
and provider commit `2e6f6cecf80dcc52ac2530aca095a8a097acf6ad`.

## Existing public surface

The installed package's `dist/index.d.ts` exports `createAuditService`, `runAudit`,
`readEvidenceSummary`, `readRawCheckResults`, `createCheckResultArtifactStore`,
the registered-executor bridge, process execution and machine-lock ports, and
their contracts. Use public exports only. Provider source lives in the separate
`/ramify-audit` repository; it must be released and pinned before adoption.

| Data/capability | Existing contract | Consumer obligation |
| --- | --- | --- |
| Completed audit | `AuditResult`: `summary`, `refs`, `retrievalCommands`, optional `reused`, `composition` | Preserve complete result, producer version and exact report/source identities. |
| Applicable verdict | `AuditComposition.verdict`, `scoped`, `chainDepth`, `reportCommit`, optional `rootReportCommit`, `outstandingFailures`, `reason` | Consume directly. `summary.overall` is run-local and cannot replace composition for partial audits. |
| Individual results | `AuditCheckSummary.commands`, `failedTests`, `failedSuites`, `warnedSuites`, `failedScenarios`, `counts`, `runnerError` and details | Retain the provider's fields and meanings; do not infer an empty list or total when absent. |
| Test diagnostics | `FailedTestDetail`: identity, file/name, optional full/stable identity, locations, tags, retry/repeat, `errorShort`, `errorFull`, annotations, flaky metadata | Deliver the complete relevant diagnostic; a short error must not silently replace available full evidence. |
| Scenario failures | `FailedScenarioDetail`, failing steps, statuses, error messages | Use provider runner facts; link them to harness scenario identities separately. |
| Output and qualification | `output`, `outputRef`, `outputBytes`, `outputTruncated`; command results also expose `outputIncomplete` and `termination` | Keep available full artifacts and all qualification. Test whether conversion to published summaries preserves each needed field. |
| Mode and selection | Schema-v3 `mode`, `coverage`, `definitions`, optional `noExecution`; provider partial-selection artifacts | Distinguish executed, reused, inherited and not selected. A no-execution link is not an executed passing suite. |
| Outstanding test evidence | Optional schema-v3 `failureLedger`, producer completeness and typed identities; composition carries the verdict | Use provider composition and evidence. Do not build another cross-attempt tally or infer repair ownership. |
| Artifact recovery | `readEvidenceSummary` and `readRawCheckResults` read published evidence; `createCheckResultArtifactStore` persists/hydrates in a caller-selected local directory | Distinguish published artifacts from local artifacts. The local store does not publish them or ensure survival after cleanup. Prove retention of every referenced full diagnostic at its exact report identity; do not chase mutable latest refs. |
| Cancellation and audit failure | Other `AuditResult` branches and execution events | Preserve reason/error and any evidence actually available, without inventing completed check results. |

Primary local references: installed `node_modules/ramify-audit/dist/contracts.d.ts`
(result contracts near lines 78–190, ledger near 230–325, schema v3 near 499–516,
composition near 543–560, completed result near 1092–1118), and `dist/index.d.ts`.
These are version-specific inspection locators, not repository imports.

The existing adapter at `subs/harness/subs/audit/src/check-execution.ts` returns
mostly mapped command records, audited commit, refs and `auditOverall`; it loses
much of the richer provider result. Its registered executor constructs a limited
summary from harness command records. Merely copying additional optional fields
does not make those fields appear: contract tests must prove that actual native
or registered test execution invokes the provider's supported reporter pipeline.

## Required contract review before implementation

Iteration 1 identifies the required signatures and integration decisions.
Iteration 2 must settle each row below with an existing public operation and
executable conformance evidence, or an explicit provider-owned extension. Record
the accepted API signatures, fields, release and tests here. The table is not a
license to implement a parallel capability in the harness.

| Need | Current evidence and required decision |
| --- | --- |
| Dirty focused checks, readiness and standalone sessions | `createNodeProcessExecutor` already executes commands without commit/publication and returns raw exit, stdout/stderr, duration and termination facts. `PortableCheckRegistry` describes/selects checks but cannot execute them; the parsed check dispatcher is not exported. Expose the missing provider-owned parsed diagnostic execution seam using that existing machinery. `runAudit` certifies a source commit; `existing-worktree` requires selected revision equal to HEAD and does not certify dirty bytes. Do not commit merely to run a diagnostic or label dirty results as a HEAD audit. |
| Process lifecycle, environment and exact command outcome | Public native command specs provide command, arguments, environment additions, parser and timeout. `ProcessExecutionResult` already carries numeric exit code, separate stdout/stderr, duration and termination, while published command summaries do not promise all those facts. Audit events are check-level rather than command-level. Use the existing public process/event ports where sufficient; extend retention/access or lifecycle hooks only for required missing facts. Preserve the environment boundary, cancellation, registered process settlement and Plan 17's lock/bounds behavior. |
| Structured registered test results | `RegisteredCheckExecutor.testCommand` and the registered `testRun` exchange support provider reporter parsing/narrowing. Prove that Vitest and Cucumber executed through the chosen bridge return the same supported evidence as native execution. Remove hand-built boolean/tail summaries as the test-report authority. |
| Cucumber plan binding | Provider summaries contain runner failures and counts, but do not currently expose all raw envelopes/identities needed by the harness's tracked-scenario binding. Reporter streams are temporary. Require a durable provider artifact/access contract for necessary execution detail; harness retains frozen scenario identity and lifecycle associations, not a second runner-status reducer. |
| Ramify and type-check diagnostics | The generic command contract preserves output but has no `tsc` or Ramify parser kind. Preserve full producer command output and any upstream structured report as artifacts for the agent. No new parser is needed merely to replace the deleted location-attribution heuristic. Extend ramify-audit only if a required generic execution/artifact transport capability is missing; Ramify/type-check semantics remain with their producers and agent interpretation. |
| Complete long diagnostics and interrupted reports | Prove full diagnostic/artifact retrieval when compact summaries omit bodies, and preserve incomplete/absent evidence. A crash or malformed reporter must not appear as an empty clean suite. |

Retaining `AuditResult` alone preserves its returned summary, not every raw
runner artifact. Prove which full diagnostics are in published evidence, which
require hydration from the local artifact store and which are currently lost
when temporary reporter files are deleted. A required missing retention path is
a producer contract gap. Store or publish the artifact before cleanup; verify
retrieval after both workspace and local temporary-store deletion.

## Adapter contract

The existing audit child owns the external dependency. Its parent-facing contract
references a retained complete provider result and exposes necessary facts with
the same meanings; it must not maintain a competing report/failure-ledger model.
Keep the current prohibition on external package types crossing that boundary.
Define minimal harness-owned access types during iteration 1, then inspect the
consumer's generated API view before wiring them. The mapping must be lossless
for returned data even when a field is not in a current UI projection.

For every execution mode record: supported provider operation, source identity,
publication status, selection authority, artifact retention, caller cancellation,
writer settlement, environment, suite/focused lock behavior and result delivery.
Do not use a new boolean to conceal an unsupported mode.

## Agent delivery contract

Deliver failures to the existing work owner. Provide the complete relevant
failure list and each diagnostic with its qualifications and provenance. Preserve
all provider data for on-demand access; do not preload unrelated successful
output or repeated history. The agent can request full reports/artifacts by their
exact identity. A failed retrieval is explicit, never an empty diagnostic.

Engineers diagnose and repair ordinary failures. Coordinators receive results
of work they already coordinate. Only an explicit agent need, a required
architectural decision or exhaustion of authorized attempts changes that
orchestration. No threshold on failure counts or path-based classifier chooses
repair ownership.
