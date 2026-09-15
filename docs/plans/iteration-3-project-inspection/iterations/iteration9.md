# Iteration 9: Join with Plan 5: resident details and the compact history

**Plan:** [Plan 3: Project inspection](../main-plan.md).
**Prerequisites:** iteration 8 (the `inspect` service operation, the resident
CLI path and the recorded `not-extracted` detail state) **and Plan 5's
iteration 9 merged into `main`**: the retained session per context, the
session driver, the compact history with the report projected on demand, and
the removal of Plan 2's engine core. This is the only iteration of this plan
with a semantic dependency on Plan 5. **Owners:** `subs/analysis/`,
`subs/analysis/subs/model/`, `subs/daemon/` and root.

## Goal

Answer resident queries with symbol details: obtain the answering revision's
report from the compact history's on-demand projection, ask that revision's
retained session to describe the listed originals from its warm compiler, and
render the result or the session's own `superseded` and `cold` states. In the
same iteration, move the tag-rule helper so `explainImport` and
`explainAvailability` share one implementation.

## If Plan 5 has not merged

Do not start this iteration and do not reimplement any part of Plan 5 here.
Wait for Plan 5's iteration 9 to merge into `main`, and rebase this plan's
branch onto it before starting. Iterations 10 and 11 may run meanwhile on the
Plan 2 build: their instances do not depend on the join, the I3-12 instances
stay recorded as pending in the `--plan 3` inventory, and the unfiltered gate
keeps failing on them. The plan is not complete until this iteration has run,
and iteration 11's completion report states the pending join explicitly rather
than closing the plan without it.

## Read first

- Plan 5's [contracts](../../iteration-5-fast-incremental-checks/contracts.md):
  Analysis, the retained session (`RetainedSession`, `SessionRevision`,
  `SessionUpdate`, `SessionStatus`, `openRetainedSession` and the rule that
  `report` materializes a revision's report from retained facts); Contexts,
  the session driver, revisions and requests (`AnalysisDriver`,
  `ContextRevision`, `CheckOutcome`, the manager's history and projection
  rules); Root, the service vocabulary and the driver.
- Plan 5's [iteration 9](../../iteration-5-fast-incremental-checks/iterations/iteration9.md)
  for what merged, and its [scope.md](../../iteration-5-fast-incremental-checks/scope.md)
  sections on the sweep and on deadlines and cold contexts.
- [contracts.md](../contracts.md): the `answerInspection` paragraph on the
  optional `details` input; Daemon, validation and binding, last paragraph;
  Model, availability, last sentence on the shared helper.
- [scope.md](../scope.md#detail-tiers-and-availability): the `From iteration 9`
  column of the detail table; [Freshness and revisions](../scope.md#freshness-and-revisions),
  last paragraph; [Coexistence with Plan 5](../scope.md#coexistence-with-plan-5).
- [owners.md](../owners.md): the Analysis, Model, Daemon and Root sections and
  the iteration 9 rows of the activation manifest.
- Main plan: [Resolved decisions](../main-plan.md#resolved-decisions) 5 and 9;
  matrix row I3-12; the additive-collision risk row.
- [subcases.md](../subcases.md): the I3-12 rows.
- Source, after the rebase: `subs/analysis/src/{retained-session,session-worker}.ts`
  and `src/interfaces/session.ts`; `subs/daemon/subs/contexts/src/{context-manager,context,history}.ts`;
  `subs/daemon/src/service.ts`; `src/resident-assembly.ts`;
  `subs/analysis/subs/model/src/{decisions,availability}.ts`;
  `subs/analysis/subs/typescript/src/details.ts` from iteration 4.

## Deliverables

1. A `details(originals, limits, control?)` operation on Plan 5's
   `RetainedSession`, declared in `subs/analysis/src/interfaces/session.ts`
   and implemented in `retained-session.ts` and `session-worker.ts` as an
   additive edit that reorders and renames nothing. It describes the named
   originals from the session's warm compiler at the current revision through
   `SourceAnalysis.details`, and answers `superseded` when the session has
   moved past the requested revision and `cold` when no compiler is held.
2. The contexts driver relaying that operation for a named revision, and the
   daemon's `inspect` binding obtaining the report from the compact history's
   on-demand projection instead of a retained whole report, so
   `snapshot-not-retained` disappears for retained revisions.
3. `answerInspection` accepting an optional `details?: SymbolDetails` input,
   used when the daemon supplies details obtained from the session for the
   same revision. A detail obtained at a later revision is never labeled with
   an earlier one; the row states `superseded` instead.
4. The daemon requesting details only when the query's detail level needs
   them, for the listed originals only, and rendering the session's
   `superseded` and `cold` answers as per-row states with the summary line.
5. The shared tag-rule helper moved into
   `subs/analysis/subs/model/src/availability.ts` so `explainImport`,
   `explainAvailability` and `listAvailability` call one implementation, on
   top of Plan 5's indexed lookups in `decisions.ts`. I3-01's
   `agrees-with-enforcement` and `visible-set-equals-explain` must still hold
   unchanged.
6. Hook latency unaffected: the details path adds no work to a check,
   `check --changed` and the sweep, which `hook-latency-unaffected` asserts
   against Plan 5's recorded hook measurements.
7. Tests: `subs/analysis/src/tests/session-details.test.ts`;
   `subs/daemon/src/tests/service.test.ts` extended for the projection and the
   detail request; `subs/analysis/subs/model/src/tests/decisions.test.ts` and
   `src/tests/availability-listing.test.ts` extended for the shared helper.
   Harness: the `inspect-join` capability with the I3-12 handlers in
   `scripts/reference-harness/inspect-join-cases.ts`.

## Matrix rows executed here

- I3-12: `resident-details-warm`, `resident-details-superseded-unavailable`,
  `session-driver-inspect`, `compact-history-projection`,
  `hook-latency-unaffected`, `decisions-shared-helper`.

## Verification

```sh
git rebase main                                           # Plan 5 iteration 9 must be in main
npm run build && npm run type-check
npx vitest run subs/analysis/src/tests/session-details.test.ts \
  subs/daemon/src/tests/service.test.ts \
  subs/analysis/subs/model/src/tests/availability-listing.test.ts \
  subs/analysis/subs/model/src/tests/decisions.test.ts
npm test
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
(cd examples/collection-review/subs/workspace/subs/reviews/src \
  && node ../../../../../../dist/src/cli-entry.js available --detail signatures)
npm run reference:verify -- --plan 3 --iteration 9         # requires 2 to 9
npm run reference:verify -- --plan 1 && npm run reference:verify -- --plan 2
npm run reference:verify -- --plan 5                       # Plan 5's gate on this build
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kinds: `quick` and `ipc`. Expected intermediate failures: the
unfiltered `--plan 3` gate, and the `inspect-measure` and `completion`
capabilities. Plan 5's gate must pass on this build; a regression in it is a
defect of this join, not of Plan 5. A detail answered from a revision other
than the one the answer names is the failure this iteration exists to prevent.

## Exit criteria

- `--detail signatures` and `--detail docs` are answered from the retained
  session on the resident path, at the revision the answer names, with
  `superseded` and `cold` stated per row when the session cannot describe.
- The `inspect` binding reads the compact history's projection, and
  `snapshot-not-retained` no longer occurs for a retained revision.
- One tag-rule helper serves `explainImport` and `explainAvailability`, and
  I3-01 still holds unchanged.
- Every I3-12 instance ran and asserted its own expectation; Plan 1's, Plan
  2's and Plan 5's gates pass on the same build.

## Handoff

Iteration 10 measures the resident answers, including the detail path this
iteration enabled, and records the process evidence. Iteration 11 records the
join in the architecture documents and in the completion report, and closes
the plan's gate.
