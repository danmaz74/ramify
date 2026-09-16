# Plan 2A executable instance inventory

**Status:** draft reviewed expectations for [Plan 2A](main-plan.md), prepared
2026-09-15. Every `I2A-NN:variant` below is one execution record assigned to
one implementing iteration. Registration or capability availability is not a
pass. The full `npm run reference:verify -- --plan 2a` gate requires every
leaf; `--iteration N` requires that iteration and its transitive prerequisites.

**Revision (iteration 1, 2026-09-15).** Reconciled against the main plan's
stated count: the "Required leaves" table below has exactly 104 `I2A-NN:variant`
rows (`grep -c '^| I2A-'`), with no duplicate ID, matching
[main-plan.md](main-plan.md)'s and [iteration2.md](iterations/iteration2.md)'s
104 figure exactly. No correction to the stated number or to any leaf ID was
necessary.

## Fixtures and evidence

| Code | Fixture |
| --- | --- |
| R | Isolated copy of `examples/collection-review`, with fifteen independently expected owners. |
| T | Isolated copy of the Ramify toolkit, with its eleven owners. |
| F | Small purpose-built module trees covering ancestry, tags, tests, aliases and failures. |
| S100/S500/S1000 | Existing deterministic synthetic owner generators at the named sizes. |
| A | Direct owner API with plain inputs and independently expected output. |
| W | Real retained session/worker and compiler over an isolated project. |
| M | Context manager with scripted session, controlled watcher/clock and publisher. |
| Q | Root quick environment with real service/codec and controlled outer ports. |
| X | Temporary filesystem publication fixture with controlled failure injection. |
| P | Compiled installed CLI and real daemon under an owned `RAMIFY_ENDPOINT_DIR`. |
| H | Harness inventory and assertion-control fixture. |

Evidence is `unit`, `api`, `session`, `quick`, `ipc`, `process`, `measurement`,
`platform` or `document`. A weaker boundary cannot satisfy a process, IPC or
platform row. Every mutable fixture is copied per case and every process,
watcher, worker, compiler, timer and temporary directory is released in
`finally`.

## Membership

| Iteration | Direct prerequisites | Groups |
| ---: | --- | --- |
| 1 | Plan 5 provider | I2A-01 |
| 2 | 1 | I2A-02 |
| 3 | 1 | I2A-03 |
| 4 | 1 | I2A-04 |
| 5 | 2, 3, 4 | I2A-05 |
| 6 | 5 | I2A-06, I2A-07 |
| 7 | 5 | I2A-08 |
| 8 | 6, 7 | I2A-09, I2A-10 |
| 9 | 8 | I2A-11, I2A-12 |
| 10 | 9 | I2A-13 |

## Required leaves

| ID | It. | Fixture/evidence | Independent expectation |
| --- | ---: | --- | --- |
| I2A-01:provider-handoff | 1 | A/T, document | Record current commit, Plan 5 session/fact/compiler/context contracts and closure limitations; every later import/path is verified against source. |
| I2A-01:scale-baseline | 1 | A/R,T,S100,S500,S1000, measurement | Record available entries, projected files/bytes, ordinary/test duplication, compiler-detail cost and explicit predecessor refusal where a retained fixture cannot open. |
| I2A-01:format-token-probe | 1 | A/R,T, measurement | Compare the specified Markdown with equivalent verbose records using one declared tokenizer; record bytes/tokens and retain the specified omission set. |
| I2A-01:limits-frozen | 1 | document | `contracts.md` contains positive finite detail/area/invocation/staging/deadline limits justified by raw probe paths; no unresolved semantic choice remains. |
| I2A-02:harness-membership | 2 | H, unit | The `2a` gate registers every leaf here exactly once with the recorded iteration/group and rejects duplicate IDs. |
| I2A-02:harness-missing-record | 2 | H, unit | Removing one reviewed record makes full and relevant iteration gates fail and name it. |
| I2A-02:harness-failing-assertion | 2 | H, unit | A failing or empty handler assertion cannot pass and remains in the report. |
| I2A-02:harness-filter | 2 | H, unit | Iteration selection requires only the named iteration plus transitive prerequisites; future leaves are `not-executed`, never passed. |
| I2A-02:ordinary-inventory-excluded | 2 | A/F, api | Files under `src/.ramify`, including `.ts.md` and arbitrary extensions, add no inventory file/resource or input. |
| I2A-02:tests-inventory-excluded | 2 | A/F, api | Files under `src/tests/.ramify` add no testing file/resource and do not alter the tests-area profile/presence. |
| I2A-02:explicit-config-excluded | 2 | A/F, api | A tsconfig `files`/`include` entry cannot reopen final or transient `.ramify` output as application or outside-module source. |
| I2A-02:exposure-rejected | 2 | A/F, api | `expose-src`/`expose-test` naming generated output is missing/excluded evidence and never creates an original or exposure. |
| I2A-02:observer-input-stable | 2 | W/F, session | Create/change/delete final and transient generated files, then sweep; input ID, retained facts and revision sequence remain unchanged. |
| I2A-02:watcher-silent | 2 | Q/F, quick | Native-style events for final/stage/rollback paths are filtered before debounce, counters and reconciliation; a neighboring real source event still publishes. |
| I2A-02:tests-area-not-created | 2 | X/F, api | A module without `src` or `src/tests` has both areas absent; presence is exactly directory existence, so writing a generated-only catalog never creates either directory but flips presence true once one already exists. |
| I2A-02:transient-names-excluded | 2 | A/Q/F, api | `.ramify.tmp-*` and `.ramify.old-*` are excluded at inventory, observation and watcher boundaries while `.ramify-other` is ordinary input unless reserved by the frozen contract. |
| I2A-03:value-available | 3 | A/F, api | A visible value satisfying profiles appears once as `value`. |
| I2A-03:pure-type | 3 | A/F, api | A visible original with only a type binding appears once as `type-only`. |
| I2A-03:required-symbol-fallback | 3 | A/F, api | A browser-requiring consumer sees a non-browser original only as `type-only` when it has a type binding, otherwise not at all. |
| I2A-03:required-importer-block | 3 | A/F, api | A visible original carrying a missing required-importer tag is absent in both forms. |
| I2A-03:testing-origin | 3 | A/F, api | Testing-owned originals are absent from ordinary source and present in compatible testing source. |
| I2A-03:test-complete-reclassification | 3 | A/F, api | The test result repeats ordinary-visible APIs and independently upgrades/downgrades forms from the testing profile without overlay logic. |
| I2A-03:same-owner-absent | 3 | A/F, api | Own originals are absent even if an exposure path returns them to the owner. |
| I2A-03:enforcement-equivalence | 3 | A/R,T, api | For every foreign original/form tested by independent synthetic imports, list membership equals `explainImport`; redundant exposure paths do not duplicate and order is stable. |
| I2A-04:declaration-kinds | 4 | A/F, api | Functions, classes, interfaces, aliases, variables, enums and default/named exports produce body-free TypeScript signatures with the expected kind conveyed by syntax. |
| I2A-04:overloads | 4 | A/F, api | Distinct callable overloads are retained in compiler order, implementations/bodies are absent, and the overload bound yields `truncated`. |
| I2A-04:first-documentation-paragraph | 4 | A/F, api | The first useful JSDoc paragraph is whitespace-normalized; later paragraphs/tags/examples are absent. |
| I2A-04:no-documentation | 4 | A/F, api | Missing/empty documentation omits the field and does not produce a placeholder or unavailable state. |
| I2A-04:byte-truncation | 4 | A/F, api | Multibyte signatures/docs respect UTF-8 byte limits without splitting a code point and name each triggered bound. |
| I2A-04:identity-and-alias | 4 | A/F, api | A forwarding or Ramify exposure alias cannot redirect detail lookup; the defining-file export resolves to the catalog's canonical original. |
| I2A-04:isolated-unavailable | 4 | A/F, api | Missing export, unsupported declaration or isolated checker failure yields one stable unavailable result and leaves other requests described. |
| I2A-04:protocol-lifecycle | 4 | W/F, session | Malformed/oversized/cancelled detail requests return no prefix, obey worker bounds, and leave no helper/compiler process after disposal. |
| I2A-05:child-category | 5 | A/F, api | A direct-child and deep-descendant original both enter `children`; the deep owner is not misclassified by the first-child grouping. |
| I2A-05:external-category | 5 | A/F, api | Available ancestor, sibling and cousin originals enter `external`; npm/builtin/library declarations are absent. |
| I2A-05:defining-path-roundtrip | 5 | A/R,T, api | Removing the appended `.md` from every projected relative filename resolves exactly one original defining application file, preserving original extensions. |
| I2A-05:defining-export-names | 5 | A/F, api | Entries use every valid defining-file export name for the original and omit forwarding and exposure aliases. |
| I2A-05:file-group-and-order | 5 | A/R,T, api | One projection file groups all and only entries for one defining file; categories, paths and headings are byte-ordered and repeat runs are deeply equal. |
| I2A-05:test-view-complete | 5 | A/R,F, api | Every test-available foreign original is in the tests projection even when also in ordinary; searching tests alone loses no test-available entry. |
| I2A-05:empty-view | 5 | A/F, api | A module with no foreign API produces an area with zero files and valid metadata inputs, not placeholder documents. |
| I2A-05:coverage-count | 5 | A/F, api | Distinct catalog/description limits that may omit APIs contribute once to `coverage`; access-only limits do not. |
| I2A-05:projection-bound | 5 | A/S1000, api | Crossing an area/invocation bound returns resource unavailable with no collected prefix; a just-under-bound projection is complete. |
| I2A-06:minimal-described | 6 | A/F, unit | A described value entry renders only heading, signature fence and optional first paragraph with one final newline. |
| I2A-06:type-marker | 6 | A/F, unit | `[type-only]` appears only on type-only headings; value entries emit no value/availability marker. |
| I2A-06:exception-markers | 6 | A/F, unit | Truncated details render bounded content plus `[truncated]`; unavailable details render `[details-unavailable]` and no empty fence. |
| I2A-06:omitted-redundancy | 6 | A/R, unit | Rendered files contain no provider/path/tags/original ID/exposure/alias/availability fields or placeholder prose. |
| I2A-06:markdown-delimiters | 6 | A/F, unit | Export names/signatures containing backticks choose deterministic safe delimiters and remain searchable by the literal name. |
| I2A-06:metadata-minimal | 6 | A/F, unit | `_meta.json` has ordered required keys, only nonzero exceptional counts, one line and a final newline. |
| I2A-06:byte-determinism | 6 | A/R,T, unit | Shuffled equivalent projection inputs render byte-identical relative trees; no absolute path, timestamp, PID or request ID occurs. |
| I2A-07:first-publication | 6 | X/F, api | Missing final targets are staged completely and switched; `_meta.json` is the last staged file and the outcome counts exact files/entries/bytes. |
| I2A-07:stale-removal | 6 | X/F, api | Removing an available API removes its obsolete generated file/entry only through complete directory replacement. |
| I2A-07:unchanged-noop | 6 | X/F, api | Equal path sets/bytes cause zero target writes, zero renames and unchanged file/directory mtimes. |
| I2A-07:prestage-failure | 6 | X/F, api | Rendering, bound, mkdir or staged-write failure before switches preserves every previous target and cleans owned temporary output. |
| I2A-07:switch-rollback | 6 | X/F, api | A failure after one of several target switches restores every earlier target byte-for-byte in reverse order and reports no success. |
| I2A-07:rollback-failure-explicit | 6 | X/F, api | Injected rollback failure yields `rollback-failure`, retains recovery artifacts and never claims a complete refresh. |
| I2A-07:cancel-boundaries | 6 | X/F, api | Cancellation before switching preserves all targets; cancellation during switching completes rollback before returning cancelled/unavailable. |
| I2A-07:symlink-traversal | 6 | X/F, api | A symlink in an existing ancestor, final target or existing target contents refuses publication without following or deleting it. |
| I2A-07:path-escape | 6 | X/F, api | Absolute, `..`, empty-segment and separator-confused projected paths are rejected before any write; neighboring files are untouched. |
| I2A-07:crash-recovery | 6 | X/F, process | A killed publisher leaves only marked owned stage/rollback directories; the next run restores/cleans them without deleting an unmarked lookalike. |
| I2A-08:current-valid-query | 7 | W/R, session | Querying the current valid sequence projects requested modules directly from `SessionFacts` and returns the same sequence/input ID. |
| I2A-08:invalid-or-historical | 7 | W/F, session | Invalid current facts, an older/unknown sequence or an invalid location returns explicit unavailable and never uses `lastValid`. |
| I2A-08:hot-details | 7 | W/R, session | A hot session uses its one live compiler, runs no second inventory/model/report build and returns independently expected details. |
| I2A-08:warm-rehydration | 7 | W/R, session | After compiler release, the query recreates one compiler from retained captured inputs, publishes no revision and yields the same projection as the hot state. |
| I2A-08:new-observation-supersedes | 7 | W/F, session | If rehydration changes observed input identity, the query is superseded, returns no projection and leaves reconciliation to the normal session path. |
| I2A-08:no-report-or-rescan | 7 | W/R,T, session | Instrumented query calls neither `report()` nor project acquisition/inventory walking and creates no duplicate graph/store. |
| I2A-08:query-serialization | 7 | W/F, session | A queued update before the query is included; one after it cannot replace its sequence; all module areas share one revision. |
| I2A-08:query-limits | 7 | W/S1000, session | Worker/projection/deadline exhaustion returns unavailable without a partial projection or session corruption. |
| I2A-08:query-disposal | 7 | W/R, session | Repeated and cancelled queries retain no projection, balance worker messages and release compiler/worker resources on demotion/disposal. |
| I2A-09:request-validation | 8 | Q/F, quick | Exact schemas accept one valid selection and synchronized freshness; unknown fields, malformed IDs/paths/deadlines and other freshness modes are invalid requests. |
| I2A-09:one-revision-service | 8 | Q/R, quick | Service orders freshness, projection and publisher under one context revision and injects that exact revision into every target metadata document. |
| I2A-09:module-and-all | 8 | Q/R, quick | Module selection resolves the innermost owner; all selection publishes ordinary and testing targets only for the pre-existing areas that already own real `src/`, in byte order, silently omitting a module that owns neither. |
| I2A-09:failure-mapping | 8 | Q/F, quick | Pending/cold/deadline/superseded/cancelled/session/publisher failures retain stable domain status and do not become success or internal error. |
| I2A-09:compact-wire | 8 | Q/S100, quick | The service response contains summaries only; no Markdown, signature, documentation or projection entry crosses the codec boundary. |
| I2A-09:actual-ipc | 8 | P/R, ipc | A real socket request validates/dispatches/materializes and returns the same summary as the direct service; unsupported peer capability is explicit. |
| I2A-09:lease-cleanup | 8 | Q/F, quick | Disconnect/cancellation releases request leases and ephemeral projections; no subscriber, target switch or background write remains. |
| I2A-10:grammar-default | 8 | Q/F, quick | `materialize` with no selector uses cwd; help lists exactly `--from`, `--all`, `--root`. |
| I2A-10:from-selection | 8 | Q/R, quick | Relative/absolute file and directory `--from` values select the expected innermost module without changing project-root discovery. |
| I2A-10:all-selection | 8 | Q/R, quick | `--all` requests every module once and emits one compact combined success summary. |
| I2A-10:invalid-arguments | 8 | Q/F, quick | Duplicate/empty/unknown flags and `--all --from`, `--batch`, `--changed`, `--format` fail before connection with exit 2. |
| I2A-10:exit-contract | 8 | Q/F, quick | Complete publication exits 0, invalid project 1, unavailable/partial 2 and SIGINT 130; no failure claims refreshed output. |
| I2A-10:generation-recovery | 8 | Q/F, quick | One expired generation reopens through existing recovery; incompatible/stopped peers do not trigger batch fallback. |
| I2A-10:output-summary | 8 | Q/R, quick | Success names revision, targets, entries, bytes written and unchanged count without dumping catalog content. |
| I2A-10:lightweight-import | 8 | P, process | CLI/client import closure loads no analysis worker/compiler and help/version starts neither daemon nor materialization code. |
| I2A-10:compiled-process | 8 | P/R, process | Installed `ramify materialize` starts/uses the daemon, writes expected trees, closes its context/client and owned daemon in `finally`; no batch analyzer runs in CLI. |
| I2A-11:gitignored | 9 | P/T,R, process | Final, stage and rollback names are ignored and a complete materialization leaves no tracked/untracked Git status change. |
| I2A-11:ordinary-hidden | 9 | P/R, process | An ordinary recursive `rg` from the module omits `.ramify`; the documented explicit ordinary path finds an independently named API/signature/doc. |
| I2A-11:tests-self-contained | 9 | P/R, process | The documented test path alone finds APIs shared with ordinary and APIs/forms unique to tests; no ordinary catalog is searched. |
| I2A-11:category-search | 9 | P/R, process | Explicit searches find one descendant original under `children` and one ancestor/sibling/cousin original under `external`, never npm output. |
| I2A-11:agent-instructions | 9 | T, document | Root `AGENTS.md` states generated/gitignored/no-edit/no-import, exact two commands, completeness/no-combine, refresh command and coverage caveat. |
| I2A-11:derived-import-check | 9 | P/R, process | A real import derived from a generated defining path passes `ramify check`; using a `[type-only]` entry as a value is denied. |
| I2A-12:reference-scale | 9 | P/R, measurement | Record files, entries, bytes, duplication, largest areas, warm latency, peak RSS/heap, staged bytes and zero-write repeat. |
| I2A-12:toolkit-scale | 9 | P/T, measurement | Record the same metrics with all eleven owners and both generated locations excluded from self-check inputs. |
| I2A-12:synthetic-100 | 9 | P/S100, measurement | Complete all-owner materialization or an explicit frozen-limit refusal; record the same metrics and cleanup. |
| I2A-12:synthetic-500 | 9 | P/S500, measurement | Record successful metrics or the first explicit predecessor/Plan 2A bound; never infer missing values. |
| I2A-12:synthetic-1000 | 9 | P/S1000, measurement | Record the known retained-fact refusal or successful metrics after an independently justified bound change; no partial catalog is accepted. |
| I2A-12:repeat-plateau | 9 | P/R,S100, measurement | Repeated materialization reaches a settled memory/temporary-file plateau and every unchanged repeat writes zero bytes. |
| I2A-12:limit-preservation | 9 | P/F, measurement | Just-over area/staging/heap/deadline cases fail at the named bound and preserve old bytes; just-under controls complete. |
| I2A-12:linux-macos-bytes | 9 | P/F, platform | Linux and macOS produce identical relative final trees and bytes and both pass symlink, rollback and no-op process cases. |
| I2A-13:all-instances | 10 | H, unit | The full `2a` gate accounts for every reviewed leaf; binding leaves pass and any approved timing waiver is explicit, not passed. |
| I2A-13:build-tests | 10 | T, process | Build, type-check, focused/full Vitest and reference catalogue tests pass on one coherent source/build identity. |
| I2A-13:self-reference-checks | 10 | P/R,T, process | `check:self` and `check:reference` pass with generated views present and neither view changes inputs/revisions. |
| I2A-13:predecessor-regressions | 10 | P/R,T, process | Plan 1 passes; Plan 2/5 match their recorded closure baselines with no new failure and no old waiver relabelled. |
| I2A-13:declarations-package | 10 | P/T, process | Eleven declarations and eight package entries validate; client/CLI remain lightweight and no MCP/new owner appears. |
| I2A-13:documents-handoff | 10 | T, document | Architecture, roadmap and guides state implemented behavior/limits; completion report gives Plan 3 provider and remaining-scope handoff. |
| I2A-13:plan3-preserved | 10 | T, unit | The Plan 3 directory tree equals its implementation-base Git tree byte-for-byte; Plan 2A did not replace or edit it. |
