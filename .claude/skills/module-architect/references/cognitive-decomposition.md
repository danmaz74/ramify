# Cognitive decomposition decision model

Use the module tree as recursive abstraction. The purpose of another boundary
is to reduce the concepts, invariants, implementation details, and relationships
that must be understood together. Moving files does not reduce local complexity
when correct reasoning still requires their implementation knowledge.

## Preserve simplicity

Keeping the current structure is always a candidate. Several related
capabilities may remain together when their combined local complexity is
manageable. A named responsibility, a large task, file count, code size, or
task duration does not by itself justify another module.

Introduce a boundary only when current or concretely anticipated complexity
warrants it and the abstraction reduces total cognitive burden. Count the new
concept, contract, navigation, and coordination costs against that benefit.
Speculative growth is weak evidence.

## Distinguish the alternatives

- An existing module can own several cohesive capabilities when implementing
  them requires closely related knowledge.
- A child hides implementation complexity within its parent's responsibility.
  The parent still owns the subtree's externally visible responsibility and
  decides what received behavior to re-expose.
- Siblings are peer responsibilities under a common parent. Their coordination
  belongs at that common level.
- A new higher-level module is justified only when neither an existing
  responsibility nor a child or sibling arrangement expresses the ownership.

Work decomposition is not module decomposition. Iterations may divide a large
task without creating durable architectural boundaries.

## Place contracts

Apply [Contracts Follow Responsibility](../../../../docs/agents/module-architect.principles.md#contracts-follow-responsibility)
when choosing a contract's owner. Distinguish authority to revise the agreement,
ownership of its source, and responsibility for implementing it; these roles
need not coincide.

| Contract | Placement candidate | Responsibility to establish |
| --- | --- | --- |
| Provider API | The capability's owner | Define the promise and demonstrate that its implementation fulfills it. |
| Consumer-defined port | The consumer's responsibility, possibly in a child | Define the required behavior and the conformance expected of adapters. |
| Peer agreement | The common coordinating owner | Maintain an agreement neither participant may revise unilaterally. |
| Independent protocol | A dedicated protocol owner | Govern versions and compatibility across independently evolving implementations. |
| Shared domain vocabulary | The owner of its meaning and invariants | Maintain domain rules; determine whether validation or other behavior warrants a boundary. |

Ask:

1. Who determines the contract's meaning and may revise it?
2. Which contract, implementation, consumer and conformance tests ordinarily
   change together? Which changes should leave the contract stable?
3. What knowledge would a separate boundary let consumers or the parent stop
   understanding? What knowledge and coordination would still cross it?
4. Could an ordinary exposed file or same-owner `src/interfaces/` area provide
   the same discoverability and import separation without another owner?
5. Who receives a contract-change work item, and what evidence lets that owner
   judge its responsibility complete? Which implementation obligations remain?

Locality means a coherent responsibility and engineering scope, not necessarily
one file. Colocation can simplify coordinated changes, but it must preserve a
stable public promise when only implementation details change. Compare its
increase in local context with the knowledge a separate module actually hides.

A schema module can own meaningful validation or compatibility behavior;
mostly containing definitions does not disqualify it. Conversely, multiple
consumers or implementations do not alone establish independent authority.
For example, a versioned plugin protocol may warrant a separate owner when
that owner maintains compatibility rules and a conformance suite for independently
released providers. State that responsibility and evidence explicitly.

## Evaluate a proposed boundary

Ask:

1. What current or concretely anticipated complexity requires attention?
2. Which shared concepts, invariants, state, and implementation relationships
   justify keeping responsibilities together?
3. What contract types, ordering, shared state, errors, and other assumptions
   must cross each proposed boundary?
4. What knowledge can the parent stop understanding after the change?
5. Can each child be understood from its internals and received contracts
   without routinely inspecting siblings?
6. Do ordinary changes tend to stay on one side, or repeatedly require
   coordinated inspection and modification?
7. Does the reduction in implementation knowledge outweigh the additional
   abstractions, contracts, navigation, and coordination?
8. Does the arrangement improve reasoning across recurring tasks, rather than
   only the task that prompted it?

Use project evidence to support the answers. Context size, connectedness,
dependencies, interface use, and history are investigation signals, not direct
measures of cognitive complexity. Preserve their scope, coverage, and
provenance. Evaluate cohesion and coupling within each child, across the
parent's composition, and between the subtree and the surrounding application;
keep exact-owner and subtree measurements separate.

An established architectural pattern may provide a candidate structure only
when its applicability and limits fit the project. Load one relevant, validated
worked pattern when available; never load or apply an entire pattern catalog by
default. A pattern name alone is not a justification.
