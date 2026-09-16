# Plan 6 acceptance matrix

**Date:** 2026-09-16. **Status:** proposed first-release gate. Companion to the
[plan](main-plan.md).

The matrix tests the accepted product boundary: a useful, source-faithful
cucumber-viz explorer port over one Ramify report plus the existing retained
symbol-detail provider.
Architecture cases from an older roadmap are not completion authority.

**Fixtures.**

- `reference`: the current Collection Review project, inventoried when the
  iteration runs rather than frozen to an obsolete owner count.
- `toolkit`: Ramify after this plan's new owners are present.
- `temp`: a purpose-built temporary project with independently stated files,
  modules, accesses and expected decisions.
- `view-fixture`: a hand-built compatibility model used only for pure component
  behavior; it does not establish backend semantics.

## Reuse and lifted behavior

| ID | Iter | Fixture | Required witness |
| --- | ---: | --- | --- |
| EX01 | 1 | source | Every lift candidate and reusable test has a verified source path, commit and destination. |
| EX02 | 2 | view-fixture | The radial graph renders the hierarchy, rings, links, minimap and controls using the lifted graph bundle. |
| EX03 | 2 | view-fixture | Selecting a module, an edge, an external target and the empty pane preserves the source interaction behavior and mutual exclusion. |
| EX04 | 2 | view-fixture | Clicking the selected edge clears it; edge width follows access count; pan and zoom state survive a component rerender. |
| EX05 | 2 | view-fixture | Tag-derived presentation classes drive color, legend and filtering without restoring cucumber-viz path classification. |
| EX06 | 3 | view-fixture | Breadcrumbs, subtree drill-down, out-of-view nodes and the single-root overview behave as the source page does. |
| EX07 | 3 | view-fixture | The sidebar resizes and module, edge and target details survive rerenders. Loading, retry, empty and unavailable states are visible. |
| EX08 | 3 | view-fixture | Export inventory expands, shows aliases, value/type capability, exposure badges and source locations. Signature UI renders loading, described, truncated and unavailable callback results. |
| EX09 | 3 | view-fixture | The page renders without a host service, host stylesheet or discussion component; injecting a discussion slot still works. |
| EX10 | 7 | source | The completion report classifies every lifted file as copied, mechanically adapted, behaviorally changed or rewritten and explains every behavioral change. |
| EX11 | 7 | source | All reusable cucumber-viz tests have a recorded ported, replaced or intentionally omitted outcome; unexplained loss fails the gate. |

## Report projection

| ID | Iter | Fixture | Required witness |
| --- | ---: | --- | --- |
| EX12 | 4 | reference | Module hierarchy, tags, purpose and owned files agree with the same report. A nested file counts under exactly one owner. |
| EX13 | 4 | temp | Application accesses group by consumer and file-target owner. A forwarding access retains both file target and selected original identity. |
| EX14 | 4 | temp | Access count means source occurrences and symbol count means distinct selected original/name pairs; neither is labeled calls. |
| EX15 | 4 | temp | A denied access remains on its edge with its reason. Limited coverage remains distinct from allowed and denied. |
| EX16 | 4 | temp | Package, builtin, standard-library, outside-module and unresolved targets remain distinct and retain their source rows. |
| EX17 | 4 | temp | Exports with aliases join to their original, capability, exposures and evidence. An exposed but unused export remains visible. |
| EX18 | 4 | temp | Coverage is associated with its module, edge or other-target group where evidence permits and remains globally visible otherwise. |
| EX19 | 4 | toolkit | Every model field is derived from `{revision, report}`; a guard test fails if projection code imports filesystem, compiler or daemon internals. |
| EX20 | 4 | temp | A null snapshot or invalid/unavailable report does not become a successful empty model. |
| EX21 | 4 | temp | An encoded result above 16 MiB returns an explicit limit with maximum and observed bytes; no partial success is returned. |

## Existing detail enrichment

| ID | Iter | Fixture | Required witness |
| --- | ---: | --- | --- |
| EX34 | 4 | temp | The detail bridge obtains described, truncated and unavailable results from the existing retained detail provider, with its fixed bounds. |
| EX35 | 5 | temp | Expanding an export loads its detail. A request for a revision that is no longer current returns superseded; a newer revision's detail never appears in the older view. |

## Connected workflow

| ID | Iter | Fixture | Required witness |
| --- | ---: | --- | --- |
| EX22 | 5 | temp | A real tRPC router and direct caller return the projected model for an existing revision and validate malformed tokens/revisions. |
| EX23 | 5 | temp | The connected page renders real report data, not a component fixture or duplicated analyzer result. |
| EX24 | 5 | temp | The header names the displayed revision. A newer publication offers refresh and does not replace the view silently. |
| EX25 | 5 | temp | A late response for an older revision cannot overwrite a newer selection or mix revisions. An evicted revision is visibly unavailable. |
| EX26 | 5 | temp | Selection, filters and drill-down survive refresh when their IDs still exist; removal is handled explicitly. |
| EX27 | 6 | temp | `ramify explore` resolves the project, ensures a daemon, starts or reuses a compatible web process, opens the correct local URL and exits. |
| EX28 | 6 | temp | Daemon unavailability is reported without loading or spawning a second analyzer in the web process. |
| EX29 | 7 | reference | A real browser against the actual HTTP process completes navigation, pan/zoom, selection, filtering and sidebar resizing. |
| EX30 | 7 | reference, toolkit | Both real projects render successfully; visible module/edge counts agree with their reports for the displayed revision. |
| EX31 | 7 | temp | README, source-access and exposure edits each produce a newer view with the independently expected visible change. |

## Observational resource record

| ID | Iter | Fixture | Required witness |
| --- | ---: | --- | --- |
| EX32 | 7 | reference, toolkit | Record projection duration, encoded bytes, web RSS/heap and daemon RSS/heap with runtime/dependency versions and raw results. |
| EX33 | 7 | reference | Ten refreshes do not accumulate models, request listeners or timers; settled counts return to the same bounded baseline. |

Passing component tests alone does not establish EX22–EX35. Passing the browser
workflow does not replace the source-reuse accounting in EX10–EX11.
