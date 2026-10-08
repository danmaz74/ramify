# Plan 22 delivery and qualification

All 13 optimization cuts are integrated into `/ramify`, branch `ramify-agent`.
Final runtime candidate `ce70bf386386e41326b43a4944f32137fae7fc24` adopted committed MAIN `b23db328` unchanged.
The released full nested audit passed **before** integration merge `30ef84809ac31a484c394fc9a75dc548c33da607`.
The subsequent handoff changes only plan documentation and evidence.
Concurrent staged/unstaged target work was preserved and was excluded from the
clean committed audit; this report does not qualify those unfinished changes.

## Execution evidence

Released `ramify-audit` 0.7.2 report `8b7da054b06e1f4c2a86d133adae0ba8d753ca8d` qualifies source `ce70bf386386e41326b43a4944f32137fae7fc24`,
tree `97b0cbdf2a902a39fbb232f46d30a33c22c49811`. Discovery and expected-file coverage are complete,
composition is unscoped/pass with zero outstanding failures, and the failure
ledger is complete and empty. All configured checks passed: types, complete
Vitest, scenarios, structural validation, web build and patch integrity.
Vitest passed **2,088 tests in 281 files**,
with zero failures and the existing two optional skips in one file. The scenario
command discovered zero scenarios; that is no scenario acceptance claim.
Integrated verification on the working tree containing concurrent edits passed
270 tests, failed one native materializer case with
`Offset is outside the bounds of the DataView`, and retained the two optional
skips. The same native assertion then passed on a clean checkout of committed
integration `30ef84809ac31a484c394fc9a75dc548c33da607`; four other cases were excluded by that focused name
filter. The failed working-tree run remains retained, its cause is unresolved,
and no concurrent user source was changed. The audit and clean integration
check qualify the committed optimization, not unfinished working-tree changes.

No pin, worker-count, selection, retry or timeout policy was changed to obtain a pass.

The partition has 217 ordinary Node + 17 ordinary web + 48 explicit native files.
All **234 executed ordinary files recorded zero allowed and zero refused
process calls** in the full audit, including the capability/nonfunctional
families. There were 47 executed native files and one optional
wholly skipped native file. Native files recorded 9875
instrumented API observations, including 9262
direct/wrapper Git observations and 334 direct
Ramify observations. These are API observations; exec can invoke execFile, and
commands inside spawned CLIs are not recursively traced. Instrumented observations
and counting limits are archived in [the process evidence](final-process-evidence.json).
All 281 observed audit worker PIDs were absent
at collection; focused runner controls also settled their recorded worker PIDs.
Retained native executor/recovery tests verify their owned group/daemon cleanup.

The guard covers setup/imports, all seven Node spawning APIs, named/default/CJS/
ESM/promisified/importActual access, caught errors and user teardown. Root
reinstall, module/local resets and caller-supplied native flags cannot erase
attempts. Actual reused-worker controls prove both orders for cached builtin
and forwarding functions while preserving native stdout/stderr and failures.
The 34 new controls also qualify invalid registry data, discovery exclusions,
new ordinary files and complete-run enforcement. [Testing procedures](../../testing.spec.md)
are linked from project agent instructions.

## Preservation assessment

Coordinator review separates assertion/contract preservation from audit health.
The [case map](case-migration.json) accounts for the original 1,932 cases:
1,931 injectively map to retained cases, with zero unexplained losses; one obsolete
legacy run-branch-prefix case was retired by adopted Plan 21 `3ac150e9`, before
and independently of the performance conversion. Six explicit title-equivalence
mappings record three accurate scripted labels and three adopted contract changes.
The current default collection is 2,088 cases: 1,931 retained + 157 added controls or
adopted runtime cases. Two conditional fixture cases retain their configured
optional skips outside default case collection. Acceptance IDs are preserved.

Per-cut receipts compare original assertions, restart tables, authority bounds,
rejection/continuation outcomes and native registrations. External scripts
retain independently declared responses and strict cardinality; unknown,
exhausted and unused required answers fail even if caught. Real filesystem,
harness, guard and durable replay logic remain under test. Native candidate
objects/index preservation, trailer recovery, actual process death and installed
producer behavior remain actual witnesses. Coordinator review found no weakened
requirement or performance deletion; mechanical identity matching supplements
that review and cannot supply a semantic verdict. The audit makes no semantic
completion declaration about this plan or Plan 21.

## Performance evidence and remaining comparison limit

Production cleanup performs zero grace sleeps/KILL escalations when TERM reports
no remaining target. Real leaked/TERM-resistant descendants retain bounded TERM/
KILL cleanup. On the same host, three 20-command no-op batches reduced wrapper
median from 4.463974 s to 0.076169 s, approximately 58.6 times faster; deterministic
signal/sleep controls prove the correction independently of timing.

The supplied 961 s/959 s diagnosis is historical. The measured post-cleanup baseline
was a **failed** audit on `42c15527`, with 297.123 s of tests and 98.916 s in the 12-case
acceptance matrix. Its crash-fixture defect was repaired with retained actual
process assertions. The final full audit took **368.413 s**,
including **329.071 s** for tests, on four workers and pinned Node 22.23.3,
Vitest 4.1.11/Ramify 0.4.1/audit 0.7.2. Coverage evolved from 244 files/1,939 reported
cases to 282 files/2,090 reported cases, including additional
actual Plan 21 workflows. Aggregate improvement against that evolving failed
baseline is **unresolved**. A green audit does not establish a controlled speedup.
The ordinary matrices are separately selectable and have zero real Git/cold
Ramify launches. Current file/case times and exact input hashes are archived.

| Final slowest file | Project | Seconds |
| --- | --- | --- |
| `subs/harness/src/tests/plan21-workflows.integration.test.ts` | boundaries | 286.567 |
| `subs/harness/src/tests/iterations-integration.test.ts` | boundaries | 74.661 |
| `subs/harness/src/tests/module-creation-integration.test.ts` | boundaries | 73.157 |
| `subs/harness/subs/evidence/src/tests/project-boundary.test.ts` | boundaries | 70.685 |
| `subs/harness/src/tests/audit-check-execution.boundary.test.ts` | boundaries | 51.517 |
| `subs/harness/src/tests/measurement.boundary.test.ts` | boundaries | 47.756 |
| `subs/harness/src/tests/run-protocol-materialization.integration.test.ts` | boundaries | 29.092 |
| `subs/harness/src/tests/write-guard.boundary.test.ts` | boundaries | 26.416 |

The slowest ordinary files in this same audit were:

| Ordinary file | Seconds |
| --- | --- |
| `subs/harness/src/tests/check-findings-composition.test.ts` | 17.989 |
| `subs/harness/src/tests/composition.test.ts` | 13.473 |
| `subs/harness/src/tests/reconciliation.test.ts` | 11.966 |
| `subs/harness/src/tests/capability-acceptance.integration.test.ts` | 10.852 |
| `subs/harness/src/tests/run-recovery.test.ts` | 10.575 |

The remaining critical path is justified native CLI/provider work. Changing
production Git algorithms, provider startup or concurrency is outside this plan.
No claim is made that all testing can avoid native commands: ordinary regression
is guarded; native conformance deliberately remains separately executable.

## Delivery discipline

The first full automatic-enforcement audit failed on twelve remaining files;
[its complete ledger and refused calls](optimizations/13-failed-enforcement-audit.md)
are retained. The second full audit confirmed zero process attempts in all ordinary files,
but failed two composition metadata checks and an actual materializer case.
[That failed audit](optimizations/13-second-failed-audit.md) is also retained.
Current metadata now references the moved native cases. A focused before/after
reproduction established that a named SDK interface and explicit helper return
types prevent the installed TypeScript signature printer panic, with package
pins and native assertions preserved. Corrections passed focused qualification
before the final full audit. No failed audit was accepted or merged.

Each cut used its own fresh worktree and one sequential subagent. Cuts 1–4 had
focused premerge checks and a combined retrospective audit; this limitation is
retained in their receipts. Cuts 5–13 passed released full nested audits before
merge. Switching from the Plan 21 target to MAIN also required its own fresh
reconciliation audit. The final merge preserved all remaining staged, unstaged and untracked
user files byte-for-byte, including the exact staged patch; no user work was stashed/reset. No push was requested.

[Acceptance evidence](acceptance-results.md), [execution](execution.md),
[premerge audit](optimizations/13-premerge-audit.md),
[integrated qualification](optimizations/13-integrated-results.md).
