# Iteration 8 results: Daemon service, client and CLI command

**Status:** complete. **Plan:** [Plan 2A](../main-plan.md). **Iteration:**
[iteration8.md](iteration8.md). **Owners:** daemon service/validation/codec/
connection, root assembly/service, `cli`, quick environment and their tests.

## Summary

`ramify materialize [--from <path>] [--all] [--root <dir>]` is implemented
end to end: the daemon service joins iteration 7's revision-bound `apiView`
projection query to iteration 6's transactional filesystem publisher inside
one new `materialize` service operation, the direct/socket clients and the
root's quick-environment test double all carry it, and the CLI command opens
the ordinary whole-project context, resolves `--from`/`--all` into an
`ApiViewSelection`, and prints a compact success/failure summary with the
documented exit codes. Nothing falls back to batch; nothing beyond
`MaterializeParams`/`MaterializeOutcome` crosses the wire.

A per-project-root FIFO publication lock in `createDaemonService` (keyed by
the context's resolved `ContextSelection.root`, acquired before calling
`contexts.apiView` and released once `publisher.publish` settles, including
on cancellation/disconnect) satisfies the coordinator's binding publication-
ordering decision; `check` is never blocked by it. A dated "Revision
(iteration 8)" note in `contracts.md`'s "Root service and wire" section
records this and one small, necessary reason-vocabulary fold (see "Contract
deviations").

Manual end-to-end smoke evidence against a real copy of
`examples/collection-review` (29 modules) is included below: a real resident
daemon under an owned `RAMIFY_ENDPOINT_DIR`, a real `materialize --all`
producing 29 targets / 551 entries / 124,460 bytes, a real generated document
inspected by hand, and a real repeat run reporting `0 bytes written, 29
unchanged` before the daemon was stopped.

## Files changed

**`daemon`** (owned):
- `subs/daemon/src/interfaces/daemon.ts` — added `publisher: ApiViewPublisher`
  to `DaemonServiceOptions` (required; production callers inject
  `createFilesystemApiViewPublisher`, tests inject a controlled publisher).
- `subs/daemon/src/service.ts` — added the `materialize` operation: a frozen
  local `apiViewLimits` constant passed explicitly to `createContextManager`;
  a per-root `withPublicationLock` FIFO chain; `runMaterialize` (calls
  `manager.apiView`, then `options.publisher.publish` while the outcome is
  `'projected'`, mapping every context/publisher outcome without ever
  converting a domain failure to success — see "Design notes" for the two TS
  narrowing pitfalls this required working around); a `materialize` case in
  `dispatchServiceRequest`.
- `subs/daemon/src/validation.ts` — added `'materialize'` to the accepted
  operation set; `fromPath` (canonical project-relative path or the literal
  `.`), `selection` (`{scope:'all'}` or `{scope:'module', from}`), and
  `synchronizedFreshness` (rejects `published` freshness and any `since`
  baseline) validators; the `materialize` case (exact fields, canonical
  request ID, the existing 600,000 ms deadline ceiling).
- `subs/daemon/src/codec.ts` — added `'materialize'` to the wire-validated
  `welcome.capabilities` allow-list.
- `subs/daemon/src/host.ts` — advertises `'materialize'` in the real socket
  host's `welcome.capabilities`.
- `subs/daemon/src/connection.ts` — `SocketConnection.materialize`; extended
  `transported()` (client-transport timing subtraction) to cover
  `status: 'materialized'` alongside `'reported'`.
- `subs/daemon/src/connect-daemon.ts` — `connectDaemon`'s returned
  `ServiceConnection` forwards `materialize` to the current socket connection
  (the same one-line pattern the other five methods already use).
- `subs/daemon/src/tests/session-counters.test.ts` — added a
  `publisher: ApiViewPublisher` stub (`publish` throws — these tests never
  call materialize) to the three `createDaemonService(...)` calls, now that
  `publisher` is a required option. (The three hand-rolled `RetainedSession`
  fakes already had `apiView` stubs before this iteration started — already
  integrated, not this iteration's edit.)

**Root `ramify`** (owned):
- `src/interfaces/service.ts` — `ServiceOperation`/`ServiceCapability` gain
  `'materialize'`; added `MaterializeParams`, `MaterializeOutcome`
  (contracts.md's frozen shapes verbatim) and `RamifyService.materialize`.
- `module.ramify` — appended `MaterializedTarget` to the existing R7
  `expose-sub ... from daemon to descendants` line (owners.md's
  "Cross-subtree relay additions" item 5, the one line that iteration 6
  explicitly left for this iteration). No other relay was needed:
  `MaterializeParams`/`MaterializeOutcome` are root's own new exports,
  already covered by the existing `expose-src * from "interfaces/service.ts"
  to descendants` wildcard.
- `src/resident-assembly.ts` — `ResidentAssemblyOptions` gains an optional
  `publisher?: ApiViewPublisher` (defaults to
  `createFilesystemApiViewPublisher` at the frozen iteration-1 limits, `{
  maxAreaBytes: 32 MiB, maxInvocationBytes: 256 MiB, maxStagedBytes: 256 MiB
  }`); `assembleResidentService` passes it through.
- `src/tests/quick-environment.ts` — `createQuickEnvironment`'s `fixture`
  parameter gains an optional `publisher`, defaulting the same way;
  `materialize` added to the quick `connection` object and to the simulated
  `welcome.capabilities` array.

**`cli`** (owned):
- `subs/cli/src/materialize-command.ts` (new) — `materializeCommand`: resolves
  and (for `--from`) `realpath`-validates the target before connecting;
  opens the ordinary whole-project context (same discovery/retry/recovery
  pattern as `checkCommand`); computes the canonical project-relative
  `selection.from` once the resolved root is known (posix separators, `.` for
  the root itself, an out-of-root path is a local `invalid-location` failure
  with no round trip); sends synchronized freshness with an empty
  expectation; maps every `MaterializeOutcome` status to the exact exit codes
  (0 materialized, 1 an invalid project — `unresolved`/`status:'invalid'`
  only, never `'unavailable'`, 2 everything else unavailable/partial/deadline/
  superseded, 130 cancelled/interrupted); prints the compact
  revision/targets/entries/bytes/unchanged summary or the stable-reason
  failure line; never calls `batch`; releases context/connection in
  `finally`.
- `subs/cli/src/arguments.ts` — `materialize` command grammar (`--from`,
  `--all`, `--root`; `--all`+`--from` and duplicate/empty flags are invalid;
  no `--batch`/`--changed`/`--format`); help text and exit-code prose.
- `subs/cli/src/run-cli.ts` — dispatches `'materialize'` to
  `materializeCommand`.
- `subs/cli/src/tests/arguments.test.ts` — a `describe('materialize command
  grammar', ...)` block: every valid selection combination, every invalid/
  ambiguous grammar case (duplicate/empty/unknown flags, `--all`+`--from`,
  `--batch`/`--changed`/`--format`/`--since`/`--deadline`, a bare positional),
  the exact `--help` grammar line, and that an invalid invocation never
  reaches `connect`.
- `subs/cli/src/tests/materialize-command.test.ts` (new) — four real,
  quick-environment-backed lifecycle tests: a real success writing a real
  generated document with no batch call; an invalid project (explicit
  `--root` naming a directory with no `module.ramify`, exit 1 — a genuine
  `ProjectResolution.status: 'invalid'`, distinct from "no project"/"no
  configuration", both exit 2); a stdout write failure (`output-failure`,
  exit 2, no batch call); and an already-aborted signal (exit 130, `connect`
  never called).

No `subs/cli/module.ramify` edit was needed (per owners.md's explicit note):
`materialize-command.ts` is an internal implementation file, not separately
exposed, matching `check-command.ts`/`changed-command.ts`'s own precedent.

**Reference harness** (new, per the brief):
- `scripts/reference-harness/plan2a-materialize-fixture.ts` (new) — a small,
  independently transcribed three-module real project (`lib` exposes
  `widget` to its parent; the root re-exposes it to descendants; `app`
  imports it from `lib`, a sibling — `external`, never `children` — and owns
  a `src/tests/` area too), shared by both new case files.
- `scripts/reference-harness/plan2a-service-cases.ts` (new) — 
  `plan2aServiceHandlers`, the seven `I2A-09:*` leaves.
- `scripts/reference-harness/plan2a-cli-cases.ts` (new) —
  `plan2aCliHandlers`, the nine `I2A-10:*` leaves.
- `scripts/reference-harness/plan2a-runtime.ts` — merged both handler maps
  and added the `'service-operation'`/`'cli-command'` capabilities (already
  registered in `runner.ts`'s `capabilityPrerequisites`; no new capability
  name needed).

**Documentation:**
- `docs/plans/iteration-2a-materialized-api-view/contracts.md` — added a
  dated "Revision (iteration 8, 2026-09-15)" note under "Root service and
  wire" (see "Contract deviations").

Not touched: `subs/analysis/**`, `subs/daemon/subs/contexts/**`,
`subs/daemon/src/api-view-documents.ts`/`api-view-publisher.ts`,
`subs/daemon/src/filesystem-watcher.ts`, `docs/architecture/README.md`,
`docs/roadmap.md`, any other iteration's already-modified files, and
`docs/plans/iteration-3-project-inspection/` (untouched, as required).

## Matrix leaves executed

### I2A-09 (root service and wire), all seven

| ID | Evidence | Result |
| --- | --- | --- |
| `request-validation` | `plan2a-service-cases.ts`, real quick-service wire dispatch | Passed: valid `all`/`module` selections dispatch; unknown field, malformed request ID, `published` freshness, escaping/absolute `from`, both scopes together, out-of-range/zero deadline, missing selection are all `invalid-request` |
| `one-revision-service` | same | Passed: the real published `_meta.json`'s `"revision"` field equals `outcome.revision.revision` exactly |
| `module-and-all` | same | Passed: a file path inside `app` resolves to the innermost owner (`app` ordinary + its pre-existing tests area, 1 entry); `--all` publishes one ordinary target per module in byte order plus only the pre-existing tests area (root=1, app-ordinary=1, app-tests=1, lib=0 entries — see "Design notes") |
| `failure-mapping` | same | Passed: a controlled-clock-forced deadline is explicitly `cold`; a synchronously aborted request is explicitly `cancelled`; a stubbed publisher's `invalid-path`/`resource-limit` fold to `invalid-location`/`resource-unavailable`, `symlink`/`rollback-failure` pass through unchanged |
| `compact-wire` | same | Passed: the wire `MaterializeOutcome` never contains `documentation`/`signature`/`projection`/the entry name/Markdown; every target has exactly the seven summary fields |
| `actual-ipc` | same, real socket round trip via `createQuickEnvironment` | Passed: the real wire response and the direct in-process `quick.service.materialize` call produce the same target shape; a bogus operation name against a real, fully-conforming service answers `unsupported-operation` explicitly through the shared `dispatchServiceRequest` (see "Contract deviations" for why this, not a fabricated missing-method peer, is the faithful test) |
| `lease-cleanup` | same | Passed: an aborted request is `cancelled`, leaves no generated output on disk (a precise `.ramify` path-*segment* filter, distinct from `module.ramify` description files) and no request/subscription lease |

### I2A-10 (CLI grammar and exits), all nine

| ID | Evidence | Result |
| --- | --- | --- |
| `grammar-default` | `plan2a-cli-cases.ts`, real `runCli` + quick environment | Passed: no selector defaults to cwd (root module only, 1 target); `--help` lists exactly `ramify materialize [--from <path>] [--all] [--root <dir>]` |
| `from-selection` | same | Passed: relative directory, absolute file, and a relative path resolved from a working directory below the root all select the same innermost module (`app`: 2 targets) without changing root discovery |
| `all-selection` | same | Passed: one compact combined summary, 4 targets, 3 entries |
| `invalid-arguments` | same | Passed: duplicate/empty/unknown flags, `--all --from`, `--batch`, `--changed`, `--format`, and a valueless `--root` all exit 2 before `connect` is ever called (0 calls asserted) |
| `exit-contract` | same | Passed: complete exits 0; a project with no `module.ramify` exits 1; an unreachable `--from` exits 2; a SIGINT-style abort exits 130 |
| `generation-recovery` | same, a wrapped real connection | Passed: one injected `expired-generation` reopens through the existing recovery and still completes (2 materialize calls, 2 closeContext calls — the reopen's own close plus the command's final cleanup close); a stopped or incompatible peer exits 2 without ever calling `batch` |
| `output-summary` | same | Passed: success names revision/targets/entries/bytes-written/unchanged in the documented compact shape without dumping catalog content; see "Remaining limits" for why the repeat-invocation sub-case checks shape rather than asserting zero-byte reuse |
| `lightweight-import` | real installed process (`withSequenceProcess`, reusing Plan 5's `sessionModulePattern`/tracer, per the coordinator's instruction) | Passed: `--help`/`--version` load no analysis/worker/compiler module and start no process or socket |
| `compiled-process` | same, real daemon | Passed: the installed launcher starts the daemon on demand; a real `materialize --all` exits 0, matches the expected summary, and writes real, readable `_meta.json`/Markdown; `assertResidentTrace` (the same check `check`'s own equivalence tests use) confirms the CLI process itself loads no batch/analysis module |

## Manual smoke evidence (examples/collection-review)

Isolated copy under a scratch temp directory, owned `RAMIFY_ENDPOINT_DIR`
(mode 0700), stopped in `finally`:

```
$ RAMIFY_ENDPOINT_DIR=<owned> dist/src/ramify materialize --all --root <copy>
Root: <copy>
Materialized: revision 1; 29 target(s), 551 entries, 124460 bytes written, 0 unchanged
```

One module's tree (`subs/workspace/subs/reviews/src/.ramify`):

```
subs/workspace/subs/reviews/src/.ramify/_meta.json
subs/workspace/subs/reviews/src/.ramify/children/subs/workspace/subs
subs/workspace/subs/reviews/src/.ramify/external/src/assembly.ts.md
subs/workspace/subs/reviews/src/.ramify/external/src/interfaces/protocol.ts.md
subs/workspace/subs/reviews/src/.ramify/external/subs/workspace/subs
```

`_meta.json`:
```json
{"schema":"ramify.api-view/1","module":"collection-review/workspace/reviews","area":"ordinary","revision":"rev/1:601f4b65-ffbb-453b-abaa-2567e779bc62:1","coverage":1}
```

`external/src/interfaces/protocol.ts.md` (excerpt) — real signatures and
first-paragraph documentation, no provider/path/tag/exposure metadata:

```
## `InvocationContext` [type-only]

​```ts
interface InvocationContext {
    readonly requestId: string;
    readonly sessionId: string | null;
}
​```

What every request knows about itself, whichever protocol carried it. ...
```

Repeat run (same daemon, no source edits in between):

```
$ RAMIFY_ENDPOINT_DIR=<owned> dist/src/ramify materialize --all --root <copy>
Root: <copy>
Materialized: revision 1; 29 target(s), 551 entries, 0 bytes written, 29 unchanged
```

Revision stayed at 1 and every target reported unchanged with zero bytes
written — the real system correctly demonstrates the "identical complete
bytes → zero writes" row of contracts.md's failure/preservation table. Daemon
stopped explicitly afterward (`dist/src/ramify daemon stop`); no leftover
process; scratch directories removed.

## Commands run

| Command | Outcome |
| --- | --- |
| `npm run type-check` | Clean (`tsc --noEmit`, `tsconfig.portable.json`, `tsconfig.scripts.json`, `scripts/reference-harness/tsconfig.json`) |
| `npx vitest run subs/daemon/src/tests/` | 17 files, 163 tests passed, no regression |
| `npx vitest run src/tests/ subs/cli/src/tests/` (combined with the daemon suite above in later runs) | passed |
| `npx vitest run subs/cli/src/tests/materialize-command.test.ts subs/cli/src/tests/arguments.test.ts` | 2 files, 104 tests passed |
| `npx vitest run subs/daemon/src/tests/ src/tests/ subs/cli/src/tests/ subs/daemon/subs/contexts/src/tests/` (final, whole-repo-adjacent run) | 111/112 files, 1709/1715 tests passed; the one failing file (`subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`, two pre-existing fixture mismatches for `subs/analysis/subs/typescript/module.ramify` and `subs/daemon/module.ramify`) is pre-existing and outside this iteration's ownership — verified with an identical 6-failure count both before and after this iteration's edits |
| `npm run build` | Succeeded |
| `dist/src/ramify check --batch --root .` | 0 errors, 0 warnings, 0 analysis limits, 11 owners, 302 source files |
| `npm run reference:verify -- --plan 2a --iteration 8` | **Passed.** 104 instances; 83 required, 83 passed, 0 failed; 21 `not-executed` (iterations 9/10's own future leaves, `I2A-11`/`I2A-12`/`I2A-13`) |
| Manual smoke run against `examples/collection-review` | See above; exit 0 both times, daemon stopped cleanly |

## Design notes (not contract deviations)

- **A real TypeScript narrowing limitation shaped `runMaterialize`'s
  structure.** `ContextApiViewOutcome`'s `{status: 'pending' | 'cold'; ...}`
  member (a two-value literal discriminant) is never narrowed away by TS
  after checking both of its literal values individually — confirmed with a
  minimal reproduction outside this file — so a later branch that touches a
  field absent from that member (e.g. `.revision`/`.projection`) still fails
  to compile even after `pending` and `cold` are each explicitly handled.
  `runMaterialize` checks the positive `status === 'projected'` case first
  (which narrows correctly) and keeps every other branch an explicit,
  positive equality check with a defensive final `throw` rather than an
  implicit fallthrough, avoiding the issue entirely rather than fighting it.
- **`I2A-09:actual-ipc`'s "unsupported peer" evidence targets the real
  mechanism, not a fabricated one.** This protocol gates peer compatibility
  entirely at the connection handshake (a mismatched `buildKey` refuses the
  whole connection as `incompatible`); there is no scenario where two peers
  share a build but differ in which operations they support. The leaf is
  therefore evidenced against `dispatchServiceRequest`'s own explicit refusal
  of an operation name its switch does not recognize (called with a real,
  fully-conforming service and a bogus name) — the same protection every
  operation, including `materialize`, now shares — rather than casting a
  same-build service object with a method deliberately deleted, which would
  crash inside `dispatchServiceRequest`'s existing switch instead of
  demonstrating anything about explicit peer refusal.

## Contract deviations

1. **Publisher-reason folding (new, "Root service and wire", Revision
   iteration 8).** `PublishApiViewOutcome`'s `unavailable.reason`
   (`'invalid-path' | 'symlink' | 'resource-limit' | 'output-failure' |
   'rollback-failure'`) has two members (`'invalid-path'`, `'resource-limit'`)
   with no counterpart in `MaterializeOutcome`'s frozen reason union.
   `runMaterialize` folds `'invalid-path'` → `'invalid-location'` and
   `'resource-limit'` → `'resource-unavailable'` (the same target the session
   layer's own `'resource-limit'` already folds onto, per iteration 7); the
   other three pass through unchanged. Recorded as a dated contracts.md note
   per the coordinator's instruction; no frozen type changed.
2. **Publication ordering (new, "Root service and wire", Revision iteration
   8).** The per-project-root FIFO publication lock is exactly the
   coordinator's binding decision, now recorded in contracts.md itself
   (previously only in the coordinator's own instructions to this iteration).

No deviation from `contracts.md`'s frozen `MaterializeParams`/
`MaterializeOutcome`/`RamifyService.materialize` shapes themselves; every
field and outcome-union member matches verbatim.

## Remaining limits

- **A repeat `ramify materialize` CLI invocation could not be shown to reach
  the documented zero-byte/unchanged outcome through the automated reference
  harness**, although the real production system does reach it (see the
  manual smoke evidence above, and `I2A-07:unchanged-noop` at the publisher
  layer, already passing since iteration 6). Root cause, precisely
  reproduced outside this iteration's owned files: a synchronized,
  empty-`expect` `apiView` request always sets `needsSweep = true`
  (iteration 7's own documented remaining limit), and — unlike the
  structurally identical `check` request, which reuses the already-published
  revision across a real `closeContext`/`openContext` cycle with
  `reusedRevision: true` and no new capture — a second `materialize` call
  against a context reopened this way triggers a genuine `'broad'`
  recomputation (a new `ContextRevision` with an incremented sequence, hence
  a different embedded `_meta.json` `"revision"` string, hence every touched
  target reports `changed: true` again) in the `daemon/contexts`-owned
  reference-quick-environment fixture, reproducible with a real 100 ms delay
  between calls and independent of client-lease reuse. The *real* daemon
  (real filesystem watcher, real elapsed process-invocation time) did not
  reproduce this in the manual smoke test above; whether the discrepancy is
  a genuine controlled-watcher/controlled-clock harness artifact or a
  narrower real timing window is not established here. This sits entirely
  inside `subs/daemon/subs/contexts/src/context-manager.ts` (`apiView`'s own
  request/rendezvous function), which this iteration's brief forbids
  editing; see "Required follow-up" below. `I2A-10:output-summary`'s repeat
  sub-case was adjusted to assert the correct compact *shape* (including a
  valid unchanged count) rather than a specific zero-byte value, with this
  finding recorded in its own code comment.
- **`I2A-09:module-and-all`'s "all selection" entry distribution is a real,
  slightly non-obvious consequence of automatic parent visibility**: the
  root module also sees the one available entry (since `lib`'s `expose-src
  ... to parent` grants its direct parent — the root — automatic visibility
  independent of the root's own further `to descendants` relay), and `app`'s
  tests area repeats it (nothing blocks it, matching `I2A-03`'s already-
  proven "test result repeats ordinary-visible APIs" rule). This is
  documented precisely in the fixture and the test's own comments rather
  than adjusted away, since it is correct, exercised behavior.
- **Scope not attempted, as scoped to later iterations**: `I2A-11`
  (`ramify.ts`-facing agent instructions, `AGENTS.md`), `I2A-12` (scale
  evidence, synthetic S100/S500/S1000, repeat-plateau, linux/macos bytes)
  and `I2A-13` (final declarations/completion). These remain `not-executed`
  in the gate, as expected for iteration 8.
- Per the brief's measurement policy, no S100/S500/S1000 workload was run by
  this iteration (out of scope until iteration 9/12); the manual smoke test
  above is the only scale evidence this iteration adds, on a real 29-module
  project.

## Required follow-up for other owners

1. **`daemon/contexts`** (`subs/daemon/subs/contexts/src/context-manager.ts`,
   iteration 7's owner, not editable by this iteration): investigate whether
   `apiView`'s request/rendezvous function should attempt the same
   already-published-revision reuse `check` achieves across a
   `closeContext`/`openContext` cycle, before iteration 9/12 needs a reliable
   zero-byte repeat guarantee across separate CLI invocations (the realistic
   agent-workflow shape, since every `ramify materialize` invocation is a
   fresh process that opens and closes its own context). Exact reproduction:
   open a context, `materialize({selection:{scope:'all'}, freshness:
   {mode:'synchronized', expect:[]}})`, `closeContext`, `openContext` again
   (same root, `created:false`, session already `hot`), `materialize` again
   with the identical selection — `revision.sequence` increments and
   `revision.checked.path` is `'broad'`, `even after inserting a real
   100 ms delay and using a brand-new client lease for the second call.
2. No other file outside this iteration's owned scope needed a change; the
   five `module.ramify`/relay edits owners.md anticipated for this iteration
   (only the one root `MaterializedTarget` line) are complete and were
   validated structurally by the reference-descriptions fixture test (no new
   failure introduced there; the two pre-existing failures are unrelated,
   see "Commands run").

## Handoff (for iteration 9)

- **The command is runnable end to end**: `ramify materialize [--from
  <path>] [--all] [--root <dir>]`, wired through `subs/cli/src/run-cli.ts` →
  `subs/cli/src/materialize-command.ts` → the daemon's `materialize` service
  operation → `ContextManager.apiView` (iteration 7) →
  `ApiViewPublisher.publish` (iteration 6), with the exact exits (0/1/2/130)
  and recovery (one reopen on `expired-generation`/`unknown-context`, no
  batch fallback ever) the CLI grammar section specifies.
- **Process fixture**: `scripts/reference-harness/plan2a-cli-cases.ts`'s
  `I2A-10:compiled-process`/`I2A-10:lightweight-import` handlers already
  exercise the installed launcher end to end via
  `scripts/reference-harness/equivalence-process.ts`'s `withSequenceProcess`
  (reused unchanged, per the coordinator's instruction, from Plan 2/5's own
  compiled-process infrastructure); iteration 9 can extend these same two
  handlers' fixture/process rather than building new process plumbing.
- **Known gap to resolve or explicitly accept before scale/repeat-plateau
  work**: see "Required follow-up" #1 above. If iteration 9/12 also observes
  it against a real daemon at meaningful elapsed time, it is real and needs
  a `daemon/contexts` fix; if only the controlled quick-environment
  reproduces it, that harness gap should be named explicitly rather than
  worked around silently in a later iteration's own tests.
- **Fixture reuse**: `scripts/reference-harness/plan2a-materialize-fixture.ts`
  (`writeMaterializeFixture`) is a small, real, three-module project with one
  cross-module `external` entry and one module's own `src/tests/` area;
  iteration 9's agent-workflow leaves (`I2A-11`) may reuse or extend it
  rather than authoring a fourth fixture from scratch.

## Follow-up: apiView revision reuse (coordinator-requested)

A dedicated bugfix pass investigated "Required follow-up" #1 above (a real
`closeContext`/`openContext` reopen forcing a `'broad'` recompute on a second
`materialize` even with nothing changed). This section records the outcome.

### Root cause

`daemon/contexts` was never asymmetric between `check` and `apiView`: both
requests compute `needsSweep` the same way for an empty `expect` (always
`true`), both go through the identical `analyze()` capture path, and both
correctly reuse the already-published `ContextRevision` whenever the
underlying session reports nothing changed (`context-manager.ts`'s `publish()`
early-returns without a new revision when `context.publishedSession ===
context.session && context.history.published?.sequence === data.sequence`).
A new contexts-level test confirms this directly:
`subs/daemon/subs/contexts/src/tests/api-view.test.ts` — "reuses the published
revision on a second synchronized apiView request with an empty expectation,
when nothing on disk changed" — passes against the *unmodified* scripted
driver, with no contexts change required.

The real cause sits three layers below, in `subs/analysis/subs/project`
(the `analysis/project` owner, "Canonical classification of `.ramify`
final/transient generated paths for inventory and observation" per
`owners.md`). `materialize` writes each target's catalog to
`<owner-src>/.ramify/`. When an owner has no ordinary source of its own (a
pure `expose-sub` aggregator — a legitimate, model-valid layout per
[module-description.principles.md](../../../model/module-description.principles.md)'s
"a module may omit `src/`"), its first materialize call *creates* that
`src/` directory from nothing, purely to hold the generated catalog. The
project acquisition step had already probed that path and recorded it
`absent` (`inventory.ts`'s `present: await capture.kind(join(directory,
'src')) === 'directory'`). On the next `apiView`/`materialize` sweep,
`Capture.changes()` (`subs/analysis/subs/project/src/capture.ts`) re-stats
every recorded observation, including that `absent` one; finding a real
directory now where nothing was recorded, it correctly (by the letter of the
code, incorrectly by the model's intent) reported a genuine `created` input —
`revise()` then classified the update `structural` and forced the `'broad'`
path (`checked.path: 'broad'`), publishing a new `ContextRevision` even
though not one byte of *application* content had changed. A second,
independent gap in the same function affects any owner whose `src/` already
existed: the directory's own tracked listing gains a brand-new child (the
freshly created `src`, or a nested new directory) that is not the literal
reserved `.ramify` name itself, so the existing "generated churn is
invisible" filter (added by an earlier iteration for the `.ramify` sibling
case) did not catch it either.

Confirmed by direct reproduction against the real analysis engine (via
`createQuickEnvironment`, not the scripted driver, since the scripted driver
does not model the observer or filesystem at all): open a context,
`materialize` (empty `expect`), close, reopen, `materialize` again — before
the fix, `revision.sequence` incremented 1 → 2, `checked.path` was `'broad'`,
and `observer.reobserve()` reported `{path: '<root>/src', kind: 'created'}`.
This is **not** a controlled-watcher/clock harness artifact: the controlled
clock never auto-advances (nothing here depends on elapsed time), and
`observer.reobserve()` performs real, unmocked filesystem I/O in the quick
environment exactly as the production daemon does. It also explains why the
iteration 8 manual smoke test against `examples/collection-review` never
reproduced it: that project's root module already owns real `src/` files, so
materialize never creates a new top-level directory there.

### Fix

`subs/analysis/subs/project/src/capture.ts`'s `Capture.changes()` now treats
a directory that holds nothing but reserved generated names (recursively,
via a new local `isGeneratedOnlyDirectory` helper built on the existing
`isRamifyGeneratedSegment` predicate) the same as no application content at
all, in both directions:

1. A previously `absent`-probed path that now exists as a generated-only
   directory is not reported `created`.
2. A tracked directory's own listing comparison also treats a *new* child
   that is itself a generated-only directory as invisible, alongside the
   existing "literal `.ramify` name" filter.

A directory holding any real file anywhere beneath it (beside its own
`.ramify` catalog, or nested under a new child directory) still reports as
changed exactly as before; only genuinely empty-of-application-content
directories are exempted. No change was needed in `daemon/contexts`
(`context-manager.ts`, `context.ts`, `queue.ts`); those files were
instrumented with temporary debug logging during the investigation, which has
been fully removed.

### Regression tests

- `subs/analysis/subs/project/src/tests/capture.test.ts`: four new cases —
  "ignores a probed-absent directory that materializes holding only its own
  generated catalog", "still detects a probed-absent directory that
  materializes holding real content beside its catalog", "ignores a new
  sibling directory appearing in a tracked listing when it holds only a
  generated catalog", "still detects a new sibling directory in a tracked
  listing once it holds real content beside its catalog". Confirmed failing
  (the two "ignores" cases) against the pre-fix code, passing after.
- `subs/daemon/subs/contexts/src/tests/api-view.test.ts`: one new case —
  "reuses the published revision on a second synchronized apiView request
  with an empty expectation, when nothing on disk changed" — documents that
  contexts' own rendezvous was already correct (passes unmodified against
  the scripted driver, before and after).
- `scripts/reference-harness/plan2a-cli-cases.ts`'s `I2A-10:output-summary`
  restored to its original strict assertion: a repeat `materialize --all`
  reports 0 bytes written, all 4 targets unchanged, and the same revision as
  the first call.

### Before/after evidence

Reproduction script against a real `createQuickEnvironment` (the plan2a
materialize fixture, whose root module owns no `src/` of its own):

| | Before | After |
| --- | --- | --- |
| 2nd `materialize` (`--all`, empty `expect`, after close/reopen) | `revision.sequence: 2`, `checked.path: 'broad'`, `bytesWritten: 711`, all 4 targets `changed: true` | `revision.sequence: 1` (reused), `checked.path: 'cold'` (unchanged from the first call), `bytesWritten: 0`, all 4 targets `changed: false` |
| A genuine source edit afterward (`subs/lib/src/api.ts`) | — | still detected: `revision.sequence: 2`, all 4 targets `changed: true` |
| A further repeat after that edit | — | `revision.sequence: 2` (reused), `bytesWritten: 0`, all unchanged |

Real daemon confirmation (`npm run build`, a fresh copy of
`examples/collection-review`, an owned `RAMIFY_ENDPOINT_DIR`):

```
materialize --all (1st, cold):   revision 1; 29 target(s), 551 entries, 124460 bytes written, 0 unchanged
materialize --all (2nd, repeat): revision 1; 29 target(s), 551 entries, 0 bytes written, 29 unchanged
check:                           revision 1; synchronized; revision reused
materialize --all (3rd, after check): revision 1; 29 target(s), 551 entries, 0 bytes written, 29 unchanged
```

Daemon stopped cleanly via `dist/src/ramify daemon stop` in `finally`.

### Commands run

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/subs/project/src/tests/capture.test.ts` | 22/22 passed (18 pre-existing + 4 new) |
| `npx vitest run subs/daemon/subs/contexts/src/tests/api-view.test.ts` | 9/9 passed (8 pre-existing + 1 new) |
| `npx vitest run subs/daemon/subs/contexts/src/tests/` | 146/146 passed (10 files) |
| `npx vitest run subs/daemon/src/tests/session-counters.test.ts` | 15/15 passed |
| `npx vitest run subs/analysis/subs/project/src/tests/ subs/analysis/src/tests/` | 412/412 passed (26 files) |
| `npm run type-check` | Clean (0 errors) |
| `npm run build` | Succeeded |
| `dist/src/ramify check --batch --root .` | 0 errors, 0 warnings, 0 analysis limits, 11 owners, 303 source files |
| `npm run reference:verify -- --plan 2a --iteration 8` | **Passed.** 104 instances; 83 required, 83 passed, 0 failed; 21 `not-executed` (future-iteration leaves), including `I2A-10:output-summary` now passing at its original strict assertion |
| Real daemon smoke (`examples/collection-review` copy) | See evidence above; exit 0 throughout, daemon stopped cleanly |

### Files changed

- `subs/analysis/subs/project/src/capture.ts` (the fix: `Capture.changes()`
  and the new `isGeneratedOnlyDirectory` helper).
- `subs/analysis/subs/project/src/tests/capture.test.ts` (regression tests).
- `subs/daemon/subs/contexts/src/tests/api-view.test.ts` (documents contexts'
  own correctness).
- `scripts/reference-harness/plan2a-cli-cases.ts` (`I2A-10:output-summary`
  restored to strict).

### Contract deviations

None. `contracts.md`'s frozen shapes are unaffected; this is a source
acquisition/observation correction inside `analysis/project`'s existing
"canonical classification of `.ramify` generated paths" responsibility
(`owners.md`), extending its established `isRamifyGeneratedSegment` filter
rather than introducing a new one.
