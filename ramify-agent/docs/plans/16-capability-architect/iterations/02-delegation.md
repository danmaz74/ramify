# Iteration 2: request, delegation and fresh context

[Plan 16](../main-plan.md) · [Contracts](../contract-appendix.md)

## Prerequisites and owners

Iteration 1 records and validators. Scope: harness internals. Use existing
agent and plan-evidence interfaces; inspect their API views before any new use.
This iteration owns creation of the independent fixture projects
`ramify-agent/fixtures/capability-coordination/` (A/B/D/P) and
`ramify-agent/fixtures/capability-coordination-nested/` (adds C), their setup
metadata and requirements. The harness implementation task owns their testing
purpose; these paths are explicit outside-module fixture support in its
assignment. Harness test helpers copy them into temporary workspaces.

## Goal and read first

Carry an engineer's need to a fresh capability architect while retaining the
original participants. Read `work/engineer.ts`, `work/submission.ts`,
`run/service.ts:takeIteration/takeWorkItem/takeContract`, `run/sessions.ts`,
`prompts/packages.ts` and `context-selection/` under `subs/harness/src/`.

## Deliverables

- Implement `capability-needed`, original assignment suspension, writer
  settlement, provisional source capture and retention of the requesting
  engineer's session. Partial A edits stay live with source attribution.
- Add local architect qualification/reuse/delegation actions. Registry identity
  never decides semantic fit. Respect existing placement authority.
- Atomically record delegation and suspended A-architect before starting one
  fresh capability architect. Read B's existing work-item decisions and record
  deferral; do not activate or fork B's local architect for X.
- Implement the durable coordination stack: no unrelated frontier dispatch
  while X or a nested task is active or waiting. Handback resumes the parent.
- Create a harness-owned test helper that injects the new workflow factory and
  captured policy version into the real run service. Production composition
  cannot select it before iteration 7; public policy injection is refused.
- Add the concise role prompt, action/tool definitions, manifest, context
  policy and current plan briefing. State full X authority and A-code access.
- Reuse Plan 14 package generation. Orient the capability architect on A/B;
  select relevant constraints through the existing selector process, including
  re-selection when the set of owners expands. Deliver bodies once, changes
  afterward. The feature catalog remains frozen.

## Verification and exit criteria

Add `capability-delegation.test.ts` and prompt/package coverage for CA01–CA05.
Use scripted sessions through the real service with the test-only policy/factory
injection specified in the main plan. Cover CA28, CA30, CA32 and CA33 as well.
Assert actual fresh
start, preserved original request, continued parent identities, existing-API
return path and no direct new contract session. Run per-iteration checks.

Exit: a qualified request reaches a fresh architect with the right authority
and reproducible context; unqualified/ambiguous requests remain with the agent
responsible for deciding them. Production rollout waits for iteration 7.

## Handoff

Provide captured scripted prompts and the suspended session/task fixture to
iteration 3. Document every old `contract-needed` branch still to retire.
Write `iteration2-results.md`, including fixture paths and the production
non-activation test, following the [iteration index](README.md).
