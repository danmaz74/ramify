# Decomposition hypothesis 3b: global and local architects

**Status:** Initial hypothesis. No implementation or validation is claimed.

This is a variant of [hypothesis 3](dan-hypothesis-3.md), copied as a separate
hypothesis. It keeps the same execution design but changes how the global
architect handles placement requests: a fork of its current context investigates
and makes the decision. A concise decision brief is appended to the long-lived
session without invoking the model there; the next fork inherits that update.
A Ramify view diff is optional, not a prerequisite.

Like hypothesis 3, it keeps bounded agent work, executable delegation and
integration on return, separates architectural hypotheses from execution
decisions, and removes all waits for human review from the MVP. The local
architect plans a module work item and tests the global architect's hypotheses
against concrete work.

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
owner modules and proposes hypotheses about deeper capabilities to reuse,
extend or create. The hypotheses are recorded for review, but do not schedule
work. The global architect
retains one long-lived context throughout the run. Sequential forks resolve
capability identity and placement when local architects encounter actual
needs, then return concise decision briefs to that context without a parent
model invocation. Iteration planning happens locally: a local architect examines
the assigned goal, its module and the architect view, plans iterations, and
delegates each iteration to an engineer.

During its initial analysis, the local architect identifies required breaking
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

| Role | Responsibility |
| --- | --- |
| Global architect | Maintains architectural hypotheses, considers shared needs and resolves placement across responsibility boundaries or where local ownership is uncertain. |
| Local architect | Tests relevant hypotheses against module work, makes local decomposition choices, and plans and assesses engineer iterations. |
| Module engineer | Implements an assigned iteration within its goal and write scope. |
| Harness | Runs sessions, persists records, schedules work and enforces transitions. |

The local architect is assigned to one module work item, not permanently to a
module. Its responsibility ends when that work item and its obligations are
complete. Local authority does not imply local-only visibility: it can consult
the global architect view to discover reuse and surrounding responsibilities.

## 1. A global architect: form hypotheses first, resolve actual needs later

The global architect's initial session reads the request and architect view.
It identifies the top-level capabilities: behavior used by a person, an external system or
a part of the project outside the requested work. It assigns each capability
to an existing or proposed module.

The entry assignments contain capability identifiers, short descriptions,
owners and references to applicable requirements and acceptance conditions.
The architect also analyzes likely deeper needs and records hypotheses about
capabilities to reuse, extend or create, with suggested owners, rationale and
uncertainties. This is architectural foresight, not an exhaustive iteration
plan or an upfront breaking-change execution gate.

**Architectural hypotheses and actual decisions are separate records.** Both
are available for display and human review, without an approval wait. The harness starts work
from the entry assignments; it never turns deeper hypothesis entries directly
into work items, provider obligations or completion requirements. The original
request remains the source of feature-level acceptance and constraints.

A top-level work item gets its goal from the relevant request requirements.
A provider work item gets its goal from a consumer's registered obligation.
Both are handled by the same local architect process.

### Resolve shared placement in sequential global architect forks

The initial session becomes the run's long-lived architect context. It retains
orientation, the hypotheses and concise updates from completed requests. For each
placement request, the harness forks its latest context. That fork investigates
and decides; the parent does not reassess or approve the choice.

Requests run one at a time. Before starting the next fork, the harness persists
the previous accepted decision and registry changes, appends its brief to the
parent context, and returns the result to the requesting local architect. All forks
act in the same architect role and consult the current registry and decision
log. They must explicitly revise an earlier decision rather than silently
contradict it.

A local architect supplies the required behavior, relevant discoveries and current
artifact references, and may suggest candidates or an owner. The architect fork
consults the inherited hypotheses, current architectural evidence and previous decisions,
then resolves the need to reuse an existing capability, extend a registered
capability, or create a new capability with an owner. The harness records the
decision and returns its reference to the local architect before contract work
begins. Ordinary use of an already identified, available API needs no new
placement decision. Local refinements within established responsibilities use
the local authority described in section 2. Unresolved responsibility boundaries,
competing reuse or placement candidates, and revisions of established ownership
come to the global architect in both breaking and non-breaking work.

The global architect resolves shared or uncertain capability identity and
ownership; the local architect makes bounded local placement and decomposition
choices and decides iterations and scope. Engineers establish contracts and
implement assigned work. Placement does not establish requester-specific importability
or implementation readiness, or replace the contract's executable evidence.
A contract, explicitly named fake or partial implementation can already identify
the intended capability and owner. The architect can direct another local architect
to that capability without claiming that its provider is complete. The
local architect uses the contract, iteration and obligation records to determine
what can be used and what still requires work. Unfinished work changes placement
only when new evidence calls the capability identity or ownership into question.

### Keep architectural knowledge durable

A shared capability registry records resolved capability identifiers,
behavioral descriptions, owners and placement rationale, with references to
contracts and provider obligations as those become available. It includes
decided capabilities that are not yet implemented, so later requests can find
them. Hypothesis entries remain separately identifiable and may reference the
decisions that confirm, revise or replace them. Preserve the initial hypotheses
and subsequent revisions so a person can compare expectations with execution.

Capability identity is separate from consumer requirements and implementation
obligations. Two consumers may need the same capability but require different
contract behavior. Reusing an entry does not prove the existing contract or
implementation satisfies the new need. Semantic matching remains an architect
judgment, not a guarantee supplied by registry identifiers.

The global architect can revise a tentative hypothesis as evidence develops.
Revising an actual
placement must identify affected contracts and work, with consequences returned
to the relevant local architects; it cannot silently move existing obligations.

The harness persists architectural hypotheses, decisions and registry updates.
The global architect normally forks from the accumulated parent context, but must also recover from
those files after session loss or compaction. Conversation history is useful
context, not the sole authority for architectural decisions.

### Share hypotheses and revise them from local evidence

An architectural hypothesis records an expected capability arrangement and why
it may be appropriate. It identifies suggested owners, anticipated consumers
and involved modules, assumptions and unresolved questions. These module and
capability references let the harness supply relevant hypotheses and their
rationales when a local architect starts its work item or receives an update.
Relevance includes being an anticipated consumer, not only the suggested owner.

For example, a hypothesis may place email delivery in `notifications` because
customer messaging and invoice delivery are both expected to use it. The
customer-page local architect receives that rationale, so it has reason to keep
delivery external even if implementing it locally would be possible.

Hypotheses guide judgment but remain distinct from accepted placement decisions
and implementation obligations. Anticipated consumers influence placement and
interface choices; they do not create speculative implementation requirements.
A local architect checks hypotheses against current code and actual requirements,
records local refinements, and brings counterevidence or departures affecting
shared ownership to a global architect request.

Each global architect decision fork also asks whether its evidence or choice
requires revising any relevant architectural hypotheses. It records material
revisions and their rationale, including changed assumptions or anticipated
consumers, alongside the placement decision. No revision is required merely
because an invocation occurred, and no whole-plan reanalysis is required for
each request. Hypothesis maintenance stays focused on the current choice.

The harness persists hypothesis revisions and includes them in the concise
brief appended to the global context without a model call. Affected local
architects receive revised hypotheses and rationales at their next coordination
point, before assigning dependent work. This delivery does not trigger a separate
local invocation or silently rewrite active iterations, contracts or accepted
placements. The local architect assesses the consequences for remaining work;
actual placement revisions retain their explicit impact obligations.

```text
global hypothesis and rationale
  -> relevant local architect
  -> concrete findings and local decisions
  -> global decision fork, when consultation is needed
  -> recorded placement and relevant hypothesis revisions
  -> affected local architects
```

Routine local choices and findings are recorded through the harness, with
registry updates where applicable. They are retrieved on demand, not appended
to the global context. A local finding that needs global judgment becomes a
focused request with the relevant evidence; recording routine activity does
not itself trigger global consultation.

### Investigate and decide in the same fork

For the initial analysis, the harness materializes the architect view. Before
starting a subsequent placement fork, it refreshes that view. The fork inherits
the parent's orientation, hypotheses and decision briefs, and receives the new
local architect request and current record references. It treats inherited source
facts as potentially stale and verifies relevant assumptions against current
evidence and the registry.

The invocation has one focused goal:

> Resolve this capability and placement request using current architectural
> evidence and recorded decisions. Check inherited assumptions and relevant
> alternatives, make the choice, and update any relevant architectural
> hypotheses warranted by the findings. Return the decision, material hypothesis
> revisions and a concise brief for future global architect invocations.

This is broader than looking only for changes. A relevant alternative may have
existed all along, or the architect may never have inspected it. The fork
searches for the required behavior, not only the local architect's suggested owner.
It sees fresh evidence directly when deciding; no separate evidence-summary
handoff or second decision-making invocation is required.

The request flow is:

```text
local architect brief
  -> refresh architect view
  -> fork accumulated architect context
  -> investigate and decide in the fork
  -> harness persists decision, registry changes and hypothesis revisions
  -> append decision brief to parent context without an LLM call
  -> return decision to local architect

next placement request
  -> next fork inherits the accumulated briefs
  -> those briefs reach the LLM as part of that invocation
```

The harness pauses implementation writes and lets active tools settle before
refreshing. It keeps evidence stable through investigation and decision,
recording the current view's revision and input identity with the request.
If another client changes the view or source before the answer is accepted,
revalidate the evidence and repeat affected investigation as needed; do not
silently combine different revisions.

The fork can resolve placement and return proposed registry updates. The harness
remains the writer of durable records; acceptance is protocol validation and
persistence, not another agent or human approval. The fork has no source-write
authority and does not create implementation obligations merely by placing a
capability. Existing contract and implementation processes still establish those
obligations and their completion.

The local architect supplies a compact brief:

| Field | Content |
| --- | --- |
| Decision needed | The specific question, requester module and work-item reference. |
| Required behavior | The use case and constraints that can affect reuse or placement. |
| Relevant findings | What local investigation established, with current artifact references and material changes to previous assumptions. |
| Candidates and uncertainty | Suggested capabilities or owners, if any, and what remains unresolved. |
| Relevant hypotheses | Hypothesis IDs/revisions and rationale being tested, with supporting findings or counterevidence and any proposed departure. |

The local architect explains intent and local discoveries; it does not reproduce
or summarize the whole view. The fork's full decision record identifies the
request, chosen capability and owner, rationale, relevant evidence and its
revision, important constraints or uncertainty, and any revised decision or
consequences for existing work. Material hypothesis revisions are separate
records linked to that decision, not replacements for the accepted placement.

### Append decision briefs without invoking the parent

Alongside its decision record, the fork returns a short brief containing:

- The request and decision references, chosen capability and owner.
- The reason that matters for future choices and any important constraints.
- Corrected inherited assumptions or changes to the hypotheses.
- Affected prior decisions or work, unresolved questions and evidence references.

The harness appends this brief to the long-lived context as a record of an
accepted decision, rather than as a new question needing a response. Appending
it is a storage operation: no model request, acknowledgement, summary generation
or parent review is triggered. It is sent to the LLM only when the next fork is
invoked. If no further request arrives, no model call is needed for that brief.
The fork's detailed searches, tool results and reasoning transcript remain
outside the parent context.

Only conclusions of global architect invocations, including their hypothesis
revisions, are appended through this mechanism. Local implementation changes,
contracts and placement decisions remain in durable records and the registry;
they are not routinely copied into the global context. Each fork retrieves
relevant records alongside the refreshed view, and focused requests supply
local findings that require global judgment. Planned capabilities must remain
discoverable in the registry even before they appear in code. Implementation
readiness remains outside the global architect's responsibility.

The decision log and registry remain authoritative. Each fork checks relevant
current records; inherited briefs help orientation but cannot replace them.
Sequential requests prevent competing concurrent updates, not inconsistent
semantic judgments. Explicit reuse checks and recorded revisions remain needed.

The harness tracks which accepted global decision IDs have been appended. A
crash between recording a decision and appending its brief is repaired before
the next fork; a retry must not duplicate the decision or append the same brief
twice. This can be an idempotent append keyed by the durable record ID. A failed
or incomplete fork is not appended as an accepted placement decision.

### Optional diffs and recovery

Ramify's proposed [architect-view diff mechanism](../../../docs/architecture/architect-view-diff.spec.md)
can help the fork find removals or changes cheaply. If available, its baseline
and target identities must be explicit and its target must match the refreshed
view. The fork may search it without carrying unrelated changes into the parent
brief. The default MVP requires no retained comparison baseline and does not
implement a harness-specific diff engine. Without a baseline, the fork checks
current facts and inherited assumptions; it does not claim an exhaustive account
of what changed.

A failed refresh does not make an older view current. Use bounded recovery;
coverage loss and unavailable facts remain explicit in the decision evidence.
Neither an empty diff nor a search with no hits establishes unchanged source,
absent behavior or completed implementation. A fork unable to decide returns
partial findings and explicit gaps; the harness applies bounded recovery without
invoking the parent to make the missing choice. Unresolved failure is reported
through the ordinary workflow rather than turned into a fabricated decision.

Persist the request, evidence identities, decision record and brief. If a fork
is interrupted before an accepted decision, repeat the invocation using current
records and revalidated evidence. If the parent context is lost, rebuild or
reorient it from the hypotheses, registry, decisions and current view as part of
the next requested architect invocation. Decision briefs alone are not the only
recovery source. After bounded recovery is exhausted, use the normal failure
path rather than waiting for human review.

The hypothesis is that concise accumulated briefs preserve architectural
continuity while avoiding both search-transcript growth in the parent and an
extra parent model call after each decision. The briefs still consume input
context on later forks, and each fork processes inherited context and performs
its own searches. Measure parent context growth, fork and total usage, elapsed
time, compaction and decision quality separately. No token-economy claim is
established by the design alone.

## 2. A local architect for each module work item

A module work item is a bounded goal assigned to a module, not all future work
that might happen in that module. It may require several iterations. A later
obligation in the same module can create another work item.

The local architect has the architect view, access to the assigned module,
requirements relevant to its goal, and the relevant global architectural
hypotheses with their rationales. It:

1. Analyzes the changes needed in that module and tests relevant architectural
   hypotheses against the concrete requirements and code.
2. Finds capability needs and candidate reuse. It resolves routine local
   decomposition within its authority, consults the global architect for shared
   or unresolved placement, and checks requester-specific access separately.
3. Identifies required breaking changes and their affected consumers during
   its initial analysis, before assigning implementation iterations.
4. Makes an initial iterative plan to satisfy the work-item goal, choosing
   which whole child subtrees each non-breaking iteration includes. It isolates
   breaking work as far as practical, assigns its explicit scope, and orders
   the iterations around the resulting dependencies.
5. Delegates each iteration to a module engineer and assesses its result.
6. Revises remaining iterations when evidence, dependencies or relevant global
   hypotheses change, reporting architectural findings and local decisions.

This combines the estimate and local planning steps of hypothesis 2. The local
architect continues its session across iterations; this variant does not apply
the global architect's per-request fork mechanism to local planning. There is
no separate planning session before every iteration. Only the next iteration
is fixed; later iterations remain provisional.

The local architect's broader visibility serves a narrow planning responsibility.
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

Where the module is new, the local architect uses its recorded purpose and
placement and includes creating it in the work. Where new information
invalidates an established placement, it asks the global architect to revise
the decision and accounts for affected work without a human review wait.

### Local placement authority

The local architect may place work within its assigned subtree when that choice
refines the subtree's established responsibility, preserves recorded ownership
decisions, and leaves no unresolved competing reuse or placement candidate.
It checks the registry and architect view for reuse before introducing another
capability. Physical containment alone does not justify local ownership.

Choosing a child to render the email button is local decomposition. Deciding
where general email delivery belongs when several branches may use it calls
for the global architect. A hypothesis proposing an external owner, especially
with anticipated consumers elsewhere, is strong evidence against localizing
the capability. It is not an accepted assignment, but a material departure
about shared responsibility needs a focused global decision with counterevidence.

The harness records local placement choices and registry changes so later
requests can discover them without a brief appended to the global context.
When a choice requires global judgment, the local architect includes the
relevant records in its request. Local placement does not widen
an engineer's write scope: the local architect still chooses whether to include
a child's whole subtree or delegate to it.

## 3. Engineer iterations and unified delegation

Each iteration has a focused goal, explicit write boundaries and a completion
check. Broader change goals require narrower search spaces; broader searches
require narrower change goals.

For non-breaking iterations, the local architect assigns scope as **the assigned module's own
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

The local architect records the scope choice and its rationale for each iteration.
The local architect uses each iteration’s results to revise the remaining work,
including the goals and scopes of subsequent iterations. A delegated child's
local architect makes the same decision relative to that child. No human review wait
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

Expected providers come from the local architect's planning. A newly discovered
need is resolved within its local authority or referred to the global architect
when shared or uncertain, before the contract is designed. This answers an
actual execution need; it does not make architectural hypotheses executable.

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
Neither a hypothesis entry nor a placement decision alone registers a provider
implementation obligation.

Contract completion does not mean provider completion. The consumer can keep
working against the fake while the obligation remains outstanding.

For the initial scheduling policy, the consumer finishes available local work
against fakes and yields at an iteration boundary when it needs real providers.
The harness processes its provider obligations depth-first before moving to
the next independent top-level work item. Each provider starts its own local
architect and repeats the same process.

The provider satisfies the registered conformance tests against the real
implementation. The consumer then gets a verification iteration: replace the
fake and rerun its behavioral tests. Only that verification closes the
delegation. Completion of an individual iteration does not complete the
module work item while local work or provider obligations remain.

Repeated registration of the same obligation must not duplicate work. A new
obligation or contract revision must not reuse an older completion merely
because the capability has the same identifier. Shared obligations and cycles
need explicit handling; their detailed representation remains open.

## 6. The local architect isolates breaking work before execution

The local architect's initial analysis is the main breaking-change detection
point. Before assigning implementation iterations, it examines which existing
guarantees must change and which consumers are affected. This is local work-item
planning, not a global classification during top-level capability discovery.

Compatible additions remain the default. A cleaner interface alone does not
justify changing existing guarantees. When the requested behavior requires a
break, the local architect records what changes, why, and which consumers are
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
discovers one reports it to the local architect, which revises the remaining
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

Present architectural hypotheses separately from resolved decisions and actual
work. Link related records so differences are visible without presenting a
tentative hypothesis as a commitment or rewriting the initial prediction.

Future versions may add review gates at selected decisions. Dan-3b does not
need approval commands, approval-expiry rules or an awaiting-review state.

## 8. The harness remains the deterministic execution owner

The harness tracks each global architect fork, its decision and the brief appended to
the long-lived context. The fork exercises placement authority for its request;
the parent receives durable context updates without another model invocation.

The global architect, local architects and engineers make semantic decisions within
their respective responsibilities. The harness records work, launches
invocations, registers obligations and applies explicit
transitions. Calling a sub-session is an agent-facing operation backed by
that same execution machinery, not an untracked child conversation.

The whole run is:

```text
start -> assign entry capabilities and record the architectural hypotheses
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

Goals, architectural hypotheses, the capability registry, iteration plans,
decisions, contracts and progress live in files. The harness's durable records identify invocations
and accepted results. A crash
restarts unfinished work from those files, without duplicating registered
obligations. A caller that dies after its contract sub-session succeeds must
be able to discover that result without receiving the original reply.

Reusing an oriented session is an optimization. The global architect and every
local architect, engineer and contract sub-session must also work from a fresh
session using durable records. Runtime failures remain separate from semantic
outcomes; bounded recovery does not depend on
a person answering a review request.

### Context budgets and compaction

The harness monitors context size and applies a policy by session role:

| Session role | Context policy |
| --- | --- |
| Module engineer | Return to the local architect at the context threshold; no compaction. |
| Contract sub-session | Return to its caller at the context threshold; no compaction. |
| Global architect decision fork | Return partial findings and explicit gaps at the context threshold; no compaction. |
| Local architect or initial global analysis | Allow compaction and record every occurrence. |
| Long-lived global architect context | Append briefs without inference; any required reorientation or compaction is deferred to the next requested fork invocation. |

Each engineer or architect-decision invocation has a configurable context
threshold, leaving room below the model's context limit for a final report.
The measurement is current
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
returning to the local architect.

An architect decision fork that reaches its budget uses the same bounded
reporting mechanism, returning partial findings and unresolved questions to the
harness. This is not an accepted placement and does not trigger a parent model
call. Apply bounded retry or return an unresolved outcome to the local architect.
Inherited context counts toward the budget. If it leaves insufficient room,
reorient from durable records or compact the seed as part of the next requested
fork invocation, recording any compaction. Appending a brief never triggers this
maintenance by itself; do not repeatedly retry an oversized context unchanged.

The local architect uses an engineer's result to plan a fresh invocation. It may
narrow the goal, delegate an excluded child subtree, or continue the remaining work with
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
invocations reaching their budget, decision-fork budget returns, and
repeated budget returns for the same work item or placement request. Compaction
is a diagnostic signal of context pressure, not an
automatic failure: an initial analysis and a global architect or local architect
serving many requests have different expectations. Repeated context exhaustion
without meaningful progress is stronger evidence that decomposition needs revision.
Replacing engineer compaction with fresh invocations must not hide that signal.

## 9. Example: an email button

1. The global architect assigns the customer-page email action to
   `web/customer-page`. It hypothesizes shared email delivery for customer and
   invoice use cases, tentatively owned by `notifications`, and records that
   rationale. Only the entry assignment starts work; deeper hypotheses remain
   reviewable guidance.
2. That work item's local architect receives the delivery hypothesis and its
   rationale. It keeps button rendering local, records that refinement, and
   finds existing customer data and a missing server operation. It
   asks the global architect to resolve that need. The harness refreshes the
   view and forks the accumulated architect context. The fork investigates and
   chooses the capability and server owner. The harness records that decision
   and appends its brief to the parent without invoking the model there. The
   local architect receives the decision and plans the page's iterations.
3. An engineer implementing the action requests a contract sub-session. The
   harness suspends its writes while the sub-session defines the server
   agreement, tests and fake and integrates the fake into the page. The shared
   contract is `SendEmail`; `send-email.fake.ts` exports `createSendEmailFake`.
4. The harness registers the server obligation. The engineer receives the
   changed paths and evidence, rereads them and completes its local iteration.
5. When the page needs its real provider, the server work item starts. Its
   local architect discovers an existing notification service and requests a delivery
   placement. The next architect fork inherits the preceding decision brief,
   checks current evidence and decides to extend that service. It revises the
   relevant hypothesis: both consumers can share transport, while message
   composition remains separate. The harness records the revision and supplies
   it to affected local architects at their next coordination point. No
   speculative delivery task needs cancellation: none was scheduled. The
   actual extension follows the same contract and delegation process.
6. The server satisfies the agreement. A page iteration replaces the fake and
   verifies the real interaction. Final composition checks the feature as a
   whole.

No step waits for review. Placement, contracts and other significant choices
remain available for the person to inspect alongside the initial hypotheses.

## Open questions for the first experiment

1. **Provider scheduling and shared obligations.** How are readiness, revision
   identity and cycle detection represented with the smallest durable model?
2. **Breaking-change isolation.** Can the local architect's initial analysis identify
   affected consumers and isolate and order ordinary breaking iterations well
   enough to establish a verified baseline for dependent non-breaking work?
   This remains unvalidated, especially for changes spanning several modules.
3. **Architect decisions in forks.** Do accumulated decision briefs and current
   records preserve consistency without excessive parent context growth? What
   are the total token and latency costs, and how often is reorientation needed?
   Does combining the architect view and local source remain manageable for
   local architects?
4. **Work-item granularity.** When should related entry capabilities in one
   module share a work item? Keep this a planning judgment rather than requiring
   one item for every capability or one permanent item per module.
5. **Hypothesis feedback and local authority.** Do relevant hypotheses and
   rationales improve local choices without becoming implicit obligations?
   Can local architects distinguish routine subtree decomposition from a
   shared placement question, and act on material hypothesis revisions?
6. **Contract artifact placement and execution.** Where do the interface,
   conformance suite and fake live so that consumer and provider verification
   use the same agreement without violating project boundaries?

The first experiment should exercise one consumer, one real delegation and
verification on return, including a restart after contract registration.
It should also resolve two sequential placement requests in forks without a
diff baseline. The first revises a deeper hypothesis and records a newly placed
capability; the second inherits its brief and finds that capability in the
registry instead of inventing a duplicate. Give the local architect a hypothesis
with an external owner and multiple anticipated consumers; check that it uses
the rationale, makes a routine local refinement without an extra global call
or parent-context append, and refers counterevidence about shared placement
to a global fork. Check that a later fork finds a locally registered, still
unimplemented capability without a prior briefing. Verify a
material hypothesis revision reaches affected local architects before dependent
work is assigned, without adding speculative work or replacing accepted contracts.
Include an unrelated change, a contradicted assumption and an alternative
outside the suggested owner.
Verify that each fork investigates and decides, that the parent receives only
the concise global conclusion, and that appending it causes zero model calls. The next
fork must include it in the model input. Exercise a crash between committing
the decision and appending the brief, checking recovery without duplicate
records or briefs. Check interrupted forks, changed evidence, coverage loss
and parent-session loss. Compare context growth and total cost with the
investigation-only handoff design. An optional toolkit diff can be evaluated
separately without blocking the experiment.
Check that fake files and exports, including re-exports, follow the naming
convention, and that the architect can identify the intended provider from the
agreement without treating the visible fake as completed implementation.
That would test the central execution mechanism before broader autonomous
architectural decisions or migrations are treated as validated.
