# Plan 2 iterations

The [main plan](../main-plan.md) is authoritative. This prerequisite refactor
has one narrow, cross-module iteration.

| Iteration | Brief | Results |
| ---: | --- | --- |
| 1 | [Move contracts to the harness](iteration1.md) | `iteration1-results.md` when executed |

## Rules for the iteration

- Read [AGENTS.md](../../../../AGENTS.md), the main plan, the
  [harness principles](../../../harness.principles.md), the
  [autonomous-loop architecture](../../../architecture/autonomous-implementation-loop.md)
  and Plan 1's [completion report](../../01-implementation-map/completion-report.md)
  before changing source.
- Work only under `ramify-agent/`. Leave unrelated working-tree changes alone.
- Preserve behavior and public contract names. Ownership and source paths are
  the intended changes.
- Use Ramify-generated architect and requester API views for the pre/post
  comparison. Never edit generated views.
- Tests live with the harness after the move. Do not leave a compatibility
  module or forwarding files under `subs/contracts/`.
- Run `npm run type-check`, `npm test`, `npm run build:web` and
  `npm run check:self` from `ramify-agent/`.
- Do not commit. The result note records delivered changes, exact commands and
  outcomes, deviations and the handoff to the autonomous-loop plan.

