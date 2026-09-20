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
`provider-conformed`, `requirement-verified`, `revision-needed` and
`evidence-reopened`. Ordinary provider engineers gain the `unsuitable` reason
`provider-cannot-conform`; contract engineers do not receive it.

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

Only `ContractSubmission.established` followed by a passing contract gate registers.
For an initial agreement, `contract-registered` commits
the `ContractRecord`, one `ProviderObligation` keyed `ob-<contract-id>` at the
contract's revision, and one `ConsumerRequirement` per consumer, with scheduling
bindings and the provider work item. An access-only agreement creates neither
an obligation nor fake-backed requirements. Registration and scheduling are
keyed by `(obligation, revision)` and `(requirement, revision)`: a registration
already in the log is not appended again. Attaching another consumer to an
existing agreement adds only its requirement and binding, reusing the current
provider work or conformance.
`ContractSubmission.incomplete` registers nothing.

### Scheduling

Depth-first. The consumer finishes what it can against the fake and submits
`yield-for-providers` at an iteration boundary, which appends
`work-item-yielded` with the requirements waited for. The harness runs the
provider work items of those requirements before the next independent entry work
item; each provider is an ordinary work item with its own local architect. A
shared obligation has one provider execution per revision and each consumer
verifies separately. `work-item-resumed` occurs when all providers the consumer
waits for have conformed at the current contract revisions. It licenses the
consumer architect to assign verification while the requirements are still open;
waiting for `requirement-verified` before resuming would deadlock.

A cycle is a cycle of **capabilities**, never of modules or changes. The graph's
nodes are capabilities: a requirement adds the edge from its `forCapability` to
the capability of its obligation, and the graph is checked when a requirement is
committed. A new provider obligation starts a work item of its own, even in a
module that has one yielded, so change 1 in module A needing change 2 in module
B needing change 3 in module A completes in the order 3, 2, 1 with no cycle and
no notice; a test shows it. A capability that transitively depends on itself
appends
`dependency-cycle-detected` with its members and the work item that closed it,
and returns to that work item's local architect as a finding at its next turn.
The same cycle detected again, or `cycleReplansPerWorkItem` spent, fails the run
with `dependency-cycle` and the cycle as evidence. Every detected cycle is a
notice in `RunSnapshot.notices`, resolved or not, so the person is told.

An ordinary provider engineer may submit `unsuitable` with
`provider-cannot-conform` only when its assignment carries a real-provider
obligation. The harness derives that obligation from the assignment, settles the
writer, closes the iteration as `unsuitable` and records `revision-needed`, once
per obligation revision. It delivers the report to the consumer architect that
requested this provider work, even while that consumer is yielded. The architect
assigns a contract revision or submits `unresolved`. The existing agreement stays
unchanged until the revision passes its contract gate and is registered. An
unrelated engineer or contract engineer using this reason is rejected by the
submission validator; it is not parsed from free text.

### Verification

The provider's gate runs the agreed conformance suite against the **real**
provider and appends `provider-conformed`. The consumer then gets a
`verification` iteration: replace the fake and rerun its behavioral tests.
`requirement-verified` is the only event that closes a delegation, and it
requires that no `fakeInjections` location still references the fake.
Fake-backed completion never completes the capability.

### Contract revisions

Implement the proposal's
[contract revision and follow-up work](../core-records.proposal.md#contract-revision-and-follow-up-work)
as one scheduling path, including its record revisions and idempotency keys.
The consumer architect assigns kind `contract` with `revisesContract` naming
the current agreement and its revision rationale in `approach`; this direct
assignment needs no `requestedBy`. The harness fills the next revision only
after the contract gate passes.

One `evidence-reopened` transaction registers the new contract, obligation and
requirement revisions together with all work bindings. Unfinished items receive
current evidence at their next coordination point; their old unfinished
assignments other than the revision-establishing iteration close as `superseded`
after settlement. Completed items remain completed and get follow-up work:
provider items name the revised obligation;
consumer items name the revised requirement. `follows` preserves the link to
the prior completed item. Their fresh local architects receive the prior work
and current evidence. Work-item completion checks the current bindings, so a
follow-up cannot close before its assigned verification passes. The final gate
waits for these follow-ups and for every latest requirement revision. Replay restores the same bindings and work
IDs without duplicates. No arbitrary source change triggers this path: an
explicit contract revision does.

## Acceptance cases owned

| # | Case | Evidence |
| --- | --- | --- |
| P1 | One consumer delegates, resumes after provider conformance and verifies against the real provider | The review-notes fixture: provider-conformed precedes work-item-resumed while the requirement remains open; the consumer then replaces its fake and requirement-verified closes the delegation |
| P2 | Fake files, exports and re-exports remain unmistakable, and architectural evidence does not present them as production behavior | The gate rejects a file without `.fake`, an export without `Fake` and a re-export that drops the designation; the architect view of the accepted state shows the fake under its fake name |
| P3 | A contract revision reschedules current evidence without resetting completed work | Within an active run, complete revision 1 with two consumers, register revision 2, restart after evidence-reopened, then finish one provider follow-up and both consumer follow-ups. Earlier completions remain historical, old evidence cannot satisfy revision 2, and replay and repeated registration duplicate nothing. A second case revises unfinished items and supersedes their old assignments |
| P4 | An ordinary provider engineer reports inability to conform through its own submission union | A real-provider engineer submits unsuitable/provider-cannot-conform; revision-needed reaches the waiting consumer architect once, followed by a contract revision assignment. The old contract stays unchanged until registration. The same reason from unrelated or contract engineers is rejected |
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
- A cycle, a shared obligation and a provider engineer's `revision-needed` each
  reaching their recorded outcome through validated submissions.
- Complete revision 1 with two consumers, revise the contract, restart after
  `evidence-reopened`, and complete revision 2 with one provider follow-up and
  two consumer follow-ups. Earlier items stay completed; stale evidence cannot
  satisfy revision 2 and replay creates no duplicate work.
- Revise while provider and consumer items are unfinished: supersede their old
  assignments, reuse those items with current evidence, and finish the run.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
