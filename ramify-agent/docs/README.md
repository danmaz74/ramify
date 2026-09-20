# ramify-agent documents

Design documents for the separate agent harness:

- [Harness principles](harness.principles.md)
- [Breaking and non-breaking plans](decomposition/breaking-vs-non-breaking-plans.md),
  reasoning, sequential sub-plan hypothesis and non-breaking-only MVP scope
- [Harness architecture](architecture.md), early draft
- [Implementation loop](implementation-loop.md), task state machine proposal
- [The work loop as a state machine](work-loop.md), proposed
- [What the plan-to-brief spike taught us](analysis/2026-09-19-plan-to-brief-spike.md),
  analysis of the [spike](../spikes/briefs/README.md) that mapped three toolkit
  plans and assembled their briefs
- [From a plan to a brief: a merge of the two spikes](analysis/2026-09-19-merged-brief-process.md),
  proposal
- [A merged implementation loop](analysis/2026-09-19-loop-merge-proposal.md),
  proposal connecting capability-only maps and rendered briefs to the whole-run state machine
- [Work-brief decomposition spike](spikes/work-brief-examples/README.md), isolated example requests and Sol planning runs
- [Glossary](glossary.md)
- [Additional points to evaluate](additional-to-evaluate.md)
- [Plan 1: from a chosen plan to an implementation map](plans/01-implementation-map/main-plan.md),
  implemented except its live items: the real pi session and the live trial,
  which need a person's pi login. See its
  [completion report](plans/01-implementation-map/completion-report.md) and the
  trial's [review sheet](plans/01-implementation-map/trial/review-sheet.md).
- [Module architect skill design](architect-skill-design/README.md)
- [Ramify measurements and agent KPIs](measurements-and-kpis.md)
- [Plan 2C consumer review](reviews/2026-09-19-plan2c-consumer-review.md)

What Ramify provides to agents is described in the toolkit's
[agents documents](../../docs/agents/README.md).

[Plan 2C](../../docs/plans/iteration-2c-module-measurements/main-plan.md) stays in
Ramify and publishes generic project facts. The dependency goes from this
project to Ramify only; agent activity and KPIs are measured here.

Replaced designs are kept in the hidden `.superseded/` directory for
comparison. They are not current and are read only on request; its
[index](.superseded/README.md) notes what may be reused.
