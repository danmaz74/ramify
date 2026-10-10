# Plan 34 acceptance

[Main plan](main-plan.md) · [Manifest](iterations/manifest.json)

These cases describe observable behavior, including the resolved whole-run
suspension and live-server-only decisions R34-1/R34-2.
Ordinary cases use scripted external operations. B17 requires registered native
witnesses; B18 requires a separately recorded real-plan exercise.

```gherkin
Feature: Caller-controlled engineer breakpoints

  Scenario: B01 - Stop before a prepared engineer task
    Given a run selects before-agent:engineer
    When an ordinary assignment, a repair or a capability-task engineer is ready
    Then the harness prepares the ordinary assignment before invoking that engineer
    And control returns with the role, work context, task goal and next action
    And a debugger follow-up or internal fallback cannot trigger that occurrence again

  Scenario: B02 - Settle the whole run before reporting a usable pause
    Given an engineer boundary is reached while a review is active and another is queued
    When the run begins pausing
    Then no new ordinary operation or review attempt starts
    And the active work settles under its normal bounds before paused is reported
    And a settlement failure is reported with its ordinary outcome
    And the waiting caller holds no run mutex, writer lease or ledger transaction

  Scenario: B03 - Preserve budgets without permitting unbounded model execution
    Given a run and a queued review have remaining execution budgets
    When the caller waits at a breakpoint and then requests a bounded exchange
    Then caller waiting does not consume the run budget
    And the suspended review neither expires nor overflows during the pause or exchange
    And model execution still consumes invocation and run bounds
    And overlapping pause reasons are counted once and expired work is not revived

  Scenario: B04 - Stop wins over a pause or exchange
    Given a run is pausing, paused or exchanging with its caller
    When an ordinary stop is accepted
    Then no later debug command starts a model call or releases an accepted action
    And any active tools settle before writer ownership is released
    And waiting clients receive the actual terminal outcome

  Scenario: B05 - Inspect the normal effective input
    Given a prepared fresh or continued engineer assignment
    When the caller inspects its breakpoint
    Then the response presents ordinary instructions, task, inherited context and additions
    And it identifies current tools, scope, bounds and source session point
    And inspection invokes no model and is not recorded as delivered model input

  Scenario: B06 - Append the caller message without replacing the task
    Given a prepared engineer assignment with its ordinary authority
    When the caller asks the engineer to explain its understanding without editing
    Then the first delivered input contains the ordinary task followed by the caller text
    And normal tools, guards, hooks and the submission judge remain active
    And no hidden discussion instruction or substitute task is added
    And the admitted packet and recorded caller message match the delivered input

  Scenario: B07 - Continue explanatory turns in the same logical session
    Given an engineer returned an explanation without a submission during a debug exchange
    When the caller sends a follow-up and later resumes with an implementation message
    Then the explanation leaves the assignment pending with no gate or repair scheduled
    And follow-up and resumed work continue from the latest settled session point
    And both Pi history and harness briefing ancestry retain the exchanges
    And ordinary task outcome handling applies after resume

  Scenario: B08 - Keep tool authority and real failure outcomes
    Given a debug exchange uses the ordinary engineer tool bindings
    When the engineer requests an out-of-scope write or reaches a terminal invocation failure
    Then the normal guard or bound applies and its evidence is retained
    And terminal failure is not reported as a successful explanatory return
    And an unsettled writer prevents another exchange, writer or gate

  Scenario: B09 - Hold an accepted action until resume
    Given a debug exchange submits completion, partial work or a capability request
    When the ordinary judge accepts that action
    Then the response reports the acceptance and pending workflow handling
    And no gate, capability delegation or next assignment follows until resume
    And another message cannot replace the accepted action
    And resume consumes that action once without an additional model call

  Scenario: B10 - Preserve rejection and context-loss meaning
    Given the engineer submits invalid input or loses reusable context during debugging
    When the normal judge or session operations classifies the outcome
    Then the debugger exposes the actual verdict or context-loss reason
    And final rejection retains its terminal meaning
    And any permitted fresh fallback is explicit about losing conversational continuity
    And its rebuilt ordinary task still includes the current command's caller text
    And ordinary runs retain their existing rejection and fallback behavior

  Scenario: B11 - Admit each mutation once
    Given a message or resume has been admitted with a command ID and expected pause revision
    When a client retries the identical command after losing its response
    Then it receives the existing admission and eventual result without repeating the effect
    And changing the payload under that command ID is refused
    And new commands with stale revisions or while an exchange is active are refused
    And double resume cannot release the workflow twice

  Scenario: B12 - Attach the existing launcher to the existing host
    Given serve hosts an explicitly prepared real project with a chosen Pi model
    When real-session attaches with the matching project, plan and breakpoint selector
    Then it starts the plan and returns successfully at a reached breakpoint
    And client exit neither spawns nor terminates the independently hosted server
    And project mismatch, unsupported selectors and conflicting model options are refused
    And launch without attachment retains its existing behavior

  Scenario: B13 - Return meaningful control receipts and bounded waits
    Given breakpoint or terminal events may precede a client's wait request
    When the client launches, messages, resumes or waits using the CLI
    Then reached-breakpoint output describes the current location and what resume does
    And a completed exchange updates the summary and interaction revision
    And paginated cursor polling does not miss an already reached stop or terminal result
    And a historical receipt identifies the current interaction state before further commands
    And a wait timeout preserves command identity without claiming cancellation
    And JSON stdout contains one result object with diagnostics on stderr

  Scenario: B14 - Client reconnection is distinct from server restart
    Given a debug-enabled run is unfinished before, during or after a breakpoint
    When its client disconnects and another client reconnects to the same server
    Then the run can be inspected and any admitted command's result remains retrievable
    When the server instead stops or crashes and is restarted
    Then the unfinished debug-enabled run is recorded as interrupted with evidence retained
    And it does not redispatch pending effects or claim successful completion
    And interruption is selected before effect completion, capability reconciliation or workflow restoration
    And runs without debugging retain existing recovery behavior

  Scenario: B15 - Preserve ordinary behavior and stored evidence
    Given a run has no breakpoint selector or is read from legacy records
    When it executes or is inspected by existing clients
    Then its ordinary submissions, missing-submission handling and recovery are unchanged
    And existing schemas and projections remain readable
    And debugger support does not require a web UI or another executor

  Scenario: B16 - Resume a pending task and reach the next real boundary
    Given a paused engineer either has no chat or has pending explanatory exchanges
    When the caller resumes with or without a message as the main contract permits
    Then the normal task or its retained continuation executes once
    And gates, reviews and architect handling receive the ordinary validated result
    And a later repair or capability-task engineer reaches a new breakpoint occurrence
    And the same occurrence does not immediately pause again

  Scenario: B17 - Verify native history and process lifetime
    Given registered witnesses use the actual CLI host and actual Pi session adapter
    When separate clients inspect, message, disconnect, reconnect and resume
    Then native request evidence retains ordinary inputs and caller exchanges at the right points
    And enforcement and submission behavior use the normal session engine
    And the independently hosted server survives client termination
    And server shutdown settles resources under the chosen lifetime policy

  Scenario: B18 - Produce reviewable work on a real project
    Given an agent has prepared a real target worktree and useful plan
    When it explores an engineer's interpretation at a breakpoint and resumes implementation
    Then the requested real change is delivered as a reviewable implementation candidate
    And the result retains its project-declared verification
    And a responsible agent assesses whether the requested work was delivered
    And the harness checkout retains a dated note linking interventions, run and candidate
    And unsuccessful implementation remains reported as unsuccessful
```
