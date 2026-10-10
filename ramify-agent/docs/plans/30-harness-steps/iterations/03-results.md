# Iteration 3 results: the invocation runner and `step run`

[Iteration](03-step-run.md) · [Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Commits

On `feat/plan30-harness-steps`, after `b26ebc30`:

- `41e2a939` refactor(agent): extract the invocation runner from the run service
- `5566eed1` feat(agent): run one step from its inputs in a manual run
- `326be59d` feat(agent): run session on the step runner in a manual run
- this results file, in the commit that follows it

## What changed

- `steps/runner.ts` holds the invocation runner (`InvocationRunner`,
  `RunnerHost`, `InvocationRequest`, `InvocationResult`). `RunService` calls
  it. `InvocationResult.notStarted` marks an agent session that could not
  start, so callers report a refusal rather than an ended session.
- `steps/manual.ts` opens or reuses a manual run (`openManualRun`). It writes
  `job.json` with `kind: 'manual'` and the project, plan, base and branch
  identity, refuses an implementation directory, and validates the identity
  on reuse. `manualRunner` binds the runner to a manual run.
- `run/service.ts` `load` skips manual runs and lists them in
  `recovery.manual`; `http/server.ts` and `projections/inputs.ts` tolerate
  them.
- `steps/run.ts` with `steps/run-text.ts`, `steps/command.ts`, `src/cli.ts`
  and `src/main.ts`:
  `step run --inputs <file> --run <dir> [--agent pi [--model <m>] | --agent fake --script <file>]`.
  It takes the lock, materializes the views, runs one invocation, prints the
  condensed stream (tool calls, guard denials, hook findings, verdicts,
  appended harness text, summary) and exits 0, 1 or 2. SIGINT aborts the
  invocation.
- `sessions/single.ts` keeps the `session` command line and runs on the
  runner in a manual run at `plans/sessions/.harness/jobs/<id>/` (origin
  `session`, no branch, base = head). The session summary is
  `invocations/<id>/step.json` (`ramify-agent.session-summary/1`); the
  `--gate` attempt is that invocation's diagnosis. `plans/.harness/sessions/`
  is no longer written.

## Checks

- Focused, all passing: `steps-run` (5), `steps-run-load` (1), `cli`,
  `steps-authored`, `steps-inputs`, `single-session` (14), `session-queries`
  (2), `session-lifecycle`, `scratch-setup`, `transcript-run`,
  `steps-from-run`, `workflow-session-store`.
- Boundary project, all passing: `src/tests/session-command.test.ts` (3),
  `single-session.boundary.test.ts`, `single-session-integration.test.ts`,
  and the standalone case of `plan21-workflows.integration.test.ts`.
- `npm run type-check` passes; `npm run check:self` passes with 0 errors.
- No flaky test was seen.

## S09–S14 coverage

| ID | Tests |
| --- | --- |
| S09 | `steps-run.test.ts` "records the run's records…"; `session-command.test.ts` step run case |
| S10 | `steps-run-load.test.ts` |
| S11 | `single-session.test.ts`, `session-command.test.ts` session cases, the boundary and integration session tests; the CLI case verifies no `plans/.harness/sessions` exists |
| S12 | `steps-run.test.ts` first and second cases; `session-command.test.ts` step run case (exits 0, 1, 2) |
| S13 | `steps-run.test.ts` "each run is a new invocation…" |
| S14 | `steps-run.test.ts` third, fourth and fifth cases |

## Deviations

- `sessions/records.ts` is not deleted. It moved to
  `projections/standalone-records.ts` as the reader of existing standalone
  session directories, which the plan leaves in place and the standalone
  session view still shows. Its tests read two captured legacy directories in
  `tests/helpers/legacy-sessions/`.
- `session` registers no process group, as before.
- `step run` refuses reviewer `code`, `scope` and `design` inputs: they need
  a prepared review snapshot, which is iteration 4's work.
- `runStep` takes a `loadPackages` seam. S14's changed prompt package is an
  injected package, not an edit of the installed one.

## Open issues

- No test runs a reader-role step through `step run`.
- `README.md:111` and `subs/harness/README.md:814` still describe
  `plans/.harness/sessions/`; iteration 5 owns docs.
- `scripts/browser-acceptance/plan21-workflows.ts:113` looks for the W3
  standalone session under `plans/.harness/sessions/` and opens it in the
  standalone session view. New sessions are manual runs, which have no UI
  projection, so this script will fail until it reads
  `plans/sessions/.harness/jobs/` and a view shows manual runs, or the check
  is dropped. Not changed here.
- Session invocation ids restart at `inv-0001` within each session's manual
  run; the session id is the run directory name.

## Plan and code mismatches

- The plan names `sessions/records.ts` as retired; its schemas survive as the
  legacy reader above.
- The plan expects manual runs to need no UI; the standalone session view and
  the browser acceptance script still assume the retired layout.

## Iteration 4 handoff

- `gate` and `after` run over manual runs. A manual run's `job.json`
  (`kind: 'manual'`) names its base and branch; each invocation's records sit
  in the run layout, with `runLayout.diagnosis(id)` and `diagnosisOutput(id)`
  available, as the session's `--gate` already uses.
- Reviewer `code`, `scope` and `design` steps are refused by `step run`
  until a prepared review snapshot is available to a manual run.
