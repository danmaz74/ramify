# Iteration 4: Serve the daemon operation

**Plan:** [Plan 6D: Behavioral dependency diagram](../main-plan.md).
**Prerequisites:** iterations 1–3, including BD14–BD18 and the process runner.
**Owners:** `daemon/contexts`, `daemon` and root `ramify [dispatch]` service
vocabulary and resident assembly.

## Goal

Serve `dependencyDiagram` from the daemon at an exact published revision by
running the injected analyzer runner on request, one job at a time, and
retaining at most one bounded result per context, without touching the context
queue or retained session.

## Read first

- [Contracts C4](../contracts.md#c4-daemon-operation) and BD19–BD24.
- Main plan “Lifecycle and consistency” and “Resource budgets”.
- `subs/daemon/subs/contexts/src/context-manager.ts`, especially
  `explorerDetails`, revision pinning, publication, eviction and close.
- `subs/daemon/subs/contexts/src/interfaces/contexts.ts`,
  `subs/daemon/src/context-types.ts`, `service.ts`, `validation.ts`, `codec.ts`
  and `src/interfaces/service.ts`.
- `src/resident-assembly.ts` for driver injection.
- `subs/daemon/subs/contexts/src/tests/explorer-details.test.ts`,
  `subs/daemon/src/tests/service.test.ts`, `ipc.test.ts` and
  `session-counters.test.ts`.

## Deliverables

1. Add C4's operation, capability, request/outcome types, runner port and
   counters to the root service vocabulary and daemon context types.
2. Implement the context manager's order: superseded, invalid-current, ready
   from retained, join, `busy/analysis-running`, start. A busy answer starts no
   work.
3. Run one job daemon-wide with a job-owned abort controller and pinned
   revision; pass the context's resolved project request and published report
   to the runner; detach cancelled callers and abort when none remains.
4. Abort the job on newer publication and answer waiting callers superseded;
   map `inputs-changed` to `busy/inputs-changed`; never restart a job
   automatically.
5. Retain one ready result within `retainedBytes`, the per-context and global
   budgets; release it on newer publication, eviction and close.
6. Add validation, IPC framing within existing response capacity, the service
   method and the client method; map every outcome.
7. Inject root's process runner in resident assembly; the daemon imports only
   the port.

## Matrix rows executed here

BD19–BD24.

## Verification

```sh
npx vitest run subs/daemon/subs/contexts/src/tests/dependency-diagram.test.ts
npx vitest run subs/daemon/subs/contexts/src/tests/context-manager.test.ts
npx vitest run subs/daemon/subs/contexts/src/tests/explorer-details.test.ts
npx vitest run subs/daemon/src/tests/service.test.ts
npx vitest run subs/daemon/src/tests/ipc.test.ts subs/daemon/src/tests/codec.test.ts
npx vitest run subs/daemon/src/tests/session-counters.test.ts
npx vitest run src/tests/resident-assembly.test.ts
npm run type-check
npm run build
npm run check:self
```

Order, joining, abort and retention tests use a controllable fake runner with
the real context manager. BD24 uses the built daemon, the injected process
runner and a real edit, and inspects the daemon's loaded modules and the
retained session's operations rather than import declarations.

## Exit criteria

BD19–BD24 pass; existing operations' outputs are unchanged; the retained
session and context queue never receive diagram work; ordinary and changed-file
checks record zero `behaviorRuns`.

## Handoff

Iteration 5 receives the client method, outcome mapping, capability name,
counters and the measured result sizes for Ramify and Collection Review.
Iteration 7 receives the BD24 recipe and raw artifact.
