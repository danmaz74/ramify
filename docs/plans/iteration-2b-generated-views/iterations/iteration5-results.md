# Iteration 5 results: Reserve and publish the architect target

**Date:** 2026-09-18. **Mode:** direct work in worktree `/tmp/ramify-plan2b-architect-view`,
branch `feat/plan2b-architect-view`. It is based on `06ccfca`, iteration 4's completed results.
The implementation commit is `3e865b8`. Every verification command was run on that tree.

## Prerequisites

- None by the plan. Iteration 4's handoff held and is used by the tests:
  - `RenderedArchitectView.files` are in byte order, relative to the view root, with nested directories such as
    `engine/`;
  - every rendered `_meta.json` starts with `{"schema":"ramify.architect-view/1",`;
  - root statement R11 re-exposes `renderArchitectView` and the architect types to descendants, so the daemon's
    tests render real views.
- The reserved-name call sites were the ones the iteration names: `inventory.ts` (two), `configuration.ts`,
  `capture.ts` (two), `observer.ts` and `subs/daemon/src/filesystem-watcher.ts` (two). None changed.

## Built

### `analysis/project`

- `generated-path.ts`: `isRamifyGeneratedSegment` also returns true for `.ramify-architect` and for
  `.ramify-architect.tmp-<suffix>` and `.ramify-architect.old-<suffix>`. The two views share one pattern,
  `/^\.ramify(?:-architect)?\.(?:tmp|old)-.+$/`, beside the two exact names. `isRamifyGeneratedPath` is unchanged.
- Near misses stay ordinary: `.ramify-architects`, `.ramify-other`, `.ramify-architect.tmp`,
  `.ramify-architect.tmp-`, `.ramify-architectx`, `.ramify-architect.new-a` and `.ramify-other.tmp-a`.
- A publisher marker file, `<sibling>.marker.json`, matches its sibling's form, so it is reserved too.

### `daemon`

- `interfaces/daemon.ts`, as C6 names them:
  - `MaterializedViewId = 'api' | 'architect'`;
  - `PublishInput { api: ApiViewProjection | null; architect: RenderedArchitectView | null }`;
  - `ApiViewPublishLimits` gains `maxArchitectBytes`;
  - `MaterializedTarget` gains `view`, and `module` and `area` become nullable (`null` for the architect target);
  - `ApiViewPublisher.publish(root, revision, input: PublishInput, requestId, control?)`.
- `api-view-publisher.ts`:
  - **Targets.** One internal `Target` shape holds the view, module, area, parent directory, directory name, files in
    write order, entries and bytes. The API view's areas come first, in render order, then the architect target, so
    the architect target is staged and switched last.
  - **Rendered view.** Before any filesystem work, the architect view is refused with `invalid-path` when a path is
    unsafe, occurs twice or names both a file and a directory, or when the view root has no `_meta.json` naming
    `ramify.architect-view/1`. The files are reordered so `_meta.json` is written last.
  - **Location.** The target is `<root>/.ramify-architect`, staged at `.ramify-architect.tmp-<suffix>` and rolled back
    through `.ramify-architect.old-<suffix>`, with the existing sibling marker files and marker schema. The project
    root is not checked as an ancestor, as it never was for the API targets.
  - **Recognition.** An existing `.ramify-architect` is replaced only when it is a real directory holding only regular
    files and directories, with a regular `_meta.json` whose `schema` is `ramify.architect-view/1`:
    - a symbolic link at or in it refuses the invocation with `symlink`;
    - a file, a directory without `_meta.json`, another schema, unparsable JSON, a `_meta.json` directory or an
      entry that is neither a regular file nor a directory refuses it with `invalid-path`;
    - the refusal comes before any write, including the API targets'.
  - **Comparison.** Paths, directories and sizes are compared before any content is read; then bytes. A stray file
    or an extra empty directory makes the target changed, so replacement is complete. The API view's comparison is
    unchanged.
  - **Limits.** The architect target counts against `maxArchitectBytes`, `maxInvocationBytes` and, when changed,
    `maxStagedBytes`. `validateLimits` checks the four named limits, so a missing one throws.
  - **Recovery.** `recoverSiblings` takes the target name, with a marker pattern pair per name.
  - **Outcome.** Each target reports `view`; the architect target reports `module: null`, `area: null`,
    `path: '.ramify-architect'`, every file including `_meta.json` in `files`, and `records` in `entries`.
- `service.ts` passes `{ api: outcome.projection, architect: null }`. `ramify materialize` is otherwise unchanged.

### Outside the owners

- Root `src/resident-assembly.ts` exports `residentPublishLimits`, with `maxArchitectBytes: 64 * 1024 ** 2` beside
  the frozen Plan 2A limits. `src/tests/quick-environment.ts` uses it instead of its own copy.
- `.gitignore` and `examples/collection-review/.gitignore` list `.ramify-architect/`, `.ramify-architect.tmp-*/` and
  `.ramify-architect.old-*/`. The toolkit's comment names the six reserved forms and the near misses
  `.ramify-other`, `.ramify-architects`, `.ramify.tmp` and `.ramify-architect.tmp`.
- Call sites adapted to C6's signature. See [Deviations](#deviations).
  - `subs/daemon/src/tests/api-view-fixtures.ts` gains `apiInput(projection)`, which returns
    `{ api: projection, architect: null }`.
  - The existing publisher tests, the crash-recovery child and the Plan 2A publication cases wrap each projection in
    `apiInput`. Their limit objects gain `maxArchitectBytes`, and `plan2a-scale-cases.ts` reads
    `target.module?.endsWith('/app')`.

### Tests

- `subs/analysis/subs/project/src/tests/generated-path.test.ts`: three predicate tests, an inventory test with the
  view, its siblings and markers at the root and in module source, and a configuration test with a
  `.ramify-*/**/*` include and an explicit `files` entry. Their assertions use an independent pattern, not the
  predicate under test.
- `capture.test.ts`: a tracked root listing stays coherent when the view, its siblings and markers appear; a near
  miss changes it.
- `observer.test.ts`: created and changed events for the view, siblings, markers, owned source under
  `src/.ramify-architect/` and a path under `subs/child/` give `unchanged`, with identical inventory and inputs; a near
  miss under module source is a created owned file.
- `subs/daemon/src/tests/watcher.test.ts`: no directory watch beneath the view or its siblings, at the root and in
  `src/nested/`; no event for them, their markers or a switch's renames; near misses stay visible.
- `subs/daemon/src/tests/architect-view-fixtures.ts` (new): `architectView({ revision, children, term })` renders a
  root module with child modules through the real `renderArchitectView`, each with one callable symbol and one suite
  whose names carry `term`. The daemon keeps these fixtures itself, since its tests cannot import `analysis`'s.
- `subs/daemon/src/tests/architect-view-publisher.test.ts` (new) has 29 tests for AV20–AV23.
- `api-view-publisher-crash-recovery.test.ts` adds the architect crash case. `crash-recovery-child.ts` takes an
  optional third argument, `api` (the default) or `architect`.
- `src/tests/resident-assembly.test.ts` checks `residentPublishLimits`.

## Evidence

| Row | Witness | Result |
| --- | --- | --- |
| AV19 | See the AV19 witnesses below | pass |
| AV20 | See the AV20 witnesses below | pass |
| AV21 | See the AV21 witnesses below | pass |
| AV22 | See the AV22 witnesses below | pass |
| AV23 | See the AV23 witnesses below | pass |

AV19 witnesses:

- **Predicate.** `.ramify-architect`, both siblings with short and 32-hex suffixes, and both marker files are
  reserved; the thirteen near misses listed in the test are not. Paths match at the root, beneath modules and at
  depth.
- **Inventory.** With the view, its siblings and markers at the root, `src/.ramify-architect/owned.ts` and
  `src/.ramify-architect.tmp-abc/staged.ts` present, the inventory files are exactly `src/.ramify-architects/real.ts`
  and `src/value.ts`. `outsideModuleFiles` is empty, and no input path names the view.
- **Configuration.** With `include: ["src", ".ramify-*/**/*"]` and `files: [".ramify-architect/explicit.ts"]`,
  `outsideModuleFiles` is exactly `.ramify-architects/near.ts`, the near miss's listing is an input, and no input names
  the view.
- **Capture, observer and watcher.** As listed under [Tests](#tests).
- **Mutation.** With the previous predicate restored, seven of these tests fail: four in `generated-path.test.ts`
  (the predicate tests beside the near-miss one, inventory and configuration) and one each in capture, observer and
  watcher. The inventory test first passed under this mutation because its assertion used the predicate under test;
  it now compares exact lists.

AV20 witnesses:

- **First publication.** The outcome is exactly one target: `view: 'architect'`, `module: null`, `area: null`,
  `path: '.ramify-architect'`, `files` and `entries` from the rendered view, `changed: true`, with `bytesWritten`
  equal to the view's bytes. The tree equals the rendered files byte for byte. `_meta.json` is the last of the
  staged writes, and the root holds only `.ramify-architect` and `mod`.
- **Unchanged repeat.** It reports `changed: false` and `bytesWritten: 0`, makes no `mkdir`, `writeFile`, `rename` or
  `rm` call, and keeps the mtimes of the view, a module directory and two files.
- **Changed view.** Dropping the `gamma` module removes `gamma/`; the tree equals the new view and no sibling
  remains. A view whose files keep their sizes but change their bytes (revision `rev/1` to `rev/2`) is replaced.
  A recognized view with a stray file, or with an extra empty directory, is replaced although every rendered file
  is unchanged.
- **Both views.** One call reports the API target, then the architect target; `bytesWritten` is their sum.
- **Rendered input.** Six defective views (escaping path, absolute path, a file named like a module directory, a
  duplicate path, no `_meta.json`, another schema) refuse with `invalid-path` before any filesystem call.

AV21 witnesses:

- **Switch failure.** Both views are published, then both change and the rename of the architect stage onto
  `.ramify-architect` fails. The recorded renames show the API target switched first. The outcome is
  `output-failure`, and the whole root tree, file bytes included, equals its state before the call.
- **Rollback failure.** When restoring the API target's backup also fails, the outcome is `rollback-failure` and the
  marked `mod/src/.ramify.old-*` backup remains for recovery.
- **Cancellation before switching.** Aborting after the architect stage's `_meta.json` is written gives
  `cancelled`, no rename, and an unchanged tree.
- **Cancellation during switching.** Aborting after the API target switched gives `cancelled` after rolling it back;
  the tree is unchanged.
- **Limits.** With the API target unchanged, each of `maxArchitectBytes` one byte below the view,
  `maxInvocationBytes` one byte below both targets and `maxStagedBytes` one byte below the view refuses with
  `resource-limit` and a message naming that limit, before any write. The exact limits publish. A missing or zero
  `maxArchitectBytes` makes the factory throw.

AV22 witnesses:

- **Refusals.** Each case below refuses the whole invocation, with no `mkdir`, `writeFile`, `rename` or `rm` call,
  and leaves the root tree identical, including link targets. The API target is not created.

  | Existing `.ramify-architect` | Reason |
  | --- | --- |
  | A regular file | `invalid-path` |
  | A directory without `_meta.json` | `invalid-path` |
  | `_meta.json` naming `ramify.api-view/1` | `invalid-path` |
  | `_meta.json` that is not JSON | `invalid-path` |
  | `_meta.json` that is a directory | `invalid-path` |
  | An entry reported as neither file nor directory | `invalid-path` |
  | A generated view containing a symbolic link | `symlink` |
  | A generated view whose `_meta.json` is a symbolic link | `symlink` |
  | A symbolic link to a generated view | `symlink` |

- **Recognized.** A directory whose `_meta.json` is `{"schema":"ramify.architect-view/1"}` beside a stale file is
  replaced by the rendered view.
- **Leftover backup.** When the backup's removal after a switch fails, the next call finds the marked
  `.ramify-architect.old-<suffix>` and its marker beside the live view, removes both, and reports `changed: false`
  with `bytesWritten: 0`. An unmarked `.ramify-architect.tmp-deadbeef…` lookalike and its file survive.
- **Leftover stage.** When a staged write and both removals fail, the marked stage and marker remain; the next call
  removes them and reports the preserved view unchanged.
- **Crash.** A child process publishes a changed view and is killed by its PID after renaming the live view to its
  backup. The root then holds marked `.tmp-` and `.old-` siblings and no `.ramify-architect`. The next call restores
  the view byte for byte with `changed: false` and `bytesWritten: 0`, removes the marked siblings and keeps the
  unmarked lookalike.

AV23 witnesses:

- **Ignore files.** The toolkit's and the reference project's `.gitignore` each contain the three lines.
- **Search.** For each ignore file, a temporary Git repository holds that file, `mod/src/input.ts` with `debounce`, a
  published view with `debounce` in 9 lines, and stage, backup and nested `mod/.ramify-architect/` directories with
  the term. Then:
  - `rg -n debounce` returns exactly the source line;
  - `rg -n --hidden debounce` returns the source line and no line from the view or its siblings, so the ignore
    entries alone hide them;
  - `rg -n debounce .ramify-architect/` returns every one of the view's 9 matching lines, with its path and line
    number;
  - the control `rg -n --hidden --no-ignore-vcs debounce` does return view lines;
  - `git status --porcelain --untracked-files=all` names no view path.
- **Tools.** ripgrep 13.0.0 and Git 2.39.5 were installed, so nothing was skipped. The test skips only when either
  is missing. `rg` runs with `--no-config` and with stdin closed, since given no path and a readable stdin it
  searches stdin.
- **Mutation.** With the previous `.gitignore` files, the four AV23 tests fail; the hidden search then returns 12
  lines from the view and its siblings.

Publisher mutations were each restored from a copy after their run, and each made at least one test fail:

- no schema check on the existing `_meta.json` (2 tests);
- no `_meta.json` presence check (2);
- the architect target before the API targets (3);
- `_meta.json` written in byte order instead of last (1);
- sizes compared but not bytes (2);
- no directory comparison (1);
- no architect byte limit (1);
- an entry that is neither a file nor a directory ignored (1);
- no recovery for the architect target (3);
- no schema check on the rendered view (1).

## Plan 2A publication cases

The Plan 2A harness test runs Plan 2A's iterations 1 and 2 only, so it does not execute the publication cases this
iteration adapted. A scratch driver, not committed, ran each memory handler of `plan2a-publication-cases.ts`
(`I2A-06:*` and `I2A-07:*`, 17 handlers) and `I2A-12:limit-preservation`, which materializes through the quick
environment's real service and publisher. All 18 passed, `I2A-07:crash-recovery` through the adapted child process.

## Verification

```sh
npx vitest run subs/analysis/subs/project/src/tests/generated-path.test.ts            # 12 passed
npx vitest run subs/analysis/subs/project/src/tests/observer.test.ts subs/analysis/subs/project/src/tests/capture.test.ts   # 39 passed
npx vitest run subs/daemon/src/tests/watcher.test.ts                                   # 17 passed
npx vitest run subs/daemon/src/tests/api-view-publisher.test.ts subs/daemon/src/tests/api-view-publisher-crash-recovery.test.ts   # 20 passed
npx vitest run subs/daemon/src/tests/service.test.ts src/tests/resident-assembly.test.ts   # 15 passed
npm run type-check                                                                     # clean, all four scopes
npm run build                                                                          # built
npm run check:self   # passed: 15 owners, 411 source files, 14 resources, 6022 accesses, 0 errors, 0 warnings, 0 analysis limits, 0 denied
npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan2a.test.ts   # 8 passed
```

Additional focused runs:

```sh
npx vitest run subs/daemon/src/tests/architect-view-publisher.test.ts                  # 29 passed
npx vitest run subs/analysis/subs/project/src/tests/ src/tests/publication-queue.test.ts \
  subs/daemon/src/tests/session-counters.test.ts subs/cli/src/tests/materialize-command.test.ts \
  subs/daemon/src/tests/api-view-documents.test.ts                                     # 13 files, 187 passed
```

- **Inventory and configuration.** No call site changed. `generated-path.test.ts` and every other
  `analysis/project` test, `project.test.ts` among them, passed.
- **`check:self`** ran twice with an owned `RAMIFY_ENDPOINT_DIR` created with mode 0700, `/tmp/rp2b5-ep` and then
  `/tmp/rp2b5-ep2`. Each time the daemon (PID 381332, then 383727) was stopped with `dist/src/ramify daemon stop`,
  `daemon status` answered `not running`, the PID was gone and the directory was removed.
- **Plan 2A harness.** It ran twice with an owned endpoint directory, `/tmp/rp2b5-h` and `/tmp/rp2b5-h2`. It started
  no daemon: the directory stayed empty and was removed.
- **Daemons not started here.** A daemon from the `ramify-plan6d-behavioral-diagram` worktree was running
  throughout; it was not touched.
- **Full suite.** The full test suite was not run.

## Deviations

- **Call sites outside the service.** C6 changes the `publish` signature and adds a required limit, and the iteration
  expected only the daemon service to need `{ api, architect: null }`. The Plan 2A harness is type-checked by
  `npm run type-check` and calls the publisher directly, as do the existing publisher tests and the crash-recovery
  child. These call sites were adapted mechanically:
  - each projection argument is wrapped in `apiInput(...)`;
  - each limit object gains `maxArchitectBytes`;
  - `target.module.endsWith` becomes `target.module?.endsWith`.

  No case, assertion or expected value changed. `plan2a.test.ts` itself is unchanged and passes, and the adapted
  publication cases pass when run directly.
- **Reason names.** C6 refuses an unrecognized `.ramify-architect` with `invalid-path`, and C8 lists
  `invalid-location`. Both hold: the publisher answers `invalid-path`, and the service's existing mapping reports
  it as `invalid-location`.
- **Rendered-view validation.** C6 does not say what the publisher does with a defective rendered view. It refuses
  one with `invalid-path` before any filesystem work, including a view without a `_meta.json` that names the schema,
  so the publisher never writes a view it would later refuse to replace.
- **Complete comparison.** The architect target compares paths, directories and sizes before bytes, so a stray file
  or an empty directory in a recognized view makes it changed. The API view's comparison is unchanged.
- **Limits export.** The resident limits are exported as `residentPublishLimits` and reused by the quick environment,
  which had its own copy. `validateLimits` names the four limits instead of iterating the object.
- **Wire.** `MaterializedTarget` is part of `MaterializeOutcome`, so each target in a `materialize` result now carries
  `"view":"api"`. The CLI prints no target field, so its output is unchanged.

## Limitations

- **Configuration host filter.** Removing only `configuration.ts`'s filter makes no test fail. The capture's
  directory listings, which the configuration host serves, already omit reserved names, so the host's own filter is a
  second guard that cannot be observed separately. The configuration test proves the combined behavior.
- **Marker files and Git.** C5's patterns name directories. A marker file, such as
  `.ramify-architect.tmp-<suffix>.marker.json` at the project root, is not matched by them. Markers exist only during
  a publish or after a crash, and Ramify's analysis ignores them. The same holds for the `.ramify` markers in Plan 2A.
- **Stage cleanup.** When removing a failed stage fails, `cleanupTmp` still removes its marker, which leaves an
  unmarked stage that recovery never reclaims. This predates this iteration and now applies to the architect target
  too. The leftover-stage test therefore fails both removals.
- **Documentation.** The owner READMEs and architecture documents do not describe the architect target yet.
  Iteration 7 owns documentation.

## Handoff

- **Iteration 6** receives:
  - **Publishing.** Call `publisher.publish(root, revision, { api, architect }, requestId, control)`, with `api` null
    when the API view is not requested. `architect` is `renderArchitectView(...)`'s result, unchanged. One call is one
    transaction, and the architect target switches last.
  - **Outcome.** The architect target is the last entry of `targets`, with `view: 'architect'`, `module: null`,
    `area: null`, `path: '.ramify-architect'` and `entries` equal to the view's `records`. `bytesWritten` counts
    both views.
  - **Refusals.** An unrecognized `.ramify-architect` answers `invalid-path`, which `runMaterialize` maps to
    `invalid-location`; a symbolic link answers `symlink`, and a limit answers `resource-limit`, which maps to
    `resource-unavailable`. A defective rendered view also answers `invalid-path`.
  - **Assembly.** `residentPublishLimits` in `src/resident-assembly.ts` holds `maxArchitectBytes: 64 MiB`; the quick
    environment uses it.
  - **Fixtures.** `subs/daemon/src/tests/architect-view-fixtures.ts` renders small real views for daemon tests, and
    `apiInput` in `api-view-fixtures.ts` wraps an API projection.
  - **Wire.** API targets in a `materialize` result now carry `view: 'api'`.
- **Iteration 7** receives the limitations above for the documentation and the completion report, and the reserved
  names for its invariance run: publishing the view starts no revision because inventory, the configuration host,
  capture, the observer and the watcher skip it.
