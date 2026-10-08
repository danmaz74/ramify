# Autonomous implementation loop with global and local architects

**Status:** Current implementation design, developed from hypothesis 3b and
revised by [Plan 16](../plans/16-capability-architect/main-plan.md). The
production capability workflow has scripted verification; its live Pi and
served-browser acceptance remains a separate gate.

This design grew from [hypothesis 3](../decomposition/dan-hypothesis-3.md). It
keeps bounded execution and changes how the global
architect handles placement requests: a fork of its current context investigates
and makes the decision. A concise decision brief is appended to the long-lived
session without invoking the model there; the next fork inherits that update.
A Ramify view diff is optional, not a prerequisite.

Like hypothesis 3, it keeps bounded agent work, executable delegation and
integration on return, separates architectural hypotheses from execution
decisions, and removes all waits for human review from the MVP. The local
architect plans a module work item and tests the global architect's hypotheses
against concrete work.

The current [harness principles](../harness.principles.md) describe its
capability coordination and verification rules. The earlier
[non-breaking-only MVP](../decomposition/breaking-vs-non-breaking-plans.md)
remains a historical design boundary.

[Acceptance scenarios](acceptance-scenarios.md), implemented by
[Plan 10](../plans/10-acceptance-scenarios/main-plan.md), change this design
in four places. The initial analysis also assigns the plan's Gherkin
scenarios to entry capabilities and writes one for each entry that has none.
A run started with the review stop waits for a person's approval after the
analysis is accepted, the one human-review wait. Every committing gate runs
a scenario check, and a work item completes only when its local architect
has reported its scenarios done. The final gate runs every tracked scenario
in full mode.

The [metrics glossary](../metrics/glossary.md) distinguishes search space from
its measurements. Here, an invocation's search space is its available source
and selected views; model context usage is the tokens occupying its model
context. Neither is the frozen whole-project source-line baseline `S0`.

## The idea

The eventual harness should let a person review important choices before work
starts. This MVP instead records those choices as agents make them and
continues automatically. A person can review the decisions and resulting work
afterwards. A recorded decision is not recorded human approval.

A global architect initially identifies the top-level capabilities and their
owner modules and proposes hypotheses about deeper capabilities to reuse or
create. The hypotheses are recorded for review, but do not schedule work.
The global architect retains one long-lived context throughout the run.
Sequential forks resolve
capability identity and placement when local architects encounter actual
needs, then return concise decision briefs to that context without a parent
model invocation. Iteration planning happens locally: a local architect examines
the assigned goal, its module and the architect view, plans iterations, and
delegates each iteration to an engineer.

The local architect identifies required breaking changes and delegates
bounded engineer assignments. An engineer needing behavior outside its scope
records a capability request with actual calling code, constraints and
examples. Its partial source is captured after the writer settles. The local
architect qualifies existing behavior and, when new coordination is needed,
delegates to a fresh capability architect. That task's architect coordinates
separate owner-scoped engineers, current design, real provider and requesting
consumer checks through verified handback. The original engineer and work
item resume their broader goal after handback.

| Role | Responsibility |
| --- | --- |
| Global architect | Maintains architectural hypotheses, considers shared needs and resolves placement across responsibility boundaries or where local ownership is uncertain. |
| Local architect | Tests relevant hypotheses against module work, makes local decomposition choices, and plans and assesses engineer iterations. |
| Module engineer | Implements an assigned iteration within its goal and write scope. |
| Capability architect | Coordinates one delegated task, its owner assignments, consultation, checks and handback. |
| Harness | Runs sessions, persists records, schedules work and enforces transitions. |

The local architect is assigned to one module work item, not permanently to a
module. Its responsibility ends when that work item's own gates complete.
Local authority does not imply local-only visibility: it can consult
the global architect view to discover reuse and surrounding responsibilities.

## 1. A global architect: form hypotheses first, resolve actual needs later

The global architect's initial session reads the request and architect view.
It identifies the top-level capabilities: behavior used by a person, an external system or
a part of the project outside the requested work. It assigns each capability
to an existing or proposed module.

The entry assignments contain capability identifiers, short descriptions,
owners and references to applicable requirements and acceptance conditions.
The architect also analyzes likely deeper needs and records hypotheses about
capabilities to reuse or create, with suggested owners, rationale and
uncertainties. A need that extends existing behavior is a new capability
named for itself, forecast in the module that already holds that behavior;
no capability is ever revised to cover more. This is architectural
foresight, not an exhaustive iteration plan or an upfront breaking-change
execution gate.

**Architectural hypotheses and actual decisions are separate records.** Both
are available for display and human review, without an approval wait. The harness starts work
from the entry assignments; it never turns deeper hypothesis entries directly
into work items, capability tasks or completion requirements. The original
request remains the source of feature-level acceptance and constraints.

A top-level work item gets its goal from the relevant request requirements.
A provider's independent entry work item retains its own goal and gates. A
capability task may assign its owner while deferring that entry; the task does
not absorb or complete it.

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
then resolves the need to reuse an existing capability, or create a new
capability with an owner. Extending existing behavior is the second of
those: a new capability named for itself, owned by the module that already
holds the behavior, recorded as changing symbols that already have
consumers. The harness records the decision and returns its reference to the
local architect before contract work begins. Ordinary use of an already
identified, available API needs no new placement decision. Local refinements
within established responsibilities use the local authority described in
section 2. Unresolved responsibility boundaries,
competing reuse or placement candidates, and revisions of established ownership
come to the global architect in both breaking and non-breaking work.

The global architect resolves shared or uncertain capability identity and
ownership; the local architect makes bounded local placement and decomposition
choices and decides iterations and scope. Scoped engineers implement the
affected owners. Placement does not establish requester-specific importability
or implementation readiness. A contract, fake or partial implementation may
identify intended behavior without establishing that its provider is ready.
The architect reads current source, capability tasks, checks and handbacks to
judge what can be used. Unfinished work changes placement only when new
evidence calls capability identity or ownership into question.

### Keep architectural knowledge durable

A shared capability registry records resolved capability identifiers,
behavioral descriptions, owners and placement rationale, with references to
capability tasks and evidence as those become available. It includes
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
authority and does not create a capability task merely by placing a
capability. A concrete engineer request starts task coordination and its
separate completion gate.

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
capability tasks and placement decisions remain in durable records and the registry;
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
entry in the same module can create another work item.

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
4. Identifies broad stages, breaking segments and dependency constraints, then
   makes the next iteration executable. It chooses that iteration's goal,
   scope and completion evidence, including which whole child subtrees a
   non-breaking iteration includes. Later iterations remain a provisional
   outline rather than a detailed implementation plan.
5. Delegates each iteration to a module engineer and assesses its result.
6. Revises remaining iterations when evidence, dependencies or relevant global
   hypotheses change, reporting architectural findings and local decisions.
7. Requests work-item completion once local work and required dependencies are
   satisfied. The harness runs global checks before accepting completion;
   failures return to the local architect for scoped repair assignments.

This combines the estimate and local planning steps of hypothesis 2. The local
architect continues its session across iterations; this variant does not apply
the global architect's per-request fork mechanism to local planning. There is
no separate planning session before every iteration. Only the next iteration
is fixed; later iterations remain provisional.

The local architect owns iteration boundaries, not detailed implementation
steps. For the next assignment it determines the required outcome, search and
write scope, dependencies, applicable requirements, execution approach and
completion evidence. The engineer chooses which files to inspect, the
implementation and test sequence, and internal implementation details within
that assignment. It reports discoveries that make the boundary unsuitable
rather than silently expanding its scope.

For example, an iteration may implement the customer-page send action,
including loading, success and failure behavior, within the page and its
selected rendering child. Its completion check is the relevant consumer
tests. The local architect need not prescribe component edits,
individual test cases or each red/green step.

The local architect may assign a small work item as one iteration. Several
iterations may also use the same module scope; substantial work does not by
itself justify introducing another module boundary. Decomposition should
produce manageable goals, not a mandatory number of iterations.

The local architect's broader visibility serves a narrow planning responsibility.
It does not become an unrestricted implementation agent. It passes the engineer
a bounded goal, write scope, applicable requirements, identified external
capabilities to reuse or request, and evidence obligations. The handoff states
whether a known breaking change needs its explicit authority. For each
external capability, it identifies the proposed owner and intended role.
An engineer's new out-of-scope need enters the capability task protocol;
newly discovered dependencies can revise the plan.

Results return as concise findings, changed assumptions and artifact references,
not entire engineering transcripts. Engineers may include a recommendation for
the next iteration or a proposed split of remaining work, explaining the
dependencies or discoveries behind it. The local architect assesses that
recommendation and records the next assignment using the ordinary result
handoff; no extra planning agent or invocation is required merely to obtain
the recommendation. An engineer's recommendation does not itself change the
assigned scope or discharge unfinished obligations.

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
  base:
    module: export
    included:
      - directory: subs/formatting
        reason: Implement the formatting behavior with its owner
        instructions: Verify the whole assigned formatting subtree
```

This includes `export`'s own contents and everything beneath
`export/formatting`. Other children, such as `export/storage`, and all their
descendants are excluded. An empty inclusion list limits implementation to the
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
and any existing executable evidence. It submits the same capability request
whether the provider is a descendant or lies in another branch.

Expected providers come from the local architect's planning. A newly discovered
need is resolved within its local authority or referred to the global architect
when shared or uncertain, before a task plan is accepted. This answers an
actual execution need; it does not make architectural hypotheses executable.

The module tree still determines authority over interfaces. The module that
owns a capability normally owns its public contract and implementation. A
consumer owns a consumer-defined port that states what it needs, with providers
implementing adapters to it. An agreement between peers belongs at their common
ancestor when neither side has unilateral authority. Unifying delegation does
not erase these ownership distinctions.

Mere reuse does not justify a neutral repository of definitions. Put a contract
with the module that has authority to change the behavior it describes, and
expose its browser-safe or cross-branch surface to consumers. Keep durable
implementation records private to their owner and publish only the projections
consumers need. In ramify-agent, the harness therefore owns its map-acceptance
contract, client protocol and future run projections; the web client consumes
that exposed protocol. The previously relayed contract files now live in the
harness's `src/interfaces/`; its
[implementation plan](../plans/02-contract-authority-refactor/main-plan.md)
carried out that prerequisite refactor, preserving their behavior while
changing ownership and exposure.

### MVP boundary controls and evaluation

Start with the straightforward controls supported by pi's tool lifecycle.
The harness intercepts `edit` and `write` calls before execution and blocks
targets outside the invocation's recorded write scope. Apply the same rule to
module engineers, capability assignments and breaking iterations, using their
respective module scopes. Resolve paths relative to the invocation's working directory and
account for traversal and symlinks, including the existing parent of a new
file. If the target cannot be resolved sufficiently to check its scope, block
with that distinct reason rather than assuming it is allowed.

A blocked call returns a concise explanation naming the target and scope and
directing the engineer to report the need or use the established delegation
mechanism. It does not itself end the session or request human approval. The
engineer may continue within scope. Only a recorded architectural assignment
can change write authority; a retry or successful read does not expand it.

Read and search boundaries are soft. Default exploration to the assigned
module, included subtrees, onboarding and requester API views. Allow explicit
exploration elsewhere, record the excursion, and provide a concise reminder
on first entering another module rather than repeated warnings. Contract
sessions use their broader declared read scope. Distinguish agent exploration
from files read internally by a compiler or test runner; the latter are not
read-scope excursions. Observation through arbitrary commands may be
incomplete and must be labeled accordingly.

Record every blocked tool attempt as harness-owned evaluation evidence:

- Run, work item, iteration, invocation, session role and tool-call identity.
- Tool name, requested path, resolved target and owner where known.
- The scope revision used for the decision, timestamp and blocking reason.

Do not copy proposed file contents into the event. Count a replay of the same
invocation/tool-call record once; a new tool call retrying the same target is a
new attempt and remains visible. Keep observed guarded-call totals so reports
can show blocked counts and rates by role, tool and scope, plus repeated
attempts at the same target. Distinguish actual out-of-scope requests from
path-resolution failures. Link later delegation or scope revisions where those
records exist, without adding an agent call to classify each block. A blocked
attempt is not a source mutation and contributes no changed-line weight.

These are tool-level guards, not a filesystem sandbox. Restricting arbitrary
shell commands, introducing a command allowlist and implementing filesystem
isolation are deferred. The MVP does not try to infer shell write targets from
command text. Existing mutation observations and Ramify checks still apply,
but a shell command can bypass the `edit`/`write` guard. Evaluation must state
which tools were guarded and which activity was observed; zero blocked attempts
does not prove that all writes respected scope. No broader enforcement guarantee
is implied by enabling these controls.

## 4. A capability request and one coordinator

An engineer whose assignment needs behavior outside its scope submits a
`capability-needed` result with actual or prospective use sites, constraints,
known interface evidence and examples. Proposed signatures and pseudocode are
marked provisional. The harness settles its writer, captures staged, working
and untracked source with attribution, and suspends the original assignment
and session. Its local architect checks existing behavior and importability.
A suitable API returns to the same engineer; an unresolved boundary receives
the responsible architect's decision. A need requiring work becomes one
durable capability task with a fresh capability architect.

The task records the original request, provisional source, current plan
revision, owner assignments, consultations, checks, reviews and handback. The
capability architect reads relevant A and B source and previous decisions. It
can consult the requesting engineer read-only, or assign an explicit A-scoped
experiment with the writer. Every source change, including compatibility
repair in another owner, is made by an engineer with a module scope. Its
assignments have one task-owned sequence across owners; they do not consume
an owner's separate entry iteration numbers.

One coordinator remains active for the task. New evidence revises its plan
without rewriting the original request or dropping behavioral cases. A nested
need suspends its parent and runs depth-first. During a task, unrelated work
items, including a provider's own entry, stay deferred. The provider's entry
retains its own goal, outline, sequence and completion gate. After handback its
architect receives intervening changes and replans stale assignments before
continuing.

## 5. Real verification and return

Fakes can help an implementation, with explicit names and matching exposure,
but no fake is mandatory and a fake pass is never handback. The capability
architect decides the appropriate provider and requesting-consumer tests and
coordinates them, a combined current-source gate, review and checks of
affected owners.
A provisional type or test failure stays visible until an owner-scoped repair
and fresh gate settle it. Correcting a wrong expected value or adapting an API
test requires an explicit plan reason and preserves the original behavioral
requirement.

A handback names the accepted plan revision, current source identity, checks,
reviews, interface use and continuation brief. It follows the capability
architect's done report on the task's delegated outcome and on every
obligation it registered; the original examples stay the request's context,
with no per-example coverage state. The harness verifies those references and
the current candidate before accepting it, never a cited test file or an
executed-file inventory. It resumes the
requesting engineer and parent coordinator once; their broader work remains
open. A post-handback finding creates linked revision work without rewriting
the earlier accepted source or evidence.

An ordinary work item cannot complete with a pending request, a stopped task,
or a delegated task without accepted current handback. The harness rechecks
this predicate at the completion commit, along with ordinary scenarios,
reviews and gates. Crashes reconstruct from durable records; an interrupted
engineer with source changes needs its own structured result. A stopped task
or exhausted bound remains explicitly unfinished and never becomes an
accepted handback because a check happened to pass.

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

Breaking changes use scoped implementation: inspect affected code, change
interfaces and implementations, adapt consumers, and run relevant tests.
When discovered within a capability task, its architect coordinates affected
owners and records the necessary authority and plan revision.

Both approaches retain a bounded goal, explicit write scope, context-budget
enforcement, recorded results and verification obligations. A breaking iteration
may have an explicitly assigned scope spanning affected modules, with a narrow
change goal to keep the broader search manageable. This is a planned exception
to the ordinary module-and-selected-children scope, not permission for an
engineer to expand its own writes. Ramify importability rules still apply.

A breaking segment may take several iterations, but every successfully
completed breaking iteration must pass the global test suite and the other
required checks. The local architect plans coherent intermediate states rather
than accepting iterations with expected failures. For example, replacing an
email-address field can introduce the new representation with temporary
compatibility, migrate consumers in manageable iterations, then remove the old
representation. Tests pass at each boundary. Compatible preparation may
precede the segment where needed; breaking work need not always be first.

Where temporary compatibility is inappropriate, the interface change and
affected consumer adaptations belong in one explicitly scoped, narrowly
focused iteration. If that scope proves unmanageable, the local architect
revises the approach; the harness does not waive the gate. A crash,
context-budget return or insufficient-scope report may leave unfinished work,
but it is a partial result, not a completed iteration. Dependent non-breaking
work proceeds only from a consistent, verified baseline.

Recording a break does not discharge its consequences. Affected consumers must
be adapted and verified before the run can complete. Previously completed work
may acquire new verification obligations. Tests whose expectations the request
explicitly supersedes are revised; unrelated guarantees remain requirements.

Initial detection can miss a break. An engineer that discovers one reports it
to its coordinating architect, which revises the remaining assignments and
their execution approach. The engineer does not silently switch approaches or
expand its writes; affected owners receive separate scopes.

This draft does not introduce a dedicated migration state machine or claim
that ordinary breaking iterations have the same intermediate guarantees as
the contract-based process. Reliable identification, isolation and ordering
of broad breaking work remain hypotheses to test.

Autonomous decisions select how to fulfill the request. They do not authorize
silently weakening its acceptance conditions. When a local architect finds a
requirement cannot be met as stated, the global architect either fixes the
placement, records a plan deviation that keeps as much of the requirement as
the conflict allows, reports an environment problem, or finds nothing of the
plan worth doing, which ends the run with the conflict. An environment
problem is a conflict in how the gate or the harness runs, not in the plan or
the architecture: the run holds the work item until the operator resumes the
run, and the local architect then retries with the diagnosis. It is never
answered as a placement or a deviation. A deviation is never silent: it is a
CheckFinding the user accepts or rejects, and a run that recorded one
completes with it to review rather than claiming plain success. If the agents cannot find a viable
execution within the request and run limits otherwise, the run ends with an
explanation of the unresolved conflict.

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
invocations, commits capability requests, assignments and handbacks, and
applies explicit transitions. Consultation and nested delegation use that
same durable execution machinery.

The whole run is:

```text
start -> assign entry capabilities and record the architectural hypotheses
      -> prepare execution environment and establish a passing global baseline
      -> coordinate and execute module work, consulting the global architect
         as needed and including delegated providers
      -> verify final composition and the original acceptance
      -> complete

unresolved failure after bounded recovery -> failed, with evidence
```

Work can wait for an architect decision, capability task, check or recovery,
but never for human review. A final integration step handles composition at the common ancestor
through focused iterations. An empty work queue is not sufficient for success;
the original acceptance and all required obligations must be satisfied.

Goals, architectural hypotheses, the capability registry, iteration plans,
decisions, capability requests, task plans and progress live in files. The
harness's durable records identify invocations and accepted results. A crash
restarts unfinished work from those records without duplicate handbacks. A
caller that dies after handback can discover the accepted result without
receiving the original reply.

Reusing an oriented session is an optimization. The global architect and every
local architect, engineer and capability architect must also work from a fresh
session using durable records. Runtime failures remain separate from semantic
outcomes; bounded recovery does not depend on
a person answering a review request.

### Execution readiness and writer ownership

Before assigning engineering work, verify dependencies, required commands and
test discovery in the actual execution directory, including independent nested
packages used by the checks. Run the global test suite, type check and complete
Ramify check to establish a passing baseline. The MVP requires that baseline;
execution over pre-existing failures is deferred. Missing dependencies or a
nonexistent check command are readiness failures, not code-repair assignments.
After bounded preparation recovery, unresolved readiness ends the run with
evidence rather than waiting for review or beginning implementation anyway.

Every invocation has a distinct identity. Before transferring write authority
to another scoped engineer, checking the working tree or starting a replacement
engineer, settle the previous writer's mutating tools. On timeout, cancellation
or recovery after a crash, confirm that the superseded invocation and its
mutating subprocesses have stopped before releasing write authority. Discarding
their replies does not prevent late filesystem writes. If shutdown cannot be
confirmed, do not start another writer or accept a check against that tree.

Reject results from superseded invocations, and retain their original outcomes
for diagnosis and usage accounting. The same rule applies after a context-budget
return: a fresh engineer must not overlap an earlier tool still changing files.
The harness owns process cleanup and write authority; an agent's statement that
it has stopped is not sufficient evidence.

### Ramify hooks for engineering sessions

Every engineering invocation uses harness-installed Ramify hooks, including
module engineers, capability assignments, breaking iterations and integration
or verification iterations that edit source. Hook execution is part of the
tool lifecycle, not an optional instruction for the agent to remember.

After a settled mutation, run the bounded `ramify check --changed <path>...`
check for the observed changed paths in the target project. Deliver newly
introduced findings and explicit not-checked reasons to the engineer before
its next implementation step, and retain the complete check record with its
revision, outcome and invocation. Observe actual mutations even when a tool
fails; shell edits need changed-path capture rather than assuming only named
edit/write tools modify files. Where the mutation set cannot be established,
record the gap and use a complete check instead of claiming hook coverage.

A post-write check that times out or returns not checked permits continued
editing, but never counts as a pass. Before accepting successful iteration or
contract completion, run a complete `ramify check --format json` (or an
explicit independent `--batch` check) through the completion gate below.
Expected unfinished findings cannot satisfy that gate. Ramify checks do not
replace behavioral tests, the harness's write-scope controls or the original
acceptance conditions.

Use the installed Ramify CLI's
[hook and complete check contract](../../../docs/architecture/cli-invocation.spec.md#hook-and-complete-checks).
The existing [post-write example](../../../examples/hooks/README.md) adapts
Claude Code events; the harness needs equivalent integration with pi's tool
lifecycle. It must explicitly install that integration, because automatic
extension discovery is disabled in the current pi adapter. No toolkit source
imports or target-project editor configuration are required.

### Harness-owned testing gates and repair

The engineer proposes completion; the harness runs the required checks and
owns their verdict. A completion submission is provisional until the gate
passes. Agents may run diagnostic checks during development, but their reports
do not substitute for harness-run completion checks. The local architect still
assesses whether the result fulfills its goal; passing commands alone does not
prove semantic acceptance.

Ordinary and capability architects issue the same assignment body and use
one iteration executor. Capability coordination adds consumer/provider context
and return routing; it does not add another engineer lifecycle. Before every
engineer invocation, the common preparation refreshes and briefs each selected
owner's ordinary and testing foreign API views, separately, with actual paths,
coverage and unavailable reasons. Included child subtrees are included in this
preparation. Architect-view metadata cannot certify these views.

The common gate commits the candidate before checking it. A commit records a
candidate, not an accepted iteration. A passing gate closes the ordinary result
and schedules ordinary reviews; explicit partial work remains partial. Task
completion uses the common project-check and review-reconciliation machinery,
then returns to the suspended consumer assignment. It does not complete the
consumer's broader goal or a provider's independently queued entry.

Plan 17 owns partial/full audit selection, locking and evidence reuse. The
harness captures obligations and authorized scopes; ramify-audit executes checks
and supplies complete runner results, executed file identities, failures and
artifacts. A task handback reads no execution evidence from that public
report: the capability architect assesses it and reports the outcome. The
harness does not run a supplemental scope probe or infer repair ownership
from diagnostic paths. Required scenarios belong to the
bounded delegated goal; unrelated pending consumer scenarios stay pending.

Capture the check commands, selection policy and required evidence obligations
before the assignment starts. The engineer may add or update tests to implement
the assigned behavior, but may not narrow discovery, disable required suites
or weaken established guarantees to obtain a pass. Inspect changes to
relevant test configuration and evidence against the captured assignment.
Legitimate changes return to the coordinating architect for a recorded
revision consistent with the original request and existing contract authority.

"Local architect completion" means finishing its assigned module work item,
including accepted current capability handbacks and its own remaining gates.
It does not follow from a task handback alone. Global tests can expose failures
outside the most recent engineer's scope. Return those findings to the local
architect, which assigns scoped repair work and requests the global gate again.
It uses the existing placement and delegation rules when another owner is
needed; the failure does not authorize an engineer to expand its own writes.

```text
engineering -> completion requested -> checking -> accepted iteration result
                    ^                    |
                    |                    +-> failures -> engineer repairs
                    +---------------------------------------+

work-item completion requested -> global checking -> completed work item
                                     |
                                     +-> failures -> local architect plans repair
                                                      -> engineering and recheck
```

The harness pauses implementation writes while checking and records the
invocation, check commands, working directory, source/input identity, exit
outcomes, timing and output references. Return all relevant producer failure diagnostics and
references to the complete report and logs to the engineer. After repairs, run
the required checks under the shared audit selection and freshness policy. Source changes after a
check invalidate its result for completion. Persist passing evidence and the
accepted result before releasing dependent work; do not mark a session complete
and then depend on another response from it to finish publication.

An append-only history of gate attempts is sufficient for the MVP. Each attempt
records its iteration and invocation, tested input identity, commands and
outcomes, log references, repair round and resulting transition. A later pass
supersedes an earlier failure for completion only for the inputs it verified;
the failure remains available for diagnosis and KPIs. The harness records the producer verdict and its source identity. Immediate
check repair remains separate from the existing review CheckFindings lifecycle.

Repair uses a bounded, durable attempt counter. A context-budget return follows
the normal partial-result handoff; a fresh session does not reset the counter.
Exhaustion or an unsuitable scope returns unresolved findings to the local
architect, subject to the run's overall recovery limits. A timeout, unavailable
runner or interrupted check is not verified, never a pass; distinguish bounded
infrastructure recovery from code repair. No failure enters a human-review wait.

Use a few explicit failure categories to select recovery:

| Failure | Next action |
| --- | --- |
| Failed assertion, type error or Ramify violation | Return complete producer diagnostics to the engineer for bounded repair. The engineer decides whether a scope or design decision is needed. |
| Runner failure, unavailable daemon or other execution infrastructure failure | Harness attempts bounded infrastructure recovery; do not ask the engineer to repair application code without evidence of a code defect. |
| Invalid or lost agent session | Replace or reconstruct the session from durable records after settling its tools; preserve outstanding work and repair counters. |
| Engineer session that ends without a result: an idle or absolute bound, a provider error, an adapter fault, a session that stops on its own, or rejected submissions at their bound | After its writer settles, preserve provisional source and record the ordinary partial result with its failure digest. Return it to the issuing architect under ordinary recovery bounds. A persisted result is replayed after restart without dispatching another writer; an unconfirmed settlement blocks replacement work. |
| Required change outside the assignment or to an established obligation | Return to the local architect for a scoped assignment or recorded obligation revision. |

An invocation's idle bound measures the session's silence, not the harness's
work. A command the harness runs for the session, such as a shell call or a
scoped test run, holds the idle bound for the command's own timeout plus a
margin, because that timeout already bounds it; the invocation's absolute
bound is unchanged, so every command stays bounded.

An engineer's failure is its local architect's decision, and the architect
decides without reading a transcript. Before it is briefed the harness
records a digest from what it already holds: why the session ended, the call
in flight with the end of a command's output, what the session changed and
whether it is uncommitted, what it said last and where its transcript is. A
failure analyst then reads the transcript, the command outputs and the patch
in a reader session of its own and submits a short account: what the
engineer was attempting, what it finished, what it was doing when it ended,
the cause as a bound too tight, an environment problem, a problem in the
work, agent behavior or unknown, and a recommendation. An analysis that fails
leaves the digest alone and never fails the run. The architect then assigns a
fresh iteration, which starts from the tree with the uncommitted work,
requests completion or answers `unresolved`.

Where a bound ended it, the architect may raise that bound for the next
iteration in the assignment's `bounds`, each with a reason: a command's
maximum timeout, the idle bound and the invocation's absolute bound. The
policy holds ceilings the architect cannot exceed (30 minutes, 30 minutes and
3 hours), and a command's timeout is never longer than its invocation's
absolute bound. The run's own absolute bound is unchanged. A project may also
declare its gate command timeouts in `ramify-agent.json`
([acceptance scenarios](acceptance-scenarios.md)).

Preserve the original failure cause across recovery attempts. Repeatedly sending
the same repair prompt to an invalid session is not recovery. Infrastructure
retries and code-repair rounds are recorded separately and remain subject to
the run's overall limits; an unknown cause stays explicit rather than being
silently treated as an assertion failure.

These gates apply to successful completion, not every session exit. A session
may return partial work or request delegation without passing them, but no
failed gate is recorded as a successfully completed iteration. Breaking work
uses the same repair mechanism with global tests at every iteration boundary;
tests for explicitly superseded behavior may change, while unrelated
guarantees remain binding.

This adopts the useful Implementation Studio pattern of harness-run checks,
recorded evidence and bounded repair. The MVP does not need its broader check
registry, finding-adjudication workflow or commit/publication machinery.

### Context budgets and compaction

The harness monitors model context usage in tokens and applies a policy by session role:

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
model context usage, including cached context, rather than cumulative tokens spent.
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
unfinished changes are not assumed to pass verification. A capability engineer
that returns incomplete leaves its task unfinished; its coordinator assigns
recovery and requires a structured result before handback.

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
3. An engineer implementing the action records a capability request with the
   page's actual calling code, behavioral examples and partial source. The
   local architect checks existing interfaces, then delegates the new server
   behavior to a fresh capability architect.
4. That architect reads the page and server evidence, revises one plan and
   assigns separate scoped engineers to the server and page. If an existing
   notification service changes a guarantee used by another consumer, its
   owner receives a compatibility assignment and the original need remains
   linked through the plan revisions.
5. The architect verifies the real server behavior and page interaction
   against current source, checks affected guarantees and requests handback.
   The page engineer resumes its original assignment. The server's separate
   entry work item later replans against the intervening changes and retains
   its own completion gate.
6. Final composition checks the feature as a whole.

No step waits for review. Placement, contracts and other significant choices
remain available for the person to inspect alongside the initial hypotheses.

## Follow-up: capability dependency graph visualization

Deliver the graphical progress view in a follow-up plan. The MVP still exposes
basic progress and collects KPI evidence; deferring visualization must not defer
the execution observations needed to calculate the metrics later. Reconcile
the existing [measurements and KPIs](../measurements-and-kpis.md) contract with
this execution design, retaining baseline and per-invocation scope references,
role/session identities, usage, timing, outcomes and mutation observations
needed for change-weighted metrics. Include failures and retries; unavailable
observations remain explicit. This does not claim that collection is implemented.
Include the boundary-control attempt records and observation coverage above in
the evaluation data, independently of source-change and context-usage metrics.

### Records retained by the MVP

Keep stable capability IDs, top-level capability references and explicit
consumer-to-dependency links. Distinguish tentative hypotheses from confirmed
capabilities and dependencies, and retain revisions and superseded entries.
Link capabilities and consumer requirements to work items, capability tasks,
their handbacks and verification evidence. A hypothesized dependency does not
create an execution obligation.

The harness derives plan-relative progress from these records:

- **Todo:** expected or confirmed need, with no work started; tentative needs
  remain visibly identified as hypotheses.
- **Working on:** work has started, but required implementation, dependencies
  or verification remain outstanding. Waiting for a provider stays in this
  state, with the reason available.
- **Completed:** the behavior required by this plan is satisfied with current
  verification evidence. Fake-backed consumer tests alone do not establish it.

Previously completed work can reopen when requirements or evidence change.
Superseded hypotheses leave the active progress list without being marked
completed. Existing capabilities can satisfy a need through verified reuse.
Provider progress does not replace verification of each consumer's requirements.
These projections require no extra global architect calls or context updates.
Whole-run completion still depends on original acceptance and all required
obligations, rather than a count of completed capability nodes.

### Follow-up presentation

Show a dependency graph, not a module or decomposition tree. Top-level
capabilities appear on the left; dependencies occupy successive columns, with
arrows from each consumer to its dependencies. Show shared capabilities once,
with all incoming arrows, and count them once in progress summaries.

For an acyclic graph, use the longest dependency path from the entry
capabilities to determine columns, so dependencies appear to the right of
their consumers; direct links may skip columns. If one entry also depends on
another, dependency ordering takes precedence over keeping every entry in
column zero; retain a visible entry marker. Cycles need an explicit display,
such as a grouped cluster with internal arrows, rather than implying a valid
left-to-right execution order. Visualization does not resolve cycle scheduling.

Use neutral, blue and green for todo, working on and completed, with text or
icons as well. Distinguish tentative nodes and links independently, for example
with dashed borders and arrows. Keep unrelated positions stable where possible
as the graph evolves. Node and edge details expose the linked work, outstanding
consumer requirements and evidence. The UI renders harness records; it does
not infer dependencies from module imports or maintain a second progress model.

## Historical first-experiment questions

The questions below record the earlier contract/fake experiment. Its
provider-obligation scheduling was replaced for new runs by the capability
task protocol above. The [Plan 16 acceptance matrix](../plans/16-capability-architect/acceptance.md)
defines the current gates.

1. **Provider scheduling and shared obligations.** How are readiness, revision
   identity and cycle detection represented with the smallest durable model?
2. **Breaking-change isolation.** Can the local architect's initial analysis identify
   affected consumers and isolate and order ordinary breaking iterations well
   enough for every completed iteration to pass global checks, establishing a
   verified baseline for dependent non-breaking work?
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
Check that the first assignment is executable without a detailed full-work-item
breakdown, that the engineer chooses its implementation steps, and that a
recommended split of remaining work informs the next local assignment while
preserving unfinished obligations. Include a small case requiring only one
iteration to check that decomposition is not imposed unnecessarily.
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
Exercise a failed module gate followed by an engineer repair, a global failure
at work-item completion requiring a new local assignment, and breaking work
that remains green at every accepted iteration. Check exact-owner versus
included-subtree test selection, contract conformance obligations, unavailable
checks, exhausted repair limits and context-budget handoffs without resetting
those limits. Include missing nested-package dependencies, a missing check
command, a failing initial baseline, an invalid session, and a check timeout.
Verify that each uses the appropriate bounded recovery path and retains its
original cause. Exercise a late tool write and a late result after cancellation:
replacement work and checking must wait for writer shutdown, and the superseded
result cannot complete the iteration. Try narrowing test discovery or disabling
a required suite during repair; the gate must reject that change unless it is
part of a valid recorded revision. A crash after passing checks must recover the accepted result
without duplicate obligations; a source change must prevent stale evidence
from accepting completion. Exercise allowed and blocked `edit`/`write` targets,
new files, traversal and symlinks, and explicitly assigned contract locations.
Verify that denied calls make no mutation, return useful feedback, and retain
scope-bound records across restart without counting replayed events twice.
Separate a new retry from replay, and a resolution failure from a confirmed
scope violation. Exercise an outside read and an unguarded command so evaluation
reports expose the limits of the MVP controls. These are experiment requirements, not evidence
that the gates are implemented.
That would test the central execution mechanism before broader autonomous
architectural decisions or migrations are treated as validated.
