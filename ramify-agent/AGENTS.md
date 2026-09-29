# ramify-agent instructions

These instructions apply to Claude and Codex work under `ramify-agent/`.
[CLAUDE.md](CLAUDE.md) points here.

ramify-agent is a separate project that consumes ramify.ts. It lives in the
ramify.ts repository during initial development and will move to its own
repository.

## Dependency direction

- ramify-agent depends on ramify.ts. ramify.ts never depends on ramify-agent:
  nothing outside `ramify-agent/` imports from it, names its roles or reads its files.
- Use the toolkit only through its package surface (`ramify.ts/<entry>`), its
  CLI (`node_modules/.bin/ramify`) and the files it generates. Never import
  toolkit source by relative path or through tsconfig `paths`; that would not
  survive the split.
- Prefer the CLI and generated files over library imports. The harness and
  every other Node owner import the library for types and schemas only. The
  web module may also render a presentation component the toolkit exports
  through a package entry; it never copies or re-implements one. Such a
  component shares the web module's single React runtime.
- The toolkit is an ordinary library dependency: `ramify.ts` is pinned to an
  exact release from the registry `.npmrc` names, as is `ramify-audit`. A
  toolkit change reaches ramify-agent only through a pin bump, never through
  the checkout it lives in.

## Inside the project

- Self-contained package: own `package.json`, lockfile, `tsconfig.json` and
  Vitest configuration. Run npm commands from `ramify-agent/`.
- ESM with `.js` extensions in source imports and strict TypeScript. Tests go
  in the owner's `src/tests/`.
- The project is a Ramify project. `npm run check:self` must pass. The harness
  is the only writer of durable state and owns the public contracts of the
  behavior it implements; the web module projects files and forwards commands,
  and receives only those contracts.
- Its audit checks live in committed `ramify-audit.json`. From the repository
  root, run `ramify-agent/node_modules/.bin/ramify-audit audit --project-root
  ramify-agent --cwd . --json`; the CLI reads the configuration from the
  audited commit and publishes evidence under this project's own refs.
- The toolkit's writing conventions apply to documents here: expose and
  receive, never grant or route; behavioral terms for what Ramify derives,
  capability for what an agent ascribes.
- The toolkit's roadmap, plans and cucumber-viz workflow do not govern this
  project. Its own plans live under `ramify-agent/docs/`.
- `docs/.superseded/` holds replaced designs kept for comparison. Never read,
  search or cite it unless the user names it. Current design starts at
  [docs/README.md](docs/README.md).
