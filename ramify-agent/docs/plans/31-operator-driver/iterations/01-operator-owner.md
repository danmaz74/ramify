# Iteration 1: the operator owner

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and owners

Plan 30 complete and its final audit passing; take the clean committed
baseline full audit. Resolve R31-2's composition/declaration boundary first.
Owner: the new `subs/harness/subs/agent/subs/operator/`, the agent parent and
the pi adapter only as required by that decision. Read
`subs/agent/src/interfaces/session-operations.ts`,
`subs/agent/src/session-operations.ts`, `subs/agent/src/scripted.ts`
(`createScriptedSessionDriver` and the enrich pattern), the pi adapter's
history rebuild and `piBuiltinDeclarations`, and `docs/testing.spec.md`.

## Goal

A session operation driver whose turns are supplied through a mailbox, with
enforcement, persistence and transcript entries equal to pi's.

## Deliverables

- `module.ramify` and `README.md` for the owner; `createOperatorAgent(options)`
  returning an `AgentPort` with `name: 'operator'`, support, pi's built-in
  declarations and `bindSessionStore` over `createSessionOperations` with the
  operator driver, following the scripted agent's enrich pattern.
- The driver: pending-turn files, an ordered action watcher, `callTool` and
  `submit` through the runtime, events, `persistPayload` of each action and
  result, `stopped` on signal, `ended` on an `end` action.
- Built-in tools `read`, `grep`, `ls`, `find`, `edit`, `write` executing
  through the engine with matching declarations supplied across a legal
  parent boundary, only when active. Snapshot-only reviewers gain no built-ins.
- History rendering from generic context/tool-change payloads and operator
  payloads at the selected point; refusal with reason on foreign driver history.
  Persist action IDs before effects, avoid duplicate execution, and handle
  queued actions/closure races according to the mailbox contract.
- Mailbox record schemas, exposed to the parent for the CLI; parent re-exposes
  what the harness needs. The root CLI consumes a harness command entry and
  its signature companions, not an otherwise inaccessible sibling API.

## Verification

Own O01–O06 and O16. In-process tests drive the mailbox with a test operator writing
actions into a temporary directory; the scripted engine helpers supply guard,
judge and store. Run the owner's tests from `ramify-agent/` with
`npm run test:quick -- <files>`, then `npm run type-check` and
`npm run check:self`.

## Exit and handoff

An operator session passes guard, judge and transcript tests equal to the
scripted agent's. Commit and write `01-results.md`.
