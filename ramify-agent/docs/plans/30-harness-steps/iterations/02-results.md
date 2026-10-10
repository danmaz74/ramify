# Iteration 2 results: local architect and reviewer step constructors

[Iteration](02-architect-reviewer-constructors.md) · [Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Commits

On `feat/plan30-harness-steps`, after `6e9696c4`:

- `c43caa5e` feat(agent): construct local architect and reviewer steps from their inputs
- `0bf8a2c2` test(agent): refuse capability qualification turns as outside the first step set
- this results file, in the commit that follows them

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

## Checks

Run from `ramify-agent/`:

| Check | Outcome |
| --- | --- |
| `npm run test:quick --` with 26 files: `context-selection{,-delivery,-runtime,-submissions}`, `iteration-source-delivery`, `iterations-integration`, `iterations`, `local-architect-submission`, `plan23-real-run-corrections`, `plan23-task-prompts`, `plan25-task-packets`, `review-{attempts,diff-delivery,lifecycle,questions,queue,scheduling,signals,stop}`, `review-snapshot.integration`, `steps-{authored,from-run,inputs}`, the reviews child's `review-diff-payload` and `review-tools`, and `src/tests/cli.test.ts` | 24 files, 282 tests passed. `iterations-integration` and `review-snapshot.integration` are registered boundaries, which `test:quick` does not run. |
| `npm run test:quick -- subs/harness/src/tests/plan25-task-packets.test.ts`, after the second commit | 36 passed. The file also passed 5 times in a row after the race fix described below. |
| `npm run type-check` | passed |
| `npm run check:self` | passed: 0 errors, 0 warnings. No analysis limit names `steps/`. |

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
- `step inputs` with authored files and no run exits 2. It lists the
  context each authored file needs.

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
   `src/main.ts` is unchanged.
6. **Casts.** `run/service.ts` casts the selector and work-turn input
   objects (`as SelectorStepInputs`, `as unknown as WorkTurnStepInputs`).
   TypeScript does not narrow their start unions, and the work-turn type has
   readonly mismatches. Validation runs before construction regardless.
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
  runs without `--from-run`. The code refuses it with exit 2 and lists the
  missing context. The plan also requires that missing context be refused
  without defaults, and a run is the only source of that context.
- **`--work-item` on the engineer.** In the plan's example, `--work-item` is
  given to the engineer. In the code, `--work-item` and `--outline` replace
  part of a local architect's inputs, `--selection` replaces part of a work
  turn's, and `--assignment` replaces part of an engineer's.
- **Reviews child tests.** The plan asks to extend the reviews child's tests
  for the review constructors. The constructors live in the harness, so the
  equality tests live there too.
