# Plan 2B contracts

**Status:** proposed contract review for [Plan 2B](main-plan.md). Iteration 1
verifies every name against Plan 2A's completed source and freezes the numeric
limits. All public values are immutable plain data. Compiler and filesystem
objects do not cross owner, worker or IPC boundaries.

## Reserved outputs

In `analysis/project`, replacing the single-name rule behind
`isRamifyGeneratedPath` while keeping that exported name and its relays:

```ts
export type ViewId = 'api' | 'exported-symbols' | 'module-docs';

export type ReservedOutput =
  | { readonly view: ViewId; readonly kind: 'area-segment'; readonly name: string }
  | { readonly view: ViewId; readonly kind: 'root-path'; readonly path: string };

export const reservedOutputs: readonly ReservedOutput[];

/** True for a project-relative path that is, or lies beneath, a reserved
 * output or one of its transient forms. */
export function isRamifyGeneratedPath(path: string): boolean;
```

`ViewId` lives in `analysis/project` because the reservation table must be
known before any view code loads. `analysis/views` and consumers reuse it.

## Test-hierarchy provider

In `analysis/typescript`:

```ts
export interface TestNode {
  readonly kind: 'suite' | 'case' | 'feature' | 'rule' | 'background'
    | 'scenario' | 'scenario-outline';
  readonly call: string;          // e.g. 'describe', 'it.skip', 'test.each', 'Scenario'
  readonly title: string;         // verbatim, or '<dynamic: ...>'
  readonly line: number;
  readonly description?: string;
  readonly children: readonly TestNode[];
}

export interface TestFileHierarchy {
  readonly file: string;
  readonly state: 'described' | 'truncated' | 'unavailable';
  readonly nodes: readonly TestNode[];
  readonly reason?: 'missing-file' | 'parse-failure' | 'unsupported-file';
}

export interface TestHierarchyLimits {
  readonly maxTitleBytes: number;         // candidate 512
  readonly maxDynamicBytes: number;       // candidate 120
  readonly maxDescriptionBytes: number;   // candidate 512
  readonly maxNodesPerFile: number;       // candidate 4096
  readonly maxResultBytes: number;        // candidate 32 MiB
}

export function describeTestHierarchy(
  project: Project,
  files: readonly string[],
  limits: TestHierarchyLimits,
  signal?: AbortSignal,
): readonly TestFileHierarchy[];
```

`RetainedSourceAnalysis` gains:

```ts
tests(files: readonly string[], limits: TestHierarchyLimits,
  signal?: AbortSignal): Promise<readonly TestFileHierarchy[]>;
```

TypeScript and JavaScript files use the compiler's syntax tree only; no checker
query is required. `.feature` files are read from the retained captured input
content through the same adapter, so no filesystem read bypasses input identity.
A per-file bound yields `truncated`; a total-result bound or cancellation
rejects with the existing `SourceFailure` and returns no prefix.

## Views

In the new `analysis/views` owner:

```ts
export interface GeneratedFile { readonly kind: 'file'; readonly path: string; readonly bytes: Uint8Array }
export interface GeneratedSymlink { readonly kind: 'symlink'; readonly path: string; readonly target: string }
export type GeneratedEntry = GeneratedFile | GeneratedSymlink;

export interface GeneratedTarget {
  readonly view: ViewId;
  readonly module: string | null;         // null for project views
  readonly area: 'ordinary' | 'tests' | null;
  readonly directory: string;             // project-relative target directory
  readonly entries: readonly GeneratedEntry[];  // paths relative to directory
  readonly entryCount: number;            // view-defined logical entries, for summaries
}

export interface ViewProviders {
  availability(consumer: SourceArea): readonly AvailableOriginal[];
  details(requests: readonly SymbolDetailRequest[]): Promise<readonly SymbolDetail[]>;
  tests(files: readonly string[]): Promise<readonly TestFileHierarchy[]>;
}

export interface ViewFacts {
  readonly revision: string;
  readonly inventory: ProjectInventory;
  readonly model: Model;
  readonly catalog: SourceCatalog;
  readonly areas: readonly SourceArea[];
}

export type ViewSelection =
  | { readonly scope: 'module'; readonly from: string }
  | { readonly scope: 'all' };

export interface ViewLimits {
  readonly maxAreaBytes: number;
  readonly maxInvocationBytes: number;
}

export type ViewOutcome =
  | { readonly status: 'projected'; readonly targets: readonly GeneratedTarget[]; readonly bytes: number }
  | { readonly status: 'unavailable'; readonly reason: 'invalid-location' | 'invalid-projection'
      | 'resource-limit' | 'analysis-failed'; readonly message: string };

export interface ViewDefinition {
  readonly id: ViewId;
  readonly scope: 'module-area' | 'project';
  project(facts: ViewFacts, providers: ViewProviders, selection: ViewSelection,
    limits: ViewLimits, signal?: AbortSignal): Promise<ViewOutcome>;
}

export const viewRegistry: readonly ViewDefinition[];   // byte-ordered by id

export function projectViews(ids: readonly ViewId[], facts: ViewFacts,
  providers: ViewProviders, selection: ViewSelection, limits: ViewLimits,
  signal?: AbortSignal): Promise<ViewOutcome>;
```

`projectViews` rejects unknown or duplicate identifiers with
`invalid-projection`, runs views in registry order, validates every target and
entry path as canonical and beneath its target, and enforces `maxInvocationBytes`
over the sum of entry bytes plus symlink target bytes.

The API view's projection and renderer move into this owner unchanged in
behavior. Plan 2A's `ApiView*` projection types stay exported for its existing
tests and relays until iteration 9 removes unused relays.

## Session query

`RetainedSession.apiView` is replaced by:

```ts
export interface MaterializeQuery {
  readonly sequence: number;
  readonly views: readonly ViewId[];
  readonly selection: ViewSelection;
  readonly details: SymbolDetailLimits;
  readonly tests: TestHierarchyLimits;
  readonly limits: ViewLimits;
}

export type MaterializeQueryOutcome =
  | { readonly status: 'projected'; readonly sequence: number; readonly inputId: string;
      readonly targets: readonly GeneratedTarget[]; readonly bytes: number }
  | { readonly status: 'superseded'; readonly sequence: number }
  | { readonly status: 'unavailable'; readonly reason: 'invalid-revision' | 'invalid-location'
      | 'invalid-projection' | 'resource-limit' | 'analysis-failed'; readonly message: string }
  | { readonly status: 'cancelled' };

materialize(query: MaterializeQuery, control?: RunControl): Promise<MaterializeQueryOutcome>;
```

The query accepts only the current valid sequence, never calls `report()`,
never acquires inventory, never promotes observed inputs and retains nothing.

## Context operation

`ContextManager.apiView` and its queue entry are removed. Contexts adds:

```ts
export interface MaterializeRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Extract<Freshness, { readonly mode: 'synchronized' }>;
  readonly views: readonly ViewId[];
  readonly selection: ViewSelection;
  readonly deadlineMs?: number;
}

export type ContextMaterializeOutcome =
  | { readonly status: 'projected'; readonly requestId: string; readonly revision: ContextRevision;
      readonly freshness: FreshnessRecord; readonly targets: readonly GeneratedTarget[];
      readonly timings?: ReplyTimings }
  | { readonly status: 'pending' | 'cold'; readonly requestId: string; readonly current: ContextStatus }
  | { readonly status: 'deadline-exceeded'; readonly requestId: string;
      readonly revision: ContextRevision | null; readonly elapsedMs: number }
  | { readonly status: 'superseded'; readonly requestId: string; readonly revision: ContextRevision | null }
  | { readonly status: 'cancelled'; readonly requestId: string }
  | (Unavailable & { readonly requestId: string });

materialize(request: MaterializeRequest, lease: LeaseId,
  control?: RunControl): Promise<ContextMaterializeOutcome>;
```

The method performs the ordinary `check` with the same token, freshness and
deadline, without changing the check path, then calls the session query at the
check's revision sequence. A `superseded` session result is retried once
against a new synchronized check within the same deadline; a second supersession
returns `superseded`.

## Publisher

In `daemon`, replacing the API-view publisher:

```ts
export interface OutputPublishLimits {
  readonly maxAreaBytes: number;
  readonly maxInvocationBytes: number;
  readonly maxStagedBytes: number;
}

export interface MaterializedTarget {
  readonly view: ViewId;
  readonly module: string | null;
  readonly area: 'ordinary' | 'tests' | null;
  readonly path: string;
  readonly files: number;
  readonly symlinks: number;
  readonly entries: number;
  readonly bytes: number;
  readonly changed: boolean;
}

export type PublishOutputOutcome =
  | { readonly status: 'published'; readonly targets: readonly MaterializedTarget[];
      readonly bytesWritten: number }
  | { readonly status: 'cancelled' }
  | { readonly status: 'unavailable'; readonly reason: 'invalid-path' | 'symlink'
      | 'resource-limit' | 'output-failure' | 'rollback-failure'; readonly message: string };

export interface OutputPublisher {
  publish(root: string, revision: RevisionId, targets: readonly GeneratedTarget[],
    requestId: string, control?: RunControl): Promise<PublishOutputOutcome>;
}

export function createFilesystemOutputPublisher(limits: OutputPublishLimits): OutputPublisher;
```

`MaterializedTarget` gains `view` and `symlinks` and allows a null module and
area. Plan 2A consumers that read only its existing fields keep working.
Revision metadata is rendered by each view, so the publisher no longer inserts
it.

## Root service and wire

`MaterializeParams` gains an optional `views` field:

```ts
export interface MaterializeParams {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Extract<Freshness, { readonly mode: 'synchronized' }>;
  readonly views?: readonly ViewId[];      // absent: every registered view
  readonly selection: ViewSelection;
  readonly deadlineMs?: number;
}
```

`MaterializeOutcome` keeps its Plan 2A shape; its targets carry the extended
`MaterializedTarget`. The daemon advertises capability `materialize-views`.
A client sending `views` to a peer without that capability receives
`unsupported-operation` before sending. IPC targets are bounded by two per
module plus one per project view.

## CLI grammar and exits

```text
ramify materialize [--view <id>]... [--from <path>] [--all] [--root <dir>]
```

- `--view` accepts `api`, `exported-symbols` and `module-docs`; it may repeat.
  Unknown or duplicate values are invalid arguments, exit 2, before connection.
- `--from` and `--all` apply to module-area views. With only project views
  selected, `--from` still validates its path.
- Exits are unchanged from Plan 2A: 0 complete, 1 invalid project, 2
  unavailable, superseded, partial, rollback failure, deadline or incompatible
  service, 130 interrupted.
- Human success output adds one line per view:
  `<view>: <targets> target(s), <entries> entries, <bytes> bytes written, <unchanged> unchanged`.

## Failure and preservation table

| Condition | Result | Existing views |
| --- | --- | --- |
| Isolated symbol detail or test file failure | Published with exceptional marker and count | Replaced completely |
| Per-entry or per-file bound | Published with `[truncated]` and count | Replaced completely |
| Area, invocation, staged, worker or deadline bound | Unavailable | Preserved |
| Revision advances twice during the query | Superseded | Preserved |
| Existing project target not recognizably generated | Unavailable `invalid-path` | Preserved |
| Symlink in a target ancestor or undeclared symlink in a target | Unavailable `symlink` | Preserved |
| Symlink target escaping the project | Unavailable `invalid-path` | Preserved |
| Cancellation before switching | Cancelled | Preserved |
| Failure or cancellation during switching | Rolled back; never success | Restored or explicit rollback failure |
| Identical complete bytes and symlink texts | Published, zero writes | Untouched, mtimes equal |

## Compatibility

Protocol stays `ramify.ipc/1`. Package entry points stay the existing eight.
New public types travel through `ramify.ts/analysis` and `ramify.ts/client`.
No MCP dependency or browser promise is introduced.
