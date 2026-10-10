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
  `paused`, the banner opening the tab. Read the debug state with
  `useRunQuery` keyed on the run version, and again after every command.
- `subs/web/src/debugger.tsx`: the state panel, the prepared-input panel, the
  conversation and the composer as the main plan describes. Buttons send one
  command each with `newCommandId()`, the current pause ID and revision.
  Refusals show the harness message and trigger a re-read; a lost reply names
  the command ID. Send is enabled only when `paused` with `taskState`
  `pending`; Resume when `paused`. Link settled exchanges to their transcript
  chapter with `chapterHref`. The area says Stop stays in the Overview.
- Styles for the banner, badge, conversation cards and composer in
  `styles.css`, reusing existing panel, facts and badge classes.

## Verification and exit

Own U04 through U12 with JSDOM tests against the stub client: plan page start
payloads; absence of the tab for a run without a breakpoint; the waiting,
pausing, paused, exchanging and ended states; the badge and banner; inspection
on request, staleness and refusal; message and resume commands with exact
payloads; settled answers with verdicts and the transcript link; disabled
buttons after a held outcome and after the run ends; refusal and lost-reply
reporting. Run the focused web tests, `npm run type-check` and
`npm run check:self`. Commit and write `02-results.md` with the candidate
commit and screenshots or rendered-text evidence of each state if cheap to
produce; otherwise the test names.
