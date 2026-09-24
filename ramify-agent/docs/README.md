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
- [Session transcripts and live session views](analysis/2026-09-23-session-transcripts-live-view.md),
  draft analysis: what is collected for a web view of agent sessions, the gaps,
  and a harness-owned transcript designed for parallel sessions
- [Required capabilities and retired forecasts](analysis/2026-09-23-capability-registry-analysis.md),
  analysis for the capability registry: only top-level capabilities are
  required, a forecast is retired by deduction when the run completes, and
  early retirement is a placement decision
- [Acceptance scenarios](analysis/2026-09-23-acceptance-scenarios.md),
  analysis recording Dan's decision that Gherkin scenarios are the plan's main
  acceptance gate: their origin and review, matching to entries, late binding,
  quick and full modes, and Cucumber runs scoped to the module tree
- [Acceptance scenarios: the v1 architecture](architecture/acceptance-scenarios.md),
  the design of the first step, implemented by Plan 10, with Dan's decisions of 2026-09-23: plan
  scenarios extracted at capture, frozen at analysis, a review stop,
  harness-materialized feature files, four scenario states, declarations
  verified by every gate, one Cucumber run per owner module read from its
  message stream, and an integration work item at the common ancestor
- [Work-brief decomposition spike](spikes/work-brief-examples/README.md), isolated example requests and Sol planning runs
- [Autonomous-loop initial capability and module hypothesis](spikes/autonomous-loop-initial-analysis/README.md),
  spike output and reusable input for the later implementation plan
- [Glossary](glossary.md)
- [Additional points to evaluate](additional-to-evaluate.md)
- [To do](todo.md), harness work decided in outline and not yet started
- [Dan's to-do](dan-to-do.md), decisions and actions only Dan can take
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
  in implementation; its thirteen-iteration
  [index](plans/03-autonomous-implementation-loop/iterations/README.md) records
  current progress
- [Plan 3 core records](plans/03-autonomous-implementation-loop/core-records.proposal.md),
  proposal for the durable records, submissions and identities the plan will reference
- [Plan 3 capability progress visualizations](plans/03-autonomous-implementation-loop/initial-hypothesis-vs-implemented-module-tree.proposal.md):
  one implementation plan for the dependency-progress and
  initial-versus-current module diagrams, including the Ramify canvas
  extraction they need; proposed
- [Plan 4: delivered-solution token efficiency](plans/04-token-efficiency/main-plan.md),
  including context-limit and overflow visibility; planned and blocked until
  Plan 3 is complete and merged
- [Plan 5: single engineer sessions](plans/05-single-engineer-sessions/main-plan.md),
  the `ramify-agent session` command for one engineer session on one module;
  proposed
- [Plan 6: role-specific prompts](plans/06-role-specific-prompts/main-plan.md),
  self-contained prompts per role in place of the module-architect skill;
  proposed
- [Plan 7: commit-audit integration](plans/07-commit-audit-integration/main-plan.md),
  implemented commit-then-audit gates with revision-bound evidence; its
  completion gate is verified, while run delivery or merge remains out of scope
- [Plan 9: session model and transcripts](plans/09-session-model-and-transcripts/main-plan.md),
  harness-owned sessions with lifecycle and lineage, a transcript per session,
  the session list, live transcripts, diagram markers, a lineage timeline and
  lineage measurements; implemented 2026-09-23, with its
  [results](plans/09-session-model-and-transcripts/results.md)
- [Plan 10: acceptance scenarios](plans/10-acceptance-scenarios/main-plan.md),
  the v1 acceptance scenarios architecture in eleven iterations; implemented,
  with its [results](plans/10-acceptance-scenarios/results.md), and merged
  with Plan 9's session model; both audits pass on the merge
- [Plan 11: plan execution and modules maps](plans/11-plan-execution-map/main-plan.md),
  implemented with zoomable execution and companion module maps, scenario and
  capability details, gate results, sessions and movable live transcript windows;
  [results](plans/11-plan-execution-map/results.md) include real-browser and
  scripted-run acceptance evidence
- [Module architect skill design](architect-skill-design/README.md)
- [Metrics](metrics/README.md), glossary, measurement principles and the initial
  delivered-change token-efficiency policy; its glossary names concepts and
  their selected measurements, and its terminology map clarifies older names
- [Ramify measurements and agent KPIs](measurements-and-kpis.md)
- [Potential future capabilities](future/README.md), candidate and planned
  user-facing features with their maturity
- [Plan 2C consumer review](reviews/2026-09-19-plan2c-consumer-review.md)

What Ramify provides to agents is described in the toolkit's
[agents documents](../../docs/agents/README.md).

[Plan 2C](../../docs/plans/iteration-2c-module-measurements/main-plan.md) stays in
Ramify and publishes generic project facts. The dependency goes from this
project to Ramify only; agent activity and KPIs are measured here.

Replaced designs are kept in the hidden `.superseded/` directory for
comparison. They are not current and are read only on request; its
[index](.superseded/README.md) notes what may be reused.
