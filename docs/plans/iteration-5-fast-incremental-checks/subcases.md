# Plan 5 executable instance inventory

**Status:** draft review package for [Plan 5](main-plan.md), prepared
2026-09-11; iteration 1 accepts it or records its revision. This document
freezes fixture causes and independent expectations; it does not establish
implementation availability or architectural acceptance, and execution
evidence is recorded by the gates, not inferred from these rows. The
[main-plan matrix](main-plan.md#acceptance-matrix), the architecture's
[DA](../../architecture/daemon.md#acceptance-evidence),
[PC](../../architecture/processes-and-clients.md#acceptance-evidence),
[ML](../../architecture/memory-lifecycle.md#measurement-and-acceptance) and
[QT](../../architecture/quick-testing.spec.md#complementary-verification)
cases, the [reference contract map](../reference-project/contract-map.md) and
Plan 2's [instance inventory](../done/iteration-2-resident-verification/subcases.md)
govern these records. Passing one instance never passes an entire family.

## Membership and intermediate gates

Every `I5-NN:variant` row below is one execution record assigned to exactly one
implementing iteration. `npm run reference:verify -- --plan 5 --iteration N`
requires the instances assigned to N and every transitive prerequisite; without
`--iteration` every leaf is required, so the full gate is expected to fail
until iteration 13. Iteration 1 is a review gate and executes nothing. Plan 1's
308 instance records and Plan 2's records stay registered and are required by
`--plan 1` and `--plan 2`; iteration 9 marks the ten superseded Plan 2 records
that [scope.md](scope.md#plan-2-supersession) names, and removing any other
record still fails that gate.

| Implementing iteration | Direct prerequisites | New matrix groups |
| --- | --- | --- |
| 2 | 1 review | I5-01, I5-02 |
| 3 | 2 | I5-03 |
| 4 | 2 | I5-05 |
| 5 | 3, 4 | I5-04 |
| 6 | 4, 5 | I5-06 |
| 7 | 6 | I5-07 |
| 8 | 7 | I5-08 |
| 9 | 8 | I5-09, I5-10 |
| 10 | 9 | I5-11 |
| 11 | 10 | I5-12 |
| 12 | 10 | I5-13 |
| 13 | 11, 12 | I5-14 |

## Fixture and evidence conventions

| Code | Fixture |
| --- | --- |
| R | Plan 1's reference copy: `examples/collection-review/` copied into a unique ignored `.reference-work/` directory, default registry, fifteen owners and two configuration warnings expected. |
| T | Copy of the toolkit root: eleven owners, 229 source files and 2,746 accesses with no finding. |
| F | Plan 1's three-owner fixture recipe (`fixture`, `provider`, `consumer`) at `scripts/reference-harness/fixtures/plan1/`, copied and extended per row, never edited in place. |
| S100, S500, S1000 | Synthetic owner fixtures materialized by `scripts/measurements/materialize.ts` from the parameterized generator; S100 is byte-identical to the frozen hundred-owner map. |
| Q | Root's `createQuickEnvironment`, whose driver is the session driver of iteration 9: real engine and contexts, controlled watcher and clock, in-process connection through the production codec, over R or F. |
| M | Contexts unit fixture: `createContextManager` with a scripted session handle, the controlled watcher and the controlled clock, and controlled ports; no filesystem, engine or socket. The handle returns scripted revisions, checked sets and deltas and records every call it receives. |
| W | An in-process retained session: `openRetainedSession` over a copy of the named project, edits applied to that copy, `update` after each edit and the session's own `verify()` audit after every step. |
| A | Direct owner operations over a copy in the test process: `describeFiles`, `assembleCatalog`, `createAccessInterpreter`, `createRetainedSourceAnalysis`, `observeProject`, `readProject`, `analyzeProject` and `explainImport`. |
| P | Real process fixture: the compiled daemon entry and the installed `ramify` executable with `RAMIFY_ENDPOINT_DIR` set to a unique temporary directory; root's process tracing preload records connect, listen, spawn, exits and loaded modules; the daemon is stopped in `finally`. |
| H | The harness's own copied inventory and assertion stubs. |

Evidence kinds: `api` (direct owner operations over A), `unit` (M), `session`
(W), `quick` (Q), `ipc` (real socket pairs in one process), `process` (P) and
`measurement` (instrumented real processes with retained raw results). A
`process`, `ipc` or `measurement` row is never satisfied by a `quick`,
`session` or `api` run of the same scenario, and availability of a capability
is never execution of its instances.

Edit sequences name Plan 1 statement IDs from the contract map: W2 is
`expose-sub createCatalogRouter, createCatalogTools, inspectRecord from catalog to parent`
in `subs/workspace/module.ramify` and C1 is
`expose-src * from "interfaces/vocabulary.ts" to parent` in
`subs/workspace/subs/contracts/module.ramify`. `remove-hop` removes only
`createCatalogRouter` from W2 and `restore-hop` restores it exactly, as in
I1-06. The most imported reference file is
`subs/workspace/subs/contracts/src/interfaces/vocabulary.ts`, whose C1
expansion carries seventeen symbols and which 56 importing accesses reach. A
body edit adds a statement inside a function body and changes no export,
import or declaration position. Each mutation asserts its anchor occurs
exactly once before writing, and each row restores the fixture it mutated.
Comparisons with batch follow the
[comparison method](scope.md#batch-and-session-comparison): the harness
materializes the same directory state and compares the session's revision
projection with `analyzeProject` over that state after replacing `runId`.
Every `session` row runs `verify()` after every step and asserts `equal`
unless its own expectation says otherwise. Every `unit`, `quick` and
`session` row asserts that no listener, timer, watcher handle, worker thread,
helper process or session survives disposal.

The twelve-step reference sequence, named by `I5-07:audit-equal-sequence`,
`I5-12:reference-sequence-live` and `I5-12:hundred-owner-sequence-live`, is:
(1) a body edit in `subs/workspace/subs/catalog/subs/core/src/catalog.ts`;
(2) a declaration move in that file; (3) an import of `RevisionScope` added to
`subs/workspace/subs/reviews/src/router.ts`; (4) an export added to
`subs/workspace/subs/contracts/src/interfaces/vocabulary.ts`; (5) that export
removed; (6) an import of `InspectionPort` added to
`subs/workspace/subs/reviews/subs/validation/src/validate.ts`, which the
review runtime never exposes to `validation`; (7) that import removed;
(8) `remove-hop`; (9) `restore-hop`; (10) the first paragraph of
`subs/workspace/README.md` edited; (11) `subs/workspace/subs/catalog/src/extra.ts`
created importing the vocabulary; (12) that file deleted. On S100 the same
twelve steps are applied to the generated owner at the same tree positions.

## Required matrix subcases

| ID | Iteration | Families | Capability | Fixture | Evidence | Exact mutation or observation | Independent expectation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I5-01:namespace-lazy-equal | 2 | DA10, DA18 | engine | A/R, A/T | api | Run `analyzeProject` over the reference and toolkit copies with the lazy spelling-filtered namespace index and compare the serialized reports with the recorded pre-change ones. | Both reports are equal except `runId`; the reference reports fifteen owners, complete coverage and two configuration warnings, and the toolkit 229 source files, 2,746 accesses and no finding. |
| I5-01:namespace-shadowing | 2 | DA10 | engine | A/F | api | On an F copy add `subs/consumer/src/shadow.ts` that imports the provider namespace as `api`, declares a local `const api` inside one function that shadows it and reads `api.value` both inside that function and in the outer scope. | The outer read is one member selection of `value` and the shadowed read produces no access at all, so the file contributes exactly one access. |
| I5-01:zero-queries-without-namespaces | 2 | DA10 | engine | A/F | api | Interpret `subs/consumer/src/probe.ts`, which binds no namespace, with the checker query counter instrumented. | Zero identifier symbol queries are issued for that file, and its access set still names `value` with the same written form as a whole pass. |
| I5-01:only-subset-equal | 2 | DA10 | engine | A/T | api | Call `interpret` for a three-file subset of the toolkit copy and for every owned file of the same snapshot. | The subset result equals the corresponding entries of the whole pass by file, target, written form, selection and coverage note, with no extra and no missing access. |
| I5-01:hoisted-setup-bounded | 2 | DA10 | engine | A/S1000 | api | Create one interpreter over S1000, then interpret a single file twenty times with the setup construction counted. | The catalog, original and inventory maps are built exactly once for the twenty calls, and no per-call structure is proportional to the 1,000-owner inventory. |
| I5-01:decide-indexed-equal | 2 | DA18 | engine | A/R, A/T | api | Decide every access of the reference and toolkit copies through the indexed lookups in `decisions.ts` and `canonicalOrigin`. | Decisions, their order and their diagnostic identities equal the recorded pre-change list; the reference keeps its two warnings and no finding. |
| I5-02:required-membership | 2 | harness | harness-gate | H | unit | Validate `--plan 5` membership against this document. | Every leaf here is registered, the total is 103, every matrix group has at least one member and every iteration count matches. |
| I5-02:removed-record-fails | 2 | harness | harness-gate | H | unit | Delete one record from `plan5-instances.ts`. | The gate and the iteration command both fail and name the missing record. |
| I5-02:failing-assertion-fails | 2 | harness | harness-gate | H | unit | Inject a failing assertion into a stub handler. | Both commands fail and the report retains the failure rather than reporting a pass. |
| I5-02:iteration-filter | 2 | harness | harness-gate | H | unit | Run `--iteration 4` and `--iteration 9`. | `--iteration 4` requires the instances of 2 and 4 only; `--iteration 9` requires 2 to 9; every other instance is reported `not-executed`. |
| I5-03:assembled-equals-whole | 3 | DA07, DA08 | catalog | A/R, A/T, A/S100 | api | Describe every owned file of the reference, toolkit and S100 copies and assemble the descriptions. | The assembled catalog equals `buildCatalog` over the same snapshot by value on all three, including originals, export names, coverage notes and file order. |
| I5-03:star-growth-reach | 3 | DA07, DA10 | catalog | A/F | api | On an F copy add `subs/provider/src/interfaces/index.ts` with `export * from './api.js'` and a consumer importing from it, then add the export `extra` to `api.ts`. | The recomputed set is exactly `api.ts` and `index.ts`; `index.ts` gains `extra` and every other description keeps its recorded identity. |
| I5-03:forwarding-chain-reach | 3 | DA07, DA10 | catalog | A/F | api | On an F copy build a named forwarding chain `api.ts` to `mid.ts` to `top.ts`, then rename the forwarded export in `mid.ts`. | Exactly the three chain files are described afresh, `top.ts` reports the new name, and no file outside the chain is recomputed. |
| I5-03:namespace-forwarding-reach | 3 | DA07, DA10 | catalog | A/F | api | On an F copy add `hub.ts` with `export * as api from './api.js'` and a file selecting a member of it, then add an export to `api.ts`. | `api.ts` and `hub.ts` are recomputed and nothing else; the namespace description gains the member and the assembled catalog equals a whole recompute. |
| I5-03:resource-shim-reach | 3 | DA07, DA08 | catalog | A/R | api | On a reference copy replace the ambient declaration of `*.module.css` with a project-local shim `subs/workspace/src/resources.d.ts`, then change that shim's default binding. | Both CSS-module resource descriptions record the new shim path in `dependencies.shims` and are recomputed; no file that describes no resource is recomputed. |
| I5-03:ambiguity-propagation | 3 | DA07, DA08 | catalog | A/F | api | On an F copy make two star re-exporters carry the same name into one index file, then remove one of them. | The ambiguous selection is recorded in the dependent descriptions and settles in a bounded number of propagation rounds; the assembled catalog equals a whole recompute with the ambiguity present and then absent. |
| I5-03:closure-superset | 3 | DA07, DA08, DA10 | catalog | A/R, A/T, A/S100 | api | For thirty single-file edits on each of R, T and S100, compare the recomputed set with the set of files whose description changed by value in a whole recompute. | Every file whose description changed by value lies inside the recomputed set on all three fixtures, and no changed description lies outside it. |
| I5-04:single-live-snapshot | 5 | DA14, ML02 | compiler | A/R | api | Apply twenty successive body edits through `update` on a reference copy with live snapshots counted. | Exactly one snapshot is live after each update, the previous one is disposed inside the call, and the count never exceeds one. |
| I5-04:changed-file-facts-equal | 5 | DA10, DA14 | compiler | A/R | api | Add a statement inside the body of `inspect` in `subs/workspace/subs/catalog/subs/core/src/catalog.ts`, then `update` and describe that file. | Its description and access facts equal a freshly created adapter's over the same disk state field by field, including declaration positions. |
| I5-04:created-deleted-configuration | 5 | DA09, DA14 | compiler | A/R | api | Create `subs/workspace/subs/catalog/src/extra.ts` importing the vocabulary, update, then delete it and update again. | The owned file list and the regenerated synthetic configuration name the file while it exists, program membership follows in both directions, and each state's catalog equals a fresh adapter's. |
| I5-04:invalidate-all | 5 | DA14 | compiler | A/R | api | Call `update` with `invalidateAll` after a dependency declaration change. | Every owned file is described afresh and the resulting catalog equals `buildCatalog` over the same state. |
| I5-04:observed-reads-complete | 5 | DA09, DA14 | compiler | A/R, A/S100 | api | Record the sink's observations across a cold open and one update on R and S100 and compare them with `readProject`'s captured inputs over the same state. | The two sets are equal by path, role and identity, with no path observed by only one of them, and the derived `inputId` values are equal. |
| I5-04:server-loss-explicit | 5 | DA14, ML02 | compiler | A/R | api | Kill the compiler server process between two updates. | The next call rejects with a `SourceFailure` whose code is `read-failure`; no description or access fact is returned and no stale fact is published. |
| I5-04:release-and-rebuild | 5 | DA14, ML02 | compiler | A/R | api | Call `releaseCompiler` on a warm adapter, then `update` with one body edit. | `hot` is false after the release and true after the rebuild, the server process is gone in between, and the rebuilt facts equal a fresh adapter's. |
| I5-05:description-local-update | 4 | DA05, DA13 | observer | A/R | api | Apply `remove-hop` to `subs/workspace/module.ramify` and call `apply` with that path. | A `local` update naming that description only; every other area keeps its recorded identity and no directory beneath `subs/` is listed again. |
| I5-05:readme-local-update | 4 | DA13 | observer | A/R | api | Edit the first paragraph of `subs/workspace/subs/catalog/README.md` and call `apply`. | A `local` update naming that README; the module's purpose is the new paragraph and no description is parsed again. |
| I5-05:file-created-local | 4 | DA09, DA13 | observer | A/R | api | Create `subs/workspace/subs/catalog/src/extra.ts` and call `apply`. | A `local` update whose `created` names it; it joins its owner's area and no other area or directory listing changes. |
| I5-05:file-deleted-local | 4 | DA09, DA13 | observer | A/R | api | Delete `subs/workspace/subs/reviews/subs/validation/src/validate.ts` and call `apply`. | A `local` update whose `deleted` names it; the inventory no longer lists it and no other area changes. |
| I5-05:module-added-structural | 4 | DA05, DA13 | observer | A/R | api | Add `subs/workspace/subs/catalog/subs/extra/module.ramify` with a valid header and a README. | A `structural` update; the rebuilt inventory holds sixteen owners with the new one beneath `catalog`. |
| I5-05:stray-description-invalid | 4 | DA05 | observer | A/R | api | Write a syntactically valid `module.ramify` into `subs/workspace/subs/catalog/src/`. | An `invalid` update carrying Plan 1's layout issue for the stray description; the previous inventory is not offered as current. |
| I5-05:sweep-detects-unwatched | 4 | DA09 | observer | A/R | api | Change a `zod` declaration file that the compiler read, deliver no change to `apply`, and call `reobserve`. | The returned changes name that path exactly once with kind `changed`; every unchanged observed path returns no change. |
| I5-05:input-id-equals-batch | 4 | DA09, DA13 | observer | A/R, A/S100 | api | Compute `inputId` after the cold observation and after three applied changes, against `readProject` over the same disk state each time. | The identities are equal at every step and differ between steps, so the observer's identity is the batch capture's identity. |
| I5-06:unchanged-surface-no-propagation | 6 | DA06, DA11 | session | W/R | session | Add a statement inside the body of `inspect` in `subs/workspace/subs/catalog/subs/core/src/catalog.ts`. | The revision's path is `unchanged-surface`, its checked set is that one file with zero accesses decided and `modelRebuilt` false, and the projection equals batch. |
| I5-06:position-only-refresh | 6 | DA06, DA10 | session | W/R | session | Insert a comment block above `export function inspect` so every declaration below it moves. | The path is `unchanged-surface`, `delta.positionOnly` names the identities that cite the moved original, and every decision's `original.declarations` equals a fresh batch analysis's. |
| I5-06:import-added-self-only | 6 | DA06, DA11 | session | W/R | session | Add an import of `RevisionScope` to `subs/workspace/subs/reviews/src/router.ts`. | Only that file is re-interpreted and decided, the checked set names one file, and the new access is allowed with no finding added. |
| I5-06:export-added-importers | 6 | DA06, DA08 | session | W/R | session | Add one exported schema to `subs/workspace/subs/contracts/src/interfaces/vocabulary.ts`. | The checked set is that file and its importing files only, the catalog gains exactly one original, C1's expansion grows by one and no finding appears. |
| I5-06:export-removed-missing | 6 | DA06, DA08 | session | W/R | session | Remove the export `revisionScopeSchema` from the vocabulary file. | Every importing access of that name reports `missing-export` at its own import statement, no other finding appears, and the checked set is that file and its importers only. |
| I5-06:violation-appears | 6 | DA06, DA11 | session | W/R | session | Add an import of `InspectionPort` to `subs/workspace/subs/reviews/subs/validation/src/validate.ts`, which the review runtime exposes to its parent only. | Exactly one finding is added, `not-visible` at that import; `delta.added` has one entry and `delta.removed` none. |
| I5-06:violation-removed | 6 | DA06, DA11 | session | W/R | session | Remove that import again. | `delta.removed` names exactly that identity, `delta.added` is empty and the project's finding count returns to zero. |
| I5-06:wide-fanin-bounded | 6 | DA08, DA11 | session | W/R | session | Add one export to the vocabulary file, which 56 importing accesses reach. | The checked set holds that file and its importing files only, no file that imports none of its exports is re-interpreted, and the accesses decided are at most those 56 plus the file's own. |
| I5-06:type-to-runtime-merge | 6 | DA08, DA10 | session | W/F | session | On an F copy make `Type` a class instead of an interface and add an unmarked import of it to `subs/consumer/src/probe.ts`. | The original's kind changes from type to value in the new revision, the unmarked import is interpreted as a value selection, and the catalog and accesses equal a fresh batch analysis's. |
| I5-06:alias-identity | 6 | DA08, DA10 | session | W/R | session | Rename the local function behind `inspect` in the catalog core and export it under the original name through a forwarding alias. | The original keeps its identity and owner, the root's import through `inspectRecord` still selects that one original, and no finding appears. |
| I5-07:description-relink-subtree | 7 | DA06, DA13 | session | W/R | session | Apply `remove-hop` to W2. | The path is `description`, the model is rebuilt, every decided access has its importer or its original's owner inside the `workspace` subtree, and the root's unchanged import of `createCatalogRouter` is denied `not-visible`. |
| I5-07:description-revert | 7 | DA06, DA13 | session | W/R | session | Apply `restore-hop`. | The denial leaves the next revision, `delta.removed` names exactly that identity, and the projection equals batch. |
| I5-07:readme-metadata-only | 7 | DA13 | session | W/R | session | Edit the first paragraph of `subs/workspace/README.md`. | The path is `metadata`, the compiler, link and decide timings are zero, the checked set holds no file and no access, and the projected purpose is the new paragraph. |
| I5-07:created-importing-file | 7 | DA09, DA07 | session | W/R | session | Create `subs/workspace/subs/catalog/src/extra.ts` importing the vocabulary. | The path is `broad`, the new file appears in the catalog with its accesses decided and no finding, and the projection equals batch. |
| I5-07:deleted-file | 7 | DA09, DA07 | session | W/R | session | Delete that file again. | The path is `broad`, the file is absent from inventory, catalog and coverage, any finding it carried is in `delta.removed`, and the projection equals batch. |
| I5-07:configuration-broad | 7 | DA09, DA14 | session | W/R | session | Add a `paths` entry to the reference `tsconfig.json`. | The path is `broad`, the checked set names every owned file, the compiler is not restarted, and the revision equals batch including `inputId`. |
| I5-07:dependency-broad | 7 | DA09, DA14 | session | W/R | session | Edit the `zod` declaration file the vocabulary reads. | The path is `broad`, the changed declaration is in the revision's observed inputs with its new identity, and the revision equals batch. |
| I5-07:invalid-description-current | 7 | DA05 | session | W/R | session | Drop the `from` clause of W2 so `subs/workspace/module.ramify` no longer parses. | The revision is published with `outcome.execution: 'invalid'` carrying the parse issue; the last valid revision is unchanged and no stale finding list is served as current. |
| I5-07:invalid-recovery | 7 | DA05 | session | W/R | session | Restore the valid description text. | The next revision is `completed` with the baseline findings, and `delta.added` names no finding. |
| I5-07:audit-equal-sequence | 7 | DA06, DA07, DA10 | session | W/R | session | Run the twelve-step reference sequence, calling `verify()` after every step. | `verify()` reports `equal` after all twelve steps and each step's projection equals batch over the same disk state. |
| I5-07:audit-detects-drift | 7 | DA10 | session | W/R | session | Corrupt one retained access fact between two steps, then call `verify()`. | The outcome is `mismatch` naming the differing field, the recomputed facts are published as a new revision with cause `verify`, and the following `verify()` reports equal. |
| I5-08:worker-nonblocking | 8 | DA11, ML07 | hosting | W/S1000 | session | Open a cold S1000 session while the host thread ticks a 10 ms timer. | The host thread keeps ticking throughout the cold open, with no gap over 100 ms between ticks. |
| I5-08:resource-limit-explicit | 8 | DA15, ML02 | hosting | W/S1000 | session | Open a session with `workerHeapMiB` set below the S1000 working set. | The outcome is an explicit `resource-unavailable` report, no revision is published, and no result claims a completed check. |
| I5-08:warm-demotion-rebuild | 8 | DA11, ML07 | hosting | W/R | session | Call `releaseCompiler`, then apply one body edit. | `status().level` is `warm` after the release with the retained fact count unchanged; the next revision takes the `broad` path and equals batch. |
| I5-08:sweep-scheduled | 8 | DA09 | hosting | W/R | session | Call `sweep()` with nothing changed, then change a dependency declaration on disk and call it again. | The first returns `unchanged` and publishes no revision; the second returns a revision whose `changed` names that path. |
| I5-08:sweep-after-configuration | 8 | DA09, DA14 | hosting | W/R | session | Change `tsconfig.json` on disk with no change delivered, then call `sweep()`. | The sweep observes the configuration change, the resulting revision takes the `broad` path, and its `inputId` equals a batch capture of the new state. |
| I5-08:deadline-exceeded-explicit | 8 | DA11 | hosting | W/S1000 | session | Apply a broad change on S1000 with the caller's deadline set to 200 ms. | The waiting call is answered explicitly at its deadline while the update runs to completion and publishes; the published revision equals batch. |
| I5-08:timings-recorded | 8 | DA11, DA17 | hosting | W/R | session | Record `RevisionTimings` for one edit of each revision path. | Every member is present and non-negative, `total` is no smaller than any phase, and the metadata path records zero for compiler, link and decide. |
| I5-08:dispose-releases | 8 | ML07, ML02 | hosting | W/R | session | Call `dispose()` on a hot session with a sweep scheduled. | The worker thread exits, the compiler server process is gone, no timer or handle remains, and the test process exits on its own. |
| I5-09:session-driver-open | 9 | DA02 | contexts | Q/R | quick | Open the unchanged reference through root's quick environment with the session driver. | `driver.open` is called exactly once for the context, revision 1 carries `cause: 'open'`, and its report projection equals batch except `runId`. |
| I5-09:revision-from-session | 9 | DA04, DA15 | contexts | M | unit | The scripted handle publishes revisions whose observed inputs name description, source and configuration paths in turn. | Fingerprints follow the six Plan 2 classes over those inputs, the sequence increases by one per publication, and equal inputs produce equal fingerprints. |
| I5-09:covered-immediate | 9 | DA02 | contexts | M | unit | A synchronized request whose `expect` identities all match observations of the published revision. | The request is answered from that revision with `reusedRevision: true` and the handle records no `update` call. |
| I5-09:flush-on-uncovered | 9 | DA02, DA04 | contexts | M | unit | A request naming an identity the published revision does not cover, with two watcher batches pending inside the debounce window. | Exactly one `update` call carries the request's paths and both pending batches, and the request is answered by the revision that update publishes. |
| I5-09:unobserved-input | 9 | DA02 | contexts | M | unit | Request an `expect` path that has no observation in the covering revision. | `unobserved-input` naming that path; no update is started and the published revision stays current. |
| I5-09:superseded-mismatch | 9 | DA02 | contexts | M | unit | `expect` names a stale identity that differs from the observed one after the update. | `superseded` carrying the path with its expected and observed identities; no report is returned under the stale expectation. |
| I5-09:history-compact | 9 | ML02, ML03 | contexts | M | unit | Publish thirty revisions carrying S100-sized diagnostic lists, then read a report by revision id. | History holds headers, diagnostics, warnings, coverage and deltas within the Plan 2 history limits, the handle's `report` is called once and only on demand, and the projection equals the recorded revision. |
| I5-09:cold-explicit | 9 | DA11 | contexts | M | unit | A request with a 50 ms deadline against a context whose first revision has not published. | `cold` with the elapsed time and the current status; the context keeps warming and publishes afterwards. |
| I5-09:not-checked-at-deadline | 9 | DA11 | contexts | M | unit | A request with a 50 ms deadline on a warm context whose update takes longer. | `deadline-exceeded` naming the sequence current at acknowledgment; the update still publishes and the next request observes it. |
| I5-09:hot-budget-demotion | 9 | ML03, DA15 | contexts | M | unit | Open three contexts with `maxHotContexts` set to two. | The least recently used context receives `releaseCompiler` exactly once, the other two stay hot, and the demoted context is still checkable. |
| I5-10:increment-removed | 9 | DA10, DA18 | supersession | T | process | Load the built `./analysis` entry and search the emitted build for the removed names. | None of `analyzeIncrement`, `IncrementInputs`, `IncrementRun`, `InputChange`, `RetainedStageId`, `RetainedStage`, `RetainedAnalysis` or `createAnalysisDriverFromSessions` remains; `analyzeProject`, `createAnalysisSession`, `validateProject`, `acquireInventory`, `resolveProject` and `openRetainedSession` are exported. |
| I5-10:plan2-gate-amended | 9 | DA18 | supersession | P/R, T | process | Run `npm run reference:verify -- --plan 2` with the recorded amendment. | The gate passes with exactly ten records marked `superseded`, each naming its I5 counterpart, and the remaining 166 records required and passing. |
| I5-10:plan2-contexts-regression | 9 | DA18 | supersession | P/R | process | Run the Plan 2 contexts, host, IPC, CLI and lifecycle groups I2-05 to I2-08, I2-14 to I2-17 and I2-20 to I2-27 on the session driver. | Every one of those records passes unchanged, none is skipped or superseded, and no daemon survives the run. |
| I5-11:changed-hashes-in-cli | 10 | PC03, QT01 | hook-cli | P/R | process | Run `ramify check --changed src/assembly.ts` with the wire messages traced. | The CLI computes the file's sha256 itself and sends it in `expect`, the daemon reads no project file to answer, and a named missing file is sent as an absent identity. |
| I5-11:changed-delta-document | 10 | PC10 | hook-cli | P/R | process | Apply `remove-hop`, then run `ramify check --changed src/assembly.ts --format json`. | Exactly one `ramify.check/1` document on standard output carrying the revision id, sequence and path, the denial marked `new: true` and `exitCode: 1`; standard error is empty. |
| I5-11:changed-exit-0-1 | 10 | PC10 | hook-cli | P/R | process | Run the same command on the unchanged reference and again after `remove-hop`. | Exit 0 with no finding and then exit 1 with the denial; both documents report `outcome: 'checked'` with a covering revision. |
| I5-11:changed-exit-2-not-checked | 10 | DA11, PC10 | hook-cli | P/R, P/S1000 | process | Five runs: a cold S1000 context with a 50 ms deadline; a warm context whose broad update outlasts its deadline; a path outside the selected root; a file rewritten after the CLI hashed it; and a stopped daemon. | Each exits 2 with `outcome: 'not-checked'` and reason `cold`, `deadline-exceeded`, `unobserved-input`, `superseded` and `unavailable` in turn; no run prints a finding list as a pass. |
| I5-11:changed-no-batch-fallback | 10 | PC03, PC10 | hook-cli | P/R | process | Make the daemon start fail through `RAMIFY_DAEMON_ENTRY` and run a `--changed` check. | Exit 2 with reason `unavailable`; the traced process loads no batch, analysis or compiler module and spawns no helper. |
| I5-11:since-evicted | 10 | DA15 | hook-cli | P/R | process | Name a `--since` revision that history has evicted after four publications under a two-revision limit. | The reason is `evicted-revision` with exit 2, and no document claims new-finding marks. |
| I5-11:plain-check-unchanged | 10 | QT01, PC10 | hook-cli | P/R | process | Run `ramify check --root examples/collection-review --format json` and the same with `--batch`. | One bare `ramify.analysis/1` document with no added member, equal to the batch document except `runId`; the human `Mode:` line adds the revision's path. |
| I5-11:host-adapter-claude | 10 | PC03 | hook-cli | P/R | process | Pipe a post-write hook JSON naming `src/assembly.ts` into `node examples/hooks/claude-code-post-write.mjs` after `remove-hop`, then with the exposure restored, then with the daemon stopped. | Exit 2 with the denial on standard error and nothing on standard output; then exit 0 silently; then exit 0 with a one-line notice naming the reason, so a cold daemon never blocks the agent. |
| I5-11:service-params-validated | 10 | PC10 | hook-cli | Q/R | ipc | Send `check` over a real socket pair with an unknown `scope`, a `since` that is not a `rev/1:` identifier, and `deadlineMs` values of zero, 600,001 and a fraction. | Every one is `invalid-request` on the wire with no context work started; a well-formed request over the same connection still succeeds. |
| I5-12:reference-sequence-live | 11 | DA06, DA10 | live-equivalence | P/R | process | Drive the twelve-step reference sequence through the real daemon and its watcher, auditing after each step. | Every published revision equals a batch check of the same disk state except `runId`, `verify()` reports equal after each step, and each step's expected finding or its absence holds. |
| I5-12:hundred-owner-sequence-live | 11 | DA06, DA10 | live-equivalence | P/S100 | process | Drive the same twelve steps on S100 through the real daemon. | Same equality, audit and per-step expectations as on the reference. |
| I5-12:hook-race-watcher | 11 | DA11 | live-equivalence | P/R | process | Write a file and run `--changed` before the watcher event arrives, then run it again after the revision published. | The racing hook joins exactly one update and is answered by a revision covering its identity; the later hook is answered with `reusedRevision: true` and no update. |
| I5-12:burst-coalesced | 11 | DA11 | live-equivalence | P/R | process | Write five files inside one 100 ms debounce window and run a `--changed` hook for each. | One revision covers all five, the sequence advances by one, every hook is answered from a revision covering its own identity and none receives `superseded`. |
| I5-12:removals-live | 11 | DA07, DA08 | live-equivalence | P/R | process | Delete an owned source file, then delete a whole module directory with its description, with the watcher live. | Both revisions equal batch, the removed file and owner leave the inventory and catalog, and the findings they carried appear in `delta.removed`. |
| I5-13:hook-latency-reference | 12 | DA11, DA17 | fast-measure | P/R | measurement | Run `npm run measure:fast` on the reference: twenty cycles of each edit class, the two hook races and the client with zero daemon work. | Every recorded median is within the reference column of the [budget table](scope.md#budgets), with the bare Node floor and the zero-work client cost recorded beside it. |
| I5-13:hook-latency-s100 | 12 | DA11, DA17 | fast-measure | P/S100 | measurement | The same recipe on S100. | Every recorded median is within the S100 column, which is binding from this iteration's exit. |
| I5-13:hook-latency-s500 | 12 | DA17 | fast-measure | P/S500 | measurement | The same recipe on S500. | Every value is recorded against the advisory S500 column with each miss named and its deferral trigger evaluated. |
| I5-13:hook-latency-s1000 | 12 | DA17 | fast-measure | P/S1000 | measurement | The same recipe on S1000. | Every value is recorded against the advisory S1000 column with each miss named and its deferral trigger evaluated. |
| I5-13:checked-set-bounded | 12 | DA11 | fast-measure | P/R, P/S100, P/S500, P/S1000 | measurement | Record the checked sets of an unchanged-surface edit and of an export edit on all four fixtures. | An unchanged-surface edit checks one file and zero accesses on every fixture, and an export edit checks the changed file and its importers only. |
| I5-13:repeated-edit-plateau | 12 | ML02 | fast-measure | P/R, P/S100 | measurement | Two hundred alternating edit and revert cycles on the reference and S100. | Compiler server and worker growth over the last hundred cycles is within the budget rows, the counters balance, and no retained fact set exceeds `maxRetainedFactBytes`. |
| I5-13:hot-warm-memory | 12 | ML03 | fast-measure | P/S100 | measurement | Two hot and six warm S100 contexts, sampled when settled. | Worker RSS, retained fact bytes per warm context and the combined daemon total are within their budget rows. |
| I5-13:cold-open | 12 | ML01, DA17 | fast-measure | P/R, P/S100, P/S500, P/S1000 | measurement | Cold open of one context on each fixture. | Within the cold-open row for the reference and S100; the S500 and S1000 values are recorded with the persistent-checkpoint trigger evaluated. |
| I5-13:entry-footprints | 12 | ML01, ML04 | fast-measure | P | measurement | Plan 2's entry footprint workloads on this build: idle CLI help, the `./client` import, a daemon with zero contexts, a daemon with one warm reference context and the CLI check client. | Each footprint is within Plan 2's recorded limit, so the session adds no cost to an entry that does not open one. |
| I5-14:self-check-eleven | 13 | DA18 | completion | T | process | Run `npm run check:self` over the toolkit copy. | Eleven owners, every owned file catalogued, no finding and no analysis limit. |
| I5-14:declarations-final | 13 | DA18 | completion | T | process | Run `npx tsx scripts/validate-final-contracts.ts`. | All eleven declarations match [owners.md](owners.md), including the six added lines and the removed increment line, and every exposure links to a real export. |
| I5-14:package-entries-unchanged | 13 | PC01 | completion | T | process | Resolve all eight package entries and `bin.ramify` from a packed install. | The entry map is unchanged from Plan 2, `./analysis` exposes `openRetainedSession` and no longer `analyzeIncrement`, and neither `./cli` nor `./client` loads a session, worker or compiler module. |
| I5-14:plan1-regression | 13 | DA18 | completion | R, T | process | Run `npm run reference:verify -- --plan 1` under a harness-owned `RAMIFY_ENDPOINT_DIR`. | All 308 Plan 1 instances pass on the Plan 5 build and no daemon survives the run. |
| I5-14:plan2-regression | 13 | DA18, QT05 | completion | R, T | process | Run `npm run reference:verify -- --plan 2` on the same build. | The 166 required Plan 2 instances pass with the ten superseded records recorded and no other record missing. |
| I5-14:documents-revised | 13 | DA18 | completion | H | unit | Read the three architecture documents after iteration 13's revisions. | Each states the session in a worker thread, the per-file fact granularity, the covering rule, the sweep, the hot and warm levels and `check --changed` with its exits; the two analysis documents are marked superseded where they differ. |

## Instance counts by iteration

| Iteration | Instances |
| --- | ---: |
| 2 | 10 |
| 3 | 7 |
| 4 | 8 |
| 5 | 7 |
| 6 | 10 |
| 7 | 11 |
| 8 | 8 |
| 9 | 13 |
| 10 | 9 |
| 11 | 5 |
| 12 | 9 |
| 13 | 6 |
| Total | 103 |
