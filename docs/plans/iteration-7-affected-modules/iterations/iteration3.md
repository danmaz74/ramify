# Iteration 3: Context scheduling and daemon access

**Plan:** [Plan 7: Affected modules](../main-plan.md).
**Prerequisites:** Iteration 2 and completed Plan 5 context driver, covering-revision scheduler, compact history, leases and client/worker integration.
**Owners:** subs/daemon/subs/contexts/, subs/daemon/ and root service/assembly.

## Goal

Expose the query through the existing context and lightweight client with exact freshness, revision and lifecycle behavior.

## Read first

- [Main plan](../main-plan.md): user workflow, on-demand choice and scope.
- [Contracts](../contracts.md) and [owners](../owners.md): query semantics,
  readiness, lifecycle, public types and exact exposure additions.
- [Acceptance](../acceptance.md) and [case inventory](../cases.json): this
  iteration's finite expectations and required evidence levels.
- [Plan 5 contracts](../../iteration-5-fast-incremental-checks/contracts.md),
  [scope](../../iteration-5-fast-incremental-checks/scope.md) and its completed
  provider handoff; preserve its accepted session/freshness contracts.
- [Testing guide](../../../development/testing.md) and the current source/tests
  of the owners named below; inspect provider versions before editing.

## Deliverables

1. Add neutral `AffectedRequest`/`AffectedOutcome` and
   `ContextManager.affected` over Plan 5 covering-revision scheduling. Pass
   the current sequence into the session, then validate sequence/input ID
   before attaching context revision metadata. Never request a full report.
2. Implement published/current, explicit older revision, synchronized expected
   identities, already-covered inputs, required sweep, cold/wait, invalid
   current, supersession, cancellation and disposal outcomes from contracts.
3. Extend root service operation/capability, daemon request validation and
   dispatch, wire method and lightweight connection. Bound both the request
   and full service answer. Unsupported peers have no batch fallback.
4. Apply neutral type relays and package client exports from owners.md; use
   contexts' existing interface wildcard. Extend real quick-environment
   binding, controlled race tests and actual IPC/process tests.
5. Update daemon/context/root purpose paragraphs and daemon architecture for
   the reviewed method and query lifecycle. Register A7-10–A7-12 evidence.

## Matrix rows executed here

A7-10, A7-11 and A7-12, all instances in cases.json.

## Verification

```sh
npm run build
npm run type-check
npx vitest run subs/daemon/subs/contexts/src/tests/affected.test.ts subs/daemon/src/tests/affected.test.ts src/tests/affected-ipc.test.ts
```

Use actual context/session services with controlled clock/events for races;
use actual IPC for framing, capability and disconnect cases. Import the built
client package in a clean consumer and audit its compiler/server dependency
boundary. MCP provider absence is irrelevant to this slice.

## Exit criteria

Direct and IPC answers agree at one revision; stale hashes, cold states, invalid inputs, worktree isolation and missing capability cannot become false empty successes. Client dependency and lease boundaries hold.

## Handoff

Final service/wire types, capability, client exports, freshness examples and real test binding go to CLI and MCP. Resource evidence retains ready-query time separately from synchronization.
