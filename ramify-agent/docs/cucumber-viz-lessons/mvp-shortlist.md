# cucumber-viz lessons: the MVP shortlist

Part of [Lessons from cucumber-viz](README.md). The four subject documents
record everything the search found. This one keeps only what belongs in the
Plan 3 MVP, by four tests:

1. It concerns a data structure.
2. It is code that can be lifted and reused.
3. It is a critical error not to repeat.
4. It improves the plan without making it more complex.

Everything else is [left for later](#left-for-later). "The proposal" is the
[core records proposal](../plans/03-autonomous-implementation-loop/core-records.proposal.md);
sections 1 and 4 have been applied to it, the guards of section 3 are its
required tests, and section 2 is recorded there and in the
[authoring brief](../plans/03-autonomous-implementation-loop/authoring-brief.md)
as an input. No code has been copied yet: the brief authorizes planning only.

## 0. The fundamental lesson

From cucumber-viz's author, and the first rule to keep: **every time an agent
communicates with the harness it uses JSON, and the harness validates it
completely.** When validation fails, the harness tells the agent which errors
there were and asks it to retry. Nothing an agent says has an effect before it
passes, and free text is never parsed for meaning.

cucumber-viz shows both sides. Where it validates structured output, a
malformed result is corrected in the same session under a counter. Where it
did not, it recovered results from text with `/Status:\s*Complete/i`, scanned
code fences from the last to the first to find JSON, and needed a reporting
status of `agent-unreported` for agents that said nothing usable.

In ramify-agent this is rule 10 of the proposal. It covers every submission
union and every harness tool input, validates against committed state and the
view as well as the schema, bounds the retries, records each rejection and
ends an exhausted invocation as `invalid-submission`.

## 1. Data structures

Each change is a field or a value, not a new record or a new state machine.

| Structure | Change | Why | Detail |
| --- | --- | --- | --- |
| `GateAttempt.commands[]` | Add `runnerError: { kind, message } \| null`, set only by the code that spawns the command. The attempt's `cause` derives from it. | cucumber-viz never classifies a failure from output text; a lint failure that mentions "crash" is an ordinary failure. | [Checks 1](checks-and-gates.md#1-the-producer-names-an-infrastructure-failure) |
| `GateAttempt.cause` | Add `timeout`. | A timeout that looked like a failing test sent cucumber-viz's diagnosis the wrong way. | same |
| `GateAttempt.commands[]` | `not-verified` carries `reason: 'timeout' \| 'runner-error' \| 'command-missing' \| 'empty-selection' \| 'interrupted'`. | A skipped check once reported a pass, and an empty selection aggregated to a pass. | [Checks 2](checks-and-gates.md#2-a-check-that-did-not-run-says-why) |
| `GateAttempt.commands[]` | Replace `log` and `diagnostics` with `output: { path, bytes, truncated, tail }`; the tail has a fixed bound. | The complete output stays in a file; only a bounded tail reaches a record or an agent. | [Checks 4](checks-and-gates.md#4-full-output-in-a-file-a-bounded-tail-in-the-record) |
| `GateAttempt.guardedChanges[]` | `{ path, before, after, authorizedBy }`, with `after: null` for a deletion. | Deleting a guarded file must not pass as an absent file. | [Checks 7](checks-and-gates.md#7-a-guarded-change-records-both-hashes-and-deletion-is-its-own-case) |
| `TestSelection` | Add `resolved: string[]`, the test files or suites the policy selected. | A reader sees that an included child subtree really contributed tests, and an empty list is visible. | [Checks 2](checks-and-gates.md#2-a-check-that-did-not-run-says-why) |
| `CheckCommand` | Add `env`. | The harness builds a clean environment instead of passing on its own. | [Checks 5](checks-and-gates.md#5-kill-the-process-group) |
| `PlacementDecision.outcome` | Add `extract` and `external`. | A decision cannot confirm a `create-by-extraction` hypothesis it cannot express, and a need that a package satisfies has no owner module. | [Planning 3](planning-and-contracts.md#3-placement-vocabulary-has-two-holes-and-an-owner-is-checked) |
| `WorkItemOutline` | Add `decomposition: 'single-iteration' \| 'staged'` with a rationale. | Not decomposing becomes a recorded choice that the one-iteration acceptance case can assert. | [Planning 6](planning-and-contracts.md#6-not-decomposing-is-a-recorded-choice) |
| `InvocationOutcome` | A `failed` end carries `interruption: 'idle-timeout' \| 'absolute-timeout' \| 'provider-error' \| 'session-lost' \| 'adapter-fault'`. | The cause selects the recovery, and an infrastructure end with no mutation spends no repair budget. | [Sessions 2](sessions-and-writers.md#2-how-an-invocation-ended-is-a-closed-set-and-some-ends-cost-nothing) |
| `Invocation.session` | Record the mode `requested` and the mode that was `actual`, with a reason when they differ. | A fork that silently became a fresh session would corrupt the comparison of fork cost. | [Sessions 4](sessions-and-writers.md#4-the-session-key-belongs-to-the-harness-and-a-degraded-mode-is-recorded) |
| `RunPolicy.limits` | Add `invocationIdleMs` and `invocationAbsoluteMs`. | The proposal bounded everything except one invocation that neither ends nor fails. | [Sessions 3](sessions-and-writers.md#3-an-invocation-needs-liveness-bounds) |
| Every tool and submission schema | No field for an ID the harness already knows. | cucumber-viz's agents forget the attempt ID they must pass back and are rejected as stale. | [State 3](state-and-recovery.md#3-the-harness-holds-the-fencing-token) |
| Every union | Every value has a producer and a test, or it is removed. | cucumber-viz declares a consumability status that nothing produces. | [Planning 3](planning-and-contracts.md#3-placement-vocabulary-has-two-holes-and-an-owner-is-checked) |

Two confirmations cost nothing and are worth stating in the plan: status lives
in the log and never in a snapshot, and a revision is a new file. cucumber-viz
suffered from the opposite of each.

## 2. Code to lift

cucumber-viz is `AGPL-3.0`, ramify-agent will be `GPL-3.0` and the Ramify
toolkit will be `MIT`. All three have one author, who licenses the parts copied
into ramify-agent under ramify-agent's license; someone else could not move
AGPL code into a GPL project this way. Each copy carries a comment naming its
source file and version. Nothing from cucumber-viz goes into the toolkit: `MIT`
would need a separate decision, and the toolkit has no use for this code.

| Code | Size | Dependencies | Verdict |
| --- | --- | --- | --- |
| `scripts/run-command-with-cleanup.sh` | 54 lines | bash, `setsid` | **Lift as it is.** Runs a command in its own process group and sends TERM then KILL to the group on exit, on a signal and on a timeout. It is the fix for test workers that survive their runner. |
| `src/core/shared/services/test-process/test-process.ts`, `execAndCollect` | about 85 of 207 lines | Node only | **Lift and adjust.** Command, arguments, working directory, a complete environment, an abort signal, a timeout, an output cap and the wrapper above; it never throws, and a spawn failure has a string `code`, which is the `runnerError` signal. Adjust: tell a timeout from a failure using the `killed` and `signal` fields of Node's error, and write the output to a file. |
| `cleanEnv` in `check-runner.ts:93-100` | 5 lines | none | **Lift.** Removes `NODE_OPTIONS`, so the harness's own loader flags do not reach a target project's commands. |
| `resolveContainedPath` in `sealed-path-containment.ts:47-71` | 25 lines | none once its error type is replaced | **Lift the logic.** Lexical containment: rejects an absolute candidate, the root itself and traversal. It does not resolve symlinks. |
| The remainder of `sealed-path-containment.ts` | 420 lines | sealed-write contracts | **Read, do not lift.** It captures and revalidates device and inode around a rename. The MVP guard needs less: `realpath` of the target, or of the existing parent of a new file, then the lexical check. |
| The output tail in `check-result-artifact-store.ts` | a constant and a slice | its artifact store | **Rewrite.** Too small and too entangled to copy. |

Not worth lifting: the durable run store, which is weaker than Plan 1's log;
the state machines; the finding store; and the agent-chat adapters, which drive
command-line tools as child processes where pi runs in the harness process.

## 3. Critical errors not to repeat

Each of these cost cucumber-viz real work, and each has a cheap guard.

| Error | What happened | Guard in ramify-agent |
| --- | --- | --- |
| Work marked complete before its last write | An attempt was marked completed, then publication was requested; a retry made the request stale and the workflow wedged with no error. | The event that closes work is appended after every write of that work, and nothing is awaited from an agent afterwards. |
| An idempotent repeat that only detects the duplicate | A restarted run waited forever on a transition the first attempt had not finished. | A repeat writes the same bytes and appends the commit event when it is absent. |
| Strict validation that hides a run | A state the machine could write and the schema did not list made a whole workflow vanish on restart. | A reader returns valid, unsupported version or invalid; the last two are failures with evidence, never an absent record. A test writes every union value and reads it back. |
| A projection that writes | A list query inferred a merge from git and marked a workflow completed half a second after creation. | Projections are pure functions of logs and records. |
| New work that rewinds | Appending fix iterations reset an index to zero and re-ran every completed iteration, about five hours. | No stored cursor; a test that adding work leaves completed work completed. |
| Evidence bound to a commit | A stale worktree let an audit pass on a commit that reverted 160 files. | Superseded for the MVP by Dan's decision of 2026-09-20: a gate runs the checks and the harness commits on a pass, with nothing compared, so no change blocks anything. The commit audit becomes a standalone tool that ramify-agent integrates later. |
| A skipped check that passes | See section 1. | `not-verified` with a reason; an empty required selection never passes. |
| Cancellation taken for settlement | Adapters report cancelled, then signal only the direct child; test workers reparent to PID 1 and keep running. | Process groups, killed and confirmed by the harness, and a stable tree before a writer or a gate starts. |
| A guard nothing calls | The pre-write policy for sealed files is defined and exported, and no production code calls it. | A test makes a denied call through the real adapter for every writer role. |
| Observations an adapter drops | One adapter parses token usage and never delivers it; the other reads the result line only for the session ID. | Token cost, model context usage in tokens and compaction are port events; an implementation that lacks one reports `unavailable` with a reason, and the scripted fake emits all of them. |
| Compaction as prompt text | `/compact` was sent as a prompt and then disabled because neither tool treated it as a command. | Compaction is port policy, never text. |

## 4. Plan improvements that add no complexity

Several of these remove something.

- **Derive the test selection; do not accept it.** The policy computes the
  selection from the assignment's kind and scope. The architect's submission
  loses a field, and narrowing it becomes impossible instead of detected.
- **Append `invocation-started` and `writer-acquired` before calling
  `startSession`.** A stop that arrives in between then applies to a known
  invocation. This is an ordering, not a mechanism.
- **Check every gate command and selection before running the first.** A gate
  that cannot run what its checkpoint requires records `not-verified` and runs
  nothing.
- **Validate an owner against the view.** One lookup during submission
  validation; cucumber-viz accepted a module that did not exist.
- **Read what changed from git.** When a writer settles, `git status` against
  the last accepted commit gives the changed paths, which shows an unguarded
  write with no new machinery.
- **Make the engineer's shell a harness tool.** Decided 2026-09-20: engineers
  have a shell. pi's own `bash` stays withheld and the harness offers `shell`,
  run through the lifted executor, so every command has a process group the
  harness can settle, a clean environment, a timeout and a recorded command.
  Its writes are unguarded and are seen afterwards in `git status`.
- **On verification, require that the fake is gone.** `ConsumerRequirement`
  already lists the fake's injection points; the gate checks that none still
  references it. cucumber-viz's recorded failure is a fake left in place after
  the imports were rewritten.

## Left for later

Recorded in the subject documents and not proposed for the MVP:

- A record for deferred, out-of-scope discoveries and its projection.
- Per-requirement acceptance progress.
- Mechanical validation of an assignment beyond the owner and scope checks.
- Evidence and the violated assumption on an `unsuitable` outcome.
- Failed-test identities read from the runner's report.
- Two focused reruns for a suspected flaky test.
- A cached projection that records the last sequence it applied.
- A follow-up prompt for a session that ended without a submission.
- Device and inode revalidation in the write guard.
