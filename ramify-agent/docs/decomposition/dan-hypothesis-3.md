# Decomposition hypothesis 3: local coordination, decisions recorded

**Status:** Initial hypothesis. No implementation or validation is claimed.

This is an alternative to [hypothesis 2](dan-hypothesis-2.md). It keeps bounded
agent work, executable delegation and integration on return, but separates
architectural forecasts from execution decisions and removes all waits for
human review from the MVP.

It deliberately differs from the current [harness principles](../harness.principles.md)
where they require a person's architectural approval, and from the
[non-breaking-only MVP](breaking-vs-non-breaking-plans.md). Those documents
remain unchanged; this hypothesis explores a different implementation boundary.

## The idea

The eventual harness should let a person review important choices before work
starts. This MVP instead records those choices as agents make them and
continues automatically. A person can review the decisions and resulting work
afterwards. A recorded decision is not recorded human approval.

A global architect initially identifies the top-level capabilities and their
owner modules and forecasts deeper capabilities to reuse, extend or create.
The forecast is recorded for review, but does not schedule work. The architect
remains available as one resumable session throughout the run, resolving
capability identity and placement when module coordinators encounter actual
needs. Iteration planning happens locally: a coordinator examines the assigned
goal, its module and the architect view, plans iterations, and delegates each
iteration to an engineer.

During its initial analysis, the coordinator identifies required breaking
changes and isolates them into ordinary scoped implementation iterations.
Non-breaking iterations use the contract and delegation process below.

In a non-breaking iteration, an engineer that needs work outside its scope
invokes a contract sub-session.
That session establishes the agreement, tests and fake and integrates them in
the consumer. The harness registers the provider obligation. The engineer
continues from the changed files, and the provider is implemented later through
the same module-work-item process.

Vertical and horizontal delegation use this same mechanism. Their differences
concern scope and contract ownership, not different execution protocols.

## 1. A global architect: forecast first, resolve actual needs later

The global architect's initial session reads the request and architect view.
It identifies the top-level capabilities: behavior used by a person, an external system or
a part of the project outside the requested work. It assigns each capability
to an existing or proposed module.

The entry assignments contain capability identifiers, short descriptions,
owners and references to applicable requirements and acceptance conditions.
The architect also analyzes likely deeper needs and records a forecast of
capabilities to reuse, extend or create, with suggested owners, rationale and
uncertainties. This is architectural foresight, not an exhaustive iteration
plan or an upfront breaking-change execution gate.

**Forecasts and actual decisions are separate records.** Both are available
for display and human review, without an approval wait. The harness starts work
from the entry assignments; it never turns deeper forecast entries directly
into work items, provider obligations or completion requirements. The original
request remains the source of feature-level acceptance and constraints.

A top-level work item gets its goal from the relevant request requirements.
A provider work item gets its goal from a consumer's registered obligation.
Both are handled by the same coordinator process.

### Resolve placement through the same architect session

The initial session becomes the run's long-running global architect. It is
idle between requests and resumes when a coordinator needs a capability or
placement decision. The harness processes requests sequentially, recording
each answer before resolving the next. It does not fork independent placement
sessions from the initial context.

A coordinator supplies the required behavior, relevant discoveries and current
artifact references, and may suggest candidates or an owner. The architect
consults its forecast, current architectural evidence and previous decisions,
then resolves the need to reuse an existing capability, extend a registered
capability, or create a new capability with an owner. The harness records the
decision and returns its reference to the coordinator before contract work
begins. Ordinary use of an already identified, available API needs no new
placement decision. New capabilities, unresolved needs and ownership revisions
use this operation in both breaking and non-breaking work.

The architect decides capability identity and ownership; the coordinator
decides iterations and scope; engineers establish contracts and implement
assigned work. Placement does not establish requester-specific importability
or implementation readiness, or replace the contract's executable evidence.
A contract, explicitly named fake or partial implementation can already identify
the intended capability and owner. The architect can direct another coordinator
to that capability without claiming that its provider is complete. The
coordinator uses the contract, iteration and obligation records to determine
what can be used and what still requires work. Unfinished work changes placement
only when new evidence calls the capability identity or ownership into question.

### Keep architectural knowledge durable

A shared capability registry records resolved capability identifiers,
behavioral descriptions, owners and placement rationale, with references to
contracts and provider obligations as those become available. It includes
decided capabilities that are not yet implemented, so later requests can find
them. Forecast entries remain separately identifiable and may reference the
decisions that confirm, revise or replace them. Preserve the initial forecast
and subsequent revisions so a person can compare expectations with execution.

Capability identity is separate from consumer requirements and implementation
obligations. Two consumers may need the same capability but require different
contract behavior. Reusing an entry does not prove the existing contract or
implementation satisfies the new need. Semantic matching remains an architect
judgment, not a guarantee supplied by registry identifiers.

The architect can revise a tentative forecast freely. Revising an actual
placement must identify affected contracts and work, with consequences returned
to the relevant coordinators; it cannot silently move existing obligations.

The harness persists forecasts, decisions and registry updates. The architect
normally resumes its oriented session, but must also recover from those files
after session loss or compaction. Conversation history is useful context, not
the sole authority for architectural decisions.

### Refresh evidence before resuming the architect

This design assumes Ramify supplies the proposed
[architect-view diff mechanism](../../../docs/architecture/architect-view-diff.spec.md).
That toolkit feature is specified separately and is not yet implemented. Ramify
produces factual differences; the harness chooses the baseline and supplies the
request context. The harness does not implement a second view-diff engine.

For the initial analysis, the harness materializes the architect view and saves
a complete, stable copy with its revision, input and snapshot identities. For
each subsequent architect request it:

1. Pauses implementation writes and lets active tools settle before refreshing
   evidence. Writes remain paused while the architect makes the decision.
2. Refreshes the view using Ramify's diff mechanism against the architect's
   retained baseline, not against whichever view was last materialized by any
   client. Intermediate refreshes must not cause missed changes.
3. Supplies the current view location and identity, the diff README location,
   concise references to changed architectural records, and the coordinator's
   request brief. It verifies that the diff's target is the supplied current
   view and retains stable artifacts for the invocation.
4. Records the architect's answer together with the supplied evidence identities
   and advances the baseline to that snapshot only after the invocation's result
   is durably accepted. A failed or interrupted invocation does not advance it;
   recovery may safely supply the same changes again.

The diff README is the entry point. The architect reads the change index and
relevant detailed records as needed, then searches current facts. The full diff
is not injected into every prompt. A retained baseline identifies evidence
supplied to the architect, not a claim that it read every record. Snapshot
storage follows the toolkit's generated-output isolation rules.

The harness also supplies references to material capability, contract and
ownership decisions made since the previous accepted architect invocation.
These records may change without any corresponding view difference. They
inform identity and placement; the architect does not receive every iteration
log or take responsibility for implementation readiness.

The coordinator supplies a compact brief:

| Field | Content |
| --- | --- |
| Decision needed | The specific question, requester module and work-item reference. |
| Required behavior | The use case and constraints that can affect reuse or placement. |
| Relevant findings | What local investigation established, with current artifact references and material changes to previous assumptions. |
| Candidates and uncertainty | Suggested capabilities or owners, if any, and what remains unresolved. |

The coordinator explains intent and local discoveries; it does not reproduce
the view or summarize all repository changes. The architect combines the brief,
view changes, recorded decisions and forecast when resolving the question.

A failed refresh is not an empty diff and does not make an older view current.
Use bounded recovery before proceeding with a decision that needs fresh
evidence. If the saved baseline is missing or incompatible, refresh without a
diff and explicitly reorient the architect from the current view and durable
records; do not silently substitute another baseline. A fresh session after
session loss similarly needs orientation, not just an incremental diff.
Coverage loss or unavailable facts remain explicit, including when no changed
records are reported. An empty diff establishes neither unchanged source nor
completed implementation. After bounded recovery is exhausted, use the normal
unresolved-failure path rather than waiting for human review.

## 2. A coordinator for each module work item

A module work item is a bounded goal assigned to a module, not all future work
that might happen in that module. It may require several iterations. A later
obligation in the same module can create another work item.

The coordinator has the architect view, access to the assigned module and the
requirements relevant to its goal. It:

1. Analyzes the changes needed in that module.
2. Finds external capability needs and candidate reuse, consulting the global
   architect for unresolved identity or placement and checking requester-specific
   access separately.
3. Identifies required breaking changes and their affected consumers during
   its initial analysis, before assigning implementation iterations.
4. Makes an initial iterative plan to satisfy the work-item goal, choosing
   which whole child subtrees each non-breaking iteration includes. It isolates
   breaking work as far as practical, assigns its explicit scope, and orders
   the iterations around the resulting dependencies.
5. Delegates each iteration to a module engineer and assesses its result.
6. Revises remaining iterations when evidence or dependencies change.

This combines the estimate and local planning steps of hypothesis 2. There is
no separate planning session before every iteration. Only the next iteration
is fixed; later iterations remain a forecast.

The coordinator's broader visibility serves a narrow planning responsibility.
It does not become an unrestricted implementation agent. It passes the engineer
a bounded goal, write scope, applicable requirements, identified external
capabilities to reuse or request, and evidence obligations. The handoff states
whether the iteration uses ordinary breaking-change implementation or the
non-breaking contract and delegation process. For each external capability,
it identifies the owner and intended role. In non-breaking iterations,
contract details are established through contract sub-sessions where needed;
newly discovered dependencies can revise the plan.

Results return as concise findings, changed assumptions and artifact references,
not entire engineering transcripts.

Where the module is new, the coordinator uses the architect's recorded purpose
and placement and includes creating it in the work. Where new information
invalidates an earlier placement, it asks the global architect to revise the
decision and accounts for affected work without a human review wait.

## 3. Engineer iterations and unified delegation

Each iteration has a focused goal, explicit write boundaries and a completion
check. Broader change goals require narrower search spaces; broader searches
require narrower change goals.

For non-breaking iterations, the coordinator assigns scope as **the assigned module's own
contents, plus the complete subtrees of selected immediate children**. For
each child, it evaluates the search space of the whole subtree and either
includes all of it or excludes all of it. It does not select individual
descendants or make exclusions within an included child subtree.

For example, a brief could describe its scope as:

```yaml
scope:
  module: export
  includedChildren: [formatting]
```

This includes `export`'s own contents and everything beneath
`export/formatting`. Other children, such as `export/storage`, and all their
descendants are excluded. An empty child list limits implementation to the
assigned module's own contents.

The coordinator records the scope choice and its rationale for each iteration.
The coordinator uses each iteration’s results to revise the remaining work,
including the goals and scopes of subsequent iterations. A delegated child's
coordinator makes the same decision relative to that child. No human review wait
is required.

The following delegation rules apply to non-breaking iterations. Breaking
iterations use the ordinary implementation approach described in section 6.

The engineer uses existing available behavior directly. Work already within
its assigned scope can remain local. Implementation needed in an excluded
child subtree uses the same delegation mechanism as work in another branch.
Crossing a module boundary to call an existing API does not itself require
delegation. Including modules in one iteration does not change their
importability rules, and access to a subtree does not require loading all of
its contents into context.

When work must be delegated outside the assigned scope, the engineer writes
the need as behavior: use cases, inputs and outputs, side effects, constraints
and any existing executable evidence. It invokes the same contract mechanism
whether the provider is a descendant or lies in another branch.

Expected providers come from the coordinator's planning. If a newly discovered
need has no established identity or owner, the coordinator asks the global
architect to resolve it before the contract is designed. This answers an actual
execution need; it does not make the forecast executable.

The module tree still determines authority over interfaces. A parent owns its
children's boundaries; an agreement between branches belongs at their common
ancestor. Unifying delegation does not erase these ownership distinctions.

## 4. The contract sub-session

This is an engineer invocation with the contracts skill, not a separate
persona. The harness supplies the skill and scope explicitly. It may reuse
the consumer module's oriented context, or start fresh from the files.

Its focused goal is to establish an executable agreement and integrate it in
the requesting consumer. It has:

- Read and write access to the consumer for that integration.
- Read and write access to the selected contract, tests and fake locations.
- Read access to the provider, or the requested capability and available
  architectural evidence when no implementation exists.
- Read access to existing consumers when extending a capability.
- Explicitly scoped exposure-declaration changes when required by the chosen
  access arrangement.

The session designs the interface, creates conformance tests and a fake for
missing behavior, and integrates them in the consumer. It fixes integration
issues until the relevant consumer tests pass against the fake and the fake
passes the conformance tests. Existing behavior remains real.

The session applies the [fake-naming principle](../harness.principles.md#fakes-are-explicitly-named):
fake files use `.fake` before the language extension and exported fake
implementations, factories and classes include `Fake`. Re-exports preserve
that designation. For example, `send-email.fake.ts` exports
`createSendEmailFake`, implementing the shared `SendEmail` contract. The shared
contract keeps its behavior-oriented name; the consumer depends on that
contract and receives the fake through injection. The session checks naming,
including re-exports, as part of completion so generated architectural evidence
does not present a fake under a production-looking name.

For an existing capability that only needs an exposure change, it establishes
access and integrates the real behavior. No fake or provider implementation
is required for behavior that already exists.

On completion, it returns the changed paths, agreement, evidence and any
relevant findings. The caller rereads affected files and continues. It does
not have a second fake-integration step to perform.

The caller suspends writes while the sub-session operates in the consumer.
The MVP uses one active implementation writer at a time, including nested
sub-sessions.

## 5. Registration, provider work and return

A completed contract sub-session has two outputs: an integrated consumer state
and, where implementation is missing, a provider obligation registered by the
harness. The registration identifies the resolved capability, consumer,
provider owner, required behavior, contract revision and executable evidence.
Neither a forecast entry nor a placement decision alone registers a provider
implementation obligation.

Contract completion does not mean provider completion. The consumer can keep
working against the fake while the obligation remains outstanding.

For the initial scheduling policy, the consumer finishes available local work
against fakes and yields at an iteration boundary when it needs real providers.
The harness processes its provider obligations depth-first before moving to
the next independent top-level work item. Each provider starts its own module
coordinator and repeats the same process.

The provider satisfies the registered conformance tests against the real
implementation. The consumer then gets a verification iteration: replace the
fake and rerun its behavioral tests. Only that verification closes the
delegation. Completion of an individual iteration does not complete the
module work item while local work or provider obligations remain.

Repeated registration of the same obligation must not duplicate work. A new
obligation or contract revision must not reuse an older completion merely
because the capability has the same identifier. Shared obligations and cycles
need explicit handling; their detailed representation remains open.

## 6. The coordinator isolates breaking work before execution

The module coordinator's initial analysis is the main breaking-change detection
point. Before assigning implementation iterations, it examines which existing
guarantees must change and which consumers are affected. This is local work-item
planning, not a global classification during top-level capability discovery.

Compatible additions remain the default. A cleaner interface alone does not
justify changing existing guarantees. When the requested behavior requires a
break, the coordinator records what changes, why, and which consumers are
affected. It plans iterations around those changes, isolating breaking work
from compatible feature work as far as practical and ordering both according
to their dependencies. It does not wait for human review.

In the MVP, breaking iterations use ordinary agentic implementation: inspect
affected code, change interfaces and implementations, adapt consumers, and run
relevant tests. They do not require the contract/fake/provider-delegation
process. That more structured process applies to non-breaking iterations.

Both approaches retain a bounded goal, explicit write scope, context-budget
enforcement, recorded results and verification obligations. A breaking iteration
may have an explicitly assigned scope spanning affected modules, with a narrow
change goal to keep the broader search manageable. This is a planned exception
to the ordinary module-and-selected-children scope, not permission for an
engineer to expand its own writes. Ramify importability rules still apply.

A breaking segment may take several iterations. Individual iterations can
leave explicitly recorded unfinished work, but the segment must establish a
consistent, verified baseline for its affected behavior and consumers before
dependent non-breaking work proceeds. For example, a segment replacing an
existing email-address field adapts and verifies its consumers before the
non-breaking send-email feature builds on the new data model. Compatible
preparation may precede the segment where needed; breaking work need not always
be the first work performed.

Recording a break does not discharge its consequences. Affected consumers must
be adapted and verified before the run can complete. Previously completed work
may acquire new verification obligations. Tests whose expectations the request
explicitly supersedes are revised; unrelated guarantees remain requirements.

Initial detection can miss a break. An engineer or contract sub-session that
discovers one reports it to the coordinator, which revises the remaining
iterations and their execution approach. The engineer does not silently switch
approaches or expand its writes. A contract sub-session still does not edit
other consumers or implement the provider.

This draft does not introduce a dedicated migration state machine or claim
that ordinary breaking iterations have the same intermediate guarantees as
the contract-based process. Reliable identification, isolation and ordering
of broad breaking work remain hypotheses to test.

Autonomous decisions select how to fulfill the request. They do not authorize
silently weakening its acceptance conditions. If the agents cannot find a
viable execution within the request and run limits, the run ends with an
explanation of the unresolved conflict, rather than waiting for review or
claiming success.

## 7. Decisions are recorded for later review

Record significant choices when they are made: module placement and creation,
iteration scopes and included child subtrees, reuse, exposure changes,
contract design or revision, required breaking changes, their isolation and
execution approach, and material changes to the iteration plan.

A decision record contains the question, chosen answer, reason, relevant
evidence and affected modules or contracts. It references the work item and
artifacts it concerns. The record is review material, not a pending approval
request and not a copy of the entire agent conversation.

Present architectural forecasts separately from resolved decisions and actual
work. Link related records so differences are visible without presenting a
tentative forecast as a commitment or rewriting the initial prediction.

Future versions may add review gates at selected decisions. Dan-3 does not
need approval commands, approval-expiry rules or an awaiting-review state.

## 8. The harness remains the deterministic execution owner

The global architect, coordinators and engineers make semantic decisions within
their respective responsibilities. The harness records work, launches
invocations, registers obligations and applies explicit
transitions. Calling a sub-session is an agent-facing operation backed by
that same execution machinery, not an untracked child conversation.

The whole run is:

```text
start -> assign entry capabilities and record the architectural forecast
      -> coordinate and execute module work, consulting the global architect
         as needed and including delegated providers
      -> verify final composition and the original acceptance
      -> complete

unresolved failure after bounded recovery -> failed, with evidence
```

Work can wait for an architect decision, contract sub-session or provider, but
never for human review. A final integration step handles composition at the common ancestor
through focused iterations. An empty work queue is not sufficient for success;
the original acceptance and all required obligations must be satisfied.

Goals, forecasts, the capability registry, iteration plans, decisions, contracts
and progress live in files. The harness's durable records identify invocations
and accepted results. A crash
restarts unfinished work from those files, without duplicating registered
obligations. A caller that dies after its contract sub-session succeeds must
be able to discover that result without receiving the original reply.

Reusing an oriented session is an optimization. The global architect and every
coordinator, engineer and contract sub-session must also work from a fresh
session using durable records. Runtime failures remain separate from semantic
outcomes; bounded recovery does not depend on
a person answering a review request.

### Context budgets and compaction

The harness monitors context size and applies a policy by session role:

| Session role | Context policy |
| --- | --- |
| Module engineer | Return to the coordinator at the context threshold; no compaction. |
| Contract sub-session | Return to its caller at the context threshold; no compaction. |
| Module coordinator or global architect (including initial analysis) | Allow compaction and record every occurrence. |

Each engineer invocation has a configurable context threshold, leaving room
below the model's context limit for a final report. The measurement is current
context usage, including cached context, rather than cumulative tokens spent.
The harness checks after each model/tool turn. Measurements can be estimates,
and tool results can arrive in large chunks, so this is a threshold checked at
execution boundaries rather than an exact token ceiling.

When the threshold is reached, the harness stops further implementation and
exploration, lets already-running tool work settle, and allows one final
response without tools. The engineer reports changes made, verification
performed, unfinished work and findings useful to its successor. The invocation
returns `context_budget_reached` with that report and the observed usage:

```text
working -> reporting -> returned(context_budget_reached)
```

The harness persists this as an incomplete outcome. If reporting fails, it
still returns the outcome with the available execution evidence and files;
unfinished changes are not assumed to pass verification. A contract sub-session
that returns incomplete must not register its contract as ready for provider
implementation. Its caller accounts for the partial work before continuing or
returning to the coordinator.

The coordinator uses the result to plan a fresh invocation. It may narrow the
goal, delegate an excluded child subtree, or continue the remaining work with
the same scope. Reaching the threshold does not by itself prove the scope was
too broad: accumulated debugging or test output can also consume the budget.
Recovery uses files and concise handoff evidence rather than reloading the
over-budget transcript. These returns remain subject to the run's progress
and recovery limits.

The harness records both budget returns and compaction attempts, including
session role, invocation, work item and iteration where applicable. Compaction
records include the trigger (automatic threshold, context overflow or explicit
request), success or failure, and context usage before and after where available.
Unavailable measurements remain explicit. Budget-return records include the
configured threshold and observed usage.

Measurements include compactions per session by role, the proportion of engineer
invocations reaching their budget, and repeated budget returns for the same
work item. Compaction is a diagnostic signal of context pressure, not an
automatic failure: an initial analysis and a global architect or coordinator
serving many requests have different expectations. Repeated context exhaustion
without meaningful progress is stronger evidence that decomposition needs revision.
Replacing engineer compaction with fresh invocations must not hide that signal.

## 9. Example: an email button

1. The global architect identifies the customer-page email action and assigns
   it to `web/customer-page`. It forecasts a server operation, reuse of customer
   data and a possible new mail-delivery capability. Only the entry assignment
   starts work; the deeper forecast is recorded for review.
2. That work item's coordinator reads the page and architect view. It finds
   the existing customer data and identifies a missing server operation. It
   asks the global architect to resolve that need. The harness refreshes the
   view and supplies its diff alongside the coordinator's brief. The architect
   records the capability and server owner; the coordinator plans the page's
   iterations.
3. An engineer implementing the action requests a contract sub-session. The
   harness suspends its writes while the sub-session defines the server
   agreement, tests and fake and integrates the fake into the page. The shared
   contract is `SendEmail`; `send-email.fake.ts` exports `createSendEmailFake`.
4. The harness registers the server obligation. The engineer receives the
   changed paths and evidence, rereads them and completes its local iteration.
5. When the page needs its real provider, the server work item starts. Its
   coordinator discovers an existing notification service and asks the same
   architect session about mail delivery. The architect decides to extend that
   service, revising its earlier forecast. No speculative mail-delivery task
   needs cancellation: none was scheduled. The actual extension follows the
   same contract and delegation process.
6. The server satisfies the agreement. A page iteration replaces the fake and
   verifies the real interaction. Final composition checks the feature as a
   whole.

No step waits for review. Placement, contracts and other significant choices
remain available for the person to inspect alongside the initial forecast.

## Open questions for the first experiment

1. **Provider scheduling and shared obligations.** How are readiness, revision
   identity and cycle detection represented with the smallest durable model?
2. **Breaking-change isolation.** Can the coordinator's initial analysis identify
   affected consumers and isolate and order ordinary breaking iterations well
   enough to establish a verified baseline for dependent non-breaking work?
   This remains unvalidated, especially for changes spanning several modules.
3. **Architect and coordinator context.** Can Ramify's diff entry point, concise
   decision updates and the coordinator brief keep the resumed architect current
   without excessive compaction? Does combining the architect view and local
   source remain manageable for module coordinators?
4. **Work-item granularity.** When should related entry capabilities in one
   module share a work item? Keep this a planning judgment rather than requiring
   one item for every capability or one permanent item per module.
5. **Contract artifact placement and execution.** Where do the interface,
   conformance suite and fake live so that consumer and provider verification
   use the same agreement without violating project boundaries?

The first experiment should exercise one consumer, one real delegation and
verification on return, including a restart after contract registration.
It should also resolve a placement through the resumed architect using new
evidence that revises a deeper forecast, confirming that the forecast itself
created no executable work and that the decision survives session loss.
Exercise an intermediate materialization by another client, ensuring the next
architect update still compares against its retained baseline. Check that an
interrupted invocation does not advance that baseline, that a missing baseline
causes explicit reorientation, and that refresh failure or coverage loss is not
presented as no change. Use the toolkit diff feature when available; until then,
this part of the experiment remains unvalidated rather than being replaced by
a harness-specific diff implementation.
Check that fake files and exports, including re-exports, follow the naming
convention, and that the architect can identify the intended provider from the
agreement without treating the visible fake as completed implementation.
That would test the central execution mechanism before broader autonomous
architectural decisions or migrations are treated as validated.
