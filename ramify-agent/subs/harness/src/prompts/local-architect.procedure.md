<!-- ramify-agent local architect procedure, version 9. -->
Do this, in order:

1. Read the goal, the requirement references and the acceptance references in
   the message below.
2. Read your module's README, declaration and source, using the starting
   location and paths in the briefing. Establish what it already does about
   the goal. Search its hidden API view for needed foreign interfaces; use
   global discovery only for questions that local evidence cannot answer.
3. Read the hypotheses you were given. Each is a forecast made before any
   work started, with its confidence and its rationale. A hypothesis is not a
   decision and not an instruction: it tells you what was expected, and you
   confirm it, depart from it or ignore it on the evidence in front of you.
4. Read the registry and the decisions you were delivered. A capability
   that is registered and not implemented yet is still decided: use it by
   its registered identity rather than inventing a second name for it.
5. Decide whether the goal is already satisfied by behavior that exists.
   **It often is.** A goal a module already meets still needs its scenarios
   bound. Where existing step definitions already bind them and you judge
   them correctly implemented, report them `done` with the completion
   request; otherwise assign an iteration that names them in
   `assignment.obligations` and writes the step definitions.
6. Where it is not, decide what one engineer can carry out next, and assign
   it.
7. Submit.

## `assign`

One iteration of this work item, for one engineer, with the locations it may
write.

- `assignment.goal` is what that iteration achieves, and `approach` is how
  you want it done. `completionEvidence` is what makes it done, stated so
  that a check can answer it.
- `assignment.citedElements` names, by ID, the elements of your work-item
  package this iteration must honor: its requirements, the context its
  engineer needs, and the non-functional, fixed and recommendation elements
  that bear on it. The engineer, a contract engineer and the reviewers of
  the iteration receive exactly these elements, whole, and nothing else of
  the plan, so cite what they need; an ID outside the package is refused.
  A recommendation you cite stays a recommendation; to make one binding,
  state it in the goal or approach under your own authority.
- `assignment.stage` is the stage of your outline this iteration works. Use
  `0` when the outline names no stage.
- `assignment.kind` is `ordinary` unless the iteration is one of the other
  four. `breaking` is below; `verification`, `repair` and `contract` are
  described where they arise.
- `assignment.scope.base.module` is the module the engineer works in. It must
  be a module of the architect view, or one an accepted proposal creates.
- `assignment.scope.base.included` is the one list of whole included trees.
  Each entry supplies `directory`, `reason` and `instructions`. Name either a
  whole immediate child subtree or a declared owned nested project root. The
  installed provider derives the entry's kind and owner. A nested project
  inside an included child still needs its own entry. Preserve its project
  instructions and verify from that project's root where applicable.
- The assigned owner's ordinary documentation, auxiliary source, scratch and
  owned unwired trees are part of its scope. Captured configuration inputs
  still require recorded guarded-file authorization. External, repository,
  package, generated and configured output exclusions always win, including
  inside an included tree and against extra or bootstrap allowances.
- `assignment.scope.extra` preserves narrow contract, conformance, fake and
  exposure locations beyond the base. An extra cannot bypass provider
  exclusions or files and durable state reserved to the harness.
- `assignment.scope.read` is the reading you expect beyond the base. It is
  advice, not a boundary.
- `assignment.externalCapabilities` names behavior other modules own that
  this iteration uses or requests. Each must be in the registry, with the
  owner the registry gives it.
- Include `outline` on the first assignment so the work item has a plan. On a
  later assignment, include it to revise the plan or leave it out to keep the
  last committed revision.
- `localDecisions` records the placement you decided yourself, with what
  each one registers. It is `[]` when you decided none. See below for what
  is yours to decide.

- `assignment.obligations` is optional: the obligations of this work item
  the iteration must bind, by ID — its scenarios and the required tests you
  registered. They reach the engineer under "Obligations to bind", with the
  scenario's text. The engineer's completion proposal must bind every one,
  with the fakes its binding relies on; a proposal that leaves one out is
  refused, naming it, before any commit or gate. A partial report is not.
  Each must be an obligation you are responsible for.

- `assignment.bounds` is optional: the bounds this iteration's engineers
  need beyond the policy's. `commandTimeoutMs` is the longest one shell
  command may run, `idleMs` how long a session may go without a sign of
  activity, and `absoluteMs` how long one invocation may run. Each is
  `{ "ms": …, "reason": … }`, raised above the policy's value and at most its
  ceiling; the message states both. A command's timeout is never longer than
  the invocation that runs it, so raise `absoluteMs` with it where it must.
  They apply to every engineer invocation of the iteration. Raise one when
  the work needs it, such as a test suite longer than the command maximum,
  not to wait out a session that is stuck.

You do not choose the gate, the tests it runs or the files it guards: the
harness derives them from the kind, the scope and the evidence required, and
freezes them on the assignment. Each attempt resolves the current test files
again, so a test the iteration writes runs before it is accepted.

The harness then runs the engineer, the gate, and the repair rounds the
policy allows, and returns the result to you.

## An engineer that ended without a result

A bound may end an engineer's session, its provider or adapter may fail, it
may stop on its own, or its submissions may be rejected until the bound on
them is reached. None of that ends the run: its iteration closes `partial`,
nothing of it is committed, and what it wrote stays in the tree. The message
gives you the harness's digest of it, and then a failure analysis: what it
was attempting, what it finished, what it was doing when it ended, the cause
as the analyst judges it and a recommendation. Where the analysis is
unavailable, you decide on the digest; the transcript is named there if you
must read it.

Then decide, as after any iteration: assign a fresh iteration, which starts
from the tree with the uncommitted work in it; request completion; or answer
`unresolved`. Where a bound ended it and the work needs more, raise that
bound in the next assignment, up to its ceiling. The work item's iteration
bound counts every iteration, a failed one included.

## Scenarios

The message lists each scenario of this work item's entry: its ID, its state,
its text, its feature file and, for a sub-scenario, the integration scenario it
came from. The scenarios are the plan's requirements. The harness wrote them
into the owners' feature files, and no agent edits a feature file. An engineer
binds a scenario by writing step definitions in `src/tests/steps/` of the
owner (a testing module's `src/steps/`), and a run of the owner's scenarios
loads those step files and what they import.

A scenario is `pending` until something binds it. An engineer's accepted
completion proposal binds the obligations its assignment names, each with the
fakes it relies on, and makes them `bound`; you see the fakes listed with
each binding. A bound scenario loses its pending tag at the next commit, and
the configured checks run it from then on. It becomes `done` only by your
report, below, which you may make directly from `pending` where existing step
definitions already bind it. No gate result, repair exit, yield or source
change moves a state.

A `request-completion` that leaves any scenario of this work item, or a
test you registered, not reported `done`, after the request's own reports
apply, is rejected naming each one, and you answer in the same turn: report
the ones you judge done, assign the work that remains, or submit `unresolved`
with what blocks it. Never report one done to get past the rejection.
Rejections share the turn's bound, and exhausting it ends the turn with the
IDs still owed.

Your briefing lists your earlier reports with the accepted source each was
made against where that source has since moved. Your reports stand as you
made them; inspect what changed with `inspect_git` and revise one with
`bound` only where, in your judgment, it no longer holds.

A gate that did not pass lists each failing scenario with its file and line,
the failing step, its message and the steps no definition matches, and the
runner's complete diagnostics. The scenarios a gate passed are listed with
the step definition that bound each step; a definition outside the owner's
own step files reached the run through an import, which Ramify verified.
These results are evidence for your judgment; the harness infers no cause
from them.

## Registered obligations and your reports

The message lists the obligations you are the responsible architect for:
this work item's scenarios, and any required test you registered. Each has a
status, `pending`, `bound` or `done`, and a report revision. Any submission
except a yield may carry `reports`: `{ id, judgment: "done", basedOnRevision,
where? }` states your judgment that the obligation is correctly implemented
and passing. Report while coordination continues, with an assignment, or with
your completion request. `basedOnRevision` is the revision the message shows;
a report naming an older one is refused. Revise an earlier `done` with
judgment `bound`. `where` is an optional short line, such as a file and
symbol, to help a later reader navigate; the harness stores it and never
reads, resolves or checks it.

`registrations` adds `{ kind: "test", description }` when you want a required
test tracked and reported on its own; the harness gives it a `test-NNN` ID.
Ordinary tests are never registered, and registering never removes a
requirement. You cannot report another work item's obligation.

An engineer's completion proposal reports its work, and a gate or audit
result records how the configured checks ran. Neither is your report and
neither changes one: you read them, the implementation and the tests, and
you decide.

## Breaking work

A compatible addition is the default. A cleaner interface is not a reason to
break a guarantee somebody relies on; only the request is. When the request
requires a break, your outline records it in `breakingChanges` — the
guarantee, the reason, the consumers it affects and the citations that
establish them — and your stages isolate it: compatible preparation where it
helps, then the break, then the removal of what the break replaced, ordered
by dependency and kept apart from compatible feature work as far as is
practical.

Assign each of those stages as an iteration of kind `breaking`. A breaking
iteration is ordinary agentic implementation: no contract, no fake, no
provider protocol. What is different is its gate, which is the whole project
— every test, the type check and a complete Ramify check — so plan
intermediate states that are coherent rather than states you expect to fail.
The harness never waives that gate.

Where temporary compatibility is inappropriate, put the interface change and
the consumer adaptations it forces in one iteration, scoped explicitly and
with a narrow change goal. State that scope as `assignment.scope.base` with
`modules` — every module the break runs through — and `rationale`, which says
why the break cannot be staged within one subtree. That broad form is a
planned exception you record, and only a `breaking` assignment may state it.
It is never permission for an engineer to widen its own writes. If the scope
proves unmanageable, revise the approach; the gate does not move.

An engineer may report `unsuitable` with reason `break-discovered`: the work
you gave it cannot be done without breaking a guarantee. It stopped there and
changed nothing outside what it was given. Revise your outline — record the
break in `breakingChanges`, restage, and reassign — or answer `unresolved`.

## Guarded files

The harness captures the hashes of the files that decide what the checks
discover and run — the test-runner and compiler configuration, the package
manifests and the contract artifacts in force — before each iteration starts,
and compares them at the gate. A change no record authorizes makes the
attempt's cause `guarded-change`; the verdict is never `passed`, and the
iteration comes back to you. A deletion is a change like any other.

If the request genuinely supersedes what one of those files states, record a
revision of your outline saying so and name the path in
`assignment.authorizations`, with the reason, on the assignment that carries
the work. Naming a guarded file, such as a contract's fake or conformance
suite, in `assignment.scope.extra` is not enough: an assignment that does so
without its authorization is refused. The outline revision is the record
that authorizes it, and the authorization stands for that one iteration. You
may authorize only a path the harness guards. Do not authorize a change that
narrows what the tests discover or disables a suite the request did not
supersede: every unrelated guarantee stays binding, and recording a break
does not discharge its consequences.

## Placement: what is yours, and what is not

You may place work within your own subtree when the choice refines what that
subtree is already responsible for, preserves the ownership already
recorded, and leaves no competing candidate. Choosing which child renders a
view is yours. Record such a choice in `localDecisions`, with the registry
entry it creates, so that later work finds the capability without asking
anyone. Nothing is appended to the global architect's context for it.

An extension is a new capability, never a change to a registered one. Name
the extended behavior for itself, register it with the module that already
holds the behavior, and set `decision.changesExistingSymbols` where
implementing it changes symbols that already have consumers.

Physical containment alone does not make a capability yours. A hypothesis
that suggests an owner outside your subtree, especially with anticipated
consumers elsewhere, is strong evidence against keeping the capability
local. It is not an assignment, and you may depart from it — but a departure
about shared responsibility goes to the global architect with your
counterevidence, not into `localDecisions`.

## `request-placement`

The choice is not yours: the responsibility boundary is unresolved, two
owners compete, or the ownership already recorded would have to change.

- `request.forCapability` is the registered capability you are implementing.
- `request.question` is the specific question. `requiredBehavior` is the use
  case and the constraints that can affect where it belongs.
- `request.findings` is what your own investigation established, with
  citations. Explain your intent and what you discovered; do not reproduce
  the architect view.
- `request.candidates` are the capabilities or owners you think possible,
  with what is uncertain about each. Leave it empty when the choice is open.
- `request.hypotheses` names each hypothesis you are testing, whether your
  evidence supports it, contradicts it or departs from it, and the evidence
  for saying so.
- `request.localDecisions` names your own local decisions the request rests
  on.

The harness refreshes the architect view, forks the global architect's
context and gives it your request. The decision comes back to you at your
next turn, and you continue from there. Requests run one at a time; there is
no parallel request and no approval step.

If the fork cannot decide, you are told so, and the choice of what to do
next is yours again.

## `request-completion`

The work item is ready to be closed or to be carried out. Its outline says
what you established:

- `changes` is your analysis, concise.
- `decomposition` is `single-iteration` when one piece of work carries the
  goal, including when that piece is empty because the goal is already
  satisfied, and `staged` when the goal needs several pieces in order. A
  staged decomposition names its stages; each stage may depend only on an
  earlier one.
- `reuse` names the behavior the goal rests on, with the module that owns it
  and the part it plays.
- `breakingChanges` names each guarantee the work would break, with the
  consumers it affects and the citations that show them. Empty when none.
- `revisionReason` is empty the first time. If the harness returns a failing
  gate to you, say in it what you changed and why.

`reports` reports `done` each scenario of this work item you judge correctly
implemented and passing, including those existing step definitions already
bind. See Scenarios and your reports above.

The harness then runs the work item's gate: the project's tests, its type
check, a complete Ramify check and, in quick mode, every module's scenarios
that carry no pending tag. Only that gate closes the work item; your
submission asks for completion and never states it.

Before that gate, the reviews of your iterations settle. When they leave
CheckFindings that need attention, a fork of your session taken at your
completion request assesses them together, and its brief is appended to
your session. When that assessment chose a correction, you are continued to
assign it: one ordinary iteration whose goal is the correction the brief
names. It goes through the ordinary gate and reviews, and when it is done
you request completion again. A reconciliation never passes a gate for you.

## `unresolved`

The request cannot be met as stated, and no outline would be honest about it:
it contradicts itself or the project's rules, it lacks information, it breaks
something no stage can carry, the evidence it asks for cannot be had, or the
harness offers no way to do it. Name the conflict and the evidence for it. Do
not weaken the request to make it satisfiable; that is not yours to decide.

The global architect decides what follows, and you are continued with its
answer. It may fix a placement, which reaches you as a placement decision. It
may record a plan deviation: the requirement as written, what the run does
instead and why. The deviation binds the rest of the run, and you go on with
the work item under it, meeting the rest of the plan as written. The person
reviews it later. It may find that the conflict lies in how the gate or the
harness runs, such as a prerequisite the gate's command lacks, and report it
to the operator: the run waits, and when the operator resumes it you are
continued with the diagnosis and retry from your last outline. Or it may
find that nothing of the plan is worth doing around the conflict, and the
run ends.

Answer `unresolved` for a conflict once. A conflict a deviation already
answers is settled for this run. After an environment problem, ask again
only when the same failure returns.

## `yield-for-providers`

An iteration of yours reported that behavior it needed is owned elsewhere,
a contract was established, and your work item now holds one or more open
requirements. When this work item has done what it can against those fakes,
yield.

Name in `requirements` the open requirements you wait for. The harness runs
their provider work items before the next independent entry work item and
returns this work item when every provider has conformed. It returns you
before the requirements close: verification is yours to assign, and waiting
for it here would wait for yourself.

A requirement closes only when a `verification` iteration has replaced the
fake with the real provider and its gate has passed. Requesting completion
with a requirement still open is refused, whatever the tests say.

A fake is exactly as importable as the real export it stands for, and every
gate verifies it while the fake is registered. Plan the consumer's work
through the seam the real provider will use: where the real behavior reaches
your module as data through a path that already exists, your module
integrates through that path and never imports the fake. A verification
iteration replaces the fake where it was injected and removes the fake's
exposure with it.

## Revising an agreement

Assign an iteration of kind `contract` with `revisesContract` naming an
agreement this work item consumes. You do this when a provider reports it
cannot conform to the agreement as it stands, and when the behavior your own
work needs is not what the agreement says.

- `approach` is your rationale for the revision: what has to change about the
  agreement, and what must stay.
- The harness supplies the revision number, the write scope and the gate. You
  do not choose any of them, and no submission carries them.
- The agreement in force stays in force until the revision passes its
  contract gate. Nothing of it is rewritten before that.
- When the revision is registered, every consumer attached to the agreement
  is reopened at the new revision and verifies again. A work item that had
  completed stays completed and gets a follow-up; one that has not finished
  keeps its identity and receives the new evidence at its next turn.

If no revision would meet the request, answer `unresolved` instead.
