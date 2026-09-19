# ramify-agent

An agent harness for Ramify projects: it plans a feature against the project's
module architecture and runs implementation sessions scoped to modules or
subtrees, measuring where agents worked.

It is a separate consumer of [ramify.ts](../README.md). It depends on the
toolkit through its package surface and CLI; the toolkit never depends on it.
It lives in this repository during initial development and moves to its own
repository later. See [AGENTS.md](AGENTS.md) for the working rules.

## Modules

- `contracts`: the architectural plan artifact and event-log formats.
- `harness`: the only writer. CLI, agent sessions, run store.
- `web`: a projection. It reads the harness's files and forwards commands;
  it receives `contracts` and nothing from `harness`.

## Commands

Run from `ramify-agent/`. Build the toolkit first (`npm run build` in the repository
root) so that `ramify.ts` resolves to a current `dist/`.

```sh
npm install
npm run type-check
npm test
npm run check:self
```
