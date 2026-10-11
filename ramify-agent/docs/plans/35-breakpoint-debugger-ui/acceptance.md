# Plan 35 acceptance

[Main plan](main-plan.md) · [Manifest](iterations/manifest.json)

Ordinary cases run on JSDOM with the stub client, or in the harness with
scripted external operations. U13 runs a real browser over the built UI, fed
by actual harness answers a scripted in-process run exported.

```gherkin
Feature: The breakpoint debugger in the web UI

  Scenario: U01 - A run snapshot names its breakpoint
    Given a run was started with before-agent:engineer and another without
    When their snapshots are read through the run and run-list queries
    Then the first names the selector and the second names null
    And a snapshot that omits the field parses as null

  Scenario: U02 - The debug state lists interventions in order
    Given a paused run received a message, its answer settled, and a resume with text
    When the debug state is read
    Then interventions list the message with its settled exchange, then the resume with its text
    And an admitted but unsettled message carries its exchange with status admitted
    And a message whose run was stopped or interrupted before settlement carries that status and error
    And the list is complete when the query's after cursor lies beyond the admission event
    And current interaction state is reported beside them
    And the CLI client's fixtures parse the revised answer and it still drains pages

  Scenario: U03 - The client reads the debug queries
    When the web client reads the debug state, an inspection and an exchange
    Then it requests the protocol paths of each and validates the answers
    And a harness refusal becomes a protocol error with the harness's message

  Scenario: U04 - Start with the breakpoint from the Plan page
    Given the Plan page with the breakpoint checkbox checked
    When the person starts a run
    Then the start command carries before-agent:engineer
    And an unchecked box sends the start command exactly as before
    And runs started with a breakpoint are marked in the plan's run list

  Scenario: U05 - The Debugger area exists only for a debug-enabled run
    Given a run without a breakpoint
    Then the Run page shows no Debugger tab, banner or badge
    Given a run with a breakpoint that has not paused yet
    Then the Debugger area says the run is working toward its next breakpoint

  Scenario: U06 - A reached pause is visible everywhere it matters
    Given the current debug state is paused
    Then the header shows a breakpoint badge
    And a banner names the pause and opens the Debugger area
    And the state panel shows role, work, goal, next action, task state, pause ID, revision and the harness summary

  Scenario: U07 - The prepared input is read on request
    Given a paused run
    When the person opens the prepared input
    Then the inspection is read once and its sections are shown with the pause ID and revision read
    And the panel says the input is a preview, not delivered input
    And after the revision moves, after a later pause with another ID at revision 1, and after a resume with no current pause, the panel says the preview is historical and offers to read again
    And an inspection refusal is shown with the harness's message

  Scenario: U08 - Send a message to the paused engineer
    Given a paused run with a pending task
    When the person sends a message
    Then one debug-message command is sent with a fresh command ID, the current pause ID and revision and the verbatim text
    And the state is read again and the conversation shows the message as being answered
    And the text area is cleared

  Scenario: U09 - Read the settled answer
    Given a settled exchange in the interventions
    Then the conversation shows the person's text and the engineer's answer
    And it shows the verdicts, outcome, error, continuity loss and settlement confirmation that are present
    And it links the invocation's transcript chapter when the session and invocation are known

  Scenario: U10 - Resume with or without a message
    Given a paused run
    When the person resumes with text in the composer
    Then one debug-resume command carries that text with the current pause ID and revision
    And without text the command carries no message
    And after a held accepted or terminal outcome Send is disabled and Resume stays enabled

  Scenario: U11 - Refusals, lost replies and failed reads are honest
    Given the harness refuses a command as a conflict while the run version is unchanged
    Then the refusal's message is shown and the state is read again at once
    Given the reply to a command is lost
    Then the page names the command ID and says the command may have been admitted
    And the next interval read shows the admitted message in the conversation
    Given a read of the debug state fails while the run is paused
    Then the last state stays shown with the failure and the next interval read recovers

  Scenario: U12 - The conversation outlives the pause
    Given a run that was resumed and later ended
    Then the conversation remains readable
    And the state panel reports the terminal state
    And Send and Resume are disabled

  Scenario: U13 - A person drives a breakpoint in a real browser
    Given a scripted in-process run exported its actual debug state, inspection and exchange answers at each step
    And a real browser shows the built UI over a stub client that replays those answers and advances on each command
    When the person starts the plan with the breakpoint, waits for the pause, reads the input, sends a message, reads the answer and resumes
    Then the page shows each state and sends each command as the ordinary tests state
    And the exported answers were not fabricated and every step is recorded as evidence
```
