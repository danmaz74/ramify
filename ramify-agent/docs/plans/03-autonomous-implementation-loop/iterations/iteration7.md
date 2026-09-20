# Iteration 7: The shell, mutations and hooks

**Goal:** give the engineer its shell; observe every mutation, guarded or not; deliver Ramify's findings after each
settled mutation; and state the MVP's limits instead of implying enforcement it
does not have.

## Prerequisites

Iteration 6: assignments with resolved write scopes, `edit` and `write` behind
the write guard, the iteration gate, repair and the commit. Iteration 3: the
port's `afterMutation`.

## Write scope

`subs/harness/src/hooks/`, `subs/harness/src/tools/` (the `shell` tool),
`subs/harness/src/run/` (mutation snapshots and writer settlement),
`subs/harness/src/kpi/` (line events), and the `module.ramify` of `harness`
where a new exposure is needed.

## Interfaces consumed and established

Consumed: `WriteScope.resolved`, the `guard` observation of iteration 6, `RamifyCli.checkChanged`, `changedPaths`.

Established: the `shell` harness tool; the `mutation`, `hook-check`, `excursion` and
`coverage-gap` observations; `InvocationOutcome.outsideScope`;
`LineEventSummary` with real content.

## Work

### Mutations

Each settled mutating tool call becomes a `mutation` observation with
`observedBy: 'tool'`, **including when the tool failed**. When the writer settles,
`git status` gives the paths changed since the last accepted commit: one further
`mutation` with `observedBy: 'snapshot'`, which fills `outsideScope`. That is what makes a write the guard could not
see visible, with no new machinery.

`LineEventSummary` is computed with `git diff --numstat` at the accepted commit: nonmechanical added and
deleted lines per path, the owner resolved from the module tree, binary files
with byte counts and no invented line count, and an `unmapped` bucket that is
never attributed to the root. A shell command that changes and reverts a file
before the commit yields unknown line events and a `coverage-gap`.

### Read excursions

Read and search boundaries are soft. The default is the assignment's scope, the
generated views and the module's onboarding. An excursion is permitted and
becomes one `excursion` observation on first entry to another module, with a
concise reminder to the agent rather than a repeated warning. Compiler and
test-runner reads are not excursions.

### Hooks

The harness installs the Ramify hook into pi's tool lifecycle explicitly,
because the adapter disables automatic extension discovery. After each settled
mutation it runs `ramify check --changed <paths> --format json` with the
policy's `hookTimeoutMs` and records a `hook-check` observation with paths,
mode, outcome, reason, newly introduced findings and the log
reference. New findings, or an explicit not-checked reason, reach the engineer
before its next step. Exit 2 permits continued editing and is never a pass. A
named configuration file is answered at once as not checked, so the harness runs
a **complete** check rather than claiming hook coverage; the same applies when
the changed set cannot be established, and the gap is recorded.

### Writer settlement with real writes

Before a replacement engineer, a contract sub-session, a gate or a recovery
writer begins, the previous writer is settled or terminated with its mutating
subprocesses. Discarding a reply is not shutdown. A late result is retained for
diagnosis and usage with `disposition: 'superseded'` and never completes the
superseded work.

### The shell

By decision 12 engineers have a shell. It is a harness tool, `shell`, with a
strict input schema `{ command: string; timeoutMs?: number }` validated under
rule 10, and pi's own `bash` stays withheld. The command runs through
`runCommand` from the working directory: its own process group, a clean
environment, a bounded timeout and an 8 KiB output tail returned to the agent,
with the full output in a file. Each call is an `activity` observation holding
the command text, and the tool is declared `mutating`, so the post-write hook
check runs after it with a complete check, since its changed paths are unknown.
Settlement kills the groups of any command still running. Its writes pass no
guard: they appear in `git status` when the writer settles, in `outsideScope`
when they lie outside the scope, and every invocation that used the shell
records the `unguarded-shell` coverage gap.

Tests: a command that leaves a descendant is settled by its group; a write
outside the scope through the shell is reported and not blocked; a schema
violation returns its errors and runs nothing.

### Stated limits

Shell write enforcement, command allowlists and filesystem sandboxing are
deferred. The evaluation projection states which tools were guarded and which
activity was observed. Zero blocked attempts is never reported as proof that all
writes respected scope.

## Acceptance cases owned

| # | Case | Evidence |
| --- | --- | --- |
| C3 | Stop is bounded; late tool writes settle before a new writer or check; a late result cannot complete superseded work | A scripted tool that writes after cancellation: the next writer and the next gate both wait for a confirmed settlement; the superseded outcome is retained and not applied |
| X6 | One outside read and one unguarded shell mutation make the MVP's limits visible rather than reported as complete enforcement | An `excursion` observation for the read; a `coverage-gap` of kind `unguarded-shell` plus the `git status` difference when the writer settles, for the mutation; the evaluation projection names the guarded tools |

## Guards owned

| Guard | Test |
| --- | --- |
| A write the guard cannot see appears in `git status` when the writer settles and in `outsideScope` | `subs/harness/src/tests/unguarded-write.test.ts` |

## Exit evidence

- A hook check with findings, one with a timeout, and one on a configuration
  file that falls back to a complete check; none of the three recorded as a
  pass.
- A mutation by a tool that failed, still observed.
- A `LineEventSummary` with an unmapped bucket and one with a binary file.
- `npm run type-check`, `npm test`, `npm run build:web`, `npm run check:self`.
