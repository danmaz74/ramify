# Plan 4 iterations

The [main plan](../main-plan.md) is authoritative. This plan remains blocked
until Plan 3 is complete and merged into the destination branch. Each iteration
runs in order and leaves a results note beside its brief.

| Iteration | Brief | Results |
| ---: | --- | --- |
| 1 | [Post-merge reconciliation and usage identity](iteration1.md) | `iteration1-results.md` |
| 2 | [Source-line and delivered-change evidence](iteration2.md) | `iteration2-results.md` |
| 3 | [Lifecycle capture and token-efficiency projection](iteration3.md) | `iteration3-results.md` |
| 4 | [Presentation, trials and completion](iteration4.md) | `iteration4-results.md`, then the completion report |

## Rules for every iteration

- Read `AGENTS.md`, the main plan, the metrics glossary and
  `token-efficiency/1` before editing. Do not read `docs/.superseded/`.
- Refresh the architect view before placement claims and record its revision,
  input identity and coverage limits. Use requester API views for cross-module
  imports.
- Preserve `kpi/1`, `scope-size/1`, existing persisted Plan 3 records and the
  existing `/metrics` response.
- A missing or partial input remains unavailable with evidence; never convert
  it to zero or a covered-subset whole-run score.
- Keep evidence capture in `harness/evidence`, run policy and durable state in
  `harness`, usage-observation semantics in `harness/agent`, and calculation out
  of `web`.
- End with `npm run type-check`, `npm test`, `npm run build:web` and
  `npm run check:self` from `ramify-agent/`. Record exact outcomes.
- The result note lists delivered behavior, owned acceptance cases, deviations,
  evidence identities and what the next iteration must know.

