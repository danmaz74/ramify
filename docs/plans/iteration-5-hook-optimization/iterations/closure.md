# Plan 5 hook optimization: closure

**Date:** 2026-09-13. **Status:** implementation complete; the commit audit passes at
`7ebc4d1`. The [plan](../main-plan.md) delivered targets 0 to 5
and 7 of the
[optimization analysis](../../../analysis/fast-incremental-checks-optimization.md#ranked-targets).
Every matrix row has unit or process evidence below. Iterations 1 to 6 passed
the cucumber-viz commit audit. No real-process measurement ran, as resolved
decision 7 requires, so every latency figure in the analysis is still
pre-optimization.

## Delivered targets

| Target | Iteration | Results |
| --- | --- | --- |
| 0 Timing fields and watcher timestamps | 1 | [iteration 1](iteration1-results.md) |
| 1 Maintained observed-input list | 2 | [iteration 2](iteration2-results.md) |
| 2 Publication builds only what a revision keeps | 3 | [iteration 3](iteration3-results.md) |
| 3 Reused project-root resolution | 4 | [iteration 4](iteration4-results.md) |
| 4 Queued racing hooks answered on publication | 5 | [iteration 5](iteration5-results.md) |
| 5 Build-time runtime identity and compiled client binding | 6 | [iteration 6](iteration6-results.md) |
| 7 Compiler RSS sampling without a process per worker message | 7 | [iteration 7](iteration7-results.md) |

Iteration 7 also fixed the self-check defect, updated the racing measurement
assertion and completed the Plan 5 contract text.

## Matrix evidence

Line numbers are at the closing commit.

| Row | Test file and case |
| --- | --- |
| HO-1 `timing-fields` | `subs/analysis/src/tests/session-revision.test.ts:587` `timing-fields: an update reports its invocation check beside unchanged revision timings`; `subs/analysis/src/tests/session-worker.test.ts:397` `timing-fields: worker replies add the status checkpoint and daemon-side round trip beside the invocation check`; `subs/daemon/subs/contexts/src/tests/covering.test.ts:401` `timing-fields: a revision carries its capture's session work and a reply adds publication, zero when covered`; `subs/daemon/src/tests/ipc.test.ts:102` `timing-fields: a socket check reply carries session work, publication, service handling and client transport`; `subs/daemon/src/tests/codec.test.ts:164` `timing-fields: accepts a published revision whose capture carries session work and watcher times beside unchanged stage timings` with `:170` `rejects a revision without its capture or with malformed capture timings`; `subs/cli/src/tests/changed-command.test.ts:208` `timing-fields: the JSON document carries the reply timings only when the reply has them, and human output is unchanged` |
| HO-2 `watcher-timestamps` | `subs/daemon/src/tests/watcher.test.ts:146` `watcher-timestamps: each batch records its first event receipt and its flush on the injected clock`; `subs/daemon/subs/contexts/src/tests/context-manager.test.ts:141` `watcher-timestamps: the update a batch triggers carries its receipt and flush, spanning coalesced and restored batches` |
| HO-3 `input-list-cached` | `subs/analysis/subs/project/src/tests/input-list.test.ts:74` `HO-3 input-list-cached: repeated reads without a mutation return the cached list and identity without hashing` |
| HO-4 `input-list-invalidated` | `subs/analysis/subs/project/src/tests/input-list.test.ts:108` `HO-4 input-list-invalidated: every capture mutation advances the version and equals a fresh rebuild`; `:147` `HO-4 input-list-invalidated: reports, promotion, local and structural updates equal a fresh acquisition` |
| HO-5 `input-cache-no-leak` | `subs/analysis/subs/project/src/tests/input-list.test.ts:190` `HO-5 input-cache-no-leak: forgotten observations leave no cached entry` |
| HO-6 `byte-order-equivalent` | `subs/analysis/subs/project/src/tests/input-list.test.ts:219` `HO-6 byte-order-equivalent: the comparator orders every tested pair as Buffer.compare does`; the report copy at `subs/analysis/src/tests/report-publication.test.ts:128` `orders strings by UTF-8 bytes without encoding them, as Buffer.compare does` |
| HO-7 `publication-without-snapshot` | `subs/analysis/src/tests/report-publication.test.ts:59` `publication-without-snapshot: open and updates build, measure and copy no full report, and keep the fields a full finish() yields` |
| HO-8 `full-report-on-request` | `subs/analysis/src/tests/report-publication.test.ts:96` `full-report-on-request: a requested report equals batch and still fails over maxReportBytes where it is built`; `subs/cli/src/tests/changed-command.test.ts:243` `full-report-on-request: a resident JSON report equals the batch JSON report` |
| HO-9 `hook-passes-under-limit` | `subs/analysis/src/tests/session-revision.test.ts:396` `hook-passes-under-limit: publishes when only the full report exceeds maxReportBytes and keeps published facts when what a revision keeps exceeds it` |
| HO-10 `invocation-check-reused` | `subs/analysis/src/tests/root-resolution.test.ts:37` `invocation-check-reused: an update with the session invocation performs no root resolution` |
| HO-11 `root-resolution-reused` | `subs/analysis/subs/project/src/tests/resolve-root.test.ts:72` `root-resolution-reused: an equal request reuses a known resolution while every discovery query answers the same`; `subs/daemon/subs/contexts/src/tests/root-resolution.test.ts:8` `root-resolution-reused: reopening a known context with a live session performs no root resolution`; `:34` `root-resolution-reused: an opening, cold or evicted context resolves again` |
| HO-12 `root-resolution-invalidated` | `subs/analysis/subs/project/src/tests/resolve-root.test.ts:115` `root-resolution-invalidated: a configuration edit, a created or deleted candidate, membership or a moved root resolves again`; `subs/analysis/src/tests/root-resolution.test.ts:67` `root-resolution-invalidated: a configuration edit resolves again and a moved root is refused`; `subs/daemon/subs/contexts/src/tests/root-resolution.test.ts:66` `root-resolution-invalidated: changed discovery answers resolve again and a moved root opens its own context` |
| HO-13 `covered-on-publication` | `subs/daemon/subs/contexts/src/tests/covering.test.ts:212` `covered-on-publication: hooks queued during the watcher update are answered from its revision with no second update`; `subs/daemon/src/tests/session-counters.test.ts:78` `counts a hook covered on publication as a covered request with only the watcher update analysed` |
| HO-14 `uncovered-after-publication` | `subs/daemon/subs/contexts/src/tests/covering.test.ts:245` `uncovered-after-publication: a queued differing expectation runs an update, and a covered companion waits with it`; `:272` `uncovered-after-publication: %s pending at publication runs an update` (three cases); `:297` `uncovered-after-publication: a queued request from another invocation runs an update despite an equal identity`; `:314` `uncovered-after-publication: a queued path of a request that %s still runs, and a covered hook sharing it waits` (expired, cancelled) |
| HO-15 `advance-before-publish` | `subs/daemon/subs/contexts/src/tests/covering.test.ts:338` `advance-before-publish: a hook arriving after the session advanced and before publication waits and is answered from that revision`; `:375` `advance-before-publish: a hook arriving from the publication event before its capture ends is answered from it` |
| HO-16 `fingerprint-order` | `subs/daemon/subs/contexts/src/tests/tokens.test.ts:123` `fingerprint-order: createFingerprints output is unchanged with a non-serializing comparator` |
| HO-17 `build-identity-read` | `subs/daemon/src/tests/discovery.test.ts:115` `build-identity-read: selection reads the written identity and yields the key hashing yields` |
| HO-18 `mixed-build-detected` | `subs/daemon/src/tests/discovery.test.ts:146` `mixed-build-detected: a changed, missing or added runtime file after the build fails selection` |
| HO-19 `rss-sampling` | `subs/analysis/src/tests/rss-sampling.test.ts:30` `rss-sampling: Linux reads /proc for every status message and starts no process`; `:45` `rss-sampling: elsewhere a compiler is read when first reported, then at most once per interval in the background`; `:105` `rss-sampling: on the macOS path worker messages start no process until a new compiler or the interval` |
| HO-20 `docs-updated` | Review: the [analysis](../../../analysis/fast-incremental-checks-optimization.md) delivery note, status column and **Delivered** paragraphs for targets 0 to 5 and 7, each linking its results; measured figures unchanged and labelled pre-optimization |
| HO-21 `compiled-identity-bound` | `src/tests/compiled-client.test.ts:82` `compiled-identity-bound: refuses a package whose runtime identity differs from the embedded one` (process) |
| HO-22 `installed-identity` | `subs/daemon/src/tests/discovery.test.ts:175` `installed-identity: a copy without build modification times derives the hashing key and still detects changes` |

The existing session-equals-batch tests remained the exactness gate for resolved
decision 2 in every iteration.

## Contract clarifications

| Clarification | Where recorded | Iteration |
| --- | --- | --- |
| New durations sit beside `RevisionTimings` rather than inside it: `SessionUpdate.timings` (`OperationTimings`), required `ContextRevision.capture` (`CaptureTimings` with `WatchBatch`), optional reported `CheckOutcome.timings` (`ReplyTimings`), and an optional `batch` argument to the `WatcherPort` listener; the codec requires `capture` on every wire revision | [iteration 1](iteration1-results.md#schema-changes) | 1 |
| `ramify.check/1` `timings.reply` is optional and present only for a reported reply with timings | [iteration 3](iteration3-results.md#added-deliverable-a-reply-timings-in-ramifycheck1) | 3 |
| Resolved decision 3: publication keeps and bounds only the kept fields; a full report is built on request with its own size limit | [daemon and analysis](../../../architecture/daemon.md) | 3 |
| Resolved decision 5: `ProjectObserver.resolution` and optional `known` on `resolveProjectRoot`, `resolveProject` and `AnalysisDriver.resolve`; reuse validated by replaying the recorded discovery queries on disk | [Plan 5 contracts](../../iteration-5-fast-incremental-checks/contracts.md) | 4, text in 7 |
| Resolved decision 4: the covering rule is evaluated on arrival and on each publication | [daemon and analysis](../../../architecture/daemon.md#fast-incremental-checks) | 5 |
| Resolved decision 6: `dist/runtime-identity.json` (`ramify.runtime-identity/1`), the mixed-build check and its misses, required `EndpointSelection.buildIdentity`, optional `CliEnvironment.buildRefusal`, and the compiled client's `incompatible` refusal | [build binding](../../../architecture/optimization.md#build-binding), [iteration 6](iteration6-results.md#identity-file-format) | 6 |
| HO-19: supervision enforces no RSS limit; `SessionStatus.compiler.rss` is status evidence, at most 5 s stale where a read spawns a process | [iteration 7](iteration7-results.md#clarification-no-rss-limit-is-enforced) | 7 |
| "No exposure line is added" held, but three existing named relay lists each gained one name (`OperationTimings` in root R3, `ReplyTimings` in daemon N5 and root R7) | [iteration 7](iteration7-results.md#a-self-check-remediation) | 7 |

## Commit audits

| Iteration | Commit | cucumber-viz commit audit |
| --- | --- | --- |
| 1 | `fbde665` | PASS |
| 2 | `e2f6e8e` | FAIL: the HO-4 observer case timed out at 5,040 ms, and the 16 MiB worker heap exhaustion test opened instead of exhausting (a threshold flake) |
| 2 remediation | `dcc474b` | PASS: explicit 60 s timeouts in `input-list.test.ts`; the heap test uses 12 MiB and asserts `ready` |
| 3 | `51377cd`, following `2594125` | PASS |
| 4 | `8b04e27` | PASS |
| 5 | `fa6ee87` | PASS |
| 6 | `f2f24d8`, including the merged compiled client `b2bf082` | PASS |
| 7 | `2570788` (from `630da32`) | FAIL: two `descriptions.test.ts` reviewed-statement fixtures did not include the names item A added to root's R3 and R7 and daemon's N5 relays |
| 7 remediation | `7ebc4d1` | PASS; the fixtures and the Plan 5 owner manifest gain exactly those names, and the descriptions owner tests and type-check pass |

**Defect found after iteration 6.** The commit audit does not run
`npm run check:self`. On `f2f24d8`, the build and self-check failed with five
`not-visible` errors, introduced by iterations 1 and 4. Iteration 6 recorded
them but did not fix them. Iteration 7 fixed them in `630da32`, and the
self-check now passes with 0 errors. The plan's acceptance requires it, so
iteration 7's verification block now lists `npm run build` and
`npm run check:self`. The extended relay lists then failed the iteration 7
audit through the reviewed description fixtures, which the
[remediation](iteration7-results.md#audit-remediation) updated.

## Remaining gaps

Gathered from each iteration's results. None blocks a matrix row.

**Timing and attribution**

- A watcher-caused revision with no waiting request records no publication
  duration. Open and verify captures report zero session work (iteration 1).
- Host-side compiler RSS sampling is inside `service` but outside
  `workerRoundTrip`, and no field isolates it (iteration 1).
- The harness cannot tell a hook covered on publication from one covered on
  arrival after publication, because the CLI document has no freshness record
  (iteration 7).

**Input list and publication**

- A sweep still re-hashes every read file against disk (iteration 2, deferred).
- A mutation re-sorts the whole list (iteration 2).
- `inventory.ts` keeps an allocating comparator (iterations 2 and 3).
- The callers' identity short-circuits rely on the observer returning the same
  frozen list object, which the port's type does not state (iteration 2).
- `factBytes`, `assembleCoverage` and `inventoryCounts` still run on every
  publication (iteration 3).
- A refused publication builds the full draft once more (iteration 3).
- When only the snapshot exceeds `maxReportBytes`, a resident whole-project
  check receives a published revision whose report is the `incomplete` limit
  failure (iteration 3).
- Resident and batch JSON echo `request.project` keys in different orders
  (iteration 3).

**Root resolution**

- A reused resolution still replays its queries, proportional to the helper's
  enumerations (iteration 4).
- A created or deleted file in an enumerated directory re-resolves in both the
  daemon and the worker (iteration 4).
- An invocation refusal is projected as `internal-error` (iteration 4).
- A session updated from another working directory keeps its observer's
  `invokedFrom` and `selection`, unlike batch (iteration 4).

**Racing hooks**

- A hook that reaches `check` before the watcher's batch, or whose duplicate
  watcher event arrives during its update, still runs two updates (target 6).
- A path queued by a request that expired, was cancelled or was released still
  runs an update, and a covered hook sharing it waits (iteration 5).
- No test covers requests queued during a running idle audit being evaluated at
  its publication (iteration 5).
- Two publication-coverage conditions are each backed by another: the owner
  removal in `watchEvents`, and the background and watcher conditions. A
  mutation removing only one passes the tests (iteration 5).

**Build identity**

- The mixed-build check misses same-size changes that are not newer than the
  identity file, such as preserved-time copies or overlaid tarballs
  (iteration 6).
- The compiled client selects the endpoint twice on daemon commands, and
  selects one for batch. An unsafe `RAMIFY_ENDPOINT_DIR` therefore fails batch
  there (iteration 6).
- A manifest edited after the build is refused as `incompatible` rather than as
  a mixed build (iteration 6).
- A runtime file removed between listing and `lstat` fails with a raw `ENOENT`
  (iteration 6).

**Sampling and platforms**

- No macOS run. HO-19 drives the macOS path on Linux (iteration 7).
- A background `/bin/ps` still running at disposal is not awaited (iteration 7).

**Test environment**

- `subs/daemon/src/tests/connect.test.ts` needs a `dist/` build. Five cases
  failed without one in iterations 1 and 5, as they did on the base.

## Decisions for review

1. **Exposure relays.** Accept the three names added to existing relay lists
   as within "no exposure line is added", or require another shape
   (iteration 7).
2. **HO-19 wording.** Confirm that a bounded-staleness status sample satisfies
   the row, given that no RSS limit exists. Confirm the 5 s interval
   (iteration 7).
3. **Racing attribution.** Decide whether the successor should add freshness to
   the recorded racing evidence, or to the CLI document, to separate
   publication coverage from arrival coverage (iterations 5 and 7).
4. **Double selection.** Decide whether `ConnectOptions` should accept an
   established identity so the compiled client selects once (iteration 6).
5. **Owners outside the table.** Accept `cli` (iterations 3 and 6),
   `subs/daemon/src/service.ts` and `src/resident-assembly.ts` (iteration 4),
   and the root relay lists (iteration 7) as necessary pass-throughs.
6. **Report scope under the limit.** Accept that a resident whole-project check
   now receives a published revision with an `incomplete` report when only the
   snapshot exceeds `maxReportBytes` (iteration 3, as resolved decision 3
   states).

## Measurement successor

Real-process measurement follows this plan against the 2 s acceptable-time
budget:

1. The fast workloads on the reference and S100, focused runs first, then S500,
   S1000 and macOS.
2. Attribute each hook row with target 0's fields: `ramify.check/1`
   `timings.reply` (`invocationCheck`, `workerStatus`, `workerRoundTrip`,
   `publication`, `service`, `clientTransport`), `revision.capture` with its
   watcher `receivedAt` and `flushedAt`, and the stage timings.
3. The racing assertion accepts coverage on publication
   (`racingHookAttributed`). Record the daemon's `freshness.acknowledged`
   against `publishedAt` if arrival coverage must be excluded.
4. Decide target 6's batching and debounce values from the measured
   `flushedAt - receivedAt` and flush-to-capture intervals.
5. Take macOS memory figures from external process samples, not
   `status.compiler.rss`.
6. Replace the analysis's pre-optimization figures with measured ones and
   re-rank the remaining targets, the deferred sweep step and the smaller items.

Reference and S100 results: [measurement results](measurement-results.md).
