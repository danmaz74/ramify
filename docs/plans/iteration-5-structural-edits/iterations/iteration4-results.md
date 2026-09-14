# Iteration 4 results: Membership path with targeted retirement

**Date:** 2026-09-13. **Outcome:** SE-9 to SE-12 pass. A local update that only
creates or deletes owned sources takes the new `membership` path: no whole
invalidation, one incremental compiler update, and only the files whose
resolution the paths can change are described, interpreted and decided. Every
membership revision tested publishes the same inputs, `inputId` and report as
batch. Every case whose reach the retained facts or the compiler cannot bound
takes the broad path. Direct work; no Studio workflow.

On the reference example, a created or deleted file now takes about 260 ms of
session work instead of about 1,140 ms. The promotion falls from about 420 ms
to about 40 ms (see [Reference stage timings](#reference-stage-timings)).

Resolved decision 5 is not implemented as written. Retiring only the
observations the affected files contribute leaves compiler probes that no file
contributes, as iteration 3's F2 showed. The session instead marks every
compiler probe and lets the compiler confirm the ones still needed. The rule
and its fallbacks are recorded as clarifications of resolved decisions 4 and 5
under [Review items](#review-items).

## Implemented behavior

- **Retirement contract, `analysis/project`.**
  - `apply` no longer retires anything. `ProjectObserver.retire(retirement)`
    releases compiler-reported observations
    (`subs/analysis/subs/project/src/observer.ts:115`).
  - `{ kind: 'all' }` keeps the previous wholesale behavior: every observation
    that differs from its acquisition recipe is forgotten, and the recipe is
    replayed (`capture.ts:102`, `retireReported`).
  - `{ kind: 'probes' }` retires nothing at once. It keeps every observation
    that holds read bytes and marks every other compiler-reported observation:
    existence probes, absences and listings (`capture.ts:115`, `markReported`).
  - The next promotion confirms each marked path the compiler reported again
    (`observer.ts:162`, `capture.ts:120`) and then releases every mark it did
    not confirm (`observer.ts:178`, `capture.ts:126`).
  - A confirmed path that holds a compiler listing, where the new report is
    not a listing, is retired and observed afresh.
  - A confirmed probe keeps its recorded state without touching the disk. That
    is why the membership promotion is cheap.
- **Reach report, `typescript`.** For an update that creates or deletes files
  without a whole invalidation, `RetainedSourceAnalysis.update` returns `reach`
  (`retained-source-analysis.ts:147-170`). It holds:
  - the program files outside the owned inventory that entered or left the
    program, from `program.getSourceFileNames()` before and after the snapshot;
  - the created files (new snapshot) and deleted files (old snapshot) that can
    reach other files without a resolved import (`#reachesGlobally`, `:185`).
    These are:
    - scripts and declaration files;
    - files with module augmentations or ambient module names;
    - files with triple-slash path, type or lib references;
    - files with an import the compiler did not resolve that is not a relative
      specifier;
  - `spelled`, which is false when `baseUrl`, `rootDirs` or a `paths` mapping
    without an absolute base can resolve a specifier to a path no candidate
    records.

  Computing the reach costs about 5 ms on the reference example, out of about
  145 ms for the snapshot update.
- **Membership path, `analysis`** (`session-revision.ts:569-628`).
  - **Selection.** The update must be local, create or delete files, have no
    other broad trigger, and pass `membershipRefusal` (`:335`).
  - **Sequence.** The session:
    1. calls `observer.retire({ kind: 'probes' })`;
    2. runs one adapter update (`changed: []`, the created and deleted files,
       the current inventory, `invalidateAll: false`);
    3. checks the reach with `reachRefusal` (`:362`), and falls back
       (`broadAfterMembership`, `:406`) if it is refused;
    4. describes the created, deleted and matched files, and interprets the
       affected set;
    5. relinks always, then decides narrowly with the source path's decision
       rule. That rule is now shared as `relinkAndDecide` (`:436`), with no
       change for the source path.
  - **Facts order.** File facts are rebuilt in byte order. Without that, the
    indexes' key order differed from a whole recomputation and the audit
    reported `indexes`.
- **Broad path.** A refused membership change, or one with another broad
  trigger, calls `observer.retire({ kind: 'all' })` before the compiler updates
  (`:657`). It keeps the whole invalidation, as before.
- **Revision path.** `RevisionPath` and the daemon codec accept `membership`.
  The measurement assertions now expect `membership` for the created and
  deleted rows (`fast-assertions.mjs`, `fast-evidence.test.mjs`,
  `resident-reuse.mjs`), and so does the reference harness's live case
  (`plan5-live-cases.ts`). The analysis README and the measurement README each
  gained a sentence.

## Contract shapes

```ts
// subs/analysis/subs/project/src/interfaces/project.ts
export type ObservationRetirement =
  | { readonly kind: 'all' }
  | { readonly kind: 'probes' };
export interface ProjectObserver {
  // ...
  apply(changes: readonly ObservedChange[], signal?: AbortSignal): Promise<InventoryUpdate>; // no longer retires
  /** Release compiler-reported observations before a compiler update that reports them again. */
  retire(retirement: ObservationRetirement): Promise<void>;
}

// subs/analysis/subs/typescript/src/interfaces/source.ts
export interface MembershipReach {
  readonly added: readonly string[];   // non-owned program files, root-relative, `../` outside the root
  readonly removed: readonly string[];
  readonly global: readonly string[];  // created or deleted owned files that reach other files globally
  readonly spelled: boolean;
}
export interface RetainedSourceAnalysis {
  update(changes: SourceChangeSet, signal?: AbortSignal): Promise<{ readonly snapshot: number; readonly elapsedMs: number;
    readonly reach?: MembershipReach }>;
  // ...
}

// subs/analysis/src/interfaces/session.ts
export type RevisionPath = 'cold' | 'unchanged-surface' | 'source' | 'description' | 'metadata' | 'membership' | 'broad';
```

Owner-private capture methods: `retireReported()`, `markReported()`,
`confirm(path, shape)` and `retireUnconfirmed()`. The session-private exports
in `session-revision.ts` are `membershipRefusal`, `reachRefusal` and
`membershipMatches`; the owner's tests import them. No exposure line or package
entry changed.

## Affected-set rule

**Matched files** (`membershipMatches`) are found through the contribution
index:

- for a deleted path, every contributor naming it exactly;
- for a created path, every contributor of a recorded path that the created
  path completes. The recorded path, or its stem, must equal the created path
  or be extended by it after a `.` or a `/`. The stem is the path with the
  first `.` of its base name onward removed.

Deleted files are excluded. The stem extends iteration 3's `completes` rule so
that the literal `src/later.js` matches a created `src/later.ts`,
`src/later.ios.ts` or `src/later.tsx`. That also covers a created file that
takes a resolution over from an existing sibling, which the description set
alone does not select. `describe` therefore receives the created, deleted
**and matched** files, not only the seed set.

**Interpreted files** are the created files, the matched files, the
description delta's `recomputed` files, and the importers of `delta.changed`
and of the deleted files. Importers of `delta.moved` files are added when their
coverage cites the moved file. Deleted files are removed.

**Example** (`session-revision.test.ts:102`):

- `subs/branch/src/pending.ts` imports `./later.js` while it is absent.
- Creating `subs/branch/src/later.ts` matches `pending.ts` through the recorded
  literal `subs/branch/src/later.js`.
- The session describes and interprets `[later.ts, pending.ts]` and decides
  one access.
- Deleting `later.ts` again describes `[later.ts, pending.ts]` and interprets
  only `[pending.ts]`.

Iteration 3's third input, the conversion of `../` contribution keys to
`external:` capture labels, is not needed: retirement no longer looks up
contributors.

## Retirement rule and fallback conditions

**Retirement rule.** Iteration 3 proposed forgetting every compiler probe
before the compiler update. That version passed the same equality cases, but on
the reference example the promotion then re-observed about 2,600 probes from
disk, 140 to 150 ms. The marking version keeps the rule and moves the
decision to the next promotion:

- keep every read;
- mark every compiler-reported probe, absence and listing;
- keep what the compiler reports again;
- release the rest before the input list is published.

The rule is sound for probes because a membership update re-resolves every
owned source. The compiler then reports again every probe and listing still
needed (iteration 3, SE-7, and the scratch runs below).

**Fallbacks judged before compiler work** (`membershipRefusal`):

| Refusal | Why equality cannot be guaranteed |
| --- | --- |
| other broad trigger | Stale state, no hot adapter, invalid previous facts, an unknown event, a structural update, changed areas, a changed shim, a changed non-owned input or an unexplained change. Unchanged from before |
| `other-changes` | The update also changes owned sources or descriptions |
| `areas` | Any module's `areas` differ, for example a first file in `src/tests/` |
| `created-kind` | A created file that is a resource or a declaration file |
| `deleted-kind` | A deleted file that is a resource, a declaration file, a `.tsx`/`.jsx` file (implicit JSX runtime import) or a shim of a retained description |
| `deleted-global` | A deleted file carrying a `shared-global` note |
| `deleted-unresolved` | A deleted file with a package-style access the compiler did not resolve to a file; its lookup can read manifests no fact names |
| `deleted-last-in-directory` | No owned source remains in the deleted file's directory. The compiler reads the nearest package manifest per program directory (shown below) |
| `unresolved-package` | A created file while any retained access is an unresolved package-style access. Package imports, self-references and failed lookups record no candidate the created file could complete |

**Fallbacks judged from the compiler's reach** (`reachRefusal`). Each one
retires everything, invalidates the program the incremental update already
holds, and recomputes every file:

| Refusal | Why |
| --- | --- |
| `reach-unknown` | The adapter reported no reach, for example after a reopen |
| `program` | A non-owned program file entered or left the program: its reads are new, or obsolete |
| `global` | A created or deleted file is a script or declaration file, or has an augmentation, ambient module, triple-slash reference or unresolved package import |
| `unspelled` | A created file while `baseUrl`, `rootDirs` or a `paths` mapping without an absolute base is configured |

**Evidence for the last-in-directory rule.** In a scratch run with that rule
disabled, the witness fixture had `subs/package.json` and no module-level
manifest. Deleting the last source kept the compiler's 17-byte read of
`subs/package.json`. Batch recorded it only as a probe, so the inputs and
`inputId` differed. With the rule, the case takes the broad path and equals
batch.

With a manifest inside `src/` (an owned resource) or at the module directory,
both are acquisition reads, and the rule was not needed. It is kept because
the scope lookup is per directory.

## Observer contract chosen (review decision 1)

**Proposed: a separate `retire(retirement)` method.** Why:

- The session knows whether an update takes the membership or the broad path
  only after `apply` has classified it.
- A fallback after the compiler's reach also needs a second, wholesale
  retirement.

**Alternative: an option on `apply`,** `apply(changes, { retire })`. It would
need the session to guess the path before classification, or to call `apply`
twice. It would also make a whole-invalidation fallback after the reach
impossible without a separate call anyway.

## Matrix rows

| ID | Evidence | Result |
| --- | --- | --- |
| SE-9 | `subs/analysis/src/tests/session-revision.test.ts:709` `membership-identity-equals-batch: unreferenced and referenced deletions and created files that satisfy an absent or extensionless probe publish the batch inputs`. Steps, each on the membership path with `revision.inputs` and `inputId` equal to a fresh batch run, the whole report equal and the audit equal: an unreferenced deletion; a referenced deletion, whose `ghost.js.*` extension probes are gone; a created `later.ts` satisfying `./later.js`, whose `later.js.*` probes are gone; a created `soon.ts` satisfying the extensionless `./soon`; a created unreferenced file; a restore of the deleted file. The cold revision is asserted to hold the obsolete probe families first | pass |
| SE-9 | `subs/analysis/subs/project/src/tests/observer.test.ts:87`: `apply` leaves compiler observations in place. Probes retirement keeps reads and re-reported probes, releases an unconfirmed absence, and releases a listing re-reported only as a probe. The resulting list and `inputId` equal a fresh observer given the same reports. All retirement restores the acquisition | pass |
| SE-9 | `subs/analysis/subs/typescript/src/tests/retained-membership.test.ts` (five cases): `reach` is bounded for the created and referenced-deletion cases. The sole importer of `pkg` reports `removed: ['node_modules/pkg/index.d.ts', 'node_modules/pkg/other.d.ts']`, which is iteration 3's F2 last row | pass |
| SE-9 | `session-revision.test.ts:856` `membership-identity-equals-batch: promotes a membership revision far below a broad one on the same fixture`: five cycles; the median membership promotion times 4 stays below the median broad promotion (last-in-directory deletion). A temporary print, removed before the commit, gave medians of 1.7 ms against 42.0 ms | pass |
| SE-10 | `session-revision.test.ts:102` `membership-path-narrow: a created and a deleted file update the compiler once without a whole invalidation and check only the affected files`. For a created unreferenced file, a created file satisfying an absent probe, a referenced deletion and an unreferenced deletion: exactly one adapter update with `invalidateAll: false`, one `retire({ kind: 'probes' })`, and the exact `describe` and `interpret` arguments. Checked sets: `[extra]`/1, `[later, pending]`/1, `[pending]`/1 and `[]`/0, `modelRebuilt: true`. Each equals batch and audits equal | pass |
| SE-10 | `session-revision.test.ts:743`: the matching rule (base, stem, `/`, suffix spelling, exact deletion) and every `reachRefusal` reason | pass |
| SE-10 | `subs/analysis/src/tests/retained-session.test.ts:195` (worker-hosted session): created `{ membership, [extra], 1, true }`, deleted `{ membership, [], 0, true }` | pass |
| SE-11 | `subs/analysis/src/tests/session-audit.test.ts:16` `membership-sequences-equal-batch`: the twelve-step sequence mirroring Plan 5 iteration 11's live steps, extended with restore-after-delete (membership) and whole-module removal (broad, no `subs/sibling` input). Batch equality, the audit and an unchanged sequence number are asserted after each of the fourteen steps | pass |
| SE-11 | `session-audit.test.ts:10` with `src/tests/session-input-witness.ts`, the iteration 11 deletion defect: last source removed (broad, last in directory), a repeated missing-path request (identical), source restored (membership) and whole module removed (broad). The complete report, including observation roles and `inputId`, equals batch at each step and audits equal | pass |
| SE-12 | `session-revision.test.ts:778` `broad-kept: structural, configuration, non-owned, unknown, unexplained and area changes keep the whole invalidation`. Each step's last adapter update has `invalidateAll: true`, the retirement is as expected (`all` when files are created or deleted, none otherwise), and inputs and the audit equal batch | pass |
| SE-12 | `session-revision.test.ts:809` `broad-kept: a membership change the facts or the compiler cannot bound falls back to the whole invalidation`. Before compiler work (retirement `['all']`): a created `.d.ts`, a deleted `.tsx`, a last-in-directory deletion, a creation while an unresolved package access exists, and that file's deletion. From the reach (retirements `['probes', 'all']`): a created ambient script, a created and a deleted sole package importer, a created triple-slash reference, a created unresolved package import, and a created file under `baseUrl`. Every step equals batch and audits equal | pass |

**Exit criteria.**

- Every session-equals-batch and audit case passes.
- `check:self` reports 0 errors.
- No test path reaches `invalidateAll` for a plain created or deleted file:
  SE-10 asserts the exact adapter calls.

## Reference stage timings

The loop was a scratch script, outside the repository and not committed, run
in process on a copy of `examples/collection-review` with its `node_modules`
linked. It applied the `fast-fixture.mjs` setup: the side-effect import in
`src/assembly.ts` and `src/fast-measurement-created.ts`. It ran five delete and
recreate cycles per tree, each followed by a batch comparison and an audit.

The "before" tree is `git archive 89580e9`; the "after" tree is `8143956`.
Both ran on the same machine back to back, and every revision equaled batch.
Medians of five, in milliseconds:

| Field | Before, created (broad) | After, created (membership) | Before, deleted (broad) | After, deleted (membership) |
| --- | ---: | ---: | ---: | ---: |
| `total` | 1,156.8 | 270.6 | 1,129.0 | 259.2 |
| compiler | 568.0 | 177.4 | 549.2 | 172.8 |
| descriptions | 54.3 | 5.1 | 45.7 | 4.7 |
| accesses | 72.4 | 3.0 | 78.5 | 2.2 |
| link | 16.8 | 17.4 | 17.2 | 15.4 |
| decide | 13.0 | 2.9 | 12.0 | 3.0 |
| classify, inventory, publish | 6.0, 13.9, 7.2 | 7.6, 7.9, 6.1 | 6.1, 12.0, 6.5 | 6.6, 6.4, 5.9 |
| `promotion` | 421.7 | 38.5 | 415.4 | 40.9 |

Most of the remaining compiler time is the incremental snapshot update, which
re-resolves every owned source and reports about 3,600 probes through
synchronous callbacks. About 5 ms is the reach.

A scratch run on S100 (`materializeSynthetic`, the same setup on
`src/impl0.ts`) gave membership totals of 377 to 417 ms for three created and
three deleted cycles, all equal to batch. The parts were compiler 187 to 204,
link 80 to 93, decide 20 to 25 and promotion 25 to 29 ms. These are in-process
figures, not measurements of the hook.

## Scratch equality exploration

Not committed. Every step was compared with batch, including report, inputs and
`inputId`, and audited:

- **Package fixture** (iteration 3's `membershipProject` plus an alias), 16
  steps. Membership for shadowing and shadowed files, referenced deletion and
  restore. Broad for the aliased unresolved access, the sole package importer,
  ambient scripts and triple-slash references.
- **Reference example**, 8 steps. Membership for the measured file, the live
  sequence's `extra.ts` and a created `.tsx`; broad for the `.tsx` deletion.
- **S100**, 6 steps.
- **Iteration 11 witness**, under `bundler` and `NodeNext`, with nested and
  module-level manifests.

The first run found one defect: facts in insertion order made the audit report
`indexes`. It was fixed before the commit (byte-order facts). No other
inequality was found except the intermediate-manifest case above, which the
last-in-directory rule handles.

## Commands

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/subs/project/src/tests` | 8 files, 141 tests passed |
| `npx vitest run subs/analysis/src/tests` | 14 files, 225 tests passed |
| `npx vitest run subs/analysis/subs/typescript/src/tests` (adapter changed) | 14 files, 151 tests passed |
| `npx vitest run subs/daemon/src/tests/codec.test.ts subs/daemon/subs/contexts/src/tests` (codec changed) | 10 files, 134 tests passed |
| `node --test scripts/measurements/fast-evidence.test.mjs`, `resident-reuse.test.mjs` | 19 and 4 tests passed |
| `npm run type-check` | pass, including the portable, scripts and reference-harness projects |
| `npm run build` | pass |
| `npm run check:self` | completed, passed, complete coverage: 11 owners, 283 source files, 3,761 accesses, 0 errors, 0 warnings, 0 analysis limits. The daemon it started was the only context and was stopped with `dist/src/ramify daemon stop` |
| `git diff --check` | clean |
| Scratch `explore.mts`, `cases.mts`, `s100.mts`, `nodenext*.mts`, `ref-short.mts` via `npx tsx` | as reported above |

## Audit

- **First audit.** The cucumber-viz commit audit of `8143956`, with
  `use_existing_head`, failed. Only
  `report-capacity.test.ts > still returns a bounded incomplete result when
  evidence exceeds 96 MiB` failed, by exceeding the default 5 s timeout. That
  test builds a `ReportDraft` over about 100 MiB and touches no session code;
  it took 2.5 to 2.7 s alone in three focused runs.
- **Fix.** `6c460c3` gives both of its cases an explicit 60 s timeout.
- **Second audit.** The audit of `6c460c3` passed in 2 min 48 s:
  - worktree dependencies and type-check;
  - the Vitest regression suite, 101 files and 1,536 tests.

  Evidence: `refs/audited/runs/2026-09-13T21-12-09Z-6c460c3`. These results are
  a docs-only follow-up.

## Deviations

- **Adapter contract in `typescript`.** The iteration lists `analysis/project`
  and `analysis` as owners. Obsolete reads can only be bounded by the program's
  file list, and global reach only by the compiler's source file data, so
  `RetainedSourceAnalysis.update` gained `reach`. This contract is not in the
  plan's table and needs review.
- **Retirement by marking,** not by the contribution index. See Review item 2.
- **`describe` receives the matched files,** not only the seed set. This
  corrects a created file that takes a resolution over from an existing file.
- **Refactor.** The source path's link and decision code moved unchanged into
  `relinkAndDecide`.
- **Out-of-owner test edits:**
  - `report-capacity.test.ts` timeout;
  - `input-list.test.ts`, whose HO-4 and HO-5 now call `retire({ kind: 'all' })`
    explicitly where `apply` used to retire;
  - measurement assertions and the reference harness live case now expect
    `membership`;
  - `session-test-fixture.ts` `instrumentObserver` spies on `retire`.
- **Review decision 2.** The
  [repeated deletion plan](../../iteration-5-repeated-deletions/main-plan.md)
  was never implemented on any branch, so no other edit touches `revise`.
  Iteration 4 proceeded; the plan was withdrawn against this path on
  2026-09-14.

## Review items

1. **Clarification of resolved decision 4, the membership path.**
   - Membership also requires every refusal in the fallback tables to be
     absent.
   - The affected set uses the stem completion rule, and `describe` names the
     matched files.
   - Link always runs.
   - A reach refusal after the incremental update falls back to the whole
     invalidation.
   - `readmes` may accompany a membership update; changed sources or
     descriptions may not.
2. **Clarification of resolved decision 5, the contribution index.**
   - Retirement does not use the contribution index.
   - On a membership update, every compiler-reported observation without read
     bytes is marked, and reads are kept.
   - The next promotion keeps what the compiler reported again and releases the
     rest.
   - Obsolete reads are excluded by the reach (`program`, `global`) and by the
     facts refusals (`deleted-unresolved`, `unresolved-package`,
     `deleted-last-in-directory`), which fall back to the whole invalidation.

   The contribution index remains the matching structure for the affected set.
3. **Observer contract (review decision 1).** Proposed `retire(retirement)`;
   the alternative is recorded above.
4. **New adapter contract `MembershipReach`,** and `CheckedSet.path` adding
   `membership`, as listed in the plan.
5. **Out-of-model fallback breadth.** Deleting any `.tsx` or `.jsx` file, or
   the last source in a directory, always takes the broad path. So does
   creating any file while the project has an unresolved package access. A
   narrower rule needs evidence the compiler does not report today.

## Remaining limits

- **Staleness of confirmed probes.** A confirmed probe keeps the state observed
  when it was first recorded, not a fresh `lstat`. A disk change without a
  watcher event is found by the sweep, as on the source path.
- **Unmatched edge cases.** A created file that satisfies a resolution through
  a mechanism no candidate or reach reports would stay unmatched. None is
  known: `baseUrl`, `rootDirs` and unanchored `paths` are refused, and unresolved
  package accesses are refused. A failed JSX runtime resolution of a deleted
  file is covered only by the `.tsx`/`.jsx` refusal.
- **Link is still whole-project,** about 85 ms on S100 and 17 ms on the
  reference.
- **In-process figures only.** The reference and S100 timings above are from
  scratch loops; the hook's end-to-end rows need the measurement successor.

## Successor inputs

- **Iteration 5.** A membership revision is never a reacquisition: the observer
  update is `local` and the capture is kept, so its `reacquired` is false. The
  broad path with a structural update is unchanged. Every path still calls
  `observer.retire` before any compiler update. A new broad trigger added to
  `revise` must keep `retire({ kind: 'all' })` whenever files are created or
  deleted.
- **Iteration 6.** An options-only configuration update must not call
  `retire`. Its local update carries no created or deleted files, so
  `membershipChange` is false and neither retirement runs. Keep it that way,
  and keep the whole invalidation for it. Marks exist only between a membership
  update's `retire` and its promotion; a structural rebuild's fresh capture has
  none.
- **Iteration 7 and the measurement successor.**
  - `fast-assertions.mjs` expects `membership` for the created and deleted
    rows.
  - `resolutionNarrowing` now reads the S100 created median from membership
    revisions.
  - Expect `promotion` near 25 to 40 ms and compiler near 170 to 200 ms in
    process; the hook adds worker and daemon overhead.
  - The live reference harness case expects `membership` at steps 11 and 12.
