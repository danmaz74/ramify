# Baseline failures observed during Plan 7 regression

**Date:** 2026-09-22. **Status:** diagnostic report; fixes are not part of
Plan 7. **Merge consequence:** the Plan 7 acceptance suites pass, but the
repository-wide test command is not green.
**Resolved:** BF-1 to BF-5 were corrected in `d2fca15`, Plan 7's final commit.
The ramify-audit run of that commit,
`refs/audited/runs/2026-09-22T18-54-47Z-d2fca150e`, is the evidence: all five
checks pass, `agent-vitest` among them. The diagnosis below stands as written.

## Evidence boundary

The preserved repository-wide run was:

```sh
npm test -- --maxWorkers=1
```

It reported 97 test files: 86 passed, 10 failed and 1 skipped; 736 tests: 719
passed, 15 failed and 2 skipped. Four of those failures were Plan 7 assertions
that still expected a failed committing gate to have `commit: null`. Those
four assertions were updated to the implemented commit-then-audit contract and
their three focused files now pass:

- `breaking-work.test.ts`: 6 passed;
- `requirement-verification.test.ts`: 4 passed;
- `no-rewind.test.ts`: 2 passed.

The 11 failures below are the other failures from that preserved run. They
were reproduced independently where the table says so. The complete 48-minute
suite has not been rerun after correcting the four Plan 7 assertions, so
"11" is a reconciled count, not a claim that a later complete run reported
exactly 11.

## Summary

| ID | Tests | Count | Classification | Immediate correction |
| --- | --- | ---: | --- | --- |
| BF-1 | `iterations.test.ts`, `module-creation.test.ts`, `session-command.test.ts` | 5 | Copied fixture is incompatible with the current signature-companion rule | Correct the `collection-review` fixture's `module.ramify` exposures, then rerun all fixture consumers |
| BF-2 | `local-authority.test.ts` | 1 | Scripted placement submission omits a required field | Add `decision.changesExistingSymbols: false` to the global-fork decision |
| BF-3 | `progress.test.ts` | 3 | Constructed hypothesis helper omits a required field | Give `forecast()` a default `changesExistingSymbols: false` |
| BF-4 | `run-bounds.test.ts` | 1 | Wall-clock test expires before the boundary it intends to exercise | Control the clock, or otherwise separate startup time from the deliberate 400 ms invocation delay |
| BF-5 | `run-protocol.test.ts` | 1 | Test teardown races an accepted run that it does not await | Await terminal settlement before teardown; separately decide whether service shutdown must await every driver |

All 11 block a green repository-wide test result. None exercises the Plan 7
audit adapter, audit workspace recovery, or accepted-commit boundary.

## Findings

### BF-1: the copied project has 23 standing companion violations

Affected tests:

1. `iterations.test.ts` — "a local architect assigns it, an engineer works it,
   the gate accepts it and the harness commits";
2. all three tests in `module-creation.test.ts`;
3. `session-command.test.ts` — "a session on the scripted fake prints its
   stream, says nothing verified the work, and exits 0 on a submission".

Each test copies `fixtures/collection-review` and runs the real Ramify checker.
The engineer's completion submission is refused while 23
`exposed-without-companion` findings stand. The script has no corrective
submission, so the run/session ends without an accepted result, before the
gate behavior under test is reached.

The focused `iterations.test.ts` reproduction ended with:

```text
The engineer of wi-001.i01 ended without a result (ended)
```

All three focused `module-creation.test.ts` reproductions ended the same way.
Capturing the engineer's verdict confirmed that each was rejected for the
same 23 findings. The standalone session returned exit code 1, reported one
rejected submission and `Violations still standing: 23`.

The findings are distributed across eight module declaration files:

| Declaration | Missing signature companions |
| --- | --- |
| root `module.ramify` | `ToolResult`, `ToolInputSchema`, `createFacilities`, `TestSystem`, `AssembledSystem` |
| `subs/workspace/module.ramify` | `RecordId`, `InspectionReport`, `RevisionScope`, `ObservationCallback` for `inspect` and `InspectionPort` |
| catalog core declaration | `CatalogFixtureRecord` |
| catalog UI declaration | `CatalogCardProps` |
| reviews core declaration | `ReviewRuntime` |
| reviews controller declaration | `TaskVerdict`, `ScheduledTask` |
| reviews tasks declaration | `InspectionTaskResult`, `InspectionTaskInput`, `TaskSummary` |
| reviews UI declaration | `ReviewPanelProps` |

This is fixture drift, not five independent product defects. The correction
should update the fixture declarations to expose every type or callable named
by an exposed signature at the same visibility. Suppressing the diagnostic or
loosening completion acceptance would contradict the current companion rule.
After the fixture is corrected, rerun every test that copies it; these five
failures currently mask their intended assertions.

### BF-2: the local-authority script predates a required decision field

Affected test:

- `local-authority.test.ts` — "one architect refines locally, one escalates
  with counterevidence, and the revision reaches the rest before their work".

The run accepts its initial analysis, first local decision and first work
item. Its global placement fork then submits a `reuse` decision without
`changesExistingSymbols`. The submission verdict is:

```text
decision.changesExistingSymbols: Invalid input: expected boolean, received undefined
```

The one-step scripted fork has nothing left to submit, so the run fails with:

```text
The placement fork of pr-001 ended without a result (ended)
```

Add `changesExistingSymbols: false` to that decision. This is test-data drift:
the test is not reaching the hypothesis revision and delivery assertions it
was written to exercise.

### BF-3: the projection helper constructs an invalid hypothesis

Affected tests in `progress.test.ts`:

- "todo, working, completed and a forecast";
- "a capability the registry holds is never listed a second time as a
  forecast";
- "a superseded hypothesis leaves the list without becoming completed".

All three fail in `helpers/constructed.ts`, before the progress projection is
called. `forecast()` parses a `ramify-agent.hypothesis/1` record but does not
supply the schema's required `changesExistingSymbols` boolean. A focused file
run deterministically reported 3 failed and 5 passed with the same Zod error.

Add `changesExistingSymbols: false` to the helper's default object. Individual
cases can still override it through `extra`. Then rerun the whole projection
file to verify that the intended state and deduplication assertions execute.

### BF-4: the absolute-run-bound test depends on startup being under 200 ms

Affected test:

- `run-bounds.test.ts` — "a run older than runAbsoluteMs at an invocation
  boundary starts nothing more and fails limit-exceeded".

The run correctly fails with `limit-exceeded` and a message saying the run is
older than the 200 ms policy. The assertion expects exactly one
`invocation-started` event, but the focused run recorded zero.

`runInvocation()` checks the absolute age before every invocation, including
the first. The test sets `runAbsoluteMs: 200` and intends a 400 ms wait inside
the first architect invocation to exhaust the bound before the second one.
On this environment, capture and startup can consume the 200 ms before the
first invocation begins. The implementation therefore follows its boundary
check, while the test never establishes the precondition for its expected
event count.

Prefer an injected/fake clock: allow the first invocation to start, advance
time while it runs, then assert that the second invocation is refused. A much
larger real delay would reduce the race but would make this already slow suite
slower and would remain timing-dependent.

### BF-5: protocol cleanup can remove a directory while the run still writes

Affected test:

- `run-protocol.test.ts` — "a start-run payload that breaks its schema is
  refused with every error and its path, and changes nothing".

In the complete file run, cleanup failed with:

```text
ENOTEMPTY: directory not empty, rmdir '.../invocations/inv-0001'
```

The test proves the malformed command consumed nothing, submits a corrected
`start-run`, checks only the `202` response, and returns immediately. Teardown
then closes the server and removes the fixture while the accepted run's driver
may still be creating invocation records. `RunService.close()` stops an active
session but does not await every `run.done`, so a driver between sessions may
continue writing after close returns.

The exact test passed alone (1 passed, 4 skipped, 2.11 s), while the complete
file failed. That is evidence of a timing-dependent lifecycle race, not a
deterministic schema-validation failure.

The focused correction is to wait until the corrected run is terminal before
the test returns. Separately, the service contract should decide whether
`close()` promises a fully quiescent store. If it does, `close()` also needs a
test proving no driver writes after it resolves; if it does not, fixture
cleanup must always settle runs explicitly.

## Reproduction record

| Command | Outcome |
| --- | --- |
| `npx vitest run subs/harness/src/tests/iterations.test.ts -t 'a local architect assigns it, an engineer works it, the gate accepts it and the harness commits' --maxWorkers=1` | 1 failed, 4 skipped; engineer ended without a result after companion findings |
| `npx vitest run subs/harness/src/tests/local-authority.test.ts --maxWorkers=1` | 1 failed; global decision omitted `changesExistingSymbols` |
| `npx vitest run subs/harness/src/tests/module-creation.test.ts --maxWorkers=1` | 3 failed; each engineer ended without a result |
| Each of the three `module-creation.test.ts` cases run by exact title | Each engineer verdict named the same 23 companion findings |
| `npx vitest run src/tests/session-command.test.ts --maxWorkers=1` | 1 failed, 1 passed; successful-session case exited 1 |
| `npx vitest run subs/harness/src/tests/progress.test.ts --maxWorkers=1` | 3 failed, 5 passed; identical missing-boolean Zod error |
| `npx vitest run subs/harness/src/tests/run-bounds.test.ts --maxWorkers=1` | 1 failed, 5 passed; zero starts where one was expected |
| `npx vitest run subs/harness/src/tests/run-protocol.test.ts --maxWorkers=1` | 1 failed, 4 passed; `ENOTEMPTY` during fixture removal |
| The failing `run-protocol.test.ts` case run by exact title | 1 passed, 4 skipped; confirms timing/order dependence |

Temporary diagnostic assertion messages used to expose scripted-agent
verdicts and session stdout were reverted. This report is the only change made
while investigating these failures.

## Recommended order

1. Correct BF-2 and BF-3: both are small, deterministic fixture-shape updates.
2. Correct BF-1 once in `fixtures/collection-review`, then rerun every copied-
   fixture consumer to expose any failures it currently masks.
3. Make BF-5 teardown deterministic and settle the shutdown contract.
4. Replace BF-4's real-time precondition with a controlled clock.
5. Rerun `npm test -- --maxWorkers=1`. Only that later complete run can
   establish a green merge baseline.

## Scope limits

- This investigation diagnosed and reproduced failures; it did not implement
  their corrections.
- The preserved complete run was made from the dirty Plan 7 worktree based on
  commit `5b834f2968cce9afb83f7496cc4a5f72333a3b37`. Because the implementation
  was uncommitted, the exact source state is the worktree diff rather than a
  revision-bound commit.
- Fixing BF-1 may expose later assertions that the companion rejection
  currently prevents from running.
- A passing isolated BF-5 reproduction does not prove the cleanup race is
  resolved.
