# Iteration 2: On-demand graph and retained-session query

**Plan:** [Plan 7: Affected modules](../main-plan.md).
**Prerequisites:** Iteration 1 and completed Plan 5 per-file facts, atomic session revisions, worker queue, cancellation and compiler release.
**Owners:** subs/analysis/; independent verification tooling registration is limited to this capability. No daemon, CLI or MCP behavior yet.

## Goal

Answer affected-module queries inside the live worker by building and discarding one temporary graph from a coherent retained revision.

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

1. Add the five analysis interface types and `RetainedSession.affected` from
   contracts.md. Implement a private read view over existing committed facts;
   add only the reviewed readiness metadata if necessary. Keep compiler and
   whole-report projection out of this path.
2. Add private `affected-query.ts`: derive reverse edges from actual targets,
   original.owner, forwarding owners and explicit owned shims. Include type,
   test, denied and symbol-free accesses; avoid resolution/contributor edges.
   One traversal handles all seeds, sorting and deduplicating outputs.
3. Implement exact validation, unknown IDs, empty seeds, invalid/missing state,
   partial coverage fallback and all resource guards. Preserve scope and
   current input identity. Never use checked-file counts to prune dependents.
4. Add the request-ID worker operation and wrapper, serialized with mutations.
   Cooperative checkpoints include nested selection lists; enforce one active
   build, active deadline and finally cleanup. Warm queries work with compiler
   released. No cache, update maintenance, contribution counts or new audit.
5. Add owned query/session/worker tests and explicit source fixtures named in
   cases.json. Edits must compare independent expected edges/results at each
   committed revision. Instrument zero compiler/source-read/report calls and
   graph lifecycle through existing test seams, without a public debugging API.
6. Apply analysis manifest/export/purpose additions. Add the finite evidence
   validator `scripts/verify-affected.mts` and package script. Register this
   iteration's cases and allow explicit intermediate slices without treating
   absent consumer cases as completed.

## Matrix rows executed here

A7-02 through A7-09, all instances in cases.json (48 cases).

## Verification

```sh
npm run type-check
npx vitest run subs/analysis/src/tests/affected-query.test.ts subs/analysis/src/tests/affected-session.test.ts subs/analysis/src/tests/affected-worker.test.ts
```

Run these against real retained sessions/workers for their declared rows, with
actual source edits, barrel/shim cases, invalid updates and cancellation.
Exercise exactly-at/over bounds and query/update races across a yield. Verify
source facts remain Plan 5-owned and repeated queries release their own maps.
Service/CLI/MCP cases are pending, not expected false-positive successes.

## Exit criteria

Every A7-02–A7-09 instance passes at its declared level; answers come from one revision with zero compiler/read/report work, and no graph state survives a request.

## Handoff

Public session types/method, worker message schema, private fact-view readiness, explicit fixtures and evidence registration go to iteration 3. Record the actual exposure paths and resource counters.
