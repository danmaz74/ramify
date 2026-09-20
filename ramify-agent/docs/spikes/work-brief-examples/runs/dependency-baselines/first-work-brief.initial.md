# First work brief: dependency comparison presentation

You are the first scoped implementation agent for the dependency-baselines work. Work only in the existing `ramify/presentation/project-view` owner beneath `subs/presentation/subs/project-view/src/`. Do not change `module.ramify`, another module, a cross-owner contract or generated `.ramify` content. Do not implement persistence, analysis, daemon or service behavior.

## Work-item goal

Present an already-computed dependency comparison in the browser so a person can distinguish and inspect added, removed and changed modules and directed relationships. Historical and current evidence, scope, identities and uncertainty must remain clear. This is one browser-presentation work item within a larger feature that also requires terminal, explorer workflow, service, daemon, project acquisition and analysis work.

## This iteration

Implement the smallest meaningful pure presentation slice: a focused comparison summary and selectable change detail from supplied comparison data. Establish new executable component evidence for it. The implementation may define private, module-local presentation types or a test adapter needed to render the cases, but must not expose or present them as the agreed service API. Record the data the eventual provider must supply.

Read these existing files first:

- `CLAUDE.md` for Ramify ownership, model, testing and writing rules.
- `subs/presentation/subs/project-view/README.md` and `module.ramify` for this owner's existing responsibility and boundary. The declaration is read-only in this iteration.
- `subs/presentation/subs/project-view/src/ProjectExplorerView.tsx` for the current selection/detail, coverage, unavailable and stale presentation language.
- `subs/presentation/subs/project-view/src/interfaces/dependency-view.ts` and `interfaces/project-view.ts` for existing dependency counts, classifications, evidence, module IDs, revisions and coverage. Preserve their meaning.
- `subs/presentation/subs/project-view/src/tests/ProjectExplorerView.test.tsx` and `src/tests/dependency-fixtures.ts` for local test and fixture conventions.
- `subs/presentation/subs/project-view/src/.ramify/_meta.json` and `src/.ramify/external/subs/analysis/src/interfaces/dependency-diagram.ts.md` for the shared requester view and current dependency-fact vocabulary. The snapshot is revision `rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:4`, input `input/1:9ca31c2bf2f66f17d0a67b2adcba33af79e9c59821900865c32637c2c876f3f9`, with API coverage `1`. Do not refresh or edit it.

The relevant map slice is:

- `dependency-comparison-presentation`, owned here, renders added, removed and changed modules and directed relationships with inspectable before/after evidence and clear historical, current, scope and incompleteness labels.
- A later `browser-baseline-projection` in `ramify/service-api` must provide bounded result states and detail data.
- A later `browser-baseline-workflow` in `ramify/explorer` must own baseline selection, lifecycle actions, stale refresh and page state.
- `dependency-baseline-comparison` in `ramify/analysis` must eventually compute deterministic change records from Ramify's existing production dependency meaning.

Do not invent any of those foreign APIs. Use synthetic supplied data only to establish this owner's presentation requirements, and keep any interim shape private to this module.

## Requirements carried into this iteration

Match modules by canonical ID and relationships by directed consumer/provider identity. A rename is represented as removal plus addition. Show before and after values for supplied dependency counts and existing classifications when a relationship remains on both sides but changes. Repeated imports of the same original and line-number-only changes are upstream comparison concerns; the view must not reconstruct dependency relationships from occurrences or source locations.

Keep removed modules and relationships inspectable. Label retained baseline evidence as historical and current-side evidence as current source evidence. Display each side's analyzed input or revision identity, production dependency scope and coverage. Incomplete or unavailable evidence must never look like zero dependencies, a proven removal or a clean comparison. Observed changes may be shown with qualified wording.

A display filter changes visible rows only. Label filtered totals against the full supplied comparison totals, and do not mutate the input or redefine the comparison scope. Distinguish unavailable, retryable and resource-limit outcomes from a valid empty result. Only sufficiently complete sides may produce an unqualified “no dependency changes” result.

Follow the existing visual and accessibility conventions. Keep source occurrences secondary to architectural relationship evidence. Avoid adding baseline management controls, refresh orchestration or a complete replacement for the current dependency diagram in this iteration.

## Acceptance and evidence to create

Add focused owned component tests that demonstrate:

1. One added module, one removed module, one added relationship, one removed relationship and one changed relationship are categorized correctly from supplied comparison data.
2. Selecting the changed relationship shows its canonical consumer/provider plus labeled before and after counts and classifications.
3. Selecting added or removed entities keeps the available side inspectable and labels historical versus current evidence accurately.
4. Complete no-change data renders a clean result, while partial data uses qualified wording and never converts an unobserved relationship into a definite removal.
5. Side identities, production scope and coverage are visible.
6. Filtering affects displayed rows and filtered totals without changing full totals.
7. Unavailable, retryable and resource-limit states are distinct and do not render as an empty comparison.

Run the focused Vitest test file(s) and `npm run type-check` from `/ramify`. Review the diff and confirm every write is within this work boundary and `module.ramify` is unchanged. These checks are evidence you must establish; no passing comparison test or implementation result exists yet.

## What this iteration does not complete

Fixture-driven presentation tests do not complete a provider delegation, browser workflow or the dependency-baselines feature. The work still needs an agreed comparison view model, real service projection, explorer page state and lifecycle actions, comparison computation, coherent current revision selection, persistent named storage with isolation and limits, terminal human/JSON output, and cross-surface restart acceptance.

Local continuation may include reconciling the private presentation input with the later reviewed service agreement, integrating the component with the dependency diagram or a reviewed comparison mode, and adding navigation or large-result behavior once bounds are known. External needs must name the candidate owner, required information and unresolved agreement; do not write across that boundary.

## Outcome and restart protocol

At the end, report:

- the observable presentation behavior and exact files changed;
- focused tests and type checks run, with actual results;
- which acceptance conditions passed, failed or remain unverified;
- any useful partial result that can be resumed from repository state;
- local continuation within `ramify/presentation/project-view`;
- external needs for `ramify/service-api`, `ramify/explorer` or `ramify/analysis`, including the fields or states the consumer proved it needs;
- any blocker or proposed boundary change without making that change.

If the iteration cannot finish, leave the repository in a coherent state and identify the next concrete local step. Do not claim feature completion from synthetic data. A fresh agent must be able to restart from the files and recorded evidence without relying on this conversation.
