# Plan 5 structural edit latency: closure

**Date:** 2026-09-13. **Status:** implementation complete; iterations 1 to 7
passed the cucumber-viz commit audit, see [Commit audits](#commit-audits). The
[plan](../main-plan.md) delivered a repair for each of the brief's five
hypotheses. Every matrix row has unit evidence or a results section below.
Every latency figure from the iterations is from in-process scratch loops, not
from the hook. Resolved decision 8 excluded live runs, so **whether the three S100
rows meet the 2 s budget is not verified**. The
[measurement successor](#measurement-recipe) establishes it.

Several resolved decisions were implemented differently from how they are
written, and two plan estimates are not supported by the evidence. The
[clarifications](#contract-clarifications), [estimates](#estimates-against-the-evidence)
and [open review items](#decisions-and-review-items) record both. The plan's
resolved decisions are not rewritten.

## Delivered repairs

| Hypothesis | Verdict in the plan | Repair | Iteration | Source commits | Results |
| --- | --- | --- | --- | --- | --- |
| 4 Unattributed reference time | located | `OperationTimings.promotion` and `CaptureWork.sweep`; promotion names 98.8 % of the time outside the stages, in process | 1 | `c5b47e4` | [iteration 1](iteration1-results.md#attribution-se-2) |
| 1 Root resolution runs twice | confirmed | reuse validated by the discovery snapshot only: 5 replayed observations instead of 155 on the reference, about 0.3 ms instead of about 10 ms | 2 | `f97895a` | [iteration 2](iteration2-results.md) |
| 3 Broad analysis re-extracts every owner | confirmed | membership witness, `FactIndexes.contributors`, and the description set's completion rule for extensionless specifiers | 3 | `9ae894e`, `39d8d20` | [iteration 3](iteration3-results.md) |
| 2 and 3 The whole invalidation | rejected as stated; confirmed | `membership` path: one incremental compiler update, retirement by marking, narrowed description, interpretation and decisions; reference session about 1,140 to 260 ms in process | 4 | `8143956`, `6c460c3` | [iteration 4](iteration4-results.md) |
| 5 Configuration edits, sweep | confirmed | a capture skips its configuration-only sweep after an update that reacquired the project; also the compiler options defect fix | 5 | `76728ac`, `387ddc0` | [iteration 5](iteration5-results.md) |
| 5 Configuration edits, inventory | confirmed | an edit that keeps the selection projection and the helper's requests keeps the inventory and capture; S100 update about 3,300 to 2,270 ms in process | 6 | `0cc2077` | [iteration 6](iteration6-results.md) |

## Matrix evidence

Line numbers are at `72c2b9b`, the last commit before this closure.

| Row | Test file and case, or results section |
| --- | --- |
| SE-1 `promotion-timed` | `subs/analysis/src/tests/session-revision.test.ts:651` `promotion-timed: a revised update reports its promotion, which lies inside the total and outside the eight stages`; `subs/analysis/src/tests/session-worker.test.ts:397` `timing-fields: worker replies add the status checkpoint and daemon-side round trip beside the invocation check`, extended with the unchanged sweep; `subs/daemon/subs/contexts/src/tests/covering.test.ts:434` `promotion-timed: a capture adds its update's promotion and its sweep's round trip, including an unchanged sweep`; `subs/daemon/src/tests/codec.test.ts:164` `timing-fields: accepts a published revision whose capture carries session work, promotion, sweep round trips and watcher times beside unchanged stage timings` with `:170` `rejects a revision without its capture or with malformed capture timings`; `subs/daemon/src/tests/ipc.test.ts:102` `timing-fields: a socket check reply carries session work, publication, service handling and client transport` |
| SE-2 `unattributed-located` | Results: [iteration 1 attribution](iteration1-results.md#attribution-se-2). Promotion is 398.5 of 403.2 ms (created) and 388.7 of 393.3 ms (deleted) outside the stages, in process. The measured 456 ms is 50 to 60 ms higher; the difference is not attributed |
| SE-3 `resolution-survives-membership` | `subs/analysis/subs/project/src/tests/resolve-root.test.ts:120` `resolution-survives-membership: a created or deleted source file in an enumerated directory reuses the resolution`; `subs/analysis/src/tests/root-resolution.test.ts:68` `resolution-survives-membership: a created or deleted source file reuses the resolution in the invocation check`; `subs/daemon/subs/contexts/src/tests/root-resolution.test.ts:66` `resolution-survives-membership, resolution-survives-configuration-bytes: hooks for a created or deleted file or a configuration edit reopen with the known resolution`, with a scripted driver |
| SE-4 `resolution-invalidated-by-discovery` | `resolve-root.test.ts:160` `root-resolution-invalidated, resolution-invalidated-by-discovery: a created or deleted configuration or description on the discovery path, a moved root or a changed canonical path resolves again`; `:212` `resolution-invalidated-by-discovery: a changed canonical path of the working directory resolves again`; `subs/analysis/src/tests/root-resolution.test.ts:127` `root-resolution-invalidated, resolution-invalidated-by-discovery: a created or deleted description or configuration on the discovery path resolves again and a moved root is refused` |
| SE-5 `resolution-survives-configuration-bytes` | `resolve-root.test.ts:241` `resolution-survives-configuration-bytes: a configuration content edit reuses the resolution and acquisition refuses what resolution no longer re-reads, with the same codes`; `subs/analysis/src/tests/root-resolution.test.ts:96` `resolution-survives-configuration-bytes: a configuration edit reuses the resolution and a solution-style rewrite is refused by acquisition`; the contexts case of SE-3. The session reports the rewrite as `internal-error`, see review decision 4 |
| SE-6 `membership-incremental-equal` | `subs/analysis/subs/typescript/src/tests/retained-membership.test.ts:33` `membership-incremental-equal, membership-reads-reported, membership-identity-equals-batch: a created or deleted file without a whole invalidation`, five cases: `:34` created unreferenced, `:48` created satisfying an absence probe, `:61` created satisfying an extensionless specifier, `:73` deleted referenced, `:87` deleted unreferenced |
| SE-7 `membership-reads-reported` | The same five cases, `expectReported` with `unreported` empty, and `obsoleteUnattributed` pinned as recorded in [iteration 3 F2](iteration3-results.md#findings-for-iteration-4) |
| SE-8 `contribution-index` | `session-revision.test.ts:904` `contribution-index: maps each file, candidate and description dependency to its sorted contributors, relative to the root`; `:929` `contribution-index: equals a rebuild after every revision kind and holds no path of a removed file` |
| SE-9 `membership-identity-equals-batch` | `session-revision.test.ts:710` `membership-identity-equals-batch: unreferenced and referenced deletions and created files that satisfy an absent or extensionless probe publish the batch inputs`; `:858` `membership-identity-equals-batch: promotes a membership revision far below a broad one on the same fixture`; `subs/analysis/subs/project/src/tests/observer.test.ts:116` `membership-identity-equals-batch: apply leaves compiler observations to retire; probes retirement keeps reads and re-reported probes, all retirement restores the acquisition`; the reach assertions of `retained-membership.test.ts:33` |
| SE-10 `membership-path-narrow` | `session-revision.test.ts:103` `membership-path-narrow: a created and a deleted file update the compiler once without a whole invalidation and check only the affected files`; `:744` `membership-path-narrow, broad-kept: matching completes recorded bases and stems, and the reach rule names each unbounded update`; `subs/analysis/src/tests/retained-session.test.ts:195` `takes the metadata path for a README edit, the membership path for created and deleted files and the broad path for a reopened compiler` |
| SE-11 `membership-sequences-equal-batch` | `subs/analysis/src/tests/session-audit.test.ts:10` `membership-sequences-equal-batch: retires obsolete compiler observations after deleting the last source, restoring it and removing a whole module`; `:16` `membership-sequences-equal-batch: equals batch and keeps the current sequence after each of fourteen source, description, metadata, membership and structural steps` |
| SE-12 `broad-kept` | `session-revision.test.ts:779` `broad-kept: structural, configuration, non-owned, unknown, unexplained and area changes keep the whole invalidation`; `:811` `broad-kept: a membership change the facts or the compiler cannot bound falls back to the whole invalidation`; `:744` above |
| SE-13 `sweep-skipped-after-reacquire` | `covering.test.ts:465` `sweep-skipped-after-reacquire: a configuration event and a hook run one update that reacquired, no sweep, and publish synchronized`; `subs/daemon/src/tests/session-counters.test.ts:127` `sweep-skipped-after-reacquire, sweep-kept: ...`, scripted session; `session-revision.test.ts:1012` `sweep-skipped-after-reacquire: a structural update reports reacquisition, and a sweep of the same capture finds nothing`; `retained-session.test.ts:227` `sweep-skipped-after-reacquire, configuration-projection-unchanged, configuration-projection-changed: ...`. Since iteration 6 the reacquiring edit in the session tests is a selection edit (an added `exclude`), and an options-only `target` edit reports `reacquired: false` |
| SE-14 `sweep-kept` | `covering.test.ts:495` `sweep-kept: a matched configuration path the update did not reacquire for still sweeps before the capture is synchronized`; `:515` `sweep-kept: %s still sweeps after a reacquiring update` (watcher overflow before and after); `:528` queue overflow; `:542` cancelled configuration update; `:560` a request that needs a sweep; `:572` `sweep-kept: a cold open acquires in full and leaves no configuration requirement a later update could satisfy`; `retained-session.test.ts:277` `opens over a coherent invalid capture with an invalid revision and recovers on the next update`, whose retry reports `reacquired: false`; `session-counters.test.ts:127` |
| SE-15 `configuration-projection-unchanged` | `observer.test.ts:279` `configuration-projection-unchanged: an options-only edit keeps the inventory and capture, spawns one helper, walks no directory and reads only the edited file`; `observer.test.ts:318` `... a kept edit of a configuration with references replaces the resolution the invocation check reuses`; `subs/analysis/subs/project/src/tests/project.test.ts:198` and `:221`; `session-revision.test.ts:1091` `configuration-projection-unchanged: an options-only edit keeps the inventory and capture, spawns one helper, invalidates the compiler and publishes the batch inputs`; `retained-session.test.ts:227` |
| SE-16 `configuration-projection-changed` | `project.test.ts:240` `configuration-projection-changed: an edit of %s is not kept` (seven cases); `project.test.ts:249` `... an edited extended file that changes an exclusion is not kept, and a solution-style rewrite is refused`; `observer.test.ts:337` `configuration-projection-changed: include, files, exclude, outDir, references, extended-file and manifest edits rebuild as a fresh acquisition`; `session-revision.test.ts:1132` `configuration-projection-changed: include, files, exclude, outDir and extended-file edits acquire the project again and equal batch`; `retained-session.test.ts:227`. "Rebuilds as today" holds for the result; the rebuild now spawns the helper twice |
| SE-17 `docs-updated` | Review: this closure; the [brief](../../../analysis/structural-edit-latency.md)'s status line; the [optimization analysis](../../../analysis/fast-incremental-checks-optimization.md#structural-edit-repairs) delivery section and deferrals table |

The compiler options defect has its own case:
`subs/analysis/subs/typescript/src/tests/retained-source-analysis.test.ts:203`
`reaches edited options of the configuration and its extended file through a whole invalidation, reading the libraries a fresh adapter reads`.
The existing session-equals-batch tests and the session audit remained the
exactness gate for resolved decision 2 in every iteration. `npm run build` and
`npm run check:self` passed with 0 errors after iterations 4, 5 and 6.

## Contract clarifications

Every contract the plan listed landed with the shape its iteration recorded.
The table also lists what the plan did not name.

| Clarification | Where recorded | Iteration |
| --- | --- | --- |
| `OperationTimings.promotion` is required and inside `total` but outside the stages. `CaptureWork.promotion` and `CaptureWork.sweep` are required, and the codec validates both. Only a hosted unchanged sweep carries timings; the in-process engine's unchanged sweep carries none. `timedResult` is new runtime code in the formerly type-only `session-messages.ts` | [iteration 1](iteration1-results.md#contract-shapes), [deviations](iteration1-results.md#deviations) | 1 |
| Resolved decision 3: the replayed evidence is the discovery snapshot. A configuration read with `references` keeps the full replay, so its hooks for created or deleted files still resolve again in the daemon and the worker. A resolution recorded without references survives a configuration that gains them; acquisition records its own seed | [validated query set](iteration2-results.md#the-validated-query-set), [deviations](iteration2-results.md#deviations) | 2 |
| Resolved decision 4, affected set: a created path matches recorded candidates and absent dependencies by completion, not exact equality. The description set in `typescript` had the same gap and left a re-exporter stale; `9ae894e` fixed it. Iteration 4 extends the rule to stems, so a recorded `src/later.js` matches `src/later.ts`, and passes the matched files to `describe` | [iteration 3 F1](iteration3-results.md#findings-for-iteration-4), [affected-set rule](iteration4-results.md#affected-set-rule) | 3, 4 |
| Resolved decision 5, retirement: retiring only observations contributed by the affected set is insufficient, because compiler probes with no contributor would stay and the inputs would differ from batch (F2). Implemented instead: keep compiler reads, mark every compiler-reported probe, absence and listing, keep what the next promotion confirms, and release the rest at promotion. The contribution index is used only for matching | [iteration 3 F2](iteration3-results.md#findings-for-iteration-4), [retirement rule](iteration4-results.md#retirement-rule-and-fallback-conditions), [review items 1 and 2](iteration4-results.md#review-items) | 3, 4 |
| Resolved decision 4, fallbacks to the broad path. Before compiler work: any other broad trigger, `other-changes`, `areas`, `created-kind` (resource or declaration), `deleted-kind` (resource, declaration, `.tsx` or `.jsx`, or a description's shim), `deleted-global`, `deleted-unresolved`, `deleted-last-in-directory`, and `unresolved-package`. From the compiler's reach, after the incremental update: `reach-unknown`, `program`, `global`, `unspelled` (`baseUrl`, `rootDirs` or an unanchored `paths` mapping). A reach refusal retires everything and invalidates the program. `readmes` may accompany a membership update | [fallback tables](iteration4-results.md#retirement-rule-and-fallback-conditions) | 4 |
| Review decision 1: `ProjectObserver.retire(retirement)` with `ObservationRetirement` `all` or `probes`, chosen over an option on `apply`; `apply` no longer retires | [observer contract](iteration4-results.md#observer-contract-chosen-review-decision-1) | 4 |
| New adapter result not in the plan's contract table: `RetainedSourceAnalysis.update` returns optional `reach: MembershipReach` (`added`, `removed`, `global`, `spelled`), in `typescript`, an owner iteration 4 did not list | [contract shapes](iteration4-results.md#contract-shapes), [deviations](iteration4-results.md#deviations) | 4 |
| `RevisionPath` adds `membership`; the daemon codec accepts it; the measurement assertions, their evidence test, `resident-reuse.mjs` and the reference harness live case expect it for created and deleted files | [iteration 4](iteration4-results.md#implemented-behavior) | 4 |
| Hypothesis 5's "the adapter re-parses the configuration on `invalidateAll`" was incomplete. The server kept the previous options, so an options edit never reached the retained compiler, and the session's inputs differed from batch while the audit compared equal. `76728ac` names edited configuration files to the compiler before the whole invalidation, at the cost of one extra snapshot update. S100 was exposed: its configuration sets no `lib` | [compiler options defect](iteration5-results.md#compiler-options-defect-found-by-se-13), [iteration 6](iteration6-results.md#measured-cost) | 5, 6 |
| Resolved decision 6, conservative reading: only a sweep requirement written solely by configuration or manifest path events is satisfiable (`sweepRequired: 'configuration'`). A batch with any other requirement, a cancellation of such a capture, or a request that needs a sweep keeps the sweep. `#reopen` reports `reacquired: false`; an identical structural update reports `false` | [deviations](iteration5-results.md#deviations), [architecture](../../../architecture/daemon.md#fast-incremental-checks) | 5 |
| Resolved decision 7: the projection's `files` is the non-owned selection beneath the root; the helper's requests must also be equal; only lone, known configuration changes keep the acquisition; external configuration files take the same path; the re-read refuses solution-style configurations. `InventoryUpdate` local adds `configuration`; the retained product gains `requests` and `selection` | [iteration 6 review items](iteration6-results.md#review-items), [shapes that acquire again](iteration6-results.md#configuration-shapes-that-acquire-the-project-again) | 6 |
| Iteration 4's handoff said an options-only configuration update must not call `retire`. It calls `retire({ kind: 'all' })`, because the kept capture otherwise holds the previous program's library reads. Resolved decision 2 outranks the handoff | [iteration 6 deviations](iteration6-results.md#deviations) | 6 |
| A kept configuration update reports `reacquired: false`, because the acquisition table is not verified against the disk. Its capture therefore sweeps again, and iteration 5's saving no longer applies to an options-only edit, the measured configuration row | [sweep decision](iteration6-results.md#sweep-decision-deliverable-3), [architecture](../../../architecture/daemon.md#fast-incremental-checks) | 6 |
| A changed projection spawns the helper twice, once for the re-read and once for the acquisition; before iteration 6 it spawned once | [iteration 6 deviations](iteration6-results.md#deviations) | 6 |
| A kept edit of a configuration with references replaces the worker observer's resolution. The daemon's own recorded resolution still resolves again once after such an edit | [iteration 6 review item 6](iteration6-results.md#review-items) | 6 |

**Contract text not updated.** The
[Plan 5 contracts](../../iteration-5-fast-incremental-checks/contracts.md) still
show `RevisionPath` without `membership`, `InventoryUpdate` without
`configuration` and `ProjectObserver` without `retire`. They also still describe
resolution reuse as "while every discovery query it made answers the same".
`SessionUpdate.reacquired` and the new timing fields do not appear there either.
The exact shapes are in the results files. Updating that text was outside this
iteration's scope.

**Owners and files outside the plan's table.** `typescript` in iterations 4
(`MembershipReach`) and 5 (`76728ac`). The daemon codec in iterations 1 and 4.
`scripts/reference-harness` in iterations 1 and 4, and `scripts/measurements` in iteration 4.
`src/tests/resident-assembly.test.ts` in iterations 1 and 5. `docs/architecture/daemon.md` and the
analysis and project READMEs in iterations 4 to 6. `6c460c3`, a 60 s timeout
for the large report evidence cases of `report-capacity.test.ts`, which touch
no session code and exceeded the 5 s default in the first iteration 4 audit.
No exposure line or package entry was added.

## Estimates against the evidence

The plan's savings were derived from the hook optimization's measured medians.
The iterations produced only in-process figures, which run without the worker
or the daemon, except where a worker-hosted session is named.

| Plan estimate | Evidence | Status |
| --- | --- | --- |
| Iteration 2: about 890 ms per S100 created or deleted hook, about 880 ms on the configuration row | Reference replay of a reused resolution about 10 ms to 0.3 ms; no S100 or hook figure | unverified |
| Iterations 3 and 4: about 1,200 to 1,400 ms on S100 created and deleted | Reference session `total` 1,157 to 271 ms (created) and 1,129 to 259 ms (deleted), promotion about 420 to 40 ms; S100 membership totals 377 to 417 ms, against a measured broad session of 1,780 and 1,852 ms | consistent in process; unverified end to end |
| Iteration 5: about 260 ms on the S100 configuration row | Reference sweep round trip 264 to 321 ms, worker-hosted in process. Since iteration 6 the options-only edit keeps the capture and sweeps (about 334 ms on S100), so the saving applies only to a selection edit, which now spawns the helper twice | **not met** for the measured row |
| Iteration 6: about 700 ms on the S100 configuration row | S100 capture 3,300 to 2,601 ms in process, net of the sweep that runs again. The reference capture is about 225 ms slower, 1,643 to 1,870 ms | met in process on S100; **regression** on the reference |
| After the plan: created and deleted about 400 to 700 ms | Not measured | unverified |
| After the plan: configuration about 1,800 ms with iterations 2, 5 and 6 | The estimate counted iteration 5's sweep saving, which no longer applies to this row. The options fix adds one snapshot update. The in-process S100 capture alone, 2,601 ms, exceeds 2 s. The in-process loop at `0da429f`, which includes the options fix, gave 3,300 ms where the measured session work before the plan was 2,644 ms plus the sweep, so this does not settle the hook median | **not supported**; unverified |
| Hypothesis 4: promotion names at least four fifths of the reference's time outside the stages | 98.8 % in process; about 50 ms of the measured 456 ms is not attributed | met in process |

The reference configuration row measured 1,872 ms (p90 2,119 ms) before the
plan. Iteration 2 removes its resolution helper in both processes. The options
fix adds a snapshot update, and iteration 6 adds about 225 ms in process. Its
net position against 2 s is unverified.

The plan's deferral "Cheaper replay primitives" assumed the 135 and 70 ms S100
narrow-edit replay was unchanged by this plan. Iteration 2 changed every reuse
validation, and the discovery snapshot's size depends on the directory climb,
not on the project. That replay should therefore also fall. This is not
measured.

## Commit audits

| Iteration | Commit | cucumber-viz commit audit | Evidence ref |
| --- | --- | --- | --- |
| 1 | `507ca36` (source `c5b47e4` plus results) | PASS, 2 min 33 s | `refs/audited/runs/2026-09-13T19-34-09Z-507ca36` |
| 2 | `c8474d9` (source `f97895a` plus results); `c219ada` docs only | PASS, 2 min 1 s | `refs/audited/runs/2026-09-13T19-51-33Z-c8474d9` |
| 3 | `39d8d20` (with `9ae894e`); `89580e9` docs only | PASS, 2 min 44 s | `refs/audited/runs/2026-09-13T20-12-39Z-39d8d20` |
| 4 | `8143956` | FAIL: `report-capacity.test.ts` exceeded the 5 s default timeout; no session code involved | `refs/audited/runs/2026-09-13T21-08-35Z-8143956` |
| 4 remediation | `6c460c3`; `159634a` docs only | PASS, 2 min 48 s, 101 files and 1,536 tests | `refs/audited/runs/2026-09-13T21-12-09Z-6c460c3` |
| 5 | `387ddc0` (with `76728ac`); `0da429f` docs only | PASS, 2 min 10 s | `refs/audited/runs/2026-09-13T21-40-33Z-387ddc0` |
| 6 | `0cc2077`; `72c2b9b` docs only | PASS, 2 min 26 s | `refs/audited/runs/2026-09-13T22-17-59Z-0cc2077` |
| 7 | `c28f24a`, this closure and the document updates; the audit record is a docs-only follow-up | PASS, 2 min 41 s | `refs/audited/runs/2026-09-13T22-32-48Z-c28f24a` |

## Iteration 7 deviations

- **Analysis targets.** The optimization analysis had no list of recommended
  next targets; that list is in the hook optimization measurement results,
  which this iteration does not edit. The analysis instead gains a
  [Structural edit repairs](../../../analysis/fast-incremental-checks-optimization.md#structural-edit-repairs)
  section. It maps the results' recommended targets to the delivered repairs
  and ranks only the remaining ones.
- **Roadmap placement.** The roadmap's "Plan 5" heading is the withdrawn change
  previews. The sentence linking this plan is under
  [Pending: fast incremental checks](../../../roadmap.md#pending-fast-incremental-checks),
  the entry these `iteration-5-*` plans belong to.
- **No source or test change.** The measurement tooling items above are
  successor inputs.

## Decisions and review items

### Deferrals

| Deferred | Current status |
| --- | --- |
| Real-process measurement | Open. The [recipe](#measurement-recipe) below; S500, S1000 and macOS follow the reference and S100 |
| Avoiding the helper spawn on a configuration edit | Open, review decision 3. The helper is 207 ms on the reference and 308 ms on S100 of the kept update, and an extra spawn on a changed projection |
| Cheaper replay primitives | Probably superseded by iteration 2 for configurations without references; unmeasured, see [estimates](#estimates-against-the-evidence) |
| Proportional relink | Open. Link runs on the membership path: about 17 ms on the reference and 80 to 93 ms on S100, in process |
| Target 6, watcher window | Open, unchanged |
| Sweep re-hashing only moved files | Open, and more relevant: an options-only configuration capture sweeps again, about 325 ms on the reference and 334 ms on S100 in process |

### Plan decisions for review

1. **Observer retirement contract.** Iteration 4 chose `ProjectObserver.retire`
   over an `apply` option. It awaits sign-off.
2. **Repeated deletion plan.** Iteration 4 found the
   [repeated deletion plan](../../iteration-5-repeated-deletions/main-plan.md)
   unimplemented on every branch and proceeded. The membership path now handles
   deletions. Whether to confirm, re-scope or withdraw that plan is still to be
   decided.
3. **Helper spawn on configuration edits.** Open, with the figures above. It is
   now the main remaining cost of the kept observer update, and the changed
   projection pays it twice.
4. **Error attribution.** The project layer refuses with the same codes, as
   resolved decision 3 states. On a warm context, a hook after a solution-style
   rewrite now receives a `reported`, unpublished reply with code `internal-error`.
   Batch reports `references-only-configuration`. `ReportDraft.failure` keeps
   only `read-failure`, `changed-input` and `resource-limit`. Before the plan,
   the daemon's resolution refused and returned the batch report as
   `unresolved`. Iteration 6's re-read path has the same projection. Still open.

### Review items raised by the iterations

- **Iteration 2.** A configuration with `references` keeps the full replay, so
  its created and deleted file hooks still spawn the helper in both processes.
  The daemon's reuse evidence is scripted; no real daemon ran. The
  unreadable-directory case is skipped as uid 0.
- **Iteration 3.** The `typescript` fix `9ae894e` is a description-set
  correction beyond the witness scope. `baseUrl` and `rootDirs` resolutions have
  no candidate spelling; iteration 4 sends them to the broad path. Contribution
  keys outside the root use the `../` spelling.
- **Iteration 4.** Clarifications of resolved decisions 4 and 5, above. The
  `MembershipReach` adapter contract in an unlisted owner. The fallback breadth:
  any `.tsx` or `.jsx` deletion, any last source in a directory, and any
  creation while an unresolved package access exists take the broad path.
  A confirmed probe keeps its first recorded state until a sweep.
- **Iteration 5.** The adapter fix `76728ac` and its extra snapshot update. The
  conservative reading of resolved decision 6. `#reopen` reporting `false`. The
  session audit cannot detect a retained-compiler option mismatch, because it
  recomputes through the same compiler; only batch comparison can, which bears
  on resolved decision 2. The pre-plan S100 configuration medians were measured
  on a build with this defect.
- **Iteration 6.** The `InventoryUpdate` `configuration` field and the product
  fields. The clarification of resolved decision 7 and of iteration 4's handoff.
  The net cost on small projects: the reference capture is about 225 ms slower
  than reacquiring without a sweep, while S100 is about 700 ms faster. Options
  are to accept it, to reacquire when the inventory is small, or to satisfy the
  sweep for the inputs the helper answered from the capture; the last needs
  evidence. The double helper spawn on a changed projection. The references seed
  replaced in the worker only.

## Remaining gaps

Gathered from each results file. None blocks a matrix row.

**Timing and attribution**

- Open and verify report no promotion; `SessionOpen` and `VerifyOutcome` have no
  timings (iteration 1).
- A cancelled promotion is not reported (iteration 1).
- About 50 ms of the reference's measured time outside the stages is not
  attributed; the attribution is in process (iteration 1).
- `SessionStatus.lastSweepAt` does not advance for a skipped sweep leg; the
  context's own `lastSweepAt` does (iteration 5).

**Resolution**

- Configurations with `references` validate by full replay (iterations 2 and 6).
- A solution-style rewrite is reported as `internal-error` by the session
  (iterations 2 and 6).

**Membership path**

- Link is whole-project (iteration 4).
- A created file satisfying a resolution through a mechanism no candidate or
  reach reports would stay unmatched; none is known (iteration 4).
- A failed JSX runtime resolution is covered only by the `.tsx` and `.jsx`
  deletion refusal (iteration 4).
- Resource shims and `paths` aliases with a created target were exercised only
  in scratch runs (iteration 3).

**Sweep and configuration**

- The sweep skip depends on the watcher event: a hook that names
  `tsconfig.json` before the event arrives has no sweep requirement, and a later
  identical capture sweeps outside the hook's reply (iteration 5).
- A configuration input read only by the server's project parse, and not by
  the adapter's parse, would not be named to the compiler; none is known
  (iteration 5).
- A directory created or removed in a helper-walked area since the last
  acquisition makes the next configuration edit rebuild (iteration 6).
- A cancelled or failed re-read leaves the edited file refreshed; the session
  marks itself stale and the next update rebuilds (iteration 6).

**Measurement tooling** (successor inputs, no change in this iteration)

- `scripts/measurements/fast-assertions.mjs` `replySessionWork` lists
  `invocationCheck`, `workerStatus`, `workerRoundTrip` and `publication`. A
  covered answer's `promotion` and `sweep` are also 0, so the list could include
  them (iteration 1).
- The assertions expect `membership` for created and deleted rows and `broad`
  for configuration. No assertion reads `capture.sweep`. One must not assert
  0 for the configuration row, which sweeps again since iteration 6.

## Measurement recipe

The successor replaces this plan's estimates with measured medians and re-ranks
what remains. Repeat the hook optimization
[measurement results](../../iteration-5-hook-optimization/iterations/measurement-results.md)
method on the closing commit of this plan.

### Builds and commands

The before figures are that document's optimized medians on build `4981ed5`.
Measure `4981ed5` again only if the host differs, using the same commands in its
own detached worktree.

```sh
git worktree add --detach /tmp/ramify-structural-measure <closing commit>
cd /tmp/ramify-structural-measure
npm ci
npm run worktree:prepare
npm run build
RAMIFY_MEASUREMENT_ACTIVITY='<host>; no other builds or measurements; load average <at start>; one measurement at a time (<label>)' \
  node scripts/measurements/fast.mjs --workload hook-latency-reference
RAMIFY_MEASUREMENT_ACTIVITY='<same form>' \
  node scripts/measurements/fast.mjs --workload hook-latency-s100
```

Run one workload at a time, reference first. A `--workload` run exits 1 because
the other workloads are not executed; its row reports `measured` and `passed`.
Run S100 a second time and pool the 40 cycles when contention affects more
than a few created, deleted or configuration cycles. The comparison needs only
these two workloads. Raw reports are in
`.reference-work/reports/`, and archives with their `index.json` entries in
`scripts/measurements/results/`.

### Environment to record

- From the report's `environment`: `node`, `versions`, `platform`, `release`,
  `arch`, `logicalCpus`, `cpuModel`, `totalMemoryBytes`, `concurrentActivity`
  and `processCensus`.
- From the report: `inputs.build` and `client`.
- Recorded by hand:
  - the commit and `dist/runtime-identity.json` identity;
  - the installed bin, `dist/src/ramify`, executing the Bun-compiled client;
  - the Bun version;
  - the load average before each run;
  - each run's UTC start and duration;
  - raw report and archive names.

### Contention classification

Start a 1 s `/proc/stat` idle sampler, and optionally a 10 s `top` log, before
the first run and keep them through the last. A cycle is contended if any
sample overlapping its interval from write to hook exit shows less than 40 %
idle. For every row, report the all-cycle median with p90 and the quiet-cycle
median with its count. The median is the harness's element at index
`floor(n/2)`.

### Timing fields per row

For each of body, source, description, README, created, deleted and
configuration on both fixtures:

| Field | Source | Expected after this plan, where the iterations give one |
| --- | --- | --- |
| Hook end to end | `cycle.hook.durationMs` | acceptance figure on S100 |
| Before check | `ramify.check/1` `timings.totalMs − timings.waitedMs` | narrow and structural rows lose the resolution replay and helper; not measured |
| Revision path | `revision.checked.path`, `files`, `accesses` | `membership` for created and deleted; `broad` for configuration |
| Reply work | `timings.reply`: `invocationCheck`, `promotion`, `workerStatus`, `workerRoundTrip`, `sweep`, `publication`, `service`, `clientTransport` | `invocationCheck` a few ms on created, deleted and configuration rows, from about 500 ms on S100 |
| Capture work | `revision.capture`: the same `CaptureWork` fields and `watch.receivedAt`, `watch.flushedAt`; use it when a hook covered on publication reports zero reply work | `sweep` 0 on created and deleted; about 300 to 330 ms on configuration, in process |
| Stages | `revision.timings`: classify, inventory, compiler, descriptions, accesses, link, decide, publish, total | created and deleted: compiler about 170 to 200 ms and promotion about 25 to 40 ms, in process. Configuration: inventory about the helper, about 250 ms on the reference and 330 ms on S100 |
| Promotion | `timings.reply.promotion` or `revision.capture.promotion` | configuration: about 467 ms on the reference and 83 ms on S100, in process |
| Still unattributed | `total` minus the eight stages minus `promotion` | about 5 ms on the reference broad path in process; iteration 1 left about 50 ms of the measured figure unexplained |
| Covered on publication | daemon `coveredRequests` per cycle | as before |

### Acceptance figures

Compare these three medians with the 2 s acceptable-time budget, all cycles
and quiet cycles:

1. `hook-latency-s100` created: hook end to end (before 2,497 ms; 2,298 quiet).
2. `hook-latency-s100` deleted: hook end to end (before 2,555 ms; 2,355 quiet).
3. `hook-latency-s100` configuration: hook end to end (before 3,697 ms; 3,649
   quiet).

Also report the reference configuration row against 2 s (before 1,872 ms, p90
2,119 ms), because of iteration 6's reference regression. Then decide review
decision 3 and iteration 6's small-project option from the measured
configuration rows. Update the optimization analysis's figures and remaining
targets.

Reference and S100 results: [measurement results](measurement-results.md).
