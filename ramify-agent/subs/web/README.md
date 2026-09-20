# web

The browser client of the harness. It renders what the harness publishes
through the harness's HTTP protocol and sends its commands; it owns only
selection, layout and connection state, and never writes harness state. It
receives the harness's public map and protocol contracts from the root, and
nothing else from `harness`.

## Entry points

- `src/main.tsx` mounts `App` with a client of the page's own origin.
- `src/client.ts` is the protocol client: every answer is validated against
  the protocol's schemas, and it reports the connection state (`connecting`,
  `connected`, `disconnected`) apart from any answer's content. A command
  that gets no answer is resent unchanged, which is safe because an
  identical retry returns the original receipt.
- Pages are chosen by the URL fragment (`src/routes.ts`): `#/` lists the
  plans, `#/plans/<id>` shows one plan, `#/plans/<id>/map` its latest map
  and `#/plans/<id>/map/<n>` revision `n`.
- `src/progress.tsx` is the Progress view. It fetches a job's events after a
  cursor every second while the job runs, and shows:
  - the state, the current activity and the elapsed time;
  - totals and inputs, including an uncommitted checkout the agent sees;
  - the activity feed;
  - Stop.
  Activity keeps advancing the job's version, so a stale Stop is sent again
  as a new command at the version the harness reports. The connection note
  is shown apart from the job state.
- The Plan page's Map tab (`src/map-view.tsx`) starts a mapping job, shows
  the latest job's progress, and lists the saved revisions, each selectable
  with its approval state. The chosen revision is shown with Approve, and
  Regenerate starts a new job. Approve fetches the version of the job that
  saved the revision and sends `approve-map`. A stale refusal is shown with
  the harness's reasons.
- `src/map-document.tsx` renders a map read-only, section by section.
  `src/module-tree.tsx` draws the modules touched on the project's module
  tree with their weights. Branches that hold touched modules are open. A
  proposed module is drawn under its parent. Without a tree, the touched
  modules are listed.
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
