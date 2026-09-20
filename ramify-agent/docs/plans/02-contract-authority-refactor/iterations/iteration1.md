# Iteration 1: Move contracts to the harness

**Goal:** make the harness the source owner of the map and HTTP contracts it
implements, while preserving their public behavior and web availability.

## Preconditions and baseline

1. Confirm the working tree and preserve unrelated changes.
2. Run the existing type check, tests, browser build and complete Ramify check.
   A pre-existing failure blocks this behavior-preserving refactor and is
   recorded rather than folded into its scope.
3. Refresh the architect view and the web requester API view from one project
   state:

   ```text
   ramify materialize --view architect --view api --from subs/web/src
   ```

4. Record the view revision/input identity and inventory every symbol exposed
   by `ramify-agent/contracts/map` and
   `ramify-agent/contracts/protocol`: name, shape/signature, original tags and
   availability to `ramify-agent/web`.

## Work

1. Move the seven interface files and two test files to the exact destinations
   in the [main plan](../main-plan.md#exact-source-moves), preserving their
   behavior and tests.
2. Update same-owner imports within the moved map/protocol files and throughout
   the harness. Update web implementation and test imports to the new
   harness-owned interface paths.
3. Expose each interface file from `harness/module.ramify` to its parent with
   the `browser` tag. Replace the root's contracts wildcard with an explicit
   named selection from `harness` to descendants containing exactly the moved
   public contract surface.
4. Remove `subs/contracts/` after no source or declaration refers to it.
5. Update the root, harness and web READMEs and current architecture/spike
   references where they describe the active module tree. Do not alter Plan 1's
   historical plan, iteration results or completion report.

## Required verification

1. Run the relocated map and protocol tests first, then the complete suite.
2. Run:

   ```text
   npm run type-check
   npm test
   npm run build:web
   npm run check:self
   ```

3. Refresh the architect and web requester API views again from the final
   source state. Compare them with the baseline:
   - the three `contracts` owners are absent;
   - the moved public names now belong to `ramify-agent/harness`;
   - names, shapes/signatures and browser tags are preserved;
   - every import used by `web` is available;
   - harness server and lock APIs were not newly re-exposed to descendants.
4. Search source, active documentation and declarations for stale
   `subs/contracts`, `contracts/map` and `contracts/protocol` references.
   Historical Plan 1 records are the explicit exception.

## Exit evidence

Create `iteration1-results.md` beside this brief with:

- the baseline and final architect-view identity;
- the pre/post public-surface comparison and any explained differences;
- the final module tree and exposure declarations;
- the files moved and any deviations from the specified destinations;
- exact validation commands and outcomes;
- confirmation that HTTP, map and persisted-data behavior did not change;
- the handoff that autonomous-loop planning may now extend the harness-owned
  contracts without recreating a neutral definitions module.

