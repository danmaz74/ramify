# A merged implementation loop

**Date:** 2026-09-19. **Status:** Proposal; no implementation or adoption.

Keep the [work loop's](../work-loop.md) reusable item machine and deterministic
brief rendering. Keep the [implementation loop's](../implementation-loop.md)
separation of capability mapping from execution decisions. Add the different
scope shapes and multiple entry consumers identified by the
[plan-to-brief analysis](2026-09-19-plan-to-brief-spike.md).

The central rule is: **agents author semantic decisions as structured data;
the harness validates their structure, renders briefs and applies transitions.**
The capability map remains an architecture artifact, not a work registry.

This builds on the existing [merged brief process](2026-09-19-merged-brief-process.md),
with qualifications about what can be derived, what validation proves, and
how the whole run starts, resumes and finishes. The
[principles](../harness.principles.md) remain the design authority.

## 1. Four artifacts, with different jobs

| Artifact | Contains | Does not contain |
| --- | --- | --- |
| Global plan | Requested behavior, acceptance IDs, shared constraints and exclusions; observations to verify even in unchanged modules. | An exhaustive implementation schedule. |
| Capability map | Capabilities and owners, consumer/provider relationships, requester-specific reuse findings, architectural seams, proposed contract ownership and grouping. | Work items, writable scopes, iterations or task order. |
| Execution decision | Stable item goal, capability references, selected scope, applicable requirement IDs, exclusions and evidence obligations. | Invented outcome vocabulary or speculative provider implementation details. |
| Iteration note | The next bounded goal, evidence to produce, progress, remaining local work and reported needs. | A fixed sequence of all later iterations. |

Requirements have one canonical location in the plan. Decisions reference
them; the renderer includes the applicable text in a brief so the engineer
does not need the whole plan. Capability descriptions state outcomes and leave
interface shapes open unless the request or an existing contract fixes them.

An entry item can hold several related capabilities in one bounded vertical
scope. Neither a capability nor a module automatically becomes a work item.
An unchanged observer belongs in verification obligations; it needs no empty
implementation item merely to make a graph connected.

## 2. One startup decision; subsequent decisions only when needed

After mapping and approval, an architect makes the **entry decisions together**.
It identifies the highest consumers that require changes, groups related local
capabilities, chooses manageable vertical scopes and assigns their evidence
obligations. It also identifies final composition acceptance and its scope.

There may be one entry item or several. Two independent surfaces, such as CLI
and browser, do not justify an implementation item whose scope is the entire
project. Conversely, several capabilities within one surface do not require
several agents. Consumer relationships constrain the choice; an architect still
decides what constitutes a coherent item. The decision must account for all
top consumer surfaces and explain any surface needing verification alone.

This is one startup planning session, not a fresh architect before every
engineer. Whether to combine mapping and entry selection into one invocation
can be tested later; their artifacts remain separate either way.

Later needs take one of three paths:

1. **Existing and available:** use the behavior, with requester-specific access
   evidence. No provider item.
2. **Mapped and covered by an applicable execution decision:** instantiate or
   reuse the item deterministically. Its obligation includes the consumer's
   executable evidence, not just the capability's prose goal.
3. **Not yet covered:** ask an architect for the missing scope or placement
   decision. An owner ID alone does not prove that its entire subtree is a
   suitable agent scope. Structural changes go through the person gate.

For the simple case, an owner-local provider decision can be derived under an
explicit policy: one bounded owner, no conflicting assignment, established
access/contract, and a consumer obligation within the mapped capability.
Otherwise use path 3. This preserves cheap delegation without pretending that
weights or module ancestry mechanically decide cognitive scope.

## 3. Specialize scope, not the lifecycle

| Kind | Read context | Writable scope and responsibility |
| --- | --- | --- |
| Architect | Relevant global architecture and request evidence. | Capability-map revisions and execution decisions. |
| Implement | Its local onboarding, API view, goal and applicable obligations. | One selected subtree, with explicit exclusions for separately assigned descendants. |
| Contract | Consumer evidence, provider constraints and access evidence along the seam. | Shared contract source and tests, plus specifically approved exposure declarations. |
| Integrate | Feature acceptance, delivered interfaces and composition evidence. | Composition at the common ancestor, designated testing/fixture locations and bounded descendant corrections. |
| Decide | One concrete question, proposal and evidence. | A person's recorded choice. |

A contract's path is not permission to edit the behavior of every module along
it. Name the contract owner and declaration files. Exposure changes still need
architectural justification and structural approval.

Do not impose a blanket ban on ancestor and descendant item roots: recursive
vertical delegation needs both. Prevent conflicting writable assignments and
exclude a delegated descendant from its waiting parent's writes. Horizontal
implementation remains separate agents joined by a contract.

Seams may share a contract group when they carry one agreement. Group identity
is an architectural decision, not a consequence of having the same endpoint
pair. Two unrelated agreements between the same modules can remain separate.
Instantiate a new contract only when consumer evidence demands it; an existing
available agreement may need no contract work at all.

## 4. The whole run, from start to finish

```text
start(plan revision, project, run policy)
  -> map capabilities
  -> review / approve architecture
  -> decide entry scopes and goals
  -> run entry items, creating needs and side items as evidence appears
  -> verify final composition against feature acceptance
  -> completed

Any stage: hold / resume, or cancel.
Any agent item: another local iteration, contract, provider, architect or person.
```

Start records a run identity, input revision and policy, establishes one writer
for its working repository, and creates the first architect item. Starting
with a previously approved map skips only work whose revision and approval are
still applicable. New structural changes invalidate the relevant approval.

The stages above are a **spine of ordinary items**, not a second implementation
of agent control flow. Entry selection creates the entry items and a final
integration item that waits for all of them. Phase is a projection of progress
through this spine. A person's decision uses the same waiting mechanism as
other prerequisites; a run-wide hold separately stops scheduling.

Initially schedule one agent at a time, choosing the oldest ready item with a
stable tie-breaker. Agent-authored needs establish semantic order. Creation
order merely chooses between independent ready items.

**Completion requires** successful final composition acceptance, evidence for
every applicable acceptance ID, completed required entry work, and no unresolved
required needs, decisions or contract revisions. Verify unchanged observers
here too. An empty queue, an idle agent, or all providers reporting success is
not feature completion. No ready item with outstanding work is a control-plane
problem to surface, not a successful terminal state.

## 5. One item machine, one waits-for relation

Each item has a stable goal, kind, scope, requirements, and prerequisite edges.
The states are `ready`, `running`, `waiting`, `done` and `cancelled`.
Readiness after prerequisites complete is derived from the durable graph.

| Event | Effect |
| --- | --- |
| Start a ready agent item | Persist attempt identity and rendered brief; enter running. |
| Goal reached | Mark done when the completion payload satisfies the kind's protocol. |
| Partial, local continuation only | Record iteration evidence and remaining work; return to ready. |
| Partial with external needs | Record progress, create/reuse the necessary side items and wait for them. |
| Prerequisites complete | Become ready; rebuild the brief with relevant results. |
| Contract revision needed | Wait for contract review/revision, with a person decision if approval is required. |
| Cannot satisfy the request | Wait for a concrete person decision; do not silently weaken acceptance. |
| Implementation map wrong | Wait for an architect proposal and the required ownership/structural decision. |
| Runtime failure | Retry the unfinished iteration under the recorded retry policy; exhaustion creates a person decision. |
| Person answers a decision | Record its effects and settle the decision; required follow-up items still block its dependants. |
| Cancel run | Stop active execution and cancel unfinished work. |

The five semantic outcomes are fixed harness protocol: goal reached; partial
with needs; contract needs revision; cannot satisfy as specified; map wrong.
In a partial outcome, external needs may be empty when local continuation
remains. Crashes, timeouts and malformed submissions are adapter events.

Adding an edge includes a cycle check. Side-item identity includes its semantic
subject and relevant obligation/contract revision. Repeated submission of the
same need does not create another item, while a new obligation cannot be
discarded because an older item for that capability is already done.

For the initial policy, accepted external needs make the item wait as a whole.
The engineer finishes independent local work before yielding. More elaborate
scheduling of a partially blocked item is not needed for the first loop.

## 6. Item, iteration and attempt are distinct

The architect fixes the item goal. The engineer selects the next bounded
iteration from the current files and records it before changing implementation.
The harness fixes the outcome protocol and restart behavior.

An attempt executes that recorded iteration. A crash creates another attempt
of the same unfinished iteration. A successful partial result closes the
iteration and permits another. Neither event changes the item's overall goal.
An actual scope/goal change requires a recorded execution revision; it is not
hidden in a fresh prompt.

The partial payload contains:

- Iteration completion and evidence.
- Remaining work within the current scope.
- External needs, each with a capability reference when known, required
  behavior, executable evidence and applicable constraints.

For dependency baselines, a CLI compare slice passing against a fake can finish
an iteration. Save/list/delete remain local work; the real comparison/storage
behavior remains an external need. The item is partial. A large task does not
by itself require new modules or a provider invented just to get another turn.

Retry and continuation budgets are explicit run policy. Detect repeated lack
of progress using recorded obligations and evidence as well as repository
changes; a changed note or a new commit alone does not establish progress.

## 7. Executable delegation and return

```text
consumer behavior + provisional fake + tests
  -> need with executable obligation
  -> contract, if needed
  -> consumer validates any resulting fake/contract adjustment
  -> provider satisfies the agreed conformance tests
  -> consumer replaces fake, reruns its behavioral tests
  -> consumer continues locally or completes
```

A contract task may translate a provisional fake into the shared agreement.
Before dispatching the provider, the consumer must have evidence against that
agreement. If the contract changes what the original tests exercise, re-run
the consumer first. The machine can express this as the consumer's prerequisite
followed by provider activation; no new agent lifecycle is required.

Shared contract items can have several waiters. A later incompatible need
requests a revision and revalidation of affected evidence; it does not silently
reuse a completed contract. Provider completion wakes the consumer. Only the
consumer's verification against the real provider closes its delegation.

## 8. Render briefs; do not ask an agent to rewrite the protocol

Brief rendering selects from the decision, applicable plan requirements,
relevant map facts, project configuration and completed prerequisite results.
Standard role instructions, outcome schemas, iteration semantics and restart
rules are versioned templates.

A consumer gets external capability IDs and short summaries. It does not need
the providers' full goals or implementation designs. Existing API access and
import spellings remain available through its local view. New provider briefs
receive the consumer's executable obligation and shared contract when ready.

Clearly separate evidence that exists from evidence the engineer must create.
Read-first paths must exist; future output paths may legitimately not exist.
Record the map, decision and template revisions used to render every attempt.

## 9. Determinism and recovery belong to the harness

Use one durable transition record containing the accepted event and all graph
changes it causes. Replay derives item states, waits and phase. Store agent
artifacts before accepting references to them. Persist launch authorization
before starting an attempt and its accepted outcome before acknowledging it.

Retrying an outcome submission returns its existing acceptance; it never adds
the same children twice. Fence stale attempt results and stop the old worker
and its outstanding tools before a replacement starts. Agent idempotency does
not make two concurrent writers safe.

Implementation state and iteration notes live in repository files. The event
log owns orchestration state. A session transcript is optional context, never
the only record needed for continuation. Git checkpoints may help review and
recovery, but a commit is not an atomic transaction with an agent or event log;
do not make one commit per transition a prerequisite of this abstraction.

## 10. What the spikes establish, and what they do not

The [selection spike](../../spikes/briefs/results.md) supports deterministic
assembly once the necessary semantic content exists. The
[Sol spike](../spikes/work-brief-examples/results.md) supports separating maps
from bounded decisions and demonstrates why protocol text should be fixed.
Neither ran an engineer or validated the complete runtime loop.

Mechanical validation can check identifiers, references, ancestry, declared
coverage, scope conflicts, graph cycles and payload shape. It cannot prove that
an acceptance ID accurately preserves the user's requirement, that a scope is
cognitively manageable, or that evidence establishes the stated behavior.
Those remain explicit agent/person judgments. In the initial loop, the harness
checks evidence references and protocol completeness; agents run and assess the
behavioral checks. Independent evidence auditing would be a separate policy.

The existing merged-brief proposal overstates this boundary in three places:
requirement references do not prove preservation; topological roots do not
uniquely identify the right entry items; and same-endpoint seams do not always
form one contract. Keep these as reviewable decisions, not purported proofs.

The next useful experiment is to render the dependency-baselines CLI and browser
entry briefs from structured decisions, comparing them with the corrected
authored brief. Include an unchanged observer, an exposure-only need, a shared
contract and a local-only continuation as protocol cases. Stop at the brief
boundary for that comparison. Engineering execution and runtime recovery tests
are later experiments, not results claimed by this proposal.
