# Iteration 0 results: execution base and contract freeze

**Acceptance:** B01 engineering artifacts completed. The full baseline audit
**failed**, with complete configured discovery and one retained native test
failure. The integrator explicitly accepted that known failing base for unrelated
deterministic provider implementation on 2026-10-08. This is not a passing audit,
Q03 completion or permission to skip/weaken the native assertion.

## Identity and concurrent work disposition

- Execution worktree: `/home/app/ramify-plan23-session-reuse`, branch
  `feat/plan23-session-reuse`.
- Baseline HEAD: `d01a57bdbac6a56c29a893519f70297513824313`; tree
  `8e50053ce2d82f64b77f627d7ed29356303ecc7c`.
- Result HEAD is the commit containing this receipt; resolve with
  `git log -1 --format=%H -- ramify-agent/docs/plans/23-session-reuse-and-run-efficiency/iterations/00-results.md`.
- This worktree began with empty staged/unstaged inventories. No production
  source, package pin, lockfile, runner configuration or registry was changed.
- Main `/ramify` HEAD is already d01a57bd, not the authoring snapshot 38b81e5e.
  Accepted metrics and the complete Plan 23 authoring package are committed in
  d01a57bd (71 paths, 4,706 additions/235 deletions). Capture/metrics/delivered/lines,
  run records/service, evidence Git, projections, equipment and corresponding
  tests are included, not copied from older analysis or recreated.
- The main checkout's index is empty. Its unrelated unstaged paths are
  `.devcontainer/codex-mcp-setup.sh`,
  `ramify-agent/docs/analysis/2026-09-26-contract-engineer-replay.md`,
  `ramify-agent/docs/plans/17-machine-test-lock/main-plan.md`.
  Existing untracked paths are `.claude/settings.local.json`,
  `ramify-agent/docs/analysis/2026-09-26-contract-engineer-acceptance.md`,
  `ramify-agent/docs/analysis/2026-09-26-todo.md`,
  `ramify-agent/docs/plans/15-prompt-workbench/main-plan.md`.
  These remain separate and untouched. Coordinator preservation snapshot is
  `/tmp/ramify-plan23-main-preservation.json`, including all content hashes and
  empty-index SHA256. No worker uses or stages its files.

## Frozen handoff

[Execution v1 appendix](../contract-appendix.md) records session-qualified
turn/checkpoint/key/receipt/task types, injected content-addressed store/CAS
contract, immutable Retry input versus fresh handlers/current authority,
unresolved effects and Stop fencing, pi final native-payload guard, Cucumber
public config API, observation/timing/charge wire values and owner exposures.
[Fixture contracts](../fixture-contracts.md) supply independent inputs/outcomes
for F1–F7 and exact final native/live witnesses.
[Exact write sets](../write-sets.json) enumerate optional production/test/artifact
paths for all iterations. Providers 1–6 are disjoint; 13 is disjoint from 11/12.
8/9/10/11 serialize the shared run files. Harness `module.ramify`, manifest status
and shared runner/registry changes remain centrally owned; disjoint child
declarations belong to their provider. Additional exact files need an integrator
reservation before edits. No contract/product decision was reopened.

## Dependency preparation and discovery

`npm ci` from this worktree's `ramify-agent/` passed: 503 local packages, independent
node_modules, committed lockfile unchanged. Pins are pi 0.87.1, Ramify 0.4.1,
ramify-audit 0.7.2, Cucumber 13.2.1 and Vitest 4.1.11.

`node_modules/.bin/ramify materialize --view architect` returned exit 2:
`Compiler server request failed: Offset is outside the bounds of the DataView`.
Log: `/tmp/ramify-plan23-iteration00/architect.log`. No complete architect refresh
or absent-API conclusion is claimed.

Ordinary and testing API refreshes both passed, separately:

```sh
node_modules/.bin/ramify materialize --from subs/harness/src
node_modules/.bin/ramify materialize --from subs/harness/src/tests
```

Both report revision `rev/1:de1d618a-5133-432f-af3b-e65f8e7d428b:1`, 2 targets,
849 entries. Ordinary `_meta.json` records coverage 1/truncated 1; testing records
coverage 15/truncated 1. These are explicit limits, not complete availability
claims. Logs: `/tmp/ramify-plan23-iteration00/api-{ordinary,testing}.log`.
Current agent/ledger/evidence declarations were also inspected directly. Ledger
public `append`/`replay`, `writeFileAtomic`/`writeFileExclusive` and their companions
provide the store primitives. The stale retired `buildScenarioProfile` lead is
not adopted. No generated files are edited/imported or committed.

Installed public Cucumber API/export and effective `useConfiguration` were
inspected along with path-merging/default-profile behavior. Installed pi
streamFunction/onPayload source and swallowed extension error path were inspected;
its first target's runtime catalog explicitly supports appended tools and later
system messages. Details and exact file/line seams are in the appendix. Source
inspection proves the implementation seam; native/live acceptance remains open.

## Executed verification

Focused ordinary baseline, run from `ramify-agent/`:

```sh
npm run test:quick -- subs/harness/subs/agent/src/tests/scripted.test.ts subs/harness/subs/agent/subs/pi/src/tests/session-modes.test.ts subs/harness/src/tests/hook-checks.test.ts subs/harness/subs/scenarios/src/tests/form.test.ts subs/harness/src/tests/kpi-metrics.test.ts subs/harness/src/tests/scope-size-recipe.test.ts subs/harness/src/tests/delivered-change.test.ts --maxWorkers=2
```

Passed **7 files/100 tests**, duration 4.49 seconds; log
`/tmp/ramify-plan23-iteration00/focused-baseline.log`. These baseline regressions
are not evidence that the new session/mutation/catalog cases already pass.
New fixture controls state pre-fix requirements without pretending they were
executed against implementation that does not exist.

Full released configured baseline, run once from clean committed repository root:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

Completed with **exit 1 / overall fail / invocation fail / composition fail**.
Producer ramify-audit 0.7.2; source d01a57bd; duration **386.412 seconds**;
request `5a5ccfde-8a3d-4eb5-b60c-7401028fde08`, run
`c9a40d61-5589-4eb5-8cf3-e05cb7d84cbd`, audited-at
`2026-10-08T16:31:49.024Z`. Selection was full; all six configured checks ran,
no omitted checks, complete expected-file coverage **285 expected/285 run**,
no missing files. Nested discovery complete with no skipped/unavailable projects.
Failure ledger complete, exactly **one** outstanding test failure.

| Configured check | Actual result |
| --- | --- |
| patch-integrity | Passed |
| agent-typecheck | Passed (harness, web, scripts, browser scripts) |
| agent-tests | Failed: 283 passed files, 1 failed, 1 skipped; 2,120 passed tests, 1 failed, 2 skipped (2,123 total) |
| agent-scenarios | Passed configured runner; zero selected scenarios/steps, not evidence of scenario execution |
| agent-structure | Passed |
| agent-web-build | Passed |

Failed native title:
`installed Ramify project boundary > an invocation from a nested module selects the marked project and both API source areas`,
`subs/harness/subs/evidence/src/tests/project-boundary.test.ts:51`. Native
architect materialization returned exit 2 with the same DataView error reproduced
by this iteration's refresh. This is retained qualification debt, not a flake,
passing skip, or permission to reduce discovery. Iteration 14 must resolve it
for Q03; unrelated provider work may proceed under integrator's explicit
known-failure acceptance.

Raw JSON/stderr are outside analyzed source:
`/tmp/ramify-plan23-iteration00/baseline-audit.json` and
`/tmp/ramify-plan23-iteration00/baseline-audit.stderr` (empty stderr).
Durable audit report commit `af6182b601216fac6c613d3904b215f51bfc4bc3`:

```sh
git show refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T16-31-49Z-d01a57bdb:reports/audit/summary.json
git notes --ref=audit-projects/ramify-agent-f25e9a298228 show d01a57bdbac6a56c29a893519f70297513824313
```

`git diff --check` passed. JSON schema/base/path integrity and exact provider
write-set pairwise overlap validation passed; all 15 iteration keys exist.
Only the six reserved planning artifacts changed in this iteration.

## Remaining acceptance and successor inputs

Start providers from the committed receipt/contracts plus known failing base,
within reserved disjoint writes. Pi/API availability is bounded by source and
API evidence; actual native Cucumber/Git/provider tests and live supported pi
continuation/fork/add-tool/restore remain iteration 14 work. No live calls,
controlled comparison, status-badge run, toolkit long trial, performance claim,
package publication or push occurred. Manifest execution statuses are left to
the coordinator. No passing whole-plan receipt is created.

## Preliminary qualification repair of the retained failure

The failed baseline above remains the actual historical result. A bounded
read-only trace identified `checkWriteScope` in harness `work/scope.ts`: installed
TypeScript 7.0.2 received a four-byte signature response and attempted to decode
a full AST header. An equivalent owner-local result alias avoids that rendering
failure without changing either readonly result variant or the function body.
No toolkit/package/configuration/test assertion was changed.

Repair candidate `71e4fe31c90c29fc5bbe2a2ed62dc61a6f2aad5d`, from clean base
`9901de0f64581bc8a95937658a0cdc57edf2a144`, changes only
`subs/harness/src/work/scope.ts`. Its body is byte-identical to the base; SHA256
`98ba75e1d19dc624476f7c14560900ffae3f4c9782da295d8d45606e5bf1a710`.
The coordinator fast-forwarded that candidate and independently reran:

- Existing registered native `project-boundary.test.ts`: one file, five tests
  passed, including the formerly failing nested architect/API materialization;
  61.68 seconds.
- Existing ordinary scope checks: two files, ten tests passed.
- Harness/web/scripts/browser-script type checks passed.
- Structural check passed, zero errors/warnings; partial coverage with 314
  analysis limits.

Commands were the existing `npm run test:boundaries --` invocation for the exact
native file, `npm run test:quick --` for `write-scope-submission.test.ts` and
`contract-injection-scope.test.ts`, `npm run type-check`, and `npm run check:self`.
Integrated logs: `/tmp/ramify-plan23-integrated-scope-repair-*.log`; diagnosis,
original failing traces and the worker's repair receipt are retained separately
in `/tmp/ramify-plan23-baseline-diagnosis/`. No assertions, skips, discovery,
deadlines, authority or scope behavior were weakened. This clears the focused
regression only; Q03 still requires the final clean configured full audit after
all implementation joins, and Q01/Q02 native/live obligations remain open.
