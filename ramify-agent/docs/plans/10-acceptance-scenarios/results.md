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

## Iteration 2: Plan capture, the analysis submission and scenario records

**Date:** 2026-09-23. **Branch:** `feat/plan10-acceptance-scenarios`.

### What changed

- **Capture.** `start` extracts the plan scenarios from the captured bytes
  with `extractPlanScenarios` and records them in `job.json` as
  `RunRecord.planScenarios: { scenarios, limitations }`, required, beside the
  policy. The job schema stays `ramify-agent.job/2`; a run recorded before
  this plan is unsupported, as the plan states. `analysisMessage` gains a
  section "The plan's scenarios": each scenario by ID and name, its plan
  lines (and whether it is an outline), its text in a `gherkin` fence, and
  each unparsable block with its lines and the parser's message. A plan
  without blocks says so in one line.
- **Submission `initial-architect/2`.** `initialAnalysisSubmissionSchema`
  requires `scenarios` and `integrationScenarios` (the `scenarios` child's
  schemas, with `refs` on an architect scenario), so an analysis without
  them is rejected by the schema. The accepted submission file is written as
  `ramify-agent.initial-analysis/2`. `validateInitialAnalysis` runs the form
  rules only when every other rule holds, and answers the first rule broken
  as one error `{ path, message, expected }` under the same judge and bound.
  `AnalysisEvidence` gains `planScenarios`; the view's exported symbols and
  files feed the first warning. `scenarioFormOf(submission, evidence)` is
  the one call both validation and acceptance make.
- **Two rules beside the form rules.** The capability slug `integration` is
  rejected with a message naming `integration.feature` (iteration 1's open
  item), and an architect scenario's `refs` are plan references like an
  entry's, so they must lie inside the captured plan.
- **Acceptance.** `acceptAnalysis(submission, context)` takes
  `{ invocation, view, planId, planScenarios, index }` and returns
  `scenarios` and `warnings` beside the rest. The records come from
  `assignScenarioIds`, parsed with `scenarioRecordSchema`, and are committed
  at `scenarios/<id>.json` (`runLayout.scenario(id)`, `runSchemas.scenario`)
  in the `analysis-accepted` transaction. The modules an owner or common
  ancestor can be are the view's modules (testing by the header's tags) and
  the entries' proposals; without a view each owner and its ancestors are
  placed by Ramify's layout (`a/b/c` in `subs/b/subs/c`), none testing.
- **Event.** `analysis-accepted` data gains `scenarios` (the count; the IDs
  are `sc-001` to `sc-<count>`) and `warnings: [{ kind, scenarios, message }]`
  with scenario IDs, schema `scenarioWarningSchema` in `analysis/records.ts`.
- **Snapshot.** `RunSnapshot.counts.scenarios: { pending, bound, declared,
  implemented }`, in the internal snapshot and the protocol's
  `runSnapshotSchema`. The snapshot starts every counted scenario `pending`
  at `analysis-accepted` and applies any log event whose type is one of
  `scenarioEventTypes` with `applyScenarioEvent`, so iteration 7's events are
  counted when they exist.
- **Prompts.** `initial-architect/2`: the system prompt names the scenarios
  and the architect's scenario `key`s; the procedure (version 2) explains
  plan and architect scenarios and the freeze, adds §2's steps (read the plan
  scenarios first, match them, decompose integration scenarios verbatim with
  bridging Givens, write the missing ones abstractly with concrete data and
  `refs`), and lists the six form rules and three warnings.
- **Test helpers.** `helpers/analysis.ts`: `analysis(entries, hypotheses,
  coverageLimits, scenarios?, integrationScenarios?)` gives each entry
  `architectScenario(entry)` unless the test states its own; `emptyAnalysis()`
  carries empty scenario arrays; `constructedRecord()` has empty
  `planScenarios`. No other test changed its analysis.
- **Tests.** A new `analysis-scenarios.test.ts` (18 tests);
  `analysis-submission.test.ts` gives its literal analyses a scenario per
  entry and checks the new properties; `composition.test.ts` names the
  producers of the new union values; the web's `run-page.test.tsx` snapshot
  gains the counts. The harness README describes the change.

### Evidence

From `ramify-agent/`:

| Command | Result |
| --- | --- |
| `npx vitest run subs/harness/src/tests/analysis-scenarios.test.ts` | 18 passed: capture with blocks and an unparsable block, capture without blocks, acceptance with IDs, owners, files, hashes, the integration owner and one transaction, acceptance with a view (testing module area, all four warnings by ID), a proposed owner without a view, the valid analysis, one rejection per form rule 1–6, rules before form rules, refs inside the plan, the reserved slug, `/1` rejected, a form rule counted against the bound in a run, the snapshot counts |
| `npx vitest run` over the 62 test files that build analyses, runs, snapshots or projections (every file importing the analysis, runs, composition, protocol or progress helpers, the constructed run, the snapshot or the prompt packages, and the web's run and capability pages), composition excepted | 61 files passed, 1 skipped (`fixture-trials`, conditional); `analysis-submission.test.ts` failed on its literal `/1` analyses and passed after the update (20 tests) |
| `npx vitest run subs/harness/src/tests/composition.test.ts` | 5 passed, the union inventory included |
| `npm run type-check` | passed |
| `npm run check:self` | check passed; 9 owners, 0 errors, 0 warnings, 108 analysis limits, as in iteration 1; no `module.ramify` changed |

### Deviations

- **Warnings are recorded on the `analysis-accepted` event**, not in a
  record of their own: they are small, belong to the one transition, and
  the analysis page of iteration 10 reads the event. They name scenarios by
  ID; the architect's keys are not recorded anywhere.
- **No job schema bump.** `planScenarios` is a required field of
  `ramify-agent.job/2`; the plan declares earlier runs unsupported and does
  not ask for a new version.
- **The snapshot's counts do not use `reduceScenarioStates`** but its
  step, `applyScenarioEvent`, over the log's scenario events: a snapshot
  never throws, and the harness commits no transition the table rejects.
- **The scenario events are not in the run log's schema yet.** The snapshot
  recognizes them by `scenarioEventTypes`; iteration 7 adds them to
  `runEventSchema`.
- **The form rules' rejection is one error**, with `expected` naming the
  rule, because `validateScenarioForm` stops at the first rule broken.

### Open items

- The conventional placement without a view cannot know a testing module;
  every run test uses `shapeOnlyInputs` without a view, so their records
  place features in `src/tests/features/`. A real run always has the view.
- The scenario records carry no `revision` field; a placement revision that
  moves an entry (architecture, Ramify and the module tree) will need one,
  or a new file, when it is implemented.
