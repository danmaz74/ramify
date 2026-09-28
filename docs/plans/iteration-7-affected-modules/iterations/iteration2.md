# Iteration 2: Context scheduling, daemon operation and root service

**Plan:** [Plan 7: Affected modules](../main-plan.md).
**Prerequisites:** iteration 1 merged on the branch (`RetainedSession.affected`
and `interfaces/affected.ts`). **Owners:** `subs/daemon/subs/contexts/`,
`subs/daemon/`, root `src/`. No CLI change.

## Goal

Expose the affected query through the daemon: schedule it against the covering
revision in contexts, add the `affected` service operation and capability,
validate it on the wire, and make the lightweight client call it.

## Read first

- [Contracts](../contracts.md): Context contract; Daemon, root and client.
- [Main plan](../main-plan.md): verified state item 4, decisions 5 and 8.
- [Owners](../owners.md): the contexts, daemon and root rows, the N5 and root
  relay additions, package entries.
- [Acceptance](../acceptance.md) rows A7-06 to A7-08 and their instances.
- The `measure` operation end to end, which this iteration mirrors:
  `subs/daemon/subs/contexts/src/interfaces/contexts.ts` (`ApiViewRequest`,
  `ContextApiViewOutcome`, `measurementOnly`), `context-manager.ts` (the
  covering-revision path used by `apiView`/`measure`),
  `subs/daemon/src/service.ts` (`case 'measure'`, `guard`, byte bounds),
  `codec.ts` (capability list), `connection.ts` (`measure` gated method),
  `context-types.ts`, `src/interfaces/service.ts` (`MeasureOutcome`,
  `ServiceOperation`, `ServiceCapability`), `src/resident-assembly.ts`.
- Tests to imitate: `subs/daemon/src/tests/measure-service.test.ts`,
  `measure-driver.ts`, `measurements.test.ts`, `ipc.test.ts`, `codec.test.ts`;
  `src/tests/resident-assembly.test.ts`, `quick-environment.ts`.
- [Daemon architecture](../../../architecture/daemon.md): service operations
  table; add the row in iteration 3, read it now.

## Deliverables

1. Contexts: `AffectedRequest` and `ContextAffectedOutcome` in
   `interfaces/contexts.ts`, aligned with the existing measure outcome
   variants; `ContextManager.affected(request, lease, control?)` in
   `context-manager.ts` using the same covering-revision scheduler and lease
   handling as `measure`, calling `session.affected({ sequence, modules,
   paths })` and returning `superseded` on a sequence mismatch.
2. Daemon: the session driver binding for `affected`; `case 'affected'` in
   `service.ts` with the wire guard (exact fields, string arrays, freshness,
   deadline cap, response byte bound); `affected` in the codec capability
   list; the gated `affected` method in `connection.ts`; relays in
   `context-types.ts`.
3. Root: `affected` in `ServiceOperation` and `ServiceCapability`;
   `AffectedParams` and `AffectedOutcome` in `src/interfaces/service.ts`;
   assembly in `resident-assembly.ts`; the quick environment exposes the
   operation to CLI tests.
4. Manifests: the N5 addition in `subs/daemon/module.ramify` and the root
   relay in `module.ramify`; purpose sentences for contexts, daemon and root.
5. Tests: `subs/daemon/subs/contexts/src/tests/affected.test.ts` (A7-06 with
   the controlled watcher and clock); `subs/daemon/src/tests/affected-service.test.ts`
   (A7-07); an `affected` round trip, unsupported peer and disconnect case in
   `ipc.test.ts` or a new `affected-ipc.test.ts` (A7-08); a codec case for the
   capability; an entry-boundary case that the client entry gains no analysis
   runtime.

## Matrix rows executed here

A7-06 to A7-08, all instances.

## Verification

```sh
npm run type-check
npx vitest run subs/daemon/subs/contexts/src/tests/affected.test.ts subs/daemon/src/tests/affected-service.test.ts subs/daemon/src/tests/codec.test.ts subs/daemon/src/tests/ipc.test.ts
npx vitest run src/tests/resident-assembly.test.ts src/tests/entry-boundaries.test.ts
npm run build && npm run check:self
```

Do not run the whole Vitest suite. Isolate `check:self`'s endpoint and stop
its daemon afterwards.

## Exit criteria

- All listed tests pass; type-check and self-check pass.
- `A7-07:equivalence-with-session`: the daemon answer equals the session
  answer at one input identity, compared as plain JSON.
- No CLI change; no analysis change except an omission found in iteration 1,
  recorded in the results file.
- `iteration2-results.md`: what changed, commands and outcomes, deviations.

## Handoff

Iteration 3 consumes `connection.affected`, `AffectedParams`,
`AffectedOutcome` and the quick environment's `affected` operation.
