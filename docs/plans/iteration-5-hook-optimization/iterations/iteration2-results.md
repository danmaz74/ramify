# Iteration 2 results: Maintain the observed-input list

**Date:** 2026-09-13. **Outcome:** HO-3 to HO-6 pass. Reading `inputs` or
`inputId` on an observer whose observations have not changed returns the list
and identity it last built, with no hashing, labelling or sorting. After a
mutation, only the changed observations are hashed again and the list is sorted
once with a non-allocating comparator. Input order, `inputId` and every existing
expectation are unchanged. Direct work; no Studio workflow.

## Design

Three layers each keep what they can answer exactly.

1. **Capture** (`subs/analysis/subs/project/src/capture.ts`). Each observation
   records its `sha256` and its frozen `CapturedInput` lazily, the first time
   `inputs`, `digest` or `application` needs them after a mutation. The sorted
   list is kept in `#inputs`. One private choke point, `#changed()` at
   `subs/analysis/subs/project/src/capture.ts:65`, advances `#version` and drops
   the list. `#assign(entry, field, value)` at `:71` is the only writer of the
   four mutable fields `inputs` reads (`role`, `bytes`, `entries`, `exactName`).
   It returns early when the value is unchanged, so repeating a completed read
   with the same role invalidates nothing. Otherwise it clears the entry's
   recorded hash and input and calls `#changed()`. `signature`, `link`, `kind`,
   `canonical` and `path` are fixed when `#disk` creates an observation.
2. **Reported observations** (`subs/analysis/subs/project/src/observations.ts`).
   `ReportedObservations` has a `version` that advances whenever its pending
   map changes. Promoted reports are not part of any input list, so they do not
   advance it.
3. **Observer** (`subs/analysis/subs/project/src/observer.ts`). Without pending
   reports, `inputs` returns the capture's list itself. That list is already in
   merged order: the old code copied it and stable-sorted it again. With pending
   reports, the merged list is cached in `#merged`, keyed by the capture object,
   the capture's version and the reported version. `inputId` is cached in
   `#recordedId`, keyed by the identities of the merged list object and the
   inventory object. The registry is fixed for the observer's lifetime.

The laziness is deliberate. Deliverable 2 asks for hashing "when it is read or
mutated". Hashing at the next read after a mutation means an observation that
is read and then enumerated in the same stage is hashed once, not twice. A
batch capture that reads `inputs` only at seal pays no extra hashing.

`application()` reuses the recorded hash only when the target observation still
holds the same `Buffer` it just returned (`capture.ts:266-269`). Otherwise it
hashes the bytes as before. `digest()` (`capture.ts:305-307`) reuses the
recorded hash. Previously it hashed the bytes on every call during promotion.

### Mutation sites

Each site either calls `#changed()` directly or goes through `#assign`, which
calls it.

| Mutation | Site | Advances by |
| --- | --- | --- |
| New observation (including absent, probe-only and symlink targets) | `observe()`, `capture.ts:159-160` | `#changed()` after `#observations.set` |
| Exact-name probe | `hasExactEntry()`, `capture.ts:174` | `#assign(entry, 'exactName', …)` |
| Role change in place, including `dependency` becoming `source`, `configuration`, `description` or `readme` | `bytes()`, `capture.ts:191` | `#assign(entry, 'role', role)`; no advance when the role is unchanged |
| Bytes captured | `bytes()`, `capture.ts:217` | `#assign(entry, 'bytes', buffer)` |
| Directory enumerated | `readDirectory()`, `capture.ts:250` | `#assign(entry, 'entries', …)` |
| Observation forgotten (`forget`, `refresh`, `retireReported`, including both records of a refreshed symlink) | `#forget()`, `capture.ts:316-317` | `#changed()` after `#observations.delete`; the recorded hash and input leave with the observation object |
| Refresh | `refresh()` | `#forget` then `observe`, `hasExactEntry`, `bytes`/`application` and `readDirectory`, each advancing as above |
| Reported compiler reads inside `reported()` | the same methods | The same sites; `#reporting` affects only the acquisition recipe, not the table |
| Retirement of reported reads | `retireReported()` | `#forget` plus `replay`, which goes through the sites above |
| Root reassigned (`resolveCapturedRoot`, `resolve-root.ts:12`) | `set root`, `capture.ts:52-57` | Clears every recorded input, because labels depend on the root, then `#changed()`; no advance when the root is unchanged |
| Dispose | `dispose()`, `capture.ts:396` | `#changed()` after `#observations.clear()` |
| Pending report recorded (`file`, `directory`, `absent`, `probe`) | `#record()`, `observations.ts:41` | `#version++`; not when a probe is suppressed by an earlier read |
| Pending reports taken for promotion | `take()`, `observations.ts:49` | `#version++` when any were pending |
| Pending report forgotten or cleared | `forget()`/`clear()`, `observations.ts:55-56` | `#version++` when a pending report was removed |
| Capture replaced by a structural rebuild | `#rebuild()`, `observer.ts:381-386` | New capture object in the `#merged` key; both observer caches are also dropped |
| Inventory replaced (local update or rebuild) | `observer.ts:302`, `:382` | New inventory object in the `#recordedId` key |
| Observer disposed | `dispose()`, `observer.ts:132` | Both caches dropped |

Nothing outside `capture.ts` writes an observation's fields: a search for
assignments to `exactName`, `role`, `bytes`, `entries`, `signature` and `link`
finds only these sites. `Observation` is not exported. `observe()` still returns
the live record, so a future writer outside the class would bypass the choke
point; see the handoff.

### Comparator equivalence

`byteOrder` (`subs/analysis/subs/project/src/data.ts:12-32`) walks both strings
by Unicode scalar value and never encodes them:

- `Buffer.from(string)` encodes UTF-8 and replaces each lone surrogate with
  U+FFFD (`EF BF BD`). `scalar()` returns the pair's scalar for a
  well-formed high/low pair, U+FFFD for a lone high or low surrogate, and the
  code unit otherwise. A lone surrogate advances one unit and a pair two, so
  both strings decode to exactly the scalar sequences `Buffer.from` encodes.
- UTF-8 is order-preserving: if scalar `p < q`, then `utf8(p) < utf8(q)` in
  byte-lexicographic order. Lead bytes grow with encoded length (`00-7F`,
  `C2-DF`, `E0-EF`, `F0-F4`), and within one length the bits appear in order.
  UTF-8 is also prefix-free: no scalar's encoding is a proper prefix of
  another's. The first differing scalar therefore decides the byte comparison
  in the same direction. When one scalar sequence is a proper prefix of the
  other, its encoding is a proper prefix too, and `Buffer.compare` orders the
  shorter first. Equal scalar sequences give equal bytes and 0. The function
  returns exactly `-1`, `0` or `1`, as `Buffer.compare` does.
- The fast path advances equal non-surrogate code units together. Such a unit
  is a whole scalar in both strings, so that is the same step. Code-unit order
  alone would be wrong: U+D800-U+DFFF sorts below U+E000-U+FFFF by code unit,
  but a surrogate pair encodes a scalar of at least U+10000. The surrogate
  branch handles that case.
- Ties are identical. `'\ud800'` and `'\ufffd'` compare 0 under both, so the
  stable sort keeps insertion order in both.

`a === b` returns 0 first, which is also what `Buffer.compare` returns.

### Callers

The seven evaluations per revision and the eighth in the worker's `status()`
remain as calls, but each is now a cached field read unless an observation
changed between them. Two call sites also skip work that identity can decide:

- `changedInputs` (`subs/analysis/src/session-revision.ts:243`) returns `[]`
  when `before === after`. The previous result was the empty path list,
  because both sides then held the same entries.
- `#promote` (`subs/analysis/src/session-engine.ts:294-303`) returns after
  `apply([])` when the list object is unchanged. The loop could not throw for
  identical frozen entries. The reads map is built only when promotion changed
  the list.

Both skips rely on the observer returning the same frozen list object until a
mutation. The engine's only `ProjectObserver` is this observer or a test
wrapper that delegates to it (`subs/analysis/src/tests/session-test-fixture.ts:121`).

## Files

| File | Change |
| --- | --- |
| `subs/analysis/subs/project/src/data.ts` | Non-allocating `byteOrder` and `scalar` |
| `subs/analysis/subs/project/src/capture.ts` | Recorded hash and input per observation, `#changed`/`#assign` choke point, cached list, `version`, `root` accessor, `digest` and `application` reuse |
| `subs/analysis/subs/project/src/observations.ts` | `ReportedObservations.version` |
| `subs/analysis/subs/project/src/observer.ts` | Cached merged list and `inputId` |
| `subs/analysis/src/session-revision.ts` | `changedInputs` identity short-circuit |
| `subs/analysis/src/session-engine.ts` | `#promote` identity short-circuit |
| `subs/analysis/subs/project/src/tests/input-list.test.ts` | New: HO-3 to HO-6 |

No owner, exposure line, package entry or exported type changed.
`Capture.version` and `ReportedObservations.version` are owner-internal: neither
class is exposed.

## Matrix rows

All in `subs/analysis/subs/project/src/tests/input-list.test.ts`. The test file
wraps `node:crypto`'s `createHash` with a call counter (lines 12-17). Every
content hash (`data.ts` `hash`) and input identity (`observations.ts`
`inputIdentity`) goes through it.

| Row | Test | Evidence |
| --- | --- | --- |
| HO-3 `input-list-cached` | `:72` "HO-3 input-list-cached: repeated reads without a mutation return the cached list and identity without hashing" | Capture: five reads return the same list object (`toBe`). Repeating a byte read, enumeration and exact-name probe with the same role leaves `version` and the list unchanged. Zero `createHash` calls. Observer: five `inputs`/`inputId` reads and an unchanged `apply([])` return the same list and identity with zero hashes. A pending report is merged once; the merged list and its identity are then read five times with zero hashes. |
| HO-4 `input-list-invalidated` (capture) | `:106` "HO-4 input-list-invalidated: every capture mutation advances the version and equals a fresh rebuild" | Fifteen mutation kinds (`:112-129`): new, absent, exact-name probe, byte read, in-place role change, enumeration, non-ASCII path, symlink read, refreshing an edited file, a created path and a retargeted symlink, forget, reported read, retirement, root relabel. Then dispose (`:138-142`). Before each mutation the cached list is populated. Afterwards `version` has advanced, the list is a new object, and its JSON equals a new `Capture` that replays `observations()` over the same disk and never held a cache. |
| HO-4 `input-list-invalidated` (observer) | `:145` "HO-4 input-list-invalidated: reports, promotion, local and structural updates equal a fresh acquisition" | Ten steps (`:161-180`): opened; reported file, directory, absence and probe; promotion; owned edit; owned creation, which retires reported reads; description change, which replaces the inventory; structural rebuild, which replaces the capture. After each, `inputs` JSON and `inputId` equal a newly acquired observer given the same reports, promoted when the original promoted them. Each changing step returns a new list object and identity. |
| HO-5 `input-cache-no-leak` | `:188` "HO-5 input-cache-no-leak: forgotten observations leave no cached entry" | Fifty observe, read and forget cycles leave `recorded`, `digest`, `inputs` and `observations()` empty. A re-observed path is hashed again from its new bytes. Observer: a promoted report and a deleted owned file both leave `inputs`, and `inputId` equals a fresh acquisition. |
| HO-6 `byte-order-equivalent` | `:217` "HO-6 byte-order-equivalent: the comparator orders every tested pair as Buffer.compare does" | All 1,521 ordered pairs of 39 samples: ASCII, prefixes, every UTF-8 length boundary, U+E000, U+F8FF, U+FEFF, U+FFFD, U+FFFF, supplementary scalars, lone high and low surrogates, reversed pairs and path-shaped strings. 399 seeded pairs over boundary code units. Identical sort output for 439 strings, including lone-surrogate/U+FFFD ties. A real capture orders `names/z.ts`, `names/é.ts`, `names/\ue000.ts`, `names/\u{1f600}.ts` by UTF-8 bytes, where code-unit order would put the emoji before U+E000. |

Mutation checks were run by hand and then reverted:

- Skipping invalidation for `role` in `#assign` fails the capture HO-4 test.
- A code-unit comparator fails HO-6.
- Removing the version advance in `ReportedObservations.#record` fails the
  observer HO-4 test at "report a directory".

Iteration 1's timing fields are not read by any test here.

## Microbenchmark (scratch, not a gate)

This is a scratch `tsx` script outside the repository. It imports `Capture`
from this worktree and from a `git archive` of `fbde665`. The fixture has 40
directories of 50 files, 2,039 inputs in total, enumerated and read as
application source, on Linux x64 with Node v22.23.2. There were two runs each.

| Build | First `inputs` | Repeated `inputs` (mean of 20) | `inputs` after one `forget` |
| --- | ---: | ---: | ---: |
| `fbde665` | 25.3-25.9 ms | 17.0-17.4 ms | 16.8-17.0 ms |
| This iteration | 11.7-14.5 ms | 0.001 ms | 1.9-2.8 ms |

The new first read does not hash file bytes again, because `application()`
already recorded them. It still hashes directory and probe identities and
sorts. The reference fixture and live recipes were not run (decision 7).

## Verification

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/subs/project/src/tests` | 8 files, 135 tests passed (130 existing plus 5 new) |
| `npx vitest run subs/analysis/src/tests` | 11 files, 207 tests passed, including session-equals-batch tests (first run; see the audit remediation below) |
| `npm run type-check` | Passed |
| `git diff --check` | Clean |

No existing expectation changed. `inputId` values in existing tests are
unchanged: `sweep.test.ts` compares observer identities with an independently
transcribed batch recipe, and those tests pass unmodified.

## Audit remediation

The cucumber-viz commit audit of `e2f6e8e` (full suite, parallel, under load) failed two tests. The audit of `fbde665` had passed. Both are fixed in a follow-up commit.

### HO-4 observer case timeout

`input-list.test.ts` "HO-4 input-list-invalidated: reports, promotion, local and structural updates equal a fresh acquisition" took 5,040 ms against Vitest's 5 s default. It acquires a new observer after each of its ten steps as the fresh rebuild, which takes about 0.7 s alone and longer under a loaded parallel run.

**Fix.** Every test in the file now carries an explicit `timeout` of 60,000 ms, declared once at the top. The owner's other slow acquisition tests do the same (`resolve-root.test.ts:33`, `:59`). No assertion changed. The fresh acquisition per step is the independent oracle HO-4 asks for, so the test was not made cheaper by dropping steps.

### Worker heap exhaustion at 16 MiB

`session-worker.test.ts` "turns an actual worker heap exhaustion into an unavailable resource-limit report" opened a session instead of reporting heap exhaustion.

**Cause: a pre-existing threshold flake, not a change in allocation.** The test opens this fixture with `workerHeapMiB: 16` and expects V8 to terminate the worker. A temporary probe test (not committed) opened the same fixture repeatedly through `observedOpen` at several heap limits:

| Build and conditions | Heap (MiB) | Exhausted | Opened |
| --- | ---: | ---: | ---: |
| `fbde665` sources, alone | 16 | 3 | 1 |
| `fbde665` sources, alone | 18 | 1 | 3 |
| `fbde665` sources, alone | 22 | 2 | 2 |
| This iteration, alone | 16 | 3 | 0 |
| This iteration, alone | 18 | 1 | 2 |
| This iteration, alone | 12 / 14 | 15 / 15 | 0 / 0 |
| This iteration, beside both owner test directories | 16 | 10 | 2 |
| This iteration, beside both owner test directories | 12 | 12 | 0 |
| This iteration, alone | 10 | 8 (4 before `ready`) | 0 |
| This iteration, alone | 8 | 8 (all before `ready`) | 0 |

The base build also opened at 16 MiB. The outcome between 16 and 22 MiB depends on garbage-collection timing, so the iteration 1 audit passing was luck, not margin. The worker's peak open-time heap is dominated by startup and compiler work, not by the observed-input list. Iteration 2 does not move the threshold measurably.

**Fix.** The test uses `workerHeapMiB: 12`. That limit exhausted all 39 sampled opens, alone and under load. Every one exhausted after the worker posted `ready` and started its compiler child. At 10 MiB and below, some opens exhaust during bootstrap, which the separate 1 MiB case already covers. The test now also asserts that a `ready` message with `oldGenerationMiB === 12` arrived. That keeps it distinct from bootstrap failure and slightly strengthens it. All previous assertions are unchanged.

### Remediation verification

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/src/tests/session-worker.test.ts -t "turns an actual worker heap exhaustion"`, five times | 5 of 5 passed |
| `npx vitest run subs/analysis/src/tests/session-worker.test.ts`, twice | 16 of 16 passed, both runs |
| `npx vitest run subs/analysis/src/tests` concurrently with `npx vitest run subs/analysis/subs/project/src/tests` and the heap probe (load average 6.7) | 208 passed (207 plus the probe) and 135 passed |
| `npx vitest run subs/analysis/src/tests` alone, after removing the probe | 11 files, 207 passed |
| `npm run type-check` | Passed |
| `git diff --check` | Clean |

## Deviations and limits

- **Lazy hashing.** Hashes are recorded at the first read after a mutation, not
  eagerly inside the mutation. The result is identical, and a burst of
  mutations to one observation costs one hash.
- **Whole-list re-sort.** A mutation drops the whole sorted list. The next read
  re-sorts every recorded entry, which is O(n log n) non-allocating comparisons
  with no hashing. Incremental insertion was not needed for exactness and was
  not attempted.
- **Observer caches after a mutation.** `#merged` and `#recordedId` keep at
  most one list and one identity until the next read, even after a capture
  mutation. The capture drops its own list on every mutation. Structural
  rebuild and dispose drop both observer caches. Published revisions already
  retain their own lists, so this is bounded and is not a leak.
- **Other copies of `byteOrder`.** The analysis owner keeps its own allocating
  copies in `subs/analysis/src/report.ts:17` and
  `subs/analysis/src/inventory.ts:11`. `draftReport` sorts `inputs` with the
  first on every publication (`subs/analysis/src/session-facts.ts:226`). The
  input is already sorted, so that is about n comparisons. Sharing the project
  comparator would need an exposure line, which this plan forbids adding.
  Iteration 3 (publication) can decide whether that sort matters.
- **Sweeps.** A sweep (`Capture.changes`) still re-hashes every read file
  against disk. The analysis names reuse of recorded hashes there as a later
  step; it is out of scope.
- **Identity contract.** The two caller short-circuits depend on a
  `ProjectObserver` returning the same frozen list object while nothing
  changed. That holds for the only implementation. It is not written into the
  port's type.

## Handoff

For iteration 4, which validates root reuse against the configuration
dependencies the observer holds:

- **Invalidation contract.** Within `analysis/project`, `Capture.version` and
  `ReportedObservations.version` advance on every change to what `inputs`
  reports. Within one capture object, an unchanged version means an identical
  `Capture.inputs` list object. The observer's `inputs` is the same object
  while the capture object, both versions and the pending reports are
  unchanged. Its `inputId` is unchanged while the list and inventory objects
  are unchanged. Versions are cache keys and evidence, not identities: a rebuild
  creates a new capture whose version restarts, so compare the capture object
  too, as `#merged` does.
- **Owner API.** These are owner-local members, not port members:
  - `Capture.inputs` returns a cached, frozen list, and entries are shared
    across lists.
  - `Capture.version`.
  - `Capture.digest(path)` returns the recorded hash, without re-hashing.
  - `Capture.recorded(path)`.
  - `ReportedObservations.version`.

  Any new writer of an observation's `role`, `bytes`, `entries` or `exactName`
  must use `#assign`. Any addition to or removal from `#observations`, and any
  change to `root`, must call `#changed()`.
- **Configuration dependencies.** The observer holds
  `#configuration: RetainedConfiguration` (`observer.ts:39`, set at `:51`
  and replaced at `:383`). Its `dependencies` are `CapturedInput` entries taken from
  `capture.inputs` at acquisition (`configuration.ts:152-153`). They have the
  `configuration`, `directory` and `absent` roles, plus `dependency` with bytes.
  Its `key` hashes `[root, config, path/role/sha256]`. A current check is a
  cheap lookup by `path` in `observer.inputs`, comparing `role` and `sha256` as
  `acquireConfiguration` does at `configuration.ts:143-146`. Note that
  `acquireConfiguration` replays the recorded observations first, so the
  entries it compares are fresh from disk. `observer.inputs` reflects disk only
  as of the last apply, promotion or refresh, not a new stat. Neither
  `#configuration` nor its dependencies are on the `ProjectObserver` port.
  Iteration 4 must add a port member or an owner-exposed function to make them
  observable to `analysis` or `daemon/contexts`. Adding an exposure line would
  conflict with the plan's "no exposure line" rule unless it goes through an
  existing exposed export such as `observeProject`'s observer type.
