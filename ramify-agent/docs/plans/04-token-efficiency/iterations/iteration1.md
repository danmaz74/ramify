# Iteration 1: Post-merge reconciliation and usage identity

**Goal:** start only from the merged Plan 3 result, preserve its compatibility
contracts, and make token usage attributable to a provider/model accounting
surface.

## Prerequisite gate

Before production edits, record:

- the destination branch and merged Plan 3 commit;
- Plan 3's iteration 12 results and completion report;
- the passing Plan 3 type check, tests, web build and self-check;
- a clean `git status`; and
- the refreshed architect revision, input identity and coverage limits.

If any item is missing, stop this plan as blocked. Do not implement against the
unmerged Plan 3 worktree.

## Work

1. Reconcile the main plan's named records, source locations and HTTP seams
   against the merged implementation. Record differences in the result note;
   preserve the plan's ownership and compatibility decisions.
2. Extend the agent port's usage observation with an accounting identity:
   provider, model, accounting-surface version and provider-reported versus
   synthetic. Pi supplies the selected provider/model. The scripted agent marks
   its figures synthetic.
3. Accumulate usage by identity during an invocation. Commit a separate
   `ramify-agent.usage-accounting/1` record with the existing invocation outcome
   so `invocation-outcome/1` remains readable and unchanged.
4. Reject no invocation merely because usage identity is absent. Record the
   absence as unavailable evidence for the future projection.
5. Add focused tests for multiple messages, resumed sessions, mixed identities,
   missing usage, provider totals that do not equal a simple category sum, and
   synthetic usage.
6. Correct current comments and user-facing messages that call model context
   usage merely “context size.” Preserve field names, event types, test titles
   and quoted historical evidence where renaming would change compatibility or
   history.
7. Reconcile the merged role policy and each `context-budget-reached` branch
   against the context-limit table in the main plan. Record any behavior
   difference; do not describe a fresh invocation in the same iteration as a
   new iteration.
8. Record every new port compaction `started` event immediately as a numbered
   attempt with trigger and reported usage before it. Correlate the `ended`
   event in order while preserving the existing completed `compaction`
   observation for compatibility. A missing end remains an interrupted attempt.

## Acceptance cases owned

TE01, TE02, TE03, TE20 and the implementation half of TE04.

## Exit evidence

- The prerequisite record.
- Old Plan 3 records parse and project as before.
- Pi and scripted port tests prove their distinct accounting identities.
- An invocation with two provider messages retains their reported total and
  category breakdown without deriving one from the other.
- Compaction tests cover threshold, overflow, explicit, failed and
  started-without-ended attempts. Existing completed observations still parse.
- The four standard project checks pass.
