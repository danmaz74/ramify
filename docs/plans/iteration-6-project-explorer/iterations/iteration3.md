# Iteration 3: Lift the page and details

**Plan:** [Plan 6: Project explorer](../main-plan.md).
**Prerequisites:** Iterations 1 and 2.
**Owners:** `presentation/subs/project-view [ui, browser]`.

## Goal

Copy the working cucumber-viz page view and export/details panels, preserving
its layout and interactions while adapting only the data labels and host slots.

## Read first

- [Lift inventory](../lift-inventory.md): page, panel, stylesheet and test map.
- [View model](../view-model.md): module, access, export and coverage details.
- The cucumber-viz page view, export list and page-view test at the pinned commit.

## Deliverables

1. Copy `ExportList.tsx` and `ModuleArchitecturePageView.tsx` to their mapped
   destinations with provenance comments.
2. Inject the graph and optional discussion component through props. Remove the
   direct `AgentChatPanel` import without removing the discussion slot.
3. Preserve breadcrumbs, drill-down, mutual selection, resizable sidebar,
   loading/error/empty states and the source panel layout.
4. Adapt module classification to presentation classes, access badges to
   status/reason and barrel badges to exposure badges.
5. Show aliases, value/type capability, exposures and source locations. Keep the
   signature affordance and drive loading, described, truncated and unavailable
   states through an injected callback.
6. Add other-target and coverage detail states using existing page patterns.
7. Copy and adapt the page-view test and extract the remaining page/export CSS.

## Matrix rows executed here

EX06, EX07, EX08, EX09.

## Verification

Run the copied graph and page suites together. Exercise every original named
interaction plus the signature-result, limited-coverage and external-target
states. Record changed/removed source assertions for the final reuse report.

## Exit criteria

The complete pure page renders from compatibility fixtures, retains the source
interaction behavior and imports no transport, filesystem, analyzer or host UI.

## Handoff

Iteration 5 receives the pure view and its callbacks. Iteration 7 receives the
ported tests and interim reuse record.
