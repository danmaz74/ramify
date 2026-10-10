# Iteration 2 results: the Debugger area

[Iteration](02-debugger-area.md) · [Acceptance](../acceptance.md)

Implemented the Plan page breakpoint checkbox, the Run page's Debugger tab,
pause badge and banner, and the Debugger area with its state, prepared input,
conversation and composer. The candidate commit is `1be15b3a`, based on
`a6fe5aeb`, on branch `feat/plan35-debugger-ui` in the isolated checkout
`/home/app/ramify-plan35-debugger-ui`. The checks below ran against the files
of that commit; this receipt is a subsequent documentation-only commit. No push
was performed. The harness is unchanged.

## What was built

- `subs/web/src/plan-page.tsx`: a checkbox labelled "Stop before each engineer
  starts: the run then pauses before every engineer and waits on the Run page's
  Debugger area." beside the review stop. Checked, `start-run` carries
  `breakpoint: 'before-agent:engineer'`; unchecked, the payload has no
  `breakpoint` key and serializes exactly as before. A run whose snapshot names
  a breakpoint carries the badge "breakpoint" (`badge breakpoint`, titled
  "Started with the breakpoint before-agent:engineer") in the run list.
- `subs/web/src/run-page.tsx`: a "Debugger" tab, second after "Overview", only
  when `run.breakpoint !== null`; the header badge "Paused at a breakpoint" and
  a banner (`role="status"`, named "Paused at a breakpoint") above the areas
  while the run runs and the current state is `paused`. The banner reads
  "Paused at a breakpoint. <harness summary> (pause <id>, revision <n>)" and
  its button "Open the Debugger" opens the tab. After each Debugger command
  the page refreshes both the run progress and the debug state.
- `subs/web/src/debugger.tsx`:
  - `useDebugState`, shaped like `useRunProgress`: reads `getDebugState`
    now and every `interval` while the answered run is `running`; an explicit
    `refresh()`; a failed read keeps the last state, exposes the error and
    reads again on the next tick; an ended run is read once. A run without a
    breakpoint is never read.
  - State panel ("Breakpoint state"): "The run is working toward its next
    breakpoint.", "The run is pausing: admitted work settles before the
    pause.", "The run is paused before the engineer starts.", "An exchange is
    in progress: the engineer is answering a message.", or "The run has ended:
    it is <state>. The conversation below stays readable." with the terminal
    state badge. A current pause shows its facts (role, work item, iteration,
    request, capability task, nonfunctional repair as present, goal, next
    action, task state, pause ID, revision) and the harness `summary`
    verbatim. It says Stop stays in the Overview.
  - Prepared input: the button "Read the prepared input" (then "Read the
    prepared input again") reads `getDebugInspection` for the current pause,
    never automatically. Collapsible sections: Role instructions, Task message,
    Inherited blocks, Current additions, Effective blocks, Tools (name,
    mutating or read-only, description), Continuity (with its reason), Source
    point, Scope, Bounds (JSON). It states the preview is not evidence of what
    the engineer received, names the pause ID and revision the inspection
    answered, and says "This preview is historical: …" when the current pause
    has another ID or revision or there is none. A failure shows "The prepared
    input could not be read: <harness message>".
  - Conversation: every intervention in order. A message shows the person's
    text (pre-wrap) and its exchange: "The engineer is answering." while
    `admitted`; the answer, verdicts (accepted or rejected), outcome, error,
    continuity loss and settlement confirmation when `settled`; "The exchange
    was stopped|interrupted: <error>" otherwise. A link "Open the transcript
    chapter (<invocation>)" uses `chapterHref` whenever the exchange names both
    session and invocation. A resume shows "Resumed without a message." or
    "Resumed, with this message:" and the text.
  - Composer: a text area named "Message to the engineer" with "Send message"
    (enabled only while running, `paused` and `taskState: 'pending'`) and
    "Resume" (enabled while running and `paused`). Each click sends one command
    with `newCommandId()`, `expectedVersion: 0`, the current pause ID and
    revision; Resume carries `message` only when the trimmed text is non-empty,
    and then sends it verbatim. The text area is cleared only after acceptance.
    A refusal shows "The message|resume was refused: <harness message>"; a
    `connection` failure shows "No reply arrived for the message|resume,
    command <id>. The command may have been admitted; the next read shows it."
    Every outcome refreshes the run and the debug state.
- `subs/web/src/styles.css`: the breakpoint and paused badges, the banner,
  pre-wrap text, conversation cards and composer.
- `subs/web/src/tests/helpers/debugger.ts`: schema-parsed fixtures of a
  breakpoint run's snapshot, pauses, exchanges, interventions, debug state and
  inspections.

## Acceptance ownership

`plan-page.test.tsx`, `run-page.test.tsx` and `debugger.test.tsx`, all on JSDOM
with the stub client.

- U04: "U04: Start with the engineer breakpoint checked carries
  before-agent:engineer; unchecked, the start command is exactly as before"
  (whole command minus the ID, and its JSON) and "U04: runs started with a
  breakpoint are marked in the plan's run list".
- U05: "U05: a run without a breakpoint shows no Debugger tab, banner or badge,
  and its debug state is never read"; "U05: a breakpoint run that has not
  paused yet has a Debugger tab that says it is working toward its next
  breakpoint"; "U05/U06: the state panel names the pausing and exchanging
  states, with the harness summary and no paused badge or banner".
- U06: "U06: a reached pause shows the header badge, a banner that names it and
  opens the Debugger area, and its facts with the harness summary".
- U07: "U07: the prepared input is read once on request, bound to the pause ID
  and revision read, and marked historical once the pause moves on" (no read
  before the click; every section; historical after a new pause ID at revision
  1, after a revision move and after a resume with no current pause; two reads
  in all) and "U07: an inspection refusal is shown with the harness's message".
- U08: "U08: Send posts one debug-message with a fresh command ID, the current
  pause and revision and the verbatim text, clears the text and reads the state
  again".
- U09: "U09: a settled exchange shows the text, the answer, its verdicts,
  outcome, error, continuity loss and settlement, and links its transcript
  chapter" and the conversation test under U12.
- U10: "U10: Resume carries the text as its message, or no message without
  text; after a held accepted or terminal outcome Send is disabled and Resume
  enabled" (exact payloads, distinct command IDs).
- U11: "U11: a refusal at an unchanged run version shows the harness's message
  and reads the state again, so the next click names the current revision";
  "U11: a lost reply names the command ID and says it may have been admitted;
  the next interval read shows the admitted message" (fake timers); "U11: a
  failed read of the debug state keeps the last state shown with the failure,
  and the next interval read recovers" (fake timers, `client.failure` set then
  cleared).
- U12: "U09/U12: the conversation lists admitted, stopped, interrupted and
  resume entries in order and stays readable after the run ends, with both
  commands disabled" (terminal state, one debug-state read only, inspection
  button and text area disabled).

Two mutations confirmed the tests bite: polling past an ended run and
ignoring the task state for Send each failed the debugger tests.

## Checks

All focused; no full suite, no test lock.

| Command | Outcome |
| --- | --- |
| `npm run test:quick -- subs/web/src/tests/plan-page.test.tsx subs/web/src/tests/run-page.test.tsx subs/web/src/tests/debugger.test.tsx subs/web/src/tests/app.test.tsx subs/web/src/tests/client.test.ts` | 5 files, 75 tests passed |
| `npm run type-check` | passed |
| `npm run check:self` | passed: 0 errors, 0 warnings, 354 analysis limits |
| `npm run build:web` | built (the existing chunk-size warning only) |

No `module.ramify` change was needed: the web module already receives every
debug contract it imports.

## Decisions the plan did not state

- **Hook placement.** `useDebugState` lives in `debugger.tsx` beside the area,
  not in `run-progress.ts`; the Run page calls it for the badge and banner and
  passes its state to the area. It keeps polling on the answered run's state,
  and it re-reads once when the Run page's own snapshot leaves `running`, so the
  terminal state shows.
- **Paused marks.** The badge and banner show only while the run runs and the
  current state is `paused`; `pausing` and `exchanging` show in the state panel
  only.
- **Tab order.** "Debugger" is the second tab, after "Overview".
- **Transcript link.** Any exchange that names both session and invocation
  links its chapter, including a stopped or interrupted one.
- **Inspection button.** Enabled while the run runs and a current pause exists
  in any state; the harness decides whether the occurrence is inspectable and
  any refusal is shown.
- **Refresh after commands.** Every command outcome refreshes both the run
  progress and the debug state, as the main plan says ("refreshes the run and
  the debug state").

## Remaining failures and limitations

None known. No screenshots were produced; iteration 3's browser witness
records the rendered states. A `ClientError` of kind `invalid-response` is shown
like a refusal, with its message. The real client retries a command whose reply
is lost before reporting it; the stub reports the first loss.
