# Iteration 4: Reuse project-root resolution

**Plan:** [Plan 5 hook optimization](../main-plan.md).
**Prerequisites:** iterations 1 and 2.
**Owners:** `analysis/project`, `analysis`, `daemon/contexts`.

## Goal

A hook against a known context with an unchanged invocation spawns no
configuration helper, and a changed configuration still resolves again.

## Read first

- Main plan: resolved decisions 2 and 5; rows HO-10 to HO-12.
- Analysis: [Project-root resolution](../../../analysis/fast-incremental-checks-optimization.md#project-root-resolution)
  and [target 3](../../../analysis/fast-incremental-checks-optimization.md#3-root-resolution).
- [CLI invocation contract](../../../architecture/cli-invocation.spec.md):
  project selection and configuration discovery.
- `subs/analysis/subs/project/src/resolve-root.ts` and its tests.
- `subs/analysis/src/session-engine.ts`: `update()` 127-131 and
  `#invocationProblem` at 320.
- `subs/daemon/subs/contexts/src/context-manager.ts`: `openContext` and
  `driver.resolve` at 503, invocation per lease at 446, `invocationKey`.
- The configuration acquisition replay-and-reuse path in `analysis/project`
  and iteration 2's results.

## Deliverables

1. **Worker.** Skip the invocation check when the invocation equals the one the
   session last validated and the session's configuration dependencies are
   unchanged since then.
2. **Daemon.** Reuse a known context's resolution on open for an equal
   invocation, validated against the configuration dependencies the context's
   session observer holds, for example their recorded identities. If the
   dependencies are not available to the daemon without a new contract, record
   the smallest additive session reply field and use it.
3. **Invalidation.** A configuration edit, a created or deleted configuration
   candidate on the discovery path, or an unavailable session resolves again.
4. **Tests** for HO-10 to HO-12, counting resolver calls through an injected
   or spied resolver, and using iteration 1's invocation-check field.
5. **Results** in `iteration4-results.md`, including which discovery inputs are
   validated and why that set is complete.

## Matrix rows executed here

HO-10 `invocation-check-reused`, HO-11 `root-resolution-reused`, HO-12
`root-resolution-invalidated`.

## Verification

```sh
npx vitest run subs/analysis/subs/project/src/tests
npx vitest run subs/analysis/src/tests
npx vitest run subs/daemon/subs/contexts/src/tests
npm run type-check
git diff --check
```

Then the cucumber-viz commit audit on the worktree.

## Exit criteria

- HO-10 to HO-12 pass; every other test in the touched owners passes.
- No stale root is reachable in a test where discovery inputs changed.

## Handoff

The reuse condition and any added field, for iteration 5's covering rule, which
compares invocations.
