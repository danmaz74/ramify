# Testing

Choose tests from the changed behavior and the active plan's acceptance criteria.
The [quick-testing architecture](../architecture/quick-testing.spec.md) defines the
use of direct adapters and the complementary transport and process tests.

## Test behavior at the relevant boundary

| Change | Useful evidence |
| --- | --- |
| Model, parser or interpretation logic | Focused cases with independent expected outcomes, including denied access and invalid input. |
| CLI behavior | Real handler/session flows and compiled subprocess cases for arguments, output, streams and exits. |
| Daemon lifecycle or synchronization | Real context/engine flows, watcher and IPC/process cases, and comparison with fresh batch results on identical inputs. |
| MCP adapter | Registration, validation and response mapping through a protocol client, plus stdio/process cases. |
| Explorer behavior | Real route, hooks, client, router and service in quick mode; HTTP and browser checks for transport and visual interaction. |
| Public types | Type-checked fixtures with exact assertions and negative compiler cases, alongside runtime tests. |
| Memory or cleanup | Repeated use, cancellation and slow-consumer workloads with reproducible measurements. |
| Documentation or skills | Relevant links, commands, examples and consistency; skill metadata and discovery when affected. |

Cover user-facing workflows with executable scenarios. Use `.viz.feature` for
Cucumber workflows and focused tests for dense model and parser matrices.
Define a new runner's owner, discovery and command in the implementation plan.

Include positive controls alongside negative cases so rejecting everything
cannot pass. Keep independent expected answers even when comparing batch and
incremental results: two paths using the same engine can share a bug.

## Source and fixture placement

Follow the [test layout](../model/module-description.spec.md): `src/tests/`
inside an owner, or ordinary `src/` in a separate testing module for additional
tags. Include both in test discovery and production exclusions, and expose
shared helpers through the channels open to testing source.

Give each run isolated mutable fixtures and release its listeners, sessions,
clients and processes on success and failure. Make negative mutations in harness
copies of the reference application; keep failed copies through an explicit
diagnostic option. Tests should run independently of their order.

Use controlled timing for logic tests and observable completion for real
asynchronous tests. Investigate leaked handles and timing failures at their cause.

## Commands currently available

Run commands from the Ramify package root and check [package.json](../../package.json)
when selecting them. In a fresh checkout, install the root with `npm ci` and the
example/site packages with `npm --prefix <directory> ci` as needed.

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile the toolkit. |
| `dist/src/ramify check --changed <path>... [--deadline <ms>] [--format json]` | Run the bounded hook check against the resident daemon: exit 0 without findings, 1 with findings or an invalid revision, 2 when not checked; never a batch fallback. Scripted runs own their `RAMIFY_ENDPOINT_DIR`. `examples/hooks/claude-code-post-write.mjs` maps a Claude Code post-write hook to it. |
| `dist/src/ramify materialize [--view <api\|architect>]... [--from <path> \| --all] [--root <dir>]` | Refresh generated views through the resident daemon from one synchronized revision, in one transaction. Without `--view`, one module's or the whole project's foreign-API view (`src[/tests]/.ramify/`), exactly as Plan 2A; `--view architect` publishes the project's [architect view](../architecture/architect-view.spec.md) at `.ramify-architect/` after waiting for the revision's dependency facts, and `--from`/`--all` require `--view api`. Exit 0 on complete publication, 1 for an invalid project, 2 unavailable, superseded, partial or incompatible service, 130 on interrupt; never a batch fallback. Search the generated, gitignored views with the `rg` commands in [`AGENTS.md`](../../AGENTS.md#foreign-api-discovery). |
| `dist/src/ramify affected [<module-id>...] [--path <path>]... [--root <dir>] [--batch] [--format human\|json]` | Select the changed, dependent and test modules for module and path seeds, from the resident daemon's synchronized revision or, with `--batch`, a fresh session. JSON is one `ramify.affected-cli/2` document. Exit 0 for any answer, including one widened to all modules, 1 for an invalid project, unknown module ID or invalid seed, 2 unavailable, 130 on interrupt; the resident form never falls back to batch. Scripted resident runs own their `RAMIFY_ENDPOINT_DIR`. |
| `npm run check:self`, `npm run check:reference` | Check all fifteen toolkit owners or fifteen reference owners, including owned tests. Both commands use disposable batch sessions. |
| `npm run type-check` | Type-check toolkit source and scripts. |
| `npm test` | Run toolkit Vitest tests; append `-- <test-file>` for a focused run. |
| `npm run reference:cases` | Validate the reference catalogue and harness using their separate test configuration. |
| `npm run reference:report -- --dry-run` | Inventory reference cases without executing the example tiers. |
| `npm run reference:report` | Run current example tiers and report capability/coverage status. |
| `npm run reference:verify -- --plan 1` | Require all reviewed Plan 1 instances; fails while required capabilities or assertions are absent. Add `--iteration <n>` for the named iteration and its transitive prerequisites. |
| `npm run reference:verify -- --plan 2` | Require the 166 retained resident instances and the named Plan 5 counterparts of the ten superseded records, including current measurement evidence and a passing same-input Plan 1 gate. Add `--iteration <n>` to include that iteration and its prerequisites. |
| `npm run reference:verify -- --plan 5` | Require all 103 fast-incremental-check instances, including current `measure:fast` evidence and same-input Plan 1 and Plan 2 gates, so run it after them on the same build. Add `--iteration <n>` (1 to 13) to require that iteration and its transitive prerequisites only. |
| `npm run reference:verify -- --plan 2a` | Require all 104 materialized-API-discovery instances (availability, symbol details, projection, rendering, transactional publication, retained/context query, service/IPC/CLI, agent `rg` workflow, scale evidence and the final completion gate), including same-input Plan 1/Plan 2/Plan 5 regression and the archived `measure:plan2a`/`measure:plan2a-platform` evidence. Add `--iteration <n>` (1 to 10) to require that iteration and its transitive prerequisites only. |
| `npx tsx scripts/validate-final-contracts.ts` | Require the eleven final declarations, their real exports and all eight package entries. |
| `npm run probe:modularity` | Run one batch analysis with `dependency-behavior` and write the modularity baseline JSON and Markdown to `scripts/probes/results/modularity/`; refuses a dirty worktree unless `-- --allow-dirty`. Repeat `-- --candidate <file.json>` to compare `CandidateOwnership` files with declared ownership, and name the output with `--name`. Run `npm run build` first. `npx vitest run -c scripts/probes/modularity/vitest.config.ts` tests its Git adapter and Markdown rendering. |
| `npm run measure:resident` | Run all nine real resident workloads and archive observations. Performance targets are advisory; missing evidence, runtime-limit violations and cleanup failures remain blocking. |
| `npm run measure:fast` | Run Plan 5's nine hook and session workloads and archive raw results; `node scripts/measurements/fast.mjs --workload <id>` runs one. Timing targets are ideal budgets recorded without failing; correctness predicates, missing evidence and runtime limits fail. Run one measurement at a time on a quiet host. |
| `npm run measure:plan2a` | Run `ramify materialize` against the reference, toolkit and S100/S1000 fixtures plus the repeated-run plateau, and archive files/entries/bytes/duplication/latency/peak-RSS-heap evidence; `-- --workload <name>` runs one. S500 is excluded by measurement policy (`-- --workload synthetic-500` opts in). `npm run measure:plan2a-platform` produces the Linux/macOS relative-tree/bytes manifest and symlink/rollback/no-op process evidence for one host. |
| `npm run measure:plan2b` | Materialize the architect view of isolated reference, toolkit and S100 copies through the installed CLI, and record hit cost per term, files, bytes and record lengths per file kind, latency with and without retained dependency facts, unchanged-repeat writes and peak daemon memory against Plan 2B's budgets, plus the in-process session query and two isolation witnesses; writes `docs/plans/iteration-2b-generated-views/evidence/plan2b-measurements.json`. `-- --workload <name>` runs one workload. Run `npm run build` first, on a quiet host. `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan2b.test.ts` runs the real-run, invariance, determinism and regression cases (AV29–AV31, AV34) with owned daemons. |
| `npm run measure:plan2c` | Run built-toolkit `measure` cold and warm under an owned daemon, verify exact sums and every file byte against disk, archive the full document, re-measure architect query/materialization/size/repeat/hit cost and sampled response/render memory, and record the fixed architect metrics policy in `docs/plans/iteration-2c-module-measurements/evidence/`. Run `npm run build` first on a quiet host. |
| `npm run measure:project-explorer` | Build-independent acceptance runner for the already compiled resident explorer server. In isolated endpoint directories it starts servers through `ramify explore` and as a process manager would, drives `/usr/bin/chromium` at `/analysis/latest` against Collection Review, Ramify and a mutation fixture, and exercises edits, a killed daemon, `ramify daemon stop` and server reuse. It writes Plan 6B's RS13–RS17 evidence, including server and daemon RSS, and Plan 6C's MT14–MT16 module tree evidence at `/modules/latest`. `-- --only reference\|toolkit\|mutations\|tree` runs one workload. Run `npm run build` first. |
| `npm run example:type-check`, `npm run example:test`, `npm run example:build`, `npm run example:test:cucumber` | Check the reference application's types, runtime, build and Cucumber workflows. |
| `npm run diagrams`, `npm run site:build` | Check diagrams and the documentation site when affected. |

Select Cucumber scenarios through the example's runner and confirm selection in
its output. The toolkit has no root `test:cucumber` script. The verifier gate
registers all 308 reviewed instances, including the independent toolkit negative
and external relocation. Registration is separate from successful execution; the
[completion report](../plans/done/iteration-1-project-verifier/iterations/iteration15-results.md)
records evidence and its limits. For reproducible batch resource measurements,
use the [measurement recipes](../../scripts/measurements/README.md).

For the resident-plan remediation, the approved
[acceptance evidence reuse amendment](../plans/done/iteration-2-resident-verification/acceptance-evidence-policy.md)
permits provenance-backed composition of unchanged executions and focused
reruns. It retains all required cases and workload counts. Historical artifacts
remain unchanged; a composed receipt identifies their original inputs separately
from the current checkout. Other plans retain their own acceptance contracts.

See [resident verification readiness](resident-verification.md) for current
command availability and the endpoint isolation convention. The toolkit's
`check:self` and `check:reference` scripts use `--batch`; other `ramify check`
invocations use the resident daemon unless they pass `--batch`. Every scripted
resident run, harness or measurement sets an
owned `RAMIFY_ENDPOINT_DIR`, stops its daemon with that build's
`dist/src/ramify daemon stop` in `finally` and fails if it survives. An implicit
batch result cannot satisfy a resident instance.

For Studio iterations, the supplied check policy takes precedence over the
command list. If regression runners are reserved for automation, leave
`npm test`, `reference:cases`, the full Plan 1 gate and the non-dry
`reference:report` to that automation: the latter two invoke Vitest/Cucumber
internally. Record them as unrun locally, with the automatic verdict separately.

## Regression scope and bug reproduction

Use relevant existing results as a baseline, or run focused checks when they are
absent. Start verification with the changed behavior and complete the iteration's
required checks. Broaden regression for shared contracts, composition,
configuration, source moves or uncertain impact; reuse results for unchanged inputs.

For a bug, extend the nearest suitable test and verify that it fails for the
reported reason. Fix the code, confirm the test passes and run affected regression
checks. Reproduce process or browser failures at that boundary. When a reliable
reproduction is impractical, record why and the evidence used instead.

## Report what ran

Record each required case's fixture, expected outcome, command, result and limits.
Report catalogue validation, example behavior, source conformance, public typing
and transport coverage separately. Passing one does not establish the others;
missing capabilities and expected intermediate failures remain explicit gaps.

Preserve failures alongside reruns and distinguish pre-existing failures,
regressions and suspected flakiness. Completion requires the plan's acceptance
gate, including any checks beyond the current commands above.
