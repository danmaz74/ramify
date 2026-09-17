# Plan 6B: Resident explorer server

**Date:** 2026-09-17. **Status:** draft for contract review. A focused successor
to the completed [Plan 6](../iteration-6-project-explorer/main-plan.md) and
[Plan 6A](../iteration-6a-module-only-project-explorer/main-plan.md). Their
artifacts and evidence remain historical records.

## Product decision

The explorer web process becomes a long-running server for one project. A
process manager such as PM2 can run it in the foreground. The server itself
opens the project's daemon context, subscribes to it and keeps it current
across evictions, daemon failures and daemon restarts. Browsers use stable URLs
that never contain a context or generation identity.

This plan keeps it simple: one project per server, polling instead of pushed
events, no authentication, and no new analysis or daemon capability.

## Runnable outcome

```sh
npm run build
pm2 start ecosystem.config.cjs --only explorer   # node dist/src/explorer-entry.js --root /ramify --port 4302
# browse http://localhost:4302/                  -> home page listing "Module explorer"
# browse http://localhost:4302/analysis/latest   -> newest published analysis
ramify explore                                   # opens the same server's /analysis/latest
```

After an edit, the open page shows the existing refresh control as stale. After
`pm2 restart explorer`, a daemon crash or a context eviction, the same URL
works again without a new link.

## Current state (verified 2026-09-17)

| Area | Today |
| --- | --- |
| Context ownership | `ramify explore` opens a context, passes `{context, generation}` in the URL and closes its connection ([explore-command.ts](../../../subs/cli/src/explore-command.ts)). The web process owns no context. |
| Web entry | [explorer-entry.ts](../../../src/explorer-entry.ts) requires `--endpoint-dir`, `--build-key` and `--version`, connects with `start: 'never'`, never observes disconnection and records `SIGINT`/`SIGTERM` as `failed`. |
| HTTP | [web-process.ts](../../../subs/service-api/src/web-process.ts) listens on port 0, accepts only `Host: 127.0.0.1:<port>`, serves `/explore/*` and has no `/`. |
| Procedures | [router.ts](../../../subs/service-api/src/router.ts) takes a browser-supplied token in `projectView`, `explorerDetails` and `contextStatus`. |
| Discovery | One `explorer-<buildKey>.json` record per build; the launcher spawns a detached child when none is ready ([web-launcher.ts](../../../subs/service-api/src/web-launcher.ts)). |
| Page | [ProjectExplorerPage.tsx](../../../subs/explorer/src/ProjectExplorerPage.tsx) polls status every 3 s and enables the refresh control on a higher `sequence`. A new generation restarts at sequence 1, so after a restart no fresher analysis is shown. |
| Daemon | A subscription holds its context against idle eviction ([context-manager.ts](../../../subs/daemon/subs/contexts/src/context-manager.ts) `held`) and counts as daemon activity against idle exit ([host.ts](../../../subs/daemon/src/host.ts)). Context IDs are stable hashes of root, scope, configuration and setup; generations are random per open. |

No daemon, contexts, analysis, model or principles change is required.

## Contracts

### C1. Server entry

```text
node dist/src/explorer-entry.js --root <dir> [--port <n>]
```

- `--root` is required and resolved against the process working directory.
  Scope is `whole-project`, configuration `discover`, setup equal to the one
  `ramify explore` uses, so both obtain the same context ID.
- `--port` defaults to `0`. A fixed port that is in use fails startup with exit 1.
- The endpoint directory, build key and version are derived exactly as the CLI
  derives them (`selectEndpoint`, `RAMIFY_ENDPOINT_DIR`, `package.json`). The
  old three flags are removed.
- The listener binds `127.0.0.1`. Accepted `Host` values are
  `127.0.0.1:<port>` and `localhost:<port>`; `Origin`, when present, must be
  `http://` plus one of those.
- `SIGINT` and `SIGTERM` stop with reason `explicit`; exit code 0.
- Logs go to stdout/stderr. The detached launcher keeps redirecting them to
  its log file.

### C2. Project binding

A service-api `ProjectBinding` owns the daemon connection and the context:

```ts
export type BindingState =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'ready'; readonly token: ContextToken }
  | { readonly kind: 'daemon-stopped' }             // explicit ramify stop
  | { readonly kind: 'project-unavailable'; readonly message: string }
  | { readonly kind: 'retrying'; readonly message: string; readonly nextAttemptAt: number };

export interface ProjectBinding {
  readonly root: string;
  state(): BindingState;
  service(): RamifyService | null;   // null unless state is ready
  close(): Promise<void>;
}
```

| Event | Binding behavior |
| --- | --- |
| Start | Connect with `start: 'if-needed'` and the installed daemon entry, open the context, subscribe, become `ready`. |
| `context-evicted` event | Open and subscribe again; the token's generation changes. |
| Connection `unavailable` or failure | `retrying`; back off 1, 2, 5, 10, then every 30 s; each attempt may start the daemon. |
| Explicit stop (`explicit-stop` reason or a stopped record with reason `explicit`) | `daemon-stopped`. Every 5 s, connect with `start: 'never'`; when another client starts the daemon, open and subscribe again. The server never overrides an explicit stop. |
| Idle exit observed | Treated as a failure. It cannot occur while the subscription is valid. |
| Open returns `unresolved` or `unavailable` | `project-unavailable` with the first message; retry every 30 s. |
| `close()` | Unsubscribe, close context and connection; idempotent. |

The subscription keeps the context's compiler retained while the server runs.
That memory cost is accepted for this plan and measured in RS14.

### C3. HTTP routes and procedures

| Route | Response |
| --- | --- |
| `GET /` | Browser app: home page listing pages. One entry: "Module explorer" → `/analysis/latest`. Shows project root and binding state. |
| `GET /analysis/latest` | Browser app: explorer on the newest published revision. |
| `GET /explore/*` | `302` to `/analysis/latest` (old launcher URLs). |
| `GET /health/ready` | Unchanged readiness JSON. |
| `/trpc` | Procedures below. |

The browser sends no token. Procedures read the binding:

```ts
serverStatus(): { root: string; binding: BindingState['kind']; message: string | null;
                  published: ContextRevision | null }
projectView({ revision?: RevisionId }): ProjectViewResult          // unchanged result shape
explorerDetails({ revision: RevisionId; requests }): ExplorerDetailsResult
```

- Not `ready` → `{ status: 'unavailable', reason }` for `projectView` and
  `explorerDetails`.
- A requested revision whose generation differs from the current token's
  generation → `superseded` for `explorerDetails`, and `projectView` ignores
  the revision and returns latest.
- `contextStatus` is replaced by `serverStatus`.

### C4. Fresher analysis indicator

The page polls `serverStatus` every 3 s while visible. A published revision is
newer than the displayed one when its revision ID differs and either its
generation differs or its sequence is greater. The existing refresh control
turns stale; clicking loads latest. When `binding` is not `ready`, the page
keeps its displayed model and shows a one-line connection notice.

### C5. Discovery and `ramify explore`

- The record becomes `explorer-<buildKey>-<projectKey>.json` (lock and log
  alike), where `projectKey` is the first 16 hex digits of the context ID.
  The record adds `root` and `context`.
- `ramify explore [--root]` opens its context as today, derives `projectKey`,
  reuses a ready server for that project (PM2-managed or not) or spawns
  `explorer-entry.js --root <resolved root>` detached, opens
  `<origin>/analysis/latest`, prints the URL and exits.
- If the browser opener fails, the CLI prints the URL and exits 0, and does
  not terminate the server.
- A detached server started by `ramify explore` is resident like the PM2 one;
  stop it with a signal.

### C6. PM2

`ecosystem.config.cjs` gains:

```js
{ name: 'explorer', script: 'dist/src/explorer-entry.js', interpreter: 'node',
  args: '--root /ramify --port 4302', cwd: '/ramify', watch: false }
```

The PM2 environment must select the same endpoint directory as the shell
(`XDG_RUNTIME_DIR` or `RAMIFY_ENDPOINT_DIR`); otherwise the server talks to a
different daemon. The home page shows the daemon PID so that mismatch is
visible. After `npm run build`, restart the PM2 app.

## Architecture changes

[Processes and clients](../../architecture/processes-and-clients.md) currently
describes an on-demand web process with browser leases and idle exit. Iteration
4 revises its web-server and launch sections: the web process is resident, owns
one project subscription, has no idle exit, and respects explicit daemon stops.
PC05 is restated accordingly. The roadmap links this plan.

## Ownership

| Owner | Change |
| --- | --- |
| `service-api [dispatch]` | `ProjectBinding`; token-free router; routes, host policy, fixed port; per-project discovery record and launcher arguments. |
| root `src/` | `explorer-entry.ts` arguments, binding assembly and signal reason; `explore-launcher.ts` per-project launch. |
| `cli [dispatch]` | `explore` uses the per-project launch, `/analysis/latest` URL and print-on-opener-failure. |
| `explorer [ui, browser, dispatch]` | Path routing, home page, token-free client, revision comparison and connection notice. |
| `integration-tests [testing, ui, dispatch]` | Router, process and real-browser evidence. |

Exposure changes are limited to renamed or added service-api symbols and the
shared context setup needed by both the CLI and the entry. If sharing the setup
constant needs a new exposure, iteration 2 adds the narrowest legal one.

## Iterations

| # | Title | Outcome |
| --- | --- | --- |
| 1 | Project binding | `ProjectBinding` with every C2 transition under quick tests. |
| 2 | Token-free server | C1, C3 and C5 server side: entry, routes, procedures, host policy, per-project record and launcher. |
| 3 | Home page and fresher indicator | C3 browser routes, home page, C4 comparison and notice. |
| 4 | CLI, PM2 and gate | C5 CLI, C6, architecture/roadmap edits and the actual process/browser acceptance. |

Iterations run in order; each file is self-contained.

## Acceptance

Fixtures: `reference` is Collection Review, `toolkit` is Ramify, `mutation` is
an isolated temporary copy of a small real project.

| ID | Iter | Evidence | Required witness |
| --- | ---: | --- | --- |
| RS01 | 1 | quick | Start opens and subscribes; state `ready` with the daemon's token. |
| RS02 | 1 | quick | A `context-evicted` event yields a new generation and `ready` without external action. |
| RS03 | 1 | quick | Connection failure → `retrying` with the stated backoff → `ready` after the daemon returns. |
| RS04 | 1 | quick | Explicit stop → `daemon-stopped`; no start attempt; resumes after another client starts the daemon. |
| RS05 | 1 | quick | Unresolved project → `project-unavailable`, then `ready` once resolvable. |
| RS06 | 1 | quick | `close()` releases the subscription, context and connection, twice without error. |
| RS07 | 2 | router | No procedure accepts a token; `projectView` returns latest; unavailable while not `ready`. |
| RS08 | 2 | router | `explorerDetails` for a previous generation's revision returns `superseded`. |
| RS09 | 2 | HTTP | `/`, `/analysis/latest` serve the app; `/explore/x/y` redirects; `localhost:<port>` and `127.0.0.1:<port>` accepted; other hosts and origins 403. |
| RS10 | 2 | process | `--root --port` starts on the fixed port; `SIGINT` exits 0 with record `stopped/explicit`; a busy port exits 1. |
| RS11 | 3 | component | Home lists the module explorer link, root and binding state. |
| RS12 | 3 | component | Displayed `gen A:5`, published `gen B:1` → stale control; same revision → not stale; notice shown while not `ready` and the model stays. |
| RS13 | 4 | browser | Real server + Chromium on `mutation`: edit a file → stale control → refresh shows the change at the same URL. |
| RS14 | 4 | browser | Kill the daemon: page shows the notice, then recovers at the same URL with a newer generation and the stale control. Server and daemon RSS recorded before and after ten edits. |
| RS15 | 4 | process | `ramify stop`: server stays `daemon-stopped`, does not restart it; `ramify check` restarts the daemon and the server resumes. |
| RS16 | 4 | process | `ramify explore` reuses a PM2-started server for the same root (no second PID) and prints `/analysis/latest`; for another root it starts a separate server. |
| RS17 | 4 | process | Existing Plan 6/6A explorer browser workflows pass against `/analysis/latest` on `reference` and `toolkit`. |

Quick and component evidence do not establish RS13–RS17.

## Deferrals

- Several projects in one server, and a project list on the home page.
- Pushed events (SSE or WebSocket) instead of polling.
- Letting a held context cool and reload on visit.
- Idle exit, leases or a `ramify explore --stop` command for the resident server.
- Automatic restart after a rebuild changes the build key.
- Revision permalinks; only `latest` exists.
- Authentication or binding to non-loopback interfaces.
