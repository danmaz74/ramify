# Iteration 7: Batch inspection and the three commands

**Plan:** [Plan 3: Project inspection](../main-plan.md).
**Prerequisites:** iteration 6 (`analysis`: the `symbol-details` capability,
the `details` stage and the three query branches answering with details).
Nothing from Plan 5, whose changes to the same CLI and root files are
additive and disjoint by name. **Owners:** root's batch operation
(`src/batch.ts`, `src/interfaces/batch.ts`, `src/cli-entry.ts`) and
`subs/cli/`.

## Goal

Put `ramify available`, `ramify inspect` and `ramify explain` in the installed
CLI over a fresh in-process analysis: the argument grammar, the injected batch
operation that runs one analysis with `symbol-details` and answers from its
snapshot, the human rendering, the `ramify.inspect/1` document and the exits.
Every listed specifier must be a spelling the checker accepts.

## Read first

- [contracts.md](../contracts.md): Root, the service operation and the batch
  operation (`InspectInvocation`, `InspectResult`, `InspectOperation`, the
  `runInspection` paragraph, the `cli-entry.ts` injection line); CLI,
  arguments, document and exits (the grammar, the invalid combinations,
  `CliEnvironment.inspect`, `InspectDocument`, the human blocks).
- Main plan: [Commands](../main-plan.md#commands), [Exits](../main-plan.md#exits)
  and the [Error table](../main-plan.md#error-table) in full;
  [Resolved decisions](../main-plan.md#resolved-decisions) 2, 5 and 8; matrix
  rows I3-09 and I3-10;
  [Harness implementation and evidence](../main-plan.md#harness-implementation-and-evidence)
  items 2 and 3; [Coexistence with Plan 5](../main-plan.md#coexistence-with-plan-5)
  for the append rule on `arguments.ts`, `run-cli.ts`, `interfaces/cli.ts`,
  `errors.ts` and `cli-entry.ts`.
- [scope.md](../scope.md#spelling-rule); the batch row of
  [Detail tiers](../scope.md#detail-tiers-and-availability); the rebase rule in
  [Coexistence with Plan 5](../scope.md#coexistence-with-plan-5).
- [owners.md](../owners.md): the Root and CLI sections and the iteration 7
  rows of the activation manifest.
- [subcases.md](../subcases.md): the I3-09 and I3-10 rows.
- [CLI invocation](../../../architecture/cli-invocation.spec.md) in full;
  [Processes and clients](../../../architecture/processes-and-clients.md):
  CLI commands, PC03.
- Source: `src/batch.ts`, `src/interfaces/batch.ts`, `src/cli-entry.ts`;
  `subs/cli/src/{arguments,check-command,command-support,format,errors,run-cli,index}.ts`
  and `src/interfaces/cli.ts`; `src/tests/batch-cli.test.ts` and
  `subs/cli/src/tests/arguments.test.ts`; `subs/analysis/src/inspection.ts`
  and `src/analyze-project.ts` for the call `runInspection` makes.

## Deliverables

1. `src/interfaces/batch.ts` appended with `InspectInvocation`,
   `InspectResult` and `InspectOperation`; `src/batch.ts` exporting
   `runInspection`, which resolves the root as `runBatch` does, calls
   `analyzeProject` with the batch limits, `createDefaultTagRegistry()` and
   Plan 1's capabilities plus `symbol-details`, resolves the consumer, and
   calls `answerInspection` over the report's snapshot. An engine outcome that
   is not completed, and a report without a snapshot, are `not-answered` with
   the reason and exit 2.
2. `src/cli-entry.ts` injecting
   `inspect: async (invocation, control) => (await import('./batch.js')).runInspection(invocation, control)`,
   so no analysis module loads for a command that does not need it.
3. `subs/cli/src/arguments.ts` accepting the three command grammars of
   contracts.md, with `--fresh` or `--last-valid` together with `--batch`,
   `--symbol` without `--usage`, a non-positive `--limit` and a `--detail`
   outside the three values rejected as invalid invocations with exit 2. The
   help text lists the three commands, their arguments and the exits.
4. `subs/cli/src/inspect-commands.ts` implementing the three commands over
   `environment.inspect`, reusing `check-command.ts`'s root selection and
   terminating-command rules. This iteration wires the batch path only;
   iteration 8 adds the resident path behind the same command bodies.
5. `subs/cli/src/inspect-format.ts` rendering the human blocks of
   contracts.md: the `Root:`, `From:` and summary lines, one section per
   provider with its purpose, one row per symbol with name, form, tags and
   specifier, the indented signature line at the `signatures` and `docs`
   levels, the single `Signatures: unavailable (...)` line when the tier is
   not present, the `explain` blocks ending in the availability sentence and,
   when not visible, `Proposed declarations (not existing permissions):` with
   the hop lines, and the `inspect` summary with its optional usage sections.
6. `InspectDocument` in `subs/cli/src/interfaces/cli.ts` exactly as
   contracts.md declares, written as the only object on standard output for
   `--format json`, with `mode: 'batch'`, the `inputId` and a null `revision`
   on this path. `CliEnvironment.inspect` is added; `errors.ts` gains the new
   invalid-invocation messages; `run-cli.ts` dispatches the three commands.
7. Round-trip evidence: for three consumer areas of the reference project and
   two of the toolkit, a generated file containing every listed specifier as a
   type or value import matching the listed form, checked with
   `analyzeProject` over the copy and required to produce no finding; and a
   control file importing one listed type-only symbol as a value, required to
   produce the `required-symbol-tag` denial at that location.
8. Tests: `subs/cli/src/tests/arguments.test.ts` extended;
   `subs/cli/src/tests/inspect-commands.test.ts` and
   `src/tests/batch-cli.test.ts` extended through root's quick environment.
   Harness: the `inspect-batch` capability with the I3-09 and I3-10 handlers
   in `scripts/reference-harness/inspect-cli-cases.ts`.
9. Before exit, the branch rebases onto `main` and resolves any additive
   conflict with Plan 5 by keeping both additions, reordering and renumbering
   nothing.

## Matrix rows executed here

- I3-09: `available-human`, `available-json-document`,
  `inspect-module-summary`, `inspect-usage`, `explain-human-json`,
  `outside-project-exit-2`, `invalid-arguments`, `help-lists-commands`,
  `batch-details-present`.
- I3-10: `spellings-pass-check-reference`, `spellings-pass-check-toolkit`,
  `tests-area-spellings`, `type-only-value-import-denied-control`.

## Verification

```sh
npm run build && npm run type-check
npx vitest run subs/cli/src/tests/arguments.test.ts \
  subs/cli/src/tests/inspect-commands.test.ts \
  src/tests/batch-cli.test.ts
npm test
(cd examples/collection-review/subs/workspace/subs/reviews/src \
  && node ../../../../../../dist/src/cli-entry.js available --batch)
node dist/src/cli-entry.js available --root examples/collection-review \
  --from examples/collection-review/subs/workspace/subs/reviews/src --batch --format json
node dist/src/cli-entry.js inspect --usage --root examples/collection-review --batch
npm run reference:verify -- --plan 3 --iteration 7        # requires 2 to 7
npm run reference:verify -- --plan 1 && npm run reference:verify -- --plan 2
export RAMIFY_ENDPOINT_DIR="$(mktemp -d)"
npm run check:reference && npm run check:self
node dist/src/cli-entry.js daemon stop && git diff --check
```

Evidence kinds: `quick` for the I3-09 command instances through root's quick
environment, and `api` for the I3-10 round trips. Expected intermediate
failures: the unfiltered `--plan 3` gate, and the `inspect-service`,
`inspect-join`, `inspect-measure` and `completion` capabilities. The resident
path does not exist yet: every command here runs with `--batch`. A specifier
the check rejects is a defect in iteration 3's spelling rule and is fixed
there, not worked around in the renderer.

## Exit criteria

- The three commands run from a module's `src/` with `--batch`, print the
  documented human blocks and the `ramify.inspect/1` document, and exit 0, 2
  or 130 as the tables fix.
- Every listed specifier written into its consumer area passes the check on
  three reference areas and two toolkit areas, and the type-only control is
  denied with `required-symbol-tag`.
- Every I3-09 and I3-10 instance ran and asserted its own expectation.
- The branch is rebased onto `main` with additive conflicts resolved by
  keeping both additions; Plan 1's and Plan 2's gates still pass.

## Handoff

Iteration 8 adds the resident path behind the same command bodies, the
`Mode:` and `Revision:` lines of the same document, and the fallback rule for
a terminating command. Iteration 10 measures these commands, and iteration 11
records the document and the commands in the architecture's command table.
