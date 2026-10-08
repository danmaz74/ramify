# Iteration 5 results: the project's own layout

Implementation commit: `5693f7a5`.

The project ignores `**/src/tmp/` and excludes scratch from the root and web TypeScript projects, the three fixture TypeScript projects, and both Vitest projects. The three independent fixture projects now live under `subs/harness/fixtures/`. Fixture-copy helpers, direct source references, the live trial path, and the README use the new location. The `ramify.ts` and `ramify-audit` pins and all module headers remain unchanged.

## Fixture move probe

Before the implementation, a disposable archive of committed `99ed8374` was prepared at `/tmp/ramify-i5-probe.YRx1An/ramify-agent`, with its `node_modules` linked to the checkout. In that copy, `fixtures/` moved to `subs/harness/fixtures/`, and the root and web compiler configurations and both Vitest projects excluded it.

- `npm run check:self` passed: 12 owners, 566 selected source files, zero errors and warnings. Its walked source areas contained no fixture source; the three moved fixture projects appeared as independent scopes.
- `npm run type-check` passed.
- `node_modules/.bin/ramify affected --batch --root . --path subs/harness/fixtures/collection-review/src/main.ts --format json` exited 0. The fixture path resolved as `module: null`, `basis: none`; `changedModules` and `affectedModules` were empty. `testModules` contained only the 12 real owners and no fixture owner. The selection widened to `all-modules` with `unowned-path`.

The probe found no moved-project layout error and no fixture source selected into the harness project, so the move proceeded. Under the current pins, a changed fixture source path is still unowned for partial audit selection and widens that audit to all modules. Phase 3 can address that classification with the updated providers.

## Validation on the implementation

- `node_modules/.bin/vitest run src/tests/session-command.test.ts subs/harness/subs/scenarios/src/tests/extraction.test.ts subs/harness/src/tests/fixture-check.test.ts subs/harness/src/tests/capability-recovery.test.ts --maxWorkers=2`: 4 files, 30 tests passed. These exercise the direct session path, plan extraction, the copied fixture's real Ramify check, and capability fixture copying.
- `npm run check:self`: passed with zero errors and warnings, 12 owners, 567 selected source files, and no fixture source area. It reported 316 nonblocking analysis limits.
- `npm run type-check`: passed, including the root, web, scripts and browser acceptance TypeScript projects.
- The same `ramify affected --batch` command on the implementation returned the same `module: null`, `basis: none`, `unowned-path` answer. Its independent scopes named all three moved fixture projects.
- `git check-ignore -v` confirmed the root rule ignores root, harness and nested scenario `src/tmp/` examples. `git diff --cached --check` passed before the implementation commit.

The complete suite and final full audit are reserved for the plan's final gate.

## Final-audit regression repair

Repair commit: `b36105dd`. The first plan final audit (`c218`) ran the complete suite and exposed four integration test files that predated scratch setup and safety checks. A targeted reproduction with `node_modules/.bin/vitest run subs/harness/src/tests/scenario-check-integration.test.ts subs/harness/src/tests/contract-delegation-integration.test.ts subs/harness/src/tests/fake-exposure-parity.test.ts subs/harness/src/tests/session-fixture.test.ts --maxWorkers=2` reproduced five failed tests and the HTTP fixture's timed-out setup. No fixture source path was missing.

- `scenario-check-integration.test.ts` now supplies both empty tracked-path answers readiness requires before and during scratch cleanup. Its three failing acceptance cases reach their intended Cucumber checks again.
- `contract-delegation-integration.test.ts` and `fake-exposure-parity.test.ts` now expect the successful `scratch-safety` gate rule alongside their existing parity rules.
- The live HTTP session fixture passes its scripted Git through the standard copied-fixture scratch adapter. This lets the run reach its paced engineer while retaining the scripted Git record for its assertions.

The first targeted rerun after these changes passed contract delegation and the HTTP session fixture. It exposed one further `scratch-safety` expectation in the fake's provider gate and a second tracked-path query during readiness. After those two corrections, a focused rerun of `scenario-check-integration.test.ts` and `fake-exposure-parity.test.ts` passed both files and all 16 tests. `npm run check:self` and `npm run type-check` passed after the repair, with zero structural errors or warnings. `git diff --cached --check` passed before commit. The parent owns the next complete final audit.
