# Orientation

**Date:** 2026-10-09. **Status:** analysis with two adopted decisions: the
orientation vocabulary and the reading of the reused-context principle. The
implementation changes below are proposals, not a plan or evidence of
implementation.

**Implementation follow-up:** the consolidated
[Plan 24](../plans/24-orientation-for-context-selection/main-plan.md) is the single
plan for useful starting briefs, the selected orientation reuse and simple fresh
fallbacks. It incorporates Dan's later KISS decisions: no completeness machinery,
no mandatory unavailable-input markers, and no benefit verification. Existing
inexpensive metrics support Dan's own assessment. Proposals and open questions
below do not add work beyond that plan.

The harness implemented several things called "orientation" before the term
had a definition. This document records the definition, reviews each
implementation against it and records what was decided.

## Summary

- **Orientation** is the exploration a fresh session performs to understand the
  environment it works in before acting on its task. For example, an engineer
  started in module X to implement capability Y first explores its working
  directory for files and content relevant to Y. The
  [glossary](../glossary.md#orientation) now defines **orientation**,
  **initial orientation** and **reorientation**.
- "An Oriented Context Is Reused, Never Required" means exactly this: when a
  reusable session is unavailable, start a new fresh session whose prompt
  carries all the required information, and let it orient itself. No recovery
  machinery is needed or wanted.
- Of the current implementations, only the global architect context fits the
  definition. Work orientation is cut off before the agent has oriented, design
  orientation cannot explore at all, and engineer sessions, the largest
  orientation in a run, are never reused.
- The principle is misread in four places, each of which adds machinery or makes
  orientation required. The largest is the global architect context's
  generation machinery, built for an event no real run has recorded.

## Decisions

### D1. Orientation vocabulary

Adopted 2026-10-09 in the [glossary](../glossary.md#orientation):

- **Orientation**: the task-driven exploration a session performs to understand
  the environment it works in before it acts: searching and reading the
  project, the materials it was given and its tool results. It ends when the
  agent believes it knows enough to act. Its result exists only in the
  session's context, so a retained session can be continued or forked from it,
  and a lost session repeats it.
- **Initial orientation**: the orientation of a fresh session before its first
  task action. **Work orientation** and **design orientation** are the two
  kinds the harness records as submissions.
- **Reorientation**: orientation a session performs after its initial
  orientation, when it enters a part of the project it has not explored or when
  inherited context describes source that has changed.

Rebuilding a session from records is not reorientation. It is something the
harness does to a session. A session started from rebuilt records still orients
itself.

### D2. Reused context falls back to a plain fresh session

The [harness principles](../harness.principles.md#an-oriented-context-is-reused-never-required)
state: "A reused context is a cache, never the sole authority for decisions or
progress. Any invocation must succeed from a fresh session and the repository
alone."

This was written to avoid recovery machinery. When a session meant for reuse
is lost, or an orientation fails, the harness starts a fresh session whose
prompt carries everything the task requires. That session orients itself. The
fallback therefore needs:

- no generation counters, rebuild events or promotion of a replacement parent;
- no special text standing in for lost context beyond the task's ordinary
  inputs;
- no failure of a run or unavailability of a review because an orientation is
  missing.

The only obligation is per workflow: its fresh-start prompt must carry every
input the task requires, without relying on inherited context.

### D3. A formal orientation step needs a consumer

An orientation-only step is worth having only where its point is reused. The
local architect's orientation point has one consumer, the context selector,
which forks it once per work item. Dan decided to keep the context selector
and to make that orientation a real exploration of the module, so the fork
holds what the selector can use and the assignment turn continues from it.
[Plan 24](../plans/24-orientation-for-context-selection/main-plan.md) carries
this out.

## Review of the current implementations

Figures come from the
[status-badge-tone real run](2026-10-08-status-badge-tone-real-run.md#invocations)
(run `20261008T112847Z-ede7d9`).

| Implementation | Matches the definition? | Evidence |
|---|---|---|
| Global architect context | Yes | Initial analysis: 97 s, 21 tool calls, 54 KB of tool output; reused by every global fork |
| Work orientation | Partly | Orientation turn 26 s; the real exploration happened in the assignment turn: 87 s, 46.8k uncached tokens, a 32 KB grep |
| Design orientation | No | No tools; 7 s, 3.6k tokens; each review fork reads the candidate and READMEs again |
| Engineer sessions | Not covered | 142 s over 15 turns, re-exploring the module the local architect had just explored |

### Global architect context

The initial architect session is a real initial orientation. It becomes the
run's architect context. Placement and unresolved requests fork it, and accepted
decision briefs are appended to it without a model call.
[global-fork.system.md](../../subs/harness/src/prompts/global-fork.system.md)
tells each fork that inherited context was true when written and that the
records are the authority. That matches the staleness rule in the principles.

The weak part is recovery when that parent is lost; see
[the generation machinery](#1-the-global-architect-contexts-generation-machinery).

### Work orientation

The local architect's first turn for a work item ends in a
`submit_work_orientation` call with focus, current understanding and open
questions
([submissions.ts:13](../../subs/harness/src/context-selection/submissions.ts#L13)).
The harness records an orientation packet (the briefing plus that submission).
The context selector forks the turn's end point, and the assignment and
qualification turns continue the same session.

Findings:

- **The procedure is about understanding the task, not the environment.**
  [orientation.procedure.md](../../subs/harness/src/context-selection/orientation.procedure.md)
  asks the architect to read the goal, the requirements and the captured plan
  references. It never asks it to explore its module.
- **The turn is cut where the workflow needs it, not where the agent has
  oriented.** It exists to give context selection a fork point before
  assignment. In the real run, most exploration happened afterwards, in the
  assignment turn. The fork point therefore holds only part of the orientation.
  Whether that fork point is worth an extra turn is a workflow question;
  calling the turn "orientation" hides it.
- **The submission is a self-summary and is duplicated.** The packet is appended
  to the selector even when the selector forks and already has it in its
  inherited context. Without a fork point, the packet becomes the fallback, in
  effect a summary handoff.
- **It is required.** If no valid submission arrives, the run fails; see the
  [misreadings](#2-work-orientation-fails-the-run).

### Design orientation

A reviewer session receives the captured design guidance in its message,
submits a list of what it read plus a summary, and is kept. Every design review
with the same orientation key forks it
([reviews/inputs.ts:75](../../subs/harness/src/reviews/inputs.ts#L75)).

Findings:

- **It cannot explore.** It runs with no tools other than its submission
  (`builtinTools: []`,
  [service.ts:1500](../../subs/harness/src/run/service.ts#L1500)).
  It ingests supplied text, so it is not orientation under D1.
- **What it saves is cheap; what is expensive is repeated.** It costs 7 s and
  3.6k tokens. Each review fork still reads the candidate, the changed modules
  and their READMEs; the 13 KB README was read again in the real run.
- **It is required.** A failed design orientation makes its reviews unavailable;
  see the [misreadings](#3-design-orientation-makes-reviews-unavailable).

### Engineer sessions

The first engineer invocation and every new iteration start fresh
([session-reuse analysis](2026-10-08-session-reuse-and-system-prompts.md),
use-case table). The engineer orients in the module its local architect has just
explored. Under D1 this is the largest repeated orientation in a run, and no
reuse covers it.

Forking the local architect's assignment point for the engineer would change
role and authority. Scope review already does that, with review instructions
appended at the same instruction level as the inherited ones, plus appended
tools. Nothing has measured whether it pays off.

### Reorientation

Stale inherited context is handled case by case, with no general rule:

- the global-fork prompt's warning about inherited context;
- the reviewer's "Inherited understanding never substitutes for current
  snapshot evidence";
- the capability handback's list of what changed since suspension.

Nothing comparable tells a continued local-architect or engineer session what
changed since it last oriented.

## Misreadings of the principle

Each of the following adds machinery or makes orientation required, contrary
to D2.

### 1. The global architect context's generation machinery

Plan 3 required the global architect to "recover from those files after session
loss or compaction"
([autonomous-implementation-loop.md](../architecture/autonomous-implementation-loop.md#L172)).
[Iteration 8](../plans/03-autonomous-implementation-loop/iterations/iteration8.md)
turned that into a mechanism:

1. When appending a decision brief to the parent returns `session-lost`, the
   harness logs `global-context-rebuilt` and raises the context's generation
   ([architecture/context.ts](../../subs/harness/src/architecture/context.ts)).
2. The next global request has no session to fork. It starts fresh with an
   extra text from `orientation()`
   ([context.ts:109](../../subs/harness/src/architecture/context.ts#L109)),
   which renders the hypotheses, registry and decisions.
3. That fresh fork is kept and replaces the lost parent (`replaces: { reason:
   'context-rebuilt' }`); later briefs and forks use it.

[Plan 23 iteration 9](../plans/23-session-reuse-and-run-efficiency/iterations/09-results.md#L83)
tightened this: a missing initial orientation fails the request, and only a
recorded rebuild permits a fresh start.

No real-run analysis or evidence records a `global-context-rebuilt` event; it
appears only in plans, the event inventory and tests. The session store lies
inside the run directory, so a truly unreadable parent means the run's durable
state is damaged.

The replacement parent is also weaker than the original. It holds what the
records say plus what the first fresh fork explored for its own request, so
later forks inherit a narrower orientation.

Under D2, each global fork whose parent is unavailable starts fresh. Its message
already carries the registry, hypotheses and decision log, and the fork orients
itself. No session is promoted and no generation is counted. `orientation()`
is not orientation under D1 and its name misleads.

### 2. Work orientation fails the run

If no valid work orientation is obtained within the retry bound, the run fails
([service.ts:5077](../../subs/harness/src/run/service.ts#L5077)). Under D2, a
missing orientation means context selection and assignment start fresh with
their full inputs.

### 3. Design orientation makes reviews unavailable

A failed or unreadable design orientation makes its design reviews unavailable
rather than starting them fresh
([service.ts:1427](../../subs/harness/src/run/service.ts#L1427),
[harness README](../../subs/harness/README.md#L853)). Under D2, a design review
starts fresh with the guidance in its message.

### 4. Append failures are classed as session loss

`append()`
([session-operations.ts:236](../../subs/harness/src/run/session-operations.ts#L236))
returns `session-lost` for any receipt other than `completed`, including
`failed`, `stopped`, `unavailable` and `conflict`. An ordinary append failure
would therefore trigger the rebuild in item 1 and permanently discard a fully
oriented architect context. This follows from reading the code and has not
been reproduced. An append failure should be reported as a failure and retried
within bounds.

## Open questions

1. **Engineer orientation reuse.** Should an engineer fork its local
   architect's assignment point instead of starting fresh? It trades a role and
   authority change against the largest repeated orientation cost. This is a
   decision for Dan; the real run gives a baseline to compare against.
2. **The work orientation turn.** Decided in [D3](#d3-a-formal-orientation-step-needs-a-consumer):
   the architect explores its module in it, so the fork point carries real
   orientation.
3. **The design orientation turn.** Either give it read tools so it can
   explore, or drop it and let design reviews start fresh with the guidance in
   their message.
4. **Reorientation signals.** Whether continued sessions should receive a
   general notice of what changed since they last oriented, in place of the
   current case-by-case warnings.

## Proposed next step

A plan that applies D2 across the harness:

- Remove the generation machinery (`global-context-rebuilt`, generations,
  parent replacement and `orientation()`), so that a global fork without an
  available parent starts fresh from its ordinary message.
- Replace the failure paths in misreadings 2 and 3 with fresh starts.
- Report append failures as failures and retry them within bounds.
- Verify, per workflow, that the fresh-start prompt carries every required
  input.

Historical run records containing `global-context-rebuilt` need a decision on
whether readers keep accepting them.
