# Plan 16 iterations

The [main plan](../main-plan.md) is authoritative. These briefs execute in
dependency order, with per-iteration results written beside them.

Plan 16 retains its descriptive `01-…` brief names and the existing
[manifest](manifest.json) as its planning index. This is an explicit local
convention, not a claim that the production harness consumes that manifest.
Results use the earlier plans' `iterationN-results.md` convention. Do not
create empty reports or mark implementation complete before its evidence exists.

| Iteration | Brief | Results location (created on execution) |
| --- | --- | --- |
| 1 | [Records and authority](01-records.md) | `iteration1-results.md` |
| 2 | [Delegation and context](02-delegation.md) | `iteration2-results.md` |
| 3 | [Cooperation and assignments](03-cooperation.md) | `iteration3-results.md` |
| 4 | [Verification and handback](04-acceptance.md) | `iteration4-results.md` |
| 5 | [Recovery and dependencies](05-recovery.md) | `iteration5-results.md` |
| 6 | [Public views](06-views.md) | `iteration6-results.md` |
| 7 | [Replacement and live acceptance](07-rollout.md) | `iteration7-results.md` |

Each result records actual scope, revisions, changes, checks and their evidence,
failed or unrun cases, deviations and successor inputs. Iteration 1 also records
the precursor prompt-change disposition and clean execution baseline. Iteration
7 reports delivery and failure-handling live gates separately and links the
final `implementation-report.md` beside the main plan. The manifest's status
remains proposed until execution establishes a different status.
