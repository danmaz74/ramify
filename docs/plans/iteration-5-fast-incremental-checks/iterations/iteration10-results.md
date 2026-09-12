<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 10 results: Compact checks and the post-write adapter

**Date:** 2026-09-12. **Outcome:** the compact service reply, changed-file CLI and example adapter are implemented. All nine I5-11 instances passed on one coherent build: **125 assertions**, with eight process instances and one IPC instance. Automatic regression remains pending. The full prerequisite/iteration exit is **not established**: the supplied policy reserves regression runners for automation, the inherited Plan 2 measurement-provider dependency remains, and the dependency observations below remain open. No required instance was removed or waived.

## Implemented behavior

- Root's `CheckParams` adds optional `scope`, `since` and `deadlineMs`. Daemon service validation accepts only report/delta, a well-formed revision identifier, and positive safe integer deadlines up to 600,000 ms. Dispatch forwards these fields and defaults omitted scope to report. The six required counters already existed from iteration 9 and remain connected.
- CLI parsing accepts one or more changed paths, since and deadline; rejects missing values, duplicates, malformed revisions/deadlines, since/deadline without changed, and batch with changed. Help documents arguments and exits.
- The CLI obtains the selected root, canonicalizes the named paths, hashes their bytes itself, uses null for missing content, deduplicates equivalent paths, and submits synchronized expectations with delta scope. The default deadline is 2,000 ms. Original identities survive bounded connection recovery, so an intervening writer cannot be accepted through re-hashing.
- Changed checks emit exactly one `ramify.check/1` document in JSON mode. Covering revisions carry complete project findings, new marks, removed identities, warnings, coverage, checked set and timings. Completed clean checks exit 0; findings or invalid revisions exit 1; unverified, incomplete, cold, overdue, unobserved, superseded, evicted or unavailable outcomes exit 2. Interrupted work retains exit 130. No changed-file path invokes the batch operation.
- Human output prints located findings with new marks, warnings/limits, the revision path in its Mode line, and changed paths, checked set and wait. Plain report execution retains its existing implementation and bare `ramify.analysis/1` schema. Watch and daemon command implementation is unchanged.
- `CheckDocument` lives in `subs/cli/src/interfaces/cli.ts`, as the exact reviewed contract specifies; the iteration's mention of root `src/interfaces/cli.ts` referred to a nonexistent file. Existing wildcard exposures admit the added types. There are still eleven owners and eight package entries.
- `examples/hooks/claude-code-post-write.mjs` consumes actual stdin JSON, takes `tool_input.file_path`, invokes installed ramify from the file's directory, prints new findings to stderr with exit 2, and otherwise exits 0. Not-checked results produce one reason-bearing notice. Input and subprocess waits are each bounded to five seconds, with bounded buffers. It imports no toolkit source.
- The harness registers `hook-cli` and nine handlers in `plan5-hook-cases.ts`. Process fixtures install and invoke the package bin under unique endpoint directories, trace actual CLI socket writes and file reads, and stop/reap their daemons in teardown. A test-only socket probe rewrites a source file after CLI hashing to establish supersession. The IPC case sends malformed values through a real socket. Source provenance now includes `examples/hooks`.
- The staged declaration validator advances to iteration 10's reviewed CLI purpose. The Plan 2 human-output assertion now recognizes the already-required revision path; its identity/freshness expectations remain.

## Bounded prerequisite repairs

### Retention cleanup request completion

The supplied iteration 9 constraint finding was reproduced through the real daemon service with a scripted session. A second synchronized request arriving while report preservation was delayed was omitted from the rejection snapshot and remained queued after the context became cold.

After awaited preservation and disposal, the rejection now settles the current queue as well as the original request group. Both callers remain pending while oversized facts are retained; cancellation keeps its own outcome. The existing context regression now checks both requests, the retained-byte bound, no pending work and successful recovery.

- Before: the non-cancelled late request failed; the cancelled control passed.
- After: **2/2 focused cases, 34 assertions passed**, with resource cleanup.
- Receipts: `.reference-work/reports/iteration10-retention-before.json` and `iteration10-retention-after.json`.
- Commands: `NODE_OPTIONS='' node --import tsx .reference-work/iteration10-retention-check.mts before` and the equivalent `after` run. These use direct operations, not Vitest.

### Hook change classification

A real quick-service probe found that contexts queued every uncovered expectation as unknown, forcing broad session work even for a source-body or description edit. The context now adds a changed hint only when no watcher hint already exists. The observer determines actual creation/deletion and role; existing created, deleted and rename/unknown hints are preserved.

- Controlled hints: **5/5 cases, 20 assertions passed**, with teardown. Receipt: `iteration10-hook-hints.json`.
- Real source-body hook: unchanged-surface, one checked file and zero accesses.
- Real description hook: description path and the independently expected denial.
- Creation remains broad. These three steps pass the session audit and equal fresh batch reports.
- The four-step probe also retained a failing deletion equivalence assertion both before and after this fix. That separate dependency gap is described below; the whole probe is not represented as passing. Receipts: `iteration10-hook-classification-before.json` and `iteration10-hook-classification-after.json`.

## Coherent I5-11 evidence

Command: `NODE_OPTIONS='' node --import tsx .reference-work/iteration10-focused.mts`.

Receipt: `.reference-work/reports/iteration10-focused.json`, completed **2026-09-12T11:26:29.674Z**. It checks source and build identities before and after the entire run:

- Source SHA-256: `9259f7caaceec7fa43ab579734e11cf7109fee18b40d80a49ab76672d57ea384`.
- Build SHA-256: `022d2c69c6b96b82612ed92fa20fc406141ee00f206e876a19267da4da2ccff4`.
- Pre-commit HEAD: `aa166a8b6118331bddb99b0b7bf2320fceb93d3c`, with the implemented source bytes dirty.
- Node v22.23.2; TypeScript 7.0.2. The clean NODE_OPTIONS environment avoids the inherited worker-heap override described by the previous iteration.

| I5-11 subcase | Evidence | Assertions | Result |
| --- | --- | ---: | --- |
| changed-hashes-in-cli | process | 13 | CLI file read and exact outgoing hashes; absent identity; default deadline; covering reply adds no analysis and reads no project input during the check itself. Opening separately validates project/configuration selection. |
| changed-delta-document | process | 14 | One compact document; exactly one located new not-visible finding after remove-hop; exit 1; empty stderr; human rendering. |
| changed-exit-0-1 | process | 14 | Clean reference exit 0, removed exposure exit 1; covering revisions and independent finding expectations. |
| changed-no-batch-fallback | process | 8 | Failed-start override attempts twice then returns unavailable; no CLI batch/analysis/contexts/compiler loads or helper launches. |
| changed-exit-2-not-checked | process | 25 | Cold S1000 at 50 ms; warm broad deadline; outside-root path; rewrite after hashing; unavailable startup. All exit 2 explicitly. |
| since-evicted | process | 21 | Four publications under a real two-revision budget; evicted baseline returns exit 2 without invented marks. |
| plain-check-unchanged | process | 5 | Bare resident report equals batch except runId for the same invocation; fifteen clean reference owners; human revision path. |
| host-adapter-claude | process | 14 | Real stdin and installed executable; denial exit 2 on stderr, clean silent exit 0, unavailable one-line notice with exit 0. |
| service-params-validated | IPC | 11 | Eight malformed parameter combinations rejected without analysis; valid compact request still succeeds on that socket. |

Raw process commands, responses, traces and cleanup observations are linked from the receipt under `.reference-work/evidence/`. Every owned daemon is stopped; a surviving process fails the handler.

Earlier split runs are retained. The first adapter run failed because its baseline was opened from the project root while the adapter opens from the file directory; the required invocation refresh made the already-published finding no longer new. The final fixture establishes its baseline from the adapter's documented invocation and preserves the same denial assertion. Earlier split receipts have changing source identities and are superseded by the coherent run above.

## Other verification

| Check | Result |
| --- | --- |
| `npm run worktree:prepare` | Completed for the example and site. |
| `npm run build && npm run type-check` | Pass, including owned tests and harness compiler scopes. |
| `npx tsx scripts/validate-final-contracts.ts` | Pass: eleven owners, 273 declaration-inventory files, 82 expanded statements, eight entries and unchanged bin. |
| Direct real-session service probe | 51 assertions passed for validation, compact/default report, since eviction, deadlines and counters; `iteration10-service.json`. |
| CLI/root quick probes | Real flows cover multiple hashes/root discovery, reuse, provider denial/new/since/removal, deletion/unobserved paths, eviction, recovery identity preservation, cold/deadline, invalid and unpublished results, and cleanup. Vitest versions are authored and type-checked; these smoke probes are separate evidence. |
| `NODE_OPTIONS='' node --import tsx .reference-work/iteration10-resident.mts` | Pass with the same coherent source/build identity. Exercises nested invocation, JSON, since, multiple changed paths with 500 ms deadline, plain JSON and resident checks. |
| `npm run check:reference`, owned endpoint | Completed, complete coverage: fifteen owners, 54 source files, 294 accesses, zero errors, two expected warnings, zero limits. |
| `npm run check:self`, same owned endpoint | Completed, complete coverage: eleven owners, 266 source files, 3,427 accesses; zero errors, warnings or limits. |
| Owned daemon stop; `git diff --check` | Pass. |

Resident receipt: `.reference-work/reports/iteration10-resident.json`, completed 2026-09-12T11:25:48.785Z. Cold setup uses a 30-second observation deadline; covering/default-deadline behavior is established separately by I5-11. This is functional evidence, not iteration 12's latency measurement gate.

**Reserved and not run locally:** Vitest/Cucumber regression, scenario coverage and sealed-file checks. The full Plan 1 and Plan 2 gates, the full iteration-10 prerequisite gate and non-dry reference report are also unrun: they compose reserved runners and/or the inherited incomplete measurement providers. No automatic verdict is claimed. The checklist distinguishes authored coverage and passing focused handlers from a fully passing automatic regression.

## Recommendations for Next Iteration

1. Run automatic regression and acceptance checks on this draft. All nine I5-11 providers are available; no later capability is represented as executed.
2. Resolve the inherited dependency between iteration 9's full Plan 2 gate and iteration 12's resident measurement-provider migration. All nonsuperseded I2 obligations remain required.
3. Address the independently reproduced deletion input-identity discrepancy in the analysis/project/compiler owners before live-equivalence acceptance. After deleting the provider source, retained observations keep absent probes for `subs/package.json` and `subs/provider/src/package.json` that fresh batch omits; inputId differs while the session audit reports equal. This existed before the hook-hint repair and remains afterward. The failing receipt preserves the actual difference.
4. Include changing invocation directories in live integration review. Under the current invocation contract, changing cwd can add a revision and clear default new marks on findings already published by the watcher; the adapter test therefore uses its actual file-directory invocation consistently. The mixed-invocation resident smoke also observed a plain report retaining the earlier found-root provenance after a later explicit-root invocation. Its raw output is retained for dependency diagnosis; same-invocation report equality does not establish that transition.
5. Keep the inherited macOS worker/process requirement, observer disagreement-propagation limitation and iteration 12 latency/memory obligations explicit. None is waived here.

Iterations 11 and 12 can consume the installed CLI, compact document, validated service parameters, hook example and registered process handlers. No model rule, new owner, package entry, transport frame, persistent cache or inspection command was added.

## Focused self-assessment retry

**2026-09-12:** the workflow was inspected at `validate_output_retry`. Its journal records the draft publication, but no iteration-10 regression execution or verdict exists yet. The required automatic runners were not invoked locally. The two false checks therefore cannot be replaced with a passing-regression or complete-exit claim.

This one bounded attempt added previously missing coverage of **exhausted in-flight recovery**, distinct from the already-tested failed initial connection and successful recovery. The CLI owner's `changed-command.test.ts` now invokes a same-owner `exhausted-recovery.ts` witness for unavailable, explicit stop and incompatible terminal recovery.

Each witness uses the real quick service and retained analysis to complete a clean covering revision. It then injects loss of that response at the connection boundary, changes the file on disk and exhausts recovery. Its independent expectations require one automatic recovery, no further check, exactly one `ramify.check/1` not-checked document with exit 2 and the original hash, no claimed revision or findings, no batch call, and connection cleanup before output. Real service counters establish zero connections, subscriptions and pending request leases; disposal establishes zero watcher handles and timers.

**Result: 3/3 witnesses, 54 assertions passed.** No production defect was reproduced, so production implementation is unchanged. The added parameterized Vitest registrations remain unexecuted by Vitest; the focused receipt establishes only these three directly invoked quick witnesses.

| Verification in this retry | Result |
| --- | --- |
| `NODE_OPTIONS='' node --import tsx .reference-work/iteration10-exhausted-recovery.mts` | Pass: unavailable, stopped and incompatible, 18 assertions each. |
| `npx tsc --noEmit` | Pass, including both changed test files. |
| `git diff --check` | Pass. |
| Reserved regression, scenario coverage, sealed-file checks and full prerequisite gates | Not run. No new verdict is claimed. |

Receipt: `.reference-work/reports/iteration10-exhausted-recovery.json`, completed **2026-09-12T11:31:53.059Z**. The same committed test witness supplies the direct checks and Vitest registrations. Source/build identity remained coherent throughout this focused run:

- Base HEAD: `b1706f7c398cf368cd8cc488000670f674987550`.
- Source SHA-256, including the new tests: `6e8c5fe9d6f55f7992fc0bc7e955884fd49232cfb7d0c1489d75aca097095c16`.
- Unchanged production-build SHA-256: `022d2c69c6b96b82612ed92fa20fc406141ee00f206e876a19267da4da2ccff4`.
- Witness SHA-256: `5003607d77b16dbebea53fa74d5b594c643f19e5aa8efeca7ce08ad9006542f5`.

The earlier nine I5-11 process/IPC results and resident checks remain evidence for the unchanged production implementation; they were not repeated for this test-only addition. The new witnesses do not replace those process/IPC instances.

Checklist disposition remains **functionalRequirementsSatisfied: false**, **newCodeCoveredByTests: true**, **allNewTestsPass: false**. The full iteration exit still lacks its required prerequisite-gate evidence; the inherited Plan 2 measurement-provider migration and the recorded deletion/input-identity and mixed-invocation gaps remain open. Their owning implementation and later measurement work were not expanded into this CLI coverage attempt. Complete execution of all newly authored tests also remains unconfirmed until automation runs. No requirement, record or assertion was waived.

Both managed deliverables are updated for this attempt. The primary agent commits these test and report changes on the authoritative worktree branch. No publication tool is called; validation and publication proceed through the supplied workflow retry.

## Constraint remediation: preserve received findings and release cancelled connections

The automatic constraint review reported two concrete defects in the new changed-check handler: `cf-constraints-mtyb7inp-6lezlbsv` (findings lost when cleanup rejects) and `cf-constraints-mtyb7inp-ahdbq4pm` (connection leaked when cancellation arrives as connect completes). This remediation addresses both in `subs/cli/src/changed-command.ts`. It does not change a model rule, public contract, scenario mapping or prerequisite gate.

A successful check return previously passed through an awaited cleanup block before reaching the command's result variable. If either cleanup operation rejected, the outer catch replaced the received diagnostics with an empty unavailable document. The handler now retains a received report before cleanup. A cleanup failure still selects exit 2 and an explicit not-checked reason, while the single output document retains the received diagnostics, new marks, revision, original hashes and confirmed coverage, checked set, warnings, removals and timings. The same preservation applies to an unresolved opening report. Output remains after cleanup and outside recovery; no extra check, batch fallback or second document is introduced.

The cancellation check now runs inside cleanup protection whenever connect returns an acquired connection. A cancellation at that handoff closes the connection exactly once, opens no context, dispatches no check, returns 130 and emits no result document.

Three tests in the existing changed-command suite call a same-owner helper with the real quick service. Two start from a completed clean revision, introduce an invalid module name, receive the real covering invalid revision, and inject a failure during either closeContext reply delivery or connection.close. They require the independent invalid-name diagnostic with its new mark, exact retained result metadata, one unavailable exit-2 document, no repeated check/recovery/batch, and completed cleanup before output. The third aborts immediately after quick.connect returns and requires exit 130, no stdout and zero remaining connections. Every case also checks request/subscription leases and disposes watchers, timers and temporary files.

| Focused verification | Result |
| --- | --- |
| `NODE_OPTIONS='' node --import tsx .reference-work/iteration10-cleanup.mts before` | All three cases fail for the reported defects: both cleanup cases lose the received diagnostic; cancellation leaves the connection open with zero close calls. |
| Same command with `after` | **3/3 cases, 38 assertions pass**, including resource cleanup. |
| `npm run type-check` | Pass across all four TypeScript scopes, including the new owned tests. |
| `git diff --check` | Pass. |

The before and after receipts are `.reference-work/reports/iteration10-cleanup-before.json` and `iteration10-cleanup-after.json`. The after run completed at **2026-09-12T11:38:42.316Z**, using source SHA-256 `c0937800514f51d84725e3f16623da116ae9b0a87ef95a0ee5d230bea2cc4d1a` on pre-commit HEAD `36635a9a9034ac429172118cd34fb0aae709c8f8`. Source and build identities stayed unchanged during each run. The direct runner executes the changed CLI source; its real retained worker uses the unchanged prior build identified in the receipt. This is focused quick-service evidence, not a newly built process/IPC acceptance run. An initial invalid-at-open reproduction is preserved as `iteration10-cleanup-before-initial.json`; the final fixture adds the clean baseline to prove preservation of a new finding as well.

No reserved Vitest/Cucumber regression, scenario coverage, sealed-file check, full prerequisite gate or measurement run was executed locally. Automatic constraint revalidation and execution of the newly registered Vitest tests remain pending. The earlier nine I5-11 process/IPC results were not rerun and are not represented as current full-gate evidence.

The decision-pending self-assessment remains separate: `newCodeCoveredByTests` is true; `functionalRequirementsSatisfied` and `allNewTestsPass` remain false. The broader prerequisite, measurement-provider, deletion/input-identity and mixed-invocation gaps recorded above are outside this bounded repair and remain unwaived. Both managed deliverables record this state. The primary agent commits the repair on the authoritative worktree branch and leaves revalidation/publication to the workflow.
