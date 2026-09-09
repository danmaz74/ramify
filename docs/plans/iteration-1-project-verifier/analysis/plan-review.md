# Plan review

Reviewed against the source and configuration in `/ramify` on 2026-09-09.
This records planning validation, not checker implementation or conformance.

## Review counts and provenance

| Review | Raw candidates | Validated findings | Rejected candidates |
| --- | --- | --- | --- |
| Primary agent review, performed by Codex in this runtime | 6 | 5 | 1 |
| Codex support CLI review, independently validated by the support agent | 2 | 2 | 0 |

The requested primary-review role was performed by Codex; no Claude review is
claimed. The support agent ran the requested `codex exec` review from `/ramify`
while the primary review proceeded independently. Both reviewed all fifteen
iterations and the manifest, then checked their findings against actual source.

There are **6 validated findings after deduplication: 2 critical and 4 important**.
Both reviewers confirmed the snapshot-path issue. No purely stylistic findings
were retained.

## Primary review — validated findings

- Critical: iteration 1's probe location contradicts its verification paths.
- Critical: iteration 10 requires static symbol-free import interpretation
  scheduled for iteration 11.
- Important: intermediate harness verification needs an executable distinction
  between required stage evidence and pending completion work.
- Important: moved diagram tests need their file snapshot paths rebased.
- Important: promised JSDoc import-type support needs an assigned fixture and
  a compiler configuration that analyzes JavaScript.
- Minor: none.

## Support review — validated findings

- Critical: none.
- Important: moved diagram tests need their file snapshot paths rebased.
- Important: production-source selection needs a concrete implementation and
  command before I1-30 requires its evidence.
- Minor: none.

## Deduplicated findings and applied corrections

Source paths in the evidence below are relative to `/ramify`.

1. **Critical — Probe paths.** Iteration 1 placed all deliverables beneath the
   plan directory but ran `scripts/probes/<name>.ts` from the package root.
   `tsconfig.scripts.json:11-14` selects root `src/**/*` and `scripts/**/*`;
   `package.json:12` invokes that configuration. Keep prose in the plan and
   explicitly place implementation-time probes under package-root
   `scripts/probes/`, matching the existing compiler inputs and commands.
2. **Critical — Static symbol-free prerequisites.** Iteration 10 requires
   I1-16 `production-side-effect` and I1-23 `testing-style`, while iteration 11
   originally introduced symbol-free load interpretation. Actual witnesses
   already exist in
   `examples/collection-review/subs/integration-tests/src/steps/collection-review.steps.ts:5-10`
   and `examples/collection-review/subs/workspace/src/main.tsx:4-5`.
   Iteration 9 now implements static target-only occurrences and origin
   evaluation; iteration 10 uses them. Iteration 11 extends that path for the
   remaining empty, forwarding and dynamic forms.
3. **Important — Intermediate verification.** The original intermediate
   commands invoked the whole-plan gate, which must fail for later instances.
   The existing `scripts/reference-harness/report.ts:77-97` derives family
   execution from available tiers and has no iteration assertion gate;
   `package.json:26-27` contains only the current inventory/report commands.
   The reference harness design explicitly distinguishes stage evidence from
   completion. Add `--iteration <n>` to require the named iteration and its
   transitive prerequisites, reject missing or failed required assertions,
   and report other instances as not executed. Keep the unfiltered completion
   gate strict. Clarify that instances have one implementing iteration and
   are rerun for regression evidence.
4. **Important — Snapshot destinations; confirmed by both reviewers.**
   `src/viz/emitted-diagrams.test.ts:51-85`,
   `src/viz/tree-diagram.test.ts:258-259` and
   `src/viz/focus-diagram.test.ts:231` use `../../site/static/diagrams/`.
   The installed `@vitest/snapshot/dist/environment.js:14-15` resolves these
   relative to the test file; `scripts/emit-diagrams.ts:98-106` writes the
   canonical files at package-root `site/static/diagrams/`. Moving tests to
   `subs/presentation/src/tests/` requires `../../../../site/static/diagrams/`.
   Add destinations to the move map, require existing artifacts, and reject
   duplicate snapshots beneath an owner.
5. **Important — JSDoc coverage.** The source specification at
   `docs/model/typescript-source-interpretation.principles.md:354-358` includes
   supported JSDoc import-type expressions. The reference compiler options in
   `examples/collection-review/tsconfig.json:4-27` do not enable JavaScript
   analysis, and iteration 11 had no explicit JSDoc fixture. Parameterize
   I1-21 `import-type` with independently recorded TypeScript and JSDoc variants;
   use a separate JavaScript fixture with `allowJs`, `checkJs` and `noEmit`.
   Preserve type-only requests, coupling restrictions and origin checks.
6. **Important — Production-source selection.** `package.json:10` builds with
   `tsc`, `tsconfig.json:19` includes all `src/**/*`, and
   `scripts/reference-harness/cases.ts:1204-1207` records no production-selection
   implementation. The ordinary source of the owner declared at
   `examples/collection-review/subs/integration-tests/module.ramify:9` carries
   `testing`, so excluding only `src/tests/` cannot satisfy I1-30. Specify the
   `production:files` command and its build consumer in iteration 1; implement
   them in iteration 8 through the real inventory/profile API, with a clean-build
   bootstrap. I1-30 checks the actual file selection and build while complete
   checker, type-check and test scopes remain intact.

## Discarded observations

The primary review considered the harness tests that require current families
to remain unavailable. This is not independently actionable: the plan already
requires instance-level activation without falsely completing composite families.

The support reviewer also inspected TypeScript 7's changed API and native compiler
process behavior. Iteration 1 already requires executable API probes and a
reviewed integration dependency, including runtime constraints. This observation
does not establish that the as-yet-unselected adapter will violate the plan;
it was not counted as an additional validated finding or used to change runtime
policy. The support CLI itself returned no rejected findings.

## Changes applied

- Clarified package-root probe locations in iteration 1.
- Added static target-only access prerequisites in iterations 9–11.
- Added strict intermediate harness verification and updated iteration commands.
- Recorded and rebased the three diagram test snapshot destinations.
- Assigned separate TypeScript and JSDoc import-type fixture variants.
- Assigned production selection, build integration and clean bootstrap to iteration 8.

Iteration numbering, prerequisites and matrix subcase assignments are unchanged.
The manifest therefore needs no update. No module-impact artifact, execution
envelopes or tracking artifacts were present, and none were fabricated.

## Validation

- All 15 manifest entries still bind to the matching iteration files and titles.
- All 30 matrix rows and every original subcase label remain present.
- Prerequisite closure for iteration 14 covers iterations 1–14; iteration 15
  covers the complete plan. Intermediate commands match their iteration numbers.
- Markdown link targets resolve, using `/ramify` for source outside the sparse
  worktree, and the migrated snapshot path resolves to the existing site assets.
- `git diff --check` passes; all changed and added files are Markdown beneath
  the writable plan directory.
- The support reviewer reread the amended snapshot, production-selection and
  harness provisions and found no new dependency or bootstrap contradiction.

Application builds and runtime tests were not run: this task changes only plan
documents, and no implementation or passing conformance evidence is claimed.
