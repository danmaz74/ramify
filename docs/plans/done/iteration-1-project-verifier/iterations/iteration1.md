# Iteration 1: Contract package and scope freeze

**Plan:** [Plan 1: Verify a real Ramify project](../main-plan.md).
**Prerequisites:** none. **Owners touched:** none; this iteration writes
review documents and executable probes only.

## Goal

Produce the concrete review package the plan's contract review requires, so that every
later iteration implements reviewed boundaries instead of inventing them. No
toolkit source moves and no checker code is written here.

## Read first

- Main plan: Deliverable and completion boundary, Scope decisions,
  Implementation ownership and migration, Analysis path and contract review,
  Reports and exit behavior, Reference acceptance matrix.
- [Daemon architecture](../../../../architecture/daemon.md): Ramify's ownership
  tree, Responsibilities and public contracts, Exposure paths.
- [Module-description principles](../../../../model/module-description.principles.md)
  in full; the other model documents as the drafts require.
- [Reference contract map](../../../reference-project/contract-map.md) for the
  exposure statement IDs the matrix names.

## Deliverables

The review documents live under `docs/plans/iteration-1-project-verifier/`.
Executable probes live at the package root's `scripts/probes/`, in the
independent scripts scope selected by `tsconfig.scripts.json`.

1. `contracts.md`: exact TypeScript signatures and owned vocabulary for every
   contract in the plan's proposed-contract table, plus the package export map
   and entry files: `dist/src/cli-entry.js` with `bin.ramify`, the reusable
   analysis entry and the portable model/presentation entries. State each
   entry's permitted transitive runtime dependencies and its activation stage.
   Draft the future session-to-`AnalysisDriver` boundary as a type only.
2. `owners.md`: for each of the nine owners, the complete final `module.ramify` text
   and the README purpose paragraph, and a contract map listing originals,
   tags, exposure paths, every foreign signature type a consumer must import
   and the intended consumers. Apply the plan's exposure rules for the
   migration; no owned interface wildcard may claim a foreign original.
   Include the reviewed declaration stages: headers only for empty owners,
   each exposure activated with its real exports and child contracts, and
   every final exposure active by iteration 13. An intermediate declaration
   must never name an unimplemented export merely to mirror the final draft.
3. `move-map.md`: the file-by-file map from every current `src/` and
   `scripts/` file to its target owner, entry or independent scope, including
   removals. Account for `scripts/emit-diagrams.ts` and the reference harness
   as an explicitly independent tooling scope. Record the existing
   `site/static/diagrams/` snapshot destinations used by
   `src/viz/{emitted-diagrams,tree-diagram,focus-diagram}.test.ts`, and their
   paths after the tests move to presentation's `src/tests/`.
4. `scope.md`: the exact configuration files of the two target projects, the
   compiler integration choice, the report schema with its version, finite
   acquisition/work/report limits with their initial values, and the
   supported-platform consequences already decided in the plan. Root
   selection, configuration discovery, warnings and exits are fixed by the
   [CLI invocation](../../../../architecture/cli-invocation.spec.md) contract and are
   not redecided here. Specify the deterministic output of
   `npm run production:files -- --root <dir>`, its independent script entry,
   the analysis inventory/profile contract it consumes, and the production
   build configuration that uses the same selected files. Activate this in
   iteration 8, exclude both forms of testing source, and preserve complete
   type-check/test inputs. Specify how the tool loads the analysis API before
   `dist/` exists, so a clean build has no bootstrap cycle.
5. `probes.md` with runnable scripts under package-root `scripts/probes/`: focused
   TypeScript compiler API probes on source aliases, unmarked interfaces,
   merged runtime bindings, interface-file wildcard export enumeration, `.js`
   substitution and the reference's two CSS-module resources. Record the
   installed compiler version and the exact APIs selected.
6. The final subcase list for iterations 2 to 15: every I1 subcase named in
   the matrix, its implementing iteration, required capability, fixture root,
   mutation summary and independently expected outcome, as the table
   iteration 2 turns into harness instance records. Include iteration
   prerequisites for intermediate verification and separately identify the
   TypeScript and checked-JavaScript JSDoc variants of I1-21 `import-type`.

## Matrix rows executed here

None. This iteration produces no executable evidence.

## Verification

- `npm run type-check` still passes; probe scripts type-check under
  `tsconfig.scripts.json` and run with `npx tsx scripts/probes/<name>.ts`.
- Every exposure path in `owners.md` is checked by hand against the
  description principles' review checklist; every foreign type a consumer
  imports has a named path.
- The package is presented for architecture and contract review. Drafting it
  does not approve an unresolved contract change.

## Exit criteria

- The five documents and the probe results exist and cover the plan's
  Proposed contract shapes, Source move map and Harness sections; no baseline
  semantic is hidden behind a TODO.
- Reviewed and accepted before iteration 3 starts. Iteration 2 may begin from
  the draft subcase list.

## Handoff

Iterations 2 to 15 implement these contracts, descriptions, entries and limits
through the reviewed activation stages. A change to the final contracts or
their stages is a revision of this package first.
