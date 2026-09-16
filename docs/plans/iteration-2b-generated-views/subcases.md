# Plan 2B executable instance inventory

**Status:** draft reviewed expectations for [Plan 2B](main-plan.md), prepared
2026-09-15. Every `I2B-NN:variant` is one execution record assigned to one
implementing iteration. Registration is not a pass. The full
`npm run reference:verify -- --plan 2b` gate requires every leaf;
`--iteration N` requires that iteration and its transitive prerequisites.

## Fixtures and evidence

| Code | Fixture |
| --- | --- |
| R | Isolated copy of `examples/collection-review`, with fifteen owners and one Gherkin feature. |
| T | Isolated copy of the Ramify toolkit, with twelve owners after iteration 5. |
| F | Small purpose-built trees for exposures, relays, internal exports, tests, `src/docs` and hostile targets. |
| S100/S1000 | Existing synthetic owner generators. S100 is complete; S1000 is a smoke run. S500 is not required. |
| A | Direct owner API with plain inputs and independently expected output. |
| W | Real retained session, worker and compiler over an isolated project. |
| M | Context manager with scripted session and controlled watcher and clock. |
| Q | Root quick environment with real service and codec. |
| X | Temporary filesystem publication fixture with controlled failure injection. |
| P | Compiled installed CLI and real daemon under an owned `RAMIFY_ENDPOINT_DIR`. |
| H | Harness inventory and assertion-control fixture. |
| B | Plan 2A archived reference and toolkit API-view trees. |

Evidence is `unit`, `api`, `session`, `quick`, `ipc`, `process`, `measurement`,
`platform` or `document`. A weaker boundary cannot satisfy a process, IPC or
platform row.

## Membership

| Iteration | Direct prerequisites | Groups |
| ---: | --- | --- |
| 1 | Plan 2A completion | I2B-01 |
| 2 | 1 | I2B-02 |
| 3 | 1 | I2B-03, I2B-04 |
| 4 | 1 | I2B-05 |
| 5 | 2, 3 | I2B-06 |
| 6 | 5 | I2B-07 |
| 7 | 4, 6 | I2B-08 |
| 8 | 6 | I2B-09 |
| 9 | 7, 8 | I2B-10, I2B-11 |

## Required leaves

| ID | It. | Fixture/evidence | Independent expectation |
| --- | ---: | --- | --- |
| I2B-01:provider-handoff | 1 | A/T, document | Plan 2A's completion commit, session, contexts, publisher, service and CLI shapes are recorded and every path in this package is verified. |
| I2B-01:review-decisions | 1 | document | Every row of [review decisions](scope.md#review-decisions) is confirmed or replaced, with the user's choice recorded. |
| I2B-01:scale-probe | 1 | A/R,T,S100, measurement | Exposed, internal and test entry counts, projected bytes and test-file parse cost are recorded. |
| I2B-01:limits-frozen | 1 | document | Test-hierarchy limits and any changed view limits are positive and justified by raw probe paths. |
| I2B-01:harness-ledger | 1 | H, unit | `--plan 2b` registers every leaf once, rejects duplicates and missing records, and never passes an empty assertion. |
| I2B-02:decisions-restored | 2 | T, unit | `git diff 71643d5 -- subs/analysis/subs/model/src/decisions.ts` is empty. |
| I2B-02:availability-equivalence | 2 | A/R,T, api | `listAvailableOriginals` output equals Plan 2A's archived output for every consumer area in R and T. |
| I2B-02:queue-check-only | 2 | M/F, api | The context queue holds only check entries; a materialize request appears as one ordinary check followed by one session query. |
| I2B-02:query-no-promotion | 2 | W/F, session | A warm query after an on-disk edit returns `superseded`, and the session's observed inputs, sequence and counters equal those before the query. |
| I2B-02:check-invariance | 2 | W/R,T, session | Identical input sequences with and without interleaved materialization publish identical revisions, reports and counters. |
| I2B-02:supersession-retry | 2 | M/F, api | One supersession retries once within the deadline; a second returns `superseded` and publishes nothing. |
| I2B-02:plan5-equivalence | 2 | P/T, process | `I5-01:namespace-lazy-equal` and `I5-01:decide-indexed-equal` pass with their pinned baselines unmodified. |
| I2B-03:root-path-reserved | 3 | A/F, api | Paths at and beneath `.exported_symbols` and `docs/modules`, and their transient forms, are reserved. |
| I2B-03:near-misses-ordinary | 3 | A/F, api | `.exported_symbols2`, `docs/modules-old`, `docs/module` and `.ramify-other` stay ordinary. |
| I2B-03:api-reservation-unchanged | 3 | A/F, api | Every Plan 2A reservation case still classifies identically. |
| I2B-03:config-glob-excluded | 3 | A/F, api | A tsconfig `include` of `**/*` does not select `.ts` files under either root path or through a `docs/modules` symlink. |
| I2B-03:watcher-silent | 3 | Q/F, quick | Events under both root paths and their transient forms are dropped before debounce; a neighboring source event still publishes. |
| I2B-03:observer-stable | 3 | W/F, session | Creating, replacing and deleting both root trees leaves input identity, sequence and reconciliation count unchanged. |
| I2B-04:symlink-entry | 3 | X/F, api | A declared relative symlink is staged and switched with the exact target text and never followed. |
| I2B-04:symlink-escape | 3 | X/F, api | A symlink target resolving outside the root refuses the invocation before any write. |
| I2B-04:undeclared-symlink | 3 | X/F, api | A symlink present inside an existing target but not declared by the view refuses the invocation. |
| I2B-04:recognizable-target | 3 | X/F, api | An existing target matching the view's generated shape is replaced; one containing a user file refuses with `invalid-path` and is untouched. |
| I2B-04:multi-view-transaction | 3 | X/F, api | A failure switching the third of three targets across two views restores the first two byte for byte. |
| I2B-04:noop-symlinks | 3 | X/F, api | Identical files and symlink texts produce zero writes and unchanged mtimes. |
| I2B-04:legacy-recovery | 3 | X/F, process | Marked `.ramify.tmp-*` and `.old-*` siblings left by a killed Plan 2A publisher are recovered. |
| I2B-04:api-publication-regression | 3 | X/F, api | Plan 2A's I2A-07 cases pass against the generic publisher. |
| I2B-05:vitest-hierarchy | 4 | A/F, api | Nested `describe`, `it`, `test` and `suite` calls produce the expected tree with line numbers. |
| I2B-05:modifiers | 4 | A/F, api | `.skip`, `.only`, `.todo`, `.each`, `.concurrent` and `.fails` appear as written in `call`. |
| I2B-05:dynamic-titles | 4 | A/F, api | Non-literal titles render `<dynamic: expression>` within the byte bound and are never evaluated. |
| I2B-05:descriptions | 4 | A/F, api | The adjacent comment's first paragraph becomes the description; non-adjacent comments do not. |
| I2B-05:gherkin | 4 | A/R, api | The reference feature yields its Feature, Scenario and Scenario Outline titles and lines. |
| I2B-05:bounds | 4 | A/F, api | Per-file node and byte bounds yield `truncated`; a total bound rejects with no prefix. |
| I2B-05:parse-failure-isolated | 4 | A/F, api | A syntactically broken test file yields `unavailable` while other files are described. |
| I2B-06:registry-order | 5 | A/F, unit | `viewRegistry` is byte-ordered; unknown and duplicate identifiers are `invalid-projection`. |
| I2B-06:api-bytes-identical | 5 | A/B, api | The re-hosted API view renders byte-identical trees to Plan 2A's archived R and T trees. |
| I2B-06:target-validation | 5 | A/F, api | Absolute, `..`, empty-segment and backslash entry paths, and entries outside a target, are rejected. |
| I2B-06:invocation-bound | 5 | A/F, api | The sum across views over `maxInvocationBytes` returns `resource-limit` with no targets. |
| I2B-06:session-materialize | 5 | W/R, session | `RetainedSession.materialize` at the current sequence returns the API targets without calling `report()` or acquiring inventory. |
| I2B-06:plan2a-gate | 5 | P/R,T, process | `reference:verify --plan 2a` passes on the refactored build. |
| I2B-07:view-flag | 6 | Q/F, quick | `--view` repeats, rejects unknown and duplicate values before connecting, and defaults to every view. |
| I2B-07:capability | 6 | Q/F, quick | A peer without `materialize-views` receives no `views` field and the client reports an incompatible service. |
| I2B-07:project-view-selection | 6 | Q/F, quick | Project views ignore `--from` and `--all`; the API view keeps Plan 2A selection. |
| I2B-07:one-revision | 6 | Q/R, quick | Every target of one invocation carries the same revision. |
| I2B-07:summary-lines | 6 | Q/R, quick | Success output prints one line per selected view with targets, entries, bytes and unchanged counts. |
| I2B-07:compact-wire | 6 | Q/R, quick | No rendered content crosses the codec; targets obey the per-module and per-view bound. |
| I2B-07:compiled-process | 6 | P/R, process | The installed CLI runs `materialize --view api` through the daemon and stops it in `finally`. |
| I2B-08:layout | 7 | A/R, api | Every module has its directory and three files at the identifier-derived path; the root module's files sit at the top. |
| I2B-08:exposed-owned | 7 | A/F, api | Owned effective exposures appear with destinations, tags, aliases and signatures under their defining file. |
| I2B-08:exposed-relayed | 7 | A/F, api | `expose-sub` selections appear in `relayed` with the child and destinations, without signatures. |
| I2B-08:exposed-ineffective | 7 | A/F, api | Ineffective exposures appear only in the `ineffective` section. |
| I2B-08:class-interface-members | 7 | A/F, api | A class shows public members and no private members or bodies; an interface shows every member. |
| I2B-08:internal-exports | 7 | A/F, api | Owned exports without an owned exposure appear; exposed originals, foreign forwards and namespace exports do not. |
| I2B-08:testing-marked | 7 | A/F, api | Testing-classified defining files are marked `[testing]` in both symbol files. |
| I2B-08:tests-file | 7 | A/R,T, api | `tests.txt` lists each testing file once under its owner with the provider's hierarchy, including the reference feature. |
| I2B-08:independent-reference | 7 | A/R, api | Hand-written expected `exposed-symbols.txt`, `internal-exports.txt` and `tests.txt` for three reference modules match byte for byte. |
| I2B-08:determinism | 7 | A/R,T, api | Shuffled equivalent facts render byte-identical trees with no timestamps, absolute paths or request IDs. |
| I2B-09:links | 8 | A/F, api | Each module with a real `src/docs` directory gets one `docs` symlink with the expected relative target. |
| I2B-09:no-docs | 8 | A/F, api | A module without `src/docs`, or with a file or symlink named `src/docs`, gets no symlink. |
| I2B-09:intermediate-directories | 8 | A/F, api | Directories exist only on paths to modules that have a symlink. |
| I2B-09:root-module | 8 | A/F, api | A root module with `src/docs` links from `docs/modules/docs`. |
| I2B-09:resolves | 8 | X/F, api | After publication every symlink resolves to the module's `src/docs` directory. |
| I2B-09:not-analyzed | 8 | W/F, session | A `.ts` file under a linked `src/docs` is analyzed once, at its real path, with no outside-module warning for the linked path. |
| I2B-10:reference-trees | 9 | P/R, process | A compiled run produces the independently expected `.exported_symbols` and `docs/modules` trees for R. |
| I2B-10:toolkit-trees | 9 | P/T, process | A compiled run over T produces all three views; `check:self` input identity and revision are unchanged. |
| I2B-10:noop-repeat | 9 | P/R,T, process | An unchanged repeat reports zero bytes written and every target unchanged. |
| I2B-10:gitignored | 9 | P/R, process | A complete run leaves Git status unchanged in a committed copy. |
| I2B-10:scale | 9 | P/R,T,S100,S1000, measurement | Files, entries, bytes, latency, peak RSS and staged bytes are recorded; S1000 records its observed outcome. |
| I2B-10:limit-preservation | 9 | P/F, measurement | Just-over area, staging and deadline cases preserve old trees; just-under cases complete. |
| I2B-10:linux-macos | 9 | P/F, platform | Linux and macOS produce identical file bytes and symlink texts. A missing macOS artifact fails this row. |
| I2B-11:all-instances | 9 | H, unit | The full `2b` gate accounts for every leaf; waivers are explicit. |
| I2B-11:predecessor-gates | 9 | P/R,T, process | Plan 1 passes; Plans 2, 5 and 2A show no regression from their recorded baselines. |
| I2B-11:declarations-package | 9 | P/T, process | Twelve declarations and eight package entries validate; CLI and client import closures stay lightweight. |
| I2B-11:documents-handoff | 9 | T, document | Architecture, roadmap, guides and the completion report describe implemented behavior, limits and gaps. |
