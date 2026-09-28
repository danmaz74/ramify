# Acceptance and implementation evidence

Revised 2026-09-28. [Plan 7](main-plan.md) completes when every case in
[cases.json](cases.json) passes at its evidence level and iteration 4's audit
request passes. Stable IDs identify behavior; assertions state independent
expected answers and never compute them with the production projector.
`A -> B` means A depends on B.

## Fixtures and matrix

Projector unit fixtures are plain `AffectedFacts` values built by
`subs/analysis/src/tests/affected-fixtures.ts`. Session and worker cases write
disposable projects into a temporary directory with the existing session test
fixture, open a real retained session, and compare answers before and after
edits. Context, daemon and CLI cases use root's quick environment and the real
daemon over IPC where the row says so. Iteration 4 runs the built CLI on the
toolkit and on `ramify-agent/`.

| Row | Fixture and instances | Iteration | Evidence |
| --- | --- | --- | --- |
| A7-01 | `graph`: `chain`, `diamond-cycle`, `multiple-seeds`, `isolated`, `duplicates-order`, `empty`, `root-module`, `unknown-module`, `invalid-query`, `self-edge` | 1 | unit |
| A7-02 | `path-seeds`: `inventory-file`, `owned-test-file`, `declaration-file`, `readme`, `area-fixture`, `deleted-file`, `unowned-root-file`, `docs-path`, `absolute-rejected`, `dotdot-rejected` | 1 | unit |
| A7-03 | `source-forms`: `barrel-original`, `star`, `namespace`, `type-only`, `literal-dynamic`, `side-effect`, `denied`, `shim`, `no-invented-edges`, `testing-module` | 1 | session |
| A7-04 | `coverage`: `nonliteral-dynamic`, `unresolved-target`, `outside-module-target`, `signature-only-complete`, `resource-limit` | 1 | unit and session |
| A7-05 | `session`: `edit-changes-answer`, `stale-sequence`, `invalid-current`, `missing-facts`, `warm-after-release`, `no-disk-or-report`, `worker-round-trip`, `worker-cancel` | 1 | session and worker |
| A7-06 | `contexts`: `covering-revision`, `superseded`, `cold-wait-false`, `cold-wait-true`, `invalid-current`, `deadline`, `cancel-lease` | 2 | quick |
| A7-07 | `daemon`: `capability`, `validation`, `unknown-module-domain`, `equivalence-with-session` | 2 | quick |
| A7-08 | `ipc`: `round-trip`, `unsupported-peer`, `disconnect` | 2 | ipc |
| A7-09 | `cli-arguments`: `positional-ids`, `path-repeat`, `no-seed`, `unknown-flag`, `batch-with-format` | 3 | unit |
| A7-10 | `cli-resident`: `json-document`, `human`, `widened-exit-0`, `unknown-module-exit-1`, `unavailable-exit-2`, `cancel-130` | 3 | quick |
| A7-11 | `cli-batch`: `reference-json`, `resident-batch-agree`, `invalid-project`, `compiled-child` | 3 | process |
| A7-12 | `real`: `toolkit-path-seed`, `toolkit-module-seed`, `toolkit-unowned`, `agent-path-seed`, `agent-batch`, `timing-sample` | 4 | manual, recorded |
| A7-13 | `gate`: `check-self`, `type-check`, `audit-request` | 4 | gate |

## Evidence levels

`unit` runs the projector on explicit facts. `session` opens a real retained
session over a disposable project. `worker` drives the real worker fixture.
`quick` uses real services with the controlled watcher and clock. `ipc` and
`process` use the real daemon transport and a real child process. `manual,
recorded` means iteration 4 runs the built CLI and records the exact commands,
outputs and elapsed times in its results file. `gate` is a command whose exit
status is recorded.

## Resource bounds

| Boundary | Rule |
| --- | --- |
| Seeds | At most 4,096; more is `invalid-query`. |
| Graph | At most 4,096 inventoried modules and 100,000 unique non-self edges; over is `resource-limit`, never a truncated list. |
| Cancellation | Checked at least every 1,024 accesses and traversal steps. |
| Answer | Within the transport's negotiated response bound; an oversized answer is refused whole. |

## Timing sample

Iteration 4 records one sample only, after the resident is ready: five
consecutive `ramify affected --path <file> --format json` invocations on the
toolkit and five on ramify-agent, reporting each elapsed wall time as measured
with the shell, plus one `--batch` invocation on each. No warm-up protocol, no
percentiles, no heap pause. The sample establishes that a ready query is far
below a fresh analysis; it does not set a release budget.

## Final gate

From the execution checkout, after `npm run build`:

```sh
npm run type-check
npm run check:self
ramify-agent/node_modules/.bin/ramify-audit audit \
  --request audit/plan7-affected-modules.request.json --cwd . --json
```

The audit request runs the patch check, the type-check, the complete toolkit
Vitest suite and the self-check in an isolated worktree; it is the only place
the full suite runs. Its run reference is recorded in the iteration 4 results.
