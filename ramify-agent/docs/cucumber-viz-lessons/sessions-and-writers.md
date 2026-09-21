# cucumber-viz lessons: sessions and writers

Part of [Lessons from cucumber-viz](README.md), which explains the verdicts,
sources and path abbreviations. "The proposal" is the
[core records proposal](../plans/03-autonomous-implementation-loop/core-records.proposal.md).
`AC/` abbreviates `core/shared/services/agent-chat/`.

cucumber-viz drives the Claude Code and Codex command-line tools as child
processes behind one chat service. ramify-agent drives pi in its own process
through a port. The process model differs; the failure modes below do not.

## 1. Cancelling is not settling

**Adopt.** Both cucumber-viz runtime adapters report `onCancelled` and then
send `SIGTERM` to the agent's process, in that order, and only to the direct
child. Nothing stops what the agent itself started. Its check commands have
real teardown, through the wrapper script whose comment reads: "Some commands
exit while leaving descendants behind. Kill the whole process group after
completion so the caller never gets stuck on leaked children." The agent's own
subprocesses have none. Its observed-behavior notes for the Claude tool record
buffered output arriving seconds after the signal.

Evidence: `AC/runtimes/claude-runtime/claude-runtime-adapter.ts:206-225`;
`scripts/run-command-with-cleanup.sh:39-52` in the package; the Codex adapter
and `docs/architecture/integrations-specs/claude-cli-observed-behavior-spec.md`
were not read directly.

Consequence:

- `writer-released.confirmed` is the result of the harness's own observation,
  never of `stop()` resolving or of the agent's last message.
- pi runs in the harness process, so there is no agent process to signal. What
  must settle is each mutating tool call and every subprocess a tool started.
  Any tool that can start a process starts it in its own process group and
  registers the group with the harness. Settlement kills the registered groups,
  confirms that they are gone, then takes a tree identity twice, a short
  interval apart, and requires them to match.
- `InvocationOutcome.settled` records how it was confirmed:
  `{ confirmed, groupsKilled, treeStableAfterMs, lateWrites }`. After
  `writerSettleMs` without confirmation, no writer and no gate starts, as the
  architecture requires.
- The iteration-0 spike should establish which pi built-ins can start
  processes. The MVP's built-in tools are read, search, `edit` and `write`; if
  no shell tool is given to engineers, the registered groups are only those of
  harness tools and hook checks, and the coverage gap for shell writes becomes
  a statement about a tool that is absent.

## 2. How an invocation ended is a closed set, and some ends cost nothing

**Adopt.** cucumber-viz names why a session was interrupted: `idle-timeout`,
`session-errored`, `session-cancelled` or `session-missing`. Its interruption
feature states that a missing session leaves the iteration with zero
remediation attempts. Its retry classifier works from structured exit
information, not from text, and refuses to retry a turn that already produced
output, because "replay would double-apply side effects".

Evidence: `IS/core/machines/agent-session-interruption.ts:5-10`;
`IS/feature-tests/workflow-executor-interruptions.viz.feature:6-17`;
`AC/retry-classifier.ts`, not read directly.

Consequence:

- `InvocationOutcome.ended: 'failed'` gains
  `interruption: 'idle-timeout' | 'absolute-timeout' | 'provider-error' | 'session-lost' | 'adapter-fault'`.
- An interrupted invocation with no `mutation` observation and no accepted
  submission counts toward `sessionReconstructionsPerWork` only. It does not
  count as a repair round or a budget return. One with mutations is a partial
  result and follows the ordinary handoff.
- An invocation is never replayed. A replacement is a new invocation that
  starts from the files, which the proposal already requires.

## 3. An invocation needs liveness bounds

**Adopt.** cucumber-viz guards an agent task with an idle watchdog, reset on
every non-terminal session event so that a provider's retry backoff does not
trip it, and an absolute limit of 30 minutes by default. On an idle timeout it
interrupts the session and keeps waiting for the terminal event instead of
abandoning it. A hardening plan names the earlier absence of these bounds as a
gap, and records a session wedged for good by a turn ID that was never cleared.

Evidence: `IS/core/runtime/agent-task/run-agent-task.ts:36-47`;
`AC/session-lifecycle.ts:138-227` and, in the repository,
`docs/plans/2026-04-20-workflow-recovery-oom-hardening/main-plan.md`, not read
directly.

Consequence: `RunPolicy.limits` gains `invocationIdleMs` and
`invocationAbsoluteMs` by role. The proposal bounds repair, retries and stop,
and has no bound on one invocation that neither ends nor fails. An invocation
that exceeds a bound is stopped, settled as in lesson 1, and ends with the
matching interruption.

## 4. The session key belongs to the harness, and a degraded mode is recorded

**Adopt.** cucumber-viz addresses a session by a deterministic key that the
caller owns, "used verbatim — the adapter never mints its own", and keeps the
tool's own conversation ID beside it. Resuming needs that conversation ID,
which arrives only when a turn completes, so a crash in the middle of a turn
forces a fresh start; the service stamps the session `degradedFrom: 'resume'`.
Forking is impossible without the ID.

Evidence: `IS/core/runtime/agent-task/run-agent-task.ts:21-26`;
`AC/agent-chat-service.ts:680-682` and `:1295-1322`, not read directly.

Consequence:

- `Invocation.session` records what was requested and what happened:
  `{ requested: 'fresh' | 'continued' | 'fork', actual: ..., degradedReason? }`.
  `startSession` reports the actual mode. A fork that silently became a fresh
  session would otherwise corrupt the comparison the architecture wants of
  parent context growth and fork cost.
- `SessionRef` stays opaque, but the harness derives the session's key from
  the role and the work it serves, such as `global`, `local:wi-001` or
  `engineer:wi-001.i02`, and the adapter maps it to pi's files. A restarted
  harness then finds a session without having stored anything pi returned.
- The spike should establish when pi makes a session resumable: after every
  message, or only at the end of a turn. That decides how often `continued`
  degrades in practice.

## 5. Ending without a submission is its own outcome

**Confirms, with one addition.** cucumber-viz tracks whether an agent reported:
`complete`, `partially-reported`, `follow-up-requested` or `agent-unreported`,
and falls back to results the system infers. It has to extract JSON from
message text and scans code fences from the last to the first.

Evidence: `IS/core/workflow/check-findings/check-finding-fix-attempt.ts:210-258`
and `IS/core/workflow/workflow-model/extract-json-payload.ts:96-122`, not read
directly.

Consequence: the port's submission tool removes the extraction problem, and
`ended` already differs from `submitted`. The addition: an engineer that ends
without submitting has usually still changed files. The harness records the
mutations, treats the invocation as `partial` with a report it writes itself
from the observations, and says so with `reportedBy: 'harness'`. Whether one
follow-up prompt asks the session to submit first is a bounded choice for the
plan.

## 6. Usage and compaction belong to the port

**Confirms.** cucumber-viz's Codex adapter parses token usage and never
delivers it, and its Claude adapter reads the result line only for the session
ID, so usage is lost in both. Compaction was requested by sending `/compact`
as prompt text and was then disabled, with a comment that one tool no longer
treats it as a command and the other receives it as ordinary text.

Evidence: `IS/core/workflow-service/checks-regression.ts:214-220`;
`AC/runtimes/codex-runtime/codex-jsonl-parser.ts:326-336`, not read directly.

Consequence: the port already reports usage per message. Keep compaction and
model context usage in tokens as port events and port policy, never as prompt text. An
implementation that cannot observe one reports `unavailable` with a reason, so
the KPI states coverage instead of a silent zero. The scripted fake emits both,
so tests cover the consumers.

## 7. A guard is not the boundary; the tree is

**Adopt.** cucumber-viz has a pre-write policy for sealed files,
`evaluateSealedWritePolicy`, and no production code calls it: the only
references are its definition and its export. Enforcement happens afterwards,
by classifying the diff. Its incident report shows how that went wrong: a
default source mode without an allowlist staged a whole tree and reverted a
merged fix. The current commit-scope module answers in its header: it computes
an allowlist and "Never uses `git add -A`."

Two smaller facts from the same area. Generic code names the file-editing tools
as `Edit`, `Write` and `NotebookEdit`, which are one tool's names, so the other
tool's changed-file count is always zero. The turn recorder keeps at most 200
tracked paths.

Evidence: `IS/core/runtime/sealed-files/sealed-write-policy.ts:27` with its
only other reference at `sealed-files/index.ts:26`;
`IS/core/runtime/commit-policy/commit-scope.ts:1-9`;
`AC/tool-activity-utils.ts:4`; `AC/turn-recorder.ts:27` and the incident
report, not read directly.

Consequence:

- The pre-execution guard on `edit` and `write` stays, since it gives the
  engineer useful feedback at the right moment. It is not the evidence that
  scope was respected.
- Every writer invocation takes a snapshot of the tree before it starts and
  after it settles. The difference, not the tool calls, is the record of what
  changed. A changed path outside the write scope is recorded with
  `observedBy: 'snapshot'` and returns to the local architect as an
  outside-assignment result. This is how the acceptance case "one unguarded
  shell mutation" becomes visible.
- The adapter, not generic harness code, says which of its tools mutate. The
  port's tool events carry `mutating: boolean`.
- A bounded list records that it was cut: `coverage-gap` gains
  `kind: 'observation-truncated'`.
- A test asserts that the guard is installed for every writer role by making a
  denied call through the real adapter. A guard that exists and is never
  called is the failure to prevent.

## 8. Path containment is worth reading before writing

**Consider.** cucumber-viz's sealed-path containment resolves real paths,
handles the parent of a file that does not exist yet, revalidates device and
inode before a rename and fails closed. Its deterministic revert found that an
untracked file needs both `git rm` and `unlink`.

Evidence: `IS/core/runtime/sealed-files/sealed-path-containment.ts` and
`IS/core/workflow/review/deterministic-revert.ts:103-127`, not read directly.

Consequence: read the containment module as a checklist when the write guard is
implemented, for the cases the brief lists: existing files, new files,
traversal and symlinks. Do not import it. Neither version handles a
case-insensitive filesystem; the MVP states the same limit.

## 9. A stop can arrive before the session exists

**Adopt.** cucumber-viz closes a race where cancellation arrives between the
request to start a runtime and its binding: a pending entry records
`cancelRequested`, and five guards at bind time cancel a runtime that has just
started.

Evidence: `AC/agent-chat-service.ts:477-480` and `:974-1009`, not read directly.

Consequence: `writer-acquired` and `invocation-started` are appended before
`startSession` is called. A stop or a supersession that arrives in between is
then applied to a known invocation, and the first thing a newly started session
does is check that it is still current.

## Confirms

Rejecting a superseded writer by a stable identity of the work, not of the
attempt, is sound in cucumber-viz and matches the proposal's
`disposition: 'superseded'`, which keeps the result for diagnosis and usage and
never applies it.
