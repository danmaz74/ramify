# Iteration 0: Pi and session lifecycle spike

Historical brief: the iteration completed, and its obsolete `spikes/` tree
was removed on 2026-10-04. The [results](iteration0-results.md) remain;
the paths and commands below describe the original execution.

**Goal:** answer, against the pinned SDK and not against documentation, whether
each session behavior the plan depends on exists, and return the revisions the
plan needs. Also re-establish the complete baseline before any change.

This iteration writes **no production code**. Its probes live under
`spikes/autonomous-loop/` beside the existing `spikes/briefs/`, outside every
module and outside the compiler's scope, and are never imported.

## Prerequisites

- Plan 2 complete; see [Predecessor evidence](../main-plan.md#predecessor-evidence).
- A pi login the person supplies. Probes that need a model call are recorded as
  not done with the reason if the login is unavailable; probes that need only
  the SDK's session machinery run without one.

## Write scope

`spikes/autonomous-loop/` and `docs/plans/03-autonomous-implementation-loop/iterations/iteration0-results.md`.
Nothing else. No module declaration, no `src/`, no `package.json` change.

## Interfaces consumed

The installed `@earendil-works/pi-coding-agent` 0.85.1 and the existing
`subs/harness/subs/agent/subs/pi/src/pi-agent.ts` as the reference adapter. The
current port is `subs/harness/subs/agent/src/interfaces/port.ts`.

## Baseline

Run from `ramify-agent/` before anything else and record the exact output:

```text
npm run type-check
npm test
npm run build:web
npm run check:self
```

Also record `node_modules/.bin/ramify materialize --view architect`, the
resulting `_meta.json` revision and input identity, and
`node_modules/.bin/ramify measure`. The main plan recorded
`rev/1:7c47db45-ed53-4d35-ab73-65b8a5c4bdcb:1` with
`input/1:a9cd361b802e43465f59efd10185aa245b21b4aea1539b5c241cf4a1b32193c8`,
5 owners, 73 source files, 776 accesses, 0 findings, and a type check at exit 0.
State whether the baseline still matches.

## Probes

One probe per behavior. Each records what was attempted, what happened, and one
verdict: **verified**, **verified with a limitation** (stating the limitation),
or **unavailable** (stating what was searched for).

| # | Behavior | What the probe must show |
| ---: | --- | --- |
| 1 | Continue a role session | A session started, ended, then reopened in the **same** process and in a **new** process, continuing with its history. Record how: the declarations expose `SessionManager.open`/`setSessionFile` handed to `createAgentSession`, and `CreateAgentSessionOptions` has no `continueSession` field despite its own JSDoc example |
| 2 | **Continue after a structured submission ends the turn** | Whether a session whose submission tool returned `terminate: true` accepts a further `prompt()` and resumes from the same history. This is the plan's decisive question: decisions 4 and 12 and iterations 3, 6 and 9 depend on it |
| 3 | Fork from an oriented point | A fork taken at a chosen entry that starts from that point, does not mutate the parent, and does not inherit the parent's later entries |
| 4 | Append without inference | Text appended to the parent with zero model calls, using `sendCustomMessage(..., { triggerTurn: false })` or `appendCustomMessageEntry`. Show which of the two reaches the model input: the declarations say `CustomMessageEntry` participates in LLM context and `CustomEntry` does not |
| 5 | The append reaches the next fork | A fork taken after the append whose rendered model input contains the appended text |
| 6 | Context observation | `getContextUsage()` across a session: when `tokens` is a number, when it is null, and what `contextWindow` reports. Compare with the plan's estimate formula on the same session |
| 7 | Disable compaction | Auto-compaction off for a session, verified by driving it past the default threshold without a `compaction_start` event |
| 8 | Observe compaction | Compaction allowed, triggered, and observed through `compaction_start`/`compaction_end` with its `reason` and before/after usage |
| 9 | Threshold-triggered final response | Tools removed with `setActiveToolsByName([])` and one final response obtained with no tool call, and when that takes effect |
| 10 | Guarded `edit` and `write` | Both built-ins enabled; a `tool_call` hook blocking one with a reason; the reason reaching the model as an error tool result; **no file written** |
| 11 | After-mutation observation | A post-tool hook firing for a mutating tool that **failed**, not only for one that succeeded |
| 12 | Cancellation and settlement | `abort()` and `waitForIdle()` during a long tool; whether `agent_settled` fires; whether a tool that ignores cancellation leaves a late writer. Record what the SDK cannot confirm, since the harness confirms settlement itself by process group and a stable tree |
| 13 | Session reconstruction after restart | A session file written by one process, reopened by another, and its context rebuilt |
| 14 | Withholding the shell | A session with `bash` and `powershell` absent from the allowlist, confirming the agent has no shell tool and that pi's defaults do not reappear |
| 15 | Usage and events | The event union actually delivered for one ordinary turn, and the usage fields available per assistant message and per session |
| 16 | Invalid tool input | What pi does with tool arguments that break the tool's JSON Schema, for a harness tool and for the submission tool: whether it rejects them itself or passes them on, what the model receives, and whether the adapter can observe the rejection. Also that a schema made with `z.toJSONSchema` from a union discriminated on `kind` is accepted by the provider. Rule 10 requires that every rejection is counted, recorded and answered with every error |

## Deliverable

`iteration0-results.md` containing:

1. The baseline output, verbatim.
2. The probe table with one verdict per row and the evidence for it.
3. **The port contract this plan should implement**, as a concrete revision of
   the [proposal's agent port additions](../core-records.proposal.md#agent-port-additions):
   the exact `SessionSpec` additions, the exact `AgentPort` additions, the
   events and outcomes, and for each one whether pi can supply it, supply it
   with a limitation, or not supply it.
4. **The consequences for the plan**, naming the decision and the iteration:
   at minimum decision 4 (probe 2), decision 12 (probe 14), the context
   thresholds and estimate (probe 6), and the compaction policy (probes 7 and 8).
5. Anything the SDK cannot do that the architecture assumed, stated plainly,
   with the adaptation proposed rather than hidden behind an abstraction.

## Exit evidence

- The four baseline commands and the two Ramify commands, with their output.
- Sixteen probe verdicts, none of them "assumed".
- A port contract concrete enough for iteration 3 to implement without
  invention.
- A named list of the plan's provisional statements this iteration resolves,
  and of any it leaves provisional with the reason.
