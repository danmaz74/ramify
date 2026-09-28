# Architecture hypothesis: a fresh architect for one capability

**Date:** 2026-09-28. **Status:** Architecture hypothesis for experimentation.
The workflow described here has not been implemented or validated.

This is an alternative to [cooperation between consumer and provider
architects](capability-plan-cooperation.hypothesis.md). It retains that
hypothesis's revisable capability plan and its separation of interface quality,
implementation quality and real consumer verification. It changes who carries
the work between the request and the return to the consumer.

## Hypothesis

When a consumer needs another module's capability, one **fresh capability
architect** can coordinate its design and implementation. A-engineer supplies
the concrete need, A-architect supplies the relevant consumer architecture, and
the capability architect investigates the provider, coordinates its engineers
and consults A-engineer as the interface evolves. The result returns to
A-architect and A-engineer so they can continue the work that generated the
request.

The architect starts a new session for this capability. Its context comes from
the request, the current capability plan and selected project evidence. It does
not depend on an existing B-architect session or inherit A-architect's entire
history. It retains its own context across design, implementation and repair
iterations for this capability.

This aims to preserve the useful feedback in the [first cooperation
trial](/tmp/ramify-capability-cooperation-20260927/project/docs/analysis/2026-09-27-capability-plan-cooperation-trial.md)
while reducing
architect-to-architect exchanges. That trial had 23 agent turns, including 15
architect turns, and caught a wrong expected result when A-engineer inspected a
real provider case. Its result was bounded to three simple cases; it did not
establish the new workflow's efficiency or full feature correctness.

## Participants and authority

Let **A** be the consumer module and **B** the proposed provider module.
"X-capability plan" names the shared record of the need, decisions, work and
evidence; the final storage format is undecided.

| Participant | Responsibility |
| --- | --- |
| A-engineer | Records the immediate need, calling code, known constraints and examples; answers usage questions, tries the interface against real A code and integrates the result. |
| A-architect | Investigates reuse and the consumer's architectural constraints; delegates the capability; receives its result and coordinates completion of A's work. |
| Capability architect | Starts fresh for X; reads relevant A and B code, checks provider placement and existing interfaces, designs and revises the interface, coordinates B-engineers and compatibility work, and returns the result with evidence. |
| B-engineers | Implement and test assigned provider work within their module scope; report discoveries that affect the plan. |
| Architect responsible for a wider boundary | Resolves uncertain ownership or responsibility changes beyond the capability architect's authority. |

The capability architect is responsible for both outputs: an interface that A
can actually use and a provider implementation that fulfills it. A-engineer is
the direct source of consumer feedback. A-architect retains responsibility for
A's broader work, but need not approve each interface or implementation
revision. No standing B-architect or separate contract engineer is required for
this capability.

The capability architect may read A's source, tests and generated views whenever
they help establish the consumer need, evaluate an interface or interpret a
real integration result. It may inspect B and make design decisions for X.
That role does not confer unrestricted code write authority. Engineer work uses
module scopes: a module's internals, or a module and selected children with
their whole subtrees. If X requires changes in A, a shared ancestor, or another
consumer, the architect coordinates work under the appropriate authority.

## Proposed workflow

### 1. Capture and qualify the consumer need

A-engineer starts the plan with what A is trying to do, actual code usage
points, concrete inputs and expected outcomes, and constraints it knows. It
identifies an existing interface it found insufficient, or says that it knows
no suitable interface. Existing tests and Vitest-style example tests may be
included; pseudocode is marked. A proposed API shape is a suggestion.

A-architect investigates whether an existing capability already satisfies the
need and records relevant A constraints. Semantic fit is an agent judgment;
the harness cannot infer it from a capability name or registry entry. If an
existing capability suffices, A-engineer verifies its use and any access work
is made explicit. Otherwise A-architect proposes a provider and delegates X
with the original request and its own findings. It need not settle the final
interface or investigate B's implementation in full before delegation.

### 2. Start one fresh capability architect

The architect receives the original need, A-architect's findings and
constraints, the current plan revision and pointers to relevant code and
evidence. It reads A's actual calling code and tests as needed to understand
the requested behavior. It investigates B's exposed APIs first, then its
abstractions, producers, other consumers, tests and compatibility obligations.
It verifies that B is the appropriate owner. If evidence points elsewhere,
placement is reopened with the architect responsible for that boundary.

The architect chooses whether to extend an existing interface, use a different
existing one, or introduce a new one. It writes an initial design and
behavioral examples into the plan. The design identifies the required behavior
and known compatibility obligations; it is a working proposal that can change
after code and consumer experiments.

### 3. Develop the interface and implementation together

The capability architect assigns bounded implementation work to B-engineers,
reviews their results and revises the plan as new facts appear. An early usage
or provider experiment can test a disputed assumption before committing to a
larger design. The architect may ask A-engineer to try an interface, inspect
actual output or clarify a requirement at any point. Questions and responses
are recorded against plan revisions, with the original need retained.

The architect handles B's internal implementation choices. Changes to shared
behavior, the exposed interface or consumer obligations are checked with
A-engineer against A's real usage. An issue affecting A's broader architecture
returns to A-architect. Required behavior is not silently weakened to make an
implementation or a test pass.

Tests evolve as the design evolves. Record why an expectation changes and
retain independent expected results for the required cases. Scenario fixtures
must actually represent the cases they claim to test. A fake can support
exploration, but its passing tests do not establish that the real provider
works. The provider and real A usage both need executable evidence.

### 4. Return the capability to A

The capability architect returns the plan, interface and implementation
revision, usage guidance, changed compatibility obligations, executed checks
and unresolved limitations to A-architect and A-engineer. The return means
**ready for A to continue and verify**. A-engineer integrates the real provider
in the work that produced the request. A-architect may reopen X when that
integration reveals a problem; the same capability plan carries the finding
and subsequent repair.

X is complete only when provider checks and real consumer acceptance apply to
corresponding revisions and the original required cases are satisfied. A
passing focused suite, a fake-backed suite, or B-engineer finishing assigned
work is insufficient on its own.

## Context and harness support

The plan holds the current need, examples, interface, decisions, open questions,
implementation status and evidence. It records provenance and the revision of
each decision or review. Agents receive relevant current sections and changes
since their last turn; detailed source investigations and command output remain
available by reference. Code paths identify usage and evidence, not lists of
files assigned for editing.

The harness starts the fresh capability session, persists plan revisions,
delivers A-engineer questions and responses, schedules scoped engineer work,
runs required checks and records results. It must not treat feedback on an old
revision as acceptance of a changed interface. Agents judge semantic fit,
design adequacy and whether the real behavior fulfills the need. Exhausting a
time or context budget records unfinished work; it does not accept it.

## What the trial motivates and what remains open

In the first trial, A-engineer found that a fixture expecting no one-edit
proposal already contained an editable same-file exposure statement. The
architects revised the cases, and real provider and consumer tests then
distinguished no statement, one editable statement and a two-hop blocker. The
provider architect also found proposal algorithm defects that remained open.
This hypothesis preserves direct consumer feedback and provider review within
one architect's iterative work. It proposes removing the exchanges between
two architect sessions; their effect on cost and correctness must be measured.

A next experiment should start the capability architect fresh from the same
consumer request, baseline and target cases as the first trial. Measure
completion of real A usage, semantic defects, time, model usage, repeated
investigation and revision count. Keep the original feature requirements and
full acceptance gates visible; the earlier three-case observation is not full
feature completion.

Open questions include how to resolve a need shared by several consumers, how
to coordinate changes beyond B's authority, how to handle another provider
needed by B, which concurrent edits invalidate a review, and what independent
assessment is needed before final acceptance.

This hypothesis changes the current
[horizontal-work sequence](../harness.principles.md#horizontal-work-uses-separate-agents-joined-by-a-contract)
and the preceding two-architect cooperation hypothesis. Existing principles,
prompts and runtime behavior remain authoritative until a separate decision
adopts and implements a revised architecture.
