# Evidence during invalid analysis: implementation plan

**Date:** 2026-10-12. **Status:** Complete: implemented, locally qualified and passed the [committed candidate audit](audit-receipt.md). See the [completion receipt](completion-report.md) and [published 0.5.0 release](release-receipt.md).

Implement the [recovery specification](../../architecture/analysis-failure-recovery.spec.md)
as seven ordered iterations. The specification remains the behavioral contract;
this plan defines implementation, migration and acceptance. Its proposed
contracts were reviewed before execution. The [completion receipt](completion-report.md)
records the candidate evidence and remaining audit boundary.

## User workflow and completion boundary

A caller makes a coordinated edit that temporarily breaks export linking.
`ramify ownership --root <project> --path <path> --format json` still answers
current ownership when acquisition succeeds. Full analysis reports the actual
invalid input, retaining diagnostic identities, locations and available stages.
A resident changed check also identifies the last completed analysis and the
paths observed since it. The caller repairs the project and obtains a completed
analysis without resetting the process or restoring source.

Completion requires that workflow through the built CLI, every case in the
[acceptance matrix](acceptance.md), bounded resident retention, strict schema
and compatibility witnesses, and a consumer handoff. It includes an isolated
package smoke test. Registry publication and changes to consumer repositories
are separate work; no particular package release number is reserved here.

## Planning baseline and gaps

Source inspected at `6161e76dcd22e45213a59e19950762750ca03e60`, package version
`0.4.3`. The specification and its architecture-index entry were already local
edits. No predecessor test results were rerun during planning. The generated
architect view and built launcher were absent; the source leads supplied by the
specification were used to inspect the implementation.

| Existing implementation | Work required |
| --- | --- |
| [Inventory acquisition](../../../subs/analysis/src/inventory.ts) already captures and seals a configuration-only inventory, parses declarations, derives profiles and disposes its input view. `InventoryRun` distinguishes completed, invalid, incomplete, unavailable and cancelled. | Retain the canonical root when failure occurs after root selection. Its current failure variants contain only diagnostics. Expose available stages only where produced. |
| [Path classification](../../../subs/analysis/subs/project/src/ownership.ts) already uses `ProjectScope.ownership`, handles nonexistent paths and distinguishes owned exclusions from unowned ones. | Reuse it and the existing table validation; add no ownership algorithm. |
| [Batch assembly](../../../src/batch.ts) supplies full check and affected operations. Affected opens a retained analysis session and several refusals take only `diagnostics[0].message`. | Add independent ownership assembly and preserve structured failure evidence in existing operations. |
| [Affected CLI](../../../subs/cli/src/affected-command.ts) emits `ramify.cli/1` refusals with a synthetic execution diagnostic. [CLI errors](../../../subs/cli/src/errors.ts) retain service errors as causes. | Forward the complete bounded evidence and underlying execution reason through every failure adapter and formatter. |
| [Contexts](../../../subs/daemon/subs/contexts/src/context-manager.ts) records `lastValid` on every completed analysis, including a failed check, and holds queued paths and revision history. | Add accumulation across invalid revisions and unsuccessful updates, separately from the work queue, with publication-safe reset and byte accounting. |
| [CLI contracts](../../../subs/cli/src/interfaces/cli.ts) use `ramify.check/3`; [service contracts](../../../src/interfaces/service.ts) and transport use `ramify.ipc/2`. | Add versioned carriers, strict decoding and an explicit incompatible-peer outcome. |

These capabilities, rather than a predecessor plan number, are prerequisites.
Preserve existing ownership rules, check verdicts, lifecycle retries and
generated-view publication guarantees throughout.

## Contract and ownership decisions

The following owner decisions were adopted in [iteration 1](iterations/iteration1-results.md)
and are specified in the [contract package](contracts.md). The specification's
decisions, including fresh batch ownership, were fixed inputs.

| Responsibility | Owner and consumer access |
| --- | --- |
| Acquire inventory and preserve acquisition failure evidence | `analysis`, composing `analysis/project` and existing declaration/configuration owners. Root receives acquisition and classification through existing exposure relationships; do not bypass a module declaration. |
| Assemble ownership | Root, in the batch operation contracts and assembly. CLI receives an injected ownership operation, as it receives the affected batch operation. No service operation or daemon capability is added. |
| Ownership document and validation | `cli`, exposed as `OwnershipDocument` and `ownershipDocumentSchema` through `ramify.ts/cli`. Reuse `ProjectOwnership`, `PathOwnership`, `ProjectWarning`, `AnalysisDiagnostic` and `StageExecution`; expose the needed vocabulary and signature companions through the existing owners. Reuse the existing ownership-table validator by exposure or delegation, not by copying it. |
| Historical evidence | `daemon/contexts` owns one `RecoveryEvidence` type and its retention semantics. Daemon re-exposes it through its existing context types; service and CLI receive that type. No new module. |
| Service envelope | Root's service contract carries typed diagnostics, stages and recovery outside scalar `error.details`; daemon implements transport validation. |
| CLI formatting | `cli` owns ownership arguments, human presentation, changed-check output and generic failure output. Root wires both installed launcher paths. |

All new document types are plain serializable data. This plan makes no new
browser-runtime promise and introduces no web or MCP feature.

### Ownership

Use precisely the specification's `ramify.ownership/1` union: `answered` at
exit 0; `invalid` at exit 1; `incomplete` and `unavailable` at exit 2.
Answered documents project `scope.configuration` and `scope.ownership` and
include acquisition `inputId`, warnings and distinct path answers in first-request
order. Omitted paths mean `.`. No `walkedAreas`, `selection` or `invokedFrom`
is serialized. Failure documents have diagnostics, root or null, and available
stages, but no scope, input identity or path answers. Cancellation remains exit
130 without an ownership answer. Malformed arguments fail before acquisition
with the generic invocation envelope; outside-project and excluded paths answer
successfully. Keep configuration discovery and canonicalization in their current
owners. Do not infer a canonical root from diagnostic message text.

### Recovery and failure carriers

The recovery schema is `ramify.recovery/1`. Its reviewed concrete field types are:

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

Use existing identity types and normalized project-relative paths, sorted by
UTF-8 byte order and deduplicated. An established context without a completed
baseline has `lastCompleted: null`, unavailable coverage and an explicit reason.
Observed retained paths may coexist with a non-null gap reason; `observed`
never promises a complete filesystem diff. Iteration 1 records deterministic
wording/composition for multiple gap reasons, including no baseline, watcher
loss, overflow, restart and eviction. No reason is inferred from message text.

Emit `ramify.check/4` with optional recovery and available stages for invalid,
incomplete, unavailable and other not-checked outcomes when context evidence
exists. Preserve findings, execution, coverage and path dispositions. Emit
`ramify.cli/2` with its existing unavailable status and diagnostic/exit semantics,
plus optional recovery and stages. Preserve execution reason codes alongside
analysis evidence, including failures without reports and formatting failures.

The negotiated protocol is `ramify.ipc/3`, qualified in
[iteration 5](iterations/iteration5-results.md). Forward `value.recovery` on operation outcomes and `error.recovery`
on service failures. Prefer explicit incompatibility with `/2` peers over a
second compatibility implementation; no silent downgrade or field stripping.
Old `/3` check and `/1` CLI fixtures remain unchanged. The release candidate
always emits the new CLI versions; migration is explicit, not opt-in fields on
old schemas. `ramify.analysis/3`, successful affected documents and ownership
receive no recovery field. Do not expand watch/status schemas incidentally.

### Retention

Accumulate observations from the last completed publication through failed
captures, invalid revisions and unsuccessful update attempts. Include observed
creation, deletion, both rename names and edit-then-restore. Reset only through
the sequence boundary of a new completed publication; events queued after that
boundary survive. A completed analysis with ordinary violations becomes the
baseline. An invalid report never does.

Charge accumulation against the existing queued-path and retained-byte budgets,
including global accounting and any retained response copies. Overflow bounds
the list and records a gap; reconciliation cannot retroactively fill lost
history. Context loss removes the baseline. Releasing historical report/session
objects need not erase a still-live context's compact baseline identity. Do not
retain a compiler session or source snapshot for recovery.

## Iterations

All iterations are sequential. They touch shared contracts and fixtures; no
parallel execution is declared. Each is bounded to one capability and one
250k-token context. The [manifest](iterations/manifest.json) is the execution
order; the final iteration's exit is the plan gate.

| Iteration | Deliverable | Depends on |
| --- | --- | --- |
| [1](iterations/iteration1.md) | Reviewed contract examples, owner exposures and acceptance fixtures | Existing acquisition, classification and resident contexts |
| [2](iterations/iteration2.md) | Fresh batch ownership through the CLI and public decoder | 1 |
| [3](iterations/iteration3.md) | Structured current failure evidence through analysis and assembly | 2 |
| [4](iterations/iteration4.md) | Bounded recovery evidence owned by contexts | 3 |
| [5](iterations/iteration5.md) | Negotiated service/IPC carriers and strict decoding | 4 |
| [6](iterations/iteration6.md) | CLI failure presentation and complete forward-repair workflow | 5 |
| [7](iterations/iteration7.md) | Process witnesses, measurements, regression and package handoff | 6 |

## Verification and resource acceptance

The [acceptance matrix](acceptance.md) gives fixtures, independent outcomes and
the responsible iteration. Follow [toolkit testing](../../development/testing.md)
and [quick-test boundaries](../../architecture/quick-testing.spec.md): real
acquisition and analysis through direct adapters first, then actual transport
and process witnesses. A simulated response does not establish CLI packaging
or socket compatibility. Every resident process test owns `RAMIFY_ENDPOINT_DIR`,
stops its daemon in `finally` and fails on surviving processes.

Reuse [dispatch budgets](../../../src/resident-budgets.ts): 10,000 queued paths,
96 MiB retained per context, 512 MiB globally, eight contexts and eight retained
revisions. Acquisition retains its three-attempt maximum and 30,000 ms deadline.
Do not increase limits to pass the new tests. Exercise smaller injected limits
for exact overflow assertions. All added retained bytes must be accounted for;
after context disposal, recovery-attributable retained state is zero.

Measure ownership and `affected --batch` on identical valid inputs for a small
fixture, the toolkit, the reference project and a synthetic 100-owner project:
one warm-up plus ten measured invocations per command, alternating order on a
quiet host. Record median, p95, peak memory, exit, identity and host/build data.
Report the ratio; latency is evidence, not a speculative speed threshold.
The blocking structural criteria are zero catalog/link/import/dependency stages
and zero daemon starts for ownership. Invalid-input runs separately prove that
ownership remains available when affected cannot answer.

Measure 1,000 invalid revisions over a fixed set of 32 changed paths, followed
by enough distinct changes to exceed 10,000 and by completed repair/disposal.
Assert bounded identity/path retention, configured byte limits, explicit overflow
and no historical compiler retention. Archive raw measurements and their limits
under this plan's `evidence/` during implementation.

The final gate includes build, type checks, owner and integration tests,
`check:self`, `check:reference`, reference-harness validation and an isolated
package import/CLI smoke. Record an applicable configured audit from a clean
committed candidate when executing the qualification workflow; a release audit
uses `--full` under the toolkit's release rule. Publication is outside this plan.

## Handoff and deferrals

The completion report records every acceptance ID, exact commands and build
identity, raw evidence, remaining limits, schema/IPC versions, and package
entry exports. The consumer handoff explains table-validator reuse, ownership
versus full-analysis identities, new failure unions, exit codes and recovery
omission versus unavailable history. Consumers qualify an exact released pin
in their own projects; this plan does not modify those projects.

Deferred: resident ownership, caches, tolerant parsing, partial dependency
graphs, rollback, snapshots, durable history across restarts, cause ranking,
automatic repair/coordinated editing, new retry policies and consumer adoption.
If a provider defect blocks a case, fix it in the named owning iteration and
record the expanded scope; do not weaken acceptance or invent a second model.

## Planning validation

Normal plan files were authored directly because Studio planning tools and the
configured global Studio installation were unavailable. Local validation passed
for both JSON files, seven ordered iteration briefs with every required section,
27 unique acceptance IDs and 57 relative links. Whitespace checks passed.
Installed Studio schema validation remains an execution prerequisite when using
Studio. No runtime acceptance, implementation test or release qualification is
claimed by this planning work.
