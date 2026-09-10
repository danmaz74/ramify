# Iteration 8: Toolkit migration into declared owners

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** iteration 7. Independent of iteration 9.
**Owners:** root, `subs/analysis/subs/model/`, `subs/presentation/`,
`subs/presentation/subs/layout/`; the independent site and diagram-emission
scopes.

## Goal

Move the legacy `src/model` and `src/viz` into their owners, retire the
combined barrel in favor of the reviewed package entries, and adapt the
diagrams and site to the definitive model. The linker from iteration 7
validates the toolkit's migration-stage descriptions the moment the move lands.

## Read first

- Main plan: Implementation ownership and migration, Exposure rules for the
  migration, Source move map.
- Iteration 1's `move-map.md`, `owners.md` and `contracts.md`.
- `src/viz/index.ts`, `src/index.ts` and `site/docusaurus.config.ts` as they
  are today.

## Deliverables

1. Legacy `src/model` removed; every diagram consumer uses the iteration 3
   model through legal paths: model to analysis to root, relayed to
   presentation with explicit `browser` promises on the values the browser
   needs.
2. `src/viz` split per the move map: geometry and viewport into layout with
   layout-owned neutral inputs; diagram definitions, model access, validation,
   components and theme into presentation. Tests move to the owner of the
   behavior they assert. Keep snapshot assertions from
   `emitted-diagrams.test.ts`, `tree-diagram.test.ts` and
   `focus-diagram.test.ts` in presentation's tests. Rebase their
   `../../site/static/diagrams/` paths to the existing package-root artifacts
   (`../../../../site/static/diagrams/` from `subs/presentation/src/tests/`).
   Require those artifacts to exist; do not create snapshots under an owner.
3. `src/index.ts` and `src/viz/index.ts` replaced by the reviewed entries
   available at this stage: current analysis operations, portable model and
   presentation. The full analysis-session entry and installed CLI arrive in
   iterations 12 and 13; add neither dangling package exports nor placeholder
   implementations to make their future declarations link. Repository
   consumers are updated; no combined UI/Node/dispatch barrel remains.
4. Root `module.ramify` declaration-relays presentation contracts without
   importing UI values; root source contains no UI re-export.
5. Site alias and page imports point at the presentation and model entries;
   `scripts/emit-diagrams.ts` and the reference harness consume package
   surfaces only.
6. Diagram fixtures adapted where the model representation changed; every
   intended decision and visible behavior preserved. Byte-identical SVGs are
   expected only where neither data nor rendering changed.
7. The reviewed `npm run production:files -- --root <dir>` command and
   production build wiring. Consume real inventory and resolved source profiles
   through the supported analysis entry, select every owned non-testing source
   file, and emit the reviewed deterministic file list. Exclude nested test
   areas and testing modules' ordinary source by classification, retaining
   ordinary interfaces. Use that selection for toolkit production emission;
   keep the root compiler configuration and type-check/test discovery complete.
   Implement the reviewed source-entry bootstrap so the first build needs no
   existing `dist/`. This tool performs no independent ownership or permission
   analysis. I1-30 exercises the command and build in iteration 14.

## Matrix rows executed here

None first activated here. Evidence is regression and description validation;
the iteration verification command reruns prerequisite instances.

## Verification

```sh
npm run build && npm run type-check && npm test
npm run diagrams && npm run site:build
npm run production:files -- --root .
npm run production:files -- --root examples/collection-review
node -e "..."   # validateProject over the toolkit's current declaration stage: no diagnostics
npm run reference:verify -- --plan 1 --iteration 8
git diff --check
```

## Exit criteria

- The toolkit has no runtime source outside a declared owner; the nine
  current declarations match the reviewed migration stage and link cleanly
  against actual exports. Full final-contract validation belongs to iteration 13.
- All pre-existing tests pass in their new owners; regenerated diagrams and
  the site are reviewed, not just built.
- Snapshot assertions still resolve to the emitter's existing
  `site/static/diagrams/` files, with no duplicate snapshot tree beneath `subs/`.
- A clean toolkit build consumes the production selection and emits no testing
  source. Full type-checking and test discovery still include those files.

## Handoff

Iterations 13 and 15 build the CLI and the self-check on this layout.
