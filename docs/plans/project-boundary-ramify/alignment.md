# Authority alignment

**Status:** draft planning alignment, not implementation evidence.

The [proposal](../../architecture/project-boundary.proposal.md) records adopted
decisions, recipes and migration. The following authorities govern implementation.
No new principle is needed for a grammar or tooling schema choice; iteration 1
adopted the precise changes in their specifications (commit `6d0c66f0`) through
exact patches authorized under the
[protected-document procedure](execution.md#protected-principles-and-specifications).
The coordinator adopts R7's root-marker patches the same way before iteration
3A; the importability principles already require an explicit application root.

| Proposal coverage | Authority | Producing slices | Acceptance |
| --- | --- | --- | --- |
| §3 path ownership without inventory | [Layout specification](../../model/module-description.spec.md), [glossary](../../model/glossary.md), [affected contract](../../plans/iteration-7-affected-modules/contracts.md) | 3, 8, 12–14 | PB1-08, PB1-17–19, PB1-23 |
| §4 auxiliary-source interpretation and exposure | [Importability specification](../../model/cross-module-importability.spec.md), [source interpretation](../../model/typescript-source-interpretation.spec.md), layout specification | 4–6, 8–13 | PB1-07, PB1-12–13, PB1-22, PB1-32–33 |
| §5 declarations, validation and explicit discovery | Layout specification, including the adopted nested-tree grammar | 1–3, 7–8, 12 | PB1-01–06, PB1-11, PB1-21 |
| §6 boundary imports and package provenance | [Importability principles](../../model/cross-module-importability.principles.md), importability/source specifications | 9–11, 13 | PB1-14–16, PB1-24 |
| §7 always exclusions, scratch and Git advisory warning | Layout specification, [CLI invocation](../../architecture/cli-invocation.spec.md), [daemon architecture](../../architecture/daemon.md) | 3, 7–8, 12, 15–17 | PB1-09–11, PB1-20, PB1-23, PB1-26 |
| §10 Ramify outputs, root selection by the root marker and unchanged production selection | CLI invocation, [architect specification](../../architecture/architect-view.spec.md), [architect principles](../../agents/module-architect.principles.md), [API-view specification](../../architecture/materialized-api-view.spec.md) | 14–18 | PB1-17–31 |
| §12 decision 14, the root marker (R7) | Layout specification (module line, discovery and validation), CLI invocation (selecting the project), [glossary](../../model/glossary.md) (root marker, module header) | 3A, 3B, 8, 17, 19 | PB1-05–06, PB1-30, PB1-41–44 |
| §11 toolkit migration, with the harness owned-ignored per decision 13 | Layout/importability specifications and toolkit [testing guide](../../development/testing.md) | 5–8, 19 | PB1-32–34 |
| Master full-audit/direct fallback and reference gates | [Master plan](../project-boundary-sequential/main-plan.md), committed toolkit audit definition, [testing guide](../../development/testing.md) | 1, every gate, 20–21 | PB1-35, PB1-38 |
| Master written topology, local artifact and later registry pins | Master and [handoff](handoff.md) | 14, 20–21 | PB1-36, PB1-39–40 |

The source model retains ordinary versus testing classifications and exposure
channels. Ownership, analysis coverage, affected selection, test execution and
harness write authority remain separate. The provider exports facts; it never
interprets a Vitest configuration, implements audit policy or authorizes writes.

Specifications updated in iteration 1 contain adopted behavior identified as
implementation pending. Runtime guides and status claims advance only after
their producing slice passes. CLI, daemon, materialized-view and measurement
specifications must agree with the new report shapes; plans and old historical
receipts are not rewritten as evidence of new behavior.
