# Iteration 6 results: identity-aware fact accounting and a shared model

**Recorded:** 2026-09-21. **Status:** complete. A follow-up to
[iteration 5](iteration5-results.md), authorized by Dan as direct work on the
same branch. It implements two changes and re-measures SC23 and SC25. **SC23
now passes on every row of both fixtures**, X100's deleted row included.
**SC25's `factBytes` budget passes under the identity metric** that now defines
`factBytes`; under the serialized metric of iteration 5 the growth is unchanged
and still over budget. SC24's description stage and SC26's harness pins are
outside this iteration and remain as iteration 5 records them. No budget number
changed.

Direct work in `/tmp/ramify-plan8-signature-companions`, branch
`feat/plan8-signature-companions`, on iteration 5's `dc9dd01`. Pre-plan values
come from a temporary detached worktree at `6dd9b4c`, and iteration 5's build
from one at `dc9dd01`. Both measured the same fixture copies with the same
scratch harness and were removed afterwards.

## Scope

Only these two changes, as assigned:

1. **Identity-aware retained-fact accounting.** `factBytes` counts each distinct
   object once, and the session counts the candidate jointly with every
   retained version, for the publication limit, the session status and
   therefore context eviction.
2. **Structural sharing with no output change.** The linked layer holds the
   model itself, the model is patched once for moved declarations, and
   decisions refer to the model's frozen originals.

Not done, as instructed: sharing model sub-objects with the catalog,
`SourceArea` canonicalization and interning by key.

## 1. Identity-aware accounting

`FactLedger` in `subs/analysis/src/session-facts.ts` counts every distinct
object reachable from the retained roots by its own serialized bytes: its
brackets, separators, keys and primitive members, with each object member
counted as an object of its own. Facts that share no object therefore count
exactly their `JSON.stringify` length, and a frozen object shared between
versions or parents counts once. A new unit test pins both properties.

The ledger keeps one packed entry per counted object, its own bytes and a
reference count, with an overflow map for counts beyond 2^21. Retaining a root
visits only objects not yet counted; releasing one visits only the objects no
other retained version reaches. The facts are frozen acyclic plain data, so an
object's bytes cannot change while it is counted.

`session-engine.ts`:

- `#publish` retains the candidate in the ledger and compares the joint total
  with `maxRetainedFactBytes`. A refused candidate is released again, so the
  current facts and their count remain. A failure after that point also
  releases it.
- `releaseRevision` releases the version's facts; `dispose` clears the ledger.
- `status().factBytes` is the ledger's total. The context manager reads it
  unchanged for eviction and the global budget.
- `Version.bytes` is removed. `factBytes(facts)` now returns the identity count
  of one fact set.

`memory-lifecycle.md` states the definition beside the limits table, and
`daemon.md` names the shared model in its retained facts.

## 2. Structural sharing

- **Linking.** `linkDescriptions` returned a JSON round trip of the whole
  result. `buildModel` already returns a deeply frozen copy that shares nothing
  with its input, so the valid result now keeps that model as `modelInput` and
  detaches only the selections. The invalid result is unchanged.
- **Session link.** `session-revision.ts` built the model a second time from
  `linked.modelInput`. It now uses `linked.modelInput` as the model, so
  `facts.linked.modelInput === facts.model`. `buildModel` is idempotent on its
  own output; the linking test asserts this.
- **Position patch.** `patchPositions` patched the model and the link input
  separately, the link input with uncanonicalized declarations. It now patches
  the model once and the linked layer refers to the patched model, as a relink
  would. On every recorded sequence the retained linked layer serialized
  identically before and after, so the old separate patch had produced equal
  content.
- **Decisions.** `explainImport` wrapped the model's original in `immutable()`.
  It now refers to the original when `frozenData` verifies it deeply frozen,
  acyclic, finite plain data in plain data properties; a verified object stays
  verified. Otherwise it copies as before. The decision object stays frozen
  and its key order unchanged.

The batch pipeline's second `buildModel` in `run-analysis.ts` is unchanged: it
retains no history, and its report copy already shares equal frozen subtrees.

### The invariant the copies protected

`immutable()` in the model and `detached()` in linking prevent retained data
from sharing a mutable object with a caller. Sharing a deeply frozen object
keeps that property: nothing reachable from it can change. The copy remains
wherever the property is not verified, as the new tests show:

- `decisions.test.ts`: a decision over a built model refers to the model's
  original; over a JSON copy of that model, or a model whose frozen original
  has a mutable member, the decision copies, and nothing of the caller becomes
  frozen.
- `frozen-data.test.ts`: unfrozen members, `NaN`, `undefined`, a `Date`,
  accessor, non-enumerable and symbol properties and a frozen cycle are all
  rejected.
- `linking.test.ts`: the valid result and its model are frozen, the model still
  shares nothing with the catalog, and rebuilding it gives an equal model.
- `session-revision.test.ts`: on the cold, position-patch and relink paths the
  linked layer is the model, and every decision's original is an original of
  the model it was decided against. A relink keeps unaffected decisions, which
  refer to the previous model's originals.

No existing test asserted a copy.

## Byte identity

Every output was compared with iteration 5's build over identical inputs.

| Evidence | Inputs | Result |
| --- | --- | --- |
| `ramify check --batch --format json` | Reference example, toolkit at `dc9dd01` and X100, one fixed copy each, same working directory | byte-identical apart from `runId`: 1,859,692, 24,767,739 and 16,082,778 bytes |
| `ramify check --format json` through a real daemon | The same | byte-identical apart from `runId` |
| Scratch session harness, in process | The reference example through 10 publications (cold, body, two position-only moves, signature, companion removal and restoration, description removal and restoration, created file), the toolkit through 4 (cold, position-only, body, description comment) and X100 through 5 (cold, companion removal and restoration, signature, position-only); 15 audits | Identical records: every revision without its timings, every current report, all 80 historical reports, every audit outcome (all `equal`), and the serialization of every published fact set, including the linked layer, model and decisions |

The harness omits only fields that differ between two runs of the same build:
`runId`, timings, and the stat-derived `sha256` and `inputId` of captured inputs.
Two runs of iteration 5's build gave identical records, and the final build's
record equals them byte for byte (SHA-256 `2db6f7f3…` for both).

## Measurements

The fact numbers come from a scratch Vitest harness that opens a retained
session in process on fixed copies, publishes a cold revision and eight
alternating edits, and captures each published fact set. It computes the
serialized size and the identity count with the same inlined ledger on every
build. On the final build, the session's `status().factBytes` after each
publication equals the harness's joint count exactly. Absolute values depend on
the copies' root path, so they differ slightly from iteration 5's daemon
figures; each comparison below uses one path.

### `factBytes` per version, cold open

| Fixture | Serialized, pre-plan | Serialized, final | Growth | Identity, pre-plan | Identity, iteration 5 build | Identity, final | Growth |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Reference example | 1,360,840 | 1,560,248 | +14.7 % | 1,197,315 | 1,354,846 | 1,071,248 | −10.5 % |
| Toolkit | 23,894,401 | 28,578,532 | +19.6 % | 20,936,078 | 24,846,913 | 18,792,376 | −10.2 % |
| X100 | 16,310,906 | 18,789,102 | +15.2 % | 14,563,059 | 16,294,211 | 13,210,129 | −9.3 % |
| S100 | 8,357,403 | 9,441,914 | +13.0 % | 7,143,098 | 7,930,547 | 6,408,437 | −10.3 % |

The serialized sizes are unchanged by this iteration, as byte identity
requires. The pre-plan identity column applies the new counting to pre-plan
facts, which still hold the duplicate model and decision copies.

### History totals, nine retained versions

The eight edits alternate: the reference example and X100 remove and restore a
companion exposure (the `description` path); the toolkit and S100 edit a
function body (the `unchanged-surface` path).

| Fixture | Sum of serialized sizes, pre-plan / final (iteration 5's limit count) | Joint identity count, pre-plan / iteration 5 build / final |
| --- | --- | --- |
| Reference example | 12,243,252 / 14,040,692 | 6,605,183 / 7,820,406 / 5,269,260 |
| Toolkit | 215,049,609 / 257,206,788 | 38,304,382 / 42,288,649 / 36,059,992 |
| X100 | 146,796,654 / 169,122,778 | 35,543,807 / 45,506,471 / 31,411,333 |
| S100 | 75,216,627 / 84,977,226 | 12,783,826 / 13,575,379 / 12,038,581 |

Under the old count the toolkit's nine versions exceeded the 96 MiB limit.
Under the new one, each later version adds about 2.2 MB on the toolkit and X100,
0.5 MB on the reference example and 0.7 MB on S100.

### Accounting cost

The publish stage, `timings.publish`, contains the report projection and the
accounting. Medians over the eight updates of the harness:

| Fixture | Cold, iteration 5 build / final | Update, iteration 5 build / final |
| --- | --- | --- |
| Reference example | 10.4 / 19.3 ms | 7.8 / 5.5 ms |
| Toolkit | 179.6 / 157.0 ms | 170.3 / 15.6 ms |
| X100 | 89.0 / 118.2 ms | 88.9 / 27.4 ms |
| S100 | 47.3 / 93.1 ms | 40.5 / 7.4 ms |

An update visits only its new objects, so it replaces a full serialization of
the facts at every publication. The cold open visits every object once and
costs up to 46 ms more than the serialization on S100, inside an open of
several seconds. The inlined replica in the harness took 3.2, 9.7, 30.0 and
3.7 ms per update, 2.5 to 9.2 ms to release a version, and 6 to 234 ms for a
full walk against 8 to 167 ms for `JSON.stringify`; the engine's packed
entries are faster than that replica.

The ledger costs heap: 37 to 44 bytes per counted object. Over iteration 5's
toolkit facts, 399,507 objects taking 56.8 MB of heap, it holds 14.7 MB; over
X100's, 331,499 objects and 40.3 MB, also 14.7 MB. On the plateau row below,
S100's median worker heap over the last hundred cycles rose from 53.5 to
65.5 MB and the reference example's from 29.9 to 31.4 MB, while S100's worker
RSS fell from 237.9 to 223.9 MB.

## SC23: hook latency

`npm run measure:fast -- --workload hook-latency-x100` and
`--workload hook-latency-reference`, installed executable and a real daemon,
twenty cycles a row, one measurement at a time. Medians end to end, in
milliseconds; the pre-plan and iteration 5 columns are
[iteration 5's](iteration5-results.md#sc23-hook-latency).

| Row | X100 pre-plan | X100 iteration 5 | X100 final | Reference pre-plan | Reference iteration 5 | Reference final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| body (racing) | 272 | 252 | 147 | 101 | 96 | 94 |
| source | 641 | 670 | 393 | 155 | 142 | 141 |
| description | 564 | 456 | 294 | 142 | 160 | 100 |
| README | 147 | 144 | 92 | 96 | 98 | 92 |
| created | 767 | 852 | 652 | 557 | 509 | 347 |
| deleted | 717 | **4,237** | **654** | 590 | 551 | 353 |
| configuration (not checked) | 94 | 96 | 94 | 101 | 119 | 94 |
| signature | 194 | 499 | 345 | 456 | 464 | 303 |
| companion | 350 | 518 | 293 | 162 | 154 | 94 |
| published | 92 | 91 | 90 | 112 | 103 | 90 |

**SC23 passes on every row.** All 200 cycles of each workload took their
expected revision path; no publication reached the retained-fact limit. Both
workloads pass every predicate, and `verify-fast-evidence.mjs` passes on both
archives. X100's settled `factBytes` peaked at 92.7 MB (88.4 MiB) in the
configuration row, against 96 MiB: each background broad revision describes
every file afresh and so shares little with the versions before it. Its median
there was 53.1 MB, and 13.5 to 35.6 MB in the other rows. A longer run of broad
revisions can still reach the limit. The configuration row
is 0 ms above the pre-plan build on X100 and 7 ms below it on the reference
example, within SC23's 60 ms.

Other rows are faster too. Most of it is the publish stage above, which no
longer serializes the facts; on X100 it was 89 ms of every revision. The
remaining difference is not decomposed: it includes the removed second model
build and fewer copies to allocate.

## SC25: retained facts, plateau and many contexts

**`factBytes` meets its budget under the identity metric**: −10.5 % on the
reference example, −10.2 % on the toolkit and −9.3 % on X100 against the
pre-plan facts, within +5 %. Under the serialized metric that iteration 5
reported, the growth is unchanged at +14.7, +19.6 and +15.2 %; that metric no
longer defines `factBytes`, and this iteration does not reduce what
serializes. The companion facts still serialize in four layers and in each
decision; the retained heap holds the model and its originals once.

**The plateau and many-contexts rows hold.**

- `I5-13:repeated-edit-plateau`: passes. Over the last 100 of 200 cycles, the
  combined RSS grew 12.4 MB on the reference example and 0 on S100, within
  64 MiB; worker heap growth beyond history was 0 and 11.2 MB, within 16 MiB.
  S100's figure is the difference between the first and last sample of a heap
  that ranged from 57.2 to 77.0 MB with no trend, where iteration 5 measured 0.
  The only ideal miss, the reference example's compiler server RSS of 252.2 MB
  against 192 MiB, is present on every build.
- `I5-13:hot-warm-memory`: passes. Combined RSS is 1,379 MiB of 1,536 MiB, and
  the hot reference context retains 1,072,303 bytes of facts.
- `I2-29:many-contexts`: passes all its predicates. Settled RSS is 131.6 MiB of
  1,024 MiB, global retained bytes 49.2 MiB of 512 MiB, and 6,412,691 bytes of
  facts per context. Iteration 5 recorded 131.4 MiB, 72.3 MiB and 9,447,268.

## Tests adjusted

- `session-revision.test.ts`, the retained-fact budget test. It set
  `maxRetainedFactBytes` to twice the cold facts less one, relying on a README
  edit's candidate adding a whole second copy. Counted jointly, the candidate
  adds only its new objects, so that limit no longer refuses it. The limit is
  now exactly the cold facts: the cold open fits, and any candidate that adds an
  object is refused. The test still proves that the limit refuses the
  candidate with `resource-limit`, publishes nothing, keeps the current facts,
  revision and report, and leaves `factBytes` unchanged.
- Added: `fact-ledger.test.ts`; the shared-model test in
  `session-revision.test.ts`; the decision-original tests in
  `decisions.test.ts`; `frozen-data.test.ts`; the frozen, idempotent model
  assertions in `linking.test.ts`.

The other tests that read `factBytes` compare it relative to itself: warm
equals hot, a release lowers it, a query leaves it unchanged, disposal returns
it to 0. They pass unchanged, as do `plan5-hosting-cases` and
`fast-assertions.mjs`.

## Checks run

- `npm run type-check` and `npm run build`: pass.
- Focused suites, each as its own `npx vitest run`:

| Suite | Files | Tests | Result |
| --- | ---: | ---: | --- |
| `subs/analysis/src/tests` | 34 | 392 | pass |
| `subs/analysis/subs/project/src/tests` | 9 | 160 | pass |
| `subs/analysis/subs/typescript/src/tests` | 19 | 215 | pass |
| `subs/analysis/subs/model/src/tests` | 11 | 226 | pass |
| `subs/analysis/subs/descriptions/src/tests` | 4 | 193 | pass |
| `subs/daemon/subs/contexts/src/tests` | 12 | 167 | pass |
| `subs/daemon/src/tests` | 20 | 235 | pass |
| `subs/cli/src/tests` | 7 | 205 | pass |
| `src/tests` (the filter matches every `src/tests` directory: 165 files) | 165 | 2,227 | **3 fail** |

  The three failures are iteration 5's pins of the pre-plan reference example,
  with the same assertions: `dependency-analyzer-process.test.ts`, BD24 and
  BD28.
- `npm run check:self` through the daemon and with `--batch`: 15 owners, 434
  source files, 6,499 accesses, 0 errors, 10 analysis limits, 4,531 allowed,
  0 denied. The reference example, resident and batch: 15 owners, 54 source
  files, 298 accesses, 0 errors, 2 warnings, 11 analysis limits.
- `npm run reference:verify -- --plan 5 --iteration 8`, which includes the
  `I5-08` hosting cases that read `factBytes` and the `I5-06` and `I5-07`
  decision, position-refresh and audit cases: 58 of 61 required instances pass.
  The three failures pin the pre-plan reference example, 294 accesses where it
  now has 298 and no `exposed-without-companion` finding:
  `I5-01:namespace-lazy-equal`, `I5-01:decide-indexed-equal` and
  `I5-06:export-removed-missing`. `--iteration 6` and `--iteration 7` give the
  same three failures. `--iteration 6` on iteration 5's build fails the same
  three, and three more because its temporary worktree had no installed
  dependencies for the reference example.
- The measurements above, archived under `scripts/measurements/results/` and
  indexed in `results/index.json`:

| Workload | Archive | Outcome |
| --- | --- | --- |
| `hook-latency-x100` | `fast-2026-09-21T17-40-41.970Z-5abd98bb-….json.gz` | passes; `verify-fast-evidence.mjs` passes |
| `hook-latency-reference` | `fast-2026-09-21T17-46-37.361Z-150faad2-….json.gz` | passes; `verify-fast-evidence.mjs` passes |
| `repeated-edit-plateau` | `fast-2026-09-21T17-51-02.351Z-76efb011-….json.gz` | passes; `verify-fast-evidence.mjs` passes |
| `hot-warm-memory` | `fast-2026-09-21T18-00-14.990Z-54dfc913-….json.gz` | passes; `verify-fast-evidence.mjs` passes |
| `I2-29:many-contexts` | `resident-2026-09-21T18-01-59.154Z-7c653d8c-….json.gz` | passes |

  The host was shared with other agent sessions and their daemons; load
  averages were 1.7 to 2.4 on 12 logical CPUs during the runs.
- The byte-identity and fact harnesses ran as temporary Vitest files in
  `subs/analysis/src/tests/` of each checkout and were removed; they are not
  committed.
- Not run: the full suite, S500, S1000, macOS, SC24's stage timings and the
  Plan 1 gate.

## Open items

1. **The serialized size still grows 13 to 20 percent.** Reports, audits and
   revisions are unchanged, so every retained layer still serializes the
   companion facts. Only a contract change, iteration 5's proposal 1, would
   reduce it. With identity counting it no longer limits retention.
2. **Ledger heap.** About 40 bytes per counted object, 12 MB on S100's
   plateau. Counting only objects with object members, and folding the rest
   into their parent, would reduce it but count a leaf shared without its
   parent more than once.
3. **SC24 and SC26** are unchanged: the description stage and the harness pins
   of the pre-plan reference example remain for Dan's decision, together with
   iteration 5's other open items. Iteration 5's proposal 2, evicting the oldest
   version before refusing a publication, is no longer needed for SC23 on X100.
