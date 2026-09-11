# Plan 2 executable instance inventory

**Status:** reviewed and revised 2026-09-11; all 176 identities and iteration
counts retained. Architecture acceptance is pending; no instance has executed.
This document freezes fixture causes and independent expectations; it does not
establish implementation availability or architectural acceptance. The
[main-plan matrix](main-plan.md#acceptance-matrix), the architecture's
[DA](../../architecture/daemon.md#acceptance-evidence),
[PC](../../architecture/processes-and-clients.md#acceptance-evidence),
[ML](../../architecture/memory-lifecycle.md#measurement-and-acceptance) and
[QT](../../architecture/quick-testing.spec.md#complementary-verification) cases,
the [reference contract map](../reference-project/contract-map.md) and Plan 1's
[instance inventory](../done/iteration-1-project-verifier/subcases.md) govern
these records. Passing one instance never passes an entire family.

## Membership and intermediate gates

Every `I2-NN:variant` row below is one execution record assigned to exactly one
implementing iteration. `npm run reference:verify -- --plan 2 --iteration N`
requires the instances assigned to N and every transitive prerequisite;
without `--iteration` every leaf is required, so the full gate is expected to
fail until iteration 14. Plan 1's 308 instance records remain registered and
are required by `--plan 1`; I2-30 `plan1-regression` runs that gate. The only
Plan 1 handler changes are the
[migration](main-plan.md#harness-implementation-and-evidence) that adds
`--batch` where a handler verifies the batch engine in its own process and
supplies a `connect` that fails if called, and the two tree-shape
expectations that migration revises (`self-cases.ts`'s literal owner list
becomes eleven; `relocation.ts`'s literal entry map becomes eight with
`./client`), backing `I1-27:self-check`, `I1-27:self-negative` and
`I1-28:relocated-package`; the other 305 records and expectations are
byte-untouched. `check` keeps its bare `ramify.analysis/1` document so those
handlers observe what they recorded.

| Implementing iteration | Direct prerequisites | New matrix groups |
| --- | --- | --- |
| 2 | 1 draft | I2-28 |
| 3 | 2 | I2-10, I2-11 |
| 4 | 3 | I2-05, I2-06, I2-07, I2-08, I2-12 |
| 5 | 4 | I2-01, I2-03, I2-04, I2-13 |
| 6 | 5 | I2-02, I2-09 |
| 7 | 5 | none; owner tests only |
| 8 | 7 | I2-14, I2-15, I2-16, I2-17 |
| 9 | 6, 8 | I2-20, I2-21, I2-22, I2-23, I2-24 |
| 10 | 9 | I2-19 |
| 11 | 10 | I2-25, I2-26 |
| 12 | 10 | I2-18, I2-27 |
| 13 | 10 | I2-29 |
| 14 | 11, 12, 13 | I2-30 |

## Fixture and evidence conventions

| Code | Fixture |
| --- | --- |
| R | Plan 1's reference copy: `examples/collection-review/` copied into a unique ignored `.reference-work/` directory, default registry, two configuration warnings expected. |
| F | Plan 1's three-owner fixture recipe (`fixture`, `provider`, `consumer`) at `scripts/reference-harness/fixtures/plan1/`, unchanged. |
| T | Copy of the migrated toolkit root, eleven owners. |
| S100, S500, S1000 | Synthetic owner fixtures materialized from the parameterized generator; S100 is byte-identical to the frozen hundred-owner map. |
| Q | Root's `createQuickEnvironment`: real engine and contexts, controlled watcher and clock, in-process connection through the production codec, over R or F. |
| M | Contexts unit fixture: `createContextManager` with a scripted driver, controlled watcher and controlled clock; no filesystem, engine or socket. The scripted driver returns `retained: null` for an incomplete report and a scripted `changed` list otherwise. |
| P | Real process fixture: the compiled daemon entry and installed `ramify` executable with `RAMIFY_ENDPOINT_DIR` set to a unique temporary directory; root's process tracing preload records connect, listen, spawn, exits and loaded modules. |
| H | The harness's own copied inventory and assertion stubs. |

Evidence kinds: `api` (direct analysis operations), `unit` (M), `quick` (Q),
`ipc` (real socket pairs in one process), `process` (P), `measurement`
(instrumented runs with retained raw results). A `process` or `ipc` row is
never satisfied by a `quick` run of the same scenario.

Edit sequences name Plan 1 statement IDs from the contract map: for example
W2 is `expose-sub createCatalogRouter, createCatalogTools, inspectRecord from
catalog to parent` and C1 is `expose-src * from "interfaces/vocabulary.ts" to
parent`. `remove-hop` means removing only `createCatalogRouter` from W2 and
`restore-hop` its exact restoration, as in I1-06. Each mutation asserts its
anchor occurs exactly once before writing. Comparisons with batch follow the
[comparison method](scope.md#batch-and-incremental-comparison). Every
sealed synchronized result asserts `freshness.verified`, `captureStarted >=
acknowledged` and the expected `reusedRevision`; unpublished incomplete
results assert `verified: false`. Every unit and quick row
asserts that no listener, timer, watcher handle, helper process or session
survives disposal.

## Required matrix subcases

| ID | Iteration | Families | Capability | Fixture | Evidence | Exact mutation or observation | Independent expectation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I2-01:cold-context | 5 | DA01, QT01, PC03 | daemon-service | Q/R | quick | Open the unchanged reference; wait for the first publication. | Revision 1 with `cause: 'open'`; `report` deep-equals the batch report except `runId`; 15 owners, complete coverage, two warnings. |
| I2-01:unavailable-capability | 5 | DA01 | daemon-service | Q/R | quick | Open with `browser-verification` in `setup.capabilities`. | `unsupported-setup`; no context created; ordinary browser tag matching still runs in the control open. |
| I2-01:unsupported-setup | 5 | DA01 | daemon-service | Q/R | quick | Open with `registry: 'custom'` and, separately, `scope: 'directory'` after coercion. | `invalid-request` for the scope; `unsupported-setup` for the registry; no silent default substitution. |
| I2-02:delayed-watcher | 6 | DA02, PC03 | daemon-service | Q/R | quick | Withhold watcher events; apply `remove-hop`; synchronized check. | The denial at root's `createCatalogRouter` import is reported from a capture after acknowledgment; published revision advances; the watcher never fired. |
| I2-02:expect-match | 6 | DA02 | daemon-service | Q/R | quick | As above with `expect` naming W's description and its new sha256; also request a path with no captured file/absence observation. | `reported`, `verified: true`, `reusedRevision: false` for the observed path; `unobserved-input` for the uncaptured path. |
| I2-02:expect-superseded | 6 | DA02 | daemon-service | Q/R | quick | `expect` names the pre-edit sha256 after the edit landed. | `superseded` with the observed identity; the captured revision is still published; no report under the stale expectation. |
| I2-02:provider-influence | 6 | DA02 | daemon-service | Q/R | quick | Keep root's importer bytes unchanged; edit only W2; delayed watcher. | The unchanged importer is rechecked and denied; the revision's `changed`, as the driver reports it, lists W's description only. |
| I2-03:two-worktrees | 5 | DA03 | daemon-service | Q/R×2 | quick | Two reference copies; apply `remove-hop` in one only; open both. | Isolated contexts with different `ContextId`; one revision has the denial, the other none; `declarations` differs and `registry`/`engine` agree; aggregate `inputId` also differs because it includes canonical scope. Compare source/configuration classes only with the same path labels. |
| I2-03:unknown-context | 5 | DA03 | daemon-service | Q/R | quick | Check with a fabricated `ContextId` and with a real id but foreign generation. | `unknown-context` and `expired-generation`; no other context's report is returned. |
| I2-03:same-root-reuse | 5 | DA03 | daemon-service | Q/R | quick | Open the same root and setup twice from two leases, with different cwd/root spellings and capability order; synchronize through each lease. | Second open returns `created: false` and the same token; each synchronized report equals batch for its own invocation facts except runId; closing one lease leaves the other lease and the context usable. |
| I2-04:concurrent-readers | 5 | DA04 | daemon-service | Q/R | quick | Ten `published` reads interleaved with an edit and publication. | Every reader receives a complete revision whose `fingerprints.inputId` matches its own report's `inputId`; no read mixes revisions. |
| I2-04:stale-publish-blocked | 5 | DA04 | daemon-service | Q/R | quick | Start a background analysis, then a second edit that supersedes it. | The first candidate publishes nothing; the published revision reflects the second edit; `counters.cancelledAnalyses` is 1. |
| I2-04:own-request-label | 5 | DA04 | daemon-service | Q/R | quick | Two synchronized requests with different `expect`, one matching and one not. | Each outcome carries its own `requestId`; the mismatching one is `superseded`; the matching one is `reported`. |
| I2-05:context-id-derivation | 4 | DA03 | contexts | M | unit | Open with `root` `/a/p` then `/a/q`; same setup. | Two `ContextId`s; equal setups with equal roots collide deterministically. |
| I2-05:branch-irrelevant | 4 | DA03 | contexts | M | unit | Same root with different `cwd` values and a driver reporting the same resolution. | One context. |
| I2-05:generation-on-reopen | 4 | DA15 | contexts | M | unit | Open, evict through the clock, reopen. | New `GenerationId`; the old token receives `expired-generation`. |
| I2-05:revision-monotonic | 4 | DA04 | contexts | M | unit | Five publications. | Sequences 1–5, revision ids embed the generation UUID. |
| I2-05:fingerprint-classes | 4 | DA15 | contexts | M | unit | Driver reports changed description, then source, then configuration inputs. | The corresponding class and aggregate inputId change each time; `registry` and `engine` stay constant. |
| I2-06:queue-order | 4 | DA04 | contexts | M | unit | Three synchronized requests acknowledged before any capture. | All three share the first capture started after the last acknowledgment, or receive later ones; outcomes arrive in acknowledgment order with their own ids. |
| I2-06:coalesce-background | 4 | ML04 | contexts | M | unit | Fifty watcher batches within the debounce window. | One background analysis with cause `watch`; the driver receives `changes` naming every distinct path once. |
| I2-06:cancel-request | 4 | DA04 | contexts | M | unit | Abort a synchronized request while its analysis runs. | `cancelled` under its id; the driver's control signal aborted; no revision published for that request. |
| I2-06:cancel-background | 4 | DA04 | contexts | M | unit | New events arrive while a background analysis runs. | The running analysis is aborted and publishes nothing; the next publication reflects the union of changes. |
| I2-06:wait-first-publication | 4 | DA04 | contexts | M | unit | `published` with `wait: true` before the first publication; another with `wait: false`. | The first resolves with revision 1; the second returns `pending` with `current` status. |
| I2-07:invalid-current | 4 | DA05 | contexts | M | unit | Driver returns an invalid report with null report.inputId but coherent retained.inputs and a retained inputId; repeat with unsealed invalid inputs. | Sealed invalid inputs publish with `outcome.execution: 'invalid'` and the retained input identity; `lastValid` remains the earlier header. Unsealed inputs are delivered unpublished with verified false. |
| I2-07:historical-last-valid | 4 | DA05 | contexts | M | unit | Check in either mode after the invalid publication. | The returned report is the invalid one; `lastValid` is available only in status and labelled by its own revision id. |
| I2-07:recovery-publishes | 4 | DA05 | contexts | M | unit | Driver returns a valid report next. | New revision; `lastValid` equals `published`. |
| I2-07:pending-before-publication | 4 | DA05 | contexts | M | unit | Status during `opening`. | `state: 'opening'`, `published: null`, `synchronization: 'initializing'`. |
| I2-08:lost-events | 4 | DA09 | contexts | M | unit | Watcher never fires; a synchronized request arrives. | The driver is called for the queued request; the published revision has `cause: 'request'`; status returns to `synchronized`. |
| I2-08:overflow | 4 | DA09, ML04 | contexts | M | unit | 10,001 distinct pending paths. | The driver receives `changes: null`; status shows `conservative` until publication. |
| I2-08:watcher-error | 4 | DA09 | contexts | M | unit | Watcher emits `error`. | `watcher: 'unavailable'`, `synchronization: 'watcher-unavailable'`; a synchronized request still succeeds; the manager reattaches the watcher after the next sealed reconciliation, including reuse. |
| I2-08:unwatched-dependency | 4 | DA09 | contexts | M | unit | Advance the controlled clock by `verificationIntervalMs` with the watcher silent; the scripted driver reports a changed `node_modules` declaration on that capture. | The driver is called with `changes: []`; the published revision has cause `verify` and `changed` naming that path; status is `reconciling` while the run is in flight and `synchronized` after publication; an unchanged capture at the next interval publishes nothing. |
| I2-08:debounce | 4 | ML04 | contexts | M | unit | Events at 0, 50 and 90 ms under the controlled clock. | One analysis starting at 190 ms. |
| I2-09:remove-exposure | 6 | DA06, E02 | daemon-service | Q/R | quick | `remove-hop` with the watcher active. | Root's unchanged import is denied with `not-visible`; the watch event carries the denial. |
| I2-09:repair-exposure | 6 | DA06, E02 | daemon-service | Q/R | quick | `restore-hop`. | The denial disappears from the next revision; summary counts return to baseline. |
| I2-09:tag-change | 6 | DA06, T03 | daemon-service | Q/R | quick | Add `ui` to catalog core's header. | Every core original gains `ui`; the feature adapter's imports of core values are denied for the missing importer tag; reverting removes them. |
| I2-09:move-to-testing | 6 | DA06, O03 | daemon-service | Q/R | quick | Move catalog core's private helper into its `src/tests/`. | Ordinary source that imported it is denied with `testing-origin`; moving it back removes the denial. |
| I2-09:wildcard-add | 6 | DA07, E07 | daemon-service | Q/R | quick | Add an export to C's `interfaces/vocabulary.ts`. | The expanded C1 and W1 contracts include the new name in the next revision without any description edit. |
| I2-09:wildcard-remove | 6 | DA07, E07 | daemon-service | Q/R | quick | Remove an exported vocabulary type that a consumer imports. | Consumer receives a `missing-export` error; contract shrinks. |
| I2-09:foreign-wildcard-invalid | 6 | DA07, E09 | daemon-service | Q/R | quick | Add a re-export of a catalog original to the vocabulary file. | The whole linked result is invalid with `foreign-original`; the revision is invalid; `lastValid` retained. |
| I2-09:type-to-runtime-merge | 6 | DA08, T03 | daemon-service | Q/F | quick | Consumer imports `Type` unmarked; then add `export const Type = 1` to `P/api`. | First revision records a type-only availability check for the unmarked import; the next revision records a value check for the unchanged importer, as DA08 requires; the fixture's untagged headers raise no tag denial. |
| I2-09:alias-identity | 6 | DA08, E05 | daemon-service | Q/F | quick | Replace the default export with `export { value as default }`. | The original identity is preserved across revisions; no new binding is invented. |
| I2-09:config-change | 6 | DA09 | daemon-service | Q/F | quick | Remove the `@provider/*` path mapping from `tsconfig.json` while a consumer uses it. | The access becomes `unresolved-target` coverage; restoring the mapping restores the decision; `configuration` fingerprint changed. |
| I2-09:shim-change | 6 | DA09, S04 | daemon-service | Q/R | quick | Edit the CSS-module declaration shim to remove an export name a consumer selects. | Located `missing-export`; resource identities unchanged. |
| I2-09:missing-file-appears | 6 | DA09 | daemon-service | Q/F | quick | Consumer imports `./later.js`; then create `later.ts`. | First `unresolved-target` coverage, then a checked decision; the `absent` observation drove the rerun. |
| I2-09:readme-edit | 6 | DA13 | daemon-service | Q/R | quick | Edit W's README paragraph. | New revision with only `metadata` and the report recomputed; `reused` lists the other stages; decisions unchanged. |
| I2-09:invalid-description | 6 | DA05 | daemon-service | Q/R | quick | Insert `expose-src Missing from "nowhere.ts" to parent` in K. | Invalid revision with the located `missing-file`; check outcome invalid; no permission answered from the previous model. |
| I2-09:invalid-recovery | 6 | DA05 | daemon-service | Q/R | quick | Remove the inserted line. | Valid revision; `lastValid` advances. |
| I2-09:resolver-failure | 6 | DA14 | daemon-service | Q/R | quick | Inject a read failure into the driver's acquisition for one revision. | `reported` with `published: false`, `revision: null` and the engine's incomplete report carrying the acquisition diagnostic; published revision and `lastValid` unchanged; status `reconciling`, then a fresh publication on the next request. |
| I2-10:null-changes-no-reuse | 3 | DA10 | increment | F | api | `analyzeIncrement` with `previous` and `changes: null`. | `reused` contains only `parse` and `metadata`; report equals batch. |
| I2-10:metadata-only-reuse | 3 | DA09 | increment | R | api | Edit a README; `changes` names it. | `reused` = configuration, parse, catalog, access, link, decide; report equals batch; no helper spawned. |
| I2-10:exposure-only-reuse | 3 | DA09 | increment | R | api | `remove-hop`; `changes` names W's description. | `reused` = configuration, metadata, catalog, access; parse of W's description, link and decide rerun; the denial appears; no source helper spawned. |
| I2-10:header-tag-rerun | 3 | DA09 | increment | R | api | Add `ui` to catalog core's header. | Area map changed; catalog and access rerun; `reused` = configuration only among compiler stages. |
| I2-10:source-rerun | 3 | DA09 | increment | R | api | Edit a source file. | catalog, access, link, decide rerun; configuration reused. |
| I2-10:configuration-rerun | 3 | DA09 | increment | F | api | Edit `tsconfig.json`. | Nothing but parse and metadata reused. |
| I2-10:absent-appears-rerun | 3 | DA09 | increment | F | api | Create a previously absent import target. | The `absent` observation is in the catalog set; catalog reruns; `changes` may name only the new file. |
| I2-10:dependency-rerun | 3 | DA09 | increment | R | api | Modify a captured dependency declaration file under `node_modules` in the copy. | catalog and access rerun even though `changes` did not name it, because the fresh capture's identity differs. |
| I2-10:products-plain | 3 | DA10 | increment | R | api | Inspect `RetainedAnalysis`. | Frozen, acyclic, JSON-round-trips to equal bytes; `bytes` equals its serialization length; no compiler, view or session reference. |
| I2-10:resolve-given | 3 | PC03 | increment | F | api | `resolveProject` with `root`. | Canonical real path, `selection: 'given'`, configuration path. |
| I2-10:resolve-found | 3 | PC03 | increment | F | api | From `subs/consumer/src`. | `selection: 'found'`, same root as `readProject` reports. |
| I2-10:resolve-outside | 3 | PC03 | increment | — | api | From a temporary directory with no description. | `unavailable` with `root-not-found`, as Plan 1's `readProject` classifies it; no subdirectory search; `invalid` is reserved for layout and description issues. |
| I2-10:resolve-no-configuration | 3 | PC03 | increment | F | api | Remove `tsconfig.json`. | `unavailable` with `configuration-not-found`. |
| I2-11:identical-inputs-equal | 3 | DA10 | increment | R | api | Six-step sequence: remove-hop, restore-hop, wildcard-add, README edit, source edit, revert; `analyzeIncrement` without `previous` after each. | Each report deep-equals `analyzeProject` except `runId`. |
| I2-11:reuse-equal | 3 | DA10 | increment | R | api | Same sequence with `previous` chained and `changes` named. | Same equality; `reused` nonempty at every step after the first. |
| I2-11:independent-negatives | 3 | DA10 | increment | R | api | The same sequence. | Step 1 denies root's import with `not-visible`; step 2 allows; step 3 expands C1; step 4 changes only purpose metadata; step 5 and 6 as authored. |
| I2-11:commonjs-module-target-limit | 3 | DA10, DA14 | increment | F | api | Consumer source contains `const api = require('../../provider/src/api.js')` targeting a module file. | Both `analyzeProject` and `analyzeIncrement` report the `unsupported-commonjs` coverage note at that access and no `testing-origin` denial; the two reports are equal except `runId`. |
| I2-11:declare-global-note | 3 | DA10, DA14 | increment | F | api | Provider module file gains a `declare global { interface Window { ramify: number } }` block. | Both operations report the `shared-global` coverage note located at the block; the two reports are equal except `runId`; the `typescript` owner's regression test asserts the note. |
| I2-12:history-count | 4 | ML02 | contexts | M | unit | Twelve publications with `maxHistoryRevisions: 8`. | Eight retained; the oldest are the dropped ones; `published` always retained. |
| I2-12:history-bytes | 4 | ML02 | contexts | M | unit | Reports of 10 MiB accounted bytes with `maxHistoryBytes: 32 MiB`. | At most three retained. |
| I2-12:global-bytes | 4 | ML03 | contexts | M | unit | Two contexts exceeding `maxRetainedBytesGlobal`. | History evicted oldest-first across contexts before any `resource-unavailable`. |
| I2-12:context-lru-eviction | 4 | ML03 | contexts | M | unit | Nine opens with `maxContexts: 8`, none leased. | The least recently active context is evicted with `context-evicted` `pressure`; reopening it gets a new generation. |
| I2-12:leased-not-evicted | 4 | ML03 | contexts | M | unit | All eight leased, ninth open. | `resource-unavailable`; no eviction. |
| I2-12:resource-unavailable | 4 | DA15 | contexts | M | unit | Retained bytes cannot fit after eligible eviction. | The requesting check is `unavailable` with `resource-unavailable`; no older inputs substituted. |
| I2-12:evicted-revision | 4 | DA15 | contexts | M | unit | Three publications with `maxHistoryRevisions: 2`; a `published` read naming revision 1's id. | `unavailable` with `evicted-revision`; the current revision is not returned in its place; status `history.oldest` names revision 2. |
| I2-12:retained-revision-exact | 4 | DA04, DA15 | contexts | M | unit | Two publications; a `published` read naming revision 1's id with `wait: true`. | `reported` with `published: true`, `revision.revision` equal to the requested id, that revision's report, `verified: false` and `captureStarted: null`; `wait` is ignored and revision 2 is not substituted. |
| I2-13:invalid-context-request | 5 | QT03 | daemon-service | Q/F | quick | Malformed token objects and unknown properties. | `invalid-request` before any context work. |
| I2-13:invalid-scope-request | 5 | QT03 | daemon-service | Q/F | quick | `scope: 'file'` and an `expect` list of 10,001 entries. | `invalid-request`. |
| I2-13:sync-throw | 5 | QT03 | daemon-service | Q/F | quick | Driver throws synchronously in `check`. | `unavailable` `analysis-failed`; the service survives; the context remains usable. |
| I2-13:async-failure | 5 | QT03 | daemon-service | Q/F | quick | Driver rejects asynchronously. | Same. |
| I2-13:dispose-cancels | 5 | QT03 | daemon-service | Q/F | quick | Dispose while a check and a subscription are active. | Check resolves `unavailable` `disposed`; listeners, timers, watcher handles and helpers are zero after disposal. |
| I2-13:unknown-operation | 5 | QT03 | daemon-service | Q/F | quick | Call an operation outside `ServiceOperation` through the direct channel. | `unsupported-operation`. |
| I2-14:framing-roundtrip | 8 | QT04 | ipc | Q/F | ipc | Every `WireMessage` type through a real socket pair. | Decoded messages deep-equal; `ServiceResult` values preserved. |
| I2-14:malformed-frame | 8 | QT04 | ipc | — | ipc | Zero length, truncated length, invalid UTF-8, non-object JSON. | `goodbye` `failure` where writable, then close; the host stays up. |
| I2-14:oversized-request | 8 | QT04 | ipc | — | ipc | A 1 MiB + 1 byte request frame. | Protocol violation and close; no partial dispatch. |
| I2-14:oversized-response | 8 | QT04 | ipc | Q/S100 | ipc | Lower `maxResponseBytes` below the report size. | `resource-unavailable` response; the connection survives. |
| I2-14:error-preservation | 8 | QT04, PC07 | ipc | Q/R | ipc | Denial, invalid description, an unpublished incomplete report, `unavailable` and `superseded` through the wire. | Each arrives in its original discriminant with `published` intact; none becomes a `ServiceError`. |
| I2-14:token-preservation | 8 | QT04 | ipc | Q/R | ipc | Open, check, status through the wire. | Tokens and revision ids equal the in-process values byte for byte. |
| I2-14:handshake-incompatible | 8 | DA15 | ipc | — | ipc | `hello` with `protocol: 'ramify.ipc/0'` and with a foreign `buildKey`; change an imported engine runtime file while the daemon entry stays byte-identical. | `reject` with code incompatible naming both versions, then close; the daemon keeps serving others. The runtime-file edit changes the group key. |
| I2-14:cancel-frame | 8 | QT04 | ipc | Q/R | ipc | `cancel` during a synchronized check. | The response is `cancelled` under the same id. |
| I2-15:connect-validation | 8 | PC09 | client | Q/F | ipc | `connectDaemon` then an invalid request. | The same `invalid-request` the quick binding returns. |
| I2-15:lease-release-on-close | 8 | PC09 | client | Q/R | ipc | Subscribe, then `close()`. | Daemon subscription count drops to zero before `close` resolves. |
| I2-15:abrupt-host-loss | 8 | PC09 | client | P/R | process | A child process subscribes, then is killed with SIGKILL. | The daemon releases the lease within `leaseMs`; other clients unaffected. |
| I2-15:client-entry-lightweight | 8 | PC09, ML01 | client | P | process | Import `ramify.ts/client` in a traced empty process. | No analysis, contexts, daemon host, compiler, React or d3 module loaded; RSS within budget. |
| I2-16:ordering-per-context | 8 | QT04 | ipc | Q/R×2 | ipc | Two contexts publishing alternately to one subscriber. | Per-context sequences increase; connection `seq` increases. |
| I2-16:coalesce-replaceable | 8 | ML04 | ipc | Q/R | ipc | Pause the client's reads during ten publications. | The resumed client receives one `revision-published` with `coalesced: 9` carrying the newest header; a `published` read naming that revision returns its report. |
| I2-16:non-replaceable-kept | 8 | ML04 | ipc | Q/R | ipc | Evict the context while the client is paused. | `context-evicted` is delivered after the coalesced revision. |
| I2-16:slow-consumer-disconnect | 8 | ML04, QT07 | ipc | Q/S100 | ipc | Never read; lower `maxOutboundBytes` to 8 MiB. | `goodbye` `slow-consumer` attempted, socket destroyed, lease released, counters incremented. |
| I2-16:reconnect-no-replay | 8 | ML04 | ipc | Q/R | ipc | Subscribe, drop, publish twice, reconnect and subscribe. | `replay: 'not-available'`, `current` names the newest revision; no old events. |
| I2-17:simultaneous-start | 8 | PC02, QT05 | daemon-process | P/F | process | Eight clients call `connectDaemon` at once with no daemon. | One daemon process, one record, all eight connected to the same `instanceId`. |
| I2-17:stale-record | 8 | PC02 | daemon-process | P | process | Write a `running` record with a dead pid and a dangling socket. | The next client cleans up under the lock and starts a daemon. |
| I2-17:stale-lock | 8 | PC02 | daemon-process | P | process | A lock older than 30 s with a dead pid, then an equally old lock with a live holder. | Dead holder: removed and startup proceeds. Live holder: not removed or replaced; bounded wait returns unavailable. |
| I2-17:already-running-exit | 8 | PC02 | daemon-process | P | process | Spawn the daemon entry twice. | The second exits with code 3 and leaves the record untouched. |
| I2-17:directory-ownership | 8 | PC02 | daemon-process | P | process | Endpoint directory with mode `0755`. | `unavailable` naming the permission problem; nothing spawned. |
| I2-18:idle-exit | 12 | PC06, QT05 | lifecycle | P/R | process | Daemon with `idleExitMs: 2000`; check; a direct client keeps a bare connection open with no subscription or request; wait. | Process exits although the bare connection is open; that client receives `goodbye` `idle-exit` and its `recover('automatic')` returns `stopped` with the record; record `stopped` `idle`. |
| I2-18:restart-after-idle | 12 | PC06 | lifecycle | P/R | process | Then `ramify check`. | A new daemon starts; the context has a new generation; result equals the previous. |
| I2-18:crash-recovery | 12 | PC06, DA15 | lifecycle | P/R | process | SIGKILL the daemon during a watch and during a check. | The watch reconnects or restarts within 20 s and prints a `stopped`-free reconnect notice; the check restarts and completes; both see new generations. |
| I2-18:explicit-stop | 12 | PC06 | lifecycle | P/R | process | `ramify daemon stop` during a watch. | The watch prints `stopped: explicit` and exits 2 without restarting; record `explicit` with the stop's `requestId`. |
| I2-18:missed-stop-notification | 12 | PC06 | lifecycle | P/R | process | SIGSTOP the watch client, stop the daemon, SIGCONT. | The client reads the record and reports `stopped: explicit`; no restart. |
| I2-18:new-command-after-stop | 12 | PC06 | lifecycle | P/R | process | `ramify check` after the explicit stop. | Starts a daemon; the previous watch stays stopped. |
| I2-18:watch-lease-prevents-idle | 12 | PC06, ML07 | lifecycle | P/R | process | Watch open beyond `idleExitMs: 2000`. | No exit while the watch runs; exit two seconds after it ends. |
| I2-18:incompatible-bounded | 12 | DA15, PC06 | lifecycle | P | process | A client presenting a foreign protocol version. | One rejection, no retry storm, no start. |
| I2-19:daemon-entry-boundary | 10 | PC01, ML01 | cli | P/R | process | Trace the daemon entry's loaded modules through a check. | No `cli`, `presentation`, `layout`, React, d3, MCP or web module; the TypeScript package appears only in helper children. |
| I2-19:cli-check-boundary | 10 | PC01 | cli | P/R | process | Trace `ramify check` served by a daemon. | The CLI process loads no `src/batch.js`, analysis or compiler module and opens no listener. |
| I2-19:help-version-unchanged | 10 | PC01 | cli | P | process | `--help`, `--version`. | Plan 1 assertions hold; no connect, spawn or listen. |
| I2-19:status-no-start | 10 | PC01 | cli | P | process | `ramify daemon status` with no daemon. | Reports not running, exit 0, spawns nothing, loads no engine. |
| I2-19:batch-no-daemon | 10 | PC01 | cli | P/R | process | `ramify check --batch` with no daemon. | No daemon connect or daemon spawn (finite compiler helpers remain permitted); `Mode: batch` in human output; the JSON document is byte-for-byte Plan 1's. |
| I2-20:human | 9 | PC03, DA01 | cli | P/R | process | `ramify check` inside the copy. | Plan 1 human lines plus `Mode: resident` with context, revision and `synchronized`; exit 0. |
| I2-20:json-bare-report | 9 | PC03 | cli | P/R | process | `--format json`. | One `ramify.analysis/1` document with no additional member; deep-equals the `--batch` document except `runId`; nothing else on stdout; stderr empty. |
| I2-20:exit-clean | 9 | QT01 | cli | P/R | process | Unchanged copy. | 0. |
| I2-20:exit-denied | 9 | QT01 | cli | P/R | process | `remove-hop`. | 1 with the located denial. |
| I2-20:exit-invalid | 9 | QT01 | cli | P/R | process | Invalid description. | 1. |
| I2-20:exit-unavailable | 9 | QT01 | cli | P | process | No compiler configuration. | 2 through the daemon; `Mode: resident (daemon <pid>; no context)` then the same `configuration-not-found` diagnostic as `--batch`; the JSON document equals the batch document except `runId`; `daemon status` shows no context. |
| I2-20:synchronized-after-save | 9 | PC03 | cli | P/R | process | Edit and immediately run `check` before the watcher can fire. | The result reflects the edit; `freshness.verified`. |
| I2-20:root-from-subdirectory | 9 | PC03 | cli | P/R | process | Run inside `subs/workspace/subs/catalog/src`. | Same root and `found` selection through the daemon. |
| I2-20:interrupt | 9 | PC04 | cli | P/R | process | SIGINT during a daemon-backed check. | Exit 130, cancel frame sent, no result claimed, daemon still running. |
| I2-21:stream-updates | 9 | PC04, QT01 | cli | P/R | process | `ramify watch`, then `remove-hop`, then `restore-hop`. | Status line, then a revision with the denial, then a revision without it; each revision's report was fetched by the event's revision id and its `inputId` matches the header's fingerprints. |
| I2-21:bounded-burst | 9 | PC04 | cli | P/R | process | 100 rapid edits. | Bounded number of revision lines; the final one matches a fresh check. |
| I2-21:interrupt-release | 9 | PC04 | cli | P/R | process | SIGINT the watch. | Exit 130; daemon subscription count zero within 1 s. |
| I2-21:json-lines | 9 | PC04 | cli | P/R | process | `--format json`. | One `ramify.watch/1` object per line, each embedding the report for revision events. |
| I2-22:status-none | 9 | PC01 | cli | P | process | No daemon. | `running: false`, `record: null`; exit 0. |
| I2-22:status-running | 9 | PC06 | cli | P/R | process | After a check. | Instance, one context, budgets and counters; exit 0. |
| I2-22:stop-running | 9 | PC06 | cli | P/R | process | `ramify daemon stop`. | Exit 0; record `explicit`; process gone within the daemon's 5 s grace, observed by the client's 7 s wait. |
| I2-22:stop-none | 9 | PC06 | cli | P | process | No daemon. | Exit 0 with `no daemon running`. |
| I2-22:stop-wrong-instance | 9 | PC06 | cli | P/R | process | A stop request naming another `instanceId` through the client. | `wrong-instance`; the daemon keeps running. |
| I2-23:check-fallback-visible | 9 | PC10, DA15 | cli | P/R | process | `RAMIFY_DAEMON_ENTRY` names a script that exits with code 1 before writing any record, so both coordinated starts fail within `startupMs` and automatic recovery is exhausted. | Human: `Mode: batch fallback (daemon unavailable: …)` on stdout; JSON: the bare batch document on stdout and the same fallback line on stderr; report equals batch; exit per report. |
| I2-23:stop-no-fallback | 9 | PC10, PC06 | cli | P/S1000 | process | `ramify daemon stop` while a cold `check` over S1000 is in flight; its analysis runs long enough (the 1,000-owner cold target is 90 s) for the stop to arrive first. | The check prints `Error [stopped]: daemon stopped explicitly (request …)` and exits 2; no `src/batch.js`, analysis or compiler module loaded in the CLI process; the JSON form is a `ramify.cli/1` envelope with code `stopped`. |
| I2-23:watch-no-fallback | 9 | PC10 | cli | P/R | process | The same exiting-entry failed-start fault as check-fallback-visible, with `ramify watch`. | Exit 2 with `unavailable`; no `src/batch.js`, analysis or compiler module loaded. |
| I2-23:client-no-fallback | 9 | PC10 | cli | P | process | `connectDaemon` from a traced host with `daemonEntry` naming the same exiting script. | `unavailable`; no engine loaded or spawned. |
| I2-23:fallback-disposes | 9 | ML07 | cli | P/R | process | The `check-fallback-visible` run under the same override. | Helpers, handles and sessions zero at exit; no listener. |
| I2-24:quick-check-flow | 9 | QT01 | cli | Q/R | quick | `runCli(['check','--format','json'])` with the quick connector; edit W2 between two runs. | Each document equals the backend revision's report; the human run's `Mode:` line names that context and sequence; second run shows the denial. |
| I2-24:quick-watch-flow | 9 | QT01 | cli | Q/R | quick | `runCli(['watch'])` with a controlled abort after two publications. | Two revision renderings, each fetched by the event's revision id; subscription released; exit 130. |
| I2-24:quick-watch-evicted | 9 | QT01, DA15 | cli | Q/R | quick | `runCli(['watch','--format','json'])` with `maxHistoryRevisions: 1`; a wrapped connector holds the report fetch for sequence 2 until sequence 3 has published. | The line for sequence 2 is `revision-evicted` with its header; the line for sequence 3 embeds its own report; no report is paired with another revision's header. |
| I2-24:quick-status-stop | 9 | QT01 | cli | Q/R | quick | `daemon status` then `daemon stop`. | Status document and stop acknowledgment; `onStop` disposition `explicit`. |
| I2-24:codec-in-direct-channel | 9 | QT03 | cli | Q/R | quick | Inspect the quick connector. | Every request and event passed through `encodeMessage`/`decodeMessage`; no shared object identity between client and service. |
| I2-25:reference-sequence | 11 | DA10 | equivalence | P/R | process | Ten steps: remove-hop, restore-hop, wildcard-add, wildcard-remove, README edit, header tag add, header tag revert, source edit, config edit, config revert; daemon check and `--batch` after each. | Reports equal except `runId` at every step. |
| I2-25:hundred-owner-sequence | 11 | DA10 | equivalence | P/S100 | process | Five steps on S100: exposure removal, README edit, source edit, testing-area move, revert. | Same equality. |
| I2-25:contracts-and-coverage-equal | 11 | DA10 | equivalence | P/R | process | Steps with an added `unsupported-loader` coverage note (a macro import target) and a wildcard growth. | Expanded selections and coverage arrays deep-equal. |
| I2-25:removals | 11 | DA10 | equivalence | P/R | process | Introduce then repair a denial and a coverage note. | Both disappear in daemon and batch alike. |
| I2-26:remove-hop-live | 11 | DA06, E02 | equivalence | P/R | process | Real `fs.watch`; `remove-hop`. | The watch shows the denial within the source-edit target; the check confirms. |
| I2-26:restore-hop-live | 11 | DA06, E02 | equivalence | P/R | process | `restore-hop`. | Denial gone. |
| I2-26:wildcard-growth-live | 11 | DA07, E07 | equivalence | P/R | process | Add a vocabulary export. | Contract expands; `changed` names only the source file. |
| I2-26:merge-live | 11 | DA08, T03 | equivalence | P/F | process | Merge a runtime binding into a pure type. | The unchanged unmarked importer's decision changes from a type-only availability check to a value check in both modes; no tag denial arises from the untagged fixture. |
| I2-26:testing-move-live | 11 | DA06, O03 | equivalence | P/R | process | Move a helper into `src/tests/`. | `testing-origin` denial appears for its ordinary importer. |
| I2-27:watch-exit-releases | 12 | PC04 | lifecycle | P/R | process | Watch ends. | Daemon subscriptions zero; context stays warm until `warmIdleMs`. |
| I2-27:command-exit-releases | 12 | PC04 | lifecycle | P/R | process | Check ends. | Request leases zero; context warm; no compiler process alive. |
| I2-27:idle-disposal-releases | 12 | ML07, DA17 | lifecycle | P/R | process | `warmIdleMs: 1000`, `coldRetainMs: 1000`, `idleExitMs: 3000`. | Watchers, helpers and retained products reach zero at cold transition; published history remains until eviction, when history reaches zero; then idle exit within `idleExitMs` plus 5 s. |
| I2-27:eviction-under-many-contexts | 12 | ML03, DA17 | lifecycle | P/F×9 | process | Nine fixtures with `maxContexts: 8`. | The first context is evicted; its reopen has a new generation; the others remain. |
| I2-27:reconnect-after-crash-live | 12 | QT05 | lifecycle | P/R | process | Kill and let a direct client recover. | `recovered` with `restarted: true`; the client reopens and checks correctly. |
| I2-28:required-membership | 2 | harness | harness-gate | H | unit | Validate `--plan 2` membership against this document. | Every leaf here is registered; the count matches. |
| I2-28:removed-record-fails | 2 | harness | harness-gate | H | unit | Delete one record. | Gate and iteration commands fail. |
| I2-28:failing-assertion-fails | 2 | harness | harness-gate | H | unit | Inject a failing assertion into a stub handler. | Both commands fail; the report retains the failure. |
| I2-28:iteration-filter | 2 | harness | harness-gate | H | unit | `--iteration 5` and `--iteration 9`. | `--iteration 5` requires the instances of 2, 3, 4 and 5; `--iteration 9` requires 2 to 9 with iteration 7 contributing none; others `not-executed`. |
| I2-29:entry-footprints | 13 | ML01 | resident-measure | P | measurement | Idle CLI help, `./client` import, daemon zero contexts, daemon one warm reference, CLI check client. | Within the [budget table](scope.md#latency-and-memory-targets); recorded raw. |
| I2-29:cold-warm-broad-reference | 13 | DA17 | resident-measure | P/R | measurement | Cold start, then twenty cycles each of unchanged, README, exposure, source and configuration edits. | Medians within targets; `reused` stages as the model predicts. |
| I2-29:cold-warm-broad-hundred | 13 | DA17 | resident-measure | P/S100 | measurement | Same on S100. | Same. |
| I2-29:repeated-edit-plateau | 13 | ML02 | resident-measure | P/R, P/S100 | measurement | 200 alternating cycles. | Last-100 growth within limits; counters balanced; history at budget. |
| I2-29:many-contexts | 13 | ML03 | resident-measure | P/S100×8 | measurement | Eight warm contexts. | Settled RSS within target; global retained bytes within budget. |
| I2-29:slow-consumer | 13 | ML04, QT07 | resident-measure | P/S100 | measurement | Non-reading subscriber during ten publications. | Queue bound, disconnect timing and RSS recovery within targets. |
| I2-29:synthetic-500 | 13 | DA17 | resident-measure | P/S500 | measurement | Cold and one source edit. | Within the binding iteration 1 ceilings; a miss fails, and any budget change requires package review. |
| I2-29:synthetic-1000 | 13 | DA17 | resident-measure | P/S1000 | measurement | Same at the owner ceiling. | Same. |
| I2-29:publication-peak | 13 | ML06, DA17 | resident-measure | P/R, P/S100 | measurement | Sample 50 ms peaks across publication and serialization. | Combined peaks within the batch-derived limits. |
| I2-30:self-check-eleven | 14 | DA18 | completion | T | process | `npm run check:self`. | Eleven owners, every owned file catalogued, no findings or limits. |
| I2-30:self-negative-contexts | 14 | DA18 | completion | T | process | Add a contexts probe importing root's `RamifyService` type. | Visible through R6; denied `required-importer-tag` for `dispatch`. |
| I2-30:declarations-final | 14 | DA18 | completion | T | process | `npx tsx scripts/validate-final-contracts.ts`. | Eleven declarations match owners.md; every exposure links to a real export. |
| I2-30:package-entries | 14 | PC01 | completion | T | process | Resolve all eight entries from a packed install. | `./client` loads within its closure; others unchanged. |
| I2-30:relocated-resident | 14 | PC01, QT05 | completion | T | process | Plan 1's relocation plus a daemon-backed check and stop in the relocated install. | Works without the enclosing repository; endpoint directory isolated. |
| I2-30:plan1-regression | 14 | DA18 | completion | R, T | process | `npm run reference:verify -- --plan 1` under a harness-owned `RAMIFY_ENDPOINT_DIR`. | All 308 Plan 1 instances pass on the Plan 2 build: 305 records and expectations byte-untouched, and the three backed by the revised owner-list and entry-map expectations passing with their eleven-owner and eight-entry literals; no daemon survives the run. |

## Instance counts by iteration

| Iteration | Instances |
| --- | ---: |
| 2 | 4 |
| 3 | 18 |
| 4 | 27 |
| 5 | 15 |
| 6 | 20 |
| 7 | 0 |
| 8 | 22 |
| 9 | 28 |
| 10 | 5 |
| 11 | 9 |
| 12 | 13 |
| 13 | 9 |
| 14 | 6 |
| Total | 176 |
