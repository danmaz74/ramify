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
