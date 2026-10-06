# Iteration 1: Model and engine

**Plan:** [Three kinds of nested tree](../main-plan.md).
**Prerequisites:** Dan has confirmed proposals Q1 to Q9 and approved patches
M, G, C, T, A and S in [protected documents](../protected-documents.md). The
worktree `/home/app/ramify-nested-kinds` is clean on `plan/nested-tree-kinds`.
**Owners:** `analysis/descriptions`, `analysis/project`, `analysis/typescript`,
`analysis`, `cli`, `daemon`, `daemon/contexts`, the root module (scripts,
`module.ramify`, docs) and `integration-tests`.

## Goal

Replace `owned-ignored` with `owned-unwired`, add `owned-project`, and move
every document that carries the kind to its next version. Migrate the
toolkit's own declarations. Ramify's behavior for both owned kinds is
`owned-ignored`'s behavior today, plus the two validation rules.

## Read first

- [Main plan](../main-plan.md): decisions, proposals, formats table.
- [Protected documents](../protected-documents.md): the patches to apply.
- [Acceptance](../acceptance.md): NT-01 to NT-09.
- `docs/model/module-description.spec.md`, section "Declared Nested Trees
  Bound Interpretation", after the patch.
- `docs/architecture/cli-invocation.spec.md`, version policy.
- Search the architect view before reading foreign source:
  `rg -n -i '<terms>' .ramify-architect/` (refresh after a build).

## Deliverables

1. **Patches.** First commit: the approved Ramify patches, verbatim, after
   checking each baseline hash. Message `docs(spec): three kinds of nested
   tree`.
2. **Parser.** `tokenize.ts` keywords, `parse.ts` special tags and statement
   dispatch, `interfaces/syntax.ts` kind union. `owned-ignored` as a statement
   is an error naming `owned-unwired` and `owned-project`.
3. **Ownership and validation.** `ownership.ts` kind union and owner rule
   (both owned kinds keep the owner); `nested-trees.ts` existence codes
   `missing-owned-unwired` and `missing-owned-project`, plus Q1's
   `owned-project-without-root` and Q2's `owned-unwired-project-root`, each a
   stat of the declared directory only. Add the codes to `ProjectIssue`,
   `report-data.ts` and `report.ts` as layout errors.
4. **Inventory and messages.** `compiler-selected-owned-unwired` and
   `compiler-selected-owned-project`; `undeclaredBoundary()` suggests
   `owned-project` or `external` (Q6); `git-advice.ts` and the affected help
   text name the new kinds.
5. **Resolution, accesses, synthetic roots, observer, affected query,
   architect view, modularity, daemon codec, watcher and dispositions.**
   Every site listed in the plan's inventory treats both owned kinds as it
   treated `owned-ignored`. `not-analyzed` reasons carry the new kind
   strings.
6. **Formats.** Move the versions in the formats table, including CLI help
   and constants. No reader for old versions.
7. **Toolkit migration.** The root `module.ramify` declarations of Q3 and its
   comment. `scripts/validate-final-contracts.ts` expected lines; the
   `restoreOwnedIgnored()` helpers in `scripts/measurements/plan2a-fixtures.mjs`,
   `scripts/measurements/plan2b-views.ts`,
   `scripts/reference-harness/plan2a-completion-cases.ts`,
   `scripts/reference-harness/plan2a-workflow-cases.ts` and
   `subs/integration-tests/src/browser-acceptance.ts` match both owned kinds;
   `scripts/reference-harness/plan2b-cases.ts` and `self-cases.ts` follow.
8. **Tests.** About 300 lines in 38 test files spell `owned-ignored`. Rename
   them by meaning: a fixture holding a project root becomes `owned-project`,
   any other `owned-unwired`. Add tests for NT-02 to NT-05.
9. **Documentation.** The rename-only sites and the proposal amendment listed
   in [protected documents](../protected-documents.md#rename-only-sites-not-protected);
   `site/src/pages/glossary.md` follows patch G.

## Verification

- Focused `npx vitest run` on each changed test file; `npm run type-check`;
  `npm run build`; `npm run check:self`.
- `rg -n "owned-ignored" src subs scripts` returns nothing.
- The gate in the [execution rules](../main-plan.md#execution-rules-for-every-iteration),
  with its interim pass condition (NT-09).

## Exit criteria

NT-01 to NT-09 have evidence. The results file records commits, the
protected-hash table, the gate's counts and its indeterminate reason.

## Handoff

The commit range, the final commit for iteration 2, and any deviation from a
confirmed proposal, with its reason.
