# Iteration 10: Compact reply, `check --changed` and the host adapter

**Plan:** [Plan 5: Fast incremental checks](../main-plan.md).
**Prerequisites:** iteration 9 (`contexts`: the session driver, the covering
rendezvous and the extended outcomes). **Owners:** root's
`src/interfaces/service.ts`, `subs/daemon/` validation, `subs/cli/` and
`examples/hooks/` outside every owner.

## Goal

Deliver the hook command end to end: the extended `check` parameters and the
compact reply on the wire, `ramify check --changed <path>...` with `--since`
and `--deadline`, the `ramify.check/1` document with its new-finding marks,
the documented exits with no batch fallback, and an example Claude Code
post-write adapter that never blocks the agent.

## Read first

- [contracts.md](../contracts.md#root-the-service-vocabulary-and-the-driver)
  and [CLI: arguments, documents and exits](../contracts.md#cli-arguments-documents-and-exits):
  `CheckParams`, `DaemonCounters`, the validator's rules, `CheckDocument`, the
  argument grammar and the adapter's behavior.
- Main plan: [Commands](../main-plan.md#commands), [Exits](../main-plan.md#exits),
  [Error table](../main-plan.md#error-table),
  [Engine results and their delivery](../main-plan.md#engine-results-and-their-delivery);
  [Resolved decisions](../main-plan.md#resolved-decisions) 6; matrix row
  I5-11; the process-cost risk row.
- [scope.md](../scope.md#deadlines-and-cold-contexts): Deadlines and cold
  contexts; [Live updates and the covering rule](../scope.md#live-updates-and-the-covering-rule).
- [owners.md](../owners.md): Root, Daemon, CLI, Placement outside every owner
  and the three iteration 10 rows of the activation manifest.
- [CLI invocation](../../../architecture/cli-invocation.spec.md) in full;
  [Processes and clients](../../../architecture/processes-and-clients.md): CLI
  commands; PC01, PC03, PC10.
- Source: `subs/cli/src/{arguments,check-command,format,command-support,errors,run-cli}.ts`
  and `src/interfaces/cli.ts`; `subs/daemon/src/{validation,service}.ts`;
  `src/interfaces/service.ts`, `src/client.ts` and `src/cli-entry.ts`.
- Plan 2 [iteration 9](../../done/iteration-2-resident-verification/iterations/iteration9.md)
  for the commands and the fallback policy this iteration must preserve for
  the plain `check`.

## Deliverables

1. Root `src/interfaces/service.ts`: `CheckParams` gains optional `scope`
   (default `report` for Plan 2 clients), `since` and `deadlineMs`;
   `DaemonCounters` gains `sweeps`, `audits`, `auditMismatches`,
   `coveredRequests`, `coldOutcomes` and `deadlineOutcomes`;
   `RamifyService.check` returns the extended `CheckOutcome`.
2. Daemon `src/validation.ts` accepts `scope` as one of the two strings,
   `since` as a `rev/1:` identifier and `deadlineMs` as a positive safe
   integer at most 600,000, and returns `invalid-request` otherwise. No
   transport, codec, discovery or record change.
3. CLI arguments: `check [--root <dir>] [--format json] [--batch] [--changed <path>...] [--since <revision>] [--deadline <ms>]`,
   where `--changed` takes one or more paths until the next flag, `--since`
   and `--deadline` require `--changed`, and `--batch` with `--changed` is an
   invalid invocation with exit 2. The help text lists the new arguments and
   the exits.
4. `check-command.ts` for `--changed`: resolve each path against the selected
   root, read and hash it in the CLI with a missing file hashed as absent,
   open or reuse the context, send one synchronized request with `expect` for
   every path, `scope: 'delta'`, the `since` revision and the deadline
   defaulting to 2,000 ms, print the covering revision's findings with their
   `new` marks and exit as the main plan's tables fix. It never calls
   `environment.batch` and never exits 0 without a covering revision; an
   unavailable daemon after exhausted recovery is `not-checked` with reason
   `unavailable` and exit 2. The plain `check`, `watch`, `daemon status` and
   `daemon stop` keep Plan 2's behavior, and the plain document stays the bare
   `ramify.analysis/1`.
5. `CheckDocument` in `interfaces/cli.ts` exactly as contracts.md declares,
   written as the only object on standard output for
   `--changed --format json`; human output prints one line per finding with
   `new` marked, a summary line naming the path, the checked set and the wait,
   and the `Mode:` line with the revision's path.
6. `examples/hooks/claude-code-post-write.mjs` reading the host's hook JSON
   from standard input, taking `tool_input.file_path`, discovering the project
   root from the file's directory, running
   `ramify check --changed <path> --format json`, printing new findings to
   standard error with exit 2 when there are any, exiting 0 otherwise, and
   exiting 0 with a one-line notice naming the reason when the check was not
   checked. It imports no toolkit source.
7. Tests: `subs/cli/src/tests/arguments.test.ts` extended and
   `subs/cli/src/tests/changed-command.test.ts` through root's
   `createQuickEnvironment`; root `src/tests/resident-cli.test.ts` extended
   for the `--changed` flows; daemon `src/tests/validation.test.ts` and
   `src/tests/service.test.ts` extended. Harness: the `hook-cli` capability
   with process handlers under unique endpoint directories, including the
   failed-start override through `RAMIFY_DAEMON_ENTRY` and the adapter run.

## Matrix rows executed here

- I5-11: `changed-hashes-in-cli` (identities computed by the CLI, no project
  read by the daemon); `changed-delta-document` (one `ramify.check/1`
  document, the denial marked new, exit 1, empty standard error);
  `changed-exit-0-1`; `changed-exit-2-not-checked` (cold, deadline,
  unobserved, superseded and unavailable); `changed-no-batch-fallback` (no
  batch, analysis or compiler module loaded); `since-evicted`;
  `plain-check-unchanged` (Plan 2's bare document); `host-adapter-claude`
  (exit 2 with findings on standard error, exit 0 silent, exit 0 with a
  notice); `service-params-validated` (`invalid-request` on the wire).

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/cli/src/tests/arguments.test.ts \
  subs/cli/src/tests/changed-command.test.ts \
  subs/daemon/src/tests/validation.test.ts \
  src/tests/resident-cli.test.ts
npm test
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
(cd examples/collection-review && node ../../dist/src/cli-entry.js check --changed src/assembly.ts)
node dist/src/cli-entry.js check --root examples/collection-review --changed src/assembly.ts --format json
node dist/src/cli-entry.js check --root examples/collection-review --format json      # bare ramify.analysis/1
npm run reference:verify -- --plan 5 --iteration 10     # requires 2 to 10
npm run reference:verify -- --plan 2                    # the amended Plan 2 gate still passes
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kinds: `process` for eight I5-11 instances and `ipc` for
`service-params-validated`; a quick run of the same scenario does not satisfy
them. Expected intermediate failures: the unfiltered `--plan 5` gate, and the
live-equivalence and measurement capabilities. Every command that may start a
daemon runs under the exported endpoint directory and the final `daemon stop`
ends it.

## Exit criteria

- The five commands of the main plan's deliverable section work from the
  package directory with the documented output, exits and `Mode:` lines, and
  a `--changed` check never runs a batch analysis.
- The plain `check`, `watch` and `daemon` commands and their documents are
  Plan 2's, unchanged.
- Every I5-11 instance ran and asserted its own expectation.

## Handoff

Iterations 11 and 12 start from this installed CLI and may run in parallel
with distinct endpoint directories: iteration 11 drives the live sequences and
the hook races through it, and iteration 12 measures it. Plans 3, 4 and 6
consume `CheckDocument`, the compact reply and the hook contract this
iteration fixes.
