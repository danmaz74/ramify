<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 15 results: Self-check, relocation, measurements and Plan 1 handoff

Status: Plan 1 complete. The unfiltered 308-instance gate passed on the merged `main` at `f5b0939` on 2026-09-10; see [Plan 1 completion on main](#plan-1-completion-on-main-2026-09-10). The sections before it record this iteration's execution as it happened, while acceptance was still pending.

## Scope and verification policy

Work began at `5640de98f2f046aea3b266a781be58eaf811da6a` on `workflow/iteration-1-project-verifier` in the authoritative execution checkout. Workflow detail confirmed iteration 14 completed with accepted publication and iteration 15 running. Read CLAUDE.md, the development guides, iteration-work/testing/bugfixing skills, reviewed scope/contracts, memory lifecycle and roadmap handoff requirements.

Implemented the three iteration-15 providers, self-check, independent package relocation, measured batch workloads, necessary memory corrections and current usage/status documentation. All 308 reviewed instances retain their membership, expectations and prerequisites. No model principle, exposure declaration, public report schema, fixture workload, budget or production exclusion was weakened. No daemon, persistent cache, worker pool, alternative checker, MCP or browser verifier was added.

The execution prompt explicitly reserves local Vitest/Cucumber regression, scenario coverage and sealed-file checks to workflow automation. Consequently, `npm test`, `npm run reference:cases`, the unfiltered `reference:verify`, executing `reference:report`, and the relocated `npm test` were not run locally. Both full report/gate commands invoke those regression tiers. Their unrun status is explicit; a dry run and the focused providers do not substitute for them. Automated acceptance remains with Studio.

The existing control-plane change to iteration14-check-results.md was left untouched and excluded from the implementation commit.

## Delivered behavior

### Toolkit checking and its independent negative

- Added `npm run check:self`, invoking the compiled CLI on the toolkit root.
- Enabled `allowJs` in the whole-project compiler configuration. Self-check initially exposed two compiler-blocked coverage notes for the owned `src/tests/process-probe.mjs`; its source now enters the real compiler program and its imports are checked. This closes an actual scope gap without excluding a file or changing an exposure.
- Registered `I1-27:self-check` and `I1-27:self-negative` in the existing harness. Each starts from an isolated, compiler-valid clean toolkit and independently asserts all nine owners, every owned runtime/test/resource file, complete source catalogs, zero outside-source warnings and no example/site/scripts source in catalog, accesses or walked areas.
- The negative adds exactly the reviewed layout probe importing root's `BatchInvocation` type. Visibility is independently proven through root's descendants exposure. The expected result is one located `required-importer-tag` denial because ordinary browser layout lacks `dispatch`, retaining the root original and declaration evidence. The fixture stays valid TypeScript.
- Both toolkit cases compare the complete public API and compiled JSON report, omitting only the fresh run UUID.

### Independent relocation

Registered `I1-28:relocated-package` with an external temporary work root. The full provider copies without dependencies, build outputs or git data; verifies that it is outside the checkout/enclosing repository; installs root and reference dependencies from their own lockfiles; builds from source; type-checks; and unconditionally runs the copied toolkit's `npm test`.

It also packs the actual package, installs the archive into a separate consumer with production dependencies only, resolves and loads all seven package entries locally, and exercises the installed executable. The clean reference, removed W2 router relay and restored positive control must return the independently expected clean/denied/clean results. The installed denial retains the original catalog router and root importer/source location.

Relocation strips ambient loaders, NODE_PATH, package prefixes and checkout PATH entries. Its npm download cache is only a content-addressed download cache, not a module-resolution source. Dependency and package paths must resolve inside the relocated installation. The fixture is removed on success and can be preserved on failure.

A real relocation attempt exposed a harness defect: colons in matrix IDs split npm's POSIX PATH and prevented fixture-local executables from resolving. Temporary directory components now replace colons with hyphens while preserving the recorded matrix IDs and unique run directories. Focused isolation tests cover local npm bins, sanitized child environments, external roots, successful cleanup and failure preservation.

The local smoke deliberately invoked the install/build/type-check/package/CLI portions only. Its 61 assertions passed in 29,355 ms. It does **not** establish the full relocated-package matrix result because relocated Vitest remains unrun. The registered provider has no successful skip path for that test.

### Memory corrections

The measured checker initially exceeded its reviewed budgets. Corrected the causes in their owning runtime modules:

1. Project/configuration and source helpers reuse a 64 KiB synchronous receive buffer, avoiding repeated allocation while an empty pipe returns EAGAIN.
2. Analysis releases its compiler helper immediately after detached access facts arrive. The captured input view remains available for final consistency sealing. Existing error/finally cleanup remains, and the combined disposal time still counts against the unchanged deadline.
3. Final report copying shares equal frozen plain-data subtrees within one report. Per-call tables disappear after copying; separate reports retain no common runtime cache. Compact object allocation reserves the complete ordered property shape before assigning its children. This removes spare property storage without deleting fields or changing serialized values/order.

Report tests cover exact JSON preservation, input detachment, original/tag/value distinctions, independent calls, cycles, hidden/accessor/runtime state, sparse/undefined JSON normalization, escaped and integer-like keys, and prototype-sensitive property names. Session plain-data validation now permits repeated references to already validated immutable subtrees while still rejecting cycles. Input acquisition and validation cloning are unchanged.

### Harness and documentation

- Added `npm run measure:batch` and checked-in setup, cold-process, repeated-session and canonical 100-owner materialization recipes.
- Registered all three final providers; removed the old iteration-14 cutoff from executing `reference:report` success. The report command keeps `planComplete: false`; the explicit matrix gate owns its matrix-completion flag, and separate resource/overall acceptance remains visible.
- Strengthened execution identity to include the root declaration/README and reviewed matrix artifacts. Portable paths retain their separators; pending completion obligations reflect actual instance outcomes.
- Updated CLAUDE.md, package README, development guidance, memory documentation, harness documentation and roadmap status to the implemented batch scope. Added the [batch usage guide](../../../../development/batch-verification.md). Future runtime capabilities remain explicitly unavailable.

## Current source scope and results

Both compiled commands completed all eight required stages and all thirteen requested engine capabilities with complete reported source coverage:

| Measure | Unchanged Collection Review | Toolkit self-check |
| --- | ---: | ---: |
| Owners | 15 | 9 |
| Source files | 54 | 143 |
| Resources | 5 | 7 |
| Catalog originals | 89 | 446 |
| Accesses | 294 | 1,781 |
| Allowed application decisions | 166 | 1,320 |
| Proven external selections | 128 | 461 |
| Denials / errors / source coverage notes | 0 / 0 / 0 | 0 / 0 / 0 |
| Outside-source warnings | 2 | 0 |

Reference warnings remain the two independently configured source files, vite.config.ts and vitest.config.ts. The HTML/feature resources retain their explicit catalog state; unimported opaque resources are not silently assigned TypeScript exports. The toolkit's example, site and scripts have separate configurations and produce no toolkit source results. All owned testing areas remain included in checking; production selection excludes them independently.

Final declaration validation reports nine owners, 150 inventoried source/resource files, 59 expanded statements, seven package entries and `dist/src/cli-entry.js` as the executable. The final production build has 182 JavaScript/declaration artifacts.

These clean results do not resolve the separately inherited loader finding listed below.

## Executed instance evidence

The final focused run required only ten explicitly selected providers, preserving the reviewed inventory for every other instance. It passed all ten with 356 baseline/result assertions and no inventory error. The full report remains `planComplete: false`; the other 298 instances were intentionally not executed in that local run, not removed from the actual runtime.

| Instance | Baseline assertions | Result assertions | Duration ms |
| --- | ---: | ---: | ---: |
| I1-27:self-check | 31 | 32 | 21,887.742 |
| I1-27:self-negative | 31 | 15 | 22,457.020 |
| I1-27:cancel/acquisition | 12 | 9 | 1,239.038 |
| I1-27:cancel/catalog | 12 | 10 | 1,939.270 |
| I1-27:read-failure | 12 | 15 | 2,057.996 |
| I1-27:dispose/completed | 12 | 12 | 1,870.591 |
| I1-27:dispose/in-flight | 12 | 9 | 1,411.426 |
| I1-27:report-retention | 12 | 72 | 22,965.397 |
| I1-29:changed-input/once | 12 | 13 | 2,982.903 |
| I1-29:changed-input/repeated | 12 | 11 | 1,997.719 |

Cancellation reaches the actual acquisition/catalog barriers, returns no successful result and satisfies the five-second cleanup bound. Read failures retain located incomplete/blocked outcomes and a fresh positive control. Disposal is idempotent and refuses later work. The retention case executes five warmups and 25 retained reports. Input mutation either stabilizes through a coherent fresh acquisition or exhausts the exact finite retry budget without mixed-state success.

Harness capabilities remain acquire, build-selection, catalog, cli, coverage, harness-gate, lazy, link, metadata, namespace, parse, registry, regression, resources, session, static-access, symbol-free and tags-origin. Availability is distinct from execution.

Iteration 14's accepted 305-instance evidence is predecessor evidence at its recorded build. It is not combined with this run into a fictional current 308-instance pass. The final unfiltered gate must still run. It ran on `main` on 2026-09-10; see Plan 1 completion below.

## Batch measurements and agreed budgets

The [recipes](../../../../../scripts/measurements/README.md), [summary](../../../../../scripts/measurements/results/README.md) and [lossless archive index](../../../../../scripts/measurements/results/index.json) retain the input fixtures, runtime/dependency versions, raw samples, earlier failures and final outcome. Budgets are unchanged from [scope.md](../scope.md#workload-measurements-and-proposed-initial-limits).

The final quiet all-phase run executed from 06:35:06.681 to 06:41:49.540 UTC on 2026-09-10, Linux x64, Node v22.23.2, TypeScript 7.0.2 and tsx 4.23.13. It exited 0 with both workloads passing every numeric and lifecycle requirement.

| Measurement | Reference result / limit | 100-owner result / limit |
| --- | ---: | ---: |
| Median of five cold compiled CLI checks | 4.045 s / 5 s | 6.360 s / 15 s |
| Combined sampled parent/helper/native peak RSS | 502.328 MiB / 512 MiB | 365.270 MiB / 768 MiB |
| Last twenty samples: heap growth minus retained serialized report bytes | -4.962 MiB / 16 MiB | -73.811 MiB / 16 MiB |
| Last twenty samples: RSS growth | 31.855 MiB / 64 MiB | 58.516 MiB / 64 MiB |
| Maximum session.dispose after completed analysis | 0.446 ms / 5,000 ms | 0.555 ms / 5,000 ms |

Each workload ran five warmups and 25 measured cycles, retaining all 25 full frozen plain reports: 44,767,075 serialized bytes for the reference and 174,157,850 for the synthetic project. Every cycle returned active sessions, reachable disposed-session WeakRefs, open input handles, helpers/native descendants and analysis timers to zero. Reference file opens/closes balanced at 58,050, synthetic at 129,960; each workload started and closed 60 helpers. Input identities stayed stable and all 25 run identities were distinct.

The canonical synthetic fixture retains the reviewed 1,402 files / 1,164,385 bytes, with 100 owners, 1,100 TypeScript files, 100 CSS resources and the original testing classifications. Its frozen authored-content hash is `d5b77b9ff57c443b35f386f40598506ff20c51c4ec75b800371f0cec089c0897`. The unchanged reference authored map is `626a8e7b81df9aae566b585c87b971e11d1e367d9fa4dded746bbd3839a04bff`.

RSS increased monotonically because the workload intentionally keeps reports. This was investigated: paired setup and repeated samples show the retained report footprint, adjusted heap declines, and all session/resource counters return to zero. RSS is tested without subtracting report bytes; both results pass the unchanged 64 MiB limit. This finite evidence does not claim a universal leak-free result or a resident-service plateau.

Completed-session disposal is short because analysis has already released its compiler/input resources. It does not replace the separate cooperative cancellation cases. Cold latency includes process startup and JSON drain; OS page caches were not flushed. Combined RSS conservatively counts shared mappings multiple times, and 50 ms sampling may miss shorter peaks. Actual sampling gaps are retained. Forced GC is diagnostic only. Tooling supports POSIX Linux/macOS; these actual measurements establish Linux evidence, not a macOS run.

Earlier failures remain archived: reference peak 526.770 MiB, initial adjusted heap growth 21.138/86.598 MiB and synthetic RSS growth 220.699 MiB; a first sharing fix still had synthetic RSS growth 77.023 MiB. The final compact allocation followed a real object-shape census showing about 17% lower retained synthetic report heap. No workload or target was reduced. A deliberately interrupted recorder retained 19 samples and an explicit parse failure, exited 1 and left no observed owned process.

## Verification commands and limits

Passed in this execution:

- `npm run worktree:prepare`.
- `npm run build`, including the final compact runtime build and the independent relocated clean build.
- `npm run type-check` across toolkit, portable owners, scripts and harness; final submission run passed.
- `npx tsx scripts/validate-final-contracts.ts`.
- `npx tsx scripts/reference-harness/validate.ts`: all 308 records, pointers and prerequisites valid; inventory only.
- `npm run check:reference` and `npm run check:self` on the final build.
- The ten real architectural/lifecycle providers above, using the existing runner, with source/build identity stable across execution.
- The explicitly partial relocated install/build/type-check/package/CLI smoke, 61 assertions.
- `node scripts/measurements/run.mjs --output .reference-work/reports/iteration15-measurement-compact-final.json`: final all-phase measurement.
- `npm run reference:report -- --dry-run`: inventory only.
- `npm run diagrams`: nine SVGs generated, with no tracked diagram artifact changes.
- `npm run site:build`: client/server build passed. Presentation/model/site inputs were unchanged by subsequent report-allocation edits.
- Measurement script syntax/type checks; lossless validation of all eight measurement archives; `git diff --check`.

No local Vitest/Cucumber, scenario coverage or sealed-file pass is claimed. The requested full validation sequence cannot be claimed as executed in order under the supplied automation policy. Current automatic regression, the unfiltered matrix gate and relocated toolkit tests remain required. All three ran afterwards on `main`; see Plan 1 completion below. Diagram artifact equality preserves existing emitted semantics; a site build does not independently prove browser interaction or browser-promise verification.

## Portable evidence and identity

The [focused/relocation archive](../../../../../scripts/reference-harness/evidence/README.md) contains actual assertion records, scope, diagnostics/coverage and run observations. Its uncompressed size is 7,680,270 bytes, gzip size 610,846 bytes and raw SHA-256 is `2123ff38d2daaef3702ea90055c3c3bd05c715b1e1696180fc47cfb204f33fce`.

The focused run lasted 80,912.794 ms from 06:45:13.708 to 06:46:34.621 UTC. It records revision `5640de98f2f046aea3b266a781be58eaf811da6a` with dirty implementation source and source SHA `84c97ff9bbb122597b5550f1fec2f43dc10acc61be1824f7b839ffb67f0b0ad9`. That source hash predates this archive's final rewrite and README update; it is not the final commit's source hash. No runtime source changed afterward.

The final 182 build artifacts have two different, documented hash recipes over the same bytes:

- Harness sorted path/NUL/content/NUL SHA: `435bd02d03e953fd753479b086365e8e5a2570af9d8c9a6564b8412746df4cb4`.
- Measurement tree-of-file-SHA identity: `03f2de7666a273cb5b0e18bc81507abacc0e8b1f86df33b652a7e8726fcdc6f3`.

The final measured and focused runtime builds match through those recorded identities. Raw archive payloads are retained without edits; the index records raw/compressed hashes and zero gzip timestamps. Root/dependency/scratch locations in portable architectural evidence are labels, not machine paths.

Supporting ignored logs use `iteration15-submission-*`, `iteration15-final-instances.log`, `iteration15-relocation-compact.log`, `iteration15-compact-build.log`, `iteration15-final-diagrams.log` and `iteration15-final-site.log` under the execution's temporary log directory. Reproducible recipes and portable evidence are checked in; absolute machine log locations are not the handoff authority.

## Plan 1 completion status

| Main-plan obligation | Evidence / remaining work |
| --- | --- |
| Unchanged reference, fifteen owners and required source forms | Passed in the gate on `main`: the compiled check is clean with complete coverage, and every I1-01–I1-30 instance executed and passed. |
| Every required I1 subcase executed independently | 308 of 308 required instances passed with 11,917 assertions and 4,058 baseline assertions; none was skipped. |
| Invalid inputs, denials, warnings, limits and unavailable execution distinct | All matrix instances covering these outcomes passed in the same run. |
| Compiled CLI, direct API and harness agreement | Toolkit self-check, independent negative and installed relocation instances passed. |
| All implemented toolkit runtime and owned tests declared/checked | Self-check over nine owners and 144 source files passed with no analysis limits; the audited Vitest runs pass all 961 toolkit tests. |
| Application/protocol/Cucumber/toolkit/diagram/site regression | Reference type-check, Vitest, build and Cucumber tiers passed inside the gate and the report; diagrams and the site build passed on `e048d51`. |
| Package boundaries and lightweight startup | The relocated package installed, built, type-checked and ran its own test suite inside the gate; the compiled CLI process instances passed. |
| Cancellation, failures, repeated use and disposal budgets | Lifecycle instances passed; the merged-main measurement passed every reviewed budget. |
| Independent relocated install/build/test/run | `I1-28:relocated-package` passed, including the relocated `npm test`. |
| Completion report and Plan 2 inputs | This report; Plan 2 inputs are recorded below and in the roadmap. |

## Plan 1 completion on main (2026-09-10)

After this iteration was accepted, the end-of-workflow review produced four risk findings and left one constraint finding open. Commit `e048d51` fixed the four: the harness fixture path, the CLI's exit 130 window between the complete JSON document and its trailing newline, `createRequire` loader recording, and shared-global coverage notes for script source. Commit `581f2f3` fixed the constraint finding: a named selection that receives a module namespace now propagates that module's completeness, so forwarders of an incomplete or ambiguous namespace receive a located `incomplete-exports` note. Both commits were audited with the full toolkit Vitest suite and the type-check passing. The workflow branch was merged to `main` as `5b943e1`, and `f5b0939` committed the plan's relocation to `docs/plans/done/`.

- Completion gate: `npm run reference:verify -- --plan 1` at `f5b0939` on a clean tree, from 21:19:02 to 21:34:04 UTC, 902,129 ms. Result passed, `planComplete: true`, 308 required, 308 passed, 0 failed, 0 not executed, no inventory issue, 11,917 assertions and 4,058 baseline assertions. Source SHA `5271fb2e34c4f4a6209d574f9242e681b085ca7529f56ca16c2f1322c461ddad`, harness build SHA `a2a0148124f14bad145e8779f0be66731ab3e6cdd83ebd41ea4b0b110f9c91b4`, Node v22.23.2, TypeScript 7.0.2. The portable report is archived as [plan1-complete.json.gz](../../../../../scripts/reference-harness/evidence/plan1-complete.json.gz); the [evidence README](../../../../../scripts/reference-harness/evidence/README.md) records its hashes.
- Validation sequence on the built `e048d51`, every command exit 0: `check:reference` (two configuration-file warnings, no errors or limits), `check:self` (nine owners, no findings, no limits), `diagrams` (nine SVGs, unchanged), `site:build`, `reference:cases` (16 files, 241 tests), `reference:report` (0 violations, all four reference tiers passed, 308 instances passed) and `git diff --check`.
- Batch measurement on the same build, `node scripts/measurements/run.mjs` from 21:34:16 to 21:40:35 UTC: passed every reviewed budget for both workloads. Reference: cold median 3.648 s of 5 s, peak combined RSS 480.863 MiB of 512 MiB, adjusted heap growth -9.433 MiB of 16 MiB, RSS growth 21.594 MiB of 64 MiB, maximum disposal 0.474 ms. 100 owners: cold median 6.130 s of 15 s, peak 367.785 MiB of 768 MiB, adjusted heap growth -75.568 MiB, RSS growth 62.270 MiB, maximum disposal 0.570 ms. Archived as [merged-main.json.gz](../../../../../scripts/measurements/results/merged-main.json.gz) in the [measurement archive](../../../../../scripts/measurements/results/README.md).

Inputs carried to Plan 2, also recorded in the roadmap:

1. A `require` target that is a module file is recorded with coverage notes but is not resolved, so no testing-origin denial fires for it. Bare `require` shares that limit; resolving it is a resolution design decision.
2. `declare global` blocks inside module files pass silently. The model treats them as unverifiable, so they should receive the same shared-global coverage note that script source receives.

## Implemented contracts and Plan 2 starting requirements

The [reviewed contracts](../contracts.md), [owner/exposure map](../owners.md), [scope decisions](../scope.md) and actual source remain the authority. Start from these implemented names:

- `createAnalysisSession(AnalysisInputs)` returns a single-use `AnalysisSession` with `analyze({signal?})` and idempotent `dispose()`. `analyzeProject` is the disposable convenience binding. `acquireInventory` supports independent build selection. Public entries are the root/analysis, analysis/inventory, model, layout, presentation and CLI entries in package.json.
- `AnalysisInputs` carries explicit `ProjectRequest`, one resolved registry, requested capabilities and finite limits. Requests fix whole-project scope and discovered compiler configuration. Root dispatch supplies defaults; no project/registry configuration language was added.
- `AnalysisReport` schema is `ramify.analysis/1`. Preserve separate execution/check/coverage outcomes, stages, capabilities, inventory/purpose metadata, expanded exposures, source facts, decisions, warnings and coverage. Reports are frozen acyclic plain data; repeated subtrees may share identity within a report. Compiler programs, symbols, ASTs, handles and mutable caches do not escape.
- `ModuleId` follows declared parent/name identity, independent of grouping paths. `SourceArea.kind` is `ordinary | tests`, with its resolved profile. `OriginalId` is a code/resource object containing owner, owner-relative defining file and binding. Written/accessed files and forwarding origins remain separate from original identity; alias spelling and compiler IDs are not authority.
- Registry identities use `registry/1:` with canonical validated definitions. Batch UUIDs distinguish invocations. `input/1:` hashes describe captured root/configuration/scope/registry and influencing bytes, including relevant negative observations. They are neither context generations nor daemon revisions and make no latest-disk-at-exit promise.
- TypeScript 7.0.2 and its reviewed supervised `typescript/unstable/sync` integration remain pinned. Helpers read through the captured view; synthetic adjacent configurations include every owned compiler source and selected outside-module source without writing application config. Whole-view retry is finite. Resources retain their actual path identities under shared declaration shims.
- Existing ceilings remain 1,000 owners, 20,000 application files, 50,000 influencing files, 8 MiB/file, 64 MiB application bytes, 256 MiB captured/in-flight bytes, 1 MiB helper frames, 32 MiB reports, three acquisitions, 30 s total acquisition, 90 s source work, 120 s analysis and 5 s disposal; source/export/selection/diagnostic ceilings remain in scope.md.

Plan 2 must first resolve current acceptance and the inherited findings below, then review concrete resident contracts. Its contexts owner defines the `AnalysisDriver` port; root supplies the analysis-backed binding. Contexts own scheduling/publication and generation/revision/freshness; analysis owns computational invalidation; project owns coherent input acquisition; daemon owns local process/transport behavior. A single-use batch session is not a ready-made resident context.

Implement real retained contexts, watching/reconciliation, exact-content synchronization, ordered publication, bounded history/work/leases and context eviction. Define local IPC codecs, endpoint discovery, compatibility, backpressure and the distinct idle-exit/crash/explicit-stop recovery rules. Preserve the restricted terminating-CLI fallback policy; watch/MCP/web clients cannot silently start another analyzer. Use these fresh batch results as an oracle over identical inputs, retaining independent negative expectations. Measure resident entry footprint, multiple contexts, edits, history, queues and leases separately; batch limits do not establish those costs.

Inspection stays Plan 3, Ramify MCP Plan 4, overlays Plan 5 and explorer/web Plan 6. Browser tag matching is available; browser-verification requests remain unavailable.

## Recommendations for Next Iteration

The two predecessor findings carried by this iteration, the CLI exit 130 publication boundary and the `createRequire` loader coverage, were repaired in `e048d51` with independent witnesses; see Plan 1 completion above. Plan 2 inherits two remaining analysis limits:

1. A `require` target that is a module file is recorded with coverage notes but is not resolved, so no testing-origin denial fires for it. Bare `require` shares that limit; resolving it is a resolution design decision.
2. `declare global` blocks inside module files pass silently. The model treats them as unverifiable, so they should receive the same shared-global coverage note that script source receives.

Do not reinterpret these as accepted architectural exceptions; decide them in Plan 2's detailed plan or carry them as explicit coverage limits.

The family catalogue remains broader than this matrix: K01–K04/K06 browser/tool execution, H02 interactive inspection, H04 and remaining composite-family obligations stay pending; P01–P06 remain non-normative probes. Remaining source adapters, compiler-source mapping, optional browser verification and independent policies are not completed by these instance passes. Keep per-instance execution and whole-family acceptance separate.

## Earlier workflow submission failure

The results write through workflow.write_iteration_results under attempt_ngipyAS6HUlbh1K1EP9t8 returned FRAME_MISMATCH: "The workflow worktree or sealed index no longer matches the active frame." A subsequent read-only workflow.get_publication_status returned STALE_ATTEMPT: "The workflow MCP session binding is unknown or stale." All workflow writes stopped immediately as instructed. Neither the managed results/checklist nor publication was established by this session.

Read-only diagnosis identified cucumber-viz 0.6.3, project /ramify, and the correct authoritative execution worktree and baseline. Its persisted snapshot still records iteration 15 at await_terminal with this attempt running; the latest journal transition is workflow.attempt-running at 05:53:23.634 UTC. This is a control-plane binding failure, not a failed Ramify check. No workflow state, sealed index, check output, service implementation or shared process was modified or restarted.

The complete failed/requested submission payload is retained as ignored recovery evidence in .reference-work/iteration15-submission-recovery.json. A fresh authorized workflow session must write these results and checklist via MCP, then commit those managed artifacts and publish. The implementation is committed on the authoritative branch separately to preserve the tested work. Reuse the exact build and portable evidence above; do not rerun or claim automatic acceptance merely to repair missing outputs.

Implementation preservation commit: `fd8a35199edb05ab21190ff2cb865a5e1b21a796` (`Implement iteration 15 self-check relocation and batch measurements`), 48 files, 2,291 insertions and 62 deletions. Final working-tree inspection leaves only the pre-existing iteration14-check-results.md control-plane change. Managed iteration15 artifacts and publication remain unsubmitted because the session binding is stale.

## Active-attempt submission recovery (2026-09-10 07:22 UTC)

This execution resumed iteration 15 at implementation commit `fd8a35199edb05ab21190ff2cb865a5e1b21a796` in the authoritative checkout, using attempt `attempt_QXckI8l0wznx-1B6QCZqF`. The workflow reports iteration 14 completed with accepted publication and iteration 15 running at await_terminal. The earlier STALE_ATTEMPT belonged to the preceding execution; this is the newly authorized attempt.

The implementation and checked-in evidence already existed. Reviewed the committed self-check, relocation, report allocation, compiler disposal and measurement changes, and the retained failed submission payload. No further application, test, fixture, configuration, model or budget changes were needed. The pre-existing iteration14-check-results.md control-plane edit was initially excluded from staging. Its unchanged generated bytes are included in the publication bookkeeping described below.

Fresh verification in this resumed execution passed, sequentially:

- `npm run worktree:prepare`.
- `npm run build`.
- `npm run type-check` across toolkit, portable owners, scripts and harness.
- `npx tsx scripts/validate-final-contracts.ts`: nine owners, 150 source/resource files, 59 expanded statements and seven package entries.
- `npx tsx scripts/reference-harness/validate.ts`: all 308 reviewed instances, pointers and prerequisites valid; inventory only.
- `npm run check:reference`: completed and passed with complete reported coverage, 15 owners, 54 source files, five resources, 294 accesses, 166 allowed, 128 external, zero errors/denials/analysis limits, and the two expected configuration warnings.
- `npm run check:self`: completed and passed with complete reported coverage, nine owners, 143 source files, seven resources, 1,781 accesses, 1,320 allowed, 461 external and zero errors/warnings/denials/analysis limits.
- `git diff --check`.

Logs are retained at `.reference-work/iteration15-resume-{prepare,build,type-check,contracts,inventory,check-reference,check-self}.log`. The current source identity is `58bf210e7ade39cd87d2527622bb07f4fb8811aab633748f53584cc65d5a794d`; the runtime build identity is `435bd02d03e953fd753479b086365e8e5a2570af9d8c9a6564b8412746df4cb4`, exactly matching the 182-file build used by the retained focused and measurement evidence. The dirty flag reflects only the existing control-plane output at the time identity was captured.

Read-only archive validation independently verified every raw and compressed SHA-256, size and zero gzip timestamp across all eight measurement archives. All current manifest, lockfile, measurement recipe, memory-probe and synthetic-generator file hashes match the final measured inputs. Rechecked both final workloads against the recorded numeric limits: five cold samples and 30 repeated samples each, 25 retained reports, last-20 memory limits, disposal limits, balanced file/helper counters and zero surviving sessions, handles, helpers, descendants and analysis timers. These are validated prior measurements, not newly sampled performance results.

Revalidated the portable focused archive: ten passed instances, 356 passing assertions, no failed instance or inventory issue, and all 308 records retained. The separate relocation smoke retains 61 passing assertions and its explicit partial status. Neither report claims Plan 1 completion. The unfiltered matrix, full relocated test execution and automated regressions remain pending; no prior results are relabelled as new executions.

This active attempt restores the complete results and honest checklist through workflow MCP. Commit and draft publication follow successful writes. Publication submits the work for acceptance; it does not establish the unrun checks or close the inherited findings above.

## Publication bookkeeping

The results and checklist were written successfully through this active attempt and committed as `bc6efd4` (`Restore iteration 15 results and submission checklist`). The first publication returned `WORKTREE_DIRTY`: its bookkeeping commit could not absorb the pre-existing generated iteration14-check-results.md update.

Inspection shows that update adds only `- **Regression Tests**: PASSED`, matching the accepted iteration-14 predecessor results supplied by the user. The agent did not edit or generate that check result. Its exact existing bytes are committed as control-plane bookkeeping so the accepted predecessor output is preserved and publication could be retried. This adds no iteration-15 passing-regression claim and changes no implementation or evidence.

## Previous publication blocker (2026-09-10 07:23 UTC)

The bookkeeping commit is `1132bc8`. The resubmission returned `FILE_POLICY_VIOLATION`: iteration14-check-results.md belongs to iteration 14, not 15. A read-only publication-status call confirms no pending accepted draft and retains that rejection. Both managed iteration-15 deliverables now exist and are committed; publication and subsequent acceptance have not succeeded.

Read-only diagnosis confirms cucumber-viz 0.6.3, project root `/ramify`, this authoritative execution worktree, and the current attempt/session. The journal records successful draft writes at 07:22:39, 07:22:47 and 07:23:19 UTC, then publication failure at 07:23:27 UTC against base `5640de98f2f046aea3b266a781be58eaf811da6a` and draft `1132bc8754fe32466b69f32e34ca627f42924f36`.

The installed publication service explains the conflict:

- `commitPublishTimeBookkeeping` only absorbs status.md and artifacts belonging to iteration 15, but its dirty-file validation also rejects the unmatched iteration-14 check output.
- After the instructed commit, `partitionAcceptedIterationFiles` rejects that same generated predecessor artifact unless it matches the stored accepted iteration-14 artifact. The final regression line does not match that stored projection.

This is a control-plane attribution problem. No Ramify check failed. The supplied user policy reserves check-results files to the control plane, so the agent has not manually removed the passing regression line, rewritten accepted artifacts, changed workflow state, or patched/restarted the external service.

Required recovery: the Studio control plane must reconcile the generated final iteration-14 regression result with iteration 14's accepted artifact/baseline, then retry iteration-15 publication. No available active-iteration-15 MCP tool owns that predecessor check output. The toolkit implementation, measurement evidence and both required deliverables are preserved on this branch. Full gate/regression acceptance and Plan 1 completion remain pending.

## Current-attempt verification and submission (2026-09-10)

Resumed from `dab085ff040e42d4e8f6c2a759153c8f8e5ca2a7` on the authoritative branch and checkout, with a clean working tree, under attempt `attempt_hkiwD3GLzUPhdpsteX-Eu`. Live workflow detail confirms iteration 14 completed and accepted, and iteration 15 running. The retained publication status describes the earlier predecessor-artifact rejection; this attempt will submit the existing implementation and both refreshed managed deliverables.

No application source, tests, declarations, dependencies, fixtures, budgets or control-plane outputs were edited in this attempt. The existing implementation at `fd8a351` and its subsequent managed submission records were reviewed before verification.

Fresh commands passed sequentially:

- `npm run worktree:prepare`.
- `npm run build`.
- `npm run type-check` across toolkit, portable owners, scripts and harness.
- `npx tsx scripts/validate-final-contracts.ts`: nine owners, 150 source/resource files, 59 expanded statements, seven package entries and the compiled CLI executable.
- `npx tsx scripts/reference-harness/validate.ts`: all 308 reviewed records, pointers and prerequisites valid; no conformance assertion executed.
- `npm run check:reference`: completed/passed/complete coverage; 15 owners, 54 source files, five resources, 294 accesses, 166 allowed and 128 external. Zero errors, denials or analysis limits; the two expected configuration warnings remain visible.
- `npm run check:self`: completed/passed/complete coverage; nine owners, 143 source files, seven resources, 1,781 accesses, 1,320 allowed and 461 external. Zero errors, warnings, denials or analysis limits.
- `git diff --check`.

Logs are retained under `.reference-work/iteration15-current-*.log`; execution identity is in `.reference-work/iteration15-current-identity.json`. Source SHA remains `58bf210e7ade39cd87d2527622bb07f4fb8811aab633748f53584cc65d5a794d`. The rebuilt runtime SHA is `435bd02d03e953fd753479b086365e8e5a2570af9d8c9a6564b8412746df4cb4`, exactly matching the retained focused and measured runtime. The identity was captured with a clean working tree before these managed report/checklist updates.

Read-only evidence validation passed: all eight measurement archives match their recorded raw/compressed hashes, byte lengths and zero gzip timestamps. Current manifest, lockfile, fixture generator, measurement scripts and memory-probe hashes match the final measurement inputs. Both final workloads satisfy the unchanged five-cold-sample latency/RSS budgets and 30-cycle repeated workloads, retaining 25 reports with distinct run identities and satisfying last-20 memory budgets. Final lifecycle counters return to zero, and file/helper opens and closes balance. These are validated retained measurements, not fresh performance samples.

The focused archive's raw SHA and size match its documentation. It retains all 308 records, ten passing instances and 356 passing baseline/result assertions, with `planComplete: false`. The separate relocation smoke retains 61 passing assertions and explicitly excludes relocated toolkit regression. No retained evidence has been relabelled as a current exhaustive run.

The supplied automation-only check policy remains in force. No local Vitest/Cucumber, scenario coverage, sealed-file checks, unfiltered gate or executing reference report ran during this attempt. Their outstanding status and the inherited CLI/loader findings remain as documented above. Both managed deliverables are written through this attempt's MCP tools and committed before draft publication. Submission does not claim Plan 1 completion or successful automated acceptance.

## Single self-assessment remediation attempt (2026-09-10)

This is the one focused attempt requested after the checklist's `allNewTestsPass: false` stopped output validation. Re-read iteration 15's deliverables, verification and exit criteria, then inspected the new tests, the registered relocation provider, current workflow state and available control-plane evidence. No implementation delegation was required by the original instructions.

The preceding publication of `279b12e2bf029a8f4b8262e6ebc8479f352ffb76` succeeded: the journal records `publication.accepted` at 08:12:25.248 UTC with 50 accepted files. The older predecessor-artifact publication blocker is therefore historical. That publication did not establish successful tests. Live workflow detail now reports iteration 15 at `validate_output_retry`; there are no exact iteration-15 or post-commit-regression-15 check-result directories in the workflow evidence store.

The outstanding item is missing execution evidence, not a supplied failing assertion. Existing coverage includes:

- `subs/analysis/src/tests/report-copy.test.ts`: detached immutable sharing, exact JSON preservation and normalization, separate originals/tag/value identities, per-call isolation, object shapes/property keys, cycles, accessors/hidden state and rejected runtime objects.
- `scripts/reference-harness/self.test.ts`: exact final provider registration and the real toolkit baseline/independent dispatch-type denial.
- `scripts/reference-harness/relocation.test.ts`: fixture-local npm executables, ambient environment isolation, external scratch ownership, cleanup and failure preservation.
- The existing modified session, gate, runner and mutation tests retain their checks. `relocationHandlers` unconditionally calls `testRelocatedPackage` in its baseline, which executes the copied toolkit's `npm test` and asserts every recorded test passed without failed, pending or todo assertions. The 61-assertion partial smoke cannot replace that run.

Inspected `cucumber-viz.config.ts` and both Vitest configurations. The configured automatic regression command is `npm test`, whose include patterns cover root/owner tests only. The independent harness requires `npm run reference:cases`; it is not covered by that root command. The full `npm run reference:verify -- --plan 1` is also required for the current 308-instance matrix, including the actual relocated toolkit regression. Executing `reference:report` includes its separate reference Vitest/Cucumber tiers. A future root regression pass alone must not be mistaken for all these results.

The original execution prompt states: "The following checks run AUTOMATICALLY after your work. Do NOT run these yourself", including "Regression Tests: Run cucumber and vitest regression tests". This remediation request explicitly retains that check policy. No permission to execute those reserved suites was inferred, no alternative runner was used to bypass it, and no checker/fixture/assertion or automation configuration was changed merely to make the checklist pass. No failing-test output was available to justify a source correction, and meaningful tests already exist. No new functionality or tests were added in this documentation-only remediation.

Verification appropriate to this attempt is read-only inspection of current workflow evidence, command/discovery/provider wiring and `git diff --check`. The preceding turn's passing type-checks and exact source/build identity still apply because runtime, tests and configuration are unchanged; they are not represented as a fresh test execution here.

The checklist remains `functionalRequirementsSatisfied: true` for the implemented functionality, `newCodeCoveredByTests: true` for the existing meaningful coverage, and `allNewTestsPass: false` because current execution evidence is absent. Full iteration/Plan 1 acceptance remains pending. The reviewable resolution is execution and review of the root and independent harness tests and the full gate through an authorized verification stage, with any actual failures returned for correction. This attempt does not establish those outcomes or close the inherited CLI/loader findings.

Both managed deliverables are updated through MCP and committed on the authoritative branch. No `workflow.publish_iteration_draft` call is made in this remediation; subsequent validation and publication remain owned by the workflow as requested.
