# Iteration 3: consumer consultation and scoped implementation

[Plan 16](../main-plan.md) · [Contracts](../contract-appendix.md)

## Prerequisites and owners

Iteration 2. Scope: harness internals. Existing agent/Pi interfaces are expected
to suffice; any adapter defect discovered by a real boundary test receives a
separate owner-scoped repair, with its contract documented before use.

## Goal and read first

Let the capability architect coordinate all X work through real harness
assignments. Read `work/assignment.ts`, `work/scope.ts`, `work/engineer-equipment.ts`,
`run/writer.ts`, `run/service.ts:takeIteration`, and the agent port and Pi tool
setup. Read the CA06–CA10 fixture requirements before creating new scaffolding.

## Deliverables

- Implement durable questions and read-only A-engineer answers using the
  preserved engineer session. Record actual reconstruction if continuation
  is unavailable. Keep pending questions visible.
- Implement architect assignments in B, A and existing affected owners; inherit
  normal module scope and testing constraints. No architect source writes.
- Reuse existing writer/equipment/hooks. Settle each invocation before the next
  assignment. Capture each assignment's start and actual mutation set, including
  attribution relative to A's retained provisional source. Issue numbers from
  the task's sequence across owners, never from B's deferred entry sequence.
- Allow the capability architect to handle X's A-side design and routine
  compatibility decisions. Wider boundary decisions return to this architect.
- Supply recorded evidence lookup and plan update/prevalidation tools with
  compact action-specific schemas and same-session validation feedback.

## Verification and exit criteria

Add `capability-consultation.test.ts` and `capability-assignments.test.ts` for
CA04 and CA06–CA10, CA16, CA20 and CA28–CA30. Exercise the real write guard and real fixture
tree; a test that only inspects the action payload is insufficient. Verify Pi
equipment replacement on continuation with an adapter test that uses no model.
Run per-iteration checks.

Exit: A can answer directly and perform a separately assigned experiment;
B/D/P changes are made only by appropriately scoped engineers; A-architect is
not recalled for routine X work; one writer remains enforced.

## Handoff

Provide the provisional multi-owner candidate and recorded check failures to
iteration 4. Retain the original requesting assignment for final continuation.
Write `iteration3-results.md` following the [iteration index](README.md).
