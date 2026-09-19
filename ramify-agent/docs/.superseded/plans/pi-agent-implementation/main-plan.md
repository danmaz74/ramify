# Plan: Pi implementation runner

> **Superseded** on 2026-09-19 by the [harness principles](../../../harness.principles.md) and the
> [harness architecture](../../../architecture.md). Kept for comparison; not current. See the
> [archive index](../../README.md) for what may be reused.

**Date:** 2026-09-19. **Status:** deferred successor; excluded from the current
implementation scope.

This plan begins at **Start implementation**. Its prerequisite is the completed
[architectural planning MVP](../pi-agent-harness-mvp/main-plan.md): the web plan
browser, real pi architect, saved artifact, architecture visualization and
planning-job lifecycle must already work. This extends the same standalone
harness and its client protocol.

The built [Plan 2C measurement contract](../../../../../docs/plans/iteration-2c-module-measurements/main-plan.md)
is an inherited dependency. The [measurement/KPI contract](../../../measurements-and-kpis.md)
is owned entirely by ramify-agent: Ramify supplies generic source facts, while
the harness observes its activity and computes every session/change/drift KPI.

The current request authorizes work only up to viewing the architectural plan.
This document preserves the later execution design without making it a
prerequisite of that first deliverable.

Use the predecessor's canonical [artifact contract](../pi-agent-harness-mvp/architecture-artifact.md),
subscription adapter, captured inputs, worktree metadata, job events and
substantial-change decision UI. Add an Implementation tab and its launch control
only in this successor. Extend the shared [client protocol](../pi-agent-harness-mvp/client-protocol.md)
with implementation commands and projections; workflow decisions stay in the
harness and remain available to a later CLI. Do not duplicate the architecture
schema or plan reader.

## 1. Start implementation

**Start implementation** binds a new run to the displayed architecture revision
and captured plan. The harness checks that the artifact is valid, its inputs
are current and the workspace is ready. It then starts the first ready package.
The page switches to Implementation. Duplicate clicks or another browser tab
must return the same job rather than launch another worker.
Each prepared workspace has one implementation run. Reopening a stopped or
failed run preserves its attempts and work; it does not create a clean second
run in that modified workspace. A fresh run requires a new planning job and
workspace.

Reuse the dedicated Git worktree recorded by the architectural planning job.
The predecessor creates it from the project's current commit. The original
`plan.md` is captured even if it is uncommitted. Local
uncommitted source changes are not included; the page states the source commit
and that limitation before launch. Worktree dependencies are prepared from
project configuration. No automatic checkout, reset, merge or push affects the
user's working files. Non-Git projects are deferred in this first version.

Before implementation starts, a changed plan, used reference document or source
commit makes the architecture stale and disables Start with **Regenerate
architecture** as the next action. Starting an older revision is also refused.
During execution, a pinned workspace and plan remain the run's inputs; later
changes in the user's checkout do not silently change them.

The coordinator performs this loop automatically:

1. Select a ready work package and create its concrete task brief.
2. Start a fresh scoped pi engineering session, passing the relevant local
   context, foreign API views and prior handoffs.
3. Record activity and the worker's structured result. Run the relevant checks
   independently of the worker's completion claim.
4. Accept verified work, schedule ordinary repair work, or invoke the architect
   for new needs and scope/dependency changes.
5. Continue through integration and the plan's feature-level acceptance.

One worker executes at a time. Cross-scope contract design and integration are
work packages using the same machinery, not additional permanent services.
Missing provider work, splitting an oversized scope and dependency reordering
are routine revisions. They update the diagram and pending work automatically.
A partial worker result does not mean the entire run waits for the user.

Only passing required checks can mark a package complete. Superseded work
invalidates affected dependent acceptance. Feature completion requires the
plan's acceptance and a complete Ramify check against the final workspace;
not checked, interrupted and failed are never displayed as passed.

## 2. Follow implementation progress

Keep the first progress view small:

| Element | What the user sees |
| --- | --- |
| Run header | Running, replanning, verifying, awaiting decision, completed, failed or stopped; elapsed time; current architecture revision |
| Current activity | Active package and module scope; concise agent/tool activity |
| Package list | Pending, running, verifying, complete, needs follow-up or superseded; prerequisites explain why work is not ready |
| Progress summary | For example, 3 of 7 current packages complete, plus required check results |
| Activity feed | Timestamped package starts/results, checks, automatic replans, meaningful failures and decisions |
| Selected package | Brief, outcome, changed paths, check output and observed scope excursions; expandable ordinary agent/tool output |

Task totals can change during replanning. Show the revision and explain the
change; do not present the count as a reliable percentage of time or effort.
Agent/tool output means available messages and tool events, not hidden reasoning.

Persist progress in the standalone harness. Reloading or closing the browser
does not stop a job. Initially poll a progress snapshot and new events about once per second
while active; show disconnected/reconnecting separately from job failure.
Raw token-by-token streaming and a full terminal emulator are unnecessary.

Provide **Stop** for an explicit user cancellation. A stopped run remains
inspectable; **Resume** reconciles the workspace and unfinished attempt before
continuing. After an accidental harness restart, reconcile worker/process state
and continue recoverable jobs automatically. Never start a second writer while
an old process may still be active.

At completion, show the outcome, required check results, changed-file summary
and implementation branch/worktree location. A simple scope summary records
outside direct reads/searches/writes and unknown shell activity. Detailed
visual analytics and an embedded diff/review application are deferred. The
agreed KPIs themselves are included: weighted scope-size ratio/reduction,
session-weighted cost, owner/seam/reuse drift and adaptation counts/cost.
Display their raw terms, evidence coverage and final acceptance alongside them;
never substitute a final net diff for measured change/rework events.

## 3. Automatic changes and human decisions

Within a launched phase, only a substantial change to the requested plan
creates a human decision wait. The harness stores the proposal and response;
clients present the request and submit a decision through the shared protocol.
The user does not edit JSON or select the next task.

Routine changes include task splits/combines, an initially omitted module,
provider or contract work, permitted exposure changes, repair work, and a
revised dependency order. The architect records the reason and activates a new
revision automatically. Past attempts keep their original scope attribution.

A substantial change alters required behavior or acceptance, breaks a protected
compatibility promise, requires a broad architectural replacement outside the
feature, or overrides an explicit user constraint. Assess cumulative changes
against the original requirements and approved amendments, not only the latest
revision. Retry counts, an unavailable metric or another affected module are
not evidence of a substantial change.

Show a concrete decision card: what was discovered, why the current plan cannot
be fulfilled, the proposed change, affected outcomes and alternatives. Actions
are **Accept proposed change** and **Keep original requirements**. Bind the
response to that exact proposal. Approval records an amendment alongside the
run; it never edits `plan.md`. Rejection sends the architect back to alternatives.
Work that remains valid under either outcome may continue while the decision
is pending; dependent work cannot start.

Technical failures follow finite automatic recovery: retry transient execution
once; allow one focused correction for an invalid result; route repeated repair
failures to the architect. Three replans for the same unmet outcome without
verified progress or new evidence end in explicit failure. Unrecoverable login,
setup or storage errors are failed jobs with diagnostics, not invented
plan-change requests. Explicit user Stop is never retried automatically.

## 4. Ownership and evidence

Extend the harness with executable brief preparation, dependency scheduling,
engineering workers, independent checks and implementation-run events. Extend
the browser with the implementation control and progress projection. The
architect remains responsible for semantic scope and plan changes.

Engineering observations record direct tool targets and search roots against
the attempt's declared scope, including outcomes and returned paths where
available. Arbitrary shell file access stays unknown. Net workspace changes
and tool observations are separate; failed or reverted direct writes remain
observable. This is measurement, not full filesystem isolation.

Reuse the predecessor's project lock and durable job records. Engineering
results must be valid after all tools settle; a later write invalidates a prior
result until resubmitted. Source checks run in the recorded execution workspace.
An agent's completion claim never supplies host verification evidence.

### Activity measurement and KPI delivery

The harness refreshes Ramify measurement snapshots at attempt boundaries,
retains the initial root baseline and immutable planned owner/seam/reuse sets,
and attributes observed mutations to pi attempts/sessions. It records retries,
no-change/failed sessions, actual provider usage, observed excursions and linked
adaptation causes. It computes all formulas and drift classifications under
[the shared contract](../../../measurements-and-kpis.md); clients render projections.

Owner attribution comes from Ramify facts. Mutation history, mechanical-change
classification, causality and knowability judgments belong to ramify-agent.
Before/after dependency comparisons use existing Ramify generated evidence and
its coverage; no source analyzer is introduced into the harness. No part of
Plan 2C learns that an agent, session, scope or adaptation exists.

In addition to deterministic arithmetic/edge cases, the live fixture must retain
actual KPI evidence. Explicit missing evidence is permitted where the producer
or tools cannot observe it, but an implementation that never collects activity
cannot pass by labeling all its results unavailable. Scope reductions cannot
establish successful execution without the original feature acceptance.

## 5. Iterations and completion

| Iteration | Capability | Prerequisite |
| --- | --- | --- |
| [1](iterations/iteration1.md) | Execution, verification, activity measurement and KPI computation | Completed architectural planning MVP |
| [2](iterations/iteration2.md) | Start implementation, progress/KPI views and live execution trial | 1 |

The [manifest](iterations/manifest.json) and [acceptance cases](acceptance.md)
cover this successor only. Completion requires the real fixture to pass feature
acceptance and a complete Ramify check, with progress and any required decisions
visible in the browser together with recorded KPIs and their evidence coverage. A saved architecture alone cannot satisfy this gate.

Parallel workers, automatic merge/push/publication, remote hosting, plan editing,
full shell tracing and a competing-harness benchmark remain outside scope.
