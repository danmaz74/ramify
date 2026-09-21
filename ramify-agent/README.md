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
the harness's server with the web client's build output.

## Commands

Run from `ramify-agent/`. Build the toolkit first (`npm run build` in the repository
root) so that `ramify.ts` resolves to a current `dist/`.

```sh
npm install
npm run type-check
npm test
npm run check:self
npm run build:web
cp -r fixtures/collection-review /tmp/collection-review
npm run serve -- --project /tmp/collection-review [--port 4180]
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

1. From `ramify-agent/`, run `npx pi` (pi 0.85.1, the pinned dependency).
2. Type `/login` and choose a subscription, such as Claude Pro/Max or
   ChatGPT Plus/Pro (Codex). pi's own documentation says Claude Pro/Max usage
   from a third-party harness is billed as extra usage, per token.
3. Complete the authorization in a browser. On a machine without one, paste
   the final redirect URL into pi's prompt.
4. Quit pi. `npx pi --list-models` lists the provider's models.

Credentials stay in pi's agent directory (`~/.pi/agent/auth.json`, or
`PI_CODING_AGENT_DIR`).

`trial` prepares and checks the live trial on the toolkit: a disposable clone
of its committed state with the trial plan added, and afterwards a comparison
showing that the run's initial analysis left the clone's source,
`module.ramify` files and `plan.md` unchanged.

## Fixture

`fixtures/collection-review/` is a copy of the toolkit's reference example
with two plans under `plans/`. It is test data and an independent project:
its own `tsconfig.json` makes Ramify's discovery treat it as an independent
scope, so its `module.ramify` files are not part of this project.
