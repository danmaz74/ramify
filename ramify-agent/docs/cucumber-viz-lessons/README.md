# Lessons from cucumber-viz

**Date:** 2026-09-20. **Status:** analysis. These are observations about another
project and the consequences proposed for ramify-agent; none is a rule here
until a plan or the [harness principles](../harness.principles.md) adopts it.

cucumber-viz's Implementation Studio and Planning Studio run coding agents
through planned iterations with harness-run checks. They have been used on
real projects, and their source records what failed: comments naming the bug a
line fixes, feature files stating behavior that was once wrong, and completed
fix plans. ramify-agent is a different design, but it meets the same problems.
These documents keep what is reusable before
[Plan 3](../plans/03-autonomous-implementation-loop/authoring-brief.md) is
written.

cucumber-viz is an external tool. Nothing here adopts its domain names,
architecture or conventions, and ramify-agent does not depend on it.

## Documents

Start with the [MVP shortlist](mvp-shortlist.md): the data-structure changes,
the code worth lifting, the critical errors and the plan improvements that add
no complexity. The subject documents below hold everything found, including
what is left for later.

| Document | Subject |
| --- | --- |
| [MVP shortlist](mvp-shortlist.md) | What Plan 3 takes now, and what waits |
| [State and recovery](state-and-recovery.md) | What is authoritative, commit order, attempt identity, schema versions, projections |
| [Checks and gates](checks-and-gates.md) | Failure causes, checks that did not run, evidence identity, output, process cleanup, guarded files |
| [Planning and contracts](planning-and-contracts.md) | Fakes, assignment validation, placement vocabulary, deferred work, acceptance traceability |
| [Sessions and writers](sessions-and-writers.md) | Session lifecycle, cancellation, write boundaries, usage and observation capture |

Each lesson states what cucumber-viz did or suffered, the evidence, and the
consequence for ramify-agent. A consequence names the affected structure of the
[core records proposal](../plans/03-autonomous-implementation-loop/core-records.proposal.md)
where there is one. Each lesson carries one verdict:

- **Adopt:** a change to make.
- **Confirms:** the current design already does this; keep it under pressure.
- **Consider:** plausible, but it may exceed the MVP; the plan decides.
- **Avoid:** machinery the MVP should not copy.

## The lessons that matter most

First, from cucumber-viz's author: every time an agent communicates with the
harness it uses JSON and the harness validates it completely; on failure the
agent is told the errors and asked to retry. See the
[shortlist](mvp-shortlist.md#0-the-fundamental-lesson).

1. Append the event that records a side effect only after the side effect is
   durable, and never mark work complete while a step that belongs to it is
   outstanding. cucumber-viz marked an attempt completed and then asked for
   publication; a retry made the outstanding request stale and the workflow
   wedged without an error. [State and recovery, lesson 1](state-and-recovery.md#1-completion-is-the-last-write)
2. An idempotent repeat must re-drive the transition it belongs to. A repeat
   that only detects "already written" leaves a restarted run waiting.
   [State and recovery, lesson 2](state-and-recovery.md#2-an-idempotent-repeat-re-drives-the-transition)
3. The harness binds an agent's identity and authority to its session. An
   attempt ID that the agent must pass back is forgotten, and the rejection
   looks like staleness. [State and recovery, lesson 3](state-and-recovery.md#3-the-harness-holds-the-fencing-token)
4. An infrastructure failure is identified by a structured signal from the
   site that produced it, never by reading output text.
   [Checks and gates, lesson 1](checks-and-gates.md#1-the-producer-names-an-infrastructure-failure)
5. A check that did not run records why, and an empty selection is a reason,
   not a pass. [Checks and gates, lesson 2](checks-and-gates.md#2-a-check-that-did-not-run-says-why)
6. Evidence is bound to the content of the tree that was tested. A commit and
   a dirty flag let an audit pass on a tree that had reverted 160 files.
   [Checks and gates, lesson 3](checks-and-gates.md#3-evidence-names-the-tree-it-tested)
7. Cancelling is not settling. A test runner's workers outlive it, and an
   agent's subprocesses outlive its cancellation. Kill the process group and
   confirm from the tree; do not trust an exit or a reply.
   [Checks and gates, lesson 5](checks-and-gates.md#5-kill-the-process-group)
   and [sessions and writers, lesson 1](sessions-and-writers.md#1-cancelling-is-not-settling)
8. A fake carries its own ending: who calls it, when it is deleted and which
   check proves the real provider. The recorded failure is a fake left in place
   after the imports were rewritten. [Planning and contracts, lesson 1](planning-and-contracts.md#1-a-fake-records-its-own-ending)
9. An agent's assignment is validated mechanically before anyone executes it,
   and an owner an agent names is checked against the module tree.
   [Planning and contracts, lessons 2 and 3](planning-and-contracts.md#2-validate-an-assignment-before-it-runs)
10. Discoveries outside the assignment are records, not prose in a result, or
    they are lost before anyone reviews them.
    [Planning and contracts, lesson 4](planning-and-contracts.md#4-deferred-discoveries-are-records)
11. A write guard is not the boundary. cucumber-viz's pre-write policy is
    defined, exported and called by nothing; what bounded its writes was the
    diff. Snapshot the tree around every writer and test that the guard is
    installed. [Sessions and writers, lesson 7](sessions-and-writers.md#7-a-guard-is-not-the-boundary-the-tree-is)
12. An invocation has liveness bounds and a closed set of ways to end, and an
    end caused by infrastructure spends no repair budget.
    [Sessions and writers, lessons 2 and 3](sessions-and-writers.md#2-how-an-invocation-ended-is-a-closed-set-and-some-ends-cost-nothing)

## What not to copy

The [architecture](../architecture/autonomous-implementation-loop.md) already
excludes cucumber-viz's per-finding registry, adjudication, waivers, commits
and publication. The search adds these:

- The flaky-test subsystem: seven modules, markers, sibling plans and a
  known-issue ledger. Its useful core is two focused reruns before a repair
  round, and even that can wait.
- A separate drift-detection subsystem. Its accepted-artifact drift signal was
  never implemented and stayed `false`; matching tree identities does the job.
- A machine snapshot as the authority, persisted without waiting. It produced
  lost writes and torn state, and a plan to make it transactional was
  discarded.
- Plan revision by replacing the whole iteration manifest, which keeps no
  earlier version and once re-ran every completed iteration.
- Results recovered from free text with a regular expression, and a completion
  checklist of booleans with no value for blocked or not run.

## Sources and method

| Source | Version | Used for |
| --- | --- | --- |
| The installed package, `cucumber-viz/src` | 0.7.0 | Current behavior. Paths below are relative to this `src/`. |
| The repository's `main` branch | 0.3.0 | `docs/`: the incident report, the Vitest investigation, completed and discarded plans. Its source is older and is cited only where marked. |

The installed package is newer than the repository branches that were checked:
`main` is 0.3.0 and `modularization_v3`, the newest found, is 0.6.3.

Four agents searched the two trees by subject and each reported at most eight
ranked lessons with file evidence. The central passages were then read
directly in the 0.7.0 source; each evidence line marks what was not read
directly and rests on an agent's report alone. Where the agents found no evidence, the documents say that
instead of inferring.

Abbreviations in evidence paths: `IS/` is
`domain-sub-apps/implementation-studio/`, `PS/` is
`domain-sub-apps/planning-studio/`.
