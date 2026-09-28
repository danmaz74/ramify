# Iteration 6: inspect capability coordination in the application

[Plan 16](../main-plan.md) · [Contracts](../contract-appendix.md)

## Prerequisites and owners

Iteration 5. Deliver harness-owned protocol/projections first, then web-owned
presentation. These are separate module scopes. Root re-exposure, if needed,
is a separate root assignment. Search web's ordinary and testing API views
before importing new public types.

## Goal and read first

Make the current coordinator and actual acceptance status visible. Read
`subs/harness/src/interfaces/protocol/runs.ts`, `projections/execution-map.ts`,
session projections, and `subs/web/src/execution-map.tsx`,
`execution-map-tokens.ts`, `session-role.tsx`, `run-page.tsx`.

## Deliverables

- Project requests, plan revisions, owner assignments, consultations, pending
  failures, checks, nested dependencies and handbacks through the harness API.
- Add the capability architect role and task associations to sessions/execution
  views, including suspended A, deferred B entries, the current stack and actual
  session reconstruction. Keep task identity distinct from existing capability
  graph and module-capability identities; handback does not complete an entry.
- Let a user inspect original need, current design, coverage and why work is
  blocked without reading internal record JSON or all historical transcripts.
- Preserve historical contract roles/statuses and report unsupported execution
  versions explicitly. Web remains a consumer of public projections only.

## Verification and exit criteria

Extend execution-map/session HTTP and browser component tests for CA23–CA24
and CA34.
Use the prior iteration's durable fixtures; verify mutation failures remain
visible and stale responses do not replace newer state. Run focused harness
and web tests, type-check, structural check and web build. Include a browser
witness on the production served app during iteration 7.

Exit: a reader can follow X from request through handback and distinguish
partial provider work, pending real verification and completed delivery.

## Handoff

Provide browser fixture routes and expected state transitions for the final
scripted composition and Pi witness.
Write `iteration6-results.md` following the [iteration index](README.md).
