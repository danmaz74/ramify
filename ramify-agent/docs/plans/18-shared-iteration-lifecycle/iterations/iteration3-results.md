# Iteration 3 handoff — shared engineer execution

Status on 2026-09-29: implemented at `eb86e43f`, with integration acceptance still pending.

`assignCapabilityWork` builds the same durable assignment as the ordinary architect and calls the common `takeIteration` executor. The former capability-specific engineer invocation, provisional acceptance and repair loop are gone. A completion proposal now takes the common kind-derived gate, commit, review and repair path. Gate failures return to the same engineer within the ordinary repair bound; partial, unsuitable and exhausted iteration results return to the issuing capability architect. Scope-probe execution and path/count-based repair-owner inference were removed from the gate path.

Every engineer invocation receives `iterationViews` from its assigned scope. Source and test API areas remain distinct, and generated revision, path, coverage and preparation limits reach the ordinary brief. Selected child scopes expand through current descendant owners; multi-module scopes use their named owners. Capability scenario briefing and quick checks use scenarios explicitly assigned to that task, so unrelated pending entry scenarios of the suspended consumer or deferred provider entry do not become task obligations.

Focused evidence: the partial capability assignment test passed with exact changed-path attribution; scenario briefing, state and projection tests passed 30/30; type-check passed. The root-owned API materialization cases and audit-child gate cases are recorded by their owners. This handoff does not claim a task handback or a production Pi run.
