# Iteration 5: MCP affected-module tool

**Plan:** [Plan 7: Affected modules](../main-plan.md).
**Prerequisites:** Iteration 3 plus Plan 4 implemented stdio provider, explicit root/context selection, injected daemon client, SDK error/cancellation contract and real protocol test helpers.
**Owners:** subs/mcp/ supplied by Plan 4, and root serving assembly/tests.

## Goal

Expose the same affected-module selection to an MCP host using the existing resident service.

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
- Plan 4 accepted MCP registration, SDK schema and real-client lifecycle handoff; obtain these from its completed provider before implementation.

## Deliverables

1. Verify the Plan 4 provider handoff and actual paths. Register
   `ramify_affected_modules` with explicit root/modules and optional
   expectedContent/deadlineMs, using its existing tool registration.
2. Map to the same affected service request and return structured outcomes
   with bounded text. Validate schema and preserve partial, unavailable,
   superseded and cancelled outcomes using the reviewed SDK conventions.
3. Advertise support with daemon capabilities. Preserve protocol-only stdout,
   context leases, cancellation and host disconnect cleanup. No shell, CLI
   invocation, report projection, new compiler or second MCP server.
4. Apply purpose documentation and host usage examples. Register A7-14 real
   in-memory SDK and actual stdio cases, including two independent hosts and
   unsupported capability. If the provider is absent, this iteration remains
   pending; its cases cannot be waived by substituting a mock endpoint.

## Matrix rows executed here

A7-14, all instances in cases.json.

## Verification

```sh
npm run build
npm run type-check
npx vitest run subs/mcp/src/tests/affected.test.ts src/tests/affected-mcp.test.ts
```

Bind paths to the actual Plan 4 provider at handoff. Initialize actual clients,
list/call the tool, verify structured schema and revision, cancel/disconnect
one of two hosts and inspect protocol stdout plus resource cleanup. Trace the
adapter dependency/process boundary on a ready daemon.

## Exit criteria

Actual stdio tool calls return the service selection with correct coverage/freshness, SDK outcome mapping and per-host cleanup. Every A7-14 instance passes.

## Handoff

Final tool schema, host configuration, SDK mapping and actual client fixture go to iteration 6; retain the exact Plan 4 commit and lifecycle suite used.
