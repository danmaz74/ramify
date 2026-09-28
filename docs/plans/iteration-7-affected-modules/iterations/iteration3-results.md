# Iteration 3 results: CLI command, batch form and documentation

**Date:** 2026-09-28. **Branch:** `feat/plan7-affected-modules`, from `3b017fbf`.
**Status:** complete. Every A7-09 to A7-11 instance passes, the compiled-client
case included (Bun is available; nothing was skipped). `npm run type-check` and
`npm run check:self` pass, and both manual invocations print a
`ramify.affected-cli/1` document with equal selections.

## What changed

Root (`src/`):

- `interfaces/batch.ts`: `AffectedBatchInvocation`, `AffectedBatchResult` and
  `AffectedBatchOperation` with the contract's fields. R1 already exposes the
  whole file to descendants; `module.ramify` is unchanged.
- `batch.ts`: `runAffectedBatch` opens a retained session with
  `openRetainedSession` over the same `ProjectRequest` `check --batch` passes
  (`cwd`, optional `root`, `configuration: 'discover'`, `scope: 'whole-project'`),
  the CLI's check `capabilities`, the shared batch `limits` and the resident
  `sessionLimits`. It calls `session.affected({ sequence, modules, paths })` at
  the opened revision's sequence and disposes the session in `finally`. Exits
  follow the table in deviation 3.
- `batch-entry.ts`: the Node child runs `runAffectedBatch` when invoked as
  `batch-entry.js affected <json>`; a lone JSON argument is still a check
  (deviation 2).
- `batch-process.ts`: one shared child runner; `createProcessAffectedBatch`
  beside `createProcessBatch`, with its own result validation (an answered
  result must carry a `ramify.affected/1` selection whose `inputId` equals the
  result's).
- `cli-process.ts`: `CliProcessOptions.affectedBatch` (required) passed to the
  CLI environment. `cli-entry.ts` binds it lazily to `runAffectedBatch`, like
  `batch`; `compiled-entry.ts` binds `createProcessAffectedBatch(node,
  dist/src/batch-entry.js)`, the same Node child seam as `check --batch`.

CLI (`subs/cli/`):

- `arguments.ts`: `affected` with operand module IDs, repeated `--path`,
  `--root`, `--batch` and `--format human|json`; at least one seed, otherwise
  the invocation error "affected requires at least one module ID or --path".
  `--changed`, `--since`, `--deadline` and every other flag are unsupported
  arguments. Help gains the usage line, a paragraph and the exit line.
- `affected-command.ts` (new): the resident form mirrors `measure-command.ts`
  (capability check before opening a context, context reopening after an expired
  generation or unknown context, one automatic recovery, context close and
  connection close in `finally`) and requests `{ mode: 'synchronized', expect: [] }`
  with the seeds. The batch form calls `environment.affectedBatch`. Answers print
  the `ramify.affected-cli/1` document or the human form; refusals print the
  `ramify.cli/1` diagnostic form as `measure` does.
- `interfaces/cli.ts`: `AffectedDocument` and `CliEnvironment.affectedBatch?`
  (deviation 1). `run-cli.ts` dispatches `affected`. `README.md`: the owners.md
  purpose sentence and the `AffectedBatchOperation` binding.

Human output, for example:

```text
Root: /path/to/project
Mode: resident
Revision: sequence 1, input input/1:8c68…
Selection: dependency-closure
Path subs/core/module.ramify: example/core (declaration)
Changed modules (2):
  example/core (subs/core)
  example/mid (subs/mid)
Affected modules (1):
  example/app (subs/app)
Test modules (3):
  example/app (subs/app)
  example/core (subs/core)
  example/mid (subs/mid)
Coverage: complete, 0 notes
Analysis check: passed
```

A batch answer prints `Revision: fresh session, input …`; a widened answer
prints `Selection: all-modules (widened: unowned-path)`; a path without a module
prints `Path docs/notes.md: no module (none)`.

Documentation: the CLI invocation contract's usage block and a paragraph in
"Resident and batch execution"; an "Affected modules" row in daemon.md's service
operations table; three `ramify affected` lines and a short paragraph in the
README command list; a testing guide command-table row.

Tests:

- `subs/cli/src/tests/arguments.test.ts`: A7-09 `positional-ids`, `path-repeat`,
  `no-seed` (parse and the `ramify.cli/1` invocation error), `unknown-flag`
  (17 rejected grammars and the named `--since`/`--changed` errors),
  `batch-with-format`, and help content.
- `subs/cli/src/tests/affected-command.test.ts` (new, quick environment, real
  analysis): A7-10 `json-document`, `human`, `widened-exit-0`,
  `unknown-module-exit-1`, `unavailable-exit-2` (cold, superseded and
  `analysis-failed`), `cancel-130` (a real interrupt during the request and an
  explicit cancelled outcome, both releasing the context), and the capability
  requirement.
- `src/tests/affected-batch.test.ts` (new): A7-11 `reference-json`,
  `resident-batch-agree` (three seed sets; the documents are equal once mode and
  revision are aligned, selections compared parsed and as exact strings, the
  `inputId`s equal), `invalid-project` (direct operation, JSON and human), exits
  1 for unknown IDs, invalid seeds and an invalid project in both forms, and
  interruption.
- `src/tests/batch-cli.test.ts`: the invocation handed to `affectedBatch`, the
  unavailable form without the operation, and an output failure after a real
  session.
- `src/tests/compiled-client.test.ts`: A7-11 `compiled-child`: the compiled
  client prints byte-identical JSON and human output to the Node entry for
  `affected --batch`, cannot answer without Node on PATH (its batch child cannot
  start), and exits 1 for an invalid project.
- `src/tests/fixture.ts`: `affectedFiles` and `affectedFixture`, the reference
  project (deviation 9).

Expected selections are written by hand from the fixture's stated edges.

## Commands and outcomes

From the worktree root:

| Command | Outcome |
| --- | --- |
| `npm run type-check` | passed (exit 0) |
| `npx vitest run subs/cli/src/tests/affected-command.test.ts subs/cli/src/tests/arguments.test.ts src/tests/affected-batch.test.ts src/tests/batch-cli.test.ts` | passed: 4 files, 208 tests |
| `npm run build` | passed (exit 0; the existing explorer chunk-size warning) |
| `npx vitest run src/tests/compiled-client.test.ts` | passed: 9 tests, `A7-11:compiled-child` included (run after the build; deviation 10) |
| `npx vitest run src/tests/entry-boundaries.test.ts` | passed: 3 tests (after the build) |
| `npx vitest run src/tests/cli-process.test.ts` | passed: 11 tests (after the build) |
| `RAMIFY_ENDPOINT_DIR=<fresh mktemp -d> npm run check:self` | passed: 15 owners, 449 source files, 17 resources, 6,836 accesses; 0 errors, 0 warnings, 0 analysis limits; 4,780 allowed, 0 denied |
| `RAMIFY_ENDPOINT_DIR=<same> dist/src/ramify affected --path subs/cli/src/affected-command.ts --format json --root .` | exit 0; document below |
| `dist/src/ramify affected --path subs/cli/src/affected-command.ts --batch --format json --root .` | exit 0; document below |
| `RAMIFY_ENDPOINT_DIR=<same> dist/src/ramify daemon stop` | `Stopped: daemon stopped explicitly`; `daemon status` then printed `not running` |

The whole Vitest suite was not run.

### Manual invocations

Both documents, abbreviated to their module lists:

```text
resident: schemaVersion ramify.affected-cli/1, root /tmp/ramify-plan7-affected, mode resident,
          revision { sequence: 1, inputId: input/1:8c684112…1108c }, ramifyVersion 0.0.0
batch:    schemaVersion ramify.affected-cli/1, root /tmp/ramify-plan7-affected, mode batch,
          revision { sequence: null, inputId: input/1:8c684112…1108c }, ramifyVersion 0.0.0
both:     paths [{ subs/cli/src/affected-command.ts, ramify/cli, inventory }]
          selection dependency-closure, widening [], coverage complete (0 notes), analysisCheck passed
          changedModules  [ramify/cli]
          affectedModules [ramify, ramify/daemon, ramify/explorer, ramify/integration-tests, ramify/service-api]
          testModules     [ramify, ramify/cli, ramify/daemon, ramify/explorer, ramify/integration-tests, ramify/service-api]
```

The two `selection` members are equal as parsed JSON. The first resident
invocation above ran against the daemon `check:self` had warmed and was not
timed. A timed repetition on the same endpoint, after that daemon was stopped,
measured with Python's monotonic clock around each process:

| Invocation | Elapsed |
| --- | --- |
| resident, daemon started by the invocation | 6.37 s |
| resident, warm | 0.40 s |
| resident, warm | 0.39 s |
| `--batch` | 5.91 s |

The CLI's affected modules follow from root: root imports `runCli`, and the
daemon, explorer, integration-tests and service-api modules import root's
interfaces, so a CLI change reaches them through root.

## Deviations from contracts.md and owners.md

1. **`CliEnvironment.affectedBatch` is optional.** About fifteen existing tests
   build a `CliEnvironment` literal; a required member would change all of
   them. Both installed entries always supply it (`CliProcessOptions.affectedBatch`
   is required). Without it, `affected --batch` is `unavailable`, exit 2, and is
   never answered by the check batch; the resident form is unaffected.
2. **Batch child protocol.** `batch-entry.js <json>` still runs a check, so
   `scripts/probes/dependency-analyzer/measure.ts` and every existing caller keep
   working; `batch-entry.js affected <json>` runs the affected form. The child
   writes the `AffectedBatchResult` as JSON, as the check form writes its result.
3. **Invalid project at the queried revision is exit 1 in both forms.** With
   `--root <dir>` and no root description, the session opens with an invalid
   first revision instead of reporting, and the session answers
   `invalid-current`, which iteration 2's handoff maps to exit 2. That
   contradicts A7-11:`invalid-project` and the contract's "Invalid project → 1".
   So `invalid-current` or `missing-facts` at a revision whose
   `outcome.execution` is `invalid` prints the code `invalid-project`, exit 1:
   in batch from the opened revision, with its first diagnostic's message; in
   the resident form from the outcome's `revision`. The same applies to
   invalid descriptions, where access is blocked. Every other `invalid-current`
   and `missing-facts` stays exit 2. The final mapping:

   | Outcome | Code | Exit |
   | --- | --- | --- |
   | Answered, either selection | — | 0 |
   | `unknown-module`, `invalid-query` | the session reason | 1 |
   | Batch open `reported` (no project found, unreadable configuration) | `invalid-project` | 1 |
   | Invalid revision (`execution: 'invalid'`) | `invalid-project` | 1 |
   | Resident open `unresolved/invalid` | `project-invalid` (as `measure`) | 1 |
   | Batch open `reported` for a session failure (see 4) | `analysis-failed` | 2 |
   | Any other unavailable, pending, cold, superseded, deadline-exceeded | its reason | 2 |
   | Cancelled outcome or interrupt | — | 130 |

4. **A reported failure is not an invalid project.** A `reported` open whose
   report has `execution: 'incomplete'` or an `internal-error`, `resource-limit`
   or `session-disposed` diagnostic answers `analysis-failed`, exit 2, rather
   than `invalid-project`.
5. **`--format human` is accepted for `affected` only,** as the contract's usage
   line shows; the other commands still reject it.
6. **Human output adds two lines:** `Coverage: <status>, <n> notes` (the
   contract's note count, with the status) and `Analysis check: <verdict>`.
7. **A cancelled outcome exits 130** in both forms even without a local
   interrupt, per the contract; `measure` maps that case to exit 2.
8. **Unknown IDs stay in the message.** The `ramify.cli/1` diagnostic keeps its
   `category`, `code`, `message` fields; the session's message already names
   every unknown ID, and the CLI appends them only if a message does not.
9. **"Reference project".** The plan does not define one. The A7-11 tests use a
   disposable four-module project written by `affectedFixture`
   (`example/app -> example/mid -> example/core`, an unrelated `example/lone`
   and an unowned `docs/notes.md`), the edges of iteration 2's service fixture.
10. **Test placement and extra runs.** `resident-cli.test.ts` (listed in
    owners.md) was not extended: the resident CLI cases run in
    `affected-command.test.ts` through the quick environment and in
    `resident-batch-agree`. The four listed test files need no build. The
    compiled-client case needs `npm run build` first; `compiled-client.test.ts`,
    `entry-boundaries.test.ts` and `cli-process.test.ts` were run because the
    batch entry, batch process and CLI process changed.

## Cases not satisfied

None. No case was skipped.

## Handoff to iteration 4

- Run `npm run build` before the real invocations; the compiled client runs
  `--batch` in a Node child, so Node must be on PATH.
- The resident form over a daemon warmed by `check:self` answered at sequence 1
  with the revision reused; warm invocations took about 0.4 s and `--batch`
  about 5.9 s on the toolkit.
- `inputId` depends on the working directory the project is discovered from:
  in a draft of `reference-json`, the same unchanged project discovered from
  `subs/app` and from the root gave different `inputId`s. The agreement test
  therefore runs both forms from the same directory. ramify-audit should expect
  equal `inputId`s only for invocations from the same working directory, or pass
  `--root`.
- Exit 1 now also covers an invalid project at the queried revision
  (deviation 3); the contract's CLI table still reads correctly, but iteration
  2's handoff list is superseded by the table above.
- The toolkit's root module is a hub: any change to a module root imports, such
  as the CLI, selects root and every module that imports root's interfaces.
