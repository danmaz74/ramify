# Plan 6 frozen contracts

**Date:** 2026-09-16. **Status:** frozen by iteration 1. Companion to the
[main plan](main-plan.md), [view model](view-model.md) and
[lift inventory](lift-inventory.md).

These contracts describe the first release. They do not make the compatibility
model an authoritative Ramify inspection API, add a second analysis, or permit
the browser and web process to read project files.

## Projection and browser procedures

The pure projection accepts exactly one published revision and its matching
report:

```ts
export interface ExplorerProjectionInput {
  readonly revision: ContextRevision;
  readonly report: AnalysisReport;
}
```

A successful projection requires `report.snapshot`, `snapshot.inventory`,
`snapshot.catalog`, `snapshot.model`, `report.registry` and a completed report
stage. A completed check may contain denied decisions and partial coverage. An
invalid, incomplete, unavailable or structurally missing snapshot is not a
successful empty view. The projection reads no filesystem, compiler, session,
context or daemon implementation.

The web router exposes exactly these three procedures:

```ts
export interface ProjectViewInput {
  readonly token: ContextToken;
  readonly revision?: RevisionId;
}

export type ProjectViewResult =
  | { readonly status: 'ready'; readonly revision: ContextRevision;
      readonly view: ProjectExplorerModel }
  | { readonly status: 'pending'; readonly current: ContextStatus }
  | { readonly status: 'unavailable'; readonly reason: string;
      readonly current?: ContextStatus;
      readonly limit?: { readonly maximumBytes: number;
        readonly observedBytes: number } };

export interface ExplorerDetailsInput {
  readonly token: ContextToken;
  readonly revision: RevisionId;
  readonly requests: readonly SymbolDetailRequest[];
}

export type ExplorerDetailsResult =
  | { readonly status: 'ready'; readonly revision: ContextRevision;
      readonly details: readonly SymbolDetail[] }
  | { readonly status: 'superseded' | 'unavailable';
      readonly reason: string };

export interface ContextStatusInput {
  readonly token: ContextToken;
}

export type ContextStatusResult =
  | { readonly status: 'ready'; readonly current: ContextStatus }
  | { readonly status: 'unavailable'; readonly reason: string };
```

`projectView` calls the existing service `check` operation with `scope:
'report'` and `{ mode: 'published', wait: false, revision }`, omitting the
revision property when the input omits it. `pending` and `cold` map to the
browser's `pending` state. Only a published, structurally complete report is
projected. Other check, lifecycle and validation outcomes remain unavailable;
there is no last-valid or batch fallback.

The UTF-8 bytes of `JSON.stringify(view)` must not exceed
`16 * 1024 * 1024`. The whole model is measured before success. A refusal sets
`limit.maximumBytes` and `limit.observedBytes`; it returns no partial model.

`contextStatus` delegates to the existing service operation. The browser polls
it every three seconds while visible. It never treats status as a report or
silently replaces the displayed revision.

## Detail bridge

The existing retained TypeScript adapter remains the only symbol-detail
implementation. Add a current-revision bridge through the existing owners:

```ts
// analysis session vocabulary
export type SessionExplorerDetailsOutcome =
  | { readonly status: 'ready'; readonly sequence: number;
      readonly details: readonly SymbolDetail[] }
  | { readonly status: 'superseded'; readonly sequence: number }
  | { readonly status: 'unavailable';
      readonly reason: 'compiler-released' | 'invalid-current'
        | 'resource-limit' | 'analysis-failed';
      readonly message: string }
  | { readonly status: 'cancelled' };

interface RetainedSession {
  explorerDetails(sequence: number,
    requests: readonly SymbolDetailRequest[],
    control?: RunControl): Promise<SessionExplorerDetailsOutcome>;
}

// contexts vocabulary
export interface ExplorerDetailsRequest {
  readonly token: ContextToken;
  readonly requestId: string;
  readonly revision: RevisionId;
  readonly requests: readonly SymbolDetailRequest[];
}

export type ContextExplorerDetailsOutcome =
  | { readonly status: 'ready'; readonly requestId: string;
      readonly revision: ContextRevision;
      readonly details: readonly SymbolDetail[] }
  | { readonly status: 'superseded'; readonly requestId: string;
      readonly revision: ContextRevision | null }
  | { readonly status: 'unavailable'; readonly requestId: string;
      readonly reason: UnavailableReason | 'compiler-released'
        | 'invalid-current' | 'resource-limit' | 'analysis-failed';
      readonly message: string }
  | { readonly status: 'cancelled'; readonly requestId: string };

interface ContextManager {
  explorerDetails(request: ExplorerDetailsRequest, lease: LeaseId,
    control?: RunControl): Promise<ContextExplorerDetailsOutcome>;
}
```

Root's `ServiceOperation` and `ServiceCapability` gain `explorerDetails`, and
`RamifyService` gains an operation with `ExplorerDetailsRequest` input and
`ContextExplorerDetailsOutcome` output. Daemon validation, direct dispatch,
wire dispatch and the lightweight connection expose that same operation.

The request accepts at most 50 distinct `(original, exportName)` pairs. The
adapter's existing stable unique-request order applies. It uses the existing
fixed limits: 2,048 signature bytes, 512 documentation bytes, 8 overloads and
32 MiB total provider output. Invalid request shapes fail validation. A valid
per-symbol failure remains the adapter's `unavailable` detail.

The context accepts only its current published revision. It holds the normal
request lease, serializes the session read against mutation, and verifies the
sequence again when the session operation begins. A different current revision
is `superseded`; a cold context or released compiler is unavailable. The bridge
does not query a historical report, recreate a compiler, use `apiView`, walk the
filesystem or substitute details from a newer revision.

Required declaration relays are narrow: analysis exposes
`SessionExplorerDetailsOutcome` with the existing session vocabulary; contexts
exposes `ExplorerDetailsRequest` and `ContextExplorerDetailsOutcome` to daemon;
daemon relays them to root; root relays the request/outcome and existing symbol
detail vocabulary to descendants. No private adapter or context implementation
is exposed.

## Compatibility identity and counts

The DTO and its field mapping are frozen in [view-model.md](view-model.md).
Every `ExplorerAccess` represents one `SourceAccess` occurrence and contains
its selection list; selections are never flattened into additional access
occurrences. Counts therefore have these exact units:

| Field | Unit |
| --- | --- |
| edge/group `accessCount` | `SourceAccess` occurrences |
| edge/module `selectedSymbols` or `symbolCount` | distinct non-null selected original/export-name pairs |
| `consumerFiles` / `providerFiles` | distinct participating files |
| module `dependencies` / `dependents` | distinct owner pairs |
| `ownedFiles` | inventory files whose owner is exactly the module |
| `subtreeFiles` | owned files of the module and all descendants |
| `deniedAccesses` / `limitedAccesses` | source access occurrences with that derived status |
| summary fields | the correspondingly named project-wide unit, never a subtree sum |

Stable IDs are length-prefixed tuples. Encode each field as
`<UTF-8-byte-length>:<field>` and concatenate the encoded fields without another
delimiter. Tuple fields are: edge `['edge', consumer, provider]`, target
`['target', kind, label]`, export `['export', original-key-or-file,
primary-name]`. Access IDs are the report's `SourceAccess.id`; coverage IDs are
the report's `SourceLimit.id`. Arrays use UTF-8 byte order unless the source
contract defines interaction or request order.

Unavailable facts remain states, not empty values. This applies to a missing
purpose paragraph, partial coverage, an unresolved original, symbol detail,
precise complexity and cycles. Approximate complexity retains its documented
formula and the UI labels it approximate.

## Module declarations and exposure paths

Iteration 2 creates the view module below the existing `presentation` owner;
iterations 4-6 create the three root children. These are the reviewed headers:

```text
# subs/presentation/subs/project-view/module.ramify
ramify 1
module project-view tagged [ui, browser]

expose-src * from "interfaces/project-view.ts" to parent
expose-src ProjectExplorerView from "ProjectExplorerView.tsx" tagged [ui, browser] to parent
expose-src ProjectExplorerViewProps, DiscussionComponent from "ProjectExplorerView.tsx" to parent
expose-src ModuleGraphRadial from "ModuleGraphRadial.tsx" tagged [ui, browser] to parent
expose-src ModuleGraphProps, GraphSelection from "moduleGraphShared.ts" to parent

# subs/explorer/module.ramify
ramify 1
module explorer tagged [ui, browser, dispatch]

expose-src ProjectExplorerPage from "ProjectExplorerPage.tsx" tagged [ui, browser, dispatch] to parent
expose-src createProjectExplorerBrowserApp from "browser-app.tsx" tagged [ui, browser, dispatch] to parent

# subs/service-api/module.ramify
ramify 1
module service-api tagged [dispatch]

expose-src * from "interfaces/explorer-service.ts" to parent
expose-src createProjectExplorerModel from "project-view.ts" to parent
expose-src createExplorerRouter from "router.ts" to parent
expose-src startExplorerWebProcess from "web-process.ts" to parent

# subs/integration-tests/module.ramify
ramify 1
module integration-tests tagged [testing, ui, dispatch]
```

`presentation/module.ramify` re-exposes the five component/view symbols and the
DTO names from `project-view` to parent. Root re-exposes those received names to
descendants, re-exposes the service API's interface and controlled test
contracts to descendants, and exposes the explorer and web-process assembly
values only where root assembly needs them. Integration tests expose nothing.

The compatibility DTO is declared once in project-view's interface file.
Because its bindings correctly carry `ui`, dispatch-only `service-api` does not
import them. Its pure projection has an inferred structural result; a
compile-time fixture in `integration-tests [testing, ui, dispatch]` assigns
that result to `ProjectExplorerModel`. This preserves the four accepted owners,
avoids a duplicate DTO or false tag, and makes drift a type error.

## Web discovery and local access

The web process uses daemon endpoint selection's private `0700` directory and
build key. It owns `explorer-<buildKey>.json`,
`explorer-<buildKey>.lock` and `explorer-<buildKey>.log`; it does not reuse the
daemon's record or socket. The record is atomically replaced, mode `0600`, and
has this exact shape:

```ts
export interface ExplorerProcessRecord {
  readonly schemaVersion: 'ramify.explorer-record/1';
  readonly instanceId: string;
  readonly pid: number;
  readonly version: string;
  readonly buildKey: string;
  readonly protocol: 'ramify.explorer-http/1';
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly origin: string;
  readonly startedAt: number;
  readonly state: 'running' | 'stopped';
  readonly stopped: null | { readonly at: number;
    readonly reason: 'idle' | 'explicit' | 'failed' };
}
```

The listener binds only `127.0.0.1`, requests port `0` on first start, and
records the assigned `http://127.0.0.1:<port>` origin. Reuse requires matching
version, build key, protocol, a live PID and a successful
`GET /health/ready`; the readiness JSON repeats schema version, instance ID,
version, build key and protocol. A stale, malformed, symlinked, incompatible or
unready record is not reused. The lock and bounded readiness retry coordinate
concurrent launchers; exact retry timing may reuse the daemon launch policy and
is not a browser-visible contract.

Requests must have the recorded `Host`. API requests with an `Origin` header
must equal the recorded origin; an absent Origin is accepted for same-host
navigation, readiness and local non-browser clients. The server emits no
cross-origin allowance, rejects cross-origin preflight, sets
`frame-ancestors 'none'` and restricts script/style/connect sources to its own
origin and required static hashes. This is a local integrity boundary, not
authentication against another process running as the same user.

The CLI opens
`<origin>/explore/<encodeURIComponent(context)>/<encodeURIComponent(generation)>`.
No project path, compiler configuration or report data appears in the URL.
The page obtains all project facts through the three procedures above.

## Completion reuse accounting

Iteration 7 accounts for every row in [lift-inventory.md](lift-inventory.md)
using exactly one file category: `copied`, `mechanically adapted`,
`behaviorally changed` or `rewritten`. Every behavioral change and rewrite has
a reason. Every named source test uses exactly one test category: `ported`,
`replaced` or `intentionally omitted`; replacement or omission records the
equivalent acceptance witness or why the behavior is deliberately absent.
Unexplained files, tests or assertions fail EX10/EX11.
