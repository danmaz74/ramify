# Iteration 2 results

**Date:** 2026-10-12. **Status:** Implemented and qualified for coordinator review.

[Iteration brief](iteration2.md), [adopted contracts](../contracts.md) and
[acceptance matrix](../acceptance.md). The brief and main plan were not edited.
Existing specification, roadmap and iteration 1 changes were preserved.

## Delivered behavior

`ramify ownership [--root <dir>] [--path <path>]... [--format human|json]`
answers from `acquireInventory` and the existing `classifyProjectPath`. It does
not call full analysis, retained sessions, dependency selection or a daemon
connector. Omitted paths become `.`; exact strings are deduplicated in first
request order. Outside-project and excluded paths answer successfully. Argument
validation uses the project's extracted syntax predicate before acquisition.

Root supplies `OwnershipBatchInvocation`, `OwnershipBatchResult`,
`OwnershipBatchOperation` and `runOwnershipBatch`, injected through optional
`CliEnvironment.ownershipBatch`. Both the Node launcher and compiled launcher
are wired; the latter runs inventory acquisition in its existing Node child
seam. Missing injection is an execution refusal rather than a resident fallback.

CLI exports `OwnershipDocument` and `ownershipDocumentSchema` through
`ramify.ts/cli`. The strict Zod decoder validates all union variants, nested
records, status/exit pairs, diagnostics, stages and warnings. Every iteration 1
ownership example now uses the production type and decoder; the
`ProposedOwnershipDocument` substitute is removed. Frozen old examples are
unchanged. Generic invocation/exception output is CLI/2; command-specific
refusals remain at their predecessor versions until their later implementing
iteration.

| Outcome | Exit | Ownership document |
| --- | --- | --- |
| answered, including outside/excluded | 0 | Current root/input identity, projected configuration/ownership, paths, warnings |
| invalid acquisition | 1 | Root or null, full acquisition diagnostics, only actually supplied stages |
| incomplete or unavailable acquisition | 2 | Same failure-only fields; no partial table or input identity |
| malformed invocation or missing operation | 2 | Minimal CLI/2 invocation/execution envelope |
| cancellation | 130 | No ownership document; existing interruption message |

The daemon's former table/exclusion validators moved to project-owned
`isProjectOwnership` and `isProjectExclusion`, preserving their exact structural
semantics. Daemon and public CLI decoding receive this single implementation.
`projectPathProblem` lives in pure `path-syntax.ts`; the classifier delegates to
it. New provider exposures and signature companions follow project → analysis
→ root → descendants. No second ownership algorithm or table decoder was added.

Project resolution/read failures and inventory failures retain the canonical
selected root. Explicit canonical candidates retain it on declaration failure;
failed discovery/canonicalization keeps null. Internally cancelled `ProjectRead`
also retains its root so inventory's own deadline can produce incomplete evidence
after selection. User cancellation remains bare `InventoryRun.cancelled` and
never becomes an ownership answer. Every acquired view is disposed, including
all three changed-seal retries. Unspanned issues now have null locations and
empty related locations, with honest path context in their message where needed.

## Verification and identity

Source base: `6161e76dcd22e45213a59e19950762750ca03e60` plus preserved local
changes and this iteration's uncommitted implementation. Package `ramify.ts`
`0.4.3`; Linux x64; Node `v22.23.3`. Built runtime identity:
`44f4feacd0e8c3b1c16430dc6fc3696fc4ddcc2efb0fb5a8da041b84eb9effbc`.
Final test expectation and build-script comment edits followed that production
build; ownership runtime source was unchanged after it.

| Command | Observed result / evidence |
| --- | --- |
| `npm run type-check` | Final exit 0, root/portable/scripts/reference-harness configurations. [Log](../evidence/iteration2-types.log.gz). |
| `npm run build` | Final exit 0, production and explorer. Existing Vite chunk warning retained. [Log](../evidence/iteration2-build.log.gz). |
| `npm test -- subs/cli/src/tests/recovery-contracts.test.ts subs/cli/src/tests/ownership-command.test.ts subs/cli/src/tests/arguments.test.ts src/tests/ownership-batch.test.ts subs/analysis/src/tests/inventory.test.ts subs/analysis/subs/project/src/tests/path-ownership.test.ts subs/analysis/subs/project/src/tests/project.test.ts subs/analysis/subs/project/src/tests/resolve-root.test.ts subs/daemon/src/tests/codec.test.ts subs/cli/src/tests/errors.test.ts subs/cli/src/tests/affected-command.test.ts subs/cli/src/tests/measure-command.test.ts src/tests/batch-cli.test.ts src/tests/affected-batch.test.ts` | 13 files passed; 517 assertions passed, one stale generic-envelope expectation failed. [Preserved aggregate log](../evidence/iteration2-focused.log.gz). The failing file was corrected and rerun below; no failed runtime assertion remains. |
| `npm test -- subs/cli/src/tests/measure-command.test.ts` | Exit 0, all 4 tests after correcting its incompatible-service generic expectation from CLI/1 to CLI/2. [Log](../evidence/iteration2-measure-regression.log.gz). Together with the aggregate's unaffected passes this qualifies 518 assertions in 14 files. |
| `npm test -- src/tests/compiled-client.test.ts -t 'FR03 FR04 FR07'` | Exit 0, one installed ownership scenario; 9 unrelated tests not selected. Both launcher paths, human/JSON, valid/invalid-link, missing explicit root and malformed invocation, no daemon state or surviving child. [Log](../evidence/iteration2-installed.log.gz). |
| `npm run check:self` | Exit 0, completed/passed, 15 owners, 613 source files, 20 resources, 0 errors/warnings, 45 analysis limits. [Log](../evidence/iteration2-self-check.log.gz). |
| `dist/src/ramify materialize --view architect --view api --all --root .` | Exit 0 under an isolated `RAMIFY_ENDPOINT_DIR`; both views refreshed; owned daemon stopped and status verified `running=false`. [Log](../evidence/iteration2-views.log.gz). |
| `node --input-type=module -e 'import { ownershipDocumentSchema } from "ramify.ts/cli"; if (!ownershipDocumentSchema.safeParse({schemaVersion:"ramify.ownership/1",ramifyVersion:"0.4.3",status:"unavailable",exitCode:2,root:null,diagnostics:[]}).success) process.exit(1); process.stdout.write("Public ramify.ts/cli ownership decoder import passed.\n");'` | Exit 0 through the actual package self-reference. [Log](../evidence/iteration2-package-entry.log.gz). This is not the isolated packed-package qualification of iteration 7. |
| `git diff --check` | Exit 0; new files checked for whitespace separately. |

The direct suite independently establishes FR01 and FR03–FR08's iteration 2
portions: every ownership status/exit, all ten rejected outer examples and seven
malformed nested records; identical affected ownership table; ownership with two
removed exports while affected refuses; malformed root/child declarations,
conflicting trees, invalid configuration, missing configuration extension and
failed root discovery/canonicalization; both owned tree kinds, hard exclusions,
nonexistent/deleted spellings, directories and supported invocation symlinks;
defaults/order/options; three-attempt sealing retry/disposal, limits, setup
refusal, internal deadline after selected root and user cancellation. Existing
project tests also qualify real changed acquisition and configuration behavior.
Spies and refusing injected ports explicitly establish the absence of full
analysis, retained sessions, daemon connection and dependency calls.

## Corrections and limits

The first focused run had 383 passes and one new fixture failure: an ordinary
`expose-src *` target is invalid at linking rather than parsing, so it did not
make acquisition invalid. The fixture now uses parser-invalid `expose-test *`.
Initial TypeScript errors were a spread failing to narrow status/exit pairs and
a Vitest array parameter spread; both were corrected before final checks.
The expanded regression's single remaining failure was the stale measure generic
CLI/1 assertion described above, not an acquisition or runtime failure.

The first build was rejected by the compiled client's blanket exclusion of
analysis runtime files and external packages. [Original failure](../evidence/iteration2-build-initial-failure.log.gz).
The coordinator approved isolating the pure syntax predicate and allowing only
`path-syntax.js` and `ownership-validation.js`. The compiled client still excludes
all external packages, including Zod, and all acquisition/analysis/session runtime
files. Its process seam verifies status/exit/envelope keys and delegates table
validity; CLI constructs a document from the trusted typed provider. The public
strict decoder remains exported for consumers. This is an implementation choice,
not a schema or specification exception. The optimization document retains the
existing batch fallback behavior and records this narrow bundle boundary.

Self-check's four new coverage notes are test-only namespace-flow limits at the
four `vi.spyOn(namespace, member)` negative-witness/controlled-adapter calls.
The predecessor's 41 limits remain visible. No limit, deadline or retry budget
was increased, and no compiler/session retention was introduced. Unrelated host
build/test activity in another worktree was observed and left untouched.

## Successor inputs

Iteration 3 receives the selected-root failure representation and honest nullable
locations, plus the public ownership command and schema. FR04's full diagnostic
propagation/equality across analysis and affected refusal remains iteration 3;
current affected refusal still reduces its report to a message. The new ownership
schema retains full supplied related locations, but human ownership currently
prints primary locations only. Rich related-location presentation, formatter
failure cause preservation and complete generic stages/recovery remain iterations
3/6. Existing command-specific CLI/1 and Check/3 outputs remain staged work;
ownership never carries recovery.

`ownership-schema.ts`'s diagnostic-code list is typed against `AnalysisCode` and
currently covers its complete union; keep it synchronized when producer codes
change. The four warning codes match today's `ProjectWarning` type. Shared table
validation deliberately retains predecessor structural semantics rather than
adding table coherence/order rules; those remain producer contracts.

Iteration 7 still owns transport-wide/process cancellation and repair workflow,
retention/latency measurements, full regressions/reference qualification and the
isolated packed-package smoke. No audit, commit, push, release or consumer change
was attempted. No remaining production blocker was identified in this iteration.
