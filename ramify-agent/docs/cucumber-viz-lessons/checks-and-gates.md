# cucumber-viz lessons: checks and gates

Part of [Lessons from cucumber-viz](README.md), which explains the verdicts,
sources and path abbreviations. "The proposal" is the
[core records proposal](../plans/03-autonomous-implementation-loop/core-records.proposal.md);
most consequences here concern its `GateAttempt`.

## 1. The producer names an infrastructure failure

**Adopt.** cucumber-viz classifies a failed check in one place, and the
comment there is the lesson: the classifier "deliberately does NOT scan
free-text summary/output for infra-sounding words." A lint failure whose
output mentions "crash" or "spawn" is an ordinary finding. A failure is
infrastructure only when the site that produced it set a structured
`runnerError`. The runner sets it when the spawn error's code is a string such
as `ENOENT`; a numeric exit code is an ordinary failure.

The 0.3.0 runner had no category, and its Vitest investigation records that a
timeout could not be told from a failing test, which sent the diagnosis the
wrong way.

Evidence: `IS/core/workflow/checks/check-disposition.ts:14-34`;
`IS/core/runtime/check-execution/check-runner.ts:764-772`; in the repository,
`docs/vitest-investigation.md`.

Consequence:

- Each entry of `GateAttempt.commands` gains
  `runnerError: { kind: string; message: string } | null`, set only by the code
  that spawns the command.
- `GateAttempt.cause` is derived: a `runnerError` gives `infrastructure`, a
  timeout gives `timeout`, and a completed command with a non-zero exit gives
  the code causes. `timeout` is missing from the proposal's union and is added.
  It is `not-verified` and uses infrastructure recovery, with its own count so
  a suite that always times out is visible as such.
- No cause is ever derived from output text.

## 2. A check that did not run says why

**Adopt.** cucumber-viz returns the checks it included and, for every check it
skipped, a reason from a closed set, and persists the reason on the finding
"so a skipped owner check is never silently interpreted as a successful fix."
In 0.3.0 a skipped check reported `passed: true` and an empty selection
aggregated to a pass.

Evidence: `IS/core/runtime/check-execution/iteration-check-filtering.ts:22-32`.

Consequence:

- `outcome: 'not-verified'` carries a reason from a closed set: `timeout`,
  `runner-error`, `command-missing`, `empty-selection`, `interrupted`,
  `tree-changed`.
- `TestSelection` records what it resolved to, the test files or suites, beside
  the policy and owners that selected them. A reader can then see that the
  included-child subtree really contributed tests.
- An empty resolution where tests are required is `empty-selection`, never a
  pass.

## 3. Evidence names the tree it tested

**Adopt.** cucumber-viz keys its audit evidence by the source commit and the
source tree, under a reference named by tree. Its one incident report explains
why a commit is not enough: a stale worktree let an audit pass on a commit that
reverted 160 files. Its audit also resolves how it will execute before any
check runs, and aborts before evidence exists when it cannot: "An audit never
claims a mode it did not execute."

Evidence: `IS/feature-tests/audit-test-mode.viz.feature:5-9`; in the
repository, `docs/incidents-reports/2026-04-21-unexpected-audited-snapshot-rollback.md`;
`IS/core/runtime/audit/commit-evidence-service.ts:146-168`, not read directly.

Consequence:

- `TreeIdentity.git` is diagnostic only, as the proposal has it; a pass is
  current only for a matching content identity. The open verification of what
  Ramify's `input` covers decides whether the harness adds its own tree hash.
  A git tree hash is a candidate, but uncommitted work is the normal state of a
  run, so it would need a temporary index and is not free.
- Before its first command, a gate verifies that every command exists and every
  required selection is non-empty. A gate that cannot run what its checkpoint
  requires records `not-verified` and runs nothing, instead of running a part
  and reporting on it.

## 4. Full output in a file, a bounded tail in the record

**Adopt.** cucumber-viz stores each check's complete output as `output.log`
and keeps, in the record, the path, the byte count, a truncation flag and the
last 8 KiB, for the whole check and for each command. The 0.3.0 runner merged
the streams into one string in memory.

Evidence: `IS/core/runtime/check-execution/check-result-artifact-store.ts:14`
and `:36-56`.

Consequence: each `GateAttempt.commands` entry replaces
`log: string; diagnostics: string[]` with
`output: { path, bytes, truncated, tail }`, and the tail has a fixed bound.
What returns to an engineer is built from the tail and from lesson 6, never
from the whole log.

## 5. Kill the process group

**Adopt.** cucumber-viz runs every check command through a wrapper script that
cleans up the process group, with a 30 minute timeout and a 20 MB output cap.
The Vitest investigation explains it: with `forceExit` and forked workers,
workers still survived the main process, were reparented to PID 1 and consumed
a core each. Parent-child cleanup cannot see them. The fix was `setsid` and
`kill -9 -- -$PGID`.

It also strips `NODE_OPTIONS` from the environment of a check, and deletes it
again after a command's own environment is merged.

Evidence: `IS/core/runtime/check-execution/check-runner.ts:24-29`, `:93-98`,
`:590-601` and `:732-733`; in the repository, `docs/vitest-investigation.md:11-25`.

Consequence:

- `CheckCommand` gains `env`, and the harness builds a clean environment for
  it instead of inheriting its own.
- Every gate and hook command runs in its own process group. After exit or
  timeout the harness kills the group and records that it did.
- The same mechanism serves writer settlement: a mutating subprocess of an
  agent is confirmed stopped by its group, not by the agent's word. This is the
  architecture's requirement that "discarding a reply does not establish
  shutdown", with a known way to meet it.
- ramify-agent's own tests use Vitest, so the plan's readiness check should
  look for surviving workers in the target project too.

## 6. Failed tests have identities

**Consider.** cucumber-viz gives the test runner a summary file through
`VITEST_SUMMARY_FILE` or `CUCUMBER_SUMMARY_FILE` and reads failed tests from it
as `{ file, name, line, stableId }`, instead of parsing output.

Evidence: `IS/core/runtime/check-execution/check-runner.ts:421-442`.

Consequence: for the one runner the MVP supports, read its machine report and
keep `failedTests` on the command entry. This makes a repair round's
diagnostics short and exact, and lets a later attempt show that the same test
fails again. It is not a per-finding registry: the identities are evidence on
an attempt, with no lifecycle of their own.

## 7. A guarded change records both hashes, and deletion is its own case

**Adopt.** cucumber-viz authorizes a write to a sealed file with two hashes,
the content it expects to replace and the content approved. Its enforcement
feature blocks completion for a changed seal control and for a deleted sealed
target, each with its own code and no waiver.

Evidence: `IS/feature-tests/sealed-files-enforcement.viz.feature:42-65`;
`IS/core/runtime/sealed-files/sealed-file-prewrite.ts:110-129`, not read
directly.

Consequence: `GateAttempt.guardedChanges` entries become
`{ path, before, after, authorizedBy }`, where `after: null` is a deletion. A
deleted test configuration or contract artifact is a guarded change like any
other and cannot pass as an absent file. The MVP still needs no sealing
mechanism: comparing captured hashes at the gate is enough.

## 8. Missing sessions do not spend the repair budget

**Confirms.** cucumber-viz's interruption feature states that a missing
session "does not consume remediation budget".

Evidence: `IS/feature-tests/workflow-executor-interruptions.viz.feature:12-16`.

Consequence: the proposal's separate `repairRound` and `infrastructureAttempt`
counts, both derived from history, match this. `obligation-scan-fail-closed`
confirms that a scan that fails never counts as a pass.

## Avoid

The flaky-test stack and the drift subsystem, as the [index](README.md#what-not-to-copy)
records. If flaky tests disturb a trial, the smallest remedy is two focused
reruns of the failed identities from lesson 6 before a repair round starts.

## Not found

No recorded incident of an agent weakening tests or configuration to pass a
gate; sealed files protect planning artifacts. Nothing about running tests of
independent nested packages. The architecture's requirements for both rest on
reasoning, not on cucumber-viz evidence.
