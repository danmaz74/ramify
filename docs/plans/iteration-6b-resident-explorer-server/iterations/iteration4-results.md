# Iteration 4 results: CLI, PM2 and gate

**Date:** 2026-09-17. **Mode:** direct work on `docs/roadmap-fast-incremental-checks`, uncommitted.

## Built

- `subs/cli/src/explore-command.ts`: after opening its context, `explore` calls the launcher with
  `{ root: opened.value.current.selection.root, projectKey: explorerProjectKey(token.context) }`. It
  prints `Explorer: <origin>/analysis/latest`, then runs the platform opener. If the opener fails, it
  writes `Warning: Could not open the browser: …` to stderr and exits 0, without calling `cleanup`. The
  CLI still closes its own context and connection. The server holds its own subscription.
- `subs/cli/src/interfaces/cli.ts`: `ExplorerLauncher` takes `{ root, projectKey }`. The
  `ExplorerLaunch.cleanup` comment says that `explore` never calls it. This change clears the last
  type error, `src/cli-process.ts(77,114)`.
- `subs/cli/src/arguments.ts`: the help text describes the resident server, the printed
  `/analysis/latest` URL, and the server that keeps running when the opener fails.
- `subs/cli/src/tests/explore-command.test.ts`: covers launcher input, print and open, and the case
  where the opener fails (exit 0, no cleanup, URL printed).
- `ecosystem.config.cjs`: adds the `explorer` app from C6, plus `treekill: false` (deviation 1), and
  a comment on endpoint-directory selection and restarting after a rebuild.
- `subs/integration-tests/src/browser-acceptance.ts` (`npm run measure:project-explorer`): rewritten
  for the resident server. Every workload uses its own endpoint directory under `/tmp/rx6b-*`.
  - `reference` and `toolkit` (RS17): with a daemon already running, the harness runs the real
    installed `dist/src/ramify explore --root <copy>`. It uses the default 5000 ms startup window and
    a PATH whose `xdg-open` records the URL. The harness then drives the Plan 6/6A workflow at the
    printed `/analysis/latest`.
  - `mutations` (RS13–RS16): starts `node dist/src/explorer-entry.js --root <fixture> --port <n>` in
    the foreground, as the PM2 app does. With no daemon running, the server starts the isolated daemon
    itself.
  - New option: `-- --only reference|toolkit|mutations`. The default output is
    `docs/plans/iteration-6b-resident-explorer-server/evidence/iteration4-browser-acceptance.json`.
- Root `module.ramify`, P7: relays `readDaemonRecord` from `daemon` to descendants beside
  `connectDaemon, selectEndpoint`, so the acceptance owner can read the isolated daemon record.
  `daemon` already exposed it to its parent. `descriptions.test.ts` expects the added name.
- `docs/architecture/processes-and-clients.md`:
  - Status, topology, process table, `explore` row, "Web server and tRPC", "Launch, compatibility
    and shutdown" and PC05 now describe the resident per-project server.
  - That server holds one subscription, has no idle exit and respects explicit stops. It keeps a
    per-project record, which `explore` reuses.
- `docs/roadmap.md`: the Plan 6B row and brief record the implementation and link this report.
  A Plan 6B handoff row is added.
- `docs/development/testing.md`: the `measure:project-explorer` row describes the new runner.

## Verification commands

```text
npx tsc --noEmit (after the CLI change)                   -> exit 0, no errors
npm test -- subs/cli/src/tests/explore-command.test.ts subs/cli/src/tests/arguments.test.ts -> 2 files, 111 passed
npm run build                                             -> passed (existing Vite chunk-size warning only)
npm test -- src/tests/explorer-process.test.ts            -> 1 file, 3 passed (RS10 rerun in the checkout on this build)
npm test -- src/tests/cli-process.test.ts                 -> 1 file, 11 passed
npm test -- subs/analysis/subs/descriptions/src/tests/descriptions.test.ts -> 31 passed (after the P7 relay)
npm run measure:project-explorer -- --only mutations      -> passed (development run, scratch output)
npm run measure:project-explorer -- --only reference      -> passed (development run, scratch output)
npm run measure:project-explorer -- --only toolkit        -> passed (development run, scratch output)
npm run measure:project-explorer                          -> passed (twice; the second run, with process-tree RSS, is the retained evidence)
npm run type-check                                        -> exit 0
RAMIFY_ENDPOINT_DIR=<temp> npm run check:self             -> first run: 1 error (readDaemonRecord not-visible from integration-tests);
                                                             after the P7 relay: passed, 15 owners, 346 source files, 0 errors, 0 warnings, 0 limits
```

`check:self` ran with its own endpoint directory, and that daemon was stopped afterwards with
`ramify daemon stop`. The full `npm test` suite was not run; the Studio audit covers it.

Retained evidence: `evidence/iteration4-browser-acceptance.json`, measured
2026-09-17T07:23:00Z–07:23:55Z. Build identity `1a084122…b09f`, Chromium 151.0.7922.173, Node 24.

## Evidence per row

| Row | Status | Evidence (retained run) |
| --- | --- | --- |
| RS10 (rerun) | Established in the checkout | `src/tests/explorer-process.test.ts`, 3 passed against the checkout's own `dist`: fixed port, `SIGINT` exits `[0, null]` with the record `stopped/explicit`, busy port exits 1, removed flags rejected. |
| RS13 | Established | Foreground server on a fixed port. `/` shows heading `Ramify`, `dd[data-binding="ready"]`, the fixture root and the daemon PID. The `Pages` → "Module explorer" link leads to `/analysis/latest`. Four edits publish revisions `…:2` through `…:5`: an npm-only import, a README purpose, an added source access (edge access count 2) and an exposure declaration (`extra` exposed to parent). For each, `Refresh` turns into `Refresh (stale)`, and clicking it shows the change. `page.url()` stays `http://127.0.0.1:38129/analysis/latest` throughout. |
| RS14 | Established | After ten further README edits, each refreshed in the page, the daemon (PID 4006463) was killed with `SIGKILL`. Page notice: "Reconnecting to the daemon: Daemon socket closed unexpectedly", while the page still showed `Revision rev/1:54f2ae64…:15`. The server started a new daemon (PID 4006598) 1133 ms after the kill, and `serverStatus.daemonPid` matched it. The notice disappeared. The next published revision `rev/1:9b4c4c9a…:1` has a new generation with a lower sequence. The control turned stale, and refresh displayed that revision at the same URL. |
| RS15 | Established | `dist/src/ramify daemon stop` exited 0 ("Stopped: daemon stopped explicitly"). `serverStatus` became `daemon-stopped`, and the page notice read "The daemon was stopped explicitly". At 4, 8, 12 and 16 s the binding was still `daemon-stopped`. The daemon record still had PID 4006598, `state: stopped`, `stopped.reason: explicit`, and that process was not alive, so the server started no daemon. `dist/src/ramify check --root <fixture>` exited 1 (the fixture's intended denied imports) and started daemon PID 4006733 (`startedAt` after the command began). The server was `ready` with `daemonPid` 4006733 about 3.2 s after the check exited. |
| RS16 | Established (a foreground server stands in for PM2 here; see the PM2 confirmation for the real case) | With the foreground server (PID 4006443) running, `ramify explore --root <fixture>` and no `xdg-open` on PATH exited 0 in 34 ms. It printed `Explorer: http://127.0.0.1:38129/analysis/latest` and warned "Could not open the browser: Cannot run xdg-open (ENOENT)". The explorer-entry processes for that root were `[4006443]` before and after, and the record PID was unchanged. For a second fixture root, `explore` exited 0 in 425 ms and started a separate server: PID 4006881, port 41677, project key `f94863dcb1ff2aaa` instead of `f4152429fa7115eb`, binding `ready`. `SIGTERM` stopped it with its record `stopped/explicit`. The first server then exited `[0, null]` on `SIGINT`. |
| RS17 | Established | For each project, `ramify explore --root <copy>` opened the context from cold and started the server within the default 5000 ms window: reference in 521 ms, toolkit in 603 ms. The recorded opener received the printed URL. **Reference:** 15 modules, 294 accesses, "Showing 2 of 15 modules, 0 module dependencies". Module and export details, edge selection, sidebar resize, zoom, pan, drill-down and filter all passed. Ten refresh cycles settled to the listener, timer and graph baseline. **Toolkit:** 15 modules, 4721 accesses, "Showing 7 of 15 modules, 9 module dependencies", 2 247 982 encoded bytes. In both, the DOM contained only module nodes and edges, and the URL stayed `/analysis/latest`. |

The handoff asked whether the default `startupMs` is long enough. With a warm daemon, the
server's record appeared in about 0.5–0.6 s for the reference and toolkit copies, and in 0.4 s
for the small fixture. The binding becomes ready after open and subscribe, without waiting for
analysis. No adjustment was needed.

## Memory (RSS from `/proc/<pid>/status`)

The daemon "tree" figure adds the RSS of its descendant processes, the per-context session
supervisors, to the daemon's own RSS. Shared pages are counted in each process, so the tree
figure is an upper bound.

| Workload, point | Server RSS | Daemon RSS | Daemon tree RSS |
| --- | ---: | ---: | ---: |
| mutation, before ten edits | 85.0 MiB | 67.3 MiB | 240.0 MiB (2 descendants) |
| mutation, after ten edits | 89.2 MiB | 69.8 MiB | 246.0 MiB |
| mutation, after daemon kill and recovery (new daemon) | 89.7 MiB | 63.1 MiB | 212.0 MiB |
| reference, after workflow and ten refreshes | 111.7 MiB | 118.6 MiB | 450.7 MiB (162.7 + 169.4 MiB descendants) |
| toolkit, after workflow | 156.4 MiB | 138.1 MiB | 820.1 MiB (365.2 + 316.8 MiB descendants) |

The daemon's retained context size was 10 437 329 bytes for the reference and 17 142 066 bytes
for the toolkit. Ten edits grew server RSS by 4.2 MiB and daemon tree RSS by 6.0 MiB. One run is
not enough to tell a plateau from growth. While a server runs, its subscription keeps the
context's compiler retained, as C2 accepts.

After the runs, no process from the acceptance endpoints remained, including any session
supervisor orphaned by the killed daemon. The only explorer and daemon processes left used the
shared `/tmp/ramify-1000` endpoint; they predate this work and belong to other sessions.

## PM2 manual confirmation

The confirmation ran with its own endpoint directory (`RAMIFY_ENDPOINT_DIR=/tmp/rx6bpm2-oxlB`,
passed to `pm2 start`), so it did not touch the shared daemon. Before the confirmation, PM2 had
only `main` (`site` was not registered), and port 4302 was free.

1. `pm2 start ecosystem.config.cjs --only explorer`: "App [explorer] launched", PID 4007668.
   The record `explorer-a78b6e4ebfdc98d6-e69a8a530507fe43.json` had `root: /ramify` and port
   4302. `GET /` and `GET /analysis/latest` returned 200. `serverStatus` was `ready` with
   `daemonPid` 4007702. The log showed "Explorer serving /ramify at http://127.0.0.1:4302/" and
   `binding-ready`.
2. `ramify explore --root /ramify`, with no opener on PATH, printed
   `Explorer: http://127.0.0.1:4302/analysis/latest` and the opener warning, then exited 0. The
   record PID was still 4007668, and PM2 still listed `explorer` with that PID.
3. `pm2 restart explorer` with the C6 configuration: the new PID was 4007858 at the same URL
   (200, `ready`). **The daemon PID changed to 4007873.** The server had started the daemon as its
   child, and PM2's default tree kill signals the child processes too. `pm2 delete explorer`
   likewise left `ramify daemon status` at "not running".
4. With `treekill: false` added, `pm2 start` gave PID 4008120 with daemon 4008136.
   `pm2 restart explorer` gave PID 4008245 with **the same daemon 4008136**, which still had its
   context. `serverStatus` already reported a published revision. `ramify explore` reused the
   server again (record PID 4008245, exit 0). `GET /` returned `<title>Ramify</title>`.
5. Cleanup: `pm2 delete explorer` marked the record `stopped/explicit`, and the daemon kept running.
   The isolated daemon was stopped with `ramify daemon stop` on that endpoint, and the directory was removed.

**Final PM2 state:** only `main` is registered and online (PID 1304040), as before. `explorer` was
not registered before, so it was deleted again.

## Decisions and deviations

1. **`treekill: false` in the PM2 app.** C6 lists the app without it. The confirmation showed that
   a server that starts the daemon itself makes that daemon its child process. PM2's default tree
   kill then stops the daemon on each `pm2 restart` or `pm2 delete`, which discards warm contexts.
   Architecture PC05 says that a web restart leaves them intact. With `treekill: false`, only the
   server receives the signal.
2. **Output order.** `explore` prints the URL before running the opener, so the URL appears whether
   or not the opener fails. The opener warning goes to stderr, and the exit code is 0 either way.
   An interrupt during the opener still exits 130.
3. **RS16 PM2 witness.** The automated run uses a foreground server started the way PM2 starts one
   (same entry, `--root`, fixed `--port`, endpoint chosen from the environment). Running the
   harness under PM2 would register apps in the shared PM2 daemon. The manual confirmation above
   covers reuse of a server that PM2 really started.
4. **RS14 notice observation.** The binding's first retry comes after 1 s, and a daemon restart
   takes about 1.1 s, which is shorter than the 3 s poll. The harness therefore dispatches
   `visibilitychange`, which the page handles with an immediate poll, until the notice appears.
   It does not change timers.
5. **P7 relay.** The narrowest legal way to read the isolated daemon record was to add
   `readDaemonRecord` to the existing root relay. The daemon owner already exposed it to its parent.
6. **Process-tree RSS.** C2 accepts the retained compiler memory. The first full run measured only
   the daemon process. That understated the retained cost, so the harness now also records the
   daemon's descendants, and the retained run includes them.

## Remaining gaps and notes

- A PM2 (or other) server that starts while the daemon is explicitly stopped writes no discovery
  record until its binding is first ready (iteration 2, decision 1). Until another client starts
  the daemon, `ramify explore` cannot discover it and would start a second server. That second
  server would fail on a fixed port only if it used the same port; the launcher-started server
  uses port 0.
- The daemon that a server starts is that server's child process. A process manager with tree kill,
  or anything that signals the whole process tree, also stops the daemon. The `explorer` PM2 app
  avoids this with `treekill: false`; other process managers need the equivalent setting.
- PM2's environment must select the same endpoint directory as the shell. The home page's daemon
  PID makes a mismatch visible, but nothing enforces it.
- `ramify check --root` on the mutation fixture exits 1 because the fixture intentionally contains
  denied imports. RS15 accepts exit 0 or 1 and relies on the daemon record, not the finding count.
- Memory was measured in one run. Whether RSS plateaus over many more edits remains unmeasured,
  as does the tree figure's sharing between processes.
- The full test suite and reference gates were not run locally; the Studio audit covers them.
- Deferrals from the main plan stand: several projects per server, pushed events, cooling a held
  context, idle exit or `explore --stop`, automatic restart after a rebuild, revision permalinks,
  authentication and non-loopback binding.

## Handoff

Later multi-project or pushed-event plans get these inputs:

- The resident server holds one subscription per project. That keeps the daemon's retained
  analysis in memory: about 240 MiB of process-tree RSS for a small fixture, 451 MiB for Collection
  Review and 820 MiB for Ramify.
- The server itself uses 85–156 MiB.
- Recovery after a daemon kill takes about 1.1 s to a new daemon.
- An explicit stop is honored until another client starts the daemon, and resuming takes about
  3 s (the 5 s stopped poll).
- Polling every 3 s is the only freshness channel.
