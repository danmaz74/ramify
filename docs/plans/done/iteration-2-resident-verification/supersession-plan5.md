# Plan 2 supersession by the retained session

**User acceptance date:** 2026-09-12. The user's explicit instruction to execute
Plan 5 iteration 9, including these ten removals and this amendment, authorizes
RP-4 for this implementation. The 2026-09-11 review recorded RP-4 as proposed;
this amendment does not rewrite that historical result or infer acceptance of
RP-6's future measurement targets.

Plan 2's original completed package currently remains at
[iteration-2-resident-verification](../../iteration-2-resident-verification/main-plan.md).
This amendment occupies the done-package path required by Plan 5 without moving
or editing the historical inventory. Plan 5 removes the per-revision increment
engine together with this amendment. The batch entry and project resolution stay.

| Retired instance | Superseded by |
| --- | --- |
| `I2-10:null-changes-no-reuse` | `I5-07:configuration-broad` |
| `I2-10:metadata-only-reuse` | `I5-07:readme-metadata-only` |
| `I2-10:exposure-only-reuse` | `I5-07:description-relink-subtree` |
| `I2-10:header-tag-rerun` | `I5-07:description-relink-subtree` |
| `I2-10:source-rerun` | `I5-06:export-added-importers` |
| `I2-10:configuration-rerun` | `I5-07:configuration-broad` |
| `I2-10:absent-appears-rerun` | `I5-07:created-importing-file` |
| `I2-10:dependency-rerun` | `I5-07:dependency-broad` |
| `I2-10:products-plain` | `I5-06:unchanged-surface-no-propagation` |
| `I2-11:reuse-equal` | `I5-07:audit-equal-sequence` |

The executable inventory preserves all 176 historical records and marks exactly
these ten as superseded. A complete Plan 2 gate requires the remaining 166 and
all eight distinct I5 counterparts. Each counterpart executes its actual retained
session assertions once, even when it replaces two historical records. A
superseded record is not counted as an executed or passing case. Removing any
historical record, inventing a retirement, changing a mapping, omitting a
counterpart handler or failing its assertions fails the gate. An iteration
filter adds counterparts for every selected retired record.

The four I2-10 resolution cases, four remaining I2-11 equivalence/coverage cases,
and every contexts, IPC, process, CLI, lifecycle and live-equivalence case stay
required. Their mechanisms use the retained session and preserve their independent
behavioral expectations. Compact-history evidence measures retained revision
metadata, and background reconciliation evidence uses the scheduled sweep.

This amendment supplies no blanket acceptance or evidence waiver. Plan 2's nine
measurement workloads remain required; iteration 12 owns their stage-reuse to
revision-path expectation migration. Missing or stale measurements stay explicit.
The I5-10 Plan 2 full-gate witness invokes the actual Plan 2 gate; that gate runs
only the eight session counterparts and cannot recurse into I5-10.
