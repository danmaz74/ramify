# Iteration 6 results: Markdown rendering and transactional publication

**Status:** complete. **Plan:** [Plan 2A](../main-plan.md). **Iteration:**
[iteration6.md](iteration6.md). **Owner:** `daemon` document renderer,
filesystem publisher and their tests, plus the owned `interfaces/daemon.ts`
types and the one owned `module.ramify` exposure line.

## Summary

Added a pure Markdown/`_meta.json` renderer (`api-view-documents.ts`) and a
transactional, symlink-safe, crash-recoverable filesystem publisher
(`api-view-publisher.ts`) that together implement contracts.md's "Renderer
and publisher" and scope.md's "Documents" and "Publication and recovery"
sections. The publisher validates every target and document path itself
(never trusting a caller-supplied projection), refuses any symlink anywhere
in the existing path chain or target contents, stages every changed target
completely before switching any of them, keeps rollback backups until the
whole request commits, and recovers only its own marked, exact-form
stage/rollback siblings at the start of the next invocation — verified with a
real, separately spawned and `SIGKILL`ed child process, not a simulation.
`createFilesystemApiViewPublisher(limits)` is the one name exposed to the
parent; a same-owner `createControlledFilesystemApiViewPublisher` plus an
injected `ApiViewFilesystemPort` seam drive every fault/ordering test.

All 17 required matrix leaves (I2A-06 ×7, I2A-07 ×10) have both a real vitest
assertion and a matching reference-harness handler in the new
`scripts/reference-harness/plan2a-publication-cases.ts`.

## Files changed

**`daemon`** (owned):
- `subs/daemon/src/api-view-documents.ts` (new) — pure renderer: `renderApiView`,
  `renderCodeSpan`, `renderCodeFence`, `renderEntry`, `renderDocument`, `renderMeta`.
- `subs/daemon/src/api-view-publisher.ts` (new) — `createFilesystemApiViewPublisher`
  (exposed), `createControlledFilesystemApiViewPublisher` (same-owner test
  factory), the injected `ApiViewFilesystemPort` seam, `createNodeApiViewFilesystem`,
  `createControlledApiViewFilesystem`.
- `subs/daemon/src/interfaces/daemon.ts` — added `ApiViewPublishLimits`,
  `MaterializedTarget`, `PublishApiViewOutcome`, `ApiViewPublisher` (contracts.md's
  frozen shapes verbatim), carried to the parent by the file's existing
  `expose-src * from "interfaces/daemon.ts" to parent` wildcard; added the two
  cross-subtree type-only imports (`RevisionId` from `contexts`, `ApiViewProjection`
  from `analysis`) these types need.
- `subs/daemon/module.ramify` — added
  `expose-src createFilesystemApiViewPublisher from "api-view-publisher.ts" to parent`,
  exactly the line the brief specified.
- `subs/daemon/src/tests/api-view-documents.test.ts` (new, 16 tests) — all
  seven I2A-06 leaves plus renderer-shape coverage.
- `subs/daemon/src/tests/api-view-publisher.test.ts` (new, 16 tests) — nine
  of the ten I2A-07 leaves (all but crash-recovery) plus resource-limit and
  pre-work-cancellation coverage.
- `subs/daemon/src/tests/api-view-publisher-crash-recovery.test.ts` (new, 1
  test) — `I2A-07:crash-recovery`, isolated in its own file since it spawns
  and `SIGKILL`s a real child process.
- `subs/daemon/src/tests/api-view-fixtures.ts` (new) — small `ApiViewProjection`
  builders (`entry`, `described`, `truncated`, `unavailable`, `file`, `area`,
  `moduleProjection`, `projection`) shared by the three test files, the
  crash-recovery child fixture and the reference harness.
- `subs/daemon/src/tests/crash-recovery-child.ts` (new) — the real,
  separately-spawned process fixture: publishes a second revision through a
  filesystem seam whose `rename` hangs (via a ref'd interval, since a bare
  unsettled top-level await lets Node exit on its own) immediately after
  renaming a live target away to its `.old-<suffix>` backup, the exact
  mid-switch crash point.

**Reference harness** (shared infrastructure, per the brief):
- `scripts/reference-harness/plan2a-publication-cases.ts` (new) — exports
  `plan2aPublicationHandlers: ReadonlyMap<string, InstanceHandler>`, 17
  `kind: 'memory'` handlers keyed by leaf ID (`I2A-06:*` ×7, `I2A-07:*` ×10),
  calling the real exposed/same-owner production functions against real
  temporary directories (not a reimplementation). `I2A-07:crash-recovery`
  spawns the same `crash-recovery-child.ts` fixture and kills only that PID.
  No capability name beyond the existing `runner.ts`/`InstanceHandler`
  vocabulary is needed — every handler is `kind: 'memory'`.

**Documentation:**
- `docs/plans/iteration-2a-materialized-api-view/scope.md` — added a dated
  "Revision (iteration 6, 2026-09-15)" note under "Publication and recovery"
  (see "Contract deviations").

Not touched: `subs/analysis/src/session-*.ts`, `subs/analysis/src/interfaces/session.ts`,
`subs/daemon/subs/contexts/**`, `subs/daemon/src/service.ts`/`validation.ts`/
`codec.ts`/`connection.ts`/`host.ts`, `subs/daemon/src/filesystem-watcher.ts`
(already uses `isRamifyGeneratedPath`, done by an earlier iteration), root
`module.ramify`/`src/**`, `scripts/reference-harness/plan2a-runtime.ts`,
`plan2a-instances.ts` or `verify.ts`.

## Design notes (not contract deviations)

- **The ownership marker is a sibling *file*, never written inside the
  `.tmp-`/`.old-` directory.** `.ramify.tmp-<suffix>` is later renamed
  verbatim into the live target; a marker written inside it would leak into
  published `.ramify` content the instant the switch adopts that directory —
  a real defect the first implementation attempt hit and the byte-determinism/
  omitted-redundancy tests would have caught. The sibling path
  (`<directory-name>.marker.json`) still matches the shared reserved-segment
  pattern (`^\.ramify\.(tmp|old)-.+$`, confirmed against
  `subs/analysis/subs/project/src/generated-path.ts`, whose `.+` is unbounded
  and absorbs the trailing `.marker.json`), so isolation is unaffected. This
  is recorded as a dated scope.md revision (see "Contract deviations") since
  the document spoke of a directory's own marker without fixing where it
  lives, and implementation proved that ambiguity load-bearing.
- **Marker-before-directory ordering.** Both the `.tmp-` marker (before
  `mkdir`) and the `.old-` marker (before the rename that creates it) are
  written first, so a crash immediately after either step can never leave an
  unmarked directory recovery would have to guess about. The real
  crash-recovery test caught this ordering bug directly: an earlier
  mkdir-then-marker / rename-then-marker ordering left a genuinely unmarked
  `.old-` directory at the exact `SIGKILL` point the required leaf demands.
- **`switchTarget` is internally self-healing.** If the second rename
  (`tmp-` → live target) fails after the first (live target → `.old-`)
  succeeded, `switchTarget` renames the backup back before propagating the
  error, so a caller's `switched` bookkeeping never has to distinguish a
  fully- from a partially-switched target. This was needed for
  `I2A-07:switch-rollback` to actually restore a target whose first rename
  had already run when its second rename was the one that failed.
  `checkAncestors`/`recoverSiblings` also `mkdir(parentAbs)` /
  tolerate a not-yet-created directory defensively, since a source area's
  own root, while always real in production, is not assumed to already exist
  on disk by this publisher's own logic.
- **Post-rename directory fsync.** `switchTarget`, `rollbackTarget` and
  `recoverSiblings` each `fsyncDir` the parent directory after a rename that
  changes its entries, in addition to the staged files/directories `fsyncFile`/
  `fsyncDir` before any switch — contracts.md's "fsyncs files/directories
  where the platform supports the required guarantee" is read to cover the
  rename step too, not only the staging step, since both are needed for the
  crash-safety this iteration's exit criteria require.
- **Best-effort post-commit `.old-` cleanup.** After every requested target
  switches successfully, removing its now-unneeded `.old-<suffix>` backup is
  wrapped in try/catch and never turns a correct publish into a failure — the
  content is already correct, and a leftover marked backup is reclaimed by
  the next invocation's own recovery step regardless.
- **`maxAreaBytes`/`maxInvocationBytes` bound every target's rendered size
  regardless of `changed`; `maxStagedBytes` bounds only the bytes about to be
  written this invocation** (the sum of *changed* targets' bytes). These are
  the publisher's own limits, distinct in purpose (not just name) from
  `ApiViewQuery.maxAreaBytes`/`maxInvocationBytes`, which already bound the
  projection's own encoded size one layer up in `analysis`'s `projectApiView`
  (iteration 5); the publisher never assumes that upstream bound was applied
  with the same numbers.

## Matrix leaves executed

### I2A-06 (Markdown rendering), all seven

| ID | Evidence | Result |
| --- | --- | --- |
| `minimal-described` | `api-view-documents.test.ts`, harness handler | Passed: exact byte-for-byte heading/fence/newline shape, with and without a documentation paragraph |
| `type-marker` | same | Passed: `[type-only]` only on type-only headings; a value entry carries no availability marker |
| `exception-markers` | same | Passed: `[truncated]` with bounded content; `[details-unavailable]` with no fence; `[type-only]` orders before either |
| `omitted-redundancy` | same | Passed: rendered documents and `_meta.json` never mention provider/path/tags/original-ID/exposure/alias/availability or a placeholder |
| `markdown-delimiters` | same | Passed: code-span delimiter longer than the longest backtick run (padded when content starts/ends with a backtick); fence longer than any leading backtick run, minimum three; a backtick-containing signature still renders as one valid, closed, literal-searchable fence |
| `metadata-minimal` | same | Passed: ordered required keys, only nonzero exceptional counts, one line, final newline |
| `byte-determinism` | same | Passed: a shuffled equivalent projection renders a byte-identical relative tree; no absolute path, timestamp, PID or request ID anywhere in output |

### I2A-07 (safe filesystem publication), all ten

| ID | Evidence | Result |
| --- | --- | --- |
| `first-publication` | `api-view-publisher.test.ts`, harness handler | Passed: a missing target is staged completely and switched; `_meta.json` staged after its document; exact file/entry/bytes counts |
| `stale-removal` | same | Passed: removing an available API leaves only `_meta.json`, entirely through directory replacement, never a patch |
| `unchanged-noop` | same | Passed: identical rerun performs zero mkdir/writeFile/rename calls and preserves the target's mtime exactly |
| `prestage-failure` | same | Passed: an injected staged-write failure preserves the previous target byte-for-byte and leaves no owned temp output; a first-publication mkdir failure leaves nothing behind either |
| `switch-rollback` | same | Passed: a later target's switch failure restores the earlier, already-switched target byte-for-byte in reverse order; the never-switched target is untouched; no siblings remain |
| `rollback-failure-explicit` | same | Passed: an injected failure during the rollback's own rename reports `rollback-failure` and retains the recovery artifact, never claiming success |
| `cancel-boundaries` | same | Passed (two sub-cases): cancellation before any switch preserves every target with no generated output at all; cancellation mid-switch finishes rolling back the already-switched target before returning `cancelled` |
| `symlink-traversal` | same | Passed (three sub-cases): a symlinked ancestor, a symlinked target itself, and a symlinked entry inside an existing target's contents each refuse the publish without following or deleting the symlink |
| `path-escape` | same | Passed (four sub-cases): `..`-escaping, absolute and backslash-confused area/document paths are all rejected with `invalid-path` before any filesystem write; an unrelated neighboring file is untouched |
| `crash-recovery` | `api-view-publisher-crash-recovery.test.ts`, harness handler | Passed: a real child process is `SIGKILL`ed exactly between the two switch renames (both its `.tmp-` and `.old-` markers verified present at that point, alongside a test-planted unmarked lookalike directory); the next `publish` call restores the target byte-for-byte, reports it unchanged, removes every owned sibling, and leaves the unmarked lookalike completely untouched |

## Commands run

| Command | Outcome |
| --- | --- |
| `npx vitest run subs/daemon/src/tests/api-view-documents.test.ts subs/daemon/src/tests/api-view-publisher.test.ts subs/daemon/src/tests/api-view-publisher-crash-recovery.test.ts` | 33 tests passed |
| `npx vitest run subs/daemon/src/tests/` (whole owner suite, 17 files) | 163 tests passed, no regression |
| `npm run type-check` (`tsc --noEmit`, `tsconfig.portable.json`, `tsconfig.scripts.json`, `scripts/reference-harness/tsconfig.json`) | Clean for every file this iteration touched. Five pre-existing errors remain, all in iteration 7's own in-progress scope (`RetainedSession.apiView` not yet implemented by `resident-assembly.ts`/`service.ts`/`session-counters.test.ts`) — see "Parallel-owner type errors" below |
| `npx tsx <scratchpad>/smoke-publication.mts` (temporary, deleted-equivalent scratchpad script) | Directly ran all 17 `plan2aPublicationHandlers` end to end with real assertions before/after the fsync-hardening edit; all 17 passed both times |
| `npm run build`, `dist/src/ramify check --batch --root .`, `npm run reference:verify -- --plan 2a --iteration 6` | Not run: the brief reserves `npm run build` for iterations 8/9/10 (parallel iteration 7 would race on `dist/`), and `verify.ts`'s own `--plan 2a` wiring for this group's leaves is explicitly the coordinator's job after this group lands, per the brief's "Harness" note |
| Bare `npm test`, `npm run reference:cases`, `npm run check:self`/`check:reference`, non-dry `reference:report` | Not run, per the brief's hard rules |

## Contract deviations

1. **scope.md's "Publication and recovery" section did not fix where the
   ownership marker lives**, and its literal phrasing ("directories... whose
   marker matches") reads as if the marker were a property of the directory
   itself. Implementation found this load-bearing: a marker written inside
   `.ramify.tmp-<suffix>` leaks into the published `.ramify` directory the
   moment that stage is renamed into place. Added a dated "Revision
   (iteration 6, 2026-09-15)" note fixing the marker as a sibling file and
   explaining why, with confirmation that the sibling path still matches the
   shared reserved-segment predicate. No frozen type, limit or outcome shape
   in contracts.md changed.

No other deviation from `contracts.md`, `scope.md` or `owners.md` was needed.
`ApiViewPublishLimits`, `MaterializedTarget`, `PublishApiViewOutcome` and
`ApiViewPublisher` match contracts.md's "Renderer and publisher" shapes
verbatim; the frozen limits (`maxAreaBytes: 32 MiB`, `maxInvocationBytes: 256
MiB`, `maxStagedBytes: 256 MiB`) are validated (positive, finite) by the
factory, not redeclared.

## Remaining limits

- **`maxStagedBytes` and `maxInvocationBytes` share a frozen numeric value**
  (256 MiB each), so no test can currently distinguish "an unchanged target's
  size counts toward the invocation bound but not the staged bound" from a
  simpler design that conflated the two; the code path is nonetheless
  distinct (see "Design notes") and independently testable if the two limits
  are ever frozen apart.
- **The rollback-failure and switch-rollback fault points are injected by
  path predicate on a same-owner controlled filesystem**, not forced through
  genuine OS-level faults (e.g. `EACCES`, `ENOSPC`); this matches the
  project's existing controlled-port testing convention (`createControlledWatcher`
  etc.) and the brief's explicit instruction to inject failures "at every
  write/fsync/rename/rollback boundary" through a controlled seam, but a
  real-disk-fault variant is not attempted.
- **Only one crash point is exercised by a real killed process**
  (mid-switch, between the two renames), the point the brief named explicitly
  and the one this design's marker-ordering fix was found against. The
  prestage-failure and cancel-boundary crash points are covered by the
  controlled-filesystem unit/harness tests instead of a second real process,
  matching the brief's "e.g." phrasing (one concrete, controlled mid-point),
  not an exhaustive real-process sweep of every boundary.
- **fsync is attempted unconditionally** (`createNodeApiViewFilesystem`'s
  `fsyncFile`/`fsyncDir` always open-and-sync); no platform-detection fallback
  for a filesystem that rejects directory fsync is implemented, since Linux
  and macOS (this plan's two target platforms) both support it. A future
  Windows port would need one.

## Required follow-up for other owners

None beyond the standing handoff below — no file outside `daemon`, the
reference harness's shared infrastructure, and this plan's own scope.md
needed a change.

## Handoff (for iteration 8)

- **Production entry point:** `createFilesystemApiViewPublisher(limits: ApiViewPublishLimits): ApiViewPublisher`
  from `subs/daemon/src/api-view-publisher.js`, the only name
  `subs/daemon/module.ramify` exposes from this iteration
  (`expose-src createFilesystemApiViewPublisher from "api-view-publisher.ts" to parent`).
  Inject it into `createDaemonService` per contracts.md's "Renderer and
  publisher" ("`createFilesystemApiViewPublisher(limits)` supplies the
  production adapter and is injected into `createDaemonService`").
- **Call shape:** `publish(root: string, revision: RevisionId, projection: ApiViewProjection, requestId: string, control?: RunControl): Promise<PublishApiViewOutcome>`
  — `root` is the project's absolute filesystem root; `revision` becomes
  every changed area's `_meta.json` `"revision"` field verbatim; `projection`
  is iteration 7's `RetainedSession.apiView` result's own
  `ApiViewProjection`; `requestId` is accepted but never written to disk or
  used in any path (per the coordinator's post-iteration-1 revision); `control?.signal`
  is honored for cancellation both before staging and mid-switch.
- **Outcome shape:** `PublishApiViewOutcome` — `'published'` carries
  `targets: readonly MaterializedTarget[]` (one entry per requested area,
  changed or not — `bytesWritten` sums only changed targets) and
  `bytesWritten: number`; `'cancelled'`; `'unavailable'` with
  `reason: 'invalid-path' | 'symlink' | 'resource-limit' | 'output-failure' | 'rollback-failure'`.
  These map directly onto `MaterializeOutcome`'s corresponding cases in
  contracts.md's "Root service and wire" — no further translation needed
  besides stamping `requestId`/`ContextRevision`/`FreshnessRecord` from the
  surrounding context/service layer.
- **Types already exposed** via `subs/daemon/src/interfaces/daemon.ts`'s
  existing `expose-src * from "interfaces/daemon.ts" to parent` wildcard:
  `ApiViewPublishLimits`, `MaterializedTarget`, `PublishApiViewOutcome`,
  `ApiViewPublisher`. Root's own `module.ramify` still needs to relay these
  (and `createFilesystemApiViewPublisher`) further to whatever consumers
  iteration 8 introduces (the daemon service, client and CLI), per owners.md's
  "Root" section — that relay was not done here since it is iteration 8's own
  planned change, not this iteration's.
- **Frozen limits to pass at construction:** `{ maxAreaBytes: 32 * 1024 * 1024, maxInvocationBytes: 256 * 1024 * 1024, maxStagedBytes: 256 * 1024 * 1024 }`
  (contracts.md, unchanged). The factory throws synchronously if any of the
  three is not a positive finite number.
- **Independent of iteration 7**, as iteration6.md's handoff states: nothing
  here calls or depends on `RetainedSession.apiView`, `ApiViewQuery` or any
  `daemon/contexts` type; iteration 8 is the join point where iteration 7's
  projection and this iteration's publisher first meet, inside
  `createDaemonService`'s `materialize` operation.
- **Reference harness:** `plan2aPublicationHandlers` (exported from the new
  `scripts/reference-harness/plan2a-publication-cases.ts`), keyed by the 17
  leaf IDs `I2A-06:*`/`I2A-07:*` listed above, every one `kind: 'memory'`. No
  new `VerificationCapability` name is needed — the coordinator can merge
  this map into `plan2a-runtime.ts` the same way `plan2aProjectionHandlers`
  and `plan2aSymbolDetailsHandlers` were merged in iteration 5, and register
  the 17 IDs in `plan2a-instances.ts`/`verify.ts`'s discriminator the same
  way.

## Parallel-owner type errors (not mine to fix)

At the time of this iteration's final `npm run type-check` run, five errors
remain, all in iteration 7's own in-progress scope, none touching any file
this iteration owns:

- `src/resident-assembly.ts:53`, `subs/daemon/src/service.ts:45`,
  `subs/daemon/src/tests/session-counters.test.ts:29,82,133` — `Property
  'apiView' is missing in type '...' but required in type 'RetainedSession'`.
  `interfaces/session.ts` (iteration 7's own file) has already added an
  `apiView` method requirement to `RetainedSession`; the concrete
  implementations at those five sites have not yet been updated to match.
  Earlier in this session, `subs/daemon/subs/contexts/src/context-manager.ts`
  carried several additional `PendingApiView`-related errors from the same
  in-progress work; those are gone as of this run, consistent with iteration
  7 actively progressing in parallel.
