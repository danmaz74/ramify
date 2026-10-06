# Iteration 3: Audit reader and release candidate

**Plan:** [Three kinds of nested tree](../main-plan.md).
**Prerequisites:** iteration 2's artifact and receipt; Dan's approval of
patches R1 to R3.
**Where:** a new ramify-audit worktree, `/home/app/ramify-audit-nk`, branch
`feat/nested-tree-kinds` from `main` (`38cfb30`). Record the evidence under
`/home/app/ramify-audit-pb-evidence/nested-tree-kinds/`. This iteration's
results file lives in the Ramify plan directory and is committed on
`plan/nested-tree-kinds`.

## Goal

ramify-audit 0.7.0 reads `ramify.affected/4` and the three kinds, applies Q7,
and is qualified against the 0.4.0 artifact up to its release gate. Do not
publish.

## Read first

- [Acceptance](../acceptance.md): NT-12 to NT-15.
- ramify-audit `src/ramify-affected.ts` (schema constants, `RamifyExclusionKind`,
  `EXCLUSION_KINDS`, `OWNED_EXCLUSION_KINDS`, the owned-seed check and the
  topology list), `src/project-root.ts` (`ownershipSkip`,
  `discoverNestedProjects`), `src/contracts.ts` (`NestedSkipReason`) and
  `src/worker-protocol.ts` (`NESTED_SKIP_REASONS`).
- ramify-audit `docs/plans/08-ignore-paths/iterations/iteration4.md`, steps 7
  to 11, for the release procedure.

## Deliverables

1. **Patches.** Apply R1 to R3 verbatim at their baselines, first commit.
2. **Reader.** `/4` schema constants only; `owned-unwired` and
   `owned-project` replace `owned-ignored` in every kind list, including the
   owned kinds and the topology check. `/3` answers are `unsupported-schema`.
3. **Nested discovery (Q7).** A definition beneath an `owned-unwired` tree is
   skipped with reason `owned-unwired`, added to `NestedSkipReason` and
   `NESTED_SKIP_REASONS`. `owned-project` trees stay eligible.
4. **Tests and fixtures.** Re-record `test/fixtures/ramify-affected/*.json`
   from the artifact with `scripts/record-ramify-affected.mjs`; rename the
   fixture `owned-ignored-path`; update about 120 test occurrences by
   meaning; pin `RAMIFY_VERSION` to 0.4.0 in `test/helpers/real-ramify.ts`,
   the recorder and `test/helpers/partial-repository.ts`.
5. **Documentation.** `README.md` names, discovery rules and 0.7.0 release
   notes. Dated decision documents and earlier plans do not change.
6. **Real suite** against the artifact (`RAMIFY_TARBALL` with its SHA-256).
7. **Qualification** on a toolkit clone at Ramify's release commit with the
   packed candidate: NT-14's four changes, with report refs.
8. **Release commit and gate.** Version 0.7.0 and release notes; full audit
   by the installed 0.6.0 with `--force`; `npm run release` dry run (NT-15).

## Exit criteria

NT-12 to NT-15 have evidence. The packed candidate's SHA-256 is recorded.

## Handoff

Candidate tarball, its digest, the release commit and the gate's report ref,
for iteration 4.
