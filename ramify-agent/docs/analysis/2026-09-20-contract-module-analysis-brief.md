# Analysis brief: when should a contract be a module?

**Date:** 2026-09-20. **Status:** ready for analysis. This brief authorizes
investigation and recommendations, not source refactoring or changes to the
principles documents.

Terminology follows the [metrics glossary](../metrics/glossary.md): cognitive
complexity here means local cognitive complexity at the compared abstraction
levels. It is assessed qualitatively. Inventory context-size measurements are
counts and bytes, not model context usage or delivered change volume.

## Question

When does placing contracts in a separate Ramify module reduce total cognitive
complexity, and when does it merely create another owner, dependency path and
coordination point?

Produce a general rule that can guide module architects and the autonomous
implementation harness. Test the rule against the current ramify-agent
`contracts` branch and against materially different contract arrangements.

## Motivation

The current ramify-agent tree places implementation-map and HTTP protocol
definitions in globally relayed `contracts/map` and `contracts/protocol`
modules. The harness implements the behavior those definitions describe, while
the web consumes it. The parent `contracts` module owns no source or behavior.

The concern is:

> A definitions-only contract module can add architectural dependencies without
> producing a commensurate reduction in cognitive complexity.

That statement is plausible but must not become an absolute rule. A separately
owned contract may be justified when it has independent authority, versioning,
compatibility behavior, multiple implementations, or enough hidden knowledge to
reduce the reasoning burden of its consumers. The analysis must identify the
difference.

## Concepts to keep separate

Do not use raw dependency counts as the conclusion. Distinguish:

- **Semantic dependency:** a consumer inherently depends on another behavior or
  agreement.
- **Source dependency:** one source owner imports another owner's symbols.
- **Exposure dependency:** a public name reaches a consumer through module
  declarations and ancestor re-exposure.
- **Knowledge dependency:** correct work requires understanding another module's
  concepts, invariants or implementation details.
- **Coordination dependency:** a change requires decisions or synchronized work
  by several owners.

Also distinguish:

- the capability owner;
- authority to revise the contract;
- the physical owner of the contract artifact;
- the module implementing the behavior;
- modules implementing adapters or alternative providers;
- consumers and the evidence that establishes their compatibility.

These roles may coincide, but the analysis must not assume they always do.

## Hypotheses to test

1. **Natural authority is the default.** A provider-owned public API normally
   belongs with the provider; a consumer-defined port normally belongs with the
   consumer.
2. **Sharing is insufficient.** Several consumers importing the same definitions
   does not by itself justify a new module.
3. **Every boundary must pay for itself.** A module is justified only when the
   knowledge, change or governance independence it creates outweighs its new
   contract, navigation, exposure and coordination costs.
4. **A module needs a natural work source.** A useful module has capability-level
   reasons to change and an authority that can judge completion. A module
   modified only as a side effect of work owned and validated elsewhere is
   suspect.
5. **Independent contracts are possible.** A protocol or standard with its own
   compatibility behavior, lifecycle or interchangeable implementations may be
   a legitimate module even when it contains mostly schemas and validation.
6. **Physical movement is not enough.** Moving definitions into an owner's
   source can eliminate module edges while increasing that owner's local search
   space. The comparison must assess total cognitive burden, not module count.

The final answer may confirm, narrow or reject any hypothesis.

## Cases

Analyze at least these cases.

### Case A: ramify-agent's current contract repository

Inspect `ramify-agent/contracts`, `contracts/map` and `contracts/protocol` using
the generated architect view, module declarations, requester API views and only
the focused source needed to establish behavior and imports.

Compare these candidate structures:

1. The current neutral parent and two contract children.
2. Harness-owned files under `harness/src/interfaces/`, as proposed by
   [Plan 2](../plans/02-contract-authority-refactor/main-plan.md).
3. Children beneath `harness` that own both a contract and a coherent part of
   its implementation.
4. Any better evidenced alternative.

Determine whether the current children reduce enough context or hide enough
knowledge to justify a boundary, even if their present parent and ownership do
not.

### Case B: a consumer-defined port

Use ramify-agent's agent port, or another evidenced example, where a consumer
defines the behavior it needs and scripted and real adapters implement it.

Explain why the consumer can be the natural contract authority even though a
provider implements the interface. Show who changes the port, fake, adapters
and conformance evidence for a compatible extension and for a breaking change.

### Case C: a provider-owned public API

Use an evidenced API with one behavioral owner and one or more consumers.
Compare exposing the owner's contract directly with placing the same definitions
in a neutral shared module. Identify which knowledge and dependencies each
arrangement removes or adds.

### Case D: an independently governed contract

Find an evidenced example if one exists. Otherwise construct a minimal, clearly
labelled hypothetical example such as a versioned plugin protocol implemented
by several independent providers and consumed outside their ownership tree.

State what capability the contract module itself owns, what tests establish it,
who may revise it and how implementations demonstrate conformance. This case
must explain when a separate contract module is warranted.

### Case E: shared domain vocabulary

Examine a module containing shared types, schemas or value objects without an
obvious behavioral implementation. Determine whether it owns validation or
domain invariants, represents an agreement at a common ancestor, or is only a
definitions repository. The collection-review example's `contracts` module is
a candidate, but use it only if its current evidence is complete enough.

## Exercise the implementation model

For every case, trace who acts and when for these scenarios:

1. Reuse without changing the contract.
2. Add a backward-compatible behavior for one new consumer.
3. Add a backward-compatible behavior shared by several consumers.
4. The selected provider reports that the proposed contract cannot be
   implemented as written.
5. The requested feature intentionally requires a breaking contract change.

Name, for each scenario:

- which capability and module receive the work item;
- which local architect plans it;
- whether a global placement decision is required;
- who invokes and performs a contract sub-session;
- which files that session may write;
- which provider obligations result;
- which consumer and conformance tests decide completion;
- what happens to previously completed evidence after a revision.

If a candidate structure cannot answer these questions without inventing an
authority outside its module responsibilities, record that as evidence against
the structure.

## Evaluation

For each candidate boundary, answer:

1. What capability-level responsibility does the module own?
2. What current or concretely anticipated complexity requires separation?
3. What implementation knowledge can each consumer stop understanding?
4. What names, invariants, errors, state and ordering cross the boundary?
5. Does the module constrain access or expose essentially everything globally?
6. Can its local architect judge a work item complete from that module's
   responsibility and evidence?
7. Do ordinary changes remain on one side, or require coordinated changes to
   the contract, implementation and consumers?
8. Does the boundary replace a more expensive knowledge dependency, or only
   add source and coordination dependencies?
9. How do exact-owner and subtree inventory context sizes change under each alternative?
10. Would a directory, same-owner `src/interfaces/` area or ordinary exposed
    file provide the same benefit without another module?

Treat inventory context size, dependency counts and changed-file history as evidence, not
as a composite health score. Preserve revision, scope and coverage. Do not turn
unknown or unavailable measurements into zero.

## Evidence method

1. Refresh and read the relevant `.ramify-architect/_meta.json` before using the
   view. Record its revision, input identity and coverage.
2. Use architect records for discovery, responsibility, dependencies, tests and
   exact/subtree measurements.
3. Materialize ordinary requester API views from the same project state before
   making access claims. Keep testing access separate.
4. Read module declarations and focused source only where generated evidence
   cannot establish contract authority, runtime behavior or change coupling.
5. List every source file read and every inference not directly established by
   generated evidence.
6. Do not read historical `.superseded/` material.

## Required output

Write one analysis report containing:

1. **Finding on the concern.** State whether the original affirmation is true,
   false or true only under stated conditions. Explain which dependency costs
   and complexity reductions matter.
2. **Contract-ownership taxonomy.** Distinguish provider APIs,
   consumer-defined ports, peer agreements, independent protocols and passive
   definition repositories.
3. **Case comparison.** Give evidence and the implementation-model trace for
   every case above.
4. **Decision procedure.** Provide a short sequence a module architect can use
   when encountering or proposing a `contracts` module.
5. **Principle text.** Propose a concise addition to
   `docs/agents/module-architect.principles.md`. Do not edit that document as
   part of the analysis.
6. **Skill guidance.** Propose any operational questions that belong in the
   module-architect cognitive-decomposition guidance without duplicating the
   principle.
7. **ramify-agent consequence.** Confirm, revise or reject the target structure
   and assumptions in Plan 2. Identify any change required before that plan is
   executed.
8. **Unverified areas.** Separate missing evidence, analysis limits and
   hypothetical examples from established findings.

## Completion criteria

The analysis is complete when:

- it evaluates both the costs and possible benefits of contract modules rather
  than assuming the conclusion;
- at least one legitimate separate-contract case and one unjustified repository
  case are compared;
- every recommendation names contract authority, behavioral implementation and
  completion evidence;
- the implementation model can assign each contract change to an actor and a
  module work item without ambiguity, or the ambiguity is reported as a design
  defect;
- the proposed principle is general enough for Ramify projects and does not
  encode ramify-agent's current directory names;
- its ramify-agent recommendation is concrete enough to decide whether Plan 2
  should proceed unchanged.

No source, module declaration, principle or implementation-plan change is part
of this brief's execution. Those are separate reviewed follow-ups.

