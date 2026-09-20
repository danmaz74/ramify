# Architect notes: nearest-export-name

## Plan requirements with no schema field

- "Several equally close names are all listed, in the file's export order, up to
  three" and "a name that differs only in case is always close" are shape rules
  for one capability. The schema has no per-capability constraint field, so they
  live inside that capability's goal paragraph, where a harness copying the goal
  verbatim will carry them. A reader of `summary.preserves` alone would not see
  the cap of three.
- The plan's three acceptance bullets are feature-level examples. Only one
  acceptance sentence exists (`entryPoint.acceptance`), so the bullets were
  folded into the goals and that sentence. The negative bullets (no similar
  export; close only to a foreign-owned re-export) survive only as prose.
- "The JSON report carries the suggestions as data, not only inside the message"
  binds a wire shape. There is no field for a data contract, so it is a goal
  sentence plus a `preserves` entry.

## What an engineer at the entry point would need and the map has no place for

- The order of work. All four capabilities sit in one work item with no
  sequence, yet `close-name-candidates` must exist before the two suggestion
  capabilities, and `report-suggestion-data` after them. Nothing in the schema
  expresses a dependency between capabilities.
- Where the tests go. The map cites the descriptions owner's linking suite as
  existing evidence, but has no field saying which capability is verified in
  which module's tests, nor that the feature-level case needs a project fixture.
- Which existing error text is being appended to. The engineer is told not to
  change it, but the map cannot show it; the schema forbids naming files in a
  goal, and citations point at type declarations rather than the message text.
- The negative case "close only to a re-exported symbol owned by another module"
  needs the notion of an owned export; that is project vocabulary the goal can
  only gesture at.

## Work-item roots: higher versus lower

- Chose `ramify/analysis` (higher) over `ramify/analysis/descriptions` (lower).
  Three of four capabilities are owned by the child, and picking the child was
  tempting because that is where the heavy work is. But `report-suggestion-data`
  is owned by the parent and lies outside the child's subtree, so a root of
  `ramify/analysis/descriptions` would leave one capability unplaced. The
  procedure groups capabilities that fall within one subtree, and the smallest
  subtree containing all four is `ramify/analysis`.
- Considered splitting into two work items rooted at parent and child. Rejected:
  the parent's part is one optional field copied through, not vertical work, and
  splitting would invent a seam inside one branch.

## Seam judgment

- The only declared seam, `report-suggestion-data` from `ramify/analysis` to
  `ramify/cli`, has no work on the consumer side: the CLI prints a finding's
  message verbatim and serializes the whole result. `ramify/cli` is therefore
  not in `modulesTouched`, which makes the seam look like a work boundary when
  it is only where the plan's acceptance becomes observable. The schema cannot
  distinguish the two.

## Commands

- No command was denied. `materialize_api_view` was not run: both API views
  (`subs/analysis/src/.ramify/` and `subs/analysis/subs/descriptions/src/.ramify/`)
  were already present, as the spike's substitution permits. Their revision
  suffix differs from the architect view's (`:4` against `:1`), which the map
  records as an assumption rather than a verified identity.
- `ramify check --batch` was not run; recorded as a coverage limit.
