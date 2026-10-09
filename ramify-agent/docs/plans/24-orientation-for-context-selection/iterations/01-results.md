# Iteration 1: ordinary briefs and project pointers

**Date:** 2026-10-09. **Outcome:** complete. Source commit:
`96fb81ee87293852fe9b40ad11f38f992470d2c6`. Worktree:
`/home/app/ramify-plan24-orientation`, branch `feat/plan24-orientation`.

## Changed behavior

- Work orientation receives its explicit goal and complete requirement,
  acceptance and context elements from the frozen package creator. Qualification
  receives the current work-item package, including after recovery; reconciliation
  receives its current basis and that package. These tasks no longer substitute
  the complete captured plan. Initial analysis still receives its captured plan.
- A small shared renderer supplies declared command argv, cwd and configuration
  pointers without evaluating effective configuration. Initial analysis receives
  known scenario configuration/profile facts. Local, capability, engineering,
  contract and nonfunctional repair sessions receive their known module, test and
  observed API-view pointers. Consultation receives its consumer's pointers.
  No new materialization or readiness configuration acquisition was introduced.
- Local briefs name declaration/source and test paths from module cwd as rooted
  references; their shared briefing preserves them for selector workspaces.
  Known scenario directories list observed step files using the existing helper,
  with no claim that listing establishes runner loading.
- Standalone sessions receive their owned test areas and existing project/package
  setup pointers, using their existing committed-audit acquisition where present.
  Ordinary engineering retains assignment-time focused scenario preparation and
  its single exact shell-command block. Generic Vitest/npm advice was replaced by
  directions to the project's declared runner and configuration.
- Code/scope reviewers receive candidate-relative configuration and observed
  `src/tests` directory references for snapshot tools. They receive no live API
  view reference. Ambiguous ordinary/testing `src` classifications are not guessed.
  Design reviews keep their guidance and receive no new test-setup section or
  test-directory section. Failure analysts receive concise engineer-shell hints.
- Global forks, design orientation, catalog extraction and nonfunctional
  coordination retain their existing request, captured records and scoped source;
  no indiscriminate test setup was added. Optional missing facts remain optional.

## Verification

All commands ran from `ramify-agent/`; every listed check exited **0**.

```sh
npm run test:quick -- \
  subs/harness/src/tests/context-selection-runtime.test.ts \
  subs/harness/src/tests/plan23-task-prompts.test.ts \
  subs/harness/src/tests/single-session.test.ts \
  subs/harness/src/tests/capability-delegation.test.ts \
  subs/harness/src/tests/engineer-briefing.test.ts \
  subs/harness/src/tests/shell-tool.test.ts \
  subs/harness/src/tests/engineer-submission.test.ts \
  subs/harness/src/tests/review-questions.test.ts \
  subs/harness/src/tests/reconciliation.test.ts \
  subs/harness/src/tests/plan23-real-run-corrections.test.ts \
  subs/harness/src/tests/contract-revision-scripted.test.ts \
  subs/harness/src/tests/nonfunctional-repair.test.ts
npm run type-check
npm run check:self
```

- Focused run: **12 ordinary files, 142 tests passed**; log
  `/tmp/plan24-iteration1-focused.log`. Actual packet assertions cover explicit
  orientation elements, initial declared scenario setup, standalone test areas,
  fresh qualification/reconciliation packages and snapshot reviewer references.
  Existing focused-command preparation and dispatch checks remain passing.
  Twelve process-guard receipts in that run's 08:37:08–08:38:06 UTC window record
  zero native files, zero allowed launches and zero refused launches.
- After narrowing design-review pointers and adding standalone project/package
  references, the two affected files passed again: **18 tests**, log
  `/tmp/plan24-iteration1-final-adjustments.log`. Final removal of the unused
  captured-plan read and preservation of existing cwd selection were followed by
  **5 passing context-selection tests**, log
  `/tmp/plan24-iteration1-context-final.log`. These overlap the 142 tests above
  and are not additional distinct coverage.
- Type-check passed on the final source; log
  `/tmp/plan24-iteration1-typecheck-final.log`.
- Structure check passed: 12 owners, zero errors/warnings, 328 analysis limits;
  coverage remains partial. Log `/tmp/plan24-iteration1-structure-final.log`.
- `git diff --check` passed before each commit. No full audit, direct whole suite,
  live-provider session or benefit measurement was run in this iteration.

Initial failed checks are retained in
`/tmp/plan24-iteration1-typecheck-initial.log`,
`/tmp/plan24-iteration1-focused-initial.log`,
`/tmp/plan24-iteration1-context-repro.log`,
`/tmp/plan24-iteration1-focused-second.log`,
`/tmp/plan24-iteration1-context-capability.log` and
`/tmp/plan24-iteration1-orientation-repro.log`. Causes were corrected: typed-unknown
audit declarations, synthetic checks without executors, outdated shell prose and
an assertion expecting an inherited module pointer in the selector's appended
delta. No flakiness classification or skipped test was used.

## Successor inputs

- Iteration 2 owns the exploration/closing instructions and inherited selector
  delivery. The selector still defaults its explicit requirements to the captured
  plan; give it the work item's own elements. Its persisted orientation packet
  currently captures `workItemMessage`, not the new explicit own-element task
  text. Ensure a fresh selector receives those elements while a fork preserves
  inherited delivery. Retain reselection's placement information.
- Iteration 3 owns exhausted/unavailable-session behavior and provenance. No
  attempt-limit, fork/continuation failure or recovery mechanics changed here.
- Iteration 4 owns documentation, inexpensive metrics and the final configured
  audit. No completeness gate, configuration cache or benefit verification was
  added. The branch has not been pushed.
