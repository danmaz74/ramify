# Iteration 17 fix results: the advisory Git child in the batch boundary

**Date:** 2026-10-05. **Status:** receipt for a harness repair after the
iteration 17 gate on `fc3680d4`, where `I2-19:batch-no-daemon` failed with
`human: child 5 is a finite compiler helper`. Changes are uncommitted and await
the coordinator's review. No runtime source, protected document or reviewed
instance row changed.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit | `fc3680d4`, clean at assignment |
| Changed | `src/tests/entry-boundary-cases.ts`, `scripts/reference-harness/cli-cases.ts` |
| Added | this receipt |
| Unchanged | runtime source (`src/git-command.ts`, `subs/cli/`), `dist/`, `plan2-instances.ts` and every other reviewed row, protected documents |
| Evidence | `/home/app/ramify-pb1-evidence/iteration17-fix/` |

## Cause

Child 5 is the CLI's advisory Git command, `git ls-files --others --ignored
--exclude-standard --directory -z`, started with `execFile` by the CLI process
itself after the analysis. The process probe records `execFile` launches as
`spawn` events. The batch boundary (`batchBoundary` in
`src/tests/entry-boundary-cases.ts`, which the `I2-19:batch-no-daemon` handler
and the root test `entry-boundaries.test.ts` share) treated every `spawn` as a
compiler helper. The four spawns before it are the configuration helper, the
compiler helper and their two `tsc --api` children (`diagnose-1.out`).

The launch depends on where the project copy lives. Plan 2 copies the
reference into `examples/collection-review/.reference-work/run-*/`, beneath the
worktree's `.git` link file, so the production adapter finds `.git` and runs Git
once per check, in both human and JSON format. A copy without a `.git` at or
above it starts no Git process. In the work area Git exits 128 (`fatal: git
ls-files: internal error - directory entry not superset of prefix`, reproduced
by hand in an ignored directory with content). The adapter reports a failed
command, so no advice is given and the report is unchanged, as the contract
requires.

The iteration 17 agent never ran `I2-19:batch-no-daemon`. Its Plan 2 single
runs (`iteration17/p2-instances.out`, receipt table) were I2-19
`cli-check-boundary`, `daemon-entry-boundary` and `status-no-start`. Those use
fixtures under the system temporary directory and do not classify children. The
root test uses a temporary-directory fixture too, so it passed.

## Classification and fix

This is a harness gap, not a runtime defect. The contract ("Git advisory
warning") runs the command at CLI check time inside a repository, and the copy
is inside one. A failed command changes nothing. The row asserts no daemon
connect or spawn and permits finite compiler helpers. A one-shot Git child that
the CLI reaps is not a daemon or another long-lived process.

`src/tests/entry-boundary-cases.ts` now exports two helpers:

- `expectedGitAdviceLaunches(root)` gives 1 when a `.git` entry is at or above
  the root and 0 otherwise.
- `isGitAdviceLaunch(event, cliPid)` matches a spawn by the CLI process of
  `git` with exactly the advice arguments.

For each format, `batchBoundary` asserts that the advice launch count equals
the expected count. It classifies only the remaining children as compiler
helpers. Every other check stays as strict as before: no connection or
listener, no other launch mechanism, released handles, and every child exited
(the Git child included). `I1-28:no-servers` (`cli-cases.ts`) previously
accepted at most one advisory command. It now uses the same helpers and the
same exact count, so in both handlers the result follows from the copy's
location instead of tolerating either count.

No other handler classifies every child of a complete check. Each was reviewed
and left unchanged:

- Assertions that apply only to helpers: `equivalence-process.ts`,
  `plan5-hook-cases.ts` and `lifecycle-cases.ts`.
- Assertions that apply only to the entry: `fallback-cli-cases.ts` and
  `process-cases.ts`.
- Processes that run no check: help, version, status, stop, imports and the
  unsupported `verify-browser` (`I1-26`).
- Resident fixtures under the system temporary directory:
  `resident-cli-cases.ts`.

## Verification

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check` | 0 | clean | |
| `npm run type-check` | 0 | all four scopes | `type-check.out` |
| `npm run build` | not run | no runtime source changed; `dist/` is the gate's build of `fc3680d4` | |
| `npx vitest run src/tests/entry-boundaries.test.ts src/tests/cli-process.test.ts` | 0 | 2 files, 14 tests | `vitest-root.out` |
| `npm run check:self` | 0 | passed, partial; 15 owners, 591 files, 0 errors, 0 warnings, 0 denied | `check-self.out` |
| Diagnosis before the fix, locked | 0 | failed on `human: child 5`; child 5 is the Git advice launch, exit 128 | `diagnose-1.out` |
| `I2-19:batch-no-daemon` alone, locked, 3 runs | 0 | 3/3 passed | `i2-19-run{1,2,3}.out` |
| `I1-28:no-servers` alone, locked | 0 | passed | `i1-28.out` |
| `I2-19:batch-no-daemon` with spawn diagnostics, gate work root, locked | 0 | passed; one Git launch per format | `diagnose-after-fix.out` |
| Same, relocated work root with no `.git` above it, locked | 0 | passed; no Git launch | `diagnose-relocated.out` |
| `npm run reference:cases`, locked | 0 | 37 files, 393 tests | `cases.stdout`, `cases.stderr` |

The locked runs took place from 03:18:20 to 03:25:45 UTC. The diff hash was the
same before and after them. The second worktree was not touched. Its `.git` is
also a link file, and the same `lstat` rule applies there.

## Open items

- The `I2-19:batch-no-daemon` row and its Plan 2 subcase text say "finite
  compiler helpers remain permitted". The handler now also permits the one
  advisory Git child when a `.git` entry is at or above the root. The row is
  byte-identical and its prose is incomplete. The `I1-28:no-servers` row still
  describes its handler.
- `scripts/reference-harness/README.md` (iteration 13 paragraph) still says
  "only the reviewed finite compiler helpers are permitted". This has been
  outdated since iteration 17 changed `I1-28`.
- When the root lies inside an ignored directory with content, Git fails with
  exit 128, so such a project never gets advice. The contract allows this, since
  a failed command gives no advice. It is recorded as an observation, not a
  defect.

## Coordinator review

Iteration 17's gate on `fc3680d4` failed one Plan 2 instance,
`I2-19:batch-no-daemon`. The coordinator reviewed the diagnosis: the fifth
child was the CLI's own Git advice command, started because the instance's
project copy lies beneath the checkout's `.git` entry, and the shared
boundary check counted every child as a compiler helper. This is a harness
gap; the CLI follows its contract. Both handlers now require exactly the
number of advice launches the project's location implies and still require
every other child to be a compiler helper and every child to have exited.
The harness README says so. The reviewed `I2-19:batch-no-daemon` row stays
byte-identical; its prose names only compiler helpers and is listed as stale.
The coordinator's review of iteration 17 missed that only the Plan 1 handler
had been updated. The gate is rerun on the committed candidate.
