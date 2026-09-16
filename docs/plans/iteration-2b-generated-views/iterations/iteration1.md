# Iteration 1: Contract review and probes

**Plan:** [Plan 2B: Generated project views](../main-plan.md).
**Prerequisites:** Plan 2A's completion report and gate are recorded. Plan 2A
documents are read-only.
**Owners:** Plan 2B documents, checked-in probe scripts and the Plan 2B harness
ledger; no production owner changes.

## Goal

Bind the proposal to Plan 2A as delivered, settle every review decision with
the user and freeze the new limits before production code changes.

## Read first

- [Main plan](../main-plan.md), [scope](../scope.md),
  [contracts](../contracts.md), [owners](../owners.md) and
  [subcases](../subcases.md).
- Plan 2A's completion report, contracts, owners and every iteration results
  file, including appended follow-ups.
- The [materialized API view specification](../../../architecture/materialized-api-view.spec.md).
- Current `generated-path.ts`, `availability.ts`, `decisions.ts`, session
  `apiView`, contexts `apiView`, `api-view-publisher.ts`, service
  `materialize`, `materialize-command.ts` and their `module.ramify` lines.

## Deliverables

1. Record Plan 2A's completion commit and the exact current shapes named above.
   Replace every stale path, name and count in this package.
2. Present each [review decision](../scope.md#review-decisions) to the user and
   record the answer in `scope.md` as a dated revision.
3. Add deterministic probes under `scripts/probes/plan2b/` that count exposed,
   relayed, ineffective, internal and test entries per module for R, T and
   S100, estimate the three text files' bytes and measure static test parsing
   cost. Archive raw results under `scripts/probes/results/plan2b/`.
4. Measure `listAvailableOriginals` over `explainImport` against Plan 2A's
   shared-helper implementation for R and T, to confirm the restoration's cost.
5. Archive Plan 2A's reference and toolkit API-view trees (fixture B) with a
   manifest of relative paths and SHA-256 digests.
6. Freeze `TestHierarchyLimits` and any changed view limit in `contracts.md`,
   with links to raw observations.
7. Replace the proposed declarations in `owners.md` with exact lines and a
   consumer relay map for the new owner.
8. Add `plan2b-instances.ts`, the runtime shell and `--plan 2b` parsing with
   iteration bound 1–9; register every leaf once and add negative controls.

## Matrix rows executed here

I2B-01: all five leaves.

## Verification

Run the probes, `npm run type-check`, the focused Plan 2B harness tests and
`npm run reference:verify -- --plan 2b --iteration 1`. Validate Markdown links,
unique instance IDs and group counts.

## Exit criteria

Every review decision has a recorded answer, contracts and declarations match
current source, limits are frozen and the ledger rejects missing or false
evidence. No production materialization case passes.

## Handoff

Frozen contracts, decisions, fixture B and probe results go to iterations 2–4,
which may run in parallel.
