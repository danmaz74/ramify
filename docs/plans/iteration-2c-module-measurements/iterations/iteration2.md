# Iteration 2: Measurement session operation, view bytes and architect view metrics

**Plan:** [Plan 2C](../main-plan.md).
**Prerequisites:** Iteration 1's shared computation and specification text;
decisions 4, 5 and 8 and the resource/surface-equality contracts.
**Owners:** `analysis` (interfaces, retained session, architect projection and
renderer); `daemon` (in-memory API view bytes and the architect view wiring);
root `module.ramify` for the re-exposure.

## Goal

The retained session returns inventory buckets for a sequence, the daemon adds
view bytes from an in-memory render, and `module.json` carries measured
context size from those values.

## Read first

- Main plan: decisions 4, 5 and 8, contracts (buckets, architect view,
  surface equality, resource limits), exposure, MM04–MM07 and MM15.
- `subs/analysis/src/interfaces/session.ts` (`RetainedSession`,
  `architectView`, `explorerDetails`), `subs/analysis/src/architect-view.ts`,
  `architect-render.ts`, `interfaces/architect-view.ts`.
- `session-engine.ts`, `session-host.ts`, `session-worker.ts` and their protocol:
  wire the new query through both direct and worker-backed retained sessions.
- `subs/daemon/src/service.ts` (`runMaterialize`),
  `api-view-documents.ts` (`renderApiView`), `api-view-publisher.ts`
  (`collectApiTargets`).
- Tests: `architect-render.test.ts`, `architect-view.test.ts`,
  `architect-view-session.test.ts` with `architect-fixture.ts`.

## Deliverables

1. `interfaces/measurements.ts` with the inventory bucket, view bytes, views
   state, module-measurement and file-record types; `expose-src *` to parent
   in `subs/analysis/module.ramify` and the root's `expose-sub` to
   descendants.
2. A retained-session operation returning inventory buckets and the file list
   for the current sequence, with the same sequence rules as `architectView`.
   It has no view-byte fields. Wire the worker request/response, host adapter
   and serialized engine operation; read captured inputs from that same revision.
3. A daemon function that projects the API view for all modules and measures
   its exact encoded bytes through the existing renderer's bounded emission
   path. Enforce 32 MiB per area and 256 MiB across areas before accumulation;
   discard per-area buffers when only measuring. Propagate request interruption
   and revision changes; only API-specific failure can yield unavailable views
   alongside valid inventory. Return no partial view totals.
   `runMaterialize` uses this under the fixed measure policy; omit produces
   not-requested metrics. Combined publication reuses rendered selected areas
   without publishing unselected targets. Keep normal publication limits.
4. The architect projection carries each module's exact and subtree inventory
   buckets; the renderer takes the views state and view bytes as a required
   input and writes the `metrics` block and `_meta.json` `metrics`.
5. Updated golden files and metadata, key-order and determinism cases under
   both fixed policies; final delivered policy is selected by MM12. The shared
   renderer preserves existing API bytes. Add interruption checkpoints and
   bounded batches as specified in the main contract.

## Matrix rows executed here

MM04–MM07 and MM15.

## Verification

Focused runs of the architect renderer, projection and session tests, a new
session-operation test on `architect-fixture.ts` through direct and worker-backed
sessions, and a daemon test for the
view-byte function; MM07 compares in-memory bytes with a real
`materialize --view api --all` in a temporary project. Refresh golden files
with `RAMIFY_UPDATE_GOLDEN=1` and review the diff. Run `npm run check:self`
after the exposure change.
Use lowered injected limits for exact-boundary/one-byte-over area and aggregate
cases, escaped and multibyte output, many owners and a record larger than one
emission batch. Inject cancellation, deadline and revision change between
batches; assert no publication or retained partial totals and successful
subsequent requests. Test combined publication with a selected module while
metrics cover all modules, preserving target selection.

## Exit criteria

Inventory buckets and commonly measured view bytes agree for the fixture;
availability/reasons obey the surface contract. The view is byte-stable across
two renders under each fixed policy; no measurement writes to the project;
limits/interruption stop work explicitly; unavailable is never rendered as zero.

## Handoff

The session operation, measurement types, bounded view-byte function, policy
wiring and interruption evidence, for the `measure` operation.
