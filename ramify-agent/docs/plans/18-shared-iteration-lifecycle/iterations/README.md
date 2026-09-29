# Plan 18 iterations

[Main plan](../main-plan.md) · [Provider contract](../provider-contract.md) ·
[Acceptance](../acceptance.md)

This is the only active schedule for the combined Plans 18 and 19.
Iteration 1's harness and provider contract investigations are independent;
subsequent iterations follow [manifest.json](manifest.json).

| Iteration | Outcome | Status |
| --- | --- | --- |
| [1](01-shared-contracts.md) | Common assignment ownership and provider contract decisions | Implemented; [results](iteration1-results.md) |
| [2](02-provider-integration.md) | Released provider capabilities and complete evidence integration | Implemented; [results](../iteration2-results.md) |
| [3](03-shared-execution.md) | Shared engineer execution, generated API views and agent-owned repair | Implemented; [results](iteration3-results.md) |
| [4](04-completion-recovery.md) | Common completion, recovery and historical compatibility | Implemented; [results](iteration4-results.md) |
| [5](05-inspection-delivery.md) | Git inspection, faithful current evidence and browser projections | Implemented; [results](../iteration5-results.md) |
| [6](06-production-acceptance.md) | Production delivery, real repair/provider evidence and full audit | Source audit passed; single Pi trial failed readiness before implementation; [evidence and open acceptance](../iteration6-results.md) |

Implemented source is distinct from accepted live behavior. The full source
audit passed at `4d95dad9`; the iteration 6 ledger retains the conditions that
the first trial did not exercise. The implementation was merged into the
authoring checkout at `3feba772`; one further usual-use-case trial is authorized
and its result remains open.

Each executed iteration writes iterationN-results.md with source and package
identities, implemented acceptance rows, commands/results and remaining limits.
Do not create result files in advance or equate document validation with
implementation. Preserve unrelated source and historical run evidence.
