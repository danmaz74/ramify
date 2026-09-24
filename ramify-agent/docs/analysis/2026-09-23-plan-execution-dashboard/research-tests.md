# Research: gates, checks, test runs and test results in a ramify-agent run

Research input for the plan execution dashboard analysis. It builds on
[inventory-model.md](inventory-model.md)
§1.15–1.19 and §1.23 and does not repeat them. It was written on 2026-09-24
against ramify-agent `7d6af7f`.

Conventions:

- `H/` is `/ramify/ramify-agent/subs/harness/`. `P/` is
  `H/src/interfaces/protocol/`.
- `RUN/` is the real run
  `/tmp/ramify-agent-loop-trial-XJHJla/collection-review/plans/status-badge-tone/.harness/jobs/20260923T164537Z-dbf0c2/`.
  It was read only. `PROJ/` is its project
  `/tmp/ramify-agent-loop-trial-XJHJla/collection-review/`, which was read
  only, with `git show`, `git ls-tree` and `git notes show`.
- `API/` is [api-examples/](api-examples/).

---

## 0. The shape in one picture

```text
run ─┬─ readiness attempt (readiness/NN/attempt.json, 14 steps) ──5 steps point at──┐
     │                                                                              ▼
     ├─ gate attempt ga-NNNN (gates/ga-NNNN/attempt.json)  ◄── proposedBy inv-NNNN (not exposed)
     │     subject {workItem?, iteration?} · head · commit · audited · evidence refs
     │     └─ commands[]  (one per planned check, in order; log NN-<kind>.log)
     │          ├─ tests        → selection.resolved[] test files → vitest (exit code only)
     │          ├─ type-check   → tsc (exit code only)
     │          ├─ ramify-check → ramify.analysis/1 JSON (read only on failure, for findings)
     │          └─ scenarios    → runs[] one per module → NDJSON stream → scenarios[] per sc-NNN
     │                                                         └─ binding[] step → def uri:line
     │     └─ audit (committing gates): refs/audited/runs/*, report commit, refs/notes/audit
     │
     └─ invocation inv-NNNN (engineer)
           ├─ scope-tests observations (run_scope_tests: vitest + quick scenarios)
           ├─ hook-check observations (ramify check --changed | complete) → hooks/NNN.json
           └─ shell calls (may run vitest/tsc; only an activity line and shell/NNN.log)
```

Per-test ("it") results exist only as text in vitest logs. Per-scenario and
per-step results exist in the Cucumber streams. The harness reduces the
streams to a per-scenario summary and never parses vitest or tsc output.

---

## 1. Every kind of test run the harness executes or records

### 1.1 Gate checks per checkpoint

The policy table is in `H/src/checks/checkpoint.ts:45-52`. The command lists
are built by `allProjectChecks` and `scopedChecks`
(`H/src/checks/checkpoint.ts:74-125`). The scenario check is planned by
`planScenarioCheck` (`H/src/checks/checkpoint.ts:201-255`).

| Checkpoint | Commands, in order | Test scope | Scenario mode, selection | Executor | Subject |
|---|---|---|---|---|---|
| `readiness` | `tests` (`npm test`), nested packages' `tests`, `type-check`, `ramify-check`, `scenarios` quick, then `scenarios` full `--dry-run` | whole project (the project's own runner selects) | quick `all-untagged`, then full dry run | in place (`H/README.md:128-130`) | `{}` |
| `iteration`, `contract` | `tests` (`vitest run <resolved files>`), `type-check`, `ramify-check`, `scenarios` | `owned-by-scope`: exact owners' `src/tests/` + included subtrees + `extraSuites` | quick `identity` (scope owners' scenarios past `pending`), or `none-selected` | audit | `{workItem, iteration}` |
| `breaking-iteration` | as `work-item` | all-project | quick `all-untagged` | audit | `{workItem, iteration}` |
| `work-item` | `tests` (`npm test`), `type-check`, `ramify-check`, `scenarios`, then the **scope probe** `tests` over the last assignment's selection | all-project, plus the probe | quick `all-untagged` | audit | `{workItem}` |
| `final` | `tests` (`npm test`), `type-check`, `ramify-check`, `scenarios` | all-project | full `all` | audit | `{}` |

- The contract gate also runs the `fake-naming` rule, which the harness
  verifies itself (`H/src/run/service.ts:3469-3475`). It is recorded in
  `rules[]` (`H/src/checks/records.ts:153-157`).
- **`conformance` is declared but never planned.** The kind exists in the
  enum (`H/src/checks/records.ts:105`, `H/src/run/records.ts:584`,
  `P/runs.ts:918`). A committing gate refuses to record an operation for a
  planned `conformance` check (`H/src/run/service.ts:5203`). Conformance
  suites run inside the `tests` command as `extraSuites` of the selection
  (`H/src/work/scope.ts:175-180`, `H/src/checks/selection.ts:94-104`).
  `provider-conformed` then names the gate (`H/src/run/log.ts:370-376`).
- **The standalone session** (`ramify-agent session --gate`) runs an
  `iteration` checkpoint in place. It writes `gate/attempt.json` in the
  session directory (`H/src/sessions/records.ts:39-40`,
  `H/src/sessions/single.ts:298`). It is not part of a run.

**Scope resolution (is vitest scoped to modules?).** Only for `owned-by-scope`.
An assignment captures a policy `{policy, exactOwners, subtrees, extraSuites}`
(`H/src/checks/records.ts:91-97`), never a file list. Each gate attempt and
each `run_scope_tests` call resolves it again from the tree
(`H/src/checks/selection.ts:6-17, 51-107`):

- The owner-to-directory map comes from the refreshed architect view.
- The test area is `<dir>/src/tests`, or `<dir>/src` for a testing module
  (`H/src/checks/selection.ts:114-117`).
- The file pattern is `*.test|spec.[cm]?[jt]sx?`
  (`H/src/checks/selection.ts:20`).
- The resolved files are appended to the template
  `node_modules/.bin/vitest run` (`H/src/run/policy.ts:201-205`,
  `H/src/checks/checkpoint.ts:100-109`).
- An empty required selection is `not-verified: empty-selection`
  (`H/src/checks/verify.ts:82`).

`all-project` runs `npm test` with no selection
(`H/src/checks/selection.ts:54`; `selection` is absent on the record). Which
files ran is then not recorded as data, only in the log text.

**Attribution.** Each planned check carries `attribution: in-scope|project`
(`H/src/checks/verify.ts:15-42`). `causeOf` and `outsideAssignment` use it
with the scope probe to decide `outside-assignment`
(`H/src/checks/gate.ts:278-347`). The planned attribution is **not
recorded** on the command record.

### 1.2 The command record (every gate check)

`GateCommandRecord` (`H/src/checks/records.ts:160-175`; Zod mirror
`H/src/run/records.ts:583-640`):

| Field | Meaning | Exposed (`GET …/gates/:gate`, `P/runs.ts:917-943`) |
|---|---|---|
| `kind` | `tests \| type-check \| ramify-check \| conformance \| scenarios` | yes |
| `command.argv`, `cwd` | the exact command; scoped tests include the file list | yes |
| `command.env` (names), `envAdditions`, `timeoutMs` | environment names and the harness's settings, the bound | no (`H/src/projections/work.ts:209-261`) |
| `selection` | `{policy, exactOwners, subtrees, extraSuites, resolved[]}` for scoped tests | yes |
| `startedAt`, `elapsedMs` | wall-clock per command | yes |
| `exitCode`, `outcome`, `notVerified`, `runnerError` | the outcome comes only from how the command ended (`H/src/checks/gate.ts:234-269`) | yes |
| `output{path, bytes, truncated, tail}` | complete log at `gates/<id>/NN-<kind>.log` (`H/src/checks/execution.ts:132-134`); tail ≤ 8 KiB (`H/subs/evidence/src/run-command.ts:37`) | yes; tail re-bounded (`H/src/projections/work.ts:200-207`); the path is absolute and not fetchable |
| `scenarios` | `ScenarioCheckSummary` (§1.6) | compact view without `binding`, `profile`, `messages`, `setup`, `teardown` (`P/runs.ts:863-888`) |

- **Commands are sequential.** Each command's `startedAt` plus its
  `elapsedMs` gives its span. A gate's own start is the first `startedAt`.
  Its end is the `gate-attempted` event time (`H/src/run/log.ts:447-453`),
  which the attempt record does not carry.
- **Per-attempt events.** `gate-committing{gate, checkpoint}` (committing
  gates only) and `gate-attempted{gate, checkpoint, verdict, next,
  committing?}` (`H/src/run/log.ts:445-453`). Readiness closes with
  `readiness-passed{attempt, gate}` (`H/src/run/log.ts:147`).

### 1.3 `tests`

- **Command**: `npm test` (all-project and readiness), each nested package's
  own `tests` command at readiness only, or `vitest run <files>` (scoped and
  scope probe).
- **Result**: the exit code only. "No test output is parsed for any of this"
  (`H/README.md:147-148`; `H/src/checks/gate.ts:155-160`).
- **On failure**: the diagnostics quote the last 40 lines, at most 4,000
  characters, of the tail, never parsed (`H/src/checks/diagnostics.ts:20-24,
  113-119, 236-248`).
- **The nested packages' commands** have the same `kind: tests` and no
  marker. Only `cwd`/`argv` tell them from the project's own.

### 1.4 `type-check`

- **Command**: `npm run type-check` (`H/src/run/policy.ts:193`).
- **Result**: the exit code. tsc diagnostics (`file(line,col): error TSnnnn`)
  are only in the log text and are not parsed.

### 1.5 `ramify-check`

- **Command**: `ramify check --batch --root <root> --format json`
  (`H/src/run/policy.ts:206-211`). Exit 2 is `not-verified` and never a pass
  (`H/src/checks/gate.ts:263-265`).
- **Output**: the `ramify.analysis/1` report, 1.8 MB in the real run (§4).
- **What the harness reads**: only when the check failed.
  `ramifyReportOf` parses the log, from the first brace to the last
  (`H/src/checks/diagnostics.ts:42-60`). `findingsOf` maps
  `diagnostics[]`/`findings[]` to
  `HookFinding{identity, code, message, file, line, importer, original{owner,
  file, binding}}` (`H/src/hooks/post-write.ts:66-77, 248-278`).
- **Attribution**: findings are compared with the write scope into
  `attribution{basis, inScope[], outside[]}`
  (`H/src/checks/diagnostics.ts:257-279`). It is recorded, not exposed.
- **Where it goes next**: any failed ramify-check sends the attempt to the
  local architect, whatever else happened (`H/src/checks/gate.ts:365`).

### 1.6 `scenarios` (Cucumber)

- **Execution**: one run per module, in sequence, with optional `setup` and
  `teardown` around them (`H/src/checks/scenario-check.ts:91-220`).
- **Per run, under `gates/<id>/scenarios/`**:
  - a profile `<dir-with-dashes>.profile.mjs`: support imports, the module's
    `src/tests/steps/**/*.{ts,js}`, its `src/tests/features`, the tag
    expression, `strict`, and the `message:` formatter;
  - a stream `<same>.ndjson` (`H/subs/scenarios/src/profiles.ts:82-125`).
- **Combined log**: `NN-scenarios.log` holds every command's output plus a
  closing summary sentence (`H/src/checks/scenario-check.ts:275-281`).
- **Reducer**: `summarizeScenarioRun` reads the stream
  (`H/subs/scenarios/src/messages.ts:92-172`):
  - Tracked scenarios are recognized by the `@ramify-sc-NNN` tag in the
    record's file.
  - A status is the worst over the scenario's pickles at their last attempt
    (`H/subs/scenarios/src/messages.ts:68`).
  - `binding[]` lists each step with every matching definition `uri:line`.
  - `failure{step, message}` is the first step with the scenario's status.
  - `undefined[]` holds the step texts no definition matched.
  - Untracked scenarios are **counted only** (`passed|skipped|failed`).
- **Summary**: `ScenarioCheckSummary{mode, selection, dryRun, excluded,
  setup{exit}, teardown{exit}, runs[{module, exit, profile, messages}],
  scenarios[{id, run, status, file, line, binding, failure?, undefined}],
  untracked, failures[]}` (`H/src/checks/records.ts:178-216`).
- **Pass rule**: the command passes when `failures` is empty. A missing
  summary is `not-verified: runner-error/scenario-summary-missing`
  (`H/src/checks/gate.ts:244-252`).
- **Not read from the stream**: step durations, timestamps, attachments,
  hook results, retries beyond "last attempt", and the names of untracked
  scenarios (§2.2).
- **Protocol**:
  - The gate view carries `scenarios` compact (`P/runs.ts:863-888`).
  - `GET …/scenarios` gives per scenario `gates[{gate, checkpoint, subject,
    verdict, mode, dryRun, status, failure, undefined}]`
    (`P/runs.ts:952-992`). It is built by scanning every gate's scenario
    commands (`H/src/projections/scenarios.ts:85-109`).
  - `implementedBy` comes from `scenario-implemented{scenario, gate}`
    (`H/src/projections/scenarios.ts:123-126`; `H/src/run/log.ts:188`).
    `scenario-bound-passed{scenario, gate}` (`H/src/run/log.ts:195`) marks a
    pass against fakes.

### 1.7 The audit (ramify-audit 0.1.0)

**Which gates**: the committing checkpoints (`iteration`, `contract`,
`breaking-iteration`, `work-item`, `final`). The harness commits first
(trailer `Ramify-Gate`). Then `createAuditCheckExecution` asks ramify-audit to
check that commit out in a temporary worktree and runs each planned check
there through a registered executor (`H/subs/audit/src/check-execution.ts:74-232`).

**What the audit adds per gate**:

- **Check IDs**: `check-NN-<kind>` plus `harness-rules` (guarded changes and
  failed rules) (`H/subs/audit/src/check-execution.ts:303-328, 374-391`).
- **A per-check summary written into the audit report**:
  `{passed, status, summary, output (full text), durationSeconds,
  details{kind, exitCode, notVerified, scenarios{mode, selection, runs,
  scenarios[{id, status}], untracked, failures}}, outputBytes,
  outputTruncated, runnerError?}` (`H/subs/audit/src/check-execution.ts:588-618`).
- **The request**:
  - `requestId` is the attempt ID and `source` is the existing commit.
  - `universeId` is `ramify-agent:<checkpoint>:<policy>[:owners]`.
  - `coverageClaim{checkpoint, selectionPolicy, owners[exact:…|subtree:…]}`.
  - The selector is `full`.
  - `metadata{runId, attemptId}` (`H/subs/audit/src/check-execution.ts:340-372`).
- **Publication**, recorded on the attempt as
  `evidence{runRef, reportCommit, treeRef}` and `audited`
  (`H/subs/audit/src/check-execution.ts:225-229`):
  - `refs/audited/runs/<timestamp>-<sha9>`, a report commit whose tree is
    `reports/audit/check-NN-<kind>.txt`, `harness-rules.txt` and
    `summary.json`;
  - `refs/audited/by-tree/<tree>`;
  - a git note under `refs/notes/audit` on the audited commit.
- **Workspace lifecycle**: `gates/<id>/audit-workspace.json`
  (`ramify-agent.audit-workspace/1`, state, paths, source commit, process,
  `recordedAt`, `cleanedAt`). `operation.json` holds the durable input.

**What a dashboard gets**: only the three evidence refs, through the gate
view (`P/runs.ts:901`). The report commit's `summary.json` duplicates the
harness's own record, adding `durationSeconds`, the full output text and the
audit's `coverage` block. It can be read only with git in the target
repository.

### 1.8 Readiness

- **Record**: `readiness/NN/attempt.json` holds 14 steps (inventory §1.17).
- **Gate link**: five steps (`baseline-tests`, `baseline-type-check`,
  `baseline-ramify-check`, `baseline-acceptance`, `acceptance-full`) carry
  `gate: ga-0001`, and their `detail` holds a prose summary with a clipped
  output fragment. In the real run the `baseline-tests` detail starts
  "the project's tests: `npm test` passed in 1583 ms; …".
- **Mapping**: the steps map to `ga-0001.commands[0..4]` by order, not by a
  recorded index. The readiness record is not exposed.

### 1.9 Test runs inside an engineer session

**`run_scope_tests`** (`H/src/work/engineer.ts:315-448`):

- **What runs**:
  - the same scoped `vitest run <resolved>` as an iteration gate, but in the
    working tree, not an audit worktree;
  - a quick `identity` scenario check that also includes the work item's
    `pending` scenarios (`H/src/checks/checkpoint.ts:183-188, 214`).
- **Recorded as a `scope-tests` observation** (`H/src/run/observations.ts:83-100`):
  - `callId`, `resolved[]`, `outcome`, `notVerified`, `exitCode`,
    `elapsedMs`;
  - `scenarios{selected[], passed[], failures}` (a count only);
  - the observation's `at`, which is the end time.
- **Vitest output is not saved to a file.** `runCommand` gets no
  `outputFile` (`H/src/work/engineer.ts:376-382`), so the output survives
  only as the 8 KiB tail inside the tool-result text in the transcript.
- **Scenario files**: the check writes
  `invocations/<inv>/scenarios/NNN/{scenarios.log, scenarios/*.profile.mjs,
  *.ndjson}` (`H/src/run/records.ts:774-775`;
  `H/src/work/engineer-equipment.ts:204-219`). The per-scenario summary
  itself is **not recorded**, except as prose in the tool result.
- **Exposed**: only as the transcript tool-result (`tool:
  "run_scope_tests"`, `isError`). The observation is aggregated nowhere
  (inventory §1.20).

**Shell calls**:

- **What runs**: the engineer can run `vitest`, `npm test` or `tsc` through
  `shell`.
- **Recorded as**:
  - an `activity{kind: tool, tool: shell, command}` observation;
  - a transcript tool-call with `action{kind: command, command}`;
  - a tool-result whose text holds `Exit N. Elapsed …` and the complete
    output file `invocations/<inv>/shell/NNN.log` (`H/src/run/records.ts:770-771`);
  - an `unguarded-shell` coverage gap.
- **Not recorded**: no structured exit code in the observation and no
  classification as a test run.
- **In the real run**: `inv-0003` ran `mv …` and `npm run type-check`
  (`shell/002.log`, 71 B). It did not run vitest through the shell.
- **Exposed**: through the transcript. The complete log is fetchable with
  `…/sessions/:ses/files?path=` because the transcript names it
  (`P/sessions.ts:303-315`).

**Post-write hook checks** (`H/src/hooks/post-write.ts:26-63`;
`H/src/work/engineer-equipment.ts:306, 338`):

- **What runs**: `ramify check --changed --format json --deadline …` after
  each settled mutation (`H/src/run/policy.ts:218-223`). A complete check
  runs when the changed set is unknown, and a check at completion
  (`atCompletion: true`).
- **Observation `hook-check`**: `{paths, mode, outcome:
  passed|findings|not-checked, reason, newFindings, log, atCompletion?}`
  (`H/src/run/observations.ts:62-75`).
- **Output**: `invocations/<inv>/hooks/NNN.json`. A changed check prints
  `ramify.check/1`: `revision`, `since`, `changed[{path, sha256, covered}]`,
  `outcome`, `findings[]`, `removed[]`, `coverage[]`, `checked{path, files,
  accesses, modelRebuilt}`, `timings{daemon{…}, waitedMs, totalMs, reply{…}}`
  and `exitCode`. A complete check prints `ramify.analysis/1`.
- **Transcript**: a `harness` entry `post-write-check{callId, checks[{…,
  log{stored: file, path, bytes}}], text, atCompletion}`.
- **Exposed**:
  - aggregated as `evaluation.hookChecks{passed, findings, notChecked,
    newFindings}` (`H/src/projections/metrics.ts:242-262`);
  - the transcript entry;
  - the hook JSON through `files?path=`, first 1 MiB only (the complete
    checks are 1.8 MB).

---

## 2. Per-test detail: what exists, what is parsed, what is cheap

| Source | Granularity available | Parsed by the harness today | Cheap to obtain |
|---|---|---|---|
| Vitest log `NN-tests.log` | Per file: pass mark, test count, duration in ms. Totals ("Test Files 20 passed (20)", "Tests 79 passed (79)"), start and duration. On failure: failing test names, assertion diff, stack. ANSI-coloured. | **No** (exit code only) | **Scoped runs**: yes. The harness owns the argv (`H/src/run/policy.ts:201-205`), so adding `--reporter=default --reporter=json --outputFile=<gate>/NN-tests.json` yields per-test `{fullName, ancestorTitles, status, duration, failureMessages, location}`. **`npm test`**: readiness verifies only that vitest is installed, not that `test` is `vitest run` (`H/src/run/readiness.ts:288-300`), so appending reporter arguments is not safe in general. The fallback is a regex over the ANSI-stripped log for per-file lines and totals. |
| tsc log `NN-type-check.log` | One line per diagnostic, `file(line,col): error TScode: message` | No | Yes. With `--pretty false`, which the project's script controls, a line regex gives file, line, code, message. Files map to owners through the view. |
| ramify-check report (`ramify.analysis/1`) | `summary{owners, sourceFiles, accesses, allowed, denied, errors, warnings, coverageNotes, external}`, `outcome{execution, check, coverage}`, `stages[]`, `diagnostics[]` (`{id, category, code, message, location, related, importer{file, area}, original, accessId}`, `/ramify/subs/analysis/src/interfaces/analysis.ts:58-71`), `warnings[]` (outside-module source), `coverage[]` (limits such as `signature-inferred`), `snapshot.areas[]` (owner, kind `ordinary\|tests`, root, tag profile), `snapshot.accesses[]` and `snapshot.results[]` (per import: importer file/area, specifier, form, and decisions `{status: allowed\|denied, reason, question{importer, target, selection.original{owner, file, binding}}}`) | Only `diagnostics`/`findings`, and only for a failed check (`H/src/checks/diagnostics.ts:62-66`) | Yes. The report is already on disk for every gate. The `summary` and `coverage` counts are small. Per-module findings are grouped by `importer.area.owner`. Test-area imports (`area.kind == "tests"`) give test file → imported originals, including step files (§3.5). |
| Cucumber NDJSON `scenarios/*.ndjson` | `meta` (cucumber-js 13.2.1, node version), `source`, `gherkinDocument`, `pickle` (name, uri, tags), `stepDefinition` (uri:line), `hook`, `testCase` (steps with `stepMatchArgumentsLists`), `testRunStarted/Finished` with timestamps and success, `testCaseStarted/Finished` with timestamps, attempt and `willBeRetried`, `testStepFinished` with `status`, `duration{seconds, nanos}`, message/exception, `testRunHookStarted/Finished`, `attachment` when the steps attach anything | Yes, for tracked scenarios: status, binding, first failure, undefined steps. **Not**: durations, timestamps, step-level statuses, attachments, hook outcomes, retries, untracked scenario names and statuses, step arguments. | Yes. Everything is in the file, and the reducer already walks every envelope (`H/subs/scenarios/src/messages.ts:114-136`). Adding per-step `{step, status, durationNs}` and per-scenario start/end is a small change. |
| Audit report commit | `summary.json` per check: `durationSeconds`, full `output`, `details`, `overall`, `coverage{claim, selection, universe}`. `check-NN-*.txt` holds the full output. | Not read back | Git reads in the target repository only. It duplicates the attempt. |
| Architect view `tests.jsonl` | Per test file: `module`, `file`, `suite[]`, `tests[]` (titles), `exercises[]` (`owner#name`, at most 12, plus `exercisesMore`). Gherkin records: `feature`, `scenarios[]` titles (`/ramify/docs/architecture/architect-view.spec.md:329-372`). | **No.** The harness never reads it. `H/subs/evidence/src/views.ts:41` only notes when `testReferences` is unavailable. | Yes, for the current tree: `PROJ/.ramify-architect/**/tests.jsonl` exists (15 files). It is regenerated per view refresh, so it is not tied to a gate's commit. |

---

## 3. Relationships

### 3.1 Gate → subject, commit, checks

| Relation | Where | Exposed |
|---|---|---|
| gate → work item / iteration | `subject{workItem?, iteration?}` (`H/src/checks/records.ts:231`) | yes, gate view and `gateSummary` in the work item (`P/runs.ts:587-594, 637, 641`) |
| iteration → accepting gate, commit | `result{gate, commit}` (`P/runs.ts:629-636`); `iteration-closed{gate, commit}` | yes |
| gate → commit made / commit audited / head before | `commit`, `audited`, `head` (`H/src/checks/records.ts:236-240`) | yes |
| commit → gate | trailers `Ramify-Gate`, `Ramify-Work-Item`, `Ramify-Iteration`, `Ramify-Invocations` on the commit (`PROJ` e99fee0) | no (git only) |
| gate → audit evidence | `evidence{runRef, reportCommit, treeRef}` | yes, the refs only |
| gate → checks | `commands[]`, by position; the log name `NN-<kind>` and the audit `check-NN-<kind>` share the position | yes |
| check → test files | `selection.resolved` (scoped only) | yes |
| check → scenario runs → scenarios | `scenarios.runs[].module`, `scenarios.scenarios[].run` | yes, without profile or stream paths |
| run → readiness gate, final gate | `readiness-passed{gate}`, `job-completed{gate}` event refs | as event refs only; there is no gate list (inventory §5.1.2) |

### 3.2 Session and invocation → gate

- **Who proposed a gate**: `gate.proposedBy` holds the invocation whose
  submission led to it. Examples: `ga-0002` ← `inv-0003`, the engineer's
  `completion-proposed`; `ga-0003` ← `inv-0004`, the local architect's
  completion. Readiness and final gates have `null`. `proposedBy` is **not
  exposed** (`H/src/projections/work.ts:213-260` omits it). A client can
  approximate it by joining the `gate-committing` time with the preceding
  `invocation-ended`/submission of the same subject.
- **The session's gates**: follow invocation → session. The web module
  cannot join this today without `proposedBy`.

### 3.3 Failing check → repair session

- **Gate side**: `next: repair` (`H/src/checks/gate.ts:349-371`). The loop
  increments `repairRound`, builds `gateDiagnostics(gate, 'engineer')`, and
  continues the kept engineer session (`H/src/run/service.ts:2825-2837,
  3445-3448`).
- **Invocation side**: the repair invocation's `continues{from, reason:
  'repair', briefs}` does **not name the failed gate**
  (`H/src/run/records.ts:465-471`; `P/transcripts.ts:106-110`). The gate ID
  appears only in the briefing text: "## The gate did not pass / Attempt
  `ga-…` (cause)" (`H/src/work/engineer.ts:563-566`). The next attempt's
  `repairRound` is the only structured trace.
- **Local architect side**: `return-to-local-architect` ends up in the
  architect's gate section with the same diagnostics.
- **Infrastructure retries**: `infrastructureAttempt` on the gate, and
  `recoveries/rec-*.json`, which is not exposed.

### 3.4 Scenario → feature file, step definitions, results

- **Scenario → feature file and line**: `record.file`
  (`<owner-dir>/src/tests/features/<plan>/<entry>.feature`). The Scenario
  keyword line comes per gate from the stream (`scenarios[].line`, for
  example 13 and 20).
- **Scenario → step definitions**: `binding[{step, definition: uri:line}]`
  per gate. Recorded, **not exposed** (the gate view drops it,
  `P/runs.ts:856-862`). It is also shown to the architect in diagnostics
  (`H/src/checks/diagnostics.ts:200-208`). Example: `sc-001` has 4 steps,
  bound to `status-badge-tone.steps.ts:37, 48, 54, 61`.
- **Scenario → results per gate**: `GET …/scenarios[].gates[]`. It carries
  no link to the `run` module, the command index, per-step results or
  durations.
- **Scenario → owner module and work item**: `owner`, `workItem`, `entry`
  (the capability) in the scenario view.
- **Scenario → scope-test results**: only in `scope-tests.scenarios`
  (selected, passed, failures count) and the `invocations/<inv>/scenarios/NNN/`
  streams. The first call in the real run shows `sc-001` and `sc-002`
  `undefined` (the `.tsx` step file was not loaded by the `{ts,js}` glob).
  The second shows both passed.

### 3.5 Test file → module and symbols

- **Test file → owning module**:
  - by construction, `<module-dir>/src/tests/**` or a testing module's
    `src/` (`H/src/checks/selection.ts:114-117`);
  - the architect view's `tests.jsonl` `module` field;
  - `snapshot.areas[]` in every ramify-check report (`owner`, `kind: tests`,
    `root`, tag profile).
- **Test file → exercised symbols**:
  - `tests.jsonl` `exercises` (behavioral references, per file). Example:
    `status-badge.test.tsx` exercises
    `collection-review/workspace/shared-ui#StatusBadge`.
  - The ramify-check report's `snapshot.results[]` for importers in `tests`
    areas, which gives every static import, type-only included. It covers
    **step files**, which have no `describe`/`it` and so no `tests.jsonl`
    record. Example: `status-badge-tone.steps.ts:8` imports `StatusBadgeProps`
    type-only, `same-owner`, allowed. The real report has 148 accesses from
    test areas out of 311.
- **Test file → test titles**: `tests.jsonl` `suite[]`, `tests[]`. Example:
  4 titles in `status-badge.test.tsx`, 2 of them added by the run.
- **Neither of the last two is read by the harness.** Nothing binds a test
  title to a gate result, because vitest output is not parsed.

### 3.6 Test → capability

There is **no direct test → capability link** for ordinary tests. The
chains available:

- **Scope chain**: capability → `workItems[]` (`P/runs.ts:682`) → work item →
  iterations → `scope.modules` + `includedChildren` → the selection policy →
  each gate's `selection.resolved[]` files. This holds only for
  `owned-by-scope` gates. It is a module-level link, not a behavioral one.
- **Symbol chain**: capability → owner module (registry) → exposed symbols;
  test files whose `exercises` name those symbols (`tests.jsonl`).
  Capability registrations do not record symbols, so this is heuristic.
- **Delegation chain**: this is the only explicit test-to-capability link.
  - Provider obligation: `capability` + `evidence.conformance[]` test paths
    (`H/src/contracts/records.ts:91-102`).
  - Contract `artifacts.conformance[{path, hash}]`
    (`H/src/contracts/records.ts:82`).
  - Consumer requirement: `forCapability` + `evidence.tests`
    (`TestSelectionPolicy`) + `fakeInjections[]`
    (`H/src/contracts/records.ts:105-123`).
  - None of these is exposed (inventory §1.21).
- **Scenario chain**: entry capability → tracked scenarios (`entry`) → gate
  results. This is the one behavioral link that is exposed:
  `capability.scenarios{implemented, total}` and `GET …/scenarios`.

### 3.7 Capability → evidence gates

`capabilityProgress.evidence[]` is the union of the passing work-item gates
of its work items, the conformance gates of their obligations, and the
verification gates of its requirements (`H/src/projections/progress.ts:152-175`).
It is exposed as gate IDs. Example: `render-status-badge-tone` → `["ga-0003"]`
(`API/run_capabilities.json`). The iteration gate `ga-0002` that made its
scenarios `implemented` is not in `evidence`. It is reachable through
`scenarios[].implementedBy`.

---

## 4. The real run as example

### 4.1 Gate directories

```text
gates/ga-0001/  readiness   01-tests.log 3.1K · 02-type-check.log 71B · 03-ramify-check.log 1.83M
                            04-scenarios.log 657B · 05-scenarios.log 684B · attempt.json 23K
                            scenarios/subs-integration-tests.{ndjson 21.8K, profile.mjs}
gates/ga-0002/  iteration   01-tests.log 490B · 02-type-check · 03-ramify-check 1.85M · 04-scenarios 787B
                            attempt.json 20K · audit-workspace.json · operation.json 8.0K
                            scenarios/subs-workspace-subs-shared-ui.{ndjson 16.7K, profile.mjs}
gates/ga-0003/  work-item   01-tests 3.1K · 02 · 03 · 04-scenarios 1.4K · 05-tests.log 490B (scope probe)
                            attempt.json 26.6K · audit-workspace.json · operation.json
                            scenarios/{subs-integration-tests, subs-workspace-subs-shared-ui}.{ndjson, profile.mjs}
gates/ga-0004/  final       01-tests 3.1K · 02 · 03 · 04-scenarios 1.4K · attempt.json 24K · audit-workspace · operation
                            scenarios/ (both modules)
```

**Defect found: readiness overwrites its own quick-run stream.** In `ga-0001`,
commands 04 (quick) and 05 (full dry run) share the name
`scenarios/subs-integration-tests.ndjson`, because the name is derived from
the module only (`H/subs/scenarios/src/profiles.ts:58-61, 96-98`). The
remaining stream has 12 `SKIPPED` step results, so it is the dry run's. The
quick run's summary survives in `attempt.json`; its stream does not. The
same holds for the profile.

### 4.2 Attempt records, summarised

| Gate | Checkpoint | Subject | proposedBy | head → commit / audited | Evidence | Commands (elapsed ms) | Verdict |
|---|---|---|---|---|---|---|---|
| ga-0001 | readiness | {} | null | 1bbe014 / – / – | null | tests 1583, type-check 691, ramify-check 3460, scenarios quick 1639, scenarios full dry 1070 | passed, accept |
| ga-0002 | iteration | wi-001, wi-001.i01 | inv-0003 | 2fe54cc → e99fee0 / e99fee0 | runRef `refs/audited/runs/2026-09-23T16-56-35Z-e99fee073`, report b8546b4 | tests (scoped, 1 file) 676, type-check 702, ramify-check 3660, scenarios identity sc-001, sc-002 1233 | passed |
| ga-0003 | work-item | wi-001 | inv-0004 | e99fee0 → null / e99fee0 | report 2cf8d29 | tests 1554, type-check 715, ramify-check 3681, scenarios all-untagged (2 runs) 2453, probe tests 704 | passed |
| ga-0004 | final | {} | null | e99fee0 → null / e99fee0 | report 6d4b595 | tests 1527, type-check 687, ramify-check 3416, scenarios full all (2 runs) 2558 | passed |

**One command record** (`ga-0002.commands[0]`, env truncated):

```json
{"kind":"tests",
 "command":{"argv":[".../collection-review/node_modules/.bin/vitest","run","subs/workspace/subs/shared-ui/src/tests/status-badge.test.tsx"],
            "cwd":".../collection-review","env":["HOME","LOGNAME","NODE_ENV","…"],"envAdditions":{},"timeoutMs":600000},
 "selection":{"policy":"owned-by-scope","exactOwners":["collection-review/workspace/shared-ui"],"subtrees":[],"extraSuites":[],
              "resolved":["subs/workspace/subs/shared-ui/src/tests/status-badge.test.tsx"]},
 "startedAt":"2026-09-23T16:56:29.404Z","elapsedMs":676,"exitCode":0,"outcome":"passed","runnerError":null,
 "output":{"path":"RUN/gates/ga-0002/01-tests.log","bytes":490,"truncated":false,"tail":"\n\u001b[1m…"}}
```

**One per-scenario result** (`ga-0002.commands[3].scenarios.scenarios[0]`):

```json
{"id":"sc-001","status":"passed",
 "file":"subs/workspace/subs/shared-ui/src/tests/features/status-badge-tone/render-status-badge-tone.feature","line":13,
 "binding":[{"step":"Given a badge for a passed review with the tone \"warning\"","definition":"subs/workspace/subs/shared-ui/src/tests/steps/status-badge-tone.steps.ts:37"},
            {"step":"When the badge is rendered","definition":"…status-badge-tone.steps.ts:48"},
            {"step":"Then its markup carries the tone \"warning\"","definition":"…:54"},
            {"step":"And it still reads \"Passed\"","definition":"…:61"}],
 "undefined":[],"run":"collection-review/workspace/shared-ui"}
```

### 4.3 Check output heads

**Vitest** (`ga-0003/01-tests.log`, ANSI stripped): 20 files and 79 tests.
Readiness had 77 tests, so the run added 2. That delta is visible only by
parsing text.

```text
> collection-review@0.0.0 test
> vitest run
 RUN  v5.0.0 /tmp/ramify-audit-worktree-NOM7Ls/source
 ✓ subs/workspace/subs/catalog/subs/ui/src/tests/catalog-card.test.tsx (2 tests) 17ms
 ✓ subs/workspace/subs/shared-ui/src/tests/status-badge.test.tsx (4 tests) 25ms
 …
 Test Files  20 passed (20)
      Tests  79 passed (79)
   Start at  16:57:16
   Duration  977ms (import 58%, transform 29%, tests 12%, worker 1%)
```

The audited logs name the deleted audit worktree
(`/tmp/ramify-audit-worktree-*/source`), not the project root. The path
restoration did not apply to vitest's header.

**type-check** (all gates, 71 B): `> collection-review@0.0.0 type-check`,
`> tsc --noEmit -p tsconfig.json`. Nothing else prints on success.

**scenarios** (`ga-0003/04-scenarios.log`): one `$ npm run acceptance:quick --
--config …/scenarios/<module>.profile.mjs` block per module with Cucumber's
progress output ("1 scenario (1 passed) / 12 steps (12 passed)"). It closes
with:

```text
Scenario check, quick mode, all-untagged, 2 run(s): passed. 2 of 2 tracked scenario(s) passed; the project's own: 1 passed, 0 skipped, 0 failed.
```

**Profile** (`ga-0002/scenarios/subs-workspace-subs-shared-ui.profile.mjs`):
imports `subs/integration-tests/src/support/{world,hooks}.ts` and
`subs/workspace/subs/shared-ui/src/tests/steps/**/*.{ts,js}`; `paths`
`[…/src/tests/features]`; `tags: "@ramify-sc-001 or @ramify-sc-002"`;
`strict: true`; `format: ["message:<abs>/gates/ga-0002/scenarios/….ndjson"]`.

### 4.4 Cucumber messages (kept for every gate)

`ga-0004/scenarios/subs-workspace-subs-shared-ui.ndjson`, envelope counts:
`meta 1, source 1, gherkinDocument 1, pickle 2, stepDefinition 5, hook 3,
testRunStarted 1, testRunHookStarted/Finished 2/2, testCase 2,
testCaseStarted/Finished 2/2, testStepStarted/Finished 9/9, testRunFinished 1`.
There are no attachments. Samples:

```json
{"meta":{"protocolVersion":"33.0.4","implementation":{"version":"13.2.1","name":"cucumber-js"},"runtime":{"name":"node.js","version":"22.23.2"}}}
{"testCaseStarted":{"attempt":0,"testCaseId":"6b52…","id":"b9f1…","timestamp":{"seconds":1790182654,"nanos":399000000}}}
{"testStepFinished":{"testCaseStartedId":"b9f1…","testStepId":"38b1…","testStepResult":{"duration":{"seconds":0,"nanos":314302},"status":"PASSED"},"timestamp":{…}}}
{"testRunFinished":{"testRunStartedId":"cbbf…","timestamp":{…},"success":true}}
{"hook":{"id":"e0e6…","type":"AFTER_TEST_CASE","sourceReference":{"uri":"subs/integration-tests/src/support/hooks.ts","location":{"line":37}}}}
```

Pickles carry the identity tag. The untracked scenario is
`collection-review.viz.feature` "A reviewer inspects the catalog and reviews
both records through both surfaces", with no tags.

### 4.5 ramify-check report structure (`ga-0004/03-ramify-check.log`, 1.85 MB)

- **Format**: a single JSON document, `schemaVersion: ramify.analysis/1`.
- **Top-level keys**: `runId, inputId, request{project, registry,
  capabilities, limits}, scope, registry, capabilities[14], stages[8],
  outcome, snapshot, diagnostics[0], warnings[2], coverage[12], summary`.
- **`outcome`**: `{"execution":"completed","check":"passed","coverage":"partial"}`.
- **`summary`**: `{"complete":true,"owners":15,"sourceFiles":56,"resources":6,"originals":103,"accesses":311,"allowed":175,"denied":0,"errors":0,"warnings":2,"coverageNotes":12,"external":136}`.
- **`warnings`**: `outside-module-source` for `vite.config.ts` and
  `vitest.config.ts`.
- **`coverage[0]`**: `{code: "signature-inferred", location: {file:
  "src/assembly.ts", line: 37}, message: "`assembleRouter` is exposed and its
  declared signature leaves a type to inference; …"}`.
- **`snapshot`**: `areas[30]` (e.g. `{owner:
  "collection-review/workspace/shared-ui", kind: "tests", root: "…/src/tests",
  profile: ["testing","ui"]}`), `inputs[3079]` (path, role, sha256, bytes),
  `catalog`, `linked`, `model`, `accesses[311]`, `results[311]` (per access
  `decisions[{status, reason, question{importer, target, forwarding, location,
  selection{original{kind, owner, file, binding}, request}}}]`, `outcome`,
  `diagnostics`, `coverage`).
- **What dominates the size**: `inputs` and the snapshot. The part a
  dashboard needs (`outcome`, `summary`, `diagnostics`, `warnings`,
  `coverage`) is a few KB.

The hook check `hooks/001.json` (`ramify.check/1`, 6 KB) is the incremental
form: `changed[{path, sha256, covered}]`, `checked{path: "unchanged-surface",
files, accesses: 0, modelRebuilt: false}`, `timings.totalMs 292.6`, `findings
0`.

### 4.6 Audit publication (PROJ git)

- **Refs**: `refs/audited/runs/2026-09-23T16-56-35Z-e99fee073` (b8546b4),
  `…16-57-24Z…` (2cf8d29), `…16-57-34Z…` (6d4b595), and
  `refs/audited/by-tree/46bacba…` → 6d4b595.
- **Report tree**: `reports/audit/{check-01-tests, check-02-type-check,
  check-03-ramify-check, check-04-scenarios, harness-rules}.txt,
  summary.json`.
- **`summary.json`** (ga-0002): `overall: pass`, `durationSeconds 6.404`,
  per-check `durationSeconds`, `coverage.claim{checkpoint: iteration,
  selectionPolicy: owned-by-scope, owners:
  [exact:collection-review/workspace/shared-ui]}`,
  `universe.testUnitIds: []`, `selection.selectedTestUnitIds: []`.
  ramify-audit models test units, but the harness passes none.
- **Git note on e99fee0**: `Audited-Overall: pass`, `Audited-Duration-Seconds:
  8.427`, `Audited-Report-Commit: 6d4b595…`, then a check list
  (`check-01-tests: PASS (1.527s)`, …).
- **One note per commit**: three gates audited the same commit, and the note
  and the by-tree ref name only the last audit (ga-0004). The earlier two
  survive only as run refs.

### 4.7 Captured protocol answers

- `API/run_gates_ga-000{1..4}.json` carry the command fields of §1.2 with
  tails of 3067/71/8192/1398/488 bytes for ga-0003. The scenario summary is
  compact, with no bindings.
- `API/run_scenarios.json`: `sc-001` and `sc-002` are `implemented`,
  `implementedBy: ga-0002`, with `gates` `[ga-0002 iteration quick passed,
  ga-0003 work-item quick passed, ga-0004 final full passed]`. Readiness
  `ga-0001` ran no tracked scenario, so it is absent.
- `API/run_work-items_wi-001.json`: iteration `wi-001.i01` has
  `result{outcome: accepted, gate: ga-0002, commit: e99fee0…, findings:
  ["The scenario harness discovers TypeScript step definitions with a .ts
  extension, …"]}` and `gates [ga-0002]`. The work item's own `gates` is
  `[ga-0003]`.
- `API/run_events_after_0.json`: `gate-committing` and `gate-attempted` with
  refs `{kind: gate}` only. `scenario-implemented` refs the scenario and the
  gate.

---

## 5. Gaps for a test-centric dashboard

### 5.1 Not recorded

1. **Per-test (vitest) results**: no names, statuses, durations, counts,
   failures or file-level results. Totals like "79 passed" live only in log
   text (inventory §5.2.1). The cheap fix is a JSON reporter on the scoped
   runs, whose argv the harness owns.
2. **Which files an all-project run executed**: `selection` is absent.
   Only the log's per-file lines say so.
3. **Test-count deltas between gates** (77 → 79 in the real run). They
   follow from item 1.
4. **Per-step Cucumber detail**: step statuses, durations, scenario
   start/end times, hook outcomes, attachments, retries. It is all in the
   NDJSON, and the reducer discards it.
5. **Untracked scenarios**: counts only, no names, files or failures, even
   when they fail the check. The check's `failures[]` says only "N of the
   project's own scenarios … did not pass".
6. **Planned attribution per command** (`in-scope|project`) and which
   command is the work-item gate's scope probe. The probe is recognizable
   only as the trailing `tests` with a `selection`.
7. **A gate's own start/end timestamps and total duration.** They are
   derivable from the first `startedAt` and the `gate-attempted` event.
8. **The readiness quick-run stream** is overwritten by the dry run
   (§4.1), a defect.
9. **Scope-tests detail**: no vitest output file, no start time, no
   per-scenario summary (counts and IDs only), no failure messages outside
   the transcript text.
10. **Shell test runs are not classified.** A `vitest` or `tsc` run through
    the shell is an `activity` line plus a log. Its exit code is only in the
    tool-result prose.
11. **Test → capability**: no explicit link except delegation records
    (conformance paths, requirement test policies). Nothing records which
    symbols a capability consists of, so a test cannot be tied to a
    capability behaviorally. Tracked scenarios are the only behavioral
    carrier.
12. **Repair linkage**: the repair invocation's `continues` does not name
    the failed gate. Only the briefing text and the next `repairRound` do.

### 5.2 Recorded, not parsed

- **tsc diagnostics**: log text only.
- **ramify-check reports of passing gates**: `summary`, `coverage` (for
  example 12 `signature-inferred` notes, rising to 15 in the hook check),
  `warnings`, `stages`, and the per-owner and per-access decisions. The
  harness opens the report only to explain a failure.
- **The architect view's `tests.jsonl`** (titles, `exercises`) and the
  report's test-area accesses (step file → originals).
- **Audit `summary.json`** and notes: they duplicate the attempt, but they
  are the only form tied to git and viewable without the run directory.

### 5.3 Recorded, not exposed

- **Gate fields**: `proposedBy`, `attribution{inScope, outside}`, `scenarios:
  none-selected`, the command `env`/`timeoutMs`, and the scenario summary's
  `binding`, `profile`/`messages` paths and `setup`/`teardown` exits
  (`H/src/projections/work.ts:209-261`, `P/runs.ts:856-862`).
- **Complete logs and streams**: `gates/<id>/NN-*.log`, `scenarios/*.ndjson`
  and `*.profile.mjs` are not fetchable. `files?path=` serves only paths a
  transcript names. The ramify-check tail (8 KiB of a 1.85 MB document) is
  the end of a JSON document and unusable as a summary.
- **Gate lists**: no gate list and no filter by checkpoint, verdict or
  subject. Readiness and final are reachable through event refs only.
- **Readiness steps** (with their gate pointers), infrastructure recoveries
  and audit workspace records.
- **Engineer-side runs**: `scope-tests` observations are not aggregated or
  listed. `hook-check` observations appear only as counts in
  `evaluation.hookChecks`. The hook JSON is fetchable through the transcript
  but truncated at 1 MiB, and the complete-mode ones are 1.8 MB.
- **Delegation test evidence**: obligation `evidence.conformance`, contract
  `artifacts.conformance`, requirement `evidence.tests` and `fakeInjections`.
- **Architect view**: the module tree answer (`API/project_modules.json`)
  carries `module`, `dir`, `parent` only: no test files, titles or
  `exercises`.

### 5.4 Minimal additions a dashboard would need

1. **Per-gate test facts** on `GateCommandRecord`:
   - a `tests` summary `{files: [{path, module, tests, passed, failed,
     skipped, durationMs}], totals}` from a vitest JSON report (scoped runs)
     or the log (all-project);
   - a `typeCheck` diagnostics list;
   - a `ramify` summary `{outcome, summary, findings by owner, coverage
     notes by code}` taken from the report the harness already parses on
     failure.
2. **The Cucumber reducer** keeps per-step `{text, status, durationNs,
   definition}` and per-scenario `{startedAt, durationMs}`, and names
   untracked scenarios with status, file and line.
3. **A gate list query** with `checkpoint`, `subject`, `verdict`,
   `proposedBy`, `startedAt`/`endedAt` and a test-count rollup. Also a
   fetch for a gate's files (logs, streams, profiles) by attempt-relative
   path.
4. **Protocol fields**: `proposedBy` and `attribution` on the gate view,
   `binding` on scenario results, and `continues.gate` on repair
   invocations.
5. **A test inventory projection per module**: test files, titles and
   `exercises` from `tests.jsonl`, joined with the latest gate that ran each
   file. With the delegation records this gives the capability → tests
   view.
6. **A fix for the readiness stream collision**: include the mode and
   dry-run in the profile and stream name.
