<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 9 results: CLI grammar and batch migration; resident integration blocked

**Recorded:** 2026-09-11. **Status:** incomplete after the single self-assessment remediation below. The argument parser, batch display/migration and independent error adapter are implemented. The missing resident providers prevent the command integration and all 28 assigned matrix instances.

Work was performed in the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification`, branch `workflow/iteration-2-resident-verification`, starting at `41239a9`.

## Prerequisites and scope

Read CLAUDE.md, the iteration-work and testing skills, development guides, iteration 9 and its contract/ownership requirements, CLI invocation and process/quick-testing architecture, and the predecessor handoffs. Ran `npm run worktree:prepare` successfully.

Live workflow detail reports iterations 3–8 completed and published. Their handoffs and the current source establish a different implementation state: there is no `analyzeIncrement`, `resolveProject`, `createContextManager`, complete `RamifyService` or `DaemonService`, `WireMessage`, `ServiceConnector`, `connectDaemon`, `startDaemon`, resident assembly, daemon entry or `createQuickEnvironment`. Only independent vocabulary and primitives exist. The Plan 2 harness registers only `harness-gate`. Iteration 3's handoff also records its architecture-review disposition as pending; publication is not evidence that the missing providers exist.

These are concrete dependency gaps for the CLI's connection, synchronized checks, revision reads, subscriptions, stop acknowledgments and recovery. Restoring the preceding analysis, contexts and daemon owners is outside iteration 9's CLI/wiring/migration scope. No foreign service types or substitute production service were introduced.

The existing modification to `iteration8-check-results.md` was preserved without editing or staging it. It is a control-plane output.

## Implemented work

### Private argument grammar

`subs/cli/src/arguments.ts` recognizes the planned syntax for check, watch and daemon status/stop. It retains the explicit batch choice as a boolean, validates all options before dispatch, rejects command-inappropriate options, duplicate flags, missing values, unsupported formats and extra positional arguments. Root paths are preserved unchanged for the owning resolver. Existing help and version text and forms remain unchanged.

The grammar is preparatory, not an available resident command. `runCli` continues to reject watch and daemon commands before any batch dispatch, with `invalid-invocation` and exit 2; JSON failures use the existing `ramify.cli/1` envelope. The guard prevents a parsed command from accidentally reaching the legacy help/version or batch branch. It must be replaced by the real handlers after their providers exist.

### Batch output

`formatHuman` accepts the mode text and inserts one line immediately after Configuration. The current batch dispatch supplies `batch`, so resolved and unresolved human reports show `Mode: batch`. The remaining report rendering and `serializeReport` are unchanged. JSON receives exactly the serialized `ramify.analysis/1` report and its newline, with no mode member or wrapper.

Both default check and explicit --batch still use the existing disposable batch operation. This is the pre-resident behavior, now visibly labeled, and does not satisfy the required resident default or fallback policy.

The CLI README describes the implemented grammar, current dispatch and missing integration.

### Plan 1 migration

Added explicit --batch to check invocations in:

- `src/tests/batch-cli.test.ts` and `src/tests/cli-process.test.ts`;
- `scripts/reference-harness/cli-cases.ts`, `self-cases.ts`, `gate-cases.ts` and `relocation.ts`;
- `cli-direct-worker.ts`, which adds the flag only for check argv that do not already contain it;
- the two batch-execution calls in CLI's argument tests.

Existing assertions and Plan 1 instance records were retained. A direct comparison verifies that cli-process.test.ts and the four migrated harness case files differ only by the argv additions. The self-cases literal eleven-owner list and assertion were already present before this iteration and were preserved.

The required `CliEnvironment.connect` migration cannot yet name the absent daemon-owned ServiceConnector; it remains outstanding, including the five environments' fail-if-called connectors. The relocation entry map still verifies the seven entries this build actually has. Its required eighth `ramify.ts/client: connectDaemon` entry remains blocked by the missing public client implementation/package entry. No absent export was advertised.

## Tests and executed evidence

Added 36 cases: 11 valid parser selections, 21 malformed or unsupported option combinations, two unavailable-daemon dispatch controls, and two real batch report cases for resolved/unresolved selection. The report cases assert exact JSON bytes, one write, unchanged exits and empty stderr, and the single Mode line at the required position. All new cases type-check; their Vitest runner verdict is reserved to workflow automation.

`npx tsx .reference-work/iteration9-smoke.ts` passed five direct assertion groups on Linux, Node v22.23.2:

1. Command selection and rejection of invalid/duplicate options.
2. Real resolved/unresolved batch reports with exact JSON and the Mode line.
3. Compiled explicit batch JSON/human output and finite-helper cleanup.
4. Compiled batch interruption during acquisition: exit 130, no result, released resources.
5. Compiled help/version and unavailable watch/status/stop: no engine or daemon module, no spawn or connection.

Compiled subprocesses used the existing tracing preload. All traced CLI exits had zero open file handles and signal listeners; no surviving child, listener, bind or connect was observed. Fixtures were removed in finally. This is component and batch-process evidence, not resident process or quick-service matrix credit.

## Verification

| Command | Result |
| --- | --- |
| `npm run worktree:prepare` | Passed. |
| `npm run build` | Passed. |
| `npm run type-check` | Passed all four configurations after the final test additions. |
| `npx tsx .reference-work/iteration9-smoke.ts` | Passed all five groups. |
| `node .reference-work/iteration9-checks.mjs` | Passed: runs check:reference and check:self sequentially under an owned RAMIFY_ENDPOINT_DIR, verifies no endpoint artifacts, and removes the directory. |
| `npm run check:reference` within that wrapper | Passed in batch mode: 15 owners, 54 source files, zero errors/denials/limits, two existing outside-source warnings. |
| `npm run check:self` within that wrapper | Passed in batch mode: 11 owners, 174 source files, 11 resources, 2,029 accesses; zero errors, warnings, denials or limits. |
| `npm run reference:verify -- --plan 2 --iteration 9` | Failed, exit 1: 134 required, four passed, zero failed assertions, 130 required not executed. Overall 176 instances, 172 not executed; 42 belong to later iterations. |
| `git diff --check` | Passed. |

No daemon was started: this build has no connector or daemon entry, and its daemon stop command is still unavailable. The temporary endpoint directory stayed empty. These self/reference checks therefore establish batch conformance only.

No Vitest/Cucumber regression, scenario-coverage or sealed-file check was run locally. The full `--plan 1` gate and `reference:cases` were not run because they invoke the regression runners reserved to automation. The full Plan 1 gate is still required; no 308-instance passing verdict is claimed for this build.

Ignored evidence: `.reference-work/iteration9-smoke.ts`, `iteration9-smoke.json`, `iteration9-checks.mjs`, `iteration9-check-reference.log`, `iteration9-check-self.log`, `iteration9-plan2-gate.log`, and portable report `.reference-work/reports/plan2-iteration9-66ecb2ec-818e-4581-bf37-bde1ef27dc27.json`.

## Remaining exit criteria

All nine I2-20, four I2-21, five I2-22, five I2-23 and five I2-24 instances remain unexecuted. The other 102 required missing instances belong to predecessor capabilities.

Still required: the real injected connector and root client/entry wiring; synchronized resident checks and one-reopen behavior; revision-qualified watch and documents; daemon status/stop and the seven-second process wait; service/disconnect error rendering; cancellation frames and the two-second interrupt bound; exhausted-recovery-only fallback with explicit-stop exclusion; all four remaining CLI owner test files, root resident-process tests and real quick/process handlers; connect migration; eighth relocation entry; and the complete Plan 1 regression gate.

Checklist: `functionalRequirementsSatisfied: false`; `newCodeCoveredByTests: true`; `allNewTestsPass: false` pending the automated verdict. Passing smoke/static checks does not replace that verdict or the missing functional evidence. This draft is an incomplete checkpoint.

## Recommendations for Next Iteration

Restore the missing providers in their owning tasks: incremental/project resolution, contexts manager, shared service and root assembly/quick environment, complete codec/client, then host and daemon entry. Resolve the predecessor contract-review disposition through the owning workflow if it remains pending.

Resume iteration 9 against those public contracts. Replace the explicit unavailable-dispatch guard with real command handlers, supply the required connectors, activate the client entry and relocation expectation, and execute every assigned matrix instance with isolated endpoints and verified daemon cleanup. Complete iteration 9 before relying on iteration 10's entry-boundary evidence. macOS process evidence remains required by the plan.

## Single self-assessment remediation attempt

Re-read the original iteration 9 scope, the iteration-work and testing skills, the service/connect contracts, current interfaces and the original check policy. This repair started at `8cf1a8a` in the same authoritative checkout and branch. Live workflow detail reports iteration 9 at `validate_output_retry`. No iteration-9 check-results file or automated runner verdict is available in this checkout.

The missing increment, contexts, complete service, connector, host/entry and quick-environment providers remain absent. They still prevent the CLI from consuming the specified public contracts. Implementing those entire predecessor owners or inventing replacement service types would exceed this iteration's scope. This attempt completes the independent error adapter named by deliverable 1.

### Implemented error adapter

Added private `subs/cli/src/errors.ts`, using the already implemented and exposed root ServiceError/ServiceErrorCode and daemon DisconnectReason types through type-only imports.

- `serviceFailure` retains the service message and source cause, preserves the existing codes, and translates `stopping` to CLI `stopped`.
- `disconnectFailure` preserves explicit-stop request identities, separates idle exit, unexpected failure, slow consumer, incompatibility, rejection and closed-lease messages, and retains the source reason as the cause. Rejected stopping is also rendered as stopped.
- The private `CliFailure` class identifies deliberately translated command failures. `runCli` renders these with their code and exit 2 in the existing human or ramify.cli/1 format. Unexpected exceptions, including ordinary errors carrying a coincidental code property, remain internal-error.
- Invocation, output-failure and interruption handling retain precedence. In particular, a sink throwing a translated error is still output-failure; an aborted operation emits no result and exits 130.

The adapter does not decide recovery, prove exhaustion, start a fallback, or supply a service. Its terminal slow-consumer/idle messages do not implement watch recovery or make idle exit a normal CLI outcome. The unavailable resident-command guard remains; the required live stopped/no-fallback behavior is still unimplemented.

Updated the CLI README. No declaration, foreign owner, package entry, Plan 1 expectation or harness registration changed.

### Added coverage and verification

`subs/cli/src/tests/errors.test.ts` adds 25 cases: eleven service codes, nine disconnect variants, two human/JSON exception-boundary cases, two output-failure precedence cases and an interruption case. The boundary tests deliberately inject exceptions into runCli; they supply no resident service and receive no I2 matrix credit. Iteration 9 now has 61 added cases in total, all authored and type-checked.

| Command | Result |
| --- | --- |
| `npm run type-check` | Passed all four configurations. |
| `npx tsx .reference-work/iteration9-errors-smoke.ts` | Passed four groups: all eleven service codes/causes; every disconnect kind and rejection/stop variants; human/JSON translated and unexpected errors; output-failure and interruption precedence. |
| `npm run build` | Passed. |
| `npx tsx .reference-work/iteration9-smoke.ts` | Passed all five existing direct groups after the new runtime error import, including compiled lightweight paths, batch output and cancellation cleanup. |
| `npm run check:self` under an owned temporary RAMIFY_ENDPOINT_DIR | Passed in batch mode: 11 owners, 176 source files, 11 resources, 2,043 accesses; zero errors, warnings, denials or limits. The endpoint stayed empty and was removed in finally. |
| `git diff --check` | Passed. |

New ignored evidence: `.reference-work/iteration9-errors-smoke.ts`, `iteration9-errors-smoke.json` and `iteration9-errors-self-check.log`. The original five-group smoke report was refreshed. The focused error smoke ran on Linux, Node v22.23.2.

No Vitest/Cucumber regression, scenario-coverage or sealed-file check was run locally, following the original automation-only policy. No failing new-test output was supplied. The direct smoke is not an automated test-suite verdict. The unchanged matrix gate was not rerun: the last result remains four of 134 required instances passed, with all 28 assigned iteration-9 instances unexecuted. The full Plan 1 regression gate is still outstanding.

### Current checklist and handoff

- `functionalRequirementsSatisfied: false`: the error adapter is ready, but the missing provider chain still blocks the resident default, command handlers, quick/process evidence, connector environments, lifecycle/fallback behavior and eighth client entry.
- `newCodeCoveredByTests: true`: all implemented additions have authored coverage, now including error classification, streams and precedence.
- `allNewTestsPass: false`: the 61 added cases await an available automated runner verdict; passing type-check and direct smoke groups do not establish it.

Both managed deliverables are updated via MCP and this focused repair is committed in the authoritative checkout. No publication call is made in this remediation; validation reruns and publication belong to the workflow. The provider-restoration recommendations above remain required before completing iteration 9.
