# Authoring brief: Plan 3, autonomous implementation loop MVP

**Date:** 2026-09-20. **Status:** ready for plan authoring after the contract
authority analysis; execution remains blocked until its prerequisite refactor
is complete.

## Objective

Create the full, executable implementation plan for the MVP defined by
[Autonomous implementation loop with global and local architects](../../architecture/autonomous-implementation-loop.md).

The plan must take ramify-agent from its completed implementation-map harness
to a durable, deterministic work loop that can implement a selected plan with
pi agents. It must cover the complete path:

```text
start
  -> initial capability/module analysis and hypotheses
  -> readiness and passing global baseline
  -> global and local architectural coordination
  -> bounded engineering, contract and provider work
  -> harness-owned checks and repair
  -> final acceptance
  -> completed

bounded unrecoverable failure -> failed with evidence
```

This brief authorizes plan authoring only. It does not authorize implementation.

## Output location and package

Create the plan under this directory:

```text
docs/plans/03-autonomous-implementation-loop/
  main-plan.md
  iterations/
    README.md
    iteration0.md                 # only if a spike is retained as iteration 0
    iteration1.md
    ...
```

The main plan is authoritative. Each implementation iteration gets one brief,
has explicit prerequisites, ownership and an exit gate, and is sized for one
implementation context. Results and the completion report are created only
when the plan is executed.

## Authoritative inputs and precedence

Use these inputs in this order:

1. The [autonomous-loop architecture](../../architecture/autonomous-implementation-loop.md)
   defines the proposed MVP behavior and its deliberate departures from older
   hypotheses.
2. The [harness principles](../../harness.principles.md) define the general
   boundaries. Where the architecture explicitly records an MVP difference,
   such as continuing without human review waits, the architecture governs the
   plan and the difference remains visible.
3. The result of the
   [contract-module analysis](../../analysis/2026-09-20-contract-module-analysis-brief.md)
   must resolve contract authority before the module tree is finalized.
4. [Plan 2](../02-contract-authority-refactor/main-plan.md), revised if the
   analysis requires it, is a hard execution predecessor. The Plan 3 draft may
   be written earlier, but must be marked blocked until the refactor has passed
   its completion gate and current views have been refreshed.
5. Plan 1's [completion report](../01-implementation-map/completion-report.md)
   describes implemented capabilities and the actual handoff. Its completed
   plan is historical evidence, not the current architecture authority.
6. The [initial capability and module hypothesis](../../spikes/autonomous-loop-initial-analysis/README.md)
   and its [machine artifact](../../spikes/autonomous-loop-initial-analysis/initial-analysis.json)
   are planning inputs. Only their two entry assignments are accepted;
   deeper placements remain hypotheses to confirm or revise.
7. [Ramify measurements and ramify-agent KPIs](../../measurements-and-kpis.md)
   defines the measurement vocabulary and formulas to reconcile with the work
   loop.
8. Ramify's [hook and complete check contract](../../../../docs/architecture/cli-invocation.spec.md#hook-and-complete-checks)
   and [post-write example](../../../../examples/hooks/README.md) define the
   toolkit behavior the harness adapts.
9. The proposed [architect-view diff](../../../../docs/architecture/architect-view-diff.spec.md)
   may inform a future optimization. It is not implemented and is not a Plan 3
   dependency.
10. The [breaking/non-breaking analysis](../../decomposition/breaking-vs-non-breaking-plans.md)
    explains the distinction, but its non-breaking-only stopping behavior is
    superseded for this MVP by the architecture's local breaking-work process.
11. The [core records proposal](core-records.proposal.md) defines the durable
    records, agent submissions, identities and run-log events that the plan
    references instead of redefining. Its listed decisions need review; the
    plan records the outcome of each and revises the proposal where a spike
    or the review contradicts it.
12. The [MVP shortlist of cucumber-viz lessons](../../cucumber-viz-lessons/mvp-shortlist.md)
    names the code to reuse, the errors whose guards the plan must map to
    iterations, and the improvements already folded into the proposal. The
    other documents beside it record what is left for later and are not MVP
    requirements.

Do not read or cite `docs/.superseded/`.

## Authoring readiness

Before finalizing the plan:

1. Complete the contract-module analysis and record whether Plan 2's target
   structure stands or changes.
2. Treat Plan 2 as a separate prerequisite, not an iteration hidden inside
   Plan 3. After it runs, refresh the architect view and requester API views.
3. Record the current source, view revision/input identity, module tree,
   exact/subtree context sizes, existing tests and exposed APIs. Preserve
   unavailable or bounded evidence explicitly.
4. Run the current ramify-agent baseline from its root:

   ```text
   npm run type-check
   npm test
   npm run build:web
   npm run check:self
   ```

5. Reconcile this brief with any source or architecture changes made after its
   date. Do not copy stale paths or module counts into the plan.

If the plan is authored before these steps finish, mark affected module
placements and iteration scopes provisional and identify the exact readiness
condition that will resolve them.

## Implemented baseline to reuse

Plan 1 established these capabilities; extend them rather than designing a
parallel harness:

- A standalone harness process for one Ramify project, with a project lock.
- An HTTP JSON client boundary under `/api/v1`; the web is a disposable client
  and durable state belongs to the harness.
- Safe commands with command IDs, content identity and expected job versions:
  identical retries return the original receipt, conflicting ID reuse fails,
  and stale commands report the current version.
- An append-only event log as the canonical job authority; snapshots are
  projections. Atomic publication and restart recovery are tested.
- One job at a time, bounded Stop, late-submission rejection and explicit
  interrupted recovery.
- Immutable mapping revisions and separate approval records with captured
  plan/source/evidence identity.
- A generic `AgentPort`, a scripted fake and an in-process pi 0.85.1 adapter.
  A session receives an exact system prompt, role, working directory, selected
  built-ins, harness tools, one structured submission tool, event callback and
  session directory. Outcomes never reject and are `submitted`, `ended`,
  `failed` or `stopped`.
- Pi tests already exercise its real loop with a scripted provider: exact
  prompt/tools, tool-call IDs, usage, bounded submission correction, provider
  failure, Stop, a tool ignoring cancellation and session-file persistence.
- Current built-in tools are read/search only. `edit` and `write`, resumable
  sessions, forks, deferred context append and context observations are not yet
  part of the port.
- The existing `MappingProcedure` seam has `capture`, `forJob` and
  `approvalChanges`; `job.json` already records `kind: "mapping"` in
  anticipation of another job kind.
- Mapping already materializes revision-bound architect/API evidence, rejects
  mixed source states and validates submissions mechanically.
- Existing web pages list and read plans, show mapping progress, display map
  revisions and send start, stop and approval commands.

The Plan 1 completion report identifies two strong structural candidates:

- Extract Ramify CLI, private-daemon and view-format knowledge into a
  `harness/evidence` child. It already has several consumers.
- Extract/generalize `harness/jobs` when a second job kind exists. Plan 3
  introduces that second kind.

These remain hypotheses until checked against the post-Plan-2 tree. Workflow
coordination, checks, obligations and KPI calculation stay in `harness`
initially unless current evidence establishes a boundary that hides knowledge
and lowers total cognitive burden. Do not create a broad `execution` module as
a container for work.

## Entry capabilities

The plan starts from two externally meaningful capabilities:

| Capability | Owner hypothesis | Required outcome |
| --- | --- | --- |
| `autonomous-plan-execution` | `ramify-agent/harness` | Given a selected plan, analyze entry capabilities, coordinate architectural and engineering work, recover, verify and terminate with durable evidence. |
| `implementation-run-operation-and-review` | `ramify-agent/web` | A person starts or stops a run and inspects hypotheses, decisions, progress, checks, failures and KPI evidence without owning execution state. |

Protocol, state storage, orchestration, test gates and contract delegation are
dependencies of these capabilities. Do not turn every supporting record or
schema into another capability or work item.

## Required state-machine design

The plan must specify the harness state machine before dividing its
implementation. Agents decide semantics; the harness owns states, allowed
transitions, durable events, retry bounds and scheduling.

At minimum, define state and recovery contracts for:

1. The whole implementation run, from accepted start through initial analysis,
   readiness, active work, final verification, completion or failure.
2. The initial global architect session and its durable hypothesis artifact.
3. Sequential global placement requests, including fork start, partial return,
   accepted decision, registry update, parent-brief append and recovery between
   those commits.
4. Module work items and their long-lived local architect sessions.
5. Provisional iteration planning, one fixed next assignment, implementation,
   result assessment and revision of remaining work.
6. Contract sub-sessions, consumer integration, provider-obligation
   registration, provider implementation and consumer verification on return.
7. Completion gates, repair rounds, infrastructure recovery and exhaustion.
8. Context-budget returns, compaction observations and fresh-session handoff.
9. Writer acquisition, tool settlement, cancellation and release.
10. Stop, restart, superseded invocation results and stale verification.

For each state machine, the plan must name:

- durable events and immutable inputs;
- the authoritative record and derived projections;
- transition preconditions and terminal outcomes;
- idempotency/deduplication keys;
- crash points and deterministic recovery;
- retry and repair bounds;
- invalid or stale inputs;
- which transitions may start an agent or writer;
- which transition proves completion.

Agent invocations are restartable optimizations. Every role must be able to
continue from repository files and durable harness records without trusting an
earlier transcript. Reuse and forks may save orientation cost but cannot be
required for correctness.

## Initial analysis and global architect

The plan must implement these distinctions:

- Initial analysis assigns only top-level capabilities to existing or proposed
  modules. Those entry assignments seed work items.
- The same session may forecast deeper capabilities to reuse, extend or create,
  with candidate owners, consumers, rationale and uncertainty.
- Forecasts must surface likely cross-entry reuse so later placement decisions
  can account for several consumers, and give the person a high-level design to
  review even though execution does not wait for that review.
- Deeper hypotheses are reviewable but never schedule work, register provider
  obligations or establish completion requirements.
- Initial analysis does not classify breaking changes. Local architects do so
  with concrete work and consumer evidence.
- Hypotheses, actual placement decisions and work/progress are separate,
  revisioned records.

The initial session becomes a long-lived global architect context. Placement
requests execute serially as forks from its latest oriented point:

1. Refresh the architect view.
2. Supply the focused request: required behavior, relevant discoveries,
   current artifacts, candidate placement and prior decision references.
3. Let the fork inspect only current evidence relevant to the choice and make
   the placement decision itself.
4. Persist the decision and registry update.
5. Append a concise decision brief to the parent context without a model call.
6. Return the accepted decision to the requesting local architect.

The next fork receives accumulated briefs. It must consult the durable registry
and decision log, explicitly revise earlier decisions instead of silently
contradicting them, and recognize capabilities registered locally even when no
brief was appended for them. Local changes reach the parent only when they
alter global hypotheses or decisions.

The plan must cover parent loss, fork interruption, evidence change, coverage
loss, a crash between decision persistence and brief append, duplicate append
prevention and reorientation from durable files. The optional Ramify diff can
be adopted later; Plan 3 must work by asking each fork to inspect relevant
changes in the refreshed view.

## Local architects and iteration assignments

A local architect belongs to one module work item, not permanently to a module.
It receives the goal, relevant requirements, current architect evidence,
applicable global hypotheses and decisions, registered dependencies and
verification obligations.

It must:

- analyze concrete changes and candidate reuse;
- distinguish local decomposition from placement requiring the global
  architect;
- identify breaking changes and affected consumers before assigning work;
- outline broad stages while fixing only the next executable iteration;
- give the engineer a bounded goal, scope, applicable requirements, external
  capabilities to reuse or request, execution approach and completion evidence;
- assess each result and revise later iterations;
- request work-item completion only after local work, providers and consumer
  verification are satisfied.

For non-breaking work, an iteration's ordinary scope is the assigned module's
own contents plus the complete subtrees of selected immediate children. Each
child subtree is wholly included or excluded. The engineer chooses files and
implementation details within that assignment and cannot expand its scope.

The local architect uses one continuing session in this MVP. Compaction is
allowed and recorded. It receives concise engineer findings and artifact
references, not full transcripts.

## Contract work and provider obligations

Contract placement follows authority, incorporating the contract-module
analysis. Do not recreate a neutral definitions repository merely because an
interface has several users. The selected location may be provider-owned,
consumer-owned or independently governed; the placement decision records why.

A contract sub-session is an engineer invocation with a focused contract skill.
The same mechanism handles work delegated to an excluded child subtree and to
another branch; scope and contract authority differ, not the protocol.
It has:

- read/write access to the requesting consumer for integration;
- read/write access to the selected contract, conformance tests and fake;
- read access to the provider or requested capability;
- read access to existing consumers when extending behavior;
- explicitly scoped exposure-declaration writes when needed.

It establishes the interface, conformance evidence and fake, integrates the
consumer and fixes consumer/fake failures. It does not implement the provider
or modify unrelated consumers. Fake files use `.fake` and exported fake names
contain `Fake`, including re-exports.

Only successful contract completion may register a provider obligation. The
obligation is revision-bound and identifies the capability, consumer, provider
owner, behavior, contract and executable evidence. Duplicate registration is
idempotent; a new contract revision cannot reuse stale completion.

The initial scheduler is depth-first: finish available consumer work against
the fake, execute providers before the next independent entry item, then return
for consumer verification against the real provider. Shared obligations and
cycles require the smallest explicit representation that prevents duplicate or
deadlocked work. Fake-backed completion alone never completes the capability.

## Breaking changes

The local architect's initial work-item analysis is the primary breaking-change
detection point. Compatible additions are the default. A preference for a
cleaner interface is insufficient reason to break existing guarantees.

When the request requires a break, record the changed guarantee, reason and
affected consumers. Isolate breaking work from compatible work as far as
practical and order both by dependency. In the MVP, breaking iterations use
ordinary agentic implementation rather than the contract/fake/provider
protocol. They still have bounded goals, explicit scopes, writer controls,
context limits and durable outcomes.

Every accepted breaking iteration must pass all project tests and complete
checks. Use compatibility staging where appropriate. If staging is invalid,
the interface and required consumer changes may share one narrowly focused,
explicitly broad iteration. There is no dedicated migration state machine in
this MVP. A break discovered during engineering returns to the local architect;
the engineer does not silently widen scope or switch process.

## Agent-port and pi work

The plan must begin with or contain an early executable risk probe for the
smallest pi/port extension. Verify against the pinned installed SDK rather than
assuming APIs from documentation or conversation.

Resolve and test:

- continuing a role session;
- forking from a specific oriented point;
- appending a decision brief to a parent session without model inference;
- ensuring the append enters the next fork's model input;
- current context-size observation or a conservative estimate;
- disabling compaction for engineer, contract and decision-fork roles;
- allowing and observing compaction for initial/global/local architect roles;
- a threshold-triggered final response with tools disabled;
- adding guarded `edit` and `write` tools, or equivalent harness tools;
- pre-execution tool interception and useful denied results;
- cancellation, settlement of mutating tools and confirmation that no late
  writer remains;
- session reconstruction after process restart;
- usage/event capture and scripted-fake parity.

The plan must revise the generic `AgentPort` around semantics needed by every
implementation, while keeping pi-specific session formats, SDK objects and
login confined to `harness/agent/pi`. Every new port behavior needs scripted
fake coverage; pi tests use the existing offline scripted provider where
possible. Record SDK limitations explicitly and adapt the architecture rather
than hiding them behind an unverified abstraction.

## Execution readiness, hooks and gates

Before the first engineering writer, the harness verifies dependencies,
commands, test discovery and nested packages in the actual execution directory.
It runs the global test suite, type check and complete Ramify check. The MVP
requires a passing baseline; missing tools or existing failures end readiness
after bounded infrastructure recovery.

Every source-writing invocation uses harness-installed Ramify hooks. After each
settled mutation, run bounded `ramify check --changed <paths>...`, deliver new
findings or an explicit not-checked reason to the engineer, and retain the full
revision-bound record. Observe mutations even when a tool fails. If changed
paths cannot be established, run a complete check instead of claiming hook
coverage. A hook timeout/not-checked result permits continued editing but is
never a pass.

The completion policy is intentionally mechanical and hardcoded for the MVP:

| Checkpoint | Behavioral tests |
| --- | --- |
| Ordinary iteration | All tests owned by modules in the assigned write scope. |
| Contract sub-session | Consumer-scope tests plus contract, fake and conformance tests. |
| Breaking iteration | All project tests. |
| Work-item completion | All project tests. |
| Final run | All project tests plus original feature acceptance. |

Every completion gate also runs the configured type check and a complete
Ramify check. The harness owns the verdict. It pauses writers, records command,
working directory, input identity, timing, outputs and evidence obligations,
and invalidates a pass when source changes.

Repair is bounded and durable. Assertion/type/Ramify failures in scope return
to the engineer; infrastructure failures use separate bounded harness recovery;
invalid sessions are reconstructed after writer settlement; out-of-scope or
obligation changes return to the local architect. A later complete pass
supersedes a failure only for the verified inputs. Keep append-only gate
attempts, without implementing cucumber-viz's per-finding registry,
adjudication, waivers or publication machinery.

## Write boundaries and observation

For the MVP, intercept pi `edit` and `write` calls before execution. Resolve
targets relative to the working directory and enforce the recorded write-scope
revision, including new files, traversal, symlinks and explicitly assigned
contract or exposure locations. An unresolved target is blocked with a distinct
reason. A block returns useful guidance, does not mutate source, does not end
the session and does not widen scope.

Record run, work item, iteration, invocation, role, tool-call identity, tool,
requested/resolved target, known owner, scope revision, time and reason. Replayed
tool-call records count once; a new retry is a new attempt. Do not store proposed
file contents.

Read/search boundaries are soft: default to the assigned scope and generated
views, permit explicit excursions, and record them where observable. Compiler
and test-runner reads are not agent excursions. Shell write enforcement,
command allowlists and filesystem sandboxing are deferred; report that coverage
gap and never treat zero blocked calls as proof of scope compliance.

Only one implementation writer is active. Before a contract sub-session,
check, replacement invocation or recovery writer begins, settle or terminate
the previous writer and its mutating subprocesses. Discarding a reply does not
establish shutdown. Late results are retained for diagnosis/usage but cannot
complete superseded work.

## Context budgets and compaction

Implement role-specific policy:

| Role | Policy |
| --- | --- |
| Module engineer | Return a partial result at threshold; no compaction. |
| Contract sub-session | Return incomplete at threshold; no compaction. |
| Global decision fork | Return partial findings; no accepted decision or compaction. |
| Initial global analysis and local architect | Compaction allowed and recorded. |
| Long-lived global parent | Briefs append without inference; maintenance occurs only on the next requested fork. |

Check estimated current context after model/tool boundaries and reserve room for
one final no-tools report. Persist `context_budget_reached`, observed usage,
threshold, changes, checks, unfinished work and useful findings. Fresh sessions
continue from files and concise handoffs; they do not reset repair/recovery
limits.

Measure compactions by role, engineer and fork budget-return rates, repeated
returns for the same work and context before/after where available. Unavailable
measurements stay explicit. Compaction is a diagnostic signal, not automatically
a failure.

## Durable records, progress and KPIs

The plan must define versioned durable records and their relationships for:

- entry capability assignments and initial hypotheses;
- capability registry entries and revisions;
- global and local placement decisions;
- parent decision briefs and append receipts;
- module work items and local iteration outlines;
- fixed iteration assignments and scope revisions;
- agent invocations, usage, events and outcomes;
- contract artifacts and revision-bound provider obligations;
- consumer verification and reopened evidence obligations;
- check attempts, repair and infrastructure-recovery counters;
- writer ownership and cancellation/settlement;
- blocked tool attempts and observable read excursions;
- context-budget returns and compactions;
- progress and KPI observations/projections;
- source, plan, prompt, skill, view and evidence identities.

Keep canonical stored observations separate from derived protocol/UI
projections. Files are authoritative; session transcripts are not. Define
atomic publication order and recovery for every multi-write transition.

Basic MVP progress is required:

- **Todo:** expected or confirmed need without started work; hypotheses remain
  visibly tentative.
- **Working on:** work started, with implementation, dependency or verification
  outstanding. Waiting for a provider stays here with its reason.
- **Completed:** the plan-relative behavior has current implementation and
  verification evidence. A fake alone is insufficient.

Completion can reopen when a dependency, requirement or evidence revision
invalidates it. Superseded hypotheses are not counted as completed. Whole-run
completion comes from original acceptance and all obligations, not node counts.

Reconcile the existing KPI document. At minimum retain baseline and per-session
scope identities/sizes, exact versus subtree coverage, roles, usage categories,
timing, outcomes, mutations, compactions, budget returns, gate attempts,
adaptation reasons and boundary-control attempts. The harness computes versioned
projections; clients render them. Missing observations are unavailable, never
zero. Preserve enough evidence for change-weighted and session-weighted metrics,
including failures, retries and no-change sessions.

## Protocol and web client

After the contract-authority refactor, extend the harness-owned public client
protocol. The plan must specify exact commands, queries, snapshots, event pages,
IDs, expected-version semantics, error codes and limits. Preserve Plan 1 retry,
cursor and reconnect behavior. The web remains optional to job progress and
never writes durable state directly.

The MVP web surface must let a person:

- start and stop an implementation run;
- distinguish connection state from durable run state;
- inspect the original plan and initial entry assignments;
- distinguish hypotheses from accepted decisions and actual work;
- inspect work items, current iteration/activity, dependencies and waits;
- inspect check/repair outcomes, terminal failures and evidence references;
- inspect basic todo/working/completed capability progress and KPI coverage.

No step waits for human approval. Review commands, approval-expiry behavior and
an awaiting-review state are deferred.

The capability dependency graph visualization is a follow-up. Plan 3 retains
the stable capability IDs, dependency links, states and evidence required to
render it later, but implements only a simple list/detail presentation.

## Candidate iteration structure

The author must derive and justify the final dependency order. Use this only as
a starting hypothesis:

0. **Pi/session/tool-lifecycle spike:** prove or revise the risky SDK assumptions
   and finalize the agent-port contract.
1. **Evidence and generic job foundations:** extract the evidenced boundaries,
   define implementation-run identity, state/event authority and recovery on
   the scripted agent.
2. **Initial analysis and durable architecture records:** entry assignments,
   hypotheses, registry and work-item frontier.
3. **Global architect decisions:** sequential forks, decision/brief commits,
   reconstruction and hypothesis revision.
4. **Local work items and iteration execution:** local architect planning,
   scoped engineers, results and context-budget handoffs.
5. **Contract delegation:** contract sessions, fakes, obligations, provider
   scheduling and consumer verification.
6. **Hooks, boundaries and completion gates:** writer settlement, Ramify hooks,
   test selection, repair and breaking-iteration global gates.
7. **Protocol, progress and KPIs:** public projections, commands and basic web
   operation/review.
8. **Integrated trials and recovery:** real pi execution, restart points,
   breaking and non-breaking cases, final acceptance and completion report.

Split or reorder these where the post-refactor module tree, risk probes or
testable intermediate states require it. Every iteration must leave the harness
and project in a coherent passing state. Avoid one iteration that combines a
broad change goal with a broad search space.

## Required acceptance coverage

The plan must map each case below to an iteration and executable evidence.

### Core lifecycle and recovery

- A run completes without a web client; a reconnecting client reads the same
  state and events.
- Restart after every durable multi-write boundary recovers without duplicate
  work, obligations, decisions or briefs.
- Stop is bounded; late tool writes settle before a new writer/check; late
  results cannot complete superseded work.
- A crash after passing checks recovers the accepted result; a later source
  change invalidates stale evidence.
- Command retry/conflict/stale-version rules remain true for implementation
  commands.

### Global and local architecture

- Initial analysis produces executable entry assignments and separate deeper
  hypotheses; hypotheses create no work.
- Two sequential placement forks run without a diff baseline. The first revises
  a hypothesis and registers a capability; the second inherits its brief and
  reuses the registry entry instead of duplicating it.
- Appending a parent brief causes zero model calls and reaches the next fork's
  input.
- Crash between accepted decision and parent append recovers exactly once.
- A local architect uses an external-owner hypothesis as evidence, makes routine
  local refinements without a global call, and escalates real counterevidence.
- A later fork finds a locally registered unimplemented capability without a
  parent brief.
- A relevant hypothesis revision reaches affected local architects before
  dependent work is assigned.
- One small work item completes in one iteration; another is revised across
  several iterations without losing obligations.

### Contract and provider flow

- One consumer performs one real delegation, works against an explicitly named
  fake, registers the provider once, implements the provider and verifies the
  consumer on return.
- Fake files, exports and re-exports remain unmistakable, and architectural
  evidence does not make them look like completed production behavior.
- Duplicate obligation registration is idempotent; a changed contract revision
  reopens implementation/conformance evidence.
- A provider that cannot implement the agreement reports a revision need rather
  than silently changing the contract.
- Shared obligations and at least one cycle/unresolvable dependency reach a
  deterministic outcome.

### Checks, repair and breaking work

- A module gate fails, returns concise diagnostics, is repaired and reruns the
  complete gate.
- A global work-item gate exposes a failure outside the last engineer's scope;
  the local architect assigns repair and rechecks.
- Exact-owner versus included-child-subtree test selection is exercised.
- Fake and real-provider conformance obligations are both enforced.
- Missing nested dependencies, missing commands, failing initial baseline,
  invalid session, test timeout and exhausted repair limits retain distinct
  causes and recovery paths.
- An attempt to narrow test discovery or disable a required suite is rejected
  unless an accepted requirement/contract revision authorizes it.
- A breaking feature is isolated into coherent iterations and all project tests
  pass at every accepted boundary.

### Context and boundary controls

- Engineer, contract and decision-fork thresholds return partial evidence
  without compaction or false completion; repeated returns do not reset limits.
- Initial/global/local compaction is observed and recorded when it happens.
- Allowed and denied `edit`/`write` targets cover existing files, new files,
  traversal, symlinks and explicit contract/exposure locations.
- Denied tools do not mutate, return useful guidance and remain deduplicated
  across replay while a new retry is counted separately.
- Path-resolution failure differs from a proven scope violation.
- One outside read and one unguarded shell mutation make the MVP's observation
  limitations visible rather than being reported as complete enforcement.

### Progress, protocol and measurements

- Hypothesis, decision, work and progress records remain visibly distinct.
- Todo/working/completed handles provider waits, verified reuse, reopened
  evidence and superseded hypotheses correctly.
- The UI can disconnect/reconnect without affecting the run.
- KPI projections retain their numerators, denominators, revision and coverage;
  unavailable data is not reported as zero.
- Failed, stopped, repaired, context-limited and no-change sessions remain in
  usage/session counts according to the KPI contract.

### Real trials

- Use the scripted fake for deterministic state, failure and recovery coverage.
- Run at least one real pi end-to-end non-breaking feature with a consumer,
  delegation, provider and verification on return.
- Exercise the breaking path on a controlled fixture with globally green
  iteration boundaries.
- Record human review of the resulting decisions, work, checks and metrics, but
  do not add a review wait to execution.

## Explicit non-goals

The plan must keep these outside the MVP:

- Human approval gates during execution.
- The graphical capability dependency view.
- Dependence on Ramify architect-view diffs.
- Parallel implementation writers or parallel global placement requests.
- A general configurable check workflow or inferred impacted-test selection.
- Cucumber-viz's finding registry, adjudication, waivers, commits or publication
  workflow.
- Filesystem sandboxing, shell-command allowlists or a claim that every shell
  mutation is prevented.
- A general migration state machine for breaking changes.
- Remote/multi-project hosting or a new CLI client.
- Automatic module creation from every forecast capability.
- A broad container module created only to hold loop-related files.

## Decisions the plan must resolve

Do not leave these as implementation-session inventions:

1. The post-Plan-2 module tree and exact public exposures.
2. Whether `evidence` and generic `jobs` are extracted, with measured
   justification and their exact APIs.
3. The implementation-run directory layout, event schemas, projections,
   identifiers and atomic publication order.
4. The minimum generic agent-port additions established by the pi spike.
5. Prompt packages and structured submissions for initial/global/local
   architects, engineers and contract work, with provenance/version identity.
6. The capability registry, decision and obligation identity/revision rules.
7. Shared-obligation and cycle behavior.
8. Run-, work-item-, iteration- and gate-level retry/exhaustion limits.
9. The known test runner and exact readiness/type/test commands for the MVP,
   including nested-package discovery.
10. Context thresholds and how estimates are obtained when pi lacks an exact
    current-context measure.
11. Protocol commands/queries/events, payload bounds and UI projections.
12. KPI storage and projection versioning, reconciled with the existing KPI
    document.
13. Fixture and live-trial feature requests that exercise the required paths
    without depending on unfinished external work.

When an SDK or repository fact is unknown, schedule a bounded spike or contract
review before the iteration that depends on it. Do not encode guesses as
accepted interfaces.

## Plan-authoring completion criteria

The implementation plan is ready for review when:

- every MVP behavior in the architecture is owned by a module and mapped to a
  dependency-ordered iteration;
- every iteration has an executable goal, bounded ownership/write scope,
  prerequisites, interfaces it consumes or establishes, and observable exit
  evidence;
- state machines, durable records, crash recovery and idempotency are concrete
  enough to test rather than delegated to implementation judgment;
- the pi, hook, test-runner and context-budget uncertainties are resolved by an
  early spike or explicitly gate dependent iterations;
- contract authority reflects the general analysis and Plan 2 result;
- the acceptance cases above have exactly one owning iteration and a final
  composition gate;
- measurements needed for later KPI evaluation are captured from the first
  implementation invocation rather than added after the trial;
- deferred work is explicit and cannot be mistaken for MVP completion;
- local links resolve, `git diff --check` passes and `npm run check:self`
  reports complete coverage with no findings after the documentation changes;
- the plan states that implementation has not yet been executed and identifies
  any still-blocking predecessor evidence.
