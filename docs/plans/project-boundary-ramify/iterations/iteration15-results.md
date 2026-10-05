# Iteration 15 results: changed-path dispositions in contexts

**Date:** 2026-10-04. **Status:** implementation receipt for
[iteration 15](iteration15.md). It awaits the coordinator's review,
protected-file comparison and gate. Changes are uncommitted in the second
worktree, pipelined one iteration ahead of the coordinator's gate on
`376f4539`. No case is produced here (the brief names none); PB1-20 and
PB1-23 receive evidence at this slice's boundary, their producers being
iterations 17 and 16. `reference:verify` was not run: the coordinator's gate
runs it.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1-next`, branch `feat/project-boundary-ramify-next` |
| Base commit / tree | `376f4539` (tree `9e73a875…`), clean at assignment, dependencies installed |
| Contract revision | `contracts.md` `3288425c…`; `cli-invocation.spec.md` `66ed09f6…`; `module-description.spec.md` `2e583562…`; `glossary.md` `ae8e3207…` (all unchanged; one patch proposed). Non-protected `daemon.md` `a21c0428…` → `da5912a1…`, `processes-and-clients.md` `e46dd4f8…` → `a3a34c87…` |
| Configuration | unchanged: `package.json`, `package-lock.json` `fd3c84ba…`, `ramify-audit.json` `b59f28f6…`, every `tsconfig*.json` and Vitest configuration; nothing under `ramify-agent/`, `/ramify-audit` or `/ramify` |
| Node / tools | v22.23.3; TypeScript 7.0.2; Vitest 4.1.11 |
| Changed (source) | `subs/daemon/subs/contexts/src/context-manager.ts`, `context.ts`, `interfaces/contexts.ts`; `subs/daemon/src/validation.ts`, `service.ts`; `subs/analysis/src/interfaces/session.ts`, `session-engine.ts`; `subs/cli/src/changed-command.ts`, `format.ts`, `interfaces/cli.ts`; `src/interfaces/service.ts`, `src/resident-assembly.ts`; `module.ramify`, `subs/daemon/module.ramify`; `scripts/validate-final-contracts.ts` |
| Changed (tests, harness, measurements) | `subs/daemon/subs/contexts/src/tests/scripted-driver.ts`; `subs/daemon/src/tests/measure-driver.ts`, `session-counters.test.ts`, `validation.test.ts`; `subs/cli/src/tests/changed-command.test.ts`, `changed-cleanup.ts`, `exhausted-recovery.ts`; `src/tests/resident-cli.test.ts`; `scripts/measurements/fast-assertions.mjs`, `fast-evidence.test.mjs`; `scripts/reference-harness/plan5-hook-cases.ts`, `plan5-live-cases.ts`, `plan5-live-process.ts`, `final-contracts.test.ts`, `fixtures/plan5/hook-probe.mjs` |
| Changed (prose) | `docs/architecture/daemon.md`, `docs/architecture/processes-and-clients.md`, `README.md`, `subs/cli/README.md`, `subs/daemon/subs/contexts/README.md`, `scripts/measurements/README.md` |
| Added | `subs/daemon/subs/contexts/src/dispositions.ts`, `subs/daemon/subs/contexts/src/tests/project-boundary-check.test.ts`, this receipt |
| Evidence | `/home/app/ramify-pb1-evidence/iteration15/` |

## Changed behaviour

1. **Ports and facts.** `AnalysisDriver` gains `classify(scope, path)`, which
   the root assembly binds to Project's `classifyProjectPath` (and the daemon
   service forwards); contexts has no classifier of its own and reads no file.
   `SessionRevision` gains `scope`, the revision's report scope (the invalid
   acquisition's own, else the valid inventory's; null without an inventory),
   so ownership is revision-bound. The context keeps the scope of the latest
   *completed* published revision (`context.scope`, also the status `scope`):
   an invalid acquisition's ownership is no valid model (its broken root owns
   nothing), so a changed check decided at an invalid revision is classified
   by the latest completed table.
2. **Request.** `CheckRequest`/`CheckParams` gain `paths` (normalized,
   distinct, nonempty, inside the root) and `classification` (the context
   revision sequence whose classification the expectations follow, or null),
   present together and only with synchronized freshness; every expected path
   must be among `paths`. The daemon's strict request validation enforces this.
   A request without `paths` keeps its former behaviour, except containment
   first in the configuration rule.
3. **Classification sequence.** At arrival the context classifies `paths` over
   the latest completed published ownership table: an owned path outside every
   exclusion is *analyzed* and needs its expectation; a path in an
   owned-ignored, external or scratch directory or another always-excluded
   path is `not-analyzed` (reasons `owned-ignored`, `external`, `scratch`,
   `reserved`) and must have none. Expectations that do not name exactly the
   analyzed paths are answered at once `classification-changed` with the
   published revision and the classification (analyzed paths `not-checked`,
   reason `classification-changed`); nothing is queued and nothing analyzed.
   Otherwise every named path is queued for re-observation (not-analyzed ones
   as hints only: the observer reads nothing beneath an exclusion and keeps no
   observation of an inert file), the covering rule applies, and the covering
   revision classifies again: a boundary change in that capture answers
   `classification-changed` with that revision instead of dispositions.
4. **Configuration rule, containment first** (iteration 1 gap 7). A named or
   watched `package.json`, lockfile or `tsconfig*.json` is a configuration
   change only when the latest ownership table places it outside every
   exclusion; `site/package.json`-like manifests in declared trees are
   `not-analyzed`, never `configuration-changed`, and a watcher event for one
   requires no sweep.
5. **Dispositions** (`dispositions.ts`, `decide`). Per analyzed path at the
   covering revision: `checked`/`content` with the sha256 when the revision read
   the expected bytes; `checked`/`deleted` (sha256 null) when the client found
   it absent and the revision observed it absent, or no longer holds it as an
   analysis input an earlier published revision of the live session held;
   `not-analyzed`/`owned-non-source` when a capture since arrival re-observed it
   and it is no analysis input (absent and never analyzed, or present with only
   a zero-byte existence probe or nothing); `not-checked`/`superseded` when the
   revision holds other content, or the file the client found absent;
   `not-checked`/`unobserved-input` defensively when no capture re-observed a
   non-input path, or no ownership table exists yet. Every disposition carries
   `module` and `exclusion`; only checked paths carry an identity.
6. **Content expectations and excluded bytes.** Expectations are needed only
   for analyzed paths; an expectation for an excluded path is refused as
   `classification-changed`, so excluded bytes are never compared, captured or
   watched for freshness.
7. **Deletion evidence.** At each publication the context records the
   analysis inputs the previous published revision of the live session held
   and the new one does not (bounded by `maxQueuedPaths`, oldest first; cleared
   when the path is analyzed again or the context is evicted). This makes the
   deletion of an unreferenced source checked whether the hook or the watcher
   published the removal first.
8. **Mixed requests.** A request with a superseded path is now a `reported`
   outcome carrying every path's disposition and the revision's findings
   (before: a whole-request `superseded` without findings); the CLI exits 2 and
   keeps the findings, as the contract requires.
9. **Recovery.** `classification-changed` is a new `CheckOutcome` status. The
   lightweight CLI cannot run Project's classifier (I5-11 forbids analysis
   modules in its process), so its first request carries `classification: null`
   and no content; the answer supplies the classification; the CLI hashes the
   analyzed paths once (recovery keeps those hashes) and asks again within the
   remaining deadline on the same context; a classification that goes stale
   again is retried once more, then the result is not checked with reason
   `classification-changed`. A not-checked whole-request answer (cold,
   deadline, configuration, unavailable, …) keeps the not-analyzed paths the
   daemon classified and marks the others not checked with the request's reason.
10. **Exit code** (CLI). A coherent reported revision gives 0 or 1 exactly as
    before, whatever paths are not analyzed; any not-checked path gives 2 with
    `outcome: 'not-checked'`, the first such path's reason and the findings.
11. **Unchanged-surface.** No code change (deliverable 4 is documentation).

## Document shapes and consumers

`ramify.ipc/2` and `ramify.check/2` are extended without a new version, as the
brief states: check requests gain `paths` and `classification`; a published
`reported` outcome gains `paths: PathCheckDisposition[]` (empty without
`paths`); `CheckOutcome` gains the `classification-changed` status; the CLI
document replaces `changed[{ path, sha256, covered }]` with
`paths[{ path, disposition, module, exclusion, reason, sha256? }]` and its
`reason` vocabulary gains `classification-changed`. `PathCheckDisposition` is a
new contexts type, relayed by daemon and root beside `CheckOutcome`
(validator layer "Phase 1 project boundaries (path dispositions)"; no README
purpose changed). `SessionRevision.scope` travels only on the private worker
protocol. No other document changes shape; the status `scope` keeps its shape
and is now filled from publication rather than from the last fetched report.

Consumers migrated: the strict request validation (daemon), the service
forwarder, the CLI changed command, its JSON and human output (one line per
path disposition; iteration 17 finishes presentation), the toolkit tests listed
above, the measurement assertions and their tests, and the Plan 5 harness
(hook, live, live-process, probe) and final-contracts expectations. The hook
example `examples/hooks/claude-code-post-write.mjs` needs no change: it reads
`schemaVersion`, `outcome`, `reason`, `findings`, `exitCode`, `revision` and
`execution`, whose meanings hold; the process check ran it.

## PB1-20 and PB1-23 at this boundary

`project-boundary-check.test.ts` (9 tests, scripted session, Project's real
classifier through the driver port, the written topology of `fixtures.md` as
the revisions' ownership, independently written captured inputs including the
compiler's zero-byte existence probes):

| Test | Independent expectation (contracts, CLI specification) |
| --- | --- |
| containment before content | a null-classification request is answered at once `classification-changed` at sequence 1: `src/main.ts` and `notes/design.md` analyzed (not checked, classification-changed); owned-ignored (`app`, `app/a`), external, packages (`reserved`), output (`reserved`) and both scratch paths not analyzed with their exclusions; no update, nothing queued. The follow-up with content: `src/main.ts` checked with its hash, `notes/design.md` (probe only) not analyzed `owned-non-source`, the rest unchanged; one update carrying every named path as a hint; at most 5 classifier calls per path |
| only not-analyzed paths | answered from the published revision with no capture or sweep (`reusedRevision`, `captureStarted: null`); after a revision with a finding, the same request reports that finding as new: not-analyzed paths leave the verdict alone |
| manifests in an owned-ignored tree (gap 7) | `subs/a/fixtures/sample/package.json`, `fixture-project/tsconfig.json`, `fixture-project/package-lock.json` reported not analyzed; root `tsconfig.json` still `configuration-changed`; a watcher event for the ignored manifest requires no sweep, the root `package.json`'s does; a legacy request expecting the ignored manifest is `unobserved-input`, not `configuration-changed` |
| no excluded bytes | an expectation for `fixture-project/src/index.ts` is refused `classification-changed` with no update or queued path; the following request is covered with the excluded path not analyzed and carrying no `sha256` |
| deletion | hook first: an unreferenced source removed by the capture is `checked`/`deleted`; a never-analyzed absent sibling is `not-analyzed`/`owned-non-source`; watcher first: a removal published before the hook is still `checked`/`deleted`; an `absent` compiler probe covers at once; an absent expectation of existing content is `superseded` |
| mixed request | checked, superseded, owned-non-source and owned-ignored dispositions in one reported outcome, with the revision's new finding retained |
| declaration races | a capture that publishes `owned-ignored "data"` answers `classification-changed` (sequence 2, `subs/b/data/x.json` owned-ignored); the reclassified request is covered; a client still at sequence 1 meets the declaration at arrival; removing the declaration answers `classification-changed` at sequence 3 asking for `x.json`'s content, then both paths checked |
| invalid deciding revision | a revision without ownership (broken root) classifies by the latest completed table: `module.ramify` checked, the ignored description not analyzed |
| before the first revision | a cold request's deadline answers `cold`; a waiting null-classification request receives the classification once the open publishes |

**Negative control:** with `context-manager.ts` and `context.ts` replaced by
the base commit's, all 9 tests fail (`negative/base-negative-control.out`); the
candidate files were restored and their SHA-256 verified (`negative/restored.txt`).

**Real resident service** (`src/tests/resident-cli.test.ts`, new test "gives
the complete check's verdict with each named path classified by the project's
ownership", quick environment with the real session, observer and
classifier): `vendor/package.json` (owned-ignored), `docs/guide.md` (inert) and
`src/tmp/scratch.ts` (scratch) exit 0 not analyzed, the CLI sends no content for
the ignored and scratch paths; the unreferenced deleted `src/extra.ts` is
checked as deleted; with a definite violation present, naming only ignored
paths exits 1 with exactly the complete check's findings and exit code.

**Process check** (`process-check.sh`, built `dist/src/ramify`, a resident
daemon in the private endpoint directory `endpoint/`, project
`process-project/`, stopped explicitly): source checked (exit 0); owned-ignored
manifest and source not analyzed (0); inert prose not analyzed (0); scratch not
analyzed (0); deleted unreferenced source checked as deleted (0);
`tsconfig.json` not checked `configuration-changed` (2); `../outside.ts` not
checked `unobserved-input` (2); a source edit with `--deadline 1` not checked
`deadline-exceeded` (2); a mixed request (checked, owned-ignored, inert) 0; a
violation 1; the ignored manifest alone then 1 with the same `not-visible`
finding as the complete check (exit 1); human output lists each path's
disposition. The hook example: clean 0 silent, an ignored file 0 silent, a new
violation 2 with the finding on stderr, a configuration edit 0 with the
one-line `not checked (configuration-changed)` notice. `daemon stop` exit 0;
status afterwards `running: false`; no process left (`process-summary.txt`,
`process-*.{cmd,out,stderr,exit}`, `process-hook-*`).

**Where iteration 16 takes over (PB1-23).** This slice guarantees, on the hook
path, that excluded and inert paths never become expectations, compared
identities or captured inputs (classification refuses them; not-analyzed paths
reach the session only as re-observation hints, which iteration 12's observer
answers without reading beneath an exclusion and without keeping an inert
file's observation). It does not change what the watcher registers, nor the
compiler's zero-byte existence probes of inert and scratch files a
configuration lists: a byte edit leaves them unchanged (iteration 12), but
creating or deleting such a file changes the listing identity and rebuilds.
Watcher registrations from the scope's exclusions and that listing behaviour
are iteration 16's (PB1-23 producer). PB1-20's CLI-process qualification,
presentation and help are iteration 17's.

## `daemon.md` and `processes-and-clients.md` corrections

- Deliverable 4 (user's decision of 2026-10-03): the `unchanged-surface` row
  now reads "Re-extracts that file and refreshes the decisions citing
  declarations or accesses that moved; decides nothing else." No code or test
  change.
- The affected-modules row: each path seed carries its "status, module, basis
  and exclusion" (iteration 14).
- Made false by this slice and corrected: the Checks row ("return each changed
  path's disposition"); "Freshness and saves" (expected hashes only for the
  paths the classification analyzes); the fast-incremental-check bullets
  (a new disposition bullet; containment before the configuration rule for
  events and named paths); the covering rule (an empty expectation list covers
  a changed check naming its paths; whole-request `unobserved-input` and
  `superseded` only without named paths); a new **Changed-check
  classification** paragraph; the sweep trigger ("a plain check naming neither
  paths nor expectations"); **Hook request and reply** (classification answer,
  hashing analyzed paths, remaining deadline, one stale retry, dispositions,
  exits). `processes-and-clients.md`: the `--changed` row and the hook exit
  table (exit 0 and 2 wording, `classification-changed` after its retry, a
  path not checked). The Plan 5 document checks (`plan5-completion-cases.ts`)
  still match: covering rule, sweep, revision paths, hook request with
  `ramify.check/2`, the four-row exit table.
- Owner and user READMEs whose statements became false: root `README.md`,
  `subs/cli/README.md`, `subs/daemon/subs/contexts/README.md` (a paragraph after
  the purpose; purpose unchanged), `scripts/measurements/README.md`.

## Re-reasoned expectations

Each from the contracts (R4; "Reports, affected queries and freshness") and the
lightweight-client constraint, never from candidate output:

- `subs/cli/src/tests/changed-command.test.ts`: two requests (null
  classification without content, then the hash with classification 1);
  documents carry `paths` dispositions (`checked`/`content` with the hash,
  `not-checked` with the request's reason and module from the classification,
  no identity). The recovery case injects its lost reply on the first request
  carrying content (three requests; the retry repeats that request's
  freshness). The injected-unpublished case strips `paths` to obtain a real
  plain report.
- `exhausted-recovery.ts`, `changed-cleanup.ts`: the classification request
  passes through and is counted separately; the delivery and cleanup faults
  apply to the request carrying content; a not-checked path carries no
  identity (the sent request still holds the original hash).
- `src/tests/resident-cli.test.ts`: two requests per hook and a
  `classification-changed` outcome before each reported one; dispositions with
  module IDs `fixture` and `fixture/consumer`; `never-observed.txt` (owned,
  absent, never analyzed) is now not analyzed with exit 0 instead of
  `unobserved-input`/2, because the complete check does not analyze it (R4);
  `../outside.ts` stays not checked; the test title says so.
- `plan5-hook-cases.ts`: the generic helper asserts no not-checked path for exit
  0/1 and no checked path for the single-path exit-2 runs; I5-11
  `changed-hashes-in-cli` asserts the two delta requests (paths, null then the
  published sequence, empty then the hash) and that `src/missing.ts`, never
  analyzed, is not analyzed with exit 0 (was 2), still sent as an absent
  identity; `plain-check-unchanged` lists `paths` instead of `changed` among
  compact members. `fixtures/plan5/hook-probe.mjs` rewrites the file at the
  first delta frame carrying a hash (the classification frame carries none),
  so the superseded run still rewrites after the CLI hashed.
- `plan5-live-process.ts`: each path checked with the CLI's identity
  (`content`/`deleted`) for exit 0/1, not checked without identity for 2.
- `plan5-live-cases.ts`: step 12's removed unreferenced file is checked as
  deleted with the step revision's verdict (was `unobserved-input`/2), because
  deleting previously analyzed source is checked once its removal is analyzed;
  `hook-race-watcher` reads the delta request carrying the hash; the burst
  requires every path checked.
- `fast-assertions.mjs`, `fast-evidence.test.mjs`: covered entries become
  `checked` dispositions with the expected path and identity; the configuration
  row requires `not-checked`/`configuration-changed` with no identity.
- `final-contracts.test.ts`: the daemon's layer list gains the new layer.

**Instance rows.** No `plan*-instances.ts` row, count or identity changed. No
row's prose became false: I5-11 `changed-hashes-in-cli` ("the CLI computes the
file's sha256 itself and sends it in `expect` … a named missing file is sent as
an absent identity") still holds, though it does not mention the
classification request; I5-12 `reference-sequence-live` says nothing of the
absent-path hook. Already stale before this slice and untouched: I5-11
`changed-delta-document` (`ramify.check/1`), `plain-check-unchanged`
(`ramify.analysis/1`).

## Commands and results

Focused commands ran without the lock; the harness files, single instances and
`reference:cases` held `/tmp/ramify-audit-tests.lock` (`run-locked.sh`, lock
requested 19:54:21 UTC, acquired 19:56:15 UTC).

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check`; new files checked for trailing whitespace | 0 | clean | `diff-check.log` |
| `npm run build` (final, after the last source edit) | 0 | built | `build.out`, `build.exit` |
| `npm run type-check` | 0 | four scopes | `type-check.out` |
| `npx tsx scripts/validate-final-contracts.ts` | 0 | 15 owners, 598 files | `validate-final-contracts.out` |
| `npm run check:self` | 0 | passed, partial; 15 owners, 581 source files (579 + `dispositions.ts` + the new test), 17 resources, 8592 accesses, 0 errors, 0 warnings, 41 limits, 5520 allowed, 0 denied, 3028 external | `check-self.out` |
| `npx vitest run subs/daemon/subs/contexts/src/tests/project-boundary-check.test.ts` | 0 | 9 tests | `vitest-focused.out` |
| Negative control (base `context-manager.ts`, `context.ts`) | 1 | 9 of 9 failed; restored, SHA-256 verified | `negative/` |
| `npx vitest run subs/daemon/subs/contexts/src/tests/` | 0 | 14 files, 186 tests | `vitest-subs-daemon-subs-contexts-src-tests-.out` |
| `npx vitest run subs/daemon/src/tests/` (after the validation test) | 0 | 21 files, 249 tests | `vitest-subs-daemon-src-tests.out` |
| `npx vitest run subs/cli/src/tests/` | 0 | 8 files, 245 tests (first runs failed on the old `changed`/request-count expectations, re-reasoned above) | `vitest-subs-cli-src-tests-.out` |
| `npx vitest run subs/analysis/src/tests/` | 0 | 44 files, 507 tests | `vitest-subs-analysis-src-tests.out` |
| `npx vitest run` the 20 root `src/tests/*.test.*` files by name (after the build) | 0 | 20 files, 104 tests (103 + the new real-service test) | `vitest-root-files.out` |
| `node --test scripts/measurements/fast-evidence.test.mjs`; `companion-assertions.test.mjs` (imports the changed assertions) | 0; 0 | 20; 4 tests | `node-test-*.out` |
| Process check, built CLI with a resident daemon in `endpoint/` | as listed above | stopped explicitly, no process left | `process-check.sh`, `process-summary.txt`, `process-*` |
| Harness `final-contracts.test.ts`, `plan5-completion.test.ts` (locked) | 0 | 2 files, 16 tests | `h-final-contracts-plan5-completion.log` |
| Harness `resident-fixtures.test.ts` (locked) | 0 | 18 tests | `h-resident-fixtures.log` |
| Harness `plan5-live.test.ts` (locked; I5-12 live instances incl. the re-reasoned step 12, race and burst) | 0 | 6 tests | `h-plan5-live.log` |
| Single Plan 5 instances (locked): all nine I5-11 and I5-14 `documents-revised` | 0 | 10/10 passed | `p5-instances.out` |
| `npm run reference:cases` (locked, after the build, frozen tree, 20:03:52–20:09:35 UTC) | 0 | **37 files, 393 tests**; diff and status identical before and after, and since the locked run began | `cases.stdout`, `cases.stderr`, `diff-*.sha`, `status-*.txt` |

`reference:verify` was not run; it is left to the coordinator's gate. The
fast-measurement instances, which execute the migrated assertions over new
measurements, were not run (their logic is covered by the two `node --test`
files); the milestone gate runs them.

## Protected documents and proposed patch

No `.principles.md`, `.spec.md` or glossary file was edited.
`proposed-spec-patches.diff` (passes `git apply --check` in the worktree)
changes `docs/architecture/cli-invocation.spec.md`, "Hook and complete checks":
the hook check hashes the named paths the daemon's classification analyzes; a
not-analyzed path is never captured and needs no content coverage, a path in
an excluded directory is not hashed, and an owned file the covering revision
finds to be no analysis input carries no content identity although the client
hashed it before that was known. It records gap 1 below; the coordinator may
instead ask for the other behaviour. Dropping "When project boundaries are
implemented," and the CLI's presentation and exit wording stay with
iteration 17's patch.

## What iterations 16–17 still lack

- 16: carry `paths`, `classification`, the `classification-changed` status and
  the dispositions through real IPC with wire tests (this slice only extends the
  strict request validation; responses are not decoded strictly); watcher
  registrations from the scope's exclusions; the listing identity of inert and
  scratch files a configuration lists (PB1-23, PB1-25).
- 17: CLI presentation (the human line now prints `path (disposition: reason)`
  after "Checked"/"Not checked"), help (still "Hashes the named paths relative
  to the root"), exit-code wording, the `cli-invocation.spec.md` patch, and
  PB1-20's `project-boundary-cli.test.ts` through real built processes.

## Gaps and decisions needed

1. **Inert owned files are hashed by the client.** Classification by ownership
   cannot tell an inert owned file from new source before the capture, so the
   CLI hashes every owned path outside an exclusion; an inert one is then
   `not-analyzed` with no identity and is never captured. The specification
   says a not-analyzed path is not hashed. Options: accept (patch proposed),
   or classify by the published revision's inputs as well, which costs a third
   round trip and the stale retry for every new source file.
2. **One extra round trip per hook.** The CLI cannot load Project's classifier
   (I5-11 forbids analysis modules in its process), so each hook's first
   request obtains the classification (answered at once on a warm context, no
   analysis). The "retry once" of the contract applies to a classification that
   goes stale after that.
3. **Not-analyzed paths are re-observation hints.** They reach the session's
   observer, which reads nothing beneath an exclusion and keeps no inert
   observation; this keeps the covering revision exact when a captured
   dependency input lies in an excluded tree. A covered request queues nothing.
   Dropping hints is possible if the coordinator prefers.
4. **Removal record across cooling.** Removals are recorded while a session
   lives; a source deleted while the context was cold (session released) and
   then named is `not-analyzed`/`owned-non-source` rather than `checked`; the
   exit code is the same.
5. **Invalid revisions classify by the latest completed ownership.** A context
   that never had a completed revision cannot classify: every path is not
   checked (`unobserved-input`), exit 2, where the complete check gives 1.
   Falling back to the invalid revision's own table is possible but leaves a
   broken root owning nothing.
6. **Outside paths** (`../x`) stay a whole-request `unobserved-input` (exit 2)
   from the CLI; the contract lists no disposition for them.
7. **Deadline.** Every request of one hook now gets the remaining deadline,
   reopen retries included (before: the full deadline again on reopen).
8. **Status `scope`** is now the latest completed published revision's (before:
   the last fetched report's, often null).
9. **Owners touched beyond contexts**: analysis (`SessionRevision.scope`),
   daemon (validation, service forwarding), CLI and root (driver binding), as
   the coordinator's migration instruction required.
10. **Closed status value.** `classification-changed` is a new value of
    `CheckOutcome.status`; the brief extends `ramify.ipc/2` without a new
    version, as it states.

## Coordinator review

The coordinator reviewed the classification sequence, the dispositions, the
deletion evidence and the migrated consumers against the brief, the contracts
and R4. This iteration ran one iteration ahead in the second worktree; it was
rebased onto the iteration 14 fix (`6001bc4e`) and merged after that gate was
green. Two points were put to the user through the relay session, which
settled them under the user's standing instruction; the user was told and
may override them. First, each hook check now makes one classification round
trip before it hashes anything, with no client-side cache; its measured cost
is reported separately in iteration 20's hook-latency results. Second,
`proposed-spec-patches.diff` is authorized and applied: in
`cli-invocation.spec.md` "Hook and complete checks", a path in an excluded
directory is not hashed, while an owned file the covering revision finds to
be no analysis input is hashed by the client before that is known and then
carries no content identity. That narrows a sentence of R4. The smaller
behaviours this receipt lists are accepted. The agent did not run
`reference:verify`; the coordinator's gate runs the audit, `reference:cases`
and the full Plan 1 and Plan 2 verification on the committed candidate.
