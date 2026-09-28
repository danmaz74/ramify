# Iteration 4 results: real invocations, timing sample and gate

**Date:** 2026-09-28. **Branch:** `feat/plan7-affected-modules`, from `7ae7148f`.
**Status:** draft. This first pass records A7-12: the real invocations and the
timing sample. The gate (A7-13), the roadmap update and the final completion
report are recorded by a second pass.

Every A7-12 instance answered with exit 0 and matched the owners written down
from the manifests and source imports before the run. No source was changed.

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
  whose `--batch` form runs in a Node child) with `--root` given explicitly, so
  every `inputId` is independent of the invoking directory (iteration 3 handoff).
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

The case wording in `cases.json` ("selects analysis, daemon, contexts, cli and
root") names only the direct path to the CLI. The answer also selects
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

**Answer:** mode `batch`, revision `{ sequence: null, inputId: input/1:d47c995f…8ef9 }`
(the resident `inputId`), coverage complete with 312 `signature-inferred`
notes. The `selection` member is equal to the resident answer's as parsed JSON.
**Matches:** yes.

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

- **`cases.json` A7-12:toolkit-path-seed understates the expected set.** It
  reads "selects analysis, daemon, contexts, cli and root". The real answer and
  the hand derivation also select `ramify/explorer`, `ramify/integration-tests`,
  `ramify/presentation`, `ramify/presentation/project-view` and
  `ramify/service-api`. Evidence from the relative imports:
  `ramify/integration-tests` and `ramify/service-api` import analysis files
  directly. Explorer imports root, contexts and service-api. Project-view imports
  contexts, and presentation imports project-view. The expectation predates the
  finding in iteration 3 that root is a hub. The second pass may reword the case
  to the recorded lists; the answer itself is correct.

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

_To be recorded by the second pass: `npm run type-check`, `npm run check:self`
and the audit request run reference with exit status (A7-13)._
