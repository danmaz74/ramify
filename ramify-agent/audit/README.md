# The ramify-agent suite audit request

Plan 11's execution map uses [`plan11-execution-map.request.json`](plan11-execution-map.request.json).
It retains the five checks below, binds the claim to `plan11-execution-map`, and
raises only the complete agent suite's timeout from 300 to 600 seconds after a
measured local full run of about 140 seconds. From the clean final Plan 11
commit, invoke it with:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit \
  --request ramify-agent/audit/plan11-execution-map.request.json \
  --cwd . --json
```

Plan 12's CheckFindings and iteration reviews use
[`plan12-check-findings.request.json`](plan12-check-findings.request.json).
It is derived from the Plan 11 request: the same five checks and the same
600-second suite timeout, with the claim bound to `plan12-check-findings`.
From the clean final Plan 12 commit, invoke it with:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit \
  --request ramify-agent/audit/plan12-check-findings.request.json \
  --cwd . --json
```

The request below remains the recorded Plan 8 claim.

[`ramify-agent-suite.request.json`](ramify-agent-suite.request.json) is the
ramify-audit request that binds the ramify-agent suite to one commit. It is
recorded here so the request is reproducible from the repository rather than
from a shell history. Plan 7 ran the same five checks from an untracked file;
this copy carries Plan 8's claim.

## What it runs

One universe, `ramify-external-tool-fake-rollout`, of five checks and five
test units:

| Check | Test unit | Command, from the repository root |
| --- | --- | --- |
| `patch-integrity` | `git-diff-check` | `git diff --check HEAD^ HEAD` |
| `agent-typecheck` | `agent-typecheck` | `npm --prefix ramify-agent run type-check` |
| `agent-tests` | `agent-vitest` | `npm --prefix ramify-agent test -- --maxWorkers=4` |
| `agent-structure` | `agent-check-self` | `npm --prefix ramify-agent run check:self` |
| `parent-daemon-test` | `dependency-diagram-daemon` | `npm test -- src/tests/dependency-diagram-daemon.test.ts --maxWorkers=1` |

`patch-integrity` runs first; `agent-typecheck` and `parent-daemon-test` follow
it, and `agent-tests` and `agent-structure` follow `agent-typecheck`. Every
check records its outcome instead of remediating, so one failure does not hide
the others.

`parent-daemon-test` is the toolkit's own case, kept in this request because
Plan 7 changed it. It is not a toolkit suite: the root cucumber-viz audit runs
the toolkit's checks.

## How it is invoked

ramify-audit is not on the shell path. It is `ramify-agent`'s pinned
dependency, so its executable is the one npm links for this package.

```sh
# from the repository root, on the commit to audit, with a clean tree
npm install
npm run build
npm run worktree:prepare

ramify-agent/node_modules/.bin/ramify-audit audit \
  --request ramify-agent/audit/ramify-agent-suite.request.json \
  --cwd . --json
```

The request names `"revision": "HEAD"` and `"workspaceMode":
"existing-worktree"`, so it audits this worktree's HEAD commit in place. The
build and the three `npm ci` runs are the workspace preparation the checks
assume; the request declares no `workspacePreparation`, so they are run before
it rather than by it. `git diff --check HEAD^ HEAD` reads the audited commit's
own patch, which is why HEAD must be that commit.

Evidence is published as a Git note and a run ref. The result prints both
retrieval commands:

```sh
git notes --ref=audit show <source-commit>
git show <run-ref>:reports/audit/summary.json
```

## Why cucumber-viz does not host it

The root [`cucumber-viz.config.ts`](../../cucumber-viz.config.ts) is Ramify's
audit, and it stays Ramify's. Its `checks` block overrides two scopes,
`static` and `regression`, and cucumber-viz 0.7.0's `CommandSpec`
(`dist/domain-sub-apps/implementation-studio/core/workflow/checks/check-definition.d.ts`)
declares `name`, `cmd`, `args`, `env`, `parser` and `timeoutMs` — no working
directory. Verified against the installed 0.7.0 on 2026-09-22. A ramify-agent
scope would therefore be a third scope in the root audit's own check set,
absorbing this suite into the run that reports on the toolkit. Keeping the two
requests apart keeps each project's claim its own.
