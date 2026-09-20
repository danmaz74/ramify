# First work brief: Copy the selected module ID

## Goal

In the existing module-tree detail panel, let a user copy the currently displayed real module's exact canonical identifier. This iteration owns the complete local interaction: visible selectable identifier text, a keyboard-operable action, accessible success and failure feedback, manual fallback, and protection against stale async feedback after selection changes.

The overall work item is complete only when the user-facing request also has any required real-browser acceptance evidence. This iteration establishes the implementation and executable owner-local evidence; it does not claim that a real clipboard paste has already been exercised.

## Scope and boundary

Work only in module `ramify/presentation/project-view`, beneath `subs/presentation/subs/project-view/src/`. Do not change `module.ramify`, exported contracts, generated `.ramify` views, `ramify/explorer`, analysis, daemon, server behavior or project files. Do not add a module or a cross-module dependency.

The relevant capability slice is:

- `ModuleTreeView` already renders the selected real module's detail panel.
- `ExplorerModule.id` is the full canonical identifier in the currently displayed model. Use that exact value; do not derive it from `name` or `directory` and do not fetch fresh data.
- Extend the selected detail with copy behavior and feedback tied to the module identifier captured when the request begins.

Do not change module selection, collapse state, graph position, import-explorer navigation or refresh behavior. Do not add copying for links, source paths, multiple modules or the import explorer. No action may appear for the synthetic project node or when the project summary is shown.

## Read first

1. `subs/presentation/subs/project-view/README.md` — the owner's browser-facing, supplied-model responsibility.
2. `subs/presentation/subs/project-view/src/ModuleTreeView.tsx` — the selected-detail rendering, local state and callbacks whose behavior must remain stable.
3. `subs/presentation/subs/project-view/src/interfaces/project-view.ts` — `ExplorerModule.id`, the canonical value to display and copy.
4. `subs/presentation/subs/project-view/src/tests/ModuleTreeView.test.tsx` — the existing jsdom interaction suite to extend.
5. `subs/presentation/subs/project-view/src/tests/module-tree-fixture.ts` — existing root and nested module data used by those tests.
6. `subs/presentation/subs/project-view/src/module-tree.css` and `subs/presentation/subs/project-view/src/project-view.css` — current tree-detail and shared detail-panel styling.

Read beyond these paths only to answer a specific implementation or verification question, and list every additional path in the outcome.

## Requirements

Render the full `module.id` as visible, selectable text in the selected real module's detail panel. Give the native button a clear accessible name such as **Copy module ID** so ordinary Enter/Space activation works. Copy only `module.id`, with no label, whitespace or transformation. A real root module is a valid selected module and must be copyable. Equal short names in different branches must still copy their different full IDs.

Use the browser clipboard writer when it exists. Treat a missing writer and a rejected write as failures. Success and failure must be visible and announced to assistive technology without moving focus away from the action. On failure, keep the canonical value visible and selectable and explain that it can be copied manually. Do not report a successful copy before the write promise resolves.

Associate pending work and its outcome with the identifier captured at activation time. If the selected module changes before that request settles, its success or error must not appear as feedback for the new selection. A later request must not be overwritten by an older completion. Keep this state local to the view; it need not survive page closure.

The action and either outcome must not call or alter selection, collapse, open-module, refresh or graph-position behavior. Preserve focus on the action through success and failure.

## Iteration acceptance

Add focused executable tests demonstrating all of the following:

1. Nested and real-root selections expose and copy their exact canonical IDs; test data with duplicate short names still produces distinct full values.
2. The action has an accessible name and keyboard activation invokes the write without invoking unrelated tree callbacks.
3. A resolved write yields module-scoped success feedback, and focus remains on the action.
4. Rejection and an unavailable clipboard API each yield useful announced failure feedback while the identifier stays visible and selectable for manual copy.
5. Changing selection while a promise is pending prevents that completion from appearing for the newly selected module; also protect a newer request from an older completion.
6. The project summary and synthetic project node expose no copy action, and existing selection, collapse and open behavior continues to pass.

Run the focused test file first:

```sh
npx vitest run subs/presentation/subs/project-view/src/tests/ModuleTreeView.test.tsx
```

Then run:

```sh
npm run type-check
npm run check:self
```

Review the final diff to confirm every write is within the declared boundary and generated views were not edited. Do not claim the request's real-browser paste case from jsdom evidence.

## Remaining obligations

After this iteration, real-browser evidence may still be needed to show that the written value can be pasted outside the page. That work is outside this agent's write boundary and is an external need to report, not an implicit delegation. Any owner-local defect or missing regression evidence remains local continuation. The excluded copy surfaces and durable feedback remain outside the work item.

## Outcome protocol

Report one of:

- **Iteration complete:** list changed files, observable behavior delivered, exact commands and results, and the remaining real-browser acceptance need.
- **Useful partial result:** preserve compiling, reviewable work; state which acceptance conditions pass, which remain, and the exact next local step. A UI placeholder or a test that bypasses the real clipboard call does not count as meaningful completion.
- **External need:** name the candidate owning module or platform dependency, evidence for the need, the unresolved question, and why it cannot be completed inside `ramify/presentation/project-view`. Do not edit that other owner or invent its API.
- **Blocked:** state the missing information or authorization and the safe repository state left behind.

List every file read beyond the read-first set. Separate local continuation from external needs. Passing against a fake alone is neither feature completion nor proof of a delegated provider.

## Restart behavior

Treat repository state as authoritative. On restart, inspect the current diff and rerun the focused test before changing anything. Preserve valid existing work inside the boundary, avoid duplicating completed behavior, and resume from the first unmet acceptance condition. Do not rely on prior conversation or assume an unrecorded agent outcome.
