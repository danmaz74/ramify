# Iteration 5: explicit architect declarations results

**Date:** 2026-10-07. **Status:** iteration 5 source qualified by the
released `ramify-audit@0.7.2` normal audit of clean `5a5237f9`, after the
full audit of `e8155386` found two in-scope defects; branch push awaits
coordinator review. **Entry source:**
`421590b3` (clean). **Source commits** on
`feat/plan21-project-boundary-adoption`:

- `0714b845f3cb2f9de936d07f2e4a4d65948a4c28` (tree
  `cbc0e5b447d3d81c3b51222f3bbb44ac014937c1`): register obligations and
  record architect done reports;
- `e8155386527a5429ba09a354b4e6f8c5ca3a6103` (tree
  `58fefdd898d6183c03a1d2dadc3e89363b51670e`): explain obligation
  registrations and architect reports in the role procedures;
- `5a5237f9f01b5bb013d6778e50fdfac285597435` (tree
  `9bd1fe711038c9612ba330fc76cd953aa17f4c9b`): keep the scenario list served
  when an entry has no work item. This is the final audited source.

This is intermediate Plan 21 qualification work, not production enablement.
The provider pair is unchanged: exact `ramify.ts` 0.4.1 and `ramify-audit`
0.7.2. Run policy stays `run-policy/7`, which already names the complete
contract; no policy bump. No protected document was edited, nothing was
pushed by the implementation agent and iteration 6 was not started.

## Actual changes

**One obligation projection.** `work/obligations.ts` (harness) folds a
run's obligations from what the run already holds: the accepted analysis
scenario records (`sc-NNN`, responsible: the entry work item's local
architect, or `integration-scenario` until the integration work item
exists), each `capability-delegated` event (`cap-NNN`, responsible: the
capability task), and the two new accepted-submission events. There is no
second registry. Each obligation carries its kind (`scenario`, `outcome`,
`test`), responsible owner, status (`pending`, `bound`, `done`), report
revision, case or description, registration provenance and last report.
Scenario declarations, scenario states and gate or audit events move no
obligation. An entry scenario whose work item is not committed (which only
records the harness did not write can hold) has no responsible architect
and is no obligation; the projection does not fail on it.

**Frozen submission fields.** Every local architect action except
`yield-for-providers`, and every capability architect action, accepts the
two arrays of the iteration 0 contract, both defaulting to empty:

- `registrations[]`: `{ kind: "scenario", case }` (capability architect
  only: a use case of the task's current plan revision, ID
  `<task>.case.<case>`) or `{ kind: "test", description }` (ID `test-NNN`,
  allocated from the count of test registrations).
- `reports[]`: `{ id, judgment: "done" | "bound", basedOnRevision, where? }`.
  `where` is non-blank text of at most 300 characters.

Delegated work is tracked as its `cap-NNN` outcome by default. A preserved
example, an added plan case or an ordinary test registers nothing. Engineer
submissions have no such fields and are refused if they carry them.

**Frozen events.** Recorded with the accepted submission, before the
action's own effects, by `run/service.ts`:

- `obligation-registered`: `{ id, kind: scenario|test, responsible: {kind:
  work-item|capability-task, id}, by, submission, case? | description? }`.
- `obligation-reported`: `{ id, judgment, basedOnRevision, revision:
  basedOnRevision + 1, where?, by, submission }`.

`by` is the invocation and `submission` the SHA-256 that
`invocation-ended.data.submission` records. Replaying the same submission
identity records nothing twice.

**Checks, then trust.** The harness refuses, returning every error to the
same session before any effect: an unknown ID (`"sc-404" is no registered
obligation of this run`); a report by an actor that is not the responsible
architect, naming both (another work item's scenario, an integration
scenario whose work item does not exist yet, a local case registration, an
engineer); a report naming the same ID twice in one submission; a stale
`basedOnRevision`; `bound` on an obligation that is not `done`; a case that
is not in the current plan revision; a duplicate registration. A well-formed
authorized report is then recorded as written; the judgment is not compared
with any gate, test or audit result.

**`where` as text.** The hint is stored and shown verbatim, absent or naming
a nonexistent path. No path resolution, evidence record, runner matching or
completion condition reads it.

**Briefings, prompts and projections.** Local and capability architect
messages list the obligations the actor is responsible for, with status,
revision and last report (`# Registered obligations`). The local, local
capability and capability architect procedures explain registrations,
reports, revisions and `where`. The engineer procedures state that an
engineer's results report work, never an obligation's judgment. The
scenario list query (`scenarios/list`) carries `obligations[]` (at most
1000) beside the unchanged scenario states, with `registeredBy` and the
report's judgment, revisions, `where` (null when absent), invocation,
submission, sequence and time. The event projection references `sc-NNN`
reports as scenarios and `cap-NNN` reports as capability tasks.

**Old policy.** `run-policy/6` records are refused outright by the existing
iteration 3 boundary; no inspection path was added.

## Acceptance mapping

| Case | Evidence |
| --- | --- |
| PB3-D01 | `capability-submission.test.ts` unit and run tests: the default `cap-001` outcome needs no registration; a case of the current plan and a test register only on explicit choice; a local case registration and an unknown case are refused. `capability-records.test.ts` "PB3-D01 registers a case and a test through the real ledger…" keeps the original request, examples and plan revisions intact and refuses a malformed registration line. `local-architect-submission.test.ts`: the analysis scenarios and the delegated outcome are obligations without registration; a test registers only when submitted. |
| PB3-D02 | Wrong architect (other work item, integration scenario without its work item, engineer reports), unknown ID, duplicate report in one submission, stale revision and `bound` before `done` are refused in `local-architect-submission.test.ts` and `capability-submission.test.ts`, each with its path and message; the run tests show the refusal returning to the same session before any effect, then the corrected submission accepted. |
| PB3-D04 | The local run test records the registered test and two `done` reports with the accepted submission, before the completion's outline and gate, with `where` naming a nonexistent path kept verbatim and no such path created; one report omits `where`. The capability run test reports `done` during a `partial` action and revises it with `bound` on an `assign` that proceeds. `scenario-states.test.ts` and `scenario-projections.test.ts` show reports and scenario states/gates leaving each other unchanged, and the query carrying each obligation's report and `where`. `protocol-contract.test.ts` refuses a verdict field, a scenario state or a non-judgment on an obligation view. |
| PB3-D05 | `capability-records.test.ts` "PB3-D05 refuses an old-policy run holding scenario declarations and coverage records…": a `run-policy/6` run with `scenario-declared`/`scenario-implemented` events and an exercised coverage plan is skipped at recovery, `getRun`, `committed` and `scenarios/list` refuse it with "Run policy run-policy/6 is refused by run-policy/7; a fresh run is required", the run list reports it unserved, its files are unchanged and no Ramify call is made. |
| Protocol unions | `union-values.test.ts` covers both events. `composition.test.ts` names the producers of every new value (both run tests and the scenario-projection test). |

## Record projection (iteration 6 handoff)

- Obligation statuses move only through accepted `obligation-reported`
  events. `sc-NNN` still also has the old four-state `ScenarioState`
  (`pending`, `bound`, `declared`, `implemented`) driven by declarations and
  gates; the two are independent in this iteration. Iteration 6 removes the
  old states, adds bindings and `assignment.obligations`.
- The new events have no `afterWrite` hook: `RunWrite` does not list them,
  and nothing reacts to them yet.
- Iteration 8 owns the missing-report rejection and its recovery.

## Focused verification

All commands ran from `ramify-agent/` with the installed Vitest and explicit
files. No `npm test` or unrestricted `vitest run` was used.

```sh
./node_modules/.bin/vitest run --project node <23 files>
./node_modules/.bin/vitest run --project web subs/web/src/tests/client.test.ts subs/web/src/tests/run-page.test.tsx
npm run type-check
npm run check:self
```

At `5a5237f9`, the node files (the eight named by the brief and the
contract tests, `execution-map-projection` and fourteen submission,
projection, capability, run-protocol and hook regression files) passed
**324 tests in 23/23 files, 2 skipped** in 115.35 s
([log](../evidence/iteration5-architect-declarations/focused-final.log), which
lists the files). The two skips are the `runIf(installed)` real-toolchain
block of `acceptance-trial.test.ts`. The web files passed **45/45**
([log](../evidence/iteration5-architect-declarations/focused-web.log)).
`npm run type-check` exited 0 for all four compiler configurations
([log](../evidence/iteration5-architect-declarations/type-check.log)).
`npm run check:self` passed with 0 errors, 0 warnings and 320 nonblocking
analysis limits, over 12 owners, 586 source files, 56 resources and 11,736
accesses ([log](../evidence/iteration5-architect-declarations/check-self.log)).
The one limit beyond iteration 4's 319 is `signature-inferred` on the new
exposed `obligationViewSchema`, like the other protocol schemas.

## Delivery audits

Both attempts used the exact normal command from the repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

| Attempt | Source | Window (UTC) | Executed mode | Result |
| --- | --- | --- | --- | --- |
| 1 | `e8155386` | 21:39:58–21:56:14 | full (drift-cap fallback) | **fail**: 254/254 files, 2 failed |
| 2 | `5a5237f9` | 22:00:18–22:16:19 | ramify-partial (baseline `e8155386`, chain depth 1) | **pass**: 211/211 files, 0 failed |

Projections are in
[evidence/iteration5-architect-declarations](../evidence/iteration5-architect-declarations/)
(`delivery-attempt1.json`, `delivery-attempt2.json`). The raw JSON is in
`/tmp/pb3-it5-audit.json` and `/tmp/pb3-it5-audit2.json`, with each SHA-256
recorded in its projection.

**Attempt 1** took 976 s (975.567 s producer), CLI exit 1. Request
`fee12d53-2e59-4911-abfd-831303e9447d`, run
`199c5d18-af7a-48eb-b379-6d98912bb06c`, report
`04c452035226e28aec0fd62e84bd4797c1453165`. It requested `ramify-partial`
(defaulted) and **executed `full`**: "drift-cap: 35 distinct paths selected a
module since the full audit at 1f920462 (limit 25)". agent-structure,
agent-typecheck, agent-web-build and patch-integrity passed; agent-tests
failed. Files: 250 passed, 2 failed, 2 skipped of 254, expected 254, run 254,
`complete`. Tests: 2,043 passed, 2 failed, 6 skipped. The complete ledger
has two entries, both caused by this iteration:

- `execution-map-projection.test.ts` "targets ordered gate history for a
  scenario beyond the capped list": its constructed run holds scenarios
  without work items, and the obligation projection threw, failing the
  scenario list.
- `subs/web/src/tests/client.test.ts` "reads the scenario list at its path
  and validates it": its answer lacked the new required `obligations`.

`5a5237f9` fixes the projection (no obligation, no failure) with a
`scenario-states.test.ts` witness, and adds `obligations: []` to the web
answer. No test was weakened.

**Attempt 2** ran on clean `5a5237f9` and is the final source result. It
took 961 s (959.725 s producer), CLI exit 0. Request
`321b4f92-bc03-418e-96d0-2a8a2cb3e0e8`, run
`92d033f8-43de-4e4f-bd71-680466f837dd`, report
`5ffe3b22aad046af71217c35692fee24e92cfa9c`. It **requested `ramify-partial`
(defaulted) and executed `ramify-partial`**, linked to attempt 1's full
report `04c45203` at chain depth 1. The ownership answer came from installed
`ramify.ts` 0.4.1 (`ramify.affected-cli/4`). The changed paths were the
three fix files. The selection was five modules (root, harness, agent/pi,
audit, web) and all five checks. agent-structure 17.8 s, agent-tests
922.8 s, agent-typecheck 5.7 s, agent-web-build 0.6 s and patch-integrity
0.005 s all passed. Expected files were 211, run 211, `complete`. Files:
209 passed, 0 failed, 2 skipped. Tests: 1,668 passed, 0 failed, 6 skipped.
The skipped files are the opt-in `fixture-acceptance` and `fixture-trials`
suites; skips are unrun, not passes. Both carried failures were rerun and
passed. The ledger is complete with zero entries. Scoped composition is
`pass` with zero outstanding failures, rooted at `04c45203`. No flaky test
was observed.

## Limitations

- Obligation status and the old `ScenarioState` coexist for `sc-NNN` until
  iteration 6.
- The browser renders no obligations yet; `subs/web` only gained the new
  required field in its test fixtures.
- The paid Plan 13 probe and the opt-in fixture acceptance/trial suites were
  not run.
- This receipt commit is documentation only. The audits checked source
  `e8155386` and `5a5237f9`, not the receipt commit.

## Protected-file comparison

The baseline taken at entry `421590b3` lists the 16 tracked
`.principles.md`/`.spec.md` files, which are exactly the tracked set at
`5a5237f9`. Before the receipt commit, all 16 match the baseline in HEAD, the
index and the worktree. No protected path is staged, unstaged, untracked or
renamed, and no protected file changed in any commit since entry
([comparison](../evidence/iteration5-architect-declarations/protected-comparison.json)). The
coordinator repeats the comparison at the receipt HEAD.

The protected-wording proposal records two authorized `harness.spec.md`
patches for this iteration (the outcome-protocol sentence "it does not claim
that implementation is accepted" near line 110, and the verification
paragraph). Under the coordinator's rule for this execution they were **not
applied**; they remain pending authorized patches, and `harness.spec.md`
keeps SHA-256 `f3635d7e…48bc`.

## Next-iteration prerequisites

Iteration 6 (scenario responsibilities) may start after the coordinator
reviews this receipt, applies or schedules the two pending `harness.spec.md`
patches, and pushes the branch, verifying `HEAD ==
origin/feat/plan21-project-boundary-adoption` on the live remote. It builds
on `run-policy/7`, the exact `ramify.ts` 0.4.1 / `ramify-audit` 0.7.2 pair,
the frozen fields and events above and the single obligation projection.
