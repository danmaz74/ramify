# Optimization 5: measurement capture and decoding

**Status:** focused checks qualified; released full nested audit and integration
belong to the coordinator and must pass before merge.
**Base:** `68cde9ecc8a2f29f2a01121f6357586c2b99c484`.
**Worktree:** `/home/app/ramify-plan22-measurement`, branch
`perf/plan22-measurement`.

## Change and preservation

All seven original core cases remain under the same literal titles and suites
in `measurement.test.ts`. All 48 original expectation calls remain in the shared
`measurementCase` bodies. `measure.test.ts` retains its six original titles and
19 original expectation outcomes; its argv assertion now reads the supplied
port's recorded argv rather than a shell-created file. Five additional ordinary
negative controls prove caught Git/Ramify/candidate argument failures, unused
required answers and caught exhausted mutation answers cannot silently pass.
The exact thirteen-case map and final file/configuration hashes are in
[05-measurement-evidence.json](05-measurement-evidence.json).

Ordinary cases exercise the actual captureSnapshot, schema validation, hashing,
directory byte counting, scope recipe, RunService, ledger and metric projection.
Only external facts change: literal head/tree IDs, explicit clean/ignored scratch,
unchanged gate commit, candidate responses, synthetic configured audit results,
raw measure/2 document bytes and literal synthetic publication bytes. No Git
repository, shell producer, Git-history engine or filesystem-derived ownership
engine is created. Read answers are declared repeatable. Branch creation binds
the exact generated run ID to its trailer/commit answers. Branch, trailer,
no-change commit, capture, materialization and missing-provider restart answers
are individually exhausted after one consumption, and required answers are
verified at teardown. External failures remain recorded when the harness catches
an assertion. Fixture/service cleanup is aggregated with script/guard checks.

Two original flows also remain actual installed-producer witnesses in
`measurement.boundary.test.ts`: the first frozen measured baseline with generated
views and the architect view's actual publication size. They use installed
Ramify, a private daemon, generated files and real Git. The composed witness
still uses a scripted agent and configured audit; it makes no actual audit
publication claim. Synthetic measurement numbers are not producer-conformance
proof. The boundary file will need exact registration in the later manifest.

Literal registrations preserve composition's source-title checks. No composition
source, producer implementation, production configuration or dependency pin changed.
The decoder's local pre-import child_process guard deliberately stays in its owner
rather than importing the parent's unexposed testing internals; the automatic
root enforcement iteration must replace or make this guard compatible, alongside
all existing file-local guards. This cut does not claim global enforcement.

## Executed checks

All Vitest commands ran from `ramify-agent/` using the installed package runner.

- Baseline: `node_modules/.bin/vitest run subs/harness/src/tests/measurement.test.ts subs/harness/subs/evidence/src/tests/measure.test.ts --reporter=json --outputFile=/tmp/plan22-measurement-baseline.json`: 13 passed, zero skipped. Core case durations total 58.573 s; decoder 0.059 s.
- Final ordinary: the same two exact paths, report `/tmp/plan22-measurement-ordinary-final2.json`: 18 passed, zero skipped. Core including five negatives 1.396 s; decoder 0.021 s. Ordinary process attempts remained zero through setup, flow and cleanup.
- Actual: `node_modules/.bin/vitest run subs/harness/src/tests/measurement.boundary.test.ts --reporter=default --reporter=json --outputFile.json=/tmp/plan22-measurement-boundary-final.json`: both witnesses and file passed, zero skipped, exit 0. Case durations total 56.751 s; file including hooks 57.693 s. Raw diagnostic output is `/tmp/plan22-measurement-boundary-final.log`.
- `node_modules/.bin/vitest run subs/harness/src/tests/composition.test.ts --reporter=json --outputFile=/tmp/plan22-measurement-composition.json`: all 11 passed, zero skipped, including literal title and acceptance inventory checks.
- `npm run type-check`: all four compiler scopes passed; final log `/tmp/plan22-measurement-typecheck-qualified.log`.
- `npm run check:self`: passed with zero errors, zero warnings, 313 analysis limits. No model/exposure contract changed.
- `git diff --check`: passed.

The observed ordinary core duration falls about 42 times. These runs overlap
other work on the host, so they do not establish a quiet-host aggregate speedup.
The essential actual producer evidence remains costly and is measured separately.
No whole Vitest suite or audit was run by this subagent; coordinator qualification
must establish the complete configured union on this clean committed candidate.

## Retained failures and diagnosis

Authoring reports `/tmp/plan22-measurement-authoring1.json` through `authoring6.json`
retain intermediate failures: the first script assumed `job-NNN` IDs rather than
the generated timestamp/random run IDs; the negative unavailable-provider run
needed its explicit restart/stop answer; the measured runs needed the final
gate's trailer/no-change commit and configured audit context; the final gate is
`ga-0002` after noncommitting readiness. Type-check also exposed a missing `output`
on the positive materialize response. These were declared answer corrections,
not timeout increases or weakened outcomes. Intermediate failed source hashes
were not captured and are not represented as known.

The first actual execution report `/tmp/plan22-measurement-boundary.json` had two
passing assertion records but a failed file/exit 1 with an empty JSON file message.
That result remains failed; it cannot qualify the witnesses. The diagnostic final
run with default plus JSON reporters, after literal registration correction,
passed the complete file. No unexplained first-run failure is labelled a pass or
claimed to be diagnosed as flakiness.

## Reconciliation before qualification audit

Implementation commit: `00e91eba88604f118cc439e85bc32f52123aa462`.
Merged target's committed `0bdece70f995fd15e7c3cfbfd2c526a2397f7e2b` into this
optimization branch as `62dbc276a8d9915b64d572191f18ce472b485a51`.
Only five documentation/evidence files changed: Plan21 iteration10 delivery
receipts and Plan22's explicit full nested audit-before-merge contract. The
Plan21 protocol/policy correction `8dc6068c` was already present in the base.
No target unfinished changes were copied or committed. Code, runner and
configuration hashes remain those qualified above; actual producer/type/module
checks remain applicable to the identical source. The reconciled exact three
ordinary/composition files passed all 29 cases with zero skipped in
`/tmp/plan22-measurement-reconciled.json`. The coordinator must now run the
released full nested audit on this clean committed branch before merging it
into the concurrently used Plan21 target. Integration and that audit are unrun
by this subagent; this receipt does not declare plan completion.
