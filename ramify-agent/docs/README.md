# ramify-agent documents

Design documents for the separate agent harness:

- [Harness principles](harness.principles.md)
- [Decomposition hypothesis 3](decomposition/dan-hypothesis-3.md), initial draft:
  local coordinators, unified delegation and decisions recorded without review waits
- [Autonomous implementation loop](architecture/autonomous-implementation-loop.md), proposed architecture (formerly hypothesis 3b):
  global and local architects share and refine architectural hypotheses;
  global forks decide and append briefs without a parent model call
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
- [When should a contract be a module?](analysis/2026-09-20-contract-module-analysis-brief.md),
  analysis brief for contract authority, dependency cost and cognitive complexity
- [When should a contract be a module? Result](analysis/2026-09-20-contract-module-analysis-result.md),
  what that analysis established, what Plan 3 takes from it and what it did not record
- [Work-brief decomposition spike](spikes/work-brief-examples/README.md), isolated example requests and Sol planning runs
- [Autonomous-loop initial capability and module hypothesis](spikes/autonomous-loop-initial-analysis/README.md),
  spike output and reusable input for the later implementation plan
- [Glossary](glossary.md)
- [Additional points to evaluate](additional-to-evaluate.md)
- [Plan 1: from a chosen plan to an implementation map](plans/01-implementation-map/main-plan.md),
  implemented except its live items: the real pi session and the live trial,
  which need a person's pi login. See its
  [completion report](plans/01-implementation-map/completion-report.md) and the
  trial's [review sheet](plans/01-implementation-map/trial/review-sheet.md).
- [Plan 2: put contracts with their authority](plans/02-contract-authority-refactor/main-plan.md),
  prerequisite refactor before the autonomous implementation loop
- [Plan 3 authoring brief: autonomous implementation loop MVP](plans/03-autonomous-implementation-loop/authoring-brief.md),
  inputs, boundaries and acceptance requirements for the full implementation plan
- [Lessons from cucumber-viz](cucumber-viz-lessons/README.md), analysis of what
  its agent studios teach about state, checks, planning and sessions, with the
  consequences proposed for Plan 3
- [Plan 3: the autonomous implementation loop MVP](plans/03-autonomous-implementation-loop/main-plan.md),
  authored and not executed; thirteen [iterations](plans/03-autonomous-implementation-loop/iterations/README.md)
- [Plan 3 core records](plans/03-autonomous-implementation-loop/core-records.proposal.md),
  proposal for the durable records, submissions and identities the plan will reference
- [Module architect skill design](architect-skill-design/README.md)
- [Ramify measurements and agent KPIs](measurements-and-kpis.md)
- [Potential future capabilities](future/README.md), candidate user-facing
  features that are not yet scheduled or approved for implementation
- [Plan 2C consumer review](reviews/2026-09-19-plan2c-consumer-review.md)

What Ramify provides to agents is described in the toolkit's
[agents documents](../../docs/agents/README.md).

[Plan 2C](../../docs/plans/iteration-2c-module-measurements/main-plan.md) stays in
Ramify and publishes generic project facts. The dependency goes from this
project to Ramify only; agent activity and KPIs are measured here.

Replaced designs are kept in the hidden `.superseded/` directory for
comparison. They are not current and are read only on request; its
[index](.superseded/README.md) notes what may be reused.
