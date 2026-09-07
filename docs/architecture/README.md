# Ramify implementation architecture

**Date:** 2026-09-07. **Status:** The process split, client roles, lightweight
resident design, MCP adapter and tRPC/quick-testing approach below are decided.
Detailed module contracts, wire schemas and measured resource budgets still require
review before implementation. These documents do not claim runtime support.

Ramify separates ordinary CLI commands, the resident analysis daemon, an MCP
adapter process and an on-demand web server. The MCP host starts the adapter
through a CLI serving mode, `ramify mcp`; that process lives for the stdio
connection. Ordinary CLI commands, MCP and web adapters consume the same daemon
service. Batch execution runs the same engine independently inside the CLI
process.

The daemon retains useful analysis state within explicit resource limits. MCP,
web and development dependencies have separate lifetimes, so an adapter can exit
and reclaim its memory without discarding warm analysis.

## Document responsibilities

| Document | Defines |
| --- | --- |
| [Processes and clients](processes-and-clients.md) | Process boundaries, CLI commands, the MCP adapter, tRPC web delivery, startup, shutdown and compatibility. |
| [Daemon and analysis](daemon.md) | Proposed Ramify ownership tree, exposure routes, engine pipeline, source facts, contexts, revision semantics and semantic acceptance cases. |
| [Memory lifecycle](memory-lifecycle.md) | Resident dependency boundaries, retention and work limits, memory reclamation and measurement requirements. |
| [Quick testing](quick-testing.md) | In-process execution of real client/service flows, the boundaries replaced in quick mode, and complementary transport/process tests. |

The [tooling roadmap](../plans/tooling-architecture/README.md) owns migration and
delivery order. Its first detailed plan is
[batch project verification](../plans/iteration-1-project-verifier/main-plan.md),
followed by resident checking. The [project-explorer reuse analysis](../analysis/project-explorer-reuse.md)
records source candidates and adaptations for later visualization. It is
supporting evidence; the architecture documents own the runtime decisions.

Visualization remains a later implementation phase. Early contract review must
preserve its required module, contract, usage and revision evidence. There is
no requirement to create empty web/UI modules or implement browser transport
before the analysis engine and local clients. MCP is a later adapter over that
service and can be delivered independently of visualization. Streamable HTTP
hosting for MCP is an optional extension; stdio is the initial MCP transport.

## Model authority

Implementation architecture conforms to the
[importability principles](../model/cross-module-importability.principles.md),
[glossary](../model/glossary.md),
[module-description format](../model/module-description.principles.md) and
[TypeScript interpretation](../model/typescript-source-interpretation.principles.md).
Processes and package entry points are deployment boundaries; they grant no
source-level importability. All toolkit runtime code remains inside declared
owners, with legal exposure routes and source classifications.

## Review still needed

The [daemon's remaining review items](daemon.md#decisions-still-requiring-review)
cover exact contracts, manifests, compiler integration, endpoint discovery and
protocols. Resource budgets and grace periods must be agreed from measurements.
CLI command spellings in the process document are proposed names for decided
behavioral roles.
These details do not reopen the separate daemon/web-process decision or make
visualization part of the first implementation milestone.
