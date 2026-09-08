# Iteration 15: Self-check, relocation, measurements and completion

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iteration 14.
**Owners:** any toolkit owner whose real violation the self-check finds; the
independent scripts scope; plan documents.

## Goal

Turn the checker on the toolkit itself, prove the package works outside the
enclosing repository, record the batch resource measurements the roadmap
assigns to Plan 1, and close the plan with the completion report Plan 2
starts from.

## Read first

- Main plan: Source scope and project selection,
  Validation and completion conditions, Risks table.
- [Memory lifecycle](../../../architecture/memory-lifecycle.md): Measurement
  and acceptance, Repeatable setup measurements, ML01 and ML02.
- [Tooling roadmap](../../tooling-architecture/README.md): Plan 1 completion
  and handoff, Information to preserve between plans.

## Deliverables

1. `npm run check:self`: the CLI run at the toolkit root. The example, the
   site and the scripts compile under their own configurations and are not in
   the toolkit's program, so they appear nowhere in its result. Fix real
   violations in the owners; exempt nothing.
2. A toolkit negative mutation, independent of the reference negatives,
   detected by the same engine.
3. Relocated smoke run: copy the package without dependencies to a directory
   outside the enclosing repository, install from its own lockfile, build,
   test and run the CLI there.
4. Measurements with checked-in fixtures: a real-session setup fixture for
   `scripts/memory-probe.mjs`, a repeated create/check/dispose workload, cold
   latency and peak memory on the reference and a 100-owner synthetic fixture.
   Retain recipes, input fixtures, runtime and dependency versions and raw
   results; record the agreed numeric budgets.
5. Documentation: implementation-status guidance, command documentation and
   the roadmap's Plan 1 status updated to the delivered scope; daemon, MCP and
   browser-verifier claims stay false.
6. The completion report: executed capabilities, source scope and coverage,
   gate membership and outcomes, known failures, remaining family instances,
   measured costs, the implemented contracts and identities, and Plan 2's
   starting requirements.

## Matrix rows executed here

- I1-27: `self-check`, `self-negative`.
- I1-28: `relocated-package`.

## Verification

Every command in the main plan's validation section, in order:

```sh
npm run build && npm run type-check && npm test
npm run reference:cases && npm run check:reference && npm run check:self
npm run reference:verify -- --plan 1
npm run reference:report
npm run diagrams && npm run site:build
git diff --check
```

## Exit criteria

- Every checkbox in the main plan's completion list holds with evidence.
- The completion report exists beside the plan and answers the roadmap's
  Plan 1 handoff row.

## Handoff

Plan 2 begins from the implemented contracts, identities, scope decisions and
measurements this report records, not from the roadmap's proposed names.
