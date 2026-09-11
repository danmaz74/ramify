# Iteration 7: Codec, discovery and the lightweight client

**Plan:** [Plan 2: Keep verification current](../main-plan.md).
**Prerequisites:** iteration 5 (`daemon-service`, the quick environment, the
exposed message codec and connect vocabulary). May run in parallel with
iteration 6. **Owners:** `subs/daemon/` (N2's discovery and client lines;
the discovery and client-option portion of N4: `EndpointSelection`,
`ConnectTimeouts` and `ConnectOptions`; `src/client-entry.ts`; private
`connection.ts`, `launcher.ts` and `records.ts`); root R7 relay; the
`./client` package entry.

## Goal

Deliver the wire and its client: length-prefixed frames of one `WireMessage`,
endpoint discovery and records, and the lightweight `connectDaemon` client
with handshake, per-connection ordering, cancel, pings, leases and bounded
recovery, importable from `ramify.ts/client` without any engine. No socket
host exists yet: the listener core, `startDaemon` and every `ipc` and
`process` matrix instance belong to iteration 8, so this iteration's evidence
is its owner tests over the in-process quick connector and a scripted socket
peer.

## Read first

- [contracts.md](../contracts.md): IPC framing, messages and notification
  rules; Client and transport lifecycle; Package entries and activation; the
  wire portion of Daemon: service binding, client, host and records.
- [scope.md](../scope.md): Deployment arrangement; Endpoint discovery and
  grouping; Startup, retry and recovery limits; Context and daemon budgets.
- [owners.md](../owners.md): Daemon, Package entries and their runtime
  closures, the iteration 7 row of the Activation manifest.
- Main plan: Resolved decisions 1, 5 and 7; Distinct entries and the
  separately importable client.
- [Processes and clients](../../../architecture/processes-and-clients.md):
  Launch, compatibility and shutdown; Modules and executable entry points.
  [Memory lifecycle](../../../architecture/memory-lifecycle.md): Runtime
  dependency boundaries; Slow consumers and backpressure.
- Iteration 1's `probes.md`: the socket-framing, atomic-record and
  detached-spawn results.
- `src/tests/process.ts` with the iteration 2 traced-process helper.

## Deliverables

1. Framing in `src/codec.ts`: a 4-byte big-endian length followed by one
   message; zero length, oversize, invalid UTF-8 or JSON, or a schema failure
   is a protocol violation answered with `goodbye` `failure` where writable,
   then close. N2's codec line, active since iteration 5, keeps its two
   names and `WireMessage` its iteration 5 declaration; the quick connector
   keeps using the same functions.
2. `src/discovery.ts`: `selectEndpoint` (`RAMIFY_ENDPOINT_DIR`, else
   `XDG_RUNTIME_DIR/ramify`, else `<tmpdir>/ramify-<uid>`; created `0700`;
   ownership and mode verified; `buildKey` over package root, version and
   the `buildIdentity` it computes from `package.json` and
   `dist/src/daemon-entry.js`; `daemon-<buildKey>.{sock,json,lock,log}`; a
   socket path over 100 bytes is `unavailable` naming the override) and
   `readDaemonRecord`; private `src/records.ts` writing records through a
   temporary file and `rename`, used by iteration 8's host.
3. `src/connect-daemon.ts` and private `src/connection.ts`: handshake;
   `reject` with `incompatible` or `rejected` reported as `unavailable` with
   no recovery; client-chosen unique request ids; `cancel` aborting the
   request's signal with the final `response` still delivered; `ping` every
   `pingMs`; event `seq` per connection; `recover('automatic' | 'explicit')`
   following the discovery-state table within `ConnectTimeouts`, with
   `failure` and `slow-consumer` the only automatic triggers; `close` sending
   `goodbye` `{ kind: 'closed' }`. Private `src/launcher.ts` (lock, detached
   spawn, readiness wait) is unit-tested against a fake entry script; real
   startup is iteration 8's.
4. `src/client-entry.ts` exporting `connectDaemon`, `selectEndpoint`,
   `readDaemonRecord`, `encodeMessage`, `decodeMessage` and type re-exports;
   `package.json` gains `./client`; root's R7 relay line activated.
5. Tests: daemon `src/tests/{codec,discovery,connect}.test.ts`. The connect
   tests drive the state machine against a scripted socket peer inside the
   test that answers `hello` with `welcome` or `reject`, echoes frames and
   drops the connection on cue; it is a test double, not the host, and
   satisfies no matrix row.

## Matrix rows executed here

None. I2-14, I2-15 and I2-16 need `startDaemon` over the quick service and
run in iteration 8; `--iteration 7` therefore requires only the instances of
iterations 2 to 5.

## Verification

```sh
npm run build && npm run type-check && npm test
npm run reference:verify -- --plan 2 --iteration 7   # requires 2 to 5; 7 adds no instance
node --input-type=module --import ./src/tests/process-probe.mjs -e "await import('./dist/subs/daemon/src/client-entry.js')"
npm run check:self                                   # N2's discovery and client lines and R7 link to real exports; ./client resolves
git diff --check
```

Evidence kind: owner tests only, quick over the in-process connector and the
scripted peer. A quick run never satisfies an `ipc` or `process` row, so the
matrix credit for this work is taken in iteration 8. `start: 'if-needed'`
against a real entry cannot be verified before iteration 8, so
`connect.test.ts` covers `start: 'never'` and the state machine only.

## Exit criteria

- `ramify.ts/client` loads within its permitted closure under the tracing
  preload, and every message type round-trips through the framed codec in
  owner tests.
- The connection state machine, discovery, records and launcher pass their
  owner tests; no engine, contexts or host module is reachable from the
  client entry.
- contracts.md's and owners.md's iteration 7 rows match what shipped.

## Handoff

Iteration 8 builds `host.ts` and `startDaemon` over this codec, `records.ts`
and `launcher.ts`, and takes the `ipc` and `process` evidence; iteration 9's
CLI and every later process instance connect through `connectDaemon`;
external hosts import `./client`.
