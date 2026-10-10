# Iteration 1 results: engineer step inputs, constructor and render

[Iteration](01-engineer-constructor.md) · [Plan](../main-plan.md) · [Acceptance](../acceptance.md)

## Commits

On `feat/plan30-harness-steps`, based on `0656317a` with the plan at `da22da99`:

- `b9cf3083` feat(agent): build every engineer invocation from recorded step inputs
- `aa925bbd` feat(agent): add step inputs --from-run and step render
- this results file, in the commit that follows them

## What changed

- `subs/harness/src/steps/inputs.ts`: the `StepInputs` union, schema id
  `ramify-agent.step-inputs/1`, with engineer members for `fresh`,
  `repair-continuation` and `resumed-after-handback` starts. Path fields are
  `{ project }` or `{ run }` objects holding a normalized relative path. An
  absolute path, a backslash, a drive letter, NUL or `..` is refused. Captured
  prose and captured records keep their own text. Validation selects the
  member by `start.kind`, so its errors name what that start lacks. The value
  must also survive a JSON round trip.
- `subs/harness/src/steps/engineer.ts`: `constructEngineerStep(inputs,
  environment)` is pure. It builds the message, task brief, system prompt,
  submission declaration, validator evidence, bounds, limits, context policy,
  start and equipment inputs.
- `run/service.ts`:
  - `takeIteration` now collects the inputs (`engineerStepInputs`) and calls
    the constructor. The inline message, brief, submission and bounds
    construction was removed.
  - `implementationTools` takes its working directory, scope revision, timeout,
    submissions and focused commands from `step.equipment`.
  - `startInvocation` validates the inputs and writes them atomically to
    `invocations/<id>/inputs.json`. This happens after the
    `invocation-started` commit and before the transcript or session starts.
- Shared functions, so that the run and the step cannot drift:
  - `run/task-brief.ts` `composeTaskBrief` (the run's `taskBrief` uses it for
    every role)
  - `run/session-operations.ts` `composeOperationPacket`, `readPointContext`,
    `readRecordedOperation` and `operationDeclarations`
  - `tools/shell.ts` `shellToolDeclaration`
  - `run/policy.ts` `invocationLimits`
  - `work/scope.ts` `protectedScopeOf`
  - `work/engineer-equipment.ts` `engineerBuiltinTools`
- `steps/render.ts`, `steps/from-run.ts`, `steps/command.ts` and root
  `src/cli.ts`/`src/main.ts` provide these commands:
  - `step inputs --role engineer --from-run <run dir> --invocation <id> [--out <file>]`
  - `step render --inputs <file> [--project <root>] [--invocation <id>]`

  A refusal exits 2.
- The harness `module.ramify` exposes `runStepCommand`, `StepCommandOptions`
  and `StepCommandResult` to its parent.

## Checks

Run from `ramify-agent/`:

| Check | Outcome |
| --- | --- |
| `npm run test:quick --` with the plan's three files plus `steps-inputs`, `steps-from-run`, `src/tests/cli.test.ts` and the regressions `gate-diagnostics`, `iterations`, `engineer-submission`, `engineer-failures`, `plan23-continuing-work`, `run-recovery`, `iteration-gate`, `capability-acceptance.integration`, `scenario-briefings`, `run-closing-order` | 16 files, 261 tests passed |
| `npm run test:quick --` with the 32 non-boundary test files that import the changed shell, scope, session-operations, policy, equipment or single-session modules | 415 passed and 1 failed under load; the failure is recorded as flaky below |
| `npm run test:quick -- subs/harness/src/tests/plan23-observation-integration.test.ts` | 45 passed |
| `npm run type-check` | passed |
| `npm run check:self` | passed: 0 errors, 0 warnings, and no new analysis limit names `steps/` |

Following the plan's instructions, no full suite and no ramify-audit were run.

## Acceptance mapping

| Case | Tests |
| --- | --- |
| S01 | `plan23-task-prompts.test.ts`, "S01: every engineer invocation of a run …". It runs a scripted fixture run (`helpers/repair-run.ts`) with a fresh engineer invocation and a gate repair continuation. The constructor's render of each recorded `inputs.json` equals the recorded packet and declarations. `plan25-task-packets.test.ts`, "S01: a resumed-after-handback engineer delivery …", does the same over the capability revision flow (`runAcceptedHandback`, which gained an optional `inspect` hook). That flow has fresh and resumed-after-handback starts. |
| S02 | `steps-inputs.test.ts`. The run's inputs parse and round-trip byte for byte, including a resumed variant. A function, an unknown field, an in-memory id, absolute and escaping path fields, a missing `failedGate` on a repair and an unreadable point are refused. Absolute paths in captured prose are accepted. |
| S03 | `steps-from-run.test.ts`, "S03: inputs from a run". A fresh import compares `equal`. A repair continuation imports as `start: fresh` with the original start and point as provenance. Its fresh render delivers role instructions and the failed gate, with no inherited point. Rendering with different built-in declarations reports `different` with the sections, and the import still stands. Other roles, another role's invocation, unknown or traversing ids, a non-run directory, and missing or invalid `inputs.json` are refused with the reason. |
| S04 | `steps-from-run.test.ts`, "S04: render". A fresh render prints the role instructions, message, all seven declarations and the submission schema. A continuation prints only its additions under a marked heading. A continuation without recorded ancestry renders the stated fresh fallback. Every file in the project, including `plans/.harness`, is unchanged by size and mtime. Invalid inputs exit 2. CLI parsing is covered by the `step` cases in `src/tests/cli.test.ts`. |

## Deviations

1. **Historical runs.** `from-run` refuses an invocation with no recorded
   `inputs.json`, reporting "incomplete task records". It does not derive inputs
   from other records. Deriving them would need the live run state the service
   computes (scope, views, protected files, starting points). Runs recorded
   before this iteration therefore cannot be imported.
2. **Captured records keep absolute paths.** These are the embedded
   assignment's resolved write-scope roots, the focused command's `cwd`/`argv`
   and the `sourceFiles` keys. They are captured records with their own
   schemas, not path fields.
3. **Start labels.** The start kind follows the run's continuing reason. A
   continuation after a capability return is `resumed-after-handback`; any
   other continuation is `repair-continuation`. A later repair continuation
   after a resume is labelled `resumed-after-handback`, so `guidance` is
   optional there and `failedGate` is optional.
4. **Session-lost retry.** When a continuation's session is lost, the existing
   fresh retry reuses the same request, including its inputs and brief.
   `inputs.json` then says `repair-continuation` while the delivery was fresh,
   and `from-run` reports the differing sections. Behavior is unchanged.
5. **Record type.** `inputs.json` is written with `writeFileAtomic` after the
   `invocation-started` commit, not as a ledger record. It is not part of
   recovery.
6. **Working directory outside the project.** The run now fails the iteration
   (`internal`) when the engineer's working directory is not beneath the
   project root, because a path field must be relative. This never happens in
   the fixtures.
7. **Built-in declarations.** These come from the executor, not the inputs.
   The CLI renders and compares with pi's declarations. The scripted agent
   without `toolNames` delivers pi's as well.
8. **Briefing revision.** The revision is keyed by the operation id, so an
   equal render needs the original invocation id. `render` uses `--invocation`,
   then the inputs' `provenance.invocation`, then `step-render`.
9. **Constructor name.** The plan's `ConstructedStep` is
   `ConstructedEngineerStep`, because iteration 2 adds other roles.

## Open issues

- **Flaky test.** `plan23-real-run-corrections.test.ts`, "three overlapping
  same-name shell calls retain their original guard IDs …", failed once in the
  32-file batch: the mutation order was 1, 3, 2. It passed in isolation three
  times. It is recorded as flaky and was not hunted.
- **Imported repair kind.** An imported repair continuation keeps
  `failedGate`, so its fresh briefing carries the failed gate. Its task kind
  stays what the run used (`engineering`).
- **Runtime-only behavior.** The fresh retry, writer acquisition and
  after-submission handling stay in `RunService`. They are not part of the
  constructed step. Iterations 3 and 4 own them.
- **Plan text against the code.** The plan says "`inputs --from-run` reads …
  the invocation's correlation packet and derives the inputs". In the code,
  the correlation packet is only the comparison target. The inputs come from
  `inputs.json` alone.
