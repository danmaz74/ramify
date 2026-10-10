# Exercising the harness one step at a time

**Date:** 2026-10-10. **Status:** proposal; planned as [Plan 30](../plans/30-harness-steps/main-plan.md) (Layers A and B) and [Plan 31](../plans/31-operator-driver/main-plan.md) (Layer C). **Source inspected:** ramify-agent
at `5bd14875` with the untracked Plan 28/29 documents. Three read-only code
analyses by Opus subagents inform it: the run pipeline and its seams, the
agent layer and its records, and the problems of the recent real runs.

## The request

Real runs are now exercising the harness on real plans, and they fail. The
loop "fix the harness, rerun the whole plan" costs 15 to 60 minutes per
attempt and shows one failure per run. The requested alternative: a
generalist agent such as Claude Code executes *individual* steps of the
harness, as the harness would, while implementing a real plan. It observes
the step, fixes the harness live, retries the same step, and moves on when
the step works reliably. Two shapes were named:

- run one engineer session on one module, with the generalist agent acting
  as that engineer's local architect;
- run the local architect itself, and judge how it performed.

The question is whether this takes scripts, a new API in ramify-agent, or an
MCP interface.

## What the code allows today

1. **No step is invocable on its own.** `RunService` in
   `subs/harness/src/run/service.ts` is 12,779 lines and holds nearly all
   orchestration. Each role invocation is an `InvocationRequest` built inline
   (`service.ts:402-470`), whose `validate`, `equip`, `keep`, `endedAs` and
   `fenced` members are closures over run state. `takeWorkItem`
   (`service.ts:5707-6392`) keeps about twenty locals that exist nowhere on
   disk. The only existing standalone entry, `ramify-agent session`, runs the
   engineer alone from a synthetic assignment whose approach and completion
   evidence read "Not stated." (`sessions/single.ts:339-355`), with no
   follow-up turn, no gate repair, no capability handling, and it takes the
   project lock.
2. **Below the orchestration there is one clean seam.** Every session runs
   through `SessionOperationDriver.dispatch(invocation, runtime)`
   (`subs/agent/src/interfaces/session-operations.ts:95`). The runtime offers
   `callTool` and `submit`; the guard, the effect journal, the post-write hook
   and the submission judge live in the generic engine
   (`subs/agent/src/session-operations.ts:373-433`), not in the pi adapter.
   pi executes its own built-in tools through that same runtime
   (`subs/agent/subs/pi/src/session-operations.ts:236-253`). The scripted
   test driver already has an `await` step that waits on an external promise
   (`subs/agent/src/scripted.ts:529-542`): an operator driver is that driver
   with a reactive queue instead of a fixed array.
3. **Every role ends in a closed, validated submission.** `roleSchema`
   (`interfaces/protocol/runs.ts:36-49`) names twelve roles; each submits one
   kind from a schema-checked union (engineer `engineer.ts:57`, local
   architect `work/submission.ts:94`, capability architect
   `capability/submission.ts:20`, reviewer, failure analyst, nonfunctional).
   An operator's submission is validated exactly as a model's would be.
4. **A step's inputs are on disk, as the model saw them.** The run directory
   `plans/<plan>/.harness/jobs/<run>/` holds the plan, analysis, work items
   and outlines, assignments, invocation records, gate attempts and
   transcripts (`run/records.ts:936-981`). The exact delivered `TaskPacket`
   of every invocation is at
   `plans/.harness/session-operations/correlations/operations/<hash>.json`,
   and the session store keeps pi's verbatim native requests. What is
   recorded is enough to rebuild what a role received. The transcript alone
   is not: it lacks the tool declarations, the synthesized "Active tools"
   messages and the additions appended on a continuation.
5. **A real run cannot be resumed after a harness fix.** Recovery replays
   `drive` from the beginning and requires byte-identical prompt packages and
   inputs (`service.ts:2672`, `:4214`); otherwise the run ends
   `job-interrupted`. A prompt or packet change therefore invalidates the
   run it was meant to fix. This is the structural reason the current loop is
   a full rerun.
6. **The failures that killed the Plan 28 self-run were harness decisions
   between steps, not model behavior.** An oversized `readiness-failed`
   transaction, an ownership query that throws on a mid-change
   `module.ramify`, a write guard that swallows its cause
   (`guard/write-guard.ts:146`) and a dead analysis daemon
   ([self-run report](2026-10-10-plan28-self-run.md)). A step runner that
   stops at the submission would miss all four. Conversely, several prompt
   defects of the October runs were visible in the rendered packet with no
   model call: unfilled placeholders, empty `<plan>` blocks, duplicated
   schemas, environment blocks sent to roles that cannot use them.

## Answer in one paragraph

Scripts alone cannot do it: step construction lives in closures, so a
script would re-implement it and drift, as the hand-made contract-engineer
replay did. An MCP interface is not needed for a first version: Claude Code
drives a CLI well, and the only place where typed, changing tool lists
matter is the operator channel, which can gain an MCP wrapper later without
changing its actions. What is needed is a **step API inside ramify-agent**:
the harness's own step construction and post-submission handling, factored
so that one step runs from serializable inputs on disk, and a CLI over it
that the generalist agent drives as the orchestrator. A second, smaller
piece lets the generalist agent stand in for one role *inside* a real run
through the driver seam. The two are complementary: the step CLI gives exact
retry after a fix; the operator driver gives the real orchestration's
decisions around a step.

## Proposal

### Layer A: step construction as a library surface

Extract, per role, a pure constructor from serializable inputs to the
invocation the run makes:

```text
StepInputs<role>  ──build──>  { packet, toolDeclarations, equipment,
                                validator, bounds, recordsToWrite }
```

- `StepInputs` is a zod schema per role and holds only what is on disk: the
  run identity, the work item and outline, the assignment or briefing, the
  context selection, scenarios, the failed gate, the view identities, the
  session point for a continuation or fork. It is Plan 15's `replay.inputs`
  generalized to every role, including continued and forked starts, which
  Plan 23 made first-class.
- The run calls the same constructors. Drift between "what the run gives
  the agent" and "what the step runner gives the agent" is then impossible
  by construction rather than caught by a drift test.
- The post-submission handling that follows each role is extracted the same
  way where it is a pure function of records: recording an assignment,
  requesting reviews, running the ownership query, selecting the next
  frontier item. Where it is not pure, it stays in `RunService` and the step
  CLI calls the extracted part and reports what it could not run.

Suggested first set: the engineer iteration (fresh, repair continuation and
resumed after handback), the local architect's work turn with its
orientation and context selection, the iteration and work-item gates, and
the three reviewers. Analysis roles and the capability architect follow.

### Layer B: `ramify-agent step`, the generalist agent as the harness

A CLI whose commands are the harness's steps. Records go into the real run
layout under `plans/<plan>/.harness/jobs/<run>/`, in a run marked `manual`,
so the web dashboard, the postmortem scripts and the correlation store work
unchanged and the harness stays the only writer of durable state.

```text
ramify-agent step prepare   --project <root> [--self]
ramify-agent step inputs    --role <role> --from-run <run> --invocation <inv> --out <file>
ramify-agent step inputs    --role engineer --assignment <file> --work-item <file> --out <file>
ramify-agent step render    --inputs <file>
ramify-agent step run       --inputs <file> --agent pi|fake|operator --run <manual run dir> [--snapshot]
ramify-agent step gate      --run <dir> --checkpoint iteration|work-item|readiness|final
ramify-agent step after     --run <dir> --invocation <inv>
```

- `prepare` performs the preflight a self-run currently needs by hand: a
  parent commit, ignore entries, a minimal `ramify-agent.json`, the plan copy,
  a committed `ramify-audit.json`, and the dangling skill symlink.
- `inputs` derives a step's inputs either from a recorded run, by reading
  the records and the delivered packet, or from files the operator authored.
  An authored assignment is validated with the local architect's own
  submission schema and work-item validator, so the engineer is tested on a
  briefing a run could have produced.
- `render` prints the delivered role instructions, message, tool
  declarations and submission schema with no model call. This alone would
  have caught several October defects in seconds.
- `run` starts one invocation with the harness's equipment, guard, hook,
  judge and bounds, prints a condensed live transcript to the terminal (tool
  calls with truncated results, guard denials, submission verdicts, hook
  findings) and writes the run's record set. `--snapshot` records the
  working tree first, as Plan 15's snapshot ref, so a retry starts from the
  same tree. Exit status 0 submitted, 1 ended otherwise, 2 refused.
- `gate` runs a checkpoint as the run does, including the commit and the
  configured audit.
- `after` applies the extracted post-submission handling of Layer A and
  prints the resulting records or the error with its cause. This is where
  the ledger-size, ownership-query and guard-cause defects become visible
  in one command instead of at the end of a run.

The dogfooding loop for the first named shape is then:

1. The generalist agent reads the plan and the architect view, writes the
   work item and assignment as the local architect would, and validates
   them with `inputs`.
2. `render` checks the packet. `run --agent pi` runs the engineer and the
   agent watches the transcript.
3. `gate iteration` and `after` show what the harness would do next.
4. On a defect, the agent edits harness source, which runs through `tsx`
   without a build, and reruns the same command from the same inputs file.
   The inputs are files and the tree is snapshotted, so the retry is exact.

For the second shape, `inputs --from-run` takes a recorded local-architect
turn, including a continuation, and `run` replays it with the current
harness; the agent compares the submission with the recorded one and with
its own judgment of the work item.

### Layer C: an operator driver, the generalist agent inside a real run

A new agent owner, `subs/agent/subs/operator`, implementing
`SessionOperationDriver`:

- `dispatch` publishes the pending turn to a mailbox under the run
  directory, `operator/<operationId>/`: the role instructions, the message,
  the active tool declarations, the inherited history rendered as text, and
  the submission schema. It then waits for actions.
- Each action is a tool call, a submission or an end. Tool calls go through
  `runtime.callTool`, submissions through `runtime.submit`, so the guard,
  the journal, the post-write hook and the judge apply exactly as they do
  for pi. The driver persists each step through `runtime.persistPayload` so
  a later continuation or fork of this session carries its history.
- A composite driver routes by `task.role`: pi for the engineer, operator
  for the local architect, or the reverse. The operator's role set must be
  closed under fork lineage, since a fork of an operator session cannot be
  continued by pi, and a fork of a pi session loses operator turns
  (`pi/src/session-operations.ts:96-170`).
- A thin CLI, `ramify-agent operator pending|show|call|submit`, over the
  mailbox. An MCP server can wrap the same four actions later; nothing in
  the mailbox format should assume either client.

Wiring: the agent name in `runAgentSchema` (`runs.ts:53`), `agentNames`
(`src/cli.ts:5`), `SessionAgentChoice` and the server's agent choice
(`http/server.ts:27`, `:167-169`); built-in `read`, `grep`, `ls`, `edit` and
`write` implementations, which pi keeps private (either expose a binder from
pi or implement them beside the operator); and an operator-specific
invocation idle bound, since `invocationIdleMs` is 300 s and only port
events reset it (`run/policy.ts:36`, `service.ts:4509`).

Layer C is what verifies the orchestration around a step with a competent
architect in the loop: the generalist agent sees at once what the harness
records, gates and schedules after its submission. Its limit is finding 5
above: after a harness fix, that run cannot be resumed, so the fix is
retried with Layer B. Relaxing restoration so a run resumes at its last
accepted submission rather than by hash matching would lift that limit; it
is a separate, larger change and is not needed for the first version.

## Why this order

Layer A is the prerequisite for both others and is where the refactor cost
sits. Layer B delivers the requested loop first and makes a fix-and-retry
cycle a matter of seconds. Layer C is small in code, since the scripted
driver is almost an operator driver, but it touches policy, wiring and
cross-driver forks, and its value depends on Layer A for legible inputs.

## Small repairs that the analyses surfaced

These are independent of the layers and cheap:

- The write guard returns "outside every location" for every path when the
  placement query throws, with no cause (`guard/write-guard.ts:146`). Log
  and report the exception.
- The transcript's `started` entry should carry the tool declarations and
  record role-instruction additions on continuations, so that `render`
  output and the transcript agree with the native request.
- `run.restoring` is never cleared after a restored drive catches up
  (`service.ts:654`, `:2657`, `:2678`).
- The CLI and server call the scripted agent `fake` while the protocol enum
  says `scripted` (`runs.ts:53`, `src/cli.ts:5`).

## Relation to Plan 15

Plan 15, the prompt workbench, proposed invocation capture, a `replay`
command and a separate experiment bench, for fresh starts of three roles.
Layer A and the `inputs`, `render` and `run` commands of Layer B subsume its
capture and replay, extended to continued and forked starts. Its bench, with
repeats, variants and reports, remains a later addition on top of the step
CLI. Plan 15 should be marked superseded by the plan that implements this
proposal, or revised to build on it.

## Decisions to confirm before planning

1. **Start with Layers A and B for the engineer, the local architect's work
   turn, the iteration and work-item gates and the reviewers; Layer C
   follows in the same plan or the next.** Suggested: yes.
2. **Manual step runs write into the real run layout, marked `manual`.**
   Suggested: yes, so the dashboard and postmortem tooling keep working.
3. **The operator channel is a file mailbox with a CLI; MCP later.**
   Suggested: yes.
4. **`after` is in the first version.** Suggested: yes, because the recent
   fatal defects sit there; the extraction is partial and reports what it
   could not run.
