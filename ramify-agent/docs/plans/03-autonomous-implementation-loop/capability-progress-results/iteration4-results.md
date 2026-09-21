# Capability progress iteration 4: Progress subviews and the Dependencies diagram

**Date:** 2026-09-21. **Owner:** `ramify-agent/web`. **Plan:**
[capability progress visualizations](../initial-hypothesis-vs-implemented-module-tree.proposal.md#iteration-4-progress-subviews-and-the-dependencies-diagram).

## Step 0: signature companions (separate commit)

Before this iteration, `npm run check:self` reported eight
`exposed-without-companion` errors under Plan 8's rule. They were on the
baseline, and iteration 3 recorded them. Commit `1659539` fixes them at each
exposure step:

| Exposure | Companions now exposed with it |
| --- | --- |
| ledger `openLedger`, `Ledger` | `OpenLedgerOptions`, `LedgerEntry`, `RecordSchema`, plus the file-system seam they name: `LedgerFileSystem`, `LedgerFileHandle`, `LedgerOpenFlags` |
| evidence `MeasurementDocument`, `ModuleMeasurement` | `documentSchema`, `moduleSchema`, both now exported |
| harness `ProjectLockError` | `LockRecord`, `lockRecordSchema` (now exported) |
| harness `startServer` | `ServerOptions`, `RunningServer`, `RunRecoveryReport` |

**Deviation.** `ServerOptions` also carried settings used only by the
harness's own tests: an `AgentPort`, the Ramify command line and
`RunServiceOptions`. Their companions would have exposed the whole
run-service configuration to the root, including `AgentPort`, `RunInputs`,
`RunPolicy`, `ProcessGroups`, `RunWrite`, `ProjectLock` and `RamifyCli`. The
harness README says that configuration stays internal. Those settings
therefore moved to an internal `ServerSettings` and `startServerWith`, which
`run-protocol.test.ts` and `projections-pure.test.ts` now call. The root's
`startServer` accepts exactly what `src/main.ts` passes, with `agent` typed
`'pi' | 'fake'`. `http.test.ts`, `projections-pure.test.ts` and
`run-protocol.test.ts` pass (16 tests).

## Changes

- **Progress subviews** (`run-page.tsx`): Progress has **By module** and
  **Dependencies** tabs, and only the selected view is mounted. Dependencies
  is the default. Until iteration 5, By module says "By module is not available
  yet" and fetches nothing. Dependencies runs the `/capabilities` query itself,
  so leaving it unmounts the graph. When the view is selected again, it reads
  the answer again.
- **Conditions**: The Progress area and its view tabs stay visible while
  loading (a `status` saying "Loading the capability progress…"), empty (a
  `status` saying "The run has no registered or forecast capability yet.") and
  unavailable (an `alert` saying "The capability progress is unavailable:
  …"). None of these shows state counts or the word `todo`.
- **Dependency graph** (`capability-graph.tsx`): `CapabilityDependencyGraph`
  with `CapabilityDependencyGraphProps` typed from `CapabilityListResponse`.
  Details are under the corrections below.
- **Work-item history link**: selected detail lists each work item as a
  button. It switches the Run page to Work items with that item open, so the
  Run page now holds the selected work item.
- **Preview** (`examples/capability-graph-example.tsx`, `?example=capability-graph`
  on the dev server) is rebuilt as five separate graphs. Each is the output of
  `capabilityProgressOf` for one run constructed in `progress.test.ts`, captured
  by running the projection over that test's lines: todo, working, completed
  and a forecast; the provider wait; the resumed provider; verified reuse; and
  evidence reopened.
- `styles.css` adds the owner label, cycle label, count label, view tabs and
  inline lists. Counts show the literal state words, with no uppercase
  transform. The web README describes Progress.

The rejected `module-activity-tree.tsx` was never mounted in Progress. It is
wired only as the dev preview `?example=module-activity` in `main.tsx`. Its
files and that preview stay for iteration 5 to delete, as the plan schedules.

## Prototype differences from the contract, and their corrections

| # | Prototype | Contract | Correction |
| ---: | --- | --- | --- |
| 1 | Props were `readonly CapabilityProgress[]` and `number`, and the component was `CapabilityGraph` | Props typed as `CapabilityListResponse['capabilities']` and `['total']` | `CapabilityDependencyGraphProps` uses the response types, and the component is renamed `CapabilityDependencyGraph` |
| 2 | `working` rendered as "working on" in badges, accessible names and the counts | Literal `todo`, `working`, `completed` (CM15, CM19) | The literal state everywhere in the graph and its detail |
| 3 | Counts titled "Progress totals" | Counts labelled as counts of the returned set (CM18) | "State counts of the N returned capabilities" |
| 4 | Node owner unlabelled; the detail said "Owner" for every capability | Registered = current owner; tentative = suggested owner (CM16) | Both labels on the node and in the detail, chosen by `tentative`, never from `reason` |
| 5 | Bounded response: "showing 2 of 3", with omitted targets in one sentence. An empty bounded response hid its total behind "No capabilities have been projected" | `capabilities.length / total`, with omitted targets listed and no invented node (CM18) | "Showing N / total", a list of unavailable targets, "(not in this response)" in the detail, and the coverage statement also for an empty bounded answer |
| 6 | The cycle was an outline in `aria-hidden` SVG, with no text, starting 9 px above the first member | An explicit cycle group with its internal edges (CM17) | A visible label ("Dependency cycle: no order among these"), header room inside the outline, and the dependency list naming each cycle with its internal edges |
| 7 | Column 0 was labelled "Starting capabilities" | Layout never becomes an execution schedule | Labels are "Depth N", and the header says columns are not an execution order |
| 8 | The first entry was preselected and shown as pressed without user action | Selected detail | Nothing is selected until the person chooses a capability; the page says so |
| 9 | The detail had no link to work-item history and no dependents | Capability detail links to the work-item history (CM19) | Work-item buttons open the history; "Depended on by" names consumers |
| 10 | The Run page mounted the graph through a generic `Loading` ("Loading the progress…" / "Could not load the progress"), with no subviews | Two subviews; named loading, empty and unavailable conditions (CM20) | As in Changes |
| 11 | The preview merged rows from different constructed runs into one graph. Several rows matched no `progress.test.ts` answer: `review-panel` "Work item wi-004 completed…", the `format-date` reason, and `note-rendering` and `note-storage` with a tentative link | Rebuilt from existing `progress.test.ts` cases | Five separate case graphs, with the projection's exact output |
| 12 | The layout kept an unreachable fallback for a cyclic condensation and a name tie-break, and edges used index keys | Deterministic for one response | Both removed, since the first-response index is unique and the condensation is acyclic; edges use pair keys; a determinism test was added |

Verified unchanged: longest-path ranking over the strongly connected
condensation, where consumers are left of their dependencies and direct links
may skip columns; one node per capability; deduplicated edges, where a
confirmed link wins over a tentative repeat; dashed tentative edges; and
nodes that grow with the full module path.

## Acceptance rows

| Row | Tests |
| --- | --- |
| CM15 | `capability-graph.test.tsx`: "each returned capability appears once with the harness's literal state text" (no "working on" anywhere), and "the state is never derived from the reason" (a reason naming other states leaves `working`, and the reason is shown verbatim). `run-page.test.tsx`: "CM15–CM17: Dependencies lays out…". |
| CM16 | "a registered todo and a tentative forecast-only todo stay distinct; owners are current or suggested" (class, "forecast only" text, owner labels on node and detail, dashed tentative edge); the Run-page CM15–CM17 test checks both owner labels on the stub answer. |
| CM17 | "consumers precede dependencies by their longest depth…", "an entry that another entry depends on moves right…", "a shared dependency is one node with every incoming edge", "a cycle is one explicit group with its internal edges…", "the layout is deterministic", "columns are labelled as depth…", "a confirmed link is solid even when a forecast repeats it". |
| CM18 | "reports shown versus total, labels counts as of the returned set and lists omitted targets without nodes", "a complete response states no coverage gap", "an empty response says so…; an empty bounded one reports its total". |
| CM19 | `run-page.test.tsx` "CM19: a failed run says failed at run level only…": `capabilityStateSchema.options` is the three states. In a `repair-exhausted` failed run, the header state is `failed`, while the nodes read `working` and `todo` and the Progress area contains no "fail". The detail's work-item button opens Work items, where the exhausted iteration and `ga-0005 failed` appear. |
| CM20 | `run-page.test.tsx` "CM20: Progress offers By module and Dependencies…": the tabs, the default, only one view mounted, no comparison fetch, and a new read on remount. "CM20: Progress stays visible while loading, empty or unavailable…" names each condition, and no `todo` appears. |

Iteration 6 still owes browser evidence for CM16–CM18 and CM20.

## Verification

Commands run from `ramify-agent/`:

| Command | Outcome |
| --- | --- |
| `npx vitest run subs/web/src/tests/capability-graph.test.tsx` | 15 passed |
| `npx vitest run subs/web/src/tests/run-page.test.tsx` | 11 passed |
| `npm run type-check` | clean |
| `npm run check:self` | passed: 0 errors, 0 warnings, 88 analysis limits; 2750 allowed, 0 denied |
| `npm run build:web` (extra) | built |
| Step 0: `npx vitest run subs/harness/src/tests/{http,projections-pure,run-protocol}.test.ts` | 16 passed |

No LLM call was made. The full suite was not run. No daemon was started:
`check:self` runs `--batch`, and the harness tests stop their own.

## Deviations and interpretations

1. **`onOpenWorkItem`.** The graph takes one optional prop beyond the
   contract's two: `onOpenWorkItem`. It is how capability detail links to the
   work-item history, because no URL route addresses a work item. Without it,
   work items are listed as text.
2. **Preview scope.** No `progress.test.ts` case produces a shared
   dependency, a cycle, a tentative link or a bounded answer, so the preview
   shows none of them. The component tests cover each one. Iteration 6's
   scripted-run fixture must supply them for browser evidence.
3. **Step 0.** The `ServerSettings` split replaces companion exposure for the
   test-only server settings, for the reason given above.

## Open issues

- The preview data is a captured copy of the projection's output. The web
  module may not import harness projections or test helpers, so no test ties
  the two together, and they can drift.
- The Work items area still shows a work item's `working` as "working on"
  through the shared `StateBadge`. That vocabulary belongs to work items, not
  to capability state, and this iteration leaves it unchanged.
