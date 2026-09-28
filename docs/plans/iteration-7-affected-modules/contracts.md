# Affected-module contracts

**Status:** revised 2026-09-28 for [Plan 7](main-plan.md). These extend the
completed Plan 5 session contracts in place; preserve their unrelated methods
and lifecycle guarantees. Field names are binding for the iterations; an
iteration that must deviate records the deviation in its results file.

## Analysis API

New analysis-owned `subs/analysis/src/interfaces/affected.ts`. Foreign types
arrive as `import type` and are never re-exported from this file.

```ts
import type { ProjectScope } from '../../subs/project/src/interfaces/project.js';
import type { SourceLimit } from '../../subs/typescript/src/interfaces/source.js';

export interface AffectedQuery {
  /** The session's current revision; any other value is `invalid-revision`. */
  readonly sequence: number;
  /** Exact inventory module IDs; unknown IDs fail the whole query. */
  readonly modules?: readonly string[];
  /** Project-relative, `/`-separated paths as the inventory spells them. */
  readonly paths?: readonly string[];
}
export interface AffectedModule {
  readonly id: string;
  readonly directory: string; // project-relative; '.' for the root
}
/** How a path seed resolved to a module. */
export type AffectedPathBasis = 'inventory' | 'declaration' | 'area' | 'none';
export interface AffectedPathSeed {
  readonly path: string;
  readonly module: string | null; // null only with basis 'none'
  readonly basis: AffectedPathBasis;
}
export type AffectedWideningReason = 'unowned-path' | 'partial-coverage';
export interface AffectedSelection {
  readonly schemaVersion: 'ramify.affected/1';
  /** The revision's observed-input identity; the answer describes exactly these inputs. */
  readonly inputId: string;
  readonly paths: readonly AffectedPathSeed[];
  readonly changedModules: readonly AffectedModule[];   // the seeds
  readonly affectedModules: readonly AffectedModule[];  // reached dependents, seeds excluded
  readonly testModules: readonly AffectedModule[];      // union, or every module when widened
  readonly selection: 'dependency-closure' | 'all-modules';
  /** Empty for `dependency-closure`; distinct, sorted, for `all-modules`. */
  readonly widening: readonly AffectedWideningReason[];
  readonly scope: ProjectScope;
  readonly coverage: { readonly status: 'complete' | 'partial'; readonly notes: readonly SourceLimit[] };
  /** The revision's existing check verdict; never a claim that tests ran. */
  readonly analysisCheck: 'passed' | 'failed';
}
export type AffectedUnavailableReason =
  | 'invalid-query' | 'invalid-revision' | 'invalid-current' | 'missing-facts'
  | 'unknown-module' | 'resource-limit';
export type SessionAffectedOutcome =
  | { readonly status: 'answered'; readonly sequence: number; readonly result: AffectedSelection }
  | { readonly status: 'unavailable'; readonly reason: AffectedUnavailableReason;
      readonly message: string; readonly unknownModules: readonly string[] }
  | { readonly status: 'cancelled' };
```

`RetainedSession` in `interfaces/session.ts` gains:

```ts
/** Select the modules affected by the given seeds from the current valid
 * revision's retained facts. Only `query.sequence` equal to the session's
 * current revision is accepted; a warm session answers with its compiler
 * released; nothing is read from disk or projected through `report()`. */
affected(query: AffectedQuery, control?: RunControl): Promise<SessionAffectedOutcome>;
```

### Query validation

`invalid-query` when `modules` or `paths` is present but not an array of
nonempty strings, when a path is absolute, contains `\`, an empty segment,
`.` or `..` segments, or when the seed count exceeds 4,096. Duplicate seeds
are normalized. Both lists absent or empty is valid and answers with empty
`changedModules`, `affectedModules` and `testModules` after the readiness
checks; it still reports coverage and widening.

### Readiness

Mirror `measurements`: disposed session or a sequence other than the current
one is `invalid-revision`; `facts.invalid`, a null inventory or area issues is
`invalid-current`. A current revision whose retained facts lack access
interpretation, because the session's capabilities never requested it or a
prerequisite stage is blocked, is `missing-facts`. Iteration 1 identifies the
exact retained field or execution record that proves the access stage
completed and records it in its results file; `report()` is not called to
find out.

### Path resolution

For each normalized path, in this order, the first match wins:

1. `inventory`: a `ProjectInventory.files[].path` equals the path; the module
   is its `owner`.
2. `declaration`: the path equals `<module.directory>/module.ramify` or
   `<module.directory>/README.md` for an inventoried module, with the root
   module's directory `.` spelled as `module.ramify` and `README.md`.
3. `area`: the path lies under the `root` of an `InventoryArea` of an
   inventoried module; the module is that area's owner. Areas of nested
   modules never overlap a parent's areas, so at most one area matches.
   Iteration 1 verifies how `InventoryArea.root` is spelled and whether it is
   relative to the project root.
4. `none`: no module. The selection widens with `unowned-path`.

### Projection

Private `subs/analysis/src/affected-query.ts` exports a pure function over a
plain input assembled from `SessionFacts`, so it is testable without a
session:

```ts
export interface AffectedFacts {
  readonly inventory: ProjectInventory;
  readonly accesses: readonly SourceAccess[];
  readonly shims: readonly { readonly file: string; readonly shims: readonly string[] }[];
  readonly coverage: readonly SourceLimit[];
  readonly scope: ProjectScope;
  readonly inputId: string;
  readonly analysisCheck: 'passed' | 'failed';
}
export function projectAffected(facts: AffectedFacts, seeds: { modules: readonly string[]; paths: readonly string[] },
  limits: { maxModules: number; maxEdges: number }, control?: RunControl):
  Exclude<SessionAffectedOutcome, { status: 'answered' }> | { status: 'answered'; result: AffectedSelection };
```

Edges, with consumer `access.importer.area.owner`:

- `access.target.kind === 'application'`: provider `target.origin.area.owner`,
  including accesses with no selections.
- each `selection.original` that is not null: provider `original.owner`.
- each `selection.forwarding[]` origin: provider `origin.area.owner`.
- each shim entry: consumer is the file's owner from the inventory, provider is
  the shim path's owner from the inventory; unowned shims add no edge.
- `external`, `outside-module` and `unresolved` targets add no edge. Their
  coverage notes decide widening.

Drop self-edges. Count unique non-self edges; over `maxEdges` or an inventory
over `maxModules` is `resource-limit`. Check `control.signal` at least every
1,024 accesses and traversal steps; an abort is `cancelled`. Build the reverse
adjacency, seed the traversal with every seed module, visit each module once.

Coverage is `partial` when any note's `code` is outside the set
`incomplete-exports`, `ambiguous-original`, `unresolved-original`,
`unknown-key`, `namespace-escape`, `signature-inferred`,
`signature-unresolved`. Return every note, sorted by the catalog's existing
order, whatever the status.

`selection` is `all-modules` when `widening` is nonempty; `testModules` is then
every inventoried module. Otherwise `testModules` is seeds plus reached
modules. `changedModules` and `affectedModules` are always the real seeds and
closure, so a consumer can see what was known even when widened.

### Worker

Add `{ operation: 'affected'; query: AffectedQuery }` to `session-messages.ts`,
the `case 'affected'` to `session-worker.ts`, and the forwarding method to
`session-host.ts`, exactly as `measurements`. The engine method runs under
`#serialize`, assembles `AffectedFacts` from the current facts without copying
accesses, calls the projector, and returns only the plain outcome.

## Context contract

Add to `subs/daemon/subs/contexts/src/interfaces/contexts.ts`, using the
existing context, freshness and analysis vocabulary:

```ts
export interface AffectedRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly freshness: Freshness;
  readonly modules?: readonly string[];
  readonly paths?: readonly string[];
  readonly deadlineMs?: number;
}
export type ContextAffectedOutcome =
  | { readonly status: 'answered'; readonly requestId: string; readonly revision: ContextRevision;
      readonly freshness: FreshnessRecord; readonly result: AffectedSelection; readonly timings: ReplyTimings }
  | { readonly status: 'unavailable'; readonly requestId: string; readonly revision: ContextRevision | null;
      readonly reason: AffectedUnavailableReason | UnavailableReason; readonly message: string;
      readonly unknownModules: readonly string[] }
  | { readonly status: 'deadline-exceeded'; readonly requestId: string; readonly elapsedMs: number }
  | { readonly status: 'superseded'; readonly requestId: string }
  | { readonly status: 'pending'; readonly requestId: string }
  | { readonly status: 'cold'; readonly requestId: string }
  | { readonly status: 'cancelled'; readonly requestId: string };
```

Iteration 2 aligns the exact variant fields with the existing `measure`
outcome in the same file, so the two operations share one shape for the
non-answered variants. `ContextManager.affected(request, lease, control?)`
uses the same covering-revision scheduler and leases as `measure`, invokes the
session at that revision's sequence, and returns `superseded` when the
session's answer names another sequence. It never relabels an answer from an
older revision.

| Request/state | Behavior |
| --- | --- |
| Published or synchronized, ready covering revision | Answer from that revision's facts. |
| Pending or cold with wait false | Explicit `pending` or `cold`. |
| Pending or cold with wait true | Plan 5's readiness or opening under the caller's deadline. |
| Invalid current input after last valid | `unavailable`, never an answer from `lastValid`. |
| Disposed, expired generation, resource pressure, disconnect | Existing lifecycle outcome and lease cleanup. |

## Daemon, root and client

Root's `ServiceOperation` and `ServiceCapability` gain `affected`. The service
interface, daemon dispatch and lightweight connection gain:

```ts
affected(params: AffectedParams, control?: RunControl): Promise<ServiceResult<AffectedOutcome>>;
```

`AffectedParams` is `AffectedRequest`; `AffectedOutcome` is
`ContextAffectedOutcome`. Wire validation checks exact fields, nonempty string
IDs, arrays of strings, supported freshness and a finite positive deadline
under Plan 5's cap, and the request and response byte bounds. Malformed wire
data is `invalid-request`; an unknown module ID is a domain outcome. The
connection method answers `unsupported-operation` when the welcome lacks the
capability, as `measure` does. No client falls back to batch on its own.

## Batch operation

`src/interfaces/batch.ts` gains:

```ts
export interface AffectedBatchInvocation {
  readonly cwd: string;
  readonly root?: string;
  readonly modules: readonly string[];
  readonly paths: readonly string[];
}
export type AffectedBatchResult =
  | { readonly status: 'answered'; readonly inputId: string; readonly result: AffectedSelection }
  | { readonly status: 'unavailable'; readonly reason: AffectedUnavailableReason | 'invalid-project'; readonly message: string;
      readonly unknownModules: readonly string[]; readonly exitCode: 1 | 2 }
  | { readonly status: 'cancelled'; readonly exitCode: 130 };
export type AffectedBatchOperation = (invocation: AffectedBatchInvocation, control?: RunControl) => Promise<AffectedBatchResult>;
```

Root implements it by resolving the project as `check --batch` does, opening a
retained session over the root with the check capabilities `check --batch`
requests, calling `affected` at the opened revision, and disposing the session
in `finally`. The compiled client runs it in the same Node child seam as
`check --batch`. The CLI environment receives it as `affectedBatch` beside
`batch`. `invalid-project` maps a `reported` open without a session to exit 1.

## CLI

```text
ramify affected [<module-id>...] [--path <path>]... [--root <dir>] [--batch]
                [--format human|json]
```

At least one module ID or `--path` is required; `--path` repeats. Resident
form: connect, starting the daemon if needed, open the project context as
`measure` does, request synchronized freshness with wait, and print the
answer. Batch form: run the batch operation. `--format json` prints one
document:

```ts
export interface AffectedDocument {
  readonly schemaVersion: 'ramify.affected-cli/1';
  readonly root: string;
  readonly mode: 'resident' | 'batch';
  readonly revision: { readonly sequence: number | null; readonly inputId: string };
  readonly ramifyVersion: string;
  readonly selection: AffectedSelection;
}
```

Human output prints the root, mode, revision, selection with its widening
reasons, one line per path seed with its module and basis, then the changed,
affected and test module lists and the count of coverage notes.

| Outcome | Exit |
| --- | --- |
| Answered, `dependency-closure` or `all-modules` | 0 |
| Invalid project, unknown module ID or invalid seeds | 1 |
| Unavailable, pending, cold, superseded, deadline exceeded | 2 |
| Cancelled | 130 |

An `all-modules` answer exits 0 because it is a complete conservative answer;
consumers read `selection` and `widening`, never the exit code alone. Failures
use the existing `ramify.cli/1` diagnostic form as `measure` does.
