# Iteration 6 results: Build-time runtime identity

**Date:** 2026-09-13. **Outcome:** HO-17, HO-18, HO-21 and HO-22 pass. The build
writes `dist/runtime-identity.json`, and endpoint selection derives the build key
from it without reading runtime files. A mixed build still fails selection. The
compiled client embeds the build identity and refuses a package with a different
one as `incompatible`, exit 2. Direct work; no Studio workflow.

## Post-merge baseline

`feat/bun-compiled-client` (`b6275fc`) was merged as `b2bf082` without conflicts.
`discovery.ts` keeps its rule that only JavaScript `bin` entries are required
runtime files. The iteration's verification then ran on `b2bf082` before any
change:

| Command | Result |
| --- | --- |
| `npm run build` | pass |
| `npx vitest run subs/daemon/src/tests src/tests/compiled-client.test.ts src/tests/launcher-script.test.ts src/tests/cli-process.test.ts` | 1 failed, 144 passed (17 files) |
| reference harness `final-contracts.test.ts`, `relocation.test.ts` | 15 passed |
| `npm run type-check` | pass |

The failure was `src/tests/compiled-client.test.ts` `starts the Node daemon and
matches the Node entry on the resident path`. It is an interaction between the
two branches. Iteration 1 added `timings.reply` to the check document, with
`service` and `clientTransport` durations. The compiled-client branch predates
that field, and its output normalization masked only `*Ms` and `requestId`
fields. The two clients' reply durations differed, as they do on every run. The
normalization now also masks the `reply` object
(`src/tests/compiled-client.test.ts:75`). The test passes.

## What changed and why

1. **Shared derivation** (`subs/daemon/src/discovery.ts`).
   - `runtimePaths` (`:48`) lists the runtime files and enforces the required
     entries.
   - `deriveIdentity` (`:59`) is today's formula,
     `sha256(JSON.stringify({ packageJson, files }))` over byte-ordered
     `[path, sha256]` pairs.
   - `describeRuntime` (`:64`) applies both to a build directory that is not yet
     named `dist`.

   The build and selection therefore cannot drift apart. The key remains
   `sha256(JSON.stringify([realRoot, version, buildIdentity])).slice(0, 16)`.
2. **Directory listing** (`runtimeFiles`, `:28`). Directories are now read
   concurrently, and only the top directories are checked with `lstat`. Deeper
   symlinks still fail as unexpected artifacts, because a directory entry for a
   symlink is neither a directory nor a file. Only the hashing path sorts. The
   serial walk cost about 2 ms under Bun and 3.5 ms under Node on this tree,
   more than the identity check itself.
3. **Build** (`scripts/build-production.ts:44-50`). After promotion, the build
   writes the identity with `client: null`. It then compiles the client with the
   identity and rewrites the file with the executable's path and SHA-256.
   Both writes come after every runtime file is copied, so no runtime file in
   the promoted tree is newer than the identity file. `dist` is still replaced
   atomically.
4. **Embedding** (`scripts/compiled-client.ts:39-46`). `compileClient` takes the
   identity, passes `--define=RAMIFY_BUILD_IDENTITY="<hex>"` to Bun, and fails
   if the executable does not contain the identity.
   `src/compiled-entry.ts:6,15` declares the constant and passes it to
   `runCliProcess`.
5. **Selection** (`selectEndpoint`, `subs/daemon/src/discovery.ts:138`).
   `recordedIdentity` (`:99`) returns null for a missing, non-regular, oversized
   (over 4 MiB), unparsable or invalid file. Selection then hashes every file
   (`hashedFiles`, `:108`). `validIdentity` (`:81`) requires:
   - the exact keys and schema;
   - 64-hex digests;
   - `dist/src` or `dist/subs` JavaScript paths in strictly increasing byte
     order;
   - non-negative safe-integer sizes;
   - a `client` that is null or `{ path, sha256 }`;
   - a `buildIdentity` that `deriveIdentity` produces from the recorded
     `packageJson` and files.

   When the file is valid, `verifiedFiles` (`:118`) runs the mixed-build check
   described below. The key uses the actual manifest's hash with the recorded
   file hashes, which is exactly what hashing would produce.
   `EndpointSelection` gains `buildIdentity`
   (`subs/daemon/src/interfaces/daemon.ts:55`).
6. **Compiled client binding.**
   - `createBuildRefusal` (`src/client.ts:26`) selects the endpoint, using
     `RAMIFY_ENDPOINT_DIR` as the connector does, and compares identities.
   - `runCliProcess` installs it only when `buildIdentity` is given
     (`src/cli-process.ts:77`), so the Node entry is unchanged.
   - `runCli` awaits `environment.buildRefusal` after argument parsing and
     before dispatch. A refusal throws `CliFailure('incompatible', …)`
     (`subs/cli/src/run-cli.ts:26-27`).

   Help, version and invalid invocations return before that point. Every
   command refuses before it connects, reads a record, starts a daemon or runs
   batch. Human, JSON and watch output use the CLI's existing failure rendering.
7. **Daemon clock** (`src/daemon-entry.ts:58`). The daemon passes its system
   clock to `createFilesystemWatcher(clock)`. That clock's `now` is `Date.now`,
   the watcher's previous default, so behaviour is unchanged. This item was
   carried from iteration 1.
8. **Documentation.** The architecture note's identity limitation is replaced
   by [build binding](../../../architecture/optimization.md#build-binding), and
   target 5 is marked delivered in the
   [analysis](../../../analysis/fast-incremental-checks-optimization.md#5-build-key).

## Identity file format

`dist/runtime-identity.json`, plain JSON, written with two-space indentation:

```json
{
  "schemaVersion": "ramify.runtime-identity/1",
  "buildIdentity": "<sha256 hex>",
  "packageJson": "<sha256 hex of package.json bytes>",
  "files": [
    { "path": "dist/src/batch-entry.js", "sha256": "<sha256 hex>", "bytes": 882 }
  ],
  "client": { "path": "dist/src/ramify-client-Linux-x86_64", "sha256": "<sha256 hex>" }
}
```

- `files` holds every `.js` and `.mjs` file under `dist/src` and `dist/subs`,
  sorted by UTF-8 byte order.
- `buildIdentity` is `sha256(JSON.stringify({ packageJson, files: files.map(f => [f.path, f.sha256]) }))`.
- `client` is null only between the two build writes. No client reads it.
- The file is neither a runtime file nor covered by the identity.

The current build lists 156 files. Its `client.sha256` equals the executable's
hash, and the executable contains `buildIdentity`, found twice by `grep -a -c`.

## Mixed-build check

Selection lists the runtime files. It fails as `Mixed daemon build in <root>:
<detail>; rebuild the package` when:

- a listed path is absent, or a present path is unlisted;
- a file's `lstat` size differs from its recorded `bytes`;
- a file whose modification time is after the identity file's has a different
  hash. Only those files are read.

**Why this check.** Sizes and paths need one `lstat` per file and no read. They
decide added, removed and most replaced files. Modification times cannot be
compared with build-time values, because packing and installing do not keep
them. The check therefore compares each file with the identity file in the same
tree. Every modification after the build makes a file newer than the identity
file, so it is hashed. `npm pack` stores one fixed time for every entry, which
leaves nothing newer, so an installed build is decided without reads. A copy
that makes some runtime files newer than the identity file is slower, but it is
still decided by hashing.

**What it misses.** A same-size change whose modification time is not after the
identity file's goes undetected. Examples:

- a file from another build copied with a preserved time (`cp -p`, `rsync -a`,
  `tar` extraction), including two packed tarballs extracted over each other;
- an explicit `touch -d` or `utimes` to an earlier time;
- an edit within the same timestamp granularity as the build's identity write,
  on file systems with coarse timestamps.

In those cases the recorded hash derives the key. The unit test
`build-identity-read` demonstrates this at `subs/daemon/src/tests/discovery.test.ts:126-128`.

**Cost.** These are in-process samples on Linux x64, 50 selections after 5
warm-ups against this worktree's `dist`, not a harness measurement:

| Selection | Bun 1.4.2 | Node |
| --- | ---: | ---: |
| From the identity file | 1.6 ms | 3.4 ms |
| Hashing (no identity file), concurrent listing | 8.1 ms | 17.5 ms |
| Hashing, serial listing before this iteration's change | 18.6 ms | 35.3 ms |

The first sample of the unmodified hashing path was taken with the serial
listing and the identity file removed. All variants produced the same key.

## `incompatible` message

```text
Error [incompatible]: this compiled client was built from runtime identity <first 12 hex of embedded>, but <package root> holds <first 12 hex of selected>; rebuild the package with npm run build
```

- Exit code 2.
- With `--format json`, stdout carries `{"schemaVersion":"ramify.cli/1","status":"unavailable","diagnostics":[{"category":"execution","code":"incompatible","message":…}],"exitCode":2}`.
- With `watch --format json`, stdout carries a `ramify.watch/1` `unavailable` line.
- `<package root>` is the path two levels above the executable, as the client
  locates it.

## Tests per matrix row

| Row | Test | Evidence | Result |
| --- | --- | --- | --- |
| HO-17 | `subs/daemon/src/tests/discovery.test.ts:115` `build-identity-read: selection reads the written identity and yields the key hashing yields` | See below | pass |
| HO-18 | `subs/daemon/src/tests/discovery.test.ts:146` `mixed-build-detected: a changed, missing or added runtime file after the build fails selection` | See below | pass |
| HO-22 | `subs/daemon/src/tests/discovery.test.ts:175` `installed-identity: a copy without build modification times derives the hashing key and still detects changes` | See below | pass |
| HO-21 | `src/tests/compiled-client.test.ts:82` `compiled-identity-bound: refuses a package whose runtime identity differs from the embedded one` | See below | pass |

**HO-17.**

- The written identity equals the expected document, and its `buildIdentity`
  equals the hashing selection's.
- Selection with the file equals the hashing endpoint.
- A same-size replacement set to an earlier time leaves the key unchanged, which
  shows the file is not read.
- With the file removed, the key changes.
- Selection falls back to hashing for each of these identity files: unparsable,
  wrong schema, inconsistent identity, reordered files, extra key, negative
  size, and a symlink.

**HO-18.**

- A size change fails.
- A same-size change with a newer time fails through hashing.
- Restoring the content selects again.
- A removed listed file fails as `absent`.
- An added `.mjs` fails as `not listed`.
- A declaration file is ignored.
- A missing required entry still reports `Missing or incomplete daemon build`.

**HO-22.**

- The package is copied with `fs.cp`, and every file is given npm pack's fixed
  1985 time. The copy derives the original `buildIdentity`, and its key is the
  hashing formula for the copy's root.
- An identity file older than the runtime files selects the same endpoint by
  hashing, as does a removed identity file.
- After reinstating the identity file, a same-size edit fails.
- A size change reset to the packed time also fails.

**HO-21.**

- The test copies `dist`, hard-links the executable (copying it if linking
  fails), copies `package.json` and links `node_modules`.
- The matching copy runs `check --batch --format json` with exit 0.
- After one runtime file and the identity file are rewritten consistently,
  `check`, `check --batch`, `check --changed`, `watch` and `daemon status` each
  exit 2. Each has empty stdout and the `incompatible` message naming the
  copy's identity and the rebuild.
- `check --format json` yields the `incompatible` diagnostic.
- `--version` still exits 0.
- The endpoint directory stays empty, and no process mentions the copy.

## Revised expectations

- `src/tests/compiled-client.test.ts:75`: the resident-path comparison also
  masks `timings.reply`, whose durations vary per run. See the post-merge
  baseline.
- `subs/daemon/src/tests/ipc-fixture.ts:27`: the hand-built `EndpointSelection`
  supplies `buildIdentity`, required by the extended interface. The IPC host
  does not read it.

No existing assertion changed otherwise. The existing hashing tests run on
fixtures without an identity file and pass unchanged.

## Verification

After all changes:

| Command | Result |
| --- | --- |
| `npm run build` | pass; the identity file is present and the client embeds it |
| `npx vitest run subs/daemon/src/tests src/tests/compiled-client.test.ts src/tests/launcher-script.test.ts src/tests/cli-process.test.ts` | 17 files, 149 passed |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/final-contracts.test.ts scripts/reference-harness/relocation.test.ts` | 2 files, 15 passed |
| `npm run type-check` | pass |
| `git diff --check` | clean |

Additional focused runs:

- `npx vitest run subs/cli/src/tests`, because `run-cli.ts` changed: 3 files,
  123 passed.
- `dist/src/ramify check --batch --root .`: 11 owners, exit 0. It reports 5
  `not-visible` errors, all in lines this iteration did not touch:
  - `subs/analysis/src/tests/root-resolution.test.ts:11` (three);
  - `subs/cli/src/interfaces/cli.ts:4` `ReplyTimings`;
  - `subs/daemon/subs/contexts/src/tests/scripted-driver.ts:4` `OperationTimings`.

  They come from earlier iterations and are recorded, not fixed.

The cucumber-viz commit audit was not run here. It runs the full check suite,
which this iteration's brief excluded; the caller owns that step.

## Deviations and limits

- **`cli` owner changed.** The iteration names `daemon`, root and the build
  scripts. A batch run has no connection outcome that the CLI renders as a
  coded failure, and the root cannot construct the CLI's `CliFailure`.
  `CliEnvironment` therefore gains an optional `buildRefusal`
  (`subs/cli/src/interfaces/cli.ts:18-20`), which `runCli` awaits before
  dispatch. No exposure line or package entry changed.
- **`EndpointSelection.buildIdentity`** is a new required field on an exposed
  interface, so the client compares the identity selection establishes.
- **Two selections on a daemon command.** The compiled client selects once to
  compare identities, and `connectDaemon` selects again, about 1.6 ms each
  under Bun. A single selection would need either `ConnectOptions` to accept an
  established identity or a daemon-side refusal, which a batch run would still
  lack. This is left for the measurement successor to weigh.
- **Batch now selects an endpoint in the compiled client.** Selection creates
  and verifies the endpoint directory. An unsafe or overlong
  `RAMIFY_ENDPOINT_DIR` therefore fails `check --batch` in the compiled client,
  where it previously ran. The Node entry is unaffected.
- **A manifest edited after the build** changes the selected identity without a
  mixed-build failure, exactly as hashing does. The compiled client then
  refuses it as `incompatible`.
- **Mixed-build misses** are listed under the mixed-build check.
- The identity file is part of `dist`. The package has no `files` list, so
  whether `npm pack` includes `dist` is governed as before this iteration.
- **Race.** A runtime file removed between listing and `lstat` fails selection
  with the raw `ENOENT`.

## Handoff

- **Identity file:** `dist/runtime-identity.json`, schema
  `ramify.runtime-identity/1`, format above. Both clients can read it as plain
  JSON.
- **Mixed-build check:**
  - listed paths equal the present runtime files;
  - sizes equal the recorded sizes;
  - files newer than the identity file are hashed.

  It misses same-size changes that are not newer than the identity file.
  Malformed or missing identity files fall back to full hashing.
- **Compiled client:** `Error [incompatible]: this compiled client was built
  from runtime identity <12 hex>, but <root> holds <12 hex>; rebuild the package
  with npm run build`, exit 2. It is raised after parsing and before any
  connection or batch run. Help and version run without an identity.
- **Measurement inputs:**
  - In-process selection takes about 1.6 ms under Bun and 3.4 ms under Node from
    the identity file, against 8.1 and 17.5 ms hashing.
  - The compiled client pays selection twice on daemon commands.
  - The Node entry pays it once.
