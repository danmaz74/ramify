# Plan 35: the breakpoint debugger in the web UI

**Date:** 2026-10-10. **Status:** proposed. **Execution:** serial authored
iterations, one subagent per iteration, in an isolated worktree. Source
inspected at `b6fe1e4b` on `ramify-agent`.

## Outcome

A person starts a plan from the Plan page with the engineer breakpoint
selected, watches the run reach its pause on the Run page, reads the prepared
input, sends messages to the paused engineer, reads each answer, and resumes
the run, all without a terminal. The UI uses the controls
[Plan 34](../34-execution-breakpoints/main-plan.md) implemented: the same
`start-run` selector, the same `debug-message` and `debug-resume` commands and
the same debug queries. It adds no second debugger, no new role and no new
command. The harness stays the only writer of durable state; the web module
projects what the harness publishes and forwards commands.

## Scope and simple choices

- **Same controls, same semantics.** The UI sends the commands the CLI sends,
  with client-chosen command IDs and the current pause ID and revision. Every
  refusal the harness returns is shown as it is. Plan 34's rules on pending
  returns, held outcomes, refused further messages, stop precedence and the
  live-server-only policy are unchanged and are not restated by the UI.
- **One selector, one checkbox.** The Plan page offers "Stop before each
  engineer starts" beside the existing review stop. Checked, the start command
  carries `breakpoint: 'before-agent:engineer'`. There is no selector picker.
- **One Debugger area on the Run page**, shown only for a run started with a
  breakpoint. It holds the state, the prepared input, the conversation and
  the composer. A banner above the areas says when the run is paused, as the
  decision banner does for decision waits.
- **Two small harness projections**, nothing else in the harness: the run
  snapshot names the breakpoint the run was started with, and the debug state
  query lists the run's interventions (every admitted message with its settled
  result, and every resume) in log order. Both derive from the run log the
  harness already keeps; neither adds an event, a command or a record.
- **Polling, not streaming.** The debug state is read again whenever the run's
  version moves and after every command the page sends, through the existing
  run progress poll. Every debugger transition writes a run event, so the
  version moves with it.
- **No new page, route or module.** The Debugger area links to the existing
  session transcript for the engineer's full exchange. There is no live
  transcript embedding, no message history editing and no per-message retry UI:
  a lost reply is reported with its command ID, and the page's next poll shows
  whether the command was admitted.
- **Fake and Pi agents alike.** The UI starts runs on the agent the server was
  configured with; qualification uses the server's fake agent in a real browser
  so that no model spend is needed, and documents the Pi scenario.

Outside scope: breakpoints other than `before-agent:engineer`, a selector
chooser, debugger access from the Plans list, embedded live transcripts, stop
from the Debugger area (Stop stays in the Overview), and any change to the
debugger's command semantics or server-loss policy.

## Ownership and existing seams

All paths are relative to `ramify-agent/`.

| Owner and current surface | Planned change |
| --- | --- |
| Harness: `src/interfaces/protocol/runs.ts` | `runSnapshotSchema.breakpoint`, nullable with default `null` so legacy answers and existing fixtures parse; `debugStateResponseSchema.interventions`. |
| Harness: `src/projections/` run snapshot, `src/http/app.ts` debug route | Project `record.breakpoint`; list interventions from `debug-exchange-admitted`, `debug-exchange-settled` and `debug-resumed` events, each settled result through the existing `debugResult`. |
| Web: `subs/web/src/client.ts`, `tests/helpers/stub-client.ts` | `getDebugState`, `getDebugInspection`, `getDebugExchange` over `protocolPaths.runDebug*`; stub answers for tests. |
| Web: `subs/web/src/plan-page.tsx` | The breakpoint checkbox and its start payload. |
| Web: `subs/web/src/run-page.tsx`, new `subs/web/src/debugger.tsx`, `styles.css` | The Debugger tab, banner and header badge; the area's panels and composer. |
| Root: `README.md`, `.claude/skills/ramify-agent-dogfooding/SKILL.md`, `docs/harness.spec.md` | The UI scenario beside the CLI one; the two projections in the specification's debugger section. |
| Root: `scripts/browser-acceptance/`, `subs/web/src/tests/browser-acceptance/` | A real-browser witness of the Debugger area. |

The existing `/debug` query already answers `current` and the reached pauses
after a cursor; the UI reads `current` and the new `interventions` and ignores
paging. The `DebugExchange` result the harness retains after settlement already
carries the answer, verdicts, session, invocation and evidence the conversation
needs. `chapterHref` already opens a session transcript at an invocation.
`DecisionBanner` and `DecisionWaitBadge` show the pattern for the pause banner
and header badge. `useRunQuery` re-reads a query when the run version moves.

## Behavior to implement

### Start with a breakpoint

The Plan page shows "Stop before each engineer starts" as a checkbox beside
the review stop, with one sentence saying the run then pauses before every
engineer and waits on the Run page's Debugger area. Checked, `start-run`
carries the selector; unchecked, the payload is exactly what it is today. The
run list on the Plan page marks runs started with a breakpoint.

### See the state

A run started with a breakpoint has a Debugger tab. Its state panel says one
of: the run is working toward its next breakpoint; it is pausing and settling
admitted work; it is paused, with role, work item, iteration, request,
capability task or repair, goal, next action, task state, pause ID and
revision; an exchange is in progress; or the run has ended, with its terminal
state. The harness's own `summary` is shown verbatim. While paused, the header
shows a badge and a banner above the areas names the pause and opens the tab.
A run without a breakpoint shows neither the tab nor the banner.

### Read the prepared input

A button reads the inspection for the current pause and shows it in
collapsible sections: role instructions, task message, inherited blocks,
current additions, effective blocks, tools with their mutating flag,
continuity and its reason, the source point, scope and bounds. The panel
states that this is a preview of the prepared input, not evidence of delivery.
The revision read is named; after the revision moves the panel says it is
stale and offers to read again. Inspection failures are shown with the
harness's message. Inspection is never read automatically.

### Converse

The conversation panel lists every intervention in order. A message shows the
person's text verbatim, then the engineer's answer when settled, or "the
engineer is answering" while admitted, or the stopped or interrupted status.
A settled exchange also shows its verdicts, outcome, error, continuity loss
and settlement confirmation when present, and a link to the invocation's
transcript chapter when the session and invocation are known. A resume shows
its optional message. The composer is one text area with "Send message" and
"Resume" buttons. Send is enabled only while the current pause is `paused`
with a pending task; Resume is enabled while the current pause is `paused`
with any task state, and sends the text area as its optional message. Each
click sends one command with a fresh command ID and the current pause ID and
revision, then refreshes the run and the debug state. A refusal is shown with
the harness's message and the page re-reads the state, so a stale revision
corrects itself on the next click. A lost reply shows the command ID and says
the command may have been admitted; the next poll shows whether it was. The
text area is cleared only after a command is accepted.

### After the pause

Once resumed, the state panel returns to "working toward its next
breakpoint", the conversation remains readable, and a later occurrence starts
a new current pause with its own revision. The debugger reads nothing after
the run ends except the retained conversation and the terminal state. Stop
stays in the Overview; the Debugger area says so.

## Specification compatibility

The harness specification's debugger section gains two sentences: the run
snapshot names the selected breakpoint, and the debug state query lists
interventions derived from the retained log. No rule of Plan 34 changes, no
principle changes, and the Ramify model is untouched. The web module keeps
its `[ui, browser]` profile and imports only the protocol contracts it
receives.

## Implementation sequence

| Iteration | Deliverable | Depends on |
| --- | --- | --- |
| [1: protocol projections and client](iterations/01-protocol-and-client.md) | Snapshot breakpoint, intervention list, client methods, stub, tests | Clean baseline |
| [2: the Debugger area](iterations/02-debugger-area.md) | Plan page checkbox, Run page tab, banner, badge, panels, composer, tests | 1 |
| [3: qualification](iterations/03-qualification.md) | Real-browser witness against the hosted fake agent, documentation, final audit | 2 |

The [manifest](iterations/manifest.json) assigns acceptance ownership.
[Acceptance cases](acceptance.md) are behavioral requirements, not proof. At
each handoff write `NN-results.md` with the candidate commit, changed
contracts, checks run and remaining failures.

## Verification

Focused guarded tests, type checking and `npm run check:self` per iteration.
Web tests run in the configured `web` project on JSDOM with the stub client;
harness tests script every external answer. The final iteration runs the
real-browser witness with the real server, the fake agent and a prepared
fixture copy, and records its evidence. Take a clean committed baseline and a
final configured full audit from the repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

No real model calls in any test. The Pi scenario is documented, not run, in
this plan; its first real use is dogfooding after the merge.
