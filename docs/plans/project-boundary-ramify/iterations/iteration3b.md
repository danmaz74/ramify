# Iteration 3B: Root selection and root-marker validity

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 3A](iteration3a.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory, together with the adopted R7 specification patches. Recheck the immediate handoff before editing.
**Owners and write scope:** Project selection, resolution reuse and acquisition validity, plus mechanical issue-code relays and layout categories through analysis/root; CLI help or failure text only where it describes the old climb; corrections to fixtures and expectations that enforcement exposes, including root-selection tests and the reference harness's expected values for selection and layout outputs this slice changes. This slice extends `ramify.analysis/2`. Specification changes only as proposed patches. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Select the root by the marker and enforce its validity. Without `--root` the climb takes the nearest marked description, `--root` requires one, an unmarked selected root is invalid with a message that says to add the marker, and any other marked description the walk interprets is a layout error. Every command that selects a project uses this one path.

## Read first

- [Contracts](../contracts.md): Root marker; Description language and validation; Schema versions.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-30, PB1-42, PB1-43, PB1-44 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Iteration 3A's results: the migrated sites and any root deliberately left unmarked.
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/subs/project/src/selection.ts`.
- `subs/analysis/subs/project/src/resolve-root.ts`, for the discovery evidence a reused resolution replays.
- `subs/analysis/subs/project/src/read-project.ts` and `src/inventory.ts`, for invalid status and the description walk.
- `subs/analysis/subs/project/src/interfaces/project.ts`, for `ProjectIssue` codes and the request.
- `subs/analysis/src/report.ts` and `subs/analysis/src/report-data.ts`, for layout categories.
- `subs/analysis/src/session-engine.ts`, which calls `resolveProjectRoot`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Current behavior to replace

At `3f435172`, `selectRoot` probes only whether `module.ramify` exists and reads
no description contents. It takes the nearest description, then advances to
the nearest description-bearing ancestor while the candidate lies strictly
beneath that ancestor's `subs/`, and reports `missing-root-description` for a
child directly beneath a `subs/` whose parent has no description. `--root`
requires only the file. The resolution evidence a known resolution replays
holds kinds, canonical paths and exact-name memberships. The inventory walk
ends a branch at an unselected directory with its own `tsconfig.json`
(`independentScopes`, retained until iteration 8) and reports a description
outside `subs/` as `stray-description`. `missing-root-description` and the
symlink codes make a resolution invalid (exit 1); `root-not-found` makes it
unavailable (exit 2).

## Deliverables

1. Replace the climb as the [contracts](../contracts.md#root-marker) specify: nearest marked description at or above the canonical working directory, unmarked descriptions never stopping it, the `subs/` advance and missing-parent check removed, and `root-not-found` naming the working directory when none is marked. When an unmarked description lies at or above the working directory, that message also names the nearest one and says to add `root` to its module line if it is the project root (decided by the user on 2026-10-03). Decide the marker from the module line through the Descriptions owner's rules, supplied to Project as `parse` is; add no second grammar. `--root` on an unmarked description is `unmarked-root-description` (invalid, exit 1) with a message that says to add `root` before `module`.
2. Include every read description's marker determination in the discovery evidence a known resolution replays, so a marker change makes it stale while a marker-preserving edit leaves it reusable.
3. In acquisition, report an unmarked root description as `unmarked-root-description`, and any other interpreted marked description as `undeclared-project-boundary` located at the marker, contributing no module and attributing no contents. Add both codes to `ProjectIssue`, the invalid-status sets in `resolve-root.ts` and `read-project.ts`, and the layout categories in `report.ts` and `report-data.ts`. Declared trees are not pruned until iteration 8, and inferred independent scopes are still skipped.
4. Add `root-selection.test.ts` beside the project tests, with independent expectations for PB1-42 and PB1-43 and positive controls. Update existing tests whose expected selection followed the old climb, reasoning each from R7 rather than candidate output: in `resolve-root.test.ts`, the invalidation and nested-root tests; in `subs/analysis/src/tests/root-resolution.test.ts`, the `subs/branch/src` nested root; in `project.test.ts`, the missing-parent test, which becomes an unmarked orphan with no marked ancestor (`root-not-found`) and a stray orphan beneath a marked root (layout error), and the nested `examples/demo` project; `measure-command.test.ts:145`; and the no-project and explicit-root CLI tests in `batch-cli.test.ts`, `affected-batch.test.ts` and `materialize-command.test.ts`. In the reference harness, recheck `project-cases.ts` I1-02, I1-04 and I1-29, `increment-cases.ts` I2-10, `resident-cli-cases.ts` I2-20 and `plan2a-cli-cases.ts`; keep each instance's identity and count. Where an archived row's prose no longer describes what its instance asserts, record that as a remaining gap for the coordinator; do not edit archived `subcases.md` files.
5. Mark any root that iteration 3A missed and enforcement exposes, and record it.
6. Propose to the coordinator, as exact patches under the [protected-document procedure](../execution.md#protected-principles-and-specifications), the status wording in `cli-invocation.spec.md` (its pending root-marker note) and `module-description.spec.md` for what 3A and 3B implemented, and the exit-2 message's hint naming the nearest unmarked description in `cli-invocation.spec.md` "Selecting the project"; the declared-tree part stays pending until iteration 8. Check whether the [architect view specification](../../../architecture/architect-view.spec.md#determinism-and-bounds) statement that the input identity records the absent `module.ramify` of each ancestor directory still holds once the climb stops at the nearest marked description; if not, propose its exact patch.

## Matrix rows executed here

Exercise PB1-30, PB1-42, PB1-43, PB1-44 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-42, PB1-43, PB1-44.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/analysis/subs/project/src/tests/root-selection.test.ts
npm run build
npm run check:self
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

PB1-42 and PB1-43 pass, and PB1-44 passes: with the rule enforced, the audit's full toolkit suite and self-check and every `reference:cases` instance pass, with no case deleted or skipped. A marked description inside a declared tree is not yet pruned; that closes with PB1-05 in iteration 8. Real CLI processes close PB1-30 in iteration 17.

Record `iteration3b-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Marker-based selection and validity for every selecting command, ready for declared discovery in iteration 8 and CLI demonstration in iteration 17.
