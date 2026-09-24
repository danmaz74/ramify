# Iteration 1: Baseline, specifications and the projections' orientation facts

**Plan:** [Plan 2D](../main-plan.md).
**Prerequisites:** the contract review's disposition of RD-1 to RD-6; Plans
2A, 2B and 2C implemented on the execution base. If RD-3 is declined, drop
deliverable 5 and VO08 to VO10 and record it in the results.
**Owners:** `analysis` (API projection, architect projection and renderer,
interfaces); the two view specifications.

## Goal

Both projections carry the orientation facts, and the architect renderer
writes tag kinds and subtree dependencies, while every existing record and
generated document stays byte-identical.

## Read first

- Main plan: purpose of each view, decisions, the three contract sections,
  the non-pollution invariant, VO01 to VO10.
- `subs/analysis/src/interfaces/session.ts` (API projection types),
  `subs/analysis/src/api-view.ts`.
- `subs/analysis/src/interfaces/architect-view.ts`, `architect-view.ts`,
  `architect-render.ts` (the `uses` and `usedBy` construction and
  `module.json` layout), `interfaces/dependency-diagram.ts`.
- `subs/analysis/subs/model/src/interfaces/model.ts` (`TagKind`,
  `TagDefinition`, `ResolvedTagRegistry`).
- Specifications: [API view](../../../architecture/materialized-api-view.spec.md)
  Locations, Metadata and Agent instructions;
  [architect view](../../../architecture/architect-view.spec.md) `README.md`,
  `module.json` and Metadata.
- Tests: `api-view.test.ts`, `api-view-session.test.ts`,
  `architect-render.test.ts`, `architect-view.test.ts` with
  `architect-fixture.ts`.

## Deliverables

1. **Baseline first.** Before any source edit, build the starting commit and
   run `ramify materialize --all --view architect` on the toolkit and on the
   reference project. Archive under `../evidence/baseline/` a manifest of every
   generated path with its SHA-256 and byte length, the commit, and the output
   of the two documented API searches and of Plan 2C's hit-cost term list.
   Archive manifests, not the generated trees.
2. Specification text for both views as the main plan's contract states it,
   including the API instruction block's added line.
3. `ApiViewProvider` and `ApiViewAreaProjection.providers`, computed from the
   entries' owning modules, the inventory's header tags and purposes. Purpose
   text is uncut and counts toward the projection's `bytes`.
4. Tag kinds from the revision's resolved registry in the architect
   projection, `_meta.json` `tagKinds` in the pinned position, and the README
   tags line. Rendering reads each definition's `kind`; no tag name is
   compared.
5. Subtree dependencies: one aggregation over the boundary facts the renderer
   already reads, per non-leaf module, with the contract's counting,
   precedence, ordering and absence rules.
6. Golden files refreshed with `RAMIFY_UPDATE_GOLDEN=1`. The reviewed diff
   must show only `tagKinds`, the README line and `subtree`.

## Matrix rows executed here

VO01 to VO10.

## Verification

Focused runs of the API projection, architect projection and architect
renderer tests. VO08 uses an aggregation written independently in the test,
over the fixture's boundary facts, not the renderer's helper. VO04 uses a
lowered injected `maxAreaBytes` at the limit and one byte over. VO05 and VO07
use fixture registries with an added tag of each kind, no required-symbol tag,
and `browser` renamed. Expected intermediate failure: the daemon's API view
golden tests do not yet render `providers`; they must still pass unchanged,
because the renderer ignores the new field until iteration 2. Run
`npm run check:self` after the interface change.

## Exit criteria

The baseline archive exists and names its commit. VO01 to VO10 pass. The
golden diff contains only the three named architect changes, and no JSONL
golden changed. The daemon's existing API view tests pass without edits.

## Handoff

`ApiViewProvider` and its ordering and counting rules, the baseline archive
and its term list, and the confirmed absence of any change beneath
`external/`, `children/` and the JSONL files, for iteration 2's renderer.
