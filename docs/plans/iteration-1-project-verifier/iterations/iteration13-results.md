<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 13 results: CLI and process behavior

Status: implemented and locally verified. This is iteration-13 evidence; automated acceptance and Plan 1 completion remain separate.

## Prerequisites and scope

Workflow detail confirmed iterations 8 and 12 completed with accepted publication. Work started at `806689a38198f1b62aaca0a0584eb0eb08b1813b` on `workflow/iteration-1-project-verifier` in the authoritative checkout, with a clean working tree. Applied the iteration-work and testing skills and ran `npm run worktree:prepare`.

Implementation belongs to root and `subs/cli/`, with owned tests, package/build activation and reference-harness handlers. No analysis algorithm, model principle, reviewed public signature, matrix membership, prerequisite or reference application source/configuration was changed.

The supplied iteration-12 constraint finding about Node `createRequire` remains outside this iteration's implementation scope. It was reviewed as a handoff dependency and is recorded below; this iteration does not claim to repair or independently reproduce it.

## Delivered

- Implemented `runCli(argv, environment, control?)` with an injected `BatchOperation`. It validates the entire invocation before dispatch, accepts `check`, optional `--root`, `--format json` and `--batch`, and supports help/version. Duplicate, incomplete, positional and unsupported options fail explicitly. Unsupported commands, including `verify-browser`, do not dispatch analysis.
- Implemented root `runBatch` with the default resolved registry and the exact reviewed acquisition, source, report and disposal limits. It uses `analyzeProject`, whose fresh real session is disposed before returning. It preserves the report and maps completed, invalid, incomplete/unavailable and cancelled outcomes to 0, 1, 2 and 130.
- Added `dist/src/cli-entry.js` with the Node shebang, `bin.ramify` and the installed `./cli` package entry. The ordinary entry loads CLI handling and lightweight invocation setup; its injected callback dynamically imports batch assembly. Version comes from the installed package metadata.
- Help/version module traces show no analysis/compiler, React, MCP or web implementation load and no process or listener launch.
- Human output prints effective root/selection and configuration, then failures with locations, importer/original and related declaration evidence, then warnings and analysis limits, followed by execution/stage/capability evidence and scope/counts.
- JSON writes one versioned document with no banner. Analysis results retain `ramify.analysis/1`; failures before an analysis report exists use a small `ramify.cli/1` envelope. Operational failures use stderr.
- The injected-operation boundary cannot infer success from empty findings. Missing, blocked, failed or unrequested stages on a purported completed report produce explicit incomplete evidence and exit 2. Invalid declarations with correctly blocked dependent checking remain exit 1.
- Output serialization measures UTF-8 size before writing. If an injected provider exceeds its result budget, the formatter omits the snapshot and retains a bounded diagnostic prefix with an explicit resource-limit failure. A known denial remains visible with exit 2.
- SIGINT propagates cancellation, suppresses a claimed result and selects 130 after cleanup. The executable waits for output callbacks and sets `process.exitCode` instead of terminating early. Broken stdout selects exit 2 after session disposal; signal and stream listeners are released.
- The production build marks declared bin artifacts executable while retaining existing dependency, typing and helper validation. A real local npm installation successfully invoked its `node_modules/.bin/ramify` through the shebang.
- Activated root R1 and CLI C1/C2 without broadening exposure. Added executable validation against the reviewed final declaration/package manifests and refreshed usage documentation.

## Matrix execution

Passed, exit **0**, empty stderr:

```sh
npm run reference:verify -- --plan 1 --iteration 13 --format json --preserve-on-failure
```

| Measure | Result |
| --- | ---: |
| Required instances | 290 |
| Passed | 290 |
| Failed | 0 |
| Later instances not executed | 18 |
| New iteration-13 instances | 22, all passed |
| New-instance baseline assertions | 240 |
| New-instance changed-fixture assertions | 166 |

Prerequisite closure is iterations **1–13**, including iteration 8. Available harness capabilities are acquire, catalog, cli, coverage, lazy, link, metadata, namespace, parse, registry, resources, session, static-access, symbol-free and tags-origin. `planComplete` is **false**.

All variants remain separate execution records:

- I1-26: human-json; missing-stage; failed-resolver; browser-verifier-request/api and /cli; help-version/help and /version.
- I1-28: compiled-cli-clean/human and /json; compiled-cli-denied/human and /json; compiled-cli-invalid/human and /json; compiled-cli-unavailable/no-config, /references, /command and /format; compiled-cli-warnings/human and /json; compiled-cli-stray-description/human and /json; no-servers.

The warning variants add compiler-selected `tests/helper.ts`, assert its aggregated warning and exit 0 in both formats, and prohibit invented testing ownership. Adding a valid `tests/module.ramify` produces the located `stray-description` layout error and exit 1 in both formats, with no strict option. Its marker is excluded from the ordinary-file warning count.

Each project mutation starts from a compiler-valid, independently checked baseline. Denied reference imports remain compiler-valid. Human/JSON compiled results and the real injected handler agree with the public API on semantic report data, excluding the fresh run UUID.

Instance durations total **840.289 seconds**; the 22 new instances account for **101.555 seconds**. These are harness execution durations, not cold CLI latency measurements.

## Process and lifecycle evidence

Root-owned tests exercise actual compiled subprocesses for installed-bin execution, help/version, normal completion, SIGINT during acquisition and catalog work, injected catalog failure and a broken stdout pipe. An additional isolated worker runs the real handler with its real injected session for I1-26:failed-resolver.

The test preload observes filesystem handle lifetimes, loaded ESM/CommonJS modules, process launches and socket listen/bind attempts. It injects faults only at OS/stream boundaries. Process exit, closed captured handles, removed SIGINT listeners and termination of observed child PIDs are asserted.

No server, daemon or application subprocess is launched. The iteration-1 compiler recipe explicitly requires finite configuration/compiler helpers and their native TypeScript children; those are observed and released, not prohibited as though they were servers. Native clients can exit without delivering a JavaScript close callback, so final evidence checks their actual PID termination. Test failures/timeouts also clean up the exact observed descendants and helper process groups.

## Reference CLI and final contracts

Both required invocation forms passed against the unchanged reference with the final production build:

```sh
(cd examples/collection-review && node ../../dist/src/cli-entry.js check)
node dist/src/cli-entry.js check --root examples/collection-review --format json
```

The implicit form reports the root found from the working directory; the explicit form reports it as given. Both report:

- Completed, passed, complete source coverage.
- 15 owners, 54 source files, five resources and 89 catalog originals.
- 294 accesses, 166 allowed application decisions and 128 external selections.
- Zero errors and zero coverage notes.
- Two expected outside-module-source warnings: `vite.config.ts` and `vitest.config.ts`, one file each.

`npx tsx scripts/validate-final-contracts.ts` passed with **9 owners, 148 inventoried files, 59 expanded statements and 7 package entries**, plus `dist/src/cli-entry.js`. The script compares every final selection/name/tag/destination with owners.md, validates declarations against actual exports, compares the package map with contracts.md, resolves/imports every runtime entry and checks the bin shebang. No reviewed exposure remains pending.

This is declaration/export validation, not the iteration-15 toolkit source self-check or relocation gate.

## Verification and development findings

Passed:

- `npm run worktree:prepare`.
- `npm run type-check` across toolkit, portable owners, scripts and harness.
- `npm run build`, including production selection, package entries and emitted dependency/helper checks.
- `npx vitest run src/tests/batch-cli.test.ts src/tests/cli-process.test.ts subs/cli/src/tests/arguments.test.ts`: **43 tests passed**.
- `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/cli.test.ts`: **1 registration test passed** for all 22 variants.
- `npx tsx scripts/reference-harness/validate.ts`: all **308** reviewed records, pointers and prerequisites valid.
- The **290-instance** iteration gate above.
- Both final compiled-reference commands and final declaration/package validation.
- `git diff --check`, staged diff validation and ownership/exposure review.

Per the supplied check policy, full Vitest/Cucumber regression, scenario coverage and sealed-file checks remain with workflow automation. No local full-regression, full-plan completion, self-check or relocation pass is claimed. Existing full-harness assertions were updated to expect 290 executable instances and retain 18 pending instances, including explicit missing handlers for baseline/self-check work owned by later iterations.

Development failures were retained and corrected. The initial process assertion assumed the wrong native compiler executable name and relied too broadly on JS close callbacks. The first full gate passed 287/290; its three failures were two assertions expecting the generic layout code instead of the existing specific stray-description code, and native-process termination observation. Focused corrections passed, then the complete 290-instance gate passed. A separate ad-hoc `tsx -e` focused command used CommonJS transformation and broke `import.meta.resolve`; it was replaced by an ESM invocation. One declaration-validation attempt detected concurrent scratch-directory changes; validation passed on coherent final inputs.

The final gate ran alongside final output-budget review. The added report-size regression, final 43-test owner run, final type-check/build, final reference commands and final declaration validation include that formatter correction.

Ignored evidence is retained in `.reference-work/iteration13-*`: initial/final gates and focused assertion reports, process traces, reproduced assertion failures, owner tests, registration, type-check/build logs, final human/JSON reference output and final contract validation.

## Recommendations for Next Iteration

- Iteration 14 can wire `check:reference` directly to the implemented executable and activate its assigned baseline/regression/completion-gate instances. Keep the two reference configuration warnings visible.
- Carry forward the supplied iteration-12 finding in `subs/analysis/subs/typescript/src/accesses.ts`: compiler-resolved Node `createRequire` loaders reportedly omit CommonJS access/coverage and known testing-origin checks. Reproduce and repair it in the owning TypeScript scope with public-session controls. No checker rule or coverage expectation was weakened here.
- Iteration 15 retains toolkit self-check/negative, relocated installation/build/run and reference/100-owner measurements. The local-bin test establishes installation and executable wiring in this checkout, not relocation independence.
- Preserve report execution/check/coverage distinctions, disposal before successful delivery, lightweight help/version and the reviewed finite compiler process lifetimes. No daemon, listener, persistent cache, worker pool or alternate checker was introduced.
