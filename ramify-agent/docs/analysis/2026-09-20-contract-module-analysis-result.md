# When should a contract be a module? Result

**Date:** 2026-09-20. **Status:** result note for the
[analysis brief](2026-09-20-contract-module-analysis-brief.md). It records what
the analysis established and what it did not, so that
[Plan 3](../plans/03-autonomous-implementation-loop/main-plan.md) has a stated
input instead of an open reference.

## What was established

The analysis produced its two proposed texts, and both are in the toolkit's
working tree, uncommitted on this date:

- **The principle**, *Contracts Follow Responsibility*, in
  [the module-architect principles](../../../docs/agents/module-architect.principles.md#contracts-follow-responsibility):
  place a contract with the responsibility that governs its meaning. A
  capability's public contract normally belongs with its implementation. A
  consumer-defined port belongs with the consumer. A separate contract module
  needs an independent agreement, a compatibility responsibility or an
  abstraction benefit that outweighs its navigation and coordination costs.
  Sharing alone does not justify separation.
- **The skill guidance**, a contract-placement table in the module-architect
  skill's cognitive-decomposition reference, which distinguishes a provider API,
  a consumer-defined port, a peer agreement, an independent protocol and a
  shared domain vocabulary, and separates the authority to revise an agreement,
  the ownership of its source and the responsibility for implementing it.

**Consequence for ramify-agent: Plan 2's target structure stands.** The harness
accepted and persisted the implementation map, which Plan 3 now removes, and
implements the HTTP service, so it had authority over both contracts, and the web is its client. That is the provider
API case. Plan 2 was executed unchanged, and its
[results](../plans/02-contract-authority-refactor/iterations/iteration1-results.md)
record its completion gate.

## What Plan 3 takes from it

- The harness owns its public protocol, and Plan 3 extends it in place, in
  `src/interfaces/protocol/`. No neutral definitions module is created.
- When a run places a contract, its `ContractRecord.authority` names one of
  `provider`, `consumer` or `independent` with the owner and a rationale, which
  are the cases the guidance distinguishes. A peer agreement and an independent
  protocol both record as `independent`, with the rationale saying which.
- A contract's location follows that authority. An interface having several
  users is not a reason for a separate module.

## What was not done

The brief asked for one report with a finding on the original concern, a
five-case comparison with implementation-model traces, a decision procedure and
a list of unverified areas. That report was not written. The principle and the
guidance above are the analysis's conclusions without its recorded evidence.

None of the missing parts is a prerequisite of Plan 3: the plan needs the rule
for placing a contract and the confirmation of Plan 2's structure, and it has
both. The comparison of cases would matter again if a run proposes a separate
contract module; that proposal's placement decision then carries the evidence
the principle asks for.
