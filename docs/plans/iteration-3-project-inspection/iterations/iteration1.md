# Iteration 1: Contract package, probes and review points

**Plan:** [Plan 3: Project inspection](../main-plan.md).
**Prerequisites:** none within this plan. Plan 2 is complete and merged on
`main`: the resident daemon, the contexts manager, the lightweight client, the
installed `check`, `watch` and `daemon` commands, `npm run check:self` over
eleven owners, Plan 1's 308-instance gate and Plan 2's gate. Plan 5 is being
implemented in parallel and nothing here depends on it. **Owners:** none; this
iteration reviews documents and runs executable probes only.

## Goal

Turn the draft review package into the accepted contract that iterations 2 to
11 implement, settle the open review points, and measure with four probes the
four behaviors the package assumes: the cost and size of symbol details,
whether the report snapshot survives the byte cap, the import specifier styles
real projects use, and the size and enumeration cost of an availability
listing. No owner source, harness code, daemon code or CLI code is written
here.

## Read first

- Main plan in full, especially [Resolved decisions](../main-plan.md#resolved-decisions),
  [Required behavior and diagnostics](../main-plan.md#required-behavior-and-diagnostics),
  [Acceptance matrix](../main-plan.md#acceptance-matrix),
  [Iteration sequence](../main-plan.md#iteration-sequence) with its
  [Probes](../main-plan.md#probes) table, and
  [Risks and decisions to settle early](../main-plan.md#risks-and-decisions-to-settle-early)
  with its review-point table.
- [contracts.md](../contracts.md), [owners.md](../owners.md),
  [scope.md](../scope.md) and [subcases.md](../subcases.md) in full; they are
  the objects of this review.
- [Daemon and analysis](../../../architecture/daemon.md): Service operations
  and client behavior; Context identity and retained state; Freshness and
  saves; Acceptance evidence; Decisions still requiring review.
- [Memory lifecycle](../../../architecture/memory-lifecycle.md): State
  ownership and bounds; Measurement and acceptance.
  [Processes and clients](../../../architecture/processes-and-clients.md): CLI
  commands.
  [Quick testing](../../../architecture/quick-testing.spec.md): Real flows
  with direct adapters.
  [CLI invocation](../../../architecture/cli-invocation.spec.md): Selecting
  the project; Files outside modules.
- Plan 2's [iteration 1](../../done/iteration-2-resident-verification/iterations/iteration1.md)
  and its [probe record](../../done/iteration-2-resident-verification/probes.md)
  as the pattern for probe scripts and archived results, and Plan 5's
  [iteration 1](../../iteration-5-fast-incremental-checks/iterations/iteration1.md)
  for the parallel plan's own package.
- [Project-explorer reuse analysis](../../../analysis/project-explorer-reuse.md):
  the declaration extractor and surface renderer P3-1 imitates.
- [Module-description specification](../../../model/module-description.spec.md)
  for the manual review of the declaration lines this plan adds.

## Deliverables

1. Review outcome recorded in the four package documents
   ([contracts.md](../contracts.md), [owners.md](../owners.md),
   [scope.md](../scope.md), [subcases.md](../subcases.md)): each status line
   advanced from draft to accepted, or the revised text with its revision
   noted. A signature, wire schema, declaration line or activation stage
   changed during review lands in the package here, before any consumer
   exists.
2. RP-2 to RP-6 each recorded with the chosen alternative in the main plan's
   review-point table, with the recommendations as the proposal: RP-2
   `ramify available` as a top-level command beside `inspect` and `explain`,
   RP-3 the defining file's export name per row with Ramify aliases listed,
   RP-4 resident answers over the whole report through the check path with
   details unavailable until iteration 9, RP-5 `signatures` as the default
   detail level, RP-6 the published-answer latency on the reference and S100
   binding from iteration 10 with the remaining rows advisory. RP-2 and RP-6
   need the user's acceptance and are not settled by this iteration alone.
   RP-1 is already decided in the draft and is confirmed, not reopened.
3. Probe scripts under `scripts/probes/inspection/`, in the scripts scope
   selected by `tsconfig.scripts.json`: `details-cost.mjs` (P3-1),
   `snapshot-retention.mjs` (P3-2), `specifier-style.mjs` (P3-3) and
   `listing-sizes.mjs` (P3-4). Each takes a project root or a saved batch
   report as the existing probes do, and each archives a JSON result under
   `scripts/probes/results/` beside the Plan 1, Plan 2 and Plan 5 results:
   `inspection-details-cost.json`, `inspection-snapshot-retention.json`,
   `inspection-specifier-style.json` and `inspection-listing-sizes.json`. The
   main plan's probe table fixes what each must establish. P3-1 and P3-4 use
   throwaway code inside the probe; neither anticipates an owner file.
4. `probes.md` beside this plan recording each probe's command, host, Node and
   `typescript@7.0.2` versions, fixture identities, result file and the
   decision it informs. Linux results are required now; macOS results are
   added when a macOS run exists.
5. The [budget tables and limits](../scope.md#budgets) revised once from the
   probe results: `maxListedSymbols`, the five `DetailLimits` defaults, the
   report-growth row and the three latency rows. From this iteration's exit
   the reference and S100 published-answer rows and the report-growth row are
   the binding targets iteration 10 asserts; the remaining rows stay advisory.
6. The scheduling decisions confirmed or revised in the same table:
   iterations 3 and 4 may run in parallel after iteration 2; iteration 5
   implements the remaining query branches over iteration 3's vocabulary;
   iteration 6 needs both 4 and 5; iterations 7 and 8 rebase onto `main`
   before exit; iteration 9 is the only iteration with a semantic dependency
   on Plan 5 and starts after Plan 5's iteration 9 has merged. A different
   decision revises iterations 3 to 11 before they start.

## Matrix rows executed here

None. This iteration produces no executable acceptance evidence, and the
`--plan 3` selector does not exist until iteration 2 registers the inventory.

## Verification

```sh
npm run type-check                                              # the probes compile in the scripts scope
npm run build
npx tsx scripts/measurements/materialize.ts                     # S100, S500 and S1000, unchanged from Plan 2
node dist/src/cli-entry.js check --root examples/collection-review --batch --format json > /tmp/reference.json
node dist/src/cli-entry.js check --root . --batch --format json > /tmp/toolkit.json
node scripts/probes/inspection/details-cost.mjs /tmp/reference.json /tmp/toolkit.json
node scripts/probes/inspection/snapshot-retention.mjs /tmp/reference.json /tmp/toolkit.json
node scripts/probes/inspection/specifier-style.mjs /tmp/reference.json /tmp/toolkit.json
node scripts/probes/inspection/listing-sizes.mjs /tmp/reference.json /tmp/toolkit.json
ls scripts/probes/results/inspection-{details-cost,snapshot-retention,specifier-style,listing-sizes}.json
git diff --check
```

By hand: every exposure line and foreign type in [owners.md](../owners.md)
against the description principles' review checklist; every contract in
[contracts.md](../contracts.md) against the main plan's proposed-contract
table; every row of [subcases.md](../subcases.md) against the acceptance
matrix and the per-iteration counts. No api, quick, unit, ipc, process or
measurement acceptance evidence exists yet, and presenting the package does
not approve an unresolved contract change.

## Exit criteria

- The four documents carry an accepted status or a recorded revision, and
  RP-2 to RP-6 and the confirmation of RP-1 each have a recorded entry, with
  the user's acceptance recorded for RP-2 and RP-6.
- Four probe results are archived under the named files, `probes.md` cites
  them, and the budget and limit tables name their measured starting values.
- The added declaration lines and their foreign types pass the manual
  description review.
- Accepted before iteration 2 starts; a later change to any signature, schema,
  declaration or budget revises this package first.

## Handoff

Iterations 2 to 11 implement exactly these signatures, wire schemas,
declarations, budgets and activation stages. P3-1 feeds the detail limits and
the report-growth budget iterations 4, 6 and 10 assert; P3-2 fixes the
expected frequency of the `snapshot-not-retained` outcome iteration 8 reports;
P3-3 confirms the `relative-js` spelling rule iterations 3 and 7 implement;
P3-4 fixes the one-pass enumeration algorithm and `maxListedSymbols` of
iteration 2.
