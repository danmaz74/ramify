# Explorer compatibility view model

**Date:** 2026-09-16. **Status:** frozen by iteration 1. Companion to
the [plan](main-plan.md).

This model is an adapter between Ramify's existing report and the cucumber-viz
module explorer. It favors the shapes and aggregates the lifted components need.
It is not a new authoritative Ramify inspection API.

The pure projection input is:

```ts
interface ExplorerProjectionInput {
  readonly revision: ContextRevision;
  readonly report: AnalysisReport;
}
```

The projection reads no files and performs no compiler query. A missing snapshot
does not produce a successful model; the service returns the report's invalid,
incomplete or unavailable outcome.

## Contract

```ts
export interface ProjectExplorerModel {
  readonly revision: RevisionId;
  readonly rootModuleId: ModuleId;
  readonly state: 'complete' | 'partial';
  readonly registry: ResolvedTagRegistry;
  readonly modules: readonly ExplorerModule[];
  readonly edges: readonly ExplorerEdge[];
  readonly otherTargets: readonly ExplorerTargetGroup[];
  readonly coverage: readonly ExplorerCoverage[];
  readonly summary: ExplorerSummary;
}

export interface ExplorerModule {
  readonly id: ModuleId;
  readonly name: string;
  readonly directory: string;
  readonly parent: ModuleId | null;
  readonly children: readonly ModuleId[];
  readonly tags: readonly TagName[];
  readonly presentationClass: string;
  readonly purpose: ModulePurpose;
  readonly files: readonly ExplorerFile[];
  readonly exports: readonly ExplorerExport[];
  readonly metrics: ExplorerMetrics;
}

export interface ExplorerFile {
  readonly path: string;
  readonly area: 'ordinary' | 'tests';
  readonly kind: 'source' | 'resource';
}

export interface ExplorerMetrics {
  readonly ownedFiles: number;
  readonly subtreeFiles: number;
  readonly dependencies: number;
  readonly dependents: number;
  readonly accessOccurrences: number;
  readonly selectedSymbols: number;
  readonly deniedAccesses: number;
  readonly limitedAccesses: number;
  readonly approximateIcs: number;
}

export interface ExplorerEdge {
  readonly id: string;
  readonly consumer: ModuleId;
  readonly provider: ModuleId;
  readonly consumerFiles: readonly string[];
  readonly providerFiles: readonly string[];
  readonly accessCount: number;
  readonly symbolCount: number;
  readonly accesses: readonly ExplorerAccess[];
  readonly status: 'allowed' | 'denied' | 'limited';
  readonly reasons: readonly ImportReason[];
  readonly coverageIds: readonly string[];
}

export interface ExplorerAccess {
  readonly id: string;
  readonly importerFile: string;
  readonly targetFile: string | null;
  readonly specifier: string | null;
  readonly writtenForm: WrittenForm;
  readonly selectionForm: SourceAccess['selectionForm'];
  readonly runtimeLoad: boolean;
  readonly selections: readonly ExplorerSelection[];
  readonly status: 'allowed' | 'denied' | 'limited';
  readonly reasons: readonly ImportReason[];
  readonly coverageIds: readonly string[];
  readonly location: SourceLocation;
}

export interface ExplorerSelection {
  readonly exportedName: string;
  readonly localName: string | null;
  readonly original: OriginalId | null;
  readonly request: BindingRequest;
  readonly explicitType: boolean;
  readonly forwarding: readonly SourceOrigin[];
  readonly status: AccessSelection['status'];
  readonly location: SourceLocation;
}

export interface ExplorerTargetGroup {
  readonly id: string;
  readonly kind: 'package' | 'builtin' | 'standard-library'
    | 'outside-module' | 'unresolved';
  readonly label: string;
  readonly accessCount: number;
  readonly consumerModules: readonly ModuleId[];
  readonly accesses: readonly ExplorerAccess[];
  readonly coverageIds: readonly string[];
}

export interface ExplorerExport {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly original: OriginalId | null;
  readonly file: string;
  readonly locations: readonly SourceLocation[];
  readonly capability: 'value' | 'type' | 'value-and-type'
    | 'resource' | 'unknown';
  readonly tags: readonly TagName[];
  readonly forwarded: boolean;
  readonly exposures: readonly ExplorerExposure[];
  readonly signature:
    | { readonly state: 'loadable'; readonly request: SymbolDetailRequest }
    | { readonly state: 'unavailable'; readonly reason: 'missing-original' };
}

export interface ExplorerExposure {
  readonly module: ModuleId;
  readonly names: readonly string[];
  readonly destinations: readonly Destination[];
  readonly provider: ModuleId | null;
  readonly effective: boolean;
  readonly evidence: readonly SourceLocation[];
}

export interface ExplorerCoverage {
  readonly limit: SourceLimit;
  readonly moduleIds: readonly ModuleId[];
  readonly edgeIds: readonly string[];
  readonly targetIds: readonly string[];
}

export interface ExplorerSummary {
  readonly owners: number;
  readonly ownedFiles: number;
  readonly edges: number;
  readonly otherTargets: number;
  readonly accessOccurrences: number;
  readonly selectedSymbols: number;
  readonly deniedAccesses: number;
  readonly limitedAccesses: number;
  readonly coverageNotes: number;
}
```

## Mapping

### Modules

- Module identity, name, directory, parent, tags and purpose come from matching
  inventory/model records.
- Children invert the parent relation and sort by module ID.
- Files are inventory files with the module as owner. Each file appears under
  exactly one owner. Subtree totals are separately named rollups.
- `presentationClass` is the sorted declared-tag list joined with `+`; an
  untagged module uses `untagged`. Color hashing and legend entries use this
  stable string. It is presentation metadata, not an inferred module taxonomy.

### Exports

Exports join `SourceCatalog.files`, `SourceCatalog.originals`,
`Model.originals` and `Model.exposures`.

- All export names in a defining file that resolve to the same original form
  one alias group. `name` is the byte-order first name and `aliases` contains
  the complete sorted group, including `name`.
- `capability` is computed from the original's `hasValue` and `hasType`
  flags. A resource original is `resource`; a missing original is `unknown`.
  It does not claim a TypeScript declaration kind.
- Exposure records preserve the exposing module, names, destinations, provider,
  effectiveness and evidence. They are not collapsed to one direction badge.
- Forwarding is true when a catalog export has forwarding origins or any joined
  exposure has a provider.
- Full signatures are not in `AnalysisReport`. A resolved code original carries
  the exact `SymbolDetailRequest` for the existing retained detail provider; an
  unresolved export carries an explicit unavailable state.

### Detail enrichment

Expanding a loadable export calls `explorerDetails` with the model's displayed
revision. The service accepts at most 50 unique requests, applies the existing
fixed `SymbolDetailLimits`, and delegates to the retained TypeScript provider.
It returns the provider's `described`, `truncated` or `unavailable` result
unchanged. If that session has moved past the displayed revision, the whole
request is `superseded`; it never returns details from a newer revision.

Detail results are browser state, not part of `ProjectExplorerModel`, and are
discarded on explicit revision refresh. Thus opening details does not rebuild or
retain a second project model.

### Module edges

Each application access whose importer and target have different owners belongs
to one `consumer -> provider` edge, where provider is the **file target owner**.
One `ExplorerAccess` remains one `SourceAccess`; its selections stay nested so a
multi-selection import is not miscounted as several source occurrences.
Selected originals and forwarding origins retain their own identities, so the
detail panel can show when a file target, forwarding file and original owner
differ. Exposure records explain permission but never create observed edges.

Counts use these units:

| Field | Unit |
| --- | --- |
| `accessCount` | `SourceAccess` occurrences in the owner pair |
| `symbolCount` | distinct non-null selected original/name pairs |
| `consumerFiles`, `providerFiles` | distinct files participating in those occurrences |
| module `dependencies`, `dependents` | distinct owner pairs |
| module `accessOccurrences` | occurrences imported by that module |
| module `selectedSymbols` | distinct selected original/name pairs imported by that module |

An access is denied when any attached decision denies. Otherwise it is limited
when its `AccessResult.outcome` is `unverifiable` or `mixed`, or it has coverage
IDs. Otherwise it is allowed. Its `reasons` are the distinct decision reasons
in byte order. An edge is denied when any attached access is denied, limited
when none is denied and at least one is limited, and allowed otherwise. Denied
accesses remain visible.

### Other targets

Non-application accesses do not disappear:

- external targets group by resolution and package/builtin name;
- outside-module targets group by normalized file;
- unresolved targets form an unresolved group without being relabeled external.

Each group retains its access rows and coverage IDs. These groups feed the
existing out-of-view/ghost-node and details affordances. They do not pretend to
be Ramify modules.

### Coverage

Every report `SourceLimit` appears once. The projection associates it with
module IDs by source-location ownership, with edges or target groups through
`SourceAccess.coverageIds`, and leaves any unmatched entry globally visible.
Missing enrichment and incomplete coverage never render as measured zero.

### Approximate complexity

The lifted graph's fallback remains:

```text
raw = 0.5 * ownedFiles + 0.5 * dependencies
approximateIcs = raw / max(raw across displayed modules)
```

The UI labels it “approximate.” A zero project maximum produces zero for every
module.

## Stable identifiers and ordering

IDs are length-prefixed tuples, avoiding delimiter ambiguity:
`<length>:<value>` joined in the documented field order.

- edge: `['edge', consumerModuleId, providerModuleId]`;
- target: `['target', kind, label]`;
- export: `['export', originalKey-or-file, primaryName]`.

All arrays use UTF-8 byte order unless interaction order is meaningful. IDs are
stable across revisions while their identifying facts remain present.

## Bounds

The UTF-8 bytes of `JSON.stringify(view)` have a `16 * 1024 * 1024` hard limit.
The service measures the complete model before returning it and reports the
maximum and observed bytes in `ProjectViewResult.limit`. It does not silently
truncate evidence or turn omitted details into empty arrays.
