# Metrics

This directory establishes a shared language for ramify-agent metrics: the
concepts being discussed, the metrics used to represent them and the evidence
behind individual measurements. Token efficiency is its first selected policy.

**Status:** agreed initial measurement policy; implementation and empirical
validation are separate work. The proxies are deliberately simple. They do not
establish the intrinsic difficulty of a plan or the efficiency of its solution.

| Document | Purpose |
| --- | --- |
| [Glossary](glossary.md) | Concepts and their selected or existing measurements, with units and scope. |
| [Terminology map](terminology.md) | Concepts, metrics and measurements, connected to existing names and implementation usage. |
| [Measurement principles](measurement-principles.md) | Scope, comparison reasoning, limitations and deferred approaches. |
| [Token efficiency](token-efficiency.md) | The initial formulas, counting rules, examples and evidence requirements. |

The [earlier measurements and KPIs document](../measurements-and-kpis.md)
describes broader scope-size, session, adaptation and mutation-event measures.
Those measures have different purposes and denominators. This directory is the
reference for the newly agreed delivered-change token-efficiency policy; it
does not require implementing the earlier exploration or activity measurements.

Ramify provides generic project evidence. ramify-agent owns run attribution,
measurement policy, token aggregation and metric presentation.
