# Iteration 1 handoff — shared contracts

Status on 2026-09-29: implemented at `eb86e43f`, with integration acceptance still pending. Baseline `cf221987` includes the Plan 16 and 17 work. Coverage-record changes were committed separately at `606d9b71`; audit-child and provider integration have their own commits.

The capability architect now submits the full ordinary assignment body. The durable assignment and result carry a coordination owner separate from the real work item used for context. A capability task owns its sequence and limit; no provider work item is fabricated. The assignment records its plan revision, source citation, scope, gate policy, authorizations, scenarios, bounds, and starting tree. New runs use policy version 6; older records retain their optional legacy fields and are read without rewriting their verdicts. The task and session projections read both historical capability assignments and new common iteration records.

The audit-child contract retains the provider's complete result and per-check records on the gate. The provider's public 0.3.2 Vitest result supplies executed file identities; a planned test selection is not treated as executed evidence. The gate's exact provider result is retained for recovery by request and source identity.

Focused evidence: policy, capability-record and submission tests passed 18/18; capability projection and session tests passed 23/23; type-check passed after the integrated source change. The complete Plan 18 acceptance suite and live-provider witness are later exit checks, not claims of this handoff.
