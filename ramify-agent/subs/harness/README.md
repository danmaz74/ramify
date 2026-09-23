# harness

Serves one Ramify project to its clients and owns every durable record of the
work done on it: it is the only writer of run state, its records and its
events. It reads the project's plans, drives implementation runs through the
agent port, and answers its own protocol's queries over HTTP. It owns the
public contracts of that behavior: the vocabulary of the evidence a run works
from, the run's own commands and vocabulary, and the HTTP protocol it
serves.

## Layout

`src/interfaces/` holds this module's public contracts, the only source it
exposes beyond `startServer` and its two errors, with the types their
signatures name, and the `session` command's entry with the types it names:

- `interfaces/protocol/`: the HTTP JSON protocol under `/api/v1` between the
  harness and any client, one file per concern: `ids.ts`, `evidence.ts`,
  `queries.ts`, `errors.ts`, `jobs.ts`, `runs.ts` and `paths.ts`. It hides
  the wire encoding and its versioning; both sides validate what crosses the
  wire with these schemas.
  - `evidence.ts` holds the vocabulary of the evidence a run works from: how
    a module is named by its declared-name path from the root, as the
    architect view names them; how a digest is written; how a claim is cited;
    which architect view an input manifest describes; and the module tree a
    client draws. The initial analysis, the registry, the hypotheses and the
    work items all name modules and cite the view, so the vocabulary is one
    file and not each of theirs.
  - `runs.ts` holds the public protocol of an implementation run: the
    `start-run` command, the roles a run invokes, the reasons it can fail and
    the phases it passes through, and every answer a client reads: the
    `RunSnapshot` with its notices, the run list, the projected event page,
    the analysis, the decision list, the work items, `CapabilityProgress`,
    one gate attempt with bounded output tails, and `Metric[]` with the
    evaluation evidence beside them, with the limit of each list. Each answer
    is a projection; the durable records and the internal event union stay
    private, so the log can change without changing the wire.

Every export of those files is a Zod schema, a type inferred from one, or a
constant. They import nothing but `zod` and each other, so every export
promises browser safety and the root re-exposes it to the web client.

The remaining responsibilities below are directories in `src/`. Each is a
candidate for a child module once a second consumer, a dependency worth
hiding or measured complexity justifies it.

- `store/`: the project's own files. The file primitives themselves are the
  `ledger` child's, and this directory uses them.
  - The project lock, `plans/.harness/lock`, with the process ID and start
    time of its owner. A lock whose process is gone, or whose process ID was
    reused, is taken over. The server holds the lock for its whole life, so
    that recovery never touches another live harness's job.
  - `state-directory.ts`: every directory the harness writes,
    `plans/.harness/` and each plan's `.harness/` and `map/`, holds a
    `tsconfig.json` that selects no files. Ramify's project walk observes
    every directory listing, so a file the harness creates would change the
    input identity a job or an approval is compared by; a directory with its
    own compiler configuration is an independent scope, which the walk does
    not enter. A plan's two directories are created before a job's evidence is
    captured, so materializing after publication gives the manifest's input
    identity again. Each directory of the harness's own records also carries
    a `.gitignore` ignoring everything in it, itself included: a run commits
    the working directory with `git add -A` after a gate passes, so without
    it the run's own log, its records and the project lock would be committed
    with the work they describe, and a clean tree would never be clean.
- `jobs/`: what a job of this harness is, whatever a job turns out to be. An
  implementation run is the one kind. Every durable write here goes through
  the `ledger` child.
  - `records.ts`: where a job lives, `plans/<plan-id>/.harness/jobs/<job-id>/`,
    how its ID is made, and how a directory whose record this harness does not
    support is reported rather than served. A `job.json` of another kind, such
    as one Plan 1's mapping job left behind, is not a run: it is not loaded,
    not listed and not a warning.
  - `commit.ts`: the commit rule for a transition that carries records. One
    appended line holds every record body and the ledger writes each record
    file as a copy of it; a transition already in the log is not appended
    again and a file that differs from the log is rewritten from it; a reader
    answers valid, unsupported version or invalid, never an absent record;
    recovery is one loop over the log for every record kind, and calls no
    agent. An effect outside the harness goes from intent to completion under
    an idempotency key. It reimplements nothing the ledger does.
  - `commands.ts`: accepting a command, decided before the command has any
    effect. `CommandLedger` holds the three rules below, over any command's
    ID, expected version and content, so every command the harness serves is
    admitted by one set of rules. `commandHash` is the content hash they
    compare, and `CommandRejection` carries the protocol's error code.
  - `mutex.ts`: the one serialization primitive the run's writes use.
  - `activity.ts` turns agent events into the observed activity an
    invocation's observation log records.
- `checks/`: the check engine, which knows nothing of runs.
  - `records.ts`: the `GateAttempt` record and the shapes it is built from:
    a `Checkpoint`, a `CheckCommand`, and a `TestSelectionPolicy` with the
    `TestSelection` it resolves to. A `CheckCommand` names the environment
    its child receives and holds no value of one: `env` is those names,
    sorted, and `envAdditions` the harness's own settings for that command.
    `checkCommand` is its one constructor and `checkCommandEnvironment` the
    one way to the environment a spawn is given, built from
    `childEnvironment`'s allowlist at the moment it runs. The policy that
    chooses them belongs to the iterations that assign work.
  - `verify.ts`: verification before execution. Every command and every
    selection of an attempt is verified before the first command runs, so a
    checkpoint that cannot run what it requires runs nothing at all: a
    missing executable or working directory, an empty selection the
    checkpoint requires, a required suite rediscovery did not select, and a
    discovery that failed are each a reason the attempt records.
  - `checkpoint.ts`: what each checkpoint requires beyond the type check and
    the complete Ramify check, which every one of them runs: which tests, and
    whether a pass is followed by the harness's commit. It is mechanical and
    hardcoded; no submission carries it and no agent chooses it. An
    `all-project` checkpoint that follows an assignment also runs that
    assignment's own selection beside the project's tests, which is what
    tells a failure inside the last scope from one outside it.
  - `selection.ts`: resolving a policy against the tree as it stands. Each
    exact owner's own test area, every descendant owner's for an included
    subtree, the ordinary source of a testing module inside the selection,
    and the suites a registered obligation requires. Owner-to-directory
    mapping comes from the refreshed architect view and from nothing else; a
    discovery that fails is not verified and never falls back to an earlier
    list.
  - `gate.ts`: the policy half of a gate. It verifies the command plan,
    compares the captured guarded hashes with the tree, classifies the
    executor's command records and answers one attempt. Committing checkpoints
    use the audit executor in `subs/audit`; readiness and the standalone
    session's optional gate use the in-place executor because they do not
    commit. The guarded set is the configuration, the
    manifests, `ramify-agent.json`, the support files it names, the contract
    artifacts in force and every tracked feature file at the hash of its
    expected rendering; a change no record the
    assignment names authorized is `guarded-change`, never a pass, and a
    deletion is `after: null`. An outcome comes from how the command ended and
    the code it chose, never from what it printed; a Ramify check exiting 2
    was not checked, which is never a pass. The complete output of each
    command is a file beside the attempt, and the record carries its path,
    its size and a bounded tail. A Ramify check that failed printed a report
    that names each finding's own file, and that report attributes the
    cause: `attribution` records those locations against the write scope the
    attempt followed, and the check itself is left out of the scope
    comparison, because a command of the whole project would otherwise call
    every module violation a failure outside the assignment. A failed Ramify
    check returns to the local architect whatever scope its findings lie in:
    what a module may import is the architect's to arrange with the owner,
    and an engineer given the same brief again cannot widen it. No test
    output is parsed for any of this. The attempt is returned, not written:
    the harness commits it with the event that closes the checkpoint. The
    audit executor runs each planned command
    through the harness's own command runner in a temporary worktree of the
    exact commit, then returns the published run, report and tree refs with
    the harness command records.
  - `diagnostics.ts`: what a failing attempt says to the agent that receives
    it. Each command that did not pass is named with what it reported: a
    Ramify check's findings, worded by the one function that words a finding
    anywhere, or the bounded end of the command's own output where it
    reported no structure. A scenario check is read from its summary
    instead: each tracked scenario that did not pass with its name, file and
    line, its failing step, its bounded message and the steps no definition
    matched; each one that passed with the definition that bound each step
    as `uri:line`; and the check's other failure lines. The local architect
    also receives what a module violation leaves it to decide.
- `run/`: implementation runs. A run is a job, and the only durable authority
  of one is its `events.jsonl`: one flushed line is one transition, carrying
  the bodies of every record it commits, and the files beneath the run are
  materialized copies of it.
  - `records.ts`: the run's records and where each is materialized beneath
    it: `RunRecord`, `RunPolicy`, the project's configuration
    (`ramify-agent.project/1`), the entry assignments, the readiness
    attempts, the infrastructure recoveries, the measurement snapshots, the
    invocations with their outcomes, and the reader of a gate attempt. The
    schemas are here and not beside the types they mirror, because
    persisting a record is the run's concern.
  - `policy.ts`: the hardcoded policy a run captures, its bounds, each role's
    context policy and every command it reaches the project through, each
    naming the environment the harness built for it. `job.json` holds those
    names and the harness's own settings, never a value of this process's
    environment; a run recorded before that is read as the names its map
    held. It also walks the project for independent nested packages.
  - `log.ts`: the run log and its events, from `job-started` through
    readiness to the terminal event. Nothing follows a terminal event.
  - `observations.ts`: one invocation's observation log. It is canonical for
    what was observed and for nothing else, so it does not go through the
    ledger; a replayed `(invocation, callId, type)` is dropped.
  - `submissions.ts`: the one place that answers an invalid input. Every
    error goes back to the same session as JSON with its path, retries are
    bounded per turn, each rejection is an observation, and exhaustion ends
    the invocation as `invalid-submission`.
  - `writer.ts`: the one writer of a run. Settlement is the harness's own
    observation: the session idle, and every registered process group killed
    and confirmed gone. A release that could not be confirmed blocks every
    writer and every gate that would follow.
  - `project-config.ts`: the project's `ramify-agent.json`, read at
    `start-run` through `subs/evidence`, validated and captured into
    `job.json` beside the policy, with the reason where it is missing or
    invalid; and what readiness asks of a valid one: the modules' test areas
    its support code must match, and whether each mode's commands resolve.
  - `readiness.ts`: the readiness steps, their bounded recovery and the
    discovery of the project's test files. A failure a preparation can
    repair consumes one recovery; one it cannot consumes none.
  - `gates.ts`: a checkpoint of a run and the commit that follows a pass,
    with the message the harness writes mechanically from records.
  - `inputs.ts`: the evidence seam. A run's lifecycle, its log and its
    recovery do not depend on how the evidence is obtained, so a test of the
    lifecycle needs no views: the manifest a run captures, the architect view
    its analysis is checked against, and how its inputs have changed.
  - `service.ts`: the runs of one project, their commands, their lifecycle,
    their recovery and the queries that read them. One invocation goes
    through one path, whatever its role: the record is committed before
    `startSession`, the judge is the one answer to an invalid submission, and
    the closing event is the last write of the invocation.
  - `mutations.ts`: what a writer changed, read from `git status` when it
    settles. That snapshot is the only observation that sees a write no
    guard saw; comparing it with the write scope fills `outsideScope`, and
    a path is reported there rather than blocked.
  - `excursions.ts`: read boundaries, which are soft. The first read into
    another module is one `excursion` observation and one concise reminder;
    a later read of the same module is neither. What Ramify generates is
    never an excursion, and neither is a path no module owns.
  - `snapshot.ts`: the run's projection, a pure function of its `job.json`
    and its log.
- `analysis/`: the run's initial analysis, which turns the plan into what the
  run needs before any work is assigned.
  - `submission.ts`: the initial architect's submission, its strict schema
    and every rule the schema cannot hold: slugs unique in the run, an owner
    the view has or a module proposal whose parent it has, with a
    non-conflicting direct-child directory under that parent's `subs/` whose
    name agrees with the owner and the declaration, plan references that lie
    inside the captured plan, and citations whose module, file and symbol the
    cited view records. A hypothesis alone gives no authority to create
    anything, so nothing here reads one. It is `initial-architect/2`: every
    entry's acceptance scenarios and the plan's integration scenarios, whose
    form rules the `scenarios` child applies after every other rule. The
    capability slug `integration` is reserved for the integration
    scenarios' feature file.
  - `records.ts`: the `Hypothesis` and the `RegistryEntry`. A hypothesis is a
    forecast and nothing more: it has no reference to a work item, and
    nothing references it but a decision and a local architect's input.
    Revision 1 is never rewritten. Its `change` has no value for extending a
    capability: an extension is forecast as `create`, and
    `changesExistingSymbols` says whether implementing it is expected to
    change symbols that already have consumers.
  - `accept.ts`: what one accepted analysis commits, in the single
    `analysis-accepted` transition: the entry assignments, every hypothesis
    at revision 1, one registry entry per entry capability, one work item
    per entry capability and one `ScenarioRecord` per scenario, numbered by
    the `scenarios` child, with the form rules' warnings on the event. It is
    a pure function of the submission, the view, the captured plan
    scenarios and the invocation, so a repeat after a crash derives the same
    records with the same IDs.
- `architecture/`: capability identity and placement, resolved in sequential
  forks of one long-lived architect context. The initial analysis session
  becomes that context; it is never invoked for a decision.
  - `records.ts`: the `PlacementRequest` a local architect makes and the
    `PlacementDecision` one fork commits, with where each is materialized and
    how their identifiers are derived. A decision that replaces an earlier
    one says so in `revises`, with what it affects.
  - `submission.ts`: what a fork submits, what a local architect submits when
    it decides within its own authority, and what it submits when it cannot.
    The three carry the same decision body, and the rules beyond the schema
    are shared: an owner the refreshed view has or one a proposal creates
    with an existing parent and a free direct-child directory, the same
    proposal on the decision and its registry entry, `revises` wherever a
    registered capability is placed elsewhere, and a hypothesis revision that
    names a hypothesis this run committed. `reuse` may name an owner an
    accepted proposal created; it never introduces one. There is no outcome
    for extending a capability: an extension is a `create` whose owner is an
    existing module, and only such an owner may carry
    `changesExistingSymbols`.
  - `accept.ts`: what one accepted decision commits, in the single
    `decision-accepted` transition: the decision, the registry entries it
    creates or revises and the hypothesis revisions it makes. It is a pure
    function of the submission and the committed records, so a repeat after a
    crash derives the same records.
  - `context.ts`: the architect context as a projection over the log and the
    committed outcomes — its generation, the point its history has reached,
    the briefs it holds and the decisions not appended yet. A brief appended
    to it causes no model call; it reaches a model when the next fork
    inherits it. A rebuilt parent is oriented from the hypotheses, the
    registry and the decisions, which is what `orientation` renders.
  - `session.ts`: what one fork is given — the focused request, the
    refreshed view's identity, the registry and the decision log. It is not
    given the view's contents: the fork reads what it needs itself.
- `work/`: module work items and their local architects.
  - `records.ts`: the `WorkItem` and the `WorkItemOutline`, and where each is
    materialized beneath the run.
  - `submission.ts`: what a local architect submits, and the rules beyond its
    schema. It offers `assign`, which commits an outline revision, the
    placement this architect decided itself and one iteration assignment;
    `request-placement`, which asks the global architect where a capability
    belongs; `request-completion`, which commits an outline and asks for the
    work item's gate; `yield-for-providers`, which names the open
    requirements this work item waits for; and `unresolved`, which ends the
    run with a conflict rather than weakening the request.
  - `assignment.ts`: the assignment body an architect submits and the rules
    the schema cannot hold: the module is one the refreshed view has or one
    an accepted proposal creates, an included child is a direct child and
    never a descendant, an extra location lies under a module, a named
    capability is one the registry holds, and the stage is one the outline in
    force names. It carries no gate, no test selection and no guarded
    hashes: the harness derives those. A `breaking` assignment works a
    guarantee the outline records as broken, and only it may state the
    explicitly broad base `{ modules, rationale }`, whose rationale may not
    be blank. An authorization names a guarded path and arrives with the
    outline revision that records it.
  - `iterations.ts`: the `IterationAssignment` with its captured
    `WriteScope`, the `IterationResult` and the notice a created or removed
    module becomes, and where each is materialized beneath the run.
  - `scope.ts`: capturing a write scope's real paths. An ordinary assignment
    reaches the assigned module's own source area and its two declaration
    files, plus the complete directory of each immediate child it named, plus
    the locations assigned beyond that base. A bootstrap scope reaches a
    directory that does not exist yet, through its nearest existing ancestor.
    The paths are captured once; a later refresh never widens them.
  - `engineer.ts`: what an engineer submits, its own test tool, and the
    briefing it starts from. `run_scope_tests` takes nothing: the assignment
    and the files its policy selects are the harness's, and it resolves them
    anew on every call. Where the run tracks scenarios it also runs the
    scope's scenarios in quick mode, selected by identity as an iteration
    gate selects them plus the work item's pending ones, and reports each
    one; its profiles and streams go beneath the invocation. Beside it the engineer receives `shell`, which the
    `tools/` directory owns. `contract-needed` is how it reports that the
    behavior it needs is owned elsewhere: the need is stated as behavior, its
    turn ends there, and no session of its own is started for it.
    `break-discovered` reports that the goal needs a break; it returns to the
    local architect and is refused to an engineer already working the
    planned break.
  - `frontier.ts`: which hypothesis revisions each work item receives at a
    coordination point.
    A hypothesis reaches a work item because it involves that module or
    anticipates it as a consumer, not only because it suggests it as owner. A
    superseded one is delivered too, with its standing: an architect told to
    expect a capability elsewhere is told when that forecast is withdrawn.
  - `committed.ts`: the records a run has committed, read from the log rather
    than from the files, and validated again as they are read back.
  - `session.ts`: what a local architect is given for one work item: the
    goal, its requirement and acceptance references, its module's onboarding
    and API view, the hypotheses it received with their rationales, the
    registry, and the placement decided for it — its own, and the
    consequences of a decision that names it. Where a view cannot be materialized the message says so, so
    that absence is never read as a refusal.
  - `scenario-briefing.ts`: what the briefings say of a work item's
    scenarios (architecture §6). The local architect is given every
    scenario of its entry with its ID, state, text, feature file and, for a
    sub-scenario, the integration scenario it came from; the engineer each
    one not implemented, the ones `assignment.scenarios` names under
    "Scenarios to bind", the rules of binding and the request for named
    imports of another owner's step files; an integration item's engineer
    its scenario and the step files it imports. A provider or follow-up work
    item's briefings say nothing about scenarios. `assignment.scenarios` is
    informative: the judge accepts only scenarios of the work item, and no
    engineer must declare exactly those.
- `contracts/`: one agreement between a consumer and a provider, and the
  scheduling it creates. Nothing here writes the log; the run drives it.
  - `records.ts`: the `ContractRecord`, the one `ProviderObligation` keyed
    `ob-<contract-id>`, and one `ConsumerRequirement` per consumer attached
    to it. A second consumer of the same agreement adds its requirement and
    nothing else, which is why a shared obligation is one provider execution
    per revision while each consumer verifies separately.
  - `submission.ts`: the need an engineer reports, stated as behavior and
    never as an interface, and what the contract sub-session submits.
    `established` registers; `incomplete` registers nothing. Neither carries
    the contract, its revision, the obligation, the requirement or the
    hashes: those are all the harness's.
  - `accept.ts`: what a passing contract gate registers, derived from
    committed state and from the files the gate passed over, so a repeat
    derives the same records. `registrationNeeded` is the key
    `(obligation, revision)` and `(requirement, revision)` that makes a
    registration already in the log not appended again. A revision carries
    every attached consumer forward at the new revision, so each verifies
    again; the agreement in force stays in force until that transaction.
  - `naming.ts`: the fake-naming rule the contract gate verifies. A fake file
    carries `.fake` before the language extension, every name it exports
    carries `Fake`, and a re-export keeps that designation. It reads the
    source and not the submission, because the source is what generated
    architectural evidence will show.
  - `verification.ts`: what closes a delegation beside a passing gate. No
    location the requirement named may still reach the fake, by an import of
    one of its files or by one of its exported names.
  - `graph.ts`: the dependency graph, whose nodes are capabilities. A
    requirement adds the edge from the capability its consumer is
    implementing to the capability of its obligation. A chain that runs back
    through a module is an ordinary chain; only a capability that
    transitively depends on itself is a cycle.
  - `revision.ts`: what a contract revision reschedules. Each new obligation
    and requirement revision is bound to the work item responsible for it:
    an item that has not finished is reused and receives the current
    evidence at its next coordination point, and one that had completed
    stays completed and gets a follow-up that `follows` it. An assignment of
    a reused item that never closed closes as `superseded`, because no old
    assignment is accepted for the new revision.
  - `schedule.ts`: depth-first scheduling. The deepest open work item runs
    first, and a consumer whose providers have all conformed comes back
    before the next independent entry work item. It does not wait for its own
    verification, which would wait for itself. A consumer a provider's
    report reached answers before anything else, even while it is yielded,
    and a verification work item waits for the provider of the requirement
    it exists for.
  - `session.ts`: what a contract sub-session is given: the need as the
    consumer wrote it, both sides of the seam, the existing consumers when it
    extends an agreement, and the naming rule its gate will verify.
- `projections/`: every answer of the run protocol, computed from what the
  run service's `committed` hands out (the run's record, its directory and
  the complete lines of its log with their record bodies) and from the run's
  own files, read and never written. No projection appends an event, writes
  a file or infers a transition. `inputs.ts` builds the view every query
  reads and refuses a record of a version this harness does not read with
  `unsupported-version` and its evidence, never as an absent record;
  `snapshot.ts` orders notices with module notices first; `events.ts`
  projects each event to its transition, references and time; `analysis.ts`
  holds the hypotheses and the decision list, read from the records that hold
  each choice; `work.ts` the work items and gates, each output tail bounded
  at 8 KiB and each command's environment withheld, and a scenario check's
  summary in compact form (statuses and failures, without bindings);
  `progress.ts` the capability progress, where `completed` needs current
  verification evidence, a provider wait stays working with its reason, a
  reopening returns a completed capability to working and a superseded
  hypothesis leaves the list, and each entry counts its scenarios,
  implemented of all it has; `scenarios.ts` the tracked scenarios, replayed
  as `run/feature-files.ts` replays them: the review's frozen text with the
  warnings `analysis-accepted` recorded, and the scenario list
  (`GET .../runs/:runId/scenarios`) with each scenario's state, origin, work
  item, owner, file, implementing gate and every gate attempt whose scenario
  check ran it, with its status there read from that attempt's summary;
  `metrics.ts` the KPIs and the evaluation evidence; `queries.ts` the one
  entry point the HTTP adapter calls. A projected scenario event refers to
  its scenario.
- `prompts/`: one prompt package per role, versioned and hashed into the
  run's `prompts/manifest.json`. `submissionKinds` names the union members a
  package offers its role; a member a package does not offer is one no run
  can produce. The rendered prompt is never stored: it may hold file
  contents. The contract package is an engineer's with the contract skill
  beside the module architect's: the role is an engineer, and the skill is
  what makes the invocation a contract iteration.
- `guard/`: the write guard. `edit` and `write` are intercepted before they
  execute: the target is resolved against the invocation's working directory
  and then against the real filesystem — an existing path is its own real
  path, and a new one is its nearest existing ancestor with the remaining
  components appended — and only then checked against the write scope the
  assignment recorded. A block makes no mutation, does not end the session,
  does not request approval and does not widen the scope; a target that
  cannot be resolved at all is its own verdict, distinct from a proven scope
  violation. Nothing here stores what a call proposed to write.

  What it does not cover is stated rather than implied: the `shell` tool
  names no target to judge, so its writes pass no guard at all. They are
  seen afterwards, in the tree and in `outsideScope`, and every invocation
  that used the shell carries the `unguarded-shell` coverage gap.
- `tools/`: the harness's own tools that are not one role's. `shell.ts` is
  the shell an engineer receives in place of the implementation's own: one
  command through the lifted executor, in its own process group, with a
  environment built from the same allowlist as every other child, a timeout
  it may be given and an 8 KiB tail beside a file holding everything. The
  allowlist is deliberate here: the command is one an agent wrote, so a
  wider environment would hand it every secret of the person's session. It declares itself mutating, so the post-write
  hook check runs after it, and it settles what it left running before the
  writer is released.
- `hooks/`: the post-write hook check the harness installs itself, because
  the adapter disables automatic extension discovery. After each settled
  mutation it runs `ramify check --changed` over the paths that mutation
  named. Exit 2 is not checked, with the CLI's reason; it permits continued
  editing and is never a pass. Where the changed set cannot be established,
  or where a changed path is a named configuration file that no changed
  check covers, the harness answers that at once as not checked and runs a
  complete check instead of claiming hook coverage. That complete check is
  then the one that speaks: where it answered, the changed form it replaced
  is not reported as a gap, because saying nothing was verified when the
  complete check verified everything is a false alarm, and a model that
  learns to ignore the hook ignores the one message that matters. Only a
  complete check that could not run itself leaves a gap to state. A finding
  this invocation has already been told about is not newly introduced, so it
  is not reported at the engineer twice, and a check that no longer reports
  one says in a line that what was reported no longer stands.

  A claimed completion is checked afresh over the whole write scope before
  it is judged, because the hook checks saw only the mutations they covered:
  a violation written through the shell, or written while a check did not
  run, would otherwise reach the gate. That check is bounded, and it can
  answer that it did not check. It is never a pass then and never a refusal
  either: the submission proceeds, the acceptance says the check could not
  run, and the gate's own complete check answers. A completion is not held
  back for a check the harness could not get an answer from.
- `kpi/`: measurement capture. A snapshot holds one `ramify.measure/1`
  document verbatim with its hash, and `scopeSize` is the `S_s` recipe over
  it. A missing component makes the total unavailable with its known
  subtotal beside it, never a zero, and a module that does not exist yet has
  an unknown size. `lines.ts` captures what one writer invocation changed,
  from two snapshots of the working directory around it and from git alone;
  `sessions.ts` counts every session, whatever ended it, and only the change
  weight tells a session that changed nothing from one that did. A binary
  file carries its byte count and no invented line count, and a path no
  module's own contents hold is unmapped rather than charged to the root.
  `guarding.ts` is the projection an evaluation carries beside its counts:
  which tools the guard judged, which mutated without passing it, the
  excursions the reads made, the gaps that qualify the totals, and the
  statement that a count of blocked calls is not evidence that every write
  respected its scope. `metrics.ts` is the KPI projection, `kpi/1`, versioned
  apart from the measurement policy `scope-size/1`: every metric carries its
  unit, state, value, numerator, denominator, known subtotal, coverage and
  evidence. A missing observation is `unavailable`, a zero denominator
  `not-applicable`, and a whole-run ratio over partial coverage `partial`
  with no value; only a `measured` metric has one. Token categories stay
  separate and no usage becomes a price. Settlement's process-group count is
  not a metric: it is zero by construction.
- `plans/`: discovery of `plans/<plan-id>/plan.md` in the project, with the
  title taken from the first heading. Hidden directories are skipped; an
  unreadable file is an error entry, not a failed list.
- `http/`: the Express adapter serving `/api/v1`, each response validated
  against its protocol schema, and the built web client when it exists.
  `startServer` is the module's entry point. It takes the project lock,
  opens the run service, which recovers the runs a previous harness left,
  and serves the project, its module tree, its plans, the run queries and
  `POST /api/v1/commands`, the one route that changes anything, which acts
  through `RunService.execute` alone. `ProjectLockError` is exposed beside
  it. The agent is pi, the scripted fake chosen explicitly as `fake` (an
  analysis with no entry capability), or an implementation a test supplies
  through `startServerWith`, which stays internal with the run settings.
- `sessions/`: one engineer session on one module, from a prompt a person
  writes, outside any run; the root's `session` command runs it.
  - `single.ts`: `runSingleSession` takes the project lock, resolves the
    module in the architect view before any agent starts, and gives the
    engineer the equipment an implementation run gives its engineers
    (`work/engineer-equipment.ts`). The prompt is the iteration's goal; the
    write scope is the module's own contents plus the extra paths. It reports
    what it observes through a progress callback, and an accepted submission
    is answered with what follows in a session, which is a person's review
    and nothing else. With the gate option it runs the `iteration` checkpoint
    over the module afterwards. It never commits.
  - `records.ts`: the session's plain files under
    `plans/.harness/sessions/<session-id>/`: `session.json`,
    `observations.jsonl` with the run's observation schema, `submission.json`,
    `outcome.json`, the shell and hook outputs, the implementation's
    transcript under `session/`, and the gate attempt under `gate/`.
  - `command.ts`: `runSessionCommand`, the command's entry. It builds the
    agent, pi after its readiness unless the person chose the scripted fake
    with a JSON script file, and a private Ramify daemon, and disposes of both. The
    root receives it with the progress, result, summary and gate types and the
    named types the summary mentions; the agent port, the Ramify command line
    and the run policy stay internal.

The child `agent` holds the agent port and the scripted fake, and relays its
child `pi`. Everything here depends on the port; the caller of
`RunService.open` chooses an implementation.

The child `ledger` writes the durable state, and receives nothing from this
module. The child `evidence` obtains every fact about the target project:
the `ramify` command line, which the server gives a daemon of its own
through `RAMIFY_ENDPOINT_DIR`, and the readers of the architect view, of a
requester's API view, of the measurement document and of the module tree a
client draws on. It also runs one of the project's own commands, hashes
the guarded files and holds the small git service the run branch needs.
Neither child receives this module's vocabulary.

## The run

- **Commands.** `start-run` carries the plan, the agent and `reviewStop`,
  `false` by default and recorded in `job.json`, and nothing the harness
  executes. Plan 1's three rules hold unchanged, and a second run while one
  is active is `busy`. `stop-job` is Plan 1's. `approve-analysis { reviewer,
  note? }` records `analysis-approved`, once, with the command and whether
  the run was working when it was given (`duringRun`); it is refused before
  the analysis is accepted, during the final verification and for a run that
  failed, stopped or was interrupted, and accepted after completion, the one
  event that may follow `job-completed`.
- **The review stop.** With `reviewStop`, `analysis-accepted` is followed by
  `review-requested` and the phase `awaiting-review`. The run stays
  `running` and keeps the project, starts no session and writes nothing to
  the tree: the approval continues it to readiness, a stop ends it with no
  branch and no commit, and a restart marks it interrupted like any other
  phase. The wait is not counted against `runAbsoluteMs`. The snapshot
  reports `review`: `not-reviewed`, or who approved, when and `duringRun`.
- **The phases.** One invocation of the initial architect, then readiness,
  then the work items, then the final gate. The frontier is read again on
  every round, because a delegation creates work items while the run runs.
  `invocation-started` is appended before `startSession` and
  `writer-acquired` before any writer starts, so a stop that arrives in
  between applies to a known invocation.
- **The initial analysis.** One `initial-architect` invocation over the
  captured plan, the plan scenarios extracted from its `gherkin` blocks when
  it was captured, the refreshed architect view and the module-architect
  skill. Its submission commits, in one `analysis-accepted` event, the entry
  assignments, every hypothesis at revision 1, one registry entry per entry
  capability, one work item per entry capability and one `pending` scenario
  record per scenario, whose text is frozen from then on. A hypothesis creates
  nothing: no work item, no obligation and no completion requirement is
  derived from one.
- **A work item.** One is created per entry capability, always; its module is
  the entry's owner and its goal the entry's description. At each of its
  coordination points, `hypotheses-delivered` records which hypothesis
  revisions it holds, selected by the modules a hypothesis involves and the
  consumers it anticipates, not only by the owner it suggests. A revision one
  decision made therefore reaches every work item it involves before that
  item's next assignment. Delivery never rewrites an active assignment.
- **A placement request.** Requests run one at a time, and never in parallel.
  The harness records the `PlacementRequest`, refreshes the architect view
  and records its identity with the request, then forks the architect
  context's latest point and gives that fork the request, the registry and
  the decision log. The fork investigates and decides; the parent neither
  reassesses nor approves, and is never invoked for the choice. There is no
  retained comparison baseline and no diff: each fork checks current facts.
  If the view's identity changes between the refresh and the decision, the
  evidence is revalidated and the affected investigation repeats; two
  revisions are never combined. A fork that cannot decide returns findings
  and gaps, which consume one retry of `forkRetriesPerRequest` and are never
  appended; exhaustion returns an unresolved outcome to the local architect.
- **A decision and its brief.** `decision-accepted` commits the decision, the
  registry entries it creates or revises and the hypothesis revisions it
  makes, in one transition, and it is the intent of the parent append. The
  append is keyed by the decision's own identifier, so a repeat after a crash
  is answered `already-present` and one brief reaches the parent exactly
  once. Appending is storage: no model request, acknowledgement or parent
  review happens, and the brief reaches a model when the next fork inherits
  it. A parent that can no longer be read raises the generation through
  `global-context-rebuilt`, which clears what was pending; the next fork is
  started fresh and oriented from the hypotheses, the registry and the
  decisions. `decision-delivered` returns the decision to the local architect
  that asked, before it plans anything further.
- **A contract sub-session.** An engineer that needs behavior outside its
  scope submits `contract-needed` with the need stated as behavior; its turn
  ends there and no nested live session is started. The harness resolves the
  owner from the registry and commits a `contract` assignment through
  `contract-requested`, whose `requestedBy` names the engineer's iteration.
  That assignment is a committed record, so a caller that dies discovers the
  outcome without the original reply. The sub-session is an engineer
  invocation with the contract skill, scoped to the requesting consumer, the
  contract, its conformance suite, its fake and the exposure declarations on
  the path between the two sides. Only `established` followed by a passing
  contract gate registers; `incomplete` registers nothing.
- **Registration and scheduling.** `contract-registered` commits the
  contract, one obligation keyed `ob-<contract-id>`, one requirement per
  consumer and the provider work item, keyed by `(obligation, revision)` and
  `(requirement, revision)` so a repeat appends nothing. A consumer finishes
  what it can against the fake and submits `yield-for-providers`; the harness
  runs the provider work items of those requirements before the next
  independent entry work item, and `work-item-resumed` returns the consumer
  once every provider it waits for has conformed. It resumes while the
  requirements are still open, because waiting for its own verification would
  wait for itself. A shared obligation runs its provider once per revision
  and each consumer verifies separately.
- **What closes a delegation.** The provider's gate runs the agreed
  conformance suite against the real implementation and `provider-conformed`
  records it, once per obligation revision. The consumer then assigns a
  `verification` iteration, and `requirement-verified` is the only event that
  closes the delegation: it requires a passing gate and that no
  `fakeInjections` location still reaches the fake. A work item is refused
  completion while it holds an open requirement or owes an unconformed
  obligation, and the final gate waits for every latest requirement revision.
- **A dependency cycle.** The graph's nodes are capabilities. A capability
  that transitively depends on itself appends `dependency-cycle-detected`,
  returns once to the local architect of the work item whose registration
  closed it, and is a notice the person sees whether or not the re-plan
  resolved it. The same cycle detected again fails the run with
  `dependency-cycle`.
- **Local placement authority.** A local architect places work within its own
  subtree when the choice refines that subtree's established responsibility.
  Such a decision is committed with the assignment, with `authority: 'local'`
  and no request, and is discoverable from the registry: nothing is appended
  to the architect context for it, and a later fork finds the capability
  there. Physical containment alone does not make a capability local.
- **The local architect.** One continuing session per work item: each turn
  after the first continues the point the last one reached, and compaction is
  allowed and recorded. `request-completion` commits an outline and runs the
  `work-item` gate; requesting completion with no iteration is a legitimate
  outcome, because a goal existing behavior already satisfies is verified
  reuse and the gate is what verifies it. `unresolved` ends the run with the
  conflict and its evidence rather than weakening the request. A failing gate
  returns to the same architect, which may revise its outline; exhaustion of
  `repairRoundsPerWorkItemGate` fails the run with `repair-exhausted` and the
  original cause preserved.
- **Readiness.** The project root, a clean git repository, the compiler
  configuration, the test runner, the project's configuration, its scenario
  harness, the independent nested packages, test discovery, the Ramify
  command line, and then the project's own baseline:
  its tests, its type check, a complete Ramify check and two scenario
  checks, as one gate attempt through the in-place runner.
  `baseline-acceptance` runs every module with feature files in quick mode
  with `not @ramify-pending`; `acceptance-full` loads full mode with
  `--dry-run` and fails on an `undefined` or `ambiguous` step, or, with the
  configuration's `readiness: run`, executes it between its `setup` and
  `teardown`. Both fail as `baseline-tests` fails, and the attempt records
  them beside the other baseline steps, where they are verified. The run branch, `ramify-agent/run-<run-id>`, is created once a
  clean repository has been established. Agents never commit, and the harness
  never resets or reverts. `project-config` fails a run whose captured
  `ramify-agent.json` is missing or invalid, or names support code outside
  every module's test area (a module's `src/tests/`, a testing module's
  `src/`), with reason `project-config-invalid`; `acceptance-runner` fails one
  without `node_modules/.bin/cucumber-js` or with a mode command that does not
  resolve (`npm run <script>` resolves when the script exists), with reason
  `acceptance-harness-missing`. Neither consumes a recovery, and neither is a
  code-repair assignment. A missing or invalid file never refuses
  `start-run`. Once the configuration names the acceptance modes, a `test:`
  script that runs `cucumber-js` is no longer an unsupported runner.
- **The feature files.** Once readiness has passed and the run branch
  exists, and before the first local architect starts, the harness renders
  every tracked feature file from the scenario records and their states
  (`run/feature-files.ts`, with the `scenarios` child's
  `renderFeatureFiles`), writes it and commits it as "Scenarios of
  <planId>" with the `Ramify-Run` trailer, `Ramify-Scenarios: materialized`
  and no `Ramify-Gate`. The commit is the ledger's external effect:
  `scenarios-materializing { files }` is its intent and
  `scenarios-materialized { commit, files }` its completion, and the commit
  is an accepted boundary, so the first iteration starts from it. A recovery
  re-renders the files and finds the commit by its two trailers before it
  makes one. A re-rendering (`rerenderFeatureFiles`) writes only the files
  whose content differs from the rendering of the current states and
  reports whether a commit is needed; every gate's commit re-renders before
  it commits, after the guarded comparison. The files join every
  assignment's guarded list with the hash of the rendering the harness last
  wrote (`writtenScenarios`), and a gate compares them against that
  rendering, not against the current states, which a declaration changes
  before the next commit writes it. A file that differs at a gate is
  `guarded-change`, and the write guard
  refuses an agent's edit or write of a feature file or of
  `ramify-agent.json` outright, whatever the scope contains; no
  authorization names either.
- **The scenario check.** Every gate of a run with a valid configuration
  plans a `scenarios` command (`checks/checkpoint.ts`) per the architecture's
  table: `iteration` and `contract` select by identity tag the scope owners'
  scenarios past `pending`, and with none record `scenarios: none-selected`
  and run nothing; `breaking-iteration` and `work-item` run every module with
  feature files in quick mode with `not @ramify-pending`; `final` runs them
  all in full mode. Both runners execute it with `runScenarioCheck`
  (`checks/scenario-check.ts`): the mode's `setup`, one Cucumber run per
  module in sequence with a profile from the `scenarios` module written into
  the attempt's directory outside the worktree, then `teardown`, even after
  a failure. A run is bounded at 600 s in quick mode and 1,800 s in full
  mode, and the check at their sum plus setup and teardown. The check passes
  by its message streams, reduced by the `scenarios` module: every run
  exited 0, every selected tracked scenario and every one of the project's
  own passed; `undefined`, `pending` and `ambiguous` fail it. Its
  `ScenarioCheckSummary` is on the command record of the
  `ramify-agent.gate-attempt/3`, whose output ends with the failures, and a
  failure is repaired like failing tests.
- **Scenario states** (architecture §7 to §9). An engineer's
  `completion-proposed` and a local architect's `request-completion` carry
  `scenarios: string[]`, default empty. The judge accepts IDs of entry
  scenarios of the work item's own entry, or an integration work item's one
  scenario (`work/declarations.ts`), and rejects an unknown ID, another
  entry's scenario or an integration scenario of any other work item with
  the reason, under the per-turn bound. At acceptance each `pending`
  one becomes `bound` while the work item has an open requirement or owes a
  conformance, and `declared` otherwise (`scenario-declared { scenario, by,
  state }`); a `bound`, `declared` or `implemented` one is left as it is.
  After a passing committing gate every `declared` scenario its check passed
  is `implemented` (`scenario-implemented { scenario, gate }`), and every
  `bound` one stays bound with the attempt recorded as its fake-backed pass
  (`scenario-bound-passed { scenario, gate }`). When `requirement-verified`
  closes the last open requirement of a work item that owes no conformance,
  its bound scenarios are `declared` (`scenario-due`). A work item that
  leaves its repair path without a pass, because an iteration exhausted its
  repair rounds, or it requests placement or yields, withdraws every
  `declared` or `bound` scenario no gate passed since its declaration
  (`scenario-withdrawn { scenario, reason, commit }`). Where that restores
  a pending tag the harness re-renders and commits "Withdraw sc-001, …"
  with `Ramify-Run` and `Ramify-Scenarios: withdrawn-<n>`, as a ledger
  effect whose intent is `scenarios-withdrawing` and whose completion is the
  first `scenario-withdrawn`; the commit is not an accepted boundary, and a
  recovery finds it by its trailers and records the rest. A withdrawal of
  bound scenarios alone changes no file, and names the accepted boundary.
  An `implemented` scenario never returns: a later failure fails its gate.
- **Integration work items** (architecture §10, `work/integration.ts`). The
  `scenario-implemented` that implements the last sub-scenario of an
  integration scenario commits, in the same transaction, a work item with
  origin `{ integration: sc-NNN }` at the scenario's owner, the lowest
  common ancestor of the sub-scenarios' owners. It is committed after every
  earlier item, so it queues behind the current one; `work-item-started`
  names every item's `origin`, and an integration item's `scenario`. Its
  local architect's briefing carries the scenario, the sub-scenarios with
  their owners and bridging Givens, each owner's step files as the tree
  holds them (`src/tests/steps/`, or a testing module's `src/steps/`), and
  the scope its engineer must be given: the ancestor with the child on each
  path to a sub-scenario's owner included, which the assignment's judge
  requires. The engineer writes a step file at the ancestor that imports
  the sub-scenarios' step files by name, adds the `expose-test` declarations
  along each path and declares the scenario; the iteration gate selects it
  by identity with the implemented sub-scenarios, and the item completes at
  its own work-item gate. A failing gate whose scenario check failed an
  integration scenario while each of its sub-scenarios passed adds a
  composition failure to the diagnostics its engineer and architect
  receive, naming the sub-scenarios whose bridging Given is suspect
  (`compositionFailures` of the `scenarios` child); it is repaired like any
  failure.
- **The work-item and final gates.** All project tests, the type check, a
  complete Ramify check and the scenario check, on the current tree. A
  completion request applies its own declarations first and is refused,
  under the refusal bound, while a scenario of its entry is `pending` or
  `bound`. `work-item-completed` requires
  a passing `work-item` attempt and every scenario of the item's entry, or
  an integration item's scenario, `implemented`, and is the only thing that
  closes a work item. Before the final run the rule `acceptance-incomplete`
  requires every tracked scenario `implemented`, integration scenarios
  included; `job-completed` requires a passing `final` attempt whose
  scenario check passed every one in full mode, and an empty work queue
  alone never satisfies it. A change to the working
  directory blocks nothing: the gate runs the checks where they are and, on a
  pass, the harness commits. The commit is the ledger's external effect,
  keyed by the gate attempt, and a repeat after a crash finds it by its
  `Ramify-Gate` trailer.
- **Recovery.** On start, each run replays its log, every record file that is
  missing or differs is rewritten from it, each external effect whose intent
  has no completion is performed again under its key, an invocation whose
  start has no end is closed as `failed` with `session-lost`, and the run is
  marked interrupted. None of it calls an agent and none of it makes a
  duplicate. The tree is outside every transaction and is never restored: an
  engineer interrupted mid-edit leaves a dirty tree, and `git diff` shows the
  work that is not yet accepted.
- **Measurement.** The baseline `B` is frozen from the run's first snapshot,
  before `job.json` is written, because `job.json` names it. Every invocation
  records the snapshot it was measured against and the components of its own
  scope, captured when the observation happens and never added afterwards.

## Quick pi tests

The `session` command is also the quick pi test: one real engineer session
on a prepared copy of the fixture, with the equipment a run uses, to observe
how a model reacts to one harness text, tool or refusal in about a minute.
The root [README](../../README.md#quick-pi-tests) shows how to prepare a copy
and a forced-violation example. It calls a model, so it is a development
check and never a test; `session-command.test.ts` at the root runs the
command on the scripted fake instead.

## Ramify's daemon

Materialization runs through Ramify's resident daemon. In a daemon context,
once a file or directory has been added to the project, every later
materialization waits about 125 seconds for dependency facts and then
publishes the architect view without them (`dependencies unavailable
(wait-limit)`), even at an unchanged revision. Content changes do not do
this. A new plan's directories, or a file a person adds, is such an addition.
The server therefore runs Ramify with
an endpoint directory of its own and stops that daemon before each job's
capture, so every job starts from a fresh context. Nothing else shares the
daemon, and closing the server stops it.

## Testing

Tests live in `src/tests/` and run on temporary copies of projects, with
runs driven by the scripted fake. `protocol-contract.test.ts` checks the
public contracts on their own: every protocol schema accepts its examples and
rejects unknown fields, and the evidence vocabulary refuses a module path, a
digest, a citation and a view identity that are not what they claim to be.

`commit.test.ts`, `record-reader.test.ts` and `commit-recovery.test.ts` cover
the commit rule on a log of their own: a repeated transition, a repeated
external effect, the three outcomes of a reader, a torn line that leaves no
trace, and one recovery loop that rewrites every record kind without
appending or starting a session.

`recorded-environment.test.ts` covers what a record holds of an environment:
a variable set in this process reaches neither the policy `job.json`
captures, nor a gate attempt, nor the environment a gate command prints of
itself, while the names a command received are recorded and a run written
before the names is still read.

`scenario-check.test.ts` covers the scenario check: what each checkpoint
plans, `none-selected`, and execution with a scripted runner that copies the
`scenarios` module's recorded message streams where each profile asks, with
setup and teardown ordering, a teardown after a failed run, the timeouts and
the verdict. `scenario-check-integration.test.ts` starts the real
`cucumber-js` over a project it writes, in the in-place runner and in the
audit's executor, and runs readiness's two acceptance steps over it with
`dry-run` and `run`. `fixture-acceptance.test.ts`, run with
`RAMIFY_AGENT_FIXTURE_ACCEPTANCE=1` because it installs the fixture's
toolchain, runs the fixture's own scenario at readiness and at the work-item
and final gates. Lifecycle tests reach a scripted `cucumber-js` that writes
the stream of a successful run with nothing in it.

`gate-not-verified.test.ts` and `tree-identity.test.ts` cover the check
engine on commands of their own: every reason a check can record for not
having run, a missing command that makes the attempt run nothing at all, a
timeout told from a failing exit, a Ramify check exiting 2 that is not a
pass, and a guarded file that changed or was deleted beside one that nobody
guards and that therefore blocks nothing.

The run's own tests are beside them.

- `run.test.ts` drives the smallest coherent run, one with no entry
  capabilities, on a temporary copy of the fixture made a git repository.
- `work-items.test.ts` drives a run whose two entry capabilities are already
  satisfied: two work items, two outlines recorded as a single iteration, two
  passing work-item gates, one passing final gate, completed. Beside it: that
  hypotheses create no work and appear in no work record, which hypothesis
  revisions each work item received, a gate that fails and returns to the
  same continuing session until its repair rounds are spent, and an
  `unresolved` that ends the run.
- `analysis-submission.test.ts` and `local-architect-submission.test.ts`
  break each submission's schema and each rule beyond it, and show that
  nothing changes, that every error carries its path, that a corrected input
  is accepted, and that the bound ends the invocation as
  `invalid-submission`.
- `materialization.test.ts` drives a run that commits its feature files once
  readiness has passed, with the commit's content, subject, trailers and
  call arguments through the scripted Git, and whose work-item gates
  implement the scenario each completion request declared; re-rendering and its idempotence; the
  commit's lookup on recovery; the guarded list; a feature file that differs
  at a gate as a guarded change; and an engineer whose edits of a feature
  file and of `ramify-agent.json` are refused, whose shell change is a
  guarded change, and whose file the gate's commit restores. The crash
  between the commit and its record is the recovery table's
  `scenarios-committed` row.
- `scenario-states.test.ts` covers declarations and every transition: a
  declared scenario implemented by its iteration gate and one a request
  declares implemented by the work-item gate, with the final gate in full
  mode; a bound scenario through its fake-backed pass, the yield,
  `requirement-verified` and `scenario-due` to its implementation; rejected
  declarations under the bound; withdrawal by exhaustion, by a placement
  request and by a yield; a refused completion request and the bound; an
  implemented scenario failing a later gate; the final rule; and the crash
  between a withdrawal commit and its record. Scripted local architects in
  every lifecycle test declare their entry's scenarios, or their
  integration scenario, with their completion requests
  (`helpers/declarations.ts`), and the scripted runners
  report the scenarios a selection reaches as passed.
- `integration-scenarios.test.ts` drives one integration scenario: its
  work item created by the last sub-scenario's `scenario-implemented` at
  the common ancestor and queued behind the current item, the briefing, a
  refused scope that leaves out a path, the declaration, the iteration gate
  selecting it by identity and the completion; a composition failure's
  finding in the repair briefing; and the rules over literal records.
  `integration-scenarios-integration.test.ts` runs the same scenario to
  completion and gives the tree to the installed Ramify, which accepts the
  ancestor's named imports of both step files and refuses one once its
  `expose-test` is removed. Both share `helpers/integration-scenario.ts`.
- `acceptance-trial.test.ts` is the scripted acceptance trial: one run on
  the fixture through every stage, the review stop and its approval, the
  four acceptance readiness steps, materialization, a declaration while a
  requirement is open (`bound`), a withdrawal by a yield and one by
  exhaustion with its commit, `scenario-due`, an integration work item and
  the final gate in full mode, with its event sequence and final states. A
  second run binds the fixture plan `status-badge-tone`'s two scenarios in
  `shared-ui` with a step file that renders the badge and needs no World
  (`helpers/badge-scenarios.ts`). The final gate runs its commands in the
  project through the fixture's `acceptance:full` script: with the scripted
  `cucumber-js` by default, and with the real one, over the step files the
  engineers wrote, when `RAMIFY_AGENT_FIXTURE_ACCEPTANCE=1` installs the
  fixture's toolchain.
- `scenario-briefings.test.ts` covers what the agents are told of
  scenarios: the local architect's section per scenario, the engineer's
  "Scenarios to bind", other unimplemented scenarios and rules, the
  integration engineer's section and a provider's silence;
  `assignment.scenarios`' judge; `run_scope_tests` with a scripted runner
  over the recorded streams; and the diagnostics rendered from a recorded
  failing stream. `helpers/project-config.ts`' `scriptedScenarioRun` answers
  a scenario run in the test's own process where the command runner is a
  function, and the composition states each one.
- `analysis-scenarios.test.ts` captures plans with and without `gherkin`
  blocks and with one that does not parse, rejects a submission per form
  rule through the real validation path and under the per-turn bound, and
  follows acceptance to the scenario records, their IDs, owners, files,
  hashes and warnings, and the snapshot's counts.
- `progress.test.ts` covers the capability projection and shows the record
  kinds in distinct directories, a `Hypothesis` with no reference to a work
  item, and a projection that leaves every file and the log's version exactly
  as it found them.
- `compaction.test.ts` compacts during an initial analysis and during a local
  architect session and reads the observations back.
- `run-commands.test.ts` covers the three command rules for `start-run` and
  `stop-job`; `review-stop.test.ts` covers the stop, its approval, a stop and
  a crash during it, approvals without it, their refusals and the budget;
  `project-config.test.ts` covers the configuration's schema, its capture
  into `job.json` and the two steps that read it; `readiness.test.ts` builds one fixture per failing step and
  separates the failures a preparation can repair from the ones it cannot;
  `run-recovery.test.ts` forces a restart after every durable boundary of the
  run log and compares what recovery did; `writer-settlement.test.ts` kills
  real detached process groups to show that cancellation is not settlement;
  `run-closing-order.test.ts` reads the order of the writes from the log and
  the files beside it; `stop-before-start.test.ts` lands a stop between an
  invocation's event and its session; `measurement.test.ts` covers the frozen
  baseline and the `S_s` recipe, including a component the producer cannot
  supply; `union-values.test.ts` writes every value of every union and reads
  it back.
- `write-guard.test.ts` runs a table of allowed and denied targets against a
  real directory with a real symlink out of it, a real new file in an
  existing directory and a bootstrap directory that does not exist yet, and
  shows that a resolution failure is not a scope violation and that a
  denial changes nothing.
- `test-selection.test.ts` resolves policies against a copy of the fixture:
  an exact owner and the same owner with a child subtree, an owner with no
  test, a test written after the policy was captured, a required suite that
  is not there, and a view that could not be refreshed.
- `iterations.test.ts`, `iteration-gate.test.ts`, `no-rewind.test.ts` and
  `module-creation.test.ts` drive runs that assign, work and gate real
  iterations: a real defect repaired with `edit` and the one commit that
  follows, repair that exhausts, a failure outside the last scope that
  returns to the local architect, a module created from an accepted
  proposal, and a second iteration that rewrites nothing.
- `scenario-projections.test.ts` reads the scenario list, the review, the
  entries' scenario counts, a gate's scenario summary and the events'
  scenario references over the scripted run of an integration scenario that
  fails once at its first iteration gate, and over HTTP; and every state
  over constructed records.
- `accepted-commit.test.ts` covers the commit at an accepted boundary: a file
  changed while the gate ran that joins it, a crash on either side of the
  commit that still makes exactly one, and the message as a pure function of
  the records.
- `engineer-submission.test.ts` breaks the engineer's schema, its rules and
  its own test tool's input; `line-events.test.ts` covers what a writer
  changed and the session counts.
- `shell-tool.test.ts` runs real commands through the shell: a descendant
  the command left behind, settled by its process group; a command still
  running, settled with its group before anything follows; a bounded tail
  beside a complete file; and a schema violation that runs nothing.
  `hook-checks.test.ts` covers the post-write check over a `ramify` whose
  answers it chooses: findings, a deadline that expires, a configuration
  file that falls back to a complete check, and a mutation whose changed set
  is unknown. `read-excursions.test.ts` covers the soft read boundary.
- `unguarded-write.test.ts` is the guard this plan names: a write through
  the shell outside the scope appears in `git status` when the writer
  settles and in `outsideScope`, reported and not blocked, beside the
  `unguarded-shell` gap and the projection that states which tools were
  guarded. `late-writes.test.ts` stops a run while a command is running and
  shows that the write it would have made never arrives and that what the
  session produced afterwards completes nothing.

The policies these tests capture name cheap commands, which run for real:
what they substitute is which command, never whether it ran. Lifecycle tests
use `shapeOnlyInputs` from `tests/helpers/runs.ts`, which needs no views.
Recovery tests freeze a run after a chosen durable write through the
`afterWrite` hook, as a crash would; they then replace the lock with one held
by an exited process, and reopen. The HTTP tests start the server on a
system-chosen port and speak to it with plain `fetch`, without web assets.
Tests never use pi or the network beyond the loopback interface.

**A run test never lets a resident Ramify daemon analyse a temporary
project.** The daemon spawns its compiler helper from the working directory
of the invocation that started it, and that helper fails as soon as the
project is removed, taking every later analysis through that daemon with it.
Run tests therefore get a `ramify` that answers its version and nothing else,
and a test that needs real evidence starts a private daemon from this
package's own root, disposed with the test that started it: a daemon that has
analysed a project which is then removed cannot be relied on for the next.

A test that needs the owner-to-directory mapping and no analysis uses
`treeInputs` from `tests/helpers/iterations.ts`, which reads the project's
own `module.ramify` declarations. The tests that must prove the refresh
itself — a module created mid-run, and the selection a gate resolves from a
refreshed view — use the installed Ramify.
