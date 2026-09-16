# Iteration 3: Reserved outputs and generic publisher

**Plan:** [Plan 2B: Generated project views](../main-plan.md).
**Prerequisites:** Iteration 1.
**Owners:** `analysis/project` reserved-output table and its call sites, the
daemon watcher filter, and the daemon publisher with its tests. Independent of
iterations 2 and 4.

## Goal

Reserve every generated location before any view writes it, and turn the
API-view publisher into one transactional publisher for file and symlink
targets from any view.

## Read first

- [Reserved outputs](../scope.md#reserved-outputs),
  [replacing an existing target](../scope.md#replacing-an-existing-target),
  [publication](../scope.md#publication) and the
  [publisher contract](../contracts.md#publisher).
- `generated-path.ts`, `inventory.ts`, `configuration.ts`, `capture.ts`,
  `observer.ts`, `filesystem-watcher.ts` and their tests.
- `api-view-publisher.ts`, its tests, crash-recovery child and harness cases.

## Deliverables

1. Add `ViewId`, `ReservedOutput` and `reservedOutputs`; extend
   `isRamifyGeneratedPath` to root paths and transient forms, with near-miss
   controls.
2. Apply it at every existing call site, including configuration globbing that
   could reach module source through a `docs/modules` symlink.
3. Create `output-publisher.ts` from the API-view publisher: `GeneratedTarget`
   input, symlink entries created with exact relative text and compared with
   `readlink`, escape and undeclared-symlink refusal, recognizable-target
   checks per view, and one transaction across every target.
4. Keep sibling staging and marker recovery, including markers left by a Plan
   2A publisher.
5. Keep `createFilesystemApiViewPublisher` as a thin adapter that converts a
   Plan 2A projection into `GeneratedTarget` values for the generic publisher,
   so `service.ts`, which iteration 2 edits, needs no change. Iteration 5
   removes the adapter.
6. Port every I2A-07 test to the generic publisher.

## Matrix rows executed here

I2B-03: all six leaves. I2B-04: all eight leaves.

## Verification

Focused project, watcher and publisher tests, including failure injection at
every write, fsync, symlink, rename and rollback boundary and the killed-process
recovery test. `npm run type-check`. No build while iterations 2 or 4 run.

## Exit criteria

Both root paths and their transient forms never become inputs or events;
the publisher handles files and symlinks across views transactionally; Plan 2A
publication behavior is unchanged.

## Handoff

The table, `ViewId`, `GeneratedTarget` publisher port and the temporary adapter
go to iteration 5, which removes the adapter.
