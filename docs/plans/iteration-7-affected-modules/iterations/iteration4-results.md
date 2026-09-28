# Iteration 4 results: real invocations, timing sample and gate

**Date:** 2026-09-28. **Branch:** `feat/plan7-affected-modules`, from `7ae7148f`.
**Status:** complete. This is the completion report of
[Plan 7](../main-plan.md). A first pass recorded A7-12, the real invocations
and the timing sample, on the build of `7ae7148f`. A second pass ran the gate
(A7-13) at `83e9ed13`, fixed the one defect it found, and passed the audit at
`1339930e`.

Every A7-12 instance answered with exit 0 and matched the owners written down
from the manifests and source imports before the run. The real invocations
changed no source. The gate found one test defect caused by this branch, fixed
in `1339930e`; see [Gate](#gate).

## Setup

- `npm run build` once, from the worktree root: exit 0 (the existing explorer
  chunk-size warning).
- Every resident invocation used one fresh endpoint directory from
  `mktemp -d` (`/tmp/rfA.4TZi`) as `RAMIFY_ENDPOINT_DIR`. The endpoint had no
  daemon before the first invocation (`daemon status` printed `not running`).
  That first invocation started the daemon. The daemon then held three contexts:
  the toolkit, the worktree's `ramify-agent/` and the main checkout's
  `/ramify/ramify-agent`.
- Elapsed wall time is measured with Python's monotonic clock around each
  process (`subprocess.run`), from the worktree root. Node v22.23.2, 12 CPUs.
- Invocations use the built launcher `dist/src/ramify` (the Bun-compiled client,
  whose `--batch` form runs in a Node child) with `--root` given explicitly,
  from the same working directory. `inputId` still depends on the invoking
  directory and root form (iteration 3 handoff), so only selections are
  compared across forms.
- Expected owners were derived before any `affected` invocation from the
  `module.ramify` files and from the relative imports of every owned file under
  `src/` and `subs/**/src/`. Each import was resolved to the owner of its target
  file, so the list includes same-parent and transitive edges.

## A7-12:toolkit-path-seed

```sh
RAMIFY_ENDPOINT_DIR=/tmp/rfA.4TZi dist/src/ramify affected \
  --path subs/analysis/src/affected-query.ts --format json --root .
```

**Expected before the run** (15 toolkit owners): the direct dependents of
`ramify/analysis` are `ramify`, `ramify/cli`, `ramify/daemon`,
`ramify/daemon/contexts`, `ramify/integration-tests` and `ramify/service-api`.
The transitive dependents add `ramify/explorer`, which imports root,
contexts and service-api. They also add `ramify/presentation/project-view`,
which imports contexts, and `ramify/presentation`, which imports project-view. The four
analysis children and `ramify/presentation/layout` do not depend on analysis.
Expected: selection `dependency-closure`, no widening, complete coverage.

**Elapsed:** 6.40 s, exit 0. This invocation started the daemon and opened the
toolkit context.

**Answer** (abbreviated):

```text
mode resident, revision { sequence: 1, inputId: input/1:486287ee…7041e }, ramifyVersion 0.0.0
paths           [{ subs/analysis/src/affected-query.ts, ramify/analysis, inventory }]
selection       dependency-closure, widening [], coverage complete (0 notes), analysisCheck passed
changedModules  [ramify/analysis]
affectedModules [ramify, ramify/cli, ramify/daemon, ramify/daemon/contexts, ramify/explorer,
                 ramify/integration-tests, ramify/presentation, ramify/presentation/project-view,
                 ramify/service-api]
testModules     changed ∪ affected (10 modules)
scope           configuration tsconfig.json, 30 walked areas, 6 independent scopes
                (examples/collection-review, ramify-agent, two probe fixtures,
                scripts/reference-harness, site)
```

**Matches the expectation:** yes, exactly.

The earlier case wording in `cases.json` ("selects analysis, daemon, contexts, cli and
root") named only the direct path to the CLI. The answer also selects
explorer, integration-tests, presentation, project-view and service-api,
through root's re-exposure and through contexts. The hand derivation confirms
those edges; see Defects observed.

## A7-12:toolkit-module-seed

The inventory ID is `ramify/analysis`, as the path answer above reports and as
`subs/analysis/module.ramify` (`module analysis` beneath root `module "ramify"`)
gives.

```sh
RAMIFY_ENDPOINT_DIR=/tmp/rfA.4TZi dist/src/ramify affected ramify/analysis \
  --format json --root .
```

**Expected before the run:** the same lists as the path seed, with an empty
`paths`.

**Elapsed:** 0.37 s, exit 0 (resident, ready).

**Answer:** `paths []`, revision sequence 1 with the same `inputId`.
`changedModules`, `affectedModules`, `testModules`, `selection`, `widening`,
`coverage` and `inputId` are each equal, as parsed JSON, to the path-seeded
answer. **Matches:** yes.

## A7-12:toolkit-unowned

```sh
RAMIFY_ENDPOINT_DIR=/tmp/rfA.4TZi dist/src/ramify affected \
  --path package.json --format json --root .
```

**Expected before the run:** `package.json` lies outside every module's `src/`,
so it has basis `none`. The answer widens to `all-modules` with `unowned-path`,
and `testModules` lists all 15 owners.

**Elapsed:** 0.34 s, exit 0.

**Answer:**

```text
paths           [{ package.json, module null, basis none }]
selection       all-modules, widening [unowned-path], coverage complete (0 notes), analysisCheck passed
changedModules  []
affectedModules []
testModules     all 15: ramify, ramify/analysis, ramify/analysis/descriptions, ramify/analysis/model,
                ramify/analysis/project, ramify/analysis/typescript, ramify/cli, ramify/daemon,
                ramify/daemon/contexts, ramify/explorer, ramify/integration-tests, ramify/presentation,
                ramify/presentation/layout, ramify/presentation/project-view, ramify/service-api
```

**Matches:** yes.

## A7-12:agent-path-seed

The worktree has no `ramify-agent/node_modules`, and `npm ci` was not run
there. The first attempt ran against the worktree copy with `--root ramify-agent`.
The recorded instance used the fallback `--root /ramify/ramify-agent`.

**Expected before the run** (12 ramify-agent owners): the seed file belongs to
`ramify-agent/harness/audit`. Only `ramify-agent/harness` imports audit. Only
`ramify-agent` and `ramify-agent/web` import harness. Expected:
changed `[ramify-agent/harness/audit]`; affected `[ramify-agent,
ramify-agent/harness, ramify-agent/web]`; test modules those four;
`dependency-closure` with complete coverage and `signature-inferred` notes only.

### Attempt on the worktree copy (no installed packages)

```sh
RAMIFY_ENDPOINT_DIR=/tmp/rfA.4TZi dist/src/ramify affected \
  --path subs/harness/subs/audit/src/check-execution.ts --format json --root ramify-agent
```

Elapsed 7.89 s, exit 0 (new context in the running daemon). The analysis ran
without installed packages and answered, but coverage was **partial**: 329 notes,
312 `signature-inferred` and 17 `unresolved-target`. The unresolved targets are
package imports whose packages are not installed, for example `'ramify-audit'`
in `check-execution.ts:23`, `'react-markdown'` in `subs/web/src/markdown.tsx:1`
and `'@earendil-works/pi-coding-agent'` in `pi-agent.ts:14`. The answer therefore
widened to `all-modules` with `partial-coverage`: 12 test modules.
`changedModules` and `affectedModules` were the expected ones. This is the
contract's conservative behavior for unknown targets, not a defect. An
unprepared checkout cannot give a narrow answer; see Observations.

### Recorded instance (main checkout, read-only)

```sh
RAMIFY_ENDPOINT_DIR=/tmp/rfA.4TZi dist/src/ramify affected \
  --path subs/harness/subs/audit/src/check-execution.ts --format json --root /ramify/ramify-agent
```

The main checkout was on `ramify-agent` at `5a1934aa`, with the user's
uncommitted edits in five files under `ramify-agent/`. The analysis read the
files as they stood. `git status --short --ignored ramify-agent` was identical
before and after every invocation, so the checkout was not modified.

**Elapsed:** 9.77 s, exit 0. This invocation opened a new context in the running
daemon.

**Answer:**

```text
mode resident, revision { sequence: 1, inputId: input/1:d47c995f…8ef9 }
paths           [{ subs/harness/subs/audit/src/check-execution.ts, ramify-agent/harness/audit, inventory }]
selection       dependency-closure, widening [], analysisCheck passed
coverage        complete, 312 notes, all signature-inferred
changedModules  [ramify-agent/harness/audit]
affectedModules [ramify-agent, ramify-agent/harness, ramify-agent/web]
testModules     [ramify-agent, ramify-agent/harness, ramify-agent/harness/audit, ramify-agent/web]
```

**Matches:** yes. Coverage is complete despite the 312 signature notes.

## A7-12:agent-batch

```sh
dist/src/ramify affected --path subs/harness/subs/audit/src/check-execution.ts \
  --batch --format json --root /ramify/ramify-agent
```

**Expected:** the same selection as the resident answer.

**Elapsed:** 8.68 s, exit 0.

**Answer:** mode `batch`, revision `{ sequence: null, inputId: input/1:d47c995f…8ef9 }`,
coverage complete with 312 `signature-inferred` notes. The `selection` member
is equal to the resident answer's as parsed JSON. The `inputId` happened to
match the resident one because the runs shared the same working directory and
root form. **Matches:** yes.

## A7-12:timing-sample

The five resident runs on each project were consecutive, after the resident
context was ready: the toolkit context from A7-12:toolkit-path-seed and the
ramify-agent context from the recorded agent path seed. Each project then had
one `--batch` run. Same seeds as above, `--format json`, same endpoint
directory. The ramify-agent runs used `--root /ramify/ramify-agent`. There was
no warm-up and no percentile.

| Run | Toolkit (`subs/analysis/src/affected-query.ts`) | ramify-agent (`subs/harness/subs/audit/src/check-execution.ts`) |
| --- | --- | --- |
| resident 1 | 0.41 s | 0.89 s |
| resident 2 | 0.40 s | 0.94 s |
| resident 3 | 0.45 s | 0.98 s |
| resident 4 | 0.43 s | 0.77 s |
| resident 5 | 0.43 s | 0.88 s |
| `--batch` | 6.01 s | 10.78 s |

Every run answered at revision sequence 1 with the same `inputId` and an
identical document per project. Each batch `selection` equals its resident one.
The ramify-agent document is 130,023 bytes, against 3,079 bytes for the
toolkit, because it carries the 312 coverage notes. That size probably accounts
for most of the resident difference. The run did not isolate it.

Other timings recorded above: the toolkit invocation that started the daemon
took 6.40 s. Opening each ramify-agent context in the running daemon took
7.89 s for the worktree copy and 9.77 s for the main checkout. The earlier
ramify-agent `--batch` (A7-12:agent-batch) took 8.68 s, so the two batch runs
on the same project differ by about 2 s.

### Comparison with the baseline

Main plan, verified state item 6: `ramify check --batch` took 10.2 to 10.8 s on
the toolkit and 15.5 to 16.3 s on ramify-agent. A cold daemon plus a new context
took 14.0 s on ramify-agent.

- A ready resident query takes 0.40 to 0.45 s on the toolkit and 0.77 to 0.98 s
  on ramify-agent. That is about 4 % and 6 % of a fresh `check --batch`.
  Iteration 3 measured 0.39 to 0.40 s on the toolkit. The figures include
  process start and the connection; the run did not split them from the query.
- `affected --batch` took 6.01 s on the toolkit and 8.68 to 10.78 s on
  ramify-agent, below `check --batch` on the same projects. The batch form opens
  a retained session and answers from its facts; the run did not break down
  where the difference comes from. The two measurements were not taken in one session, so the
  comparison is indicative only.
- Starting the daemon and the first toolkit context took 6.40 s, below the
  14.0 s cold figure for ramify-agent. Opening a ramify-agent context in the
  running daemon took 7.9 to 9.8 s.

The sample confirms that a ready query is far below a fresh analysis. It sets
no budget.

## Defects observed

No defect in the answers: all six instances selected exactly the owners
derived beforehand, and resident and batch selections agree on both projects.

One plan-text discrepancy, not a source defect:

- **`cases.json` A7-12:toolkit-path-seed understated the expected set.** It
  read "selects analysis, daemon, contexts, cli and root". The real answer and
  the hand derivation also select `ramify/explorer`, `ramify/integration-tests`,
  `ramify/presentation`, `ramify/presentation/project-view` and
  `ramify/service-api`. Evidence from the relative imports:
  `ramify/integration-tests` and `ramify/service-api` import analysis files
  directly. Explorer imports root, contexts and service-api. Project-view imports
  contexts, and presentation imports project-view. The expectation predates the
  finding in iteration 3 that root is a hub. The iteration 3 review fixes
  reworded the case to the recorded lists; the answer itself is correct.

## Observations

- **Unprepared checkouts widen.** Without installed packages, package imports
  become `unresolved-target` notes. Coverage becomes partial and the answer
  widens to every module. ramify-audit should run `affected` only in a
  prepared checkout whose dependencies are installed, or expect `all-modules`.
- **Analysis runs without installed packages.** `ramify-agent/tsconfig.json`
  names `"types": ["node"]`. With no `node_modules`, the context still opened
  and `analysisCheck` passed. Only coverage changed.
- **The answer size grows with notes.** Complete answers carry every retained
  note. That makes the ramify-agent document about 130 KB. It stays within the
  response bound, and the second pass may note it as a consideration for
  consumers.

## Daemon shutdown

```sh
RAMIFY_ENDPOINT_DIR=/tmp/rfA.4TZi dist/src/ramify daemon status
# Daemon 1112550 (b0c67f0a-…) running; 3 contexts; 0 subscriptions
RAMIFY_ENDPOINT_DIR=/tmp/rfA.4TZi dist/src/ramify daemon stop
# Stopped: daemon stopped explicitly
RAMIFY_ENDPOINT_DIR=/tmp/rfA.4TZi dist/src/ramify daemon status
# not running
```

The daemon on this endpoint was the only one started. The `--batch` runs
start no daemon.

## Gate

The second pass ran from the worktree root on `83e9ed13`, with a clean tree.
`npm run build` exited 0 with the existing explorer chunk-size warning.

| Case | Command | Outcome |
| --- | --- | --- |
| A7-13:type-check | `npm run type-check` | passed, exit 0, on `83e9ed13` |
| A7-13:check-self | `RAMIFY_ENDPOINT_DIR=$(mktemp -d) npm run check:self` | passed, exit 0, on `83e9ed13` |
| A7-13:audit-request | `ramify-audit audit --request audit/plan7-affected-modules.request.json --cwd /tmp/ramify-plan7-affected --json` | first run failed at `83e9ed13`; the rerun passed at `1339930e`, exit 0, overall `pass` |

The self-check summary:

```text
Mode: resident (daemon 1125948; ...; revision 1; cold; synchronized; revision reused)
Execution: completed; check: passed; coverage: complete
Completed scope: 15 owners, 449 source files, 17 resources, 6836 accesses
Findings: 0 errors, 0 warnings, 0 analysis limits; 4780 allowed, 0 denied, 2056 external
```

Its endpoint directory was a fresh `mktemp -d` (`/tmp/tmp.1IMHYldBOl`). The
daemon it started was stopped afterwards: `daemon stop` printed `Stopped:
daemon stopped explicitly`, and `daemon status` then printed `not running`.

### Audit

The worktree has no `ramify-agent/node_modules`, so the audit used the main
checkout's pinned executable read-only,
`/ramify/ramify-agent/node_modules/.bin/ramify-audit` (ramify-audit 0.1.1),
with `--cwd /tmp/ramify-plan7-affected`. The request runs in the existing
worktree, not an isolated one (`workspaceMode: existing-worktree`).

**First run, `83e9ed13`: failed.** Status `completed`, exit 1, overall `fail`,
587.8 s. Run ref `refs/audited/runs/2026-09-28T09-21-02Z-83e9ed138`, report
commit `bfae66d3`. `patch-integrity`, `toolkit-build`, `toolkit-typecheck` and
`toolkit-structure` passed; `toolkit-tests` failed with 4 of 2,397 tests in 2
of 176 files:

- `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`, three
  exact-text parser fixtures (`module.ramify`, `subs/analysis/module.ramify`,
  `subs/daemon/module.ramify`): `expected [ { kind: 'expose-src', …(4) },
  …(28) ] to deeply equal [ …(27) ]`. **Caused by this branch.** Iterations 1
  and 2 added the affected vocabulary exposures (root R3 and R7, analysis A19,
  daemon N5) to those descriptions, and the reviewed statements were not
  updated. The iterations ran focused test files only, so the full suite first
  met the fixtures here. Fixed by `1339930e`
  (`fix(analysis): Plan 7 gate, description parser fixtures name the affected
  exposures`), which changes only that test file.
- `src/tests/dependency-view-server.test.ts`, BD28: `ENOENT: no such file or
  directory, realpath
  '/tmp/ramify-plan7-affected/examples/collection-review/node_modules'`.
  **Environment, not this branch.** The worktree had not been prepared. Before
  the rerun, `npm --prefix examples/collection-review ci` installed the
  example's dependencies (its part of `npm run worktree:prepare`, gitignored,
  root untouched), and BD28 then passed alone.

**Rerun, `1339930e`: passed.** Status `completed`, exit 0, overall `pass`,
247.0 s, audited at 2026-09-28T09:26:20Z, tree `68adbe41`.

| Check | Status | Duration |
| --- | --- | --- |
| `patch-integrity` | pass | 0.004 s |
| `toolkit-build` | pass | 3.3 s |
| `toolkit-typecheck` | pass | 3.7 s |
| `toolkit-tests` | pass, 2,397 tests in 176 files | 237.3 s |
| `toolkit-structure` | pass | 2.6 s |

- Run ref: `refs/audited/runs/2026-09-28T09-26-20Z-1339930e0`
- Report commit: `e522588feb511fe94567df82f7a6e3bf6dc59759`
- Tree ref: `refs/audited/by-tree/68adbe411345b34f602e39163f658c70dc554fd2`
- Retrieval:

```sh
git notes --ref=audit show 1339930e0ed305a2d11237920ea1553c84ab0530
git show refs/audited/runs/2026-09-28T09-26-20Z-1339930e0:reports/audit/summary.json
```

The audited commit is `1339930e`. `patch-integrity` runs `git diff --check
HEAD^ HEAD`, so it read only the fix commit's patch. The pass covers the
build, type-check, complete suite and self-check of the whole tree at that
commit. The type-check and `check:self` rows above ran at `83e9ed13`; the
audit reran both at `1339930e`, which differs only in the test file, and they
passed.

This results file, `main-plan.md` and the roadmap edit are committed after the
audited commit. They are documentation-only changes under `docs/`, which the
recorded applicability policy (`ramify-audit/v1`) ignores as non-impacting.

## Evidence per case

Rows A7-01 to A7-11 are recorded in the
[iteration 1](iteration1-results.md), [iteration 2](iteration2-results.md) and
[iteration 3](iteration3-results.md) results, and the audited complete suite
runs their tests.

| Case | Evidence |
| --- | --- |
| A7-12:toolkit-path-seed | [section](#a7-12toolkit-path-seed): exact command, answer and hand derivation; 6.40 s including daemon start; matches |
| A7-12:toolkit-module-seed | [section](#a7-12toolkit-module-seed): `ramify affected ramify/analysis`, lists equal to the path seed as parsed JSON; 0.37 s |
| A7-12:toolkit-unowned | [section](#a7-12toolkit-unowned): `--path package.json`, basis `none`, `all-modules` with `unowned-path`, all 15 test modules; 0.34 s |
| A7-12:agent-path-seed | [section](#a7-12agent-path-seed): main checkout read-only, `dependency-closure`, coverage complete with 312 `signature-inferred` notes; 9.77 s. The unprepared worktree attempt widened through 17 `unresolved-target` notes |
| A7-12:agent-batch | [section](#a7-12agent-batch): `--batch`, selection equal to the resident answer; 8.68 s |
| A7-12:timing-sample | [section](#a7-12timing-sample): five resident runs and one batch per project; toolkit 0.40 to 0.45 s resident, 6.01 s batch; ramify-agent 0.77 to 0.98 s resident, 10.78 s batch |
| A7-13:type-check | [Gate](#gate): exit 0 at `83e9ed13`; the audit's `toolkit-typecheck` passed at `1339930e` |
| A7-13:check-self | [Gate](#gate): passed, 15 owners, 0 findings, at `83e9ed13`; the audit's `toolkit-structure` passed at `1339930e` |
| A7-13:audit-request | [Audit](#audit): overall `pass` at `1339930e`, run ref `refs/audited/runs/2026-09-28T09-26-20Z-1339930e0`; the failed first run is recorded |

The A7-12 invocations ran on the build of `7ae7148f`. `83e9ed13` changed only
how a batch open for a project that cannot be found or read exits and how the
resident form names an invalid project, neither of which the A7-12 instances
reach, so they were not repeated.

## Remaining limits

- **Imprecise batch refusal.** A batch open refused for `invalid-invocation` or
  `unavailable-capability` is reported as `project-unavailable`, exit 2. That
  is conservative, since the caller gets no answer, but it does not name the
  cause.
- **Resident scope is the first opener's.** An affected answer does not restate
  the invocation's scope per request as `check` does, so a resident answer
  carries the context's first opener's scope and `inputId`; see the
  [iteration 2 addendum](iteration2-results.md#addendum-review-fixes). Only
  selections compare across invoking directories and root forms.
- **Unprepared checkouts widen.** Without installed dependencies, package
  imports become `unresolved-target` notes, coverage becomes partial, and the
  answer widens to every module (A7-12:agent-path-seed). A consumer that needs a
  narrow answer runs `affected` in a prepared checkout.
- **Deferred by [decision 7](../main-plan.md).** The MCP tool
  `ramify_affected_modules`, the evidence validator
  `scripts/verify-affected.mts` and the 200-query measurement gate are not
  part of this plan. The timing sample sets no budget.
- **Answer size grows with notes.** Complete answers carry every retained note;
  the ramify-agent document is about 130 KB, within the response bound.
