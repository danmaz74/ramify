# Iteration 16 results: daemon wire and watcher integration

**Date:** 2026-10-04. **Status:** implementation receipt for
[iteration 16](iteration16.md). It awaits the coordinator's review,
protected-file comparison and milestone gate. Changes are uncommitted in the
second worktree, pipelined one iteration ahead of the coordinator's gate on
`790a534c`. Cases produced here: PB1-23 and PB1-25, at the `ipc-process`
evidence boundary; their final qualification remains with iteration 20.
`reference:verify` was not run: it is left to the coordinator's milestone gate
(plans 1, 2, 5 and 2a).

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1-next`, branch `feat/project-boundary-ramify-next` |
| Base commit | `790a534c`, clean at assignment, dependencies installed. The coordinator's note of this session adds `53b704bd` (the `contextNames` fix in `descriptions.test.ts`); the identical change is applied here, so the work rebases onto it |
| Contract revision | sha256 `contracts.md` `c6baba7d…`, `cli-invocation.spec.md` `98f8aa2f…`, `module-description.spec.md` `b21e77d8…`, `glossary.md` `1cd8cbf3…`, all unchanged. Non-protected `daemon.md` `dd062851…` → `87633383…`, `processes-and-clients.md` `c590dde0…` → `09b36fd2…` |
| Configuration | unchanged: `package.json` `be7f3c90…`, `package-lock.json` `cf3b14fc…`, `ramify-audit.json` `371ebef9…`, every `tsconfig*.json` and Vitest configuration; nothing under `ramify-agent/`, `/ramify-audit` or `/ramify` |
| Node / tools | v22.23.3; TypeScript 7.0.2; Vitest 4.1.11 |
| Changed (source) | `subs/daemon/subs/contexts/src/interfaces/contexts.ts`, `context-manager.ts`, `context.ts`; `subs/daemon/src/filesystem-watcher.ts`, `codec.ts`, `connection.ts`; `module.ramify`, `subs/daemon/module.ramify`; `scripts/validate-final-contracts.ts` |
| Changed (tests, harness) | `subs/daemon/subs/contexts/src/tests/controlled-ports.ts`, `controlled-ports.test.ts`; `subs/daemon/src/tests/codec.test.ts`, `watcher.test.ts`; `src/tests/quick-environment.ts`, `quick-environment.test.ts`; `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`; `scripts/reference-harness/plan2a-isolation-cases.ts`, `final-contracts.test.ts` |
| Changed (prose) | `docs/architecture/daemon.md`, `docs/architecture/processes-and-clients.md`, `subs/daemon/README.md`, `subs/daemon/subs/contexts/README.md`, `subs/cli/README.md` (no first paragraph changed) |
| Added | `subs/daemon/src/tests/project-boundary-wire.test.ts`, `project-boundary-watcher.test.ts`, `daemon-process.ts`, `watch-scopes.ts`, `watch-registration-probe.mjs`; `subs/daemon/subs/contexts/src/tests/watch-registration.test.ts`; this receipt |
| Evidence | `/home/app/ramify-pb1-evidence/iteration16/` |

## Changed behaviour

### Wire (deliverable 1)

1. **Request.** `CheckParams.paths` and `classification` (iteration 15) travel
   in `ramify.ipc/2` request frames unchanged; the daemon's strict request
   validation refuses, as `invalid-request` before any context work, a request
   with only one of them, empty or duplicate `paths`, an absolute, `..`-escaping
   or non-normalized path, a non-positive or non-integer classification, `paths`
   with published freshness, and an expectation naming a path outside `paths`
   (verified over the real socket of the installed daemon).
2. **Replies decoded strictly** (`codec.ts`, `validateServiceReply`). A successful
   `check` reply must be exactly one `CheckOutcome` variant with exactly its
   members: a closed status set (`reported` published or not, `pending`,
   `superseded`, `cold`, `deadline-exceeded`, `classification-changed`,
   `cancelled`, `unavailable` with its closed reason set); revisions and context
   statuses by the existing strict validators; freshness record, reply timings
   (`service` and `clientTransport` optional), delta members, an embedded report
   carrying `ramify.analysis/2`. Each `PathCheckDisposition` is strict: a
   normalized in-root path, distinct within the reply; `checked` only with
   module, null exclusion and `content` with a sha256 or `deleted` with null; a
   `not-analyzed` reason agreeing with its exclusion kind (`reserved` for
   repository, packages, output, generated), an owned kind naming a module and an
   unowned one none, `owned-non-source` with no exclusion; no identity on
   `not-analyzed` or `not-checked`. A `classification-changed` reply has a
   revision and a nonempty classification with no `checked` or `superseded`
   path. The socket client (`connection.ts`) applies the decoder to every check
   reply; a malformed one fails the connection like any invalid frame (pending
   requests receive `internal-error` with "Invalid check reply schema"). The
   root's quick environment applies the same decoder, so every quick-environment
   CLI and harness check reply is decoded strictly as well.
3. **Status.** `ContextStatus` gains `registrations`: the active watcher's scope
   sequence, registered directory count and pruned excluded directories (at most
   20, byte-ordered, with `prunedCount`), null exactly when no watcher is active.
   The strict status validator (`status-changed` events) requires it with these
   rules; it reaches `ramify.watch/2` status lines and `ramify.daemon-status/2`
   contexts unchanged.
4. **Peers.** A hello with another protocol (`ramify.ipc/1`), a foreign build key
   or a foreign engine is answered `reject`/`incompatible` naming the daemon
   instance, the socket is closed, and the daemon keeps serving (real process).

### Watcher (deliverable 2)

5. **Port.** `WatcherPort.watch(root, scope, listener)` receives a `WatchScope`:
   the sequence of the published revision whose ownership decides, that table's
   rooted exclusions, and `excluded(path)`, Project's classifier over the table
   (through `AnalysisDriver.classify`), or over an empty table before the first
   completed revision, where only the canonical reserved-path rules (repository,
   packages, generated, wherever they occur) exclude. `WatcherHandle` gains
   `reconfigure(scope)`, resolving with the number of directories it registered,
   and `registrations()`.
6. **Pruning** (`filesystem-watcher.ts`). The fixed name set (`node_modules`,
   `.git`, `dist`, `.reference-work`) and the direct `isRamifyGeneratedPath`
   import (with its "relay pending" note) are gone. Each child directory met is
   classified once; an excluded one is recorded as pruned beneath its registered
   parent and never registered, nor anything beneath it. An event beneath an
   exclusion is dropped; an excluded directory's own entry is delivered for
   owned-ignored, external and scratch directories (boundary-root evidence) and
   dropped for repository, packages, output and generated ones; a rename of any
   excluded entry still re-lists its parent so the pruned record stays current.
   `dist` and `.reference-work` are excluded only where the revision's table
   roots them (output, declared); elsewhere they are ordinary directories.
7. **Reconfiguration** (`context-manager.ts`). At each completed publication whose
   rooted exclusions differ from those the watcher registered with, the context
   calls `reconfigure`: registrations beneath a new exclusion end (pruning, no
   gap), and pruned directories no exclusion holds any more are registered with
   their subtrees. The first attach uses the scope current at attach time and
   catches up after the walk.
8. **Gap recapture.** A reconfiguration that drops an exclusion opens a gap:
   until it ends, every capture sweeps, no request is covered (`covers`,
   `coverQueued`) and the context is not `synchronized`; when it registered any
   directory, its end sets `conservative` and a required sweep, whose revision,
   if it finds changes, has cause `conservative`. A dropped exclusion whose tree
   registers nothing (for example a removed module's scratch directory) ends the
   gap without a sweep and restores `synchronized`.

## Document shapes and consumers

`ramify.ipc/2`, `ramify.watch/2` and `ramify.daemon-status/2` are extended
without a new version, as the brief and the schema table state (all three
advanced in iteration 3 and are not handed off): `ContextStatus.registrations`
is a new member of the status those three carry, the check reply the codec now
decodes includes iteration 15's `paths` dispositions and `classification-changed`
status, and the request carries `paths` and `classification`. No other document
changes shape: `ramify.check/2` (the CLI document) is untouched by this slice,
the daemon record keeps `ramify.daemon-record/1`, `ramify.affected/2` seeds
cross the worker and the wire unchanged. The private worker protocol is not a
versioned document and has no codec; `SessionRevision.scope` crosses it as
structured data, exercised by the installed daemon in both new process tests.

Relays: `WatchScope` and `WatchRegistrations` are signature companions of
`WatcherPort`, `WatcherHandle` and `ContextStatus`, so the daemon's N5 relay and
the root's R7 relay carry them; daemon exposes `validateServiceReply` to its
parent beside `encodeMessage` and `decodeMessage` (the root's quick environment
uses it). Recorded as the validator layer "Phase 1 project boundaries (watch
registrations and strict replies)"; the harness `final-contracts.test.ts` daemon
layer list gains it; `descriptions.test.ts` lists the new selections in statement
order (on top of the coordinator's `53b704bd` change, applied identically). No
README purpose changed.

Consumers migrated: contexts (manager, controlled watcher and its tests), the
filesystem watcher and its tests, the codec and socket client, the root's quick
environment and its test, and the two Plan 2A harness cases that call the
watcher directly. The CLI renders statuses as received (JSON lines and status
JSON carry `registrations`; human output unchanged, presentation is
iteration 17's). The hook example is unaffected (it reads the CLI document).
Measurement scripts read individual status members and need no change.

## PB1-23 and PB1-25 at the real IPC and watcher boundaries

`subs/daemon/src/tests/project-boundary-watcher.test.ts` (4 tests):

| Test | Independent expectation |
| --- | --- |
| registration by classification (real filesystem, `fs.watch` recorded) | with an owned-ignored `vendor`, external `external-tree`, scratch `src/tmp`, output `dist` and an unrooted `node_modules`, 400 extra files beneath `vendor` and 400 inert files in `docs`: exactly `.`, `docs`, `src` registered; 7 classifier calls (one per child directory met); `registrations()` lists the five pruned roots |
| no delivery beneath an exclusion | byte edits and creations beneath all five trees and `dist`'s removal deliver nothing and register nothing (positive control: the inert `docs/notes.md` edit is delivered); renaming `vendor` and removing `src/tmp` deliver both roots' own events; the moved tree, now outside every exclusion, is registered with its four directories |
| reconfiguration | dropping `vendor` and declaring `docs` closes `docs`' handle, registers `vendor`'s three directories (and `reconfigure` reports 3), changes the pruned list; a `docs` edit is no longer delivered, a `vendor` edit is; classifier work ≤ 12 calls |
| installed daemon (real process, private endpoint, registration probe) | after the first revision the daemon's open registrations are exactly the project's `.`, `docs`, `src`, and the status reports them; byte edits beneath `vendor`, `external-tree`, `src/tmp`, an inert edit and creations there publish no revision, keep `inputId`, `observedInputs` and `registrations`, and add no `fs.watch` call; a source edit publishes a `watch` revision; renaming `vendor` away publishes an invalid revision (missing owned-ignored root) and renaming it back a completed one; declaring `docs` ends its registration (`directories` 2); removing the `vendor` declaration registers `vendor`, `vendor/deep`, `vendor/deep/dir`, and a reincluded source edit publishes a revision naming it; the daemon and every process it started have exited afterwards |

`subs/daemon/src/tests/project-boundary-wire.test.ts` (4 tests):

| Test | Independent expectation |
| --- | --- |
| strict reply decoder | both new variants accepted; 31 malformed variants refused (unknown status, missing or empty classification paths, checked or superseded paths in a classification, `published: false` with paths, bad or misplaced identities, reason/exclusion disagreements, module presence by owner, unknown disposition, escaping, absolute and non-normalized paths, duplicates, unknown timing member, report schema `ramify.analysis/1`); errors and other operations untouched |
| strict status | registrations round-trip (null only without an active watcher, 20 listed of 25); ten malformed registrations refused |
| real socket, fake peer | a well-formed `classification-changed` reply is delivered; a malformed one fails the connection with "Invalid check reply schema" and the pending request receives `internal-error` |
| installed daemon over real IPC | a null-classification request answers `classification-changed` with the exact classification of six paths (source and inert analyzed; owned-ignored, external, scratch, `node_modules` not analyzed with their exclusions); the follow-up with the published sequence and two hashes reports `checked`/content and `not-analyzed`/`owned-non-source` with the rest unchanged, check passed; twelve malformed requests answer `invalid-request`; `ramify.ipc/1`, a foreign build key and a foreign engine are each rejected `incompatible` with the daemon identity and closed, the daemon still serving; the status scope and registrations crossed the strict codec in events and replies; affected seeds keep status, basis and exclusion, byte-ordered; clean exit of every process |

`subs/daemon/subs/contexts/src/tests/watch-registration.test.ts` (5 tests,
scripted session, controlled watcher): the reserved-path scope first, then each
changed exclusion set, pruning without a sweep and no reconfiguration for equal
exclusions; during a gap a request is not covered and its capture sweeps, the
end requires one conservative sweep, after which coverage resumes; a sweep that
finds a change made during the gap publishes a `conservative` revision; a gap
whose tree registers nothing needs no sweep and restores `synchronized`;
registrations are null once the watcher is closed.

**Negative control.** The base commit (`git archive 790a534c`) was extracted to
`negative/base-tree`, built there, the six new test and helper files copied in
unchanged, and the three new test files run against base code and base build:
all 13 tests failed (`negative/base-negative-control.out`: registrations beneath
excluded trees, missing `registrations`, malformed replies accepted,
`validateServiceReply` absent). The worktree files were never modified
(`negative/candidate-unchanged.txt`); no base daemon process remained.

**Process check** (`process-check.sh`, run `process-final/`, built
`dist/src/ramify`, resident daemon in the private endpoint
`process-final/endpoint/`, the daemon's actual inotify watches read from
`/proc/<pid>/fdinfo` and mapped to directories by inode): after `ramify watch`
started the daemon, status `registrations` `{ sequence 1, directories 3, pruned
external-tree, src/tmp, vendor }` and exactly three inotify watches, on `.`,
`docs`, `src`; byte edits beneath the three excluded trees, an inert edit and
creations there: same published revision and `inputId`, same observed inputs,
same three watches, no new watch revision line; a source edit: watch revision 2;
a hook check over the real wire (`04-hook.out`, exit 0): `src/main.ts` checked,
`docs/notes.md` not analyzed owned-non-source, `vendor/...` owned-ignored,
`external-tree/...` external, `src/tmp/...` scratch, with the nonblocking
compiler-selected-owned-ignored warning; a stale (`ramify.ipc/1`) and a foreign
build-key hello each rejected `incompatible` and closed (`05-stale-peer.out`);
declaring `docs`: registrations sequence 3, directories 2, two watches (`.`,
`src`); removing the `vendor` declaration: sequence 4, directories 6, six watches
(`.`, `src`, `vendor`, `vendor/deep`, `vendor/deep/dir`, `vendor/new`), and the
reincluded source's edit published a watch revision; `ramify watch` stopped with
SIGINT, `ramify daemon stop` exit 0, status afterwards not running, no process
left (`process-summary.txt`, `process-final/out/`). Earlier attempts
(`first-attempt/`, `process-run/`) had a broken process-ID and inotify parser in
the script and are kept as such.

**Listing behaviour of compiler-listed inert and scratch files (handed over by
iterations 14–15).** Byte edits change nothing (iteration 12's identities) and
now reach no listener at all beneath an exclusion. A creation or deletion beneath
a scratch or declared directory that the compiler configuration lists changes the
listing identity the capture recorded; with no registration beneath the
exclusion it is reconciled by a sweep (periodic, or the required sweep of a plain
synchronized check) or by a capturing changed check's re-observation hint, which
rebuilds and recomputes the compiler-selection warnings; never by a watch
registration beneath the exclusion. An inert creation in a walked directory is
delivered and ignored by the observer as before (iteration 12, gap 3).

## `daemon.md`, `processes-and-clients.md` and READMEs

- `daemon.md`: the sweep paragraph lists the end of a registering watch
  reconfiguration among required sweeps; a new **Watch registrations** paragraph
  (watch scope, pruning, own-entry delivery, cost, reconfiguration, gap,
  `ContextStatus.registrations`, the pre-revision registration and the listing
  behaviour); the covering rule names a pending reconfiguration gap.
- `processes-and-clients.md`: the codec paragraph states the request validation
  of named paths and classification, the strict check-reply and status decoding
  under `ramify.ipc/2`, and handshake rejection.
- Owner READMEs whose statements became false: `subs/daemon/README.md` (the
  watcher no longer prunes by a name set; strict replies; owner tests that start
  the built daemon), `subs/daemon/subs/contexts/README.md` (registrations and
  gaps; the controlled watcher records scopes and can hold reconfigurations),
  `subs/cli/README.md` (status and watch lines carry registrations). No first
  paragraph changed.

## Re-reasoned expectations and instance rows

Each from the contracts ("Transport, observation and projections": no watch
beneath revision-bound excluded roots or reserved paths) and the layout
specification, never from candidate output:

- `subs/daemon/src/tests/watcher.test.ts`, "never attaches beneath reserved or
  rooted exclusions …" (was "never attaches to excluded trees at any depth"): the
  fixed set is replaced by a scope with external `.reference-work`, output
  `dist` and scratch `src/tmp`; `node_modules` and `.git` stay unregistered at
  both depths (reserved wherever they occur), `dist` and `.reference-work` are
  unregistered at the root only, and `src/dist`, `src/.reference-work` are
  registered and their edits delivered (rooted exclusions do not apply elsewhere).
  The other watcher tests pass the reserved-path scope; their generated-name
  expectations hold unchanged (generated names are reserved segments).
- `subs/daemon/src/tests/codec.test.ts`: the status fixture carries
  `registrations`.
- `controlled-ports.test.ts`, `quick-environment.test.ts`: the port's new scope
  argument.
- Plan 2A `plan2a-isolation-cases.ts`, `I2A-02:watcher-silent` and
  `I2A-02:transient-names-excluded`: the direct watcher calls pass the scope a
  context gives before its first revision (Project's classifier over an empty
  table); `.ramify`, `.ramify.tmp-*`, `.ramify.old-*` are reserved generated
  segments there, so no handle and no event, and the neighbouring source event is
  still delivered. Assertions unchanged.
- `final-contracts.test.ts`: the daemon layer list gains the new layer.

**Instance rows.** No `plan*-instances.ts` row, count or identity changed. No
row's prose became false: `I2A-02:transient-names-excluded` ("excluded at
inventory, observation and watcher boundaries") and `I2-08:unwatched-dependency`
(an unwatched `node_modules` declaration) still describe what is asserted. Plan 1
instances exercise batch analysis, which this slice does not change; none was
re-reasoned.

## Commands and results

Focused commands ran without the lock. The harness files, single instances,
S1000 timings and `reference:cases` held `/tmp/ramify-audit-tests.lock`
(`run-locked.sh`: requested 22:19:34, acquired 22:19:45, released 22:32:42 UTC;
`run-locked-s1000.sh`: acquired 22:51:58 after waiting for another holder;
`run-cases.sh`: requested 22:55:46, acquired 23:11:54). The tree was identical
(same `git status` and diff hash) for all locked runs and before and after
`reference:cases`.

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check`; new files checked for trailing whitespace | 0 | clean | `diff-check.log` |
| `npm run build` (final, after the last source edit) | 0 | built | `build.out`, `build.exit` |
| `npm run type-check` | 0 | four scopes | `type-check.out` |
| `npx tsx scripts/validate-final-contracts.ts` | 0 | 15 owners, 604 files | `validate-final-contracts.out` |
| `npm run check:self` | 0 | passed, partial; 15 owners, **587** source files (581 + the six new test files and helpers), 17 resources, 8716 accesses, 0 errors, 0 warnings, 41 limits, 5595 allowed, 0 denied, 3077 external | `check-self.out` |
| `npx vitest run subs/daemon/src/tests/project-boundary-wire.test.ts subs/daemon/src/tests/project-boundary-watcher.test.ts` (and `watch-registration.test.ts`) | 0 | 4 + 4 (+ 5) tests, inside the directory runs below | `vitest-daemon.out`, `vitest-contexts.out` |
| Negative control (base tree and build, new tests) | 1 | 13 of 13 failed; candidate untouched | `negative/` |
| `npx vitest run subs/daemon/src/tests/` | 0 | 23 files, 257 tests | `vitest-daemon.out` |
| `npx vitest run subs/daemon/subs/contexts/src/tests/` | 0 | 15 files, 191 tests | `vitest-contexts.out` |
| `npx vitest run subs/cli/src/tests/` | 0 | 8 files, 245 tests | `vitest-cli.out` |
| `npx vitest run subs/analysis/subs/descriptions/src/tests` | 0 | 7 files, 309 tests | `vitest-descriptions.out` |
| Root test files (intended: the `src/tests` files by name) | 0 | **196 files, 2763 tests** — see deviation 1 | `vitest-root-files.out` |
| Process check, built CLI, resident daemon in a private endpoint | as listed | stopped explicitly, no process left | `process-check.sh`, `process-summary.txt`, `process-final/` |
| Harness `final-contracts.test.ts`, `plan5-completion.test.ts` (locked) | 0 | 2 files, 16 tests | `h-final-contracts-plan5-completion.log` |
| Harness `resident-fixtures.test.ts` (locked) | 0 | 18 tests | `h-resident-fixtures.log` |
| Harness `plan5-live.test.ts` (locked; the I5-12 live instances) | 0 | 6 tests | `h-plan5-live.log` |
| Harness `equivalence.test.ts`, `lifecycle-fixtures.test.ts` (locked; real CLI watch) | 0 | 2 files, 35 tests | `h-equivalence-lifecycle.log` |
| Plan 2 single instances (locked): I2-08 ×5, I2-14 ×8, I2-15 ×4, I2-16 ×5, I2-18 watch-lease and incompatible, I2-19 status-no-start and daemon-entry-boundary, I2-21 ×4, I2-22 status-running, I2-24 ×5, I2-26 remove-hop-live, I2-27 watch-exit-releases and reconnect-after-crash-live, I2-30 declarations-final | 0 | 40/40 passed | `p2-instances.out` |
| Plan 2A single instances (locked): I2A-02 watcher-silent and transient-names-excluded (re-reasoned), I2A-13 declarations-package | 0 | 3/3 passed | `p2a-instances.out` |
| Plan 5 single instances (locked): I5-11 ×9, I5-08 sweep-scheduled and dispose-releases, I5-14 declarations-final and documents-revised | 0 | 13/13 passed | `p5-instances.out` |
| S1000 cold retained-session open, I5-08 inputs (iteration 13's script, locked) | 0 | **23.6 s**, 1000 owners, 11 000 files, complete (iteration 13: 24.0 s; deadline 30 s) | `s1000-cold-open.out` |
| S1000 cold open in the installed daemon to the first synchronized report (locked; base and candidate builds alternately) | 0 | base 36.9 s, 37.0 s; candidate 37.0 s, 37.3 s; the candidate's registrations follow 7 ms later: 4001 directories, nothing pruned (S1000 declares no tree) | `s1000-base-*.out`, `s1000-candidate-*.out`, `s1000-daemon-open.out` |
| `npm run reference:cases` (locked, after the build, frozen tree, 23:11:54–23:17:42 UTC) | 0 | **37 files, 393 tests** | `cases.stdout`, `cases.stderr`, `diff-*.sha`, `status-*.txt` |

`reference:verify` was not run; it is left to the coordinator's milestone gate
(plans 1, 2, 5 and 2a). No `*.test.mjs` changed, so no `node --test` run was due.
The daemon-level S1000 figure is not the I5-08 measure (that is the session open
above); it has no earlier target and is recorded only to show the watcher adds
nothing measurable at that scale.

## Protected documents and proposed patches

No `.principles.md`, `.spec.md` or glossary file was edited, and no patch is
proposed (`proposed-spec-patches.diff` is not written). One conflict is reported
instead (decision 1 below): `module-description.spec.md` says owned-ignored
contents are never watched, which the registration before a context's first
completed revision does not meet.

## What iterations 17–18 still lack

- 17: human presentation of dispositions and registrations (the CLI prints
  status JSON as received), help, exit-code wording, the `cli-invocation.spec.md`
  patches, PB1-20 through built CLI processes, root selection (PB1-30) and Git
  advice.
- 18: architect metadata, API-view selection and measurement buckets.
- 20: requalification of PB1-23/25 and PB1-37's 10 000 inert / 5 000 excluded
  scale (this slice shows 400 + 400 files leaving registrations and classifier
  work unchanged).

## Deviations, gaps and decisions needed

1. **Registration before the first completed revision (decision; spec
   conflict).** Before a context's first completed revision there is no
   ownership table, so the watcher registers by the reserved-path rules alone and
   walks declared trees, scratch and output directories until that revision's
   exclusions prune them (the process check and the real-daemon test assert the
   state after the first revision). This keeps the open's existing watch
   coverage, but `module-description.spec.md` says owned-ignored contents are
   never watched. Alternative: attach no watcher until the first completed
   revision and treat the open as a registration gap (a required conservative
   sweep right after every fresh open). That costs one sweep per fresh open and
   changes expected values that assume coverage straight after an open (contexts
   sweep counts, covered-request cases). A reopen after cooling already uses the
   retained table.
2. **`ContextStatus.registrations`.** The brief extends `ramify.watch/2` and
   `ramify.daemon-status/2`, and the process check asks to show registrations
   through `ramify watch` and `ramify status`; the only status fact this slice
   adds is the watcher's registrations, so the status gains that member (scope
   sequence, directory count, at most 20 pruned directories and their total).
   The coordinator may prefer another shape.
3. **Exposure.** Daemon exposes `validateServiceReply` to the root so the quick
   environment decodes check replies as the socket client does (recorded layer).
   Without it the strict decoder would cover only real sockets.
4. **Liveness beneath exclusions.** Nothing beneath an exclusion is registered,
   so a membership change in a compiler-listed scratch or declared directory
   (which changes compiler-selection warnings) and an edit to a file read through
   a link into a declared tree are found by sweeps and capturing requests, not by
   the watcher. Before this slice declared trees and scratch were watched. The
   own entries of output, package, repository and generated directories are not
   delivered (as for the former name set).
5. **Gap scope.** Only reconfigurations that drop an exclusion open a gap, and
   only one that registered a directory requires the sweep. Reattachment after a
   watcher error or cooling keeps its existing behaviour (the error already
   requires a sweep; a reopen is conservative), and the walk race at a fresh open
   is unchanged.
6. **Owner tests that need a build.** The two new daemon test files start
   `dist/src/daemon-entry.js` (the brief's "real installed processes"); like the
   root's process tests they require a current `npm run build`, which the brief's
   command order runs after them.

**Deviation (process).** The run meant to name the root's `src/tests` files
explicitly passed them as one zsh word (no word splitting), which Vitest treated
as a filter and so ran nearly the whole toolkit suite: 196 files, 2763 tests, all
passed (`vitest-root-files.out`). The instruction was to avoid that; it is
reported, not repeated. The root files it covered include `resident-cli`,
`quick-environment`, `resident-assembly` and the process tests.

## Coordinator review

Pending.

## Coordinator review

The coordinator reviewed the strict reply validation, the watcher scope and
its reconfiguration and gap rules, and the three new test files against the
brief and the contracts. No protected document changed. This iteration ran
one iteration ahead in the second worktree; it was rebased onto the iteration
15 fixture fix (`53b704bd`) and merged after that gate was green. Accepted:
`ContextStatus.registrations` as the form in which watch and daemon status
show the registrations; `validateServiceReply` exposed to the root so the
quick environment checks replies as a socket client does; changes beneath a
listed exclusion reaching a session through sweeps and capturing checks, not
through the watcher. One point is put to the user: before a context's first
completed revision there is no ownership table, so the watcher walks declared
trees until that revision prunes them, while the layout specification says
owned-ignored contents are never watched. The agent's run of the root test
files matched nearly the whole suite through a quoting slip; it passed and is
recorded as a rule deviation, not as gate evidence. The agent did not run
`reference:verify`; the coordinator's milestone gate runs the audit,
`reference:cases` and the full verification of plans 1, 2, 5 and 2A on the
committed candidate.

After the milestone gate, the watcher window was settled by the relay session
under the user's standing instruction; the user was told and may override it.
The layout specification keeps the result guarantee for owned-ignored
contents (never inventoried, compiled by Ramify or checked, and a change
beneath them never affects a result) and no longer says "watched"; the daemon
architecture states the timing: the watcher prunes declared trees from the
first completed revision on, and before it only the reserved names are pruned
and events from declared trees are ignored. The milestone gate on `3b5c168f`
passed `reference:cases` and the verification of plans 1, 2, 5 and 2A with
only the measurement instances failing; its audit step failed once on the
load-sensitive explorer test MT09, which is repaired separately.
