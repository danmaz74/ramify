# Iteration 6: Markdown rendering and transactional publication

**Plan:** [Plan 2A: Materialized API discovery](../main-plan.md).
**Prerequisites:** Iteration 5 projection and iteration 2 isolation predicate.
**Owners:** `daemon` document renderer, filesystem publisher and controlled
publisher tests. This iteration is independent of iteration 7.

## Goal

Render the exact compact format and safely replace every selected `.ramify`
target with deterministic, no-op-aware, symlink-safe transaction behavior.

## Read first

- [Document rules](../scope.md#documents),
  [publication/recovery](../scope.md#publication-and-recovery) and
  [publisher contract](../contracts.md#renderer-and-publisher).
- Iteration 2 generated-path predicate and iteration 5 projection types.
- Existing daemon filesystem/discovery/log adapters, controlled ports and
  cleanup tests; Node filesystem behavior required on Linux/macOS.

## Deliverables

1. Implement a pure renderer for entry headings, safe code spans/fences,
   signature/docs omission rules, final newlines, generated relative paths and
   ordered one-line metadata.
2. Implement `createFilesystemApiViewPublisher` with injected/controlled
   filesystem seams, positive finite limits and exact outcome summaries.
3. Validate every target/relative path and recursively `lstat` existing path
   components/contents. Reject symlinks and escapes before writing.
4. Stage all requested changed targets and write metadata last. Compare complete
   existing path sets/bytes first so identical targets receive no write/rename
   and retain mtimes.
5. Switch directories with rollback retained until the entire request commits.
   On failure/cancellation, restore in reverse order and distinguish output from
   rollback failure.
6. Add ownership-marked stage/rollback recovery that cleans only artifacts
   created by this publisher/version. Include killed-process recovery evidence.
7. Apply daemon declaration/types from `owners.md`; keep renderer/publisher
   private to daemon service consumers and keep projections off IPC.

## Matrix rows executed here

I2A-06: all seven leaves. I2A-07: all ten leaves.

## Verification

Run focused renderer and publisher tests on isolated temporary roots, including
failure injection at every write/fsync/rename/rollback boundary, symlinks and
path attacks. Run the killed-process recovery test. Compare exact bytes/golden
trees and pre/post mtimes. Assert cleanup on success and failure.

## Exit criteria

Rendering matches the specification byte-for-byte; publication is bounded,
transactional per request, no-op stable and incapable of following a symlink or
escaping its target. Every injected failure has an explicit preservation result.

## Handoff

The publisher port/factory and completion summary go to iteration 8. Iteration 7
can finish independently against a controlled publisher-free context path.
