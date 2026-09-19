# Implementation runner acceptance

> **Superseded** on 2026-09-19 by the [harness principles](../../../harness.principles.md) and the
> [harness architecture](../../../architecture.md). Kept for comparison; not current. See the
> [archive index](../../README.md) for what may be reused.

**Plan:** [Pi implementation runner](main-plan.md).
**Status:** deferred; these cases are outside the current implementation scope.

## Fixtures and verification

Reuse the predecessor's `web-plan-lab`, produced architectural plan, captured
inputs and browser/pi adapter. Fix the feature's expected behavior before
execution. Deterministic workers/processes cover failure and recovery; the final
gate uses actual pi and an existing subscription to implement the feature.

Commands added by this successor in the same application's checkout:

- `npm run type-check` for shared contracts.
- `npm run test:kpis` for event attribution, cost/drift formulas and missing-data
  coverage using retained Ramify fixtures plus agent activity.
- `npm run test:implementation` for execution, replanning and verification.
- `npm run test:web -- --stage implementation` for browser execution controls.
- `npm run trial:web-workflow -- --project <fixture-root>` for the complete live
  flow, including real architectural planning and verified implementation.

The predecessor's tests remain regression gates where its behavior is changed.

## Matrix

| ID | Iteration | Case and required evidence |
| --- | ---: | --- |
| PW10 | 1 | Start implementation pins the displayed revision and prepared worktree; duplicate requests start one run. Source commit and exclusion of uncommitted source are visible before launch; the original checkout's source is unchanged. Changed inputs, a stale browser tab or an older architecture revision cannot launch implementation. |
| PW11 | 1 | Execute provider/consumer/integration work with one worker, fresh scoped attempts and automatic checks. A partial consumer need creates provider work and a fresh retry without a human choosing briefs. Missing/failed checks cannot produce completed status. |
| PW12 | 1 | Split a scope, add an omitted owner and reorder dependencies automatically; publish a revision, update the package list/count and preserve earlier attribution. Changed prerequisites invalidate affected accepted work. |
| PW13 | 2 | A substantial behavior/compatibility/architecture change shows a concrete browser decision. No dependent execution occurs without approval of that exact proposal; rejection triggers alternatives. Cumulative drift and stale decisions cannot bypass the rule. |
| PW14 | 2 | Show current activity, package states/counts, checks and durable activity feed. Browser closure does not stop the job; reconnect catches up without duplicate events. Backend restart reconciles processes before continuation; explicit Stop is respected and Resume cannot create a second writer. |
| PW15 | 1 | Relevant acceptance and full Ramify check pass before completion at the recorded workspace fingerprint. Post-check changes invalidate success. Bounded recovery ends irrecoverable jobs as failed, not waiting for routine task selection. |
| PW16 | 1 | Direct foreign read/search/write activity is measured against the attempt scope, including failed/reverted operations. Unknown shell access is explicit; no observed activity is not proof of zero outside activity. The package details and final summary agree. |
| PW17 | 2 | Complete the real browser-to-pi fixture flow: select/read plan, explicitly start architecture, inspect it, explicitly start implementation, observe automatic routine replanning and verified completion. Beyond the two launch actions, no human decision is required for the routine fixture. Retain inputs, architecture, native sessions, events and check evidence. |
| PW31 | 1 | Retain observable add/delete/edit/revert events, including edits to the same line in successive calls and sessions. Deleted/new paths use before/after Ramify ownership; binary, unmapped, mechanical and shell-internal unknown changes remain explicit. Final net diff cannot replace the event ledger; earlier scopes are immutable. |
| PW32 | 1 | With baseline 1000 bytes, two changing sessions of sizes 200/500 and weights 10/30 plus one no-change architect session of size 100, derive mean 425 bytes, ratio 0.425, reduction 1/0.425, count 3 and session total 0.8. Also cover zero changes/baseline, unavailable components/usage, resumed sessions, ratios above 1, shared adaptation causes and failed sessions. |
| PW33 | 1 | Compare initial owner/seam/reuse claims to actual attributed changes, production behavioral pairs and classified adaptation needs. Include major-set ties/empty sets, module identity changes, missed/unused seam candidates, confirmed escalated reuse omissions and unclassified evidence. Cost and knowability shares retain denominators/unknowns; no unsupported source parsing or fabricated perfect drift score. |
| PW34 | 2 | Browser and Node clients receive identical KPI projections from the harness. Live execution retains measurement snapshots, baseline, mutation/session/usage/cause evidence and final acceptance; at least the supported cost, owner drift and adaptation paths have actual observations. Missing observations are labeled with coverage, not hidden or accepted as an entirely uninstrumented run. |

## Completion boundary

All successor cases have evidence, including actual source changes and passing
feature acceptance/full Ramify checks at the final workspace identity. Preserve
the original checkout and retained architectural planning evidence. Browser
progress alone and a model's completion claim cannot establish verification.
Missing subscription access leaves live cases unrun. KPI evidence and its
coverage accompany completion; no benchmark is required.
