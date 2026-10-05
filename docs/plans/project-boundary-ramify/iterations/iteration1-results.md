# Iteration 1 results: contract adoption and gate readiness

**Date:** 2026-10-03. **Status:** preparation receipt awaiting the
coordinator's review at the time of writing; see the coordinator review below. Proposed specification patches were written, not applied, by the iteration agent;
no protected document, runtime source, test or configuration was changed. PB1
runtime cases remain pending; nothing here passes one of them.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1` (moved from `/tmp/ramify-pb1` after the gate), branch `feat/project-boundary-ramify` |
| Source commit / tree | `33d8a739a450737271f1c9bb6f6a5761ae81c657` / `8465d4ec87bd109adfd7988129d477e5a540f3d2` |
| Contract revision | `contracts.md` blob `41b269c7f3c77f0b63dcb3612630f8aa0fd3d50b` (last changed in `8c02cad3`) |
| Audit configuration | `ramify-audit.json` blob `b59f28f66dee440fcebd520de16e60ac8aeee765` |
| Lockfile | `package-lock.json` blob `fd3c84ba14998cc07f12d6c3426d963def4e04bb` |
| Audit executable | `/ramify/ramify-agent/node_modules/ramify-audit/dist/cli.js`, `ramify-audit@0.3.2`, sha256 `b4e3bbe8dc95273adc476e709749cf076302d8d05e9338ade88c5ddf8e681e28` |
| Evidence | `/home/app/ramify-pb1-evidence/33d8a739/iteration1/` (gate) and `/home/app/ramify-pb1-evidence/iteration1/` (patches, protected baseline) |

The worktree registered at `/tmp/ramify-pb1` was missing when this iteration
started: the container restarted at 09:13 UTC and `/tmp` was recreated. It was
recreated with `git worktree add -f` on the same branch and commit, then
prepared with `npm ci` and `npm --prefix examples/collection-review ci`.

## Review decisions R1–R6

All six entries carry the user's decision of 2026-10-03, recorded in
[contracts.md](../contracts.md#review-decisions) at the revision above: the R2,
R5 and R6 rows state their decisions, and the paragraph after the table records
R4's decision and the user's acceptance of R1 and R3 as drafted, with no open
entry.
R4's core rule is already in the
[CLI invocation specification](../../../architecture/cli-invocation.spec.md#hook-and-complete-checks)
(commit `da969db8`). This iteration does not decide or reopen any entry.

| Entry | Already specified | Proposed adoption hunk |
| --- | --- | --- |
| R1 | Kinds, placement and non-descent in the layout specification; syntax explicitly pending | Statement grammar, reserved keywords, tag-position rule, clause-free statements, ordering, directory-string decoding (layout specification) |
| R2 | Placement, child exclusion, owned-ignored existence | Strict containment, symlink refusal, real-directory requirement, equal-or-nested rejection without precedence, always-excluded declarations; validation table row |
| R3 | Containment ownership for existing, new and deleted paths (layout specification) | Version 2 rule for changed documents and IPC; affected containment answers; pending replacement of the outside-module rules (CLI specification); excluded-target limit (source specification); architect, API-view and modularity consumers |
| R4 | Hook result equals the complete check's result; not-checked exit 2 | Per-path `checked`/`not-analyzed`/`not-checked` dispositions and their exit-code effect (CLI specification) |
| R5 | Nothing in a protected specification makes a timing target blocking | None; the policy lives in [budgets.md](../budgets.md#policy) |
| R6 | No protected specification names the harness location | None; proposal decision 13 and the plan carry it |

The exact patch is
`/home/app/ramify-pb1-evidence/iteration1/proposed-spec-patches.diff`
(sha256 `9baff0af23b67e003dfea06d204999d4c50761d43565972c9871724b5674f0ec`,
19 hunks over six files, `git apply --check` clean at `33d8a739`). Every hunk
keeps runtime support marked pending. No principle change is proposed.
Protected-file hashes at the baseline are in
`/home/app/ramify-pb1-evidence/iteration1/protected-baseline.sha256`.

## Schema inventory

Producers are toolkit owners; "relay" names the named `expose-sub` lists that
must gain new companion types or drop removed ones in the producing slice
(`subs/analysis/module.ramify` lines 7, 10, 13; root `module.ramify` lines 11,
14, 17, 20, 23–25, 64; `subs/daemon/module.ramify` line 18). Wildcard
interface-file exposures pick up added exports automatically. Removing an
exported name without updating its relays makes the description invalid.

| Schema or type | Producer | Consumers | Change | Iteration |
| --- | --- | --- | --- | --- |
| `DescriptionStatement` union (`ExposureStatement`, `NestedTreeStatement`) | descriptions `interfaces/syntax.ts` | linker, project references, inventory, `ramify.analysis` snapshot | Relays add both names | 2; emitted by the toolkit's own report from 7 |
| `ProjectScope.ownership`, `classifyProjectPath` and ownership types; `independentScopes` removed | project `interfaces/project.ts` | inventory, affected selection `scope`, report `scope`, `ContextStatus.scope` (daemon status, watch), strict daemon codec (`codec.ts` scope shape), modularity `omittedScopes` | Relays add types, keep `ProjectScope` | 3 adds; 8 removes `independentScopes` |
| `InventoryFile.placement`; `ProjectWarning` replaces `OutsideSourceWarning`; `outsideModuleFiles` retired | project | report warnings, `CheckDocument.warnings`, `SessionMeasurements`, `ramify.measure/1` (`outsideModuleFiles`, `ownershipRule`), observer, session engine | Relays drop `OutsideSourceWarning`, add `ProjectWarning` | 4, 8, 11, 18 |
| `SourceOrigin.auxiliary`; `SourceTarget` `nested-tree`/`excluded`, `outside-module` renamed; `excluded-target` limit; `AccessResult` `denied` | model, typescript, analysis | catalog, resolution, decisions, report, browser mapping, modularity | Root relays 11, 20, 23 | 4 types; 9–11 behavior |
| `ramify.analysis/1` to `/2` | analysis `report.ts` | CLI, batch process, watch, daemon codec, service-api, reference harness, measurements | Analysis wildcard | 11 |
| `ramify.affected/1`, `ramify.affected-cli/1` to `/2` | analysis `affected-query.ts`; CLI `affected-command.ts`; `src/batch-process.ts` | contexts, CLI, installed `ramify-audit@0.3.2` | Root relay 25 | 14, 17 |
| `ramify.check/1` to `/2` (`PathCheckDisposition` replaces `covered`) | CLI `changed-command.ts`; contexts check outcome | `examples/hooks/claude-code-post-write.mjs`, reference harness Plan 5 cases, fast measurements | Daemon relay 18, root 64 | 15, 17 |
| `ramify.ipc/1` to `/2`; `DaemonStatus.protocol`; daemon record | daemon codec, host, records, connection; `src/interfaces/service.ts` | CLI client, reference harness IPC/process cases, resident measurements | Root wildcard | 16 |
| `ramify.watch/1`, `ramify.daemon-status/1` | CLI watch and daemon commands | reference harness watch/process cases | Embed report, scope and protocol | 16–17 |
| `ramify.architect-module/1`, `-view/1`, `-projection/1` | analysis architect view and render; daemon publisher | reference harness Plan 2B cases | Analysis wildcard | 18 |
| `ramify.api-view/1`, `-projection/1` | daemon API-view documents | reference harness Plan 2A cases | Shape expected unchanged; bump only if it changes | 18 |
| `ramify.explorer-*`, `ramify.measure/1` | service-api, daemon measure | presentation, explorer, `plan2c.mjs` | Measurement buckets | 18 |
| `ramify.modularity/2` | analysis `modularity.ts` | probes, specification | `omittedScopes`, target kind | No slice names it; forced by 8 |
| `ramify.production-files/1` | `scripts/production-selection.ts` | reference harness production and gate cases | Policy unchanged | 5, 19 |

`ramify.cli/1` is unchanged. CLI root selection (`resolve-root.ts`) and the
profile-based production selection stay as they are; PB1-30 and PB1-31 verify
them in iterations 17 and 19. External consumers outside this phase: the
installed audit (affected documents) and ramify-agent (`ramify.analysis/1`,
`ramify.check/1`, `ramify.api-view/1`, `ramify.architect-view/1`).

## Audit-mode switch

The switch is **iteration 8**, earlier than the expected 14. The installed
audit runs the candidate's own `ramify affected --batch --format json` and
decodes it strictly in `dist/ramify-affected.js`:

- `decodeScope` requires `selection.scope.independentScopes` as a string array.
  `AffectedSelection.scope` is the `ProjectScope` itself, and iteration 8
  removes `independentScopes`.
- From iteration 8, auxiliary source is inventoried, so `affected-query.ts`
  resolves paths such as `scripts/*.ts` with basis `inventory` instead of
  `none`. That narrows the selection the audit reads before any version change.
- Path bases are limited to `inventory`, `declaration`, `area` and `none`, and
  both schema identifiers must equal version 1; iteration 14's bases and
  iteration 17's versions would also be rejected.

A rejected answer widens a partial audit to full with `ramify-unavailable`.
Execution policy accepts that, but explicit `--full --force` from iteration 8
on avoids gating on a narrowed selection. If iteration 3 removes
`independentScopes` instead of only adding `ownership`, the switch moves to 3.

## Baseline gate

The checkout was clean before each command.

| Command | Result | Duration | Evidence |
| --- | --- | --- | --- |
| Audit attempt 1 | Not run: `dependency-link-failed`, example dependencies were not installed in the checkout | 1 s | `attempt1-missing-example-deps/` |
| `ramify-audit audit --cwd /tmp/ramify-pb1 --full --force --json` | Exit 1, verdict fail. `requestedMode` and `executedMode` `full`, resolution `requested`. All five checks completed: patch integrity, build, type-check and self-check pass; the toolkit suite fails 1 of 2397 tests (175 of 176 files pass) | 254 s | `audit.stdout`, report commit `f30d9aca`, run ref `refs/audited/runs/2026-10-03T09-25-10Z-33d8a739a` |
| `reference:cases` attempt 1 (checkout unbuilt) | 23 of 390 failed, mostly missing `dist/` | 126 s | `reference-attempt1-unbuilt/` |
| `npm run build` | Exit 0 | 4 s | `build.*` |
| `flock /tmp/ramify-audit-tests.lock npm run reference:cases` | Exit 1: 9 of 390 tests failed in 5 of 36 files | 207 s | `reference.*` |

Toolkit-suite failure:
`subs/analysis/src/tests/evaluate-accesses.test.ts`, "keeps wildcard paths
resolution consistent with the compiler for ./init.js". The invoking
environment exports `FORCE_COLOR=3`; `tsc` then colors its output and the
plain substring assertion fails. A focused rerun fails with `FORCE_COLOR=3`
and passes with it unset (`diag-evaluate-accesses-*.out`). This is a test
environment dependence, not a runtime defect, and it was not fixed.

Reference failures, all assertion mismatches on current behavior:

- Six instances receive a `signature-inferred` analysis limit that their
  expectations predate: equivalence `hundred-owner-sequence` and `merge-live`,
  increment `I2-11:commonjs-module-target-limit` and `I2-11:declare-global-note`,
  and both resident edit fixture variants.
- `I5-12:hundred-owner-sequence-live` reports partial coverage where complete
  is expected; `I5-12:reference-sequence-live` reports 2 accesses where 1 is
  expected.
- Plan 2B real runs expect architect metrics `unavailable` and receive
  `measured`.

## Direct-fallback readiness

`/home/app/ramify-pb1-evidence/33d8a739/iteration1/direct-fallback-readiness.txt`
lists the commit's ordered set: `git diff --check HEAD^ HEAD` (60 s), `npm run
build` (600 s), `npm run type-check` (600 s, after build), locked `npm test --
--maxWorkers=4` (1800 s, after type-check, continues on failure), `npm run
check:self` (600 s, after build), then the locked `reference:cases`. Not run.

## Gaps and conflicts for the coordinator

1. The baseline is red. Every gate requires all checks to pass, so the
   `FORCE_COLOR` test failure and the nine reference failures need an owner
   and slice, or an environment decision, before iteration 2's gate.
2. Gate recipe: the audit links dependencies from the checkout, so
   `npm --prefix examples/collection-review ci` is always required, and
   `reference:cases` needs `npm run build` in the checkout first.
3. Reference expectations assert `ramify.analysis/1`, `ramify.check/1` with
   `covered`, `ramify.watch/1`, `ramify.ipc/1`, `ramify.daemon-status/1`,
   `ramify.architect-view/1`, `ramify.api-view/1` and the
   `outside-module-source` warning. Iterations 8, 11 and 14–18 change them, but
   only iteration 6 may edit the harness. R6 fixes its commands and inventory,
   not its expected values, so those slices need that write scope. Toolkit tests
   also use `ramify.ipc/2` as the incompatible-peer literal.
4. Payload shapes change before their version bumps: statements appear in the
   report snapshot from 7 and `ProjectScope` changes in 8, while the bumps land
   in 11 and 14–17. R3 says a changed shape changes its version.
5. Iteration 7 must declare absent tool directories (`.history`,
   `.cucumber-viz`, `.playwright-mcp`, `.reference-work`) as `external`. An
   absent owned-ignored directory is invalid, and the audit's fresh checkout
   lacks them. `dist` is the compiler's output directory and cannot be declared.
6. The modularity producer and specification depend on `independentScopes`
   and `outside-module`; no slice names them.
7. R4 risk: `context-manager.ts` treats any `package.json`, lockfile or
   `tsconfig*.json` by name as `configuration-changed`. A manifest inside an
   owned-ignored tree, such as `site/package.json`, would answer not checked
   with exit 2 instead of not-analyzed. Iteration 15 must classify by
   containment first.
8. Iterations 17 and 19 plan edits to `cli-invocation.spec.md`; each needs its
   own authorized patch.
9. Root selection is unchanged by R3, so a project inside an owned-ignored
   tree beneath `subs/` would join the enclosing project. Proposal §10 says an
   invocation inside an ignored tree selects that project. No patch is
   proposed.
10. Non-protected text still calls the syntax pending or the contracts
    proposed: the proposal header and §13, `contracts.md` status and
    `main-plan.md` lines 35–38.

No inconsistency with the budget policy was found in iterations 2–21;
iteration 18's "existing projection/publication budgets" should be read as the
byte limits, with timings reported only.

## Matrix rows

PB1-01, PB1-02, PB1-03, PB1-04, PB1-20, PB1-35 and PB1-40 received
preparation evidence only and remain pending in their producing slices. No
write or install touched `ramify-agent/` or `/ramify-audit`.

## Coordinator review

The coordinator reviewed the proposed patch hunk by hunk against the accepted
R1–R6 entries of `contracts.md`, authorized it unchanged and applied it with
`git apply`. The protected comparison against `33d8a739` lists exactly the six
patched files and no other protected change. Every hunk keeps runtime support
pending; no principles document changed. The worktree and evidence moved to
`/home/app/ramify-pb1` and `/home/app/ramify-pb1-evidence` because `/tmp` does
not survive a container restart.

The baseline is red: one toolkit test and nine reference instances fail at
`33d8a739`. They are repaired in a baseline-repair slice before iteration 2,
and the plan corrections this receipt lists are applied to the plan in the
same step.
