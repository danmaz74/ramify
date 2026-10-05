# Iteration 13 results: retained whole-tree consistency

**Date:** 2026-10-04. **Status:** implementation receipt for
[iteration 13](iteration13.md). It awaits the coordinator's review,
protected-file comparison and gate. Changes are uncommitted in the second
worktree, pipelined one iteration ahead of the coordinator's gate on
`b45ea37c`. This slice produces PB1-21, PB1-22 and PB1-24 at the retained
evidence boundary; their final qualification stays with iteration 20.
`reference:verify` was not run: the coordinator's gate runs it.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1-next`, branch `feat/project-boundary-ramify-next` |
| Base commit / tree | `b45ea37c` (tree `f14bf634…`), clean at assignment, dependencies installed |
| Contract revision | `contracts.md` blob `ea76b4ec…`; `daemon.md` `a21c0428…`; `optimization.md` `ea930252…`; `module-description.spec.md` `2e583562…`; `glossary.md` `ae8e3207…` (all unchanged; no patch proposed) |
| Configuration | unchanged: `package.json`, `package-lock.json` `fd3c84ba…`, `ramify-audit.json` `b59f28f6…`, every `tsconfig*.json` and Vitest configuration; nothing under `ramify-agent/`, `/ramify-audit` or `/ramify` |
| Node / tools | v22.23.3; TypeScript 7.0.2; Vitest 4.1.11 |
| Changed | `subs/analysis/src/session-revision.ts`, `subs/analysis/src/session-engine.ts`, `subs/analysis/subs/project/src/observer.ts`, `subs/analysis/README.md`, `subs/analysis/subs/project/README.md`, `subs/analysis/src/tests/session-revision.test.ts`, `subs/analysis/src/tests/membership-differential.test.ts` |
| Added | `subs/analysis/src/tests/project-boundary-session.test.ts`, this receipt |
| Evidence | `/home/app/ramify-pb1-evidence/iteration13/` |

## How the slice was qualified

`project-boundary-session.test.ts` drives the written topology (fixtures.md:
root `app` [dispatch] with owned-ignored `fixture-project` and external
`external-project`; `a` with owned-ignored `fixtures/sample`, auxiliary
`scripts/report.ts` and `fixtures/seed.ts`, grandchild `grand`; `b`; root
auxiliary `scripts/`, `tools/tmp/`; a wildcard exposure over a forwarding chain
that ends in auxiliary source) through the retained engine. Each mutation runs
in a hot session and, separately, in a warm one whose compiler is released
before every update. After every published revision the test requires: the
next sequence; the hot path the daemon table names (broad when warm); the
reacquisition flag; a report equal to a fresh `analyzeProject` of the same disk
(everything but `runId`, inputs and `inputId` included); the revision's
outcome and findings equal to that report's; the audit `equal`; and a sweep
that finds nothing (an invalid acquisition may also answer its own revision
again, see "Sweep"). Findings are asserted independently from the contracts
and specifications.

A seeded differential probe (not committed; its source is kept in the
evidence) applied random combinations of 20 boundary, auxiliary, membership,
manifest and overlap toggles, random warm releases, sweeps instead of updates
and cancellations after observation, comparing every step with a fresh batch.
It found the five defects below; after the fixes, 48 seeds of 30 steps
(1,565 steps: 1,278 broad, 68 membership, 25 source, 42 unchanged-surface,
4 cold; 125 cancellations, 302 sweeps, 361 warm steps, 586 invalid steps)
equal fresh batch runs at every step.

## Changed behaviour

1. **Compiler observations retired before every whole re-read**
   (`session-revision.ts`, broad branch). The broad path retired the compiler's
   observations only for a membership change. When the update was structural,
   a non-owned input change (for example a file beneath a declared tree that
   the compiler read through a denied import), an unexplained change, a
   recovery from a stale or invalid state, or a warm reopen, the observations
   the earlier program made stayed inputs, and so did those of the
   intermediate snapshot the update naming created and deleted files builds
   before the whole invalidation. Example: deleting `subs/a/fixtures/seed.ts`
   (beneath `a`'s widened tree, imported by `scripts/report.ts`) left the
   compiler's `subs/a/fixtures/package.json` absence probe in the revision, so
   `inputId` differed from batch. Now the observations are retired immediately
   before the compiler reads the whole program again: before a reopen of a
   released compiler, after the update that names created and deleted files and
   before the whole invalidation, and before a missing compiler or one whose
   derived areas changed is created. A hot update that keeps the program
   (description, metadata, source, unchanged-surface and membership paths) is
   unchanged.
2. **Sweep of a stale or invalid session** (`session-engine.ts`, `sweep`). A
   sweep that found no change answered `unchanged` although the published
   revision did not describe the disk: after a cancelled or failed update the
   observer is past the published revision, and after an invalid acquisition it
   stays on its last valid capture. After a structural update cancelled once
   observed, the next sweep kept the old passing revision current (a stale
   pass); after an invalid manifest was removed silently, the sweep kept the
   invalid revision. Now such a sweep runs the revision step, which reconciles
   with the disk as an update does; an identical result answers `unchanged`.
3. **Membership refused for resolutions into an absent directory**
   (`session-revision.ts`, `membershipRefusal`, new reason `absent-directory`).
   The incremental compiler update keeps a failed resolution whose candidates
   lie in a directory observed absent (a missing directory, an absent declared
   tree) without probing them again, so the membership path's probe retirement
   dropped probes a fresh pass records. This predates Phase 1 (reproduced at
   `6b372aa9` and at the base with `src/nowhere.ts` importing
   `../missing-dir/x.js`, then an unrelated creation) and also hits auxiliary
   membership. Such an update now takes the broad path. The signature gained
   the observer's inputs; the one test caller passes them.
4. **Read entries beneath a declared tree** (`observer.ts`, `#excluded`). A
   created or deleted file beneath a declared tree that the compiler had read
   kept the input rule even when it also appeared in or left the compiler
   configuration's listing, so the compiler selection and the
   `compiler-selected-owned-ignored` warning kept the old file (with `scripts`
   both declared owned-ignored and selected by the configuration, deleting
   `scripts/later.ts`, which `src/later.ts` imports, left the warning at three
   files). Now a read entry whose recorded parent listing changed is
   structural; a byte edit stays an input.
5. **Unobserved paths beneath a declared tree** (`observer.ts`, `#excluded`).
   Only the immediate parent's listing was consulted, so writing a file into an
   absent external tree (which creates the tree's directory) and naming only
   that file left the revision with the tree absent. Now the nearest observed
   directory up to the tree's own decides: a changed listing or a changed
   existence, such as an absent tree that now exists, rebuilds. The walk is
   bounded by the path's depth.
6. **Documents.** The analysis README states the retirement and sweep rules;
   the Project README states the observer's nearest-directory and read-entry
   rules. Neither first paragraph changed, so the final-contract validator needs
   no purpose layer; no exposure changed.

No document shape changes: no member or closed value of `ramify.analysis/2`,
`ramify.ipc/2`, `ramify.watch/2` or `ramify.check/2` changes. `absent-directory`
is a new value of the internal refusal label used only by tests.

## Already correct, qualified here

Before the fixes, these held and are now qualification evidence (negative
control: 7 of 15 tests pass on the base, among them the warm auxiliary test in
full; the failing ones pass every step before the one their fix addresses): structural rebuilds for declaration
add, remove, kind and directory changes, child modules, manifests and a missing
owned-ignored root, each equal to batch on its own; reinclusion reads bytes
afresh; local auxiliary `created`/`deleted`/`changed` updates take the
membership, source and unchanged-surface paths and equal batch; a forwarding
chain that reaches an auxiliary original publishes the link-invalid revision
(`auxiliary-original-exposure`) on the source and description paths;
invalid boundaries (overlap, manifest, missing root) publish invalid revisions
and `affected`/`measurements` answer `invalid-current`; a cancelled update
leaves the published revision and the next update recomputes it; a byte bound
during a rebuild is reported `incomplete` without publication; one live
compiler across structural and warm updates and none after disposal. The
reacquisition report and the `sweep-skipped-after-reacquire` behaviour are
unchanged.

## PB1-21, PB1-22 and PB1-24 at this boundary

| Case | Tests (hot and warm unless noted) | Independent expectation |
| --- | --- | --- |
| PB1-21 | declarations added, edited beneath, removed, changed, missing root | inert edits (prose, owned-ignored, scratch, ignored sample, a tree's own description and configuration) keep the revision (hot) or publish the same `inputId` (warm); child `a-extra` added and removed; `owned-ignored "scripts"` removes `scripts/*` from the inventory and makes `src/uses-check.ts:1` a `project-boundary-import` with the contract's message; an unread edit beneath is inert, the compiler-read one is an input and adds no finding; removing the declaration reinventories both files with the hashes of their current bytes and analyzes the edit made while excluded (`not-visible` at `scripts/check.ts:2`); removing `fixture-project` is invalid `missing-owned-ignored` (layout, `module.ramify`), restoring recovers; the tree declared external changes the message's kind and the exclusion's owner to null; an absent external tree is valid and its importer unresolved, a file written into it (naming only that file) reacquires with the tree observed as a directory and nothing beneath it observed; `a`'s tree widened to `fixtures` removes `seed.ts` and denies `report.ts:2`; the denied target deleted leaves an unresolved import, no read input beneath the tree, and restores on re-creation; all reverted at once gives the initial passing revision |
| PB1-21 | target removed while invalid | a manifest makes the project invalid; deleting the denied target changes nothing the invalid acquisition captured (identical); recovery equals batch with `report.ts` unresolved |
| PB1-22 | auxiliary edits, additions, deletions, forwarding | edit of `scripts/check.ts`: source path, `not-visible` with importer `app` ordinary [dispatch]; new `scripts/later.ts`: membership, checked files exactly `scripts/later.ts` and `src/later.ts`, the importer allowed `same-owner`, coverage complete, inventory record `{placement: 'auxiliary', owner: 'app', area: 'ordinary'}` with its hash and size; new `subs/a/scripts/extra.ts`: `testing-origin` with importer `app/a` ordinary []; its deletion removes finding, inventory entry and input; deleting `later.ts` returns the unresolved note; an unresolved import into a missing directory is membership when created, and a later unrelated auxiliary addition is broad and keeps its probes; an export added to `tools/tmp/empty.ts` reaches the wildcard through two star re-exports: invalid `auxiliary-original-exposure` at the `*` with related `tools/tmp/empty.ts`, no model and no decision, the `inputId` kept; the export removed again restores the exposures `main` and `api`; a named forwarder selected by a description edit is rejected on the description path at `helper`; deleting the re-exported auxiliary file is `incomplete-expansion` on the wildcard's line and restoring it recovers |
| PB1-22 | compiler-selected and compiler-read source in a declared tree (configuration also selects `scripts`) | creating `scripts/later.ts` reacquires, the warning lists three files and `src/later.ts:1` is denied; deleting it reacquires, the warning lists two and the import is unresolved; a byte edit stays an input |
| PB1-24 | overlap and manifest (hot) | `overlapping-nested-tree` twice and `undeclared-project-boundary` at `notes/package.json`, invalid revisions, no results, `affected` and `measurements` `invalid-current`, a source edit keeps the invalid outcome, repairs recover |
| PB1-24 | sweep after a cancelled update or an invalid revision | the sweep after a cancellation publishes the boundary finding (not the stale pass); a manifest removed silently and a file the invalid acquisition inventoried removed silently are found by the next sweep; a further sweep answers `unchanged` |
| PB1-24 | cancellation after observation; pre-cancelled | `cancelled`, the published revision object unchanged, the next update publishes sequence + 1 on the broad path equal to batch; a pre-aborted update changes nothing |
| PB1-24 | application byte bound (48 KiB) on reinclusion of a 64 KiB auxiliary file | update `reported` with `incomplete` and `resource-limit`, the current revision unchanged, a batch run of the same disk also `incomplete`/`resource-limit`; restoring the declaration recovers |
| PB1-24 | compiler cleanup (hot) | through the `child_process` diagnostics channel: one live compiler after open; a new child module replaces it with exactly one live; a released compiler leaves none; a warm structural update starts one; a cancelled update leaves one; disposal leaves none |

Deadline-bound outcomes are covered by the existing I5-08 instances run below;
this slice adds no deadline test.

**Negative control** (`negative/`): with `session-revision.ts`,
`session-engine.ts` and `observer.ts` replaced by the base commit's, 8 of the
15 tests fail, at the steps each fix addresses: the recreated absent tree
(fix 5), the deleted target beneath the tree and the recovery after an invalid
revision (fix 1), the unrelated addition beside a resolution into a missing
directory (fix 3), the configuration-selected deletion (fix 4) and the sweep
after cancellation (fix 2). The 7 that pass are the behaviours listed above as
already correct. All three files were restored and their SHA-256 verified
(`restored-final2.txt`). Each defect's own reproduction before its fix is kept
(`defect-*.log`, `probe/seq-base-nowhere.log`, `probe/seq-pre12-nowhere.log`).

## Re-reasoned expectations

- `session-revision.test.ts`, "broad-kept: structural, configuration,
  non-owned, unexplained and area changes keep the whole invalidation": the
  retirements of the configuration edit and of the `node_modules` declaration
  edit change from none to one `all` (fix 1: every whole invalidation retires
  once); the first `src/tests/` file stays one `all` (derived areas follow the
  header, so the compiler is kept); the new child module changes from none to
  `all, all` (the invalidated compiler's reports are retired again before the
  recreated one reads). In "a membership change the facts or the compiler
  cannot bound", the `baseUrl` configuration edit changes from none to one
  `all`. Every other step, and the batch-input comparison of every step, is
  unchanged.
- `membership-differential.test.ts`: the classification helper passes the
  observer's inputs to `membershipRefusal`; no expectation changed.

No harness file, instance row, count or identity changed; no row became stale.

## Bounds, cleanup and performance

No session limit, retained structure or memory bound changed
(`maxRetainedFactBytes`, `workerHeapMiB`, `updateDeadlineMs`,
`sweepIntervalMs`, `maxQueuedPaths` as before). Costs added: retirement is one
pass over the observations on broad paths that already re-read the whole
program; the area comparison is one derivation per module; the membership
refusal scans the contributor index once, as the existing refusals scan every
file; the observer's added work is one re-observation of the nearest recorded
directory, bounded by the path's depth. A sweep of a stale or invalid session
now runs the revision step, so while a session stays invalid each sweep
acquires the project (the observer's rebuild and the invalid capture), at most
once per `sweepIntervalMs` with activity; a reported failure does not schedule
another sweep by itself. S1000 cold retained-session open with the I5-08
inputs: 24.0 s (iteration 12: 23.6 s; deadline 30 s); the open path is
unchanged by this slice.

## Commands and results

Focused commands ran without the lock, as the user's rule relayed by the
coordinator requires; the reference-harness files, single instances and the
S1000 measurement held `/tmp/ramify-audit-tests.lock` (acquired at once,
17:47:57–18:00:17 UTC, `run-locked.sh`).

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check`; new file checked for trailing whitespace | 0 | clean | `diff-check.log`, `new-file-whitespace.log` |
| `npm run build` | 0 | built | `build.log` |
| `npm run type-check` | 0 | four scopes | `type-check.log` |
| `npx tsx scripts/validate-final-contracts.ts` | 0 | 15 owners, 595 files | `validator.log` |
| `npm run check:self` | 0 | passed, partial; 15 owners, 578 source files (577 + the new test), 17 resources, 8515 accesses, 0 errors, 0 warnings, 41 limits, 5461 allowed, 0 denied, 3010 external | `check-self.log` |
| `npx vitest run subs/analysis/src/tests/project-boundary-session.test.ts` | 0 | 15 tests | `pbs-final.log` |
| Negative control (base `session-revision.ts`, `session-engine.ts`, `observer.ts`) | 1 | 8 failed, 7 passed; restored, SHA-256 verified | `negative/base-run-final2.log`, `negative/restored-final2.txt` |
| `npx vitest run subs/analysis/src/tests --maxWorkers=4` | 1, then 0 | first run: 2 retirement expectations re-reasoned (`t-analysis.log`); `session-revision.test.ts` alone 42 tests; final 43 files, 496 tests | `t-analysis.log`, `t-session-revision.log`, `t-analysis-final.log` |
| `npx vitest run subs/analysis/subs/project/src/tests --maxWorkers=4` | 0 | 14 files, 315 tests | `t-subs_analysis_subs_project_src_tests.log` |
| `npx vitest run subs/daemon/subs/contexts/src/tests --maxWorkers=4` | 0 | 13 files, 177 tests | `t-subs_daemon_subs_contexts_src_tests.log` |
| `npx vitest run subs/daemon/src/tests --maxWorkers=4` | 0 | 21 files, 248 tests | `t-subs_daemon_src_tests.log` |
| `npx vitest run src/tests/resident-cli.test.ts src/tests/resident-assembly.test.ts src/tests/batch-cli.test.ts` | 0 | 3 files, 38 tests | `t-root-resident.log` |
| Differential probe, final 48 seeds × 30 steps (four runs) | 0 | 1,565 steps equal to batch | `probe/diff-11.log` … `diff-14.log`, `probe/steps-final3.log`, `probe/steps-valid.log`, `probe/zz-boundary-probe.test.ts.final` |
| Harness `resident-fixtures.test.ts` (locked) | 0 | 18 tests | `h-resident-fixtures.log` |
| Harness `plan5-live.test.ts` (locked) | 0 | 6 tests | `h-plan5-live.log` |
| Harness `equivalence.test.ts` (locked) | 0 | 32 tests | `h-equivalence.log` |
| Plan 5 single instances (locked): I5-05 ×8, I5-04 `created-deleted-configuration`, `invalidate-all`, `observed-reads-complete`, `release-and-rebuild`, `single-live-snapshot`, I5-08 `worker-nonblocking`, `deadline-exceeded-explicit` | 0 | 15/15 passed | `p5-instances.out` |
| S1000 cold retained open (locked) | 0 | **24.0 s**, 1000 owners, 11 000 files, complete (iteration 12: 23.6 s; deadline 30 s) | `s1000-cold-open.out` |
| `npm run reference:cases` (locked, after the build, frozen tree, 18:01:03–18:06:50 UTC) | 0 | **37 files, 393 tests**; tree unchanged during the run | `cases.stdout`, `cases.stderr`, `diff-*-cases.sha`, `status-*-cases.txt` |

`reference:verify` was not run; it is left to the coordinator's gate.

## Protected documents

No `.principles.md`, `.spec.md` or glossary file was edited, and no patch is
proposed (`proposed-spec-patches.diff` was not written). The slice implements
behaviour the contracts and the daemon architecture already state: a
revision's inputs equal a batch capture's over the same disk; "Retire facts
and compiler observations when source becomes excluded"; boundary-root
existence changes invalidate input identity; fast results are exact. No
statement in `daemon.md` became false, so it is unchanged, including the
`unchanged-surface` passage left for iteration 15.

## What iterations 14–16 still lack

- 14: affected path bases and seed status; the session facts are now
  batch-equal after boundary and auxiliary updates, which affected reads.
- 15: changed-path dispositions. An invalid revision from a selection-time or
  inventory-stage failure records only what that acquisition read, so a
  synchronized request naming another path is still `unobserved-input`.
- 16: watcher registrations from the scope's exclusions. The observer's
  nearest-directory rule makes an event for any path beneath a tree enough to
  notice the tree's appearance; the watcher must still deliver such an event
  or the tree's own.

## Gaps and decisions needed

1. **Sweep cost while invalid** (fix 2): correctness requires reconciling an
   invalid or stale session on every sweep; reading the invalid capture's own
   inputs instead of acquiring would be cheaper but a selection-time invalid
   capture records none. Recorded for the user's end-of-plan timing report.
2. **Absent-directory refusal is broader than necessary** (fix 3): any
   retained candidate in an absent directory sends a membership update to the
   broad path. It is sound; a narrower rule needs evidence of exactly which
   probes the incremental compiler repeats.
3. **Warm sessions** publish a new revision (same `inputId`, same findings)
   for an inert event, as memory-lifecycle states for every warm update.
4. **Pre-existing**: after an invalid acquisition the observer keeps its last
   valid capture; fix 2 makes the sweep compensate. Not changed further.

## Coordinator review

The coordinator reviewed the five session and observer fixes, the new session
test and the batch-equivalence evidence against the brief and the contracts.
No protected document changed. This iteration ran one iteration ahead in the
second worktree while iteration 12's gate ran, and was committed after that
gate was green. Accepted: the observer changes outside the session files the
brief names, since the defects they fix were found by this slice's
batch-equivalence tests; the membership refusal for an absent directory, a
defect that predates the phase, routed to the broad path; a sweep of a stale
or invalid session re-acquiring the project. The agent did not run
`reference:verify`; the coordinator's gate runs the audit, `reference:cases`
and the full Plan 1 and Plan 2 verification on the committed candidate.
