# Progressive optimization delivery

**Authorized:** 2026-10-08. Target:
`/home/app/ramify-plan21-project-boundary-adoption`, branch
`feat/plan21-project-boundary-adoption`.

## User's workflow

Choose one optimization, create a separate worktree from the target's current
HEAD, implement/test it with one subagent, merge it into the target, then begin
the next optimization. Do not launch parallel optimization implementations.
Plan 21 continues in the target; preserve its work and use the current delivered
contracts instead of a frozen earlier base.

## Initial delivery cuts

1. Production command cleanup: remove unnecessary grace waits while preserving
   actual descendant/cancellation/timeout/registration behavior.
2. Capability acceptance matrix: convert the twelve-case critical path with
   required strict helper support and retain named actual adapter witnesses.
3. Capability dependencies: convert the next slowest file.
4. Capability recovery.
5. Nonfunctional recovery.
6. Capability assignment, delegation and other ordinary external consumers,
   one bounded family at a time, ordered by the current measured profile.
7. Complete shared enforcement/runner partition and final full qualification.

These cuts refine the plan's iteration groups; they preserve all acceptance
cases. Global case inventory, shared helper infrastructure and runner
enforcement do not delay the independent cleanup fix. Inventory the affected
cases and implement only the minimum strict helper support before each test
conversion, then complete project-wide coverage/enforcement after those cuts.

## Before merge

- Record base HEAD, exact affected files/cases, original expected outcomes and
  verification commands. Prepare dependencies matching that base's pinned
  releases; do not update package pins as an optimization.
- The subagent writes only its isolated worktree, runs focused appropriate
  checks, retains failures and measurements, writes a receipt under this plan's
  `optimizations/`, and commits the qualified change. It does not merge itself.
- The coordinator reviews the diff and evidence, verifies no required assertion
  was weakened and no real-boundary claim was replaced with synthetic evidence.
- Recheck target HEAD, staged/unstaged changes and overlaps before merging.
  Preserve concurrent Plan 21 changes. If the target advances on touched paths,
  reconcile on the isolated branch and rerun affected checks before integration.
  Never stash/reset another plan's working changes or terminate its test run.
- Merge only the qualified optimization branch into the target. Verify its
  ancestry and integrated affected checks before creating the next worktree.

## Verification and status

Focused Vitest runs are permitted for the optimization's cases. Full-suite
verification runs through the installed committed audit CLI, serialized after
any active Plan 21 audit. A running/locked audit is not a pass. The coordinator
owns baseline/final audit scheduling and avoids duplicate full runs against
identical inputs. The existing Plan 21 audit observed when execution began
provides evidence only for its own captured source.

Each receipt records implementation commit, focused tests, expected failures,
timing provenance and unrun/remaining checks. Merge receipts distinguish those
facts from a complete audit or responsible-architect semantic completion.
Keep qualified optimization branches/worktrees until delivery evidence is
recorded. Push/publication is not requested by this workflow.
