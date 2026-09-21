# Plan 5: Single engineer sessions

**Date:** 2026-09-21. **Status:** proposed.

This plan adds one command, `ramify-agent session`. It runs one engineer
session on one module of a project, from a prompt a person writes, with the
equipment an implementation run gives its engineers: the engineer prompt, the
module's API view, the write guard, the Ramify hook check, the shell, the
scoped test tool and the validated submission. It replaces the development
script `subs/harness/src/dev/quick-session.ts`, which rebuilt that equipment
by hand.

It serves two uses:

- **Quick pi tests.** Observing how a real model reacts to one harness text,
  tool or refusal takes one command and about a minute, instead of a full run
  of 15 to 30 minutes in which the engineer turn is under a minute.
- **One scoped change.** A person asks a Ramify-aware engineer for one change
  in one module, with the module boundary enforced, without planning a run.

## Runnable outcome

```text
ramify-agent session --project <root> --module <module-path>
                     (--prompt "<text>" | --prompt-file <file>)
                     [--agent pi [--model <provider/model[:level]>] | --agent fake --script <file>]
                     [--write <project-relative path>]... [--gate]
```

On a prepared project, with a pi login:

1. The command resolves `<module-path>` in the architect view and refuses an
   unknown module before any model call.
2. It takes the project lock, so it cannot run beside an implementation run.
3. It materializes the module's API views and starts one fresh engineer
   session. The goal is the given prompt. The write scope is the module's own
   directory plus each `--write` path.
4. It prints each tool call, each text the harness appends to a tool result,
   and each submission and its answer as they happen.
5. It ends with the submission, the violations still standing, the changed
   paths, the token usage and where the records are.
6. With `--gate`, it then runs the iteration checkpoint over the module and
   prints its verdict. It never commits. Without `--gate`, its output says
   that nothing verified the work.

Exit status: 0 when the session submitted and, with `--gate`, the gate passed;
1 when the session ended any other way or the gate did not pass; 2 when the
session could not start.

## Scope

**In scope:** the engineer role; the CLI command; its records; offline tests
with the scripted fake; removing the development script.

**Out of scope:**

- **Other roles.** A local architect needs a work item, a registry and an
  outline history that one command cannot supply honestly. A contract engineer
  needs a registered consumer. Either can follow once this command exists.
- **Acting on the submission.** `contract-needed` and `unsuitable` are recorded
  and printed. No contract iteration, placement request or architect turn
  follows.
- **Committing.** Changes stay in the working tree for the person to review.
- **Resuming a session.** Each command starts a fresh session.
- **The web UI and the protocol.** The command is local and writes files; it
  adds no HTTP endpoint and no page.

## Prerequisites

1. **The uncommitted Plan 3 follow-ups are committed first**, with their
   tests passing. These are the violation text in the hook check and the
   refusal of `completion-proposed` while a violation stands. They also
   include the Ramify section of the engineer prompt, the API view paths in
   the iteration message, the pi reasoning-level fix, and
   `quick-session.ts` with its `quick-pi` script. This plan starts from that
   commit.
2. Plan 3's type check, tests, web build and `npm run check:self` pass at that
   commit.
3. This plan is independent of Plan 4. It changes no record, event or metric
   that Plan 4 reads.

## Decisions

| # | Decision | Reason |
| --- | --- | --- |
| 1 | The command and the implementation run build the engineer's equipment with **one function** | The quick test must exercise the code runs use. The development script's copy already differs: its test tool is a plain `vitest run`, and it records no observations |
| 2 | Records go to `plans/.harness/sessions/<session-id>/`, never into a run | A session is not a job: no ledger, no run log, no events. The directory is already ignored by git, as Plan 3 iteration 4 set it up |
| 3 | The session holds the **project lock** for its whole life | Its writes and its hook checks would otherwise interleave with a running implementation run's writer |
| 4 | A session's records are plain files: `session.json`, `observations.jsonl`, `submission.json`, `outcome.json`, hook and shell logs, the pi transcript, and `gate/` with `--gate` | Nothing replays them, so the ledger's transactions buy nothing. The observation schema is the run's, so the same readers work |
| 5 | The prompt is the iteration's **goal**; approach and completion evidence read "not stated" | The engineer's message keeps its sections, so what the engineer sees differs from a run's message only where the person gave less |
| 6 | The gate is **opt-in** and **never commits** | The command serves experiments whose work is thrown away as well as real changes, and a commit is the person's decision |
| 7 | An accepted submission is answered with what happens next, not "Your work is complete" | In a session nothing follows an `unsuitable` or `contract-needed` report. Saying the work is complete misleads the model and the reader |
| 8 | The development script and `npm run quick-pi` are deleted when the command works | Two ways to run a quick test would drift apart |

## Iterations

### Iteration 1: One engineer equipment, shared

**Goal:** move the engineer's equipment out of `RunService` with no change in
behavior.

**Work:**

- Move `RunService.implementationTools` and what it closes over into a new
  harness file, `src/work/engineer-equipment.ts`. It builds the shell, the
  scoped test tool, the guard, the after-mutation hook and the open-findings
  accessor.
- Its inputs are explicit and carry no reference to a run: the project root, the Ramify CLI,
  the project commands, the input bounds, an index refresher, the guarded
  scope and test policy, an output-path function and an observation log.
- `RunService` calls it for engineers and contract engineers, supplying the
  run's paths and observation log.

**Exit evidence:** every existing engineer, contract, hook, iteration-gate,
breaking-work and recovery test passes unchanged. `check:self` reports no
findings, and the architect view shows no new dependency between modules.
`service.ts` shrinks by about the moved lines, which is recorded.

### Iteration 2: The session service

**Goal:** run one engineer session end to end from a module and a prompt,
driven by any `AgentPort`.

**Work:**

- New `src/sessions/single.ts` with `runSingleSession(options)`, which:
  1. acquires the lock;
  2. refreshes the architect view and resolves the module;
  3. derives the guarded scope from the module directory and the extra paths;
  4. materializes and reads the API views;
  5. writes `session.json`;
  6. renders the engineer prompt and an iteration message from the prompt text;
  7. builds the equipment of iteration 1;
  8. judges submissions with `SubmissionJudge` and `validateEngineer`, including
     open findings;
  9. waits for the outcome and settles the shell;
  10. writes `submission.json` and `outcome.json`, and releases the lock.
- With the gate option, it runs `runCheckpoint` for the `iteration` checkpoint,
  with the module's owned tests resolved from the current tree and the
  guarded-file hashes captured at start. The attempt goes under `gate/`.
- It reports progress through a callback, so the command prints what the
  service observes and the tests read the same stream.
- The acceptance text for an accepted submission names what follows in a
  session (decision 7). An implementation run keeps its own text.

**Tests, all on the scripted fake, with no pi and no network:**

| Case | Evidence |
| --- | --- |
| A completed change | The edit is in the tree, `outcome.json` records `submitted`, nothing is committed |
| A write outside the module | Refused by the guard, nothing written, the refusal is in the observations |
| A module violation | The edit's result carries the violation text; `completion-proposed` is refused while it stands; after the fix it is accepted |
| `unsuitable` and `contract-needed` | Recorded and answered; no further session starts |
| An unknown module | Refused before the agent starts, exit 2, lock released |
| A held project lock | Refused before the agent starts, the lock untouched |
| `--gate` on passing and failing work | The attempt is written under `gate/` with the verdict; no commit in either case |
| Records | Every file of decision 4 exists and validates against its schema; `git status` shows nothing under `plans/.harness/` |

### Iteration 3: The command

**Goal:** expose the session as `ramify-agent session`, and remove the
development script.

**Work:**

- Extend `src/cli.ts`: the `session` command with its options, usage text and
  usage errors.
- Extend `src/main.ts` so it starts the pi or scripted agent, runs the session
  and prints its progress stream.
- The harness exposes `runSingleSession` and its option and result types to
  its parent in `subs/harness/module.ramify`. The root receives them; nothing
  else does.
- Add `npm run session` as a shortcut.
- Delete `subs/harness/src/dev/quick-session.ts` and `npm run quick-pi`.
- Update the root `README.md` and the harness `README.md` with the command,
  and add a "Quick pi tests" section that shows a forced-violation example.

**Tests:** command-line parsing, covering valid forms, a missing prompt, `--model`
without `--agent pi` and an unknown option. One test runs the command in a
child process with `--agent fake --script`, and checks its output and exit code.

**Development check.** This is not a test. It is one quick real session on
`openai-codex/gpt-5.6-luna` against a prepared fixture copy. It repeats the
forced-violation assignment of 2026-09-21, and its output is recorded in the
results note. It takes about a minute.

## Completion gate

1. `ramify-agent session` runs a real engineer session on a prepared copy and
   prints the stream above. The recorded development check shows it.
2. Every test in iterations 2 and 3 passes. None of them calls a model.
3. An implementation run behaves exactly as before iteration 1. Its existing
   tests pass unchanged.
4. `npm run type-check`, `npm test`, `npm run build:web` and
   `npm run check:self` pass from `ramify-agent/`, and `check:self` reports no
   findings.
5. The development script and `npm run quick-pi` are gone. The quick-test
   memory note points to the command.

## Known interactions

- **Ramify's signature-companion rule.** Ramify will report an error when a
  symbol is exposed without the named types its signature mentions. When that
  ships, the hook check needs a sentence for the new finding code. The fixture
  `collection-review` must also be updated, because its root hides
  `ToolResult` and `ToolInputSchema` on purpose. Neither change belongs to
  this plan, but the forced-violation example in the README must use a symbol
  that stays unexposed under the new rule.
- **Architect prompts.** The module-architect skill is still embedded in the
  initial architect's and the global fork's prompts. This plan does not touch
  them.
