# MVP plan: a pi-based harness

> **Superseded** on 2026-09-19 by the [harness principles](../../harness.principles.md) and the
> [harness architecture](../../architecture.md). Kept for comparison; not current. See the
> [archive index](../README.md) for what may be reused.

**Date:** 2026-09-19. **Status:** draft for comparison. This plan describes
the MVP of the [agent work decomposition](2026-09-19-agent-work-decomposition.md)
approach built on [pi](https://github.com/badlogic/pi-mono), the extensible
coding agent, instead of driving Claude Code or Codex. It exists to compare
the two routes on effort, control and measurement quality before one is
chosen. Facts about pi were verified on 2026-09-19 against version 0.85.1 of
`@earendil-works/pi-coding-agent`; the older `@mariozechner` package is
deprecated. Items marked *verify* were not confirmed from the documentation.

## What pi provides

Everything below exists today and maps onto a need of the approach:

| Need | pi mechanism |
| --- | --- |
| Scope enforcement | `tool_call` event: an extension can inspect and block any call before execution, with mutable input |
| Files read, per session | `tool_execution_end` / `tool_result` events carry tool name, arguments and result |
| Post-write hook with the result in the agent's context | `tool_result` handlers patch the result of `edit` and `write`; the extension runs `ramify check --changed` and appends the outcome |
| Structured outcomes without prose parsing | `pi.registerTool`: a `report_outcome` tool with a Typebox schema; `terminate: true` ends the turn |
| Per-role system prompt | `before_agent_start` returns a replacement `systemPrompt`; or `.pi/SYSTEM.md` per scope |
| Per-module instructions | `AGENTS.md` chain from cwd upward, same as Codex; `AGENTS.override.md` replaces one directory's file |
| The module-architect skill | skills load from `.agents/skills/` walking up from cwd, where the skill is already linked |
| Clean context per run | `--no-extensions --no-skills --no-prompt-templates --no-context-files` plus explicit `-e` and `agentDir` |
| Headless driving | `--mode json` streams every event as JSON lines; `--mode rpc` for a long-lived process; the SDK's `createAgentSession` runs in-process |
| Resume a partial session | `--session <path>`, `SessionManager.open`, `--fork` |
| Compaction control | `session_before_compact` can supply the compaction or cancel it |
| Tool subset per role | `--tools read,grep,find,ls` for the architect; `--no-builtin-tools` with overrides |

Not provided: subagents (extension examples only), and *verify* whether
`--mode json` or the session JSONL records token usage and cost per
assistant message. The TUI footer reports them, so the data exists; the
first iteration confirms where.

## Architecture

Three pieces, all TypeScript, in a directory outside `ramify/`:

1. **`ramify-scope` extension.** One file loaded with `-e`. It receives the
   role, scope root, allowed paths and known APIs through environment
   variables set by the driver, and:
   - blocks `read`, `edit`, `write`, `grep`, `find`, `ls` outside the allowed
     paths, with a reason naming the scope; `bash` runs with `cwd` at the
     scope root and is logged, not blocked, in the MVP;
   - logs every tool call with its paths and result size to a per-session
     JSONL for the search space measures;
   - after `edit` and `write` inside a module, runs `ramify check --changed`
     on the file and appends the result to the tool result; exit 2 is
     reported as not verified, never as a pass;
   - registers `report_outcome` with fields `status` (`complete` or
     `partial`), `needs[]` (each with the external-need table row, the
     capability described, and evidence paths), and `notes`; the driver reads
     it from the event stream;
   - sets the system prompt for the role from a template directory, with the
     scope's `src/.ramify/` listing and the brief injected.
2. **Driver.** Reads a run file listing sessions in order: role, scope root,
   allowed paths, brief, prerequisite sessions. For each: ensures the branch
   and worktree state, starts `pi --mode json --no-session`-style isolation
   with `--session` in a run directory so the JSONL is kept, streams events
   to disk, waits for `report_outcome`, commits with `Role:`, `Scope:` and
   `Cause:` trailers, and records usage. Sequential; a `partial` outcome
   stops the run and prints the needs for the person to route by the table.
3. **Measure script.** Shared with the other route in intent: lines per owner
   from the commits, files read and bytes from the tool log, search spaces
   from the modularity probe, tokens from the session records. Prints the
   search space ratio, session count, session-weighted total, the drifts
   and escalations by row.

The driver may use the SDK in-process instead of a subprocess; the
subprocess form keeps the driver identical to one that would run Claude Code
or Codex, which matters for the comparison.

## Roles as prompt profiles

| Role | cwd | Tools | Allowed paths | Ends with |
| --- | --- | --- | --- | --- |
| Architect | project root | `read`, `grep`, `find`, `ls`, `bash` for `ramify materialize` | `.ramify-architect/`, `module.ramify` and `README.md` files, source only when the skill permits | the three outputs: work-weight map, reuse findings, seams |
| Vertical engineer | scope root `src/` | all | the subtree, its `.ramify/` views, the project's test runner | `report_outcome` |
| Contract engineer | LCA of the seam | all | both sides and named affected consumers; writes only contract types and conformance tests | `report_outcome` |
| Integration engineer | LCA `src/` | all | the LCA subtree | `report_outcome`, with descendant changes listed |
| Baseline | project root | all | everything | `report_outcome` |

## Iterations

| Iteration | Delivers | Exit evidence |
| ---: | --- | --- |
| 1 | Extension with scope blocking, tool log and `report_outcome`; driver running one vertical session on one toolkit module with a trivial brief | a session JSONL, a tool log, one commit with trailers; confirmation of where per-message usage is recorded |
| 2 | Hook patching of edit and write results; role prompts; architect session running the skill; contract and integration profiles | the architect's three outputs for the trial item; a deliberate violation reported to the agent within the tool result |
| 3 | Trial: the chosen toolkit item, architect, vertical sessions, one seam provider-first, integration; then the baseline run of the same item by a root session on pi | commits, session records, escalations recorded by row |
| 4 | Measure script and the comparison report | the measures for both runs; the same baseline item run once on Claude Code to size the agent-quality difference between harnesses |

## Comparison with driving existing agents

| Dimension | pi harness | Claude Code or Codex behind an adapter |
| --- | --- | --- |
| Scope enforcement | exact, both reads and writes, one event handler | Claude Code deny rules by path; Codex writes only |
| Hook result in context | patched into the tool result on both | native in Claude Code; on instruction in Codex |
| Outcome capture | a tool with a schema | a final JSON block, parsed and retried |
| Files read and bytes per session | from tool events, exact | from transcripts, format per runtime |
| Tokens per session | *verify* | in the JSON result |
| Context isolation | complete: no defaults unless passed | per-run config directory; parent instruction files still walk up unless overridden |
| Agent quality | the same models with pi's prompts and tools; no subagents | tuned prompts, subagents, plan modes, compaction quality |
| Effort to the first trial | extension plus driver, both small, one runtime | driver plus two adapters, transcript parsers per runtime |
| Confound in the measurement | none within pi; the cross-harness baseline sizes the harness difference | none within a runtime |
| Exposure to change | pi moves fast, renamed its package in 2026 | runtime flags and transcript formats also change |
| Later reuse | an extension is also loadable by anyone using pi on a Ramify project | adapters are the harness's own |

## Risks

- **Agent quality confounds the value question.** A weaker agent lowers
  completion and raises rework regardless of decomposition. Iteration 4's
  cross-harness baseline measures the difference directly rather than
  assuming it away.
- **Usage recording.** If pi does not persist per-message usage in a form
  the driver can read, the extension records it from `message_end` on
  assistant messages, which carry the provider's usage.
- **Bash escapes the scope.** Logged, not blocked, in the MVP; the log shows
  whether it matters before a sandbox (the `sandbox/` example uses
  `@anthropic-ai/sandbox-runtime`) is worth adding.
- **Compaction loses the scope framing.** The system prompt is not
  compacted, so the scope statement lives there; `session_before_compact`
  can add custom instructions if the trial shows drift after compaction.
- **No subagents.** The MVP is sequential and needs none. Need-to-know
  discovery queries run as a separate architect session started by the
  driver, not by the engineer.

## Decision criteria

Choose pi when iteration 1 confirms per-session usage and the extension
reaches exact scope enforcement in under a day of work, and when the
cross-harness baseline shows an agent-quality gap small enough that the
decomposition effect is visible above it. Choose the adapter route when
that gap is large, or when Claude Code's subagents and skills are needed by
the roles themselves rather than by the driver.
