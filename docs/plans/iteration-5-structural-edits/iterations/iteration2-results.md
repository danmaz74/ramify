# Iteration 2 results: Validate resolution reuse by discovery queries only

**Date:** 2026-09-13. **Outcome:** SE-3 to SE-5 pass; HO-10 to HO-12 still
pass with the expectations resolved decision 3 changes. A recorded resolution
is now reused while its discovery queries answer the same. A created or deleted
source file, or a configuration content edit, therefore spawns no configuration
helper in the worker's invocation check or on a daemon reopen. Every change
that can alter the outcome still resolves again. On the reference example a
reused resolution now replays 5 observations instead of 155, in about 0.3 ms
instead of about 10 ms. Direct work; no Studio workflow.

## Implemented behavior

- **Discovery snapshot.** `resolveCapturedRoot` makes the root description's
  symlink probe after `selectRoot` and `findConfiguration`. It then returns
  the resolution with a `discovery` snapshot of the capture's observations and
  answer digest (`subs/analysis/subs/project/src/resolve-root.ts:44-51`).
  Selection has already observed the root marker, so the probe adds no path
  and changes no captured input. Both call sites take the snapshot there,
  before any configuration query: `resolveProjectRoot` (`:105`) and
  `acquireProject` (`subs/analysis/subs/project/src/read-project.ts:61`).
- **Recording.** `recordResolution` (`resolve-root.ts:59-65`) keeps the
  discovery snapshot as the evidence to replay. If the configuration read
  afterwards has references, it keeps the capture's full observations and
  digest instead, as before this iteration. Both call sites pass
  `config.references.length > 0` (`resolve-root.ts:111`, `read-project.ts:68`).
- **Validation.** `unchanged` (`resolve-root.ts:71-83`) replays the recorded
  queries on a fresh capture and compares the digest, unchanged in mechanism.
  A discovery snapshot contains no directory listing and no read bytes, so its
  digest covers kind, canonical path and exact-name membership only.
- **Refusal at acquisition.** A reused resolution does not re-read the
  configuration. A solution-style rewrite is refused by `acquireProject` with
  `references-only-configuration`, and the observer's structural rebuild
  reports it as `incomplete` with that code. An enumerated directory made
  unreadable is refused with `read-failure`. These are the codes a fresh
  resolution reports. The session engine projects the rebuild's refusal as
  described under [Deviations](#deviations).

## Contract shapes

All private to `analysis/project`; no exposure line, package entry or port
member changed.

```ts
// subs/analysis/subs/project/src/resolve-root.ts
export interface AnsweredQueries {
  readonly observations: ReturnType<Capture['observations']>;
  readonly answers: string;
}
interface ResolutionEvidence {
  readonly request: string;
  /** The discovery snapshot, or every query when the configuration has references. */
  readonly replay: AnsweredQueries;
}
export async function resolveCapturedRoot(capture: Capture, request: ProjectRequest):
  Promise<{ resolution: Resolved; discovery: AnsweredQueries }>;
export function recordResolution(capture: Capture, request: ProjectRequest, resolution: Resolved,
  discovery: AnsweredQueries, references: boolean): Resolved;
```

`resolveProjectRoot(request, signal, known)` keeps its signature. The comment
on `ProjectObserver.resolution`
(`subs/analysis/subs/project/src/interfaces/project.ts:146`) now says
"discovery queries".

## The validated query set

For a request, the discovery snapshot holds these observations:

- **Working directory.** `realPath(cwd)` and `directoryExists(cwd)`, plus the
  canonical target when `cwd` is a symlink.
- **Given root.** `kind(given)`, `realPath(given)`, `directoryExists(root)` and
  the exact-name marker `root/module.ramify`.
- **Found root.** The exact-name `module.ramify` probe of each directory
  `nearest` visits. That is from the invocation directory up to the first
  marker, then from each candidate's parent up to the next marker or `/`, and
  the parent marker of a child directly beneath `subs/`.
- **Configuration discovery.** `fileExists` and `realPath` of `tsconfig.json`
  at the root and each ancestor up to the first found, plus a symlink's
  canonical target.
- **Root description.** The symlink probe of `root/module.ramify`.

**Why it is complete for the outcome.** A resolution's result is `root`,
`invokedFrom`, `selection` and `configuration`, or a refusal. `selectRoot` and
`findConfiguration` read nothing but the answers above. Each is one
observation's kind, canonical path or exact-name membership, the fields the
digest hashes for an observation without bytes or members. Both functions are
deterministic in those answers. If every recorded query answers the same, the
functions make the same queries in the same order and return the same root,
invocation directory, selection and configuration path. The symlink refusal is
decided by the root marker's kind, which is in the set. What a fresh resolution
also decides after the snapshot comes from the configuration helper:

- the references-only refusal;
- the helper's read failures;
- its byte and count limits.

Resolved decision 3 moves those to acquisition, which reads the configuration
again on every acquisition or structural rebuild. A configuration that
already has references keeps the full replay, so its content still takes part
in validation.

Not in the set and not needed for the outcome: directory listings of the
include walk, configuration and `package.json` bytes, `extends` targets, and
stat metadata.

## Replay cost on the reference example

Scratch script outside the repository, not committed. It resolved
`examples/collection-review` from its root in process, 5 fresh resolutions,
then 20 validations of a known resolution. The table gives three runs each on
`fea416f` (before) and on the change (after).

| | Before | After |
| --- | ---: | ---: |
| Replayed observations | 155 (56 enumerations) | 5 |
| Reused resolution, median of 20 | 9.9, 10.5, 8.7 ms | 0.2, 0.3, 0.3 ms |
| Reused resolution, range over the runs | 5.5 to 13.6 ms | 0.2 to 0.6 ms |
| Fresh resolution with helper, median of 5 | 210.7, 220.2, 223.1 ms | 233.1, 207.3, 205.8 ms |

The five observations from the root are the root directory, its marker, the
two ancestor markers up to the repository's `module.ramify`, and the
`tsconfig.json`. From `src/` there is one more, the `src/module.ramify` probe.
The count depends on the climb, not on the project's size, so the S100
replay should be of the same order. The saving on the S100 rows is not
measured here: it removes the helper spawn that membership and configuration
edits used to cause, which the plan estimates at about 890 ms per hook.

## Moved attribution points

| Change after a recorded resolution | Before | After |
| --- | --- | --- |
| Configuration rewritten as solution-style | the worker's invocation check or the daemon's `openContext` resolved again and refused with `references-only-configuration` | resolution reused; `acquireProject` refuses with `references-only-configuration`, and the observer's rebuild reports `incomplete` with it |
| An enumerated directory made unreadable | the replay failed and a fresh resolution refused with `read-failure` | resolution reused; `acquireProject` refuses with `read-failure`, status `incomplete` |
| Configuration bytes, an `extends` target or the include walk's membership changed | resolved again, same outcome | reused |

## Matrix rows

| ID | Evidence | Result |
| --- | --- | --- |
| SE-3 | `subs/analysis/subs/project/src/tests/resolve-root.test.ts:116` `resolution-survives-membership: a created or deleted source file in an enumerated directory reuses the resolution`: real files, spawns counted through `PROCESSWRAP`. A created file in `src`, a created file in a new `src/nested`, and a deleted file each return the same object with 0 spawns. `readProject` still inventories the current membership. An observer's seed survives a created and a deleted file through local updates and is reused with 0 spawns | pass |
| SE-3 | `subs/analysis/src/tests/root-resolution.test.ts:68` `resolution-survives-membership: a created or deleted source file reuses the resolution in the invocation check`: real session engine, resolver wrapped by module mock. Updates for a created and a deleted `subs/branch/src/extra.ts` with the session invocation count 0 resolutions. So do the nested invocation and the session invocation afterwards. The revisions include, then omit, the file; `audited` and `equalToBatch` hold after each | pass |
| SE-3 | `subs/daemon/subs/contexts/src/tests/root-resolution.test.ts:66` `resolution-survives-membership, resolution-survives-configuration-bytes: hooks for a created or deleted file or a configuration edit reopen with the known resolution`: scripted driver with unchanged discovery answers. Hooks for a created file, a deleted file (expected absent) and a watcher `tsconfig.json` edit each reopen the same context and receive the known resolution. The replies are published revisions 2 to 4, with one resolution and one session open in total | pass |
| SE-4 | `resolve-root.test.ts:156` `root-resolution-invalidated, resolution-invalidated-by-discovery: ...`. Each of these spawns once and returns a new object, which is then reused: a created configuration candidate on the climb, a deleted one (discovery continues to the ancestor), a created ancestor description (root moves up), its deletion (root moves back), a created `src/module.ramify` (root moves to `src`), and its deletion. A deleted root description gives `root-not-found`. A root description replaced by a symlink gives `symlink-description`, never the known resolution | pass |
| SE-4 | `resolve-root.test.ts:208` `resolution-invalidated-by-discovery: a changed canonical path of the working directory resolves again`. A symlinked working directory re-pointed at another project spawns once and returns that project's root, invocation directory and configuration. A `tsconfig.json` replaced by a symlink to another file spawns once and returns the new canonical configuration path | pass |
| SE-4 | `root-resolution.test.ts:127` `root-resolution-invalidated, resolution-invalidated-by-discovery: ...` (session engine). Deleting the root `tsconfig.json` refuses the invocation with `No tsconfig.json at the root or its ancestors`. Recreating it makes the earlier resolution's answers equal again, so it is reused and the update revises. A created `subs/branch/src/module.ramify` resolves once and is refused as a moved root, again on repeat. Its removal resolves once and revises. The session invocation counts 0 throughout and equals batch | pass |
| SE-5 | `resolve-root.test.ts:237` `resolution-survives-configuration-bytes: ...`. A `target` edit, a created `extends` target, and an edit of that target reuse with 0 spawns. After a solution-style rewrite, resolution is still reused. A fresh resolution, `readProject`, and the observer's `apply` of the edit each refuse with `references-only-configuration`. With `src/nested` at mode 000 (skipped when running as uid 0), resolution is reused, while a fresh resolution and `readProject` refuse with `read-failure`. A resolution recorded with references still spawns again after a content edit and after a membership change | pass |
| SE-5 | `root-resolution.test.ts:96` `resolution-survives-configuration-bytes: a configuration edit reuses the resolution and a solution-style rewrite is refused by acquisition` (session engine). A `strict` edit counts 0 resolutions, revises, audits equal and equals batch. A solution-style rewrite counts 0. Batch reports `references-only-configuration`, and the session reports a failure diagnostic with the same message (see Deviations). Restoring the configuration counts 0, revises and equals batch | pass |

**HO-10 to HO-12.** `invocation-check-reused` (`root-resolution.test.ts:38`)
is unchanged and passes. `root-resolution-reused` (`resolve-root.test.ts:72`)
and both contexts reuse tests pass. The first has one revised step: an
observer's seed is now reused after a configuration edit. The HO-12 cases were
merged into the SE-4 tests above, with the revisions listed under
[Revised expectations](#revised-expectations).

**Mutation checks**, reverted before the commit:

- Forcing `unchanged` to return true failed 4 of the 12 resolution tests: both
  SE-4 project tests, the SE-4 session test and the SE-5 project test.
- Always replaying the full observations failed 5: `root-resolution-reused`
  and both SE-3 and both SE-5 tests in `analysis/project` and `analysis`.

## Revised expectations

Resolved decision 3 supersedes these HO-11 and HO-12 expectations from
[hook optimization iteration 4](../../iteration-5-hook-optimization/iterations/iteration4-results.md):

- `resolve-root.test.ts` `root-resolution-reused`: an observer seed was
  expected to resolve again after a `tsconfig.json` content edit; it is now
  reused with 0 spawns. The rebuild still replaces the seed.
- `resolve-root.test.ts` `root-resolution-invalidated`: a configuration edit
  and a created source file in an enumerated directory were expected to
  resolve again; they moved to the SE-5 and SE-3 tests as reuse. A references-only rewrite was expected to fail resolution; with a
  known resolution it is now reused and refused by acquisition.
- `root-resolution.test.ts` `root-resolution-invalidated`: a `tsconfig.json`
  edit was expected to count 1; it now counts 0 (SE-5 test). The case is
  replaced by the deletion and recreation of the configuration on the
  discovery path.
- The contexts test comment for `changeDiscovery()` no longer calls the
  change a configuration edit.

## Commands

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/subs/project/src/tests` | 8 files, 140 tests passed |
| `npx vitest run subs/analysis/src/tests/root-resolution.test.ts` | 4 tests passed |
| `npx vitest run subs/daemon/subs/contexts/src/tests/root-resolution.test.ts` | 4 tests passed |
| `npx vitest run subs/daemon/subs/contexts/src/tests` | 9 files, 118 tests passed |
| `npx vitest run subs/analysis/src/tests` | 14 files, 218 tests passed, for the `invocationCheck` expectations |
| `npm run type-check` | pass, including the portable, scripts and reference-harness projects |
| `git diff --check` | clean |
| Replay timing, `npx tsx <scratch>/replay.mts examples/collection-review` | three runs before and after; figures above |

## Deviations

- **The session projects a refused reacquisition as `internal-error`.** The
  engine's `revise` turns an observer `incomplete` result into a failure
  report through `ReportDraft.failure`. That keeps only `read-failure`,
  `changed-input` and `resource-limit` as codes, so a solution-style rewrite
  is reported as `internal-error` with the batch message
  `Solution-style configurations are unavailable; referenced configurations: ...`,
  and batch reports `references-only-configuration`. This predates the
  iteration: a watcher-driven configuration update already produced it.
  What changes is the hook: on a warm context, a hook after such a rewrite
  used to fail `openContext` resolution. The daemon then returned the batch
  report as `unresolved`. Now it reuses the context and receives the session's
  failure report as a `reported`, unpublished reply. Before, the
  invocation check itself refused with `internal-error`
  (`The invocation does not resolve to a project: ...`). The `read-failure`
  case keeps its code in both paths. The project layer refuses with the same
  codes, as SE-5 requires. Mapping the observer's issue codes in the session's
  failure projection belongs to `analysis`, outside this iteration's owner, and
  was not changed. Review decision 4 should decide whether the projection must
  carry `references-only-configuration`.
- **Tests outside `analysis/project`.** Deliverable 4 names the `analysis`
  and `daemon/contexts` tests; no source outside `analysis/project` changed.
- **The daemon evidence is scripted.** `daemon/contexts` cannot import the
  real resolver, and its driver is scripted. Its test shows the manager keeps
  offering the known resolution across membership and configuration
  revisions. That the real reopen spawns no helper follows from the same
  `resolveProjectRoot` call, which the `analysis/project` tests exercise on
  disk. No real daemon process was run.
- **A resolution recorded without references survives a configuration that
  gains them.** The full-replay rule applies to the configuration as read when
  the resolution was recorded. Acquisition reads the new one and records its
  own seed with the full replay.

## Remaining limits

- **Not measured in the real process.** The saving on S100 is still the plan's
  estimate; the measurement successor reads `invocationCheck` and the daemon's
  open time from hook replies.
- **The unreadable-directory case** is skipped when the tests run as uid 0,
  where mode 000 does not prevent reading.
- **A configuration with references** still validates by full replay, so its
  hooks for created or deleted files still spawn the helper in both places.

## Successor inputs

- **Iteration 6.** The validated set is the discovery snapshot above. It holds
  no configuration bytes, no `extends` target and no listing. An options-only
  configuration edit that keeps the inventory and capture keeps
  `ProjectObserver.resolution`, and that seed stays valid without any
  comparison, so iteration 6 must not reintroduce one at resolution time.
  One exception: a seed recorded from a configuration with references replays
  every query. After a kept-inventory edit it no longer validates, so the
  next hook resolves again once in the worker and once in the daemon. Either
  replace the seed when the projection is re-read or accept that cost for
  referenced configurations. The references-only refusal must remain on
  iteration 6's re-read path. It is the only place a solution-style rewrite is
  now refused.
- **Iteration 4.** The membership path does not touch resolution: the
  observer keeps its seed across local updates (SE-3 project test), and the
  worker's invocation check replays only the discovery snapshot. Nothing in
  the membership design needs to preserve a listing for resolution.
- **Iteration 7 and the measurement successor.** On the created, deleted and
  configuration rows, `invocationCheck` should fall from about 500 ms on S100
  to a few milliseconds, below the narrow-edit replay of about 70 ms, and the daemon's pre-check open should lose its
  helper spawn. The configuration row still spawns the helper once in the
  observer's rebuild.
- **Review decision 4.** Record the session's `internal-error` projection
  above beside the accepted move of attribution.
