# Iteration 6 results: Keep the inventory on an options-only configuration edit

**Withdrawn and reverted, 2026-09-14.** The design decision recorded in the
[closure's revision](closure.md#revision-2026-09-14) withdrew this iteration:
a post-write hook now answers a configuration edit at once as not checked, so
the saving this configuration projection bought is not needed. `0cc2077` was
reverted by `1d8de4d`, a configuration edit acquires the project again, and
iteration 5's sweep skip applies to it once more. SE-15 and SE-16 and their
tests left with it. Iteration 5's compiler options fix `76728ac` stays. What
follows is the record as written; it no longer describes the implementation.

**Date:** 2026-09-13. **Outcome:** SE-15 and SE-16 pass; every session-equals-batch
and audit case still passes. An edited configuration file is now read again
through the helper on the retained capture. The observer keeps the inventory
and the capture when the selection projection and the helper's requests are
unchanged, and names the configuration in a local update. The session then
retires the previous compiler reads, invalidates the whole program and
recomputes every owned file. Every other configuration edit acquires the
project again, as before. Direct work; no Studio workflow.

On S100, in process, a `target` edit's update falls from about 3,300 ms to
about 2,270 ms; its `inventory` stage falls from about 1,330 ms to about 330 ms.
The capture's sweep, skipped since iteration 5 for this edit, runs again
(about 330 ms), so the capture as a whole saves about 700 ms. On the reference
example the kept path costs about 225 ms more than before, see
[Measured cost](#measured-cost).

## Implemented behavior

- **Helper requests, `analysis/project`.**
  - `readConfiguration` returns `{ data, requests }` (`configuration.ts:14-24`).
    `requests` is every filesystem request the helper made, as sorted, unique
    `[method, path]` JSON strings.
  - It takes an optional `{ deadline, signal }`. A capture that finished its
    acquisition has an expired deadline, so the re-read supplies its own.
  - `acquireConfiguration` stores `requests` in the retained product.
    `acquireProject` stores the selection projection computed over its
    inventory (`read-project.ts:83`), also on a reused product.
  - The solution-style refusal is one function, `solutionStyle`
    (`configuration.ts:168`), used by resolution, acquisition and the re-read.
- **Selection projection** (`selectionProjection`, `configuration.ts:205`):
  - the selected files beneath the root that the inventory does not own, sorted
    and unique;
  - `references`;
  - `exclusions`, each `exclude` list with its directory;
  - `options.outDir` and `options.declarationDir`.
- **Re-read** (`rereadConfiguration`, `configuration.ts:227`). On the retained
  capture, after the edited files were re-observed:
  1. run the helper;
  2. refuse a solution-style result with `references-only-configuration`;
  3. return `changed` for a product without recorded requests or projection
     (`product`), an unequal projection (`projection`), unequal requests
     (`requests`), or an edited file that is not a recorded dependency or
     changed role (`dependencies`);
  4. otherwise return `kept` with a new retained configuration. It holds the
     new data and projection, the refreshed files' identities in
     `dependencies` and a key recomputed by the acquisition's own key function,
     so a later acquisition reuses it without a helper.
- **Observer** (`observer.ts`).
  - `#classify` returns `configuration` for a recorded input whose role is
    `configuration`, except `package.json` and `package-lock.json`, inside or
    outside the root (`:220`, `:237`). An unrecorded `tsconfig.json` and every
    manifest stay `structural`.
  - `#update` keeps the acquisition only when every non-ignored change is a
    configuration change and none of them is `unknown` (`:245-255`). Otherwise
    it rebuilds.
  - `#reconfigure` (`:341`) refreshes the edited files and calls the re-read
    with the current owned paths. A cancellation or the solution-style refusal
    is rethrown; `apply` reports the refusal as `incomplete`, as the rebuild
    did. Any other helper failure, or `changed`, rebuilds, which reports the
    failure as batch does.
  - On `kept` it replaces the retained configuration, the configuration data
    and, through `refreshResolution`, the resolution. It returns
    `{ kind: 'local', inventory: <same object>, configuration: [labels], ... [] }`.
  - No directory is enumerated and no owned file is read: the helper's reads
    are answered from recorded observations.
- **Resolution** (`refreshResolution`, `resolve-root.ts:77`). Discovery
  evidence is returned unchanged. Evidence recorded from a configuration with
  references (now marked `full`) is replayed on a fresh capture, and an equal
  resolution object is recorded with the current answers, so the worker's
  invocation check reuses it with no helper. A failed replay keeps the old
  resolution, which then resolves again.
- **Session** (`session-revision.ts`).
  - `configurationChange` is a broad trigger (`:566-568`), and its labels are
    explained changes.
  - The broad branch calls `observer.retire({ kind: 'all' })` for it (`:664`)
    before the compiler updates, and issues the whole invalidation (`:679`).
  - `checked.path` is `broad`; `reacquired` stays `false`.
- **Documentation.** The analysis and project READMEs and the fast incremental
  checks section of `docs/architecture/daemon.md` state the kept path and that
  its capture still sweeps.

## Contract shapes

```ts
// subs/analysis/subs/project/src/interfaces/project.ts
export type InventoryUpdate =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'local'; readonly inventory: ProjectInventory;
      readonly descriptions: readonly string[]; readonly readmes: readonly string[];
      readonly created: readonly string[]; readonly deleted: readonly string[]; readonly changed: readonly string[];
      /** Input labels of edited configuration files read again with an unchanged file selection. The inventory
       * and the capture were kept; the compiler must read the configuration again. Never beside another change. */
      readonly configuration: readonly string[] }
  | /* structural, invalid, incomplete unchanged */;

// subs/analysis/subs/project/src/configuration.ts (owner-private)
export interface ConfigurationRead { readonly data: ConfigurationData; readonly requests: readonly string[] }
export async function readConfiguration(capture: Capture, config: string,
  control?: { readonly deadline?: number; readonly signal?: AbortSignal }): Promise<ConfigurationRead>;
export const solutionStyle: (config: string, data: ConfigurationData) => AcquisitionError | null;
export function selectionProjection(root: string, data: ConfigurationData, owned: ReadonlySet<string>): string;
export type ConfigurationReread =
  | { readonly status: 'kept'; readonly data: ConfigurationData; readonly retained: RetainedConfiguration }
  | { readonly status: 'changed'; readonly reason: 'product' | 'projection' | 'requests' | 'dependencies' };
export async function rereadConfiguration(capture: Capture, previous: RetainedConfiguration, owned: ReadonlySet<string>,
  refreshed: readonly string[], control?: { readonly deadline?: number; readonly signal?: AbortSignal }): Promise<ConfigurationReread>;

// subs/analysis/subs/project/src/resolve-root.ts (owner-private)
export async function refreshResolution(request: ProjectRequest, resolution: Resolved, signal?: AbortSignal): Promise<Resolved>;
```

The retained product (opaque `RetainedConfiguration.product`) gains
`requests` and `selection`. No exposure line, package entry or codec changed.
The `configuration` field is always present; every other local update carries
`configuration: []`.

## Why no other configuration field reaches the inventory

The project layer reads a configuration only through `ConfigurationData`:

- `inventoryProject` reads `config.files` as `selected`, filtered to paths
  beneath the root (`inventory.ts:60`). It uses them for independent scopes
  (`:145`) and outside-module files (`:164`). It also calls
  `excludedDirectory`, which reads `options.outDir`, `options.declarationDir`
  and `exclusions` (`:19-29`).
- The observer's `#owned` calls `excludedDirectory` with its retained data.
- `acquireProject` and `resolveProjectRoot` read `references` for the
  solution-style refusal and for the resolution evidence.
- `options` reaches nothing else. The rest of the product, `observations`,
  `metadata` and the dependency key, serves reuse only.

**Owned files are left out of `files`.** A selected owned file lies in some
module's `src/`. An independent scope is a directory outside its boundary's
`src/` and `subs/`, so it contains no owned file, and outside-module files
exclude owned files by definition. Without this, every created or deleted owned
file since the last acquisition made the next configuration edit rebuild; the
first session run showed it.

**What the projection alone does not cover** is the capture: batch inputs hold
the helper's queries. Equal requests on a capture that answers from its
recorded observations add the same observations a fresh acquisition makes, with
the same recipes. The edited files are re-observed first. After `retire all`,
the capture equals a fresh acquisition's table plus the compiler reads the whole
invalidation reports again, the state a structural rebuild reaches. SE-15
asserts inputs and `inputId` against batch.

## Configuration shapes that acquire the project again

| Shape | Why | Evidence |
| --- | --- | --- |
| Any change of `files` beneath the root, not owned; `references`; `exclude`; `outDir`; `declarationDir` | the projection differs | `project.test.ts:240` reasons `projection` |
| `include` that changes the non-owned selection | the projection differs | as above, and `observer.test.ts:337` |
| `include` spelling or an `exclude`-free edit that changes which directories the helper walks | `requests` differ | none named beyond the extends case; follows from the comparison |
| An `extends` target added, removed or replaced, or a package-based `extends` chain change | `requests` differ; a `package.json` edit is structural | `project.test.ts:240` (`extends`: `requests`), `observer.test.ts:337` |
| A directory created or removed in a walked area since the last acquisition | `requests` differ (the helper lists it) | found in scratch runs before the owned-file rule; recorded as a limit |
| A configuration edit beside any other change, or reported `unknown` | only lone `changed`, `created` or `deleted` configuration changes keep the acquisition | `observer.test.ts:337` |
| A configuration the helper cannot read, such as a missing `extends` target | helper failure; the rebuild reports `read-failure` | `observer.test.ts:337` |
| A solution-style rewrite | refused on the re-read path with `references-only-configuration` | `project.test.ts:249`, `resolve-root.test.ts` SE-5 case |

An edited `extends` target that keeps requests and projection is kept
(`base.json` in both SE-15 tests). A configuration outside the root, recorded
with role `configuration`, now takes the same path. It was previously a plain
local `input` change: broad with the whole invalidation, but with no selection
comparison and no retirement.

## Matrix rows

| ID | Evidence | Result |
| --- | --- | --- |
| SE-15 | `subs/analysis/subs/project/src/tests/observer.test.ts:279` `configuration-projection-unchanged: an options-only edit keeps the inventory and capture, spawns one helper, walks no directory and reads only the edited file`. Steps: a created and a deleted owned file first; a `target` edit then returns `local` with `configuration: ['tsconfig.json']` and the same inventory object. Through `PROCESSWRAP`, `observedEnumerations` and a pass-through `node:fs/promises` `open` mock: 1 helper, 0 enumerations, and the only opened file is `tsconfig.json`. Only `tsconfig.json` changes identity. Inventory, inputs and `inputId` equal a fresh observer. Adding `extends` rebuilds; an options edit of `base.json` is kept with the same counts. A later owner rename rebuilds with 0 helpers, reusing the replaced product | pass |
| SE-15 | `observer.test.ts:318` `... a kept edit of a configuration with references replaces the resolution the invocation check reuses`: the replaced resolution is a new, equal object reused with 0 helpers; the old seed resolves again with 1 | pass |
| SE-15 | `subs/analysis/subs/project/src/tests/project.test.ts:198` and `:221`: the re-read keeps a `target`/`strict` edit with 1 helper. The retained dependency of `tsconfig.json` carries the new bytes' hash, and a following `readProject` reuses the product with 0 helpers (the replaced one is not reused). The projection keeps non-owned files beneath the root and output directories, and ignores owned files, files outside the root and other options | pass |
| SE-15 | `subs/analysis/src/tests/session-revision.test.ts:1091` `configuration-projection-unchanged: ... invalidates the compiler and publishes the batch inputs`. Fixture without `lib`, `target` ES2022 to ES2023: observer update `local` with `configuration: ['tsconfig.json']`, same inventory, 1 child process during the update, adapter updates `invalidateAll` `[false, true]`, retirements `['all']`, `{ identical: false, reacquired: false }`, path `broad` over every owned file. Inputs drop `lib.es2022.full.d.ts` and add `lib.es2023.full.d.ts`; `revision.inputs` and `inputId` equal batch, the report equals batch and the audit is equal. The sweep returns `unchanged`. Moving the target into `base.json` reacquires; an options edit of `base.json` is kept with the same shape; after a membership revision, the next `base.json` edit is still kept | pass |
| SE-15 | `subs/analysis/src/tests/retained-session.test.ts:227` (worker-hosted): a `target` edit reports `{ broad, identical: false, reacquired: false }`, the sweep is `unchanged`, the audit is equal and the report, inputs and `inputId` equal batch, with the ES2023 library read and the ES2022 one absent | pass |
| SE-16 | `project.test.ts:240` (seven cases) `configuration-projection-changed: an edit of %s is not kept`: `include`, `exclude`, `files`, `outDir`, `declarationDir` and `references` return `projection`; `extends` returns `requests`; 1 helper each. `project.test.ts:249`: an edited extended file that adds an exclusion returns `projection`, and a solution-style rewrite is refused | pass |
| SE-16 | `observer.test.ts:337` `... include, files, exclude, outDir, references, extended-file and manifest edits rebuild as a fresh acquisition`: each is `structural`, and inventory, inputs and `inputId` equal a fresh observer (outside-module file added by `files`, `src/out` dropped by `outDir`). An `unknown` configuration change and a configuration edit beside a source edit rebuild. A missing `extends` target is `incomplete` with `read-failure` and keeps the inventory | pass |
| SE-16 | `session-revision.test.ts:1132` `configuration-projection-changed: include, files, exclude, outDir and extended-file edits acquire the project again and equal batch`: each is `structural`, 2 child processes (re-read and acquisition), last `invalidateAll: true`, no retirement, `reacquired: true`, inputs, `inputId`, report and audit equal batch. `session-revision.test.ts:1012` and `retained-session.test.ts:227`: an `exclude` edit reacquires and its sweep finds nothing | pass |

**Mutation checks.** These were scratch edits, reverted before the commit:

- Without the retirement for `configurationChange`, the session SE-15 test
  fails at batch equality.
- Without its whole invalidation, the same test fails at batch equality.
- Without the requests comparison, 3 project tests fail: both observer
  SE-15/SE-16 tests and the `extends` case.
- Without the projection comparison, 8 project tests fail.

**Exit criteria.**

- SE-15 and SE-16 pass, and every session-equals-batch and audit case passes.
- `check:self` reports 0 errors.
- The observer SE-15 test counts no enumeration and no owned file read for an
  options-only edit.

## Revised expectations

- `resolve-root.test.ts:72` `root-resolution-reused`: a `strict` edit was
  expected to be `structural` and replace the seed. It is now `local` and keeps
  the seed; an added `exclude` is the structural step that replaces it.
- `session-revision.test.ts:779` `broad-kept`: the `strict` edit's retirements
  are `['all']`, not `[]`.
- `session-revision.test.ts:1012` (SE-13): a `target` edit no longer reports
  reacquisition. The reacquiring edit is an added `exclude`; a `target` edit
  now asserts `reacquired: false`. The sweep-found edit removes the `exclude`.
- `retained-session.test.ts:227` (SE-13): the same change, worker-hosted.
- The daemon SE-13 counters test (`session-counters.test.ts:127`) scripts its
  session and is unchanged. With a real session, an options-only hook now
  counts one sweep.

## Measured cost

**Method.** A scratch script run with `npx tsx`, outside the repository and not
committed. It ran on a copy of `examples/collection-review` (its
`node_modules` linked) and on `materializeSynthetic(S100)`, toggling `"target"`
ES2022/ES2021, the `fast-fixture.mjs` edit. "Before" is `git archive 0da429f`,
run back to back on the same machine; "after" is `0cc2077`. All figures are
medians in milliseconds.

- **Helper.** `readConfiguration` on a retained capture, the kept path's only
  spawn, over 5 cycles after 2 warm-ups.
- **Observer.** `observer.apply([tsconfig.json])`, 5 cycles after 2 warm-ups.
- **Session.** The in-process session engine: `update`, then `sweep()`, 5
  cycles after 1 warm-up. Every revision's `inputId` equaled `analyzeProject`
  (6/6 per run).

| Figure | Reference before | Reference after | S100 before | S100 after |
| --- | ---: | ---: | ---: | ---: |
| Fresh acquisition, 3 runs | 305 to 347 | 288 to 334 | 1,249 to 1,276 | 1,152 to 1,272 |
| **Helper on the retained capture** | n/a | **207** (194 to 233) | n/a | **308** (275 to 331) |
| Observer apply | 320 (`structural`) | 209 (`local`) | 1,398 (`structural`) | 310 (`local`) |
| Update `total` | 1,643 | 1,544 | 3,300 | 2,267 |
| `inventory` | 317 | 250 | 1,332 | 332 |
| `compiler` | 624 | 584 | 585 | 593 |
| `descriptions`, `accesses` | 57, 99 | 53, 102 | 531, 425 | 497, 390 |
| `link`, `decide` | 24, 22 | 17, 12 | 104, 108 | 108, 123 |
| `promotion` | 480 | 467 | 80 | 83 |
| Path, `reacquired` | broad, true | broad, false | broad, true | broad, false |
| Sweep after the update | 324, skipped by contexts | 326, runs | 300, skipped by contexts | 334, runs |
| **Capture: update plus sweep that runs** | **1,643** | **1,870** | **3,300** | **2,601** |

- **S100.** The kept inventory saves about 1,000 ms of the update. The sweep
  that runs again costs about 330 ms, so the net saving is about 700 ms, the
  plan's estimate.
- **Reference.** The inventory walk is small (15 owners), so the kept path
  saves about 100 ms. The sweep hashes hundreds of dependency declaration files
  (about 325 ms), so the capture costs about 225 ms more than reacquiring and
  skipping the sweep.
- **Review decision 3.** The helper is the remaining cost of the kept
  observer update: about 207 ms on the reference and 308 ms on S100, nearly all
  of the observer's 209 and 310 ms. The compiler server's own parse would remove
  it.
- **S100 configuration.** The S100 configuration names no `lib`, so its
  `target` edit changes the libraries the compiler reads. That is iteration 5's
  open question: the S100 configuration row was exposed to the options defect
  that `76728ac` fixed.

## Sweep decision (deliverable 3)

The sweep is kept, and `reacquired` stays `false`. After `retire all`, the
promotion re-observes only the compiler's reports. The acquisition table is
never verified against the disk: owned files, descriptions, directories and
the helper's answers, which came from recorded observations. A structural
rebuild validates a fresh capture before it returns; the kept path does not.
Verifying the table in the update would be `capture.changes()`, which is the
sweep's own work. The cost is in the table above.

## Commands

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/subs/project/src/tests` | 8 files, 154 tests passed |
| `npx vitest run subs/analysis/src/tests` | 14 files, 229 tests passed |
| `npm run type-check` | pass, including the portable, scripts and reference-harness projects |
| `npm run build` | pass |
| `npm run check:self` | completed, passed, complete coverage: 11 owners, 283 source files, 8 resources, 3,787 accesses, 0 errors, 0 warnings, 0 analysis limits. The daemon it started (pid 693545, one context, this worktree) was stopped with `dist/src/ramify daemon stop` |
| `git diff --check` | clean |
| Scratch `config-cost.mts` via `npx tsx`, both fixtures on both trees | figures above |
| Scratch mutation runs of the focused tests, and a temporary reason print in `#reconfigure` | as reported; reverted |

## Audit

The cucumber-viz commit audit of `0cc2077`, run with `use_existing_head` on the
worktree, passed in 2 min 26 s: worktree dependencies, type-check and the Vitest
regression suite. Evidence: `refs/audited/runs/2026-09-13T22-17-59Z-0cc2077`.
These results are a docs-only follow-up.

## Deviations

- **The configuration update calls `retire({ kind: 'all' })`.** Iteration 4's
  handoff said an options-only update must not call `retire`. Keeping the
  capture keeps the previous program's compiler reads, and a `target` edit
  without `lib` leaves `lib.es2022.full.d.ts` among the inputs, unlike batch.
  Resolved decision 2 outranks that handoff. The membership (`probes`)
  retirement is still never used here, as deliverable 2 requires. The mutation
  check shows the retirement is needed.
- **A changed projection spawns the helper twice:** once for the re-read, once
  for the acquisition. The rebuild's fresh capture must record the helper's
  queries itself. Passing the re-read's data would need a request replay whose
  equality with batch is not established. Before this iteration such an edit
  spawned once, so a selection edit costs about one helper more (207 to 308 ms).
- **Owned files leave the projection's `files`.** The plan names `files` as a
  projection field. Comparing it verbatim rebuilt every configuration edit that
  followed a created or deleted owned file; the argument for dropping owned
  files is above.
- **Requests are compared as well as the projection.** Resolved decision 7
  names only the projection. The helper's requests determine the capture's
  inputs, which batch equality needs.
- **External configuration files** recorded with role `configuration` now take
  the configuration path instead of the local `input` path.
- **Solution-style refusal on the re-read path.** A rewrite is refused by
  `#reconfigure` with `references-only-configuration`, the same issue the
  rebuild produced. The session still projects it as `internal-error`
  (iteration 2's open item). This path does not restore the original code,
  because the mapping is in `ReportDraft.failure`.
- **Tests outside the named files.** `resolve-root.test.ts` has one revised
  expectation, and `observer.test.ts` mocks `node:fs/promises` with a
  pass-through `open` for the whole file.
- **Documentation outside the owners:** one sentence in
  `docs/architecture/daemon.md`.

## Review items

1. **The `InventoryUpdate` local `configuration` field** as shaped above, and
   the product fields `requests` and `selection`.
2. **Clarification of resolved decision 7.**
   - The projection's `files` is the non-owned selection beneath the root.
   - The helper's requests must also be equal.
   - Only lone, known configuration changes keep the acquisition.
   - The session retires every compiler read.
   - The re-read refuses solution-style configurations.
3. **Clarification of iteration 4's handoff:** a configuration update retires
   everything.
4. **Net cost on small projects.** On the reference example the kept path plus
   the sweep is about 225 ms slower than reacquisition without a sweep.
   Options:
   - accept it;
   - reacquire when the inventory is small;
   - satisfy the sweep only for the inputs the helper answered from the capture.

   The last needs evidence that the rest cannot change unobserved.
5. **Review decision 3:** the helper is 207 ms (reference) and 308 ms (S100) of
   the kept update, and an extra spawn on a changed projection.
6. **The references seed** is replaced in the worker's observer only. The
   daemon's own recorded resolution for a configuration with references still
   resolves again once after such an edit.

## Remaining limits

- **Not measured through the hook.** All figures are in process. The worker
  and daemon add their round trips, and the configuration row now carries
  `revision.capture.sweep` again.
- **A directory created or removed in a helper-walked area** since the last
  acquisition makes the next configuration edit rebuild, until a rebuild
  records the new requests.
- **The helper answers from recorded observations.** A disk change without a
  watcher event is found by the sweep, as on the source path.
- **Cancellation.** A cancelled or failed re-read leaves the edited file
  refreshed in the retained capture. The session marks itself stale, and the
  next update reconciles through a rebuild.

## Successor inputs

- **Iteration 7 closure.**
  - SE-15 and SE-16 evidence is listed above. The configuration update kind is
    `local` with `configuration`, taking the broad path with
    `reacquired: false`.
  - Iteration 5's SE-13 now needs a selection edit to reacquire; its tests
    changed accordingly.
  - Record review items 2 to 6 beside decision 3, and the retirement deviation
    against iteration 4's handoff.
- **Measurement recipe.**
  - On `hook-latency-s100` and `hook-latency-reference`, the configuration
    row's observer update is `local` and its revision path `broad`.
  - `revision.capture.sweep` is non-zero again: expect about 300 to 330 ms in
    process.
  - The `inventory` stage should fall to about the helper's duration, about
    330 ms on S100 against about 1,330 ms before.
  - `fast-assertions.mjs` should not assert `capture.sweep === 0` for the
    configuration row, and still expects `broad`.
  - Expect the reference configuration row to be slower than at iteration 5
    (about +225 ms in process) and the S100 row faster (about -700 ms).
- **Review decision 3.** Removing the helper from the kept path would cut the
  S100 update to about the compiler and recomputation stages plus the sweep.
