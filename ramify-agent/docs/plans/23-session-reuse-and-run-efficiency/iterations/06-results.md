# Iteration 6 results: scope and exploration calculations

Status: provider implementation verified; runtime/protocol integration belongs to iteration 11 and final native/full qualification to iteration 14. This receipt does not claim those later gates.

Worktree: `/home/app/ramify-plan23-06-metrics`, branch `feat/plan23-06-metrics`.
Base: `8620fcafe2b5fb236170f35c0cbd47eeeb6bdb23`.
Source head: `a925ba4e39e8b0b82f2f409e6d387df7f5bcb10f` (initial implementation `3b28c7ea50ccff4cae62058af17e3578f6669aec`; scoped attribution follow-up included).
Delivery head: the subsequent receipt commit, obtainable with `git log -1 --format=%H -- ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/06-results.md`.

The existing corrections committed at `d01a57bdbac6a56c29a893519f70297513824313` were audited and preserved. All changes fall within iteration 6's exact reservation. No service, observation, record, protocol, web, declaration, manifest, registry, or other worker file changed. No additional reservation was needed.

## Implemented and verified

M01: `deliveredScopeInputs` takes an actual delivered/inherited manifest instead of enumerating available packages. It deduplicates support source identities and identical brief bytes, excludes a brief already represented by the exact same support source hash/bytes, and rejects conflicting revisions of one named support file. Architect view descendants are excluded from support. A support file in an unselected owner still counts; one already selected in owned source does not count twice. Project-only scope excludes architect/support/brief, with corresponding project-only baseline.

M02: partial component buckets and writer byte-line contributions survive in subtotals. Complete, unknown-size, and unattributed weights are explicit in `ScopeComparison`. A complete committed snapshot can attribute shell work independently of guard coverage. Shared commits with unknown snapshots retain unattributed weight instead of an invented split. Explicit uncertain overlap is handled per path before the single-writer fast path too: one named owner cannot claim an external or unfinished writer's unknown contribution, and an unrelated path stays known. Complete unrelated writers retain their contribution.

M03: extras carry captured per-file identities, removing held-source and overlapping-extra duplicates, including files outside the inventory. Legacy aggregate extras deduplicate identical and covering paths. Read scope has a separate declaration and is never merged into writer scope. Nested-project exclusions and unknown bootstraps remain explicit. Incompatible snapshot policies, measurement/view revisions, or frozen snapshot identities prevent whole-scope comparisons; stale-state component buckets are cleared rather than included in a known subtotal.

M04: weighted mean is labeled bytes, normalized ratios dimensionless. Missing baseline, zero baseline, actual zero size, no delivered text, missing scope, and captured partial zero subtotal retain different states. A partial normalized result has no value; its note identifies byte-line subtotal units. Existing KPI fields remain compatible, with complete-size denominator distinct from retained partial contributions.

M05: pure exploration aggregation counts source calls by invocation/operation/session/turn/call/kind, preserving replay/inherited identity. It distinguishes unique files, repeated read calls, observed returned bytes, broad/zero-match/outside searches, and known tool duration. Missing information and conflicts are coverage limits. No scanned bytes or understanding is inferred. Timing uses explicit milestones and invocation boundaries; parallel tool sums remain distinct from wall duration. Charge estimates use only supplied recorded rates and separate new/cached/write/output categories.

## Independently calculated fixtures

- Baseline source/API/architect/support `100/20/30/50`: project-only `120`, total `200`. Writer `40/10/15/20`, brief `5`: project-only `50`, total `90`. Ratios `50/120` and `90/200`.
- Weights `3,1` and total sizes `90,50`: `(3*90+1*50)/4 = 80 bytes`.
- Partial second size has known `80 bytes` and weight `1`; complete first has `90 bytes` and weight `3`. Known weighted subtotal `350 byte-lines`; complete-size weight `3`, unknown-size weight `1`, attributed weight `4`, additional unattributed weight `2`. No whole-run mean or ratio is emitted.
- Known source `510`, API `10`, support `200`, brief `5`, unknown bootstrap and missing support: subtotal `725`, project-only subtotal `520`, total null. Revision mismatch retains only independently captured support `200`; unsupported snapshot policy retains no stale subtotal.
- Extra containing already-held `10-byte` file plus new `7-byte` file contributes only `7`; repeated extra paths do not add it again. Read declarations remain separate.
- Exact final-position setup lines `1,2` and agent lines `3,4` in one commit/path exclude `2` setup lines and retain `2` writer lines. After setup is reverted, verified empty surviving setup positions retain both surviving agent lines, even when their final positions become `1,2`. Stale revision binding or unknown mapping excludes no guessed setup lines and retains `2` unattributed lines. Deleted setup identities use base positions and removing commit: `2` setup plus `1` writer line. Later writer edits to the same `.gitignore` remain attributed.
- One named writer, overlapping path A with 3 lines and unrelated path B with 2: A retains 3 unattributed lines, B retains 2 known writer lines. A global recorded overlapping-writers gap likewise prevents guessing with only one named writer.
- Pure rename/reverted final diff delivers zero text weight. Existing binary and snapshot/revert controls remain passing.
- Reads `a.ts:10 bytes/5ms`, `a.ts:6/3ms`, `b.ts:4/unknown`; broad zero-match search `0/7ms`; outside search `2/2ms`: reads `3`, unique files `2`, repeated reads `1`, returned bytes `22`, searches `2`, broad `1`, outside `1`, zero-match `1`, known tool subtotal `17ms` plus duration limit. Replay/inherited copies add nothing; a new operation/invocation/turn/kind adds a call.
- Two parallel `10ms` tools: summed tool time `20ms`, invocation wall time `10ms`, explicit engineering milestone `4ms`. Incomplete tool durations produce null timing total and expose known subtotal in coverage.
- Tokens new `100`, cached `50`, cache-write `0`, output `10`; recorded rates per million `$2/$0.2/$0/$8`: `$0.0002/$0.00001/$0/$0.00008`, estimated total `$0.00029`. Absent usage or rates remains null, never silently zero.

## Verification

`npm ci` completed in this worktree's `ramify-agent/`, without a lockfile change. Ordinary and testing foreign views were materialized separately; the generated `readMeasurement`, architect directory, `ChangeHistory`, and `LineCommit` APIs were searched in their respective views. Generated catalogs were neither edited nor imported.

Required focused command before the final attribution follow-up, 2026-10-08 17:33:09 UTC:

```sh
npm run test:quick -- subs/harness/src/tests/kpi-metrics.test.ts subs/harness/src/tests/scope-size-recipe.test.ts subs/harness/src/tests/delivered-change.test.ts subs/harness/src/tests/plan23-exploration-metrics.test.ts subs/harness/src/tests/line-events.test.ts --maxWorkers=2
```

Result: **5 files / 64 tests passed**, including the required four files and existing affected line-event tests. One earlier independent setup fixture asserted incidental Map insertion order; it was corrected to compare sorted identities and quantities before the final passing run.

Final scoped follow-up verification, 2026-10-08 17:36:56 UTC: `npm run test:quick -- subs/harness/src/tests/delivered-change.test.ts --maxWorkers=2` passed **1 file / 16 tests** after the single-writer overlap correction. Only delivered calculation and its owned tests changed after the five-file run.

`npm run type-check`: passed all four configured TypeScript checks, repeated after the final correction.
`npm run check:self`: repeated after the final correction, completed/passed, coverage partial; 12 owners, 661 source files, 50 resources, 0 errors, 0 warnings, **314 analysis limits**. These limits are not complete static coverage.
`git diff --check`: passed. Exact reservation check passed after normalizing the repository's `ramify-agent/` prefix.

Five required-run process receipts under `node_modules/.cache/ramify-agent-test-processes/a85e5b74564f497effa06a32f154a41c3afe7d282d2377c7e8c9cffc637b4094/`:

- `4c1eabf4-56c0-4ebb-aa91-78912b33d376.json` delivered-change.
- `2a588a89-13c4-4e52-923f-76181e99962c.json` line-events.
- `a70240c8-5e46-46b9-934d-18deec4a297f.json` kpi-metrics.
- `f4d36371-b6fe-4cc0-9f98-dd2b8869ab08.json` scope-size-recipe.
- `b515f2e5-3ccf-4a3d-b013-e9c49dca00f1.json` exploration.

Final follow-up process receipt: `f8ac4fe5-de27-49fd-929c-6bcc854b078c.json` (delivered-change), same ordinary guard and registry hashes.

Each records `native:false`, `allowed:[]`, `refused:[]`; guard SHA `af06ff2a7e01558bb334f12694d81ae7b703c501eee11afd62c6d0fa3da7806d`, registry SHA `6d6492712cbe67ba7e0f525ca368d2ed54e41eca2bef1b750f4ea8959b4cbc6c`. External answers were scripted. No full audit, native Git/tool run, live model, performance comparison, or Plan 4 score was run or claimed.

## Concrete handoff to 11 and setup producers 13

All APIs below are owner-local additions. Frozen C6 exploration/timing/charge wire fields remain unchanged; protocol projection and durable collection are deliberately unwired here.

1. Build the actual delivery manifest using iteration 2, retaining the exact inherited point and source entries. Call `capture.deliveredScopeInputs(declared, manifest)` to obtain `{scope,supplementary}`. Merge these actual support observations into the frozen snapshot used for that invocation, retaining snapshot id and measure/view identities; do not replace them with the union of `loaded.files`. Duplicate supplementary paths must use the manifest's verified actual bytes rather than an older first entry. Conflicting support source revisions throw: record an unavailable support component/reason, rather than fall back to package inventory. Non-file declarations use `delivered-inputs/<kind>/<hash>` identities; current task/environment bookkeeping is not invented as a support file. Brief entries deduplicate by exact hash; differing delivered revisions remain different input content.
2. `capture.invocationScope(root,planId,declared,loaded,brief,manifest?)` accepts an additive sixth manifest argument and captures `locations[].files` for exact overlap accounting. Its legacy five-argument path remains compilable and uses the legacy available-package recipe; migrate production callers before claiming actual-delivery qualification. `deliveredScopeInputs` provides actual support supplementary bytes independently of disk capture. Capture failures must become explicit unavailable facts, not an absent-file zero.
3. Use `writeScopeMeasurement` for writer scope and `readScopeMeasurement(writeScope)` for the separate soft-read proxy. Call `scopeSize` on each separately. Do not add read bytes to the writer denominator. `componentSubtotal` retains known disjoint buckets; `projectOnlySize` strips architect/support components while preserving snapshot/policy and partial subtotal.
4. Pass the full frozen baseline `ScopeSize`, `Map<invocationId,ScopeSize|null>`, and `DeliveredChange` to `metrics.comparableScopeMetrics`. It returns `{projectOnly,total}`, each `ScopeComparison` containing `mean`, `ratio`, `attributedWeight`, `completeSizeWeight`, `unknownSizeWeight`, `unattributedWeight`. Mean numerator/subtotal is byte-lines; denominator is attributed text-line weight; measured value is bytes. Partial ratio value is null, and its note identifies the known byte-line subtotal. Retain all weight/coverage fields in protocol projection; do not collapse an unknown-size weight into complete coverage or normalize against the wrong component baseline.
5. `deliveredChange` accepts optional `harnessDeltas: HarnessLineIdentities = {base,final,entries:[{commit,path,added:number[]|null,deleted:number[]|null}]}`. **Producer verification is required:** added positions belong to the exact final revision, deleted positions to the exact base revision. Their commit is the added-line origin or deleted-line removing commit. This calculation compares existing `LineCommit.line` answers against these exact positions; it does not discover/migrate mappings from setup source-commit positions or counts. `[]` is verified no surviving setup lines; `null` is unknown mapping. Stale revision binding/invalid positions retain relevant origin weight as unattributed with reason. Producer 11/13 must transform recorded setup deltas to verified final/base identities or supply null. Never replace that verification with a count, broad same-path exemption, or subtraction of `min(count,count)`. Existing `harnessPaths` remains valid only for paths exclusively written by the harness; exclusive setup commit identities remain separately attributed.
6. Supply `LineEventRequest.overlappingWriters` when snapshot intervals overlap, preserving its coverage limit and known path facts. `DeliveredChangeRequest.overlappingPaths` identifies paths whose shared-commit writer split is uncertain. Apply explicit overlap before the single-writer fast path, preserving unrelated paths. Complete single-writer committed origins without an explicit overlap remain attributable independent of guarding. Do not classify an unguarded shell as incomplete solely because it was unguarded.
7. Persist frozen `ExplorationObservation` facts at the existing tool boundary, preserving original invocation/operation/session/turn/call/kind on replay and inheritance. Emit no new child observation for inherited calls. `explorationIdentity` names this source key. `explorationMetrics(observations,collectionLimits?)` returns the frozen `ExplorationMetrics`; numeric fields are known subtotals when coverage has limits. `explorationDetails` additionally returns `zeroMatchSearches` and deduplicated observations outside the frozen wire. Feed recorded call order: `repeatedReads` counts read calls containing at least one previously read file. Searches with `files:[]` still count and may be broad/outside; null files are unknown, not zero-match. Preserve collection-loss reasons; no transcript loss policy is weakened. Record environment names only, never credential/environment values in these facts.
8. `efficiency.invocationTiming` accepts explicit started/ended/milestone/milestoneAt plus optional model/check durations, observations, coverage; wall time comes only from boundaries. Missing tool durations leave total null with known subtotal in coverage. `estimateRecordedCharge` accepts model, separate new/cached/write/output token counts, and recorded per-million category rates; output is `RecordedCharge` labeled `estimated-from-recorded-rates`. Retain provider-recorded charges with their original label instead of estimating over them. Missing categories/rates leave amounts and total null. No price lookup, usage-category inference, milestone inference, or session strategy is implemented.

Changed paths: `subs/harness/src/kpi/{capture,delivered,lines,metrics,exploration,efficiency}.ts`; `subs/harness/src/tests/{kpi-metrics,scope-size-recipe,delivered-change,plan23-exploration-metrics}.test.ts`; this receipt. Existing `line-events.test.ts` was executed without modification.


## Integrated Git origin-fact amendment

Provider source `145ba776d90acb1a20bf5515b026e30edae9790d` was integrated as `f82b48cf`. Existing `LineCommit` now optionally retains exact `sourceLine`, decoded repository-relative `sourcePath`, and the verified cwd `projectPrefix`. Older scripted rows retain missing proof. Consumers may derive project-relative ownership only on an exact prefix match; outside-project origins and missing metadata remain unknown. This changes no attribution exclusions or settled C6 result shape.

Coordinator verification passed three ordinary files / 45 tests (pure parser, delivered change, exploration), the existing registered native Git file / 8 tests, all four type checks, and the structural check with 0 errors, 0 warnings and 317 analysis limits. Logs: `/tmp/ramify-plan23-integrated-git-line-facts-*.log`. The unchanged native title now also verifies nested/repository cwd prefixes, quoted UTF-8 rename origins and shifted source positions. This focused native provider check does not establish final Q01 qualification.

Reverse blame supplies BASE position to last-seen source position/path only. Producers 11/13 still need exact setup-before boundary queries, source/blob authentication and removing-successor proof for the frozen FINAL-added/BASE-deleted identities. They must preserve null/unavailable for absent or ambiguous proof; neither setup counts, commit trailers nor whole `.gitignore` paths prove ownership. No full audit, live transport or performance comparison was run.
