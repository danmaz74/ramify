# Iteration 4 results: gates and after-handling

[Iteration](04-gate-and-after.md) · [Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Commits

On `feat/plan30-harness-steps`, after `1c9cf1f2`:

- `b103fdd3` fix(agent): name a failed ownership query in the guard refusal
- `97200945` feat(agent): record tool declarations and delivered inputs at an invocation's start
- `07505f38` refactor(agent): extract the committing gates from the run service
- `6fd0de12` refactor(agent): extract the record-only after-handling from the run service
- `803e4e98` refactor(agent): share review finishing and completion blockers outside the run service
- `e7219706` refactor(agent): share the pending-tag bindings a review is told about
- `38c9b7f6` feat(agent): run a manual run's gates and after-handling as steps
- `85ae87e4` test(agent): assert gate audit modes and the unsuitable after-handling
- `86a83cea` docs(agent): record iteration 4 results of the harness steps plan
- `e4c5c69b` feat(agent): derive engineer inputs from an assignment a manual run recorded
- this file's update, in the commit that follows it

## What changed

- `guard/write-guard.ts`: a thrown placement query refuses the write as
  unresolved. The guard decision and the transcript both name the error.
- The transcript `started` entry carries the declared tools and the delivered
  inputs. Both fields are optional. In older entries they read as unavailable
  evidence, and the web transcript shows them.
- `run/committing-gate.ts` (`CommittingGates`) holds the committing
  checkpoint, candidate authority, commit-and-audit, and the iteration and
  work-item gates.
- `run/after-handling.ts` (`AfterHandling`) holds obligations, bindings,
  iteration close, review requests, outline revisions and assignments, plus
  `pendingBindingsOf`.
- `run/review-finish.ts` holds review finishing and the completion blockers.
- `run/service.ts` calls all three through hosts.
- `steps/gate.ts`: `step gate --run <dir> --checkpoint iteration|work-item|readiness|final [--invocation <id>] [--no-commit]`.
  - Applies the checkpoint policy unchanged and records bindings before the
    iteration audit.
  - Writes `gates/<id>/attempt.json` with the subject, proposal and candidate.
  - Refuses ambiguous, missing or unknown subjects.
  - `--no-commit` writes `diagnoses/d-NNNN/attempt.json` outside the ledger.
- `steps/after.ts`: `step after --run <dir> --invocation <id>` follows the
  main plan's table.
  - Exits 2 on a refusal and 1 on an error. An error prints `Error: <cause>`
    and `Last completed transition: #N <type>`.
  - Each line is `Applied:` or `Not run:`, and a repeat only reports
    "nothing more".
- `steps/manual-hosts.ts` holds the shared refusals for `run`, `gate` and
  `after`: the lock, settlement, identity, implementation directory and
  submission hash. `readManualRun` reads a run without the lock.
- `steps/review-step.ts` and `step inputs --role reviewer --from-run <dir> --request <rq>`
  compose code, scope and design review inputs from the run's request.
  `step run` runs them: it prepares the snapshot, and the terminal attempt
  settles the request.
- `steps/assigned.ts` and `step inputs --role engineer --from-run <manual run dir> --assignment-of <local architect invocation>`
  derive the first, fresh engineer inputs of an assignment.
  - The inputs come from the work turn's recorded inputs, its accepted
    `assign` (hash-checked) and the assignment record `step after` committed.
  - They are collected as the run collects them on acceptance.
  - A new provenance variant, `origin: 'assignment'`, names the run, the work
    turn invocation and the assignment record.
  - It refuses another role or kind, an assignment not yet recorded, a record
    that does not match the submission, a package citation and an iteration
    whose engineer already started.
- Wiring in `steps/command.ts`, `src/cli.ts` and `src/main.ts`, with new
  usage lines.
- The ledger now exposes `maximumLineBytes` to its parent.

## Checks

Focused `test:quick` runs, all passing:

- `steps-gate-after` (8), re-run after the derivation with `cli`,
  `single-session`, `composition` and the `steps-*` files (9 files, 89 tests)
- `steps-run`, `steps-run-load`, `steps-authored`, `steps-from-run`,
  `steps-inputs`
- `cli` (18), `composition`, `breaking-work`, `iteration-gate`
- `capability-delegation`, `capability-consultation`,
  `capability-acceptance.integration`
- `review-attempts`, `review-lifecycle`, `review-diff-delivery`,
  `review-signals`, `review-stop`, `review-questions`
- `plan-evidence-review-unavailable`, `plan23-real-run-corrections`,
  `contract-revision`, `write-guard`, `ledger`

Batches were 11 files/89 tests, 7/38, 9/74 and 6/47. No registered boundary
file was changed.

`npm run type-check` passes. `npm run check:self` passes with 0 errors,
0 warnings and 343 analysis limits. No flaky test was seen.

## S15–S20, S24, S25 coverage

| ID | Tests |
| --- | --- |
| S15 | `steps-gate-after` S15 case: the refusals, the `--no-commit` diagnosis outside the log, a failed gate that closes nothing, and readiness with no commit (full, nested). The S17 case checks iteration (project-default) and the S16 case checks work-item (project-default) and final (full, nested). |
| S16 | `steps-gate-after` S16 case. It imports the architect's work turn from a repair run, then runs: assign, then `after`, then `inputs --assignment-of`, then render, then the engineer step from those inputs, then request-completion, then the work-item and final gates. Each `after` is repeated. It also covers the derivation's refusals before `after`, for request-completion and after the engineer started. |
| S17 | `steps-gate-after` S17 case: before the gate, after a stale tree, accepted, and an idempotent repeat. The S15 case covers diagnosis-only and failed gates. |
| S18 | `steps-gate-after` S18 cases: the invalid module description in the ownership query, and the ledger line bound |
| S19 | `write-guard.test.ts` "S19: a thrown ownership query is refused naming its error…" |
| S20 | `steps-run.test.ts` "S20: the recorded start is what render shows", both cases |
| S24 | `steps-gate-after` S24 case: an implementation run, an identity mismatch, a held lock, a changed submission and an unsettled writer, for `after`, `gate` and `step run` |
| S25 | `steps-gate-after` S25 cases (unsuitable; capability-needed) and the S16 partial case. The S17 case covers the reviewer role reported as not run. |

## Deviations

- The commit trailer names Claude Opus 5.5, as the session's attribution
  requires, not the requested Fable 5.1.
- The manual final gate has no non-functional assessment or candidate
  binding. It reports them as not run.
- The work-item gate refuses while attention CheckFindings remain, because
  reconciliation is not run.
- Evidence discharge after an accepted close (provider conformance, verified
  requirements) is reported as not run.
- `after` on an architect turn records the work item and its outlines from
  the turn's inputs when the manual run lacks them.
- Readiness in a manual run has no recovery. It records `final: true`.
- A manual review does not compose discovery starting points. It refuses a
  request that cites a package source.
- A design review without a recorded orientation starts fresh, marked
  degraded.
- `step after` applies no handling for reviewer, global-architect or
  contract-needed submissions and reports them as not run.
- `--assignment-of` reads the committed audit configuration at HEAD, as
  `after` does when it records the assignment. Its protected harness files
  are the tracked feature files only, since a manual run captures no plan
  documents.
- Removed a duplicate of the gate and after parse cases that 38c9b7f6 had
  also placed in the `session` describe of `cli.test.ts`.

## Open issues

- "Bindings precede the iteration audit" shares code with the run, but no
  test uses a real binding.
- After a passing work-item gate, a manual run cannot complete the work item.

## Plan-vs-code mismatches

- The iteration plan names `transcripts/writer.ts`. The writer is
  `transcripts/recorder.ts`.
- The plan says an error names "the record it was writing". `after` names
  the cause and the last completed transition, as the main plan states.
- The plan's `step after --invocation <id>` and `step gate` omit `--run`.
  Both take `--run <dir>`.
- Line references in the main plan's owner table (`service.ts:7484`,
  `:10547`, `:1012`) no longer match: the code moved into
  `committing-gate.ts`, `after-handling.ts` and `review-finish.ts`.

## Iteration 5 handoff

- Document `step gate`, `step after`, `step inputs --request` and
  `step inputs --role engineer --from-run <dir> --assignment-of <id>` in the
  README and the harness README. Include the exit statuses, the `Applied:`
  and `Not run:` lines, and the manual flow: work turn, `after`,
  `--assignment-of`, then the engineer step.
- `README.md:111` and `subs/harness/README.md:814` still describe
  `plans/.harness/sessions/`.
- `scripts/browser-acceptance/plan21-workflows.ts:113` still looks for
  `plans/.harness/sessions/`. It will fail until it reads manual runs or the
  check is dropped.
- Record the deviations above where the docs describe manual runs.
