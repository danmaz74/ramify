# Proposed capability coordination contracts

These contracts belong to [Plan 16](main-plan.md). They are proposals to
implement in harness internals and its public projections, not existing APIs.

## Terminology and identity

Keep the glossary's existing meaning of **capability**: an agent-ascribed unit
of behavior used to decompose a plan. A request expresses a consumer's need for
such behavior; a **capability task** is the durable coordination process that
answers that request. Its task ID is distinct from any entry capability slug,
module path, or work-item ID. One module may contain several of each.

The architect may relate a task to existing plan capabilities through recorded
references. A common name or provider does not establish identity or completion.
Public projections expose task references as execution relationships; they do
not add every task as a new top-level capability or mark B's entry complete on
handback. See [model amendments](model-amendments.md) for the new definitions
and the treatment of historical contract/obligation records.

## Request from an engineer

Add `capability-needed` to the new workflow's engineer submission. It contains
`summary` (work already done) and a request with:

| Field | Meaning |
| --- | --- |
| `need` | What the engineer needs to accomplish in its consumer. |
| `usage` | Nonempty list of project-relative code locations, optional symbols, and what the caller will do there. A missing/new call site can name its intended module and be explicitly prospective. |
| `constraints` | Constraints the engineer knows, with uncertainty stated. |
| `knownInterface` | Either `insufficient` with existing symbol/location and the missing behavior, or `none-known`. The second form is not a claim that no interface exists. |
| `examples` | Nonempty examples with a title, Vitest-style code and `executable` or `pseudocode` designation. They state setup, calls and expected behavior; a suggested signature is provisional. |
| `suggestedProvider` | Optional module hint with a reason. The architect decides its fit. |

There is no required registry slug or final interface. Optional existing test
references are evidence, not a prerequisite for discovering a new need. The
harness validates structure and locations according to their designation; an
agent judges whether the need and examples make sense. No regex tries to judge
whether prose states behavior correctly.

The harness supplies request ID, original work item/assignment/invocation,
consumer module, requirement-package citation, source/tree identity and the
requesting engineer's continuation point. It preserves the original request
and any clarifications as separate records.

Before acknowledging suspension, settle A's writer and record a recoverable
candidate snapshot containing tracked modifications, staged state, relevant
untracked files and deletions, its accepted-base revision, current tree identity
and the originating assignment's actual delta. This is provisional source,
not an accepted commit. Keep it live in the execution worktree. The request
cannot start X before this capture and writer settlement are durable.

## Qualification and delegation

The request returns to its current coordinating architect: A-architect for
ordinary work, or the parent capability architect for a nested request. Its
new actions are:

- `satisfy-with-existing`: identify actual API/use guidance and evidence; send
  it back to the requesting engineer to verify and continue.
- `delegate-capability`: name the proposed provider, placement reasoning,
  architectural constraints and relevant requirement/context citations.
- Existing placement or unresolved actions when authority or requirements
  need a wider decision.

An exact registry entry is available as evidence. It never automatically
converts the engineer's wording into a semantic match. Delegation establishes
the capability task and suspends its parent coordinator for X before the new
architect starts. It does not create a fake, a provider conformance obligation
or a claim that the interface is settled.

## Run scheduling and B's existing work

Maintain one durable depth-first coordination stack. The top frame identifies
the active work item or capability task and the invocation/action it awaits.
Delegation pushes X and suspends the parent; accepted handback pops X and
resumes that parent. Only that frame can dispatch its assignments, consultation,
reviews or boundary decisions. A waiting top frame never falls through to the
ordinary frontier. Unrelated entries remain queued, including entries in B.
An unrecoverable stop/failure leaves the stack incomplete and ends or pauses
the run under existing policy; it does not release unrelated work to continue.

If B has an entry work item, record its relationship to X and defer that entry.
Do not merge its goal, assignments, iteration count or completion status into X.
Before B work, supply X with B's current recorded architectural decisions and
relevant completed/pending work. Existing B-local sessions cannot assign or
revise B work while X is active. This also applies when B is a suspended ancestor
on the delegation stack: the child has coordination of its bounded task while
ancestor constraints and wider responsibility authority still apply.

On eventual activation of B's entry, deliver the intervening source and design
changes and current evidence to its local architect. Invalidate stale unexecuted
assignments for replanning rather than running their old scope or assumptions.
Its original goal remains; use of X can satisfy part of that goal only through
the normal agent assessment and entry completion gate. If B was already
complete and X changes a relied-on guarantee, record a follow-up work item and
required revalidation without rewriting B's historical acceptance. Routine
compatibility is checked within X before handback.

## Assignment identity and limits

An assignment has exactly one coordination owner: an ordinary work item or a
capability task, plus a separate target module scope. Task X numbers its own
assignments monotonically from 1 across every target module; the durable ID
contains X's identity and that sequence. B's entry assignments keep their own
numbers. A's suspended originating assignment retains its original ID and
number; consultation adds no assignment, whereas an X-scoped A integration
experiment gets a new assignment owned by X.

For new policies, add `maxIterationsPerCapabilityTask`, initially captured with
the same value as `maxIterationsPerWorkItem`. It counts X's distinct committed
assignments across all owners. Repair invocations and reconstruction within
one assignment use existing repair/reconstruction counters; they do not issue
a new number or reset a counter. Ordinary work items continue to use
`maxIterationsPerWorkItem`; X assignments are not charged to B's entry budget.
Each nested task has its own sequence and limit. The new workflow counts work
items plus capability tasks together against the captured `maxWorkItems` bound,
and all invocations/time count against run limits, including descendants.
Record this policy-version change explicitly in views and recovery tests.

## Durable task and plan

One `CapabilityTask` holds harness-owned identity and links:

- Request, parent work item or capability task, and originating assignment.
- Consumer and proposed/current provider; relevant existing owners and the
  authority supporting work in them.
- Current plan revision, state, active or suspended session references.
- Coordination-stack frame, deferred existing work-item references and
  provisional requesting-source snapshot.
- Assignment, consultation, gate, review and handback references.
- Any child tasks and the unresolved findings preventing handback.

The plan is a versioned harness record with a rendered Markdown view. Agents
update it through a harness tool; they do not edit the durable record files.
Its current sections contain the need, proposed interface, use cases and
expected behavior, compatibility findings, work outline, decisions and open
questions. Preserve original example identities across revisions and explain
any correction to their expected behavior. Correcting a wrong oracle is a
semantic decision with evidence, not an unnoticed deletion of a failing case.

The capability plan is distinct from the captured feature plan and its frozen
element catalog. It references those requirements through the existing package
creator. Updating X's design does not rewrite a captured requirement; a true
requirement change follows the existing deviation authority.

Proposed record schemas use `ramify-agent.capability-request/1`,
`ramify-agent.capability-task/1`, `ramify-agent.capability-plan/1`,
`ramify-agent.capability-exchange/1` and `ramify-agent.capability-handback/1`.
Store them under `capabilities/<task-id>/` with immutable plan revisions and
exchanges. The existing ledger owns writes and materialization. Assignments,
invocations, command evidence and reviews retain their existing record types
with a versioned capability-task association where needed.

## Capability architect tools and turn results

Supply read tools for the project, including A and B, and generated ordinary,
testing and architect views. Supply no source mutation tool. Give the role a
short procedure centered on its delivery responsibility, authority, direct
consumer access and completion conditions. Submission schemas come from the
same definitions the tools validate; avoid copying the full schema into prose.

`update_capability_plan` records changed sections and their reason. Its result
returns the current plan reference. The harness compares the invocation's
captured basis with current state so a stale update cannot overwrite a newer
decision. A non-mutating `validate_capability_action` reports the same errors
as final submission for the state it observes, without scheduling work,
advancing state or consuming a rejected-submission attempt.

`submit_capability_action` ends one architect turn with one action:

| Action | Agent supplies | Harness does next |
| --- | --- | --- |
| `consult-consumer` | Question, relevant plan sections and code/evidence references | Records an exchange and continues the requesting engineer read-only. |
| `assign` | Owner, ordinary module scope, purpose/approach, selected requirement elements and intended evidence | Builds the existing guarded assignment and runs the appropriate engineer. |
| `delegate-capability` | A qualified nested request and proposed placement | Starts a fresh child architect and suspends this task until its return. |
| `request-placement` / `unresolved` | The boundary/requirement problem and evidence | Uses the existing responsible architect/deviation process and returns the result to this capability architect. |
| `request-handback` | Summary, requirement/use-case coverage, interface/use guidance and unresolved limitations | Runs the capability gate and review, then either returns concrete findings or records handback. |
| `partial` | Progress and unfinished work | Records unfinished state and uses the captured continuation/reconstruction policy. It cannot complete the task. |

References identify artifacts the agent actually used. The harness supplies
IDs, hashes, revisions, current run associations and command verdicts. Provide
a read tool for recorded assignments, findings and check results so the agent
can cite evidence handles instead of reproducing nested accounting or typing
exact test titles. Invalid submission feedback keeps the same session running;
prevalidation is advisory and the actual action is validated again.

## Consumer consultation and scoped assignments

`consult-consumer` resumes the original A-engineer with the question and current
plan changes. Its response is an answer, concrete objection, or recommendation
for a usage experiment. A read-only consultation uses the same preserved
conversation with current read-only tools and an exchange response tool; the
harness must verify that the executor actually honors that equipment change.
It cannot mutate source or acquire the writer.

An experiment or integration change is an explicit `assign` action in A's
module scope. Prefer continuing the original engineer with the new assignment
and current evidence. If its session is lost, reconstruct its original need,
prior work, pending question, current plan and source identity; record the
loss. A fresh replacement cannot be described as the same retained session.

The capability architect can assign B and affected existing owners for X's
routine compatibility work. Shared declarations and parent exposure files are
edited by an engineer scoped to their actual owner. An affected independent
test package uses the existing outside-module assignment mechanism. A boundary
redesign outside A/B responsibilities still needs the responsible architect's
decision. No assignment transfers responsibility ownership implicitly.

Only one writer runs at a time. It must settle before the next writer or gate.
After an assignment ends, the architect receives structured progress or result,
actual changes, checks and findings. Recorded checks are visible even when
they fail and a different owner needs to repair the candidate.

## State transitions and return to A

| Current state | Event or accepted action | Next state / effect |
| --- | --- | --- |
| Request pending | Parent qualifies and delegates | `coordinating`; parent suspended, fresh capability session |
| `coordinating` | Consult A | `awaiting-consumer`; one recorded exchange |
| `awaiting-consumer` | Answer received | `coordinating`; same capability architect continues |
| `coordinating` | Assign owner work | `implementing`; architect suspended, one guarded writer |
| `implementing` | Submitted result or explicit interruption | `coordinating` or recorded recovery; unfinished assignment remains unfinished |
| `coordinating` | Delegate nested need | `awaiting-dependency`; fresh child task |
| `awaiting-dependency` | Verified child handback | `coordinating`; requesting engineer can resume |
| `coordinating` | Request handback | `verifying`; no source writer active |
| `verifying` | Check/review failure | `coordinating`; evidence and required repair returned |
| `verifying` | Current complete evidence and acceptance | `handed-back`; one durable result resumes parent |
| Any unfinished state | User stop or exhausted run policy | Explicit stopped/incomplete outcome; no handback |
| Ordinary work item requests completion | An unresolved need or delegated task lacks current accepted handback | Refuse completion with request/task references; do not run a success transition |
| Ordinary work item requests completion | All needs resolved and delegated tasks handed back | Eligible for its ordinary assignment, scenario, review and project gates; handback alone does not complete the item |

The completion predicate is evaluated from committed state both when a
completion is submitted and before the final completion event is written.
A need resolved through existing behavior requires recorded consumer
verification, even if no task was created. Failed, stopped, merely submitted
and superseded-but-unresolved tasks do not satisfy it. A revision request
reopens the dependency until its current task hands back. Apply the equivalent
child-task predicate before a capability task's own handback. This replaces
the old `openRequirements`/unconformed-provider refusal logic for new runs;
historical projections retain the old semantics.

The task may also wait for an external boundary decision through the existing
placement machinery. That wait does not hand control of ordinary X work back
to A-architect.

Handback includes the accepted source and plan revisions, actual interface
locations, usage, compatibility work, test/review evidence and limitations.
The capability architect has already coordinated real A verification. The
original A-architect resumes its broader work with this result, and A-engineer
continues the interrupted goal. Do not rerun the same capability gate merely
because ownership of coordination returned; later edits or integration findings
can require new checks. A new request to revise X links to the earlier handback
and preserves its historical verdict.

## Gate and evidence semantics

Every requested example has an explicit coverage disposition: exercised by
named recorded tests, corrected with evidence, or still unresolved. Derived
cases can extend that set. Coverage references must resolve to executed tests
and the candidate/configuration they checked. Multiple tests may cover one
case and one test may cover several cases; counts alone do not establish
coverage. Existing code/scope/design review and reconciliation mechanisms judge
semantic adequacy; the harness does not infer it from names or text similarity.

Before handback, all implementation/verification assignments performed for X
and its child tasks must have accepted results. The suspended originating
assignment is excluded: it needs X's result in order to continue. Required
provider and real consumer cases must pass, compatibility checks must hold,
and blocking review findings must be resolved. Independently
specified expected results and real fixture changes challenge the design.
Where the path could still use a fake, prove real-provider use with an
appropriate integration witness or negative control; do not mandate arbitrary
source string replacement as the universal technique.

A provisional migration can span several owner assignments on one candidate.
Record an assignment's starting tree and settled change set so the next
engineer is judged on its changes, not on earlier dirty changes. A scoped
mutation result may be recorded while a whole-tree check fails; it is not an
accepted iteration or completed capability. Once migration repairs settle,
the combined gate and reviews cover the union of participating changes and
owners before an accepted checkpoint/commit. Reuse ordinary passing iteration
checkpoints when no provisional migration is needed. Final project gates and
revision-bound audit/merge-readiness policy still apply.

The candidate includes A's captured partial edits from before delegation.
For example, B's mutation diff is measured from the tree containing those A
edits, while the combined candidate diff is measured from the accepted base.
Review the union of inherited and new changes with their original assignment
attribution. A failure caused by A's unfinished code is recorded separately
from a new B regression, but both remain failures when their check is required.
The capability architect may assign A a bounded preparation/repair so the tree
can pass. If the current requirements cannot be met on that live candidate,
report the conflict or unfinished work; do not silently ignore the check,
discard A's edits or declare them accepted.

An accepted combined checkpoint may include reviewed A changes without closing
the original A goal. On handback, record the delta from the suspension snapshot
to the returned candidate; A continues from that current tree. After A's
original assignment resumes, each mutation segment is checked against its own
starting snapshot. Its final scope evidence includes A's own segments and
attributes intervening X changes to X's assignments, so foreign changes are
neither blamed on A nor used to widen A's write scope. Recovery verifies or
restores the recorded provisional candidate through explicit logged effects;
it cannot substitute the last accepted commit and lose unsubmitted work.

Tie evidence to the checked source, plan and test configuration. A material
change makes affected earlier acceptance stale; rerun the necessary checks.
The architect explains semantic relevance, while the harness verifies actual
identities, recorded execution and required gate coverage. Unknown, unrun,
failed and baseline-equivalent remain distinct from passed.

## Recovery and inspection

Record action intent before its side effect and completion afterward under
stable harness keys. Replaying a committed request, answer or handback is
idempotent. Recovery reconstructs task state and active authority from the log,
then settles any writer before dispatch. A missing session starts a new one
from durable context; it does not erase failed checks or remaining examples.
Use task dependencies for exact cycle detection. An architect decides whether
different requests can share a provider implementation.

The public view shows the task's goal, A/B owners, current plan, current
coordinator, pending question or assignment, findings, checks and handback.
Session views retain the true executor, model, actual start and usage. Show a
paused A-architect and a consulting A-engineer accurately. Historic contract
records retain their original roles and statuses. New workflow version checks
prevent accidental execution of old unfinished jobs under different semantics.
