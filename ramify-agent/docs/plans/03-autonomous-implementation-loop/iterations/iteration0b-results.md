# Iteration 0B results: the ledger

**Date:** 2026-09-20. **Status:** complete. The [brief](iteration0b.md) is
satisfied: `harness/ledger` is declared, the two file primitives moved into it
with their tests, and transactions, replay, materialization, `RecordRead`,
external effects and `LedgerCorruptError` are implemented and tested, including
the real killed-writer test.

`npm run check:self` reports `ramify-agent/harness/ledger` as a sixth owner,
and the architect view records its `uses` as empty: the module receives
nothing, so "imports nothing from the harness" is enforced and not a
convention.

## 1. Baseline

Run from `ramify-agent/` before anything was changed. All four pass.

```text
=== npm run type-check ===
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json
EXIT: 0

=== npm test ===
 Test Files  21 passed (21)
      Tests  160 passed (160)

=== npm run build:web ===
 ✓ 287 modules transformed.
EXIT: 0

=== npm run check:self ===
Execution: completed; check: passed; coverage: complete
Completed scope: 5 owners, 73 source files, 3 resources, 776 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 478 allowed, 0 denied, 298 external
EXIT: 0
```

## 2. Architect view this iteration worked from

Refreshed with `node_modules/.bin/ramify materialize --view architect` after
the work, before any claim about the module tree.

| | Value |
| --- | --- |
| Revision | `rev/1:a01bbb9d-9596-435b-9c8b-bb3f0ec448d8:1` |
| Input identity | `input/1:c99571164688730e083fb8e7693519a9e5d03009675653255812d849fa659d48` |
| Modules | 6, 376 records, dependencies measured, production scope, detail cut 98 |

`ramify-agent/harness/ledger`: `uses` empty, `usedBy` `ramify-agent/harness`
with 5 behavioral references, 9 exposed symbols, purpose present.

Iteration 0 recorded that the revision UUID is fresh on every materialize and
that the input identity covers every directory listing, so neither value's
change is evidence of source drift on its own.

## 3. What was delivered

### The module

`subs/harness/subs/ledger/`, with the `module.ramify` the main plan gives,
unchanged, and a `README.md` whose first paragraph states its purpose.

- `src/atomic.ts` and `src/jsonl.ts`: moved from `subs/harness/src/store/`,
  byte-identical in content. `src/tests/store.test.ts` moved with them; only
  its three import paths changed.
- `src/ledger.ts`: `Transaction`, `RecordBody`, `LedgerEntry`, `RecordRead`,
  `RecordSchema`, `LedgerCorruptError`, `Ledger`, `openLedger`,
  `maximumLineBytes`.
- `src/effects.ts`: `EffectSpec`, `PendingEffect`.
- `src/fs.ts`: `LedgerFileSystem`, `LedgerFileHandle`, `nodeFileSystem`,
  `syncDirectoryThrough`. Internal to the module; see the deviations.

`store/lock.ts` and `store/state-directory.ts` stayed in the harness. The five
harness files that used the primitives changed their import path and nothing
else:

| File | New path |
| --- | --- |
| `subs/harness/src/jobs/log.ts` | `../../subs/ledger/src/jsonl.js` |
| `subs/harness/src/jobs/records.ts` | `../../subs/ledger/src/atomic.js` |
| `subs/harness/src/jobs/service.ts` | `../../subs/ledger/src/atomic.js` |
| `subs/harness/src/store/lock.ts` | `../../subs/ledger/src/atomic.js` |
| `subs/harness/src/store/state-directory.ts` | `../../subs/ledger/src/atomic.js` |

`subs/harness/module.ramify` needed no change: the harness receives the
ledger's parent exposures without declaring anything, and it re-exposes none
of them. `subs/web/`, `subs/harness/subs/agent/`, `src/` and `fixtures/` were
not touched.

### Behavior

- **One line is one transaction.** `append` serializes the event and every
  record body into one JSON line, writes it with a single `write`, flushes it
  with `datasync`, and only then resolves. The sequence is one more than the
  last and the time is assigned in `append`. Appends are serialized inside the
  ledger on one promise chain.
- **Refusals before anything is written.** A line over 8 MiB is a `RangeError`
  naming the bound; a record path that is absolute, names a directory, is the
  records root or resolves outside it is a `TypeError`. Neither reaches the
  file system.
- **A foreign sequence.** Before every append the ledger compares the log's
  size with what it last wrote. A difference is `LedgerCorruptError`: the
  project lock, which is the caller's, is what prevents two ledgers on one
  log; this only detects the failure.
- **On open**, a torn last line is truncated away. An invalid line anywhere
  else, a sequence out of order, a record path that escapes the records root
  or a line the caller's event schema rejects is `LedgerCorruptError`, with
  `path`, `line`, `reason` and the offending `text`.
- **Record files are materialized copies.** Each record body is written under
  `recordsRoot` with a temporary file, flush, rename and directory sync. A
  failure there is caught and not a failed transaction. `materialize` replays
  the log, rewrites every file that is missing or whose bytes differ, returns
  the paths it rewrote, and removes nothing it did not write.
- **`readRecord`** returns `valid`, `unsupported-version` with the schema the
  file declares, or `invalid` with one message per error and its path. A
  missing file is `invalid` with `the record file is missing`, never an absent
  record.
- **Effects.** `effect({ key, intent, perform, complete })` appends the intent,
  calls `perform(key)` and appends the completion with the result. A key whose
  intent is already in the log gets no second intent; a key whose completion is
  in the log returns the recorded result and performs nothing.
  `pendingEffects` lists intents without a completion.

## 4. Exit evidence

Every command was run from `ramify-agent/` after the work was complete. The
output below is verbatim except where a line is marked as elided.

```text
=== npm run type-check ===

> ramify-agent@0.0.0 type-check
> tsc --noEmit && tsc --noEmit -p subs/web/tsconfig.json && tsc --noEmit -p scripts/tsconfig.json

EXIT: 0

=== npm test ===

> ramify-agent@0.0.0 test
> vitest run

 RUN  v4.1.11 /ramify/ramify-agent

 Test Files  29 passed (29)
      Tests  209 passed (209)
   Duration  33.64s

=== npm run build:web ===

> ramify-agent@0.0.0 build:web
> NODE_ENV=production vite build --config subs/web/vite.config.ts

vite v8.3.0 building client environment for production...
✓ 287 modules transformed.
dist/web/index.html                   0.39 kB │ gzip:   0.26 kB
dist/web/assets/index-BVUPCXfX.css    6.25 kB │ gzip:   1.78 kB
dist/web/assets/index-DJ9mvXsL.js   430.38 kB │ gzip: 129.68 kB
✓ built in 203ms
EXIT: 0

=== npm run check:self ===

> ramify-agent@0.0.0 check:self
> ramify check --batch --root .

Root: /ramify/ramify-agent (given)
Configuration: /ramify/ramify-agent/tsconfig.json
Mode: batch
Execution: completed; check: passed; coverage: complete
Stages: registry=completed, acquisition=completed, parse=completed, catalog=completed, link=completed, access=completed, decide=completed, report=completed
Completed scope: 6 owners, 87 source files, 3 resources, 924 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 533 allowed, 0 denied, 391 external
EXIT: 0
```

Against the baseline: 5 owners become 6, 73 source files become 87, 776
accesses become 924, and the findings stay at zero with coverage complete. 160
tests become 209; the 49 new ones are the ledger's. The browser build is
unchanged at 287 modules, which is the evidence that nothing the web module
sees moved.

**The mapping job's behavior is unchanged.** The 160 tests that existed before
still pass, and the only edits outside `subs/harness/subs/ledger/` are the five
import paths in the table above.

### The ledger's own tests

Nine files, 56 tests, 6.3 seconds.

| File | Tests |
| --- | ---: |
| `ledger.test.ts` | 13 |
| `corrupt-log.test.ts` | 8 |
| `materialize.test.ts` | 8 |
| `effects.test.ts` | 7 |
| `record-read.test.ts` | 7 |
| `store.test.ts` (moved) | 7 |
| `fault-injection.test.ts` | 3 |
| `torn-line.test.ts` | 2 |
| `killed-writer.test.ts` | 1 |

The three tests the brief asked to report their coverage print it:

```text
fault-injection: 10 fault points in one append: write:/events.jsonl, flush:/events.jsonl,
  write:/records/run/.03.json.tmp, flush:/records/run/.03.json.tmp, rename:/records/run/03.json,
  directory-sync:/records/run, write:/records/plan/.01.json.tmp, flush:/records/plan/.01.json.tmp,
  rename:/records/plan/01.json, directory-sync:/records/plan
torn-line: 185 byte offsets covered across a 185-byte last line
killed-writer: 12 SIGKILLs, 0 of which left a torn last line; appends surviving each:
  77, 34, 46, 31, 51, 57, 56, 62, 62, 78, 39, 76; final version 681
```

The fault-injection test discovers the fault points by running the append once
through a counting file system, then repeats the whole scenario from the same
prior state once per point, failing that one operation. After each, a ledger
reopened on the real file system holds either the whole transaction or none of
it, `materialize` makes every record file match the log, and the next append is
accepted.

## 5. Guards owned

| Guard | Test | What it asserts |
| --- | --- | --- |
| The log is the authority, and a bad line is never an empty log | `subs/harness/subs/ledger/src/tests/corrupt-log.test.ts` | Eight cases: a line that is not JSON, a line that is JSON but not a transaction, a gap, an out-of-order sequence, a line the event schema rejects, an escaping record path, a truncated middle line and a wholly unparsable log. Each is `LedgerCorruptError` with its path, line, reason and text, and each asserts the log's bytes are unchanged, so nothing is silently shortened |
| A crash before a transaction's line leaves no trace; after it, every file is re-materialized | `fault-injection.test.ts` and `torn-line.test.ts` | Ten fault points, each failed in turn; 185 byte offsets of a torn last line, each reopening to the previous transaction with the torn bytes gone and the next append valid |
| A repeated external effect happens once | `effects.test.ts` | A failed effect leaves its intent pending; performing it again under its key appends no second intent and leaves exactly one intent and one completion; a completed key returns its recorded result and never performs again |
| A killed writer leaves a log that replays | `killed-writer.test.ts` | Twelve real `SIGKILL`s of a real writer process, each followed by a reopen that replays to dense, complete transactions, a `materialize` that makes every record file match, and an accepted next append |

No acceptance case is owned; the brief assigns none.

## 6. Deviations from the brief, with reasons

1. **`openLedger` takes two optional options the brief's signature does not
   list: `fs` and `now`.** The brief requires the file system to be injected so
   the fault tests are deterministic, but its `openLedger` snippet shows only
   the three required options. Both additions are optional and default to Node
   and the system clock, so the signature the brief gives is the one callers
   use.
2. **`LedgerFileSystem` is internal, not exposed.** The brief gives the
   module's `module.ramify` exactly, and it names no file-system type. The
   ledger's tests are same-owner, so they inject without an exposure, and the
   harness never needs the type. The primitives `atomic.ts` and `jsonl.ts` were
   required to move unchanged in content, so they keep their own direct use of
   Node; the ledger's internal atomic record write is therefore a second, small
   implementation of temporary file, flush, rename and directory sync written
   against the injected seam. That duplication is deliberate: without it there
   is no fault point to fail.
3. **`Ledger` gains `readRecord`, which the brief's interface listing does not
   show.** The brief requires reading a record to go through `RecordRead` and
   requires a test producing `unsupported-version` and `invalid`, but exposes
   no reader function and `module.ramify` names none. A method on `Ledger`,
   which is exposed, is the only way to satisfy both without changing the
   declaration. Its second argument is a `RecordSchema<T>`: the one schema
   literal the reader supports and a zod schema for the body. `RecordSchema` is
   not exposed either, and does not need to be: a caller passes an object
   literal and TypeScript infers it.
4. **`EffectSpec.intent` and `complete` are `Transaction<E>`, not bare
   events.** The brief says `effect` "appends the intent" and "appends the
   completion with the result"; since an append is a transaction, the three
   MVP effects can commit records with either end. A caller that commits no
   record passes `records: []`.
5. **`effect` records its result in the completion line.** The brief makes the
   key what turns a repeat into a no-op outside the harness. Recording the
   result makes `effect` itself idempotent for a key already completed, which
   is what a recovery loop that does not first consult `pendingEffects` needs.
   The consequence is that an effect's result must have a JSON representation;
   one that does not is a `TypeError`, with a test.
6. **The size bound and the escaping record path throw `RangeError` and
   `TypeError`, not a named error class.** The brief fixes the module's
   exposures and neither is a corrupt log, so `LedgerCorruptError` would be
   wrong and a new class would need an exposure the plan does not give. Both
   are standard, both carry a message naming the bound or the path, and both
   have tests asserting the class.
7. **The moved `store.test.ts` needed a temporary-directory helper of its
   own.** It used `subs/harness/src/tests/helpers/fixture.ts`, which the ledger
   may not import. `src/tests/helpers/temporary.ts` holds the same nine lines.
   The test bodies are unchanged.

## 7. What the next iteration must know

- **The harness receives the ledger's exposures without declaring anything.**
  Iteration 1 imports them as `../../subs/ledger/src/<file>.js` from
  `subs/harness/src/`, the same shape the harness already uses for `agent`.
  `subs/harness/module.ramify` still needs no statement for the ledger; the
  main plan's exposure tables stand as written.
- **Reading a record is `ledger.readRecord(path, { schema, body })`,** not a
  free function. The cross-cutting guard `harness/src/tests/record-reader.test.ts`
  is iteration 1's, over the harness's own reader; that reader should call this
  method rather than re-implement the three outcomes.
- **`commit.ts` has one thing to be a thin adapter over.** A job's version is
  `ledger.version`, its history is `ledger.replay()`, and a transition is one
  `append` whose `records` carry the job's record bodies. `RecordBody.path` is
  relative to `recordsRoot`, which for a run is
  `plans/<plan-id>/.harness/jobs/<run-id>/`, so the layout in the proposal is
  the path set the ledger materializes.
- **A record file's bytes are `JSON.stringify(body, null, 2)` with a trailing
  newline.** `materialize` compares exactly those bytes, so anything else that
  writes a record file would be rewritten on the next load.
- **The observation log does not go through the ledger.** Rule 1 of the
  proposal says so, and `appendJsonLine` and `discardPartialLine` are exposed
  from `jsonl.ts` for it.
- **`SIGKILL` alone does not tear a line.** Across 12 real kills and 681
  appends, none left a partial line: a `write` that has entered the kernel runs
  to completion, so a torn line needs a power loss or a kernel crash. That is
  why `torn-line.test.ts` writes the truncation by hand, at every byte offset,
  and why the killed-writer test reports the torn count rather than asserting
  one. Nothing above the ledger should assume a torn line is rare, and nothing
  should assume the kill test proves the torn path.
- **The two-writer detection is a size comparison, not a lock.** It fails the
  second ledger's next append; it does not prevent the first from having
  written. The project lock remains the caller's responsibility, and
  `store/lock.ts` is still the harness's.

## 8. Not done, with the reason

Nothing in the brief was left undone. Two limits are worth naming rather than
hiding:

- **A torn line was never produced by a real crash**, for the reason above. The
  torn path is covered by construction, at every byte offset, not by a process
  death.
- **The fault injection is at the ledger's own file-system seam,** so it covers
  a failing write, flush, rename or directory sync. It does not simulate a
  write that succeeds in the page cache and is lost at the device, which no
  test in this environment can produce.
