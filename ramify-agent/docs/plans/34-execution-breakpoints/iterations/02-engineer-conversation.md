# Iteration 2: engineer conversation

[Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Prerequisites and boundary

Iteration 1 complete. Owner: harness prepared request/packet presentation,
shared runner, session-operation correlations and command handlers. Read the
agent's exposed session operations and Pi history lifecycle; extend those child
contracts only if a concrete gap prevents ordinary continuation. All cross-owner
access follows generated API views and declared exposures.

## Deliverables

- Render inspectable ordinary inputs without a model call. Include effective
  inherited context and current tool declarations, not merely the latest delta.
- Add caller text before immutable operation admission, preserving the normal
  task, authority and delivery accounting. Retain intervention identity and text.
- Execute one exchange through the ordinary session engine; keep a plain ended
  conversation pending only in debugger mode, and retain its settled point.
- Continue follow-ups and resumed work through the same logical session, with
  updated harness briefing ancestry and ordinary current bindings.
- Hold accepted actions and terminal failures for normal handling on resume.
  Refuse further messages once an outcome is held. Preserve rejection bounds,
  explicit context-loss behavior, tools settlement and recorded usage.
- Complete serialized message/resume admission, stable-command retries and
  interaction revisions. Stop can cancel settlement waits as existing policy
  allows and cannot leave a command falsely reported as completed.

## Verification and exit

Own B05–B11; rerun B03 for an exchange's bounds and the suspended review
queue during it, and B14 for server loss during an admitted exchange.
Test normal task input plus caller text, two explanatory returns,
continuation into ordinary implementation, submission during chat, final
rejection, context loss with caller text preserved in fresh fallback,
out-of-scope writes and unsettled tools. Test duplicate
commands before and after their replies and concurrent message/resume races.
Use scripted drivers and external evidence, not actual Pi or Git here.

Run focused guarded tests, type checking and module checks. Handoff: callers
can inspect, chat and resume through in-process command handlers with complete
correlations and no duplicate workflow effects. Commit and write `02-results.md`.
