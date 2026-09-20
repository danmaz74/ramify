# Iteration 1 results: skeleton and plan browsing

**Date:** 2026-09-19. **Status:** done.

## Delivered

### Modules and declarations

| Module | Declaration | Change |
| --- | --- | --- |
| root `ramify-agent` | `expose-sub * from contracts to descendants` | Replaces the two placeholder constants. The root now owns the command line: `src/cli.ts` parses it and `src/main.ts` starts the harness with the web build output. |
| `contracts` | `expose-sub * from protocol to parent` | Owns no source now; it relays its children. |
| `contracts/protocol` (new) | `module protocol tagged [browser]`; `expose-src * from "interfaces/<file>.ts" tagged [browser] to parent` for `queries`, `errors`, `jobs` and `paths` | Zod schemas and inferred types. |
| `harness` | `expose-src startServer, ProjectRootError from "http/server.ts" to parent` | Replaces `harnessFormats`. |
| `web` | `module web tagged [ui, browser]`, no exposures | Replaces `projectedFormats`. |

The placeholder `formatsAgree` and its test are gone. Every module has a
README whose first paragraph states its purpose.

The `browser` tags make the rule enforced: `web` may value-import only
`browser`-tagged symbols, so any `contracts` export that loses its browser
promise fails `check:self`.

### `contracts/protocol`

- `interfaces/queries.ts`: the project, plan list and plan responses.
  - A plan entry is `readable` (with its title, path and mapping state) or
    `unreadable` (with a message).
  - `mappingStateSchema` is a discriminated union with one member,
    `not-mapped`. Iteration 2 adds the job states.
  - `planIdSchema` accepts one non-hidden path segment.
- `interfaces/errors.ts`: the error body `{error: {code, message, currentVersion?}}`.
  - The codes are `invalid-request`, `not-found`, `unreadable`, `conflict`,
    `stale-version` and `internal`.
  - `errorHttpStatus` maps each code to its HTTP status.
- `interfaces/jobs.ts`: the envelopes for command, receipt, job snapshot,
  event and event page.
  - A command envelope carries `commandId`, `expectedVersion`, `type` and
    `payload`.
  - A job's version is the sequence number of its last event.
  - A job's `state` is one of `running`, `completed`, `failed`, `stopped` or
    `interrupted`.
  - Command types, event types and their data are left open (`type: string`,
    `payload`/`data: unknown`) for iteration 2.
- `interfaces/paths.ts`: `apiPrefix` and `protocolPaths`.

All object schemas are strict.

### `harness`

- `store/atomic.ts`: `writeFileAtomic` writes a temporary file in the same
  directory, syncs it, and renames it over the target. No temporary file is
  left behind on failure.
- `store/jsonl.ts`:
  - `readJsonLines` discards a trailing line that lacks its newline, reports
    it, and returns `completeBytes`. A corrupt complete line throws
    `CorruptJsonLinesError`.
  - `discardPartialLine` truncates the file to its complete lines.
  - `appendJsonLine` appends one line and calls `datasync` on it.
- `plans/`: `discoverPlans` and `readPlan`.
  - Each entry's title is the first ATX heading outside code fences, or else
    the plan's ID. Entries are ordered by ID.
  - Hidden directories, loose files, symbolic links and directories without
    `plan.md` are skipped. A missing `plans/` directory yields an empty list.
  - A `plan.md` that is a directory, lacks read permission or is not valid
    UTF-8 becomes an `unreadable` entry.
- `http/`:
  - `createApp` is an Express 5 app. Every response passes its protocol
    schema before it is sent; a response that fails is an `internal` error.
  - An unknown path under `/api/v1` is a protocol `not-found`.
  - It serves the built client and falls back to `index.html` for other
    pages. Without a build, `/` answers 404 with a hint.
  - `startServer` binds to `127.0.0.1` by default. It refuses a project root
    that is not a directory or has no `module.ramify`.
- Entry: `npm run serve -- --project <root> [--port <n>]` (default port 4180)
  runs `tsx src/main.ts serve`. A usage or project-root error exits with
  code 2. SIGINT and SIGTERM close the server.

### `web`

- React 19 with Vite 8. Pages are addressed by URL fragment: `#/`,
  `#/plans/<id>` and `#/plans/<id>/map`. Fragment routing means the server
  needs no route table beyond the index fallback.
- **Plans page:** each plan's title, path and latest mapping state
  ("Not mapped"), and a Refresh button.
  - Unreadable entries are shown as errors, without a link.
  - The empty state names `plans/<plan-id>/plan.md` and the project root.
- **Plan page:** a Plan tab and a Map tab. The Plan tab renders the Markdown
  read-only; the Map tab shows an empty state.
  - `markdown.tsx` uses react-markdown with a small remark plugin. Block HTML
    becomes a code block and inline HTML becomes plain text, so the reader
    sees embedded HTML but it never becomes markup.
  - react-markdown's URL filter strips `javascript:` links.
- **Protocol client** (`client.ts`): it imports only `contracts`, and every
  answer is validated against the protocol schemas.
  - Failures are `ClientError`s of kind `protocol` (with the error code),
    `connection` or `invalid-response`.
  - The connection state (`connecting`, `connected` or `disconnected`) is
    tracked separately from content. A protocol error still counts as
    connected.
  - A 5-second probe keeps the state current while no page is asking.
- **Compiler settings:** `subs/web/tsconfig.json` adds the DOM library and no
  Node types. The root `tsconfig.json` excludes `subs/web/src/**` from its
  type check and adds `jsx: react-jsx`. Ramify reads only the root file and
  still checks every owned web file.
  - `subs/web/vite.config.ts` and `index.html` sit at the module root, outside
    `src/` and outside the compiler selection, so they produce no warnings.
- **Scripts:**
  - `build:web` writes to `dist/web`, which is gitignored. It forces
    `NODE_ENV=production`, because this shell exports
    `NODE_ENV=development`, which produced React's development build
    (635 kB instead of 402 kB).
  - `dev:web` proxies `/api` to port 4180.
  - `type-check` runs both compiler configurations.

### Tests, dependencies and fixture

- **Vitest** has two projects: `node`, with 33 tests in 5 files, and `web`,
  with 13 tests in 4 files, running in jsdom with `@vitejs/plugin-react`.
- **Dependencies**, all exact:
  - Runtime: express 5.2.1, zod 4.6.5 (the toolkit's version), react and
    react-dom 19.2.8, and react-markdown 10.1.0.
  - Development: @types/express 5.0.6, @types/react 19.2.18,
    @types/react-dom 19.2.7, @vitejs/plugin-react 6.1.1, jsdom 30.0.1,
    @testing-library/react 16.3.3 and @testing-library/dom 10.4.2.
  - The earlier caret ranges are now pinned to their installed versions:
    @types/node 26.6.2, tsx 4.23.13, vite 8.3.0 and vitest 4.1.11.
  - `.npmrc` is unchanged.
- **Fixture:** `fixtures/collection-review/` is an exact copy of the example's
  96 tracked files, with no `node_modules`, `dist`, `.reference-work` or
  `.ramify*` views. It adds two plans:
  - `plans/review-notes/plan.md`, "Reviewer notes on a review run".
  - `plans/revision-diff/plan.md`, "Compare two revisions of a record".

## How the fixture stays out of ramify-agent's check

The mechanism is in the toolkit's discovery
(`subs/analysis/subs/project/src/inventory.ts`). The walk ends a branch as an
**independent scope** when all three of these hold:

- the directory is outside the current owner's `src/` and `subs/`;
- it contains a `tsconfig.json`;
- the root configuration selects no file within it.

`fixtures/collection-review/` meets all three: it sits under a plain
`fixtures/` directory, keeps the example's own `tsconfig.json`, and the root
`include` covers only `src/**` and `subs/**/src/**`. Ramify therefore never
reads its `module.ramify` files. The `--format json` report lists it as
`scope.independentScopes: ["fixtures/collection-review", "spikes/pi"]`.

The CLI spec describes this as "a nested independent project with its own
configuration … silent by the project's own conventions".

Two conditions keep it working:

- the fixture keeps its `tsconfig.json`;
- the fixture is never placed under `subs/` or `src/`, where an owner's
  configuration does not end the walk.

**Negative control.** The whole package was copied to the scratchpad and the
fixture's `tsconfig.json` was removed from the copy. `ramify check --batch`
then exited 1 with 15 `stray-description` errors, one for each fixture
module.

The fixture is also a valid project of its own.
`ramify check --batch --root fixtures/collection-review` exits 0 with
15 owners and 0 errors, but coverage is partial:

- 2 warnings, one each for `vite.config.ts` and `vitest.config.ts` outside
  module source, as in the example;
- 12 `unresolved-target` analysis limits, because the copy has no
  `node_modules`.

The check wrote nothing into the fixture.

## Exit evidence

All commands were run from `ramify-agent/`:

- `npm run type-check` (`tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json`):
  no output, exit 0.
- `npm test`: 9 test files, 46 tests passed. No warnings on stderr.
  - The HTTP test (`subs/harness/src/tests/http.test.ts`) starts the server
    on a copy of the fixture, with an assets directory that does not exist.
  - It reads the project, the plan list and a plan with plain Node `fetch`,
    parsing each answer with the protocol schemas.
  - It also covers error codes and statuses, including path traversal and
    hidden IDs, the not-built hint, and serving a built index.
- Web tests use `StubClient` for:
  - the list, error entries, the empty state and Refresh;
  - Markdown rendering and the Map empty state;
  - embedded HTML: `<script>`, `<img onerror>`, `<iframe>`, inline
    `<b onclick>` and a `javascript:` link. None of them produces an element
    or runs; the HTML appears as text;
  - connection state shown apart from a failed page;
  - fragment routing.
- `npm run check:self`: `Execution: completed; check: passed; coverage:
  complete`. 5 owners, 33 source files, 1 resource (`styles.css`),
  207 accesses. 0 errors, 0 warnings, 0 analysis limits; 105 allowed,
  0 denied, 102 external. Exit 0.
- **Browser check** with Playwright MCP against
  `tsx src/main.ts serve --project fixtures/collection-review --port 45839`,
  after `npm run build:web`:
  - The Plans page listed both fixture plans as "Not mapped", with
    "Connected to the harness".
  - The revision-diff plan rendered with its headings, lists and inline
    code; its Map tab showed the empty state.
  - After the server was stopped by its PID, the header showed "The harness
    is not answering" and the page content stayed.
  - Screenshots are in [iteration1-evidence/](iteration1-evidence/):
    `iteration1-plans.png`, `iteration1-plan.png`, `iteration1-map.png` and
    `iteration1-disconnected.png`.
- `npm run serve -- --project /nonexistent` printed the reason and exited 2.

## Deviations

1. **The `serve` entry lives at the root, not in `harness`.** The entry puts
   the web build output (`dist/web`) together with the harness server. The
   root is the lowest common ancestor of `harness` and `web`, so it owns that
   wiring, and `harness` does not need to know where `web` builds to.
   `harness` exposes `startServer`; the brief's command
   `serve --project <root> [--port <n>]` works as specified.
2. **The server refuses a project root without `module.ramify`.** The brief
   does not require this. The harness serves Ramify projects, so failing
   early is clearer than failing on a later job.
3. **Embedded HTML is shown as text rather than dropped.** The brief only
   requires that it never executes. Showing it as text keeps the plan
   complete for its reader.
4. **The job envelopes were given enough content to be useful now**: a
   state enum taken from the main plan, and a `cursor` on the event page.
   Iteration 2 may reshape them. Nothing consumes them yet.

## What iteration 2 must know

- **Extending the protocol:**
  - Add job states to `mappingStateSchema` in `queries.ts`. `web/src/mapping.ts`
    has an exhaustive `switch` that the type checker flags when a state is
    added.
  - Add command and event types in `jobs.ts`.
  - New routes go in `harness/src/http/app.ts` and must use its `send()`
    helper, which validates the response.
  - Throw `ProtocolFailure(code, message)` for protocol errors. A
    `stale-version` rejection must also carry `currentVersion`; the error
    handler does not set it yet.
- **Store primitives:**
  - Truncate with `discardPartialLine` before appending to a log that loaded
    with a partial line.
  - The rename that must never overwrite (publication write 3) is not
    written yet. `writeFileAtomic` overwrites.
- **Hidden directories:** `plans/.harness/` is already skipped by discovery.
- **Tests:**
  - Copy the fixture with `copyFixture()` from
    `subs/harness/src/tests/helpers/fixture.ts`.
  - The fixture has no `node_modules`, so a materialization on it reports
    partial coverage with `unresolved-target` limits. Iteration 3 must either
    accept this or run `npm ci` in the copy.
- **Web:**
  - Pages take a `ProtocolClient`, and tests use `StubClient`.
  - Progress polling can reuse `useQuery` and the connection state.
  - Keep the `tsconfig.json` in `fixtures/collection-review/`, or its
    `module.ramify` files become stray descriptions.
- **Known rough edges:**
  - The plan title appears twice on the Plan page: once in the page header
    and again as the Markdown's own first heading.
  - The bundle is 402 kB, mostly react-markdown.
