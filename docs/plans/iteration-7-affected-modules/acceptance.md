# Acceptance and implementation evidence

[Plan 7](main-plan.md) completes only when every instance in
[cases.json](cases.json) passes. The inventory contains 88 independently
expected cases across 17 rows. Stable IDs identify behavior; assertions must
not calculate their own expected answers using the production graph builder.
`A -> B` means A depends on B. Short fixture names stand for full inventory IDs.

## Fixtures and matrix

Analysis unit helpers live in `subs/analysis/src/tests/affected-fixtures.ts`.
Real source fixtures are disposable projects created by owned session tests.
Root process helpers live in `src/tests/affected-fixture.ts`; other owners use
public contracts or root's existing testing exposure, not private sibling tests.
Use the actual reference project and copies of explicit source fixtures.

| Row | Fixture / independently expected instances | Iteration | Required evidence |
| --- | --- | --- | --- |
| A7-01 | `provider-contract`: `retained-fields`, `readiness`, `consumer-access` | 1 | review |
| A7-02 | `chain-diamond-cycle`: `diamond-cycle`, `multiple-seeds`, `isolated`, `duplicates-order`, `empty`, `root`, `unknown`, `malformed` | 2 | unit |
| A7-03 | `source-forms`: `barrel-original`, `star`, `namespace`, `type-only`, `literal-dynamic`, `discarded-dynamic`, `side-effect`, `denied`, `no-invented-edges` | 2 | session |
| A7-04 | `test-owners`: `owned-tests`, `testing-module`, `excluded-tests` | 2 | session |
| A7-05 | `resource-shim`: `owned-shim`, `shared-shim`, `contributors`, `resolution-probes` | 2 | session |
| A7-06 | `body-and-module-boundary`: `body-edit`, `different-files` | 2 | session |
| A7-07 | `revision-edits`: `duplicate-import-removal`, `add-revert`, `file-lifecycle`, `barrel-retarget`, `owner-change`, `position-and-audit` | 2 | session |
| A7-08 | `coverage-and-readiness`: `unresolved`, `namespace-unknown`, `nonliteral-dynamic`, `unsupported-loader`, `shared-global`, `outside-module`, `missing-stages`, `invalid-current`, `partial-empty`, `invalid-owner` | 2 | session |
| A7-09 | `worker-read`: `hot-query`, `warm-query`, `release-and-update`, `cancel-large-occurrence`, `limits`, `serialized-yields` | 2 | worker |
| A7-10 | `revision-race`: `covering-update`, `already-covered`, `superseded`, `unobserved-input` | 3 | quick |
| A7-11 | `context-lifecycle`: `worktree-isolation`, `cold-wait`, `generation-disposal`, `historical`, `last-valid`, `cancel-lease` | 3 | quick |
| A7-12 | `daemon-ipc`: `equivalence`, `validation`, `capability`, `disconnect`, `lightweight` | 3 | ipc |
| A7-13 | `cli-command`: `json-human`, `arguments`, `changed`, `partial-failed`, `cancel` | 4 | cli |
| A7-14 | `mcp-tool`: `registration`, `stdio-result`, `freshness`, `errors`, `cancel-disconnect`, `process-boundary` | 5 | mcp |
| A7-15 | `cross-client`: `reference`, `chain`, `partial` | 6 | integration |
| A7-16 | `resource-budgets`: `sparse-latency`, `dense-latency`, `temporary-memory`, `overlap-bounds`, `hook-regression` | 6 | measurement |
| A7-17 | `regressions`: `predecessor`, `project-checks`, `case-completeness` | 6 | gate |

`unit` uses explicit detached facts. `session` uses the real retained adapter
and committed revisions over source fixtures. `worker` runs the real worker.
`quick` uses real services with controlled clocks/events. `ipc`, `cli` and
`mcp` require actual transports/processes (MCP includes SDK in-memory controls
and stdio). Integration compares those clients at one input identity.
Review, measurement and gate evidence are separate from behavioral test passes.

The fixtures explicitly cover model ownership/testing, source form/coverage,
DA revision and queue behavior, PC process boundaries, ML retention and QT
real-service behavior. These are Plan 7's scoped additions; they do not claim
completion of unrelated browser/visualization or unsupported runtime families.

## On-demand resource bounds

The [prototype comparison](storage-strategy-comparison.md) measured p95
scan/build/traverse of 3.859 ms sparse and 33.955 ms dense, with temporary graph
live heaps about 0.40 MiB and 2.54 MiB. It excludes full worker/service work.
The following **proposed acceptance budgets** allow integration overhead;
iteration 1 binds the measurement host and reviews them before implementation
acceptance. Any revision requires recorded evidence and an explicit contract
change, not silent threshold adjustment after a failing run.

| Boundary | Proposed rule |
| --- | --- |
| Active builds | One per worker; admission and queued requests use Plan 5 limits. |
| Query inputs | At most 4,096 seed entries and 64 KiB serialized query; validate before large allocations. |
| Graph | At most 4,096 inventoried modules and 100,000 unique non-self edges. Source records retain Plan 5's existing bounded source/fact limits. |
| Answer | At most 1 MiB UTF-8 serialized service answer, including scope/coverage; also respect any stricter predecessor transport bound. |
| Active worker query | At most 1,000 ms, with cancellation/deadline checks every <=1,024 work items including nested selections/forwarding. |
| Sparse projection | Scan/build/traverse/result p95 <=15 ms for the source-shaped 10,000-edge workload. |
| Dense projection | Scan/build/traverse/result p95 <=100 ms for the source-shaped 100,000-edge workload. |
| Integrated ready query | Actual reference/toolkit worker p95 <=15 ms and direct-service round trip p95 <=40 ms, with normal Plan 5 limits. |
| Temporary live heap | Additional graph/traversal/result heap <=4 MiB sparse and <=16 MiB dense in the paused live-query measurement. |
| Settled memory | After 200 completed/cancelled queries and forced GC, added retained heap <=1 MiB versus the same ready session baseline; no graph references remain. |

An over-limit query returns `resource-limit` or `deadline-exceeded`, never a
truncated successful list. Boundary tests exercise exactly-at-limit and
one-over-limit values, counting unique edges despite duplicate occurrences.
A too-large coverage/scope envelope fails explicitly. Response measurement
includes the context wrapper, not only the inner selection.

Use explicit source-shaped projection workloads: sparse 1,000 modules/25,000 accesses/
10,000 unique edges and dense 1,000 modules/220,000 accesses/100,000 edges,
matching the prototype's selection shape. These stress the production projector
through an owned measurement test; they are not compiler-created live-session
capacity claims. Full source records may exceed Plan 5's fact budget even when
their compact projection inputs fit. Include chain, cycle, diamond,
fan-in and isolated seeds. Plan 5's S100/S1000 generator alone is insufficient:
its existing imports stay within owners. Measure integrated worker/service
queries on the actual reference/toolkit and an additional real cross-module
fixture whose captured facts fit the default Plan 5 limits. Record that fixture's
actual scale at iteration 1; require the same 15/40 ms ready-query targets.
If full facts exceed limits, verify explicit resource unavailability; do not
raise production limits or substitute projection timing for integration.
Keep source/fact preparation outside
ready-query timers and report cold startup, synchronization, IPC/CLI/MCP
latency separately. Do not attribute normal compiler startup to graph building.

Record 20 warmups and 200 measured queries, p50/p95/max, operation counters,
exact commits, Node/platform/hardware, sizes and raw samples. Use a test-only
pause while a complete graph and result remain live to measure additional
GC-settled heap against already-retained facts; also report observed peak heap
and RSS separately. RSS need not fall immediately after references are released.
Neither JSON byte limits nor the paused measurement are a physical RSS ceiling.
Plan 5's overall worker/context memory limits remain binding.

Across 1,000 ordinary updates, assert zero affected graph builds/maintenance.
Two successive queries build twice; no hidden cache survives. Interleave a
large query with an update and cancellation, verify queue serialization and
new-revision results, and report additional update wait. The overlapping query
can delay its worker; the 1,000 ms cap and cooperative cancellation bound that
work. Preserve Plan 5's hook gates without affected queries, and report overlap
separately rather than treating this occasional feature as a hook workload.

## Evidence registration and final gate

Iteration 2 adds `scripts/verify-affected.mts` and `npm run verify:affected`.
This is an evidence validator, not a second implementation of graph semantics.
Tests put their exact case IDs in results and retain source/sequence assertions.
The validator reads fresh Vitest JSON plus provider review, measurement and
command records from a caller-supplied temporary evidence directory. Require
one independently asserted result per declared ID, correct evidence level,
source commit/run identity, no missing/duplicate/unknown IDs, and no skipped
required cases. The validator itself produces A7-17:case-completeness from
that inventory comparison; it does not require a prewritten passing record
for its own result. Unit graph results cannot satisfy a worker or process case.
The default gate requires all six iterations; an explicit iteration slice can
validate intermediate progress but cannot report plan completion.

Iteration 6 adds `scripts/measurements/affected.mjs` and
`npm run measure:affected -- --output <path>`. These and `verify:affected` are
implementation deliverables, not commands that already exist. Verification
records remain test artifacts; they are not a second workflow status tree.

Final commands, from the execution checkout, using a fresh owned evidence
folder and recording command/version/exit status for each:

```sh
npm run build
npm run type-check
npm test -- --reporter=default --reporter=json --outputFile=/tmp/ramify-plan7-evidence/tests.json
npm run reference:verify -- --plan 5
npm run check:self
npm run check:reference
npm run measure:affected -- --output /tmp/ramify-plan7-evidence/measurements.json
git diff --check
npm run verify:affected -- --evidence /tmp/ramify-plan7-evidence
```

Bind Plan 5's accepted final gate and Plan 4's actual lifecycle suite at the
provider review, including any required commands beyond the above. Preserve
existing tests in the full run. A missing MCP provider, missing measurement,
stale artifact or unexecuted required instance fails full acceptance. Owned
temporary endpoints/directories and finally cleanup must leave no surviving
request leases, workers or child processes beyond the declared shared daemon.

## Handoff

The completion report records exact API/wire/tool schemas, owner exposures,
source scope, coverage/freshness outcomes, case results, raw measurements and
predecessor evidence. State limitations and any reviewed budget change.
Authoring/prototype evidence is kept distinct from executed implementation.
