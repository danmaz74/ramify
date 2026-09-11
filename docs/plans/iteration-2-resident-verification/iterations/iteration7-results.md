<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 7 results: discovery, records, launcher and private framing; client blocked

**Recorded:** 2026-09-11. **Status:** partial implementation after one focused self-assessment repair; iteration 7 is not complete.
The repair adds private byte framing and twelve owner cases. The complete WireMessage schema,
service connection and public client entry remain blocked by missing providers; the current
verification and checklist are recorded in the final remediation section.
Work was performed in the authoritative iteration-7 checkout on branch
`workflow-iter/iteration-2-resident-verification/7`, starting at `9a89323`.

## Prerequisites and scope

Read CLAUDE.md, the iteration-work skill, the development guides, iteration 7's
contracts, scope, owners, process/memory architecture and iteration 1's probe
record. Reviewed iteration 5's results and verified its reported provider gaps
against current source. `npm run worktree:prepare` completed successfully.

Workflow detail reports iterations 3–5 published and completed, but publication
has not supplied their missing implementations. There is no `analyzeIncrement`,
`createContextManager`, `ContextEvent`, complete `RamifyService`, message codec,
`WireMessage` or `createQuickEnvironment`. The harness registers only
`harness-gate`. This is the same missing-provider chain recorded by iteration 5.

Iteration 7 owns the client and discovery layer, not the missing analysis,
contexts or shared-service providers. No foreign types, partial `WireMessage`
union, alternate service or batch substitute was introduced. The independent
discovery, record, launch and option contracts are implemented below. The wire,
connection state machine and public client entry remain blocked.

## Implemented work

### Endpoint discovery and records

`subs/daemon/src/discovery.ts` implements the reviewed signatures of
`selectEndpoint` and `readDaemonRecord`.

Endpoint selection follows the explicit option, RAMIFY_ENDPOINT_DIR,
XDG_RUNTIME_DIR/ramify and user temporary-directory precedence. It creates a
private directory, verifies ownership and permission bits, rejects symlinked
endpoint directories, and rejects socket paths over 100 UTF-8 bytes with a
diagnostic naming RAMIFY_ENDPOINT_DIR.

The group key uses the real package path, version and a build identity over
package.json plus the sorted path/content hashes of production .js and .mjs
files under dist/src and dist/subs. Hashing never imports those files. It
requires the daemon entry, declared runtime package entries and an owner runtime
tree, and rejects build symlinks. This implements the stronger iteration-1
contract correction; hashing only daemon-entry.js would miss changed engine
dependencies. The current real build has no daemon entry and therefore cannot
select a resident endpoint. Owner tests supply a fake build.

`subs/daemon/src/records.ts` privately owns record validation, bounded reads,
atomic writes, endpoint checks and conservative PID liveness. Reads use regular
files without following symlinks, require private permissions/current ownership,
bound input to 64 KiB, and reject malformed UTF-8, JSON, schemas, selected
group/socket mismatches and inconsistent lifecycle states. Absence returns null.
Stop dispositions, including missed explicit-stop request IDs, survive unchanged.
Read records are detached and frozen.

The writer creates a 0600 temporary file and renames it into place, with cleanup
on failure. Atomic reader visibility is established; power-loss durability is
not claimed. PID checks treat only ESRCH as proof of death. Permission failures
and other ambiguous liveness results remain errors.

### Private launcher

`subs/daemon/src/launcher.ts` implements one coordinated launch attempt through
the private `launchDaemon` function. Its caller supplies endpoint, absolute
entry path, version, engine, startup deadline and optional AbortSignal. The
future connector remains responsible for start/reconnect/restart counts,
handshake and recovery authorization.

The launcher uses an exclusive start lock, reads records under that lock before
cleanup, and removes stale records/sockets only after verifying the recorded PID
dead. Old live holders and refused sockets with live PIDs remain intact.
Concurrent stale-lock reclamation uses a temporary exclusive .lock.reclaim
guard and re-reads the holder under it, preventing two reclaimers from removing
a newly acquired start lock.

It spawns Node detached with the reviewed endpoint/build/version/engine argv,
redirects output to a verified private log, unreferences the child, closes the
parent's descriptors and waits within startupMs for a running record and
accepting socket. It reports entry exit or timeout explicitly. Readiness does
not establish protocol compatibility. If an existing peer supplies readiness,
the returned started flag identifies whether the spawned child is that peer.

Cancellation never kills a shared child. Before readiness the lock names the
child PID; cancelled or timed-out waiting preserves it while the child remains
alive, preventing a duplicate launch. A later running record remains usable,
and a later dead child makes the lock reclaimable.

### Vocabulary, declarations and dependent fixture

Added the exact independent `EndpointSelection`, `ConnectTimeouts`,
`ConnectOptions` and `DisconnectReason` declarations to daemon's interface.
DisconnectReason is the missing daemon-owned dependency of ConnectOptions and
uses the already exposed root ServiceErrorCode through a type-only import.

N2 exposes the two real discovery functions. N4's owned interface wildcard
includes the new types, and root R7 relays those four implemented originals.
The daemon README records behavior and limitations. The descriptions owner's
exact declaration fixture adds only these actual daemon/root exposure
statements; no parser implementation or assertion was weakened.

No package entry was activated: `./client` must export the actual connector
and codec, which are not implemented. The full iteration-7 activation rows in
contracts.md and owners.md therefore remain unfulfilled. No plan artifact,
capability registration or sibling implementation was changed directly.

## Owner tests and evidence

The initial submission added 20 Vitest owner cases, with a testing-owned fake-build/entry fixture:

- `subs/daemon/src/tests/discovery.test.ts`: 11 cases cover exact independent
  hash expectations, canonical root aliases, changed/additional/removed runtime
  bytes, ignored typings/maps, directory precedence, the 100-byte boundary,
  unsafe permissions, simulated foreign ownership, symlinks, missing builds,
  complete atomic records, lifecycle dispositions, bounded malformed input and
  conservative liveness.
- `subs/daemon/src/tests/launcher.test.ts`: nine cases cover eight simultaneous
  contenders, concurrent dead-lock reclamation, old live holders, malformed
  locks, occupied reclamation guards, refused sockets with live PIDs, entry
  exit, cancellation without duplicate launch, and invalid/pre-aborted options.

The fake entry accepts a socket and writes a record. It implements no service,
framing, contexts or analysis. Its child PID and launch count are observable,
and teardown kills and waits for every owned child before removing fixtures.
These cases satisfy no quick-service, IPC or process matrix instance.

The tests were authored and type-checked. Their Vitest runner verdict remains
reserved to workflow automation by the execution prompt. No new failing test
was observed locally, and no passing runner verdict is claimed.

## Initial verification

| Command or check | Result |
| --- | --- |
| `npm run worktree:prepare` | Passed; independent example/site packages provisioned. |
| `npm run build` | Passed after final production changes. |
| `npm run type-check` | Passed all four configurations after final source/test changes. |
| `npx tsx .reference-work/iteration7-smoke.ts` | Passed seven direct assertion groups: discovery and permission rejection; 49 whole-record reads during 40 atomic replacements; eight simultaneous launchers producing one fake child; eight concurrent stale-lock contenders producing one fake child; old live-holder timeout; entry exit/lock release; cancellation retaining the child and preventing duplicate startup. All fake children were cleaned up. |
| Final compiled discovery/launcher imports under `src/tests/process-probe.mjs` | Passed. Exactly discovery.js, records.js and launcher.js loaded from dist. No engine, contexts, host, compiler or UI module loaded; no spawn, connection or listener occurred; zero open traced file handles at exit. This verifies only implemented components, not the absent client entry. |
| `npm run check:self` | Passed on the final build: completed execution and complete coverage, 11 owners, 167 source files, 11 resources, 1,982 accesses; zero errors, warnings, denials or analysis limits. |
| `npm run reference:verify -- --plan 2 --iteration 7` | Failed, exit 1: 64 required, 4 passed, zero failed assertions, 172 not executed overall. Required missing capability records: 18 increment, 27 contexts, 15 daemon-service. Iteration 7 adds no instance. |
| `git diff --check` | Passed before submission. |

Ignored local evidence is in `.reference-work/iteration7-smoke.ts`,
`iteration7-smoke.json`, `iteration7-self-check.log`,
`iteration7-final-imports.ndjson` and `iteration7-plan2-gate.log`.
The gate's portable report is
`.reference-work/reports/plan2-iteration7-f0ef26ef-36b9-4b53-a66d-3614e2a04187.json`.

No Vitest/Cucumber regression, scenario-coverage or sealed-file check was run
locally, as the execution prompt reserves those checks for automation. The
public client-entry trace could not run because that entry remains absent.
Linux owner evidence does not establish macOS execution.

## Remaining work and limitations

The complete validated message codec and all WireMessage variants, handshake, service request IDs,
cancellation frames/final responses, pings, leases, event ordering, connection
close and bounded recovery, quick-connector reuse and `ramify.ts/client` remain
unimplemented. Consequently neither the full iteration-7 contract activation
nor its client-entry exit criterion is satisfied.

The launcher has a conservative limitation: a process interrupted while holding
the temporary reclamation guard can leave that guard behind. A later caller
times out rather than removing it unsafely; explicit inspection/removal is
required. The README and owner case preserve this behavior for review before
host adoption. Build hashing checks the selected files and required entry/tree
presence; full emitted-dependency completeness remains the production build's
responsibility.

Checklist values are intentionally:
`functionalRequirementsSatisfied: false`,
`newCodeCoveredByTests: true`,
`allNewTestsPass: false` (automated verdict pending).
Submission of these results is a partial checkpoint, not iteration completion.

## Recommendations for Next Iteration

Complete and expose the missing increment/project-resolution providers in
iteration 3, contexts manager and vocabulary in iteration 4, and shared service,
codec vocabulary and quick environment in iteration 5. Resume the client work
against those real public contracts, then activate the complete N2/R7 and
package entry and verify its permitted runtime closure.

Before iteration 8 uses the launcher, review interrupted-reclamation-guard
recovery and integrate startup deadlines with the compatibility handshake.
Iteration 8 owns the real host, duplicate-daemon behavior and IPC/process matrix
evidence. No scope or acceptance gate has been relaxed here.

## Single self-assessment remediation attempt

Re-read iteration7.md, its IPC framing contract, the current service/context
interfaces and the original check policy. This repair starts from
`b5edf29` in the same authoritative checkout and branch. Live workflow detail
reports iteration 7 at `validate_output_retry`. Source still has no
`RamifyService`, `ContextEvent`, `WireMessage`, `createContextManager`,
`analyzeIncrement` or quick connector. Available check-result files contain no
iteration-7 runner verdict. No support-agent delegation was used in either
implementation pass.

### Implemented private framing

New `subs/daemon/src/codec.ts` implements the independent byte-framing layer
under private owner exports `encodeJsonFrame`, `decodeJsonFrame` and
`createFrameDecoder`. These are not the public `encodeMessage` and
`decodeMessage` operations; those must validate the complete missing
WireMessage contract. No partial union or foreign context vocabulary was
introduced.

- Encoding writes exactly four big-endian length bytes and one UTF-8 JSON
  payload. The configured maximum counts payload bytes and is inclusive;
  invalid limits and unrepresentable JSON values fail explicitly.
- Exact decoding checks the header, rejects zero/oversized payload lengths,
  rejects truncation and trailing frame bytes, and parses strict UTF-8 and JSON.
  An encoded BOM is preserved for JSON rejection rather than silently stripped.
- Stream decoding assembles partial headers and bodies, including fragments
  inside multibyte characters, and delivers concatenated frames in order.
  Oversized/zero lengths fail as soon as the header completes, before allocating
  or waiting for a body.
- The decoder retains at most one bounded pending body and four header bytes,
  copies incoming fragments, and delivers values through a callback without
  accumulating a message array. Decoded values remain `unknown`, requiring
  subsequent schema validation.
- EOF detects incomplete headers and bodies. Disposal clears pending state and
  the listener, including disposal during delivery. Parsing/listener errors
  close the decoder and preserve the error; reentrant pushes reject. The
  future socket owner remains responsible for sending failure goodbye and
  closing transport on these errors.

The README explains this boundary. No declaration or package entry changed:
the missing public schema/client exports must exist before N2 and ./client
can activate. Discovery, records, launcher and their existing tests are
unchanged by this repair.

New `subs/daemon/src/tests/codec.test.ts` adds twelve owner cases, counting the
two payload-limit instances separately. They cover the literal independently
expected UTF-8 length, sliced buffer offsets, exact 1 MiB and 32 MiB + 64 KiB
bounds, malformed lengths/UTF-8/JSON/BOM, every split boundary, concatenated
frames, copied one-byte fragments, early rejection, fail-closed behavior,
incomplete EOF, disposal and callback/reentrancy errors. Iteration 7 now has
32 added owner cases in total. Their source type-checks; Vitest remains reserved
to workflow automation.

### Remediation verification

| Command or check | Result |
| --- | --- |
| `npm run build` | Passed with the new codec module; existing production entries still resolve. |
| `npm run type-check` | Passed all four configurations after final file names and test imports. |
| `node .reference-work/iteration7-framing-smoke.mjs` | Passed five direct groups on the compiled module: literal 38-byte UTF-8 header and every split; exact request/response payload bounds and fragmented large bodies; malformed lengths/UTF-8/JSON/BOM rejection; every incomplete EOF and copied one-byte chunks; disposal and callback/reentrant error behavior. |
| Compiled codec import under `src/tests/process-probe.mjs` | Passed: codec.js was the only loaded production module, with no engine, contexts, host, launch, connection, listener or traced file handle remaining at exit. This is private component evidence, not a client-entry or IPC instance. |
| `npm run check:self` | Passed: completed execution, complete coverage, 11 owners, 169 source files, 11 resources and 1,988 accesses; zero errors, warnings, denials or analysis limits. |
| `git diff --check` | Passed before committing. |

New ignored evidence:
`.reference-work/iteration7-framing-smoke.mjs`,
`iteration7-framing-smoke.json`, `iteration7-framing-self-check.log` and
`iteration7-framing-imports.ndjson`.

No Vitest/Cucumber regression, scenario coverage or sealed-file check was run
locally. The original gate result remains 4 of 64 required instances passed
with 60 missing prerequisite-capability instances. It was not rerun because
this repair changes no provider, harness capability or acceptance handler.
The unchanged launcher smoke was likewise not repeated.

### Current checklist and remaining work

- `functionalRequirementsSatisfied: false`: byte framing is implemented, but
  the complete WireMessage schema and message wrappers, service/client
  connection, handshake/cancellation/pings/events/leases/recovery, quick
  connector, public client entry and full activation remain absent. Their
  prerequisite types and services belong to earlier owning iterations and
  cannot be replaced with copied types or a second service in this repair.
- `newCodeCoveredByTests: true`: the original 20 cases remain and the private
  framing layer has twelve new owner cases.
- `allNewTestsPass: false`: no automated runner verdict exists yet. The
  successful type-check, compiled smoke and architectural check do not replace
  the required Vitest result under the automation-only policy.

The previously documented interrupted-reclamation-guard limitation remains;
the launcher was outside this focused framing repair. The earlier provider
restoration and host-integration recommendations still apply. Both managed
deliverables are updated via MCP, and the code is committed on the assigned
branch. No publication tool is called in this remediation; the workflow owns
validation reruns and finding disposition.
