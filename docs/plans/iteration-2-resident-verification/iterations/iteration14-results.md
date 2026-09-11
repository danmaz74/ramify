<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 14 results: completion witnesses and incomplete resident handoff

**Recorded:** 2026-09-11. **Status: incomplete.** Six completion handlers, their controls, command documentation and retained evidence are implemented after the single remediation below. The resident package is still absent. The last unfiltered Plan 2 gate, before that remediation, required 176 instances and reported **6 passed, 14 failed, 156 not executed**. The full matrix was not rerun for the focused evidence-reader change. No I2-30 instance passes, and Plan 2 cannot be closed or described as delivered.

Work stayed in the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification`, branch `workflow/iteration-2-resident-verification`, starting at `cb4a53c2b91875e9bbbff603717a72169be6d541`. This submission is an incomplete implementation checkpoint, not functional acceptance.

## Prerequisites and scope disposition

Read CLAUDE.md, iteration-work and testing skills, implementation/testing/engineering guides, the iteration-10–13 handoffs, reviewed owners and budgets, roadmap handoff requirements, quick-testing architecture and the existing self-check, relocation, tracing and gate implementations. Ran `npm run worktree:prepare` successfully for the independent example and site packages.

Live workflow detail labels the predecessor iterations completed and published. Their actual result files explicitly say incomplete, and the current source confirms the missing providers:

- Analysis/project: `analyzeIncrement`, `resolveProject`, `resolveProjectRoot`, retained analysis/configuration products and their dependency contracts.
- Contexts: the manager, ordered queues, leases, complete revision/status/outcome contracts and publication lifecycle.
- Service and transport: full `RamifyService`, `createDaemonService`, root resident assembly, message codec, `connectDaemon`, host and daemon entry.
- CLI/package: resident check/watch/status/stop implementations, root client wiring and the real eighth `./client` package entry.
- Evidence: completed equivalence and lifecycle cases, real measurement workloads, macOS process pass and same-build Plan 1 regression.

Ordinary check still dispatches batch. No service or analyzer substitute was added. Restoring these provider owners is outside iteration 14's integration and documentation scope. The published predecessor checkpoints cannot satisfy the prerequisite contract.

## Implemented completion work

### Self-check and independent negative

Initially added `scripts/reference-harness/completion-cases.ts` with five I2-30 handlers; the single remediation below registers the sixth, Plan 1 regression evidence validation. The resident self-check uses the actual installed CLI, requires a connection to its owned endpoint, and rejects a CLI that loads the batch engine or spawns compiler helpers itself. On a genuine resident result it reuses Plan 1's independent eleven-owner, full-file inventory, complete catalogue and access-evaluation assertions, exported from `self-cases.ts` without changing those assertions.

The contexts negative first checks a clean toolkit copy through compiled batch analysis. It then writes only that copy's `subs/daemon/subs/contexts/src/__i2_probe.ts`, importing the actual root `RamifyService` type. A real compiler subprocess must accept the import before the checker negative can count. The subsequent assertions require exactly the located contexts-to-root `required-importer-tag` denial, explicit type-only selection, independently visible R6 path and unsatisfied `dispatch` requirement. Batch and resident reports must agree after replacing only runId.

On this build the negative correctly stops at TS2305: `interfaces/service.js` has no exported member `RamifyService`. The compiler command, stdout, stderr and exit are retained in the gate observations. No substitute service type was created to make that case pass.

### Final declarations and packed relocation

The final-declaration handler invokes `scripts/validate-final-contracts.ts` as a subprocess and requires eleven owners, eight entries and real linked selections. Its existing strict expectations remain unchanged.

The two package handlers reuse the external relocation fixture with an independent eight-entry literal. `prepareRelocatedPackage` now accepts that explicit expected entry map; its existing Plan 1 default remains the staged seven-entry literal. A future provider activation must also complete Plan 1's reviewed eight-entry migration. Adding a nonexistent export or changing the present seven-entry expectation to make an incomplete package appear valid was avoided.

The handlers bootstrap an external toolkit copy, install its frozen dependencies, build and type-check it, run the copied compiled batch reference and execute actual `npm pack`. Once the eighth entry exists, the same path installs the archive, resolves all eight import/type conditions, verifies their callable exports and traces an isolated client import. The client may load only client-entry, connect-daemon, connection, launcher, discovery, codec, records and Node built-ins. Missing connector loads, foreign or engine/host/context loads, unknown module schemes and process/socket effects fail.

Relocated resident checking additionally requires equal batch/resident reports, fifteen clean reference owners, an actual daemon loading the unpacked installation's entry and listening on the private endpoint. Stop and observed-process cleanup remain required.

Extended `withSequenceProcess` to use a supplied unpacked executable, cwd, environment and copied preload without installing a symlink back to this checkout. Default equivalence behavior remains intact. Canonicalized temporary paths to avoid treating filesystem aliases as different installations; macOS execution is still unverified.

Both package cases currently complete bootstrap/build/type-check/batch/pack, then fail the independent eight-entry check. They do not reach installation of the incomplete tarball, client import or resident startup. No successful relocation instance is claimed.

### Controls and documentation

Added seven tests in `completion.test.ts`: closure admission/rejection, five import-time side-effect cases, and supplied-executable failure/cleanup. Updated the existing Plan 2 gate assertions for five additional executed failures and increased their finite timeout to accommodate the two real external bootstraps. Inventory membership and failure expectations were preserved.

Direct execution passed the closure positive, twelve corruption controls, the supplied real executable, preservation of the intentional callback failure, attempted stop and zero observed process survivors. These controls verify the harness, not resident behavior.

Updated the development testing command list and added `docs/development/resident-verification.md`. They state current batch behavior, unavailable resident commands, the intended future resident default of unchanged check:self/check:reference scripts, owned endpoint directories, finally-based cleanup and the automation-only regression policy. Updated the harness and evidence READMEs.

The roadmap has not been advanced to delivered: that would contradict the gate and prerequisites. Its stale “detailed plan not yet written” wording still needs an authorized plan-document update linking this existing plan and incomplete evidence; no plan artifact was edited directly. No MCP, overlay, inspection or explorer claim was added.

## Executed instance outcomes before the single remediation

All required metadata and observations are retained in [the complete gate archive](../../../../scripts/reference-harness/evidence/plan2-iteration14-incomplete.json.gz).

| Evidence kind | Required | Passed | Failed | Not executed |
| --- | ---: | ---: | ---: | ---: |
| API | 18 | 0 | 0 | 18 |
| Unit | 31 | 4 | 0 | 27 |
| Quick | 40 | 0 | 0 | 40 |
| IPC | 15 | 0 | 0 | 15 |
| Process | 63 | 2 | 14 | 47 |
| Measurement | 9 | 0 | 0 | 9 |
| Total | 176 | 6 | 14 | 156 |

The four unit passes are I2-28's existing harness controls. The two process passes are I2-19:help-version-unchanged and I2-19:batch-no-daemon. I2-25/I2-26 contribute nine missing-resident process failures. The new completion capability permits its named handlers to execute; it does not establish completed product functionality.

| I2-30 instance | Actual result |
| --- | --- |
| self-check-eleven | Failed: ordinary check did not connect to its owned endpoint. Its batch report receives no resident credit. |
| self-negative-contexts | Clean batch baseline passed 32 assertions; the real compiler rejected the missing RamifyService export. No importability negative was credited. |
| declarations-final | Failed: five final declaration mismatches and missing eighth package export. |
| package-entries | Twenty-two assertions passed before the actual packed package failed the eight-entry expectation. |
| relocated-resident | Twenty-two assertions passed before the same package prerequisite failure; no installed daemon started. |
| plan1-regression | Not executed in this archived run. The subsequent remediation implements the handler, but a same-input Plan 1 gate remains unavailable. |

All eleven traced equivalence/completion process lifetimes in the final gate report have empty leaked and surviving-after-kill lists. This is cleanup evidence for the executed failure paths, not a daemon lifecycle acceptance claim.

## Verification

Linux x64, Node v22.23.2, TypeScript 7.0.2. All commands were initiated from the authoritative checkout. External directories were owned, disposable fixtures of the relocation checks; no Git operation targeted another checkout.

| Command | Result |
| --- | --- |
| `npm run worktree:prepare` | Passed example/site dependency provisioning. |
| `npm run build` | Passed. |
| `npm run type-check` | Passed all four configurations, including after final harness changes. |
| `npx tsx .reference-work/iteration14-controls.ts` | Passed direct closure and actual executable/cleanup controls; repeated after the path/diagnostic adjustment. |
| `npm run check:reference` | Passed in batch mode: 15 owners, 54 source files, 294 accesses, zero errors/denials/limits, two expected outside-source warnings. |
| `npm run check:self` | Passed in batch mode: 11 owners, 182 source files, 11 resources, 2,084 accesses, 1,434 allowed, 650 external, no findings or limits. |
| `npx tsx scripts/validate-final-contracts.ts` | Exit 1: root, analysis, project, daemon and contexts selections differ from final review; package has seven entries. Current staged declarations still link. |
| `npm run reference:verify -- --plan 2` | Exit 1 on both runs. Final: 176 required, 6 passed, 14 failed, 156 unexecuted; 66,087 ms. No removed or missing inventory records. |
| `npm run measure:resident` | Exit 1, archived incomplete prerequisite/help evidence; all nine resident workloads unexecuted. |
| `npm run reference:report -- --dry-run` | Passed capability inventory only. |
| `npm run diagrams` | Passed. |
| `npm run site:build` | Passed. |
| `node dist/src/cli-entry.js daemon stop` | Exit 2: resident command unimplemented. The owned endpoint was empty; no daemon had started. |
| `git diff --check` | Passed. |
| `git diff f5b0939d6dcce369375ea5b206f50c87ec510ac6 -- scripts/reference-harness/plan1-instances.ts` | Empty: the 308 registration records are unchanged. This alone does not establish unchanged handler expectations or a regression pass. |

The local verification wrapper used one exported, owned RAMIFY_ENDPOINT_DIR for the top-level commands and finally attempted stop. It observed sixteen process PIDs, no survivors, an empty endpoint and removed that directory. Each matrix process lifetime and measurement probe separately owns and cleans its endpoint.

Per the supplied check policy, `npm test`, `npm run reference:cases`, the full Plan 1 gate and the non-dry reference report were not run locally. The last two invoke Vitest/Cucumber internally. Regression tests, scenario coverage and sealed-file checks remain assigned to workflow automation. No automatic runner verdict was supplied in this attempt. The requested all-command passing completion sequence is therefore not established.

Ignored local evidence: `.reference-work/iteration14-O8zEIh/` holds the command logs, commands.json and cleanup.json; `iteration14-controls.ts/json` holds direct controls; `iteration14-final-gate.out/err` holds the final gate log. The first gate report is retained locally at `plan2-full-a6330823-7b52-47b4-86f4-08ac76a6f5ca.json`; the final one is `plan2-full-fbbe2457-c208-4195-b36e-9ec23b7ceaeb.json`.

The archived final report is an exact gzip copy: 6,214,510 raw bytes, SHA-256 `4a548164732b0a90bf81c7b50aa09901efd5886750d83d6341256c775e3d88f4`; 515,158 compressed bytes, SHA-256 `f0b3ca6400cde9fc59063a06c760e4a7fd80fdc3ccb36bc60fdaed48218a3cf7`. The gate records dirty source SHA `9f49b363db0d980d75f03b10756044b4d18b046a7365076b52fb1c307979411c` before adding that archive/evidence README entry, and build SHA `93a5e8c6ca0b3f653cd07314450569865fee87975c2072c51b7f626f0f76e35f`. Production code/build did not change in this iteration.

## Client, service and codec handoff

There is no usable `ramify.ts/client` entry yet. Package.json still declares seven entries. Do not start a Plan 3 consumer against a fictitious connector.

Implemented independent pieces include endpoint selection and record IO/validation, startup lock/launch support, real filesystem watcher/system clock, token and fingerprint constructors, private bounded history, controlled ports, service request validation and some plain lifecycle/service vocabulary. Root currently declares ServiceOperation, ServiceCapability, ServiceErrorCode, ServiceError and ServiceResult. These pieces do not form RamifyService or a live connection.

The current codec exports private byte-framing helpers `encodeJsonFrame`, `decodeJsonFrame` and `createFrameDecoder`: four-byte big-endian payload length, strict UTF-8 JSON, zero/oversized/truncated-frame rejection and bounded partial buffering. The reviewed `encodeMessage`/`decodeMessage`, WireMessage union and validated hello/request/response/cancel/event/ping/goodbye service exchange remain unimplemented. A byte-frame round trip does not establish that protocol.

The required future client closure and its actual-process assertions are recorded above and in owners.md. The public API must implement the reviewed connect options, validated service operations, leases and bounded recovery before a consumer imports it.

## Lifecycle and error handoff

This table preserves required behavior, not implemented lifecycle guarantees.

| Event | Reviewed behavior still to establish |
| --- | --- |
| New check/watch without daemon | Coordinated compatible startup; synchronized check or subscription lease. |
| Unexpected loss / slow consumer | At most three reconnects, one restart, twenty seconds; resynchronize because replay is unavailable. |
| Idle exit | Record reason idle and goodbye idle-exit; bare automatic recovery starts nothing. Active request/subscription prevents idle exit. |
| Explicit stop | Record explicit before sockets close; existing clients report stopped until explicit recovery. In-flight check exits 2 with no fallback. |
| New invocation after explicit stop | May start a fresh daemon and generation. |
| Exhausted recovery | Only terminating check may visibly fall back to a disposable batch session; watch/direct clients report unavailable. |
| Incompatible peer / resource refusal | Bounded failure without restart or batch substitution. |
| Evicted generation / revision | Explicit expired/unknown/evicted result; never substitute another root or current revision. |
| Incomplete engine report | Unchanged report, unpublished, exit 2; no mixed or stale revision. |

Currently watch/status/stop produce an unavailable `ramify.cli/1` invocation envelope with code `invalid-invocation` and exit 2. Normal check is batch and retains the bare `ramify.analysis/1` report. The reviewed domain/transport error table, explicit stop behavior and fallback policy still need real implementation and lifecycle evidence.

`StopDisposition.reason` includes idle, explicit, failed and reserved retired in the type vocabulary; no Plan 2 operation should produce retired. The current record types alone establish no running daemon transition.

## Revision and freshness handoff

Token constructors and fingerprint vocabulary exist. The manager and engine extensions needed to enforce the following guarantees do not:

- Context identity from canonical root/setup; fresh generation on reopen/restart and monotonic revision sequence.
- Synchronized capture beginning after request acknowledgement, optional expected content identities and explicit supersession.
- Exact revision-addressed published reads, with evicted-revision on missing history; published reads never claim current disk freshness.
- Atomic publication only for sealed completed/invalid captures; invalid current inputs are not answered from lastValid.
- Unsealed, incomplete or unavailable engine results delivered unchanged and unpublished; exceptions represented separately.
- Queue ordering, cancellation, lease retention, background coalescing and prevention of stale-generation publication.

These remain the reviewed contracts in contracts.md/scope.md, not Plan 3-ready implemented promises. No incremental/batch equivalence is established by this checkpoint.

## Transport platforms

Linux and macOS are the reviewed targets: Unix domain sockets, an owned mode-0700 endpoint directory, atomic JSON record rename, exclusive start lock, PID checks and POSIX signals. Short endpoint paths are required by Unix-socket path limits. Windows remains unsupported.

Executed local evidence is Linux only. Existing process-control fixtures use portable Node/POSIX operations, and this iteration canonicalizes copied package and temporary paths, but there is no macOS pass. There is also no passing real daemon process suite on Linux, because the providers are missing.

## Budgets and measurements

No resident budget has a passing measured value. Scope.md's iteration-1 targets were not relaxed or rewritten. [The new raw archive](../../../../scripts/measurements/results/resident-2026-09-11T09-26-49.390Z-a323bf02-0031-45b6-bbbf-9129f33bac5d.json.gz) records absent prerequisites, identities and three real CLI help probes, with zero observed survivors. Help sampled peak RSS was 28.5 MiB; help has no numeric target and cannot pass the full entry-footprints instance.

| Required workload | Binding target | Current resident measurement |
| --- | --- | --- |
| Reference / S100 cold | 6 s / 16 s median of five | Not executed |
| Unchanged warm | 1.5 s / 3 s median of twenty | Not executed |
| README edit | 1 s / 2 s | Not executed |
| Exposure edit | 2.5 s / 5 s | Not executed |
| Source edit | 4.5 s / 8 s | Not executed |
| Broad configuration edit | 5.5 s / 12 s | Not executed |
| Service status / CLI status | 50 ms / 300 ms | Not executed |
| S500 cold / source / peak | 45 s / 30 s / 1.5 GiB | Not executed |
| S1000 cold / source / peak | 90 s / 60 s / 2.5 GiB | Not executed |
| Daemon zero contexts / warm reference / eight warm S100 | 96 MiB / 192 MiB / 1 GiB RSS | Not executed |
| Reference / S100 combined daemon-helper peak | 512 MiB / 768 MiB | Not executed |
| Resident CLI reference / S100; empty client import | 96 MiB / 160 MiB; 64 MiB | Not executed |
| Last 100 of 200 alternating edit/revert cycles | At most 64 MiB RSS growth and 16 MiB heap beyond history delta; balanced resources | Not executed |
| Slow consumer | Queue at most 64 MiB; disconnect within 2 s; settled RSS within 32 MiB of baseline | Not executed |

Retention defaults remain eight contexts, eight revisions and 64 MiB history per context, 96 MiB products per context, 512 MiB global history/products, 10,000 queued paths and one analysis at a time. Warm idle/cold retention are 10/30 minutes; daemon idle exit is 30 minutes; leases/pings are 45/15 seconds. Debounce is 100 ms and periodic verification 60 seconds. Transport bounds are 64 connections, sixteen in-flight requests per connection, 1 MiB request, 32 MiB + 64 KiB response, 64 MiB/256 outbound frames and five seconds shutdown grace. These are reviewed defaults, not measured enforcement by an assembled service.

The S100/S500/S1000 generator materialized 1,402/7,002/14,002 files for identities only. No synthetic resident analysis ran. Measurement build identity is `bf8ff4e40a1f465d31f06b0c28daff51ab5bd132880c817e582d1cf151cade74` over 214 files. Its JSON-of-file-hashes recipe differs from the gate's sorted path/NUL/bytes/NUL recipe; the differing digest strings do not indicate another build.

## Harness, fixtures and Plan 3 starting requirements

The real direct-service quick environment is absent. Existing contexts testing ports are `createControlledWatcher` and `createControlledClock`; they cannot substitute for the missing real engine/context/service assembly.

Reusable fixtures and runners are:

- `fixtures/plan2/project.ts`, reference edit recipes and `equivalence-sequences.ts`: independent source/description edits and expected report effects.
- `equivalence-comparison.ts`, `equivalence-process.ts`, `equivalence-watch.ts`: exact report comparison, actual installed-process tracing and bounded watch consumer.
- `src/tests/lifecycle-process.ts` and `scripts/reference-harness/lifecycle-process-smoke.ts`: signal, suspension, interruption and observed-process cleanup mechanics.
- `fixtures/plan2/lifecycle.ts` and `lifecycle-fixture-smoke.ts`: nine isolated F projects and concurrent fixture cleanup.
- `scripts/probes/fixtures/synthetic-owners.ts`: S100/S500/S1000 identities, with measurement archive and observer infrastructure.
- `completion-cases.ts`: actual final-contract, resident self-check, contexts-negative and packed/relocated process requirements.

Known limits remain unsupported-commonjs resolution for module-file require targets, unavailable event replay, deferred compiler-state retention, reserved retired disposition and unsupported Windows. The bounded declare-global coverage fix exists in the TypeScript owner, but matching batch/incremental I2-11 evidence cannot run without increments. No persistent cache, worker pool, overlay, inspection command, MCP host or explorer was added.

Plan 3 must wait for the real context, revision/freshness, service, client, codec and direct-harness contracts and measured limits. It cannot begin from this checkpoint's proposed names.

## Recommendations for Next Iteration

Restore the predecessor provider chain through its owning iterations, beginning with incremental analysis/project resolution, then contexts, shared service/root assembly, validated client/codec, host/daemon entry and resident CLI. Resolve the architecture-review disposition through its owning workflow. Activate the five remaining declarations, real client entry and Plan 1's reviewed eighth-entry literal when those providers exist.

Produce a qualifying same-input Plan 1 gate for the implemented regression evidence handler; preserve the 305 unaffected expectations and execute all 308 records with owned daemon cleanup. Complete the real lifecycle and measurement handlers, obtain macOS process evidence, and run the two unfiltered gates on one build. Exercise the currently unreachable positive paths of the five new completion handlers against those implementations. Any budget change requires the reviewed plan revision process.

Only then update the roadmap to delivered, enter measured budgets in the plan, and replace this incomplete checkpoint with the evidence-backed completion handoff.

## Checklist disposition

- functionalRequirementsSatisfied: false — missing prerequisite providers and no passing I2-30 instance.
- newCodeCoveredByTests: true — the original seven tests, the new regression-evidence control test and updated strict matrix expectations.
- allNewTestsPass: false — direct controls and static checks pass, but the automation-owned runner verdict is not available.

Results and checklist are written through workflow MCP. Draft code and evidence are committed on the assigned branch before publication. Publication of this checkpoint must not be interpreted as satisfaction of the plan's exit criteria.

## Single self-assessment remediation attempt

**Recorded:** 2026-09-11 09:38:12 UTC. This focused attempt began at `d6ccb26` in the same authoritative checkout and branch. Re-read the assigned iteration, iteration-work/testing/bugfixing skills, relevant evidence and current harness. Workflow detail reports iteration 14 at validate_output_retry. No automated regression verdict or failing-new-test output was supplied. The existing checklist metadata change was generated by the previous publication.

### Missing integration completed: Plan 1 regression evidence handler

Implemented `completion-regression.ts` and registered `I2-30:plan1-regression`. The main validation sequence already runs the full Plan 1 gate before Plan 2. The new handler consumes that complete report from the ignored `.reference-work/reports` directory; it starts no second regression suite and does not bypass the automation-only test policy.

Acceptance requires:

- Identical source SHA, compiled-build SHA, package version, Node version and TypeScript version. Commit metadata alone cannot qualify a report.
- A passing unfiltered Plan 1 gate with all fifteen required iterations, no inventory errors and exactly 308 unique execution slots matching the current reviewed inventory.
- Actual nonempty passing assertion evidence for every slot, with no failed baseline or execution.
- The 305 unaffected serialized record definitions identical to the frozen Plan 1 archive. That archive supplies definitions only; its old successful build cannot earn current regression credit.
- Both toolkit cases asserting eleven owners and retaining that exact owner observation; the relocated package asserting eight actual imports and retaining the eight expected callable bindings.
- Source/build identities remaining unchanged while evidence is inspected.

The bounded reader selects the newest report for matching inputs. A newer failed report blocks an older pass; malformed evidence is reported rather than hidden. Stale reports are never substituted. A successful receipt records the source file, content hash, identity and counters without embedding another full report.

All six I2-30 handlers now exist. Updated the readiness guide, harness README and the existing gate test expectations: with the present missing evidence, plan1-regression is an executed failure rather than a missing handler. Those full-gate assertions are prepared for automation; their projected six-pass/fifteen-fail/155-unexecuted summary is not claimed as a newly executed full gate.

### Verification of the focused change

Added `completion-regression-controls.ts` and one Vitest wrapper. Direct execution covered 23 named checks: positive and restored schema fixtures; the actual old-build archive; each changed source/build/runtime identity; filtered and failed reports; removed/duplicate instances; empty/failed assertions; missing metadata; old owner/package expectations; missing actual observations; altered frozen definitions; no report; stale report selection; preservation of a newer matching failure; malformed JSON. Synthetic schema fixtures live only in their own temporary directory and never enter the real report directory.

The first type-check found TS2345 in the new control code's `assert.throws` overload. Corrected its argument form. The final type-check and direct controls pass.

| Command / check | Result |
| --- | --- |
| `npm run type-check` after the correction | Passed all four configurations. |
| Direct `npx tsx --eval` invocation of `completionRegressionControls()` | Passed all 23 checks; log `.reference-work/iteration14-regression-controls-final.log`. |
| Direct `npx tsx --eval` invocation of `verifyPlan1Regression()`, requiring rejection | Passed the real-checkout negative: no full Plan 1 gate exists for current source/build/runtime. Log `.reference-work/iteration14-regression-missing.log`. |
| `git diff --check` | Passed. |

The direct verification commands import the checked-in functions, use Node assertions and preserve rejected outcomes. They do not execute Vitest, Cucumber or Plan 1 regression. The unchanged build, batch checks, external relocation and full Plan 2 matrix were not rerun for this scripts-only evidence reader. Their earlier observations remain historical evidence. No production source, package export, declaration, runtime budget or model rule changed.

### Remaining self-assessment

functionalRequirementsSatisfied remains **false**. The missing regression handler is fixed, but its required current report is absent. The incremental/contexts/service/client/host/CLI provider chain, successful resident completion paths, same-build regression, real resident measurements and macOS process evidence are still missing. Implementing those predecessor owners exceeds this bounded integration attempt.

newCodeCoveredByTests remains **true**. The new evidence reader has positive and corruption/selection controls, alongside the previously authored completion tests.

allNewTestsPass remains **false**. The direct controls and type-check pass, but the automation-owned runner verdict for all new tests, including the revised full-gate test, is unavailable. No check was changed to true on the basis of unrun assertions.

Both deliverables are updated through workflow MCP and the focused changes are committed in this checkout. No publication call is made in this remediation; validation reruns and subsequent publication remain with the workflow.
