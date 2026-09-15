<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 11 results: strict equivalence tooling; resident prerequisites missing

**Recorded:** 2026-09-11. **Status:** incomplete. The recorded sequences, strict comparison, installed-process handlers and live-stream consumer are implemented and type-checked. Batch qualification passes every recorded step. The resident acceptance gate fails because predecessor daemon and CLI providers are absent.

Work was performed in the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification-iter-11`, branch `workflow-iter/iteration-2-resident-verification/11`, starting at `b20455d`. No other checkout was edited or used for git operations.

## Prerequisite audit and scope

Read CLAUDE.md, the iteration-work, testing and bugfixing skills, development guides, the assigned iteration and predecessor handoff, comparison/freshness/budget contracts, reference statements and cases, daemon invalidation requirements, and existing fixture/process helpers. Ran `npm run worktree:prepare` successfully.

The workflow reports iteration 10 completed and accepted, but its supplied handoff explicitly says the resident package is incomplete. Current source confirms the gap: the analysis index has no `analyzeIncrement` or `resolveProject`; context-manager/service providers, root client/resident assembly and daemon entries are absent. The CLI's ordinary check calls its batch operation. Its daemon and watch commands report the missing resident implementation. Workflow publication is not evidence that these providers work.

Restoring iterations 3–10 is outside this integration iteration. No substitute daemon, second checker, quick evidence or relaxed comparison was introduced. Changes are confined to `scripts/reference-harness/` and `scripts/measurements/`; no production owner or model contract changed.

## Implemented tooling

### Strict comparison and independent process witnesses

`equivalence-comparison.ts` parses exactly the fourteen top-level members of the bare `ramify.analysis/1` document. It compares the complete JSON after replacing only top-level `runId`. Object property order is immaterial; array order, input identities, paths, stages, capabilities, outcome, snapshot, diagnostics, warnings, coverage, registry and summary remain significant. A mismatch reports its first differing path. Envelopes, additional members and missing members fail.

`equivalence-process.ts` installs the real local package into a private npm prefix and invokes its installed bin link. Each instance owns a short Unix-socket endpoint directory and tracing file. The resident check must connect to that endpoint, must not load batch/analysis in the CLI or spawn its compiler helpers there, and must have empty stderr. A reported daemon must load the compiled daemon entry, be live and listen on the owned socket. The sequence requires the same daemon instance throughout.

Each lifetime invokes daemon stop in cleanup, checks observed child PIDs, kills and reports leaks, and removes its installation and endpoint. A leak fails the instance. Current missing-service failures were exercised through the installed executable, with clean process cleanup for all nine handlers. A separate control runs the actual current implicit-batch check and verifies that it fails the resident socket witness; it cannot earn credit by returning a report equal to explicit batch.

### Recorded mutations and semantic oracle

`equivalence-sequences.ts` reuses the guarded iteration-6 edits and the three-owner F fixture. Every step records its exact edit recipe, named anchor and independent expected outcome.

| Instance | Recorded steps | Batch qualification |
| --- | --- | --- |
| I2-25:reference-sequence | Ten: W2 remove/restore, C1/W1 vocabulary add/remove, README, core ui tag add/revert, source export, compiler target edit/revert | All ten passed |
| I2-25:hundred-owner-sequence | Five: exposure removal, README, source initializer, testing move, complete revert | All five passed |
| I2-25:contracts-and-coverage-equal | Macro import with a located unsupported-loader note, then wildcard growth | Both passed |
| I2-25:removals | Introduce router denial and macro note; remove denial; remove note | All three passed |
| I2-26:remove-hop-live | Remove W2's createCatalogRouter selection | Batch oracle passed |
| I2-26:restore-hop-live | Remove, then restore that selection | Both batch oracle steps passed |
| I2-26:wildcard-growth-live | Add ResidentVocabulary; require exact C1/W1 membership and original identity | Batch oracle passed |
| I2-26:merge-live | Add a runtime Type binding; unchanged unmarked importer changes from allowed type-only to allowed value | Batch oracle passed |
| I2-26:testing-move-live | Move the private history helper and repair its importers; require the ordinary importer's testing-origin denial | Batch oracle passed |

These are 26 passing edit steps over nine clean baselines, executed with the compiled explicit-batch CLI. They qualify fixtures and assertions only. They do not establish resident reuse, publication, equality or watcher behavior.

Reference wildcard removal reverses the newly added ResidentVocabulary declaration, requiring exact contraction without editing C1 or W1. S100 uses the frozen generator, then explicit setup before its baseline: m001 exposes value and root imports it; m002's ordinary impl1 imports private run0. Removing the exposure denies root, and moving run0 into testing introduces the separate testing-origin denial. The revert restores every path and byte. Generator output and its fixed S100 hash are unchanged.

`materialize.ts` now exports `materializeSynthetic` without running its CLI on import. Its existing CLI syntax, default, metadata, frozen S100 identity and refusal to overwrite existing directories remain intact. Measurement consumers can reuse the recorded edit data.

### Live watcher consumer and harness registration

`equivalence-watch.ts` reads the actual installed `watch --format json` stream with bounded buffering and process cleanup. It requires an initial status for the published baseline and observes the first subsequent revision before issuing any confirming check. It validates generation, increasing revision, watch cause, exact changed paths, header/report input identity, outcome and summary. It records the full line and arrival time and enforces the reviewed 100 ms debounce plus 4,500 ms source target: 4,600 ms. A following resident/batch pair must also equal that watch report except runId. SIGINT must release watch with exit 130.

All nine handlers are registered under the equivalence harness capability. Availability of this consumer tooling does not claim working resident providers. The handlers currently fail their real-process prerequisite; none is skipped, credited as quick evidence or marked passing. No live watcher revision or timing was obtained, and the downstream resident/watch code remains unverified against a real provider.

Added `equivalence.test.ts` with 24 parameterized cases covering comparison corruption, report shape, socket/batch tracing controls, stale/late/substituted watch revisions, sequence membership, anchor drift and all nine batch oracles. Updated the existing Plan 2 harness tests to expect nine prerequisite failures and require clean cleanup observations. These tests are authored and type-checked; their automated runner verdict is pending.

## Focused failures and corrections

1. The first S100 exposure-removal smoke returned invalid rather than the expected denial because the authored fixture used a # comment. Ramify accepts // comments. Changed only the fixture's comment syntax. The rerun produces the independently expected not-visible denial. The original failure is preserved in `iteration11-oracle-before.log`, alongside all ten passing reference steps.
2. The S100 revert initially compared its entire report to the pre-move baseline. A narrow three-owner reproduction showed that unlinking and recreating identical source bytes changes only the containing directory's captured hash: existing Capture includes directory stat metadata in its identity. Source bytes, summary and permissions were restored. This is a different captured filesystem state, not a batch/resident discrepancy. Corrected the restoration oracle to assert exact restored bytes, summary, permissions and expanded contracts. Every same-state batch/resident comparison still retains inputId and every captured input. No capture implementation or comparison tolerance changed. The failed assertion is preserved in `iteration11-oracle-revert-before.log`; the narrow evidence is `iteration11-revert-capture.log`.

## Verification

Linux, Node v22.23.2. Commands ran in the authoritative checkout.

| Command | Result |
| --- | --- |
| npm run worktree:prepare | Passed example and site dependency provisioning |
| npm run build | Passed |
| npm run type-check | Passed all four configurations, including the new handlers and tests |
| npx tsx .reference-work/iteration11-oracle.ts | Ten reference steps passed; exposed the S100 comment error |
| npx tsx .reference-work/iteration11-oracle.ts reference-sequence | The argument excludes the already-passing reference sequence. After the focused fixes, all remaining sixteen steps and eight baselines passed |
| npx tsx .reference-work/iteration11-revert-capture.ts | Passed the narrow directory-identity reproduction; source bytes and permissions are unchanged |
| npx tsx .reference-work/iteration11-materialization.ts | Passed exact S100 path/byte restoration and missing/duplicate anchor rejection without writes |
| npx tsx .reference-work/iteration11-controls.ts | Passed strict comparison, trace, watch-header/latency corruption controls and installed-CLI missing-provider rejection/cleanup |
| npx tsx .reference-work/iteration11-implicit-batch.ts | Installed explicit batch passed; actual implicit batch was rejected as resident; cleanup passed |
| npm run reference:verify -- --plan 2 --iteration 11 | Exit 1: 148 required, six passed, nine failed, 133 required not executed; another 28 future instances are not executed |
| npm run reference:report -- --dry-run | Passed capability inventory; this command claims no resident instance execution |
| git diff --check | Passed |

All nine assigned process handlers fail with the same observed command result:

```text
Resident prerequisite unavailable: daemon status exited 2
Unavailable command: daemon. Resident service is not implemented.
```

Every handler's cleanup observation has `leaked: []` and `survivingAfterKill: []`. The gate's portable report is:

`.reference-work/reports/plan2-iteration11-38fb22d5-9170-4b4c-8804-6cf30e4dbb59.json`

Ignored evidence also includes the named smoke scripts, their logs, `iteration11-oracle.json` (sixteen passing post-repair steps with 149 recorded assertions), `iteration11-controls.json`, `iteration11-implicit-batch.json`, `iteration11-gate.log`, `iteration11-report.log` and `iteration11-type-check.log`.

Per the supplied check policy, no Vitest/Cucumber regression, scenario coverage or sealed-file check was run locally. Non-dry reference:report invokes reserved regressions, so only its inventory form was run. The direct smoke commands are not a regression-suite verdict. No Plan 1 instance record or expectation changed.

## Remaining exit criteria and checklist

- Functional requirements are not satisfied: none of the nine assigned process instances passed its resident prerequisite, and no live timing or resident equivalence result exists.
- New code has authored tests and focused direct controls.
- All new tests passing is unestablished until workflow automation runs them. The previous iteration's passing regression result is not a verdict for these changes.

Checklist: `functionalRequirementsSatisfied: false`, `newCodeCoveredByTests: true`, `allNewTestsPass: false`.

Both managed deliverables use workflow MCP. The code and evidence are prepared for commit on this iteration's branch and draft submission with the supplied attempt identity. Draft submission does not assert that the iteration's exit criteria passed.

## Recommendations for Next Iteration

Restore the missing predecessor provider chain in its owning iterations: analysis/project resolution and retained products; context manager; shared service and root assembly; client/host/daemon entry; resident CLI dispatch and recovery; final declarations and client package entry. Resolve the architectural review disposition through its owning workflow.

Then run the nine process handlers against that real package, investigate any downstream failure in the responsible owner without weakening comparisons, obtain real watcher timing under the 4,600 ms target, and rerun the full iteration-11 prerequisite gate. Obtain the automatic test verdict. Iteration 14 must not cite the batch qualifications as resident equivalence evidence. Iterations 13 and Plan 5 may reuse the materialization and edit recipes, with this limitation kept explicit.

## Single self-assessment remediation attempt

**Recorded:** 2026-09-11T09:15:40Z. This focused attempt started at `cbedab7` on the authoritative iteration-11 branch. Re-read iteration 11, the implementation/testing/bugfixing skills, the watch consumer and tests, current provider entry points and live workflow detail. The workflow reports iteration 11 at `validate_output_retry`. No iteration-11 automated regression verdict or check-results file is available.

The functional prerequisite gap is unchanged: incremental analysis/project resolution, context manager, the complete service/client/host chain and resident CLI dispatch remain absent. Ordinary check still invokes batch; daemon/watch dispatch still reports the unimplemented resident service. Supplying those predecessor owners would exceed this iteration's integration scope. The existing nine failed process prerequisites cannot be converted to passing resident evidence here.

### Focused correction: fragmented watch stdout

Found a defect in this iteration's own watch consumer. Its stdout handler woke the waiting reader after every chunk, even if no newline had arrived. The reader then treated an empty queue as a timeout immediately, although its deadline had not elapsed. A real subprocess emitting a fragmented line reproduced the failure through `withLiveWatch`: it reported `Watch event exceeded 30000 ms` at the first incomplete chunk.

The same handler applied its line-size limit to the entire accumulated chunk before separating lines. That counted the delimiter against a complete line and could also count following-line bytes against it, rejecting a legal line at the exact limit.

Changed only the harness watch reader and its coverage:
- Wake a pending reader only for a complete queued line, a stream error/close, or the actual timer expiry.
- Split completed lines first, check each line's byte length without its newline, and check the remaining incomplete line separately. The 32 MiB + 64 KiB line limit and existing queue bounds remain unchanged.
- Add the executable `fixtures/plan2/watch-stream.mjs` control and seven parameterized tests for fragmented input, coalesced lines, an exact-limit line followed by another line, oversized input, malformed JSON, partial-line exit and a real deadline after startup.
- Require each control's child PID to be gone after the reader settles. Successful streams also exercise the existing exit-130, empty-stderr and complete-line cleanup assertions.

This fixture emits reader-control bytes only. It implements no daemon or checker, registers no matrix handler and earns no I2-25/I2-26 credit. No report comparison, semantic oracle, timing budget, production owner or public contract changed.

### Focused verification

| Command | Result |
| --- | --- |
| `npx tsx .reference-work/iteration11-watch-boundary.ts` before correction | Failed on the premature timeout; preserved in `iteration11-watch-boundary-before.log` |
| Same command after correction | Passed the exact-boundary fragmented line and child exit/reaping; preserved in `iteration11-watch-boundary-after.log` |
| `npx tsx .reference-work/iteration11-watch-controls.ts` | All seven subprocess controls passed; every child reaped; log and structured evidence in `iteration11-watch-controls.log` and `iteration11-watch-controls.json` |
| `npm run type-check` | Passed all four configurations with the reader fix and seven additional test cases; `iteration11-repair-type-check.log` |
| `git diff --check` | Passed |

No Vitest/Cucumber regression, scenario-coverage or sealed-file check was run, following the original automation-only policy. No failing regression output was supplied. The build, batch edit sequence and unchanged missing-provider gate were not repeated for this reader-only repair. Their earlier results remain historical evidence, not new verdicts.

### Current checklist and handoff

`functionalRequirementsSatisfied` remains **false**: the reader defect is corrected, but the required resident service is still absent and no real resident equality or live-watch timing result exists.

`newCodeCoveredByTests` remains **true**: seven additional authored subprocess cases cover the corrected reader and its failure/cleanup paths.

`allNewTestsPass` remains **false**: focused reproductions pass, but the automatic regression verdict for the authored tests is still unavailable. The supplied check policy reserves that runner for workflow automation.

Both managed deliverables are updated through MCP, and the focused code changes are prepared for commit in the authoritative checkout. No publication is requested during this remediation; validation reruns and publication belong to the workflow. The provider-restoration recommendations above remain necessary to complete iteration 11.
