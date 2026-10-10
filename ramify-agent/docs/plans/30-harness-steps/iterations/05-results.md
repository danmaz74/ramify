# Iteration 5 results: documentation and qualification

[Iteration](05-documentation-and-qualify.md) · [Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Commits

On `feat/plan30-harness-steps`, after `66b93152`:

- `a770d8fb` chore(agent): stop reading the retired session directory in the Plan 21 browser witness
- `b78555bd` docs(agent): describe implementing a plan one harness step at a time
- `25f02914` docs(agent): mark the harness steps plan implemented, the real-plan exercise pending
- `9d45325b` fix(agent): accept the root module's empty directory in a work briefing's step inputs
- `f34ace23` test(agent): follow the session's manual run and the extracted gates in three cases
- this results file, in the commit that follows the final audit

## What changed

- `README.md` has a new **Steps** section:
  - The working checkout: an ordinary worktree the agent creates, then the
    target project's own setup. The section names the harness's own
    preconditions: the plan at `plans/<plan-id>/plan.md`, a committed
    `ramify-audit.json` at HEAD, `ramify-agent.json`, and a parent commit
    for the patch check. Two further notes follow. A gate commits the whole
    tree, so dependencies and generated views must be ignored. Authored
    inputs read an existing architect view.
  - It states that there is no `step prepare`, no self-run mode, no fixture
    copy and no harness-owned provisioning.
  - Every step command form, copied from the `src/cli.ts` usage text. The
    root has no `step` npm script or bin, so the section says to run
    `npx tsx src/main.ts step ...` from `ramify-agent/`.
  - `step inputs`: authored, `--from-run --invocation`, `--request` and
    `--assignment-of`.
  - `render`, and `run` with `--agent pi|fake`.
  - `gate`: the checkpoints, `--invocation`, and `--no-commit` as diagnosis
    only, never audit evidence.
  - `after`: a table of what it applies and what it reports as not run,
    the `Applied:`, `Not run:`, `nothing more`, `Error:` and
    `Last completed transition:` lines, and an exit-status table for every
    command.
  - The manual flow: work turn, `after`, `--assignment-of`, the engineer
    step, the iteration gate, `after`, the reviewer step.
  - Before a retry, the agent resets the tree itself.
  - Manual runs: `job.json` kind `manual`; skipped and only reported by
    server load; read by the CLI. They have no requirement to appear in the
    web client or to stay current there.
  - The manual-run deviations from 04-results.
- `README.md` `session` passage: the session's records are the manual run at
  `plans/sessions/.harness/jobs/<session-id>/`, with its summary in
  `step.json`. The passage now describes `--gate` as the in-place
  diagnosis, which it is, not the iteration checkpoint. In "Quick pi tests"
  the claim that the Sessions page lists a new session is replaced: the web
  client does not show manual runs.
- `subs/harness/README.md`:
  - The `sessions/` entry describes the session on the runner in a manual
    run. The retired `plans/.harness/sessions/` statement replaces the old
    records description, which was at line 814.
  - New `steps/` entry.
  - The `run/` entry names `committing-gate.ts`, `after-handling.ts` and
    `review-finish.ts`.
  - The `jobs/` and `transcripts/writer.ts` entries mention manual runs.
- `docs/README.md`: the Plan 30 entry says implemented, with the real-plan
  exercise pending, and links the README section.
- `main-plan.md` status line and `manifest.json` statuses: iterations 1–4
  done, 5 done except the real-plan exercise.
- `scripts/browser-acceptance/plan21-workflows.ts`: the W3 standalone session
  check is **dropped**, along with its server and its directory lookup. A
  session now records a manual run, and the web client does not show manual
  runs. Reading the manual run would need a new web view, so it would be a
  web change that this plan excludes, or a file check that is no longer a
  browser witness. The workflow test's standalone case
  (`plan21-workflows.integration.test.ts`) keeps its records and evidence.
  The script is opt-in and was not run. `npm run type-check` covers it.

## Checks

- `npm run type-check` passes.
- `npm run check:self` passes with 0 errors, 0 warnings and 343 analysis limits.
- The first final audit, on `25f02914`, failed. Four test files failed, and
  each one still failed when run alone, so they were real failures, not
  flaky ones. Iterations 1–4 had introduced them, and their focused runs had
  not caught them:
  - `work-items.test.ts`: a run with a work item of the root module failed
    as `internal` with "Invalid step inputs … briefing.moduleDirectory: Too
    small". The root module's directory is the project root, which is
    recorded as `''`. `steps/inputs.ts` now accepts an empty
    `moduleDirectory` (`9d45325b`).
  - `settlement-boundaries.test.ts`: the case still wrote its shell output
    under `plans/.harness/sessions/`, but the helper expects the session's
    manual run since iteration 3.
  - `run-git.integration.test.ts` (boundary project): `renderedFeatureAllowed`
    moved to the committing gates in iteration 4. The case now asks
    `gates`.
  - `projections-pure.test.ts`: the write tripwire matched `z.record(` in
    `projections/standalone-records.ts`, which iteration 3 moved there. The
    tripwire now ignores Zod's `z.record(`.
- After the fixes, the four files passed alone, together with the `steps-*`
  files (8 files, 63 tests; `run-git` separately, 4 tests). Type check and
  self-check passed again.
- Final audit: see [the audit](#final-audit).

## S21–S23 evidence

| ID | Evidence |
| --- | --- |
| S21 | README **Steps → The working checkout**: the agent creates the worktree and runs the project's ordinary setup. It lists the four harness preconditions and says that nothing is provisioned (no `step prepare`, self-run mode or fixture copy). **A manual flow** says the agent resets the tree before a retry. This is a documentation contract only; no runtime feature was added. |
| S22 | Type check and self-check above, and the final committed full nested audit below. Ordinary tests launch no process (the runner's guard and `test-boundaries.json` are unchanged). |
| S23 | README **Steps** describes the step commands and manual runs; README and harness README state that `plans/.harness/sessions/` is retired. Plan 15 status: not changed, see the deviations. Real-plan receipt: **not started: awaiting the user's go-ahead.** |

## Real-plan exercise

Not started: awaiting the user's go-ahead. Applying a real plan with
`step run --agent pi` spends model calls. The plan requires asking before it
starts. No project, plan, worktree, commits, verification, review or cost can
be reported yet. Nothing here counts as successful implementation evidence.

## Deviations

- **Plan 15's status line is not changed.** `docs/plans/15-prompt-workbench/`
  is not tracked on this branch. It exists only as an untracked directory in
  the main `/ramify` checkout, which this iteration does not touch. Make the
  edit where that file lives. `docs/README.md` already says Plan 30
  supersedes Plan 15's capture and replay.
- **Nothing was removed from `docs/todo.md`.** The list on this branch has no
  hand-made replay item. Its only replay mention is item 4's "keep that run
  as the recording for the replay fake", which concerns a scripted-fake
  recording. Plan 30 does not cover that.
- The commit trailer names Claude Opus 5.5, as this session's attribution
  requires, not the requested Fable 5.1. Iteration 4 did the same.
- The documented invocation is `npx tsx src/main.ts step ...`, because the
  package has no `step` script or bin. Adding one was not asked for.
- This iteration changed source and tests. It fixed the four regressions the
  first final audit found, which its documentation-only write boundary did
  not foresee.

## Final audit

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

From the worktree root, on the clean committed candidate:

| | First run | Final run |
| --- | --- | --- |
| Commit | `25f029149bf94d5ed434d2b90a3780dad9a047aa` | `f34ace23f0df785c2d3bc1f88e0000cfde41a622` |
| Request id | `e4eff62f-9cca-43d7-bb78-be3652814a8a` | `a3e42390-aeea-421f-9f64-29cf878a66d1` |
| Run id | `b578e7e3-3b38-4cfa-be80-4ae1799901d7` | `321b314d-91e6-4243-a887-28ba4b23e477` |
| Verdict | fail: 4 vitest failures, above | **pass**: every check passed |
| Vitest | 323/328 files, 2949/2955 tests | 327/328 files (1 skipped), 2953 passed, 2 skipped |

The final run executed in `full` mode, with ramify-audit 0.7.2 as the
producer, in 549 s. All six checks passed: `agent-scenarios`,
`agent-structure`, `agent-tests`, `agent-typecheck`, `agent-web-build` and
`patch-integrity`. Its report commit is `1941c6fd`, and its run ref is
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-10T10-41-05Z-f34ace23f`.
No flaky test was seen.

## Not verified

- The documented workflow has not been exercised end to end on a real
  project. That is the real-plan exercise.
- The README's `ramify materialize --view architect` comes from the
  toolkit's documentation and was not run here.
- The browser witness script was not run.
- Integration scenario owners keep `directory` as a non-empty relative
  path in `steps/inputs.ts`. No test covers an owner that is the root module.
  It may need the same treatment as `moduleDirectory`.

## Plan 31 handoff: outstanding qualification work

- The real-plan exercise: one real plan, or a bounded deliverable from it,
  applied in an agent-created worktree with authored or imported inputs,
  `render`, `run --agent pi`, `gate --checkpoint iteration` and `after`.
  Record the project, plan, deliverable, worktree, base, commits, project
  verification, the responsible agent's review, unresolved defects, elapsed
  time and cost. It awaits the user's go-ahead.
- The rule that bindings precede the iteration audit shares code with the
  run, but no test uses a real binding.
- After a passing work-item gate, a manual run cannot complete the work item.
- The manual final gate makes no NFR assessment or candidate binding. It
  reports them as not run.
- Plan 15's status line still has to be edited where it lives.
