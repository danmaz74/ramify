# Operator execution acceptance

These obligations retain the original Plan 31 case labels. Behavioral scenarios
describe consumer-visible results; evidence obligations cover project health
and real delivery. They prescribe no iteration schedule. R31-1 (role-level
routing with the closed set) and R31-2 (port composition) are resolved in
`plan.md`; where a case names them, apply those resolutions.

## O01 — Effective turn context at the selected point

```gherkin
Scenario: An operator receives the context of its selected session point
  Given a session with initial instructions, context additions and tool activation changes
  And messages, tool calls, results, submissions and verdicts recorded before a selected point
  And additional parent activity recorded after that point
  When an operator turn forks from the selected point
  Then its displayed history contains the inherited context and activity through that point
  And it excludes the later parent activity
  And it presents the current additions and task message
  And the turn identifies its project, plan, run, invocation, operation, role and available work item
  And it shows the start mode, source point, opened time, effective deadline and active tool schemas
```

Also inspect fresh and continued turns: fresh turns have no inherited-history
file, and continued turns retain generic as well as operator payload history.

## O02 — Enforced mutations

```gherkin
Scenario: Operator edits receive the ordinary engine enforcement
  Given an operator turn with an active edit tool and a bounded write scope
  When the operator edits a permitted file through the mailbox
  Then the edit passes through guard, intent, execution, completion and the mutation hook in that order
  When the operator requests an edit outside that scope
  Then the guard refuses the edit without changing the file
  And the refusal appears in the action result and transcript as a guard denial
```

## O03 — Submission verdicts and rejection bounds

```gherkin
Scenario: Operator submissions obey the same judge and terminal decisions
  Given an open operator turn using the harness submission judge
  When a submission receives an ordinary rejection
  Then its errors are returned and the turn remains open
  When a later rejection reaches the configured final rejection bound
  Then the turn closes without an accepted submission and admits no further action
  Given another open operator turn
  When its submission is accepted by the judge
  Then the turn closes as submitted
```

## O04 — Durable operator history

```gherkin
Scenario: A continuation receives prior operator actions and results
  Given an operator session that has performed actions and received results
  When that session continues at a compatible retained point
  Then its history includes those actions and results from persisted runtime payloads
```

## O05 — Stop and closure races

```gherkin
Scenario Outline: Stopping a turn settles work without late effects or hanging clients
  Given an operator turn <activity> with a CLI action racing with closure
  When the run is stopped
  Then new work is fenced and admitted runtime calls drain
  And terminal status is published and queued actions are settled or refused
  And the waiting CLI observes its result or terminal state even after the watcher exits
  And no late effect executes

  Examples:
    | activity         |
    | waiting          |
    | executing a call |
```

## O06 — Transcript and usage

```gherkin
Scenario: Operator activity uses the existing transcript and usage conventions
  Given an operator invocation that acts and submits through the mailbox
  When its invocation evidence is read
  Then its transcript parses under the current schemas including started declarations and termination
  And messages, tool activity and submission verdicts are retained
  And usage is unavailable with reason "operator" and metrics show a coverage gap
```

## O07 — CLI inspection and result semantics

```gherkin
Scenario: The CLI exposes open turns and bounded action outcomes
  Given open operator turns across the project's runs
  When the operator lists pending turns
  Then each listed turn shows role, work item when present, deadline and age
  When the operator shows a continued or forked turn
  Then inherited context is included without requiring a history flag
  When call, submit or end actions receive an outcome
  Then they return the exit status specified in the plan's CLI results table
  When an action result wait times out
  Then the CLI reports the stable action ID and an unknown execution result
  And it does not claim cancellation or safe resubmission with a new identity
```

## O08 — Mixed executor selection

```gherkin
Scenario: One run uses an operator architect and a model-backed engineer
  Given a run with a valid closed operator role set containing local architect
  When it invokes local-architect and engineer work
  Then architect turns go to the operator and engineer turns go to the base agent
  And each invocation records its actual executor
```

Use a scripted base agent for deterministic evidence; the real-plan delivery
uses pi. Do not mistake the scripted result for provider qualification.

## O09 — Lineage closure and foreign history

```gherkin
Scenario: Incompatible executor lineages are rejected explicitly
  Given the role-selection rule chosen for R31-1
  When a configuration splits a required executor lineage
  Then start is refused with the missing roles named
  When a closed role set is supplied
  Then the configuration is accepted
  When dispatch is nevertheless given foreign-driver history
  Then it refuses with the reason instead of dropping history or silently starting fresh
```

Cover selector lineage and scope review lineage from both local and capability
architects, as well as the other parent-dependent operations in the plan.

## O10 — Operator and pi bounds

```gherkin
Scenario: Operator waiting removes only the idle bound
  Given a run containing both operator-played and pi-played invocations
  When the operator remains idle beyond the ordinary idle limit
  Then idle alone does not terminate its invocation
  And its effective absolute deadline remains the original harness deadline and is shown in the turn
  And absolute, review, run and stop-settlement bounds remain effective
  And pi-played invocations retain their idle and absolute bounds
```

## O11 — Captured choices and command compatibility

```gherkin
Scenario: Executor choices survive command mapping and recovery
  Given existing pi and scripted run command and record values
  When they are read by the updated harness
  Then they remain valid
  When an operator role set and base agent are selected through serve or start-run
  Then that choice is captured in the run and unknown roles are usage errors
  When recovery uses a server with different current defaults
  Then the run retains its captured choice
  When a standalone session or manual step selects the operator
  Then it uses the operator mailbox without confusing standalone fake and run scripted choices
```

## O12 — A complete orchestrated work item

```gherkin
Scenario: Operator decisions drive a real orchestration through work-item completion
  Given a scripted run using the closed operator set chosen in R31-1 and a scripted engineer
  When every operator turn is answered through the mailbox
  Then the work item proceeds through orientation, selection, assignment and engineer work
  And its gate, completion request, reviews and reconciliation reach work-item completion
  And required operator review turns are not silently delegated to the scripted base agent
```

## O13 — Harness verification evidence

Retain successful type checking, Ramify self-check and final committed configured
full nested audit outcomes. Ordinary tests launch no external process. Follow
the target's testing specification and retain the baseline audit and relevant
native witnesses. Failed, skipped, missing and unrun checks remain distinguishable
from passes; automated health alone does not establish semantic completion.

## O14 — Documentation and useful real implementation

The README and document index explain the operator choice, mailbox, CLI,
lineage rule and ordinary agent-owned worktree setup. Demonstrate a real plan
or bounded deliverable using the resolved closed role set and pi as engineer.
Record the project, plan, deliverable, worktree/base, roles, resulting commits,
project verification, responsible agent's review, unresolved defects, elapsed
time and available usage/cost. Retain successful work for normal integration.
An unrun, failed or discarded attempt is not successful implementation evidence.

## O15 — Concurrent publication and stable effects

```gherkin
Scenario: Concurrent publishers preserve actions without repeating effects
  Given two CLI processes publishing actions for the same open turn
  When both publish concurrently
  Then neither action is lost or overwritten and sequence publication is serialized and atomic
  And actions already published are discovered without requiring a watch event
  When an admitted action with a recorded result is presented again under its stable ID
  Then its recorded result is returned without repeating the effect
```

## O16 — Only active authorized tools

```gherkin
Scenario: An operator reviewer keeps snapshot-only authority
  Given an operator reviewer with snapshot-only tools and inactive inherited declarations
  When it requests an ordinary read, edit, write or inactive inherited tool
  Then the call is refused
  When it uses a permitted tool or submits its review
  Then the applicable harness guard, hook and judge remain in force
```

The operator instructions must require this channel for project edits and
must not claim that it sandboxes the outside agent's independent shell/editor.

## O17 — Pi preservation across composition

```gherkin
Scenario: Adding operator composition preserves pi session behavior
  Given the composition chosen for R31-2 with one authoritative session store
  When pi performs work through that composition
  Then its built-in binding and availability checks remain effective
  And exact-point fork, terminal retry and stop/drain behavior are preserved
```

Use relevant registered native pi witnesses on the final candidate for any
changed adapter path; scripted composition evidence alone is insufficient.
