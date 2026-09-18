# Iteration 9: Fix the defects the real runs found

**Plan:** [Plan 2B: Generated architect view](../main-plan.md).
**Prerequisites:** iteration 8.
**Owners:** `daemon/contexts` or `analysis` (the dependency analyzer's
request), `analysis/typescript` (the retained compiler's listing), `daemon`
(publisher cleanup), the toolkit's and the reference project's `.gitignore`,
and `scripts/reference-harness` (predecessor expectations).

## Goal

Fix the clear defects that iterations 5 and 8 recorded, so the plan's
completion gate can pass on a correct build before the agent trials. Hit cost,
record length and lock hold time are performance work outside this plan.

## Read first

- AV40–AV43 and the main plan's
  [completion boundary](../main-plan.md#completion-boundary).
- Iteration 8's results: Findings 2 and 3, the `mixed-invocation` and
  `open-with-view` witnesses in `scripts/measurements/plan2b.mjs`, and the
  `reference:cases` failures under Verification.
- Iteration 5's results: the stage cleanup and marker file limitations.
- `subs/analysis/src/dependency-analyzer.ts` (re-acquisition from
  `report.request.project`), `interfaces/dependency-analyzer.ts`
  (`DependencyDiagramRunner`), and the context manager's dependency jobs and
  republication with cause `request` in
  `subs/daemon/subs/contexts/src/context-manager.ts`.
- `subs/analysis/subs/typescript/src/retained-source-analysis.ts`
  (`#listing`, `#readDirectory`) and, for the existing rule,
  `subs/analysis/subs/project/src/configuration.ts` and `generated-path.ts`.
- `subs/daemon/src/api-view-publisher.ts` (`cleanupTmp`, sibling recovery)
  and its crash-recovery test.
- `scripts/reference-harness/linking.test.ts`, `self.test.ts`,
  `self-cases.ts`, `verify.test.ts`, `verify.ts`, `plan5-completion.test.ts`
  and `plan5-completion-cases.ts`.

## Deliverables

1. **The analyzer after a change of invocation form.** Make the dependency
   analyzer verify a revision's inputs against the request those inputs were
   captured with, so a republication with cause `request` does not make every
   job answer `inputs-changed`. Prefer passing the captured request from the
   context manager; if the code shows the analyzer side is the right place,
   record why. A real input change must still answer `inputs-changed`, and a
   newer revision must still supersede the wait.
2. **Generated directories at session open.** Make the retained compiler's
   directory listing and reads omit reserved segments, as the configuration
   host does, so a session opened while `.ramify` or `.ramify-architect`
   directories exist records none of them as inputs.
3. **Stage cleanup.** Keep a stage's marker when removing the stage fails, so
   sibling recovery reclaims it later, for the API and architect targets.
4. **Marker files and Git.** Make the `.gitignore` patterns of the toolkit and
   the reference project match leftover marker files as well as directories.
5. **Predecessor expectations.** Update the five `reference:cases` tests that
   fail at `577b980` to the fifteen-owner toolkit and the documents' current
   explorer status, changing no assertion's intent.
6. Turn iteration 8's `mixed-invocation` and `open-with-view` witnesses into
   passing evidence, re-run `measure:plan2b` and record the whole-command time
   of the mixed-invocation case against the 90 s budget.

## Matrix rows executed here

AV40–AV43, and AV29–AV34 again on the fixed build.

## Verification

```sh
npm run build
npm run type-check
npm run check:self
npm run check:reference
npm run reference:cases
npm run measure:plan2b
```

Also the focused files for each changed owner: the analyzer, the contexts
dependency tests, the retained source analysis, the publisher and its crash
recovery. The full Vitest suite runs through the cucumber-viz audit, not by
hand.

## Exit criteria

AV40–AV43 pass, `reference:cases` passes, and every budget except hit cost
holds.

## Handoff

The fixed build's commit, the rebuilt evidence, and any command form the
trials must still avoid.
