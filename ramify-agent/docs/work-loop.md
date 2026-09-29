# The work loop as a state machine

**Status:** Superseded proposal. Its fake-first state machine extends the
[draft architecture](architecture.md) and [Plan 1](plans/01-implementation-map/main-plan.md)'s
job model. The current implementation design is the
[autonomous implementation loop](architecture/autonomous-implementation-loop.md).
Nothing in this proposal is claimed as implemented.

This document designs the harness's control loop under the
[harness principles](harness.principles.md). Agents make every semantic
decision and are nondeterministic. The loop around them is a deterministic
state machine: a pure function of a recorded event log, with a closed set of
states, triggers and transitions.

## The one abstraction

A **work item** is a scope on the module tree, a goal, and an actor. It is the
only thing the loop knows.

Two rules make it sufficient:

1. **An item has one goal for life.** Every invocation means the same thing:
   *make this goal true, starting from the repository as it is now.* Under the
   [idempotency principle](harness.principles.md#agent-invocations-should-be-considered-idempotent),
   the first run, a run after a crash, and a run after a provider has delivered
   are the same operation with a fresher brief. The loop has no resume step, no
   return step and no reopened item with a new goal.
2. **An item that cannot finish waits for other items.** Every side quest,
   escalation and pause is an item that another item waits for. A pause for a
   person is an item whose actor is a person.

The loop is therefore one item lifecycle, one relation between items, and one
table that says which items an outcome adds.

## The whole run

A run takes one plan from a person's start command to a branch that passes the
feature's acceptance. Its backbone is a **spine** of four items, always the
same. Everything else is a side quest that some item waits for.

```text
person: start run
      |
      v
+-----------+  map   +-----------+ approved +--------------+  entry   +-------------+ acceptance +------+
|  mapping  | -----> | approval  | -------> | implementing | -------> | integrating | ---------> | done |
+-----------+ saved  +-----------+          +--------------+  item    +-------------+   passes   +------+
 i1 architect         i2 decide              i3 implement      done    i4 integrate
                                               |    ^                    |    ^
                                               v    |                    v    |
                                     side quests: contract, implement, architect, decide
                                     (each may have side quests of its own)

from any phase:   stop -> held -> resume        abort -> aborted
```

The phase is derived: it is the first spine item that is not settled. A run
whose only ready item is a decision shows as awaiting a person, whatever its
phase. A run has no failed state. Whatever the loop cannot resolve becomes a
decision, and only a person's abort ends a run early.

**Start.** A person chooses a plan and sends the start command. The harness
takes the project lock, captures the plan, prepares the place where the run
works, and writes the first line of the log: the run and item i1, an architect
item whose subject is the plan. From then on the driver only asks the machine
what is next.

**The spine grows once.** When i1 saves map revision 1, its expansion adds the
other three spine items together: i2, the approval; i3, an implement item at
the map's entry point, waiting for i2; i4, the integrate item, waiting for i3.
The entry point is unknown before the map exists, which is why the spine is
not seeded whole.

**Middle.** i3 is the highest consumer. It works against fakes and reports its
needs; each need adds items that i3 waits for; each of those may do the same.
The graph grows downwards from i3 and settles back towards it. When i3 is done
no fake remains beneath it.

**End.** i4 becomes ready, composes what the delegations left, and reports
goal reached when the feature's acceptance passes. Every item is then done.
The harness writes the closing line with the final commit and releases the
lock. The person receives a branch with one commit per transition, the log,
and the need-to-know results: changed contracts, changed assumptions and
follow-ups. Merging is the person's act.

The smallest possible run is the spine alone: four items, three agent
sessions and one approval. That is the right shape for a feature the map
places in one subtree.

## The item lifecycle

```text
                  every awaited item is settled
        +---------+ ---------------------------> +-------+
        | waiting |                              | ready |
        +---------+ <---+                        +-------+
             ^          |                          |   ^
             |          | runtime failure,         |   | runtime failure,
             |          | limit reached            |   | below the limit
             |          | (+ a decision item)      v   |
             |          |                        +---------+
             |          +----------------------- | running |
             +---------------------------------- +---------+
               any outcome but goal reached           |
               (+ the items it now waits for)         | goal reached
                                                      v
                                                   +------+
                                                   | done |
                                                   +------+
```

| From | Trigger | To | Also |
| --- | --- | --- | --- |
| waiting | Every awaited item is settled. | ready | Derived, never recorded. |
| ready | The scheduler starts an attempt. | running | The brief is built and its hash recorded. |
| running | Outcome: goal reached. | done | The [expansion](#the-expansion-table), usually empty. |
| running | Partial, with no needs, and the checkpoint differs from the last one. | ready | The next [iteration](#work-too-big-for-one-session). |
| running | Any other outcome. | waiting | The expansion adds at least one item, and the item waits for them. |
| running | Runtime failure, below the limit. | ready | The failure count rises. |
| running | Runtime failure at the limit. | waiting | A decision item is added and awaited. |
| ready, person item | A person's decision is recorded. | done | The expansion of the choice. |
| any but done | The run is aborted. | cancelled | |

Done and cancelled are **settled**. Three invariants follow from the table and
are enforced by the machine, not by convention:

- **No busy loop.** An item runs again only after a runtime failure, after
  something it waited for settled, or after its own run changed the
  repository. Something it can read has always changed: the repository, the
  map, or a person's note.
- **No silent stall.** An outcome other than goal reached that adds no item
  and changed nothing receives a decision item by default. An item can never
  return to ready with nothing new.
- **Every loop is bounded.** Consecutive runtime failures per item and total
  runs per item each have a limit. Reaching either adds a decision item. A
  person's choice to continue resets the counters.

### Runtime failures

A crashed session, malformed output after the in-session correction bound, a
session that ends without a submission, a timeout, and changed inputs during
an architect attempt are runtime failures. None is a semantic outcome. All
take the same transition: back to ready, and the next attempt starts from the
beginning with the same brief.

Two interruptions do not count toward the limit: a person's stop and a harness
restart. On startup the harness closes every attempt that has no recorded end
as interrupted. That is the whole of crash recovery. A failed attempt leaves
the working tree as it is; the next attempt reads it.

### Work too big for one session

An item keeps its goal for life, but one session need not reach it. A run of
an item is one **iteration**, and an item may take several. This needs no new
kind, no new state and no new outcome: partial, with no needs, returns the
item to ready.

Work can be too big in two ways, and only one of them is an iteration:

| Too big in | Meaning | What happens |
| --- | --- | --- |
| Length | Many steps, all within a context one agent can hold. | Iterations of the same item. |
| Breadth | The scope is more than one agent can hold. | The agent reports that the map is wrong. The architect lowers the work item's root or splits it, which creates seams. A larger context is never the remedy. |

**The engineer chooses the iteration, from the state reached.** The map gives
a work item its weight and nothing finer, and the harness cannot choose a
goal. The engineer's role prompt therefore says:

1. Read the work note in the scope's root, if there is one.
2. If the goal will not fit in this session, choose the next slice that ends
   in a verified state, and write it in the work note before starting.
3. Do it. Update the note: what is done, what remains, what was learnt.
4. Report goal reached, or partial.

Only the next iteration's goal is ever fixed, and it is fixed in the
repository. A session that crashes in the middle of an iteration is started
again, finds the slice in the note, and continues it: idempotency holds within
an iteration as it does within an item. Each iteration is a fresh session, so
the agent's context does not grow with the size of the work. The note is
removed when the goal is reached.

The machine adds two mechanical guards. The checkpoint commit after a partial
run must differ from the previous one; a run that changed nothing gets a
decision, not another run. And the limit on runs per item applies, scaled by
the work item's weight in the map. An item that exhausts it is evidence that
the scope was too large, and the decision offers a revised map.

Needs and iterations combine freely. A partial outcome with needs makes the
item wait as before, and when it runs again the work note tells it where it
was. Nothing that waits for a large item is delayed by its iterations more
than by its size: a consumer is already finished against its fake and waits
only to replace it.

## The graph: one relation

Items are joined by one relation: **waits for**. An item is ready when
everything it waits for is settled. The relation expresses all three orderings
the loop needs:

- a consumer waits for its provider, which is the delegation and its return;
- a provider waits for its contract item, which is ordering within a seam;
- any item waits for a decision, which is a pause.

An item is identified by a key of its kind and subject, such as
`contract:<capability-id>` or `implement:<work-item-id>`, where the work item
is one the map proposes: a subtree root and the planned capabilities that fall
within it. Adding an item whose key exists makes the
requester wait for the existing item instead. This deduplicates needs. If the
existing item already waits, directly or transitively, for the requester, the
machine adds a decision item that reports the cycle. The graph stays acyclic
by construction, because a new item is awaited only by items that exist and
waits only for items added with it.

The run's state is derived from the graph and one flag:

| Run state | Condition |
| --- | --- |
| held | A person stopped the run. Nothing starts until it is resumed. |
| working | An agent item is ready or running. |
| awaiting a person | No agent item is ready or running, and a decision is ready. |
| done | Every item is done. |
| aborted | A person aborted the run. |

Acyclicity and the no-silent-stall invariant make any other condition
impossible; the machine asserts it.

The scheduler picks the oldest ready agent item and runs one item at a time.
Running several ready items with disjoint scopes changes the scheduler only.

## Kinds specialize the item

A kind supplies five things and no control flow:

| Part | Meaning |
| --- | --- |
| Actor | An agent or a person. |
| Scope | The cut on the module tree the item reads and the cut it may change. |
| Brief | A pure function of the item and the run's state. |
| Outcomes | The subset of the [closed set](harness.principles.md#a-small-closed-set-of-outcomes-is-the-whole-protocol) the kind may report, each with a payload schema. |
| Expansion | A pure function from an outcome to the items it adds. |

| Kind | Actor | Scope | Goal reached means |
| --- | --- | --- | --- |
| architect | agent | Reads the architect view; writes only the map. | A map revision that places the subject: the plan, for the first item, or one need. |
| implement | agent | One subtree. | The goal's behavioral tests pass with no fake in place of a provider. |
| contract | agent | Reads both sides of one seam; writes only the contract. | Interface types, conformance tests and, when required, a fake. |
| integrate | agent | The subtree of the lowest common ancestor of the touched modules. | The feature's acceptance passes. |
| decide | person | The question and its evidence. | A recorded choice with a note. |

The plan is the first need, and the first architect item answers it with map
revision 1. Initial mapping and a later question to the architect are the same
kind with different subjects.

The brief is rebuilt at every attempt from the item's goal and scope, the
current map revision, the need-to-know results of every item it has waited
for, and the notes of decisions it has waited for. It carries planned
capabilities with their identifiers and reuse findings as paths into the
module's generated API view. Because the brief is a pure function of recorded
state, a repeated attempt receives the same brief, and a later run receives
what changed without the loop tracking why it runs again.

An agent ends an attempt by calling one submission tool whose input is the
outcome. A need in a partial outcome names a planned capability's identifier
or states that it is unplanned, and points to its evidence in the repository:
the failing test, the stub, the tests that pass against the fake. The agent
does the matching; the harness only looks the identifier up.

## The expansion table

This table is the loop's whole policy. Each row is a pure function, and
changing the first version's behavior means changing rows, never the
lifecycle.

| Kind | Outcome | Items added; the reporting item or its waiters wait for them |
| --- | --- | --- |
| architect, the plan | Goal reached: revision 1. | `decide` to approve the map. `implement` at the entry point, waiting for the approval. `integrate`, waiting for that `implement`. |
| architect, a need | Exists and is available. | None. The finding reaches the waiters' briefs. |
| architect, a need | Exists but is not available. | `decide` to approve the exposure declarations, then an `implement` for the revision's exposure-only work item, rooted at the lowest common ancestor of the path. |
| architect, a need | Missing: a new planned capability in a revised map. | `decide` when the revision is structural. `contract` for the seam. `implement` at the owner, waiting for the contract. |
| architect | The planned ownership is wrong. | `decide`. |
| implement, integrate | Goal reached. | None. |
| implement, integrate | Partial, with needs. | For a planned need: `contract` for the seam and `implement` for the map's proposed work item that holds the capability, waiting for the contract. For an unplanned need: `architect` with the need as its subject. |
| implement, integrate | Partial, with no needs. | None when the repository changed: the item is ready for its next iteration. Otherwise `decide`. |
| implement, integrate, contract | A contract needs revision. | First version: `decide`. Later: `contract` for the revision. |
| implement, integrate, contract | Cannot be satisfied as specified. | First version: `decide`. |
| implement, integrate | The implementation map is wrong. | First version: `decide`. Later: `architect` with the evidence as its subject. |
| decide | Continue, with a note. | None. The waiters become ready and their briefs carry the note. |
| decide | Revise the map, with a note. | `architect` with the note as its subject. |
| decide | Abort. | Every unsettled item is cancelled. |

When a settled item adds items, whatever waited for it now waits for them as
well. That is how an architect's answer turns into a seam without running the
consumer again merely to repeat its need.

## A worked example

The plan: *add a button to the customer page that sends the customer an
email.* The project is a web application with a React front end, and the
customer's address is already in the database.

```text
app
  shared          wire types both sides receive
  web             React client, tagged [ui, browser]
    customer-page
  server
    api           HTTP routes
    customers     customer records and their database access
    config        settings read from the environment
```

### Mapping and approval

i1, the architect, works from the architect view and saves revision 1:

| Section | Content |
| --- | --- |
| Entry point | `web/customer-page`. Acceptance: pressing the button delivers one email to the customer's address and the page confirms it. |
| Reuse | `findContact` in `server/customers` returns the address and is available to `server/api`. |
| New capabilities | C1, *request an email for a customer*: owner `server/api`, consumer `web/customer-page`. C2, *deliver a message*: owner a proposed new module `server/mail`, consumer `server/api`. |
| Seams | C1, because `web` and `server` are different branches. C2 joins two children of `server`, so it is a seam only for work split beneath `server`. |
| Proposed work items | W1 rooted at `web/customer-page`. W2 rooted at `server`, holding C1 and C2: both are small, so one agent takes the subtree. |

The expansion adds i2, i3 and i4. The person reads the map, sees the proposed
module `server/mail`, and approves. i2 is done and i3 is ready.

### The run

```text
i3 implement:W1  web/customer-page
     writes the button and its behavioral test: press -> request -> confirmation
     no endpoint exists, so it writes a fake of C1 and makes its tests pass
     -> partial, need C1 (planned), evidence: the fake and the tests that use it
        + i5 contract:C1      ready
        + i6 implement:W2     waiting for i5
        i3                    waiting for i5, i6

i5 contract:C1   reads web/customer-page and server/api, writes only in shared
     request and response types, conformance tests, the fake moved beside them
     -> goal reached

i6 implement:W2  server
     attempt 1: the session crashes while server/mail is half written
     -> runtime failure 1 of 3; ready again; nothing else changes
     attempt 2: same brief; reads the tree, keeps what is there, continues
     the route uses findContact, as the brief's reuse finding says
     server/mail needs the mail server's settings, which the map never mentioned
     -> partial, need "mail server settings" (unplanned),
        evidence: a stub and a test marked as expected to fail
        + i7 architect:need   ready
        i6                    waiting for i7

i7 architect:need
     server/config exposes a settings reader, and server/mail receives it
     -> goal reached: exists and is available; no items added

i6 implement:W2  attempt 3
     the brief now carries i7's finding; removes the stub
     the conformance tests of C1 pass unchanged against the real route
     -> goal reached

i3 implement:W1  second run, same goal
     the brief lists C1 as provided; replaces the fake with the real client
     its behavioral tests pass with no fake in place
     -> goal reached

i4 integrate     app
     registers the mail module in the server's composition, adds the settings
     to the environment template, runs the acceptance against a local mail sink
     -> goal reached

run done: 7 items, 9 agent sessions, 1 decision, 8 commits
```

What the machine did in all of this: it started the oldest ready item nine
times, recorded eight outcomes, one failure and one choice, and applied five
rows of the expansion table. It never learned what an email is.

### The same feature with other maps

The map decides the run's shape; the machine is unchanged.

- **The architect roots one work item at `app`.** In a small project that is
  the right call for a button. No need is ever reported, and the run is the
  spine alone: mapping, approval, one implement session, one integrate
  session.
- **The architect splits `server`.** If mail delivery were heavy, W2 would
  become a work item at `server/api` and another at `server/mail`. C2 is then
  a seam for the work: i6 fakes it and reports it, a contract item and an
  implement item are added one level deeper, and i6 runs again on their
  return, exactly as i3 did.
- **The discovery is expensive.** Had i7 found no settings reader anywhere, it
  would have revised the map with a new capability. Its expansion would add a
  decision if the revision were structural, then a contract and an implement
  item, and i6 would wait for them without running in between.
- **The discovery is a dead end.** Had i6 reported that C1's contract cannot
  be met, the first version adds a decision. The run shows as awaiting a
  person, and the person continues with a note, asks for a revised map, or
  aborts.

## From the map to a brief

The harness makes no semantic decision, so it cannot write a goal. **Every
sentence of a brief was written by an agent or a person; the harness selects
sentences by identifier and puts them in a template.** Four authors supply
them:

| Author | Writes | Where it is recorded |
| --- | --- | --- |
| The architect | Each capability's goal, each work item's root, the reuse findings, the acceptance. | The map. |
| A consumer | What it needs, as a fake and the tests that use it. | The need in its partial outcome, pointing to repository paths. |
| A provider | What changed for whoever delegated: contracts, assumptions, follow-ups. | The result in its goal-reached outcome. |
| A person | The plan; a note with a choice. | `plan.md`; the decision. |

This fixes what the map must contain. It is not only a picture of where the
work falls; its work items and capabilities are the **registry of goals** for
the whole run:

- a capability has an identifier, an owner, its consumers, and a goal of one
  paragraph that states an outcome that can be verified;
- a work item has an identifier, a subtree root and the capabilities it holds;
- a reuse finding names the module that would use it, so a brief receives only
  the findings whose user lies within its scope;
- the entry point has the feature's acceptance.

One invariant follows: **every implement item is a work item of the map, and
every contract item is a seam of the map.** An unplanned need never becomes an
item directly. It goes to the architect, whose revision adds the capability
and assigns it to a work item, and the expansion then reads the revision like
any other. The same holds for exposure declarations: the revision carries them
as a work item of weight exposure only.

### What each kind's brief selects

| Kind | Goal | Evidence and obligations | Since the last run |
| --- | --- | --- | --- |
| implement, the entry | The map's acceptance. The plan, as a path. | Reuse findings for its scope. Planned capabilities it may need, with identifiers. | Results of what it waited for. |
| implement, a provider | The goals of the capabilities its work item holds. | The contract of each seam it provides: the conformance tests that must pass unchanged against the real implementation. Reuse findings for its scope. Planned capabilities it may need. | The same. |
| contract | The seam's capability goal and its two sides. | The consumer's need: its fake and the tests that use it. | Decision notes. |
| architect, a need | The need. | The current map. The requester's module, for its API view. | Decision notes. |
| integrate | The map's acceptance. The plan, as a path. | The modules touched. The seams, with their conformance tests. Follow-ups from every result. | Results of what it waited for. |

The plan reaches only the architect, the entry item and the integrate item.
Everything beneath the entry item learns the feature through what its consumer
needs, as tests. That is how requirements travel: the map says where, the
consumer's tests say what. A provider for the email button never reads that
the feature is a button.

What a brief leaves out is as deliberate. It carries no module documentation,
because the session starts in the scope's directory and the module carries its
own onboarding. It carries paths and import spellings, never the content of an
interface. It carries no account of how other items did their work.

### The example's briefs

i3, first run, as the agent reads it:

```text
Role: engineer.  Scope: web/customer-page (this directory and its descendants).
Map revision: 1.  Plan: plans/email-button/plan.md (read it if the goal is unclear).

Goal
  Pressing the button delivers one email to the customer's address and the
  page confirms it.                                   <- map: acceptance

Planned, outside your scope                           <- map: capabilities
  C1  request an email for a customer   owner: server/api
  If you need one, write a fake of only what you lack, make your behavioral
  tests pass against it, and report the need by its identifier.

Known interfaces                                      <- map: reuse, for this scope
  (none)

Report one outcome with submit_outcome: goal reached | partial, with needs |
contract needs revision | cannot be satisfied | the map is wrong.
```

i6, the provider:

```text
Role: engineer.  Scope: server.  Map revision: 1.

Goal                                                  <- map: goals of C1 and C2
  C1  Given a customer's identifier, send that customer the email and report
      whether it was accepted for delivery.
  C2  Deliver one message to one address through the configured mail server.
      Proposed new module: server/mail.

Obligations                                           <- i5's result
  C1  shared/src/tests/request-email.conformance.test.ts must pass unchanged
      against your implementation. The fake beside it shows the expected behavior.

Known interfaces                                      <- map: reuse, for this scope
  findContact   server/customers   available to server/api as "…/customers"
```

i3, second run. The goal and scope are identical; one section is new:

```text
Since your last run                                   <- results of i5 and i6
  C1 is provided. Contract: shared/src/interfaces/request-email.ts.
  The real client is available to you as "…". Replace your fake with it.
  Follow-ups: none.
```

Every line is traceable to a record, which makes a brief reproducible and
lets a person ask of any sentence who wrote it.

### From a brief to a session

The agent adapter turns a brief into a session with four mechanical inputs:

| Input | Source |
| --- | --- |
| System prompt | The role prompt of the kind. Role prompts are versioned parts of the harness, and the attempt records the version. |
| First message | The rendered brief, saved as `brief.md` in the attempt's directory. |
| Working directory | The directory of the scope's root module. |
| Tools | The kind's set: read and search for every kind, write for all but the architect, and `submit_outcome` with the kind's outcome schema. |

Before the session starts the adapter materializes the API view of the scope's
root and makes sure the post-write check is active. Both belong to the
environment; neither appears in the brief beyond a path.

## Decisions

A decision item carries a question, its evidence as repository paths, and the
allowed choices. It is ready as soon as it is added, the web client shows it,
and a command records the choice. Plan 1's command rules apply unchanged:
command identifiers, expected versions and receipts.

Map approval, approval of structural changes, the three pausing outcomes,
exhausted limits and cycles are all this one kind. Automating a pause later
means replacing its row's `decide` with an agent item; an autonomy policy is a
function that answers some decisions without a person. Neither changes the
lifecycle.

## The durable record

A run is `plans/<plan-id>/.harness/run/events.jsonl` in the target project,
under Plan 1's rules: the log is the only record, state is derived by folding
it, and a trailing partial line is discarded.

**One line is one transition.** A line holds the trigger and every change it
causes: the attempt's end, the items added, the waits added. An outcome can
never be recorded without its expansion, so no recovery case lies between
them. Item identifiers are sequential in log order, so a fold is reproducible.

An **attempt** is one of Plan 1's jobs. Its directory keeps the brief, the
session record and the activity events for the progress view. The run log
holds only transitions. Plan 1's mapping job is the first attempt of the first
item, and its approval command is the decision on the first `decide` item. One
rule of Plan 1 changes: a job without a terminal event is closed as interrupted
and started again by the loop, not by a person.

After every attempt that ends with an outcome, the harness commits the working
tree and records the commit in the transition. The repository then has one
checkpoint per transition, and a decision may offer a reset to the last one.

## The shape of the code

The machine is three pure functions over plain data. They perform no I/O, do
not know pi, and do not read the clock.

```ts
fold(events: Transition[]): Run
next(run: Run): Start | AwaitPerson | Finished
settle(run: Run, item: ItemId, report: Outcome | Failure | Choice, map: MapRevision): Transition
```

The driver is the only impure part:

```text
run = fold(read the log)
append the transitions that close unfinished attempts as interrupted
loop:
  action = next(run)
  Start:        append "attempt started"
                report = agent adapter runs brief(run, item)
                append settle(run, item, report, current map)
  AwaitPerson:  wait for a command; append settle(run, item, choice, current map)
  Finished:     exit
```

The machine is a candidate module, `harness/loop`: it hides the transition
rules and exposes the three functions and the kind table to its parent. The
item, outcome and transition schemas belong with the harness's other public
contracts, beside the map, because the web client projects them.

Tests follow the structure. Table tests cover every pair of state and trigger,
including the pairs that must be rejected. A property test folds every prefix
of a recorded log, applies recovery, and asserts the invariants. Scenario
tests drive whole runs with Plan 1's scripted fake agent: the direct path, a
planned seam, an unplanned need, a crash in the middle of an attempt, an
exhausted limit, a stop and resume, and a cycle.

## What this settles in the draft architecture

| Draft open decision | Here |
| --- | --- |
| 1. Seeding | Only the entry item; needs create the rest. Seeding more is a different first row of the expansion table. |
| 2. Contract engineer in the first version | One row. Removing the `contract` item from the planned-need row gives the variant where the consumer's fake serves as the contract. |
| 3. Integrate item | Always seeded. With nothing left to do, it reports goal reached. |
| 4. Reopening a consumer | It becomes ready when everything it waits for is settled. Waking on each completion is a scheduler variant that needs deduplication and nothing else. |
| 5. Where fakes and needs live | Still open. The loop requires only that a need points to repository paths. |

Verification of a reported completion remains outside the first version. Its
place is fixed: a mechanical check between the goal-reached outcome and done,
whose failure takes the runtime-failure transition, with the check's output
added to the next brief.

## Open decisions

1. **Where a run works.** The project's checkout on a dedicated branch, or a
   worktree per run. A worktree isolates the person's own edits, and the commit
   per transition assumes that the harness owns the tree.
2. **The limits.** Proposed: three consecutive runtime failures and six runs
   per item. Whether a run also has a budget of items or tokens.
3. **Applying exposure declarations.** An `implement` item at the common
   ancestor, as the table has it, or a mechanical edit by the harness. The
   first keeps the harness from writing source.
4. **Which map revisions are structural.** Proposed as mechanical: a revision
   that adds a module or an exposure between branches.
5. **Session resumption.** An attempt may resume its item's previous session as
   an optimization. The first version always starts a fresh session.
6. **Vocabulary.** Attempt, decision, run and waits-for need
   [glossary](glossary.md) entries once this design is accepted.
