# Spike: from a plan to work briefs

Throwaway. It tests the step the [work loop](../../docs/work-loop.md#from-the-map-to-a-brief)
depends on most: whether an implementation map of the toolkit holds enough to
assemble each work item's brief by selection alone, with no sentence written
by the harness.

The target project is the toolkit, the repository root. The plans live here
and not in the toolkit's tree, so the toolkit never learns of this project.

## Plans

Each plan is written as a person's request. It names no module, so that
placement stays the architect's work.

| Plan | Size | What it should exercise |
| --- | --- | --- |
| [nearest-export-name](plans/nearest-export-name/plan.md) | Small | One subtree. The run should be the spine alone, with no seam and no need. Tests whether the map resists inventing work items. |
| [explorer-outside-source](plans/explorer-outside-source/plan.md) | Medium | The data exists and the consumer lacks it. Two or three branches, a seam that crosses the `browser` and `ui` tags, reuse findings that are not available to the module that needs them. |
| [why-import](plans/why-import/plan.md) | Large | A chain through most of the tree from two consumers, the command line and the explorer. Several seams in sequence, a shared service vocabulary owned by the root, a capability that already exists in the model and is used by nothing. Tests entry-point choice, vertical scope choice and nested delegation. |

The expectations in this table are hypotheses for judging a map. They are
kept out of the plans so that they cannot prime the architect.
