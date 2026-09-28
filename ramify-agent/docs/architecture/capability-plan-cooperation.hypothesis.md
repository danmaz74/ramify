# Architecture hypothesis: cooperation through a capability plan

**Date:** 2026-09-27. **Status:** Architecture hypothesis for discussion and
experimentation. No implementation or validation of this workflow is claimed.

## Hypothesis

A good interface and a good implementation can emerge through cooperation
around a shared, revisable capability plan. The plan connects the consumer's
need, architectural negotiation, provider implementation and consumer
verification while each agent retains a small context centered on its module.

Interface design, tests and implementation develop iteratively. Agreement on a
design permits an implementation attempt; evidence from that attempt can reopen
the design. The plan remains active until the real implementation satisfies the
consumer's need and the applicable provider and compatibility guarantees.

The motivating concern is that the current approach depends too heavily on
establishing the interface and its tests before provider implementation. The
[contract-engineer investigation](../analysis/2026-09-26-contract-engineer-replay.md)
and [acceptance analysis](../analysis/2026-09-26-contract-engineer-acceptance.md)
describe incomplete discovery, compatibility problems, weak executable evidence
and fragmented repair. Passing tests alone can leave requirements untested or
encode an incorrect expected answer. This hypothesis explores cooperation and
feedback from implementation as a way to improve those results.

## Participants and the two outputs

Let **A** be the consumer module and **B** the proposed provider module. Let
**X-capability plan** denote the shared plan for the behavior A needs; its final
name and storage format are undecided.

| Participant | Knowledge and responsibility |
| --- | --- |
| A-engineer | Knows the immediate need, actual calling code and examples; starts the plan, reviews whether the interface is usable, and integrates the real result. |
| A-architect | Understands A's broader architecture; investigates existing capabilities, proposes placement and an interface, negotiates with B, and coordinates consumer acceptance. |
| B-architect | Understands B's architecture and other consumers; reviews and revises the proposal, then plans and coordinates implementation within B. |
| B-engineer | Implements and tests the capability under B-architect's supervision, reporting implementation discoveries that may require revising the plan. |

The two outputs have connected review loops:

- **A good interface:** A-architect and B-architect develop the proposal, with
  A-engineer reviewing its practical use and implementation findings informing
  revisions.
- **A good implementation:** B-architect and B-engineer develop the provider;
  A-architect and A-engineer verify that its real behavior satisfies A's need.

The primary coordination point is the plan. Engineers communicate through their
respective architects; this hypothesis does not require direct conversations
between A-engineer and B-engineer. Original examples, code references and failure
evidence accompany the architects' explanations.

## Proposed workflow

### 1. A-engineer starts the plan

A-engineer writes its need and sends the plan to A-architect. It includes:

- What A is trying to do and where the capability would be used in code.
- Concrete inputs, expected outcomes and constraints it knows about.
- Any existing interface it knows and why that interface is insufficient, or
  an explicit statement that it knows no suitable interface.
- Existing tests or example tests, with pseudocode marked explicitly.

A possible API shape is a suggestion. A-engineer is not expected to know every
other use case or consumer. Preserve the original need and the provenance of
subsequent clarifications rather than silently replacing the request with a
later design interpretation.

### 2. A-architect investigates reuse and proposes the capability

A-architect searches for existing capabilities and determines their semantic
fit with the need. A registry lookup retrieves a recorded decision; it does not
establish behavioral equivalence.

If an existing capability suffices, A-architect identifies its interface and
explains its use to A-engineer. A-engineer verifies that it actually satisfies
the need. Access or compatibility work, if required, remains explicit.

If no existing capability suffices, A-architect adds a proposal to the plan:

- The behavior to add, including whether it extends existing behavior.
- The proposed provider module and the evidence for that placement.
- A candidate interface and tests or test examples.
- Known compatibility requirements and unresolved questions.

This is an agent's semantic decision. The harness does not infer capability
matches from names. Unresolved ownership or a change beyond the architects'
authority goes to the architect responsible for the common boundary.

### 3. A-architect and B-architect review and revise

A-architect asks B-architect to review the proposal. B-architect examines B's
existing abstractions, implementation constraints, relevant consumers and
compatibility obligations, updates the proposal, and sends it back.

They repeat this exchange until both are satisfied with the same revision.
Each substantive update explains what changed, why, and which questions remain.
If investigation shows that B is the wrong provider, placement is reopened.
Agreeing to cooperate does not by itself change another module's responsibility
or determine where every shared declaration belongs.

### 4. A-engineer reviews the proposed interface

The architects ask A-engineer to review the agreed proposal against its actual
need and call sites. A small usage prototype can reveal a problem that reading
the signature alone would miss.

A-engineer returns concrete objections or confirms that the proposal serves its
use case. Objections return to A-architect and, where needed, to B-architect for
another revision. Architectural agreement and consumer usability must refer to
the same proposal revision before implementation proceeds on that basis.

### 5. B-architect plans and coordinates implementation

B-architect plans B's work and assigns implementation iterations to B-engineer.
B-architect retains the power to revise the plan as implementation reveals new
facts. The original agreement is a basis for an attempt, not a declaration that
all design questions have been solved.

| Revision | Treatment |
| --- | --- |
| B's internal implementation or work breakdown | B-architect updates the plan and coordinates the work. |
| Shared interface, externally observable behavior or consumer obligations | B-architect sends the revised proposal to A-architect; affected consumer usage is reviewed by A-engineer. |
| Required behavior cannot be satisfied | Record the conflict for an explicit requirement decision. Do not silently weaken the need or its tests. |

Small implementation experiments may inform the proposal before a large
implementation commitment. The exact conditions for starting such experiments
remain a design question. They must have a bounded purpose and module scope.

Tests evolve with the API and discoveries, with the reason for changes recorded.
Changing test encoding must preserve required behavior. Expected results must
be independently specified, and scenario inputs must represent the behavior
being tested. A fake may support parallel progress or exploration; fake-backed
success does not establish that the real provider works.

### 6. Return the implementation to A for verification

When B's implementation and required checks are complete, B-architect returns
the plan and evidence to A-architect as **ready for consumer verification**.

A-architect asks A-engineer to integrate the real provider and exercise A's use
cases. A-architect may request changes based on that evidence. The resulting
findings return to B through the same plan, reopening interface discussion when
necessary.

The plan is complete only when provider verification and consumer acceptance
both hold for the corresponding interface and implementation revisions. B
finishing its assigned work alone does not close the plan.

## Keeping contexts small

The plan presents the current need, interface, behavioral examples, architectural
constraints, implementation progress, open questions and verification evidence.
It records which revision each participant reviewed.

Each agent receives the relevant current sections and changes since its last
review. Detailed investigations, source, patches and command output remain
linked artifacts that agents retrieve as needed. The plan does not accumulate
everyone's transcripts into a mandatory briefing.

Code work retains module scopes: a module's internals, or a module and selected
children with their subtrees. Code paths in the plan identify evidence and usage
points; they do not redefine assignments as lists of files.

## Harness responsibility

The harness persists revisions and agent decisions, delivers review requests
and relevant evidence, schedules scoped work, runs required checks and records
their results. It prevents a review of an older revision from being treated as
acceptance of a changed agreement. The exact submission and storage protocols
are not specified here.

Agents judge semantic fit, design adequacy, architectural tradeoffs and whether
the implementation fulfills the need. Structural validation and test execution
support those judgments. They do not replace them. Progress and unresolved work
remain recorded if an execution budget is exhausted; stopping is not acceptance.

## Relationship to the current architecture

This hypothesis would change the current
[horizontal-work and fake-delegation sequence](../harness.principles.md#horizontal-work-uses-separate-agents-joined-by-a-contract),
which establishes an agreement and consumer integration against a fake before
provider implementation begins. It places ongoing cooperation between the two
module architects at the center of interface evolution. A separate contract
engineer is not required as the sole designer of the whole agreement.

Existing principles, role prompts and runtime behavior remain authoritative
until a separate decision adopts and implements a revised architecture. This
document records the alternative for investigation.

## Experiment and open questions

A first experiment could use the self-explaining-denials need: complete one
no-exposure example through the real producer and consumer, then introduce a
one-edit proposal case that may challenge the initial design. Record the plan
revisions and the evidence that caused each revision.

Evaluate whether the cooperation preserves the original requirements, exposes
interface problems earlier, produces independently meaningful tests, and keeps
per-agent context and coordination cost manageable. Compare completion and
semantic defects as well as elapsed time, token use and rework. More reviews or
passing tests alone do not establish improvement.

Questions left open:

- How are disagreements, stalled reviews and incompatible needs resolved?
- How are several consumers of X represented without creating divergent plans?
- How are concurrent edits reconciled, and which changes invalidate which reviews?
- When may a bounded implementation experiment begin before joint agreement?
- What evidence and independent review are needed for final acceptance?
- How are the plan and open decisions carried into fresh agent sessions?
- How does this workflow compose when B needs another provider?
