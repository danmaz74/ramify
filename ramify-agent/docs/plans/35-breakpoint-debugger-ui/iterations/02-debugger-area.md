# Iteration 2: the Debugger area

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and boundary

Iteration 1 complete. Owner: the web module. The harness is not changed. The
area uses only `ProtocolClient` and the protocol types; it imports no harness
implementation.

## Deliverables

- Plan page: the "Stop before each engineer starts" checkbox with one sentence
  of explanation; checked, `start-run` carries `breakpoint:
  'before-agent:engineer'`; unchecked, the payload is unchanged. Mark runs
  started with a breakpoint in the run list.
- Run page: a Debugger tab present only when `run.breakpoint` is not null; a
  header badge and a banner above the areas while the current state is
  `paused`, the banner opening the tab. Read the debug state on the run
  progress interval while the run runs, in a hook shaped like
  `useRunProgress` with an explicit `refresh`, call `refresh` after every
  command and refusal, keep the last state on a failed read, and stop when
  the run ends. The badge and banner read the same state, so they live in the
  Run page, not in the area.
- `subs/web/src/debugger.tsx`: the state panel, the prepared-input panel, the
  conversation and the composer as the main plan describes. Buttons send one
  command each with `newCommandId()`, the current pause ID and revision.
  Refusals show the harness message and trigger a re-read; a lost reply names
  the command ID. Send is enabled only when `paused` with `taskState`
  `pending`; Resume when `paused`. Render each message's `exchange` by its
  status: `admitted` as answering, `settled` with answer and verdicts,
  `stopped` and `interrupted` with the harness error. Bind the inspection
  preview to the pause ID and revision read and mark it historical when the
  current pause differs or is absent. Link settled exchanges to their
  transcript chapter with `chapterHref`. The area says Stop stays in the
  Overview.
- Styles for the banner, badge, conversation cards and composer in
  `styles.css`, reusing existing panel, facts and badge classes.

## Verification and exit

Own U04 through U12 with JSDOM tests against the stub client: plan page start
payloads; absence of the tab for a run without a breakpoint; the waiting,
pausing, paused, exchanging and ended states; the badge and banner; inspection
on request, its historical marking after a revision move, a new pause ID and a
resume, and its refusal; message and resume commands with exact payloads;
admitted, settled, stopped and interrupted exchanges, verdicts and the
transcript link; disabled buttons after a held outcome and after the run ends;
refusal at an unchanged version, lost-reply reporting, and recovery of the
interval read after a failed read with fake timers. Run the focused web tests, `npm run type-check` and
`npm run check:self`. Commit and write `02-results.md` with the candidate
commit and screenshots or rendered-text evidence of each state if cheap to
produce; otherwise the test names.
