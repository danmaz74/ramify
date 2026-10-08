# Plan 23 execution and parallelism

**Parent:** [main plan](main-plan.md). The user's request explicitly permits
iteration parallelism when safe. Earlier plans' serial execution preferences do
not impose serial delivery on this plan.

## Worktrees and ownership

Iteration 0 records a clean integration base and the exact treatment of concurrent
staged work. Preserve the main checkout and its index. Each concurrent worker uses
its own worktree/branch from accepted dependencies, with separate scratch, run
directories, fixture copies and provider state. Never run two mutating trials on
one fixture or worktree. Use one worker per ready iteration, within available
agent/host capacity; starting with three workers is sufficient to exploit the graph.

Each iteration owns only the paths named in its brief and its own results file.
Before starting, expand the write set to exact files and compare it with active
iterations. Distinct feature names do not prove safe independence. If a shared
file is needed, move that edit to the designated integration iteration or serialize
the affected iterations. A shared contract change invalidates dependent assumptions
and requires their review before integration.

The central integrator alone edits `iterations/manifest.json` execution status,
cross-iteration reports and shared test configuration/registration. Workers provide
proposed boundary witnesses; iteration 14 adds and registers the final native
witness files together. Earlier iterations use ordinary scripted checks and make
no unverified native claim. Existing registered native tests may be run focused
through `npm run test:boundaries`; focused runs never take the machine lock,
which only a full audit owns, and registration is never bypassed.

## Integration order

After 0, iterations 1–6 have disjoint write sets. Iteration 7 follows 1 and owns
pi-specific files. Iteration 8 waits for 2 and 7, then 9 follows 8. Iteration 10
joins 3, 4, 5 and 9. Iteration 11 joins 6 and 10; 13 may run beside 11 and 12.
Iteration 14 waits for 12 and 13. This is a dependency schedule, not fixed waves.

In particular:

- 1 owns new session primitives/storage and agent port/scripted behavior; 7 owns
  pi implementation. They run sequentially.
- 2 owns prompt templates/renderers; 5 owns catalog/form validation, leaving
  prompt wiring to 10. Their tests and files are separate.
- 3 owns mutation hooks/shell execution; 4 owns focused-command construction and
  `shell-tests.ts` classification. Shared equipment/run wiring waits for 10.
- 6 owns metric calculations; 11 owns observation capture/protocol/service wiring,
  then 12 owns web rendering. Their shared records are not edited concurrently.
- Only 8, then 9, then 10, then 11 modify the central run service.
- 13 owns trial scripts and fixture inputs; it does not modify runtime metrics or
  the run service while 11/12 are active.

Provider changes can be introduced additively for compilable intermediate commits.
Temporary old internal entry points may serve unmigrated callers until 9; they are
removed once the final caller migrates. This is build sequencing, not legacy-session
support. Do not enable a partially migrated workflow or label replacement starts
as preserving forks. Iteration 9's exit requires all invocation sites migrated.

## Receipts and checks

Each iteration produces `iterations/NN-results.md` with exact base/head, changed
paths, contract versions, acceptance IDs, commands/outcomes, native limitations,
remaining gaps and handoff. Tests use independently scripted external evidence.
Run focused checks once after meaningful changes; repeat for new edits or failures.

Before accepting a branch, the integrator reviews its write set and receipt,
integrates it without unrelated user edits, and reruns affected cross-boundary
checks and type/structural validation on the integrated candidate. Serialize
merges and shared native/audit workloads even while coding continues independently.
A failed prerequisite blocks only its dependent iterations. Ordinary work can
continue in other branches without claiming the blocked integration passed.

No controlled baseline or performance comparison is collected in this plan. A
real run may be started to debug an integrated behavior when that is useful; its
records are kept as debugging evidence, never as acceptance evidence. Missing
live access leaves the live transport witness open but does not block unrelated
deterministic implementation.

The final full audit and live qualification run against the same recorded delivery
candidate. Do not use the dirty main checkout as a passing clean candidate or
infer completion from an earlier plan's audit. No push/publication is required by
this planning request; execution follows the authorization in effect when it starts.
