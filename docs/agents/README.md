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

The [module architect skill plan](../plans/module-architect-skill/main-plan.md)
delivers the first harness for the role and lists the Ramify features its
trials may justify.

[ramify-agent](../../ramify-agent/README.md) is a separate consumer project,
an agent harness that plans and implements features on Ramify projects. Its
design documents live in its own [docs](../../ramify-agent/docs/README.md).
