# Iteration 4 results: scratch through the iteration lifecycle

Implementation commits: `4bf65140` and `0a6c69d6`.

An engineer now starts with an ignored `src/tmp/` directory in the assigned module. Scratch remains through repair turns and a suspended nested capability request. A durable iteration result releases scratch in every owner of its scope only when no other open assignment owns that module. Closure, evidence reopening and run recovery repeat this idempotent cleanup; indexed files remain in place and are reported. Single sessions remove their scratch after the writer settles and before an optional gate reads the tree, including failures before the agent starts.

Candidate previews and commit boundaries verify both Git's effective ignore decision and its index. A scratch violation at an engineer gate becomes a failed gate with path and deciding rule, no commit or audit, and repair feedback. The accepted commit verifies again immediately before staging. Engineer prompts name `tmp/` as temporary work and describe its lifetime.
Capability-needed submissions also verify scratch before provisional source capture. An unsafe submission is rejected with the deciding Git rule, and the same engineer session can repair it and resubmit; no unsafe snapshot is read.

## Acceptance evidence

- PB-A10: single-session tests verify that an ignore conflict refuses agent startup, staged scratch is preserved and reported at session end, untracked siblings are removed, and the gate fails without a commit. The session's setup rule remains an uncommitted `harnessChanged` path.
- PB-A11: `engineer-directory.test.ts` verifies directory creation for root, nested and bootstrap scopes; the public module-creation run starts from a root-only `/src/tmp/` rule, appends the general rule, lets the new child engineer write to its scratch, and removes it after acceptance.
- PB-A12: `iteration-gate.test.ts` writes and edits one scratch file through three repair turns before exhaustion; `reconciliation.test.ts` writes scratch in an accepted correction; `capability-dependencies.test.ts` observes a parent scratch file through suspension, service restart and a child closure, then its removal when the parent closes.
- PB-A13: public lifecycle cases cover accepted, partial, unsuitable and exhausted results, nested child closure with an open parent, and recovery after the durable accepted close event but before cleanup. A focused D1 owner-selection and filesystem test covers a durable superseded result with a two-owner scope and a second open assignment. `reopenEvidence`'s existing test establishes that contract revision commits a superseded result; there is no new end-to-end superseded-scratch run.
- PB-A14: an active nested `src/.gitignore` exception produces a failed gate naming its rule, with no commit or audit; the engineer repairs the exception and the next gate passes. A forced-indexed scratch file likewise fails before commit. `iterations-integration.test.ts` uses real Git and audit: starting without the general rule, the accepted commit equals the audited revision, and `git ls-tree` of that revision contains no `src/tmp/` file.
- A real-Git capability-needed case writes a nested `!tmp/` override. The first submission is rejected with that rule; after an in-session repair, exactly one safe provisional source is captured, with no engineer gate or commit before delegation.
- PB-A15: run and single-session forced-stage cases preserve the indexed file, remove an untracked sibling, and report the path. The run's next readiness refuses indexed scratch before deletion.

## Validation

Run these commands from `ramify-agent/`. Each command below names the focused run actually used; the filters are significant.

```sh
npx vitest run subs/harness/src/tests/accepted-commit.test.ts subs/harness/src/tests/iteration-gate.test.ts subs/harness/src/tests/module-creation.test.ts subs/harness/src/tests/scratch-setup.test.ts subs/harness/src/tests/single-session.test.ts subs/harness/src/tests/engineer-directory.test.ts subs/harness/src/tests/gate-diagnostics.test.ts subs/harness/src/tests/contract-revision.test.ts
```

Passed: 8 files, 58 tests. Later additions to scratch and accepted-commit coverage passed with:

```sh
npx vitest run subs/harness/src/tests/scratch.test.ts subs/harness/src/tests/accepted-commit.test.ts
```

Passed: 2 files, 21 tests. The following selected lifecycle cases also passed individually:

```sh
npx vitest run subs/harness/src/tests/module-creation.test.ts -t 'a create decision and its registry proposal lead to a bootstrap assignment'
npx vitest run subs/harness/src/tests/iteration-gate.test.ts -t 'a gate that fails three times exhausts|an owner with no test yet'
npx vitest run subs/harness/src/tests/reconciliation.test.ts -t 'a repair is planned with its intent' --testTimeout 120000
npx vitest run subs/harness/src/tests/accepted-commit.test.ts -t 'recovery finishes cleanup'
npx vitest run subs/harness/src/tests/iterations-integration.test.ts
```

The real-Git `iterations-integration.test.ts` run passed its one test and verified the accepted commit's audited tree. The post-fixture-change nested capability group passed 3 selected tests, including service restart:

```sh
npx vitest run subs/harness/src/tests/capability-dependencies.test.ts -t 'B asks for C and only a fresh child coordinator runs|a real C child gate and review hand back to B' --testTimeout 120000
```

An initial four-file recovery/capability run had 57 passes and 3 failures at Vitest's default five-second timeout, all in direct Git provisional-snapshot cases:

```sh
npx vitest run subs/harness/src/tests/capability-recovery.test.ts subs/harness/src/tests/capability-delegation.test.ts subs/harness/src/tests/contract-revision-scripted.test.ts subs/harness/src/tests/run-recovery.test.ts
```

Rerunning one failed case with a longer timeout exposed the actual `ScratchSafetyError`: the copied capability fixture lacked an ignore rule. The fixture copy helper now supplies the general rule. After that correction, the selected cases passed both with the explicit timeout and with the default timeout; the two complete capability files passed 27 tests with the explicit timeout. The final capability-needed repair witness passed under the default timeout.

```sh
npx vitest run subs/harness/src/tests/capability-recovery.test.ts -t 'snapshot written before its request commit' --testTimeout 30000
npx vitest run subs/harness/src/tests/capability-recovery.test.ts subs/harness/src/tests/capability-delegation.test.ts -t 'snapshot written before its request commit|retry refuses a changed staged|provisional snapshot keeps staged' --testTimeout 30000
npx vitest run subs/harness/src/tests/capability-recovery.test.ts subs/harness/src/tests/capability-delegation.test.ts --testTimeout 30000
npx vitest run subs/harness/src/tests/capability-recovery.test.ts subs/harness/src/tests/capability-delegation.test.ts -t 'snapshot written before its request commit|retry refuses a changed staged|provisional snapshot keeps staged'
npx vitest run subs/harness/src/tests/capability-delegation.test.ts -t 'unsafe scratch override refuses capability source capture'
```

The first command in that block failed with the explicit scratch conflict before the fixture correction; the next four passed after it. `npm run type-check`, `npm run check:self` and `git diff --check` passed after the final source change. `check:self` reported 0 errors, 0 warnings and 316 analysis limits. The full suite was not run.

The superseded cleanup test verifies the same owner-selection function used by recovery and evidence reopening, then applies its selected removals to real files. It does not claim an end-to-end contract revision with scratch inside a superseded engineer assignment.

## Final audit inventory follow-up

The final audit exposed stale completeness inventories: `union-values.test.ts` omitted the three new scratch event types and had no projection sample for `scratch-preserved`; `composition.test.ts` lacked named producers for that event and `local-rule-failed` gate commands. The initial focused run failed 3 of 48 tests. The inventories now name the actual producing tests, and the active ignore repair test asserts the command reason directly. No production schema or runtime changed in this follow-up.

```sh
npx vitest run subs/harness/src/tests/union-values.test.ts subs/harness/src/tests/composition.test.ts
npx vitest run subs/harness/src/tests/union-values.test.ts subs/harness/src/tests/composition.test.ts subs/harness/src/tests/accepted-commit.test.ts
npm run type-check
npm run check:self
```

The first command was the reproducer (3 failures, 45 passes). After the correction, the second passed 57 tests across 3 files, and both checks passed. `check:self` again reported 0 errors, 0 warnings and 316 analysis limits.

## Final audit runtime follow-up

The final audit exposed two five-second timeouts in CA19 direct provisional-source snapshot tests. A focused default-timeout run reproduced both; running the same selected tests with a 30-second runner budget passed both in 9.98 seconds total. The tests now declare their measured 30-second budgets individually, and the focused command passes with default runner settings. No snapshot assertion changed.

```sh
npx vitest run subs/harness/src/tests/capability-recovery.test.ts -t 'snapshot written before its request commit|retry refuses a changed staged or untracked candidate'
npx vitest run subs/harness/src/tests/capability-recovery.test.ts -t 'snapshot written before its request commit|retry refuses a changed staged or untracked candidate' --testTimeout 30000
npx vitest run subs/harness/src/tests/capability-recovery.test.ts -t 'snapshot written before its request commit|retry refuses a changed staged or untracked candidate'
```

The three outcomes were 2 timeout failures, 2 passes, and 2 passes, respectively. The final audit also left the long-running capability-acceptance file unfinished when its 20-minute provider limit expired. One representative acceptance case initially hit its internal 75-second handback wait even though the combined gate had passed; it completed in 82.00 seconds after that wait was raised to 120 seconds. The candidate scratch-safety check now performs its independent Git ignore and index reads concurrently. The same representative then passed in 73.12 seconds. This keeps both preflight decisions and assertions intact while reducing repeated Git process latency.

```sh
npx vitest run subs/harness/src/tests/capability-acceptance.integration.test.ts -t 'real multi-owner migration, repair, handback and linked revision'
```

The full focused acceptance file then ran for 951.92 seconds: 11 cases passed and the reviewer-submission restart case failed after waiting 60 seconds for handback. A selected diagnostic rerun reproduced the stall and captured `LedgerCorruptError: another writer appended to it` in the reopened review queue. The crash fixture had frozen its reviewer immediately after the accepted submission, while the old capability writer continued appending to the same ledger during reopen. Both accepted-submission restart variants now close and quiesce the old service at that durable boundary. Before reopening, they assert a started attempt, a submitted reviewer invocation, no terminal review attempt, and no handback; their existing recovery assertions require one replayed review and handback. The selected pair passed twice, including after those boundary assertions were added. The full acceptance file has not been rerun after the fixture correction; the parent final audit will cover it.

```sh
npx vitest run subs/harness/src/tests/capability-acceptance.integration.test.ts
npx vitest run subs/harness/src/tests/capability-acceptance.integration.test.ts -t 'accepted reviewer submissions replay before their combined review record'
npx vitest run subs/harness/src/tests/capability-acceptance.integration.test.ts -t 'accepted reviewer submissions replay before their combined review record|submitted reviewer concern replays into one exact pending attempt'
```

The first command produced 11 passes and one failure, the second reproduced the ledger race with the diagnostic warning, and the third passed 2 selected cases (10 skipped), 142.00 seconds of tests on the run with the durable-boundary assertions.

The affected recovery, scratch and accepted-commit group initially passed 36 tests and failed one forced-stage case during fixture removal: `ENOTEMPTY` under its transcripts directory. Its shared `afterEach` removed the fixture before closing the service, leaving a live writer during deletion. Reversing cleanup order fixed that teardown race; the complete accepted-commit file then passed 9 tests. The recovery file's 16 tests and scratch file's 12 tests passed in the grouped run, with default Vitest timeouts.

```sh
npx vitest run subs/harness/src/tests/capability-recovery.test.ts subs/harness/src/tests/scratch.test.ts subs/harness/src/tests/accepted-commit.test.ts
npx vitest run subs/harness/src/tests/accepted-commit.test.ts
npm run type-check
npm run check:self
git diff --check
```

The first `type-check` run caught a narrowing error in the new pre-reopen assertion; after using a discriminated event branch, `type-check` passed. `check:self` passed with 0 errors, 0 warnings and 316 analysis limits, and `git diff --check` passed.
