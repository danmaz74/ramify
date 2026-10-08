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
3. Capability dependencies: convert the thirteen-case nested-flow matrix.
4. Write-guard ordinary cases: their implicit ownership queries cost about
   27 s in the post-cleanup audit. Preserve the distinct actual F1 provider
   cases as explicit boundary evidence; ordinary path/symlink tests retain real
   filesystem behavior and script ownership responses.
5. Capability recovery and nonfunctional recovery, then measurement and other
   mixed consumers according to the remaining ordinary cost and boundary trace.
6. Capability assignment, delegation and other ordinary external consumers,
   one bounded family at a time, ordered by the current measured profile.
7. Complete shared enforcement/runner partition and final full qualification.

These cuts refine the plan's iteration groups; they preserve all acceptance
cases. Global case inventory, shared helper infrastructure and runner
enforcement do not delay the independent cleanup fix. Inventory the affected
cases and implement only the minimum strict helper support before each test
conversion, then complete project-wide coverage/enforcement after those cuts.

## Before merge

The post-cleanup audit also found 75–80 s files already documenting distinct
actual Git/audit/CLI or generated-view witnesses. Their time does not justify
replacing their actual claims with fake responses. Trace mixed files before
classifying them; reduce unnecessary external work in ordinary cases and keep
the minimum actual witnesses needed for the declared boundary claims.

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

Delivery cuts qualified so far:

| Optimization | Target merge | Evidence |
| --- | --- | --- |
| 1: command cleanup and accurate crashed-executor fixture | `e1ebdb75`, follow-up `3d69f923` | [Focused correction and failed full baseline](optimizations/01-integrated-baseline.md) |
| 2: guarded twelve-case acceptance matrix and retained actual witness | `b8b3e055` | [Integrated focused verification](optimizations/02-integrated-results.md) |
| 3: guarded thirteen-case dependency matrix and retained nested actual witness | `bf1261cb` | [Integrated focused verification](optimizations/03-integrated-results.md) |

These cuts have integrated focused passes. The initial full baseline failed one
crash fixture, subsequently corrected with focused evidence. Final full-audit
qualification and project-wide automatic enforcement remain outstanding.

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
