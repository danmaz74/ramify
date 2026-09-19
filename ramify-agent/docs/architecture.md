# Harness architecture

**Status:** Early draft. High level only; every part is open to change.

This document turns the [harness principles](harness.principles.md) into a
first architecture. The first version does not implement every principle;
[what it leaves out](#what-the-first-version-leaves-out) is listed at the end.
[Open decisions](#open-decisions) are marked where they apply.

## Shape: one artifact, one loop

```text
feature request
      |
      v
+--------------+   plan artifact    +---------------------------------+
|  PLAN phase  | -----------------> |            WORK LOOP            |
|  architect   |  (person approves) |  pick item -> scope -> brief -> |
|  agent       | <----------------- |  run agent -> outcome -> update |
+--------------+  plan is wrong /   +---------------------------------+
                  unplanned need         until no work item is open
```

Ramify is outside the loop. Its generated views and post-write check are part
of the environment every agent runs in.

## The plan phase

One architect session works from the architect view and produces one
artifact, the capability and module plan. It is a first approximation that
the loop is expected to amend. A person approves it before the loop starts.

| Section | Content |
| --- | --- |
| Modules touched | Each module with a rough weight: heavy, light or exposure only. |
| Reuse | Per capability: the existing symbols, their owner, and whether they are available to the module that needs them. When they are not, the exact exposure declarations. |
| New capabilities | Per capability: the owner module, rarely a new one; its consumers; a goal of one paragraph. |
| Seams | Derived: every new or changed capability whose consumer is in a different branch from its owner. |
| Entry point and acceptance | The highest consumer of the feature, and the feature-level behavior that decides completion. |
| Proposed work items | Which planned capabilities fall within one subtree and can be one vertical work item. |

Each amendment to the plan has a revision number. A brief names the revision
it was built from.

## The work loop

The loop's state is a graph of work items. Every work item is a cut on the
module tree.

| Kind | Scope | Produces |
| --- | --- | --- |
| implement | One subtree. | Source and tests, with fakes for what is missing. |
| contract | One seam: reads both sides, writes only the contract. | Interface types, conformance tests, a fake. |
| integrate | The subtree of the lowest common ancestor of the touched modules. | The composition and bounded corrections in descendants. |
| architect | The architect view. | An answer, or a plan revision. |

### Steps

1. **Seed.** Create one implement item at the plan's entry point. Its brief
   carries the reuse findings and the planned capabilities it will need.
   See [open decision 1](#open-decisions).
2. **Run.** The agent works against fakes and returns one outcome from the
   [closed set](#outcomes).
3. **Expand.** For a partial outcome, match each need against the plan:
   - planned, with its owner in another branch: a contract item, then an
     implement item for the provider, then the consumer item is reopened;
   - planned, with its owner in the agent's own subtree: not a need; the agent
     implements it;
   - not planned: an architect item, which answers or revises the plan.
4. **Return.** When a provider item completes, reopen the consumer item with
   the goal of replacing the fake and rerunning its behavioral tests. It is a
   fresh session; the state is in the repository.
5. **Integrate.** When no item is open, run one integrate item against the
   feature acceptance. See [open decision 3](#open-decisions).
6. **Done.** The run completes when the integrate item reports the goal
   reached.

### Outcomes

An agent reports one of:

| Outcome | First version |
| --- | --- |
| Goal reached | Automated. Trusted without further checks. |
| Partially complete, with needs | Automated through the expand step. |
| Contract needs revision | Pauses the run for a person. |
| Cannot be satisfied as specified | Pauses the run for a person. |
| The plan is wrong | Pauses the run for a person. |

A runtime failure, such as a crashed session or malformed output, is an
adapter error, never an outcome.

### A need

A need states use cases, representative input and output, side effects and
constraints. Where possible it is executable: a failing test or the tests
that pass against the consumer's fake. It names no owner and proposes no
interface for the provider.

### A brief

A brief gives a work item's scope, goal, plan revision, known external
interfaces as paths into the module's generated API view, the needs it
answers, and the allowed outcomes. A goal states an outcome that can be
verified, never files, classes or algorithms.

## Components

The existing module tree holds the architecture.

### `contracts`

The formats: plan artifact, work item, brief, need, outcome and event log.

### `harness`

The only writer of durable state.

| Part | Responsibility |
| --- | --- |
| Planner runner | Starts the architect session and validates the plan artifact. |
| Loop controller | Holds the work-item graph and applies the expand and return rules. It makes no semantic decision. |
| Brief builder | Builds a brief from the plan revision and a work item. |
| Agent adapter | Starts a session in the scope's directory, ensures the views are materialized and the post-write check is active, and parses the outcome. |
| Run store | The work-item graph, plan revisions and events, as files. |

### `web`

A projection of the plan, the work-item graph and progress. It forwards
commands, such as plan approval and resuming a paused run, to the harness.

## What the first version leaves out

- Verification of a reported completion: audits, reviews and checks run by
  the harness.
- Parallel work items. Items run one at a time.
- Enforced scope. Scope is set by the brief and the working directory, not by
  a sandbox.
- Automated handling of the three pausing outcomes.
- Friction tracking and architecture review proposals.
- Risk-first spikes.
- An autonomy policy finer than approval by a person.
- Choosing vertical scope from module measurements. The plan proposes scopes
  and a person adjusts them.

## Open decisions

1. **Seeding.** Seed only the entry item and let needs create the rest; seed
   every planned capability in dependency order; or seed the entry item and
   one item per heavy module, leaving contracts to be created from needs. The
   first adapts best; the second uses the plan most and is most predictable.
2. **Contract engineer in the first version.** A separate contract item as
   described, or the consumer's fake and tests serve as the contract until the
   separate role is added.
3. **Integrate item.** Always once at the end, or only when the feature
   acceptance fails after the last fake is replaced.
4. **Reopening a consumer.** Whether one consumer item is reopened once per
   completed provider, or once after all of its providers complete.
5. **Where fakes, conformance tests and recorded needs live** in a module, and
   how a recorded need avoids breaking the project's checks.

Further points not yet placed are in
[additional points to evaluate](additional-to-evaluate.md).
