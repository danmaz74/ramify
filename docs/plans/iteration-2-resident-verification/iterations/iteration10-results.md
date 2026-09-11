<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 10 results: final-contract validation and independent entry boundaries

**Recorded:** 2026-09-11. **Status:** incomplete. The strict eleven-owner/eight-entry validator, all README purposes, available root relays and two independent process witnesses are implemented. Missing predecessor providers prevent final declaration activation and the three resident entry witnesses.

Work was performed in the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-2-resident-verification`, branch `workflow/iteration-2-resident-verification`, starting at `4bc66dd`.

## Prerequisites and scope

Read CLAUDE.md, the iteration-work and testing skills, development guides, the complete owners review, package activation contracts, process and memory boundaries, quick-testing architecture, description rules and the supplied iteration-9 handoff. Ran `npm run worktree:prepare` successfully.

Live workflow detail reports iterations 3–9 completed and accepted. Current source and the predecessor handoff establish that their resident providers are still missing: `analyzeIncrement`, `resolveProject`, `resolveProjectRoot`, retained analysis/configuration products, `createContextManager`, complete `RamifyService` and `DaemonService`, the message/service connector contracts, `connectDaemon`, `startDaemon`, root resident assembly, daemon/client entries and quick environment. CLI dispatch still uses batch for ordinary check and rejects watch/status/stop. The review package also still labels architecture acceptance pending.

Publication and passing automated checks on the preceding partial work do not establish those capabilities. Implementing them would exceed iteration 10's declarations, entries, validator and boundary-evidence scope. No substitute resident implementation or nonexistent package export was added.

The pre-existing modification to `iteration9-check-results.md` was preserved without editing or staging it; it is a control-plane output.

## Implemented work

### Final-contract validator

Extended `scripts/validate-final-contracts.ts` from the Plan 1 nine-owner/seven-entry check to the Plan 2 eleven-owner/eight-entry contract.

- Read the six revised Plan 2 declarations and retain the other five from the archived Plan 1 review. Expand every abbreviated unchanged list from that archived review, never from the installed declaration being validated.
- Compare parsed declaration selections, including names, aliases, paths, tags, destinations and wildcard versus named form. Preserve the validator's existing equivalence for comments, formatting and grouping of atomic named selections.
- Check each owner's first README paragraph against its recorded purpose.
- Preserve real `validateProject` linking so declarations must select real original exports; independently require the exact eleven owner names.
- Merge the reviewed package addition with the unchanged Plan 1 metadata, require exactly eight exports and the unchanged bin/main/types/type fields, and require every import/type target to be a file.
- Resolve and import entries in a bounded Node subprocess whose cwd is the supplied package. This prevents a relocated-package check from accidentally resolving this validator's own checkout. Preserve the executable shebang check.
- Report all owner mismatches alongside package-map failure, then exit nonzero. There is no mode that accepts the staged subset as final.

Positive and negative fixture controls cover abbreviated-list drift, removed or additional exposures, wrong paths/tags/destinations/purpose, all eight runtime/type targets, missing declarations, a missing client map entry, a broken imported module in the supplied package, and a missing shebang. These package fixtures verify validation mechanics; they are not an implemented resident package.

### Descriptions and README purposes

Activated root R7's complete currently implemented subset: 27 resident identity, watcher/clock, lifecycle/discovery and controlled-test-port names. All originate in the existing daemon or contexts owner and already have the required to-parent exposure; root preserves their names and tags and exposes them to descendants. This introduces no public original.

Updated the four outstanding README first paragraphs (root, analysis, project and CLI) to owners.md. Each immediately distinguishes its final responsibility from its incomplete implementation. Direct comparison verified all eleven purposes. The other seven README files were unchanged.

Five declaration texts still lack exports supplied by the missing predecessors: root, analysis, project, daemon and contexts. The validator reports each one. The other six declarations match the reviewed final selections. No nonexistent exposure was installed. Package.json still has seven entries, with the unchanged bin; adding the client entry requires its real implementation.

### Compiled entry boundaries and harness

Added root `src/tests/entry-boundaries.test.ts` and shared testing-only `entry-boundary-cases.ts`. Both the owner tests and reference handlers execute the same real compiled-process assertions through the existing preload. Every run owns a unique RAMIFY_ENDPOINT_DIR, checks that no endpoint artifact was created, and removes it in finally. Existing process tracing verifies child exits and cleans observed descendants.

Registered these process witnesses under the cli capability:

| Instance | Executed expectation |
| --- | --- |
| I2-19:help-version-unchanged | Both actual compiled commands retain Plan 1 usage/version assertions, exit 0 with empty stderr, load the CLI handler but no engine/compiler/host/UI stack, and perform no connect, spawn, alternate launch, listen or bind. |
| I2-19:batch-no-daemon | Compiled human and JSON batch checks on an isolated unchanged reference copy; positive batch/analysis loads in the CLI, compiler package absent from the CLI, no daemon host/contexts/UI, no connect/listener/alternate launch, only finite compiler-helper launches, all observed children and file handles released. Human output has exactly one Mode: batch after Configuration; JSON equals the real Plan 1 batch API serialization byte for byte after substituting only runId, including the final newline. The real API must independently report a clean completed project; the reference baseline asserts fifteen owners. |

The three remaining I2-19 records have no handler: daemon-entry-boundary, cli-check-boundary and status-no-start. No fake service, skipped test or unavailable-command result receives their credit.

The runtime registers only cli and harness-gate; cli availability allows these two named witnesses to execute, and missing resident CLI handlers remain explicitly unexecuted. Updated the existing Plan 2 harness test expectations from four to six executed instances and from missing-capability to missing-handler for absent resident CLI work. No Plan 1 record or expectation changed.

The existing reference report already inventories every declared Plan 2 capability. Its dry run now shows cli and harness-gate available and the remaining ten capabilities unavailable, with execution status kept separate.

## Verification

Linux, Node v22.23.2.

| Command | Result |
| --- | --- |
| `npm run worktree:prepare` | Passed nested example/site dependency preparation. |
| `npm run build` | Passed, including after the final declaration change. |
| `npm run type-check` | Passed all four configurations with every new test and final relay. |
| `npx tsx .reference-work/iteration10-smoke.ts` | Passed validator positive/negative controls, all eleven README purposes and 53 compiled-process assertions on help/version and a small real batch fixture. |
| `npx tsx scripts/validate-final-contracts.ts` | Failed as required for the actual incomplete package: five declaration mismatches and missing eighth package export. Actual current declarations still link. |
| `node .reference-work/iteration10-self.mjs` | Passed isolated self-check/cleanup wrapper. |
| `npm run check:self` within that wrapper | Passed in batch mode: eleven owners, 178 source files, eleven resources, 2,059 accesses, zero errors, warnings, denials or analysis limits. This is not resident evidence. |
| `node dist/src/cli-entry.js daemon stop` within that wrapper | Exit 2, invalid-invocation: resident service not implemented. No daemon had started; the owned endpoint remained empty and was removed. |
| `npm run reference:verify -- --plan 2 --iteration 10` | Exit 1: 139 required, six passed, zero failed assertions, 133 required not executed. Across all 176 records, 170 not executed includes 37 future instances. Both implemented I2-19 cases passed. |
| `npm run reference:report -- --dry-run` | Passed capability inventory; no regression tiers or matrix execution claimed. |
| `git diff --check` | Passed. |

The first direct process smoke failed because the new assertion matched the owned TypeScript adapter directory as though it were the compiler package. Narrowed that assertion to node_modules/typescript and node_modules/@typescript, preserving the legitimate source-analysis/bridge/wire adapter loads. The rerun passed. No product defect was hidden or assertion expectation relaxed.

Added five tests: two root process cases and three validator cases, plus updates to the existing harness expectations. All type-check. Per the supplied automation-only check policy, no Vitest/Cucumber regression, scenario coverage or sealed-file check was run locally. The passing direct smoke and matrix witnesses do not claim a Vitest verdict. The non-dry reference report and full Plan 1 regression gate were not run because they execute those reserved runners.

Ignored evidence: `.reference-work/iteration10-smoke.ts`, `iteration10-smoke.json`, `iteration10-smoke.log`, `iteration10-contracts.log`, `iteration10-self.mjs`, `iteration10-self.log`, `iteration10-stop.log`, `iteration10-gate.log`, `iteration10-final-gate.log` and `iteration10-report.log`. Final portable matrix evidence: `.reference-work/reports/plan2-iteration10-66761f32-64fd-4364-8aa1-ecc0fbb3b392.json`. The earlier passing partial matrix run is preserved at `plan2-iteration10-b3027776-2e54-4a15-af14-9f718b27a0d2.json`.

## Remaining exit criteria

Functional requirements are not satisfied. Required work is five complete final declarations, the real eighth entry, the daemon and resident CLI traced closures, successful no-start status, resident self-check, and the missing predecessor capability evidence. Only two of five assigned instances have run. macOS process evidence remains outstanding.

Checklist: functionalRequirementsSatisfied false; newCodeCoveredByTests true; allNewTestsPass false pending the automated runner verdict. Passing static checks or draft publication must not be treated as final-package acceptance.

## Recommendations for Next Iteration

Restore the missing providers in their owning iterations, in dependency order: analysis/project resolution and retention; contexts; shared service and root assembly/quick environment; validated messages and client; host/daemon entry; resident CLI command and recovery integration. Resolve the recorded architecture-review disposition through the owning workflow.

Then complete the five declarations and client package entry, execute the remaining three I2-19 witnesses with real compiled processes and isolated endpoints, and rerun the strict validator, resident self-check and iteration-10 gate. Iterations 11–14 cannot rely on a completed resident package from this checkpoint. Retain the independent expectations and do not weaken the final-contract or matrix gates to accept these missing providers.

## Single self-assessment remediation attempt

**Recorded:** 2026-09-11T08:46:18.837Z. This attempt began at `dc6210e` in the same authoritative checkout and branch. Re-read iteration 10's scope, the implementation/testing/bugfixing skills, package activation contracts, current entry sources and the existing validator coverage. Live workflow detail reports iteration 10 at `validate_output_retry`. No iteration-10 check-results file or automated regression verdict is available in this checkout.

The prerequisite audit is unchanged: incremental/project resolution, context manager, complete service/message/connector contracts, resident assembly, client and daemon entries, and resident CLI dispatch are absent. Completing those predecessor owners remains outside this iteration's final-declaration/package-validation/boundary scope. Their absent exports still prevent five final declarations, the eighth real package entry and three I2-19 process witnesses.

### Focused repair: reject incomplete package entry exports

Found and reproduced a gap in iteration 10's own validator: an eight-entry package whose client file contained only `export {}` was accepted because the probe verified file resolution and import success but never checked the public bindings. The pre-fix direct reproduction failed with `Missing expected rejection`, proving the false acceptance.

The validator now requires independently enumerated callable exports at every entry. It preserves Plan 1's representative portable entry witnesses, checks the six analysis operations (including `analyzeIncrement` and `resolveProject`) at both analysis aliases, and checks all five client exports specified in the package activation contract: `connectDaemon`, `selectEndpoint`, `readDaemonRecord`, `encodeMessage` and `decodeMessage`.

A second bounded Node probe resolves each entry under the `types` condition and compares it to the declared .d.ts target without executing that file. This detects condition ordering that would select the JavaScript target even though the types file exists. Both probes resolve from the supplied package directory.

Extended the existing validator test with callable fixture modules and controls for an empty client entry, each missing client export, a non-callable connector, either missing incremental analysis operation, and incorrect type-condition ordering. The valid eight-entry fixture passes before and after the mutations. These are validator fixtures only; they do not substitute for the missing resident service or receive matrix credit.

### Verification for this repair

| Command | Result |
| --- | --- |
| `npx tsx .reference-work/iteration10-entry-repair.ts` before the repair | Failed at the empty-client negative control with Missing expected rejection; the incomplete entry was accepted. Preserved in `iteration10-entry-before.log`. |
| Same direct command after the repair | Passed eight-entry import/type resolution and all ten missing-export/type-order negative controls, with a passing restored package. Preserved in `iteration10-entry-after.log`. |
| `npm run type-check` | Passed all four configurations, including the extended validator test. |
| `npx tsx scripts/validate-final-contracts.ts` | Exit 1 on the actual checkout: the same five declaration mismatches and missing eighth package export. Preserved in `iteration10-repair-contracts.log`. |
| `git diff --check` | Passed. |

All new reproduction fixtures were removed in finally. Only the validator and its existing test changed; no production source, description, README, package map, process handler or Plan 1 expectation changed in this repair. Build, self-check and the unchanged matrix were not rerun for this scripts-only repair. The previous gate result remains historical evidence: six of 139 required instances passed, zero failed assertions, 133 required unexecuted.

No Vitest/Cucumber regression, scenario-coverage or sealed-file check was run locally, following the original automation-only policy. There is no supplied failing-test output to repair or passing runner verdict to claim. The direct reproduction and type-check establish the focused correction, not the automated test-suite result. The five authored iteration-10 test cases, including this extended validator case, still await that verdict.

### Current checklist and handoff

- `functionalRequirementsSatisfied: false`: the validator gap is repaired, but the prerequisite provider chain and three resident boundary witnesses remain absent.
- `newCodeCoveredByTests: true`: the validator repair has positive and negative authored coverage.
- `allNewTestsPass: false`: no automated verdict is available; regression execution remains assigned to workflow automation.

Both deliverables are updated through MCP, and the repair is committed in the authoritative checkout. No publication call is made in this remediation; validation reruns and subsequent publication belong to the workflow. The provider-restoration recommendations above remain necessary before iteration 10 can be completed.

## Constraint remediation: README purpose selection

**Recorded:** 2026-09-11T08:49:24.891Z. **Finding:** `cf-constraints-mtwpqtv5-kkypm6g3`. This focused repair started at `4f585a5` in the authoritative checkout. The supplied and generated check results identify the README paragraph-selection contradiction; static analysis, scope review and sealed files passed. They contain no regression-test verdict.

The validator previously split README text on blank lines and selected the first block that did not begin with a heading marker. This incorrectly treated introductory lists, tables and fenced code as purpose prose, did not strip inline Markdown, and could discard prose placed immediately after a heading.

Changed only `scripts/validate-final-contracts.ts` and its existing validator test: `assertOwner` now calls the project owner's existing `readPurpose` metadata parser. It requires a present top-level prose paragraph and compares the parser's plain-text summary with the independently reviewed purpose. A README without prose fails explicitly. The parser, model document, declarations and production entry behavior are unchanged; no new parser, dependency or public exposure was added.

Added seven parameterized validator cases for unordered and ordered lists, tables with and without leading pipes, backtick and tilde fences, and indented code. Each verifies both a valid later purpose and rejection when no purpose exists. An additional case checks inline emphasis, links, code spans, entities and line joining, including prose immediately after a heading, and rejects an incorrect first paragraph even when a later paragraph matches.

### Focused verification

| Command | Result |
| --- | --- |
| `npx tsx .reference-work/iteration10-purpose-repair.ts` before the fix | Failed: the introductory list was compared with the reviewed purpose. Preserved in `iteration10-purpose-before.log`. |
| Same focused command after the fix | Passed all seven introductory-block positive/negative pairs, inline plain-text conversion and first-paragraph mismatch controls. Preserved in `iteration10-purpose-after.log`. |
| `npm run type-check` | Passed all four configurations with the new validator cases. |
| `git diff --check` | Passed. |

No Vitest/Cucumber regression, scenario-coverage, sealed-file or automated constraint check was run locally. The build and matrix gate were not repeated because this repair changes only the script's README comparison and its tests. Automated verification of the reported constraint remains with the workflow.

The separate self-assessment finding `iteration-self-assessment:10` remains decision-pending: this README fix does not supply the missing predecessor resident providers, five final declarations, eighth real entry or three resident process witnesses. `functionalRequirementsSatisfied` remains false. `newCodeCoveredByTests` remains true, with eight additional authored validator cases. `allNewTestsPass` remains false because there is still no automated test-suite verdict; focused reproduction success is recorded separately.

Both managed deliverables are updated via MCP and the focused fix is committed. Control-plane check-results were not edited. No publication call is made during this remediation.

## Regression remediation: root declaration parser fixture

**Recorded:** 2026-09-11T08:52:53.998Z. This repair started at `475c3cb`. The supplied automated regression output reports one failing test: `descriptions.test.ts > parses module.ramify to the reviewed statements`. The previous README constraint finding is now marked resolved, and the generated check results report constraints passed.

The regression was introduced when iteration 10 expanded root R7 to all 27 implemented resident names and moved it after the existing relays, without updating the descriptions owner's independent exact-statement fixture. The fixture still expected the four-name discovery relay in its former third position. Inspection confirmed the new declaration follows owners.md's staged R7 contract and that its names are already exported through daemon's N4/N5 contracts.

Updated only the root fixture in `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`: it now independently enumerates all 27 names in the declared order and expects the daemon relay last. The other eight root statements retain their existing expectations. Exact statement equality, aliases, destinations, tags, statement indices, raw token spans and the eleven-toolkit/fifteen-reference inventory checks are unchanged. No parser implementation, declaration, public API or .viz.feature scenario changed.

Verification: `npx tsc --noEmit` passed for the toolkit configuration that includes the affected test; `git diff --check` passed. The supplied automated failure is the reproduction evidence. No Vitest/Cucumber, scenario-coverage or sealed-file check was run locally, and no broader build or matrix gate was repeated for this fixture-only correction. The automated regression rerun must establish the passing verdict.

The earlier functional prerequisite gaps remain outside this regression repair. Checklist state remains `functionalRequirementsSatisfied: false`, `newCodeCoveredByTests: true`, and `allNewTestsPass: false` pending a successful automated rerun and the outstanding test evidence. Both managed deliverables are updated through MCP, and the fixture correction is committed in the authoritative checkout. No check-results file was edited and no publication call was made.
