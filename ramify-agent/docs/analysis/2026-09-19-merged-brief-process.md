# From a plan to a brief: a merge of the two spikes

**Date:** 2026-09-19. **Status:** Proposal. Nothing here is adopted.

Two experiments took a feature request for the toolkit to the point just
before the first implementation agent:

- **Selection.** The [plan-to-brief spike](../../spikes/briefs/results.md) had
  one architect write a map that includes work items, and a script assemble
  every brief by copying from it. Its [analysis](2026-09-19-plan-to-brief-spike.md)
  follows the [work loop](../work-loop.md).
- **Authoring.** The [work-brief examples](../spikes/work-brief-examples/results.md)
  had one architect write a capability map with no work items, and a second
  architect write an execution decision and the brief as prose, under a
  coordinator's review. It follows the
  [implementation loop](../implementation-loop.md).

Each is strong where the other is weak, and their failures do not overlap.
This document proposes one process that keeps both strengths.

## What each experiment showed

| | Selection | Authoring |
| --- | --- | --- |
| The map | What and where were reliable. Work items were the source of every gap: overlapping roots, work owned by nobody, an entry scope of the whole project. | Capabilities, relationships and seams only. No gap of that kind arose, because the map never cut the work. |
| The brief's content | Thin. It has the goal, the planned capabilities and the reuse findings. It has no exclusions, no evidence to produce, no bounded first step. Goals copied whole are long, and consumers read their providers' goals. | Rich and bounded. One writable owner, explicit exclusions, required evidence, what the iteration is not a completion of. The best briefs either experiment produced. |
| The brief's protocol | Never wrong, because it is fixed text. | Wrong in every first draft. Agents invented outcome labels, called a fake-backed pass goal reached, required the engineer to read the whole request, wrote a path where an identifier was required, cited a prompt that does not exist. |
| Review | A script found the gaps. | A coordinator found them by reading, and every brief needed one or two correction turns. A real harness has no such reader. |
| Choosing where to start | Mechanical but naive: one entry point, which failed with two top consumers. | Judged, and judged wrongly at first: the large case started at a small provider until review insisted on the consumer. |
| Cost to the first brief | One session. | Two sessions and their corrections; by the same design, another session before every later item. |

Two readings follow.

**The authored briefs failed in exactly the parts that selection holds
fixed.** Outcome vocabulary, the meaning of partial, the runtime-failure
boundary, restart rules, identifiers: every correction the coordinator made to
a brief was to something a template states once. None was to the work item's
goal, its exclusions or its evidence, which is what the briefing architect
contributed.

**The selected briefs lacked exactly what the briefing architect
contributed**, and the map's work items failed because they asked the mapping
architect to make the briefing architect's decision early, for every item at
once, in a schema that could only say "subtree".

So the merge is: **agents author decisions as data; the harness renders
briefs.** Keep the second experiment's separation of map and execution
decision and the content of its decisions. Keep the first experiment's rule
that the harness writes no sentence and an agent writes no protocol.

## The merged process

```text
plan -> [architect] capability map -> validation -> person approves
     -> [architect] entry decisions -> validation
     -> render brief -> first engineer            <- both spikes stop here
     ...
     need reported -> decision derived, or [architect] when it cannot be
     -> render brief -> provider engineer
```

### 1. The map holds capabilities, not work

From the authoring experiment, with the additions both sets of architects
asked for:

- **Capabilities**, each with an identifier, an owner, a state of existing or
  new, a one-sentence summary and a goal. The goal states the outcome at its
  consumer's level and leaves an interface's shape to its contract.
- **Relationships** between capabilities: consumer and provider. This is the
  field that makes the rest mechanical.
- **Reuse**, with availability from the requester's own API view.
- **Seams**, with the agreement needed, where the contract lives, and which
  seams share one contract because they carry the same data.
- **Acceptance, constraints and exclusions** as lists whose entries have
  identifiers. Each constraint names the capabilities it binds.
- No work items, no scopes, no order.

A capability is named only when another capability consumes it or a person
could observe it. The selection spike's small plan named four capabilities for
one module's change, and they bought nothing.

### 2. Validation replaces the coordinator where it can

Both experiments ended with the same list of mechanical checks; merged:

| Check | Found by |
| --- | --- |
| Owners are canonical module identifiers that exist, or are marked proposed. | Both |
| A seam joins different branches; a relationship within one branch is never a seam. | Both. All three authored maps got this wrong at first. |
| Every reference names an existing identifier; every read-first path exists. | Authoring |
| A seam's consumer has work; two seams between the same pair are one contract. | Selection |
| Every acceptance entry and constraint is referenced by at least one capability. | New. It makes the authoring spike's "requirement preservation needs review" mechanical: the large map there lost an isolation requirement that only a reader caught. |
| A decision's consumer capability has no consumer of its own in the map. | New. It makes consumer-first mechanical: the provider-first choice in the authoring spike fails this check without a reviewer. |
| A decision's scope is one subtree, contains its capabilities' owners, and lies above no other open item's scope. | Selection |

What remains for a reader is whether the architecture is good, and that is the
person's approval, which both designs already have.

### 3. An execution decision is structured data with a fixed schema

From the authoring experiment, reduced to what only an agent can say:

```text
work item      identifier, consumer capability, scope root, goal,
               capabilities held, excluded work
evidence       what the engineer must produce to show the goal
pointers       optional source paths worth reading first, each with a reason
```

Three things leave the decision:

- **The protocol.** Outcomes, the meaning of partial, fake rules, restart
  rules and the write boundary are template text.
- **Standard reading and commands.** The module's README, its declaration and
  its API view follow from the scope. The project's test, type-check and
  self-check commands are project configuration. The authored briefs listed
  up to thirteen source files to read; a module carries its own onboarding,
  and a brief that must list thirteen files is reporting that the module does
  not.
- **The first iteration's goal**; see [iterations](#5-the-engineer-chooses-the-iteration-the-payload-says-what-remains).

### 4. Decisions are authored only where there is judgment

The authoring design spends an architect session before every item. The
selection spike showed most scopes are not a choice. Merged:

- **Entry decisions are authored.** After approval, one architect session
  writes a decision for each top consumer: each capability that nothing in the
  map consumes and that has work. Choosing the vertical root, the exclusions
  and the evidence is real judgment, and the authoring spike shows its value.
  With two top consumers there are two entry items; the selection spike's
  large plan and the authoring spike's large case both had a second surface
  that a single entry point left to chance.
- **Provider decisions are derived.** When a consumer reports a need for a
  mapped capability, the decision is mechanical: the scope root is the
  capability's owner, the goal is the capability's goal, the evidence is the
  consumer's tests that pass against its fake. No session is spent.
- **An architect is asked only when derivation fails:** the need is unmapped,
  a validation check fails, or the weights suggest a higher root is worth
  judging. This is the work loop's architect item, unchanged.
- **Contracts stay uninstantiated until a need crosses a seam**, as both
  experiments concluded. The contract item's scope is the seam's path,
  including the exposure declarations along it, and seams that share a
  contract share the item.

### 5. The engineer chooses the iteration; the payload says what remains

The authoring spike fixed each first iteration in advance and paid for it: the
briefing architect read the consumer's source to choose a slice, which is the
engineer's reading done twice. But it also found the semantics the selection
design lacked, and those are adopted whole:

- A pass against a fake is never goal reached. This is template text in every
  brief.
- A partial outcome carries three parts: **iteration completion**, what was
  finished and its evidence; **local continuation**, what remains within the
  scope; **external needs**, each with the behavior required, the evidence
  that exists, the evidence still to create and the constraints. A need names
  no owner and no interface.
- A partial outcome with local continuation and no external need returns the
  item to ready. No provider is invented to obtain another iteration. This is
  the work loop's existing transition, now with a defined payload.

The engineer still chooses each slice from the state reached and records it in
the repository before starting, so that an interrupted iteration is continued
and not chosen again.

### 6. The consumer's brief names no owner

The selection spike's consumer briefs carried each provider's owner and full
goal. The authoring protocol forbids a need from nominating an owner. Merged:
a consumer's brief lists each capability it may need by identifier and
one-sentence summary, and nothing else. It reports a need by that identifier
when one fits, and as unmapped otherwise. The harness looks the owner up; the
engineer never learns it.

### 7. The spine

```text
map -> approval -> entry decisions -> entry items -> integrate -> done
```

The integrate item holds the acceptance list and any testing module that makes
it executable. An entry item's goal is its own capability's, never the
feature's.

## The rendered brief

Every line is template text, a value from the decision, or a value from the
map:

```text
[template]   Role, write boundary, scope root                       <- decision
[decision]   Work item goal
[decision]   Excluded work
[map]        Constraints that bind the capabilities held            <- by identifier
[decision]   Evidence to produce
[config]     Commands that must pass
[derived]    Read first: module README, declaration, API view
[decision]   Optional pointers, each with its reason
[map]        Capabilities you may need: identifier and summary
[map]        Known interfaces: reuse findings for this scope, with import spelling
[results]    Since your last run                                    <- later runs only
[template]   Iterations, fakes, the five outcomes and the partial payload,
             runtime failures are not outcomes, restart from the repository
```

## What this settles between the two loop designs

| Question | Merged answer | From |
| --- | --- | --- |
| Does the map contain work? | No. | Implementation loop |
| Who writes a brief? | Nobody. It is rendered. | Work loop |
| Who decides a scope and goal? | An architect for entry items and failed derivations; a lookup otherwise. | Both |
| Who fixes the next iteration? | The engineer, in the repository. | Work loop, with the implementation loop's payload |
| How is the first consumer chosen? | By validation against the map's relationships, not by review. | New |
| What does the state machine change? | The spine gains entry decisions and several entry items. The lifecycle, the waits-for relation and the record are unchanged. | Work loop |

## What neither experiment tested

No engineer ran in either. Whether a rendered brief is sufficient, whether a
consumer reports needs that match mapped capabilities, and whether an
iteration fits a context are all unknown. Neither exercised an unavailable
reuse finding or a contract item.

## Next step

Build the merged artifacts once, on the case that strained both experiments
most: the authoring spike's dependency baselines, which has ten capabilities
and six seams. Convert its corrected capability map to the merged schema, have
one architect write the entry decisions, render the briefs, and compare the
terminal consumer's rendered brief with the authored one line by line. What
the rendered brief lacks is the list of fields the decision schema still
needs. Then run the first engineer.
