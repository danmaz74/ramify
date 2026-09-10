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

Follow the [test layout](../model/module-description.principles.md): `src/tests/`
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
| `npm run check:self`, `npm run check:reference` | Run the compiled architectural checker over all toolkit or reference owners and tests. |
| `npm run type-check` | Type-check toolkit source and scripts. |
| `npm test` | Run toolkit Vitest tests; append `-- <test-file>` for a focused run. |
| `npm run reference:cases` | Validate the reference catalogue and harness using their separate test configuration. |
| `npm run reference:report -- --dry-run` | Inventory reference cases without executing the example tiers. |
| `npm run reference:report` | Run current example tiers and report capability/coverage status. |
| `npm run reference:verify -- --plan 1` | Require all reviewed Plan 1 instances; fails while required capabilities or assertions are absent. Add `--iteration <n>` for the named iteration and its transitive prerequisites. |
| `npm run example:type-check`, `npm run example:test`, `npm run example:build`, `npm run example:test:cucumber` | Check the reference application's types, runtime, build and Cucumber workflows. |
| `npm run diagrams`, `npm run site:build` | Check diagrams and the documentation site when affected. |

Select Cucumber scenarios through the example's runner and confirm selection in
its output. The toolkit has no root `test:cucumber` script. The verifier gate
registers all 308 reviewed instances, including the independent toolkit negative
and external relocation. Registration is separate from successful execution; the
[completion report](../plans/iteration-1-project-verifier/iterations/iteration15-results.md)
records evidence and its limits. For reproducible batch resource measurements,
use the [measurement recipes](../../scripts/measurements/README.md).

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
