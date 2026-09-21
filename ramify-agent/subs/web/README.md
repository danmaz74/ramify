# web

The browser client of the harness. It renders what the harness publishes
through the harness's HTTP protocol; it owns only selection, layout and
connection state, and never writes harness state. It receives the harness's
public evidence and protocol contracts from the root, and nothing else from
`harness`.

It shows the project's plans and their implementation runs. Start, on the
Plan page, and Stop, on the Run page, are its only commands; nothing else on
it is editable, and closing or reloading it does not affect a run.

## Entry points

- `src/main.tsx` mounts `App` with a client of the page's own origin.
- `src/client.ts` is the protocol client: every answer is validated against
  the protocol's schemas, and it reports the connection state (`connecting`,
  `connected`, `disconnected`) apart from any answer's content. A command the
  harness does not answer is sent again with the same ID, which returns the
  original receipt.
- Pages are chosen by the URL fragment (`src/routes.ts`): `#/` lists the
  plans, `#/plans/<id>` shows one plan with its runs and Start, and
  `#/plans/<id>/runs/<run-id>` is the Run page.
- `src/run-page.tsx` is the Run page, list and detail only: the overview
  with notices first (every module created or removed, then every
  dependency cycle, resolved or not), then state, current work, waits,
  counts, failure and the event feed; the plan and entries; hypotheses as
  forecasts with standing and revision beside the decisions; work items;
  checks with bounded output tails; capability progress; and the metrics
  with the evaluation evidence. The connection to the harness is shown apart
  from the run's state. `src/run-progress.ts` reads the event page after a
  cursor, as Plan 1's page did, and reads each area again when the run's
  version moves.
- `src/module-tree.tsx` draws modules marked as touched on the project's
  module tree, with their weights. Branches that hold marked modules are
  open; a module that does not exist yet is drawn under its parent and marked
  as proposed; without a tree, the marked modules are listed. What a module
  is marked with is this page's own presentation choice, supplied by whatever
  draws on the tree.
- `src/markdown.tsx` renders a plan read-only. Embedded HTML is turned into
  visible text before rendering, so it never reaches the page as markup.

## Build and compiler settings

`index.html`, `vite.config.ts` and `tsconfig.json` sit beside `src/`.
`npm run build:web` writes the bundle to the package's `dist/web`, which the
root's `serve` entry hands to the harness. `npm run dev:web` serves the client
with `/api` proxied to a harness on port 4180. This module's `tsconfig.json`
adds the DOM library; the root `tsconfig.json` excludes `src/` from its own
type check, and Ramify still reads it as this module's owned source.

## Testing

Tests in `src/tests/` run in jsdom against `StubClient`, an in-memory
protocol client, and never start a harness.
