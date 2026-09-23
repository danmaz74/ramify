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

## Iteration 5: The scenarios check kind

**Date:** 2026-09-23. **Branch:** `feat/plan10-acceptance-scenarios`.

### What changed

- **Records** (`checks/records.ts`, `run/records.ts`). `CheckCommandKind`
  gains `scenarios`. `GateAttempt` is `ramify-agent.gate-attempt/3`; every
  reader (`checks/accepted.ts`, `projections/inputs.ts`, `run/service.ts`,
  `runSchemas.gate`) requires `/3`, and an older attempt is unsupported.
  `GateCommandRecord.scenarios?: ScenarioCheckSummary` holds `mode`,
  `selection`, `dryRun`, `excluded` (a count), `setup` and `teardown`
  (`{ exit } | null`), `runs[]` (`module`, `exit`, `profile`, `messages`,
  both paths relative to the attempt's directory), `scenarios[]`
  (`ScenarioRunResult` plus `run`, the module that executed it), `untracked`
  (`{ passed, skipped, failed }`) and `failures[]`, one line per reason the
  check did not pass. `GateAttempt.scenarios?: 'none-selected'`. The reader
  schema is `scenarioCheckSummarySchema`; the gate operation's planned checks
  accept `scenarios` with its plan, and its request carries `scenarios:
  'none-selected'` too. The protocol's gate view accepts the kind; the
  summary itself is not projected yet (iteration 10).
- **Planning** (`checks/checkpoint.ts`). `CheckpointPolicy.scenarios`
  `{ mode, selection, strict: true }` per the architecture's table.
  `planScenarioCheck(checkpoint, inputs, options)` answers `{ check }` or
  `{ none: 'none-selected' }`. `ScenarioCheckInputs` is `{ harness, modules,
  scenarios }`: the captured `acceptance` section, the modules with feature
  files, and every tracked scenario with owner, file and state. `identity`
  (iteration, contract) selects the scope owners' (exact owners, and every
  module of a subtree) scenarios in `bound`, `declared` or `implemented`,
  one run per owner with that owner's IDs; an owner not among the modules
  with feature files is placed by its scenario's file. `all-untagged` and
  `all` run every module with feature files, and answer `none-selected`
  when there is none. The check's attribution is `in-scope` for identity and
  `project` otherwise, so it is routed exactly as the tests of that
  checkpoint are. `allProjectChecks` and `scopedChecks` take the planned
  check after the Ramify check and before the scope probe, which stays last.
  `run/gates.ts`'s `CheckpointRequest.scenarios` feeds it.
- **The plan and the runner** (`checks/scenario-check.ts`, new).
  `ScenarioCheckPlan` (mode, selection, `strict: true`, `dryRun`, support,
  runs of `{ module, selection }`, setup and teardown as `CheckCommand`s or
  null, `runTimeoutMs`, `tracked`) rides on `PlannedCheck.scenarios`; the
  check's `command` is the mode's configured command with the whole check's
  bound as its timeout. `runScenarioCheck(execution)` makes the attempt's
  `scenarios/` directory, runs setup, then per module builds the profile with
  `buildScenarioProfile` (project root = where the runs start), writes it,
  removes a stale stream, runs the argv through the evidence module's
  `runCommand` (or an injected `CommandRunner`), reads the stream with
  `summarizeScenarioRun`; then teardown with a bound of its own, after a
  failure or a cancellation too. A failed setup starts no run; a run that
  does not complete (timeout, cancellation, runner error) ends the runs; a
  run that exits non-zero does not. It answers the combined `CommandRun`
  (cancellation, then timeout, then runner error, then the first non-zero
  exit) and the summary, and writes one log ending in the verdict and the
  failure lines. `scenarioTimeouts`: quick 600 s, full 1,800 s, setup and
  teardown 600 s each; `scenarioCheckTimeoutMs` is the sum, which the gate's
  bound adds up as for every command.
- **The pass rule.** Every run, setup and teardown exited 0; every stream is
  present, finished and wholly JSON; every tracked scenario the runs
  executed passed (in a dry run, `passed` or `skipped`); every scenario an
  identity selection names was executed; the project's own scenarios have
  none failed and, outside a dry run, none skipped; and a run the runner
  itself reported unsuccessful fails even when nothing else explains it.
- **Both runners.** `inPlaceCheckExecution` runs a check with a plan through
  `runScenarioCheck`; the audit's registered executor does the same in its
  worktree, rebasing each argument with `rebaseProjectArgument`, restoring
  printed worktree paths, and keeping profiles and streams in the attempt's
  directory outside the worktree. The audit's registered result details
  carry a digest of the summary. `CUCUMBER_SUMMARY_FILE` is not used.
  `CheckExecutionRequest.classify` takes an optional fourth argument, the
  summary.
- **The verdict** (`checks/gate.ts`). A completed `scenarios` command passes
  exactly when its summary has no failure; one without a summary is
  `not-verified` `runner-error` (`scenario-summary-missing`). Otherwise it is
  classified and routed as tests are: a failure is `in-scope` and goes to
  `repair`, or `outside-assignment` where the probe passed, and its output's
  tail ends with the failure lines, which the repair briefing quotes.
  `GateRequest.scenarios` puts `none-selected` on the attempt.
- **Gates in a run** (`run/service.ts`). `committingCheckpoint` computes
  `scenarioInputs(run)` for every committing gate: the captured harness (none
  for an invalid configuration), `scenarioModules(projectRoot, run.index)`,
  and every `ramify-agent.scenario/1` record of the ledger with its state
  from the scenario events of the log, as the snapshot derives it.
- **Modules with feature files** (`run/project-config.ts`).
  `scenarioModules(root, index)`: every module of the view, or of the
  `module.ramify` headers on disk with declared-name paths joined from the
  root's, whose `src/tests/features/` (a testing module's `src/features/`)
  holds a `.feature` file, ordered by directory. `moduleTestAreas` is
  unchanged in behavior and shares the walk.
- **Readiness** (`run/readiness.ts`, `run/records.ts`). `readinessSteps`
  gains `baseline-acceptance` and `acceptance-full` after
  `acceptance-runner`. The readiness gate, through the in-place runner (or
  the service's `readinessExecution`), runs after the three baseline
  commands a quick check (`all-untagged`) and a full one (`all-untagged`,
  `--dry-run` unless `readiness: run`, and then with setup and teardown).
  Each step reads its command's summary; with no module with feature files
  both pass with that said. Both carry the gate's ID, fail as
  `baseline-tests` fails (`readiness-failed`), and are recoverable exactly
  when a baseline is (a timeout or runner error reruns).
- **Test helpers.** `installTestRunner` and `installMiniRunner` install
  `scriptedCucumber` (`helpers/project-config.ts`): given `--config`, it
  writes the stream of a finished, successful run with no scenario where the
  profile asks, and exits 0. The direct check executors answer a
  `scenarios` check with `passingScenarioSummary(check)` (every run exited
  0, every scenario an identity selection names passed); a sequential script
  does not consume an entry for it, and a mapped script may answer
  `DirectCheckStep.scenarios`.
- **Exposure.** The harness exposes to descendants `ScenarioCheckSummary`,
  `ScenarioCheckRun`, `ScenarioCheckResult`, `runScenarioCheck` and its
  types, `CommandRunner`, and re-exposes the `scenarios` child's
  `ScenarioMode`, `ScenarioSelection`, `ScenarioModule`, `ScenarioRunResult`,
  `ScenarioRunStatus`, `TrackedScenario` and their schemas.
- **Documents.** The harness README (readiness, the scenario check, the
  tests) and the audit child's README.

### Evidence

From `ramify-agent/`:

| Command | Result |
| --- | --- |
| `npx vitest run subs/harness/src/tests/scenario-check.test.ts` | 34 passed: planning per checkpoint (readiness, breaking-iteration, work-item, final; full mode's setup, teardown and bound; quick's bound; a dry run without setup; `none-selected` for iteration and contract; the identity selection by state and scope with an owner placed by its file; no module with feature files); an iteration gate recording `none-selected` with no scenario command; a work-item gate with and without a harness; execution over the recordings (passing with its profile and argv, failing, undefined, ambiguous, pending, a failing outline example, a bound scenario by identity, a selected scenario not executed, all-untagged with the project's own, a dry run, a missing stream, a non-zero exit); setup and teardown order and bounds, teardown after a failed run, a failed setup, a timed-out run, a failing teardown, the gate's bound; the verdict (repair like tests with the failure in the tail, a pass, a missing summary) |
| `npx vitest run subs/harness/src/tests/scenario-check-integration.test.ts` | 7 passed in about 9 s with the real `cucumber-js` 13.2.1 over a written, committed project: in the in-place runner (work-item, `all-untagged`) and in the audit's executor (iteration, identity, audited commit and evidence), a bound scenario passes with its binding and an undefined step fails naming it; readiness with `dry-run` (four acceptance steps pass, setup not run), with `run` (setup and teardown run, full mode executes) and with a dry run that finds an undefined step (`acceptance-full` fails, no recovery) |
| `RAMIFY_AGENT_FIXTURE_ACCEPTANCE=1 npx vitest run subs/harness/src/tests/fixture-acceptance.test.ts` | 3 passed: on a copy of `collection-review` with `npm ci`, readiness passes `project-config`, `acceptance-runner`, `baseline-acceptance` (1 own scenario passed) and `acceptance-full` (1 skipped in the dry run), and the work-item gate (quick) and final gate (full, over HTTP) each run the fixture's existing scenario, passed. This is the exit criterion; without the variable the file is skipped |
| `npx vitest run` over the 77 files that open runs, run readiness or gates, construct attempts or name the policy, the composition, the protocol or the configuration, the new ones included | 75 passed, 2 skipped (`fixture-trials`, `fixture-acceptance`), 591 tests. Before their update `readiness.test.ts` and `run.test.ts` failed on the step lists, `run-policy.test.ts` on the policy objects, `breaking-work.test.ts` on the command kinds (and on the probe no longer being last, which the planning now keeps last), and `composition.test.ts` on seven union values, now named with their producing tests |
| `npx vitest run` over `contract-submission`, `lock` and `test-selection` | 3 files, 28 passed |
| `npm run type-check` | passed |
| `npm run check:self` | check passed; 9 owners, 0 errors, 0 warnings, 110 analysis limits, as in iteration 4 |

No test makes a model call. The full suite was not run, per the plan's
rules.

### Deviations

- **The readiness attempt records the two acceptance steps after
  `baseline-ramify-check`**, beside the other steps the baseline gate
  verifies, though `readinessSteps` lists them after `acceptance-runner`.
  A step recorded as not reached before the step that stopped the attempt
  would name the wrong failure and recovery.
- **`acceptance-full` selects `all-untagged`**, as `baseline-acceptance`
  does. The architecture names no selection for it; a pending scenario left
  by an earlier run would otherwise fail its dry run as undefined.
- **Setup and teardown are bounded at 600 s each.** The architecture adds
  them to the attempt's bound without naming a figure.
- **`none-selected` is also recorded by a work-item, breaking-iteration or
  final gate when no module has feature files**, and readiness passes both
  acceptance steps then, saying so. After iteration 6 every run has feature
  files at its gates.
- **The summary has more than the architecture's example**: `dryRun`,
  `setup`, `teardown`, `untracked.skipped` (iteration 1's) and `failures`,
  the minimal failure summary until iteration 9's diagnostics.
- **`classify` takes the summary as a fourth argument**, and a scenario check
  without one is `not-verified`, so an executor that forgets the streams can
  never pass it.
- **Module names without a view** are declared-name paths joined from the
  root's (`collection-review/integration-tests`), as the view names them;
  `moduleTestAreas` keeps its header names.
- **`checks/verify.ts` verifies setup and teardown** beside the command, so
  a missing executable is `command-missing` before anything runs.

### Open items

- The gate view of the protocol does not carry the summary; iteration 10's
  scenario query and web read it from the attempt.
- The fixture test is conditional because it installs the fixture's
  toolchain; the fixture trials (`fixture-trials.test.ts`) now also run the
  scenario check at every gate, which was not re-run here.
- `scenarioInputs` replays the ledger at every committing gate; iteration 7,
  which adds the scenario events to the log's schema, may keep the states
  beside the snapshot instead.

## Iteration 6: Materialization and guarded files

**Date:** 2026-09-23. **Branch:** `feat/plan10-acceptance-scenarios`.

### What changed

- **The feature files** (`run/feature-files.ts`, new). `trackedScenarios(lines)`
  replays the ledger into the scenario records, their states (every one
  `pending` at `analysis-accepted`, then each scenario event, as the snapshot
  applies them) and the entries' capabilities and descriptions from the
  `ramify-agent.entry-assignments/1` record. `expectedFeatureFiles(tracked,
  { planId, runId })` renders every tracked file with the `scenarios` child's
  `renderFeatureFiles`. `rerenderFeatureFiles(root, expected)` is the general
  re-render: it writes each file whose content differs from its expected
  rendering, and nothing else, and answers `{ files, written, commitNeeded }`
  (`commitNeeded` is `written.length > 0`); a path outside the project is
  refused before any file is written. `contentHash`, `expectedFeatureHashes`,
  `materializationMessage` and `commitForMaterialization` (live: commit at
  once; recovering: look the commit up by `Ramify-Run` and
  `Ramify-Scenarios: materialized` first) complete it. `scenarioInputs` in
  the service now uses `trackedScenarios`.
- **Materialization** (`run/service.ts`). After `readiness-passed` and
  `createBranch`, before the first work item, `materializeScenarios` renders,
  writes and commits the files through the evidence module's `GitService`
  (`commitAccepted`; the tree is clean after readiness). The commit is the
  ledger effect keyed `scenarios-materialize`: intent
  `scenarios-materializing { files }`, completion `scenarios-materialized
  { commit, files }`. Its message is `Scenarios of <planId>`, a line on the
  scenarios, the files, then `Ramify-Run: <runId>` and
  `Ramify-Scenarios: materialized`, and no `Ramify-Gate`. A run without
  scenario records records neither event and commits nothing.
- **The accepted boundary** (`checks/accepted.ts`). A `scenarios-materialized`
  commit is an accepted boundary, so the first iteration's invocations, the
  changed paths, the line snapshots and the module notices are taken against
  it rather than against the run's base.
- **Recovery.** `completeEffects` performs a pending `scenarios-materializing`
  again: it re-renders from the ledger and finds the commit by its trailers
  before it makes one. `RunWrite` gains `scenarios-materializing` (intent
  durable, nothing written), `scenarios-committed` (commit made, completion
  not) and `scenarios-materialized`; the recovery table has a row for each.
- **The gate commit** (`commitGate`). Its effect re-renders the feature files
  from the current states before it commits, after the guarded comparison
  that ran at preparation. States do not change until iteration 7, so today
  it writes only a file an agent changed, which the gate has already found.
- **Guarded files.** `ramify-agent.json` joins `guardedConfigurationFiles` in
  `work/scope.ts` and in `subs/evidence/src/guarded-files.ts`.
  `captureGuardedFiles(root, artifacts, { support, expected })` adds the
  files the captured `acceptance.support` names (`supportFiles` in
  `run/project-config.ts` expands the globs) hashed as they stand, and every
  tracked feature file with the hash of its expected rendering, whatever the
  tree holds. Every ordinary and contract assignment captures them once the
  files are materialized. The set a local architect may authorize excludes
  the feature files and `ramify-agent.json`.
- **The write guard** (`guard/write-guard.ts`). `GuardedScope.denied` lists
  canonical files refused whatever the roots and files contain; the decision
  is `blocked-scope` with `denied: true` and the reason "written by the
  harness alone", and `blockExplanation` says what to do instead.
  `deniedFiles(root, featureFiles)` (`work/scope.ts`) resolves
  `ramify-agent.json` and the tracked feature files; `guardedScopeOf(scope,
  denied)` carries them. Every engineer and contract engineer of a run is
  given both; the single session denies the configuration.
- **Log and projection.** The two events in `runEventSchema` and in
  `projections/events.ts`.
- **Test helpers.** Every Git double knows the commit: `scenariosCommit` in
  `helpers/scripted-git.ts` (its gate lookups count gates, not checkpoints)
  and `helpers/gate-git.ts`, `scenariosCommitted` in
  `helpers/contracts-git.ts`, and `helpers/recovery-git.ts` recognizes the
  commit by its trailer, names it `scenarios` in `commits()` and answers a
  recovery lookup of it from `recovered`. `unchangedCheckpoints` accepts a
  stated checkpoint beside a subject. The composition's scenarios state
  `materialized` (`scenarios-00`) as their first commit and the boundary the
  first gate is asked against.
- **Tests.** A new `materialization.test.ts` (12 tests); a real-runner case
  in `scenario-check-integration.test.ts`; a denial case in
  `write-guard.test.ts`; three recovery rows. Every lifecycle test whose run
  passes readiness with scenarios states the commit in its Git table, and
  its assertions on revisions, heads, audited commits, bases and message
  indices now count it: `accepted-commit`, `analysis-scenarios`,
  `breaking-work`, `compaction`, `contract-delegation(-integration)`,
  `contract-revision(-scripted)`, `contract-scheduling`,
  `engineer-submission`, `gate-diagnostics`, `iteration-gate`, `iterations`,
  `line-events`, `local-architect-submission`, `local-authority`,
  `module-creation(-integration)`, `no-rewind`, `placement`, `progress`,
  `requirement-verification`, `review-stop`, `run-bounds`, `run-protocol`,
  `run-recovery`, `work-items`, the composition and the progress fixture.
  `union-values` names the two events and `composition` counts 36
  boundaries. The harness and evidence READMEs describe the change.

### Evidence

From `ramify-agent/`:

| Command | Result |
| --- | --- |
| `npx vitest run subs/harness/src/tests/materialization.test.ts` | 12 passed: a scripted run over the fixture (`review-notes`, two entries) records `readiness-passed`, `scenarios-materializing`, `scenarios-materialized`, `work-item-started` in that order, as intent and completion of the effect `scenarios-materialize`; `commitAccepted` is called first with the project root and exactly the message (subject `Scenarios of review-notes`, both files, `Ramify-Run: <runId>`, `Ramify-Scenarios: materialized`, no `Ramify-Gate`); only the gates look commits up; the files carry `@ramify-sc-00N @ramify-pending` and the header; the first local architect's base is the commit; both work-item gates plan `all-untagged` over both owners and pass, and the run completes. A run without scenarios writes and commits nothing. Re-rendering writes both files, then nothing, then only a drifted one; a state change writes only its file with the pending tag removed; a path outside the project is refused. The commit: live without lookup, recovery found by both trailers, recovery made when none is found. The guarded list holds the configuration, the support file and each feature file at its rendering's hash although the tree differs; a changed feature file at a gate is `guarded-change` with `before` the rendering's hash. An engineer's `write` of its own feature file and of `ramify-agent.json` are refused (`blocked-scope`, "written by the harness alone") although the first lies in its scope; its stated shell change is `guarded-change` at the iteration gate; the gate's commit restores the file, and the next assignment's gate passes with no guarded change |
| `npx vitest run subs/harness/src/tests/scenario-check-integration.test.ts` | 8 passed, the new one with the real `cucumber-js`: a file rendered with its scenario `pending`, whose last step no definition binds, is excluded by the work-item gate's `not @ramify-pending` (`excluded: 1`) and the check passes on the project's own scenario |
| `npx vitest run subs/harness/src/tests/composition-recovery.test.ts` | 22 passed, the three new rows among them: `scenarios-materializing` (recovery re-renders, finds nothing by the trailers, makes the commit once and records it), `scenarios-committed` (the crash between the commit and its record: recovery finds the commit by `Ramify-Run` and `Ramify-Scenarios` and makes no second one) and `scenarios-materialized`; each also restarts a second time and changes nothing |
| `npx vitest run` over the 65 files that open runs, use a changed helper or name a changed module (the list of iteration 5's grep, plus every importer of the Git doubles, the run helpers, `work/scope`, the write guard, `checks/accepted`, the log, the projected events, the single session and the project configuration) | 62 passed, 2 skipped (`fixture-trials`, `fixture-acceptance`, conditional), 1 failed: `iterations-integration` (real Git and the real Ramify daemon) failed under the concurrent load of the batch; alone it passed three times in about 34 s |
| `npx vitest run` over `scenario-check`, `tree-identity`, `readiness`, `gate-not-verified`, `audit-check-execution`, `hooks` and the `audit`, `scenarios` and `evidence` children | 19 files, 229 passed |
| `npx vitest run subs/web` with `run-projections`, `protocol-contract`, `projections-pure`, `http` | 17 files, 140 passed |
| `npm run type-check` | passed |
| `npm run check:self` | check passed; 9 owners, 0 errors, 0 warnings, 110 analysis limits, as in iteration 5 |

No test makes a model call or runs Git except the integration tests that
did before. The full suite was not run, per the plan's rules.

### Deviations

- **The live materialization commits without a lookup.** Its intent was
  appended a moment before in the same process, so no commit of it can
  exist; only a recovery looks it up by `Ramify-Run` and
  `Ramify-Scenarios: materialized`. The gates keep looking up first. This
  also keeps the lookup out of every lifecycle test's Git double.
- **A second trailer, `Ramify-Scenarios: materialized`.** `Ramify-Run`
  alone would also find the run's gate commits, so the commit needs an
  identity of its own; it still carries no `Ramify-Gate`.
- **The commit is an accepted boundary.** The plan does not say; without it
  the first iteration's changed paths, scope observations, line snapshots
  and module notices would include the feature files, as if the engineer
  had written them.
- **`commitNeeded` is `written.length > 0`.** A re-rendering does not ask
  Git; a caller recovering a crash commits regardless, since the crashed
  attempt may have written the files already, and `commitAccepted` answers
  `null` over an unchanged tree.
- **The write guard also refuses `ramify-agent.json`**, as the brief asks,
  in runs and in the single session, and no architect authorization may
  name it or a feature file. The support files are guarded, not refused:
  they are ordinary testing source an authorized iteration may change.
- **The gate's commit restores a feature file an agent changed**, since it
  re-renders before it commits. The guarded comparison before the effect
  still records the change and fails the attempt as `guarded-change`.
- **The work-item and final gates carry no guarded list**, as before; a
  feature file is compared at iteration and contract gates, whose
  assignments capture it, and the re-rendering at every gate's commit
  writes back any drift.
- **Three `RunWrite` boundaries**, `scenarios-materializing`,
  `scenarios-committed` and `scenarios-materialized`, each with a recovery
  row, rather than a focused crash test of its own.

### Open items

- Iteration 7: declarations change states between an assignment's capture
  and its gate. The iteration gate's comparison stays right (the tree holds
  the rendering the assignment captured), and the gate's commit re-renders.
  A withdrawal commit needs a trailer value of its own per withdrawal, and
  `acceptedCommit` counts only `scenarios-materialized` today.
- A proposed owner's feature file is written before the module exists
  (`module-creation-integration`, the progress fixture's `proposed` run);
  its bootstrap iteration then creates the module around it. Nothing
  rejects this, and no test found a consequence.
- `iterations-integration` failed once under the concurrent load of a
  65-file batch and passed alone three times.

## Iteration 7: Declarations and state transitions

**Date:** 2026-09-23. **Branch:** `feat/plan10-acceptance-scenarios`.

### What changed

- **Declarations** (`work/declarations.ts`, new; `work/engineer.ts`,
  `work/submission.ts`). `completion-proposed` and `request-completion` gain
  `scenarios: string[]`, default `[]`. `declarationErrors(ids, { entry,
  records })` accepts IDs of entry scenarios of the work item's own entry,
  whatever their state, and rejects, each at `scenarios.<index>` with the
  reason and the IDs expected: an unknown ID, another entry's scenario, an
  integration scenario, and any ID for a work item without an entry
  (provider and follow-up items). `validateEngineer` and
  `validateLocalArchitect` take the context as `scenarios`, so a rejection
  goes through the existing judge and its per-turn bound.
  `scenariosToDeclare(ids, states)` is the pending ones, once each; bound,
  declared and implemented ones are accepted and ignored.
- **Events** (`run/log.ts`). Six events after `scenarios-materialized`:
  the four of the architecture's table with iteration 1's data schemas
  (`scenario-declared`, `scenario-due`, `scenario-implemented`,
  `scenario-withdrawn`), `scenario-bound-passed { scenario, gate }` and the
  withdrawal intent `scenarios-withdrawing { withdrawal, workItem,
  scenarios, reason }`. Each has a projection in `projections/events.ts`.
  `runFailureReasonSchema` gains `acceptance-incomplete` after
  `repair-exhausted`.
- **Acceptance of a declaration** (`run/service.ts`). The engineer's
  declarations apply when its proposal is accepted, before each iteration
  gate; the local architect's when its request is accepted, before the
  refusal checks. Each pending scenario becomes `bound` while the work item
  holds fakes (an open requirement, or an owed conformance not yet shown)
  and `declared` otherwise, recorded as `scenario-declared { scenario, by,
  state }` with the declaring invocation. The gate's commit re-renders the
  files, as iteration 6 wrote it, so a declared scenario loses its tag there.
- **Gates.** The identity selection of iteration 5 now receives real
  states. After every passing committing gate (iteration, contract,
  breaking-iteration, work-item) `recordScenarioPasses` reads the attempt's
  scenario summary: a passed `declared` scenario becomes `implemented`
  (`scenario-implemented { scenario, gate }`), a passed `bound` one records
  `scenario-bound-passed { scenario, gate }` and stays bound. The events
  follow the gate's `gate-committed` boundary.
- **Due.** When `dischargeEvidence` writes a `requirement-verified` and the
  work item then holds no open requirement and owes no conformance, each of
  its bound scenarios gets `scenario-due { scenario, cause:
  'requirements-verified' }`.
- **Withdrawal.** The work item leaves its repair path without a pass when an
  iteration (ordinary, contract sub-session or direct revision) closes
  `exhausted`, and when its local architect requests placement or yields.
  Every `declared` or `bound` scenario of its entry with no
  `scenario-bound-passed` or `scenario-implemented` since its latest
  `scenario-declared` returns to `pending` with the reason
  `repair-exhausted`, `placement-requested` or `yielded`. Where the
  rendering changes (a declared one among them) the harness renders with
  them pending, commits "Withdraw sc-001" (several IDs joined by `, `) with
  `Ramify-Run` and `Ramify-Scenarios: withdrawn-<n>`, `n` the withdrawal's
  ordinal in the run, as the ledger effect `scenarios-withdraw:<n>`: intent
  `scenarios-withdrawing`, completion the first `scenario-withdrawn`, then
  one `scenario-withdrawn` per further scenario with the same commit.
  `feature-files.ts` gains `commitForScenarios`, `withdrawnTrailerValue`,
  `withdrawalMessage` and `withStates`.
- **Recovery.** `completeEffects` performs a pending `scenarios-withdrawing`
  again (re-render, look the commit up by its two trailers, commit only if
  none is found), and `completeWithdrawals` writes the `scenario-withdrawn`
  of every scenario of a completed withdrawal that has none after its
  intent, with the recorded commit. `acceptedCommit` does not accept a
  withdrawal commit (see Deviations), which its comment now states.
- **Completion** (§9). A request's own declarations apply first; it is then
  refused, through the existing `blocked` path and refusal bound, while a
  scenario of its entry is `pending` or `bound`, with one line per scenario.
  A passing work-item gate that leaves a scenario of the entry unimplemented
  is refused the same way instead of writing `work-item-completed`. Beyond
  the bound the run fails `unresolvable-requirement` when a requirement or
  conformance also blocked it, and `acceptance-incomplete` with the scenario
  records as evidence otherwise.
- **Final** (§11). `incompleteScenarios(tracked)` (`run/feature-files.ts`)
  is the rule `acceptance-incomplete`: before the final gate every entry
  scenario must be `implemented`, or the run fails with each scenario, its
  entry and state in the message and its record as evidence.
  `job-completed` also requires the final attempt's scenario check to be a
  full-mode, non-dry run that passed and passed every entry scenario;
  otherwise the run fails `acceptance-incomplete` with the gate as evidence.
- **The guarded comparison of feature files.** `writtenScenarios(lines)` is
  the states as the harness last rendered them into the tree (at
  `scenarios-materializing`, each `gate-committing`, each
  `scenarios-withdrawing` with its scenarios pending). Assignments capture
  that rendering's hashes, and iteration and contract gates replace the
  captured feature-file hashes with it (`guardedAtGate`), so a repair
  round's gate no longer sees the previous round's commit as an agent's
  change. See Deviations.
- **Test helpers.** `helpers/declarations.ts`: `declaringScenarios(script)`
  makes each scripted local architect's `request-completion` without a
  `scenarios` field declare every scenario of its work item's entry, with
  IDs read from the initial architect's submission in the same script
  (scenarios numbered in order, `wi-00N` the Nth entry). `openRuns`, the
  composition's agents, `protocolScript` and the agents `placement` and
  `local-authority` build themselves apply it; a request that states
  `scenarios`, even `[]`, is left alone, and engineers declare only where a
  test says so. `passingScenarioSummary` reports, for a module's run without
  an identity selection, the tracked scenarios of that module's feature
  files as they stand on disk (all for `all`, the untagged ones for
  `all-untagged`, counting the rest as excluded). The scripted `cucumber-js`
  is now a small Node program behind the shell wrapper: it reads the
  profile, selects the tracked scenarios of its `paths` by its `tags` (none,
  `not @ramify-pending`, or identity tags joined by `or`) and writes a
  stream with each executed and no step, so in-place runs report them
  passed; it clears `NODE_OPTIONS`, which the fixture's scripts set to
  `--import tsx`. `answeredGit` and `gateGit` accept a `Ramify-Scenarios`
  lookup and a commit without `Ramify-Gate`; `withdrawn(ids, commit, files)`
  states a withdrawal commit.
- **Tests.** A new `scenario-states.test.ts` (14 tests). Updated:
  `materialization` (the gates now implement what the requests declared),
  `work-items` (the event sequence), `analysis-scenarios` (the counts after
  the run), `union-values` (events, samples, the reason),
  `unguarded-write` and `iteration-gate-integration` (the work-item gate now
  commits the rendered feature file after the iteration's commit),
  `placement`, `local-authority`, `composition` (producers of the new union
  values). The harness README describes the states and the tests.

### Integration scenarios

They are left out of this iteration's rules: `incompleteScenarios` and the
requirement after the final gate read entry scenarios only, each with a
`TODO(Plan 10 iteration 8)`. An integration scenario stays `pending`, and a
declaration of one is rejected. One existing test has one
(`analysis-scenarios`' acceptance run); it completes with the integration
scenario pending, and its assertion says so. No test of this iteration has
one. Note for iteration 8: the final gate's `all` selection runs a pending
integration scenario too, which the scripted runners report passed; with the
real runner its undefined steps would fail the final gate until its work
item binds it.

### Evidence

From `ramify-agent/`:

| Command | Result |
| --- | --- |
| `npx vitest run subs/harness/src/tests/scenario-states.test.ts` | 14 passed: §7's row "no" (a declared scenario, selected by identity at its iteration gate with the tag already removed by that gate's commit, implemented there; a repeated declaration ignored; another entry's scenario declared by a request and implemented by its work-item gate; the final gate in full mode with both passed; counts `implemented: 2`); §7's row "yes" and §8 in the provider order (bound with the tag kept at its iteration gate, its fake-backed pass, the yield withdrawing nothing, the provider's conformance, the verification's second bound pass, `requirement-verified`, `scenario-due`, then implemented by the work-item gate untagged); rejected declarations through the judge (unknown ID, another entry's scenario, the bound ending the invocation as `invalid-submission`), a rejected and corrected local architect request, and the integration and no-entry rejections; withdrawal by exhaustion (commit message, trailers, the file at commit time, the effect's lines, the next engineer's base), by placement request (before `placement-requested`) and by yield (a bound scenario, no commit, the accepted boundary named); a refused completion request with its reason in the next briefing; the refusal bound failing `acceptance-incomplete` with `scenarios/sc-001.json`; an implemented scenario failing a later work-item gate as a regression and staying implemented; the final rule over records and states; a passing final gate whose check did not pass the scenario failing `acceptance-incomplete` with the gate as evidence; a crash between the withdrawal commit and its record, recovered by trailer with no second commit |
| `npx vitest run` over the 72 harness test files other than the composition, fixture and integration files | 72 passed, 622 tests. Before their update `placement` (7), `materialization` (2), `union-values` (3), `analysis-scenarios`, `breaking-work`, `local-authority`, `run-protocol`, `unguarded-write` and `work-items` failed |
| `npx vitest run` over the 11 integration and fixture files, the composition and its three recovery files, `subs/harness/subs` and `subs/web` | 53 passed, 2 skipped (`fixture-trials`, `fixture-acceptance`, conditional), 419 tests. Before their update `iteration-gate-integration` and `composition` (four new union values without a producer) failed |
| `npm run type-check` | passed |
| `npm run check:self` | check passed; 9 owners, 0 errors, 0 warnings, 110 analysis limits, as in iteration 6 |

The exit criterion is the first test of `scenario-states.test.ts`: a
scripted run on a copy of the collection-review fixture completes with every
entry scenario `implemented`. No test makes a model call. The full suite was
not run as `npm test`; the two batches above are the affected files, which
this iteration's change reaches in nearly every lifecycle test.

### Deviations

- **The fake-backed pass is an event of its own,**
  `scenario-bound-passed { scenario, gate }`, not part of the events table.
  It changes no state, so the reducer does not read it; the withdrawal rule
  reads it ("no pass since the declaration"), and iteration 10's scenario
  query can list it among the gates a scenario ran in. The attempt's own
  summary also holds the result.
- **A withdrawal commit is not an accepted boundary.** Iteration 6's open
  item suggested `acceptedCommit` count it; it follows a gate that did not
  pass, whose commit is not accepted either, and it restores tags the
  accepted boundary already had, so the next engineer's changes are still
  taken against the last passing gate. `acceptedCommit` is unchanged and
  says why.
- **A withdrawal of bound scenarios alone makes no commit.** A bound
  scenario never lost its tag, so the rendering does not change and Git
  would refuse an empty commit. Its `scenario-withdrawn.commit` names the
  accepted boundary, which carries the tag. In practice this is the yield's
  case: a scenario declared before the requirement opened is run by the
  contract gate, whose scope is the consumer, so at a yield an unpassed
  scenario is a bound one.
- **The withdrawal intent is a sixth event,** `scenarios-withdrawing`, and
  its completion is the first `scenario-withdrawn`, because one commit
  withdraws several scenarios and the event data is per scenario.
- **The trailer value is `withdrawn-<n>`,** not `withdrawn`: a run may
  withdraw more than once, and a recovery lookup must find its own commit.
- **Exhaustion means an iteration closing `exhausted`.** The work-item
  gate's own exhaustion fails the run at once (`repair-exhausted`) and
  withdraws nothing, as a stop leaves the tags as the states were (§12). An
  iteration that closes `partial` or `unsuitable` after a failed gate keeps
  its declared scenarios: the work item is still on its repair path until
  its architect yields or requests placement.
- **The guarded comparison of feature files uses the rendering last
  written,** not the current states. Declarations change states between a
  gate's comparison and its commit, and `scenario-due` after a gate, so the
  current rendering is not what the tree holds; a repair round's gate saw
  the previous round's commit as a guarded change.
- **`acceptance-incomplete` is a run failure checked before the final
  gate**, not a `GateRuleRecord` on the final attempt: a failed rule would
  still commit and run the full-mode check, and the architecture fails the
  run rather than returning anywhere. The same reason ends a work item's
  completion refusals when only scenarios blocked it.
- **`job-completed` requires each entry scenario passed in the final
  summary**, beside the check's own pass, because the `all` selection's pass
  rule does not require every tracked scenario executed.
- **The scripted runners changed.** The direct executor and the scripted
  `cucumber-js` now report the scenarios a selection reaches as passed, so
  a lifecycle test's work-item and final gates implement what was declared.
- **The scenario states are still replayed from the ledger** at each use
  (declaration, gate, withdrawal, refusal). Keeping them beside the
  snapshot would need a cache invalidated by every scenario event; the
  replay is linear in the log and was not measurable in these tests.

### Open items

- Iteration 8: integration scenarios in the final rule and the requirement
  after the final gate (the two TODOs), their declaration by an integration
  work item, and the final gate's `all` selection over a pending one.
- Iteration 9: the briefings say nothing yet about scenarios; the
  `blocked` section's closing text still speaks only of requirements and
  obligations, and a scripted architect knows its IDs only from the test.
- Iteration 10: `scenario-bound-passed` and the withdrawal events are
  projected as sentences with gate, invocation and commit references; the
  protocol has no `scenario` reference kind yet.
- A work item whose declared scenario its work-item gate did not execute
  (no module with feature files found for its owner) is refused until the
  bound; the reason names the gate.

## Iteration 8: Integration scenarios

**Date:** 2026-09-23. **Branch:** `feat/plan10-acceptance-scenarios`.

### What changed

- **The work item's origin** (`work/records.ts`). `WorkItem.origin` gains
  `{ integration: sc-NNN }`, the scenario's ID in place of an entry
  capability. `originKindOf(item)` answers `entry`, `obligation`,
  `verification` or `integration`, and `integrationScenarioOf(item)` the
  scenario or null. The capability of an integration item is null in the
  service and in `projections/work.ts`, and the work-items query's `origin`
  enum (`interfaces/protocol/runs.ts`) gains `integration`.
- **`work-item-started`** (`run/log.ts`) now carries `origin` (one of the
  four) for every item, and `scenario` for an integration item. Its event
  sentence names the scenario.
- **Creation** (`work/integration.ts`, new; `run/service.ts`).
  `recordScenarioPasses` attaches to each `scenario-implemented` the records
  of `integrationItemsDue`: for every integration scenario that lists the
  implemented scenario among its sub-scenarios, whose sub-scenarios are then
  all `implemented` and which has no work item yet (`dueIntegrations`), one
  work item from `integrationWorkItem(record, count)`: the next `wi-NNN`, at
  the scenario's owner (the recorded lowest common ancestor), goal "Bind the
  integration scenario …", `acceptanceRefs` the plan scenario's lines, no
  requirement references, `startedFor: null`. The record is committed in the
  same transaction as the event, so no crash separates them. Committed after
  every earlier item at depth 0, the scheduler takes it once the current item
  and the items before it are done.
- **The local architect's briefing** (`work/session.ts`,
  `integrationBriefing`). An integration item's first message has a section
  after the plan's references, headed `## The integration scenario sc-NNN:
  <name>`: the scenario's text and feature file; each sub-scenario with its
  owner, file and bridging Givens; each owner's step directory
  (`src/tests/steps/`, or `src/steps/` for a testing module, from
  `stepDirectoryOf(feature file)`) and the step files it holds now
  (`stepFilesIn`); and how it is bound: the scope, the ancestor's step
  directory, named imports, `expose-test` along each path, no step of its
  own, the declaration, the gates, and what a composition failure is.
- **The engineer's scope** (`work/assignment.ts`, `work/submission.ts`).
  `integrationScopeOf(record, records)` is the ancestor with
  `childrenOnPaths(ancestor, owners)`, the direct child on each path to a
  sub-scenario's owner. An integration item's architect receives it as
  `WorkEvidence.integration`, and `assignmentErrors` rejects an assignment
  whose base is not that module (`assignment.scope.base`) or leaves out one
  of those children (`assignment.scope.base.includedChildren`), each with
  the expected base. More children are allowed.
- **Declarations** (`work/declarations.ts`). `DeclarationContext` gains
  `integration`: an integration item may declare its own scenario, in its
  engineer's proposal or its architect's request, and nothing else; an
  entry's item still cannot declare an integration scenario. The service's
  `unfinishedScenarios` reads an integration item's one scenario, so the
  completion refusal, `work-item-completed`'s requirement and withdrawal
  apply to it unchanged.
- **Composition failures** (`scenarios` child, `composition.ts`, new and
  exposed with its two types). `compositionFailures(records, results)`
  returns each integration scenario whose result is `failed` while every
  sub-scenario has a `passed` result in the same check, with its suspects:
  the sub-scenarios that have a bridging Given, which `bridgingGivens`
  finds as the context steps (a `Given`, or an `And`/`But` continuing one)
  that appear in no step of the integration scenario, compared by kind and
  text as form rule 5 compares. `stepsOfSource` moved from `form.ts` to
  `gherkin.ts` for it. The service's `diagnosticsOf(run, gate, audience)`
  appends one line per failure and one per suspect to every failing gate's
  diagnostics, so the engineer's repair briefing and the local architect's
  failed-gate and returned-gate sections carry it; it is repaired like any
  failure.
- **The final rule.** Both `TODO(Plan 10 iteration 8)` exclusions are gone:
  `incompleteScenarios` reads every tracked scenario, integration ones
  included (named `sc-NNN (integration)` in the failure message), and
  `job-completed` requires every tracked scenario passed in the final
  full-mode summary. A run cannot reach the final gate around an open
  integration item, since the scheduler returns only when every item has
  completed; the rule stays as the consistency check.
- **Test helpers.** `declaringScenarios` declares an integration item's
  scenario, read from its briefing's heading, in a completion request that
  states none. `helpers/integration-scenario.ts` (new) is the scenario both
  new test files drive: the fixture with `notes` and `tags` under
  `reviews`, a plan with one integration scenario, the analysis with one
  sub-scenario each (the tags' with a bridging Given), each entry's step
  file with a named export, the ancestor's step file importing both, the
  `module.ramify` of each child with its `expose-test`, the turns and the
  Git answers.
- **Tests.** `integration-scenarios.test.ts` (new, 5 tests, no process):
  creation by the last sub-scenario's `scenario-implemented` and at the
  ancestor, the item's record, queueing behind the item that implemented it,
  `work-item-started` with the origins, the briefing's contents, a refused
  scope that leaves out a path, the assignment's scope, the iteration gate's
  identity selection of the integration scenario with its implemented
  sub-scenarios, the declaration and implementation, completion at the
  work-item gate, the final gate with every scenario passed, the work-items
  query; a composition failure's finding in the repair briefing, naming the
  tags' bridging Given and not the note's, and the repair round that passes;
  and the rules over literal records (due, the item, the scope, the step
  directory, the assignment's rejection, the declarations).
  `integration-scenarios-integration.test.ts` (new) runs the same scenario
  to completion with the integration scenario `implemented`, then gives the
  tree to the installed Ramify with a daemon of its own: the complete check
  passes with no finding, and with the tags' `expose-test` removed it fails
  with one finding, in the ancestor's step file. The scenarios child has
  `composition.test.ts` (new, 3 tests). Updated: `analysis-scenarios` (its
  integration scenario now gets `wi-003` at `collection-review/workspace`
  and is implemented: the Git answers gain `wi-003`, the counts are four
  implemented, and the starts are asserted with their origins),
  `scenario-states` (the final rule now names a pending integration
  scenario), `union-values` (the `work-item-started` sample), `composition`
  (producers of `work-item-started.origin` `verification` and `integration`,
  and of the query's `integration` origin). The harness and scenarios
  READMEs describe the work item, the rule and the tests.

### Evidence

From `ramify-agent/`:

| Command | Result |
| --- | --- |
| `npx vitest run subs/harness/src/tests/integration-scenarios.test.ts subs/harness/src/tests/integration-scenarios-integration.test.ts` | 6 passed. The integration test's real check: `checked`, exit 0, no finding; without the tags' exposure, a non-zero exit and one finding, in `subs/workspace/subs/reviews/src/tests/steps/integration.steps.ts` |
| `npx vitest run subs/harness/subs/scenarios` | 8 files passed, the new `composition.test.ts` (3 tests) among them |
| `npx vitest run` over 29 lifecycle and projection files (`scenario-states`, `materialization`, `work-items`, `run-recovery`, `no-rewind`, the contract files, `run-protocol`, `run-projections`, `progress`, `placement`, `local-authority`, `iteration-gate`, `gate-diagnostics`, `engineer-briefing`, `local-architect-submission`, `review-stop`, `analysis-scenarios`, `http`, `union-values`, `requirement-verification`, `breaking-work`, `unguarded-write`, `iterations`, `module-creation`, `projections-pure`, `progress-fixture`) and the scenarios child | 37 files, 365 tests passed. Before its update `analysis-scenarios` failed (the Git answers lacked `wi-003`) and `scenario-states`' final-rule test asserted the old exclusion |
| `npx vitest run` over the other 57 harness test files | 55 passed, 2 skipped (`fixture-trials`, `fixture-acceptance`, conditional), 427 tests |
| `npx vitest run subs/harness/src/tests/composition.test.ts` | 5 passed; before the three producers were cited, the union test named them unproduced |
| `npx vitest run subs/web` | 7 files, 63 tests passed |
| `npm run type-check` | passed |
| `npm run check:self` | check passed; 9 owners, 0 errors, 0 warnings, 110 analysis limits |

The exit criterion is `integration-scenarios-integration.test.ts`: the
scripted run completes with the integration scenario `implemented`, and the
real checker accepts the ancestor's step file importing the sub-scenarios'
step files through `expose-test`. No test makes a model call.

### Deviations

- **The work item is committed with the `scenario-implemented` event**, not
  by `work-item-started` as the architecture's events table puts it. The
  item exists (and counts, and is scheduled) from the moment it is due;
  `work-item-started` marks its turn, carrying the origin and scenario, as
  for every other item.
- **"Queued behind the current work item" is commit order.** The item is at
  depth 0 and committed last, so it runs after the current item and after
  every entry item still open, not necessarily next. Nothing it needs is
  missing then: its sub-scenarios are implemented already.
- **The scope is judged, not derived.** The architect states the scope as
  for every assignment, and the judge rejects one whose base is not the
  ancestor or that leaves out a child on a path, naming the expected base.
  Extra children are allowed. The briefing names the scope.
- **A composition failure is a diagnostic, not an event.** It is a pure
  function of the gate attempt's scenario summary and the records, so the
  lines are derived whenever a failing gate is briefed, and a projection can
  derive them again; no state changes with it.
- **The local architect of an integration item may declare its scenario** in
  its completion request, as decision 2 allows for an entry's. The scripted
  helper relies on it for the tests whose subject is not the binding.
- **The real checker runs in a file of its own.** Lifecycle files replace
  `node:child_process` with the guard, which refuses the daemon; the
  integration test runs the same scripted run unguarded and then the
  installed Ramify, beside a guarded file that asserts the run in detail.
- **The work-items query's origin enum gains `integration`** here rather
  than in iteration 10, since the projection would otherwise misname the
  item. It is additive.

### Open items

- Iteration 9: the engineer's briefing says nothing yet about the
  integration scenario; it knows what the architect's assignment states.
  The `blocked` section's closing text still speaks only of requirements.
- Iteration 10: the scenario query and the run page should show an
  integration item's scenario and a gate's composition failure, which
  `compositionFailures` derives from the attempt; `progress.test.ts` still
  builds `work-item-started` events without `origin` (they are not parsed).
- A composition failure is recognized only where every sub-scenario ran in
  the same check. The work-item gate runs them all; an iteration gate does
  when the scope includes the children, which the judge requires.
- Integration items count against `maxWorkItems`.

## Iteration 9: Briefings, procedures and diagnostics

**Date:** 2026-09-23. **Branch:** `feat/plan10-acceptance-scenarios`.

### What changed

- **The scenario briefings** (`work/scenario-briefing.ts`, new).
  `BriefedScenario` (`id`, `name`, `state`, `file`, `source`, `partOf`),
  `entryScenariosOf(records, states, entry)` (none for `entry: null`),
  `EngineerScenarios` (`{ kind: 'entry', scenarios }` with every scenario of
  the entry, or `{ kind: 'integration', integration: IntegrationBriefing,
  state }`), `architectScenarioSection` and `engineerScenarioSection`.
- **The local architect** (`work/session.ts`). `WorkItemBriefing.scenarios`
  puts a section `## The scenarios of this work item` after the plan's
  references (and after iteration 8's integration section, which stays): per
  scenario `### sc-NNN (<state>): <name>`, its feature file, for a
  sub-scenario the integration scenario it came from, and its text, then how
  binding, declaring, `bound` and `declared`, `assignment.scenarios`,
  `request-completion.scenarios` and the completion refusal work. The service
  fills it for an entry's work item only. `lastIteration.scenarios` carries,
  for an accepted iteration, each scenario its gate passed with the
  definition that bound each step (`passedScenarioLines`), with a line on
  bindings reached through an import. The `blocked` section's closing text
  now says how a scenario is implemented.
- **The procedure** (`local-architect.procedure.md`, version 2). Step 5 is
  §6's: a goal a module already meets still needs its scenarios bound;
  declare them with the completion request where existing step definitions
  bind them, otherwise assign an iteration that writes them. A new section
  `## Scenarios` explains the states, declaring, the refusal, withdrawal and
  what a gate section shows; `assign` documents `assignment.scenarios`;
  `request-completion` its `scenarios` and the scenarios the work-item gate
  runs.
- **`assignment.scenarios?: string[]`** (`work/assignment.ts`,
  `work/iterations.ts`). Optional on the submitted body and on the frozen
  `IterationAssignment` (copied unless the assignment is a contract
  revision). `assignedScenarioErrors(ids, context)` (`work/declarations.ts`,
  beside the new `ownScenarios(context)`) accepts scenarios of the work item
  in any state and rejects, at `assignment.scenarios.<i>`, another work
  item's scenario, an integration scenario of an entry's item, and an
  unknown ID; a provider item names none. `assignmentErrors` applies it with
  `AssignmentEvidence.scenarios`, which `validateLocalArchitect` passes from
  `WorkEvidence.scenarios`. Nothing requires the engineer to declare these.
- **The engineer** (`work/engineer.ts`). `IterationBriefing.scenarios` adds,
  after the completion evidence: a line that the gate runs the scope's
  declared scenarios by identity; `## Scenarios to bind` with the assigned
  ones; the entry's other unimplemented ones (or `## The scenarios of this
  work item` when none is assigned), each with state, file and text; a count
  of implemented ones; and `## Binding a scenario` with §6's three rules and
  the request for named imports of another owner's step files. An
  integration item's engineer gets `## The integration scenario to bind`,
  the sub-scenarios' owners and their step files, and `## Binding it` (one
  step file at the ancestor, no step of its own, `expose-test` along each
  path, never a feature file, declare once it passes, named imports). The
  service passes nothing for a provider or follow-up item, whose message says
  nothing about scenarios.
- **Prompts.** `engineer.system.md` version 3 (what `run_scope_tests` runs),
  `engineer.procedure.md` version 3 (step 4 and 5, a section `## Scenarios`
  with the rules, `scenarios` in `completion-proposed`). Packages
  `local-architect/2` and `engineer/2`; `contract-engineer/1` is unchanged,
  since none of its files or its schema changed.
- **`run_scope_tests`** (`work/engineer.ts`, `work/engineer-equipment.ts`).
  `ScopeTestsOptions.scenarios?: ScopeScenarioCheck` (`plan`, `directory`,
  `names`). After the tests (whatever their outcome, an empty selection
  included) the tool plans the check anew, runs it with `runScenarioCheck`
  through the same command runner, and appends `Scenarios: passed|failed;
  <mode and selection>.` and the per-scenario lines of the diagnostics; the
  result is an error when either half did not pass. With nothing selected it
  says so. `EngineerEquipmentInputs.scenarios` carries the planning; the
  equipment numbers each call's directory, `runLayout.scopeScenarios(invocation,
  call)` (`invocations/<id>/scenarios/NNN/`, the profiles, streams and
  `scenarios.log`). The service's `scopeScenarioCheck(run, item, policy)`
  plans `iteration` (quick, identity) over the tool's own policy with
  `ScenarioPlanningOptions.include`, new in `checks/checkpoint.ts`: the work
  item's pending scenarios are selected beside the scope's bound, declared
  and implemented ones. A run with no tracked scenario, or no valid
  configuration, gets no scenario part. The `scope-tests` observation gains
  an optional `scenarios { selected, passed, failures }`.
- **Diagnostics** (`checks/diagnostics.ts`). `gateDiagnostics(gate,
  audience, names?)` renders a `scenarios` command from its summary rather
  than its output tail: a header with the mode and selection, then
  `scenarioCheckLines(summary, names, { indent, only })`: per scenario that
  did not pass its name, `file:line`, the failing step, the message (at most
  12 lines and 1,500 characters) and the steps no definition matched; per
  passed scenario each step's definition as `uri:line`; the project's own
  scenarios where any failed; and every failure line of iteration 5's that
  is not about one scenario. A passing scenario check in a failing gate lists
  the binding of each scenario it passed. `describeScenarioCheck` is the
  header phrase. The service's `diagnosticsOf` passes the records' names; the
  composition-failure lines of iteration 8 follow unchanged.
- **Test helpers.** `scriptedScenarioRun(request)`
  (`helpers/project-config.ts`) is the scripted `cucumber-js` answered in
  the test's process, for command runners that are functions; it reads the
  profile as text. `StatedCommand.scenarios` (`helpers/composition.ts`)
  states a scenario run by the mode's command, and the composition's
  `iteration` and `testless` scenarios state the one each `run_scope_tests`
  call now makes.
- **Tests.** A new `scenario-briefings.test.ts` (14 tests). Updated:
  `analysis-submission` (the two versions), `engineer-submission` (the tool's
  scenario part, its observation and directory), `integration-scenarios`
  (the entry and integration briefings of both roles, the repair briefing's
  scenario lines), `scenario-states` (`assignment.scenarios` recorded and
  shown under "Scenarios to bind", the states each architect turn finds, a
  provider item's silence), the composition helper. The harness README
  describes the change.

### Evidence

From `ramify-agent/`:

| Command | Result |
| --- | --- |
| `npx vitest run subs/harness/src/tests/scenario-briefings.test.ts` | 14 passed: the local architect's section per scenario (ID, state, text, file, the integration scenario of a sub-scenario; another entry's and the integration scenario absent; declaring and the refusal), a provider item's silence and the refusal's closing text, the accepted iteration's binding lines; the engineer's "Scenarios to bind", the entry's other scenarios, implemented ones counted, the three rules and named imports, the all-implemented case, the integration engineer's section, a provider's message with no mention of scenarios; `assignment.scenarios` over entry, integration and provider items and through `validateLocalArchitect`; `run_scope_tests` with a scripted runner over the recorded `undefined` and `passing` streams (argv, the identity expression with the pending one, per-scenario lines, the observation, one directory per call, nothing selected); the diagnostics of a recorded failing, undefined and passing check for both audiences, a passing check's binding in a failing gate, and the message bound |
| `npx vitest run` over `scenario-briefings`, `engineer-submission`, `composition`, `scenario-states`, `integration-scenarios`, `analysis-submission`, `engineer-briefing`, `gate-diagnostics` | 8 files, 79 passed. Before their update `engineer-submission` (the scripted runner refused the scenario run) and `composition` (an unstated command) failed |
| `npx vitest run` over the 76 harness test files other than the integration and fixture files, `integration-scenarios`, `subs/harness/subs` and `subs/web` | 119 files, 1,046 passed |
| `npx vitest run` over `iterations-integration`, `integration-scenarios-integration`, `single-session-integration`, `iteration-gate-integration`, `module-creation-integration`, `contract-delegation-integration`, `scenario-check-integration`, `run-protocol-materialization.integration`, `run-git.integration`, `fixture-check`, one at a time | 10 files, 18 passed |
| `npm run type-check` | passed |
| `npm run check:self` | check passed; 9 owners, 0 errors, 0 warnings, 110 analysis limits, as in iteration 8 |

No test makes a model call. The full suite was not run, per the plan's
rules; `fixture-trials` and `fixture-acceptance` are conditional and were
not run.

### Deviations

- **`run_scope_tests` selects the work item's own pending scenarios,** not
  every pending scenario of the scope's owners, beside the bound, declared
  and implemented ones an iteration gate selects. Another entry's pending
  scenario in the same module is nobody's to bind yet and would fail as
  undefined on every call.
- **The scenario half runs whatever the tests did,** an empty or
  unresolvable selection included, and the tool's result is an error when
  either half did not pass: an engineer binding scenarios in a module with no
  unit test still sees them.
- **The contract engineer's `run_scope_tests` runs no scenario check,** and
  its package stays `contract-engineer/1`: a contract sub-session binds no
  scenario, and its gate still runs the declared ones. A provider or
  follow-up item's engineer does get the scenario half (the scope's declared
  scenarios, none pending of its own), and its tool description and system
  prompt mention it; its briefing message says nothing about scenarios.
- **The binding also reaches the local architect after a pass.** The
  architecture has the architect see it "in the gate section"; the gate
  sections exist for failing gates, so an accepted iteration's section lists
  what its gate passed with each binding.
- **The local architect's system prompt is unchanged** (file version 1);
  its procedure (version 2) and its submission schema changed, so the package
  is `local-architect/2`.
- **`assignment.scenarios` stays optional on `iteration-assignment/1`**, as
  iteration 7 added `scenarios` to the submissions without a version: an
  additive optional field.

### Open items

- Iteration 10: the scenario query and the run page may show the
  `scope-tests` observation's `scenarios` and an accepted gate's bindings.
- The engineer is told the owner's step directory; a run of the owner's
  scenarios loads only that module's step files, so step definitions in
  another module of the write scope bind only through an import from them.
  The rule's wording follows §6.
- A symbol-free-load rule for testing source remains the toolkit's to add.

## Iteration 10: Projections, protocol and web

**Date:** 2026-09-23. **Branch:** `feat/plan10-acceptance-scenarios`.

### What changed

- **Protocol** (`interfaces/protocol/runs.ts`, `paths.ts`). New schemas,
  each with its type: `scenarioKindSchema`, `scenarioOriginViewSchema`
  (`{ kind: plan, planScenario, lines }` or `{ kind: architect, refs }`),
  `trackedScenarioStateSchema`, `scenarioStatusSchema`,
  `scenarioCheckModeSchema`, `scenarioWarningKindSchema`,
  `scenarioWarningViewSchema`, `analysisScenarioSchema` (a scenario's frozen
  text: ID, kind, entry, owner, origin, `partOf`, `subScenarios`, name,
  source, file), `scenarioCheckViewSchema` (the compact summary),
  `scenarioGateResultSchema`, `scenarioViewSchema` and
  `scenarioListResponseSchema`. `runQueryLimits.scenarios` is 500.
  - The accepted analysis gains `scenarios` (entry scenarios in submission
    order, then integration ones), `warnings` (from `analysis-accepted`) and
    `total.scenarios`.
  - `capabilityProgressSchema` gains `scenarios: { implemented, total }`,
    null for a capability that is not an entry.
  - Each command of `gateViewSchema` gains `scenarios`: the compact summary
    of a `scenarios` command (mode, selection, dry run, excluded count, each
    run by exit code, each tracked scenario's status, file, line, failure and
    undefined steps, the project's own by count, and the failure lines),
    null for every other command. Bindings and stream paths stay files of
    the run.
  - `runEventRefKindSchema` gains `scenario`.
  - `GET /api/v1/plans/:planId/runs/:runId/scenarios`
    (`protocolPaths.runScenarios`) answers `{ scenarios, total }`. Each
    `ScenarioView` holds the ID, kind, name, state, origin, entry, `partOf`,
    `subScenarios`, `workItem` (the entry's work item, or the integration
    work item, null until it is created), owner, file, `implementedBy` (the
    gate of `scenario-implemented`) and `gates`: every gate attempt whose
    scenario check ran the scenario, in first-commit order, with checkpoint,
    subject, the attempt's verdict, mode, dry run, the scenario's status
    there, its failure and undefined steps.
  - The root's `module.ramify` re-exposes the 24 new names to the web.
- **Projections.** A new `projections/scenarios.ts`: `scenariosOf` replays
  the records and states with `run/feature-files.ts`'s `trackedScenarios`;
  `analysisScenariosOf`, `scenarioListOf`, `scenarioCheckViewOf` and
  `entryScenarioCounts`. `analysis.ts`, `progress.ts` and `work.ts`'s
  `gateOf` use them; `queries.ts` gains `scenarios(planId, runId)`;
  `inputs.ts` lists `ramify-agent.scenario/1` among the supported record
  versions, so another version is refused with evidence. `events.ts` adds a
  `scenario` reference to `scenario-declared`, `scenario-due`,
  `scenario-implemented`, `scenario-bound-passed`, `scenarios-withdrawing`,
  `scenario-withdrawn` and an integration item's `work-item-started`.
- **HTTP.** `http/app.ts` serves the scenario list, validated against its
  schema.
- **Web** (`subs/web`). `client.ts` gains `getScenarios`. A new
  `run-scenarios.tsx`: `ScenarioReview`, `ScenarioTable`,
  `ScenarioCheckSummaryView`, `ReviewPanel`, `ApproveForm`, `canApprove`,
  `reviewText`, `originText`. The Run page has a Scenarios area; the
  overview shows the scenario counts, the review status and a Review panel
  (with the wait at the review stop); Plan and entries has "Review of the
  scenarios" with each entry's scenarios, each integration scenario's plan
  text beside its sub-scenarios, and the warnings, listed and on the
  scenario they concern; a gate's detail shows its scenario check. Approve
  (reviewer, optional note) is in the Review panel and under the review,
  wherever `canApprove` holds: not reviewed, no stop requested, and either
  completed or running outside `analysis` and `final-verification`. It
  sends at the run's version and once more at the version a `stale-version`
  refusal names; `useRunProgress` gains `refresh`, which the page calls
  after an approval so a completed run, which no longer polls, shows it.
  The Plan page's Start has the review-stop checkbox and always sends
  `reviewStop`. Capability details show an entry's scenario count. Styles
  for all of it in `styles.css`.
- **Tests.** A new `scenario-projections.test.ts` (3 tests). Updated:
  `protocol-contract` (a new block of 6 tests), `union-values` (the
  `scenario` reference kind's producer), `projections-pure` (the new query
  in-process and over HTTP), `composition` (the query is observed while the
  composed runs run and after, and in the no-append test; five query unions
  are mapped to the record unions they project, and `bound` is cited to the
  new test), the web's `run-page` (the fixtures, the Stop test, 7 new
  tests), `plan-page` (`reviewStop` in the payload, a new test), `client`
  (a new test) and `capability-graph` (the fixture's `scenarios`), and the
  capability-graph example. The harness and web READMEs describe the
  change.

### Evidence

From `ramify-agent/`:

| Command | Result |
| --- | --- |
| `npx vitest run subs/harness/src/tests/scenario-projections.test.ts` | 3 passed: over the scripted composition-failure run, the list (IDs, kinds, states, entries, `partOf`, sub-scenarios, work items with `wi-003` for the integration scenario, owners, files, origins), sc-003's gates `iteration wi-003.i01 failed` (with the failure), `passed`, `work-item wi-003 passed`, `final full passed`, `implementedBy` the passing attempt, sc-001 passed at the attempt that failed the gate; the review's text, the integration scenario's source equal to the plan's; the entries' counts `1 of 1`, null for other capabilities; the failing gate's compact summary; the events' scenario references; the same list over HTTP and `not-found` for an unknown run; over constructed records every state, an integration scenario without its work item, and the warnings and counts |
| `npx vitest run` over `protocol-contract`, `union-values`, `projections-pure`, `composition` | passed; before its update `union-values` failed on the reference kinds, and `composition` on 13 query union values without a producer |
| `npx vitest run` over the 24 harness files that import the projections or the run protocol, read run events or gates, or drive scenario runs (`accepted-commit`, `integration-scenarios`, `kpi-metrics`, `local-authority`, `analysis-scenarios`, `projections-pure`, `progress`, `measurement`, `run-projections`, `review-stop`, `protocol-contract`, `progress-fixture`, `run-commands`, `work-items`, `union-values`, `scenario-projections`, `run-protocol`, `http`, `scenario-states`, the three `composition-recovery*`, `materialization`, `placement`) | 24 files, 269 passed |
| `npx vitest run subs/harness/src/tests/run-protocol-materialization.integration.test.ts` | 1 passed |
| `npx vitest run subs/web` | 7 files, 72 passed. Before their update every `run-page` test failed on its fixture, then the Stop test on the approval's fields, and `plan-page`'s Start test on the payload |
| `npm run type-check` | passed (root, web and scripts) |
| `npm run check:self` | check passed; 9 owners, 0 errors, 0 warnings, 122 analysis limits: iteration 9's 110 and 12 `signature-inferred` on the new exposed schema constants |
| `npm run build:web` | built, `dist/web/assets/index-*.js` 680 kB (Vite's usual chunk-size warning) |

No test makes a model call. The full suite was not run, per the plan's
rules.

### Deviations

- **The review's text is on the analysis answer**, not on the scenario
  list: the review reads the frozen text, which the list leaves out so it
  stays about states and gates. Both are served from the same records.
- **The list names the work item that binds a scenario** rather than only
  an integration scenario's: an entry scenario's is its entry's first work
  item, which the page shows beside the entry.
- **`implementedBy`** is on the list beside the gates, from
  `scenario-implemented`; the plan names only the gates. A fake-backed pass
  is visible as a gate the scenario passed while it stayed `bound`.
- **The gate view's summary is compact**: no binding and no stream or
  profile paths. The composition-failure diagnostics are not projected; the
  failing integration scenario and its passing sub-scenarios show side by
  side on the list and in the gate.
- **Approve is also under the review**, beside the scenarios it approves,
  as well as in the overview's Review panel. It is offered on a completed
  run, as the harness accepts it there.
- **An approval refused as `stale-version` is sent once more** at the
  version the refusal names, with a new command ID: the analysis it
  approves is frozen, and a working run's version moves between polls.
- **`reviewStop` is not added to the snapshot** (iteration 3's open item):
  the page reads the phase, and the Review panel says when the run waits.
- **One union value is cited to a projection test**: `bound` in the
  scenario list, whose producer is the constructed-records test, since the
  composed runs declare nothing while a requirement is open; the record's
  `bound` is produced by `scenario-states`.

### Open items

- The composition-failure suspects (`compositionFailures`) and the
  `scope-tests` observation's scenarios are not projected; an accepted
  gate's bindings stay in its attempt file.
- Gates per scenario are not bounded; they are bounded by the run's gate
  attempts.
- The scenario list cannot open a gate's detail in the Checks area; it
  names the gate.

## Iteration 11: Trial, documents and audits

**Date:** 2026-09-23. **Branch:** `feat/plan10-acceptance-scenarios`.
Implementation commit `d888635`.

### What changed

- **The fixture plan's scenarios.** `plans/status-badge-tone/plan.md` keeps
  its prose and gains, under Acceptance, a `gherkin` block stating the first
  two bullets: "A badge given a tone carries that tone in its markup" (a
  passed badge with the tone `warning` carries it and still reads
  `Passed`) and "A badge given no tone carries neutral". Extraction finds
  them as `ps-01` (lines 34–38) and `ps-02` (lines 40–43), both under the
  Acceptance anchor.
- **The badge needs no World** (iteration 4's open item). The World and hooks
  stay in `integration-tests`, built on `createTestSystem` and so tagged
  `[testing, dispatch]`; `shared-ui`'s test area is `[testing, ui]` and
  cannot import them. The badge's step file renders the badge with
  `react-dom/server` and `createElement`, as its unit tests do, and keeps the
  props and markup in its own module scope, which each scenario's first step
  replaces. Cucumber still constructs the configured World for each
  scenario, because the support files load in every module's run; its
  constructor starts nothing. No separate World without `dispatch` was
  added. The fixture README records the decision.
- **`helpers/badge-scenarios.ts`** (new): the plan's analysis
  (`badgeAnalysis`, one entry at `shared-ui` whose two scenarios restate the
  plan's with the plan as origin), the step file, and `badgeImplementation`,
  Plan 3's recorded stage plus `shared-ui`'s `module.ramify` exposing
  `StatusBadgeTone` beside `StatusBadgeProps`. Plan 3's stage alone now fails
  the Ramify check with `exposed-without-companion`, which Plan 8 introduced
  after the stage was recorded.
- **The scripted acceptance trial** (`acceptance-trial.test.ts`, new). One
  run of `review-notes` on a fixture copy with `notes`, `tags` and `limits`
  added and the plan given one integration scenario over two entries
  (`helpers/integration-scenario.ts`). It starts with `reviewStop`, waits at
  `awaiting-review` with no branch and no commit, and is approved. It then
  passes the four acceptance readiness steps and materializes the feature
  files. The note's work item (`wi-001`) registers a contract for the limit
  and declares its sub-scenario while `rq-001` is open (`bound`). Its
  iteration gate fails the scenario, the iteration closes `partial`, and
  the yield withdraws the bound scenario with no commit. The provider
  (`wi-003`) conforms. The verification declares the scenario again, which
  passes against the real provider (`scenario-bound-passed`); then
  `requirement-verified`, `scenario-due`, and the work-item gate implements
  it. The tags' item (`wi-002`) exhausts its repair rounds, and "Withdraw
  sc-002" is committed with `Ramify-Scenarios: withdrawn-1`; a second
  iteration binds and implements the scenario. That implementation creates
  the integration item `wi-004` at `reviews`, which binds `sc-003` through
  `expose-test`. The final gate runs in full mode. The test asserts the
  course of the run as a list of 35 events (below), the readiness steps, the
  materialization and withdrawal commits, the snapshot's counts, the
  scenario list query, the feature files without a pending tag, and the
  final summary.
- **Gates of the trial.** Every gate but the final one uses the direct
  executor, with scripted failures. The final gate runs its commands in the
  project through `createLocalCommandCheckExecution`, so the scenario check
  runs `npm run acceptance:full -- --config <profile>` per module. By
  default `cucumber-js` is the scripted runner and the trial takes about 3 s.
  With `RAMIFY_AGENT_FIXTURE_ACCEPTANCE=1`, `npm ci` installs the fixture's
  toolchain once, each copy links its `node_modules`, and the real
  `cucumber-js` 13.2.1 runs the step files the engineers wrote. The fixture's
  own scenario runs beside them over HTTP.
- **A second run** in the same file binds `status-badge-tone`'s two
  scenarios in `shared-ui`, with the review stop, one iteration declaring
  both, and the final gate in full mode. With the real toolchain, both
  scenarios bind to the badge's step file only.
- **Updated tests.** `extraction.test.ts` reads the badge plan's two
  scenarios and appends its sample block to `revision-diff`.
  `helpers/progress-fixture.ts` moves the `rowBound` and `sixtyRows`
  forecast runs from `status-badge-tone` to `reviewer-identity`: an analysis
  with no entry cannot assign a plan scenario, so form rule 3 rejected it and
  the progress fixture failed. `fixture-trials.test.ts`'s `status-badge-tone`
  trial submits `badgeAnalysis()`, writes `badgeImplementation()` and the
  step file, and declares both scenarios. `plans.test.ts`, `http.test.ts` and
  `scripts/composition-gate.ts` name the plan by ID and title only and
  needed no change. The harness README lists the trial.

### The course of the run

`course(log)` in the trial, asserted in both variants:

```text
analysis-accepted 3 scenarios
review-requested
analysis-approved by dana@example.com
readiness-passed
scenarios-materialized
work-item-started wi-001 (entry)
iteration-closed wi-001.i01 partial
contract-registered rq-001 (provider wi-003)
scenario-declared sc-001 bound
iteration-closed wi-001.i03 partial
scenario-withdrawn sc-001 (yielded)
work-item-yielded wi-001
work-item-started wi-003 (obligation)
provider-conformed wi-003
work-item-completed wi-003
work-item-resumed wi-001
scenario-declared sc-001 bound
scenario-bound-passed sc-001
requirement-verified rq-001
scenario-due sc-001 (requirements-verified)
scenario-implemented sc-001
work-item-completed wi-001
work-item-started wi-002 (entry)
scenario-declared sc-002 declared
iteration-closed wi-002.i01 exhausted
scenarios-withdrawing sc-002 (repair-exhausted)
scenario-withdrawn sc-002 (repair-exhausted)
scenario-declared sc-002 declared
scenario-implemented sc-002
work-item-completed wi-002
work-item-started wi-004 (integration sc-003)
scenario-declared sc-003 declared
scenario-implemented sc-003
work-item-completed wi-004
job-completed
```

Final states: the run `completed` with no failure and `review { reviewer:
dana@example.com, duringRun: false }`; `counts.scenarios` `{ pending: 0,
bound: 0, declared: 0, implemented: 3 }`; the scenario list `sc-001` and
`sc-002` entry scenarios implemented by `wi-001` and `wi-002`, `sc-003`
integration implemented by `wi-004` at `reviews`. The final gate's summary
is `full`, `all`, not a dry run, no exclusion and no failure, with four runs
(`integration-tests`, `reviews`, `notes`, `tags`) exiting 0 and all three
scenarios passed. With the real runner, the summary shows `sc-001` bound to
`review-note.steps.ts`, `sc-002` to `review-tags.steps.ts`, and `sc-003` to
both through the ancestor's imports. The project's own scenario passed
(`untracked { passed: 1, skipped: 0, failed: 0 }`).

### Evidence

From `ramify-agent/`:

| Command | Result |
| --- | --- |
| `npx vitest run subs/harness/src/tests/acceptance-trial.test.ts` | 2 passed, 2 skipped (the real-runner variants), about 5 s |
| `RAMIFY_AGENT_FIXTURE_ACCEPTANCE=1 npx vitest run subs/harness/src/tests/acceptance-trial.test.ts` | 4 passed in 18.3 s on `d888635`, `npm ci` of the fixture included: both runs with the scripted runner, and both with the real `cucumber-js` in full mode |
| `RAMIFY_AGENT_TRIAL=status-badge-tone npx vitest run subs/harness/src/tests/fixture-trials.test.ts` | 1 passed in 61 s (the trial copy prepared by `scripts/live-trial.ts`, a private Ramify daemon, `verify` with no defect), 1 skipped (`reviewer-identity`, not selected) |
| `npx vitest run subs/harness/subs/scenarios/src/tests/extraction.test.ts` | 11 passed |
| `npx vitest run` over `progress-fixture`, `plans`, `http` | 3 files, 23 passed; `progress-fixture` failed before its update (every test skipped after the fixture's `rowBound` run was rejected) |
| `npx vitest run` over `composition`, `union-values`, `analysis-scenarios` and `subs/harness/subs/scenarios` | 11 files, 176 passed |
| A fixture copy with `npm ci`, `badgeImplementation()` and the step file | `npm run type-check` passed; `npx vitest run` 21 files, 80 passed; `ramify check --batch` passed with 0 errors and the two configuration warnings. With Plan 3's stage alone it fails with one `exposed-without-companion` (`StatusBadgeTone`) |
| `npm run type-check` | passed |
| `npm run check:self` | check passed; 9 owners, 0 errors, 0 warnings, 122 analysis limits, as in iteration 10 |

No test makes a model call.

### Deviations

- **Two runs, not one.** The trial is the `review-notes` run with the
  integration scenario. The badge plan's scenarios have their own smaller
  run, since that plan has one entry and could not hold an integration
  scenario without changing its text.
- **Two withdrawals.** The plan names one. The yield withdraws a bound
  scenario and commits nothing; the exhaustion commits "Withdraw sc-002".
  The trial covers both.
- **The final gate runs for real in both variants.** Only its scenario runner
  differs. The gates before it use the direct executor. The real runner runs
  only in the environment-gated variant, as in `fixture-acceptance.test.ts`,
  since it needs the fixture's installed dependencies.
- **Plan 3's recorded badge stage is amended** with the `StatusBadgeTone`
  exposure where a run writes it, rather than re-recorded, since the stage
  is Plan 3's evidence.
- **The progress fixture's forecast runs changed plan**, because the plan
  they used now has scenarios that an analysis without entries cannot
  assign.

### The ramify-agent suite audit

The request `audit/ramify-agent-suite.request.json`, run per
[its README](../../../audit/README.md) on the implementation commit
`d888635` as HEAD with a clean tree, after `npm ci` of
`examples/collection-review` and `site` (the root was built and the root
`node_modules` is the main checkout's):

| Field | Value |
| --- | --- |
| Overall | `pass`, 155.8 s, audited 2026-09-23T15:01:27Z |
| Source commit | `d8886357a47acdd7fc574051337ec6d3129d3766`, tree `b4da21da04ce01984d70394c45da22658e4aa864` |
| Run ref | `refs/audited/runs/2026-09-23T15-01-27Z-d8886357a` |
| Report commit | `bc172549bf9c3afcd44547ddf10ff1dc987b087a` |
| Note | `git notes --ref=audit show d8886357a47acdd7fc574051337ec6d3129d3766` |

| Check | Outcome |
| --- | --- |
| `patch-integrity` (`git diff --check HEAD^ HEAD`) | pass, no output |
| `agent-typecheck` | pass, 2.4 s |
| `agent-tests` (`npm test -- --maxWorkers=4`) | pass, 126.5 s: 133 files passed and 2 skipped (`fixture-trials`, `fixture-acceptance`), 1,094 tests passed and 7 skipped. The acceptance trial's two real-runner tests are among the skipped. |
| `agent-structure` (`check:self`) | pass, 10.9 s: 0 errors, 0 warnings, 122 analysis limits |
| `parent-daemon-test` | pass, 16.0 s, 1 test |

No check failed, so no fix commit followed. `iterations-integration`, which
failed once under load in iteration 6, passed in the suite's run.

### Open items

- The real pi run on `status-badge-tone` waits for Dan's go-ahead.
- The `reviewer-identity` fixture trial was not re-run; its plan is
  unchanged.
- The analysis's "What this changes" says the local architect can no longer
  complete a work item with no iteration. Decision 2 of the architecture
  lets it declare scenarios that existing step definitions bind, and the
  implementation follows it, so no document was changed for that line.
  Toolkit documents outside `ramify-agent/` were not edited.

## Acceptance

The plan's [acceptance](main-plan.md#acceptance) criteria and their evidence.

| ID | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| AS01 | Plan scenarios are extracted, and form rules 1–6 reject with the rule named | Iteration 1's `extraction` and `form` tests, iteration 2's `analysis-scenarios` (one rejection per rule); iteration 11's extraction of the fixture plan | met |
| AS02 | Scenario records are committed at acceptance and never change afterwards | Iteration 2's acceptance tests (one transaction); the trial's records, read back by the scenario list after completion | met |
| AS03 | The review stop holds the lock, leaves the tree untouched and subtracts its time | Iteration 3's `review-stop` (busy while waiting, no branch or commit, the budget with the injected clock); the trial's wait with no branch and no commit | met |
| AS04 | Readiness fails a project without a valid configuration or scenario harness, and passes the fixture | Iteration 4's `project-config`, iteration 5's `scenario-check-integration` and gated `fixture-acceptance`; the trial's four passed steps | met |
| AS05 | Each gate plans the scenario check of the architecture's table and passes only by the message stream's strict result | Iteration 5's `scenario-check` and `scenario-check-integration` | met |
| AS06 | Feature files are rendered purely, committed once, re-rendered idempotently, and guarded | Iteration 6's `materialization`, rendering golden files and recovery rows | met |
| AS07 | Every state transition of the events table, and no other, occurs at its event | Iteration 1's `states`, iteration 7's `scenario-states`; the trial's course | met |
| AS08 | An integration scenario is bound by an integration work item through `expose-test`, accepted by the real checker | Iteration 8's `integration-scenarios-integration`; the trial's `wi-004`, bound with the real runner in the gated variant | met |
| AS09 | Briefings and diagnostics carry what §6 and the scenario check specify | Iteration 9's `scenario-briefings` | met |
| AS10 | The scenario list, the review section and the approve action are served and shown | Iteration 10's `scenario-projections`, `protocol-contract` and the web tests | met |
| AS11 | A scripted run on the fixture completes with every scenario `implemented` and passing in full mode | The trial: three scenarios implemented and passed at the full-mode final gate, with the scripted runner by default and the real `cucumber-js` in the gated variant (4 passed); the `status-badge-tone` run and fixture trial | met |
| AS12 | Both audits pass on one commit | Both pass on `e851d5e`; see [final audits](#final-audits) | met |

## Final audits

Both audits ran on `e851d5e`, the documents commit whose parent is the last
implementation commit `d888635`. Plan 10 changes nothing outside
`ramify-agent/`.

| Audit | Result | Evidence |
| --- | --- | --- |
| ramify-agent suite request | pass: all five checks; `agent-vitest` 1,094 passed, 7 skipped | `refs/audited/runs/2026-09-23T15-15-38Z-e851d5ea9` |
| Root cucumber-viz audit | pass: static and regression, 2,260 tests | `refs/audited/runs/2026-09-23T15-12-54Z-e851d5e` |

The first root audit of the same commit
(`refs/audited/runs/2026-09-23T15-08-40Z-e851d5e`) failed one toolkit test,
`subs/analysis/src/tests/session-worker.test.ts` > "cancels queued and active
calls without losing the last published revision", which expected revision
sequence 1 and saw 2. The toolkit's source is unchanged by this plan, the test
passed three times alone, and the rerun of the same commit passed, so it is
recorded as a load flake, like the known MT09 flake, rather than a defect of
this plan.

Remaining open: the real pi run on `status-badge-tone`, which waits for Dan's
go-ahead.

## Merge with Plan 9

`ramify-agent` at `9e89596`, which holds
[Plan 9: session model and transcripts](../09-session-model-and-transcripts/main-plan.md),
was merged into this branch as `67a812c`. Git reported conflicts in 18 files.
All of them were additive: both sides added events, snapshot counts, layout
entries, exposures, web areas, styles and tests, and each resolution keeps
both sides. The plans' prompt packages did not overlap, since Plan 9 changes
no prompt, so no version needed reconciling.

### Reconciliations

Conflicts resolved by keeping both sides:

- `RunSnapshot.counts` carries both `scenarios` and `degradedStarts`.
- `runLayout` has `scopeScenarios` beside `transcript` and `blobs`.
- `RunService` holds the review stop's `wake` beside the content store and
  the transcript writers.
- The projected-event ref kinds include both `scenario` and `session`.
- The root `module.ramify` re-exposes both plans' protocol symbols.
- The web Run page has both the Scenarios area and the Sessions timeline,
  and its comment names Approve and degraded starts.
- The stub client has both the scenario query and the session queries.

Semantic reconciliations, where the merge applied cleanly or conflicted
textually but had to be changed to keep both plans' behavior:

- **The initial analysis.** It is submitted as `initial-architect/2`,
  validated against the plan's scenarios, and its session is kept as the
  architect context.
- **`job.json` stays `ramify-agent.job/3`.** Plan 9 raised it from `/2`.
  Plan 10 added its project configuration, plan scenarios and review stop to
  the record without a version change. `/3` now holds both sides' fields, and
  the composition inventory names the union
  `record ramify-agent.job/3.projectConfig…`.
- **Session events in Plan 10's sequences.**
  - `review-stop`, `scenario-states` (withdrawal by exhaustion) and
    `work-items` now expect `session-opened` and `session-finished`.
  - At the review stop, the initial architect's session is suspended. A run
    stopped or interrupted there finishes that session before its terminal
    event: `run-ended` when it stops, `interrupted` on recovery. The
    `review-stop` tests now assert this.
  - An exhausted iteration's engineer session is finished with `work-closed`
    before the withdrawal.
- **Scenario data in Plan 9's scripted runs.** Each of these runs now has
  the "Scenarios of <plan>" commit and completion requests that declare
  their entry's scenarios (`declaringScenarios`):
  - the session scenario that `session-lifecycle`, `transcript-run`,
    `session-queries` and the session fixture share;
  - `neutral-actions`;
  - `placement`'s degraded start.

  The session fixture's live `status-badge-tone` run now gives its entry the
  plan's two scenarios verbatim, which form rule 3 requires since Plan 10's
  iteration 11.
- **Plan 9's port and data in Plan 10's tests.**
  - The review stop's timed port declares `support` in place of
    `observations`.
  - The write guard's denial test passes neutral write actions.
  - The session reducer's test gives `work-item-started` its `origin`.
- **Web fixtures.** The session-marks and timeline snapshots carry the
  scenario counts and `review`. Capability progress carries `scenarios`: a
  count for an entry, null otherwise.
- **Composition.** The inventory has 38 distinct crash boundaries: 33 at the
  base, 3 from Plan 10 and 2 from Plan 9. Recovery may append both
  `scenarios-materialized` and `session-finished`.
- **Documents.** The harness README describes both the scenario projections
  and the metrics' session grouping. The web README lists the scenarios and
  the run's sessions. `docs/README.md` lists both plans.

### Verification

Run from `ramify-agent/` before the merge commit:

- `npm run type-check` passed.
- `npm run check:self` passed with 0 errors, 0 warnings and 167 analysis
  limits.
- The 94 test files either plan touched, which include every conflicted
  file, were run in four batches. 92 files passed and 2 were skipped. 837
  tests passed and 7 were skipped.
- The three `composition-recovery*` files, `run-closing-order` and
  `progress-fixture` also passed.

The skipped tests are the opt-in real-toolchain variants:
`RAMIFY_AGENT_FIXTURE_ACCEPTANCE` for `acceptance-trial` and
`fixture-acceptance`, and the fixture trial selection for `fixture-trials`.
They were not run for the merge.

### Audits of `67a812c`

Both audits ran on the merge commit as HEAD, with a clean tree.

**The ramify-agent suite request:** overall `pass`, 176.6 s, audited
2026-09-23T15:49:33Z. Run ref `refs/audited/runs/2026-09-23T15-49-33Z-67a812c25`,
report commit `49b565d`.

| Check | Outcome |
| --- | --- |
| `patch-integrity` (`git diff --check HEAD^ HEAD`, against the first parent) | pass, no output |
| `agent-typecheck` | pass, 3.2 s |
| `agent-tests` | pass, 143.1 s. 150 files passed and 2 were skipped (`fixture-trials`, `fixture-acceptance`). 1,225 tests passed and 7 were skipped. |
| `agent-structure` (`check:self`) | pass, 12.5 s: 0 errors, 0 warnings, 167 analysis limits |
| `parent-daemon-test` | pass, 17.7 s, 1 test |

**The root cucumber-viz audit:** overall `PASS`, 3:15, full npm test mode.
Run ref `refs/audited/runs/2026-09-23T15-53-07Z-67a812c`, report commit
`9c27ffe`.

| Check | Outcome |
| --- | --- |
| static | pass: `worktree-dependencies` and `type-check` |
| regression | pass: 169 files, 2,260 tests |
| sealedFiles | pass, skipped because no check phase was given |

Both audits passed on the first run. Neither flaked, and no fix commit
followed.

The analysis-limit count rose from 122 before the merge to 167. Plan 9's
exposed session and transcript schemas added these limits: each is a
`signature-inferred` limit, like every other exposed schema.
