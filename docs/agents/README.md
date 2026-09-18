# Agents on a Ramify project

This directory describes how agents use Ramify's outputs on a project. It is
about consuming Ramify, not developing it; developing Ramify is covered by
the [development guides](../development/README.md).

- [Module Architect Principles](module-architect.principles.md): what Ramify
  gives the one agent with a global view of a project's architecture, and
  what it leaves to that agent.
- [Glossary](glossary.md): the principles' vocabulary, including the
  distinction between a capability and behavioral evidence.

Surfaces that implement these principles are specified under
[architecture](../architecture/README.md):

- the [API discovery view](../architecture/materialized-api-view.spec.md),
  generated beneath each module for engineering agents; and
- the proposed [architect view](../architecture/architect-view.spec.md) with
  its [agent test cases](../architecture/architect-view.test-cases.md).

The reasoning behind the architect role is recorded in the
[agentic module architect analysis](../analysis/2026-09-18-agentic-module-architect.md).

[Module architect skill design](module-architect-skill-design/README.md)
collects alternative approaches for a skill or collection of skills that
helps the architect make justified architectural choices. The alternatives
are working material for decision procedures and practical trials.
