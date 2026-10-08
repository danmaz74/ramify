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
the harness's server with the web client's build output and runs single
engineer sessions.

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
paths, the token usage and the records directory,
`plans/.harness/sessions/<session-id>/`, which git ignores. Nothing is
committed. With `--gate` it then runs the iteration checkpoint over the
module and prints its verdict; without it, the output says that nothing
verified the work. An interrupt stops the session; a second one exits at
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

The session's transcript is `transcript.jsonl` in its records directory, and
pi's own record is under `session/`. The Sessions page of `npm run serve` on
the copy lists it.
Reset the copy between tests with `git checkout -- . && git clean -fd`, or
prepare another.

## Fixture

`subs/harness/fixtures/collection-review/` is a copy of the toolkit's reference example
with two plans under `plans/`. It is test data and an independent project:
its own `tsconfig.json` makes Ramify's discovery treat it as an independent
scope, so its `module.ramify` files are not part of this project.

## License

ramify-agent is licensed under the GNU General Public License, version 3 only
([LICENSE](LICENSE)). It is private and not published.
