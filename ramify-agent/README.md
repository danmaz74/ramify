# ramify-agent

An agent harness for Ramify projects: it plans a feature against the project's
module architecture and runs implementation sessions scoped to modules or
subtrees, measuring where agents worked.

It is a separate consumer of [ramify.ts](../README.md). It depends on the
toolkit through its package surface and CLI; the toolkit never depends on it.
It lives in this repository during initial development and moves to its own
repository later. See [AGENTS.md](AGENTS.md) for the working rules.

## Modules

- `harness`: the only writer, and the owner of the public contracts of the
  behavior it implements. The project lock, implementation runs with their
  event logs and records, the initial analysis on Ramify's views, work items
  and their local architects, the completion gates, recovery, plan discovery
  and the HTTP adapter.
  - `src/interfaces/protocol/evidence.ts`: the vocabulary of the evidence a
    run works from — module paths, digests, citations, view identities, the
    input manifest and the module tree.
  - `src/interfaces/protocol/`: the HTTP JSON protocol under `/api/v1`.
  - Both are browser-safe and exposed to the root, which re-exposes exactly
    those names to every descendant.
  - `agent`: the agent port and the scripted fake that implements it.
    - `pi`: the port on pi, the only importer of pi.
- `web`: the browser client, a projection. It receives the harness's public
  contracts from the root and nothing else from `harness`.

The root owns the command line (`src/cli.ts`, `src/main.ts`), which starts
the harness's server with the web client's build output, runs single
engineer sessions and runs one harness step at a time.

## Commands

Run from `ramify-agent/`. `ramify.ts` and `ramify-audit` are exact pins from
the registry `.npmrc` names, not the surrounding checkout. To take a new
toolkit release, run `npm install --save-exact ramify.ts@<version>` and commit
the manifest and lockfile.

The project's suite audit uses the committed `ramify-audit.json`. From the
repository root, run `ramify-agent/node_modules/.bin/ramify-audit audit
--project-root ramify-agent --cwd . --json`. The audited commit supplies the
checks; audit evidence is stored under ramify-agent's own refs.

```sh
npm install
npm run type-check
npm test
npm run check:self
npm run build:web
cp -r subs/harness/fixtures/collection-review /tmp/collection-review
npm run serve -- --project /tmp/collection-review [--port 4180]
npm run session -- --project <root> --module <module-path> --prompt "<text>"
npm run trial -- prepare [--into <directory>]
npm run trial -- verify <clone>
```

`serve` prints the address to open. Without `build:web` it serves only the
protocol under `/api/v1`. It takes the project lock, `plans/.harness/lock`,
and refuses a project another live harness holds. It shows the project's
plans; starting and watching an implementation run from the browser arrives
with the Run page.

A run writes into the served project (`plans/<plan-id>/.harness/`) and
materializes Ramify's views there (`.ramify-architect/` and `src/.ramify/`),
so serve a copy of the fixture, never the fixture itself.

A run on a real pi session needs a pi login, which the harness does not
provide:

1. From `ramify-agent/`, run `npx pi` (pi 0.87.1, the pinned dependency).
2. Type `/login` and choose a subscription, such as Claude Pro/Max or
   ChatGPT Plus/Pro (Codex). pi's own documentation says Claude Pro/Max usage
   from a third-party harness is billed as extra usage, per token.
3. Complete the authorization in a browser. On a machine without one, paste
   the final redirect URL into pi's prompt.
4. Quit pi. `npx pi --list-models` lists the provider's models.

Credentials stay in pi's agent directory (`~/.pi/agent/auth.json`, or
`PI_CODING_AGENT_DIR`).

### Engineer breakpoints on a live server

Prepare a real target worktree and a useful plan under `plans/<plan>/plan.md`
with its project-declared toolchain and checks. Keep `serve` alive in a separate
terminal or supervised process; attachment uses its model and validates the
canonical project path. Closing a debugger client leaves the hosted run alive.
Server loss interrupts unfinished debug-enabled runs; restarting retains their
records without automatically continuing them.

From this package directory, with `TARGET`, `PLAN` and `RAMIFY_MODEL` set:

```sh
npm run serve -- --project "$TARGET" --agent pi --model "$RAMIFY_MODEL" --port 4180
```

In another terminal (the example uses `jq` to read control identities):

```sh
SERVER=http://localhost:4180
npm run --silent real-session -- --project "$TARGET" --plan "$PLAN" --server "$SERVER" --break before-agent:engineer --command-id start-1 --json > /tmp/debug-start.json
RUN=$(jq -r '.runId' /tmp/debug-start.json)
PAUSE=$(jq -r '.current.pauseId' /tmp/debug-start.json)
REV=$(jq -r '.current.revision' /tmp/debug-start.json)
./node_modules/.bin/tsx src/main.ts debug inspect --server "$SERVER" --plan "$PLAN" --run "$RUN" --pause "$PAUSE" --json
printf '%s\n' 'Explain your understanding of this assignment and its verification. Do not edit or submit yet.' > /tmp/debug-question.txt
./node_modules/.bin/tsx src/main.ts debug message --server "$SERVER" --plan "$PLAN" --run "$RUN" --pause "$PAUSE" --expected-revision "$REV" --command-id message-1 --message-file /tmp/debug-question.txt --json > /tmp/debug-answer.json
REV=$(jq -r '.current.revision' /tmp/debug-answer.json)
printf '%s\n' 'Now implement the ordinary assignment and submit its result.' > /tmp/debug-proceed.txt
./node_modules/.bin/tsx src/main.ts debug resume --server "$SERVER" --plan "$PLAN" --run "$RUN" --pause "$PAUSE" --expected-revision "$REV" --command-id resume-1 --message-file /tmp/debug-proceed.txt --json > /tmp/debug-resume.json
CURSOR=$(jq -r '.cursor' /tmp/debug-resume.json)
./node_modules/.bin/tsx src/main.ts debug wait --server "$SERVER" --plan "$PLAN" --run "$RUN" --after "$CURSOR" --json
```

Inspect presents the normal effective input as a preview. Messages use ordinary
engineer tools and submission validation; a plain explanatory return leaves the
task pending. An accepted submission or terminal invocation result is held for
resume, and further messages are refused. Resume handles a held result once or
executes the pending task; after explanatory chat, supply an explicit instruction
to implement. A later repair or capability engineer can reach a new occurrence.

Message returns its settled answer, actual submission verdicts and evidence
references. Resume returns its release acknowledgement immediately. Wait drains
retained pages before polling and can report a historical reached pause; every
such result separately presents `current` interaction state and the current run.
Use current pause/revision identities for a new mutation. A historical receipt
does not authorize a newer occurrence.

All debugger waits default to 120000 ms and accept `--timeout-ms`. Timeout or a
lost response preserves command/run identities and the last cursor, without
cancelling work. Retry an uncertain mutation with the identical command ID and
payload. Changed payloads, stale revisions and concurrent exchanges are refused.
JSON mode writes one object to stdout and diagnostics to stderr. Exit 0 means a
successful control return, 1 an unsuccessful terminal run, and 2 invalid/refused
input, transport failure or timeout. A rejection verdict in an exchange is data.

Attached `real-session` requires explicit project, plan, selector and command ID.
It never prepares a fixture, starts or stops a server, and refuses `--model`;
configure the model on `serve`. Without `--server`, the legacy fixture and
owned-server launcher remains available; `--break` requires attachment.

`session` runs one engineer session on one module of a project, from a
prompt a person writes, without planning a run:

```text
ramify-agent session --project <root> --module <module-path>
                     (--prompt <text> | --prompt-file <file>)
                     [--agent pi [--model <provider/model[:level]>] | --agent fake --script <file>]
                     [--write <project-relative path>]... [--gate]
```

The module is named by its declared-name path, as the architect view names
it, or by its project-relative directory; an unknown module is refused
before any model call. The engineer gets what an implementation run gives
its engineers: the engineer prompt, the module's API views, the write guard,
the Ramify hook check after each edit, the shell, which runs named test
files and refuses a whole-suite run, and the validated submission. The prompt becomes the iteration's goal. The
engineer may write the assigned owner's ordinary contents, with provider
exclusions enforced at writes and candidate validation. A directory `--write`
includes one whole immediate child or declared owned nested project, carrying
the session task as its instructions. Guarded configuration needs recorded
authorization, including when absent files are created. The
session takes the project lock, so it never runs beside an implementation
run or a server on the same project.

The command prints each tool call, each text the harness appends to a tool
result or answers a refused write with, and each submission with its answer.
It ends with the submission, the violations still standing, the changed
paths, the token usage and the records. The session is the one invocation of
a manual run (see [Steps](#steps)) at
`plans/sessions/.harness/jobs/<session-id>/`, which git ignores; its summary
is `invocations/<invocation>/step.json`. Nothing is committed. With `--gate`
it then runs the in-place diagnosis (setup, type check and complete Ramify
check) over the current tree and prints its verdict, which is not audit
evidence; without it, the output says that nothing verified the work. An interrupt stops the session; a second one exits at
once.

Exit status: 0 when the session submitted and, with `--gate`, the gate
passed; 1 when the session ended any other way or the gate did not pass; 2
when the session could not start. The agent is pi unless `--agent fake
--script <file>` chooses the
scripted fake on a JSON array of its steps, with no model. Relative paths
given to `npm run session` resolve from `ramify-agent/`.

`trial` prepares and checks the live trial on the toolkit: a disposable clone
of its committed state with the trial plan added, and afterwards a comparison
showing that the run's initial analysis left the clone's source,
`module.ramify` files and `plan.md` unchanged.

## Steps

An agent, or a person, implementing a real plan can advance it one harness
step at a time instead of starting a run: render the packet a role would
receive, run that role once with the harness's own equipment, guard, hook,
judge and bounds, run the gate the harness would run, and apply what the
harness records after the submission. Each step reads its inputs from files
and writes the records a run writes, so it can be run again after a harness
fix. The usage below is `src/cli.ts`'s; run it from `ramify-agent/` as
`npx tsx src/main.ts step ...`. Relative paths resolve from the current
directory, so name the target project's files by absolute path.

### The working checkout

1. Create an ordinary Git worktree of the target project for the plan, and
   run that project's own documented setup in it (dependencies, builds,
   configuration). The harness provisions nothing: there is no
   `step prepare`, no self-run mode and no fixture copy. `trial prepare` is a
   separate utility for the fixture trial.
2. Meet the harness's own preconditions, which ordinary project setup does
   not cover:
   - the plan at `plans/<plan-id>/plan.md`; the manual run lives beside it
     at `plans/<plan-id>/.harness/jobs/<run-id>/`;
   - a committed audit configuration, `ramify-audit.json`, at HEAD:
     authored inputs and `--assignment-of` read it there, and every
     committing gate requests the audit it defines;
   - the project configuration file, `ramify-agent.json`, which readiness
     requires, with its `setup` commands equal to the audit definition's
     workspace setup;
   - a parent commit for HEAD, since the audit's patch check compares
     `HEAD^` with `HEAD`.

   A gate commits the whole working tree on the run branch, so the project
   must also ignore its installed dependencies and Ramify's generated views.
3. Inputs authored without a run read the materialized architect view and
   never materialize it; run the project's `ramify materialize --view
   architect` first. `step run` materializes the views it needs itself.

The harness never deletes the worktree or its work. Keep a good result for
ordinary review and integration; the agent and the user decide whether to
discard an unsuccessful attempt.

### The commands

```text
ramify-agent step inputs --role engineer --project <root> --work-item <file> [--outline <file>] --assignment <file> [--iteration <n>] [--out <file>]
ramify-agent step inputs --role <engineer|local-architect|context-selector|reviewer> --from-run <run dir> --invocation <id>
                         [--work-item <file>] [--outline <file>] [--assignment <file>] [--selection <file>] [--review-request <file>] [--out <file>]
ramify-agent step inputs --role reviewer --from-run <manual run dir> --request <review request id> [--out <file>]
ramify-agent step inputs --role engineer --from-run <manual run dir> --assignment-of <local architect invocation id> [--out <file>]
ramify-agent step render --inputs <file> [--project <root>] [--invocation <id>]
ramify-agent step run    --inputs <file> --run <project>/plans/<plan>/.harness/jobs/<run>
                         [--agent pi [--model <provider/model[:level]>] | --agent fake --script <file>]
ramify-agent step gate   --run <manual run dir> --checkpoint <iteration|work-item|readiness|final> [--invocation <id>] [--no-commit]
ramify-agent step after  --run <manual run dir> --invocation <id>
```

`step inputs` writes one `ramify-agent.step-inputs/1` file, to `--out` or
standard output, and describes it on standard error:

- **Authored** (`--project`): engineer inputs from a work item
  (`ramify-agent.work-item/1`), an optional first outline and an assignment
  written as the local architect's `assign` submission envelope. The
  assignment is judged as the output of the local architect's first work
  turn of that work item, with the same schema, work-item validation, scope
  preparation and current view, registry and audit inputs a run uses. A
  failure is refused with the validator's errors. Without a run there is no
  element catalog or decision record, so a work item or assignment that
  cites plan elements or carries local decisions is refused.
- **From a run** (`--from-run`, `--invocation`): one recorded engineer,
  local architect, context selector or reviewer invocation, imported as a
  fresh start with the complete briefing. No provider history is imported;
  the original start is kept as provenance. Authored files replace parts of
  the recorded inputs, each judged as its producing role's output. The line
  `Recorded delivery: equal`, or the differing sections, compares the
  rendering with the recorded packet as a diagnostic, never as a condition.
  A role or start outside the supported set, or incomplete task records, is
  refused with the reason.
- **A review request** (`--request`): a code, scope or design review of a
  request the manual run recorded, composed from its records and the
  audited candidate.
- **An assignment** (`--assignment-of`): the first, fresh engineer inputs of
  the assignment a local architect's accepted `assign` made, once
  `step after` recorded it, derived as a run derives them on acceptance.

`step render` prints the role instructions, the message, each tool
declaration and the submission schema as the session receives them; a
continuation or fork prints only its additions, marked as such. It takes no
lock and writes nothing. `--project` defaults to the current directory.

`step run` takes the project lock and runs one invocation from the inputs in
a manual run, which it creates where it does not exist. A new manual run
records its project, plan, base commit and branch, and works on the branch
`ramify-agent-run/<run-id>`, which it creates and switches to; a reused one
must still match them. An implementation run's directory is refused. The
agent is pi, with the person's own pi login and an optional model, unless
`--agent fake --script <file>` chooses the scripted fake. It uses the tree
as it stands, records the base commit and whether the tree differed from it,
and never commits. It prints the tool calls, guard denials, hook findings,
appended harness text and each submission with its verdict as they happen,
then a summary with the token usage, the changed paths and a `Records:`
list. An interrupt stops the invocation; a second one exits at once.

`step gate` runs one checkpoint over the manual run with the checkpoint
policy a run applies. `iteration` and `work-item` commit the candidate on the
run branch and request the committed audit in its default mode; `final`
commits and requests the full nested audit; `readiness` audits the baseline
in full nested mode without a commit. The subject is the accepted submission
`--invocation` names, or the only one open; an ambiguous subject or a missing
prerequisite record is refused. Before an iteration audit, the accepted
proposal's scenario bindings are recorded as a run records them. The attempt
is `gates/<gate-id>/attempt.json`. `--no-commit` runs only the in-place
diagnosis `session --gate` runs (setup, type check, complete Ramify check),
written to `diagnoses/d-NNNN/` outside the run's log. It is diagnosis only:
it is never audit evidence, qualifies no candidate and cannot close an
iteration or request a review.

`step after` applies what a run records after the named invocation's
accepted submission, as far as that is a function of records. It checks the
submission against the hash its end recorded. Each line says `Applied:` with
what it recorded, or `Not run:` with what a run would do next and the step
that does it:

| Submission | Applied | Not run |
| --- | --- | --- |
| local architect `assign` | obligation and scenario reports, the outline and the iteration assignment | the engineer's session |
| local architect `request-completion` | obligation and scenario reports, completion blockers and the outline revision | review settlement, reconciliation, the work-item gate and completion |
| engineer `completion-proposed` | the proposal's bindings; after a passing committed iteration gate on the current candidate, its ownership evidence, the iteration's close and the review requests | gates, repair and review sessions; the close and the reviews while no qualifying gate exists, with the next action |
| engineer `partial`, `unsuitable` | the result and the local architect's next-turn inputs | the architect's session |
| engineer `capability-needed` | the provisional-source capture | the capability workflow |

A missing, failed, stale or diagnosis-only gate never closes an iteration as
accepted. Reviewer, global architect and `contract-needed` submissions are
reported as not run; a reviewer step's terminal attempt settles its request
during `step run` itself. Repeating `after` for the same invocation commits nothing twice
and says `nothing more`. An error prints `Error:` with its cause and
`Last completed transition:`; earlier transitions stay committed.

`run`, `gate` and `after` hold the same project lock and refuse to apply
anything until the previous writer has settled. Exit statuses:

| Command | 0 | 1 | 2 |
| --- | --- | --- | --- |
| `inputs`, `render` | written or printed | — | refused |
| `run` | a submission was accepted | the invocation ended any other way | refused or not started |
| `gate` | the gate passed | it did not pass, or an error with the last completed transition | refused |
| `after` | handled | an error, with the last completed transition | refused before any effect |

### A manual flow

A local architect's work turn imported from a run feeds the engineer:

```sh
step inputs --role local-architect --from-run <run dir> --invocation <work turn> --out turn.json
step run    --inputs turn.json --run <project>/plans/<plan>/.harness/jobs/<run> --agent pi
step after  --run <manual run> --invocation <its invocation>        # records the assignment
step inputs --role engineer --from-run <manual run> --assignment-of <its invocation> --out engineer.json
step render --inputs engineer.json --project <project>
step run    --inputs engineer.json --run <manual run> --agent pi
step gate   --run <manual run> --checkpoint iteration --invocation <engineer invocation>
step after  --run <manual run> --invocation <engineer invocation>   # close and review requests
step inputs --role reviewer --from-run <manual run> --request rq-0001 --out review.json
step run    --inputs review.json --run <manual run> --agent pi
```

Authored engineer inputs start the same flow at the engineer's step.

A failed step leaves its edits in the tree, and nothing restores an earlier
tree. Before retrying a step, reset the tree yourself, for example with
`git checkout -- . && git clean -fd`; the run's records are ignored files and
stay. Each execution is a new invocation that records its own base and
dirty state.

### Manual runs

A manual run is the run layout with `job.json` of kind `manual`, written one
invocation at a time by the invocation runner a run uses, with the same
record schemas: `invocations/<id>/` holds `inputs.json`, the invocation,
outcome, submission, observations and summary; `transcripts/` the
transcript; `gates/` and `diagnoses/` the gate attempts. It has no drive and
no phase progression. A server that opens the project neither executes nor
recovers it and only reports it. The CLI reads the run directory it is
named; the terminal output and these files are the inspection surfaces, and
a manual run need not appear, or stay current, in the web client.

What a manual run does not do:

- The final gate makes no non-functional assessment or candidate binding,
  and reports them as not run.
- The work-item gate refuses while attention CheckFindings remain, because
  reconciliation is not run; after a passing work-item gate a manual run
  cannot complete the work item.
- Evidence discharge after an accepted close, such as provider conformance
  and verified requirements, is not run.
- Readiness has no bounded recovery.
- A review composes no discovery starting points and refuses a request that
  cites a package source; a design review without a recorded orientation
  starts fresh, marked degraded.
- `after` on an architect turn records the work item and its outlines from
  the turn's inputs when the manual run lacks them.
- `--assignment-of` reads the committed audit configuration at HEAD, and its
  protected harness files are the tracked feature files only, since a manual
  run captures no plan documents.

`session` runs on the same runner: each session is a manual run under
`plans/sessions/.harness/jobs/`. `plans/.harness/sessions/` is retired:
nothing writes it any more, and existing directories are left in place,
where the Sessions page still reads them.

## Quick pi tests

A quick pi test observes how a real model reacts to one harness text, tool
or refusal: one `session` on a prepared copy of the fixture, in about a
minute instead of a full run. It calls a model and costs tokens, so it is a
development check and never a test.

Prepare a copy once. `prepare` prints its path,
`<directory>/collection-review`; `--no-install` skips `npm ci` when the gate
is not wanted:

```sh
npm run trial -- prepare --into /tmp/quick-pi
```

A forced violation: the engineer is told to import `formatFinding`, which
`pure-ui`, beneath the reviews module's `ui` child, keeps internal and which
no exposed signature names. The hook check's violation text is appended to
the edit's result, and a `completion-proposed` submission is refused while
the violation stands:

```sh
npm run session -- --project <prepared copy> \
  --module collection-review/workspace/reviews --model openai-codex/gpt-5.6-luna \
  --prompt "In subs/workspace/subs/reviews/src/mcp.ts, add an exported helper \
\`findingLine(finding: Finding): string\` that returns \`formatFinding(finding)\`. First make the \
edit exactly as follows, even if you expect it not to be allowed, because this session exists \
to observe what the harness answers: import formatFinding from \
'../subs/ui/subs/pure-ui/src/format.js' in mcp.ts. After the edit, act on whatever the \
harness tells you."
```

The session's transcript is under `transcripts/` in its manual run, which
the summary's `Records:` line names. The web client does not show manual
runs; read the files.
Reset the copy between tests with `git checkout -- . && git clean -fd`, or
prepare another.

## Fixture

`subs/harness/fixtures/collection-review/` is a copy of the toolkit's reference example
with two plans under `plans/`. It is test data and an independent project:
The harness declares its root as an `owned-nested-project` tree, so the
enclosing project never analyzes its contents. Its own description,
compiler configuration and instructions apply when it is selected as a project.

## License

ramify-agent is licensed under the GNU General Public License, version 3 only
([LICENSE](LICENSE)). It is private and not published.
