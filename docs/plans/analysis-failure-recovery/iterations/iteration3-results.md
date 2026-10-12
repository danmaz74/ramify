# Iteration 3 results

**Date:** 2026-10-12. **Status:** Implemented and qualified within the
coordinator-reviewed transport staging described below.

[Iteration brief](iteration3.md), [adopted contracts](../contracts.md),
[acceptance matrix](../acceptance.md) and [predecessor handoff](iteration2-results.md).
The main plan, iteration briefs, existing edits and frozen old-schema JSON
witnesses were preserved. No commit, push, audit or publication was attempted.

## Delivered behavior

Analysis owns `AnalysisFailureEvidence`, with optional typed `diagnostics` and
`stages`. An absent list remains absent; an explicitly empty supplied list
remains present. Root re-exposes this type with its existing analysis vocabulary.
Session query refusals, affected batch refusals, context nonanswers and service
errors/nonanswers receive this vocabulary. Service errors retain scalar `details`;
evidence fields are siblings. No recovery type or protocol version is introduced.

`PublishedReport` and `SessionRevision` retain finalized stage records alongside
diagnostics. Publication still builds no full report or compiler snapshot.
Its stages equal the full report's stages, including diagnostic IDs and blocked
dependencies. Context `HistoryEntry` retains these small arrays, charges their
encoded bytes in both admission and storage, and retains no additional input,
compiler or full-report graph. Existing history and retention bounds are unchanged.

Affected batch assembly retains the complete bounded report diagnostics/stages
on failed open and invalid fresh revisions. No-report refusals retain their
original reason, message, unknown modules and supplied evidence. A short scalar
summary accompanies the structured records; it does not concatenate every
diagnostic into a second large payload. The existing invalid-project/1,
analysis-failed/2, project-unavailable/2 and query/lifecycle mappings remain.
Cancellation remains a bare cancelled/130 outcome. Ordinary violations still
complete analysis and permit affected selection.

Retained direct queries carry current diagnostics/stages when their current
revision lacks prerequisites. The host preserves its produced failure records
and stages across failed verify, API/architect view, measurement, affected and
details requests. It retains the operation error message and existing reason.
`AcquisitionFailure` replaces raw issue-to-first-code reductions during invalid
capture, observer update, promotion and reopen. Acquisition records are converted
once and retain all supplied codes, IDs and primary/related locations, plus the
invalid/incomplete/unavailable execution distinction. The existing diagnostic
and report bounds still emit explicit incomplete truncation evidence.

Full analysis's project conversion and `ReportDraft.failure` no longer create
line 1/column 1 from an unspanned issue or bare error path. Actual spans remain;
otherwise location is null and related locations are empty. Where needed, the
operation message names the actual path. Root discovery's established message
does not gain an unhelpful `.:` prefix. Inventory's iteration 2 representation
and certified ownership behavior are unchanged.

`CliFailure` preserves the exact original cause and projects only supplied
diagnostics/stages into its evidence object. Service errors and contextual open
failures use that typed evidence. `withFailureOutput` keeps a refusal's source
when formatting or writing throws; check report, affected, materialize, measure
and ownership failure output use it. Generic CLI/2 error output retains the
operation reason followed by full records and supplied stages. If the error
document cannot be written, stderr retains the original reason and diagnostic
messages; no parseable result is claimed. Rich located human formatting remains
iteration 6.

## Verification and identity

Source base: `6161e76dcd22e45213a59e19950762750ca03e60`, plus preserved local
changes and this uncommitted iteration. Package `ramify.ts` `0.4.3`; Linux x64;
Node `v22.23.3`. Built runtime identity:
`5d5433138fdc1d001c65c4fc855fcec89d72ddac584728893c72abb777a46b70`.
The last change after that build tightened four acquisition test expectations;
production source and the build identity were unchanged.

All test commands below used `--maxWorkers 1 --no-file-parallelism`, and the
checks ran sequentially. Evidence distinguishes actual provider/worker runs
from controlled adapter answers. The composed results qualify **282 distinct
tests in 19 files**; repeated selected cases are counted once.

| Command | Result and evidence |
| --- | --- |
| `npm test -- src/tests/failure-evidence.test.ts subs/analysis/src/tests/failure-evidence.test.ts subs/cli/src/tests/errors.test.ts --maxWorkers 1 --no-file-parallelism` | Exit 0, 3 files/45 tests before the later root truncation and ownership-output assertions. [Log](../evidence/iteration3-new-tests.log.gz). |
| `npm test -- subs/analysis/src/tests/inventory.test.ts subs/analysis/src/tests/session.test.ts subs/analysis/src/tests/retained-session.test.ts subs/analysis/src/tests/affected-session.test.ts subs/analysis/src/tests/report-publication.test.ts src/tests/affected-batch.test.ts src/tests/batch-cli.test.ts subs/cli/src/tests/affected-command.test.ts subs/cli/src/tests/materialize-command.test.ts subs/cli/src/tests/measure-command.test.ts subs/daemon/subs/contexts/src/tests/history.test.ts subs/daemon/subs/contexts/src/tests/api-view.test.ts subs/daemon/subs/contexts/src/tests/affected.test.ts subs/daemon/src/tests/codec.test.ts --maxWorkers 1 --no-file-parallelism` | Initial exit 1: 211 passed, 6 failed in 14 files/217 tests. Three expected synthetic locations, two expected refusals without added evidence, and one exposed the unnecessary root-message prefix. [Preserved log](../evidence/iteration3-focused.log.gz). All failures were corrected and rerun below; the 211 unaffected passes were reused. |
| `npm test -- src/tests/failure-evidence.test.ts subs/analysis/src/tests/session.test.ts subs/analysis/src/tests/affected-session.test.ts src/tests/batch-cli.test.ts subs/analysis/src/tests/session-worker.test.ts -t 'FR\|marks stray\|keeps acquisition evidence\|returns a read failure\|A7-05:invalid-current\|A7-05:missing-facts\|reports no project' --maxWorkers 1 --no-file-parallelism` | Exit 0, 6 files/25 selected tests, 110 unselected. Includes all six corrections, new producer truncation and real worker-loss evidence; the first path also selects the analysis owner's same-named test. [Log](../evidence/iteration3-corrections-worker.log.gz). |
| `npm test -- subs/analysis/src/tests/session.test.ts -t 'FR05\|FR09\|FR10' --maxWorkers 1 --no-file-parallelism` | Exit 0, 3 selected tests/53 unselected after tightening null-span assertions to exact path messages. [Log](../evidence/iteration3-null-spans.log.gz). |
| `npm test -- subs/cli/src/tests/errors.test.ts subs/cli/src/tests/ownership-command.test.ts --maxWorkers 1 --no-file-parallelism` | Exit 0, 2 files/47 tests, including ownership failure output cause preservation. [Log](../evidence/iteration3-output-causes.log.gz). |
| `npm test -- src/tests/failure-evidence.test.ts -t FR05 --maxWorkers 1 --no-file-parallelism` | Exit 0, 2 files/5 selected tests, 12 unselected; root/child parse and layout invalidity exit 1, invalid configuration is incomplete/analysis-failed and exits 2, with full producer equality. [Log](../evidence/iteration3-acquisition-exits.log.gz). |
| `npm run type-check` | Final exit 0 for root, portable, scripts and reference-harness configurations. [Qualified log](../evidence/iteration3-types-qualified.log.gz). Earlier successful incremental checks are also retained. |
| `npm run build` | Exit 0, production/compiled client and explorer. Existing Vite chunk warning retained. [Log](../evidence/iteration3-build.log.gz). The client still excludes Zod and full analysis runtime, permitting only iteration 2's two pure project helpers. |
| `npm run check:self` | Exit 0, completed/passed; 15 owners, 615 source files, 20 resources, zero errors/warnings and 45 analysis limits, unchanged from iteration 2. [Log](../evidence/iteration3-self-check.log.gz). |
| `git diff --check` | Exit 0; new source/report files inspected for whitespace. |

FR04/FR09's real removed-export fixture independently expects both declaration
spans and compares every diagnostic field and finalized stage through batch
refusal. FR05/FR09's real root parsing, child parsing, conflicting trees and
configuration variants compare producer evidence while independently asserting
execution, exit and absence of a partial answer. Controlled no-report variants
preserve analysis-failed, resource-limit, invalid-query and invalid-revision,
release their real sessions and keep supplied related locations/IDs/stages.
The worker-loss test terminates the real supervised worker, retains its query
failure evidence and verifies cleanup. Producer diagnostic exhaustion retains
the admitted record and explicit limit through batch assembly. Publication
equality includes completed ordinary denials, invalid linking/parsing and repair;
history tests verify stage identity and exact byte accounting. CLI tests cover
evidence projection, absent versus empty lists, formatter throws, generic JSON,
unwritable stdout and cancellation. No timing failure or flaky test was observed.

## Reviewed staging and successor inputs

The coordinator approved preserving evidence in providers and declaring typed
context/service fields now, while deferring their activation through context
adapters and service replies until iteration 5's strict IPC/3 negotiation.
Activating them under IPC/2 would produce replies its existing exact validators
reject. No omission sanitizer or new intentional stripping path was added.
This is an explicit intermediate limitation, not passing transport acceptance.

| Inventory adapter | Delivered or scheduled successor |
| --- | --- |
| Root/configuration/layout → acquisition; catalog/link/compiler → report | Delivered root acquisition preservation from iteration 2 plus current full-analysis conversions, bounded records and stages here. |
| Retained open/affected → root `refusal`/`runAffectedBatch` | Delivered complete typed evidence with unchanged reason/exit mappings. First diagnostic reads here are summary text only; the full records travel separately. |
| Session open/update → context publication | Detached stage history delivered. `context-manager.ts` failed noncheck open still chooses a scalar report summary; attach full diagnostics/stages when iteration 5 activates the carriers. Iteration 4 owns recovery accumulation and failed-observation preservation. |
| Context API/affected failures → service | Typed nonanswer fields declared. `deliverApiView`, `deliverAffected`, unavailable entry adaptation and service `materialize`/`measure` mappings still await iteration 5 evidence forwarding. |
| Service domain errors/throws → result; service → codec/client | Typed error siblings declared; service error assembly, deep evidence validators, both carriers and negotiation remain iteration 5. Scalar `details` stays scalar. |
| Reported check → changed-check assembly | Stage data is available in history; `changed-command.ts` Check/4 stages/recovery/current failure assembly and final formatter remain iteration 6. Check/3 is unchanged here. |
| Unresolved open → check/affected/materialize/measure | Check retains its report. Other commands prefer report evidence for their summary/cause, falling back to all raw issue messages if no report diagnostic exists. Full normal refusal JSON and rich human presentation remain iteration 6. |
| Affected/materialize/measure refusal → CLI | Refusal output wrappers retain typed original causes on formatting failure. Normal command-specific envelopes/presentation remain their predecessor versions until iteration 6. |
| CliFailure/output error → runCli | Delivered typed evidence projection and generic CLI/2 preservation; output failure retains the original reason and diagnostics. Ownership failure output also uses the compact wrapper. |

Iteration 4 receives required `SessionRevision.stages`, charged
`HistoryEntry.stages` and `AnalysisFailureEvidence`. Its recovery implementation
must not activate new IPC fields incidentally. Iteration 5 must replace the
named existing context/service reductions with evidence forwarding under /3,
and add recovery to the explicit `CliFailure` evidence projection. Iteration 6
receives all provider/batch evidence and formatter causes; it completes Check/4,
normal CLI/2 refusal envelopes, related-location presentation and changed-check
failure handling. Analysis reports remain Analysis/3 without recovery; ownership
never carries recovery. Full socket/process/package qualification, installed
repair workflow and measurements remain iteration 7. Generated views were not
refreshed in this iteration; final edits after qualification were test-only.
