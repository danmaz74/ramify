# Iteration 4 handoff — completion and recovery

Status on 2026-09-29: implemented at `eb86e43f`, with final integration and live acceptance still pending.

Capability handback now uses the common completion gate and ordinary review reconciliation under the task owner. Accepted task iterations retain their own gate, commit and review records; prior partial or failed iterations remain historical facts and are never retroactively accepted. Completion checks return to the capability architect. A task handback resumes the original engineer assignment and leaves the parent's broader goal open. The task's pending correction intent and CheckFinding repair claim use the common reconciliation path.

Recovery replays a committed, settled engineer outcome before opening another writer. The existing assignment ID, sequence, budget and repair counters survive restart, including a pending nested request and a completed child handback. Each capability engineer invocation records its exact candidate tree before start and after settlement in the common invocation and outcome records. Settlement attributes only the diff between those two durable trees, preserving inherited dirty, staged, untracked and deleted source without attributing a child's edits to its parent. The audit child reuses the same gate attempt and exact provider receipt or request/source lookup after restart.

The current task projection includes common iteration results, gates and ordinary review failures; the session projection identifies the task and actual assigned module. Historical capability records remain readable, while incompatible old-policy runs do not resume into the version-6 executor.

Focused evidence: restart-after-ended partial and accepted-completion replay passed 2/2 without a second writer; partial attribution and restart cases passed 3/3; a depth-first child restart passed 1/1; capability projection/session tests passed 23/23; type-check passed. The remaining exit checks are the full nested handback and acceptance fixtures against the provider's 0.3.2 executed-file payload, full source audit, and the single authorized live Pi witness. No final acceptance verdict is asserted here.
