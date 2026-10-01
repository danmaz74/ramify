# Decomposition hypothesis 2: a forecast that guides, decisions made late

**Status:** Hypothesis. It revises [hypothesis 1](dan-hypothesis-1.md) and
follows the [harness principles](../harness.principles.md).

## The idea

Hypothesis 1 decomposed the whole plan before any work started. A later
variant decomposed nothing beyond the top-level capabilities and decided the
rest during implementation. The first decides too early, from too little
knowledge. The second takes away what a person most needs before work starts:
a view of every module the plan is likely to touch, and above all of any new
module it would require.

This version keeps both. The initial architect session produces a
**forecast** of the whole decomposition, and a person reviews it. The forecast
then guides the implementation and decides nothing. Each actual decision is
made when its turn comes, by the agent that then knows most. A decision that
departs from what the person reviewed returns to the person.

## Terms

A **top-level capability** is one that the plan requires and that is used from
outside the plan: by a user, by an external system, or by a part of the
project the plan does not change. "A button that sends an email" is one. A
top-level capability is new or extended, since otherwise the plan would
already be satisfied.

An **external capability** of a capability is one it needs from a module
other than its own owner's subtree. It is existing and used as it is, existing
and extended, or new.

## Phase 0: detect required breaking changes

The planner first assesses whether the requested outcome requires changing or
withdrawing existing contracts or behavioral guarantees. It distinguishes a
required break from an implementation choice: a separate interface that
satisfies the request while preserving existing guarantees can keep the plan
non-breaking.

If breaking changes are required, the MVP reports the affected guarantees,
capabilities and consumers, explains why a compatible extension is insufficient,
and stops before implementation. The user can use a normal agent to split or
revise the plan; the MVP does not undertake the breaking work.

A non-breaking plan proceeds to the forecast. The user reviews the
compatibility assessment alongside the capability map. Material uncertainty
must be resolved before treating the plan as eligible for implementation.

The implementation process below is for non-breaking work. See
[Breaking and non-breaking plans](breaking-vs-non-breaking-plans.md) for the
reasoning, the longer-term sub-plan hypothesis and the MVP boundary, including
required breaks discovered later during implementation.

## Phase 1: the forecast

One architect session works from the architect view and produces the
**forecast map**.

1. It names the top-level capabilities and maps each to its owner module,
   with the acceptance the plan states for it. This part is firm: it is the
   plan restated on the module tree.
2. For each top-level capability it guesses the external capabilities it will
   need, and recursively what those will need, until nothing new seems to
   need significant decomposition. This part is a guess and is marked as one.

A forecast capability carries little, on purpose:

| Field | Content |
| --- | --- |
| Name and summary | One sentence. No goal paragraph, no interface, no data shape. |
| Likely owner | An existing module, or a proposed new module with its parent, purpose and tags. |
| State | Existing, to extend, or new. For existing: whether the likely consumer may use it, from that consumer's API view. |
| Needed by | The capabilities expected to use it. |
| Confidence | Firm, likely or speculative. |

The earlier spike showed why it must carry so little. Architects asked for
complete goals fixed the providers' data shapes in advance, from the architect
view alone, and consumers then read those decisions before discovering what
they needed.

From these entries the map derives what the person reviews:

- **every module likely to be touched**, with a rough weight;
- **every proposed new module**, with the reason no existing module fits;
- the expected dependencies between capabilities;
- what the architect looked for and did not find.

**A person approves the forecast.** The approval covers the top-level
capabilities, the set of modules that may be touched, and each proposed new
module. It does not approve the guessed decomposition as a plan of work.

## Phase 2: the implementation loop

The loop works on one capability at a time and treats every capability the
same way, whatever its level.

### 1. Choose

The harness chooses the next capability depth-first: everything beneath one
top-level capability is finished and integrated before the next top-level
capability starts. This keeps integration on the return, one delegation at a
time, and leaves no long tail of fakes to replace at the end.

### 2. Estimate

An architect session answers one narrow question: what does this capability
need from other modules? It starts from the forecast's entries, and confirms,
corrects or drops them now that the capability's spec exists. It adds what the
forecast missed. For each external capability it states the owner, the state
and, for an existing one, its availability to this consumer.

The estimate is still an estimate. An external capability becomes real only
when a consumer writes its spec.

### 3. Plan and build

The module engineer reads its brief, its module and the estimated external
capabilities, and writes a plan of iterations in the repository: one iteration
for simple work, several when needed. Simple work in a submodule joins an
ordinary iteration; substantial work gets an iteration confined to that
submodule.

The plan decides when each new or extended external capability is needed, and
gives it a **contract iteration** at that point. The plan is a forecast too.
Only the next iteration binds, and the engineer revises the rest from the
state reached.

An existing capability that needs no extension but is unavailable gets an
access change through the architect and the required approval. The contract
iteration then integrates the existing behavior after the exposure change;
it does not invent a fake or provider implementation for behavior already real.

### 4. The contract iteration

This iteration has one focused goal:

> Establish an executable agreement for the requested capability, demonstrated
> by the consumer's real behavior working against a conforming fake.

A contract iteration is a kind of iteration,
not a role: an engineer session carries it out with the **contracts skill**,
and what sets it apart is its scope, its skill and its completion criteria.
One session owns both designing the agreement and integrating it in the
consumer, so interface design, tests, the fake and consumer integration can
converge within the same iteration.

Three rules keep that arrangement honest:

- **The harness supplies the skill.** The brief of every contract iteration
  carries the contracts skill. It is never left to the agent to load it.
- **The session could fork from the consumer module's oriented context, not from
  the session that wrote the spec.** If not available, the session starts clean.

The agreement's neutrality rests on these, on the executable completion
criteria below, and on the provider's standing to report that a contract needs
revision. It never rested on a persona.

| Area | Access and purpose |
| --- | --- |
| Consumer | Read and write, limited to establishing and integrating the agreement. |
| Contract location | Read and write to the interface, conformance tests and fake, including when they belong at a common ancestor. |
| Provider or requested capability | Read the existing provider and its constraints, or the requested capability's spec and available architectural evidence when no implementation exists. |
| Existing consumers of a capability being extended | Read access to all of them, to identify the contracts and behavioral guarantees the extension must preserve. |

The searchable space is broader than an ordinary implementation iteration's,
but the goal is narrow. Access does not require loading every module: the
agent searches relevant usages and tests and retrieves further detail when
needed. It does not implement the provider or edit other consumers. Necessary
exposure declarations are explicit additions to its write scope, proposed by
the architect and approved where required.

1. The module engineer writes a **spec** of what it needs: use cases,
   representative input and output, side effects, constraints. It proposes no
   interface and names no owner.
2. The contract iteration's session reads the spec, consumer and provider evidence. For
   an extension it also examines and preserves existing consumers' obligations.
   It designs the interface, translates the spec into executable conformance
   tests and creates a fake. Existing behavior stays real; the fake replaces
   only what is missing.
3. In the same iteration, it integrates the fake and tests into the consumer,
   replacing any provisional stub. It exercises the consumer's relevant
   behavior and fixes integration issues, adjusting the interface, fake,
   tests and consumer together as needed.
4. It records the completed agreement and evidence. The module engineer then
   continues its remaining local iterations from that integrated state.

For a new or extended capability, the contract iteration completes when:

- the consumer's relevant behavioral tests pass against the integrated fake;
- the fake passes the contract's conformance tests;
- the spec, interface, tests, fake and their revision are recorded with the
  capability as the provider's executable obligation;
- for an extension, existing consumers' contracts are preserved in the
  agreement and the compatibility checks required of the provider are recorded;
- any required structural changes have the applicable approval.

For an access-only change, completion instead requires verified consumer
access and passing behavioral tests against the existing real capability.
There is no missing provider to schedule.

An extension preserves existing consumers' contracts, including behavioral
guarantees, not just whether their code compiles. The contract iteration reads
existing consumers to identify and verify those obligations. If its proposed
design would require changes to them, it first seeks a compatible design.

If the requirement makes compatibility impossible, the iteration reports the
conflict for an explicit contract-revision decision before adopting a breaking
agreement. Only an accepted breaking change creates migration work in other
consumers. That work is separately scoped; the contract iteration does not
expand its writes into those branches. Its revised completion criteria include
the accepted migration obligations instead of claiming compatibility.

Revalidation is distinct from modification: existing consumers' tests may need
to run against the real provider to establish compatibility without any changes
to their code.

For example, changing `sendEmail()` to complete when a message is queued rather
than delivered would break callers that record delivery after awaiting it.
A separate `enqueueEmail()` can add that behavior while preserving the existing
contract. Requiring tenant context where customer IDs are no longer globally
unique can instead force a migration if old callers supply too little
information to identify the customer safely. A guessed default cannot make
that interface compatible.

The provider starts from this completed agreement. After the contract
iteration completes, changes to the interface or its behavioral obligations
require another contract iteration, even if provider implementation has not
started. Fake fixes must preserve the agreement and pass its tests. A contract
revision identifies affected providers and consumers and requires their
evidence to be revalidated before feature completion.

### 5. Complete against fakes

When its iterations end, the capability works with fakes in place of every
external capability that is not yet real. It is **fake-complete**, which is
never done.

### 6. Provide

Each specified external capability is later chosen in its turn, by step 1. It
arrives with its spec, interface and tests, and goes through the same steps:
estimate, plan and build, its own contract iterations, fake-complete. It uses
the revision recorded by the completed contract iteration. Its work is
complete when the recorded conformance tests pass unchanged against the real
implementation and its own required providers are real.

### 7. Integrate on the return

When a provider is complete, the consumer's module engineer runs again with
the same goal, replaces the fake with the real implementation and reruns its
own behavioral tests. A capability is **done** when no fake remains beneath it
and its tests pass.

### 8. Finish

When every top-level capability is done, an integration session at the common
ancestor of the touched modules resolves what the returns left: wiring,
lifecycle, configuration. The plan's acceptance decides completion.

## When an iteration finds a need nobody planned

The forecast and the estimate are both guesses, so an engineer will sometimes
find, in the middle of an ordinary iteration, that it needs something from
another module that neither mentioned. This is a normal outcome, and it is
handled as **a contract iteration that was not planned**: it produces the same
spec and joins the same path. Only the order differs, because the architect
classifies the need after the spec exists and not before.

**What the engineer does, within its session:**

1. It searches its own module's API view. If the behavior exists and is
   available, it uses it. Nothing is reported and nothing is paid.
2. Otherwise it cannot know whether the behavior exists elsewhere, and it does
   not go looking: it has no global view. It isolates the need behind a narrow
   stub of its own, so that the rest of the iteration can proceed.
3. It finishes whatever in the iteration does not depend on the need. It does
   not stop at the first obstacle.
4. It writes the spec, in the same form as for a contract iteration: use cases,
   representative input and output, side effects, constraints; no interface,
   no owner. It adds the failing test or the test that passes against its stub.
5. It revises its plan of iterations in the repository and reports partial
   completion with the need.

**What the harness does with the need** depends on its kind, which an architect
session decides from the spec:

| The architect finds | What follows |
| --- | --- |
| It exists and is available; the engineer missed it. | The engineer runs again with the finding. |
| It exists but is not available. | The architect proposes the exposure declarations along the path; new exposure between branches is approved by a person. The contract iteration applies the approved changes and integrates the existing behavior in the consumer. |
| It exists and must be extended, or it is new, in a module the person reviewed. | Its spec is recorded in the registry. A contract iteration designs the agreement, tests and fake and integrates them in the consumer. It becomes specified when that iteration completes. |
| It needs a new module, or a module outside the reviewed set. | A person decides first, as for any [departure](#departures-from-the-forecast). |
| Its owner lies within the engineer's own subtree. | It was never external. The engineer implements it. |

**What the engineer does on its next run:** it continues from its revised plan
with the contract's fake and tests already integrated and verified by the
contract iteration, or with the real behavior integrated for an access-only
change. Missing or extended behavior is later provided and integrated like
any other.

Three consequences:

- The engineer's session ends when it reports, and its next run would pay for
  orientation again. This is the main case for
  [reusing an oriented context](../harness.spec.md#an-oriented-context-is-reused-never-required):
  the next run continues from the session that already knows the module.
- The engineer's own stub is not a contract. It is provisional, confined to
  the consumer, and replaced during the contract iteration. Nothing is ever
  implemented against it by a provider.
- The number of unplanned needs per capability measures the estimates, as the
  forecast-to-actual difference measures the forecast. If estimates rarely
  miss, they earn their cost; if engineers keep finding what architects did
  not, the estimate step should shrink and this path should carry the load.

A need that is small and generic tempts an engineer to write it locally. The
brief says to search the API view first. When the engineer still implements
something locally that may exist or belong elsewhere, it says so in its
result, and the architect decides later whether it is a duplicate.

## How the forecast guides without deciding

| Moment | Use of the forecast |
| --- | --- |
| The person's review | The whole expected reach of the plan, before any work. |
| Step 2 | The architect's starting point, so an estimate confirms and corrects instead of searching from nothing. |
| Step 3 | The engineer sees which external capabilities are expected, and plans their contract iterations early. |
| The registry | Every capability has one record, and a second consumer finds a capability that is forecast or specified instead of inventing it again. |

Every actual decision updates the map, which always shows the forecast beside
what happened. The difference between the two is the measure of how well
architects forecast, and whether the forecast earns its cost.

## Departures from the forecast

Most departures are normal and cost nothing: a guessed capability that was
never needed is dropped; a different existing capability serves; a capability
moves between two modules the person already reviewed.

Two departures touch what the person approved, so they return to the person:

| Departure | What happens |
| --- | --- |
| A new module that the forecast did not propose. | A person decides before any work in it starts. |
| Work in an existing module outside the reviewed set. | It is recorded and shown. Whether it also pauses the run is a policy; the first version pauses. |

The approval therefore keeps its meaning through the whole run: nothing
structural happens that a person has not seen.

## The life of a capability

```text
forecast ---> specified ---+
                          |
identified ---------------+--> estimated -> building -> fake-complete -> done

forecast -> dropped        when no consumer ever writes its spec
```

Top-level capabilities start as identified. An external capability becomes
specified when its contract iteration records the spec, interface, tests and
verified consumer integration of the fake. A fake-complete capability waits
for its providers, then replaces each fake and verifies its own behavior
before becoming done.

This sits on top of the [work loop](../work-loop.md)'s item machine and leaves
it unchanged. The kinds of item are: architect, for the forecast and each
estimate; engineer; contract iteration; integrate; and a person's decision.
There are two kinds of agent, the architect and the engineer. The contract
iteration stays a kind of item because its scope, its completion criteria and
its freeze rule differ, although an engineer carries it out. An
engineer item reports partial and waits for a contract item at each contract
iteration. That item owns the focused consumer edits until the integrated
agreement is verified; the ordinary engineer does not write concurrently.
The engineer resumes its local work, reports partial again when fake-complete
and waits for its providers, and its next run is the integration on the return.

## The example

The plan: a button on the customer page that sends the customer an email. The
address is already in the database.

**Forecast.** Top-level, firm: *send the customer an email from the customer
page*, owner `web/customer-page`. Guessed beneath it: *request an email for a
customer*, new, in `server/api`, likely; *look up the customer's contact*,
existing in `server/customers`, available to `server/api`, firm; *deliver a
message*, new, in a proposed new module `server/mail`, likely. Modules
touched: `web/customer-page`, `server/api`, `server/mail` (new), and `shared`
for the interface.

**Review.** The person sees a new module proposed and asks why mail delivery
does not belong in `server/api`. The architect's reason stands, and the person
approves.

**Loop.**

1. Chosen: the button. The estimate confirms *request an email* as new in
   `server/api`.
2. The page's engineer plans three iterations: the button and its behavioral
   tests; a contract iteration for *request an email*; the confirmation and
   error states.
3. The page's engineer writes the spec. The contract iteration, an engineer
   session with the contracts skill, forked from the page module's oriented
   context, reads the page and `server/api`, puts the interface and conformance
   tests in `shared`, creates the fake and integrates it into the page. It
   fixes integration issues until the fake passes the conformance tests and
   the page's relevant behavioral tests pass. It records that agreement; the
   page's engineer resumes to finish confirmation and error states. The button
   is fake-complete.
4. Chosen next, depth-first: *request an email*, already specified. Its
   estimate confirms the contact lookup and mail delivery, and adds what the
   forecast missed: the mail server's settings, existing in `server/config`
   and available. No module outside the reviewed set is involved, so nobody is
   asked.
5. The `server/api` engineer builds the route against a fake of *deliver a
   message*, designed and integrated through its own contract iteration.
   Fake-complete.
6. Chosen: *deliver a message*. `server/mail` was approved in the forecast, so
   work starts at once. It needs nothing external, and is done when its tests
   pass.
7. On the return, `server/api` replaces its fake and is done; then the page
   replaces its fake and is done.
8. The integration session registers the mail module in the server's
   composition, and the plan's acceptance passes.

Had step 4 found that mail delivery needed a second new module, a queue, the
run would have paused there for the person.

## Open questions

1. **Does the forecast earn its cost?** The initial session is the expensive
   kind: the spike measured 90k to 130k tokens whatever the plan's size. The
   forecast-to-actual difference, over several plans, answers this.
2. **Does a forecast bias the agents that read it?** A guess shown to an
   engineer may be followed because it is there. Keeping entries to one
   sentence, with a stated confidence, is the mitigation; whether it suffices
   is to be observed.
3. **The cost of one estimate per capability.** Each estimate forks from the
   forecast session at the point where it was oriented, under the principle
   that [an oriented context is reused](../harness.spec.md#an-oriented-context-is-reused-never-required),
   so it pays for the question and not for the orientation. The same holds
   for an engineer returning to its module to replace a fake. Unmeasured.
4. **Where the interface, the conformance tests and the fake live**, so that
   the same tests run unchanged against the real provider and the fake breaks
   no project check. This is open in every design so far.
5. **How depth-first choice treats a capability shared by two top-level
   capabilities.** A second consumer's extension must preserve the first
   consumer's contract. Revalidation can include consumers already done without
   requiring changes to them. An explicitly accepted breaking change instead
   creates migration obligations. How the scheduler represents revalidation
   and accepted migrations remains open.
6. **The contracts skill does not exist yet.** It has to carry what the role
   was assumed to know: reading the provider before designing, preserving
   existing consumers' guarantees, faking only what is missing, conformance
   tests that state observable behavior, and the evidence its result records.
   Whether a consumer-side session with that skill designs agreements a
   provider can satisfy is the first thing a trial should measure, by counting
   contract revisions that providers request.
7. **Whether the focused goal keeps contract iterations manageable.** They
   can search both sides and all existing consumers of an extension. Whether
   progressive reading keeps the working context bounded needs to be tested.
