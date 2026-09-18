# Iteration 9: Agent trials and completion

**Plan:** [Plan 2B: Generated architect view](../main-plan.md).
**Prerequisites:** iteration 8.
**Owners:** evaluation evidence and documentation.

## Goal

Run the agent test cases on the materialized toolkit view with Claude Code and
Codex CLI, score them against their keys, decide H1, and record the plan's
completion.

## Read first

- AV35–AV37 and the [agent test cases](../test-cases.md), all of it.
- The specification's [hypothesis](../../../architecture/architect-view.spec.md#hypothesis)
  and [agent trials](../../../architecture/architect-view.spec.md#agent-trials).
- Iteration 8's results: the view's revision and the hit-cost table.

## Deliverables

1. Re-derive every key from the materialized view, as the test cases'
   maintenance section requires, and record any changed key with its reason.
2. Run each core and extended task in a fresh session per harness:
   - Claude Code: `claude -p` with the preamble and task, tools limited to
     `Read`, `Grep` and `Bash(rg:*)`, JSON streaming output saved as the
     transcript.
   - Codex CLI: `codex exec` with a read-only sandbox and JSON output saved as
     the transcript.
   Both run from the worktree root with the view present. Neither receives
   this plan or the test cases.
3. Score every task from its transcript: tool calls, searches and narrowing
   searches, hit lines and bytes, README opened, source read, verdict. Save
   transcripts and the scoring table under `evidence/trials/`.
4. Decide H1 by the specification's criteria.
5. Write the completion report, `iterations/iteration9-results.md`, with the
   gate items of the main plan, and update the roadmap's Plan 2B row and
   section.

## Matrix rows executed here

AV35–AV37.

## Verification

The transcripts and scoring table are the evidence. Before the report,
re-run:

```sh
npm run type-check
npm run check:self
```

## Exit criteria

Every core and extended task has a transcript and a verdict on both
harnesses, the H1 decision is recorded with its evidence, and the documents
describe the result.

## Handoff

The H1 verdict and, if it is falsified, the evidence for the split view or a
query interface for Plans 4 and 7.
