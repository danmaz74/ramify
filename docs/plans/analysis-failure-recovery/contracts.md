# Recovery contract package

**Date:** 2026-10-12. **Status:** Reviewed and adopted iteration 1 contracts
by the coordinator. Runtime delivery remains in iterations 2–7.

[Plan](main-plan.md), [specification](../../architecture/analysis-failure-recovery.spec.md)
and [acceptance](acceptance.md) govern these decisions. The provider inspection
used `6161e76dcd22e45213a59e19950762750ca03e60`, version `0.4.3`, and freshly
materialized architect and source-area API views. No new module is required.

## Ownership and acquisition

CLI owns `OwnershipDocument` and `ownershipDocumentSchema`, exported through
`ramify.ts/cli`. The schema offers `parse(unknown): OwnershipDocument` and
`safeParse(unknown)` with the existing Zod convention. Strict object variants
reject unknown fields. Failure status and exit code are coupled:

```ts
type OwnershipDocument =
  | {
      readonly schemaVersion: 'ramify.ownership/1';
      readonly ramifyVersion: string;
      readonly status: 'answered';
      readonly exitCode: 0;
      readonly root: string;
      readonly inputId: string;
      readonly scope: {
        readonly configuration: string;
        readonly ownership: ProjectOwnership;
      };
      readonly paths: readonly {
        readonly path: string;
        readonly ownership: PathOwnership;
      }[];
      readonly warnings: readonly ProjectWarning[];
    }
  | ({
      readonly schemaVersion: 'ramify.ownership/1';
      readonly ramifyVersion: string;
      readonly root: string | null;
      readonly diagnostics: readonly AnalysisDiagnostic[];
      readonly stages?: readonly StageExecution[];
    } & (
      | { readonly status: 'invalid'; readonly exitCode: 1 }
      | { readonly status: 'incomplete' | 'unavailable'; readonly exitCode: 2 }
    ));
```

An answered result has no `recovery`, `selection`, `walkedAreas`,
`invokedFrom` or dependency wrapper. Failures have no `scope`, `inputId`,
`paths`, `warnings` or `recovery`. Cancellation returns exit 130 with the
existing interruption presentation and emits no ownership document. An
outside-project or excluded answer still exits 0. `PathOwnership` retains
its existing four-variant vocabulary, but a successful CLI invocation cannot
produce `invalid-path`: syntax is validated before acquisition, and a coherent
table supplies a root owner.

Root owns `OwnershipBatchInvocation`, `OwnershipBatchResult` and
`OwnershipBatchOperation` in `src/interfaces/batch.ts`. Invocation is
`{cwd: string, root?: string, paths: readonly string[]}`; the operation accepts
the existing optional `RunControl`. Answered results contain `status`,
canonical `root`, `inputId`, projected `scope`, `paths`, `warnings` and
`exitCode: 0`; failures contain `root`, diagnostics, optional stages and the
same status/exit pairs; cancellation is `{status:'cancelled', exitCode:130}`.
The CLI supplies `ramifyVersion` and the schema identifier. Root injects the
operation as optional `CliEnvironment.ownershipBatch`, wiring both installed
launcher paths and the batch child. Missing injection is an execution refusal.
No daemon connection, service operation or dependency query is involved.

### Validator reuse

The current private `ownership()` and `exclusion()` validators in
`subs/daemon/src/codec.ts` are the existing affected ownership-table decoder.
Move their shared implementation to project-owned
`subs/analysis/subs/project/src/ownership-validation.ts` as
`isProjectOwnership(value: unknown): value is ProjectOwnership` and
`isProjectExclusion(value: unknown): value is ProjectExclusion`. Preserve their
strict structural semantics, including owned and unowned exclusion kinds.
Daemon delegates its existing scope/table validation; CLI delegates ownership
table and path-exclusion decoding. Do not strengthen affected decoding
incidentally or make CLI depend on daemon internals. This is one validator
implementation, received by both consumers. Ordering and classifier correctness
remain producer rules with independent fixture assertions.

### Path arguments

Extract the existing classifier's syntax checks into project-owned
`projectPathProblem(path: string): string | null`; return the same diagnostic
message and have `classifyProjectPath` call it. CLI uses it before invoking
ownership acquisition. It is a syntax predicate, reads nothing and does not
require a placeholder ownership table. Accept `.` and normalized relative
paths, including leading `..` segments. Reject empty or absolute paths,
drive-prefixed paths, backslashes, empty segments and interior `.` or `..`.
Do not invent a stronger control-character restriction than the existing
classifier. Preserve first-request order and deduplicate exact path strings;
an omitted list becomes `['.']`. Ownership accepts only repeated `--path`,
`--root` and `--format human|json`; it is inherently fresh batch and rejects
`--batch`, operands and other command options. Missing/duplicate nonrepeatable
options and malformed paths use CLI/2 exit 2 before acquisition.

### Root preservation and location absence

Add `root: string | null` to unsuccessful `ProjectResolution`, `ProjectRead`
and `InventoryRun` variants. Project establishes it from successful canonical
selected-root resolution: an explicit directory that can be canonicalized keeps
that candidate when declaration validation fails; discovered selection keeps
the marked candidate. A failed discovery or failed canonicalization has null;
canonicalizing the invocation's working directory alone establishes no root.
Configuration failure after selection, partial inventory, sealing failure,
retry exhaustion and deadline after selection retain the selected canonical
root. Subsequent attempts update this only from their actual resolution.
No preliminary second acquisition is needed, and message text is never parsed
to recover a root. Inventory still returns no snapshot on failure.

`ProjectIssue.span` is optional. Conversion keeps actual parser/issue spans;
without one, `AnalysisDiagnostic.location` is null and `related` is empty.
Remove the inventory adapter's fallback line 1/column 1. Producer-owned IDs
are preserved by every later adapter; project-to-analysis conversion creates
an ID once using the existing content identity recipe. Raw project-resolution
issues remain distinct in `OpenOutcome.resolution.issues`; the report's analysis
diagnostics are preferred when available. A path without a span is not a
`SourceLocation` and must never become one through an adapter. Human adapters
may render a raw issue's path without a line/column, or prefix that path to its
operation message when the producer did not already name it. They do not
modify producer AnalysisDiagnostic records or invent a wire location.

## Recovery and current failure evidence

Contexts owns this plain detached data type in `interfaces/contexts.ts`:

```ts
interface RecoveryEvidence {
  readonly schemaVersion: 'ramify.recovery/1';
  readonly lastCompleted: {
    readonly context: ContextId;
    readonly generation: GenerationId;
    readonly revision: RevisionId;
    readonly inputId: string;
  } | null;
  readonly changes: {
    readonly paths: readonly string[];
    readonly coverage: 'observed' | 'unavailable';
    readonly reason: string | null;
  };
}
```

Paths are normalized, deduplicated and sorted by UTF-8 byte order. The identity
comes from `ContextRevision.token`, `.revision` and `.fingerprints.inputId`.
Only completed execution establishes the baseline; ordinary violations qualify.
No report or compiler handle is retained for that identity. Invalid reports
never replace it. Capture and publication use a monotonic observation sequence:
completed publication clears observations through its captured sequence only.
Later events remain, including later observations of a previously seen path.
Failed captures and update attempts clear nothing. Snapshots are frozen and
coherent with the result they accompany; do not attach a later mutable snapshot
after awaiting a formatter or socket write.

### Gap composition

Contexts retains a bounded set of gap codes. Serialize distinct codes in this
fixed order, joined by `'; '`: `no-completed-baseline`, `context-restarted`,
`context-evicted`, `watcher-loss`, `path-overflow`, `byte-pressure`. No codes
means `reason: null`. No completed baseline always implies unavailable coverage
and includes `no-completed-baseline`; a known restart or eviction adds its own
code, and never carries the old identity. With a baseline, retained trustworthy
observations use observed coverage even when a gap exists. Entirely lost
observation uses unavailable coverage. Sweeps cannot remove a historical gap.
Completed publication resets only gaps covered by its capture, preserving gaps
and events that arrived later. Initial contexts do not claim a restart/eviction
unless that cause is known. New transport peers treat reason as a string, not
an extensible wire enum. Producers use these deterministic codes.

Use the existing 10,000-path, 96 MiB per-context and 512 MiB global budgets;
charge path strings, gap state, baseline identity and retained response copies.
Overflow keeps a bounded useful prefix and marks its cause. Disposal releases
all recovery state. The eight-revision history limit does not erase a live
context's compact completed identity.

### Carrier fields

| Carrier | Exact addition or preservation |
| --- | --- |
| Analysis reports | Keep Analysis/3. `diagnostics` and `stages` retain producer data; no recovery member. |
| Check outcomes | Optional `recovery` on invalid/incomplete/unavailable reported results and other nonanswer outcomes with context evidence; optional diagnostics/stages on failures without a report. No recovery on a completed report. |
| Affected/API-view/context failures | Optional typed `diagnostics`, `stages`, `recovery`; no selection/projection when current prerequisites fail. Preserve the current execution reason. |
| Root batch affected failure | Optional typed `diagnostics`, `stages`; retain reason/message/unknownModules/exitCode, no recovery. |
| ServiceError | Keep code/message/scalar details; add optional `diagnostics: readonly AnalysisDiagnostic[]`, `stages: readonly StageExecution[]`, `recovery: RecoveryEvidence`. |
| Service nonanswers (check, affected, materialize, measure) | Optional diagnostics/stages/recovery, inherited or explicitly forwarded from the contextual outcome. Successful affected/materialize/measure documents do not gain recovery. |
| Check/4 | Preserve all Check/3 members and their semantics, replace only schema identifier; add optional `stages: readonly StageExecution[]` and `recovery: RecoveryEvidence`. Existing findings hold diagnostics with `new`; no duplicate top-level analysis diagnostics array. |
| CLI/2 | Preserve status `unavailable`, diagnostics and exit code; add optional stages/recovery. `diagnostics` accepts full AnalysisDiagnostic and the existing operation diagnostic `{category:'invocation'|'execution', code:string, message:string}`. |
| Ownership/1 | Current diagnostics on acquisition failure; no recovery anywhere. |

CLI/2 keeps a minimal operation diagnostic identifying an execution/refusal
reason, followed by the producer's full diagnostics when available. It creates
no synthetic analysis ID, span, importer or original. Report diagnostics must
remain full records, never reduced to their message. For a no-report crash,
timeout or unsupported setup, retain the operation reason and any diagnostics
and stages actually supplied; absent stages are omitted. An empty supplied
array stays distinct from no supplied evidence. Invalid project exit 1 and
execution/unavailable/incomplete exit 2 remain distinct. Cancellation exits
130 without claiming an answer. Formatter failure preserves an available
original cause and adds `output-failure`; if stdout is unwritable, stderr carries
the cause and no parseable document is claimed.

## Negotiation and strictness

Adopt `ramify.ipc/3` in iteration 5. Hello/welcome/discovery/runtime identity
agree on that version. A /2–/3 pairing receives explicit incompatibility before
operation replies; no silent downgrade or stripping of evidence. Pre-handshake
rejection uses only the existing compatible code/message/scalar-details error
shape so the older peer can receive the refusal. Both new carriers are exact;
the value example is a `check` operation's unavailable outcome:

```json
{"ok":true,"value":{"status":"unavailable","requestId":"q","reason":"analysis-failed","message":"Compiler stopped","diagnostics":[],"recovery":{"schemaVersion":"ramify.recovery/1","lastCompleted":null,"changes":{"paths":[],"coverage":"unavailable","reason":"no-completed-baseline"}}}}
```

```json
{"ok":false,"error":{"code":"internal-error","message":"Compiler stopped","details":{},"diagnostics":[],"recovery":{"schemaVersion":"ramify.recovery/1","lastCompleted":null,"changes":{"paths":[],"coverage":"unavailable","reason":"no-completed-baseline"}}}}
```

Typed diagnostics/stages/recovery are never embedded in `error.details`,
including as JSON strings. Root service contracts and daemon reply validators
must agree on both carriers; CLI consumes both. `validateServiceReply` must
validate evidence fields deeply, not merely trust a report schema identifier.
Existing bounded framing refuses oversized messages; never silently retain
only the first diagnostic. Producer truncation keeps its explicit limit
diagnostic and incomplete execution.

Always emit Check/4 and CLI/2 after their implementing iteration. Old Check/3
and CLI/1 fixtures are immutable witnesses and never gain new fields. Old strict
readers reject added stages/recovery. Analysis/3 and ownership reject recovery;
watch and context/status schemas are not expanded incidentally.

## Producer and adapter inventory

| Producer → adapter | Owner / recipients | Current evidence loss and required change |
| --- | --- | --- |
| Root/configuration resolution → acquisition | project → analysis | Failure loses selected root; carry typed root through failure unions. Raw ProjectIssue differs from AnalysisDiagnostic. |
| Declaration parsing/layout → inventory | descriptions/project → analysis | `projectDiagnostics` invents line 1 without span; preserve actual spans, otherwise null. |
| Inventory/profiles/seal → ownership assembly | analysis → root → CLI | New operation projects only a coherent completed inventory. No table/input identity on failure. |
| Catalog/link/compiler → report | typescript/descriptions → analysis | Preserve all diagnostics, related locations, IDs and executed stages; preserve incomplete producer truncation. |
| Retained open/affected → `refusal`/`runAffectedBatch` | analysis → root | `src/batch.ts` selects diagnostics[0].message; add diagnostics/stages without changing reason and exit mapping. |
| Session open/update → context publication | analysis → contexts | Noncheck requests at failed open reduce report to first message; failure evidence must remain detached; failed capture must not erase observations. |
| Context API/affected failures → service | contexts → daemon/root service contracts | Service remaps unavailable variants, dropping report evidence. Forward typed diagnostics/stages/recovery explicitly through materialize and measure as well. |
| Service domain errors/throws → result | contexts/service → daemon | `details` is scalar and cannot encode evidence; use error siblings and preserve underlying reason. |
| Service result → codec/client | root contracts → daemon → CLI | Current strict error shape rejects additions; negotiate /3 and validate both value and error carriers. |
| Reported check → changed-check assembly | daemon → CLI | Findings survive; stages and history do not. Retain existing dispositions/execution and add available stages/recovery. |
| Unresolved open → check/affected/materialize/measure | project/context → CLI | Several adapters select issues[0] or diagnostics[0]. Use all report diagnostics when available, otherwise all operation issue messages without synthetic spans. |
| Affected/materialize/measure refusal → CLI failure | root/daemon → CLI | `affected-command`, `materialize-command`, `measure-command` create one minimal diagnostic; preserve typed evidence and context from the refusal. |
| Thrown CliFailure/output error → `runCli` | CLI | Cause exists but rendering loses it; carry evidence through CliFailure and preserve original cause on formatting failure. |

## Exposure and signature companions

The generated views confirm the existing paths below. Production declarations
are updated when the actual symbols are delivered, rather than exposing names
that do not yet exist.

| Symbols | Declaration path / companions |
| --- | --- |
| Existing ProjectOwnership, PathOwner, ProjectExclusion, PathOwnership, ProjectWarning, ProjectScope | project interface wildcard to parent → analysis named project relay to parent and descendants → root named relay to descendants. Already visible to CLI/daemon/contexts. |
| New isProjectOwnership, isProjectExclusion, projectPathProblem | project exposes owned source symbols to parent → analysis re-exposes to parent and descendants → root re-exposes to descendants. ProjectOwnership/ProjectExclusion are signature companions on every step. |
| InventoryRun, InventoryInputs, AnalysisDiagnostic, AnalysisCode, StageExecution, StageId, RunControl | analysis interface wildcard to parent → root named relay to descendants. Existing companions, including SourceLocation/SourceArea/OriginalId, remain exposed. |
| OwnershipBatchInvocation, OwnershipBatchResult, OwnershipBatchOperation | root batch interface wildcard to descendants. ProjectOwnership/PathOwnership/ProjectWarning/AnalysisDiagnostic/StageExecution/RunControl companions use the existing root relays. |
| OwnershipDocument, ownershipDocumentSchema | CLI interface wildcard/type and named schema source exposure to parent. Re-export from CLI package entry. All public signature vocabulary received from root is available to root; exported schema uses a named structural schema interface if inferred third-party types expose project-owned inference helpers. |
| RecoveryEvidence | contexts interface wildcard to parent → add name to daemon N5 context relay to parent and its `context-types.ts` forwarding export → add to root R7 descendant relay. ContextId/GenerationId/RevisionId already travel that path. |
| ServiceError and operation failure additions | root service interface wildcard to descendants; RecoveryEvidence and analysis vocabulary exposed to descendants as companions. |
| withRecoverySmall, RecoverySmallFixture, recoverySmallFiles, recoverySmallPaths | Delivered analysis expose-test to parent → root re-exposes to descendants for iteration 2 root/CLI tests. RecoverySmallFixture, InventoryInputs and AnalysisInputs companions use these declarations and existing analysis/root relays. Wire examples remain owner-local. |

Plain serializable types and an installed CLI decoder do not establish a new
browser runtime API. No model principles, description grammar or source
interpretation changes are part of this package.

## Executable example inventory

CLI owner-local fixtures in `subs/cli/src/tests/recovery-contract-fixtures.ts`
contain answered/invalid/incomplete/unavailable ownership, wrong exit variants,
failure-plus-scope/inputId/paths, ownership-plus-recovery, Check/4 invalidity and
not-checked, CLI/2 invocation and contextual no-report failure, no baseline and
overflow. Frozen Check/3 and CLI/1 JSON witnesses remain separate files.
Daemon-local FR02 fixtures exercise both carrier locations, scalar-details
rejection and current /2 refusal. Analysis-local `recovery-small` builders supply
isolated valid/removed-export/repaired projects for iteration 2. These are
contract/fixture evidence; runtime schema adoption belongs to its later owner.
