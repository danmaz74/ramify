# Evidence during invalid analysis

**Date:** 2026-10-12. **Status:** Implemented and qualified, including the [committed candidate audit](../plans/analysis-failure-recovery/audit-receipt.md).
The command and response additions below were reviewed as proposed contracts;
the [qualification receipt](../plans/analysis-failure-recovery/completion-report.md) records their local implementation.

An edit can leave a project temporarily invalid while a coordinated change is
in progress. Ramify must report that state without losing the evidence needed
to investigate it. A consumer must also be able to ask who owns a path without
first obtaining successful export linking and import analysis.

This design adds an independent ownership query and preserves structured
failure evidence across existing operations. It does not decide what an editor
should repair, restore files, or require every intermediate edit to be valid.

## Governing contracts

The [importability principles](../model/cross-module-importability.principles.md)
make ownership independent of analysis coverage. The
[module architect principles](../agents/module-architect.principles.md) require
deterministic evidence, one revision per represented state, and agent judgment
about architectural meaning. The [daemon contract](daemon.md) and
[memory lifecycle](memory-lifecycle.md) forbid replacing invalid current input
with a last-valid result and require bounded retention.

These principles remain unchanged. This proposal extends the
[CLI contract](cli-invocation.spec.md); it does not amend the importability
model, declaration grammar, source interpretation or check acceptance rules.

## Separate three questions

| Question | Evidence required | Meaning of success |
| --- | --- | --- |
| Who owns these paths? | Coherent project acquisition and valid ownership boundaries | Current containment and exclusions are known. |
| Can this project be analyzed? | All requested analysis stages complete | A current analysis exists, possibly with violations. |
| Does the check pass? | Completed analysis and its check verdict | The requested check passes under its stated coverage. |

An ownership answer establishes neither importability nor a passing check.
An analysis with ordinary violations is completed, unlike an invalid analysis
that cannot decide imports. An ownership query itself can fail when
descriptions, configuration or layout cannot establish the boundary.

## Ownership without full analysis

Add this CLI operation:

```sh
ramify ownership --root <project> --path <path>... --format json
```

Root discovery, canonicalization, configuration selection and human output
follow the existing CLI conventions. Paths are project-relative and use the
existing path-classification rules; an omitted path list means `.`. Version one
always acquires a fresh batch snapshot and starts no resident daemon. There is
no resident implementation, cache or new service protocol operation in this
version. Batch acquisition is already how the consumer obtains ownership.

Reuse `acquireInventory` and `classifyProjectPath` through the existing owners.
Configuration loading and declaration parsing remain necessary. Source export
cataloging, exposure linking, import decisions and dependency closure do not
run. Do not introduce a second parser or recover a partial declaration by
guessing which statements were intended. If existing acquisition cannot
establish the whole ownership table, report its failure without an
authoritative partial table.

The successful JSON document has `schemaVersion: ramify.ownership/1` and
contains:

- `status: answered`, `ramifyVersion`, canonical `root`, acquisition `inputId`
  and `exitCode: 0`;
- `scope: { configuration, ownership }`, where `configuration` preserves the
  captured configuration path and `ownership` is the identical public
  `ProjectOwnership` shape used by `affected` at `selection.scope.ownership`:
  `modules: PathOwner[]` and `exclusions: ProjectExclusion[]`, with the same
  fields, ordering, identities and classification rules;
- `paths: Array<{ path, ownership: PathOwnership }>`, one answer for every
  distinct requested path, including nonexistent, outside-project and excluded
  paths, in first-request order;
- `warnings: ProjectWarning[]` from that acquisition.

This is a projection of `ProjectScope`. Its `walkedAreas`, `selection` and
`invokedFrom` stay internal to acquisition for this command; they remain in
existing documents that already expose them. There is no dependency-selection
wrapper. Consumers reuse their ownership-table validation; they adapt envelope
and path-answer decoding without maintaining a second ownership-table decoder.

The acquisition identity is not a full-analysis identity. The schema and
operation identify its evidence domain; equal path lists do not establish
equality with an `affected` or `check` revision. Inputs changing during capture
use the existing bounded acquisition retry and then an explicit failure.

Malformed path arguments are invocation errors. Otherwise an outside-project
or excluded path is a successful classification, not a failed query.
Acquisition failures are failure variants of `ramify.ownership/1`, not the
generic `ramify.cli/1` envelope. They contain `schemaVersion`, `ramifyVersion`,
`status`, `exitCode`, structured `diagnostics: AnalysisDiagnostic[]`, and
`root` (the canonical root when established, otherwise null). They omit
`scope`, `inputId` and `paths`: an unsuccessful acquisition certifies no table
or input identity. Optional `stages: StageExecution[]` preserves available
stage outcomes without inventing stages that acquisition did not run.

| Ownership status | Exit code | Meaning |
| --- | --- | --- |
| `answered` | 0 | Current ownership was established. |
| `invalid` | 1 | Invalid project input prevents acquisition. |
| `incomplete` | 2 | Acquisition did not finish coherently, for example after a limit or exhausted changed-input retries. |
| `unavailable` | 2 | Acquisition cannot execute with the available setup. |

`incomplete` is explicitly a new ownership CLI status, preserving the internal
acquisition outcome. It is not an invalid-project verdict. Invocation errors
before dispatch use the generic CLI failure envelope, exit 2; the versioned
extension of that envelope is defined below. Cancellation retains the existing
interrupted outcome and exit 130, without an ownership answer. None of these
exit codes claims a source-check pass.

`affected` retains its dependency-selection semantics. It must still refuse
selection when the required current facts are absent. Do not return empty
affected-module lists as a substitute for an ownership answer.

## Preserve failure evidence

Use the existing analysis diagnostic and stage vocabulary. When a batch or
resident operation cannot answer because analysis failed, carry the relevant
diagnostics through the analysis, assembly, service and CLI layers. Preserve
codes, primary and related locations, diagnostic identities and stage outcomes
where produced. Preserve the underlying execution reason when there is no
analysis report. Never manufacture a location or stage from message text.

For example, a missing export should retain both the declaration location and
the defining-source location where the producer has them. A caller should not
receive only the first diagnostic's message stripped of its location. Parsing,
configuration, layout, linking and compiler failures need the same treatment.

Human output starts with the operation that failed and the located diagnostics,
then states which evidence is unavailable. JSON retains the complete bounded
producer evidence. Existing diagnostic/output limits still apply; any omitted
diagnostics remain explicitly incomplete. An error while formatting a report
must not erase the original cause when that cause is still available.

Failure of full analysis does not invalidate a separately acquired current
ownership answer. Conversely, the presence of `scope` in an invalid report is
not by itself a certified ownership answer: some failed acquisitions contain
partial inventory. Consumers use the ownership operation's answered contract.

Dependent projections remain unavailable where their inputs are invalid.
Previously generated views retain their earlier identities; do not publish a
mixture of previous valid facts and current diagnostics as a current view.

## Where to look since the last completed analysis

Resident contexts already retain `lastValid` and revision change paths. Extend
the carriers listed below with an optional `recovery` block whose
`schemaVersion` is `ramify.recovery/1`:

| Field | Meaning |
| --- | --- |
| `lastCompleted` | Context/generation, revision and input identity of the last completed analysis, or null. This may have reported violations. |
| `changes.paths` | Deterministically ordered paths observed changing after that analysis. |
| `changes.coverage` | `observed` or `unavailable`; observed paths are investigation evidence, not a complete net filesystem diff. |
| `changes.reason` | The reason for missing history or incomplete observation, including watcher loss, overflow, restart or eviction; null only when no such gap is known. |

### Public carriers

| Carrier | Proposed contract |
| --- | --- |
| Changed-check JSON, currently `ramify.check/3` | `ramify.check/4` adds top-level `recovery` for invalid, incomplete or unavailable analysis and other not-checked outcomes when context evidence exists. Preserve the existing findings, execution and path dispositions; also preserve available stage outcomes. |
| Generic CLI failure, currently `ramify.cli/1` | `ramify.cli/2` retains `status: unavailable`, diagnostics and exit code, and adds optional top-level `recovery` and available stage outcomes. Its reason codes and diagnostics distinguish invalid input from execution failure; it does not adopt the ownership status union. |
| Resident IPC replies, currently `ramify.ipc/2` | The next negotiated protocol carries `recovery` on the operation outcome (`value.recovery`), including reported invalid analysis and unavailable outcomes. A service failure uses `error.recovery` alongside its code/message and preserved diagnostics/stages. Both forms forward the same context evidence to the CLI; they do not encode structured evidence in scalar `error.details`. |
| Complete analysis report, currently `ramify.analysis/3` | Keep its current diagnostics and stages, with no `recovery` extension in this version. A batch check has no resident baseline. A complete resident report also remains analysis evidence; context history is available through changed-check output and contextual failure envelopes. |
| `ramify.ownership/1` | No `recovery` block in version one: this operation is always fresh batch acquisition. Its failure variants retain current diagnostics. |

The old `ramify.check/3` and `ramify.cli/1` shapes do not gain fields.
The new carriers share one recovery type, and transport/CLI adapters must
preserve it through both reported invalidity and failures without a report.
Omission means no context recovery evidence was available; it never means
there were no changes. An established context with no completed baseline uses
`lastCompleted: null` and explicit unavailable coverage. A batch report still
delivers its full current diagnostics without consulting a daemon for history.

### Retention and meaning

Keep one accumulated path set per live context from the last completed analysis
through subsequent invalid revisions and unsuccessful update attempts. Include
created and deleted paths when observed; retain both names of an observed
rename. A path edited and restored can still appear. Reset the accumulation
only after a new completed analysis is published, using the existing ordered
capture/publication boundary so queued later events are not lost.

Charge this set to existing queued-path and retained-byte budgets. Overflow
marks the observation gap and bounds the retained list; it never claims that
the retained prefix contains all changes. Context loss removes the baseline.
Do not pin historical compiler sessions or guarantee historical source bytes.
A fresh batch call has no prior analysis: it reports no historical baseline,
while still returning current diagnostics. Request shape errors have no
recovery block unless a project context was actually established.

This block helps a caller find the cause. It does not rank files, assert that
every changed file caused the failure, recommend rollback or distinguish a
deliberate intermediate state from a mistake. The caller knows its intended
change. Exact differences and durable recovery across restarts belong to a
caller that retains the corresponding filesystem baseline.

## Failure classes and continuation

| Condition | Ramify behavior |
| --- | --- |
| Missing export or invalid exposure linking, with valid acquisition | Full analysis reports invalidity; ownership can still answer. |
| Malformed declaration, invalid nested boundary or unreadable configuration | Return located acquisition diagnostics; ownership remains unavailable when its prerequisites are not established. |
| Ordinary import violation | Complete analysis and a failed check; current evidence remains usable. |
| Timeout, resource limit, compiler crash or unsupported setup | Preserve the execution reason and any trustworthy diagnostics; no invented project verdict. |
| Several edits are needed | Each request describes its current inputs; a later request can recover normally without resetting the project or discarding source. |
| Invalid initial state or lost context | No last-completed claim; current diagnosis and ownership attempts still work independently. |

No new automatic retry policy is introduced. Existing bounded lifecycle and
coherence retries remain. Repeating a deterministic invalid result without
changed inputs does not create progress. Cancellation and provider shutdown
retain their current lifecycle semantics.

## Placement and compatibility

Project acquisition and classification stay with `analysis/project`; analysis
composes their coherent result. Root assembly supplies the batch operation to
CLI, and CLI owns argument validation, JSON and human presentation. Contexts
owns the bounded historical path evidence. Existing failure adapters preserve
diagnostics. No new module is required.

Relevant existing implementation is [inventory acquisition](../../subs/analysis/src/inventory.ts),
[ownership classification](../../subs/analysis/subs/project/src/ownership.ts),
[batch assembly](../../src/batch.ts),
[affected CLI errors](../../subs/cli/src/affected-command.ts) and
[context publication](../../subs/daemon/subs/contexts/src/context-manager.ts).
These are implementation leads, not already delivered behavior.

Expose the ownership document's types/schema through the CLI package entry,
reusing the existing ownership types. Version changed strict outer response
schemas as specified above and negotiate corresponding resident protocol
support before sending new fields. Older peers must receive
their existing shapes or an explicit incompatibility; never silently discard
the new evidence. The release and exact IPC handshake increment belong to
implementation qualification. The new ownership command has no old response
contract to overload. Existing check exit meanings remain unchanged.

## Verification

| Case | Required evidence |
| --- | --- |
| Missing exports | Ownership answers the same valid module boundaries while full analysis reports every missing export with its available locations. |
| Broken acquisition | Malformed root/child declarations, nested-tree conflicts and configuration failure yield diagnostics and no certified partial ownership. |
| Path boundaries | Absent files, declared nested projects, external trees, outputs, generated paths and symlinks preserve existing classification and discovery rules. |
| Forward repair | Valid A, invalid B, still-invalid C, completed D require no process or project reset; the observed change set for C spans B and C. |
| Completed but failing | Ordinary violations still establish a completed-analysis identity, without a passing check. |
| Runtime failure | Crash, timeout, cancellation and unsupported response remain distinct from invalid project input and retain original causes. |
| History gaps | Watcher loss, overflow, eviction and restart expose missing history without false complete changes or stale current facts. |
| Coherence and compatibility | Changed capture retries/refuses; old peers retain supported behavior; new JSON validates and human output preserves useful locations. |
| Ownership wire outcomes | Validate answered and all failure variants, including `incomplete` at exit 2, invocation errors and cancellation; reuse the existing ownership-table validation. |
| Recovery carriers | Invalid reported analysis and failures without reports preserve recovery through IPC into changed-check/generic CLI output; batch reports and ownership omit it, and old schemas remain unchanged. |

Exercise real acquisition and analysis with small fixtures and the project's
quick-test boundaries, followed by focused CLI witnesses. Measure ownership
latency against the former full `affected --batch` query and retained bytes
across repeated invalid revisions. Reuse configured budgets; justify any new
cache only if measurements show the batch operation is insufficient.

Source snapshots, automatic rollback, an invalid-state task coordinator,
semantic cause inference, partial dependency graphs, tolerant declaration
parsing and a second ownership model are outside this design.
