# Plan 22 planning validation

**Date:** 2026-10-08. **Result:** planning artifacts validated; implementation
and runtime acceptance remain unstarted.

## Checks

- The 2026-10-08 priority revision moves acceptance to iteration 3,
  dependencies to iteration 4, and orders recovery/remaining families by the
  supplied timing profile. Shared prerequisites and all 16 acceptance IDs remain.
- The serial manifest contains eight unique iterations in dependency order.
  Every referenced iteration file exists and is marked unstarted.
- The acceptance matrix has 16 unique IDs. Its complete ID set equals the
  union of iteration case assignments; no row is omitted or unknown.
- Local Markdown file links and heading anchors resolve. Plan Markdown has
  no trailing whitespace; JSON artifacts parse successfully.
- Actual installed Vitest file discovery returned 244 unique selected files:
  227 in `node`, 17 in `web`. The normalized snapshot records the discovery
  command, timestamp, HEAD and SHA-256 hashes of relevant dirty-working-tree
  inputs. Those hashes matched during document validation.
- `git diff --check -- ramify-agent/docs/README.md` passed from the repository
  root. Removing exactly the three-line Plan 22 index addition reproduces
  the pre-edit index bytes, preserving existing user edits.

Commands used for discovery and CLI-option verification, from `ramify-agent/`:

```sh
node_modules/.bin/vitest list --help
node_modules/.bin/vitest list --filesOnly --json
```

The validation also parsed the manifest, compared acceptance ID sets, checked
local links/anchors and compared document-index bytes with a temporary pre-edit
snapshot. These checks do not execute the listed test cases.

## Limits and review scope

No source, package, audit or runner configuration was changed. No test suite,
full audit, model session or boundary qualification was executed in this
authoring turn. Supplied prior timings and the earlier wrapper probe retain
their stated provenance in [source state](source-state.md).

The plan defines proposed commands, guard ownership, exact-path partitioning
and acceptance requirements. Its implementation starts with case-level
inventory and preservation review against the then-current Plan 21 delivery;
the file discovery snapshot alone is not that semantic review. The root testing
API view was missing at authoring, so proposed guard exposure needs refreshed
view inspection in iteration 0/2, not an absence claim based on that missing view.
