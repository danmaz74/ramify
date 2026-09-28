# Iteration 3: CLI command, batch form and documentation

**Plan:** [Plan 7: Affected modules](../main-plan.md).
**Prerequisites:** iteration 2 on the branch. **Owners:** `subs/cli/`, root
`src/` for the batch operation and entries, documentation.

## Goal

Add `ramify affected` with a resident form over the daemon and a `--batch`
form over a fresh session, print the JSON document and human form with the
contract's exit codes, and document the command.

## Read first

- [Contracts](../contracts.md): Batch operation and CLI sections.
- [Main plan](../main-plan.md): decision 5, verified state items 5 and 6,
  runnable outcome table.
- [Owners](../owners.md): the root and CLI rows, documentation updates.
- [Acceptance](../acceptance.md) rows A7-09 to A7-11.
- Source: `subs/cli/src/arguments.ts`, `run-cli.ts`, `measure-command.ts`,
  `check-command.ts` (the batch branch), `command-support.ts`,
  `interfaces/cli.ts`, `errors.ts`; root `src/interfaces/batch.ts`,
  `batch.ts`, `batch-entry.ts`, `batch-process.ts`, `cli-process.ts`,
  `compiled-entry.ts`, `cli-entry.ts`; `subs/analysis/src/retained-session.ts`
  and `resolve-project.ts` for opening a session over a root.
- Tests to imitate: `subs/cli/src/tests/measure-command.test.ts`,
  `arguments.test.ts`; `src/tests/batch-cli.test.ts`, `resident-cli.test.ts`,
  `compiled-client.test.ts`, `fixture.ts`.
- Documentation to extend: [CLI invocation contract](../../../architecture/cli-invocation.spec.md)
  (usage and the resident and batch section), [daemon architecture](../../../architecture/daemon.md)
  service operations table, the README command list, the testing guide's
  command table, and `subs/cli/src/arguments.ts` help text.

## Deliverables

1. Root batch operation: `AffectedBatchInvocation`, `AffectedBatchResult`,
   `AffectedBatchOperation` in `src/interfaces/batch.ts`; implementation in
   `batch.ts` that resolves the project as `check --batch` does, opens a
   retained session with the same capabilities, calls `affected` at the opened
   revision, disposes in `finally`, and maps a `reported` open without a
   session to `invalid-project`; the batch child protocol carries the new
   operation so the compiled client runs it in its Node child.
2. CLI: `affected` in `arguments.ts` with positional module IDs, repeated
   `--path`, `--root`, `--batch`, `--format`; at least one seed required;
   `affected-command.ts` with the resident path mirroring `measure-command.ts`
   and the batch path through `environment.affectedBatch`; the
   `ramify.affected-cli/1` document; human rendering; exit mapping per the
   contract; dispatch in `run-cli.ts`; help text.
3. Documentation: usage line and a short affected paragraph in the CLI
   invocation contract's resident and batch section; a service operations
   row in daemon.md; README command list; testing guide command table; CLI
   purpose sentence.
4. Tests: `subs/cli/src/tests/affected-command.test.ts` (A7-10 through the
   quick environment) and `arguments.test.ts` cases (A7-09);
   `src/tests/affected-batch.test.ts` and cases in `batch-cli.test.ts` and
   `compiled-client.test.ts` (A7-11) on the reference project, including the
   equality of resident and batch selections.

## Matrix rows executed here

A7-09 to A7-11, all instances.

## Verification

```sh
npm run type-check
npx vitest run subs/cli/src/tests/affected-command.test.ts subs/cli/src/tests/arguments.test.ts src/tests/affected-batch.test.ts src/tests/batch-cli.test.ts
npm run build && npm run check:self
RAMIFY_ENDPOINT_DIR=$(mktemp -d) dist/src/ramify affected --path subs/cli/src/affected-command.ts --format json --root .
dist/src/ramify affected --path subs/cli/src/affected-command.ts --batch --format json --root .
```

Stop the isolated daemon after the resident invocation. The compiled-client
case may be skipped where Bun is unavailable, recorded as skipped, never as
passed. Do not run the whole Vitest suite.

## Exit criteria

- Listed tests pass; type-check and self-check pass; both invocations above
  print a `ramify.affected-cli/1` document whose selections agree.
- Documentation names the command, its forms and its exits.
- `iteration3-results.md`: what changed, commands and outcomes, deviations,
  skipped cases.

## Handoff

Iteration 4 runs the built `dist/src/ramify affected` on the toolkit and on
`ramify-agent/` and records the results.
