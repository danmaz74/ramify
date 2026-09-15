# Affected-module contracts

**Status:** proposed for [Plan 7](main-plan.md). Extend the completed Plan 5
contracts in place; preserve their unrelated methods and lifecycle guarantees.

## Analysis API

New analysis-owned `subs/analysis/src/interfaces/affected.ts` uses the existing
neutral `ProjectScope` and `SourceLimit` vocabulary:

```ts
export interface AffectedQuery {
  readonly modules: readonly string[]; // exact inventory IDs, not paths
}
export interface AffectedModule {
  readonly id: string;
  readonly directory: string; // project-relative; '.' for root
}
export interface AffectedSelection {
  readonly schemaVersion: 'ramify.affected/1';
  readonly changedModules: readonly AffectedModule[];
  readonly affectedModules: readonly AffectedModule[]; // excludes seeds
  readonly testModules: readonly AffectedModule[];
  readonly selection: 'dependency-closure' | 'all-modules';
  readonly scope: ProjectScope;
  readonly coverage: {
    readonly status: 'complete' | 'partial';
    readonly notes: readonly SourceLimit[];
  };
  readonly analysisCheck: 'passed' | 'failed'; // existing verdict, not a test run
}
export type AffectedUnavailableReason =
  | 'invalid-query' | 'unknown-module' | 'invalid-current' | 'missing-facts'
  | 'superseded' | 'resource-limit' | 'deadline-exceeded';
export type SessionAffectedOutcome =
  | { readonly status: 'answered'; readonly sequence: number;
      readonly inputId: string; readonly result: AffectedSelection }
  | { readonly status: 'unavailable'; readonly reason: AffectedUnavailableReason;
      readonly message: string; readonly unknownModules: readonly string[] }
  | { readonly status: 'cancelled' };
```

Add this method to Plan 5's `RetainedSession`, using its existing `RunControl`:

```ts
affected(query: AffectedQuery, sequence: number,
  control?: RunControl): Promise<SessionAffectedOutcome>;
```

A sequence other than the current one returns `superseded`; there is no graph
history. A malformed query is `invalid-query` at this direct boundary. Unknown
IDs return the complete unknown set, deduplicated and sorted, and no selection.
Normalize duplicate valid seeds; sort all module lists by UTF-8 byte order of
canonical ID. Empty seeds return empty arrays, `dependency-closure`, and current
scope/coverage after readiness and sequence checks. An empty request does not
hide invalid input or missing facts. Plain immutable outputs contain no Maps,
compiler handles, worker objects or mutable references into the fact store.

## Coherent fact view and readiness

Implement private `src/affected-query.ts` beside `session-facts.ts` inside
analysis. A worker-local read view references the committed revision's inventory,
per-file accesses, per-file descriptions, coverage, sequence/input ID and
readiness. Reuse these objects and existing file ownership lookup; do not copy
all facts or export a private store through the public API.

Require a valid inventory/model and completed source catalog, access
interpretation and decision stages for the session's supported check
capabilities. An unrequested, blocked, incomplete or unavailable prerequisite
is `missing-facts`; invalid configuration/declarations/current input is
`invalid-current`. A completed check with denied imports can answer and reports
`analysisCheck: 'failed'`. Source coverage notes make coverage partial, not
unavailable. Preserve note identities, locations and stable report ordering.

Plan 5's public `SessionRevision` does not expose stage execution records.
Verify readiness from retained pipeline state; if necessary add a small private
readiness record at existing publication sites in iteration 2. Do not call
`report()` just to determine readiness, and do not add new dependency data.
A failed/unpublished update or outstanding invalidation must prevent the older
facts from masquerading as the requested current inputs. Context scheduling
retains Plan 5's published-versus-synchronized distinction.

## Projection and traversal

For each retained `SourceAccess`, take its importer owner's ID as consumer:

- Add its resolved application target owner's ID as provider, including a
  symbol-free occurrence with no selections.
- Add each known selected original's `original.owner` and each recorded
  `forwarding` origin's owner. `OriginalId` already contains owner; a second
  original-to-owner index is unnecessary. Include known targets even when
  a selection is missing/unresolved, and preserve the associated coverage.
- Include every supported access form regardless of runtime elision, test
  area or importability verdict. External targets create no module node;
  outside-module/unresolved targets retain their coverage outcomes.
- For each retained file/resource description, add its owner's dependency
  on each owned path in `dependencies.shims`, resolved through inventory
  ownership. Unowned external shims create no invented module. Do not copy
  `dependencies.files`, resource contributor backlinks or resolution probes.

Check referenced owned IDs against that revision's inventory; an impossible
missing owner is `missing-facts`, not a dropped edge. Drop self-edges and
insert all other pairs into `Map<providerId, Set<consumerId>>`. Deduplicate
across occurrences naturally. No per-file contribution lists or counts are
needed because there is no graph to update later.

Seed one iterative BFS/DFS with all requested modules. Visit each reached
module once, traverse its consumers, then create the three sorted lists.
Propagation crosses the whole intermediate module: B/file1 importing C and
A importing B/file2 still yields A and B when C changes. Never prune using
Plan 5's checked set, revision delta, description equality or selected symbols.

For nonempty seeds, complete coverage uses the reached set as `testModules`.
Partial coverage keeps the known `affectedModules`, sets `selection` to
`all-modules`, and includes every inventoried module in `testModules`.
This fallback remains limited to the returned scope. It cannot discover
excluded tests, independent projects or unobserved runtime dependencies.

Cost is O(A + S + F + H + M + E) plus O(M log M) output ordering: access records,
selection/forwarding entries, descriptions, explicit shim references, modules
and unique edges. Temporary adjacency is O(M + E), plus traversal/output
storage. The entire fact scan is expected even for a small affected set.

## Worker execution and resource lifecycle

Extend Plan 5's request-ID worker protocol with `affected(query, sequence)`
and `SessionAffectedOutcome`. Serialize the operation with session mutations;
verify the sequence again when its turn begins. Yield to cancellation/deadline
messages while keeping the mutation queue blocked until this read completes.
A yielded query must not observe half of two revisions. Disposal cancels the
operation and waits for its cleanup.

Only one graph build is active per worker; queued requests use Plan 5's existing
queue admission limits. Check cancellation/deadline at least every 1,024
examined records, selections, forwarding entries, shim references, edge
insertions or traversal steps, including one oversized occurrence. Bound final
sorting by the module limit. The worker has a 1,000 ms active-query budget;
service queue/startup/synchronization time counts against the caller deadline.
The stricter elapsed/cancellation condition wins. No truncated closure is a
success. Limits and measurement gates are in [acceptance.md](acceptance.md).

Release adjacency, traversal and request references in `finally` on every path.
There is no graph cache, history, persistent contribution bookkeeping, edge
audit or revision-update maintenance. Retained input facts remain Plan 5's
responsibility; its normal audit/correction path continues unchanged.

A ready query makes zero compiler calls, source filesystem reads, `report()`
projections or new analysis sessions. A published read also works after
`releaseCompiler()` while the warm worker holds ready facts. Cold opening,
a required sweep or synchronization can use Plan 5's ordinary compiler work;
measure that separately. Only the compact bounded answer crosses the worker.

## Context and service contracts

Add neutral types to contexts' `src/interfaces/contexts.ts`, using the existing
context, freshness and analysis vocabulary through its exposure channels:

```ts
export interface AffectedRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Freshness;
  readonly query: AffectedQuery;
  readonly deadlineMs?: number;
}
export type AffectedOutcome =
  | { readonly status: 'answered'; readonly requestId: string;
      readonly revision: ContextRevision; readonly freshness: FreshnessRecord;
      readonly result: AffectedSelection }
  | { readonly status: 'not-answered'; readonly requestId: string;
      readonly revision: ContextRevision | null;
      readonly reason: AffectedUnavailableReason | UnavailableReason
        | 'pending' | 'cold' | 'historical-query-unsupported';
      readonly unknownModules: readonly string[]; readonly message: string }
  | { readonly status: 'cancelled'; readonly requestId: string };
```

`ContextManager.affected(request, lease, control?)` returns
`Promise<AffectedOutcome>`. Use the same covering-revision scheduler and leases
as Plan 5's check. Invoke the session method at that sequence; validate the
returned sequence and input ID against the covering `ContextRevision` before
answering. On mismatch return `superseded`, never relabel the response.

| Request/state | Required behavior |
| --- | --- |
| Published, current ready revision | Answer from those facts; no disk freshness claim. |
| Published, explicit current revision ID | Answer if still current when executed. |
| Published, older revision ID | `historical-query-unsupported`, even if a historical report exists. |
| Published, pending/cold, wait false | Explicit `pending`/`cold`; no empty result. |
| Published, pending/cold, wait true | Use normal Plan 5 readiness/opening with caller deadline. |
| Synchronized | Use expected-content rendezvous, queued writes, required sweeps and supersession from Plan 5. |
| Invalid current input after last valid | Explicit unavailable; never answer from `lastValid`. |
| Disposed/expired generation, resource pressure or disconnect | Existing explicit lifecycle outcome and lease cleanup. |

Already-covered expected identities need no compiler work. Otherwise Plan 5
flushes/debounces/updates as its contract requires. Empty `expect` alone is not
evidence that an unobserved saved edit is analyzed. Module IDs select seeds;
they are never interpreted as file identities.

Root's `ServiceOperation` and `ServiceCapability` gain `affected`. Its service
interface, daemon dispatch and lightweight connection gain:

```ts
affected(params: AffectedRequest,
  control?: RunControl): Promise<ServiceResult<AffectedOutcome>>;
```

Keep the same operation in direct and IPC bindings. Validate exact object
fields, nonempty string IDs, supported freshness, request/response byte bounds,
context generation, and finite positive integer deadlines under Plan 5's
600,000 ms cap. Use Plan 5's default request deadline when omitted. Malformed
wire data is `invalid-request`; unknown valid IDs are a domain outcome.
Unsupported peers produce a capability error. No client falls back to batch.

## CLI

```text
ramify affected <module-id>... [--root <dir>] [--changed <path>...]
                [--deadline <ms>] [--format human|json]
```

Reuse resident root selection, connector, signal handling and cleanup. Require
at least one module ID. Default to `{ mode: 'published', wait: true }`.
`--changed` uses Plan 5's saved-content hashing/deletion helpers and synchronized
freshness; it never infers module seeds. Reject `--batch` and `--since`.

Human output lists test targets with changed/dependent labels, input revision,
scope and coverage notes. JSON emits one `AffectedOutcome` envelope; an answered
`result` contains `ramify.affected/1`. Pre-context invocation/service errors keep
the existing CLI error schema. Complete answered queries exit 0, partial or
not-answered results exit 2, cancellation exits 130. Existing importability
failure is preserved in `analysisCheck` without claiming tests ran or passed.

## MCP

Register `ramify_affected_modules` on Plan 4's stdio provider:

```ts
{
  root: string; // explicit project selection using Plan 4 rules
  modules: readonly string[];
  expectedContent?: readonly { path: string; sha256: string | null }[];
  deadlineMs?: number;
}
```

Use the host's context lifecycle and injected daemon client. Without
`expectedContent`, use published freshness with wait true; otherwise use
synchronized freshness. Return the same structured `AffectedOutcome` and
bounded explanatory text. Partial/not-answered results must be clearly marked;
map SDK tool errors, protocol validation and cancellation through Plan 4's
reviewed contract. Advertise support only when the service supports `affected`.

MCP never shells out to CLI or loads a compiler/report to compute impact.
Preserve protocol-only stdout, cancellation and per-host lease cleanup. Do not
create an independent MCP server in this plan. The provider handoff must include
its actual SDK schema and stdio harness before iteration 5 starts.

## Consumer access

[owners.md](owners.md) gives exact manifest deltas, package exports, README
purpose additions and owned test placement. No new browser promise, production
owner, package subpath or model-principles change is part of this plan.
