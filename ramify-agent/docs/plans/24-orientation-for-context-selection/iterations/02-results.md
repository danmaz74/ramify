# Iteration 2: useful orientation and inherited input delivery

**Date:** 2026-10-09. **Outcome:** complete. Source commit:
`bfc135ad3019b1d522c6f857cb12e3e9a1cd06e0`. Worktree:
`/home/app/ramify-plan24-orientation`, branch `feat/plan24-orientation`.

## Changed behavior

- Orientation asks the local architect to read its complete requirement,
  acceptance and context elements, explore its module README/declaration/source
  and use its API views before submitting the existing orientation schema.
  Its durable packet now includes those own-item elements for fresh selection.
- Both local-architect procedure variants build on reading already in the
  session, explore further as needed and orient normally on a fresh start.
  The active capability procedure required a small ownership extension beyond
  the legacy procedure named in the iteration. The shared work briefing no
  longer says element text arrives later or closes with an assignment instruction
  during an orientation task.
- Selection explicitly receives its work item's own requirements instead of
  defaulting to the captured plan. A fork receives selectable elements and the
  selection instruction; it inherits the existing orientation and known facts.
  A small selector-fork-only flag preserves prior named support sections in the
  existing briefing revision, so delta delivery neither repeats nor retracts
  module/setup facts. This required a small `run/session-operations.ts` extension.
- Fresh selection receives its ordinary briefing, complete own-item elements,
  recorded orientation and rooted pointers. Reselection's new placement-decision
  note remains explicitly delivered on forks. Submission schemas, operation
  availability, retries and fallback mechanics remain as before.

## Verification

Commands ran from `ramify-agent/`; final checks exited **0**:

```sh
npm run test:quick -- \
  subs/harness/src/tests/context-selection-runtime.test.ts \
  subs/harness/src/tests/plan23-task-prompts.test.ts \
  subs/harness/src/tests/context-selection-submissions.test.ts \
  subs/harness/src/tests/placement.test.ts \
  subs/harness/src/tests/scenario-briefings.test.ts \
  subs/harness/src/tests/iteration-source-delivery.test.ts
npm run type-check
npm run check:self
```

- Focused run: **6 ordinary files, 89 tests passed**, log
  `/tmp/plan24-iteration2-focused.log`. Runtime assertions cover the active
  capability procedure, inherited facts without duplication or retraction,
  complete fresh selection including a context element, fresh and continued
  assignment and reselection's new placement note. Six process-guard receipts
  for the 08:49:22–08:49:44 UTC run window record zero native files, allowed
  launches and refused launches.
- Type-check passed on the final source, log
  `/tmp/plan24-iteration2-typecheck-final.log`.
- Structure check passed: 12 owners, zero errors/warnings, 328 analysis limits;
  coverage remains partial. Log `/tmp/plan24-iteration2-structure.log`.
- `git diff --check` passed. No whole suite, full audit, live provider or benefit
  run was performed. The only source change after the final focused/structure
  runs was the explicit TypeScript `this` annotation in a test spy; the final
  type-check includes it.

Initial failures remain in `/tmp/plan24-iteration2-focused-initial.log`,
`/tmp/plan24-iteration2-typecheck-initial.log` and
`/tmp/plan24-iteration2-typecheck.log`: corrected a map-expression parenthesis,
updated the actual capability-mode procedure and typed the test spy's `this`.
The earlier five-file passing run is retained in
`/tmp/plan24-iteration2-focused-second.log`; its tests overlap the final run.
No flakiness classification or skipped case was used.

## Successor inputs

- Iteration 3 owns unavailable/exhausted orientation and actual session-loss
  fallback. A failed selector fork must create a fresh invocation with the
  ordinary full brief and own-item elements, plus the recorded orientation when
  available; the thin fork prompt intentionally omits that inherited packet.
  Fresh selection already has explicit scoped requirements and rooted pointers.
  Keep new placement notes during fresh reselection as well. Do not repeat
  exhausted orientation on restart; preserve accepted-orientation recovery.
- The selector retention flag applies only to selector forks. Fresh starts and
  other roles keep their existing named-section replacement behavior.
- Iteration 4 owns metrics, documentation and the final configured audit.
  No new completeness, unavailability, configuration-cache or benefit machinery
  was added. The branch has not been pushed.
