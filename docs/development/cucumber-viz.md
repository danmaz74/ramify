# Using cucumber-viz to develop Ramify

Complete the [standalone setup checklist](cucumber-viz-setup.md) before running
Studio in the new repository. For planning and implementation conventions, use
[the workflow guide](implementation-workflow.md).

## Devcontainer and ports

`.devcontainer/` builds the image for this repository on its own: Node 22,
Claude Code, Codex, PM2, Chromium and cucumber-viz, installed globally from
the private registry at npm.braimax.com and pinned by the
`CUCUMBER_VIZ_VERSION` build argument in the Dockerfile and the compose file.
To move to a newly published cucumber-viz, bump that argument and rebuild the
container. Bring the container up the first time from a Remote-SSH window on
the server: open the checkout and run the Dev Containers "Reopen in Container"
command. Afterwards nothing special is needed to get back to it. VS Code
restores the window at launch and lists it under Open Recent, and the Remote
Explorer's Dev Containers view in the Remote-SSH window shows it next to the
cucumber-viz container. Closing the window never stops the container
(`shutdownAction` is `none`), and on the server a git-ignored
`.devcontainer/.env` with `RESTART_POLICY=unless-stopped` brings it back after
a host reboot. PM2 processes are not restored; `post-start.sh` runs on the next
connection.

The workspace is `/ramify`, not `/app`. Claude Code and Codex key per-project
state by absolute path and `~/.claude` is shared with a cucumber-viz
devcontainer on the same host whose workspace is `/app`; a distinct path keeps
memory, transcripts and trust settings apart.

The Studio wiring lives in the repository: `cucumber-viz.config.ts`,
`.mcp.json` for Claude Code, `.devcontainer/codex-config.toml` for Codex and
`ecosystem.config.cjs` for PM2. All point at the global install.

| Port | Process | Start |
| --- | --- | --- |
| 4080 | cucumber-viz Studio | `pm2 start ecosystem.config.cjs --only main` |
| 4300 | Documentation site, dev server | `npm run site:dev` |
| 4301 | Documentation site, built | `npm run site:build && pm2 start ecosystem.config.cjs --only site` |
| 8787 | Example API | `npm run example:dev:api` |
| 5180 | Example Vite dev server | `npm run example:dev:web` |

None of these collide with the cucumber-viz devcontainer's ports, so both
projects can be forwarded to one local VS Code at the same time. Nothing
auto-forwards; use the Ports panel.

## Plan artifacts and prompts

Keep each plan under `docs/plans/<plan>/`, with `main-plan.md`, `plan.json`,
`iterations/iterationN.md` and `iterations/manifest.json`.

Use available Studio planning tools for managed writes and validate against the
installed schemas. During execution `main-plan.md` and existing iteration files
are read-only; `iterationN-results.md` is written through the workflow tools,
and `iterationN-check-results.md` and `status.md` are written by the control
plane. Ordinary Markdown may be edited directly; when a plan-creation tool is
unavailable, create the normal files and validate them before execution.

Use structured execution envelopes only with supported fields and module IDs.
Keep the Markdown sufficient to implement the iteration. Select prompts for the
plan's actual scope; known compatibility issues are in the
[setup checklist](cucumber-viz-setup.md).

## Execute in a worktree

Studio owns scheduling, workflow state, checks, managed commits, recovery and
worktrees. Complete the assigned iteration and return results through its tools;
leave advancement to the server.

Before edits or checks, confirm the execution worktree and revision. Use its
source, plan and generated output. Prepare dependencies for each package whose
checks run, keeping first-party source tied to the tested checkout.

For direct work outside Studio, use an isolated worktree when useful. Preserve
unmerged changes and evidence before cleanup.

## Diagnose workflow execution

Identify the configured project root, workflow ID and execution worktree.
Records usually live under that project's `.cucumber-viz/`, which may differ
from the agent's working directory. Inspect relevant records in this order:

| Record | Purpose |
| --- | --- |
| `.cucumber-viz/workflows/<id>/snapshot.json` | Current persisted phase, iteration and step. |
| `.cucumber-viz/workflows/<id>/journal.ndjson` | Lifecycle history and the last completed transition. |
| `.cucumber-viz/turns/turn_<id>.json` | Claude or Codex request, response, tools and turn status. |
| `.cucumber-viz/logs/planning-studio-*.jsonl` | Process startup/exit, check execution and operational correlation. Older runs may use `agent-studio-*.jsonl`. |

Match workflow/iteration, chat/session/turn and runtime-session IDs. For an empty
response, inspect turn status and runtime startup. Compare failing commands and
working directories with the active plan. Read only the necessary transcript
excerpts, keeping credentials and unrelated content out of reports.

Report the last completed step, failed operation, supporting evidence and proposed
recovery. Use supported controls to resume or retry; keep snapshots, journals and
check outcomes intact. Confirm the target and existing authorization before a
restart or replay that could affect other sessions. Reproduce Ramify product
bugs using the [testing guide](testing.md#regression-scope-and-bug-reproduction).
