# Metrics

This directory establishes a shared language for ramify-agent metrics: the
concepts being discussed, the metrics used to represent them and the evidence
behind individual measurements. Token efficiency is its first selected policy.
It also distinguishes context budget returns, compaction and exact
overflow-triggered compactions so operational counts do not collapse different
mechanisms into one ambiguous “context overflow” label.

**Status:** agreed initial measurement policy. Implementation is planned by
[Plan 4](../plans/04-token-efficiency/main-plan.md), which remains blocked until
Plan 3 is complete and merged. Empirical validation remains separate from the
policy definition. The proxies are deliberately simple. They do not establish
the intrinsic difficulty of a plan or the efficiency of its solution.

| Document | Purpose |
| --- | --- |
| [Glossary](glossary.md) | Concepts and their selected or existing measurements, with units and scope. |
| [Terminology map](terminology.md) | Concepts, metrics and measurements, connected to existing names and implementation usage. |
| [Measurement principles](measurement-principles.md) | Scope, comparison reasoning, limitations and deferred approaches. |
| [Token efficiency](token-efficiency.md) | The initial formulas, counting rules, examples and evidence requirements. |
| [Lineage measurements](lineage.md) | `lineage/1`: forks, continuations, repairs, degraded starts and replacements, by the start each segment made. |

The [earlier measurements and KPIs document](../measurements-and-kpis.md)
describes broader scope-size, session, adaptation and mutation-event measures.
Those measures have different purposes and denominators. This directory is the
reference for the newly agreed delivered-change token-efficiency policy; it
does not require implementing the earlier exploration or activity measurements.

Ramify provides generic project evidence. ramify-agent owns run attribution,
measurement policy, token aggregation and metric presentation.
