# Plan 2A contracts

**Status:** proposed contract review for [Plan 2A](main-plan.md). Names and
numeric candidates are frozen by iteration 1 before production implementation.
All public values are immutable plain data. Compiler and filesystem objects do
not cross owner boundaries or worker/IPC boundaries.

### Revision (iteration 1, 2026-09-15)

All numeric candidates below are now
frozen. Every one is *retained at its original candidate value*: probe
evidence supports each bound with ample headroom and named none of them as
contradicted, so freezing did not require inventing new numbers except where
noted. Raw observations are archived at `scripts/probes/results/plan2a/
{scale-baseline,typescript-detail-feasibility,token-format}.json`; the
detailed justification for each number is in
[iteration1-results.md](iterations/iteration1-results.md#frozen-numeric-limits).
Summary:

| Limit | Frozen value | Evidence |
| --- | ---: | --- |
| `maxSignatureBytes` | 2048 | Real per-kind signatures (function/class/interface/type-alias/variable/enum/default export) measured 19-116 bytes; Unicode JSDoc byte-truncation verified safe at a 40-byte test bound. |
| `maxDocumentationBytes` | 512 | Real first-JSDoc-paragraph samples measured 37-231 bytes, including a 231-byte multibyte (Japanese) paragraph. |
| `maxOverloads` | 8 | The only real overloaded export sampled (`add`) has 2 compiler-ordered call signatures, confirmed via `checker.getSignaturesOfType`; no R/T sample approached 8. |
| `maxResultBytes` (typescript detail batch) | 32 MiB | Not directly exercised (the batch operation does not exist yet); sanity bound: the largest single real module's raw-declaration-span proxy (T's `daemon`, 118,775 bytes ordinary + 130,221 bytes tests) is under 0.4% of this bound. |
| `maxAreaBytes` | 32 MiB | Largest real single-area proxy observed is 130,221 bytes (T's `daemon` test area); ~250x headroom. S100/S500/S1000 have zero exposures (see below) and cannot stress this bound directly — an explicit gap for iteration 5/9's purpose-built boundary fixtures. |
| `maxInvocationBytes` | 256 MiB | **Clarification, not a value change:** main-plan.md's candidate list names only "32 MiB per area" and "256 MiB of staged output per invocation," leaving the query-time invocation bound implicit. This freezes it at the same 256 MiB as the staged-output bound, since both are invocation-scoped and the projection encoding is the same order of magnitude as its rendering. Real whole-project totals: T (11 modules, `--all`) ≈ 1.6 MB combined ordinary+tests proxy bytes; R ≈ 95 KB. |
| `maxStagedBytes` | 256 MiB | Same real totals as above; ~150x headroom for T's whole toolkit. Not stress-tested at the boundary (same gap as `maxAreaBytes`). |
| `deadlineMs` ceiling (`ApiViewRequest`, `MaterializeParams`) | 600,000 ms | **Reused, not new:** this is the *existing* ceiling already enforced for `CheckParams.deadlineMs` (`subs/daemon/src/validation.ts:90`, `params.deadlineMs > 0 && params.deadlineMs <= 600_000`), matching the CLI grammar section's "existing positive deadline ceiling." No new deadline number is introduced. |
| Recovery-artifact bounds | No separate number | `.ramify.tmp-<request-id>`/`.ramify.old-<request-id>` recognition uses the [generated-name predicate](scope.md#generated-output-isolation) plus the existing canonical-nonempty-request-ID rule already stated below; recovered bytes are bounded by the same `maxStagedBytes`. |

S100/S500/S1000's generator (`scripts/probes/fixtures/synthetic-owners.ts`)
declares module tags but no `expose-src` statements, so every cross-module
availability query on them is genuinely zero — a real observation, not a
probe limitation. This means the synthetic scale fixtures validate
*inventory-scale* cost (file/owner/byte counts, batch-analysis latency) but
cannot exercise the area/invocation/staged byte bounds near their boundary;
that remains an explicit gap for whichever purpose-built (`F`) fixtures
iterations 5 and 9 add. A disposable batch `AnalysisSession` over S1000 (1000
owners, 11,000 source files) completed in ~100.7s with zero exposures; this
does **not** hit Plan 5's 96 MiB `maxRetainedFactBytes` refusal because that
limit belongs to `RetainedSession`, not the disposable batch path this probe
used — see the predecessor-refusal note in `scale-baseline.json` and
[iteration1-results.md](iterations/iteration1-results.md#s1000-predecessor-refusal).

## Model provider

Add to `model`:

```ts
export type AvailableForm = 'value' | 'type-only';

export interface AvailableOriginal {
  readonly original: OriginalId;
  readonly form: AvailableForm;
}

export function listAvailableOriginals(
  model: Model,
  consumer: SourceArea,
): readonly AvailableOriginal[];
```

The consumer must be a canonical area from `model.modules`. Unknown areas throw
`TypeError`, as the current decision functions do. The result excludes
same-owner and completely blocked originals, is unique by original identity and
is byte-ordered by owner, file and binding. The internal requirement helper is
shared with `explainImport`; it is not public.

## TypeScript detail provider

Add to the TypeScript vocabulary:

```ts
export interface SymbolDetailLimits {
  readonly maxSignatureBytes: number;
  readonly maxDocumentationBytes: number;
  readonly maxOverloads: number;
  readonly maxResultBytes: number;
}

export interface SymbolDetailRequest {
  readonly original: OriginalId;
  readonly exportName: string;
}

export type SymbolDetail =
  | {
      readonly state: 'described';
      readonly original: OriginalId;
      readonly exportName: string;
      readonly signature: string;
      readonly documentation?: string;
    }
  | {
      readonly state: 'truncated';
      readonly original: OriginalId;
      readonly exportName: string;
      readonly signature: string;
      readonly documentation?: string;
      readonly truncated: readonly ('signature' | 'documentation' | 'overloads')[];
    }
  | {
      readonly state: 'unavailable';
      readonly original: OriginalId;
      readonly exportName: string;
      readonly reason: 'missing-file' | 'missing-export' | 'identity-mismatch'
        | 'unsupported-declaration' | 'compiler-failure';
    };
```

Extend `RetainedSourceAnalysis`:

```ts
details(
  requests: readonly SymbolDetailRequest[],
  limits: SymbolDetailLimits,
  signal?: AbortSignal,
): Promise<readonly SymbolDetail[]>;
```

The adapter returns one result for each unique request in request order. An
invalid request or total encoded result above `maxResultBytes` rejects with the
existing bounded `SourceFailure`; individual string/overload bounds return
`truncated`. A compiler lookup failure isolated to one valid request returns
`unavailable`. Cancellation returns no prefix.

**Frozen (iteration 1)** at their initial candidate values; see the summary
table and evidence links at the top of this document:

```ts
{
  maxSignatureBytes: 2048,
  maxDocumentationBytes: 512,
  maxOverloads: 8,
  maxResultBytes: 32 * 1024 * 1024,
}
```

## Analysis projection

Add to `analysis`:

```ts
export type ApiViewCategory = 'external' | 'children';

export interface ApiViewEntry {
  readonly name: string;
  readonly form: AvailableForm;
  readonly detail: SymbolDetail;
}

export interface ApiViewFile {
  readonly category: ApiViewCategory;
  readonly definingFile: string;
  readonly entries: readonly ApiViewEntry[];
}

export interface ApiViewAreaProjection {
  readonly area: 'ordinary' | 'tests';
  readonly root: string;
  readonly files: readonly ApiViewFile[];
  readonly coverage: number;
  readonly detailsUnavailable: number;
  readonly truncated: number;
}

export interface ApiViewModuleProjection {
  readonly module: string;
  readonly directory: string;
  readonly ordinary: ApiViewAreaProjection | null;
  readonly tests: ApiViewAreaProjection | null;
}
```

**Revision (user decision, 2026-09-15).** `ordinary` is nullable, mirroring
`tests`: it is `null` exactly when the module's ordinary source area
(`<module>/src/`) was absent before projection. Materialization must only
produce output, never change how the project is analyzed, so `materialize`
never creates `src/` or `src/tests/`; a module's ordinary view is produced
only when `<module>/src/` already exists. A selected module with neither area
present projects with both fields `null` and zero targets — `--from` inside
such a module still succeeds with 0 targets, and `--all` silently omits it
from publication (the renderer contributes no target for a `null` area, so a
module with both fields `null` contributes none at all), while the
projection's own `modules` list still names it. This removes the two
analysis-rule workarounds iteration 8 added to hide the resulting generated
writes from observation (`areaPresent` in `subs/analysis/subs/project/src/
inventory.ts` and `isGeneratedOnlyDirectory` in `subs/analysis/subs/project/
src/capture.ts`): with materialization never creating a source area, the
underlying "materialize creates `src/`, which the observer then reports as a
structural change" bug this section originally described cannot occur, so its
narrower workaround is unnecessary and removed. Testing-area presence returns
to exactly the pre-Plan-2A rule: `src/tests` is present iff it is a directory.

```ts
export interface ApiViewProjection {
  readonly schema: 'ramify.api-view-projection/1';
  readonly sequence: number;
  readonly inputId: string;
  readonly modules: readonly ApiViewModuleProjection[];
  readonly bytes: number;
}

export type ApiViewSelection =
  | { readonly scope: 'module'; readonly from: string }
  | { readonly scope: 'all' };

export interface ApiViewQuery {
  readonly sequence: number;
  readonly selection: ApiViewSelection;
  readonly details: SymbolDetailLimits;
  readonly maxAreaBytes: number;
  readonly maxInvocationBytes: number;
}

export type ApiViewQueryOutcome =
  | { readonly status: 'projected'; readonly projection: ApiViewProjection }
  | { readonly status: 'superseded'; readonly sequence: number;
      readonly observedInputId: string }
  | { readonly status: 'unavailable'; readonly reason: 'invalid-revision'
      | 'invalid-location' | 'invalid-projection' | 'resource-limit'
      | 'analysis-failed'; readonly message: string }
  | { readonly status: 'cancelled' };
```

Extend `RetainedSession`:

```ts
apiView(query: ApiViewQuery, control?: RunControl): Promise<ApiViewQueryOutcome>;
```

`bytes` is the encoded projection size used for the invocation bound, not the
eventual Markdown size. The operation accepts only the current valid sequence;
historical and last-valid projection are unsupported. It uses `SessionFacts`
directly and must not call `report()` or acquire another project inventory.

## Context operation

### Revision (iteration 7, 2026-09-15)

`ApiViewRequest`, `ContextApiViewOutcome` and `ContextManager.apiView`'s
signature below are implemented exactly as this section already specified;
no shape changed. Two implementation-level decisions this section left open
are frozen here, since contracts.md is silent on wiring, not because either
corrects a wrong prior shape:

1. **Serialization mechanism.** `ContextManager.apiView` does not run as a
   side call after `check`'s own queue settles; it is a *second kind of
   entry in the same per-context queue* `check` already uses. `queue.ts` adds
   `PendingApiView` beside `PendingCheck` (identical rendezvous fields, a
   `kind` discriminant, its own `resolve`/`ContextApiViewOutcome` typing) and
   a `PendingEntry = PendingCheck | PendingApiView` union; `context.ts`'s
   `LiveContext.queue`/`deliveries`/`requested` hold `PendingEntry`.
   `context-manager.ts`'s `analyze()` collects matching check *and* apiView
   entries into one capture by the same invocation-key/freshness-mode rule,
   and — after that capture publishes its revision (or, for a request the
   existing `covers()` fast path already answers, immediately from the
   current publication) — calls `RetainedSession.apiView` once per apiView
   entry from inside the same `Promise.all` the capture already awaits
   before clearing `context.running`. This is what makes "holds the
   revision slot" concrete: no later `analyze()` cycle for that context can
   start (`kick()` only picks a context with `context.running === null`)
   until every apiView call this capture owns has returned and its outcome
   delivered, so a request queued *before* an update is answered from the
   revision that update publishes, and one queued *after* cannot be handed
   an earlier sequence — enforced doubly, since `RetainedSession.apiView`
   itself also rejects any `sequence` that is not its own current one. The
   expected-content rendezvous (`context.paths`/`context.requested`,
   `namesConfiguration`, the immediate `configuration-changed` answer) and
   the mismatch check are shared verbatim: `mismatch`/`mismatchApiView` both
   now call one `expectationMismatch` helper and only differ in whether the
   built outcome carries `mismatches` (`CheckOutcome`'s `superseded` arm has
   it; `ContextApiViewOutcome`'s does not, exactly as this section already
   specified). `completeEntry` resolves either kind through the one outcome
   shape (`Unavailable` or `cancelled`) every union shares, for the bulk
   eviction/disposal/cancellation paths that do not otherwise care which
   kind an entry is.
2. **Frozen `apiView` bounds at the context layer.** `ApiViewRequest` (per
   this section, unchanged) carries no `SymbolDetailLimits` or
   `maxAreaBytes`/`maxInvocationBytes`: a caller cannot loosen contracts.md's
   frozen iteration-1 bounds per request. `ContextManagerOptions` gains one
   new *optional* field, `apiViewLimits?: ApiViewQueryLimits` (a new type
   this section adds: `{ details: SymbolDetailLimits; maxAreaBytes: number;
   maxInvocationBytes: number }`), defaulting inside `createContextManager`
   to the exact frozen values this document's summary table already lists
   (`maxSignatureBytes: 2048, maxDocumentationBytes: 512, maxOverloads: 8,
   maxResultBytes: 32 MiB, maxAreaBytes: 32 MiB, maxInvocationBytes:
   256 MiB`) when a caller supplies none. Optional, not required, so no
   existing production or harness caller of `createContextManager` needed an
   edit; iteration 8's daemon service supplies the production value (or
   relies on the same default) and a controlled test may pass small tuned
   limits to force `resource-limit` deterministically on a small fixture.

Extend the contexts vocabulary:

```ts
export interface ApiViewRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Extract<Freshness, { readonly mode: 'synchronized' }>;
  readonly selection: ApiViewSelection;
  readonly deadlineMs?: number;
}

export type ContextApiViewOutcome =
  | { readonly status: 'projected'; readonly requestId: string;
      readonly revision: ContextRevision; readonly freshness: FreshnessRecord;
      readonly projection: ApiViewProjection; readonly timings?: ReplyTimings }
  | { readonly status: 'pending' | 'cold'; readonly requestId: string;
      readonly current: ContextStatus }
  | { readonly status: 'deadline-exceeded'; readonly requestId: string;
      readonly revision: ContextRevision | null; readonly elapsedMs: number }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | (Unavailable & { readonly requestId: string });
```

Extend `ContextManager`:

```ts
apiView(
  request: ApiViewRequest,
  lease: LeaseId,
  control?: RunControl,
): Promise<ContextApiViewOutcome>;
```

The method reuses the check scheduler, expected-content rendezvous, deadline,
lease and cancellation rules. It invokes the session query while holding the
same revision slot and releases the ephemeral projection after its caller
returns.

## Renderer and publisher

The daemon owns these types in `interfaces/daemon.ts`:

```ts
export interface ApiViewPublishLimits {
  readonly maxAreaBytes: number;
  readonly maxInvocationBytes: number;
  readonly maxStagedBytes: number;
}

export interface MaterializedTarget {
  readonly module: string;
  readonly area: 'ordinary' | 'tests';
  readonly path: string;
  readonly files: number;
  readonly entries: number;
  readonly bytes: number;
  readonly changed: boolean;
}

export type PublishApiViewOutcome =
  | { readonly status: 'published'; readonly targets: readonly MaterializedTarget[];
      readonly bytesWritten: number }
  | { readonly status: 'cancelled' }
  | { readonly status: 'unavailable'; readonly reason: 'invalid-path'
      | 'symlink' | 'resource-limit' | 'output-failure' | 'rollback-failure';
      readonly message: string };

export interface ApiViewPublisher {
  publish(
    root: string,
    revision: RevisionId,
    projection: ApiViewProjection,
    requestId: string,
    control?: RunControl,
  ): Promise<PublishApiViewOutcome>;
}
```

`createFilesystemApiViewPublisher(limits)` supplies the production adapter and
is injected into `createDaemonService`; controlled publishers supply fault and
ordering tests. Rendering is pure and tested independently. **Frozen
(iteration 1):** `maxAreaBytes: 32 * 1024 * 1024`, `maxInvocationBytes: 256 *
1024 * 1024`, `maxStagedBytes: 256 * 1024 * 1024`; see the summary table and
evidence links at the top of this document.

**Revision (user decision, 2026-09-15).** The publisher never creates
`<module>/src/` or `<module>/src/tests/`: for each target it validates that
the area's own root directory (the final segment of `areaRoot`, the same
ancestor chain the existing symlink check already walks) already exists as an
ordinary directory, refusing the whole publish with `unavailable`/
`invalid-path` when it does not, before any write. This is a defense-in-depth
check at the publisher boundary; in normal operation `analysis`'s nullable
`ApiViewModuleProjection.ordinary`/`tests` already keeps such a target out of
the rendered `RenderedArea[]` (`renderApiView` in `subs/daemon/src/
api-view-documents.ts` contributes no target for a `null` area), so this path
is unreachable through the real `materialize` flow and exists to keep the
publisher correct against any other caller.

## Root service and wire

### Revision (iteration 8, 2026-09-15)

Two implementation-level decisions this section left open are frozen here,
per the coordinator's binding instruction; neither changes a frozen shape
above.

1. **Publication ordering.** `ContextManager.apiView` releases its queue slot
   when the outcome is delivered, *before* the daemon publishes (contracts.md
   already specifies this at "Context operation": "the session query runs
   while that revision's slot is held, its ephemeral projection released once
   this call returns" — that release is `apiView`'s, not the publisher's). Two
   overlapping `materialize` invocations for the same project could otherwise
   call `publisher.publish` out of order. `createDaemonService` holds one
   per-project-root FIFO promise chain (keyed by the context's resolved
   `ContextSelection.root`, from `manager.status(token)`), acquired *before*
   calling `contexts.apiView` and released once `publisher.publish` settles —
   in every case, including cancellation or disconnect, since the whole
   `apiView`+`publish` sequence runs inside the lock regardless of which
   outcome it reaches. Ordinary `check` requests are never blocked by this
   lock; only `materialize` acquires it. A quick direct-service test
   (`I2A-09:*`, `plan2a-service-cases.ts`) exercises the lock indirectly
   through the shared per-context queue; the FIFO chain itself is exercised by
   construction (two same-root `materialize` calls always serialize).
2. **Publisher-reason folding.** `PublishApiViewOutcome`'s `unavailable.reason`
   (`'invalid-path' | 'symlink' | 'resource-limit' | 'output-failure' |
   'rollback-failure'`, "Renderer and publisher") is one layer lower than this
   section's frozen `MaterializeOutcome.reason` union, which has no member
   named `'invalid-path'` or `'resource-limit'`. Implementation folds
   `'invalid-path'` onto `'invalid-location'` and `'resource-limit'` onto the
   existing `'resource-unavailable'` (the same target `UnavailableReason`
   member the session layer's own `'resource-limit'` already folds onto, per
   iteration 7); `'symlink'`, `'output-failure'` and `'rollback-failure'` pass
   through unchanged, since all three already name exact `MaterializeOutcome`
   reason members. No frozen type changed; this fixes an omission the two
   already-frozen enums left implicit.

Add `'materialize'` to `ServiceOperation` and `ServiceCapability`, and add:

```ts
export interface MaterializeParams {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Extract<Freshness, { readonly mode: 'synchronized' }>;
  readonly selection: ApiViewSelection;
  readonly deadlineMs?: number;
}

export type MaterializeOutcome =
  | { readonly status: 'materialized'; readonly requestId: string;
      readonly revision: ContextRevision; readonly freshness: FreshnessRecord;
      readonly targets: readonly MaterializedTarget[];
      readonly bytesWritten: number; readonly timings?: ReplyTimings }
  | { readonly status: 'pending' | 'cold'; readonly requestId: string;
      readonly current: ContextStatus }
  | { readonly status: 'deadline-exceeded'; readonly requestId: string;
      readonly revision: ContextRevision | null; readonly elapsedMs: number }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | { readonly status: 'unavailable'; readonly requestId: string;
      readonly reason: UnavailableReason | 'invalid-location' | 'invalid-projection'
        | 'symlink' | 'output-failure' | 'rollback-failure';
      readonly message: string };

export interface RamifyService {
  materialize(
    params: MaterializeParams,
    control?: RunControl,
  ): Promise<ServiceResult<MaterializeOutcome>>;
}
```

Validation accepts exact fields only, canonical nonempty request IDs, the two
selection shapes and the existing positive deadline ceiling (**frozen,
iteration 1: 600,000 ms**, reused unchanged from `CheckParams.deadlineMs`'s
current bound at `subs/daemon/src/validation.ts:90`). Malformed data is
`invalid-request`; unsupported peers return `unsupported-operation`. The
projection stays inside the daemon process. IPC carries only `MaterializeParams`
and `MaterializeOutcome`, whose targets are bounded by two per inventory module.

## CLI grammar and exits

```text
ramify materialize [--from <path>] [--all] [--root <dir>]
```

- `--from` is resolved relative to the CLI working directory; absence uses that
  directory.
- `--all` and `--from` together are invalid. Duplicate flags and empty values
  are invalid.
- There is no `--batch`, `--changed`, `--format` or implicit fallback.
- The client opens the ordinary whole-project context with the existing default
  registry/capabilities, sends synchronized freshness with an empty expectation,
  retries once after an expired generation using existing recovery rules, and
  always releases context, connection and owned daemon resources.
- Exit 0 means every requested target is complete. Exit 1 means the project is
  invalid. Exit 2 means unavailable, partial/rollback failure, deadline,
  supersession or incompatible service. Exit 130 means interrupted.

Human success output names the revision, target count, entry count, bytes written
and unchanged-target count. Failure output names the stable reason and states
that no complete refresh was claimed.

## Failure and preservation table

| Condition | Result | Existing view |
| --- | --- | --- |
| Valid revision; isolated symbol detail fails | Materialize with `[details-unavailable]` and count | Replaced completely |
| Per-entry detail bound | Materialize with `[truncated]` and count | Replaced completely |
| Area/invocation/worker/deadline bound | Unavailable | Preserved |
| Invalid analysis/model/location/path | Invalid or unavailable | Preserved |
| Revision/input changes during query | Superseded | Preserved |
| Symlink in target traversal or contents | Unavailable `symlink` | Preserved |
| Cancellation before switch | Cancelled | Preserved |
| Cancellation/failure during switches | Roll back; never success | Restored or explicit rollback failure |
| Identical complete bytes | Materialized, zero writes | Untouched, mtimes equal |

## Compatibility

Protocol remains `ramify.ipc/1`; capability negotiation prevents an old daemon
from receiving the operation. Package entry points remain the existing eight.
The added public TypeScript types travel through `ramify.ts/analysis` and
`ramify.ts/client`; no new package entry, MCP dependency or browser promise is
introduced.
