# Module architect skill design

Develop a skill or collection of skills that helps the module architect
make good choices about discovery, access, placement and decomposition.
This directory collects alternative approaches to the decisions those
skills must support. They remain working proposals to compare through
practical use and trials.

| Hypothesis | Starting point | Role of cohesion and coupling |
| --- | --- | --- |
| [Cohesion and coupling indices](2026-09-18-cohesion-coupling-indices.md) | Internally cohesive, externally loosely coupled modules are the primary criterion. | The criterion is examined through separate indices, with coverage and counterexamples. |
| [Cognitive decomposition through the module tree](2026-09-18-cognitive-decomposition.md) | Recursive abstraction makes local cognitive complexity manageable. | Evidence about whether the chosen abstractions reduce the complexity that must be understood together. |

The second hypothesis offers an alternative organizing principle. It can
reuse evidence from the first without adopting its criterion as the
fundamental reason to create modules. Neither hypothesis supersedes the
other by being listed here.

Keep each idea in its own document. Connect its premise to the evidence
the architect should inspect, the alternatives it should compare and the
recommendation it should produce. Evaluate whether the resulting procedure
helps the architect make justified choices on real projects; update this
index when adding an alternative. Shared metric definitions remain in
their owning specifications.

The [module architect principles](../../../docs/agents/module-architect.principles.md)
define the architect's role and Ramify's evidence boundary. The
[module architect skill plan](../../../docs/plans/module-architect-skill/main-plan.md)
provides the current delivery and trial proposal. These alternatives inform
the skill's decision procedures; whether they become one skill or several
remains a design choice.
