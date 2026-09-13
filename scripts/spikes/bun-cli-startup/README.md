# Spike: Bun for the per-invocation client

**Date:** 2026-09-13. **Status:** adopted; the [native client](../../../docs/architecture/optimization.md#native-client)
records the implemented design. **Branch:** `feat/bun-compiled-client` (started as `spike/bun-cli-startup`).

The implementation replaced this spike's source patches. The
[Variants](#variants) section, with its `entry.mjs`, `build.sh` and source
changes, and the [Reproduce](#reproduce) steps describe the spike only. The
[spawn-failure hang](#the-spawn-failure-hang) is fixed in `launcher.ts`, and
external process tests now verify the compiled client. The measurements below
are unchanged. [bench-installed.mjs](bench-installed.mjs) measures the implemented
installed command; its results are [results-linux-installed.json](results-linux-installed.json).

Question: can Bun replace Node for the per-invocation client, removing the Node
startup cost described in [optimization](../../../docs/architecture/optimization.md#node-startup-on-every-invocation),
without writing the client again in another language? The daemon and batch
analysis stay in Node, as that document requires.

## Variants

All variants are built from the same `tsc` output in `dist/`.
[`entry.mjs`](entry.mjs) sets the Node daemon entry, passes `--batch` to the Node
entry and otherwise loads `dist/src/cli-entry.js`. [`build.sh`](build.sh) produces:

| Variant | Output |
| --- | --- |
| node + bundle | `dist/bun/ramify-node.js`, a Bun-bundled file run by Node |
| bun + bundle | `dist/bun/ramify.js`, run by `bun` |
| bun compile | `dist/bin/ramify`, a single executable |
| bun compile --bytecode | `dist/bin/ramify-bytecode`, which also stores JavaScriptCore bytecode |

The resident client bundles to 62 modules and 270 KB once `./batch.js` is
external.

Source changes, each marked `SPIKE(bun-cli-startup)`:

- [launcher.ts](../../../subs/daemon/src/launcher.ts) spawns the daemon with `node`
  when the client runs in Bun, since `process.execPath` would be Bun or the binary.
  `RAMIFY_NODE` overrides the path.
- [connect-daemon.ts](../../../subs/daemon/src/connect-daemon.ts) and
  [cli-entry.ts](../../../src/cli-entry.ts) locate the package from the executable
  when modules load from Bun's embedded `/$bunfs/` file system.

## Latency

Linux x64, 12 cores, Node v22.23.2, Bun 1.4.2. Wall time of a spawned process, in ms.
Each figure comes from 50 runs after 3 warm-up runs, with variants interleaved
round-robin and output discarded. The daemon was warm, on the reference example.
Peer sessions shared the host (load average 1.9 to 2.4). Raw data:
[results-linux.json](results-linux.json); harness: [bench.mjs](bench.mjs).

| Floor | mean |
| --- | ---: |
| `/bin/true` | 1.0 |
| `node -e 0` | 24.2 |
| `bun -e 0` | 4.6 |
| Bun compiled empty executable | 4.4 |

| Variant | `--version` | `daemon status` | `check --changed` (hook) |
| --- | ---: | ---: | ---: |
| node (today) | 45.4 | 78.9 | 190.2 |
| node + bundle | 41.6 | 76.5 | 184.9 |
| bun, unbundled `dist` | 23.8 | 45.6 | 154.5 |
| bun + bundle | 26.8 | 45.8 | 156.7 |
| bun compile | 26.5 | 45.3 | 158.0 |
| **bun compile --bytecode** | **11.7** | **25.4** | **136.1** |
| bun compile --bytecode --minify | 11.5 | 24.9 | 135.7 |

- The bytecode binary saves about 34 ms on `--version`, and about 54 ms on each
  daemon command, including the hook. The hook drops from 190 to 136 ms (28%).
- Without `--bytecode`, compiling is no faster than running `dist` with `bun`.
  Parsing the 270 KB bundle costs about 15 ms. Minifying adds nothing.
- Bundling for Node saves 4 to 5 ms, at the low end of the earlier 5 to 10 ms estimate.
- The remaining 110 ms of the hook is daemon-side work (targets 1 to 3 of the
  [optimization targets analysis](../../../docs/analysis/fast-incremental-checks-optimization.md)),
  which a faster client does not change.
- Hashing the 152 runtime files for the build key takes about 9 ms warm in Bun
  (20 ms in Node). Precomputing the runtime identity (target 5) would bring the
  binary's `daemon status` to roughly 15 ms, against 1 to 2 ms estimated for Go.

## Behavior

Compared with the Node entry on the same warm daemon:

| Case | Result |
| --- | --- |
| `--version`, `--help`, invalid invocation (exit 2) | identical output and exit code, all variants |
| `check`, human output | identical |
| `check --format json` | identical apart from the random `runId` |
| `check --changed` | identical apart from measured wait times |
| `daemon status` | identical |
| `check --batch` | identical; the Bun entry passes it to Node |
| Cold start from the binary | starts `node dist/src/daemon-entry.js`; check exits 0 |
| SIGINT during a cold check | exit 130, `Interrupted; no result claimed.` |
| `watch`, then SIGINT | two revision lines, exit 130 |
| 11.4 MB JSON report to a reader that waits 2 s | complete output, exit 0 |
| Reader closes stdout early | exit 2, `output-failure` |
| **Daemon runtime cannot spawn** | **Node falls back to batch, exit 0. Bun hangs until killed.** |
| Unbundled `bun dist/src/cli-entry.js check --batch` | analysis does not run under Bun (exit 2) |

### The spawn-failure hang

After `spawn` fails with ENOENT, both runtimes emit `error` and `close` but not
`exit`. Node also sets `child.exitCode` to `-2`; Bun 1.4.2 leaves it null.
`terminateUnreadyChild` in [launcher.ts](../../../subs/daemon/src/launcher.ts#L90)
returns early on a non-null exit code, so under Bun it waits indefinitely for `exit`. The start lock stays held and is left on disk.
Bun also reports a `FileHandle` for the lock closed by garbage collection as an
`ERR_INVALID_STATE` error, where Node only warns.

This is reachable in production whenever `node` is missing from `PATH`. A fix
would treat a child without a `pid` as never started, or wait for `close`. The
general lesson is that Node-compatibility gaps show up on failure paths the
happy-path comparison does not exercise.

## Verification gaps

- The process tests ([process.ts](../../../src/tests/process.ts)) observe the
  client through a Node `--import` preload in `NODE_OPTIONS`, which Bun ignores.
  They cannot verify a Bun client without a second probe mechanism.
- macOS was not measured. Cross-compiling from Linux works
  (`--target=bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-arm64`).
  Signing and notarization were not tried.
- Load was not isolated from peer sessions. Interleaving limits bias, but the
  absolute figures carry a few ms of noise.

## Packaging

| Target | Binary |
| --- | ---: |
| linux-x64 | 84 MB (38 MB gzipped) |
| linux-arm64 | 84 MB |
| darwin-arm64 | 65 MB |
| darwin-x64 | 72 MB |

Each binary embeds the whole Bun runtime. The package would publish one binary
per platform, as the native client plan already assumes, but each is an estimated
10 to 30 times larger than an equivalent Go client.

## Assessment

Against the [native client](../../../docs/architecture/optimization.md#native-client)
contracts:

- **Faster:** most of the Node startup saving is realized (about 54 ms per
  hook), with no second implementation of the protocol, validation, recovery or
  rendering. Dependency boundaries, wire protocol and compatibility identity stay
  in one TypeScript codebase.
- **Slower than native:** the bytecode binary's floor is about 4.4 ms, and it
  loads the client in about 7 ms more. A Go client is estimated at 1 to 2 ms total.
  After target 5, the estimated gap is about 10 ms per hook.
- **New risks:** a second JavaScript runtime whose Node-compatibility gaps show
  up on failure paths (the spawn hang above), process tests that cannot yet
  observe it, and 65 to 84 MB per-platform binaries.

Suggested next steps if pursued: fix the spawn-failure hang so it is correct in
both runtimes; make the process-test probe work under Bun, so the existing
suites cover the binary; and measure on macOS against the acceptable-time budget.

## Reproduce

```sh
curl -fsSL https://bun.sh/install | bash          # Bun 1.4.2
npm run build && scripts/spikes/bun-cli-startup/build.sh
export RAMIFY_ENDPOINT_DIR=$PWD/.ep
node dist/src/cli-entry.js check --root examples/collection-review   # warm the daemon
node scripts/spikes/bun-cli-startup/bench.mjs 50 3
node dist/src/cli-entry.js daemon stop
```
