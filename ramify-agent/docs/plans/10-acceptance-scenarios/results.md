# Plan 10 results

Results of [Plan 10: Acceptance scenarios](main-plan.md), one section per
iteration, appended as each completes.

## Iteration 1: The scenarios module

**Date:** 2026-09-23. **Branch:** `feat/plan10-acceptance-scenarios`.

### What changed

- **Dependencies.** `@cucumber/gherkin` `42.0.0` and `@cucumber/messages`
  `34.2.0` in `dependencies`, `@cucumber/cucumber` `13.2.1` in
  `devDependencies`, with the lockfile.
- **A new module `subs/harness/subs/scenarios`**, with `module.ramify`,
  `README.md`, `src/` and `src/tests/`. It has no I/O and is the one importer
  of the two Cucumber libraries; nothing outside it uses it yet. Every export
  is exposed to `parent` with the named types its signature mentions:
  - `extraction.ts`: `extractPlanScenarios(plan)` returns
    `PlanScenarioExtraction`, the plan scenarios `ps-01`, … and the
    unparsable blocks as limitations.
  - `form.ts`: `validateScenarioForm(submission, planScenarios, entries,
    viewNames?)` applies rules 1–6 and returns the first rule broken or the
    accepted form with its warnings; the submission schemas of
    `initial-architect/2`'s scenario part.
  - `records.ts`: the `ramify-agent.scenario/1` schema,
    `assignScenarioIds(form, context)`, `lowestCommonAncestor`,
    `scenarioSourceHash`, `featureDirectoryOf`.
  - `states.ts`: the four states, the four events' data schemas,
    `applyScenarioEvent`, `reduceScenarioStates`, `countScenarioStates`,
    `carriesPendingTag`.
  - `rendering.ts`: `renderFeatureFiles(records, states, run)`, the identity
    and pending tags.
  - `profiles.ts`: `buildScenarioProfile(module, mode, selection, config,
    attemptDir, options?)` and `scenarioTagExpression`.
  - `messages.ts`: `summarizeScenarioRun(stream, tracked)` and the
    `ScenarioRunSummary` schema.
  - `gherkin.ts` wraps the parser and stays internal.
- **Recordings.** Nine NDJSON streams from the real `cucumber-js` 13.2.1 over
  `src/tests/fixtures/sample-project/`: passing, failing, undefined,
  ambiguous, pending, an outline with a failing example, a bound scenario
  selected by identity, the `all-untagged` selection with the project's own
  scenarios, and a dry run. `src/tests/fixtures/record-streams.ts` recorded
  them; the module's README records the procedure.
- **Tests** in `src/tests/`: extraction, form rules and warnings, records,
  states, rendering with golden files, profiles and the message-stream
  reducer.

This iteration completed an interrupted checkpoint (`ef510f7`). Its review
added the tests of `profiles.ts` and `messages.ts`, the README and two
corrections:

- Rule 3's normalization dropped blank lines, so a plan's doc string with a
  blank line matched a restatement without it. It now trims and collapses
  whitespace, and nothing else, as the plan states.
- The reducer counted a skipped untracked scenario as failed, so a dry run
  reported every defined scenario of the project's own as a failure. The
  untracked counts now separate `skipped`.

### Evidence

From `ramify-agent/`:

| Command | Result |
| --- | --- |
| `npx vitest run subs/harness/subs/scenarios` | 7 files, 112 tests passed: extraction 11, form 25, records 10, states 24, rendering 9, profiles 17, messages 16 |
| `npm run type-check` | passed |
| `npm run check:self` | check passed; 9 owners, 0 errors, 0 warnings, 108 analysis limits, all `signature-inferred` on exposed zod schema constants, 21 of them in the new module, as in the harness |

No test starts the runner or makes a model call. The full suite was not run,
per the plan's rules.

### Deviations

- **`summarizeScenarioRun` takes the stream's text**, not parsed messages,
  so a torn or malformed line is reported (`malformedLines`) rather than
  thrown, and a stream without its `testRunFinished` reports
  `finished: null`.
- **The untracked counts are `{ passed, skipped, failed }`**, one field more
  than architecture's `{ passed, failed }`, because a dry run skips every
  defined scenario and readiness's `acceptance-full` step must tell that from
  a failure. Additive.
- **A scenario is tracked by its identity tag in the file its record names.**
  An identity tag in any other file counts as the project's own scenario, so
  a copied tag cannot stand in for the tracked scenario.
- **`buildScenarioProfile` takes an optional `{ dryRun, projectRoot }`.**
  `cucumber-js` 13 joins its working directory with the `--config` path even
  when it is absolute (`lib/configuration/from_file.js`), so with an absolute
  attempt directory the argv names the profile relative to the project root.
  The profile's message path stays absolute.
- **`validateScenarioForm` takes the view's names as a fourth, optional
  argument**, `ScenarioViewNames`, for the first warning, as the plan asks.
  A duplicate submission key is reported under rule 2.
- **Rule 5 compares steps by kind, not keyword**: `And` and `But` take the
  kind of the step they continue, so a plan's `And the user opens …` is
  found as a sub-scenario's `When the user opens …`.
- **A plan scenario also records its heading anchors**, which rule 6 uses to
  judge a reference given by anchor only.

### Open items

- The recordings embed the recording checkout's absolute path in failure
  messages, and run IDs and times; tests assert on none of them. The
  recording script was not re-run in this review.
- An entry whose slug is `integration`, owned by the same module as an
  integration scenario's common ancestor, would share `integration.feature`;
  `renderFeatureFiles` throws on the mixed file. Iteration 2's acceptance
  could reject that slug, or the layout could reserve it.
- The analysis limits on exposed zod schema constants would go if the
  schemas were annotated with explicit types; the harness leaves them
  inferred too, so this iteration follows it.
