# Iteration 6: Generic materialize operation and CLI

**Plan:** [Plan 2B: Generated project views](../main-plan.md).
**Prerequisites:** Iteration 5.
**Owners:** `daemon/contexts` materialize request types, daemon service,
validation, codec and connection, root service vocabulary and assembly, and
`cli`.

## Goal

Carry view identifiers from the command line to the session and compact
per-view summaries back, with capability negotiation and unchanged Plan 2A
behavior when only the API view is selected.

## Read first

- [Root service and wire](../contracts.md#root-service-and-wire),
  [CLI grammar and exits](../contracts.md#cli-grammar-and-exits) and
  [failure table](../contracts.md#failure-and-preservation-table).
- Iteration 5 results; Plan 2A iteration 8 results.
- `service.ts`, `validation.ts`, `codec.ts`, `connection.ts`,
  `connect-daemon.ts`, `interfaces/service.ts`, `resident-assembly.ts`,
  `quick-environment.ts`, `arguments.ts`, `materialize-command.ts`.

## Deliverables

1. Add `views` to `MaterializeRequest` and `MaterializeParams`, the
   `materialize-views` capability and exact validation.
2. Extend `MaterializedTarget` with `view` and `symlinks` and allow null module
   and area.
3. Parse repeated `--view`, reject unknown and duplicate values before
   connecting, default to every registered view and print one summary line per
   view.
4. Apply module selection to module-area views only.
5. Add quick, IPC and compiled-process cases.

## Matrix rows executed here

I2B-07: all seven leaves.

## Verification

Focused daemon, root and CLI tests; actual socket and compiled-process cases
with an owned `RAMIFY_ENDPOINT_DIR` stopped in `finally`; build; batch
self-check; `reference:verify -- --plan 2a`; `--plan 2b --iteration 6`.

## Exit criteria

`ramify materialize --view <id>` works end to end for the API view, rejects
invalid selections before connecting and negotiates capability with older
daemons.

## Handoff

The generic command and its process fixture go to iterations 7 and 8, which may
run in parallel.
