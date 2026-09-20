# Additional points to evaluate

**Status:** Working notes

Points that the [harness principles](harness.principles.md) do not cover but should be evaluated for potential adoption AFTER a decision is made. Don't consider them valid, just hypotheses.

None is adopted by being listed here.

## Candidates for the principles

### Who confirms that work is done

The principles do not say how a completed iteration is verified. Either the
harness runs the tests, build and typecheck itself and records the pass or
fail result, or it accepts the agent's report. Running the checks is not a
semantic decision, so the rule that agents make every semantic decision does
not settle it. This is the largest gap.

### Human approval of the architecture plan

The principles say that structural changes are approved by a person. They do
not say whether a person reviews the implementation map before implementation
starts.

### Nobody changes a contract unilaterally

The principles state this only for the integration agent. The broader rule:

- a provider may not weaken the conformance tests of a seam;
- a consumer or provider with evidence against a contract reports it, and the
  change is made by a new contract iteration;
- a contract iteration changing an existing interface considers the
  interface's other consumers.

### Read scope and write scope are separate

A contract iteration reads both sides of a seam, and every existing consumer
of a capability it extends, and writes only the contract and its integration
in the requesting consumer. The integration agent reads a whole subtree and its changes in
descendants are bounded. The principles describe what an agent sees and may
change as one scope.

### A need that cannot be satisfied as specified

The discovery table has no row for this kind. The harness does not resubmit
the unchanged request to fresh agents. It records the evidence, and the
requirement or the contract changes one level above.

### Friction feeds architectural learning

Repeated discoveries on the same seam, dependency cycles, scopes that prove
too large and integration corrections that are not small should lead to a
proposed architecture review. The principles adapt at the task level only.

### What a need contains

A need has use cases, representative input and output, side effects and
constraints. It is executable where possible, as a failing test or a
reproducer. It never contains the requester's whole context, a proposed
interface for the provider or a nominated owner.

### What a task brief contains

A brief has the objective, constraints, acceptance criteria and the known
external interfaces, given as exact paths into the module's generated API
view so the engineer does not rediscover them. This is how reuse findings
reach the engineer. Availability permits discovery and use; it is not a
reason to preload an interface into an agent's context.

### Iteration goals state outcomes

A goal names no files, classes or algorithms, and it can be verified.

## Tensions in the principles

- **Failing tests and coherent states.** A blocked agent leaves a failing
  test, while each iteration should end in a verified state. A recorded need
  must remain in the repository without breaking the checks, for example as a
  test marked as expected to fail.
- **Parallel work.** The principles are silent on it. Once the consumer has
  validated a contract against its fake, the provider's work and the rest of
  the consumer's work could proceed at the same time.
- **Who writes the conformance tests.** Settled by the contract iteration: the
  consumer's engineer writes the spec, its behavioral tests and a provisional
  stub; one contract iteration then writes the interface, the conformance
  tests and the fake, and integrates them in the consumer.
- **Exposure within the agent's own scope.** An exposure path lying entirely
  within the agent's subtree could be approved by policy without an architect
  decision. The discovery table says the architect always proposes it.
- **Integration fallback.** Bounded corrections have no stated consequence.
  Exceeding the bound should fall back to delegation and count as friction.
- **Origin of feature-level tests.** Completion of integration depends on
  them, but nothing says the implementation map produces them.

## Material for other documents

### Architect skill

- A reuse finding can be partial: extend the existing provider.
- Cluster capabilities into responsibilities before assigning an owner.
- Before proposing a new module, test three hypotheses: an existing module's
  purpose is incompletely described; the capability is composite and belongs
  to several existing owners; the responsibility is new.
- Send close alternatives to a person.
- Read the decomposition pattern of the candidate parent's existing children.
- When implementation evidence is needed, ask a scoped engineer instead of
  loading source.

### Temporary doubles

- Fake only the missing part and delegate the rest to the real provider.
- Use a narrow contract type owned by the consumer.
- Conformance tests state observable behavior, not interaction assertions.
- The same suite passes unchanged against the real provider.

### Controller

- Deduplicate outstanding needs.
- Detect cycles among waiting work; replan a cycle at the common ancestor.
- A changed implementation map has an identified revision, and every brief names the
  revision it came from.
- Test the riskiest assumption first with a small scoped spike.

### Runtime independence

- Thin adapters over existing coding agents; never an agent loop of our own.
- The prompts for each role are part of the architecture.
- Per-runtime hook setup belongs to the adapter.

### Project environment

- Per-module agent instructions with trigger rules: search the API view before
  broadening a search and before implementing anything generic; start the
  agent in the module's `src/`.
- Documentation lives at the narrowest module it governs, and cross-module
  documentation at the common ancestor, with a generated root view for global
  browsing.

### Autonomy policy

A policy finer than approval by a person: a low-risk internal change, such as
extracting a private child with no contract change, could be autonomous. New
exposure between branches, reparenting and contract changes are not.

### Measurements

Candidates for [measurements and KPIs](measurements-and-kpis.md): solve rate,
maximum context per agent, total tokens, unnecessary file reads, violations
and hand-off failures.

### Candidate Ramify features

- Architectural history derived from changes to `module.ramify` files.
- Dry runs of candidate placements.
- Access explanations for hypothetical imports.

## Superseded on purpose

- Suspended sessions with forked notes to self.
- Iteration counts fixed in advance.
- Agents forbidden from changing descendants.
- Consumer-authored contracts as the default, meaning a contract the consumer
  writes from its own side alone. The contract iteration is carried out by an
  engineer on the consumer's side, but it is not that: it must read the
  provider and the existing consumers, record what it read, and produce
  conformance tests, and the provider may report that the contract needs
  revision.
- The contract engineer as a separate role. A contract iteration is a kind of
  iteration that an engineer carries out with the contracts skill.
- Requests climbing the tree one parent at a time.
