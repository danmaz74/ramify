# Iteration 2 results: Token-free server

**Date:** 2026-09-17. **Mode:** direct work on `docs/roadmap-fast-incremental-checks`, uncommitted.

## Built

- `subs/service-api/src/router.ts`: `createExplorerRouter({ binding, requestId? })` has three
  procedures: `serverStatus`, `projectView({ revision? })` and `explorerDetails({ revision, requests })`.
  `contextStatus` and every token input are removed. Each request reads `binding.state()` and
  `binding.service()`. `serverStatus` takes no input: `z.undefined()` rejects a token.
- `subs/service-api/src/interfaces/explorer-service.ts`:
  - `ProjectViewInput` and `ExplorerDetailsInput` lose `token`.
  - `ContextStatusInput` and `ContextStatusResult` are replaced by `ServerBindingKind` and `ServerStatusResult`.
  - `ExplorerProcessRecord` adds `root` and `context`.
- `subs/service-api/src/web-process.ts`: `startExplorerWebProcess({ binding, assetsDirectory,
  endpointDirectory, buildKey, version, port?, now? })`.
  - The process binds `127.0.0.1` on `port`, which defaults to 0. A busy fixed port rejects with `EADDRINUSE`.
  - Accepted `Host` values are `127.0.0.1:<port>` and `localhost:<port>`. A present `Origin`
    must be `http://` plus one of them, on every route. Anything else gets 403, as does a
    `/trpc` preflight (`OPTIONS`).
  - `GET /` and `GET /analysis/latest` serve `index.html`. `/explore/*` redirects with 302
    to `/analysis/latest`. `/health/ready` and the static assets are unchanged.
  - The per-project record is written once the binding is first `ready`; see decision 1.
    `close(reason)` closes open connections and marks the record stopped with that reason.
- `subs/service-api/src/web-discovery.ts`:
  - New: `explorerProjectKey(context)`.
  - `selectExplorerEndpoint(endpoint, projectKey)` names the record, lock and log
    `explorer-<buildKey>-<projectKey>.{json,lock,log}`.
  - Record validation requires an absolute `root` and a valid `context`. Reuse also
    requires the record's project key to match.
  - `explorerProjectUrl(record)` returns `<origin>/analysis/latest`.
- `subs/service-api/src/web-launcher.ts`: `ensureExplorerWebProcess` takes `root` and `projectKey`.
  It spawns `<entry> --root <root>` with `RAMIFY_ENDPOINT_DIR` set to the endpoint directory.
- `src/explorer-entry.ts` implements C1.
  - Arguments are `--root <dir> [--port <n>]`, resolved against the working directory. The old
    three flags now fail with a usage message.
  - The endpoint comes from `selectEndpoint({ packageRoot, version })`, which reads
    `RAMIFY_ENDPOINT_DIR`, then `XDG_RUNTIME_DIR`, then tmpdir, as the CLI does.
  - The process listens first, then creates the binding. The binding connects with
    `connectDaemon({ start, onState, daemonEntry: RAMIFY_DAEMON_ENTRY ?? dist/src/daemon-entry.js })`
    and uses `setup { registry: 'default', capabilities }`, with `capabilities` from the CLI.
  - `SIGINT`/`SIGTERM` close the web process with reason `explicit`, close the binding and exit 0.
  - A startup failure exits 1. A daemon that is absent at startup no longer causes an exit.
  - Binding log entries go to stdout (`info`) or stderr (`warn`) as JSON lines.
- `src/explore-launcher.ts`: `launchInstalledExplorer({ root, projectKey }, options, control)`.
  `openPlatformBrowser` also accepts `localhost` URLs.
- Exposure:
  - `subs/cli/module.ramify`: `expose-src capabilities from "command-support.ts" to parent`
    is the narrowest legal sharing of the setup. Root `src/` imports it, and the CLI keeps using it.
  - `subs/service-api/module.ramify`: adds `explorerProjectKey` to the web-discovery line.
  - Root `module.ramify`: P4 relays `ServerBindingKind` and `ServerStatusResult` in place of the two
    `ContextStatus*` names. The discovery relay adds `explorerProjectKey`.
- Tests:
  - Rewritten: `web-process.test.ts`, `web-launcher.test.ts`, `web-launcher-fixture.mjs`,
    `integration-tests/src/explorer-router.test.ts` and `src/tests/explorer-process.test.ts`.
  - `analysis/subs/descriptions/src/tests/descriptions.test.ts` now expects the toolkit's
    current descriptions. It had been failing since iteration 1's P8 relay (2 failed), and it
    now also covers this iteration's changes.
- `subs/integration-tests/src/browser-acceptance.ts`: a mechanical, type-level adaptation to
  the new launcher and URL signatures (`explorerProjectKey(token.context)`, `root`, `projectKey`,
  `explorerProjectUrl(record)`). Its browser workflow still needs iterations 3 and 4 before it can run.
- `subs/service-api/README.md`: the purpose paragraph describes the resident, token-free server.

## Evidence

| Row | Test | Harness |
| --- | --- | --- |
| RS07 | Before the binding is ready: `projectView` is `unavailable` ("Connecting to the project") and `serverStatus` reports `connecting` with null fields. Once ready, `projectView({})` returns the newest revision with the binding's token. `serverStatus` returns root, `ready`, `published` and `daemonPid` (= quick-instance PID). A token passed to `projectView`, `explorerDetails` or `serverStatus` fails with `BAD_REQUEST`, and no `contextStatus` procedure exists. After a newer revision, details for the older revision are `superseded` and `projectView({})` returns the newer one. After `close()`, both procedures report "Project binding closed". | real quick environment, real `createProjectBinding` |
| RS08 | The test releases the binding's subscription, advances the quick clock until the real context manager evicts the context, then delivers `context-evicted` to the binding. While the binding reopens, `explorerDetails` is `unavailable`. After reopening, the context is the same and the generation differs. `explorerDetails` for the old revision is `superseded`. `projectView({ revision: old })` ignores the revision and returns the new generation's latest. Details for that revision are `ready`. | real quick environment, forced eviction as in RS02 |
| RS09 | `/` and `/analysis/latest` serve `index.html` for `localhost:<port>` and `127.0.0.1:<port>`. `/explore/…` gets 302 to `/analysis/latest`. Hosts `localhost`, `127.0.0.1`, another port, `example.test` and `[::1]` get 403. Both loopback origins are accepted. `https://example.test`, `https://localhost:<port>`, another port and `null` get 403 on `/trpc` and `/`. OPTIONS gets 403. No record exists while `connecting`. Once `ready`, the record `explorer-<build>-<projectKey>.json` has mode 0600 and contains `root` and `context`. Close marks it `stopped/explicit`. A fixed port is used exactly, and a second start on it rejects with `EADDRINUSE`. A tRPC POST batch returns `serverStatus` for ready and retrying states. | HTTP against a stub binding |
| RS10 | The built entry is started with `--root <fixture> --port <free port>` and an isolated `RAMIFY_ENDPOINT_DIR` where no daemon runs. The server starts the daemon itself (`if-needed`), writes the per-project record on the fixed port with `root` and `pid`, and answers health on both hosts (403 for `example.test`). Over HTTP, `/trpc/serverStatus` returns `binding: 'ready'` and `daemonPid` equal to the daemon record's PID. `SIGINT` exits `[0, null]` and the record becomes `stopped/explicit`. A busy port exits `[1, null]` with `EADDRINUSE`, writes no record and starts no daemon. The removed flags exit 1 with the usage message. | real processes, isolated endpoint; the test stops the daemon it started |

Commands and outcomes:

```text
npm test -- subs/integration-tests/src/explorer-router.test.ts  -> 2 passed (2); run 3 times, all passed
npm test -- subs/service-api/src/tests/web-process.test.ts        -> 4 passed (4)
npm test -- subs/service-api/src/tests/web-launcher.test.ts       -> 3 passed (3)
npm test -- subs/service-api/src/tests/project-binding.test.ts    -> 8 passed (8) (iteration 1, unchanged)
npm test -- subs/analysis/subs/descriptions/src/tests/descriptions.test.ts -> 31 passed (31) (was 2 failed before this iteration)
npm test -- src/tests/explorer-process.test.ts                    -> 3 passed (3); final version run 3 times, all passed; in a scratch build copy, see below
npm run type-check                                                -> exit 1; only the consumer errors below
npm run check:self                                                -> failed: 1 error (consumer), 15 owners, 342 files, 0 warnings, 0 limits
dist/src/ramify check --root . --batch                            -> same result
npm run build                                                     -> fails in the production compiler on the consumer errors below
```

`tsc -p tsconfig.portable.json` and `tsc -p scripts/reference-harness/tsconfig.json` exit 0.
`tsc -p tsconfig.scripts.json` reports only the same consumer errors.

**RS10 build.** `npm run build` cannot succeed in the checkout, because the production
compiler stops on the consumer errors. The checkout's `dist/` (built 06:25, before this
iteration) was left untouched. For RS10, `src`, `subs`, `scripts`, the manifests,
tsconfigs, `module.ramify`, `README.md` and the vite/vitest configs were copied into a
scratch directory, with `node_modules` symlinked. The copy differs from the checkout in
exactly three consumer lines, verified with `diff -r`: `input as never` at `src/cli-process.ts:77`,
and `// @ts-nocheck` at the top of `subs/explorer/src/ProjectExplorerPage.tsx` and
`browser-app.tsx`. `npm run build` passed there, and the identical
`src/tests/explorer-process.test.ts` ran against that `dist`. No daemon or server process
from the copy remained afterwards. After iteration 4 fixes the consumers, rerun the
test in the checkout after `npm run build`.

## Remaining consumer type errors (verbatim, `tsc --noEmit`)

```text
src/cli-process.ts(77,114): error TS2739: Type '{ readonly token: ContextToken; }' is missing the following properties from type '{ readonly root: string; readonly projectKey: string; }': root, projectKey
subs/explorer/src/ProjectExplorerPage.tsx(6,15): error TS2305: Module '"../../service-api/src/interfaces/explorer-service.js"' has no exported member 'ContextStatusResult'.
subs/explorer/src/browser-app.tsx(25,36): error TS2339: Property 'contextStatus' does not exist on type 'TRPCClient<BuiltRouter<{ ctx: object; meta: object; errorShape: DefaultErrorShape; transformer: false; }, DecorateCreateRouterOptions<{ serverStatus: QueryProcedure<{ input: undefined; output: ServerStatusResult; meta: object; }>; projectView: QueryProcedure<...>; explorerDetails: QueryProcedure<...>; }>>>'.
subs/explorer/src/tests/real-router-model.ts(16,41): error TS2353: Object literal may only specify known properties, and 'service' does not exist in type 'ExplorerRouterOptions'.
subs/explorer/src/tests/real-router-model.ts(17,43): error TS2353: Object literal may only specify known properties, and 'token' does not exist in type '{ revision?: string | undefined; }'.
subs/explorer/src/tests/real-router-model.ts(18,31): error TS2339: Property 'contextStatus' does not exist on type 'DecorateRouterRecord<DecorateCreateRouterOptions<{ serverStatus: QueryProcedure<{ input: undefined; output: ServerStatusResult; meta: object; }>; projectView: QueryProcedure<{ input: { revision?: string | undefined; }; output: { ...; } | ... 1 more ... | { ...; }; meta: object; }>; explorerDetails: QueryProcedure<.....'.
```

`check:self` error, the explorer import that iteration 3 replaces:

```text
Error [missing-export] subs/explorer/src/ProjectExplorerPage.tsx:6:15: subs/service-api/src/interfaces/explorer-service.ts has no export named ContextStatusResult
  Importer: ramify/explorer (ordinary; tags: browser, dispatch, ui)
```

**Where the CLI error lands.** `subs/cli` itself still type-checks, because
`ExplorerLauncher` in `subs/cli/src/interfaces/cli.ts` still passes `{ token }`. The CLI-side
error appears in the root wiring `src/cli-process.ts:77`, which hands that input to the new
`launchInstalledExplorer({ root, projectKey })`. Iteration 4 removes it by changing
`ExplorerLauncher`'s input and the explore command.

## Decisions and deviations

1. **The record is written when the binding is first ready.** The record name and its
   `context` field need the context ID. Only the daemon issues that ID
   (`createContextId` is internal to `contexts`). Computing it in the server would duplicate
   the hash and root canonicalization, and exposing it would need three new relays.
   The web process therefore serves HTTP at once but writes
   `explorer-<buildKey>-<projectKey>.json` the first time `binding.state()` is `ready`,
   polling every 50 ms. After that the record stays, because the context ID is stable
   across generations. Consequence: a server that has never been ready, such as a PM2
   server started while the daemon is explicitly stopped, cannot be discovered until the
   daemon runs. `ramify explore` starts the daemon itself, so the server becomes ready
   and discoverable within the launcher's startup window. The launcher's default
   `startupMs` of 5000 still applies.
2. **The entry listens before it connects.** The entry creates the real binding only after
   the listener is up, and a small deferred binding reports `connecting` until then. This
   way a busy fixed port exits 1 without starting a daemon (RS10). A signal that arrives
   during startup closes the listener before exit.
3. **`serverStatus` result shape.**
   `{ root, binding: BindingState['kind'], message: string | null, published: ContextRevision | null, daemonPid: number | null }`.
   `daemonPid` is added for C6's home page. It comes from `service.daemonStatus().pid` while
   the binding is ready, and is otherwise null, as is `published`, which comes from
   `contextStatus`. `message` is set only for `retrying` and `project-unavailable`.
4. **Generation comparison.** A revision ID `rev/1:<uuid>:<n>` belongs to generation
   `gen/1:<uuid>`, which is how `tokens.ts` constructs it. A revision from another
   generation gives `superseded` for `explorerDetails` without a daemon call. `projectView`
   drops that revision and returns the latest. A same-generation revision that is not the
   latest keeps the existing behavior: the daemon answers, so `projectView` returns
   `unavailable` and `explorerDetails` returns `superseded`.
5. **Unavailable reasons.** `connecting` gives "Connecting to the project" and
   `daemon-stopped` gives "Daemon stopped explicitly". `retrying` and
   `project-unavailable` give the binding's message. A throwing service call gives
   `unavailable` with the error's message.
6. **Origin is enforced on every route**, not only `/trpc`, as C1 states it without a
   route restriction.
7. **Launcher environment.** The spawned entry receives
   `RAMIFY_ENDPOINT_DIR=<endpoint directory>`, so it derives the same endpoint as the
   launcher even when the launcher's directory came from an option.
8. **Shared setup.** Only the `capabilities` list is exposed. The entry builds
   `{ registry: 'default', capabilities }` just as `explore-command.ts` does, so both
   obtain the same context ID.
9. **Other edits outside the brief's files.** `descriptions.test.ts` needed updating
   because it asserts the toolkit's module descriptions, which iterations 1 and 2 changed.
   `browser-acceptance.ts` got only type-level adaptations, so that the only remaining
   type errors are consumer errors.

## Handoff for iteration 3 (explorer)

- Router type: `import type { ExplorerRouter } from '../../service-api/src/router.js'`, relayed
  by root P4. Result types come from `../../service-api/src/interfaces/explorer-service.js`:
  `ServerStatusResult`, `ServerBindingKind`, `ExplorerDetailsResult`, `ProjectViewInput`
  and `ExplorerDetailsInput`, all relayed.
- Procedures (tRPC client with `httpBatchLink({ url: '/trpc', methodOverride: 'POST' })`):
  - `serverStatus.query()` takes no input and returns
    `{ root: string; binding: 'connecting'|'ready'|'daemon-stopped'|'project-unavailable'|'retrying'; message: string | null; published: ContextRevision | null; daemonPid: number | null }`.
  - `projectView.query({ revision? })` returns the unchanged `ProjectViewResult` union
    (`ready` model, `pending`, `unavailable { reason }`).
  - `explorerDetails.query({ revision, requests })` returns `ExplorerDetailsResult`.
- Routes: `/` → `index.html` (home), `/analysis/latest` → `index.html` (explorer),
  `/explore/*` → 302 `/analysis/latest`. Any other path is a static asset or 404, so the
  browser-side "anything else → home" applies only to paths the server serves.
  Both `localhost:<port>` and `127.0.0.1:<port>` load the page.
- Fix the six errors listed above: `ProjectExplorerPage.tsx`, `browser-app.tsx` and
  `tests/real-router-model.ts`. The router test in `real-router-model.ts` needs a
  `ProjectBinding`. `integration-tests/src/explorer-router.test.ts` builds a real one over
  the quick environment and can serve as a model; `createProjectBinding` is relayed by root P8.

## Handoff for iteration 4 (CLI, PM2, gate)

- Root launcher: `launchInstalledExplorer(input: { root: string; projectKey: string }, options: InstalledExplorerOptions, control?)`
  returns `ExplorerLaunch { url, started, cleanup }`. `url` is `<origin>/analysis/latest`.
  Per C5, the CLI must not call `cleanup` when the opener fails.
- Service launcher: `ensureExplorerWebProcess({ endpoint: selectExplorerEndpoint(daemonEndpoint, projectKey), root, projectKey, version, explorerEntry, runtime?, startupMs?, signal? })`.
  It reuses any ready, compatible server whose record matches build, version and project,
  including a PM2-started one. Otherwise it spawns `<entry> --root <root>` detached, with
  logs in `explorer-<buildKey>-<projectKey>.log`.
- URL function: `explorerProjectUrl(record)` returns `<origin>/analysis/latest`.
- Record `ExplorerProcessRecord` fields: `schemaVersion, instanceId, pid, version, buildKey, protocol, root, context, host: '127.0.0.1', port, origin: 'http://127.0.0.1:<port>', startedAt, state, stopped`.
  Names: `explorer-<buildKey>-<projectKey>.{json,lock,log}` in the daemon endpoint
  directory. The record appears only after the server's binding first becomes ready
  (decision 1).
- Project key: `explorerProjectKey(context)` from `service-api/src/web-discovery.ts`, relayed to
  descendants, which `cli` can import. The CLI gets the context from
  `opened.value.token.context` and the resolved root from
  `opened.value.current.selection.root`, both from its own `openContext`.
- Shared setup: the CLI keeps `{ registry: 'default', capabilities }` from `command-support.ts`.
  `capabilities` is now exposed to the parent, and the entry imports it, so the context IDs match.
- `ExplorerLauncher` in `subs/cli/src/interfaces/cli.ts` must change its input to
  `{ root, projectKey }`. That removes the `src/cli-process.ts:77` error.
- Entry: `node dist/src/explorer-entry.js --root <dir> [--port <n>]`. Endpoint selection
  follows the environment. `SIGINT`/`SIGTERM` exit 0 with `stopped/explicit`, a busy port
  exits 1, and output goes to stdout/stderr.
- After the consumers compile, run `npm run build` and then
  `npm test -- src/tests/explorer-process.test.ts` in the checkout. RS10 was proven only
  on a scratch build copy.
- `browser-acceptance.ts` is only adapted to the types. It still opens a context before
  launching and relies on the old page. Iteration 4 owns the RS13–RS17 workflow.
