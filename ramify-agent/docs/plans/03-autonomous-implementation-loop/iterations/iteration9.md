# Iteration 9: Contract delegation and provider obligations

**Goal:** an engineer that needs behavior outside its scope gets a contract
sub-session; the harness registers one provider obligation; the provider work
item satisfies it; and only verification against the real provider closes the
delegation.

## Prerequisites

Iterations 6, 7 and 8: assignments, the write guard, gates and placement
decisions.

## Write scope

`subs/harness/src/contracts/`, `subs/harness/src/work/` (the scheduler, yield
and resume), `subs/harness/src/checks/` (the `contract` checkpoint and evidence
obligations), `subs/harness/src/prompts/` (the contract skill), and the fixture
plan `fixtures/collection-review/plans/review-notes/` is used but not edited.

## Interfaces consumed and established

Consumed: `IterationAssignment`, `WriteScope`, `GateAttempt`,
`PlacementDecision`, `RegistryEntry`, the guard.

Established: `ContractRecord`, `ProviderObligation`, `ConsumerRequirement`, the
`ContractSubmission` union, the `EngineerSubmission` member `contract-needed`
with `NeedAsBehavior`, the `LocalArchitectSubmission` member
`yield-for-providers`, and the run-log events `contract-requested`,
`contract-registered`, `work-item-yielded`, `work-item-resumed`,
`provider-conformed`, `requirement-verified` and `evidence-reopened`.

## Work

### Requesting a contract

An engineer submits `contract-needed` with the need written as behavior: use
cases, inputs, outputs, side effects, constraints and existing executable
evidence. Its turn ends there; no nested live session is started. The harness
resolves the owner from the registry, asking the global architect first when the
placement is shared or uncertain, then commits a `contract` `IterationAssignment`
whose `requestedBy` names the engineer's iteration. That assignment is a
committed record, so a caller that dies discovers the outcome without the
original reply.

### The contract sub-session

An engineer invocation with the contract skill, not another persona. Its scope
is read and write on the requesting consumer, read and write on the selected
contract, conformance tests and fake, read on the provider or the requested
capability, read on existing consumers when extending, and explicitly scoped
exposure-declaration writes. The caller's writes are suspended: one
implementation writer at a time, including sub-sessions.

Contract placement follows authority, as the contract-authority rule requires:
a capability's public contract belongs with its implementation, a
consumer-defined port with the consumer, a peer agreement at the common
ancestor. `ContractRecord.authority` records which and why. Mere reuse never
creates a neutral definitions module.

The session designs the interface, writes the conformance tests and the fake,
integrates the fake in the consumer and fixes consumer and fake failures until
the consumer's relevant tests pass against the fake and the fake passes the
conformance suite. Existing behavior stays real. It does not implement the
provider and does not modify unrelated consumers.

For an existing capability that needs only an exposure change,
`mode: 'access-only'` establishes access and integrates the real behavior: no
fake, no obligation.

### Fake naming

The `contract` gate verifies the
[fake-naming rule](../../../harness.principles.md#fakes-are-explicitly-named):
a fake file uses `.fake` before the language extension, an exported fake
implementation, factory or class contains `Fake`, and a re-export preserves the
designation. The shared contract keeps its behavior-oriented name. A violation
fails the gate, so generated architectural evidence never presents a fake under
a production-looking name.

### Registration

Only `ContractSubmission.established` registers. `contract-registered` commits
the `ContractRecord`, one `ProviderObligation` keyed `ob-<contract-id>` at the
contract's revision, and one `ConsumerRequirement` per consumer. Registration is
keyed by `(obligation, revision)` and by `requirement`: a registration already
in the log is not appended again.
`ContractSubmission.incomplete` registers nothing.

### Scheduling

Depth-first. The consumer finishes what it can against the fake and submits
`yield-for-providers` at an iteration boundary, which appends
`work-item-yielded` with the requirements waited for. The harness runs the
provider work items of those requirements before the next independent entry work
item; each provider is an ordinary work item with its own local architect. A
shared obligation is one obligation with several requirements: its provider work
item runs once and each consumer verifies on its own.

A cycle is a cycle of **capabilities**, never of modules or changes. The graph's
nodes are capabilities: a requirement adds the edge from its `forCapability` to
the capability of its obligation, and the graph is checked when a requirement is
committed. A provider obligation always starts a work item of its own, even in a
module that has one yielded, so change 1 in module A needing change 2 in module
B needing change 3 in module A completes in the order 3, 2, 1 with no cycle and
no notice; a test shows it. A capability that transitively depends on itself
appends
`dependency-cycle-detected` with its members and the work item that closed it,
and returns to that work item's local architect as a finding at its next turn.
The same cycle detected again, or `cycleReplansPerWorkItem` spent, fails the run
with `dependency-cycle` and the cycle as evidence. Every detected cycle is a
notice in `RunSnapshot.notices`, resolved or not, so the person is told. A provider that reports
`provider-cannot-conform` returns `revision-needed` to the consumer's local
architect, bounded by the work item's limits, and leaves the `ContractRecord`
untouched.

### Verification

The provider's gate runs the agreed conformance suite against the **real**
provider and appends `provider-conformed`. The consumer then gets a
`verification` iteration: replace the fake and rerun its behavioral tests.
`requirement-verified` is the only event that closes a delegation, and it
requires that no `fakeInjections` location still references the fake.
Fake-backed completion never completes the capability.

A new `ContractRecord` revision appends `evidence-reopened` for the obligation
and every requirement on it; completion evidence names the revision it
satisfied, so stale completion cannot be reused.

## Acceptance cases owned

| # | Case | Evidence |
| --- | --- | --- |
| P1 | One consumer performs one real delegation, works against a named fake, registers the provider once, implements it and verifies on return | The `review-notes` fixture driven by the scripted agent: `contract-registered`, one obligation, `provider-conformed`, `requirement-verified` |
| P2 | Fake files, exports and re-exports remain unmistakable, and architectural evidence does not present them as production behavior | The gate rejects a file without `.fake`, an export without `Fake` and a re-export that drops the designation; the architect view of the accepted state shows the fake under its fake name |
| P3 | Duplicate obligation registration is idempotent; a changed contract revision reopens implementation and conformance evidence | A repeated registration appends no second line; a new revision leaves the obligation and every requirement open |
| P4 | A provider that cannot implement the agreement reports a revision need rather than changing the contract | `provider-cannot-conform` returns `revision-needed` and the `ContractRecord` is unchanged |
| P5 | Shared obligations and at least one cycle or unresolvable dependency reach a deterministic outcome | One obligation with two requirements runs its provider once and verifies each consumer separately; a module chain A, B, A over three capabilities completes with no notice; a constructed capability cycle appends `dependency-cycle-detected`, returns to the local architect and appears in `RunSnapshot.notices`; the same cycle detected again fails the run with `dependency-cycle` |
| K4 | Fake and real-provider conformance obligations are both enforced | The contract gate runs the conformance suite against the fake; the provider gate runs the same suite against the real provider; neither substitutes for the other |
| X1b | A contract sub-session threshold returns incomplete and registers nothing | An `incomplete` submission commits no `ContractRecord` and no obligation, and its caller accounts for the partial work |

## Guards owned

| Guard | Test |
| --- | --- |
| A requirement whose fake is still injected is not verified | `subs/harness/src/tests/requirement-verification.test.ts` |

Plus the cross-cutting JSON rule for `ContractSubmission`, `contract-needed` and
`yield-for-providers`.

## Exit evidence

- The `review-notes` fixture run end to end on the scripted agent: one
  delegation, one obligation, one provider work item, one verification.
- A restart after `contract-registered` recovers with exactly one obligation and
  one requirement, and the caller discovers the finished sub-session from the
  records without its original reply.
- The evidence obligations of an assignment are visible before execution, and an
  engineer cannot remove one or weaken the contract to obtain a pass.
- A cycle, a shared obligation and a `revision-needed` each reaching their
  recorded outcome.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
