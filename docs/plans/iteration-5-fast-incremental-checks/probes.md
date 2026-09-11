# Iteration 1 probes and contract review

**Recorded:** 2026-09-11. **Review outcome:** revised package ready for user
review; RP-4 and RP-6 are **Proposed (recommended alternative), awaiting the
user's acceptance**. No I5 acceptance instance ran. The five component probes
are feasibility evidence, not implementation of a retained session, observer,
daemon host, hook command or acceptance harness. Publication and contract
acceptance remain separate.

## Reproduction and environment

Every command below ran in
`/tmp/worktrees/ramify-67e9dd0f/iteration-5-fast-incremental-checks`, on branch
`workflow/iteration-5-fast-incremental-checks`. Linux x64, kernel
`6.8.0-85-generic`, host `243168472f39`, `Intel(R) Xeon(R) E-2176G CPU @ 3.70GHz`,
Node **v22.23.2**, **typescript@7.0.2**. No macOS execution is claimed.
The initial inherited `NODE_OPTIONS` is `--max-old-space-size=8192`; P5-4
records why it relaunches its measurement process without that heap override.

`npm run worktree:prepare` installed example/site dependencies, and
`npm run build` produced the unchanged toolkit code imported by the probes.
Performance probes ran serially, without concurrent builds or regression runs.
No warmup sample is omitted. Each result records repetitions, timing samples or distributions, medians, host and runtime versions, probe/common script hashes and
fixture identities. `tsconfig.scripts.json` already selects `.mjs` through
inherited `allowJs`; `checkJs` is not enabled. No tsconfig change was needed.
Node syntax checks and real executions complement the static check.

| Probe command | Result file | Decision |
| --- | --- | --- |
| `node scripts/probes/fast-check/snapshot-update-costs.mjs /tmp/reference.json` | [snapshot-update-costs.json](../../../scripts/probes/results/snapshot-update-costs.json) | P5-1: compiler-update floors and configuration regeneration. |
| `node scripts/probes/fast-check/description-closure.mjs /tmp/reference.json /tmp/toolkit.json` | [description-closure.json](../../../scripts/probes/results/description-closure.json) | P5-2 / RP-3: dependency-driven catalog recomputation. |
| `node scripts/probes/fast-check/interpreter-setup.mjs` | [interpreter-setup.json](../../../scripts/probes/results/interpreter-setup.json) | P5-3 / I5-01: hoist project-sized setup. |
| `node scripts/probes/fast-check/worker-session.mjs` | [worker-session.json](../../../scripts/probes/results/worker-session.json) | P5-4 / RP-2 and RP-7: effective heap enforcement, responsiveness and report-copy cost. |
| `node scripts/probes/fast-check/observed-reads.mjs /tmp/reference.json` | [observed-reads.json](../../../scripts/probes/results/observed-reads.json) | P5-5 / RP-5: acquisition plus compiler observations equal completed batch inputs. |

Optional fixture arguments and the full preparation recipe are in
[the probe README](../../../scripts/probes/fast-check/README.md).

### Fixture identities

Fixture identities are SHA-256 over the sorted owned path/content-hash map;
configuration hashes and absolute roots are also in every archive. They are
not substituted for batch `inputId`, whose recipe includes the invocation
scope, registry and complete observations.

| Fixture | Root relative to this checkout | Owners / source files | Owned content identity |
| --- | --- | --- | --- |
| R | `examples/collection-review` | 15 / 54 | `95c62810f748d46382977f16daa846523e11a595925035f94154908e038a32f4` |
| T | `.` | 11 / 229 | `bf96ffa760c7ea6253fe2b5d3d7691e6c394d4adc68cc93ae42eafc0f8a4aaf1` |
| S100 | `.reference-work/P5-S100` | 100 / 1100 | `daa8a2e190fee520df0ed2a0874519ebeacd7aac4238c2ac133bb374f7236c22` |
| S1000 | `.reference-work/P5-S1000` | 1000 / 11000 | `6c7bbe1d5500935c1105f11efb0c4f03d58416d449f1f8126b8db65ba0392ae9` |

S100 and S1000 were materialized, respectively, with:

```sh
mkdir -p .reference-work
npx tsx scripts/measurements/materialize.ts .reference-work/P5-S100 S100
npx tsx scripts/measurements/materialize.ts .reference-work/P5-S1000 S1000
```

Both paths are gitignored. Generator content-map identities are
`d5b77b9ff57c443b35f386f40598506ff20c51c4ec75b800371f0cec089c0897`
(S100: 1,402 files, 1,164,385 bytes) and
`0f1ee6d693912b2bc925f41b5543487fa1b42055497e75599bfe8aef13c38c59`
(S1000: 14,002 files, 11,641,012 bytes). They remain local for reproducibility;
no generated fixture is staged by this work. S500 was not materialized or
measured in iteration 1.

## P5-1: snapshot updates

Five samples per operation and fixture. Edits are compiler filesystem
overrides, never disk writes. Timing includes `updateSnapshot` and disposal
of its predecessor; the source query asserting the changed text is outside
timing. Acquisition, initial open and each revert are excluded.

| Median ms | R | S100 | S1000 |
| --- | ---: | ---: | ---: |
| Body insertion | 0.88 | 1.05 | 13.07 |
| Added import | 147.77 | 143.69 | 1476.66 |
| Created file plus regenerated explicit roots | 144.92 | 146.79 | 1537.54 |
| invalidateAll, unchanged disk | 276.98 | 213.26 | 1955.00 |

Every unreferenced created-file trial stayed outside the program without
regenerating the synthetic configuration; every regenerated-root trial entered
and then left on deletion. A separate positive control at each size shows that
an existing source importing the newly created file can bring it into the
program without regeneration. Explicit owned-root membership still requires
regeneration, independently of whether another source imports the file.
The S1000 import/configuration costs materially exceed the spike's small-fixture
65–133 ms observation. The single scope revision accounts for that distinction.

## P5-2: description closures

A direct compiler AST scan records star, named and namespace export statements
and locally re-exported imported bindings; the existing configured `Resolution`
resolves targets. Reverse transitive reach includes the changed file itself.
Three complete graph traversals per fixture produce identical closure sizes.
Archives retain median/p90/p99/max, a closure histogram, edge counts and the
50 largest closures per fixture. Full per-file lists live under ignored
`.reference-work/probe-details/description-closure/`, with path and byte hash
in the archive. Percentiles use nearest rank; medians average the middle pair.

| Fixture | Star / forwarding / namespace edges | Median / largest closure |
| --- | --- | --- |
| R | 0 / 1 / 0 | 1 / 2 |
| T | 13 / 54 / 0 | 1 / 5 |
| S100 | 0 / 0 / 0 | 1 / 1 |
| S1000 | 0 / 0 / 0 | 1 / 1 |

All selected edges resolved. S100 and S1000 contain no forwarding edge; none
of these fixtures contains a namespace forwarding edge. This supports RP-3
without proving namespace, resource-shim, absence, inferred dependency or
ambiguity propagation. I5-03's independent graph mutations and closure-superset
comparisons remain required. These are closure counts, not measured per-file
catalog extraction times.

## P5-3: interpreter setup

This branch has neither `only` nor a maintained interpreter. A Node load hook
changes the loaded compiled `accesses.js` text at asserted unique anchors,
without editing source or dist. It adds the spike's only-filtering, measures
Resolution/catalog/original/sorted-inventory setup, and reuses that setup in the
paired hoisted call. The hoisted path visits selected paths directly.
The real current namespace and semantic extraction code remains unchanged.
Twenty paired calls on S1000's `src/impl0.ts` return the same two accesses
and identical coverage. This is a fixed-snapshot prototype; snapshot switching,
changed-original maintenance and deletion remain iteration 2/5 work.

Per-call setup median **45.27 ms**; complete
one-file call **47.70 ms**. The hoisted call is
**0.93 ms**, with setup retrieval
0.000382 ms. Replacing one unchanged catalog entry
is separately recorded; it does not prove incremental maintenance correctness.
RP-3 and the unchanged-surface budgets therefore depend on iteration 2 actually
removing project-sized setup from each call.

## P5-4: worker hosting

Three 512 MiB worker opens retain a real S1000 compiler snapshot, catalog and
access facts. This prototype omits model/link, decisions, observer maintenance
and publication. Cold work median is **21.51 s**;
launch through report-payload preparation is 23.57 s.
A 10 ms main-thread timer records 2331, 2348, 2330
ticks; each run archives count, median/p95/p99/max and interval buckets in ms
(0–10, 10–15, 15–20, 20–50, 50–100, 100–250, 250–1000, over 1000),
with exclusive lower and inclusive upper bounds. The largest observed gap is **73.48 ms**.

Each worker sends five structured clones, without a transfer list, of
82,274,359 bytes of JSON-equivalent data (78.46 MiB):
distinct copies of actual inventory/catalog/access objects sized to at least
the spike's 66 MiB report. This is explicitly a report-sized stand-in, not a
compact session revision. All received hashes match. Median delivery is
**1013.19 ms**; worker-side `postMessage` is **368.27 ms**. Payload
construction and checksum validation are outside these timings. Large reports
must remain on demand; compact-revision latency still needs measurement.

The inherited 8192 MiB old-generation flag defeats the requested 16 MiB limit.
The worker reports `resourceLimits.maxOldGenerationSizeMb: 16`, yet
`v8.getHeapStatistics().heap_size_limit` is
**8,640,266,240 bytes**. Thus reading only
`resourceLimits` is an insufficient preflight. The first unisolated heap witness
was terminated with SIGTERM, exit 143, after observed process RSS reached
7,939,100 KiB; no compiler child remained at termination. That failed attempt
is preserved in the result, not described as a passing resource test.

The measurement relaunches without that heap flag. Three separate workers
reach their allocation loop, then each emits **ERR_WORKER_OUT_OF_MEMORY** and
exits 1 at the requested 16 MiB old / 4 MiB young limits. RP-2 selects a worker
only when its effective limit is enforceable, with the same-contract child
fallback otherwise. The hosting implementation must detect this environment.

Cold worker heaps span 175.9–186.1 MiB;
compiler RSS spans 321.2–346.7 MiB.
The native compiler child is outside V8 worker limits. Process RSS counts the
whole daemon process once, not once per worker. The probe uses Linux `/proc`;
macOS RSS collection and execution remain pending. All three successful opens
dispose their compiler and worker. Heap exhaustion is induced without a compiler
child, so production child cleanup after a worker OOM remains an I5-08 obligation.
No multi-context or 200-cycle memory plateau was measured.

## P5-5: observed reads

Three independent trials each on R and S100. The expected set is a real
`readProject` capture completed by production `createSourceAnalysis.catalog`
and `accesses`, then sealed. A separate acquisition feeds a direct compiler
whose sink records all callbacks and synthetic-name occupancy enumeration.
The recorded operations are replayed through unchanged Capture semantics,
both alone and merged with acquisition. There is one unchanged-file
notification after cold extraction; no changed-input equivalence is claimed.

| Fixture | Batch / merged inputs | Compiler-only inputs | Compiler-only missing / changed / extra | Merged equality |
| --- | --- | ---: | --- | --- |
| R | 3549 / 3549 | 3547 | 2 / 90 / 0 | Paths, roles, identities, bytes and inputId equal in 3/3 trials. |
| S100 | 2367 / 2367 | 2366 | 1 / 1401 / 0 | Paths, roles, identities, bytes and inputId equal in 3/3 trials. |

The compiler-only R set lacks the invocation directory observation and
`subs/integration-tests/src/tests` absence; S100 lacks the invocation directory
observation. It also assigns dependency roles where acquisition records source,
resource, description, README or configuration roles, and lacks some exact-name
identity evidence. Every exact difference is archived: missing/extra entries in full and changed
fields with both values in tables grouped by changed fields and role pair;
each row names an exact path.
Unlisted fields are equal. Complete batch, merged and callbacks-only lists
and expanded differences are in ignored `.reference-work/probe-details/observed-reads/`
files. The archive records their paths and byte hashes, canonical sorted list
hashes, role counts, input IDs and per-trial equality; no difference is sampled.

RP-5 selects equality through the merged observer. A file/hash/list-only sink
cannot replace Capture's kind, realpath, exact-name, role-precedence and virtual
occupancy semantics; contracts.md adds an explicit probe operation. This
quiescent replay proves feasibility, not a concurrent synchronous observer.
Iterations 4 and 5 must implement coherent changed-input observation and matching
batch identities rather than copy observations from a prior batch report.

## Package review and decisions

| Document | Before | Recorded outcome and revisions |
| --- | --- | --- |
| contracts.md | draft | Revised, awaiting RP-4/RP-6. All eight proposed-contract rows reviewed. Separate live ports from serialized facts; keep compiler-bearing constructors private; specify finite public factory signatures, plain candidate records, asynchronous disposal, probe observations, exact historical report/release methods, invalid publication, per-lease invocation preservation, model position refresh, covering freshness and complete CLI reasons/warnings/coverage. |
| owners.md | draft review package | Manual review passed with revisions, acceptance pending. Six added lines, one removed line, five revised relay lists; fix A7/root activation prose and explicit CLI type paths. Future exports remain staged, not claimed present. |
| scope.md | draft review package | Revised, acceptance pending. Merged observation recipe, freshness, server loss, historical retention, effective heap enforcement and process accounting; one budget revision. |
| subcases.md | draft review package | Revised, acceptance pending. Preserve all 103 IDs/counts; correct baseline access count, snapshot overlap, forwarding-chain reach, renamed binding identity, type/value flags, deadlines, unavailable-start fixtures, history and advisory memory expectations. |

The unchanged declaration portions were expanded from the real files and all
eleven texts parsed with the production description parser. Manual review also
checked physical ownership, source/test roots, direct-child relays, mandatory
tags, separate foreign-type visibility, owned-only wildcard expansion and
collision/growth semantics. New values belong to analysis/project/typescript
with no required-importer tags; CLI/root/daemon remain dispatch-classified,
and owned tests keep their derived testing profiles. No module.ramify is edited.

The 103 unique rows match every main-matrix variant and the iteration counts
10/7/8/7/10/11/8/13/9/5/9/6 for iterations 2–13. The current toolkit batch
baseline is eleven owners, 229 sources, 2,744 accesses and no findings or limits;
the draft's 2,746 access expectation is corrected. Reference is fifteen owners,
54 sources, 294 accesses, no findings/limits and two warnings.

The review decisions and scheduling confirmation are recorded here:

| ID | Question | Alternatives | Recommendation or decision |
| --- | --- | --- | --- |
| RP-1 | Number and position | (a) Plan 5 before Plan 3; (b) a new number after Plan 6 | Confirmed: (a); not reopened. |
| RP-2 | Session host | (a) worker thread with `resourceLimits`; (b) child process | Selected (a) when effective V8 limits are enforced; (b) is required fallback when inherited heap flags override them. P5-4 finds `NODE_OPTIONS=--max-old-space-size=8192` in this environment; isolated runs deliver explicit OOM and responsive cold opens. Large report clones take about 1 s and remain on demand. |
| RP-3 | Per-file catalog algorithm | (a) dependency-driven recomputation over the closure with the same fixed point; (b) whole-project catalog first | Selected (a). P5-2 forwarding closures have median 1 on R/T/S100/S1000 and maxima 2/5/1/1. Namespace edges are absent from these fixtures; their propagation still needs independent I5-03 witnesses. |
| RP-4 | Plan 2 supersession | (a) retire the reuse instances by amendment; (b) keep a compatibility shim | Proposed (recommended alternative), awaiting the user's acceptance: (a). Iteration 9 lands the amendment and deletion together; no user acceptance is claimed. |
| RP-5 | Input identity | (a) observe compiler reads and equal batch; (b) accept a smaller set and different identity | Selected (a), with acquisition and capture-compatible probe semantics retained. P5-5 reproduces all 3,549 R and 2,367 S100 observations and their input IDs in three runs each. Callbacks alone miss paths and roles; they are not a replacement for acquisition. |
| RP-6 | Binding targets | (a) R/S100 hook targets bind at iteration 12; other targets advisory; (b) all advisory | Proposed (recommended alternative), awaiting the user's acceptance: (a), using scope.md's single probe-based revision. No target is represented as user-accepted. |
| RP-7 | Hot contexts and sweep interval | Two hot contexts and a 30 s sweep while active, or other values | Confirmed: two and 30 s. P5-4 supports isolated hosting, not a multi-context memory plateau or sweep measurement. Runtime limits remain enforced; iteration 12 records those unmeasured costs and cannot silently revise the reviewed defaults. |
| Scheduling | Iteration dependencies and parallel work | Keep the draft schedule or revise dependencies | Confirmed: 3/4 parallel after 2; 11/12 parallel after 10; 4 requires only 2; 5 requires 3 and 4; 6 requires 4 and 5. Only iteration 9 removes Plan 2 source, with the accepted supersession amendment in the same commit. No iteration file or manifest change. |

The requested main-plan decision table, scheduling confirmation and review
corrections are preserved as an exact patch in the managed
[iteration results](iterations/iteration1-results.md#publication-policy-and-preserved-main-plan-revision):
workflow publication rejects edits to the frozen main-plan.md. Applying that
plan revision remains pending; the iteration does not bypass the file policy.
The package documents govern the reviewed definitions where the frozen main
plan differs. RP-4 and RP-6 remain proposed, awaiting the user's acceptance.

The single budget revision changes R source 200→250 ms, R created/deleted file
400→600 ms, and advisory S1000 source 2→3 s; scope.md names measured floors and
the rounding rationale. Other targets and numeric session defaults remain.
Memory accounting includes historical/candidate facts and distinguishes worker
heap, process RSS and compiler RSS. R/S100 binding still depends on RP-6.

## Verification ledger

All entries use the exact working directory stated above; `W` below abbreviates
that directory. Exit 0 means the named check passed, not an I5 acceptance gate.
Batch commands shared an endpoint created by
`export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"`; stop used that same environment.

| Command | Cwd | Result and output |
| --- | --- | --- |
| `npm run worktree:prepare` | W | Exit 0; example and site dependencies installed. |
| `npm run type-check` | W | Exit 0, initially and after probe additions; all four compiler scopes. |
| `npm run build` | W | Exit 0, initially and after probe additions. |
| `node dist/src/cli-entry.js check --root examples/collection-review --batch --format json > /tmp/reference.json` | W | Exit 0; completed, 15 owners, 54 sources, 294 accesses, two warnings, no findings. |
| `node dist/src/cli-entry.js check --root . --batch --format json > /tmp/toolkit.json` | W | Exit 0; completed, 11 owners, 229 sources, 2,744 accesses, no warnings/findings/limits. |
| `node dist/src/cli-entry.js daemon stop` | W | Exit 0; no daemon running. |
| `npx tsx scripts/measurements/materialize.ts .reference-work/P5-S100 S100` | W | Exit 0; frozen S100 identity matched. |
| `npx tsx scripts/measurements/materialize.ts .reference-work/P5-S1000 S1000` | W | Exit 0; S1000 materialized. |
| `git check-ignore .reference-work/P5-S100 .reference-work/P5-S1000` | W | Exit 0; both ignored. |
| `node scripts/probes/fast-check/snapshot-update-costs.mjs /tmp/reference.json` | W | Exit 0; five samples per class/fixture, membership assertions pass. Repeated after adding imported-created-file control. |
| `node scripts/probes/fast-check/description-closure.mjs /tmp/reference.json /tmp/toolkit.json` | W | Exit 0; four fixture graphs and three traversals each. |
| `node scripts/probes/fast-check/interpreter-setup.mjs` | W | Exit 0; twenty paired calls, deep equality. |
| `node scripts/probes/fast-check/worker-session.mjs` | W | First attempt stopped, exit 143, because inherited V8 flag defeated the limit; isolated reruns exit 0, with three explicit worker OOM exits recorded. Final run adds effective V8-limit and allocation-loop evidence. |
| `node scripts/probes/fast-check/observed-reads.mjs /tmp/reference.json` | W | Exit 0; three equal merged captures per fixture. Repeated for compact archives with hashed local details. |
| `node scripts/probes/fast-check/review-package.mjs` | W | Exit 0; 103 unique IDs, matrix/count agreement, eleven parsed declarations, six additions, one removal, five revised relays. |
| `ls scripts/probes/results/{snapshot-update-costs,description-closure,interpreter-setup,worker-session,observed-reads}.json` | W | Exit 0; all five archives present. |
| `git diff --check` | W | Exit 0; no whitespace errors. `git diff --cached --check` also exits 0. |

Final `for probe in scripts/probes/fast-check/*.mjs; do node --check "$probe" || exit; done` exits 0 for every imported and new probe. Final document validation also exits 0. All five archived script/common hashes match the current files. Eleven imported evidence/probe files match the spike byte for byte, and the original README header and body are preserved around the inserted section. The original review changes stayed within the write boundary; main-plan.md
has since been restored for publication policy, as recorded below.
The only failed measurement attempt was the explicitly stopped inherited-limit
P5-4 trial. An intermediate documentation-edit command and a summary-print
command had Python/JavaScript syntax errors before writing; corrected commands
completed, and neither failure supplied measurement evidence. The first README provenance assertion incorrectly required the original header and body to remain contiguous; the corrected comparison accounts for the authorized inserted section and passes.

Intentionally skipped under the supplied check policy: `npm test`, full Vitest,
Cucumber, `npm run reference:cases`, scenario coverage, sealed-file checks,
full Plan 1/2/5 gates and the non-dry reference report. No automated verdict is
claimed. No workflow MCP tool, commit, push, branch creation or publication ran.

## Follow-up: frozen plan and compact archives

The follow-up changes only contracts.md, owners.md, scope.md, subcases.md,
probes.md, the fast-check README, the three probe scripts named below and
their result JSON files. Pre-existing imported and staged files remain as found.
main-plan.md is byte-identical to HEAD, SHA-256
`cb9d4cda23ef03612f30e48e3086f116313f17d02e4a8aaa047da3ba1db4aaa7`.
The preserved `/tmp/plan5-iter1-main-plan.patch` is unchanged, SHA-256
`c3bd2c7a4911de145354dc5ae0f5b9bc976aa8aede2c5ddc189e20a05d36f536`.

| Archive | Previous bytes | Rerun bytes |
| --- | ---: | ---: |
| observed-reads.json | 4,894,566 | 101,554 |
| description-closure.json | 448,324 | 36,277 |
| worker-session.json | 217,646 | 12,106 |

All three are below 100 KiB. The observation archive contains every changed
field's old/new value, every affected path, and complete missing/extra entries;
unchanged record fields are kept in the hashed detail files. The probe asserts
that the compact tables reconstruct each full changed record exactly when
applied to its expected observation. No observation difference is sampled.

| Headline | Previous → rerun |
| --- | --- |
| P5-4 cold work median | 21.57 → 21.51 s |
| Launch through payload preparation median | 23.59 → 23.57 s |
| Main-thread ticks, three runs | 2329 / 2343 / 2334 → 2331 / 2348 / 2330 |
| Largest timer gap | 68.14 → 73.48 ms |
| Clone delivery median, all 15 samples | 1004.79 → 1013.19 ms |
| Worker postMessage median, all 15 samples | 373.57 → 368.27 ms |
| Cold worker heap range | 182.9–187.2 → 175.9–186.1 MiB |
| Compiler RSS range | 334.7–358.0 → 321.2–346.7 MiB |

P5-2 edge counts and median/max closures are unchanged; newly archived
p90/p99 are R 1/2, T 2/4, S100 1/1 and S1000 1/1. P5-5 counts, exact
differences and batch/merged input IDs are unchanged, with equality in all
six trials. The worker payload remains 82,274,359 bytes; all 15 clone hashes
match, all three compiler children exit and all three 16/4 MiB heap witnesses
emit `ERR_WORKER_OUT_OF_MEMORY` and exit 1 after entering their allocation loop.
The preflight still measures an 8,640,266,240-byte effective heap under the
inherited 8192 MiB override. Interpretation, budgets and review decisions are
unchanged. scope.md now records the precise 21.51 s cold median; contracts.md
and subcases.md have no changed measurement headlines.

These final reruns used the commands below, serially, in `W` (the working
directory in Reproduction and environment). The worker command inherited
`NODE_OPTIONS=--max-old-space-size=8192`; its preflight child relaunched with
that flag removed for cold sessions and heap-limit trials, matching the prior
passing run. No build or test ran concurrently with a performance probe.

| Command | Cwd | Exit/result and output summary |
| --- | --- | --- |
| `node scripts/probes/fast-check/description-closure.mjs /tmp/reference.json /tmp/toolkit.json` | W | 0; four fixtures, three equal traversals each; compact archive written. |
| `node scripts/probes/fast-check/worker-session.mjs` | W | 0; three cold sessions, 15 clones, three expected OOM failures; compiler cleanup confirmed. |
| `node scripts/probes/fast-check/observed-reads.mjs /tmp/reference.json` | W | 0; three trials per fixture, exact merged equality; compact differences verified. |
| `npm run type-check` | W | 0; all four TypeScript scopes. |
| `node scripts/probes/fast-check/review-package.mjs > /tmp/plan5-review-package.log` | W | 0; frozen main-plan matrix passes unchanged validator: 103 IDs, eleven declarations, six additions, one removal, five revised relays. |
| `for probe in scripts/probes/fast-check/*.mjs; do node --check "$probe" || exit; done` | W | 0; all probe/helper syntax checks. |
| `python3 /tmp/plan5-check-links.py` | W | 0; six documents scanned using the previous relative-file-link method. Seven known absent targets plus the pending coordinator-managed iteration results file; fragments are stripped, not validated. |
| `python3 /tmp/plan5-check-evidence.py` | W | 0; five script/archive/common hashes match both documents; detail hashes and ignore status, distributions, exact difference reconstruction, equality and cleanup assertions pass; main-plan bytes/status unchanged. |
| `git check-ignore .reference-work/probe-details/observed-reads/R.json .reference-work/probe-details/observed-reads/S100.json .reference-work/probe-details/description-closure/R.json .reference-work/probe-details/description-closure/T.json .reference-work/probe-details/description-closure/S100.json .reference-work/probe-details/description-closure/S1000.json` | W | 0; all six detail files ignored. |
| `git diff --check` | W | 0; no whitespace errors. |
| `git diff --cached --check` | W | 0; inherited staged changes have no whitespace errors. |
| `git status --short` | W | 0; main-plan.md absent; all follow-up edits within the allowed documents/probes/results. |

The link check does not claim a fully resolved package: the seven prior
missing targets and the pending managed result are listed under Unresolved
context and follow-up. No protected file was changed to resolve those links.
The previous intentional skips remain: full tests, Vitest, Cucumber, reference
runners, Plan 1/2/5 gates, sealed/workflow checks and publication. P5-1 and P5-3
were not rerun; their unchanged scripts, common helper and archives still match
recorded hashes. No workflow MCP, commit, push or publication ran.

## Probe and archive SHA-256

Hashes cover exact file bytes, including trailing newlines. P5-2/P5-4/P5-5
archives below are the compact reruns; P5-1/P5-3 remain the earlier evidence.

| Probe basename | Script SHA-256 | Archive SHA-256 |
| --- | --- | --- |
| snapshot-update-costs | `2d9e1948e18ef62ca7b54234d4e4b4cdbdaa1f43d74bd0609ef584b85a63306a` | `459fa44f244928a7b33cb5f2f7faf48d0261eca68b972c294915dd927b063dce` |
| description-closure | `863a1fcb3a957face57648785ef79c15dac37facf062892a33ddb6eb3337a094` | `962135c3e000f21ba1be0785c83fe9817aa6dad038cc2f90133e2d767db2d418` |
| interpreter-setup | `6de96a3291ea9de19b5b5379572ade00d0b3a46933b251195173f3a01dbab86b` | `0a153606d4c70b1e60bdcf22d39d300dc466785d1eabdfc3e3a586d1e8434602` |
| worker-session | `d46e50f3e2df33f724d5562384fb6cbe83ad6a96f6b6f8727609898add445ee2` | `bf4bc92fa93e1b59da22bbf841db46ae072775f96915e4e1011dba91883c8641` |
| observed-reads | `8cd1f6edf65377d62547cdaf9d6151641b0035755bfb218bf1b23fb6aa9446c2` | `c120a86865a9faac5f1233f340bb4b3ea618b5232c2758d5dd0a899884bf7350` |

Shared `p5-common.mjs`: `bddbe40e5d0e581a84daa10bd4141faa7f8946081ded5fc3feb37d6a2bf89fdd`.

## Files and provenance

Read CLAUDE.md, development implementation/testing/engineering guidance,
iteration-work/testing skills, main-plan.md, iteration1.md and the four review
documents in full. Context included daemon, memory, process/client and quick-test
architecture; module-description, importability, glossary and source interface
rules; current eleven module declarations; Plan 2's iteration1, probes,
iteration14-results, contracts, owners and scope at their current directory;
`git show dcc8309`; the spike README, five throwaway probes, RESULTS.md,
session.ts and engine commit `b62cab0`; the retained-session analysis from the
spike branch; package/tsconfig, materializer and generator; Plan 2 compiler API,
lifecycle, config-input and warm-recompute probes; and current compiler helper,
bridge, Capture, acquisition, catalog, accesses, resolution, model, report input
identity and installed TypeScript API/transport code.

Changed package documents: contracts (reviewed signatures), owners
(declarations/type paths), scope (lifecycle/budgets), subcases (expectations/count
review), and this new probes.md (decisions, schedule, recipes, evidence and
ledger). main-plan.md is frozen and unmodified; its exact proposed revision is
preserved in the managed
[iteration results](iterations/iteration1-results.md#publication-policy-and-preserved-main-plan-revision)
and remains pending a plan revision.
Created the five named P5 probes, `p5-common.mjs` (shared measurement support),
`review-package.mjs` (document validation) and the five named result JSON files.
Extended the probe README with the current recipes and measurement limits.

Brought verbatim from `spike/fast-check-retained-session`: the original
`scripts/probes/fast-check/README.md` (then extended here), `stage-timing.mjs`,
`decide-timing.mjs`, `warm-compiler-stages.mjs`, `warm-compiler-cycles.mjs`,
`worker-thread.mjs`; `scripts/spikes/fast-check/RESULTS.md`; and its
`results/reference-sequence.json`, `S100-sequence.json`, `S500-sequence.json`,
`S1000-sequence.json`, `hook-end-to-end.json`. These restore cited evidence and
historical probes without importing spike TypeScript, tsconfig.driver.json,
engine changes or the optional driver. Type-check passes with this material.
Git checkout staged those imported files; no commit or publication was made.

## Unresolved context and follow-up

- RP-4 and RP-6 await user acceptance; iteration 2 is not independently released
  by this review. Later signature/budget changes revise this package first.
- The coordinator-managed `iterations/iteration1-results.md` is not present
  yet. Its required `#publication-policy-and-preserved-main-plan-revision`
  link remains pending coordinator publication; this follow-up does not create
  or edit managed results.
- The Plan 2 directory move remains outside scope. Unresolved targets under
  `docs/plans/done/iteration-2-resident-verification/` are `contracts.md`,
  `owners.md`, `scope.md`, `subcases.md`, `probes.md`,
  `iterations/iteration1.md` and `iterations/iteration14-results.md`. Existing
  `../done/` links are preserved. The future supersession-plan5.md amendment
  also does not exist yet and belongs to iteration 9.
- `docs/analysis/fast-incremental-checks-retained-session.md` is absent locally
  and was read with git show from the spike. `docs/analysis/fast-incremental-checks.md`
  is absent locally and on both named fallback branches; its referenced contents
  could not be read. Neither missing analysis file was copied outside the write
  boundary. The spike RESULTS.md is historical evidence; its reproduction
  commands require spike TypeScript sources intentionally absent here.
- Plan 2's cited iteration14 report is an old incomplete checkpoint, while
  current source has its later resident providers. This iteration verifies the
  batch baselines and does not establish the full remediation gate or macOS pass.
- Full concurrent observation, dynamic description dependencies, maintenance
  across snapshots, compact revision clone cost, OOM compiler-child cleanup,
  two-hot/six-warm memory and the 200-cycle plateau remain later evidence.
  Worker resource enforcement must account for inherited V8 flags. Linux-only
  `/proc` memory collection needs a macOS counterpart before that platform run.
- The materialized fixtures and full probe details are ignored local artifacts;
  the five JSON archives
  are intentional evidence. No defect outside the authorized write boundary was
  repaired, and no owner or model source was changed.
