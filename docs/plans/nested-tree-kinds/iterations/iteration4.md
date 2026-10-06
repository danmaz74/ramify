# Iteration 4: Publication and adoption

**Plan:** [Three kinds of nested tree](../main-plan.md).
**Prerequisites:** iterations 2 and 3 complete; Dan's approval of patches H1
and H2.

## Goal

Verify Ramify's release commit cleanly, publish both packages with Dan's
approval, adopt them in the toolkit, and update ramify-agent's documentation.

## Read first

- [Acceptance](../acceptance.md): NT-16 to NT-20.
- Iteration 2 and 3 results.
- ramify-agent Plan 21 in `/tmp/ramify-plan20-project-boundary-preparation/ramify-agent/docs/plans/21-project-boundary-adoption/`.

## Steps

1. **Clean Ramify gate (NT-16).** Install the 0.7.0 candidate in a scratch
   directory and run a full audit of Ramify's release commit with it. It must
   pass with expected-file verification complete.
2. **Publication gate.** Report NT-10 to NT-16 to Dan and wait for his
   approval. Then publish `ramify.ts` 0.4.0 from the recorded artifact,
   verify the registry's integrity, publish ramify-audit 0.7.0 with
   `npm run release -- --publish` and its audited source, verify, and install
   it at `/home/app/tools/ramify-audit-0.7.0` (NT-17).
3. **Toolkit adoption (NT-18).** In `/ramify`, on `ramify-agent`, merge
   `plan/nested-tree-kinds`; change `CLAUDE.md`'s audit sentence to 0.7.0;
   commit only those files; run a full audit by 0.7.0 from a clean worktree of
   the adoption commit. `ramify-audit.json` does not change. Fast-forward
   ramify-audit's `main` to the release branch and push it.
4. **ramify-agent documentation (NT-19).** In `/ramify`, apply H1 and H2,
   staging only their hunks (`git apply --cached` of the patch), so Dan's
   uncommitted edits to `harness.spec.md` stay unstaged. Revise Plan 21 and
   Plan 20's "What waits for the providers" and D2 as the main plan lists;
   Plan 21 stays untracked. No agent source, pins or tests change.
5. **Handoff (NT-20).** `handoff.md`: what Plan 21 adopts (pins, root
   marker, `owned-unwired "docs"`, three `owned-nested-project` fixture
   declarations, the write-scope rule, `ignorePaths: ["docs/**"]`, no
   `enclosingProject`), the artifacts and their digests, and remaining gaps.

## Exit criteria

NT-16 to NT-20 have evidence; the main plan's status reads complete.
