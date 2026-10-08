# Iteration 7: architect-owned delegation handback results

**Date:** 2026-10-08. **Status:** iteration 7 source qualified by the
`ramify-audit@0.7.2` normal audit of clean `a841c945`, which executed in
ramify-partial mode over its iteration 6 full baseline and passed; branch
push awaits coordinator review. **Entry source:** `a4faa28c` (clean).
**Source commits** on `feat/plan21-project-boundary-adoption`:

- `86f5a83c1d37b80aef0c3c9f769b767c5dd13d58` (tree
  `55fc3d91ab1ba46f559f36543984da366917bf2c`): hand back a capability on its
  architect's done reports, with the task view and web page;
- `a841c945b2834f9881397f242673b8be32de9440` (tree
  `762d190e79b41952d343d6c4ebc8f6f99d93ec84`): describe the handback as the
  capability architect's done report in the prompts, harness README,
  architecture and glossary. This is the final audited source.

This is intermediate Plan 21 qualification work, not production enablement.
The provider pair is unchanged: exact `ramify.ts` 0.4.1 and `ramify-audit`
0.7.2. Run policy stays `run-policy/7`; no policy bump. No protected document
was edited, nothing was pushed by the implementation agent and iteration 8
was not started.

## Actual changes

**No per-example coverage record.** The capability plan's use case is
`{ id, expectedBehavior, derivedFrom }`; the `coverage` union with its
`unresolved`, `exercised` and `corrected` states, evidence and test arrays,
and the recorded `candidate`/`configuration` extension are removed from
`capability/records.ts`. The plan schema still requires a case for every
original example and `originalExamples` in every revision, and a case still
derives only from original examples. `request-handback` no longer carries
`coverage`; it is `{ summary, interfaces, limitations }` plus the
submission's `reports`, which are the handback. The initial and nested
initial plans carry no coverage.

**Removed gates.** From `verifyCapabilityHandback`: the per-example "lacks
resolved coverage" and "cites evidence outside the current plan" checks, the
"No selected passing test for <owner>" provider/consumer inventory and
"Case … cites unexecuted test" matching, and the `executedTestFiles` reader
of the gate's Vitest file results. From `capabilityHandbackReadiness`: the
per-example coverage loop; readiness is structural only.

**Reporting completeness.** Before any gate, a handback is refused while an
obligation the task's architect is responsible for (`cap-NNN`, and any case
or test it registered) is not reported `done`, naming each with the shared
`unreportedText` from `work/obligations.ts` (`unreportedObligations` selects
them). Local completion uses the same text, replacing `scenarioRefusal`.
Examples and derived cases are not tracked reporting objects. Iteration 8
replaces both refusals with the general rejected submission.

**Retained boundaries.** Plan/dependency, consultation, write scope,
accepted-iteration currency, correction, completion-basis and the ordinary
gate and review requested for accepted iterations are unchanged. No new
review role or fixed fake suite is introduced.

**Projections and prompts.** The capability task view carries the task's
obligations with the architect's reports (`obligations`), and its cases
carry no coverage. The web page shows the examples as the request's
unchanged context, the current design's cases, the architect's reports and
the handback "on the architect's report". The capability architect procedure
(version 3) states that the handback is its done report, refused naming any
unreported obligation, checking no cited file or per-example state, and that
the consumer's work stays open; the local architect capability procedure
(version 3) states that its scenarios remain its own to assess. The harness
README, glossary "Handback" and `docs/architecture/autonomous-implementation-loop.md`
follow. A `run-policy/6` run, and with it any recorded coverage, stays
refused; no reader of the old fields remains.

## Acceptance mapping

| Case | Evidence |
| --- | --- |
| PB3-D08 | `capability-submission.test.ts` "PB3-D08 a case carries no coverage and a handback cites no evidence: both old fields are refused by the schemas" and "PB3-D08 PB3-D09 a handback owes a done report for each registered obligation of its task, outcome-only or separately tracked, and none for an example"; `capability-records.test.ts` "PB3-D08 refuses a handback outside verification and materializes one with no per-example coverage state, leaving the request unchanged"; `capability-state.test.ts` "CA34 PB3-D08 handback readiness is structural"; `capability-dependencies.test.ts` real C child: a handback without reports is refused "Handback refused for cap-002: cap-002 is pending and not reported done" with no work-item gate before the next turn, which reports done with no `where` and is handed back; `capability-acceptance.integration.test.ts` the done report on `cap-001` precedes the handback and cites no executed file. |
| PB3-D09 | `capability-records.test.ts` "CA11 preserves original examples and old plan revisions across a corrected oracle" (request unchanged, no coverage key, coverage refused, dropping the example's case rejected); `capability-submission.test.ts` "CA11 PB3-D09 builds a revision with stable case identity, keeps the original examples, and refuses silent case deletion" with a derived case that registers nothing; the outcome-only versus registered case/test test above; the acceptance test keeps `originalExamples` in plan revisions 1–3 with no coverage keys. |
| PB3-D10 | `capability-dependencies.test.ts`: the only `obligation-reported` is `cap-002` done by the child; the parent `cap-001` stays unreported while the original B assignment continues. `capability-acceptance.integration.test.ts`: after handback, no `sc-001` report and no `wi-001` `work-item-completed`; the consumer A assignment resumes. In `repair-exhaustion` the `cap-001` done report stays `[done, 1]` beside at least four failed gates, each with its cause, and no handback. |
| Projection | `capability-tasks-projection.test.ts` "CA23 CA34 PB3-D08: committed handback closes only the task, shows the architect's report as its judgment and retains the separate B entry"; web `capability-tasks.test.tsx` "PB3-D08: examples are the request's context and the handback is the architect's report, with no per-example state". |

**Consumer-return trace** (acceptance success path): the A engineer's
`capability-needed` opens `cap-001` → B/D/P assignments and the combined gate
→ `obligation-reported cap-001 done` (where `subs/a/src/tests/caller.test.ts`,
unvalidated text) → `capability-verification-started` → `capability-handed-back`
→ the original A assignment continues from the current candidate; the A
entry's `sc-001` and `wi-001` remain the local architect's to report.

## Focused verification

All commands ran from `ramify-agent/` with the installed Vitest and explicit
files. No `npm test` or unrestricted `vitest run` was used.

- `capability-acceptance.integration.test.ts`: 12/12 passed in 1,008 s
  ([log](../evidence/iteration7-delegation-handback/focused-acceptance.log)).
- `capability-dependencies` with `capability-submission`: 24/24 passed in
  304 s ([log](../evidence/iteration7-delegation-handback/focused-dependencies.log)).
- Fourteen harness files (capability recovery, delegation, consultation,
  assignments, historical resume, records, submission, state and task
  projection; local architect submission; execution map projection;
  composition, union values and protocol contract): 198/198 passed
  ([log](../evidence/iteration7-delegation-handback/focused-harness.log)).
  Scenario states, briefings, capability state and task projection earlier
  passed 43/43.
- Four web files (capability tasks, run page, capability module tree,
  execution map): 82/82 passed
  ([log](../evidence/iteration7-delegation-handback/focused-web.log)).
- `npm run type-check` exited 0 for all four compiler configurations
  ([log](../evidence/iteration7-delegation-handback/type-check.log)).
- `npm run check:self` passed with 0 errors, 0 warnings and 316 nonblocking
  analysis limits over 12 owners, 583 source files, 56 resources and 11,705
  accesses ([log](../evidence/iteration7-delegation-handback/check-self.log)).
  Its first run denied the web's import of `ObligationView` (not re-exposed by
  the root); the page now names the type through `CapabilityTaskView`.

The acceptance and dependency logs predate two edits with no behavior change
(an unused import and that type reference); the audit covers the final tree.

## Delivery audit

From the repository root on clean `a841c945`:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

| Source | Window (UTC) | Requested mode | Executed mode | Result |
| --- | --- | --- | --- | --- |
| `a841c945` | 00:28:34–00:45:26 | ramify-partial (defaulted) | ramify-partial (scoped) | **pass**: 209/211 files, 0 failed |

The projection is
[delivery-audit.json](../evidence/iteration7-delegation-handback/delivery-audit.json);
the raw JSON is `/tmp/pb3-it7-audit.json` with its SHA-256 recorded there.
The audit took 1,011.5 s, CLI exit 0, status `completed`, `overall: pass`.
Request `4601fb57-8e57-4a2b-a865-3e02d135aa8e`, run
`8f4c2e29-5377-4f8d-8498-b5d2c3d2f78f`, report
`ba539aa40ae36faa1da48dde6ca0cc2e6c6c2561`. It executed `ramify-partial`
with Ramify 0.4.1's affected answer, selecting the modules `ramify-agent`,
`harness`, `harness/agent/pi`, `harness/audit` and `web` and all five checks,
chained (depth 1) on the iteration 6 full report `6654b7d8` with no carried
failures; `docs/**` is ignored. agent-structure (17.5 s), agent-tests
(975.6 s), agent-typecheck (5.7 s), agent-web-build (0.7 s) and
patch-integrity all passed. Expected files 211, run 211, `complete`. Files:
209 passed, 0 failed, 2 skipped (the opt-in `fixture-acceptance` and
`fixture-trials`; skips are unrun, not passes). Tests: 1,669 passed, 0
failed, 6 skipped. The failure ledger is complete with zero entries;
composition `pass`, scoped, zero outstanding failures. No lock wait,
cancellation or skipped required command; stderr was empty. No flaky test
was observed, and no fix was needed after the audit.

## Deviations and limitations

- The handback refusal for unreported obligations is interim, like the local
  completion refusal; iteration 8 replaces both with the general rejected
  submission under the per-turn bound (PB3-C01).
- Schema identities are unchanged (`ramify-agent.capability-plan/1`);
  recorded coverage is refused with its `run-policy/6` run rather than read.
- The changed capability task page was verified in jsdom only; no browser
  acceptance script covers it, so no desktop/narrow screenshots were taken.
- The paid Plan 13 probe and the opt-in fixture acceptance/trial suites were
  not run.
- This receipt commit is documentation only. The audit checked source
  `a841c945`, not the receipt commit.

## Protected-file comparison

The baseline taken at entry `a4faa28c` lists the 16 tracked
`.principles.md`/`.spec.md` files, which are exactly the tracked set at
`a841c945`. Before the receipt commit, all 16 match the baseline in HEAD, the
index and the worktree; no protected path is staged, unstaged, untracked or
renamed, and none changed in any commit since entry
([comparison](../evidence/iteration7-delegation-handback/protected-comparison.json)).
The two pending authorized `harness.spec.md` patches remain the
coordinator's and were not applied.

## Next-iteration prerequisites

Iteration 8 (clarification and recovery) may start after the coordinator
reviews this receipt, applies or schedules the pending `harness.spec.md`
patches and pushes the branch, verifying
`HEAD == origin/feat/plan21-project-boundary-adoption` on the live remote. It
builds on `run-policy/7`, the exact `ramify.ts` 0.4.1 / `ramify-audit` 0.7.2
pair, the single obligation fold, and `unreportedObligations` /
`unreportedText`, whose two interim refusals (local completion and capability
handback) it converts to rejected submissions.
