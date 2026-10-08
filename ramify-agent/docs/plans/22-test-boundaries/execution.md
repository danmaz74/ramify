# Progressive optimization delivery

**Authorized:** 2026-10-08. **Current integration target:** `/ramify`, branch
`ramify-agent`. The user changed the destination to main after cuts 1–10 were
qualified and integrated in the original target,
`/home/app/ramify-plan21-project-boundary-adoption`, branch
`feat/plan21-project-boundary-adoption`. Retain that delivery history and its
audit provenance. The [main-target reconciliation](optimizations/main-target-reconciliation.md)
records candidate preparation and preservation of committed main changes.
[Main integration](optimizations/main-target-integrated.md) records the passing
new pre-merge audit, merge and integrated verification.

## User's workflow

Choose one optimization, create a separate worktree from the target's current
HEAD, implement/test it with one subagent, merge it into the target, then begin
the next optimization. Do not launch parallel optimization implementations.
Preserve existing work in the current target and the independently maintained
Plan 21 worktree. Use current delivered contracts rather than a frozen earlier
base. Do not copy or commit either worktree's unfinished changes.

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
5. Measurement recipe/capture cases: the post-cleanup profile traces about
   17 s of ordinary calculations and unavailable-response controls in this
   mixed file, alongside distinct actual producer/publication witnesses.
6. Capability recovery and nonfunctional recovery, then other mixed consumers
   according to remaining ordinary cost and boundary trace.
7. Capability assignment, delegation and other ordinary external consumers,
   one bounded family at a time, ordered by the current measured profile.
8. Complete shared enforcement/runner partition and final full qualification.

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
  Preserve concurrent target and Plan 21 changes. If the target advances on touched paths,
  reconcile on the isolated branch and rerun affected checks before integration.
  Never stash/reset another plan's working changes or terminate its test run.
- Before each further merge, run the installed released audit CLI on the clean
  committed optimization branch using `--full --nested`. A failed, blocked or
  incomplete audit prevents integration. Serialize with active audits in the shared workspace.
- Merge only the qualified optimization branch into the target. Verify its
  ancestry and integrated affected checks before creating the next worktree.

## Verification and status

Delivery cuts qualified so far:

| Optimization | First integration commit | Evidence |
| --- | --- | --- |
| 1: command cleanup and accurate crashed-executor fixture | `e1ebdb75`, follow-up `3d69f923` | [Focused correction and failed full baseline](optimizations/01-integrated-baseline.md) |
| 2: guarded twelve-case acceptance matrix and retained actual witness | `b8b3e055` | [Integrated focused verification](optimizations/02-integrated-results.md) |
| 3: guarded thirteen-case dependency matrix and retained nested actual witness | `bf1261cb` | [Integrated focused verification](optimizations/03-integrated-results.md) |
| 4: guarded ten-case write matrix and six retained actual provider controls | `cf813618` | [Integrated focused verification](optimizations/04-integrated-results.md) |
| 5: guarded measurement capture/decoder cases and two retained actual producer witnesses | `77eac8be` | [Passing pre-merge released audit](optimizations/05-premerge-audit.md), [integrated verification](optimizations/05-integrated-results.md) |
| 6: guarded fifteen-case capability recovery matrix and three unchanged actual witnesses | `42038395` | [Passing pre-merge released audit](optimizations/06-premerge-audit.md), [integrated verification](optimizations/06-integrated-results.md) |
| 7: guarded twenty-case nonfunctional lifecycle family and one retained actual audit/tree witness | `09350e8c` | [Passing pre-merge released audit](optimizations/07-premerge-audit.md), [integrated verification](optimizations/07-integrated-results.md) |
| 8: guarded capability assignment/delegation/consultation/submission cases, unchanged actual CA30 witness and complete-log recovery correction | `25ea4b8b` | [Passing pre-merge released audit](optimizations/08-premerge-audit.md), [integrated verification](optimizations/08-integrated-results.md) |
| 9: guarded seventeen-case readiness policy/lifecycle matrix and three unchanged native provider/process witnesses | `8e478e95` | [Passing pre-merge released audit](optimizations/09-premerge-audit.md), [integrated verification](optimizations/09-integrated-results.md) |
| 10: guarded hook/CLI reply matrices, strict consumption controls and retained native timeout with producer retirement | `531ee940` | [Passing pre-merge released audit](optimizations/10-premerge-audit.md), [integrated verification](optimizations/10-integrated-results.md) |
| 11: guarded settlement/shell/session cases and nine retained real-process witnesses | `dfc8b4f2` (main) | [Passing pre-merge released audit](optimizations/11-premerge-audit.md), [integrated verification](optimizations/11-integrated-results.md) |
| 12: six guarded pure provider/executor cases and 36 unchanged native cases | `d27e3839` (main) | [Passing pre-merge released audit](optimizations/12-premerge-audit.md), [integrated verification](optimizations/12-integrated-results.md) |

Cuts 1–10 have integrated focused passes in the original Plan 21 target.
Main received cuts 1–8 with the Plan21 merge and now contains cuts 9–10
after the [audited reconciliation and integrated checks](optimizations/main-target-integrated.md).
Cuts 11–12 were created from, audited and integrated directly into main.
Their earlier audits remain evidence for their recorded original inputs; the
new reconciliation audit qualifies the combined main candidate. The initial full baseline failed one
crash fixture, subsequently corrected with focused evidence. A later released
full nested audit of all four integrated cuts passed: [audit receipt](optimizations/04-released-audit.md). This was post-merge qualification. Subsequent cuts require
passing released audits before merge. Final full-audit qualification and
project-wide automatic enforcement remain outstanding.

Focused Vitest runs are permitted for the optimization's cases. Full-suite
verification runs through the installed committed audit CLI, serialized after
any active Plan 21 audit. A running/locked audit is not a pass. The coordinator
owns baseline, pre-merge and final audit scheduling and avoids duplicate full runs
against identical inputs. On 2026-10-08, after the user asked about pre-merge
audits, delivery was corrected: cuts 1–4 had focused/type/module qualification
before merge, with the failed post-cleanup full baseline retained. Audit those
four integrated cuts together, and require a passing released full nested audit
on every subsequent committed optimization branch before merging. The existing Plan 21 audit observed when execution began
provides evidence only for its own captured source.

Each receipt records implementation commit, focused tests, expected failures,
timing provenance and unrun/remaining checks. Merge receipts distinguish those
facts from a complete audit or responsible-architect semantic completion.
Keep qualified optimization branches/worktrees until delivery evidence is
recorded. Push/publication is not requested by this workflow.
