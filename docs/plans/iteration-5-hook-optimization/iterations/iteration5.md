# Iteration 5: Answer queued racing hooks on publication

**Plan:** [Plan 5 hook optimization](../main-plan.md).
**Prerequisites:** iterations 1 and 4.
**Owners:** `daemon/contexts`.

## Goal

A hook that arrives while the watcher's update runs is answered from that
update's revision when it covers the hook, with no second update.

## Read first

- Main plan: resolved decisions 2 and 4; rows HO-13 to HO-16.
- Analysis: [Racing hooks run a second update](../../../analysis/fast-incremental-checks-optimization.md#racing-hooks-run-a-second-update),
  [target 4](../../../analysis/fast-incremental-checks-optimization.md#4-racing-hooks)
  and the open question on covering limits.
- [Daemon and analysis: fast incremental checks](../../../architecture/daemon.md#fast-incremental-checks).
- Remediation [iteration 1 results](../../iteration-5-contract-remediation/iterations/iteration1-results.md#deviations-and-limits).
- `subs/daemon/subs/contexts/src/context-manager.ts`: `covers()` at 432-438,
  `check()` from 439, how a request's paths are queued, the abort at 181,
  `sweepKind` at 325, and revision publication.
- `subs/daemon/subs/contexts/src/tokens.ts` 28 and its caller at 282.
- `subs/daemon/subs/contexts/src/tests/covering.test.ts`,
  `context-manager.test.ts`, `scripted-driver.ts`.

## Deliverables

1. **Covering on publication.** When a revision publishes, evaluate `covers()`
   for each pending synchronized request; answer those covered and withdraw
   their queued paths when no other pending request or change needs them. A
   request with a differing expectation, another known change or a required
   sweep still runs an update.
2. **Advance-before-publish window.** Account for a covered request arriving
   after the session advanced and before the context published: it waits for
   the publication and is then evaluated, rather than being refused or
   analysed again.
3. **Fingerprint comparator.** `createFingerprints` sorts without
   `JSON.stringify` in its comparator, with unchanged output.
4. **Contract text.** Write resolved decision 4's sentence into the covering
   rule in `docs/architecture/daemon.md`.
5. **Tests** for HO-13 to HO-16 with the scripted driver, counting updates.
   Keep the harness's covered-versus-analysed attribution working.
6. **Results** in `iteration5-results.md`.

## Matrix rows executed here

HO-13 `covered-on-publication`, HO-14 `uncovered-after-publication`, HO-15
`advance-before-publish`, HO-16 `fingerprint-order`.

## Verification

```sh
npx vitest run subs/daemon/subs/contexts/src/tests
npx vitest run subs/daemon/src/tests
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the worktree.

## Exit criteria

- HO-13 to HO-16 pass; every other test in the touched owners passes.
- Existing covering expectations change only where decision 4 requires, each
  listed with its reason.

## Handoff

The covering rule as implemented, for the closure report and the measurement
successor's racing-hook attribution.
