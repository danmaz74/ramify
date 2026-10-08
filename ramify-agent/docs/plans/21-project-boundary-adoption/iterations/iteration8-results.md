# Iteration 8: incomplete-request rejection and durable reassessment results

**Date:** 2026-10-08. **Status:** iteration 8 source qualified by the
`ramify-audit@0.7.2` normal audit of clean `d7d32df8`. It was requested as
ramify-partial and executed as a full audit through the drift-cap fallback,
and it passed. The branch push awaits coordinator review. **Entry source:**
`60c47577` (clean).
**Source commits** on `feat/plan21-project-boundary-adoption`:

- `cb6f66f877de9fc58ab6730fbf90c63d4c752013` (tree
  `9f3f11405bdcdf8690ede9642e400a26b3239bdc`): reject incomplete completion
  and handback requests in the same turn;
- `d7d32df80f6acaee44bc3475731e423922a2eceb` (tree
  `3729058fc65f4764bc561e540c6f41ce4d1e3a94`): describe the same-turn
  rejection in the prompts, harness README and acceptance-scenarios
  architecture. This is the final audited source.

This is intermediate Plan 21 qualification work, not production enablement.
The provider pair is unchanged: exact `ramify.ts` 0.4.1 and `ramify-audit`
0.7.2. Run policy stays `run-policy/7`; no policy bump. No protected document
was edited, nothing was pushed by the implementation agent and iteration 9
was not started.

## Actual changes

**Rejection, not refusal.** `work/obligations.ts` replaces
`unreportedObligations`/`unreportedText` with `outstandingReports`, which
gives the registered IDs the responsible architect still owes after the
request's own reports and registrations apply. It also adds
`incompleteRequestError`. The IDs come from the architect's own scenarios,
`cap-NNN`, registered cases and tests, and a test registered in the same
request is owed at once. A report revised to `bound` owes the ID again.
`validateLocalArchitect` adds the error to a `request-completion`, and
`validateCapabilityAction` adds it to a `request-handback`. Each error has
the path `reports`. The message is "This completion|handback request leaves
<IDs> without a done report…", and it says to report each, assign the
remaining work or submit `unresolved`. The check runs only once the request's
reports are otherwise valid, so an invalid report is answered first. A
missing `where` is never a reason.

The rejection goes through the existing `SubmissionJudge` and its per-turn
bound (`rejectedSubmissionsPerTurn`, 3), and the same session continues. There
is no new counter, continuation brief, outstanding-question record or
clarification flow. Exhaustion ends the invocation as `invalid-submission`.
The run fails with reason `invalid-submission`, and the message names the IDs
that the last rejected request left owed (`unreportedByCompletion` /
`unreportedByHandback`). This is not a code verdict.

**Removed interim refusals.** The run service no longer refuses a local
completion for unreported scenarios, and `verifyCapabilityHandback` no longer
refuses an unreported handback. Open or owed requirements and unresolved
capability work still refuse a valid request under the refusal bound. The
"Completion was refused" briefing now covers only those cases, and
`acceptance-incomplete` is produced only by that capability-work exhaustion
and by the final-gate rule.

**Durable declarations.** `obligation-reported` is now a run-service
boundary that calls `afterWrite` and the ignoring check. It has a
recovery-table row (SM4, `iteration`, interrupted), and the
composition-identity entries cover `obligation-registered` and
`obligation-reported`. The boundary count is now 44. Reports are recorded
idempotently by `by`+`submission` before the action's effect. An accepted
capability action whose effect is missing is replayed with its report, and
the report is not recorded a second time.

**Reassessment facts.** Architect briefings use the new
`obligationBriefing`. It keeps the unchanged `# Registered obligations` lines
and, separately, adds `# Accepted source since your reports`. That section
names the current accepted source and each report made against earlier
accepted source, and it points to `inspect_git` `diff`. It says the reports
stand and that revising them is the architect's judgment. Nothing infers,
resets or withdraws a report.

**Prompts and docs.** The following now state the same-turn rejection, the
three answers and the shared bound, and say never to report done just to
pass:

- capability architect procedure, version 4;
- local architect procedure, version 9;
- local architect capability procedure, version 4.

The first two also state the reassessment paragraph. The scenario briefing,
the harness README, `docs/architecture/acceptance-scenarios.md` §9 and the
`acceptance-incomplete` protocol comment are updated to match.

## Acceptance mapping

| Case | Evidence |
| --- | --- |
| PB3-C01 | `local-architect-submission.test.ts`, "PB3-C01: a completion request owes a done report…". Its three unit tests cover: rejection naming `sc-001`; the request's own report with or without `where`; another architect's IDs; a same-request test registration; done owing nothing; `bound` owing again; assign/unresolved owing nothing; an invalid report judged first; and the joint answer with the request's own errors. The in-run test "PB3-C01: … rejected naming the ID before any outline or gate; the same turn reports it and completes" covers one session, verdicts `[rejected (remaining 2), accepted]`, one outline, one work-item gate, and one rejection observation ([trace](../evidence/iteration8-incomplete-requests/c01-forgotten-report-trace.json)). In `capability-submission.test.ts`, "PB3-C01 a handback request missing a report is a rejected submission naming the IDs…" (`partial`/`unresolved` accepted, stale report judged only as `basedOnRevision`). In `capability-dependencies.test.ts` real C child, a handback without reports is rejected naming `cap-002` and is reported and handed back in the same turn, with no gate inside that turn. In `scenario-states.test.ts`, "PB3-C01 a request is rejected while a scenario of its entry is pending…" and the D03 test (bound scenario, rejected then reported in one turn). |
| PB3-C02 | `scenario-states.test.ts` "PB3-C02 a rejected request whose scenario is unfinished assigns the work in the same turn; the engineer binds it and the next turn reports it done" (`bound sc-001 (no fakes)`, `reported sc-001 done`, nothing manufactured). `local-architect-submission.test.ts` "PB3-C02: an architect that cannot finish states the blocker in the same turn…" (`unresolved` accepted, `unresolvable-requirement` via the fork, `sc-001` still pending, no report, no gate). |
| PB3-C03 | `local-architect-submission.test.ts` "PB3-C03: repeated incomplete requests spend the per-turn bound…": three verdicts, the last `final`, outcome `invalid-submission` with `rejectedSubmissions: 3`, a failure message naming `sc-001`, no outline, gate or report, and `sc-001` pending ([bound evidence](../evidence/iteration8-incomplete-requests/c03-bound-exhaustion.json)). `scenario-states.test.ts` "PB3-C03 rejected to the per-turn bound…". |
| PB3-C04 | `capability-recovery.test.ts` "PB3-C04 PB3-C05: restart after invocation-ended / obligation-reported keeps the accepted action's report once…": after a crash and stale lock at each boundary, the replayed `assign` records one `cap-001` done report before one `capability-assigned`, and the next architect turn shows it under `# Registered obligations` ([traces](../evidence/iteration8-incomplete-requests/)). `run-recovery.test.ts` "PB3-C04 PB3-C05: a crash after obligation-reported keeps the report once, with its invocation and submission, and gates nothing" (ordinary run interrupted, `done: 1`). |
| PB3-C05 | The same capability-recovery tests: one coordinator invocation before the assignment, no writer acquired between the crash and the replayed effect, one writer after it, and one settlement. Recovery-table row `obligation-reported`, run by `composition-recovery*.test.ts`. The idempotent replay of the unit `recordObligations`/binding is unchanged from iterations 5–6. A rejection records nothing, so it has nothing to replay. |
| PB3-C06 | `scenario-states.test.ts` "only the architect's revision moves done back to bound…": the third brief shows `sc-001` done at revision 1 under `# Registered obligations`, and after it a separate `# Accepted source since your reports` naming `revision-02` and "last reported done against accepted source revision-01" ([fresh brief](../evidence/iteration8-incomplete-requests/c06-fresh-brief.md)). The architect then revises through an assignment (a completion request carrying the revision is rejected). No gate result or source change moves a state. |

## Focused verification

All commands ran from `ramify-agent/` with the installed Vitest and explicit
files. No `npm test` or unrestricted `vitest run` was used.

- Seventeen harness files passed 304/304, with 2 opt-in skips in
  `acceptance-trial`, in 307 s
  ([log](../evidence/iteration8-incomplete-requests/focused-harness.log)):
  local architect submission, capability submission, scenario states,
  capability dependencies, capability recovery, run recovery, composition,
  the three composition-recovery files, union values, protocol contract,
  scenario briefings, integration scenarios, acceptance trial, requirement
  verification and plan deviations.
- `npm run type-check` exited 0 for all four compiler configurations
  ([log](../evidence/iteration8-incomplete-requests/type-check.log)).
- `npm run check:self` passed with 0 errors, 0 warnings and 316 nonblocking
  analysis limits over 12 owners, 583 source files, 56 resources and 11,714
  accesses ([log](../evidence/iteration8-incomplete-requests/check-self.log)).
  No exposure was added.

The focused log predates the prompt/README commit, which changes no
behavior. The audit covers the final tree.

## Delivery audit

From the repository root on clean `d7d32df8`:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

| Source | Window (UTC) | Requested mode | Executed mode | Result |
| --- | --- | --- | --- | --- |
| `d7d32df8` | 01:21:27–01:38:05 | ramify-partial (defaulted) | full (drift-cap fallback) | **pass**: 251/253 files, 0 failed |

- **Evidence.** The projection is
  [delivery-audit.json](../evidence/iteration8-incomplete-requests/delivery-audit.json).
  The raw JSON is `/tmp/pb3-it8-audit.json`, with its SHA-256 recorded
  there.
- **Run.** The audit took 998.1 s and the CLI exited 0, with status
  `completed` and `overall: pass`.
- **Identifiers.** Request `16683f1a-61cd-4c9c-9f16-f1325f5957af`, run
  `2eb632df-edc1-4c80-b542-a41d8617aaf2`, report
  `d474b66f0dcd07ccba11c7d68120476038b810f4`.
- **Mode.** The default ramify-partial request fell back to a full audit:
  "drift-cap: 29 distinct paths selected a module since the full audit at
  5f18be0d (limit 25)". So this is a new full baseline (chain depth 0), not
  a scoped composition. `docs/**` is ignored.
- **Checks.** All five passed: agent-structure (17.8 s), agent-tests
  (962.0 s), agent-typecheck (5.9 s), agent-web-build (0.6 s) and
  patch-integrity.
- **Expected files.** 253 expected and 253 run: `complete`.
- **Counts.** Files: 251 passed, 0 failed and 2 skipped (the opt-in
  `fixture-acceptance` and `fixture-trials`; skipped files are unrun, not
  passes). Tests: 2,044 passed, 0 failed and 6 skipped.
- **Ledger and composition.** The failure ledger is complete with zero
  entries. Composition is `pass`, unscoped, with zero outstanding failures.
- **Run conditions.** Lock wait was 0 s. There was no cancellation and no
  skipped required command, and stderr was empty.
- **Fixes and flakes.** No flaky test was observed, and no fix was needed
  after the audit.

## Deviations and limitations

- The `scenario-states` revision test now carries the `bound` revision on an
  assignment, because a completion request with a `bound` report leaves the
  ID owed and is rejected. That rejection is asserted. A third engineer
  iteration rebinds it.
- `acceptance-incomplete` keeps its name for the capability-work refusal
  bound. No driven test produces it, so it moved to the composition
  `withoutProducer` table with a reason. Its final-gate rule stays covered by
  the `incompleteScenarios` unit test.
- The C04/C05 restart traces cover the capability flow. An ordinary local
  run is interrupted at `obligation-reported`, as its recovery row states,
  and is not replayed.
- The evidence traces were produced by temporary copies of the committed
  tests that dumped JSON. The copies were deleted and are not part of the
  source.
- This receipt commit is documentation only. The audit checked source
  `d7d32df8`, not the receipt commit.

## Protected-file comparison

The baseline taken at entry `60c47577` lists the 16 tracked
`.principles.md`/`.spec.md` files, exactly the tracked set at `d7d32df8`.
Before the receipt commit, all 16 match the baseline in HEAD, the index and
the worktree. No protected path is staged, unstaged, untracked or renamed, and
none changed in any commit since entry
([comparison](../evidence/iteration8-incomplete-requests/protected-comparison.json)).
No protected document needed a patch. The two pending authorized
`harness.spec.md` patches remain the coordinator's and were not applied.

## Next-iteration prerequisites

Iteration 9 (audit delivery) may start after the coordinator reviews this
receipt, applies or schedules the pending `harness.spec.md` patches and pushes
the branch, verifying `HEAD == origin/feat/plan21-project-boundary-adoption`
on the live remote. It builds on `run-policy/7` and the exact `ramify.ts`
0.4.1 / `ramify-audit` 0.7.2 pair. It also builds on these:

- `outstandingReports`/`incompleteRequestError`;
- the `obligation-reported` boundary;
- the briefing's separate accepted-source section.
