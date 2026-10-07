# Iteration 6: architect-owned acceptance scenario state results

**Date:** 2026-10-07. **Status:** iteration 6 source qualified by the
`ramify-audit@0.7.2` normal audit of clean `5f18be0d`, which executed in full
mode and passed; branch push awaits coordinator review. **Entry source:**
`a9f3181c` (clean). **Source commits** on
`feat/plan21-project-boundary-adoption`:

- `bef5a7028909ac8cb33e8bcba9d6a26cf4b843fd` (tree
  `b980b3317ad9ead0df8922d7e36b184f5881cce2`): bind assigned obligations and
  let architects report scenarios done;
- `65eb717958c8bd43935b43fbb616a11aae612dd5` (tree
  `ae1e6072623ccd688df766160f577d0ed80df8d7`): show pending, bound and done
  scenarios in the web;
- `5f18be0da2e2bb2bfa7f0c4fa21595c225deaef5` (tree
  `4fe65a919ed4fa1bd5ef291597f0159f25ab6648`): describe bindings and
  architect-owned scenario state in the prompts, READMEs, architecture and
  glossary. This is the final audited source.

This is intermediate Plan 21 qualification work, not production enablement.
The provider pair is unchanged: exact `ramify.ts` 0.4.1 and `ramify-audit`
0.7.2. Run policy stays `run-policy/7`; no policy bump. No protected document
was edited, nothing was pushed by the implementation agent and iteration 7
was not started.

## Actual changes

**One fold, three states.** A tracked scenario's state is its obligation
status, `pending`, `bound` or `done`, folded by `work/obligations.ts` from
`obligation-registered`, the new `obligation-bound` and
`obligation-reported`. The scenarios child's `states.ts` reduces the same two
accepted-submission events. `declared`, `implemented`, `scenario-declared`,
`scenario-due`, `scenario-implemented`, `scenario-bound-passed`,
`scenarios-withdrawing`, `scenario-withdrawn`, `work/declarations.ts`, the
open-requirement derivation and the withdrawal commit are removed. The
snapshot counts are `{ pending, bound, done }` and capability progress counts
`{ done, total }`.

**Assignments and bindings.** Local and capability assignments carry
`assignment.obligations` (replacing `assignment.scenarios`); the judge
accepts only obligations the assigning architect is responsible for. A
capability assignment names only `cap`, case and test obligations, and the
capability engineer receives no entry-scenario briefing. An engineer's
`completion-proposed` carries `bindings: { id, fakes }[]` and must bind every
assigned ID exactly once. An incomplete proposal is rejected under the
per-turn bound with "The assignment names sc-001, which this proposal does not
bind. Bind every assigned obligation, with the fakes its binding relies on, or
report "partial" with what is unfinished", before any commit, audit or
review; `partial` reports are exempt. An accepted binding is recorded as
`obligation-bound { id, fakes, by, submission }` before the iteration gate,
idempotent by `by` and `submission`: `pending` becomes `bound`, a `done`
obligation stays `done` with the new list, and the report revision does not
move. The architect's briefing and the scenario list show each binding's
fakes with its invocation and submission.

**Pending tag.** It is rendered only for `pending` at
`gate-committing`, materialization and rewording, so it comes off at the
binding's or done report's next commit. No audit outcome, yield, exhaustion
or placement request restores it.

**No result matching.** `recordScenarioPasses`, `finalScenarioGaps` and the
post-gate unverified block are gone. A passing gate leaves a bound scenario
`bound`; a failing gate, a repair exit or a source edit leaves `done` as it
is. Completion is refused while a scenario of the work item is not reported
done ("sc-001 is bound and not reported done: report it done in `reports`
where its binding holds, or assign the work that finishes it"); iteration 8
replaces this refusal with the general rejected submission. A passing final
gate completes the run with its scenario results recorded as raw evidence;
`acceptance-incomplete` before it still requires every tracked scenario
`done`.

**Integration.** An integration work item is due when every sub-scenario is
`done`, from the done reports alone; `recordObligations` commits it with the
`obligation-reported` that reports the last one. A `bound` sub-scenario is
not enough. The composition-failure and bridging-Given diagnoses
(`scenarios/src/composition.ts`) and their briefing lines are removed; a
failing gate's raw diagnostics reach the engineer and architect without an
inferred cause.

**Retained until later iterations.** The CheckFinding scenario producer
(test-health raw failures), the `scenario-report` identity tags,
`passedScenarioLines`, the harness scenario check and `run_scope_tests` with
its scenario selection (a work item's pending scenarios, or the pending ones
a capability assignment names) remain until iteration 9.

**Prompts, projections and documents.** The engineer, local architect,
capability architect, capability engineer and global fork procedures and the
engineer system prompts describe bindings, fakes, the architect's done
report and raw results; assigned obligations are binding, no longer
informative. The web run page, scenario list, execution map and capability
graph show the three states. The harness and scenarios READMEs,
`docs/architecture/acceptance-scenarios.md`,
`docs/architecture/autonomous-implementation-loop.md` and the glossary's
pending-tag entry follow.

## Acceptance mapping

| Case | Evidence |
| --- | --- |
| PB3-D03 | `scenario-states.test.ts` "an iteration whose gate passes leaves the scenario bound: completion is refused until the architect reports it done, and the binding's fakes are shown to it"; "a done report over a binding's fakes survives a failing gate, the iteration's repair exit and its source edit"; "only the architect's revision moves done back to bound; a rebinding of done with no fakes leaves it done"; "a done scenario that fails a later gate fails that gate, and stays done"; "a passing final gate completes the run whatever its scenario check reported: the results are raw evidence, never matched to the states". `scenario-findings-run.test.ts` keeps the CheckFinding verdicts with the scenario `bound` until the report. |
| PB3-D06 | `scenario-states.test.ts` "a binding makes a scenario bound and takes its tag off before the gate that selects it; a done report finishes it, directly from pending too; the final gate runs every scenario in full mode" and the revision test (a revision never restores the tag); `scenarios/src/tests/states.test.ts` "is carried only while a scenario is pending; it comes off at bound and at a direct done"; `acceptance-trial.test.ts` asserts that no `Withdraw` commit exists. |
| PB3-D07 | `integration-scenarios.test.ts` "PB3-D07 created by the last sub-scenario's done report and not before, at the common ancestor, queued, briefed, bound at the ancestor, reported done by its architect, and completed"; "PB3-D07 the integration scenario fails while its sub-scenarios pass: the repair round is given the raw failure and every result, with no composition diagnosis, and resolves it"; "PB3-D07 an integration scenario is due once every sub-scenario is done and it has no work item yet; bound is not enough; its item is at its owner". `integration-scenarios-integration.test.ts` runs it against installed Ramify. |
| PB3-D11 | `scenario-states.test.ts` "a proposal that leaves out an assigned scenario is rejected naming it, before any commit or gate; the complete proposal that follows is accepted"; "a partial report under the same assignment is accepted without a binding, and the architect may report the scenario done directly"; "the structural check: unassigned, repeated and missing IDs, and a repeated fake". |
| PB3-D12 | `scenario-states.test.ts` "PB3-D12 the binding projection: bind with fakes, a done report over them, a rebinding of done with none, the revision and the last report" and "PB3-D12 a replayed binding is recorded once, and no declared, implemented, due or withdrawal event remains"; `scenarios/src/tests/states.test.ts` transition table; `scenario-projections.test.ts` "PB3-D04 the list carries each obligation with its responsible owner, its binding's fakes, its architect report and its where text, and the scenario states are its statuses"; `acceptance-trial.test.ts` binds over a contract fake (`createNoteLimitFake`), rebinds without it and reports done. |
| Protocol unions | `union-values.test.ts` lists `obligation-bound` and none of the removed events; `composition.test.ts` names `scenario-states.test.ts` as the producer of `obligation-bound` and drops the removed values. |

## Focused verification

All commands ran from `ramify-agent/` with the installed Vitest and explicit
files. No `npm test` or unrestricted `vitest run` was used.

- At HEAD `5f18be0d`, twenty files (composition and its three recovery
  tables, the scenario state, briefing, check, projection, findings and
  integration suites, the acceptance trial, both submission suites,
  materialization, protocol contract and union values) passed **289 tests in
  20/20 files, 2 skipped**
  ([log](../evidence/iteration6-scenario-responsibilities/focused-composition.log)).
  The skips are the `runIf(installed)` real-toolchain block of
  `acceptance-trial.test.ts`.
- Before the commits, 42 harness and scenario-child files passed 394 tests,
  2 skipped (`fixture-trials` is opt-in)
  ([log](../evidence/iteration6-scenario-responsibilities/focused-harness.log));
  the two submission suites passed 41/41
  ([log](../evidence/iteration6-scenario-responsibilities/focused-submissions.log));
  ten web files passed 128/128
  ([log](../evidence/iteration6-scenario-responsibilities/focused-web.log)).
- `npm run type-check` exited 0 for all four compiler configurations
  ([log](../evidence/iteration6-scenario-responsibilities/type-check.log)).
- `npm run check:self` passed with 0 errors, 0 warnings and 316 nonblocking
  analysis limits over 12 owners, 583 source files, 56 resources and 11,698
  accesses ([log](../evidence/iteration6-scenario-responsibilities/check-self.log)).
  The four fewer limits than iteration 5 are the removed composition and
  declaration exports.

## Delivery audit

From the repository root on clean `5f18be0d`:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json
```

| Source | Window (UTC) | Requested mode | Executed mode | Result |
| --- | --- | --- | --- | --- |
| `5f18be0d` | 23:32:51–23:49:31 | ramify-partial (defaulted) | full (drift-cap fallback) | **pass**: 251/253 files, 0 failed |

The projection is
[delivery-audit.json](../evidence/iteration6-scenario-responsibilities/delivery-audit.json);
the raw JSON is `/tmp/pb3-it6-audit.json` with its SHA-256 recorded there.
The audit took 999.4 s, CLI exit 0, status `completed`, `overall: pass`.
Request `a1e36ddf-43b9-4127-a175-f9ca0269fafc`, run
`7793e658-7e73-49e0-a480-6130a73bb2fd`, report
`6654b7d8bf85963fba53f6101919bfba09a3f6b6`. It executed `full`: "drift-cap:
75 distinct paths selected a module since the full audit at e8155386 (limit
25)". agent-structure (17.4 s), agent-tests (964.0 s), agent-typecheck
(5.7 s), agent-web-build (0.6 s) and patch-integrity all passed. Expected
files 253, run 253, `complete`. Files: 251 passed, 0 failed, 2 skipped (the
opt-in `fixture-acceptance` and `fixture-trials`; skips are unrun, not
passes). Tests: 2,030 passed, 0 failed, 6 skipped. The failure ledger is
complete with zero entries; composition `pass`, unscoped, zero outstanding
failures. No lock wait, cancellation or skipped required command. No flaky
test was observed, and no fix was needed after the audit.

## Deviations and limitations

- `run_scope_tests` keeps selecting a local work item's pending scenarios as
  before (and only the assigned ones for a capability task); the first draft
  narrowed it to assigned IDs, which changed the composed runs' stated
  commands, so the existing selection was restored until iteration 9.
- The completion refusal for scenarios not reported done is interim;
  iteration 8 replaces it with the general rejected submission.
- `capability-records.test.ts` keeps `scenario-declared` and
  `scenario-implemented` lines on purpose: they are the refused
  `run-policy/6` fixture of PB3-D05.
- The paid Plan 13 probe and the opt-in fixture acceptance/trial suites were
  not run.
- This receipt commit is documentation only. The audit checked source
  `5f18be0d`, not the receipt commit.

## Protected-file comparison

The baseline taken at entry `a9f3181c` lists the 16 tracked
`.principles.md`/`.spec.md` files, which are exactly the tracked set at
`5f18be0d`. Before the receipt commit, all 16 match the baseline in HEAD, the
index and the worktree; no protected path is staged, unstaged, untracked or
renamed, and none changed in any commit since entry
([comparison](../evidence/iteration6-scenario-responsibilities/protected-comparison.json)).
The two pending authorized `harness.spec.md` patches remain the
coordinator's and were not applied.

## Next-iteration prerequisites

Iteration 7 (delegation handback) may start after the coordinator reviews
this receipt, applies or schedules the pending `harness.spec.md` patches and
pushes the branch, verifying `HEAD == origin/feat/plan21-project-boundary-adoption`
on the live remote. It builds on `run-policy/7`, the exact `ramify.ts` 0.4.1
/ `ramify-audit` 0.7.2 pair, `assignment.obligations`,
`completion-proposed.bindings`, `obligation-bound` and the single obligation
fold with scenario states as its statuses.
