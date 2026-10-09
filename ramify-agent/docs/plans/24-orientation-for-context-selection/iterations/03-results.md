# Iteration 3: ordinary fresh starts when reuse is unavailable

**Date:** 2026-10-09. **Outcome:** complete. Source commit:
`c3e496dec03c5012afda6ca42167ba6c9d7ecb9f`. Worktree:
`/home/app/ramify-plan24-orientation`, branch `feat/plan24-orientation`.

## Changed behavior

- Exhausted work orientation proceeds to fresh selection and assignment using
  ordinary current work-item inputs. Existing invocation history identifies the
  attempt count on restart. An accepted orientation whose publishing event was
  not written still recovers by its immutable operation intent.
- Missing or altered orientation packet bytes are discarded as reusable context.
  Selection provenance identifies the last orientation attempt, with a null
  retained point and the existing degraded flag when selection starts fresh.
- An unavailable actual fork or continuation ends its original invocation, then
  permits one new fresh invocation with the ordinary full packet and an existing
  degradation reason. Selector forks retain their thin prompt; the fresh attempt
  receives the full work brief, own-item elements and recorded orientation when
  usable. Qualification, reconciliation, capability, consultation and continuing
  engineer/contract tasks share this small path. Capability request facts use a
  stable named section, so ordinary continued delivery keeps its existing deltas.
- Failed or unreadable recorded design orientation leads to a fresh review with
  its captured guidance pointers and candidate tools, without another orientation.
  Authoritative review-point mismatches and active-source conflicts remain errors.
- Global append loss records `brief-not-appended`; future requests receive their
  ordinary request, registry, hypotheses and decisions. New losses create no
  rebuild generations or replacement parents. Historical rebuild and replacement
  readers remain available. Engineer and capability cache loss no longer consumes
  a separate reconstruction budget before using the ordinary fresh path.
- Missing briefing ancestry is a reusable-context loss; mismatched ancestry,
  foreign-run references, task/authority failures, cancellations and conflicts do
  not license the new fresh retry. Failed append receipts retain failure handling.

## Ownership extension

The owning agent interface/engine and Pi adapter required a small extension beyond
harness workflow branches. `SessionOperationReceipt.contextUnavailable` is an
optional indication supplied only for known missing session/history/payload input;
its absence never licenses fresh retry. Missing operation intent, unsupported
transport/model, initialization failures and uncertain effects are unflagged.
Pi retains typed history errors while arbitrary provider/extension errors remain
ordinary failures. The harness carries this indication through its existing
session-loss result. Generated harness ordinary/testing API views were refreshed
and searched; no generated files were edited or committed. Materialization log:
`/tmp/plan24-iteration3-materialize.log`.

## Verification

Commands ran from `ramify-agent/`:

```sh
npm run test:quick -- \
  subs/harness/src/tests/context-selection-runtime.test.ts \
  subs/harness/src/tests/placement.test.ts \
  subs/harness/src/tests/review-questions.test.ts \
  subs/harness/src/tests/review-stop.test.ts \
  subs/harness/src/tests/capability-consultation.test.ts \
  subs/harness/src/tests/reconciliation.test.ts \
  subs/harness/src/tests/iteration-gate.test.ts \
  subs/harness/src/tests/capability-recovery.test.ts \
  subs/harness/src/tests/capability-delegation.test.ts \
  subs/harness/subs/agent/src/tests/plan23-session-operations.test.ts \
  subs/harness/subs/agent/subs/pi/src/tests/plan23-prefix-preservation.test.ts \
  subs/harness/src/tests/union-values.test.ts \
  subs/harness/src/tests/lineage-metrics.test.ts \
  subs/harness/src/tests/plan23-continuing-work.test.ts \
  subs/harness/src/tests/plan23-fork-workflows.test.ts \
  subs/harness/src/tests/composition.test.ts
npm run test:quick -- subs/harness/src/tests/composition.test.ts \
  -t 'the union list is complete'
npm run type-check
npm run check:self
```

- The final affected run executed **16 ordinary files, 308 tests: 307 passed,
  one failed**. The failure was a stale named-test citation in the composition
  inventory after renaming the failed-design-orientation test. Corrected that
  inventory and reran the failed case: **one passed**, exit 0. Its 13 other cases
  were excluded by the name filter; those had already passed in the 308-test run.
  Logs: `/tmp/plan24-iteration3-focused-final.log` and
  `/tmp/plan24-iteration3-composition-final.log`. Do not describe the original
  308-test run as all-pass. Iteration 4 retains the aggregate audit gate.
- Runtime coverage includes exhaustion/restart, accepted-before-event recovery,
  missing/altered packet, actual unavailable fork and continuation startup, full
  fresh selector and assignment inputs, failed design orientation, ordinary global
  fallback, successful retained points and stop handling. Negative controls prove
  failed/unavailable/conflict/stopped task receipts without known context loss
  do not cause fresh retry. Scripted Pi initialization/unsupported transport,
  authority failures and corrupt history retain their distinct outcomes.
- Sixteen process-guard receipts for the final 09:11:12–09:13:05 UTC run window
  record zero native files, allowed launches and refused launches. The corrected
  inventory rerun is also an ordinary guarded test.
- Final type-check passed, exit 0, log
  `/tmp/plan24-iteration3-typecheck-final.log`. Final check:self passed, exit 0:
  12 owners, zero errors/warnings, 328 analysis limits; coverage remains partial.
  Log: `/tmp/plan24-iteration3-structure-final.log`.
- `git diff --check` passed. The only change after final type/structure checks was
  composition inventory metadata, exercised by the corrected-case rerun. No whole
  suite, full audit, live provider or benefit run was performed.

Earlier failing outputs are retained in
`/tmp/plan24-iteration3-focused-initial.log`, `-second.log`, `-third.log`,
`-fourth.log`, `-fifth.log` and the initial through seventh type-check logs.
Failures included old behavior assertions, TypeScript event-union narrowing and
one edited-array parse error; corrected locally. A four-file correction run passed
71 tests in `/tmp/plan24-iteration3-focused-sixth.log`. No flakiness classification
or skipped failing case was used.

## Successor inputs

Iteration 4 owns the metrics/documentation updates and final clean configured
full nested audit. Describe the optional context-unavailable receipt indication,
last-attempt selection provenance and new global append completion consistently
with ordinary fresh fallback; retain historical rebuild readers. The 16-file run
and corrected inventory case establish affected correctness separately from the
final aggregate audit. Benefit assessment remains Dan's responsibility.
The branch has not been pushed.
