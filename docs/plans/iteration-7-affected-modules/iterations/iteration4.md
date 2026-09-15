# Iteration 4: CLI affected command

**Plan:** [Plan 7: Affected modules](../main-plan.md).
**Prerequisites:** Iteration 3 service/client method and Plan 5 saved-content hashing, root selection and resident command lifecycle.
**Owners:** subs/cli/ and root CLI entry/tests.

## Goal

Let a user request affected modules and consume a deterministic test selection through human output or JSON.

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

1. Implement `affected <module-id>...` with root, changed-file freshness,
   deadline and format options as specified. Validate before connecting;
   require seeds and reject batch/since options.
2. Use the injected service with published wait=true by default; reuse Plan 5
   expected saved-content/deletion helpers for `--changed`. Do not discover
   Git changes or infer seeds from changed paths.
3. Format exact affected/test modules, current revision, scope and coverage.
   Preserve the shared structured envelope, CLI pre-context errors and
   documented 0/2/130 exits. A failed importability check remains distinguishable
   from incomplete dependency coverage and from whether tests have run.
4. Extend help, command dispatch, purpose prose and CLI invocation spec.
   Register A7-13 owned and executable process cases, including cleanup and
   stable stdout/stderr framing.

## Matrix rows executed here

A7-13, all instances in cases.json.

## Verification

```sh
npm run build
npm run type-check
npx vitest run subs/cli/src/tests/affected.test.ts src/tests/affected-cli.test.ts
```

Spawn the built executable for the CLI cases; quick injected service checks
supplement process evidence. Compare JSON against the real service at one
input ID, exercise partial/failed distinctions, saved/deleted expected content,
SIGINT and invalid arguments. No shell execution of the selected tests occurs.

## Exit criteria

The built CLI produces the reviewed result/schema/exit behavior, preserves freshness and cleanup, and adds no graph or compiler implementation to the client.

## Handoff

CLI examples, help/spec updates, exact process expectations and structured fixture output go to the final integration gate. MCP remains required for full feature completion.
