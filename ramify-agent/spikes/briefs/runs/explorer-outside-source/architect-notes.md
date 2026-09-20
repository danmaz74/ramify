# Architect notes - explorer outside source

## Plan requirements with no schema field
- The plan's four acceptance cases are one feature-level check and only one
  fits `entryPoint.acceptance`. I folded all four in; per-capability acceptance
  survives only inside each `goal`, indistinguishable from the goal itself.
- "`ramify check` output is unchanged" binds a module the change never edits.
  It is in `summary.preserves` and one goal, but nothing says "re-verify this
  module although nothing in it changes", so `ramify/cli` is not touched.
- The 200-file bound is one rule binding three owners at once (who applies it,
  who describes it, who displays the shown-of-total wording). I repeated it in
  three goals; no field holds a constraint that spans capabilities.
- The plan's ordering is not expressible: `workItems` has no order and no
  dependency edge, although nothing in the explorer can be shown before the
  projection publishes it.

## What an engineer at the entry point would still need
- Which request carries the new data: no field says "the home page must start
  asking for the published project model, which it does not ask for today", so
  it sits in `assumptions.assumed`.
- The structural, import-free coupling between the service projection and the
  browser model. It is the map's most load-bearing risk and has no field: it
  appears once as an `unknown` reuse and once as an assumption.
- Nothing carries wording, layout or accessibility; `goal` bans naming files,
  so an engineer gets the behavior and none of the presentation.

## Work-item roots
- Classification: `ramify/analysis`, not its `project` child - the new
  vocabulary needs a relay line in the parent, which a lower root cannot
  change. Same reasoning for `ramify/presentation` over `project-view`.
- Those two items and the projection also need a relay line in the root module.
  Raising a root to `ramify` would collapse all four items into one, so the
  root is an `exposure-only` touched module: a prerequisite no field expresses.
- `ramify/service-api` and `ramify/explorer` have no children; roots forced.

## Commands
None denied; none run. Both API views existed, so I used them under the
substitution rule and materialized nothing. They are at revision sequence 4
against the architect view's 1 and each reports one coverage note, so every
absence in them is `unknown`.
