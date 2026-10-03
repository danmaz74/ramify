# Iteration 8B results: warnings and `ramify.check/2`

**Date:** 2026-10-03. **Status:** implementation receipt for sub-slice 8B of
[iteration 8](iteration8.md), as the coordinator split it (8A declared
discovery, 8B warnings and `ramify.check/2`, 8C auxiliary activation). At the
time of writing it awaits the coordinator's review, protected-file comparison
and iteration gate. Changes are uncommitted in the working tree. PB1-11
receives its evidence here; PB1-07 and PB1-33 stay with 8C. No case is claimed
complete before iteration 8 closes.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit | `ee9e295b`, clean at assignment (`base-head.txt`) |
| Contract revision | `contracts.md`, the owning specifications and the glossary unchanged; proposed patches below |
| Unchanged configuration | `package.json`, `package-lock.json`, `ramify-audit.json`, every `tsconfig*.json`, both Vitest configurations, `.gitignore`; nothing under `ramify-agent/` or `site/` |
| Node | v22.23.3; Vitest 4.1.11; TypeScript 7.0.2 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration8/8b/` |

## Changed behaviour

1. **`ProjectWarning` replaces `OutsideSourceWarning`** in Project
   (`subs/analysis/subs/project/src/interfaces/project.ts`) and through every
   relay and reader: `ProjectInventory.warnings`, `AnalysisReport.warnings`
   (`subs/analysis/src/interfaces/analysis.ts`), `SessionRevision.warnings`
   (`interfaces/session.ts`), the report draft (`report.ts`, now ordered by
   path, then code), the contexts' `CheckDelta` (`interfaces/contexts.ts`) and
   the CLI's `CheckDocument` (`subs/cli/src/interfaces/cli.ts`). The root and
   analysis descriptions relay `ProjectWarning` in the place of
   `OutsideSourceWarning`; Project's wildcard interface exposure already selects
   it, and it names no other project symbol, so it has no further signature
   companion. The relay change is the named layer
   "Phase 1 project boundaries (project warnings)" in
   `scripts/validate-final-contracts.ts` (withdrawing the old selections and
   adding the new ones for `./` and `subs/analysis/`), and the reviewed list in
   `descriptions.test.ts` carries `ProjectWarning` at the same position, with a
   comment.
2. **The two compiler-selection warnings (PB1-11)**
   (`subs/analysis/subs/project/src/inventory.ts`). After the walk, a
   compiler-selected file beneath a pruned directory (a declared nested tree or
   a module scratch directory) is neither inventoried nor read: it no longer
   enters `outsideModuleFiles` and its bytes are not captured as a dependency
   input (8A's deviation 4 ends). Its owned-ignored or scratch exclusion, from
   the revision's ownership table, gives one `compiler-selected-owned-ignored` or
   `compiler-selected-scratch` warning per directory. A selected file in an
   external tree produces no warning (see the open points).
3. **Transitional outside warning (Q5).** Compiler-selected source outside
   every module's `src/` keeps its existing aggregation, one warning per first
   path entry, under the code `outside-module-source`, now in the new shape.
   `outsideModuleFiles` is unchanged and auxiliary source is not inventoried.
4. **Observer** (`observer.ts`). A local update carries the inventory's
   warnings over unchanged, as it already carried `outsideModuleFiles`: it moves
   no boundary and admits no outside-module file. A rebuild recomputes both.
5. **`ramify.check/2`.** `check --changed` writes `schemaVersion:
   'ramify.check/2'` (`changed-command.ts`); its embedded warnings are
   `ProjectWarning`. `ramify.analysis/2` is extended (its warnings change shape,
   no new identifier). The contexts' check reply carries the same warnings in
   its delta; the strict daemon codec does not decode warning lists, so
   `ramify.ipc/2` is extended without a new identifier, as the version-2
   documents already were in 8A. `ramify.watch/2` carries a full analysis
   report, so the analysis identifier covers it. `ramify.measure` does not
   advance here.
6. **Human output** (`subs/cli/src/format.ts`). A complete report prints
   `Warning [<code>] <path>: <message>` followed, when the warning lists files,
   by ` (<files>)`, with `, and N more` when `count` exceeds the listed files.
   The changed-check output prints `Warning [<code>] <path>: <message>` without
   the list, as before. For the transitional code the complete line is
   byte-identical to the previous one, for example
   `Warning [outside-module-source] tests: 1 compiler-selected file outside module source (tests/helper.ts)`.
7. **G4: compiler roots** (`subs/analysis/subs/typescript/src/synthetic.ts`).
   `syntheticInputs`, which both the finite helper and the retained adapter use,
   drops a configuration-selected file from the synthetic configuration's roots
   when `classifyProjectPath` places it in an owned-ignored, external or scratch
   exclusion. Owned source and other selected files stay roots as before. This
   is a contained change of root selection: resolution of an import into such a
   directory is unchanged and stays with iteration 9.

## The `ProjectWarning` shape and the choices made

```ts
export interface ProjectWarning {
  readonly code: 'compiler-selected-owned-ignored' | 'compiler-selected-scratch' | 'outside-module-source';
  readonly path: string;
  readonly message: string;
  /** Where file evidence is needed: a bounded, byte-ordered prefix of the files, with `count` the total. */
  readonly files?: readonly string[];
  readonly count?: number;
}
```

Where the contracts leave the detail open (G2), as the coordinator directed:

- **Unit.** One warning per owned-ignored tree or scratch directory, `path`
  being that directory (project-relative, as in the ownership table). The
  transitional `outside-module-source` keeps one warning per first path entry.
- **Bound.** `files` lists at most 20 files (`warningFileLimit` in
  `inventory.ts`), in byte order; `count` is the total. The bound applies to
  every code, the transitional one included; no existing case lists more
  than two.
- **Optional members.** `files` and `count` are optional in the type, following
  the contract's "where file evidence is needed", because `ignored-but-walked`
  (iteration 17) names a directory. Every warning this slice produces carries
  both. Readers handle their absence.
- **Code type.** A union of the codes produced so far, documented as an open
  set; `ignored-but-walked` is not declared until something produces it.
- **Order.** Warnings are ordered by `path`, then `code`.
- **Messages.** `N compiler-selected file(s) outside module source`;
  `N compiler-selected file(s) in an owned-ignored tree of module <id>, which
  Ramify does not analyze; exclude the tree from the compiler configuration`;
  `N compiler-selected file(s) in the scratch directory of module <id>, which
  Ramify does not analyze; exclude the directory from the compiler
  configuration`.

## PB1-11 evidence

`subs/analysis/subs/project/src/tests/project-boundary-inventory.test.ts`,
describe "PB1-11: compiler-selected exclusion warnings" (3 tests; the file now
has 23), with expectations written from the contracts and the choices above:

- An `include` selecting files in an owned-ignored tree (two, one nested), in
  the root's and a child's scratch directories, in an external tree and in a
  loose `tools/` directory yields exactly four warnings: the owned-ignored
  tree, both scratch directories, each located at its directory with its owner
  in the message, and the transitional `tools` warning (positive control). No
  excluded file is inventoried or in `outsideModuleFiles`. The outside file is
  read (role `dependency`, bytes > 0); each excluded file appears only as a
  zero-byte kind observation, never read.
- 27 selected files in one tree give `count: 27` and the first 20 in byte order.
- Excluding the three directories in the configuration removes their warnings
  (the transitional one remains).

`subs/analysis/src/tests/session.test.ts`, "warns about compiler-selected
source in an owned-ignored tree and a scratch directory without compiling or
reading it": through `analyzeProject`, the check passes with complete coverage
and three warnings, and no analysis input with bytes lies at an excluded file,
while the outside file is read. This is the G4 evidence: without the root
filter the compiler reads both excluded files.

Negative controls, each restored byte-identically afterwards (`cmp`):
disabling the Project filter fails all three PB1-11 project tests
(`negative-control-project.log`); disabling the synthetic root filter fails the
analysis test, the compiler having read `subs/consumer/src/tmp/draft.ts` and
`tools/fixtures/data.ts` (`negative-control-g4.log`).

Recorded process check with the built CLI (`scratch/process-project/`: a root
with `owned-ignored "fixtures"`, a child `a`, a configuration including
`src`, `subs` and `fixtures`, and files `fixtures/a.ts`, `fixtures/deep/b.ts`,
`src/tmp/draft.ts`):

- `ramify check --batch --format json`: exit 0, passed, complete; two warnings
  in the new shape (`fixtures`, 2 files; `src/tmp`, 1 file); inventory files
  `src/main.ts`, `subs/a/src/api.ts` only; `outsideModuleFiles` empty; inputs
  at or beneath the exclusions are the two directories' listings and zero-byte
  kind observations (`process-batch.json`, `process-batch-summary.json`). The
  human form prints both warning lines and exits 0 (`process-batch-human.log`).
- With a private `RAMIFY_ENDPOINT_DIR` (mode 0700): a resident complete check
  (exit 0), then `ramify check --changed src/main.ts --format json` printing one
  `ramify.check/2` document, `outcome: 'checked'`, exit 0, carrying both warnings
  (`process-changed.json`), and its human form (`process-changed-human.log`).
- The hook example, fed a `PostToolUse` event on stdin with the built launcher
  on `PATH`: silent exit 0 for the unchanged file; after an edit adding a
  denial, it printed the new `not-visible` finding and exited 2
  (`process-hook-finding.*`), so it reads the `ramify.check/2` document
  (`process-hook.*` and `process-resident.exits` hold the silent run). A first
  attempt, before the endpoint directory had mode 0700, was refused by the CLI
  as an unsafe endpoint directory; its files were overwritten by the rerun.
  Each daemon was stopped with
  `ramify daemon stop` (exit 0), and status then reported `running: false`.

## Readers migrated

- CLI: `changed-command.ts`, `interfaces/cli.ts`, `format.ts`, the help-path
  comment in `arguments.ts`, `subs/cli/README.md`; root `README.md`.
- `examples/hooks/claude-code-post-write.mjs` (accepts `ramify.check/2`).
- `scripts/measurements/fast-assertions.mjs` and `fast-evidence.test.mjs`; the
  racing-hook test gains a rejection control for an outdated
  `ramify.check/1` document.
- Toolkit tests: `src/tests/batch-cli.test.ts`, `src/tests/resident-cli.test.ts`,
  `subs/cli/src/tests/changed-cleanup.ts`, `changed-command.test.ts`,
  `exhausted-recovery.ts`, `subs/analysis/src/tests/session.test.ts`,
  `toolkit-boundaries.test.ts`, `subs/analysis/subs/project/src/tests/project.test.ts`,
  `descriptions.test.ts`.
- Harness: `plan5-hook-cases.ts`, `plan5-live-process.ts`, `cli-cases.ts`,
  `project-cases.ts`, `session-cases.ts`, `relocation.ts`,
  `reference-baseline.ts`, and three readers the assessment did not list:
  `catalog-cases.ts` and `report.ts` (the `entry` field) and
  `plan5-completion-cases.ts` (a document witness naming `ramify.check/1`);
  rechecked with `rg` for `entry`, `OutsideSourceWarning` and `ramify.check/1`.
- Documents: `docs/architecture/daemon.md` (two places) and
  `processes-and-clients.md` name `ramify.check/2`; the Project README describes
  the warning shape and codes; the TypeScript README says excluded selections
  are never roots. The hook example's README names no version.
  `docs/roadmap.md`'s mention of `ramify.check/1` describes the earlier plan
  historically and is unchanged.

## Re-reasoned expectations

| File | Change and reasoning |
| --- | --- |
| `src/tests/batch-cli.test.ts` | The JSON warning becomes `{ code: 'outside-module-source', path: 'tests', message: '1 compiler-selected file outside module source', files: ['tests/helper.ts'], count: 1 }`: the first path entry of the one selected loose file, its count, the chosen message. The human order check now names the whole warning line |
| `project/src/tests/project.test.ts` (incomplete acquisition) | Same reasoning for `src`, 2 files: the outside list is fixed before the failing read, so its warning is retained |
| `analysis/src/tests/session.test.ts` (outside target) | `tools`, 1 file, new shape |
| `analysis/src/tests/toolkit-boundaries.test.ts` | "No warning beneath a declared tree" also excludes a warning located at the tree itself or listing a file beneath it |
| `cli/src/tests/*`, `src/tests/resident-cli.test.ts` | Expected `schemaVersion` is `ramify.check/2` (contracts, schema versions) |
| Harness `cli-cases.ts` | The human check expects `Warning [code] path: message (files)` for each report warning; `I1-28` expects the new-shape `tests` warning; the reference's two warnings are compared by `path` and `count` (each a root-level file, its own first entry, count 1). Assertion labels unchanged |
| Harness `project-cases.ts` | The outside helper and `I1-29:stray-files` expect the new shape with the chosen messages (`config-extra.ts` 1 file, `tests` 2 files); the reference's two warnings by `path` |
| Harness `session-cases.ts`, `relocation.ts`, `reference-baseline.ts`, `catalog-cases.ts` | The same per-file `vite.config.ts`, `vitest.config.ts` and `loose.ts` warnings in the new shape |
| Harness `plan5-hook-cases.ts`, `plan5-live-process.ts` | `ramify.check/2` |
| Harness `plan5-completion-cases.ts` | The architecture witness for `daemon.md`'s "Hook request and reply" paragraph expects `ramify.check/2`, the identifier that paragraph now names (found by the first reference run) |

Instance rows whose prose no longer describes what the instance asserts (kept
byte-identical): **I5-11:changed-delta-document** (`plan5-instances.ts`) says
"Exactly one `ramify.check/1` document"; the case now asserts
`ramify.check/2`. The Plan 1 warning rows (I1-02:stray-description, I1-28,
I1-29) still hold in 8B, because the outside warning is still produced; they
become stale in 8C.

## G4 and deviation 1

**G4: done here** (changed behaviour 7). The filter lives in the adapter's root
selection only. An owned import that resolves into a declared tree or scratch
directory still loads that file through resolution; intercepting it is
iteration 9's.

**Deviation 1: neither prevented nor kept from becoming an input in this
slice; handed to iterations 15–16 (configuration capture).** What it is,
measured with `scratch/stat-probe.mts` (`deviation1-stat-probe.log`):

- When an `include` pattern covers a declared tree or scratch directory,
  TypeScript lists it while computing the selection, through the configuration
  helper's `readDirectory` callback, and the helper calls `capture.kind` on each
  entry. Each listed directory becomes a `directory` input and each file a
  zero-byte `dependency` kind observation whose signature includes size, mtime
  and ctime. Editing such a file's bytes therefore changes the sealed inputs
  (seal `changed` for `fixtures/a.ts` and `src/tmp/draft.ts`), although the bytes
  are never read.
- This happens even when `exclude` names the directory (warnings then empty,
  observations still present), and with `include: ['src/**/*.ts']` and
  `exclude: ['src/tmp']`. With explicit `files`, nothing beneath is observed and
  a byte edit leaves the seal coherent.
- After acquisition the TypeScript adapter's own `parseConfigFile` lists the
  same directories through the view.

Why it is not contained here: configuration evaluation precedes discovery
(`read-project.ts`: `acquireConfiguration`, then `inventoryProject`), so the
declarations are unknown when the compiler lists; and the warnings themselves
need the compiler's selection over those directories. Removing the observations
afterwards would leave the adapter's listing in place, and the retained
configuration's reuse compares directory listings, so a dropped listing would
let a stale selection be reused. A fix belongs to configuration capture: for
example, recording entries beneath an exclusion as membership and kind only,
without the stat signature, in both the configuration helper and the adapter's
host. The toolkit's own configuration selects no declared tree, and its scratch
directories are absent, so its inputs are unaffected.

## Commands and results

Build, test, self-check and process runs held `/tmp/ramify-audit-tests.lock`.
No view was materialized.

| Command | Result | Evidence |
| --- | --- | --- |
| `git diff --check` | Exit 0 | `diff-check.log` |
| `npm run build` | Exit 0 (rebuilt after the last source edit) | `build.log`, `build-2.log` |
| `npm run type-check` | Exit 0, all four scopes | `type-check.log`, `type-check-2.log` |
| `npm run check:self` | Exit 0: passed, complete; 15 owners, 460 source files (unchanged; no new source file), 17 resources, 7066 accesses (7064 before: two new `classifyProjectPath` bindings, in `inventory.ts` and `synthetic.ts`), 0 errors, 0 warnings, 0 analysis limits, 4940 allowed, 0 denied, 2126 external | `check-self-2.log` |
| `ramify check --batch` from `examples/collection-review` (human and JSON) | Exit 0; passed, complete; 15 owners, 54 source files, 313 accesses; the 2 existing outside warnings in the new shape (`vite.config.ts`, `vitest.config.ts`) | `check-example.log`, `check-example.json` |
| `npx vitest run subs/analysis/subs/project/src/tests/project-boundary-inventory.test.ts` | Exit 0, 23/23 | `vitest-boundary-inventory.log` |
| `npx vitest run subs/analysis/src/tests/session.test.ts subs/analysis/src/tests/toolkit-boundaries.test.ts` | Exit 0, 2 files, 59/59 | `vitest-session-boundaries.log` |
| Negative controls (Project filter; synthetic root filter) | Exit 1, 3 failed / exit 1, 1 failed; both files restored | `negative-control-project.log`, `negative-control-g4.log` |
| `npx vitest run subs/analysis/subs/project/src/tests/` | Exit 0, 12 files, 293/293 (after the last source edit) | `vitest-project-2.log` |
| `npx vitest run subs/analysis/src/tests/` | Exit 0, 40 files, 463/463 | `vitest-subs-analysis-src-tests.log` |
| `npx vitest run subs/analysis/subs/descriptions/src/tests/` | Exit 0, 6 files, 292/292 | `vitest-subs-analysis-subs-descriptions-src-tests.log` |
| `npx vitest run subs/analysis/subs/typescript/src/tests/` | Exit 0, 19 files, 215/215 | `vitest-subs-analysis-subs-typescript-src-tests.log` |
| `npx vitest run subs/cli/src/tests/` | Exit 0, 8 files, 245/245 | `vitest-subs-cli-src-tests.log` |
| `npx vitest run subs/daemon/subs/contexts/src/tests/` | Exit 0, 13 files, 177/177 | `vitest-subs-daemon-subs-contexts-src-tests.log` |
| `npx vitest run subs/daemon/src/tests/` | Exit 0, 21 files, 248/248 | `vitest-subs-daemon-src-tests.log` |
| `npx vitest run src/tests/*.test.ts` (the 20 root files) | Exit 0, 20 files, 103/103 | `vitest-root.log` |
| `node --test scripts/measurements/fast-evidence.test.mjs` | Exit 0, 20/20 | `node-test-fast-evidence.log` |
| Harness: `final-contracts.test.ts`, `self.test.ts`, `cli.test.ts`, `session.test.ts`, `catalog.test.ts` | Exit 0, 5 files, 48/48 | `harness-focused-1.log` |
| Process check: batch JSON and human, resident complete, `--changed` JSON and human, hook example twice, daemon stop and status | Exits as described under PB1-11 | `process-*` |
| `npm run type-check` after the harness witness edit | Exit 0 | `type-check-3.log` |
| `npm run reference:cases`, first run (frozen tree, started 18:46 UTC after the final build) | Exit 1: 37 files, 392/393. `plan5-completion.test.ts` "requires each revised architecture statement": `docs/architecture/daemon.md: missing the hook request and reply`, because the witness pattern required `ramify.check/1` and the paragraph now names `ramify.check/2`. Working-tree identity unchanged during the run | `reference-cases-1.log`, `diff-before-reference.sha256` |
| Harness: `plan5-completion.test.ts` after updating the witness | Exit 0, 4/4 | `harness-plan5-completion.log` |
| `npm run reference:cases`, final run on the frozen tree (started 18:53 UTC) | Exit 0: 37 files, 393/393, 340.82 s; the same 40 `ExperimentalWarning` lines as iteration 8A. Working-tree identity (tracked diff and this receipt) and status identical before and after; only this row was written afterwards | `reference-cases-2.log`, `diff-before-reference-2.sha256`, `diff-after-reference-2.sha256` |

The owner runs other than Project's preceded the last source edit, which only
made `warningFileLimit` module-private and reworded a comment in
`inventory.ts`; Project's directory, the self-check and the type-check ran
after it.

## Protected documents

No `.principles.md` or `.spec.md` file and not the glossary changed. Proposed
patches, checked with `git apply --check`, are in
`/home/app/ramify-pb1-evidence/iteration8/8b/proposed-spec-patches.diff`:

- `cli-invocation.spec.md`: the "Files outside modules" pending note says the
  first two warnings are reported while auxiliary analysis and the Git warning
  remain pending; a new paragraph states that a selected file in an
  owned-ignored tree or scratch directory is not a project file outside
  modules, is neither inventoried nor read nor a compiler root, and gives one
  warning per tree or directory with code, path, message and at most 20 files
  plus the count, and that an external tree's selected file gives none; the
  aggregation paragraph names the code `outside-module-source`; the
  `--no-snapshot` paragraph names `ramify.check/2`.
- `module-description.spec.md`: the status header, the opening note of
  "Declared Nested Trees Bound Interpretation" and the closing implementation
  note say acquisition reports the compiler-selection warnings and never
  inventories, reads or roots such source; auxiliary analysis and the import
  rule stay pending.

## What 8C still lacks

Auxiliary inventory; retirement of `outsideModuleFiles` and of the transitional
`outside-module-source` code (`ramify.measure/2`); the decisions C1, Q2 and Q3
of the assessment; the widened self-check; PB1-07 and PB1-33. The Project
README's archived purpose paragraph still says "outside-module warnings",
which holds until 8C retires them; it is compared byte for byte with the
reviewed owner list, so it was not edited here.

## Open points for the coordinator

1. **External trees.** A compiler-selected file in an external tree is silent,
   not inventoried, not read and not rooted, because the contracts list no code
   for it. Confirm, or name a code.
2. **Optional `files`/`count`.** Chosen from the contract's wording; confirm, or
   make them required until iteration 17 needs otherwise.
3. **Deviation 1** for iterations 15–16, as described above. The
   observation contract ("inert/excluded byte edits do not change input
   identity") does not hold yet for files beneath an exclusion that an
   `include` pattern covers.
4. **Contracts text.** The G2 choices (unit, bound 20, messages, order) are not
   in `contracts.md`; the coordinator may record them there.

## Coordinator review

The coordinator reviewed the `ProjectWarning` shape, the two
compiler-selection warnings, the compiler-root filter and the `ramify.check/2`
readers, authorized `proposed-spec-patches.diff` unchanged
(`cli-invocation.spec.md` and `module-description.spec.md`) and applied it
with this slice. Accepted: a compiler-selected file in an external tree is
silent, since no rule names a warning for it; `files` and `count` stay
optional; the open details chosen here are recorded in `contracts.md`. The
compiler's listing of an excluded directory that an `include` covers still
enters the recorded inputs; it is handed to iterations 15–16 with the
measured description in this receipt. The iteration gate runs on the
committed candidate and its result is recorded in the evidence directory
named by that commit.
