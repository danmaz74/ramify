# Iteration 3 results: scratch preparation before work

Implementation commit: `8436b657`.

Readiness now finds every current declared module from disk, refuses any scratch path in Git's index before deleting anything, and removes stale untracked scratch before its clean-tree step. It does not change `.gitignore`. A run that passes readiness executes a ledger-backed setup effect before scenario materialization. The effect appends and verifies the general scratch rule, commits only a `.gitignore` change with `Ramify-Run` and `Ramify-Scratch` trailers, and recovers a crash before or after that commit without duplicating it. A conflict restores the original `.gitignore` bytes and fails the run before work. The setup commit is an accepted source boundary.

A single session applies the same tracked-path preflight, cleanup and ignore verification before its agent starts. Its appended rule stays uncommitted and is reported in `harnessChanged`, separate from the engineer's outside-scope changes. It makes no commit. No path creates scratch yet; iteration 4 owns creation and lifecycle checks.

## Evidence

- PB-A06: `scratch-setup.test.ts` uses scripted Git index answers for unchanged and newly staged scratch, verifies that both stop readiness without deleting surrounding files, and verifies removal of stale untracked scratch.
- PB-A07: a scripted baseline failure leaves `.gitignore` unchanged; a following attempt records a passing readiness. Existing readiness tests still cover clean-tree refusal and recovery classification.
- PB-A08: scripted run tests verify one `.gitignore` setup commit, no commit for an effective rule, a root-only project with `/src/tmp/`, strict rejection of other changed paths, and recovery after the append and after the commit to one setup commit.
- PB-A09 and PB-A10: run and single-session tests verify nested and root ignore overrides refuse work and preserve `.gitignore`; a single session reports an uncommitted harness change and makes no commit.
- `npm test -- subs/harness/src/tests/scratch-setup.test.ts` passed: 1 file, 16 tests.
- `npm test -- subs/harness/src/tests/scratch-setup.test.ts subs/harness/src/tests/readiness.test.ts subs/harness/src/tests/single-session.test.ts subs/harness/src/tests/materialization.test.ts subs/harness/src/tests/run-recovery.test.ts` initially passed 87 tests and failed one old non-Git-directory assertion because the new cleanup step's Git error detail omitted stderr. After adding the stderr, `npm test -- subs/harness/src/tests/readiness.test.ts -t 'a directory that is no git repository'` passed. The other four files passed in the five-file run. The full suite was not run.
- `npm run type-check`, `npm run check:self` and `git diff --cached --check` passed. `check:self` reported 0 errors, 0 warnings and 316 analysis limits.

The scripted recovery witnesses cover the setup effect at the append and commit boundaries. They do not perform a full run resume; the existing run recovery path completes the pending effect and then interrupts the old run. Iteration 4 can use `declaredModuleDirectories`, `harnessChanged` and the scratch helper contracts from iteration 2 without changing this setup path.
