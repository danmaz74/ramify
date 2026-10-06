# Iteration 2: Ramify release candidate

**Plan:** [Three kinds of nested tree](../main-plan.md).
**Prerequisites:** iteration 1 committed and its gate passed.
**Write scope:** the version bump in `package.json` and `package-lock.json`;
this iteration's results file; the evidence directory
`/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/` (`RECEIPT.md`,
`artifact/`, `src/`, `logs/`, `smoke/`, `qualify/`, `answers/`). No source
change. Never rebuild or replace the artifact once recorded: iteration 3
qualifies against its digest.

## Goal

Build `ramify.ts` 0.4.0 as a production artifact from an audited release
commit and record the answers ramify-audit qualifies against. Do not publish.

## Read first

- [Acceptance](../acceptance.md): NT-09 to NT-11.
- The 0.3.0 receipt `/home/app/ramify-audit-pb-evidence/ramify-0.3.0-prod/RECEIPT.md`
  and `docs/plans/affected-rule-selection/iterations/iteration2.md`, steps 1
  to 5: mirror their layout and commands.

## Steps

1. `npm version 0.4.0 --no-git-tag-version`; the diff touches only the two
   `version` fields. Commit `chore(release): ramify.ts 0.4.0`: the release
   commit.
2. Gate the release commit (interim condition, NT-09).
3. Clean clone at the release commit under `src/`; `npm ci`;
   `NODE_ENV=production npm run build`; `npm pack` into `artifact/`. Record
   SHA-256, integrity and the file manifest.
4. Isolated smoke under `smoke/`: install the tarball, `ramify --version`,
   one batch affected query, and the document versions of NT-06.
5. Clean toolkit clone at the release commit under `qualify/`, with the
   artifact installed; record the NT-11 answers in `answers/`.

## Exit criteria

NT-10 and NT-11 have evidence; the receipt is complete.

## Handoff

Artifact path, SHA-256, integrity, release commit and the answers directory,
for iteration 3.
