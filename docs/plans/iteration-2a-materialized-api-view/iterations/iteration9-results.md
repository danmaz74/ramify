# Iteration 9 results: Agent workflow, process and resource evidence

**Status:** complete. **Plan:** [Plan 2A](../main-plan.md). **Iteration:**
[iteration9.md](iteration9.md). **Owners:** repository agent/ignore guidance,
reference harness process cases, measurement scripts/artifacts and
documentation tests.

## Summary

The documented `rg` agent workflow (`I2A-11`, all six leaves) and the scale/
determinism/resource evidence (`I2A-12`, all eight leaves) both run against
the real, compiled, installed `ramify materialize` and the real production
daemon. Root `AGENTS.md` states the exact two `rg` commands, the generated/
gitignored/no-edit/no-import rule, the completeness/no-combine rule, the
refresh command and the coverage-limit caveat, verbatim from the
specification's "Agent instructions" section. A new
`scripts/measurements/plan2a.mjs` workload runs real installed-CLI/daemon
measurements on R, T, S100 (complete per policy) and S1000 (a real sanity/
smoke attempt, never forced), plus an 8-cycle repeated-materialization
plateau on R and S100; a new `scripts/measurements/plan2a-platform.mjs`
produces a checked-in relative-path/bytes/SHA-256 manifest plus real symlink-
refusal, rollback and no-op process evidence, archived at
`scripts/measurements/results/plan2a-platform-linux.json`. No macOS runner
exists on this host, so the `I2A-12:linux-macos-bytes` leaf fails honestly
(the one leaf this iteration's brief expects not to pass) rather than passing
on Linux evidence alone; the exact macOS command and artifact location are
recorded below.

`examples/collection-review` (R) has no `AGENTS.md` of its own and none was
added: the specification's "project's `AGENTS.md`" instructs whatever project
*uses* Ramify, and R is this toolkit's own reference/example application, not
a separate downstream project; the root `AGENTS.md` already documents the
workflow from any module root. This decision is recorded here, per the
coordinator's note, rather than silently assumed.

`which rg` confirms ripgrep 13.0.0 is installed on this host, so every
`I2A-11` leaf uses the real, documented `rg` command with no substitute
binary.

## Files changed

**Repository root:**
- `AGENTS.md` — added a "Foreign API discovery" section: the exact two `rg`
  commands, the generated/gitignored/no-edit/no-import rule, the
  completeness/no-combine sentence, the refresh command and the
  coverage-limit caveat, transcribed verbatim from
  [`materialized-api-view.spec.md`](../../../architecture/materialized-api-view.spec.md#agent-instructions).
- `package.json` — added `measure:plan2a` and `measure:plan2a-platform`
  scripts.

**Reference harness** (new, per the brief):
- `scripts/reference-harness/plan2a-workflow-cases.ts` (new) —
  `plan2aWorkflowHandlers`, all six `I2A-11:*` leaves. Uses
  `withSequenceProcess` (iteration 8's own process fixture, reused unchanged)
  against isolated, `git init`-and-committed copies of R and T, and a small
  purpose-built F fixture for the type-only-as-value negative (see "Design
  notes").
- `scripts/reference-harness/plan2a-scale-cases.ts` (new) —
  `plan2aScaleHandlers`, all eight `I2A-12:*` leaves. Six read archived
  `plan2a.mjs`/`plan2a-platform.mjs` evidence (by spawning the real `.mjs`
  reader as a child process, matching `plan5-fast-measure-cases.ts`'s own
  precedent, rather than importing untyped `.mjs` modules into this strict
  TypeScript harness); `limit-preservation` runs live against a real
  `createQuickEnvironment` with an injected, real
  `createFilesystemApiViewPublisher` at tight limits.
- `scripts/reference-harness/plan2a-runtime.ts` — merged
  `plan2aWorkflowHandlers`/`plan2aScaleHandlers` into the registered handler
  map and added the `'agent-workflow'`/`'scale-evidence'` capabilities
  (already declared in `instances.ts`'s `verificationCapabilities` and
  `plan2aGroupCapabilities`; no new capability name needed).

**Measurement scripts** (new, per the brief):
- `scripts/measurements/plan2a-fixtures.mjs` (new) — shared helpers:
  `isolatedProject` (a fast, symlinked-`node_modules` copy of R or T),
  `runCommand`, `pollDaemonStatus` (polls `daemon status --format json` and
  tracks the daemon host's own `memory.rss`/`heapUsed` plus its open
  context's worker thread and native compiler child RSS/heap, none of which
  appear in the host's own reading alone), `parseMaterializeSummary`,
  `materializeMetrics` (files/entries/bytes/ordinary-tests duplication/
  largest areas from the real generated tree).
- `scripts/measurements/plan2a-inputs.mjs` (new) — `plan2aInputs`/
  `plan2aDependencies`, shared by `plan2a.mjs` (which records them) and
  `verify-plan2a-evidence.mjs` (which recomputes them fresh and requires an
  exact match), matching `fast-inputs.mjs`'s own role for Plan 5.
- `scripts/measurements/plan2a.mjs` (new) — the `measure:plan2a` workload
  driver: `reference`, `toolkit`, `synthetic-100`, `synthetic-500` (excluded
  from the default set by policy), `synthetic-1000`, `repeat-plateau`.
- `scripts/measurements/plan2a-platform.mjs` (new) — the
  `measure:plan2a-platform` driver: materializes the small, checked-in
  `plan2a-materialize-fixture.ts` through the real CLI/daemon and records a
  relative-path/bytes/SHA-256 manifest, a real unchanged no-op, a real
  symlinked-target refusal and a real permission-fault rollback.
- `scripts/measurements/verify-plan2a-evidence.mjs` (new) — reads the newest
  archived `plan2a.mjs` report whose recorded inputs match the current
  source/build/recipe identity and recomputes every predicate from the raw
  measurement; the reference-harness handlers spawn it rather than
  re-running a heavy workload inside the verification gate.
- `scripts/measurements/archive.mjs` — added `'ramify.plan2a-measurements/1'`
  to the accepted `schemaVersion` allow-list and a `plan2a` archive-filename
  prefix branch (the existing `resident`/`fast`/`batch` pattern, extended by
  one more schema; no existing behavior changed).
- `scripts/measurements/README.md` — added a "Plan 2A materialize scale and
  platform measurements" section: both commands, what each records, the
  measurement-policy exclusions, the evidence reader, and the exact macOS
  command/artifact path.
- `scripts/measurements/results/plan2a-platform-linux.json` (new, checked
  in) — the real Linux platform manifest/process report.
- `scripts/measurements/results/*.gz`, `scripts/measurements/results/index.json`
  — archived raw `plan2a.mjs` reports (see "Commands run"; three earlier
  archived attempts from this iteration's own diagnosis of a resource-
  contention issue, a transient build-identity mismatch and a copy-source
  contamination (see "Design notes") are retained rather than deleted,
  matching every other measurement directory's existing convention of
  keeping historical/diagnostic runs).

**Documentation:**
- `docs/development/testing.md` — added `dist/src/ramify materialize [...]`
  beside the existing `check --changed` row, and `npm run measure:plan2a`
  beside `npm run measure:fast`.

Not touched: any `src/`/`subs/` production source, `docs/architecture/README.md`,
`docs/roadmap.md`, `iterations/manifest.json`, `plan.json`, any other
iteration's already-modified files, and
`docs/plans/iteration-3-project-inspection/` (untouched, as required).
`examples/collection-review/AGENTS.md` was deliberately **not** created (see
"Summary").

## Matrix leaves executed

### I2A-11 (agent `rg` workflow and repository integration), all six

| ID | Evidence | Result |
| --- | --- | --- |
| `agent-instructions` | `plan2a-workflow-cases.ts`, real `AGENTS.md` text | Passed: 8 assertions — generated/gitignored/never-edit-or-import, both exact `rg` commands verbatim, the completeness/no-combine sentence, the refresh command, the coverage-limit caveat |
| `gitignored` | Isolated, `git init`-and-committed copies of R and T, compiled `dist/src/ramify`, owned `RAMIFY_ENDPOINT_DIR` (one daemon session per copy) | Passed: `git status --porcelain` is empty both before and after a complete `materialize --all`, for both R and T; no output ever mentions a `.ramify` path |
| `ordinary-hidden` | R copy, `subs/workspace/subs/reviews` | Passed: a plain recursive `rg -n InvocationContext` finds nothing; the documented `rg -n -i -C 6 InvocationContext src/.ramify/{external,children}` finds the real interface signature, its real first documentation paragraph and its real `[type-only]` marker |
| `tests-self-contained` | Same R copy | Passed: the documented test path alone finds `createReviewRuntime` (shared with ordinary) and `createTestSystem` (a real root `expose-test ... to descendants` binding, test-only); an independent check confirms `createTestSystem` is genuinely absent from the ordinary view |
| `category-search` | Same R copy | Passed: `createReviewRuntime` (owned by the child `reviews/subs/core`) is found only under `children`, with its real documentation; `InvocationContext` (owned by the ancestor root) is found only under `external`; neither crosses into the other category; no npm/built-in package name (`@trpc/server`, `@modelcontextprotocol`, `zod/`, `node_modules`) ever appears |
| `derived-import-check` | Same R copy (positive) plus a small purpose-built F fixture (negative) | Passed: a new file's import of `createReviewRuntime`, its relative specifier derived from the real generated `children/.../runtime.ts.md` defining path (never hand-written), passes `ramify check --batch` with zero denials; a `class Widget` exposed without `browser` to a `tagged [browser]` consumer is genuinely `[type-only]` there (a real value-and-type original, unlike R's interface-only type-only originals), and a plain `import { Widget }` used as a value is denied with `required-symbol-tag`, exactly once, only on the negative file |

### I2A-12 (scale, determinism and resource evidence), all eight

| ID | Evidence | Result |
| --- | --- | --- |
| `reference-scale` | `npm run measure:plan2a`, archived report, `verify-plan2a-evidence.mjs` | Passed: real cold/warm materialize, real peak combined daemon RSS/heap samples, real filesystem metrics — see "Measurements" |
| `toolkit-scale` | Same | Passed |
| `synthetic-100` | Same | Passed |
| `synthetic-500` | Same | Passed: genuinely `not-executed` (never a fabricated measurement object), with the exclusion documented by name in the report's `measurementPolicy` field |
| `synthetic-1000` | Same | Passed: a real, actually-attempted cold and warm materialize, both completing (see "Measurements"); the real observed outcome is recorded, not forced |
| `repeat-plateau` | Same | Passed: 8 real materialize cycles on R and on S100; every cycle after the first writes 0 bytes; zero stage/rollback siblings ever accumulate |
| `limit-preservation` | Live `createQuickEnvironment` with a real, injected `createFilesystemApiViewPublisher` at tight limits | Passed: just-over `maxAreaBytes`/`maxStagedBytes` (the real baseline byte count minus one) are explicitly `resource-unavailable` and preserve the old target byte-for-byte; just-under (exact) controls complete normally; an exhausted controlled-clock deadline is explicitly `cold` and preserves the old target; a heap ceiling is recorded as not independently forceable (neither `ApiViewQueryLimits` nor `ApiViewPublishLimits` exposes one), never invented |
| `linux-macos-bytes` | `scripts/measurements/results/plan2a-platform-linux.json` (real) vs. `plan2a-platform-darwin.json` (absent) | **Failed, as expected**: the Linux report is real, current and passed (real symlink refusal, real rollback, real no-op, a 7-entry byte manifest); no macOS counterpart exists on this host, so the leaf fails honestly rather than substituting Linux success for the missing half |

## Measurements

Command: `npm run measure:plan2a` (`node --import tsx scripts/measurements/plan2a.mjs`).
Host: Linux 6.8.0-85-generic x86_64, Node v22.23.2, TypeScript 7.0.2.
Archive: `scripts/measurements/results/plan2a-2026-09-15T17-59-19.808Z-777e51b6-5ab9-43bd-8c21-ba88c1d79e7c.json.gz`.

| Workload | Files | Entries | Bytes | Duplicated bytes/entries | Largest ordinary area | Largest tests area | Cold | Warm (repeat) | Peak combined RSS / heap |
| --- | ---: | ---: | ---: | --- | --- | --- | ---: | ---: | --- |
| R (reference) | 153 | 551 | 124,460 | 56,556 / 261 | subs/workspace/subs/reviews (7 files, 26 entries, 6,593 B) | subs/workspace (15 files, 34 entries, 7,971 B) | 2,405 ms | 424 ms, 0 B written | 393.5 MB / 36.6 MB |
| T (toolkit) | 420 | 3,574 | 1,102,948 | 544,879 / 1,763 | root . (34 files, 214 entries, 68,035 B) | root . (35 files, 218 entries, 68,752 B) | 5,183 ms | 885 ms, 0 B written | 640.3 MB / 117.0 MB |
| S100 | 200 | 0 | 28,290 | 0 / 0 | subs/m001 (1 file, 143 B) | subs/m001 (1 file, 140 B) | 5,913 ms | 2,268 ms, 0 B written | 345.4 MB / 72.5 MB |
| S1000 (smoke) | 2,000 | 0 | 284,990 | 0 / 0 | subs/m001 (1 file, 144 B) | subs/m001 (1 file, 141 B) | 281,853 (~4.7 min) ms | 253,143 (~4.2 min) ms, 0 B written | 1,016.5 MB / 379.7 MB |

S100/S1000 show zero entries because their synthetic generator declares no
`expose-src`, exactly as iteration 1's frozen probe already established
(`scripts/probes/results/plan2a/scale-baseline.json`); this is not a
regression introduced here.

S500 was not run, per the carried-forward Plan 5 2026-09-11 measurement-policy
decision (advisory performance targets; S500 explicitly not required). The
report's `measurementPolicy.synthetic-500` field records this by name.

S1000's real, observed outcome on this host: cold and warm materialize both
complete (no predecessor resource-limit refusal was observed at this scale —
the synthetic generator's zero exposures keep retained facts far under Plan
5's 96 MiB `maxRetainedFactBytes` limit even at 1000 owners/14,002 files).
This is recorded as the actual result, never forced or retried toward a nicer
number; see "Design notes" for the three discarded attempts that preceded
this clean run.

**Repeat plateau** (`npm run measure:plan2a -- --workload repeat-plateau`):
8 cycles each on R and S100. Every cycle after the first reports 0 bytes
written and 0 stale `.ramify.tmp-*`/`.ramify.old-*` siblings, confirming the
settled zero-write/zero-temp-file plateau the leaf requires.

**Platform evidence** (`npm run measure:plan2a-platform`,
`scripts/measurements/results/plan2a-platform-linux.json`): first publication
(4 targets, 3 entries, 711 bytes written), a real unchanged no-op (0 bytes,
byte-identical manifest), a real symlinked-target refusal (`exit 2`, reason
`symlink`, the symlink itself untouched) and a real rollback (a genuine
`EACCES` permission fault on the second publish's staging directory forces
`output-failure`; the earlier target's bytes are restored byte-for-byte). The
manifest lists 7 real generated files with their relative paths, byte counts
and SHA-256 hashes.

**macOS**: not executed — no macOS runner exists on this host. A macOS
runner must run:

```sh
npm ci
npm run worktree:prepare
npm run build
npm run measure:plan2a-platform
```

which writes `scripts/measurements/results/plan2a-platform-darwin.json`; that
file should be committed beside the existing
`plan2a-platform-linux.json`. Until it exists, `I2A-12:linux-macos-bytes`
fails honestly on every host, matching this iteration's own result.

## Commands run

| Command | Outcome |
| --- | --- |
| `npm run type-check` | Clean (`tsc --noEmit`, `tsconfig.portable.json`, `tsconfig.scripts.json`, `scripts/reference-harness/tsconfig.json`) |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan2a.test.ts` | 1 file, 8 tests passed (the existing Plan 2A inventory/gate test; unaffected by this iteration's new handler files) |
| `npm run build` | Succeeded. Run four times total during this iteration (session start, plus three more while diagnosing the build-identity and copy-source issues in "Design notes"); every command below and the archived clean-run evidence reflect the final build |
| `dist/src/ramify check --batch --root .` | 0 errors, 0 warnings, 0 analysis limits; 11 owners, 303 source files, 2,958 allowed, 0 denied |
| `npm run measure:plan2a` | Passed (the fourth, clean attempt; see "Design notes" for the three discarded ones); archived at `scripts/measurements/results/plan2a-2026-09-15T17-59-19.808Z-777e51b6-5ab9-43bd-8c21-ba88c1d79e7c.json.gz` |
| `npm run measure:plan2a-platform` | Passed; `scripts/measurements/results/plan2a-platform-linux.json` |
| `npm run reference:verify -- --plan 2a --iteration 9` | **104 instances; 97 required, 96 passed, 1 failed, 7 not-executed.** The one failure is `I2A-12:linux-macos-bytes` (expected: no macOS runner on this host — see "Measurements"). The 7 not-executed are all `I2A-13:*` (iteration 10's own future leaves, correctly deferred). Every I2A-01 through I2A-12 leaf this and prior iterations own passes. |

## Design notes (not contract deviations)

- **Two real daemon/publisher defects were found while producing this
  iteration's own evidence, neither fixed here (both outside this
  iteration's owned scope), both reported precisely below rather than
  silently routed around or left undiscovered.** See "Required follow-up."
- **Three full `measure:plan2a` attempts during this iteration were
  discarded as contaminated or invalid, not reused as evidence; only the
  fourth, clean run's archive is cited above.**
  1. The first ran while this session's own focused `vitest`/`tsx`
     process-fixture checks were executing concurrently against separate,
     independently-started daemons; every `repeat-plateau` cycle and the
     `synthetic-1000` daemon-stop step failed under that resource contention
     (host CPU/npm-cache contention, not a product defect), and one
     `synthetic-1000` daemon was left running (a real leak, cleaned up:
     `kill` by PID once its owned endpoint directory had already been
     removed, since a graceful `daemon stop` needs the still-live socket).
  2. The second, run alone, hit a real but transient compiled-client/daemon
     build-identity mismatch (`this compiled client was built from runtime
     identity ... but /ramify holds ...`), reproducible from a plain `daemon
     status` call — consistent with the brief's own warning that iterations
     8/9/10 may build `dist/` concurrently. A fresh `npm run build`, verified
     immediately afterward with a direct `daemon status`/`materialize`/
     `daemon stop` round trip, resolved it.
  3. Diagnosing defect 2 above (below) included one manual
     `materialize --all --root examples/collection-review` invocation against
     the **live, checked-out** example (not an isolated copy), to sanity-check
     the rebuilt client. Its real, gitignored `.ramify` output was left on
     disk (git status stayed clean; the bytes did not). Every subsequent
     "isolated" R copy this iteration made — including the third `measure:plan2a`
     attempt — silently inherited that pre-existing output through a plain
     recursive copy, which is what surfaced defect 1 below (its `.old-`
     marker leak) so directly and consistently. The stray output was removed
     from the live example, and `isolatedProject` (`plan2a-fixtures.mjs`) and
     `isolatedGitProject` (`plan2a-workflow-cases.ts`) now exclude the exact
     `.ramify`/`.ramify.tmp-<hex>`/`.ramify.old-<hex>` names at every depth,
     not only at the copy root, so an isolated copy can never again silently
     inherit real generated output from its source tree. This fix is
     evidenced by the fourth (clean) run's own zero-stale-sibling
     `repeat-plateau` result at cycle 0. All three discarded raw reports and
     their gzip archives remain on disk (see "Files changed") rather than
     being deleted, matching this repository's existing convention of
     retaining historical/diagnostic measurement runs.
- **The `synthetic-1000` warm-repeat timeout needed raising from the
  originally-copied 120,000 ms to 480,000 ms** once real cold-materialize
  timing (roughly 280 seconds on this host) was observed: this is this
  iteration's own measurement-script calibration, not a change to any
  product timing contract.
- **`I2A-12:limit-preservation` uses the quick environment with an injected
  real publisher rather than the compiled process the reviewed leaf's fixture
  column nominally names** (`P/F`). The daemon's own `apiView`
  (session-query) area/invocation bound (`ApiViewQueryLimits`) is a frozen
  constant inside `createContextManager`, with no `DaemonServiceOptions`
  override; only the transactional filesystem publisher's own
  `ApiViewPublishLimits` is injectable, and only through
  `createQuickEnvironment`'s `publisher` fixture. This is exactly the
  coordinator's own instruction ("use the service with an injected
  publisher/limits in the quick environment ... heap limit may be recorded as
  not independently forceable"); the handler still exercises the real,
  exposed `createFilesystemApiViewPublisher` writing real files to a real
  temporary directory, not a mock.

## Contract deviations

None. No frozen shape in `contracts.md` changed; the `archive.mjs` schema
allow-list addition is additive shared-infrastructure, not a Plan 2A model or
contract change.

## Remaining limits

- macOS platform evidence is not executed on this host (see "Measurements").
- `synthetic-500` is intentionally not run, per the carried-forward
  measurement policy; its exclusion is documented, not silently absent.
- The `configuration-helper.ts` cross-root reuse crash and the
  `api-view-publisher.ts` `.old-` marker leak (see "Design notes") are
  reported, not fixed, since `subs/analysis/subs/project` and `subs/daemon`
  are outside this iteration's owned scope; see "Required follow-up."
- Iteration 1's own limitation stands unchanged: S100/S500/S1000's synthetic
  generator declares no `expose-src`, so every synthetic scale measurement's
  "entries"/"duplication" figures are structurally zero; they measure real
  file/byte/latency/memory behavior at scale, not availability-enumeration
  behavior at scale.

## Required follow-up for other owners

1. **`analysis/project`** (`subs/analysis/subs/project/src/configuration-helper.ts`,
   not editable by this iteration): a daemon session's per-root TypeScript
   configuration helper is reused across a later `materialize`/`check`
   request targeting a *different* project root within the same session,
   inheriting the OS working directory of whichever root it was first spawned
   against. If that first root's directory no longer exists by the time a
   later, different-root request reuses the helper, the native
   `typescript/unstable/sync` child process crashes
   (`panic: getwd: no such file or directory`) instead of the request failing
   gracefully or the helper being respawned with the new root's working
   directory. Exact reproduction: open a context (or otherwise cause a
   configuration helper to be created) against root A, delete root A's
   directory entirely, then send a `materialize`/`check` request against an
   unrelated root B over a daemon that still has the stale helper live. This
   is a real, if narrow, robustness gap for any long-running daemon serving
   multiple projects across their lifetimes (an agent that deletes or moves a
   project while a shared daemon is still up); it did not affect any
   iteration through 8, since no earlier leaf materialized two different real
   project roots in sequence over one shared session.
2. **`daemon`** (`subs/daemon/src/api-view-publisher.ts`, not editable by
   this iteration): a real, mainline `.ramify.old-<suffix>.marker.json`
   sibling-file leak on every ordinary "update" materialize (any second-or-
   later publish where a target's rendered content actually changed from a
   real, pre-existing view — not only the pathological case in finding 1).
   `switchTarget`'s success path (`api-view-publisher.ts`, the `switched:
   Prepared[]` loop's post-loop cleanup) removes each changed target's
   `.old-<suffix>` *directory* with `fs.rm(target.oldAbs)`, but never calls
   the existing `removeMarker(fs, target.oldAbs)` alongside it, unlike every
   other exit path in the same file (`switchTarget`'s own failure branch,
   `rollbackTarget`, `recoverSiblings`) which all pair a directory removal
   with its marker removal. The stray marker file is real, permanent (no
   later invocation removes it either, since `recoverSiblings` only acts on
   a marker whose described directory still needs reconciling — an already-
   absent `.old-` directory with a lingering marker is simply skipped: `if
   (targetStat) { ...rm(dirPath)...; rm(markerFilePath); continue; }` only
   fires when the *live target* exists, which it always does after a
   successful switch, so in principle this branch of `recoverSiblings`
   *should* reclaim it — but only on this target's *own next* invocation,
   and this iteration's runs each used a fresh directory per invocation, so
   this was not independently confirmed as self-healing across repeated real
   CLI invocations on one persistent project; the `bytesWritten`/`unchanged`
   counts and rendered content themselves are entirely unaffected either
   way). Exact reproduction: materialize a module with real content once
   (revision 1, first publication, no marker), make one real source edit
   that changes the rendered output, materialize again (revision 2, a
   genuine content-changed update) — a `.ramify.old-<32-hex>.marker.json`
   file now permanently exists beside the target `src[/tests]` directory,
   confirmed via a direct, unpolluted two-materialize reproduction on a copy
   of R's `shared-ui` module, independent of finding 1's pre-existing-tree
   scenario. No I2A-11/I2A-12 leaf's own pass/fail depends on this (none
   asserts the *absence* of a marker file, and `materializeMetrics`/`rg`
   both walk only the `.ramify` directory's own contents, never its marker
   siblings), so it does not block this iteration's own leaves, but it is a
   real, currently-uncaught gap in the publisher's own "identical reruns...
   change zero mtimes" and general filesystem-cleanliness intent.
3. No other file outside this iteration's owned scope needed a change.

## Handoff (for iteration 10)

- **Agent instructions are final**: root `AGENTS.md`'s "Foreign API
  discovery" section is the complete, verified text; iteration 10's
  documentation pass can reference it without further edits.
- **Process receipts**: `scripts/reference-harness/plan2a-workflow-cases.ts`
  (`plan2aWorkflowHandlers`) and `scripts/reference-harness/plan2a-scale-cases.ts`
  (`plan2aScaleHandlers`), both wired into `plan2a-runtime.ts` under the
  `'agent-workflow'`/`'scale-evidence'` capabilities.
- **Raw measurement evidence**: `scripts/measurements/plan2a.mjs`/
  `plan2a-platform.mjs`, archived per "Files changed"; iteration 10's
  completion report can cite `scripts/measurements/results/plan2a-2026-09-15T17-59-19.808Z-777e51b6-5ab9-43bd-8c21-ba88c1d79e7c.json.gz` and
  `scripts/measurements/results/plan2a-platform-linux.json` directly.
- **Known gaps to resolve or explicitly accept**: the `configuration-helper.ts`
  cross-root reuse crash and the `api-view-publisher.ts` `.old-` marker leak,
  both under "Required follow-up" above. Neither blocks any I2A-11/I2A-12
  leaf (all now avoid or are unaffected by the trigger), but iteration 10's
  final regression pass should decide whether either needs a source fix
  before Plan 2A's completion gate, or an explicitly accepted, documented
  limitation.
- **Platform evidence is half-complete by construction**: Linux passes;
  macOS needs a real runner to execute `npm run measure:plan2a-platform` and
  commit its output, per "Measurements" above, before
  `I2A-12:linux-macos-bytes` can pass anywhere.

## Coordinator follow-up

- **Follow-up 2 fixed.** After a committed switch, `api-view-publisher.ts` now
  removes each rollback directory and then its sibling ownership marker. The
  `I2A-07:stale-removal` test asserts that the target's parent holds only
  `.ramify` afterwards. Without the fix it failed, listing
  `.ramify.old-<suffix>.marker.json`. With the fix,
  `api-view-publisher.test.ts` and `api-view-publisher-crash-recovery.test.ts`
  pass (17 tests).
- **Follow-up 1 not fixed in Plan 2A.** The `panic: getwd` crash comes from a
  configuration helper reused after its original project root was deleted. That
  helper lifecycle belongs to Plan 5's retained configuration code, and an
  ordinary `check` against a second root reaches it without `materialize`. It
  is recorded as a pre-existing resident defect for a separate fix, not as a
  Plan 2A regression.

## Rework: views only for existing source areas (user decision)

**Date:** 2026-09-15. A binding user decision overrides this iteration's
"Follow-up 2" workaround (and, transitively, the content-aware `areaPresent`
rule iteration 2 introduced): *materialization must only produce output; it
must not change how the project is analyzed.* `materialize` never creates
`src/` or `src/tests/`. A module's ordinary view (`<module>/src/.ramify`) is
produced only when `<module>/src/` already exists; its testing view
(`<module>/src/tests/.ramify`) only when `<module>/src/tests/` already
exists. A module without `src/` owns no source, so nothing would read its
ordinary view.

### What changed

1. **`ApiViewModuleProjection.ordinary` is now nullable** (`subs/analysis/src/
   interfaces/session.ts`), mirroring the existing nullable `tests`. It is
   `null` exactly when the module's ordinary source area was absent before
   projection. `subs/analysis/src/api-view.ts`'s `projectApiView` and
   `planApiViewRequests` now build/plan the ordinary area only when the
   inventory reports it present, matching the existing `tests` handling
   exactly. A module with neither area present projects with both fields
   `null` and zero targets; `--from` inside it still succeeds with 0
   targets, and `--all` silently omits it from publication.
2. **The renderer omits a `null` ordinary area from publication**
   (`subs/daemon/src/api-view-documents.ts`'s `renderApiView`), the same way
   it already omitted a `null` tests area. This is the mechanism that makes
   "`--all` silently omits a no-target module" true: a module with both
   fields `null` contributes zero `RenderedArea` targets, so it is never
   staged, switched or reported.
3. **The publisher refuses, rather than creates, a missing source area**
   (`subs/daemon/src/api-view-publisher.ts`'s `checkAncestors`, called
   `stageTarget`). Previously, an absent `areaRoot` segment was silently
   tolerated (`continue`) and `stageTarget` then called `fs.mkdir(target.
   parentAbs)` unconditionally, so a target whose `<module>/src` or
   `<module>/src/tests` did not yet exist would have that directory *created
   from nothing* purely to hold the generated catalog — exactly the trigger
   this iteration's "Follow-up 2" investigation traced the whole bug to.
   `checkAncestors` now requires the area's own root directory to already
   exist, refusing the whole target `unavailable`/`invalid-path` otherwise,
   and `stageTarget` no longer calls `fs.mkdir` on the parent at all. In the
   real `materialize` flow this path is unreachable (item 1's nullable
   `ordinary`/`tests` already keeps such a target out of `renderApiView`'s
   output); it is a defense-in-depth check, covered by two new unit tests
   (`subs/daemon/src/tests/api-view-publisher.test.ts`, "missing source
   area").
4. **The two analysis-rule workarounds this iteration's "Follow-up 2" added
   are removed, restoring the original pre-Plan-2A behavior exactly:**
   - `subs/analysis/subs/project/src/inventory.ts`: `areaPresent` (content-aware
     tests-area presence) is removed. Testing-area presence is again exactly
     `present: await capture.kind(join(directory, 'src/tests')) === 'directory'`,
     matching commit `71643d5` byte-for-byte except for the reserved-name
     (`.ramify`/transient) exclusions this plan's iteration 1/2 already added
     to the walk and to explicit compiler selection, which are kept unchanged.
   - `subs/analysis/subs/project/src/capture.ts`: `isGeneratedOnlyDirectory`
     and both of its call sites in `Capture.changes()` (the probed-absent
     directory rule and the new-child-directory rule in the tracked listing
     diff) are removed. `changes()` is again exactly `71643d5`'s comparison
     logic, except that the freshly read directory listing is still filtered
     through `isRamifyGeneratedSegment` before comparison (the plain
     reserved-name exclusion this plan added to `readDirectory` and now also
     to `changes()`'s own re-read, kept unchanged).
   - `subs/analysis/subs/project/src/observer.ts`: the same `areaPresent`
     import and its use in `#refreshAreas` (the incremental reconciliation
     path parallel to `inventoryProject`'s batch walk) are reverted the same
     way; this second call site was not previously listed in "Follow-up 2"'s
     own file list and was found only while restoring `inventory.ts`. Its
     `#classify` method's `isRamifyGeneratedPath` isolation check (added
     independently, for retained change classification) is unrelated and
     stays.
   - A `git diff` of `inventory.ts` and `capture.ts` against `71643d5` now
     shows only the reserved-name-exclusion additions (imports, the two
     `isRamifyGeneratedPath`/`isRamifyGeneratedSegment` filter call sites
     each), confirmed by direct comparison; see "Files changed" in the
     coordinator's final report for the literal diffs.
5. **Regression tests asserting the removed rules are rewritten, not just
   deleted**, so the restored behavior itself stays covered:
   - `subs/analysis/subs/project/src/tests/capture.test.ts`: the four cases
     "Follow-up 2" added (two "ignores ... holding only its own generated
     catalog" cases, asserting `coherent`, and their two "still detects ...
     real content beside its catalog" companions) are replaced by two cases
     documenting the restored rule directly: a probed-absent directory that
     comes to exist (even holding only its own generated catalog) now
     reports `changed`, while a `.ramify` sibling appearing in an *already
     tracked* directory listing still does not (the plain reserved-name
     exclusion, unchanged).
   - `subs/analysis/subs/project/src/tests/generated-path.test.ts`: "does not
     report a tests area present when src/tests holds only generated
     content" (asserting `present: false`) is rewritten to assert
     `present: true` (directory existence, full stop), while confirming the
     generated content itself is still never an owned file. Its sibling case
     ("reports a tests area present once real testing content joins
     generated content") already held under either rule and is unchanged.
   - `scripts/reference-harness/plan2a-isolation-cases.ts`'s tracked leaf
     `I2A-02:tests-area-not-created` (registered in `subcases.md` and
     `plan2a-instances.ts`) is rewritten to cover *both* areas: a new
     `hollow` module with no `src/` at all demonstrates the ordinary side
     (absent, then present once the directory exists by other means, with no
     owned files either way), alongside the existing `consumer` module's
     tests-side coverage, now asserting the restored rule's `present: true`
     outcome instead of the removed rule's `present: false`. The leaf's
     description text in both `subcases.md` and `plan2a-instances.ts` was
     updated identically (word-for-word), confirmed by re-running the
     harness's own transcription self-check (`plan2a.test.ts`'s "transcribes
     all 104 reviewed leaves").
   - `.ramify` itself being excluded remains covered throughout (unchanged):
     `generated-path.test.ts`'s "excludes final and transient generated
     directories and their contents from inventory, at any depth" and its
     `.ramify-other` near-miss case, plus the new tests above's own
     "no owned file" assertions.
6. **Nullable `ordinary` propagated through every consumer**: `subs/analysis/
   src/tests/api-view.test.ts` (non-null assertions where every fixture module
   owns real `src/`, plus two new cases: a `hollow` module with no `src/` at
   all projects both fields `null` with zero targets for both `--from` and
   `--all`, and `--all`'s module list/count updated from two to three
   modules), `subs/daemon/src/tests/api-view-documents.test.ts` and
   `api-view-fixtures.ts` (`moduleProjection`'s `ordinary` parameter is now
   `ApiViewAreaProjection | null`, plus a new "omits both targets when the
   module has no ordinary source area" case), `subs/daemon/src/tests/
   api-view-publisher.test.ts` (every test that publishes into `mod/src`,
   `a/src` or `b/src` now `mkdir`s that directory first, since the publisher
   no longer creates it — this is the same restored discipline as item 3,
   surfacing here as a fixture-setup change across roughly a dozen existing
   cases), `subs/daemon/src/tests/api-view-publisher-crash-recovery.test.ts`
   (same `mkdir` addition), and `scripts/reference-harness/
   plan2a-publication-cases.ts`/`plan2a-projection-cases.ts`/
   `plan2a-session-cases.ts` (the harness-registered mirrors of the same
   fixtures and assertions).
7. **Target counts recounted independently from the real filesystem, not
   copied from tool output:**
   - **Reference project R** (`examples/collection-review`) has the same 15
     declared modules as before this rework. Listing `src/` and `src/tests/`
     directly (`find . -name module.ramify`, then `[ -d "$m/src" ]`/`[ -d
     "$m/src/tests" ]` per module) shows all 15 already own real `src/`, and
     14 of them (all but `subs/integration-tests`) already own real
     `src/tests/`. **R's `--all` target count is unchanged at 29** (15
     ordinary + 14 tests): every module in R already owned real `src/`
     before this rework, so the removed workaround never actually fired for
     R, and R's own manual smoke test in this iteration's "Follow-up 2"
     section already noted this ("that project's root module already owns
     real `src/` files, so materialize never creates a new top-level
     directory there"). The same independent listing over the toolkit T (11
     modules) shows all 11 already own both real `src/` and `src/tests/`
     (22 targets), also unchanged.
   - **The one place a target count *did* change** is
     `scripts/reference-harness/plan2a-materialize-fixture.ts`'s shared
     `materializeFixtureFiles` fixture (I2A-09/I2A-10's `materialize-fixture`
     project): its root module declares `expose-sub widget from lib to
     descendants` with no `src/` of its own — a pure aggregator, by design
     (its own doc comment already called this out) — and its first
     `materialize --all` previously *created* that root `src/` to publish an
     empty ordinary catalog into it, contributing a fourth, spurious target.
     With this rework the root module correctly contributes zero targets:
     `--all` now reports **3 targets** (`app` ordinary + `app` tests + `lib`
     ordinary, entries `[1, 1, 0]`, total 2) instead of 4 targets/3 entries.
     Updated in `plan2a-service-cases.ts` (`I2A-09:module-and-all`,
     `I2A-09:actual-ipc`) and `plan2a-cli-cases.ts` (`I2A-10:grammar-default`,
     `I2A-10:all-selection`, `I2A-10:output-summary`,
     `I2A-10:compiled-process`), each with a comment explaining the count.
   - S100/S500/S1000's synthetic generator
     (`scripts/probes/fixtures/synthetic-owners.ts`) gives every owner both
     real `src/` and `src/tests/`, so their inventory-scale counts (file/owner
     counts, per-workload target counts) are unaffected.

### Evidence

- Focused vitest, all passing: `subs/analysis/subs/project/src/tests/` (152
  tests, 9 files), `subs/analysis/src/tests/` (259 tests, 17 files),
  `subs/daemon/src/tests/` + `subs/daemon/subs/contexts/src/tests/` (312
  tests, 27 files), `src/tests/` + `subs/cli/src/tests/` +
  `subs/analysis/subs/descriptions/src/tests/` (1722 tests, 112 files; one
  unrelated, pre-existing timing flake in `subs/analysis/src/tests/
  session-worker.test.ts` — a file this rework never touched — confirmed
  passing in isolation on rerun).
- `npx vitest run -c scripts/reference-harness/vitest.config.ts
  scripts/reference-harness/plan2a.test.ts`: 8/8 passing, including the
  104-leaf transcription self-check.
- `npm run type-check`: passing across all four project configurations
  (root, portable, scripts, reference-harness).
- `npm run build`: passing.
- `dist/src/ramify check --batch --root .`: 0 errors, 0 warnings,
  0 analysis limits (11 owners).
- Real compiled daemon, owned `RAMIFY_ENDPOINT_DIR`, stopped in `finally`, on
  a temporary copy of `examples/collection-review` plus an added `subs/
  aggregator` module (`module.ramify` only, no `src/`): first `materialize
  --all` reports `revision 1; 29 target(s), 551 entries, 124460 bytes
  written, 0 unchanged` and creates no `subs/aggregator/src` or `subs/
  integration-tests/src/tests`; `ramify check` between the two materialize
  calls reports `revision reused`; the second `materialize --all` reports
  `revision 1; 29 target(s), 551 entries, 0 bytes written, 29 unchanged`
  (same revision, zero bytes, all unchanged); `subs/aggregator/src` and
  `subs/integration-tests/src/tests` remain absent after every step.
- `npm run measure:plan2a` was re-run (default workload set: reference,
  toolkit, synthetic-100, synthetic-1000, repeat-plateau, one process, one
  archived report) because the current source/build identity no longer
  matched any previously archived record once this rework's source edits
  landed — an expected consequence of the evidence contract's own
  exact-identity match, not a target-count regression. All five requested
  workloads measured and passed; `synthetic-500` recorded `not-executed` in
  the same report, per the carried-forward Plan 5 measurement policy.
  Archived at `scripts/measurements/results/
  plan2a-2026-09-15T21-32-16.525Z-9d9d1885-fdb5-4bf2-80ad-c406a01912fd.json.gz`.
  The refreshed report's real cold-materialize summaries independently
  confirm item 7's filesystem count above: R is `{targets: 29, entries: 551,
  bytesWritten: 124460}` and T is `{targets: 22, entries: 3574, bytesWritten:
  1107648}`, both unchanged from before this rework.
- `npm run reference:verify -- --plan 2a --iteration 9` (after the
  re-measurement): 104 instances, 97 required, 96 passed, 1 failed
  (`I2A-12:linux-macos-bytes`, no macOS runner, pre-existing), 7 not executed
  (future iteration). Every I2A-12 workload-evidence leaf now passes against
  the refreshed archive above.
