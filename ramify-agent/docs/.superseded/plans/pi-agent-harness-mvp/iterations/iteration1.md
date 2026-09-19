# Iteration 1: Harness service and web plan browser

> **Superseded** on 2026-09-19 by the [harness principles](../../../../harness.principles.md) and the
> [harness architecture](../../../../architecture.md). Kept for comparison; not current. See the
> [archive index](../../../README.md) for what may be reused.

**Plan:** [Pi architectural planning MVP](../main-plan.md).
**Prerequisites:** Existing `ramify-agent/` scaffold and target fixture. Plan 2C
is required for measurement integration in iteration 2, not basic plan browsing.
**Owners:** Harness bootstrap/plan store, protocol/client and web plan page.

## Goal

Start a standalone harness and use its independent web client to choose and
read an existing disk plan.

## Read first

- Main plan sections 1–2, storage layout in section 3, and section 7.
- [Client protocol](../client-protocol.md).
- [Architectural artifact contract](../architecture-artifact.md).
- [Acceptance fixtures, PW01–PW03 and PW21](../acceptance.md).

## Deliverables

1. Extend the existing standalone Node harness scaffold and project configuration, with HTTP
   queries usable without web assets or a connected browser.
2. Shared protocol schemas and a thin browser/Node client; distinct harness
   and web entry points with no cross-import of runtime/UI code.
3. Plan discovery/read endpoints, list/empty/error states and read-only Markdown.
4. Selected-plan routing and Plan/Architecture views with honest empty states;
   the planning Start action becomes functional in iteration 2.
5. Input snapshots and shared versioned artifact/job identities, with separation
   between original content, architecture and runtime state.
6. `web-plan-lab` and the plan/store/browser verification scripts.

## Matrix rows executed here

PW01–PW03 and PW21.

## Verification

Run `npm run type-check`, `npm run test:plans`, `npm run test:protocol` and
`npm run test:web -- --stage plans`. Exercise real filesystem changes, reload,
invalid paths and Markdown rendering in a browser. Start the harness with
web assets absent and query it from a Node client over actual HTTP.

## Exit criteria

The plan is readable through the web UI and never modified by the app. External
edits and captured inputs remain distinguishable. No agent execution is implied.

## Handoff

Standalone service, client library, plan IDs/routes, snapshot contracts and fixture for the
planning-job producer in iteration 2.
