# Iteration 2 results: scratch operations

Implementation commit: `97829ff873ceeb70303fc79ba29f0f1e8ff8850b`.

The evidence module now answers which paths are in Git's index beneath scratch and whether Git ignores each scratch directory, with the deciding rule's source, line and pattern. The harness owns one internal scratch unit for paths, rule setup, ignore conflicts, directory creation and cleanup. It preserves indexed files and their parent directories during cleanup. Nested-package discovery, readiness test discovery and scoped test selection skip `src/tmp/` directories. All five scripted Git adapters accept explicit successive scratch answers and refuse unscripted operations.

Git needs a slash suffix to classify an absent directory under a directory-only ignore rule, but reports a negating directory rule on the unsuffixed path only when that directory exists. For an absent nonmatch, the adapter uses an isolated temporary worktree view with the repository's ancestor `.gitignore` files and an empty directory to obtain a negation's source and line. The actual worktree's Git answer alone decides whether scratch is ignored. The target project's scratch directory is never created for this query.

## Evidence

- PB-A03: The real Git adapter test uses one repository for the file and covers an unchanged committed file and a newly staged file beneath scratch, paths with spaces, ignored and unignored directories, and root, nested and absent-directory negations with Git's rule location.
- PB-A04: Scratch unit tests cover missing, empty and populated `.gitignore` files, byte preservation, the root-only `/src/tmp/` case, duplicate avoidance, conflict rollback and symlink refusal. They also cover idempotent creation and cleanup that preserves indexed files while removing untracked siblings.
- PB-A05: Focused walk tests place package manifests and test files in root and child scratch directories and verify that all three walks skip them.
- `npm test -- subs/harness/subs/evidence/src/tests/scratch-git.test.ts subs/harness/subs/evidence/src/tests/run-command.test.ts subs/harness/src/tests/scratch.test.ts subs/harness/src/tests/run-policy.test.ts subs/harness/src/tests/readiness.test.ts subs/harness/src/tests/test-selection.test.ts` passed: 6 files, 65 tests.
- `npm run type-check` passed.
- `npm run check:self` passed: 0 errors, 0 warnings, 316 analysis limits and partial coverage.
- `git diff --cached --check` passed before the implementation commit.

Readiness setup and iteration lifecycle integration belong to iterations 3 and 4. This iteration did not run the complete suite or make a model call.

## Follow-up: batched ignore queries

Lifecycle integration needs to check several modules before a candidate snapshot. The primary `check-ignore -z --stdin` query now sends all requested paths to Git in one process, validates one four-field response per path, and preserves request order, duplicates and paths with spaces. Only nonmatches need the existing per-path lookup for a negating rule. An empty request starts no Git process. The actual worktree response remains the authority for ignored status.

`npm test -- subs/harness/subs/evidence/src/tests/scratch-git.test.ts subs/harness/subs/evidence/src/tests/git.test.ts subs/harness/subs/evidence/src/tests/run-command.test.ts` passed: 3 files, 23 tests. `npm run type-check` passed. The complete suite was not run.
