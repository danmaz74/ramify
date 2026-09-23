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

## Iteration 3: The review stop

**Date:** 2026-09-23. **Branch:** `feat/plan10-acceptance-scenarios`.

### What changed

- **Protocol** (`interfaces/protocol/runs.ts`). `start-run`'s payload gains
  `reviewStop: z.boolean().default(false)`. A new command
  `approve-analysis { planId, jobId, reviewer, note? }`
  (`approveAnalysisCommandSchema`, reviewer 1–200 characters, note at most
  4,000) joins `runCommandSchema`. `RunCommand` is the parsed command, with
  the default applied; the new `RunCommandInput` is what a client may send.
  `runPhaseSchema` gains `awaiting-review` after `analysis`. The new
  `runReviewSchema` is `'not-reviewed' | { reviewer, at, duringRun }`, and
  `runSnapshotSchema` gains `review`. The root's `module.ramify` re-exposes
  the five new names to the web.
- **Records.** `RunRecord.reviewStop: boolean`, required, recorded from the
  command.
- **Log** (`run/log.ts`). Two events after `analysis-accepted`:
  `review-requested {}` and `analysis-approved { command, reviewer, note:
  string | null, duringRun }`. `analysis-approved` is the one event that may
  follow `job-completed`, on append and on load; no event follows any other
  terminal event.
- **Service** (`run/service.ts`). After an accepted analysis, a run with the
  stop writes `review-requested` and waits, starting no session and holding
  the project, until the log holds `analysis-approved`, a stop is accepted
  or the service closes. `approve-analysis` is decided under the run's lock
  like `stop-job`: the expected version, then the refusals, then the event,
  and it wakes the waiting driver. `duringRun` is true when the run was
  running and not at its stop. A stop wakes the driver too; `job-stopped`
  follows with nothing written to the tree. `close` wakes it, so a service
  closes at once while a run waits. The run-age bound subtracts the time from
  `review-requested` to `analysis-approved` (to now while it still waits);
  the two review events take their time from the service's clock, so the
  injected `now` governs both sides.
- **Snapshot** (`run/snapshot.ts`, `projections/snapshot.ts`).
  `review-requested` sets `awaiting-review`; `analysis-approved` sets
  `review` and, at the stop, the phase `readiness`. The projected events
  describe both.
- **HTTP.** `http/app.ts` is unchanged: its command route already parses the
  whole `runCommandSchema` union and answers a rejection with its code, so
  `approve-analysis` is accepted exactly as `stop-job` is.
- **Web.** `client.ts`'s `sendCommand` and the stub client take
  `RunCommandInput`, so the plan page still sends `start-run` without
  `reviewStop`; the run page's test fixture gains `review`. No UI.
- **Tests.** A new `review-stop.test.ts` (12 tests). `helpers/runs.ts`:
  `startRun(planId, agent, commandId, reviewStop = false)` and
  `approveRun(planId, jobId, expectedVersion, reviewer?, note?, commandId?)`.
  `helpers/constructed.ts`'s record has `reviewStop: false`.
  `run-commands.test.ts` and `union-values.test.ts` name the new command,
  events, phase and default; `composition.test.ts` names the producers of
  the new union values. The harness README describes the stop.

### Recovery

A run interrupted while it waits at `awaiting-review` is recovered as every
other phase is: the restart finds no terminal event, closes nothing (no
invocation is open), appends `job-interrupted` and calls no agent. The run
is not resumed at its stop, since the service resumes no phase; a later
approval is refused because the run was interrupted. A clean `close` during
the wait writes nothing, and the next start interrupts the run the same way.

### Evidence

From `ramify-agent/`:

| Command | Result |
| --- | --- |
| `npx vitest run subs/harness/src/tests/review-stop.test.ts` | 12 passed: the stop and approval (busy while waiting, no branch before approval, the event sequence, the receipt on retry, `review`); a stop at the stop with a scripted Git asked for no `createRunBranch` or `commitAccepted` and no commit made; `close` while waiting; a crash while waiting (interrupted, no agent call, approval refused); approval while a run without the stop works (`duringRun: true`, nothing else in the snapshot changes, a second approval refused); approval after completion (after `job-completed`, reloaded, retried, refused twice, read through the query); refusals before the analysis, during the final verification, at a stale version, for a failed run and an unknown run; the budget with the injected clock (a 10,000 ms pause does not fail a 1,000 ms bound; the age reported is 1,100 ms of 11,100 elapsed); both commands over HTTP with a malformed approval refused; the log's terminal rule; the schema |
| `npx vitest run` over 22 files: the new one, `run-commands`, `union-values`, `run-protocol`, `http`, `run-projections`, `protocol-contract`, `projections-pure`, `run`, `run-recovery`, `stop-before-start`, `run-bounds`, `late-writes`, `analysis-scenarios`, `composition` and the web's seven test files | 22 files, 240 tests passed. `run-commands` and `union-values` failed on the command list, the default, the event list and the phase list before their update; `composition` failed on four values without a producer before they were named |
| `npx vitest run` over the 47 further files that import the run helpers, the run log or snapshot, the projections or the run protocol | 46 passed, 1 skipped (`fixture-trials`, conditional); 281 tests passed |
| `npm run type-check` | passed |
| `npm run check:self` | check passed; 9 owners, 0 errors, 0 warnings, 110 analysis limits: iteration 2's 108 and two more `signature-inferred` on the new exposed schema constants `approveAnalysisCommandSchema` and `runReviewSchema` |

### Deviations

- **`review` is reported by the snapshot, not stored in `job.json`.** The
  plan says the run record reports it, but `job.json` is written once,
  before the first event, and status lives in the log. `RunRecord` carries
  `reviewStop`; the review is the `analysis-approved` event, and the
  snapshot (internal and protocol) derives `review` from it.
- **`analysis-approved` also carries the accepted command**, as
  `stop-requested` does, so a retry after a restart returns its receipt.
- **More refusals than the plan names**, each `conflict` with its reason:
  before the analysis is accepted (nothing to approve), during
  `final-verification` (the architecture's "before `final-verification`"),
  for an interrupted run as for a failed or stopped one, and once a stop was
  accepted.
- **`duringRun` is false at the stop and after completion.** The
  architecture's case for the flag is a review given while the run works;
  a person who approves a completed run did not review while it worked.
  `reviewStop` in the record and `at` against `endedAt` tell the two apart.
- **No `RunWrite` boundary for `review-requested`.** Adding one would add a
  row to the composition recovery table; the crash at the stop is tested in
  `review-stop.test.ts` by abandoning the waiting service instead.
- **An approval during a committing gate waits for the run's lock**, as a
  stop does, because the gate's commit and audit hold it; the approval is
  then judged against the log as it stands, usually as a stale version.

### Open items

- The web's `Approve` action, the `reviewStop` option on `start-run` and
  the review section of the analysis page are iteration 10's.
- The snapshot does not report `reviewStop` itself; a client reads the
  phase. Iteration 10 may add it if the page needs it before the stop.

## Iteration 4: The project configuration

**Date:** 2026-09-23. **Branch:** `feat/plan10-acceptance-scenarios`.

### What changed

- **Reading the file** (`subs/evidence/src/project-configuration.ts`, exposed
  to the harness). `readProjectConfiguration(root)` reads `ramify-agent.json`
  and answers `present` with its text and SHA-256, `missing`, or
  `unreadable` with the reason; it never throws and does not parse.
  `projectConfigurationFile` names the path.
- **Schema** (`run/records.ts`, beside the run policy).
  `projectConfigSchema` is `ramify-agent.project/1`: `acceptance.support`
  (project-relative paths or globs, possibly empty), `acceptance.modes.quick`
  and `acceptance.modes.full`, each `{ command, setup?, teardown? }` with
  non-empty argvs, and `full.readiness: 'dry-run' | 'run'` defaulting to
  `'dry-run'`. Every object is strict, so an unknown field, a third mode or
  `readiness` on quick mode is rejected. `capturedProjectConfigSchema` is
  `{ path, hash, config }` or `{ path, hash | null, invalid }`.
  `RunRecord.projectConfig` holds it, required, directly after `policy`.
- **Capture** (`run/project-config.ts`). `captureProjectConfig(root)` runs at
  `start-run` and never refuses: a missing file is `invalid: 'ramify-agent.json
  is missing at the project root'`, an invalid one carries
  `ramify-agent.json does not validate against ramify-agent.project/1:
  <path>: <message>; …` (or `is not JSON: …`) with its hash.
  `parseProjectConfig(text)` is the pure validation. The same file has
  `moduleTestAreas(root, index | null)`, `matchSupport(root, support,
  areas)` and `unresolvedCommands(root, config)`.
- **Readiness** (`run/readiness.ts`). `readinessSteps` gains
  `project-config` and `acceptance-runner` directly after `test-runner`.
  `ReadinessRequest` gains `projectConfig` (the captured one) and `index`
  (the run's architect view, or null).
  - `project-config` fails with the captured reason, or when a `support`
    entry matches no file or matches a file outside every module's test
    area. A test area is a module's `src/tests/`, or a testing module's
    `src/`; the modules and their tags come from the view where the run has
    one, else from the `module.ramify` headers found at the root and beneath
    each `subs/`. Globs use `node:path`'s `matchesGlob`.
  - `acceptance-runner` requires `node_modules/.bin/cucumber-js` and that
    every `command`, `setup` and `teardown` of both modes resolves: `npm run
    <script>` (or `run-script`) when `package.json` declares the script, a
    path by the file it names from the project root, a bare name in
    `node_modules/.bin` or on the `PATH`. With an invalid configuration it
    is `not-verified` ("not reached").
  - Neither step has a recovery (`recoveryFor` answers null, as for
    `test-runner`), so the failure is final at once and no code-repair
    assignment follows. `readinessFailureReason(step)` maps the failing step
    to the `job-failed` reason: `project-config-invalid`,
    `acceptance-harness-missing`, otherwise `readiness-failed`. The
    `readiness-failed` event is unchanged; it names the step.
- **Failure reasons.** `runFailureReasonSchema` gains
  `project-config-invalid` and `acceptance-harness-missing` after
  `readiness-failed`.
- **Runner gaps.** `recordRunnerGaps` no longer reports a `test:` script
  that runs `cucumber-js` once the captured configuration is valid, so the
  fixture's `test:cucumber` is no longer an `unsupported-runner` gap.
- **The fixture's scenario harness** (`fixtures/collection-review`).
  - `ramify-agent.json`: support `subs/integration-tests/src/support/world.ts`
    and `hooks.ts`; quick `npm run acceptance:quick --`, full `npm run
    acceptance:full --` with `readiness: dry-run`, no `setup` or `teardown`.
  - `package.json`: `acceptance:quick` (`TEST_MODE=quick NODE_OPTIONS='--import
    tsx' cucumber-js`) and `acceptance:full` (`TEST_MODE=full …`).
    `test:cucumber` stays and runs quick mode.
  - Root `src/tests/setup.ts`: `McpSession` gains `sessionId` (the id the
    server sees); `startServedTestSystem()` starts `startApiServer({ port: 0
    })` and answers a `ServedTestSystem { origin, client, connectMcpSession,
    close }` whose tRPC client and MCP sessions speak HTTP to
    `127.0.0.1:<port>`. The root's `module.ramify` exposes
    `startServedTestSystem, ServedTestSystem` with `expose-test` to
    descendants.
  - `integration-tests`: a new `support/mode.ts` reads `TEST_MODE` (unset is
    quick, anything but `quick` or `full` throws) and holds the served
    system; `hooks.ts` starts it in `BeforeAll` in full mode and stops it in
    `AfterAll`; the World's `configure()` takes `createTestSystem()` in quick
    mode and the served system in full mode. The step that compared the
    invocation's session id with `'feature-session'` now compares it with
    the opened session's `sessionId`, since over HTTP the listener's
    transport generates the id.
  - The conventional directories already exist: `integration-tests` is a
    testing module with `src/steps/` and `src/features/`. No other empty
    directory is committed; iteration 6 writes the plan's feature files.
  - Both READMEs describe the harness and the modes.
- **Test helpers.** `installTestRunner` and `installMiniRunner` also install
  a `cucumber-js` shim that exits 0. A new `helpers/project-config.ts` has
  `minimalProjectConfig` (no support, both modes
  `node_modules/.bin/cucumber-js`) and `writeProjectConfig(root, config?)`;
  `constructedRecord()` carries the minimal configuration. Every test
  project copies the fixture, so none needed a written file.

### The World's placement

Architecture §0 puts the World and hooks at a common ancestor, exposed to
descendants with `expose-test`. The fixture keeps them in `integration-tests`
for now, and nothing is exposed from there. The reason is the tag model, not
convenience: the World wraps `createTestSystem`, whose `[testing, dispatch]`
tags every symbol built on it must carry, and `shared-ui`, the owner of
`status-badge-tone`, is `[ui, browser]`, so its test profile `[testing, ui]`
could import a World at no ancestor. The badge is a presentation primitive
rendered to markup, so iteration 11's step definitions need nothing from
the World: Cucumber gives every step the World instance, and a step file may
keep its own state on it or in module scope. A World or driver that a
non-`dispatch` owner must import would have to be a separate one without the
system in its signature, exposed from the root's `src/tests/`; iteration 11
decides that if its scenario needs it.

### Evidence

From `ramify-agent/`:

| Command | Result |
| --- | --- |
| `npx vitest run subs/harness/src/tests/project-config.test.ts` | 26 passed: the fixture's file and the dry-run default; setup, teardown, globs, an empty support list and `readiness: run` accepted; 13 rejections, each with the schema's path (not JSON, another version, no acceptance, no support, an empty support entry, no quick, no full, an empty command, a string command, an unknown readiness, readiness on quick, a third mode, an unknown top-level field); capture of a missing, an invalid and a valid file; the test areas without a view (15 modules, `integration-tests` by its `src/`) and with one; on the fixture with scripted Git and no process started: both steps pass after `test-runner` and `job.json` holds the configuration directly after `policy`; `readiness: run` captured; no file (`project-config-invalid`, no recovery, `acceptance-runner` not verified, no branch, one invocation); an invalid file; support matching nothing or source outside the test areas; no `cucumber-js` (`acceptance-harness-missing`); a missing npm script and a missing executable, each named; the reason mapping |
| `npx vitest run subs/harness/subs/evidence/src/tests/project-configuration.test.ts` | 3 passed: present with hash, missing, unreadable |
| `npx vitest run subs/harness/src/tests/fixture-check.test.ts` | 1 passed: the real checker over a fresh fixture copy, no error, only the two configuration warnings |
| `npx vitest run` over the 65 files that open runs, copy the fixture, install the runners, construct records or name readiness, the composition or the protocol (harness and web) | 63 passed, 1 skipped (`fixture-trials`, conditional), 1 failed: `analysis-scenarios`' view test constructs an index without `integration-tests`, so readiness (rightly) found the fixture's support code outside every test area; the index now lists it, and the file passes (18) |
| `npx vitest run` over the 19 remaining harness files outside that list and the evidence module's `guarded-files` and `project-configuration` | 19 files, 148 passed |
| `npx vitest run subs/web` | 7 files, 63 passed |
| Updated before those runs: `run.test.ts` (the step list), `union-values.test.ts` (the reasons), `composition.test.ts` (producers of the two reasons, `readiness: run` and `unsupported-runner`), `iterations-integration.test.ts` | each failed before its update and passed after; `iterations-integration` now adds a `test:e2e` script to its copy, asserts it is the only `unsupported-runner` gap, and asserts both new steps passed against the real view |
| The fixture in a temporary copy with `npm ci` (233 packages) | `npm run type-check` passed; `npm run acceptance:quick` 1 scenario, 12 steps passed (session id `feature-session`); `npm run acceptance:full` 1 scenario, 12 steps passed over HTTP (session id a transport UUID); `npm run acceptance:full -- --dry-run` 12 steps skipped, no hook run; `npm run test:cucumber` passed; `TEST_MODE=bogus` fails with its message; `npx vitest run` 20 files, 77 tests passed |
| `npm run type-check` | passed |
| `npm run check:self` | check passed; 9 owners, 0 errors, 0 warnings, 110 analysis limits, as in iteration 3 (the new exposed string constant is annotated) |

### Deviations

- **A support entry also fails when it matches source outside every test
  area**, not only when it matches nothing inside one. Cucumber imports
  every file an entry matches, and architecture §0 makes support code
  "ordinary testing source of the module whose test area holds it"; a glob
  that also loads production source would break that silently.
- **The reason is the `job-failed` reason**, not a field of the
  `readiness-failed` event, which already names the step. The snapshot's
  `failure.reason` is therefore `project-config-invalid` or
  `acceptance-harness-missing` for these two steps, and `readiness-failed`
  for every other.
- **`acceptance-runner` checks `setup` and `teardown` too**, beside
  `command`, and resolves a non-npm argv by path or by name in
  `node_modules/.bin` or on the `PATH`. It is `not-verified` when the
  configuration is invalid.
- **Without a view, the test areas come from the `module.ramify` headers on
  disk**, read by a header regex. Every lifecycle test runs without a view,
  and iteration 2's conventional placement assumed no testing module, which
  would have failed the fixture's support code.
- **`McpSession` gains `sessionId`** in the fixture, so the scenario's step
  compares the invocation's id with the one the server saw in either mode;
  the existing tests only read `client` and `close`.
- **The World stays in `integration-tests`**, as recorded above.
- **Iteration 5's step list is not reserved**: `baseline-acceptance` and
  `acceptance-full` are not in `readinessSteps` yet.

### Open items

- The configuration is captured but not guarded; architecture §0 guards it
  like `package.json`. `guardedConfigurationFiles` does not list
  `ramify-agent.json` yet (iteration 6's guarded files).
- `startApiServer` listens on every interface, not only loopback; full mode
  reaches it on `127.0.0.1`. A `host` option would keep it loopback-only.
- The `unsupported-runner` rule recognizes a Cucumber script by
  `cucumber-js` in its text; a script that reaches the runner another way
  is still reported.
- iteration 11: whether the badge's step definitions need a World without
  `dispatch` (see "The World's placement").
