# web

The browser client of the harness. It renders what the harness publishes
through the harness's HTTP protocol; it owns only selection, layout and
connection state, and never writes harness state. It receives the harness's
public evidence and protocol contracts from the root, and nothing else from
`harness`.

It shows the project's plans and their implementation runs. Start, on the
Plan page, with or without the review stop, and Stop and Approve, on the Run
page, are its only commands; Approve's reviewer and note are the only fields
besides Start's option, and closing or reloading the page does not affect a
run.

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
  counts, failure, the review and the event feed; the plan and entries,
  with the review of the scenarios; hypotheses as forecasts with standing
  and revision beside the decisions; work items; the scenarios; checks with
  bounded output tails and each scenario check's summary; capability
  progress; and the metrics with the evaluation evidence. The connection to the harness is shown apart
  from the run's state. `src/run-progress.ts` reads the event page after a
  cursor, as Plan 1's page did, and reads each area again when the run's
  version moves.
- Progress has two views, and only the selected one is mounted. By module,
  the default (`src/capability-module-tree.tsx`), draws the harness's
  module-capability comparison in the module-tree canvas Ramify packages as
  `ramify.ts/module-tree`: one node per module the harness placed, sized to
  list every returned capability row, each row with its literal ID, an
  outlined Initial indication with its revision-1 roles and a filled
  Implemented indication. A module proposed at start is labelled so, and
  drawn with the provisional shell when it is not in the tree; modules
  without rows are muted, and `unplaced` modules are listed beside the
  canvas. A row button selects the capability's roles, hypotheses, reason
  and evidence; the module shell selects its capability list. The view names
  the compared initial view, tree and run version, and the coverage: a
  complete count, or known subtotals with their gaps. `styles.css` imports
  `ramify.ts/module-tree.css` once, and the web module adds no shell or
  React Flow rules. `?example=capability-module` previews it over the
  answers of `harness/src/tests/run-protocol.test.ts`. Dependencies (`src/capability-graph.tsx`) draws the
  harness's capability progress answer as a dependency graph: each returned
  capability once, in columns of longest dependency depth, with explicit
  cycle groups, dashed tentative links, the literal `todo`, `working` or
  `completed` state, and current or suggested owners. A bounded answer
  reports what it shows of the total and lists omitted dependency targets.
  Selected detail opens the capability's work-item history. With the dev
  server, `?example=capability-graph` previews it over the projection's
  answers for the cases of `harness/src/tests/progress.test.ts`.
- `src/run-scenarios.tsx` holds the acceptance scenarios' views. The review,
  under Plan and entries, shows each entry's scenarios with their origin and
  frozen text, each integration scenario with the plan's text beside its
  sub-scenarios, and the warnings the acceptance recorded, on the scenario
  they concern too. The Scenarios area lists every tracked scenario with its
  state, what it belongs to, its owner and file, and every gate that ran
  it with its status there. Approve asks for a reviewer and an optional
  note and sends `approve-analysis` at the run's version, once more at the
  version a `stale-version` refusal names; it is offered at the review stop
  and wherever the run is not reviewed, has an accepted analysis, is not in
  its final verification and was not failed, stopped or interrupted, and the
  page reads the run again once it is accepted.
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
protocol client, and never start a harness. The packaged canvas renders with
the real React Flow there; the `web` Vitest project deduplicates React and
inlines `ramify.ts`, `@xyflow/react` and `zustand`, and prebundles the
CommonJS selector shim, so every copy of React the canvas reaches is this
module's own. `vite.config.ts` deduplicates React for the build.
