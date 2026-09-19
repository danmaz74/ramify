# Superseded designs

Documents replaced on 2026-09-19 by the
[harness principles](../harness.principles.md) and the
[harness architecture](../architecture.md). They are kept for comparison.
They are not current: never treat them as requirements, and read them only
when asked to.

This directory is hidden so an ordinary search of `docs/` does not reach it.
Name its path to search it:

```sh
rg -n -i '<terms>' docs/.superseded/
```

## Contents

| Document | What it was | Replaced by |
| --- | --- | --- |
| [Agent work decomposition](analysis/2026-09-19-agent-work-decomposition.md) | The first statement of the approach: architect phase, vertical and horizontal work, external needs, integration, measurement. | The principles. Its measurement sections have no successor yet. |
| [pi-based harness MVP](analysis/2026-09-19-pi-harness-mvp.md) | A harness built on pi, compared with driving Claude Code or Codex. | Nothing; the architecture does not yet choose a runtime. |
| [Pi architectural planning MVP](plans/pi-agent-harness-mvp/main-plan.md), with its artifact, prompts, client protocol, acceptance and iterations | A plan for the planning phase, a standalone harness service and a web plan browser. | The architecture's plan phase and plan artifact. |
| [Pi implementation runner](plans/pi-agent-implementation/main-plan.md), with its acceptance and iterations | A plan for executing an architectural plan. | The architecture's work loop. |

Both plans link to an `agent-harness-mvp` plan that no longer exists.

## What may be reused

Nothing here is adopted. Each item names where to look.

### Measurement

From [agent work decomposition](analysis/2026-09-19-agent-work-decomposition.md):

- **Search space size** as the index for choosing a vertical scope: the bytes
  an ordinary search from the scope's root traverses, reported per exact owner
  and per subtree, with the generated API views as a separate view search
  space. See "Complexity as search space size".
- **Cost of a run against a root-scoped baseline**: mean search space per
  changed line, the search space ratio and its inverse the reduction factor,
  session count and the session-weighted total. Each session records only its
  scope, as a commit trailer. See "Measuring the approach".
- **Plan quality**: owner drift against the work-weight map, seam drift from
  the behavioral dependencies added during the run, reuse drift, adaptation
  cost from sessions caused by a discovery, and the knowable share of
  discoveries. Marked there as a rough draft. See "Measuring the plan".
- **A first trial by hand**, with what to record per session. See "First
  trial".

The current [measurements and KPIs](../measurements-and-kpis.md) contract was
derived from these sections.

### Harness as a standalone service with a separate web client

From the [planning MVP](plans/pi-agent-harness-mvp/main-plan.md), section 7,
and its [client protocol](plans/pi-agent-harness-mvp/client-protocol.md):

- The harness is a standalone process that owns the project lock, sessions,
  state, persistence and recovery, and completes a job with no browser
  connected. The web client only renders projections and collects commands.
- One HTTP JSON protocol under `/api/v1`, shared by the web client and a
  future CLI: read-only queries, commands, and progress as snapshots with
  ordered, cursor-based events. No WebSocket or broker.
- Commands carry an ID for idempotent retries and an expected version to
  reject stale controls; an accepted command returns a durable receipt, never
  a claim of completion. Clients render allowed actions from harness
  projections and recover by fetching current state.
- Boundaries: harness core, agent adapter, HTTP adapter, shared protocol and
  client importing neither the agent runtime nor Node filesystem APIs, and
  the web client. The harness may serve the compiled web assets but works
  without them.
- Job metadata owns input identity; ordered durable events own transitions;
  projections derive from both.

The existing `contracts`, `harness` and `web` modules follow this division.

### pi as the agent runtime

From the [pi-based harness MVP](analysis/2026-09-19-pi-harness-mvp.md):

- A table mapping the harness's needs onto pi mechanisms: blocking tool calls
  outside the scope, logging files read per session, appending the result of
  `ramify check --changed` to edit and write results, a `report_outcome` tool
  with a schema in place of parsed prose, a system prompt per role, clean
  context per run, headless modes and session resume.
- A scope extension, a sequential driver and a measure script as three small
  pieces; roles as prompt profiles with a working directory, tools and allowed
  paths each.
- A comparison of pi with Claude Code or Codex behind an adapter, its risks
  and the criteria for choosing.

### Other parts

- [Architect prompt package](plans/pi-agent-harness-mvp/architect-prompts.md):
  authoring and validation requirements for the architect's prompts.
- [Architectural plan artifact](plans/pi-agent-harness-mvp/architecture-artifact.md):
  validation, publication and revision rules that may carry over to the new
  plan artifact, whose sections differ.
- Acceptance cases of both plans, as a source of fixtures.
