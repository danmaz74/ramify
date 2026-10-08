# Optimization 2: guarded capability acceptance matrix

**Date:** 2026-10-08. **Delivery base:** `e1ebdb755b123ffbcc92caa85c8866b8d136fc1b`.
**Branch:** `perf/plan22-capability-acceptance`. This receipt and
[execution evidence](02-capability-acceptance-evidence.json) belong to the isolated
worktree; the coordinator owns reconciliation and merge into the evolving Plan 21 target.

## Change and preservation

All twelve original variants now exercise the real harness, guards, source
capture, ledger, review, correction and replay with scripted external boundaries.
The ordinary file installs the existing process guard before imports and checks
zero attempted child-process launches after each setup/flow/teardown, including
caught errors. Strict Git, candidate, provisional-source, audit and Ramify
responses retain assertion failures the application catches. Required commit,
stage, source-read, candidate-review and configured-check responses must be used.
Cleanup aggregates errors so a response assertion still permits fixture removal.
Git answers are explicit OIDs, changes and frozen file statements; no runtime
repository initialization, filesystem diff/history inference or Git emulator is
introduced. Line and worktree-patch metrics are explicitly unavailable rather
than fabricated zero measurements.

The original behavioral driver moved to `helpers/acceptance-flow.ts`. Every
original behavioral assertion and all CA requirements remain. The assertion that
the captured source is an actual Git tree executes in the dedicated actual
boundary witness. Its other assertions run in both topologies. Ordinary audit
output is explicitly synthetic harness-policy evidence. The boundary witness
runs actual Git and actual local Vitest/tsc commands; its in-place audit adapter
still supplies synthetic provider evidence and does not establish a published
configured audit or actual Ramify ownership conformance.

One necessary production injection gap was found and corrected with coordinator
approval: `capability/source.ts` previously bypassed supplied Git/candidate ports
using raw Git/index reads and global scratch/tree operations. The missing
`ProvisionalSourceGit` port (staged paths and binary `Buffer | null` blobs) now
belongs to evidence. Its default preserves the original actual commands, absent
blob behavior and error propagation. RunService threads its Git and optional
source-read port through all three capability capture call sites. Real capture,
path validation, snapshot hashing, scratch checks and reconciliation remain in
the harness. No package pin, production default outcome or protocol changed.

## Exact twelve-case mapping

Every row moved from the original `capability-acceptance.integration.test.ts`
into the guarded file of that same path, using the named shared-driver mode.
Only the first title changes “real” to “scripted”; its original actual-boundary
claim also maps to the dedicated `capability-acceptance.boundary.test.ts` witness.

| Shared-driver mode | Original title and requirements | Qualified ordinary execution |
| --- | --- | --- |
| revision | CA08 CA11–CA15 CA17 CA25 CA30: real multi-owner migration, repair, handback and linked revision | 1.763 s, passed |
| deferred | CA28: deferred B entry receives accepted handback and replans from current source | 1.384 s, passed |
| drift | CA31: source drift after a passing combined gate cannot be handed back | 0.978 s, passed |
| restart | CA17 CA19 CA28 CA30: restart after handback continues the original A assignment once | 1.108 s, passed |
| verify-restart | CA17 CA20 CA30: restart after verification reuses the accepted gate and review for one handback | 0.843 s, passed |
| gate-restart | CA20 CA30: restart after the passing gate reuses its audited candidate | 0.943 s, passed |
| gate-intent-restart | CA19: in-flight combined capability gate intent recovers one audited commit and handback | 0.802 s, passed |
| gate-committing-restart | CA19: in-flight combined capability gate commit recovers one audited commit and handback | 0.932 s, passed |
| review-restart | CA20 CA30: restart after the passing review reuses the same gate and review | 0.782 s, passed |
| review-submission-restart | CA19: accepted reviewer submissions replay before their combined review record | 0.751 s, passed |
| concern-submission-restart | CA19: a submitted reviewer concern replays into one exact pending attempt and CheckFinding | 1.204 s, passed |
| repair-exhaustion | CA26: failed combined gates exhaust the captured repair bound with the first cause and no handback | 1.059 s, passed |

The expected restart points, gate counts, one handback, submission replay,
review/CheckFinding identities, inherited scope positive and negative controls,
repair bound, first cause, deferred replan, linked revision and architect-report
independence assertions remain in the shared driver. Git-object reality is
verified by the actual witness, never asserted from a fake.

## Qualification and performance

Focused command from `ramify-agent/`:

```sh
node_modules/.bin/vitest run subs/harness/src/tests/capability-acceptance.integration.test.ts subs/harness/src/tests/capability-acceptance.boundary.test.ts subs/harness/src/tests/acceptance-boundaries.test.ts subs/harness/src/tests/provisional-source.test.ts subs/harness/subs/evidence/src/tests/provisional-git.boundary.test.ts subs/harness/subs/evidence/src/tests/git.test.ts subs/harness/subs/evidence/src/tests/candidate-tree.test.ts --reporter=json --outputFile=/tmp/plan22-acceptance-final.json
```

**37 cases in seven files passed, zero failed/skipped.** After the final cleanup
aggregation improvement, the affected acceptance and strict-helper files passed
again: **20 cases in three files, zero failed/skipped** (`/tmp/plan22-acceptance-cleanup-final.json`). This includes all twelve
ordinary variants, one actual composed migration, seven caught/unused-response
negative controls, a guarded binary capture/reconcile witness, two actual binary
index/blob/error witnesses and the existing actual Git/candidate adapter files.
Every ordinary case attempted **zero processes, zero real Git and zero cold
Ramify invocations**. No timeout increase, retry, skip or quarantine was added.

Existing real source regressions were selected independently:

```sh
node_modules/.bin/vitest run subs/harness/src/tests/capability-delegation.test.ts subs/harness/src/tests/capability-recovery.test.ts -t 'provisional snapshot keeps|snapshot written before|retry refuses a changed' --reporter=json --outputFile=/tmp/plan22-source-real-regression.json
```

**Three selected cases passed**: staged/worktree/untracked/deleted byte capture;
exact dirty-index/tree adoption after interruption; rejection/preservation of a
changed staged or untracked candidate. Other cases in those files were filtered,
not claimed passing. The new actual adapter also independently verifies arbitrary
binary bytes, index bytes differing from worktree, missing blobs and cwd/process
errors.

`npm run type-check` and `npm run check:self` both passed. The self-check reported
zero errors/warnings with existing partial coverage and 310 analysis limits;
this is ownership/source conformance evidence within the tool's stated bounds.
`git diff --check` passed. Installed pins are the base's unchanged releases;
node_modules links to the target's installed dependencies.

The post-cleanup original twelve-case focused baseline passed in **109.720 s**
of file execution (8–12 s per variant). The seven-file qualification measured the ordinary matrix at **12.549 s**
and the retained real witness at **8.862 s**, overlapping compiler/self-checks.
The final three-file affected check measured the ordinary twelve-case matrix
at **9.825 s** and the real witness at **7.052 s**. Against that focused baseline,
the ordinary matrix is about **91.0% faster**, and the sum of acceptance file
execution including the real witness is **16.877 s** (about **84.6% lower**). Earlier supplied 959 s is historical
pre-cleanup profiling, not this comparison's baseline. These timings were on
the same host and pins under changing concurrent load; the seven-file qualification
also overlapped type-check/self-check while the final affected check did not. They are diagnostic, not a controlled
millisecond gate or whole-suite/audit speed claim. Actual-boundary process
invocation totals were not measured in this optimization.

## Retained failures and limits

The pre-injection source implementation was restored temporarily only in the
isolated checkout for a focused negative reproduction. The guarded revision
case failed on attempted `execFile git diff --cached --name-only -z`; the
application caught it and the afterEach guard independently detected it. The
new port made that same guarded flow pass.

The first full migration run passed eleven ordinary variants and the actual
witness but timed out (120.096 s) in accepted reviewer submission replay. The
old interruption hook assumed the newest global ledger event still identified
the write being observed. With immediate external answers, independent review
activity can advance that tail. The fixture now identifies the submitted
reviewer by invocation while its exact request remains unfinished; all original
pre-restart and replay assertions still execute. The handback restart also waits
for the scripted continuation to have started before closing its writer.
Two subsequent strict-counter failures identified additional configured checks
in deferred A completion and reused gates on restart; explicit required counts
were corrected against the preserved original behavior. The committed evidence
retains these failures alongside the successful qualification.

Full audit, global process enforcement/runner partition, other slow families,
publication and responsible-architect semantic completion remain outside this
optimization. The coordinator is serializing full audit and preserving active
Plan 21 edits; this receipt does not claim that audit or Plan 21 is complete.
