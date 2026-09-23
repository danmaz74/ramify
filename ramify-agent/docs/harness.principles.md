# Harness Principles

**Status:** Proposed

## Purpose

Define the principles of a harness that helps agents implement features in a
Ramify project efficiently while respecting its modularity model. They are
listed in decreasing order of importance.

The toolkit's
[importability principles](../../docs/model/cross-module-importability.principles.md)
define what a module may import, and its
[module architect principles](../../docs/agents/module-architect.principles.md)
define the evidence Ramify supplies to an agent with a global view. This
document redefines neither.

## Principles

### Bounded Context Is What Makes Agents Efficient

Here, search space means the information available for an invocation to
investigate, including selected source and generated views. Its declared byte
size differs from the whole-project source-line baseline used in token-cost
comparisons. Model context usage is the tokens currently occupying the model
context. Bounded reasoning is a strategy intended to improve token efficiency;
its benefit must be measured from run token cost and delivered work.

Each agent invocation should have a manageable reasoning burden. Work can be
bounded in two ways:

- **A broader change goal within a narrow search space:** an agent may
  implement several related changes within one module or a small, coherent
  subtree.
- **A narrow change goal within a broader search space:** an agent may inspect
  several modules to establish one contract, integrate it in a consumer, or
  resolve one composition issue.

**The broader the search space, the narrower the change goal must be.** An
invocation should not combine broad architectural reach with a broad
implementation responsibility.

When work requires a broad search space, split it into individual iterations,
each with one focused goal, explicit write boundaries and a clear completion
check. Each invocation retrieves only the information needed for that goal.

A focused goal may require coordinated changes to several artifacts. Designing
an interface, its tests and fake, and integrating them in one consumer can form
a single coherent iteration.

The division of work should also facilitate integration and maintain a clean
architecture. Every other principle serves this divide-and-conquer
strategy.

In some cases, special views can facilitate this approach. Architecture planning requires reasoning on the whole application, and the architect view creates a smaller search space for that.

### Plans Are Incomplete; the System Adapts

Agents work on a need-to-know basis, and the system is based on the
inevitablity of unknown unknowns. The assumption is that no plan made in
advance is fully complete or correct.

Discovering during work that a task needs something beyond its scope is a
normal outcome. How the harness handles discoveries matters more than how
thoroughly it plans.

### Forecast Early; Decide with Current Evidence

Early analysis forecasts needs across the plan for two purposes:

- **Improve global decisions.** Seeing related needs together can reveal
  opportunities to reuse one new capability across several consumers, before
  local decisions produce separate solutions.
- **Enable high-level human review.** The forecast makes the intended
  architectural direction, reuse opportunities and uncertainties visible
  before detailed implementation.

Forecasts and actual decisions remain separate. A forecast informs later
choices but does not, by itself, create work or establish a contract.

When a concrete need arises, reuse the responsible agent's oriented context
with the new evidence, through continuation or a fork carrying accumulated
decision briefs. It considers the immediate need alongside forecast needs
elsewhere, earlier decisions and current findings. Anticipated consumers inform
the design, but their requirements remain provisional until examined during
their own work. Considering them does not by itself coordinate their execution.

Forecasts, decisions and their rationale are recorded in the repository.
Session continuity aims to reduce the token cost of repeated orientation and
preserve consistency; it is never required for recovery or correctness.
Making a forecast available for review is
separate from requiring execution to wait for approval.

### Distinguish Breaking from Non-Breaking Changes

A non-breaking change adds capabilities while preserving every existing
contract and behavioral guarantee. Existing consumers can continue to use
them unchanged.

A breaking change intentionally revises or removes an existing contract or
behavioral guarantee. Existing consumers may therefore need to adapt.

These are different kinds of work and may require different implementation
and verification strategies. The distinction comes from the requested
behavior: a preference for a cleaner interface does not, by itself, make a
breaking change necessary.

### Every Agent Scope Is a Cut on the Module Tree

Agent roles differ only in which part of the module tree they see and may
change. Ramify supplies the evidence for choosing that scope and enforces the
model within it.

The tree states who has authority over an interface. A parent owns the
boundaries of its children. An interface between two branches belongs to
neither side.

### A Module Carries Its Own Onboarding

Bounded context covers knowledge as well as code. A module's purpose,
invariants, conventions, entry points and testing guidance live with the
module, beside the contracts it receives from its children.

An agent scoped to a module is competent from that material and the module's
generated API view, without reading the rest of the project. Knowledge that
governs several modules lives at their lowest common ancestor.

Detail is retrieved when needed, never preloaded.

### Architecture Planning Produces an Implementation Map

The implementation map says where the implementation of a plan falls on the
module tree. Above all it identifies which modules take most of the work. That
guides the division of the plan into phases and iterations. New modules are
rare.

The phase also records what only the global view can supply:

- reuse findings: behavior that already exists, and whether it is available to
  the module that needs it;
- seams: where modules in different branches must agree on an interface.

Finer detail is left to the engineer who reads the code.

### Vertical Work Is Not Split Artificially

When a change touches a module and its descendants, one agent can work at
all of those levels if the descendant changes are simple or the local cognitive
complexity of reasoning about the subtree is manageable.

The agent's scope is one subtree. The choice is which module is its root: a
higher root gives fewer hand-offs but a broader declared search space, and a
lower root gives the reverse. Local cognitive complexity means the knowledge
that must be understood together at that abstraction level; it is assessed
qualitatively rather than computed from source size. That assessment guides
the choice. Work decomposition is not 1:1 with module decomposition.

### Horizontal Work Uses Separate Agents Joined by a Contract

Implementation in different branches uses separate agents. Neither side
designs the other's interface.

A contract iteration has the focused goal of establishing an agreement and
integrating it in the requesting consumer. Its agent reads both sides of the
seam and, where the capability changes symbols that already have consumers,
may read all of those consumers. It writes the shared interface, conformance
tests and any required fake, and makes the consumer changes needed to
integrate them. Provider
implementation and changes to other consumers remain separate work.

The iteration verifies the agreement against the consumer's behavior before
provider implementation begins.

No separate role carries it out. An engineer does, with a skill for contract
work that the harness supplies with the iteration. What keeps the agreement
from serving one side is not who writes it: it is what the iteration must
read, the executable evidence it must produce, and the provider's standing to
report that a contract needs revision.

Changing symbols that already have consumers preserves those consumers'
contracts, including their behavioral guarantees. If a proposed design would
require changes to other consumers, the contract iteration first seeks a
compatible design. If the
requirement makes compatibility impossible, it reports the conflict for an
explicit contract-revision decision. Only an accepted breaking change creates
migration work in other consumers. Revalidating compatibility may require
running their tests without changing their code.

### Fakes and Tests Guide Delegation

Work is delegated as executable evidence, never as prose alone.

The consumer implements its real behavior against a fake of what it needs.
Using the fake reveals what the requirement actually is, before anyone
implements it. The fake replaces only the missing part; existing behavior
stays real.

The tests that pass against the fake become the provider's obligation. The
provider's work is complete when the same tests pass unchanged against the
real implementation.

A delegation is finished only when the consumer's own behavioral tests pass
with the real provider in place of the fake. Passing against a fake is never
completion.

This applies to a seam, to a need discovered during work, and to a parent
delegating to a descendant outside its agent's scope.

### Fakes Are Explicitly Named

Fake implementation files use a `.fake` suffix before the language extension,
such as `send-email.fake.ts`. Exported fake implementations, factories and
classes include `Fake` in their names, such as `createSendEmailFake`.
Re-exports preserve that designation rather than exposing a fake under a
production-looking name.

Shared contracts keep behavior-oriented names, such as `SendEmail`, because
both the fake and the real provider implement them. The contract iteration
checks the naming convention as part of completion.

Explicit names make fakes recognizable in source and generated architectural
evidence. A contract and fake can establish a capability's intended placement;
their presence does not establish that its real implementation is ready.

### A Plan's Acceptance Is Its Scenarios

A plan's acceptance is a set of Gherkin scenarios: the plan's own, and those
the initial architect writes for each entry capability. Their text is frozen
when the analysis is accepted. Agents bind them late, with step definitions,
and never change them; only the harness writes a feature file or moves a
scenario's state.

A scenario that passes against a fake is bound, not done, as a delegation is.
A plan is finished when every scenario passes in full mode at the final
gate.

### Work Starts at the Consumer; Integration Happens on the Return

Work begins at the highest consumer of the feature. It writes its behavioral
tests, implements against fakes of what it lacks, and delegates each fake's
obligation. Each provider repeats this for what it lacks in turn.

On the return, each fake is replaced by its real provider and the tests of
that level run again. Integration therefore happens one delegation at a time,
at every level, and not once at the end.

The implementation map says which modules carry the work. This order says where
the work starts and how it reaches them.

### Need-to-Know Does Not Forbid Asking

An engineer never holds the global view, but it can ask the architect whether
behavior exists and whether its module may use it.

Ownership and placement decisions belong to the architect. Structural changes
are approved by a person.

### Results Are Need-to-Know Too

Completed work returns only what matters to whoever delegated it: changed
contracts, changed assumptions and required follow-ups. How the work was done
stays with the agent that did it.

A delegating agent's context does not grow with the detail of the work it
delegates. When nothing relevant changed, the result is the completion alone.

### Discoveries Are Priced by Kind

A need discovered during work costs what its kind requires:

| Discovery | Cost |
| --- | --- |
| Exists and is available | None; the engineer uses it. |
| Exists but is not available | The exposure declarations along the path, proposed by the architect. |
| Missing; its owner is within the agent's scope | None; the engineer implements it. |
| Missing; its owner is elsewhere | An architect decision, then a new seam or a changed scope. |
| The planned ownership is wrong | A person's decision. |

The harness never treats every discovery as a reason to pause the run.

### State Lives in the Repository

A blocked agent completes what it can and leaves a failing test, a stub and a
written need. It reports partial completion with its needs, and any fresh
agent can continue from the repository.

Only the next iteration's goal is fixed; later iterations are decided from
the state reached. Resuming a session is an optimization, never a requirement
for correctness.

### What Integration on the Return Leaves Is Resolved at the Common Ancestor

Most integration happens on the return, one delegation at a time. Each
replacement verifies one consumer with one provider; it does not verify the
composition of several modules.

What remains is work of its own: wiring, lifecycle, configuration and
behavior that emerges only when several modules run together. An integration
agent resolves it, scoped to the subtree of the lowest common ancestor of the
modules involved. It owns the composition and may make bounded corrections in
descendants, avoiding a long sequence of delegations.

Substantial composition work is split into focused iterations. Each invocation
addresses one composition issue with explicit write boundaries and a clear
completion check, even when it needs to search the whole common subtree.

The conformance tests of each seam prevent it from redesigning a contract.
Feature-level tests at the common ancestor decide completion.

### A Small Closed Set of Outcomes Is the Whole Protocol

An agent resolves ordinary failures itself: compile errors, failing tests and
violations reported by Ramify's checks.

It reports to the harness only an outcome that changes the orchestration: the
goal is reached; the work is partially complete, with its needs; a contract
needs revision; the request cannot be satisfied as specified; the implementation
map is wrong. The harness acts on nothing else.

### The Harness Stays Small; Ramify Stays Outside Its Control Loop

The harness chooses agent scopes, orders seams and handles discoveries.
Agents make every semantic decision.

Ramify's generated views and post-write checks belong to the agent's project
environment. A violation reaches the agent as an ordinary error.

A runtime failure, such as a crashed session or malformed output, is never a
semantic outcome.

### Agent Invocations Should Be Considered Idempotent

When an agent gets interrupted for any reason, we should always be able to
restart it from the beginning. Agents are able to check the situation by
reading files and are able not to redo/undo what's already done. When useful,
we can choose prompts which help with this, but most of the time that's
not necessary.

### An Oriented Context Is Reused, Never Required

Orientation is the largest fixed cost of a session: an architect reading the
architect view, an engineer learning its module. An agent asked again about
the same scope should not pay it again. A new invocation may continue, or
fork from, an earlier session of the same role and scope.

Fork an oriented session for independent tasks. It starts from the point where
the earlier session was oriented, before it took up any one task, so the reused
context stays bounded and several questions can start from it at once.

When successive tasks benefit from shared orientation but produce substantial
exploratory context, execute each task in a fork of the updated long-lived
context. The fork can make decisions within its assigned authority and returns
a concise brief of its conclusions, rationale, corrected assumptions and
required follow-ups, referencing the durable records.

Append that brief to the long-lived context without invoking the model. The
next invocation receives the accumulated updates; detailed searches and tool
results remain in the fork. Tasks whose decisions depend on one another must
receive the preceding accepted decisions before starting.

Continuity can come from accumulated decision briefs as well as from continuing
the full conversation. Use direct continuation when its continuity is more
valuable than isolating task exploration. Forks limit accumulated context but
do not necessarily reduce total tokens or latency.

Each request supplies relevant new findings; context reuse does not
automatically reveal changes in the repository.

A reused context is a cache, never the sole authority for decisions or progress.
Any invocation must succeed from a fresh session and the repository alone.
Context describes the source as it was when it was read; when that source has
changed, the context is refreshed or discarded.
