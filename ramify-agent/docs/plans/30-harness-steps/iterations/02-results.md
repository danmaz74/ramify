# Iteration 2 results: local architect and reviewer step constructors

[Iteration](02-architect-reviewer-constructors.md) · [Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Commits

On `feat/plan30-harness-steps`, after `6e9696c4`:

- `c43caa5e` feat(agent): construct local architect and reviewer steps from their inputs
- `0bf8a2c2` test(agent): refuse capability qualification turns as outside the first step set
- `7f0bf76c` the first version of this results file
- `6c536f49` feat(agent): author engineer inputs with no run
- this revision of the results file, in the commit that follows it

## What changed

- `steps/inputs.ts` adds `StepInputs` members, selected by role, then by
  `phase` or `question`, then by `start.kind`:
  - local architect `orientation` (fresh);
  - `context-selector` selection (fresh, or a fork of the orientation point);
  - local architect `work-turn` (fresh or continued);
  - reviewer `code`, `scope` and `design` (fresh, or a fork with its reason
    and briefs);
  - reviewer `design-orientation` (fresh). It is its own invocation and its
    own step.
- `steps/constructed.ts` holds the members every constructed step shares,
  which `render` reads without knowing the role.
- `steps/local-architect.ts` builds the orientation, the selector and the
  work turn. `judgeWorkTurn` is the work turn's validator: the historical
  workflow check, `validateLocalArchitect` and `checkWriteScope`, applied to
  the evidence the inputs captured.
- `steps/reviewer.ts` builds the reviews and the design orientation. It
  composes them from what the reviews child exposes: `reviewMessage` with
  `ReviewMessageInputs`, `orientationMessage`, and `snapshotToolDeclarations`.
- `steps/construct.ts` dispatches `constructStep` and holds `freshFallback`.
- `run/service.ts` builds each invocation from those constructors in four
  places, and the inline construction there was removed:
  - `orientAndSelectWorkContext` and `selectElements`;
  - the work turn in `takeWorkItem`;
  - `runReviewAttempt`;
  - `orient`.

  `InvocationRequest.fallback` rebuilds a lost continuation or fork as fresh,
  degraded inputs. The review preparation (`prepareReview`) still runs in the
  run, which holds the candidate.
- `steps/authored.ts`, `steps/from-run.ts`, `steps/command.ts` and
  `src/cli.ts`:
  - `step inputs` takes `--work-item`, `--outline`, `--assignment`,
    `--selection` and `--review-request` on top of a `--from-run` import.
  - Each file is judged as its producing role's output, with the context the
    run recorded.
  - `from-run` imports all four roles. It refuses an invocation whose
    submission no constructor builds.

## Engineer inputs authored with no run

This correction followed review of the first version.
`step inputs --role engineer --project <root> --work-item <file> [--outline <file>] --assignment <file> [--out <file>]`
needs no `--from-run`. It is implemented by `authorEngineerInputs` in `steps/authoring.ts`:

1. **Parsing.**
   - The work item is parsed with `workItemSchema`. Its id is the author's.
   - A `--outline` file is a full `WorkItemOutline` record of that work item,
     at revision 1.
   - The assignment is checked against the local architect's submission
     schema and must be an `assign` envelope.
2. **Project context**, read as a run reads it at its start:
   - The existing `.ramify-architect` view is read with `loadArchitectIndex`.
     If it is missing or unreadable, the command refuses with the reason. It
     never materializes the view and takes no lock.
   - The provider's answers come through the Ramify port. The `materialize`
     call that `apiViewsOf` and `iterationApiViews` make is answered without
     materializing, so the existing API views are read and their revision is
     verified against the architect view.
   - The committed audit configuration at `currentHead` is parsed as the run
     record keeps it.
   - The policy is `withProjectTimeouts(defaultRunPolicy(...))` and must be
     the capability policy.
   - Prompt packages use the capability workflow.
3. **Work turn.** The local architect's first work turn of the item is built
   as the run builds it:
   - `run: null`, attempt 1, fresh;
   - no prior iteration, finding, selection, hypothesis, registry entry or
     decision;
   - obligations from `obligationsOf` over the work item alone;
   - guarded paths from `captureGuardedFiles`;
   - default write scopes, known facts and view identity from
     `run/project-facts.ts`, the same functions the run now calls.

   The turn is validated with `validateWorkTurnInputs`, and constructed once
   as a check.
4. **Judgment.** `judgeWorkTurn` judges the envelope against that turn.
5. **Acceptance**, as `assignIteration` accepts:
   - The envelope's outline becomes the next outline revision.
   - Authorizations are resolved into the scope.
   - `iterationAssignmentOf` builds the assignment, with id
     `iterationId(item.id, 1)`, preparation paths from the committed audit
     configuration, and the gate and test policy computed from the body.
6. **Engineer inputs.** They come from `engineerStepInputsOf`, the function
   the run's `engineerStepInputs` now calls:
   - the working directory is resolved by `assignedSourceDirectory`, which
     creates nothing;
   - the API views, owned test areas, entry scenarios over empty records,
     focused Cucumber preparation, starting points at HEAD, known facts,
     protected files and bounds are computed the same way as in a run.

Deviation 1 applies only to the `--from-run` editing path. Without a run,
an assignment may set any kind, scope, obligations, bounds or authorizations
that the local architect's rules accept.

**Handoff to iteration 3.** The engineer inputs carry
`provenance: { origin: 'authored', authored, workItem, outlines }`, with the
assignment in `inputs.assignment`. `run` is `null`. Iteration 3's `run` must
persist the work item, the outline revisions and the assignment as records
before the engineer starts, and give the inputs a run identity.
`render` falls back to fresh for a non-fresh start with no run, and `from-run`
refuses recorded inputs that name no run.

**Casts replaced.** `run/service.ts` no longer casts the review, selector or
work-turn inputs. It builds each with `validateReviewInputs`,
`validateSelectorInputs` or `validateWorkTurnInputs`, which parse the value
against that member's schema. The only remaining `as unknown` is the
orientation's starting-point group, which is cloned through JSON, typed
`unknown` and then parsed. Deviation 6 below no longer applies.

## Checks

Run from `ramify-agent/`:

| Check | Outcome |
| --- | --- |
| `npm run test:quick --` with 26 files: `context-selection{,-delivery,-runtime,-submissions}`, `iteration-source-delivery`, `iterations-integration`, `iterations`, `local-architect-submission`, `plan23-real-run-corrections`, `plan23-task-prompts`, `plan25-task-packets`, `review-{attempts,diff-delivery,lifecycle,questions,queue,scheduling,signals,stop}`, `review-snapshot.integration`, `steps-{authored,from-run,inputs}`, the reviews child's `review-diff-payload` and `review-tools`, and `src/tests/cli.test.ts` | 24 files, 282 tests passed. `iterations-integration` and `review-snapshot.integration` are registered boundaries, which `test:quick` does not run. |
| `npm run test:quick -- subs/harness/src/tests/plan25-task-packets.test.ts`, after the second commit | 36 passed. The file also passed 5 times in a row after the race fix described below. |
| `npm run type-check` | passed |
| `npm run check:self` | passed: 0 errors, 0 warnings. No analysis limit names `steps/`. |
| After `6c536f49`: `npm run test:quick --` with 29 files. These are the 21 from the first batch that `test:quick` runs (the reviews child files excepted), plus `engineer-api-preparation`, `work-item-api-views`, `engineer-directory`, `engineer-briefing`, `iteration-gate`, `capability-delegation`, `gate-diagnostics` and `nonfunctional-phase`. `src/tests/cli.test.ts` is also included. | 29 files, 319 tests passed |
| After `6c536f49`: `npm run type-check` | passed |
| After `6c536f49`: `npm run check:self` | passed: 0 errors, 0 warnings, 341 analysis limits, none in the changed files |

No full suite and no ramify-audit were run, as the plan instructs.

## Acceptance mapping

| Case | Tests |
| --- | --- |
| S05 | `plan23-task-prompts.test.ts`, "S05 …", over the repair run, and `plan25-task-packets.test.ts`, "S05 …", over the capability revision flow. Every orientation, selection and work turn renders equal to its delivered packet and declarations. This includes `context-selector/selection/fork` and `local-architect/work-turn/continued`. |
| S06 | `review-questions.test.ts`, first test. It checks that every variant is constructed, with no unconstructed or undelivered invocation, and that the variants include `reviewer/code/fresh`, `reviewer/scope/fork`, `reviewer/design/fork` and `reviewer/design-orientation/fresh`. Every packet and declaration list is equal. A review declares only the snapshot tools and its submission, with no built-in. Each design orientation is its own invocation, equal to the run's orientation events. |
| S07 | `steps-authored.test.ts`. See the summary below the table. |
| S08 | See the summary below the table. |

S07 tests:

- A valid assign envelope with a new goal yields engineer inputs that
  render that goal, with `provenance.authored: ['assignment']`.
- Each of the following is refused with the reason:
  - a schema-invalid envelope (schema errors);
  - a rule-invalid envelope (an unknown cited element);
  - a changed `kind`;
  - an assignment given to a local architect;
  - another work item, or an invalid one;
  - an invalid selection, or a selection given to an orientation;
  - an outline of another work item;
  - unreadable JSON.
- A work item with new text, and an empty selection, are accepted.
- With no run, an authored work item and assign envelope over a fixture
  project yield engineer inputs. The fixture has a materialized view, a
  scripted Ramify and Git, and the passing scripted audit configuration. The
  inputs have `run: null` and `provenance.origin: 'authored'`, and
  `step render` renders their goal. Nothing is materialized.
- A `--outline` record is accepted as the basis of an envelope without an
  outline.
- Each of the following is refused with the reason:
  - a missing view;
  - a work item that cites plan elements;
  - cited elements;
  - local decisions;
  - an unknown scope module (by the rules);
  - a missing outline (by the rules).
- `step inputs` with files that need a run, given without one, exits 2. It
  lists what is missing.

S08 tests:

- `steps-from-run.test.ts`, "S08 …":
  - The orientation, the selector fork and the continued work turn import
    `equal`, `start: fresh`, with the original start and point as
    provenance, and render fresh with the full briefing.
  - `initial-architect` is refused.
  - An orientation with a non-fresh start is refused with
    `start.kind: expected one of "fresh"`.
- `review-questions.test.ts` imports every reviewer invocation the same way.
- `plan25-task-packets.test.ts` checks that capability qualification turns
  are refused as "outside the first set".

## Deviations

1. **Authored assignment limits.** An authored assignment is judged by
   `judgeWorkTurn` against the evidence of the work turn that assigned the
   recorded iteration. Some fields must equal the recorded assignment, because
   the engineer inputs derive their gate, test policy, focused command and
   protected files from them, and those records cannot derive them again:
   - `kind`;
   - `scope.base` and `scope.extra`;
   - `citedElements`;
   - `obligations`;
   - the authorization paths;
   - `bounds`.

   The recomputed test policy must also equal the recorded one. Local
   decisions are refused, because only a run commits them. An outline in the
   envelope is allowed and judged.
2. **Work-turn evidence is captured at turn start.** The validator's
   evidence is recorded in the inputs when the turn starts, so that a render
   can judge it from the records alone. The run used to compute it at
   validation time. The evidence includes the registry, hypotheses,
   decisions, open requirements, obligations, guarded paths, view and scope
   revision. Nothing else writes these during a turn.
3. **Reviewer discovery** is captured as the rendered starting-points
   section text, not as structured points.
4. **Fresh fallback rebuilt.** For the new roles, a lost continued or forked
   session now retries with fresh inputs marked `degraded`, not the same
   request. The engineer keeps iteration 1's behavior (deviation 4 there).
5. **Option type inlined.** `StepCommandOptions.authored` is an inline type,
   so the harness's exposure of `StepCommandOptions` needs no new companion.
   `src/main.ts` is unchanged. The authoring ports are not in the options.
   Tests pass them through the internal `runStepCommandWith`, and the root
   uses the installed ones.
10. **Things refused without a run.** Each of these is refused with its
    reason:
    - Plan elements. A work item with non-empty requirement, acceptance or
      context refs is refused, and so is an assignment with `citedElements`,
      because no run means no frozen catalog or package. The turn's
      `requirements` is therefore `[]`.
    - Local decisions, because a run commits them as records.
    - A `revisesContract`, because no run has registered a contract.
11. **Authored outline invocation.** An outline revision built from the
    envelope names the invocation `authored`, with `hypothesesSeen: []`.
12. **No working directory is created.** The engineer's working directory
    is resolved without creating it. Its scratch directory and focused
    Cucumber preparation are not created either. The run creates them when
    it starts the engineer.
6. **Casts.** Superseded by `6c536f49`: the inputs are now parsed with
   `validate*Inputs`.
7. **Unused imports.** `run/service.ts` lost only the imports this iteration
   made unused. Imports that were already unused were left alone.
8. **Reviews child tests.** These were not extended. The constructors are
   harness-owned, so their equality is enforced in `review-questions.test.ts`.
9. **Undelivered invocations.** `helpers/step-equality.ts` `stepDeliveries`
   now lists invocations that recorded inputs but no delivery, instead of
   throwing. The capability flow stops its run mid-work: one S05 run in
   three failed because an invocation stopped before its session started.
   That test now accepts only `stopped` or unended undelivered invocations.
   The other S05 and S06 tests require none.

## Open issues

- **Flaky test.** `plan23-real-run-corrections.test.ts`, "three overlapping
  same-name shell calls retain their original guard IDs", failed once in an
  earlier broad batch, with the order 1, 3, 2. It passed 3 times in
  isolation, and it passed in the final batch. This is the same flake
  iteration 1 recorded.
- **Capability qualification.** Qualification turns
  (`submit_capability_qualification`) are local architect invocations that
  the run still builds inline. They are outside this iteration's set and are
  refused on import.
- **Untested acceptance paths.**
  - An accepted `--review-request` and an accepted `--outline` have no test,
    since the repair run has no reviews. Only the outline refusal is tested.
  - An accepted non-empty `--selection` has no test.
  - The boundary-registered integration files were not run.

## Plan text against the code

- **Authored example.** The plan's example
  `step inputs --role engineer --work-item wi.json --assignment assignment.json`
  runs without a run once `--project <root>` is added. That option names the
  project whose view, provider and committed audit configuration judge the
  assignment.
- **`--work-item` on the engineer.** Without a run, `--work-item` and
  `--outline` are given to the engineer, as in the plan's example. With
  `--from-run`, `--work-item` and `--outline` replace part of a local
  architect's inputs, `--selection` replaces part of a work turn's, and
  `--assignment` replaces part of an engineer's.
- **Reviews child tests.** The plan asks to extend the reviews child's tests
  for the review constructors. The constructors live in the harness, so the
  equality tests live there too.
