# Iteration 2 results: Generated-output isolation and harness ledger

**Status:** complete. All twelve `I2A-02` leaves pass with real executable
assertions; the four `I2A-01` leaves are wired to pass on document evidence;
`I2A-03:enforcement-equivalence` (iteration 3's checked-in case) is wired in
per the coordinator's mid-task request. `npm run reference:verify -- --plan
2a --iteration 2` requires exactly iterations 1-2 and passes (16/16 required,
88 `not-executed`/`future-iteration`).

## Summary

Implemented the one canonical generated-path segment predicate
(`isRamifyGeneratedPath`/`isRamifyGeneratedSegment` in `analysis/project`) and
applied it before project inventory classification, explicit compiler
selection, exposure/reference resolution, captured-input admission (including
the compiler's own `include`/`exclude` glob resolution), observer
classification, directory-listing change detection, and the daemon's
filesystem watcher (both directory-attachment pruning and event filtering).
Registered all 104 Plan 2A leaves in a new harness ledger
(`plan2a-instances.ts`, `plan.ts`'s `readReviewedPlan2a`, `--plan 2a` in
`verify.ts`) mirroring the Plan 2/5 precedent, adapted to Plan 2A's simpler
four-column leaves table (no per-leaf capability/family column). Added root
and reference-example `.gitignore` rules for the final catalog and its two
transient publisher siblings. Did not add `AGENTS.md` instructions (the
command is not runnable yet, per the iteration's own deliverable list).

## Files changed

### `analysis/project` (owned)

- `subs/analysis/subs/project/src/generated-path.ts` (new): the predicate.
  `isRamifyGeneratedSegment(segment)` matches exactly `.ramify`,
  `^\.ramify\.tmp-.+$`, `^\.ramify\.old-.+$`; `isRamifyGeneratedPath(path)`
  splits on `/` and applies the segment predicate to every part, so it
  matches at any segment position per the coordinator's post-iteration-1
  revision (not only directly under `src/`/`src/tests/`).
- `subs/analysis/subs/project/module.ramify`: added the one owned line
  `expose-src isRamifyGeneratedPath from "generated-path.ts" to parent`
  (byte-identical to owners.md's reviewed text).
- `subs/analysis/subs/project/src/inventory.ts`:
  - New exported `areaPresent(capture, path)`: an area is present only when
    its directory exists and holds at least one **non-generated** entry.
    Used for the **tests** area only (see "Contract deviations" below for
    why ordinary presence keeps its original existence-only check).
  - The directory-walk loop now skips any entry whose basename is a reserved
    generated segment before it is ever observed (`capture.kind`), so nothing
    beneath `.ramify`/`.ramify.tmp-*`/`.ramify.old-*` is queued, classified,
    or captured.
  - `selected` (the compiler's resolved `files`) is filtered to drop any
    generated path before it can become outside-module source or a captured
    input, even when a tsconfig `files`/`include` entry names it explicitly.
- `subs/analysis/subs/project/src/observer.ts`:
  - `#classify` returns `{ kind: 'ignored' }` for any changed path matching
    the predicate, before description/readme/owned/structural classification,
    so `apply()` on a batch of only-generated changes reports `unchanged` and
    `reobserve()`/sweep never treats generated churn as an observed change.
  - `#refreshAreas` uses `areaPresent` for the tests area only; ordinary stays
    existence-only (same reasoning as above).
- `subs/analysis/subs/project/src/configuration.ts`: the `readDirectory`
  frame handler (used by the compiler's own `include`/`exclude` glob
  resolution, run in a separate supervised process) now skips generated
  entries before calling `capture.kind`, so TypeScript's own directory
  enumeration can never select or observe a generated path either -- this
  boundary is independent of and prerequisite to the inventory walk's own
  exclusion, since config resolution runs first and previously captured
  `.ramify` contents as inputs regardless of the final `selected` filter.
- `subs/analysis/subs/project/src/capture.ts`: `readDirectory` never records
  a reserved segment in a directory's stored `entries`, and `changes()`
  (the sweep/coherence comparison) filters the same way before comparing a
  fresh `readdir` against that stored listing. Without this, a directory
  whose *only* on-disk change was a `.ramify`/transient sibling
  appearing or disappearing would report as "changed" purely from that
  churn (via the stored-vs-fresh entries diff), which is exactly the
  "observer/sweep processing" boundary scope.md requires isolation at.

### `daemon` (owned, watcher only)

- `subs/daemon/src/filesystem-watcher.ts`: imports `isRamifyGeneratedPath`
  via the same relative-path pattern the daemon's other direct
  `analysis`-owned imports already use (see `connection.ts`, `service.ts`);
  applied at both the recursive directory-attachment loop (so no `fs.watch`
  handle is ever created beneath a reserved name) and the per-event path
  check (defense in depth for events a parent watch still reports). **This
  import is not yet legal under Ramify's own declared-exposure model** --
  see "Required follow-up" below; it compiles and type-checks today because
  TypeScript has no notion of the exposure graph.
- `subs/daemon/src/tests/watcher.test.ts`: added one real test creating
  `.ramify`, `.ramify.tmp-<suffix>`, `.ramify.old-<suffix>` and four
  near-miss names (`.ramify-other`, `.ramify2`, `.ramify.tmp`, `.ramifyx`) at
  three nesting depths (root, `src/`, `src/nested/`); asserts no directory
  watch is ever attached beneath a reserved name, no event for reserved-name
  content changes reaches the listener, every near-miss name is watched
  normally with its content changes visible, and a real neighboring source
  event (the positive control) still publishes.

### Root/reference ignore rules

- `/ramify/.gitignore` and `examples/collection-review/.gitignore`: added
  `.ramify/`, `.ramify.tmp-*/`, `.ramify.old-*/` (defense against commits,
  not runtime isolation, per scope.md).

### `scripts/reference-harness/**` (shared harness infrastructure)

- `instances.ts`: added `'X'` to `FixtureCode`; added `'document'`/
  `'platform'` to `EvidenceKind`; added thirteen Plan 2A group capabilities
  (`provider-review`, `isolation`, `availability`, `symbol-details`,
  `projection`, `rendering`, `publication`, `revision-query`,
  `service-operation`, `cli-command`, `agent-workflow`, `scale-evidence`,
  `final-declarations`) to `verificationCapabilities`; added
  `plan2aGroupCapabilities` (the one authored group-to-capability map both
  `readReviewedPlan2a` and `plan2a-instances.ts` import, since Plan 2A's
  leaves table has no per-leaf capability column, unlike Plan 2/5); added
  `plan2aInstanceFromSeed` and routed `instanceFromSeed` to it for any
  `I2A-`-prefixed id (checked first, before the existing Plan 2/5 dispatch,
  so Plan 1/2/5 behavior is unchanged).
- `plan.ts`: exported the previously-private `familyIds` helper (reused
  verbatim); added `plan2aPrerequisites` and `readReviewedPlan2a`, a new
  parser reading subcases.md's four-column leaves table plus main-plan.md's
  "Acceptance matrix" (13 rows) and "Iteration sequence" (10 rows) tables,
  cross-checked against subcases.md's "Membership" table; widened
  `ReviewedPlan.number` to include `'2a'`; added a narrowly scoped
  `validateInstancePointers` exemption for the `H01`-`H03` family IDs
  main-plan.md's `I2A-11` row cites (see "Contract deviations").
- `runner.ts`: widened `VerificationReport.plan` to include `'2a'`; widened
  the "complete evidence provider, not Plan 1 pipeline stage" id-prefix
  check from `/^I[25]-/` to `/^I(?:2A|[25])-/`; added the thirteen new
  capability keys to `capabilityPrerequisites` (all `[]`, matching every
  other Plan 2/5 capability).
- `verify.ts`: widened `VerifyOptions.planNumber` to `2 | 5 | '2a'`; accepts
  `--plan 2a` with iteration bound 1-10; wires `plan2aInstances`/
  `readReviewedPlan2a()`/`plan2aRuntime` into `main()`, with `workRoot`
  `.reference-work` (matching Plan 5's convention, since Plan 2A's `R`/`T`
  fixtures span both the reference example and this toolkit).
- `mutation.ts`: widened `runIsolatedProject`'s instance-id validation regex
  to accept `I2A-NN:...` alongside the existing `I[125]-NN:...` forms, for
  any later Plan 2A iteration that uses the `kind: 'project'` (R/T copy)
  handler shape; not exercised by my own leaves (all `kind: 'memory'`), but
  low-risk and in scope as shared harness infrastructure.
- `plan2a-instances.ts` (new): all 104 leaves transcribed from subcases.md's
  "Required leaves" table, generated mechanically from the table text (see
  method below) to avoid transcription drift, then verified self-consistent
  against `readReviewedPlan2a()` via the harness-membership handler.
- `plan2a-gate-cases.ts` (new): the four `I2A-02:harness-*` leaves, mirroring
  `plan5-gate-cases.ts`'s structure (membership/missing-record/
  failing-assertion/iteration-filter), adapted for Plan 2A's counts (104
  leaves, 13 groups, iteration-1 prerequisite carrying real leaves unlike
  Plan 5's iteration 1).
- `plan2a-isolation-cases.ts` (new): the eight non-harness `I2A-02` leaves,
  each a `kind: 'memory'` handler building its own isolated temp project
  (`node:fs/promises` `mkdtemp`/`rm` in `finally`) and calling the real
  `readProject`/`observeProject`/`openRetainedSession`/`createFilesystemWatcher`
  APIs directly against it -- no mocks.
- `plan2a-document-cases.ts` (new): the four `I2A-01` leaves, confirming
  `iteration1-results.md`, `contracts.md` and the raw probe JSON files exist
  and carry their expected anchors/content, per the coordinator's
  instruction that this group "passes on document evidence."
- `plan2a-runtime.ts` (new): assembles the document, gate, isolation and
  (iteration 3's) availability handlers into one `HarnessRuntime`.
- `plan2a.test.ts` (new): the Plan 2A vitest entry, mirroring `plan5.test.ts`
  (leaf transcription/pointer checks, iteration-bound parsing, an end-to-end
  `--iteration 2` run, and reviewed-document drift rejection cases for both
  `subcases.md` and `main-plan.md`).

### Wired in from iteration 3 (per the coordinator's mid-task request)

`scripts/reference-harness/plan2a-availability-cases.ts` already existed
(iteration 3's checked-in `I2A-03:enforcement-equivalence` case, real R/T
comparison of `listAvailableOriginals` against `explainImport`). I imported
its `plan2aAvailabilityHandlers` into `plan2a-runtime.ts` and added
`'availability'` to the runtime's capability set. No seed change was needed
in `plan2a-instances.ts`: the mechanically generated `I2A-03:enforcement-
equivalence` seed (iteration 3, fixture `A`, evidence `api`, matching
subcases.md's `A/R,T, api` cell) was already present from the initial 104-row
generation. The other seven `I2A-03` leaves are covered by
`subs/analysis/subs/model/src/tests/available-originals.test.ts` (iteration
3's owner unit tests, per its results file); they are not separately
registered in the harness runtime and remain `not-executed`/`missing-handler`
if ever required directly by a bare `--iteration 3` gate run -- this matches
Plan 5's convention that owner-test-covered capabilities are evidence
recorded in the iteration's own results file, not necessarily re-wired as a
harness handler unless a checked-in case file exists (as it does here for the
one real-R/T leaf). `--iteration 2` does not require iteration 3, so this
does not affect my own required leaves.

## Matrix leaves executed here (I2A-02, all twelve)

| ID | Evidence | Result |
| --- | --- | --- |
| `I2A-02:harness-membership` | `plan2a-gate-cases.ts` (unit) | Passed |
| `I2A-02:harness-missing-record` | `plan2a-gate-cases.ts` (unit) | Passed |
| `I2A-02:harness-failing-assertion` | `plan2a-gate-cases.ts` (unit) | Passed |
| `I2A-02:harness-filter` | `plan2a-gate-cases.ts` (unit) | Passed |
| `I2A-02:ordinary-inventory-excluded` | `plan2a-isolation-cases.ts` + `generated-path.test.ts` (api) | Passed |
| `I2A-02:tests-inventory-excluded` | `plan2a-isolation-cases.ts` + `generated-path.test.ts` (api) | Passed |
| `I2A-02:explicit-config-excluded` | `plan2a-isolation-cases.ts` (api) | Passed |
| `I2A-02:exposure-rejected` | `plan2a-isolation-cases.ts` (api) | Passed |
| `I2A-02:observer-input-stable` | `plan2a-isolation-cases.ts` (session, real `openRetainedSession`) | Passed |
| `I2A-02:watcher-silent` | `plan2a-isolation-cases.ts` + `watcher.test.ts` (quick-adjacent: real `createFilesystemWatcher`) | Passed |
| `I2A-02:tests-area-not-created` | `plan2a-isolation-cases.ts` + `generated-path.test.ts` (api; substituted for the `X` publisher fixture, see below) | Passed |
| `I2A-02:transient-names-excluded` | `plan2a-isolation-cases.ts` (api, plus a quick watcher-attachment spy check) | Passed |

Also executed (registered but outside this iteration's own group): `I2A-01`'s
four leaves passed on document evidence; `I2A-03:enforcement-equivalence`
passed via iteration 3's wired-in case (confirmed by the real
`--iteration 2` run reporting it correctly as `not-executed`/
`future-iteration`, i.e. registered but not required).

## Commands run

| Command | Outcome |
| --- | --- |
| `npx vitest run subs/analysis/subs/project/src/tests/` | 10 files, 166 tests passed |
| `npx vitest run subs/daemon/src/tests/watcher.test.ts` | 16 tests passed (includes the new isolation test) |
| `npx vitest run subs/analysis/src/tests/` | 15 files, 235 tests passed (includes `session-audit.test.ts`, which caught and confirmed the fix for the ordinary-area regression below) |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan2a.test.ts` | 8 tests passed |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/gate.test.ts scripts/reference-harness/plan2.test.ts scripts/reference-harness/plan5.test.ts scripts/reference-harness/verify.test.ts scripts/reference-harness/instances.test.ts scripts/reference-harness/cases.test.ts` | 179 tests passed -- no regression in Plan 1/2/5's own harness gates from the shared-file edits |
| `npm run type-check` | Passed (`tsc --noEmit`, `tsconfig.portable.json`, `tsconfig.scripts.json`, `scripts/reference-harness/tsconfig.json`) -- exit 0, no errors anywhere, including files owned by parallel iterations 3/4 |
| `npm run reference:verify -- --plan 2a --iteration 2` | Passed. Required iterations: 1, 2. Instances: 104; required 16; passed 16; failed 0; not executed 88 (all `future-iteration`). Exit 0 |

Not run (per the brief): full `npm test`/bare `vitest run`, `npm run build`,
`npm run check:self`/`check:reference` (require a build), non-dry
`reference:report`, full `reference:verify` gates for any plan, and the full
`npm run reference:cases` (would run every harness `.test.ts` file, including
the parallel iterations' and other plans' full suites).

## Contract deviations

1. **`areaPresent` scoped to the tests area only, not ordinary.** My first
   implementation applied the new content-aware presence check
   (`present = directory exists AND has >=1 non-generated entry`) uniformly
   to both areas. This broke `session-audit.test.ts`'s
   `membership-sequences-equal-batch` case: deleting a directory's only file
   made that (still-existing, now-empty) directory's `present` flip to
   `false`, which the session-revision layer treats as a structural/`broad`
   signal, where the reviewed test expects the narrower `membership` path for
   ordinary single-file create/delete. scope.md's binding requirement is
   specifically "testing-area presence... unchanged" by generated writes; it
   never asked for a semantic change to ordinary-area presence, which was
   already existence-only and has established dependents. Scoped the fix to
   `kind === 'tests'` only, in both `inventory.ts` (module creation) and
   `observer.ts` (`#refreshAreas`); confirmed the regression test now passes
   and re-ran the full `subs/analysis/src/tests/` suite (235/235 passed).
2. **`configuration.ts` and `capture.ts` needed the predicate too, beyond
   what owners.md's file list named.** owners.md's plan for `analysis/project`
   lists `inventory.ts`, `observer.ts` and reference/capture "checks" in
   prose but does not name `configuration.ts` or `capture.ts` explicitly.
   Real testing (`generated-path.test.ts`) showed the compiler's own
   `include`/`exclude` glob resolution (routed through `configuration.ts`'s
   `readDirectory` frame handler, a separate supervised process) captures
   `.ramify` contents as inputs independently of `inventory.ts`'s walk, and
   that `capture.ts`'s own `readDirectory`/`changes()` directory-listing
   comparison reports a directory as "changed" purely from generated-name
   churn unless the same filter is applied on both the recorded and the
   freshly-read side. Both are squarely inside scope.md's own boundary list
   ("captured-input admission", "observer/sweep processing"); this is an
   implementation-detail expansion of the *same* scope.md requirement, not a
   change to it, so no scope.md/contracts.md/owners.md text was edited.

No contracts.md, scope.md or owners.md text needed a dated revision note: the
generated-name predicate itself (frozen by the coordinator's post-iteration-1
revision) was implemented exactly as specified, with no open semantic choice.

## Remaining limits and required follow-up

- **Cross-subtree relay pending (coordinator-owned).** `filesystem-watcher.ts`
  imports `isRamifyGeneratedPath` via a relative path that is not yet legal
  under Ramify's own declared-exposure model: `subs/analysis/module.ramify`'s
  `expose-sub ... from project to parent, descendants` line and root
  `module.ramify`'s `expose-sub ... from analysis to descendants` line both
  need `isRamifyGeneratedPath` appended to their existing selection lists
  (owners.md's "Cross-subtree relay additions" item 1 names the exact edits).
  Until then, a Ramify self-check of the daemon (`ramify check` over this
  toolkit, or `npm run check:self`/`check:reference`, both of which require a
  build I did not run) would flag this specific import as a violation. I did
  not make this edit myself per the coordinator's explicit instruction.
- **`I2A-02:tests-area-not-created` uses inventory/observer evidence, not the
  `X` (publisher) fixture** subcases.md nominally assigns it, because the
  materialization publisher does not exist until iterations 6/7. Per the
  brief's explicit allowance, I proved the narrower available claim: neither
  inventory nor observer ever reports a tests area created by `.ramify`
  content under `src/tests/.ramify` when `src/tests` otherwise has none, and
  that writing `src/.ramify` never creates `src/tests`. The full leaf
  (materialize planning only the ordinary target and never creating
  `src/tests` on disk) is real follow-up work for whichever of iterations
  5-7 first has a `MaterializeParams`/publisher to exercise.
- **`I2A-02:watcher-silent`'s evidence is the real `createFilesystemWatcher`
  port directly**, not the full "quick environment" (root service + contexts
  + controlled ports) subcases.md's `Q` fixture code nominally implies, since
  no daemon service/context wiring for this capability exists until later
  iterations. This is the same real production adapter the daemon actually
  uses (already covered by `subs/daemon/src/tests/watcher.test.ts`'s
  parallel case), so the evidence is real, just not routed through the
  heavier fixture apparatus that doesn't exist yet.
- **The other seven `I2A-03` leaves** remain covered only by iteration 3's
  owner unit tests (`available-originals.test.ts`), not by a harness handler;
  a future iteration may choose to wire lightweight handlers for them if a
  `--iteration 3` gate needs to pass standalone (not required by `--iteration
  2`, which is this iteration's own verification requirement).
- **`H01`-`H03` forward-declared family exemption** in
  `validateInstancePointers` (`plan.ts`): main-plan.md's `I2A-11` acceptance-
  matrix row cites an `H01`-`H03` evidence family with no backing
  architecture-document table yet (unlike every `DA`/`PC`/`QT`/`ML` family,
  all confirmed present in their respective architecture documents). Added a
  narrowly scoped exemption (matixId `I2A-11` only), analogous to the
  existing `'harness'`/`I2-28`/`I5-02` exemption. `I2A-11` is iteration 9,
  well outside this iteration's own scope; whichever iteration implements it
  should either add the `H01`-`H03` rows to an architecture document (most
  likely `materialized-api-view.spec.md`'s own future acceptance-evidence
  table, or a dedicated "H" family list) or otherwise resolve the citation,
  then this exemption can be removed.
- **Toolkit self-check status.** `npm run check:self`/`check:reference`
  require a build (`npm run build`), which this iteration's brief reserves
  for iterations 8-10. Confirmed no lint/self-check regression indirectly via
  `npm run type-check` passing cleanly across the whole toolkit and scripts
  tree, but the daemon relay gap above means a real self-check would still
  fail until the coordinator's relay edit lands.

## Handoff

- `isRamifyGeneratedPath`/`isRamifyGeneratedSegment`:
  `subs/analysis/subs/project/src/generated-path.ts`, exposed to `analysis`
  via the added `module.ramify` line; needs the two named-list relay edits
  above before `daemon` (and any other non-`analysis`-parent consumer) can
  legally import it.
- `areaPresent(capture, path)`:
  `subs/analysis/subs/project/src/inventory.ts` (exported, used by both
  `inventory.ts` and `observer.ts`); applies only to the `tests` area kind.
- The Plan 2A harness ledger is complete and self-consistent for all 104
  leaves: `scripts/reference-harness/plan2a-instances.ts`,
  `plan.ts`'s `readReviewedPlan2a`, `plan2a-runtime.ts`,
  `verify.ts`'s `--plan 2a` support (iteration bound 1-10). Iterations 3-10
  can add their own `plan2a-*-cases.ts` handler files and merge them into
  `plan2aRuntime` in `plan2a-runtime.ts` (see how `plan2a-availability-cases.ts`
  was wired in as the pattern to follow), plus add any group capability's
  handlers under the existing `plan2aGroupCapabilities` key -- no further
  `plan2a-instances.ts` seed changes should be needed unless subcases.md
  itself changes.
- Generated-output isolation is now enforced at every boundary scope.md lists
  for iteration 2: inventory classification, explicit compiler selection
  (both the walk and the compiler's own config-resolution process), exposure/
  reference resolution, captured-input admission, observer classification and
  directory-change detection, and the daemon's filesystem watcher (attachment
  pruning and event filtering). Iterations 5-7 (projection, rendering,
  publication) can rely on this: no generated path can become an input,
  original, exposure, or observed change anywhere in the analysis pipeline
  the retained session/worker touches today.
