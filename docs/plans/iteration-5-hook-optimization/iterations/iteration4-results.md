# Iteration 4 results: Reuse project-root resolution

**Date:** 2026-09-13. **Outcome:** HO-10 to HO-12 pass. A resolution records
the filesystem queries it made and what they answered. A later resolution of an
equal request replays those queries on a fresh capture. If every answer is the
same, it returns the earlier resolution and spawns no configuration helper.
Otherwise it resolves again. The worker's invocation check and the daemon's
`openContext` both use this. Reports, revisions, input order and `inputId` are
unchanged. Direct work; no Studio workflow.

## Design

1. **Resolution evidence** (`subs/analysis/subs/project/src/resolve-root.ts`).
   `recordResolution` at `subs/analysis/subs/project/src/resolve-root.ts:42`
   keeps three things for a frozen `resolved` result: the request key, the
   capture's replay recipe (`observations()`) and its answer digest. They live
   in a module `WeakMap` keyed by the resolution object
   (`subs/analysis/subs/project/src/resolve-root.ts:22`), so the evidence goes
   away with the resolution. `resolveProjectRoot(request, signal, known)` at
   `:72` takes earlier resolutions, most recent first. It validates only the
   first whose request key equals this request's (`:76`). The key is the raw
   `[cwd, root ?? null, scope, configuration]`, the same fields the daemon's
   `invocationKey` compares. `unchanged` at `:52` replays the recipe with 16
   concurrent replays, then compares digests. A replay failure counts as a
   change; a cancellation still throws. A fresh success is recorded at `:89`.
   `resolveProject` passes `known` through
   (`subs/analysis/src/resolve-project.ts:6`).
2. **Answer digest** (`subs/analysis/subs/project/src/capture.ts:301`). `answers`
   hashes each observation, sorted by path, as path, kind, canonical path, exact
   name, enumerated members and read-bytes hash. It leaves out stat metadata
   (size, times, device, inode) and the link text. So a file the resolution only
   probed answers the same after an edit, while the sweep's `signature` still
   detects the edit.
3. **Acquisition seed.** `acquireProject` records the resolution it made right
   after configuration acquisition and the references check, before any
   inventory query (`subs/analysis/subs/project/src/read-project.ts:68`). At
   that point the capture holds exactly the selection and configuration queries,
   as a standalone resolution's capture does. With a reused configuration, the
   replayed recipe holds the same queries. The seed reaches the session
   through the new port member `ProjectObserver.resolution`
   (`subs/analysis/subs/project/src/interfaces/project.ts:147`). The observer
   sets it on open and replaces it on a structural rebuild
   (`subs/analysis/subs/project/src/observer.ts:54`, `:388`). A later
   acquisition that fails validation drops its capture and the seed with it.
4. **Worker** (`subs/analysis/src/session-engine.ts`). `#invocationProblem`
   picks up the observer's current resolution when that object changes, then
   calls `resolveProjectRoot` with the session's known list
   (`subs/analysis/src/session-engine.ts:346-347`). `#remember` at `:357`
   keeps the latest four distinct resolutions, most recent first. A reused or
   fresh result moves to the front. The capability comparison and the
   comparison of the resolved root and configuration with the current facts'
   scope still run on every invocation. Dispose clears the list (`:254`).
5. **Daemon** (`subs/daemon/subs/contexts/src/context-manager.ts`). Each live
   context keeps `resolutions: Map<projectKey, ProjectResolution>`
   (`subs/daemon/subs/contexts/src/context.ts:15`, key at
   `subs/daemon/subs/contexts/src/queue.ts:36`), with at most four entries
   (`subs/daemon/subs/contexts/src/context-manager.ts:523`). `open` collects the
   resolutions of an equal request held by contexts with a live session
   (`knownFor`, `:515`). It passes them to `driver.resolve` (`:537`) and
   withdraws any it passed that the driver did not return (`:538`). It records
   the result on the existing or new context (`:549`, `:558`).
   `releaseSession` clears the map (`:67`), so a cold, abandoned or evicted
   context resolves again. `AnalysisDriver.resolve` gains the optional `known`
   parameter
   (`subs/daemon/subs/contexts/src/interfaces/contexts.ts:201`). The daemon
   service (`subs/daemon/src/service.ts:40`) and the resident driver
   (`src/resident-assembly.ts:68`) pass it through.

No session reply field was needed. The daemon uses its own recorded resolution,
not the observer's dependencies.

## Reuse and invalidation conditions

**Worker.** An update carrying an invocation skips the configuration helper
when all of these hold:

- the invocation's capabilities equal the session's (unchanged rule);
- the session holds a resolution of a request with equal `cwd`, `root`,
  `scope` and `configuration`, either the observer's acquisition seed or one of
  its last four check results;
- replaying that resolution's queries now gives the same answer digest.

The resolved root and configuration are then compared with the current facts'
scope, as before. A reused resolution for a root the session no longer has is
still refused.

**Daemon.** `openContext` skips the helper when all of these hold:

- some context, other than a cooling, cold or evicted one, has a live session and holds a resolution of a request
  with an equal project key;
- the driver's replay of that resolution gives the same answer digest.

The session's synchronization state and pending paths do not matter. The
validation reads the disk at open time, independent of whether the session has
applied queued watcher paths or a pending update. So the reused root is exactly
what a fresh resolution would select at that moment. Freshness of the
analysis itself remains the check's covering and update rules.

**Resolves again when:**

- a read configuration changes: the root `tsconfig.json`, an `extends` target or
  a `package.json` the compiler read;
- a configuration candidate on the discovery path is created or deleted;
- a `module.ramify` probed during the climb is created, deleted or changes kind
  or name case, including above the watched root;
- the working directory's or root's canonical path changes;
- the membership of a directory the compiler's file selection enumerated
  changes, including created or deleted source files there;
- any probed path changes kind (file, directory, symlink, other, absent) or
  canonical path;
- the request differs;
- in the daemon, no context with a live session holds the resolution (opening,
  cold, evicted or disposed);
- the replay fails for any reason.

## Why the validated discovery-input set is complete

Every filesystem query that `resolveProjectRoot` makes passes through its
capture:

- `selectRoot` uses `realPath`, `directoryExists`, `kind` and `hasExactEntry`;
- `findConfiguration` uses `fileExists` and `realPath`;
- the root description's symlink check uses `kind`;
- the configuration helper uses `readFile`, `fileExists`, `directoryExists`,
  `realPath` and `readDirectory`, whose kind probe for each entry is an
  observation too.

Each call answers from one recorded observation, or from two for a symlink:
kind, canonical path, exact name, members or bytes. Those are exactly the
fields the answer digest hashes. The recipe is the capture's complete
observation list after a successful resolution. The helper receives only the
root and configuration path derived from those answers, so it sees no other
input.

Resolution is deterministic given its answers. Replaying the same queries with
the same answers therefore makes the same selection and finds the same
configuration. It also produces the same compiler options, `references`
and file list, so the references-only outcome is the same. The same holds for
byte and count limits: the replay admits the same paths and bytes under the
same limits and fails, which counts as a change, where the original would.

Not covered by answers:

- stat metadata, which no query returns;
- symlink text, which is used only through the canonical path;
- the 30 s deadline, which is a property of timing, not of inputs.

The acquisition seed is recorded at the point where the acquisition capture
holds the same query set. If a discovery input changes before acquisition
finishes, the acquisition's final `validate()` retries with a new capture and a
new seed.

The observer's `RetainedConfiguration.dependencies` would not be a complete
basis. They leave out found markers, which are role `dependency` with zero
bytes. They reflect disk as of the last apply or refresh, not now. And an
ancestor marker refreshed in place by a sweep changes them without a rebuild,
while the facts' scope keeps the old root.

## Cost

A scratch check, not a measurement run, on this worktree used 377 recorded
observations, 48 enumerations and one configuration read. A fresh resolution
took 226 to 233 ms. A reused one took 13 to 19 ms with 16 concurrent replays,
versus 29 to 41 ms sequentially. Replay cost grows with the helper's queries, so
S100 (1,811 helper callbacks per the analysis) will pay proportionally more.
Real-process figures follow the plan.

## Tests per matrix row

| Row | Test |
| --- | --- |
| HO-10 `invocation-check-reused` | `subs/analysis/src/tests/root-resolution.test.ts:26` `invocation-check-reused: an update with the session invocation performs no root resolution`. It counts `readConfiguration` calls through a module mock; acquisition's internal binding is not counted. The session invocation, a source edit and a return to the session invocation each count 0. A nested working directory counts 1, then 0. `invocationCheck` is present and positive on the reused check. The test ends with `audited` and `equalToBatch`. |
| HO-11 `root-resolution-reused` | `subs/analysis/subs/project/src/tests/resolve-root.test.ts:72` `root-resolution-reused: an equal request reuses a known resolution while every discovery query answers the same`. It counts real helper spawns (`PROCESSWRAP`). The same object is returned with 0 spawns, also after a source edit. Another request spawns. The first equal candidate in a list is used. An observer seed is reused and is replaced by its rebuild's. `subs/daemon/subs/contexts/src/tests/root-resolution.test.ts:8` `reopening a known context with a live session performs no root resolution` uses the scripted driver's `resolveCalls`: hook opens with new leases reuse and the check still answers; a different `cwd` resolves once, then reuses. `subs/daemon/subs/contexts/src/tests/root-resolution.test.ts:34` `an opening, cold or evicted context resolves again`. |
| HO-12 `root-resolution-invalidated` | `subs/analysis/subs/project/src/tests/resolve-root.test.ts:115` `root-resolution-invalidated: ...`. With real files, each of these spawns and returns a new object, which is then reused: a created configuration candidate, a configuration edit, a created source file in an enumerated directory, a deleted candidate (discovery continues to the ancestor), and an ancestor description that moves the root. A references-only configuration is unavailable. `subs/analysis/src/tests/root-resolution.test.ts:56` `root-resolution-invalidated: a configuration edit resolves again and a moved root is refused`: a `tsconfig.json` edit counts 1, then 0; a description in `src/` moves the invocation's root and the update is refused with `The invocation resolves to …, not this session's …`, again on repeat; removing it resolves once and revises. `subs/daemon/subs/contexts/src/tests/root-resolution.test.ts:66` `changed discovery answers resolve again and a moved root opens its own context`: the stale resolution is withdrawn, and a moved root creates a context for `/moved` rather than returning the old token. |

Mutation checks, reverted before the commit:

- Passing no known resolutions in the engine failed both analysis tests.
- Passing none in the manager failed all three contexts tests.
- Dropping the live-session condition and the clearing in `releaseSession`
  failed the opening, cold or evicted test.

## Revised expectations

No existing expectation changed. Test support changed as follows:

- `instrumentObserver` in `subs/analysis/src/tests/session-test-fixture.ts:121`
  forwards the new `resolution` member.
- The scripted driver's `resolve`
  (`subs/daemon/subs/contexts/src/tests/scripted-driver.ts:88`) honours `known`
  as a real driver would: it returns the first known resolution until
  `changeDiscovery()` is called. It also records `resolveCalls`. Existing tests
  that reopen a context now receive an identical, reused resolution object.
- The existing `invocationCheck > 0` expectations in `session-revision.test.ts`
  and `session-worker.test.ts` still hold: a reused check replays on disk.

## Verification

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/subs/project/src/tests` | 8 files, 137 tests passed |
| `npx vitest run subs/analysis/src/tests` | 13 files, 212 tests passed |
| `npx vitest run subs/daemon/subs/contexts/src/tests` | 9 files, 105 tests passed |
| `npm run type-check` | exit 0 |
| `git diff --check` | clean; new files have no trailing whitespace |
| `npx vitest run subs/daemon/src/tests/session-counters.test.ts` (driver pass-through) | 1 test passed |

The cucumber-viz commit audit runs on the worktree after the commit.

## Deviations and limits

- **Validation basis.** Deliverable 2 suggested validating against the
  configuration dependencies the observer holds. The daemon instead replays the
  queries of its own recorded resolution on disk. The observer's set is
  incomplete and reflects the last apply; see the completeness section.
  Replaying on disk also removes any dependence on queued paths or a pending
  update. No session reply field was added.
- **Owners outside the list.** `subs/daemon/src/service.ts` and
  `src/resident-assembly.ts` each pass the new optional `known` argument
  through; without that, production would never reuse.
- **Additive contract changes.** Three members change additively:
  `ProjectObserver.resolution`, and a `known` parameter on
  `resolveProjectRoot`, `resolveProject` and `AnalysisDriver.resolve`. The
  Plan 5 contracts document still shows the earlier signatures; resolved
  decision 5 covers the change and no exposure line was added.
- **Not free.** A reused resolution still costs a replay proportional to the
  helper's queries, including an `lstat` and `realpath` per entry of every
  enumerated directory. A possible exact narrowing, not implemented, would take
  entry kinds from `readdir` with file types and derive canonical paths from
  the parent's. Validation could only skip enumerations when `references` is
  empty, and would then miss enumeration read failures and limits, so it was
  not adopted.
- **Created and deleted files re-resolve.** The compiler's file selection
  enumerated their directory, so a hook for a new or removed file still spawns
  the helper once in the daemon and once in the worker.
- **Bounds.** A session keeps four resolutions and a context keeps four, one per
  project key. Evidence holds the recipe, one object per observation, and
  leaves with its resolution.
- **Seen while testing, unchanged.** An invocation refusal is projected as an
  `internal-error` diagnostic with the refusal message. A session updated with a
  different working directory keeps its observer's `invokedFrom` and
  `selection` in the report scope, so it differs from a batch run of that
  invocation. Both behaviours predate this iteration.

## Handoff to iteration 5

- **Reuse condition.** Invocations are compared by `invocationKey`
  (`subs/daemon/subs/contexts/src/queue.ts`), unchanged: raw `cwd`,
  `root ?? null`, `scope`, `configuration`, `registry` and `capabilities`.
  Resolution reuse compares only the project part, `projectKey` in the same
  file, whose fields match the resolver's own request key.
- **Worker.** `update(changes, control, invocation)` still validates on every
  invocation, but performs no helper spawn while answers are unchanged.
  `timings.invocationCheck` now measures a replay in that case.
- **Daemon.** `LiveContext.resolutions` is private state cleared with the
  session. `OpenOutcome` and `ContextStatus` are unchanged. A covering decision
  in iteration 5 can keep comparing `invocationKey(entry.invocation)` with
  `invocationKey(context.invocation)`; nothing here changes when
  `context.invocation` advances (after a `revised` update).
