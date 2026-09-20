# Iteration 1: Skeleton and plan browsing

**Goal:** a harness process that serves one project's plans over the
protocol, and a browser client that lists and reads them.

## Scope

- **`contracts/protocol`**, declared with its README: Zod schemas and types
  for the `/api/v1` queries used now (project, plan list, plan), the error
  shape, and the command, receipt, job snapshot and event envelopes that
  iteration 2 fills in. Replace the placeholder format constants and the root
  `formatsAgree` placeholder with real exposures; update module READMEs.
- **`harness`**, as directories in its `src/`:
  - `store/`: the atomic-write and append-only JSONL primitives that the run
    store and event log will use (write to temporary file then rename; a
    trailing partial line is discarded on load).
  - `plans/`: discovery of `plans/*/plan.md` with title (first heading, else
    the ID) and path; an unreadable file is reported as an error entry, not a
    failure of the list. Hidden directories are skipped.
  - `http/`: an Express adapter serving the queries under `/api/v1`, every
    response validated against `contracts/protocol`, and the built web assets
    when they exist.
  - The `serve --project <root> [--port <n>]` entry, runnable with `tsx` and
    exposed as an npm script.
- **`web`**: React and Vite. Plans page (title, path, latest mapping state,
  which is "not mapped" until iteration 2, refresh, an empty state naming
  where a plan file belongs, error entries). Plan page with the Markdown
  rendered read-only and embedded HTML never executed, and a Map tab showing
  an empty state. A small protocol client module that only uses `contracts`.
  Connection state is shown separately.
- **Fixture:** the reference example copy with two plans, per the defaults
  in the [iterations index](README.md).
- Add the dependencies and scripts: `build:web`, `serve`, and whatever the
  browser compiler settings need.

## Exit evidence

- An HTTP test starts the adapter on the fixture and reads the plan list and
  a plan from a plain Node `fetch` client, with the web assets absent.
- Web tests for the Plans and Plan pages against a stubbed protocol client,
  including that embedded HTML is not executed.
- The fixture's plans listed and read in a real browser (Playwright MCP tools
  are available), with a screenshot path recorded in the results note.
- Type check, tests and `npm run check:self` pass.
