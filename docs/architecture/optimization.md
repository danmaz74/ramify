# Optimization

**Date:** 2026-09-13. **Status:** The per-invocation client is implemented as a
Bun-compiled bytecode executable, built for the host platform. The Node entry
remains a supported client. macOS measurement, darwin signing and per-platform
publication are open. The ranked analysis, daemon and hook targets are in the
[optimization targets analysis](../analysis/fast-incremental-checks-optimization.md).
Budgets follow [two kinds of budget](memory-lifecycle.md#two-kinds-of-budget).

## Node startup on every invocation

The agent's post-write hook runs `ramify check --changed <path>` once per edit.
Each run starts a new client process. The daemon keeps the analysis warm, but
nothing keeps the client warm. A Node client therefore pays for Node's startup
before any Ramify work begins.

### Measured

Linux x64, 12 cores, Node v22.23.2, 2026-09-13. Each figure is the average of 50
runs after three warm-up runs, with output discarded.

| Invocation | ms |
| --- | ---: |
| `/bin/true`, bare process start | 0.6 |
| `node -e 0`, bare Node | 24 |
| `ramify --version` | 32 |
| `ramify --help` | 32 |

The built entry used for this table predated the resident client, so its
`--version` loads the batch-era CLI modules. The analysis's
[client cost](../analysis/fast-incremental-checks-optimization.md#client-cost)
phases cover the resident client, measured on Linux x64 with the same Node
version. Node bootstrap takes
about 21 ms and importing the CLI modules about 16 ms, and bare Node measured
25.8 ms there. Enabling `NODE_COMPILE_CACHE` made no measurable difference.
The [measured results](#measured-results) below compare the resident Node entry
with the compiled client.

A small native binary, such as a Go program, typically starts in 1 to 2 ms. This
is an estimate: no Go toolchain was available on the measurement host.

### Why it matters

The per-call cost is 30 to 37 ms of Node startup. Of the measured 201 ms spawned
Node client, it is under a fifth. After target 3 (root resolution reuse) and
target 5 (build-key cache) of the analysis, the client is estimated to reach
`check` in 60 to 70 ms. Node startup would then be more than half of that
figure. It becomes the largest fixed cost of a hook that the watcher has already
published, and it is paid on every edit.

Node-side measures cannot remove it. A compile cache showed no gain. Bundling
for Node saved 4 to 5 ms in the spike, and a V8 startup snapshot can reduce only
the same module-import share. The roughly 21 to 24 ms bootstrap remains.

## Native client

The per-invocation client is a Bun-compiled executable built from the same
TypeScript as the Node entry. It talks directly to the resident daemon. The
daemon, analysis engine and batch sessions stay in Node.

`bun build --compile --bytecode` embeds the Bun runtime and the client's
JavaScriptCore bytecode in one executable. Protocol, validation, recovery and
rendering keep one TypeScript implementation, shared with the Node entry. A Go client is estimated to start in 1 to 2 ms, against the
executable's measured 4.4 ms floor. The [Bun startup spike](../../scripts/spikes/bun-cli-startup/README.md)
records the measured variants and the failure-path findings.

### Scope

| Invocation | Runs in |
| --- | --- |
| `ramify check`, including `--changed`, `--since` and `--deadline` | compiled client |
| `ramify watch` | compiled client |
| `ramify daemon status`, `ramify daemon stop` | compiled client |
| `ramify --help`, `ramify --version` | compiled client |
| `ramify check --batch`, and batch fallback after exhausted recovery | Node child `node dist/src/batch-entry.js`, started by the compiled client |
| Daemon startup | Node daemon entry, started by the compiled client with `node` from `PATH` |
| `ramify mcp`, when implemented | Node; see [open questions](#open-questions) |
| External Node service clients | the TypeScript `connectDaemon` client |

`watch` shares the CLI handler, so it needs no handoff. The compiled client
requires `node` on `PATH`, as the Node entry's `#!/usr/bin/env node` shebang
already does.

### Contracts preserved

- **Invocation.** Both clients run `src/cli-process.ts`, which owns argv,
  SIGINT, standard streams and result publication, and the same CLI handler.
  Root and configuration selection, warnings, human and JSON output, and exit
  codes 0, 1, 2 and 130 therefore follow [CLI invocation](cli-invocation.spec.md)
  in both. An interrupt after a result is published retains that result's exit
  code.
- **Wire protocol.** The executable bundles the TypeScript client, so framing,
  frame limits, message validation, handshake and compatibility rules are
  unchanged.
- **Batch.** The Node child runs one batch analysis and writes its `BatchResult`
  as JSON to stdout. The client validates the result's shape, bounds it by the
  report capacity and renders it with the Node entry's exit codes and fallback
  wording. An interrupt sends SIGTERM to the child; the run resolves as
  cancelled once the child exits. A failed spawn reports a stable message with
  its code, for example
  `Error [internal-error]: Cannot start node for batch analysis (ENOENT)`, and
  exits 2.
- **Launch and lifecycle.** The executable's modules load from an embedded file
  system, and its `process.execPath` is the executable. It therefore locates the
  package two levels above its own path and passes `packageRoot`, `daemonEntry`
  and `daemonRuntime: 'node'` through `ConnectOptions`. Concurrent start
  coordination, stale-record handling, bounded recovery and explicit-stop
  semantics follow
  [launch, compatibility and shutdown](processes-and-clients.md#launch-compatibility-and-shutdown).
  A daemon runtime that fails to spawn has no pid; the launcher treats it as
  never started and releases the start lock. Under Bun such a child emits no
  `exit` and keeps a null exit code, which would otherwise leave the launcher
  waiting indefinitely while holding the lock.
- **Compatibility identity.** Endpoint selection hashes the dist JavaScript
  files, and requires only JavaScript `bin` entries among them. The launcher and
  executable are not hashed. See [identity limitation](#identity-limitation).
- **Dependency boundaries.** The build fails if the bundle's inputs include the
  engine (`dist/subs/analysis`, `batch.js`, `batch-entry.js`), presentation, MCP
  or web modules, the daemon host modules (`daemon-entry`, `resident-assembly`,
  `service`, `host`, `start-daemon`, `filesystem-watcher`, `system-clock`,
  `contexts`) or any `node_modules` package. This is the boundary the Node
  entry's process tests enforce. The bundle has 22 modules, about 100 KB.

### Identity limitation

The build key still hashes the dist JavaScript files on each invocation, about
9 ms in the compiled client. The executable's own bytes are not part of the key.
The build replaces `dist` atomically, including the launcher and executable, so
an installed build keeps them together. Binding the executable to the
precomputed runtime identity belongs with target 5, item 6 of the
[hook optimization plan](../plans/iteration-5-hook-optimization/main-plan.md).

### Verification

- `src/tests/compiled-client.test.ts` observes the executable from outside,
  because the Node process probe, a `NODE_OPTIONS` preload, does not load into a
  Bun executable. It verifies:
  - help, version and invalid-invocation output equal to the Node entry's;
  - `--batch` report bytes equal to the Node entry's apart from `runId`;
  - a cold start launches the Node daemon;
  - resident `check`, JSON and `--changed` output equal to the Node entry's
    apart from run ids and timing fields;
  - without `node` on `PATH`, exit 2 promptly with no start lock left;
  - SIGINT during a batch run exits 130 and leaves no child;
  - a closed stdout exits 2;
  - an npm-installed package's bin runs the compiled client.
- `src/tests/launcher-script.test.ts` verifies the launcher through a symlinked
  bin, argument preservation and fallback to the Node entry.
- The existing Node-probe process suites keep verifying the Node entry. Quick
  tests keep exercising the TypeScript client in process through direct adapters
  ([quick testing](quick-testing.spec.md)).
- The compiled client's source is ordinary TypeScript in the root owner, so
  Ramify's self-check covers it. The launcher is a shell script outside the
  module model.

### Packaging

- `npm run build` compiles `dist/src/compiled-entry.js` with the pinned
  devDependency `bun@1.4.2`:
  `bun build --compile --bytecode --format=esm --target=bun`. Autoloading of
  `.env`, bunfig, tsconfig and package.json is disabled, so the client reads none
  of the checked project's files as configuration. The output is
  `dist/src/ramify-client-<uname -s>-<uname -m>`, for the host platform only.
- The package's `bin.ramify` is `dist/src/ramify`, a POSIX `sh` launcher built
  from `src/ramify`. It resolves bin symlinks, runs `uname -sm` and `exec`s the
  host's executable when present, otherwise `node dist/src/cli-entry.js`.
- The Node entry remains a supported client with identical contracts and can be
  run directly as `node dist/src/cli-entry.js`. It starts slower but never
  differs in result.
- Each executable embeds the Bun runtime: 84 MB on linux-x64 (38 MB gzipped),
  65 to 84 MB across the darwin and linux targets.
- Windows is unsupported; the Unix-domain socket transport already requires
  POSIX.

### Measured results

The implemented client, measured 2026-09-13 on Linux x64, 12 cores, Node
v22.23.2, Bun 1.4.2. Mean wall time of a spawned process in ms, 50 runs after
three warm-ups, variants interleaved, with a warm daemon on the reference
example and load average about 1.2. Raw data:
[results-linux-installed.json](../../scripts/spikes/bun-cli-startup/results-linux-installed.json).

| Floor | ms |
| --- | ---: |
| `/bin/true` | 1.0 |
| `sh -c true` | 1.0 |
| `node -e 0` | 25.7 |

| Invocation | Node entry | Compiled client | Through `dist/src/ramify` |
| --- | ---: | ---: | ---: |
| `--version` | 44.9 | 10.4 | 11.1 |
| `daemon status` | 80.2 | 24.5 | 25.2 |
| `check --changed`, the hook | 191.5 | 133.5 | 134.7 |

- The installed command saves about 34 ms on `--version` and about 55 ms on
  each daemon command. The hook drops from 191 to 135 ms.
- The launcher adds under 1 ms over running the executable directly.
- The [spike](../../scripts/spikes/bun-cli-startup/README.md) measured the
  alternatives. Without `--bytecode`, a compiled client was no faster than
  running `dist` under `bun`. Bundling for Node alone saved 4 to 5 ms. An empty
  compiled executable starts in 4.4 ms.
- The remaining hook time is daemon-side work, which targets 1 to 3 of the
  analysis address.

## Open questions

- macOS latency against the acceptable-time budget. Only Linux was measured.
- Signing and notarization of darwin executables, which were not tried.
- Publishing per-platform executables. The package is private and the build
  compiles only the host's executable.
- Whether the hook should run the host executable directly, bypassing the
  launcher.
- How `ramify mcp` starts its Node serving entry once implemented. The MCP SDK
  is outside the compiled client's dependency boundary.
- The client's end-to-end hook latency once targets 3 and 5 land. Measure it
  to confirm the estimated saving.
