# Capability progress iteration 3: harness comparison projection and protocol

**Date:** 2026-09-21. **Owner:** `ramify-agent/harness`, plus the web
`ProtocolClient` extension the plan names. **Plan:**
[capability progress visualizations](../initial-hypothesis-vs-implemented-module-tree.proposal.md#iteration-3-harness-comparison-projection-and-protocol).

## Changes

- **Protocol** (`subs/harness/src/interfaces/protocol/runs.ts`): the response
  schema `moduleCapabilityComparisonResponseSchema` and its inferred
  `ModuleCapabilityComparisonResponse`, with the parts it is built from:
  `comparisonIdentityPolicySchema` (`exact-capability-slug/1`),
  `modulePlacementSchema`, `initialRoleSchema`, `initialAssociationSchema`,
  `moduleCapabilityRowSchema`, `moduleCapabilitiesSchema` and
  `comparisonCoverageSchema`, each with its inferred type. The response's
  `tree` reuses `moduleTreeResponseSchema.shape.tree`. The refinement enforces
  the coverage table: `unavailable` has a null `initialView` and no modules,
  and only it lacks the view; a `complete` answer needs an available tree, no
  `unplaced` module and no recorded view coverage limit; while the tree is
  unavailable every module is `unplaced`; a `proposed` module carries its
  proposal; a `partial` answer names at least one gap and gives a total only
  above its known count; counts equal what the modules return; a capability is
  implemented in at most one module; a module is listed once; a row has an
  association or an implementation; both bounds hold.
- `runQueryLimits.moduleCapabilityRows = 2000`, beside the reused
  `capabilities = 500`. `protocolPaths.runModuleCapabilities(planId, runId)`
  serves `GET /api/v1/plans/:planId/runs/:runId/module-capabilities`.
- **Projection** (`subs/harness/src/projections/module-capabilities.ts`):
  `moduleCapabilityComparisonOf(view, tree, analysisLimits)`, pure over the
  committed `RunView`, one `ModuleTree` and the analysis submission's recorded
  coverage limits (`AnalysisCoverageLimits`). The initial layer is the entry
  assignments and revision-1 hypotheses only; the implemented layer is the
  complete `capabilityProgressOf` result, registered and `completed` rows only.
  Capability order, module order, bounds and gaps follow the contract.
- **Shared tree load** (`subs/harness/src/projections/tree.ts`):
  `currentModuleTree(projectRoot)`, used by the existing module-tree route and
  by the new query, so both report the same `unavailable` result.
- **Query adapter**: `RunQueries.moduleCapabilities(planId, runId)` reads the
  run view, the current tree and `invocations/<analysis invocation>/submission.json`
  for the submission's `coverageLimits`, then calls the projection.
- **HTTP**: the new route in `http/app.ts`, validated against the schema like
  every other answer.
- **Exposure**: `harness/module.ramify` already exposes every export of
  `interfaces/protocol/runs.ts` to its parent. The root `module.ramify` now
  re-exposes all 14 new symbols (7 schemas, 7 types) to descendants explicitly.
- **Web client**: `ProtocolClient.getModuleCapabilities(planId, runId)` in
  `subs/web/src/client.ts`, and in `StubClient`, with an optional
  `StubRun.moduleCapabilities` answer.

## Verification

Commands run from `ramify-agent/`:

| Command | Outcome |
| --- | --- |
| `npx vitest run subs/harness/src/tests/protocol-contract.test.ts` | 26 passed |
| `npx vitest run subs/harness/src/tests/projections-pure.test.ts` | 2 passed |
| `npx vitest run subs/harness/src/tests/run-protocol.test.ts` | 6 passed |
| `npx vitest run subs/harness/src/tests/progress.test.ts` | 18 passed |
| `npx vitest run subs/harness/src/tests/http.test.ts` | 8 passed |
| `npx vitest run subs/web/src/tests/client.test.ts` | 7 passed |
| `npm run type-check` | clean |
| `npm run check:self` (worktree toolkit build) | 8 errors, the same 8 as on the unchanged baseline; none involves this iteration's exposures. See open issues. |
| `/ramify/dist/src/ramify check --batch --root .` (the main checkout's earlier build) | passed, 0 errors, 2744 allowed |

No test makes an LLM call: every run is driven by the scripted fake. The
full suite was not run.

## Acceptance rows

| Row | Evidence |
| --- | --- |
| CM03 | `progress.test.ts` "both layers, exact-slug joins, every role once…": entry owner, suggested owner and involved module are distinct roles; one hypothesis naming a module as both suggested owner and involved keeps both roles in one row; the same module involved twice appears once; the anticipated consumer module gets no row. |
| CM04 | Same test (a `working` entry and tentative forecasts are not implemented); "a reopened capability is not implemented now…" (completed, then `evidence-reopened`, loses `implementedHere` and its row). |
| CM05 | Same main test: `moved-thing` has Initial `entry-owner` in `reviews` and Implemented in `panel` after its registry owner moved, with no mismatch field. |
| CM06 | Same main test (`format-date`, registered by a decision and verified by reuse) and the reopened test (`send-email`, first registered during the run): Implemented only. |
| CM07 | Main test (declared, and two chained `proposed` modules placed from their recorded parents); "a declared module keeps what was proposed for it at start"; "an absent module without a proposal, and conflicting proposals, are unplaced with a gap"; "an unavailable tree is partial…". |
| CM08 | Schema: `protocol-contract.test.ts` "the module-capability comparison" cases, one per coverage-table row plus counts. Projection: `progress.test.ts` pending (`unavailable`), unavailable tree, view and submission coverage limits (and an unreadable submission), unplaced, conflicting proposals, both bounds, and complete. |
| CM09 | `protocol-contract.test.ts` "CM09…": no property of the JSON Schema matches activity, commit, change, lines, deploy or percent, and such fields are refused; the HTTP exit test checks the real answer's keys. |
| CM12 (response bounds) | `progress.test.ts` "the capability bound drops whole capabilities…" (501 entries plus a discovered capability: 500 of 502, the discovered one dropped, lower-bound gap) and "the row bound keeps a capability with all of its rows…" (1,996 of 2,006 rows, 400 of 402 capabilities). The layout budgets and the 60-row module belong to iterations 1, 5 and 6. |
| CM14 | Deterministic: "the answer is deterministic" and the HTTP exit test's repeated read. Identities: `runVersion`, `initialView`, and `tree` revision and input asserted in the main and HTTP tests. Read-only: `projections-pure.test.ts` runs the query in-process and over HTTP (and a missing run) against a completed run with every byte and the last sequence unchanged, and the source tripwire covers `module-capabilities.ts` and `tree.ts`. |

**Exit condition.** `run-protocol.test.ts` "the module-capability comparison
of a completed scripted run, over HTTP" drives the protocol run of
`helpers/protocol.ts` to `job-completed`, then serves it over HTTP. Before a
view exists it returns the module-tree query's unavailable tree, every module
`unplaced`, and a `partial` coverage whose gap repeats the tree's message. It
then materializes the real architect view with the installed CLI and reads
again. `review-note` shows Initial `entry-owner` and Implemented in `notes`.
`note-search` shows Initial `suggested-owner` only. `note-drafts` shows Initial
and Implemented in `drafts`, which is now declared and is still marked proposed
at start from its recorded parent. The run version equals the number of log
events, the placeholder initial view is named, and the tree identity matches
the module-tree query. Coverage is `complete`, with 3 capabilities and 2
implemented. Every file of the run, every event and the project's git status
are unchanged.

## Interpretations and deviations

1. **What is counted.** A capability counts toward `capabilities` or
   `knownCapabilities` only when it has at least one row: an entry, a
   revision-1 hypothesis, or a registered capability that is `completed` now. A
   capability registered during the run that is not completed has no row and
   is not counted. The count is therefore of the capabilities the view can
   show.
2. **`totalCapabilities`** is non-null only when a bound dropped capabilities.
   For every other partial cause it is null, and the refinement rejects a
   total that is not above the known count.
3. **The analysis submission's coverage limits** are recorded only in
   `invocations/<id>/submission.json`, the accepted submission file. The query
   adapter reads that file and passes its limits to the projection, which
   stays pure. A missing or malformed file produces a gap rather than being
   treated as having no limits.
4. **Conflicting proposals.** Proposals for the same module conflict when they
   differ in parent, directory, purpose or tags. An absent module with
   conflicting proposals is `unplaced`, with a gap. A module that is now
   declared stays `declared`, with a null `proposedAtStart` and a gap.
5. **Module list.** While the tree is available, every declared module is
   listed in tree order, including modules with no rows, so the web can render
   muted branches without joining anything. Each proposed module goes after
   its parent's subtree, siblings in name order. `unplaced` modules come last,
   in name order. While the tree is unavailable, only referenced modules are
   listed, all `unplaced`, in name order. They get one tree gap rather than a
   gap per module.
6. **One bound gap.** Truncation keeps a prefix in capability order. The gap
   names whichever bound stopped the prefix and gives the returned and total
   counts of both capabilities and rows.

## Defects found and fixed

- **The module-tree route could not serve an available tree.** It passed the
  evidence reader's `ModuleEntry` values, which include `children`, `tags` and
  `areas`, to the strict `treeModuleSchema`. Validation failed, so the route
  answered 500 as soon as a view existed. No test covered that case. The shared
  `currentModuleTree` maps each entry to `{ module, dir, parent }`, and
  `http.test.ts` now covers the unavailable, unreadable and available cases.
- **A stale test helper.** `helpers/constructed.ts` `forecast()` did not set
  `changesExistingSymbols`, which `hypothesisSchema` now requires. As a result,
  two existing tests in `progress.test.ts` failed on the baseline ("todo,
  working, completed and a forecast" and "a capability the registry holds is
  never listed a second time"). The helper now sets it to `false`, and both
  tests pass.

## Open issues

- With the toolkit built from this branch, `npm run check:self` reports 8
  `exposed-without-companion` errors. They appear on the unchanged baseline
  too. They concern `startServer` (`ServerOptions`, `RunningServer`),
  `ProjectLockError` (`LockRecord`), evidence `MeasurementDocument` and
  `ModuleMeasurement` (unexported `documentSchema`, `moduleSchema`), and ledger
  `openLedger` and `Ledger` (`OpenLedgerOptions`, `LedgerEntry`,
  `RecordSchema`). None is in this iteration's surface, so none was changed.
  The new schemas carry the same `signature-inferred` analysis limits as every
  existing protocol schema.
- Running `check:self` and the real-view test in this worktree needed the
  toolkit built at the repository root (`npm run build`) and a
  `node_modules/.bin/ramify` link to `../ramify.ts/dist/src/ramify`, because
  the worktree's install had not linked the binary.
