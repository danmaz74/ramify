# Iteration 2: Pi architectural planning

> **Superseded** on 2026-09-19 by the [harness principles](../../../../harness.principles.md) and the
> [harness architecture](../../../../architecture.md). Kept for comparison; not current. See the
> [archive index](../../../README.md) for what may be reused.

**Plan:** [Pi architectural planning MVP](../main-plan.md).
**Prerequisites:** Iteration 1 app/records; supported pi release and existing
subscription login; built Plan 2C `measure` and materialization contracts,
completion evidence and resolved producer-review dispositions for the adapter.
**Owners:** Harness command/job controller, pi adapter and architecture store;
architect prompt package and web planning/decision client.

## Goal

Launch architectural planning from the web UI and save a valid reusable artifact.

## Read first

- Main plan dependency boundary, sections 3 and 5–7.
- [Measurements and KPIs](../../../../measurements-and-kpis.md).
- [Plan 2C consumer review](../../../../reviews/2026-09-19-plan2c-consumer-review.md).
- [Architect prompt package](../architect-prompts.md).
- [Client protocol](../client-protocol.md).
- [Architectural artifact contract](../architecture-artifact.md).
- [Acceptance PW04–PW07, PW18, PW22–PW23, PW25–PW26 and PW27–PW29](../acceptance.md).
- Current pinned pi SDK docs and module-architect skill procedure.

## Deliverables

1. Prepared Git worktree, captured inputs and subscription readiness, with a
   visible source revision and uncommitted-source limitation before launch.
2. Author/version the role, decomposition, correction and continuation prompts;
   tool descriptions; task/context assembly; and skill report-format adaptation.
   Preserve canonical architectural guidance and artifact schemas.
3. Fresh architect pi session with that package, explicit read-only tools and
   harness-owned initial/on-demand Ramify refresh; structured submission and
   complete prompt/resource provenance.
4. Schema/reference validation, bounded correction, atomic revision publication
   and preserved prior results on failed regeneration.
5. Durable command admission/receipts and jobs/events, one-job lock, expected
   state versions, idempotent commands and reconnectable projections.
6. Planning progress and complete substantial-change proposal/decision UI,
   with exact-proposal responses and no edits to the original plan.
7. Architecture-ready state after valid artifact publication. Stop/Resume and
   harness recovery reconcile processes before another worker starts.
8. Prompt assembly checks and two real pi decomposition trials assessed against
   fixture facts, including reuse and new provider work.
9. CLI-only Plan 2C adapter with immutable revision-matched snapshots, explicit
   unsupported/unavailable handling and a frozen baseline. No toolkit internals.
10. Harness-owned deduplicated scope projections and actual architect session,
    time, usage and tool-observation collection, including retries and failures.
    Preserve the original owner/seam/reuse claims for successor drift metrics.

## Matrix rows executed here

PW04–PW07, PW18, PW22–PW23, PW25–PW26 and PW27–PW29.

## Verification

Run `npm run type-check`, `npm run test:plans`, `npm run test:protocol`,
`npm run test:planning`, `npm run test:prompts`, `npm run test:measurements` and
`npm run test:web -- --stage planning`. Verify a real authenticated pi planning
session for PW04/PW05; inject malformed output, cancellation and interrupted
publication with deterministic workers. Test accept/reject, cumulative change
and stale responses through the actual browser decision controls. Also start
and finish a job through the Node client with no browser, attach a client
mid-job, and exercise lost responses/restarts and racing command IDs. Run
`npm run trial:architect-prompts -- --project <fixture-root>` for both prompt
fixtures; assess semantic obligations as well as valid structured output.

## Exit criteria

A browser action yields a valid artifact from pi without source edits. Partial
or failed generation never appears ready. Duplicate commands create one job.
No progress or recovery transition depends on a connected client. All prompt
paths are authored and recorded, the skill/output instructions are compatible,
and both real decomposition trials satisfy the fixture rubric. They consume
real Plan 2C measurements and retain actual planning KPIs; mocked producer
responses alone cannot satisfy the dependency gate.

## Handoff

Versioned prompts and assembly/tool contracts, semantic trial evidence, actual
fixture artifacts, pi integration/version evidence, job event contract,
workspace and failure cases for visualization in iteration 3 and later reuse
by the separate implementation runner.
