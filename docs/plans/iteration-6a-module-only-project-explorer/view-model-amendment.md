# Module-only explorer view-model amendment

**Date:** 2026-09-16. **Status:** frozen by Plan 6A iteration 1.
This document narrows the completed Plan 6
[compatibility view model](../iteration-6-project-explorer/view-model.md).
It does not revise that historical artifact.

## Public contract changes

The successor contract removes the struck concepts entirely:

```ts
export interface ProjectExplorerModel {
  readonly revision: RevisionId;
  readonly rootModuleId: ModuleId;
  readonly state: 'complete' | 'partial';
  readonly registry: ResolvedTagRegistry;
  readonly modules: readonly ExplorerModule[];
  readonly edges: readonly ExplorerEdge[];
  readonly coverage: readonly ExplorerCoverage[];
  readonly summary: ExplorerSummary;
}

export interface ExplorerCoverage {
  readonly limit: SourceLimit;
  readonly moduleIds: readonly ModuleId[];
  readonly edgeIds: readonly string[];
}

export interface ExplorerSummary {
  readonly owners: number;
  readonly ownedFiles: number;
  readonly edges: number;
  readonly accessOccurrences: number;
  readonly selectedSymbols: number;
  readonly deniedAccesses: number;
  readonly limitedAccesses: number;
  readonly coverageNotes: number;
}
```

`ProjectExplorerModel.otherTargets`, `ExplorerTargetGroup`,
`ExplorerCoverage.targetIds` and `ExplorerSummary.otherTargets` cease to be
public or serialized fields. This is an intentional breaking change to the
Plan 6 compatibility DTO. The only current consumers are changed in this plan.

The reusable graph selection becomes:

```ts
export type GraphSelection = {
  readonly kind: 'edge';
  readonly id: string;
  readonly edge: ExplorerEdge;
};
```

`ModuleGraphProps` has no `otherTargets` input. Every graph node ID is a module
ID, including out-of-view module nodes, and every graph edge is backed by an
`ExplorerEdge`. Structural hierarchy and layout relations are not import edges.

## Visible access set

For a report access `a`, let `consumer(a)` be the owner of its importer and,
for an application target, let `provider(a)` be the owner of its target file.
The explorer-visible set is:

```text
V = { a | a.target.kind = application
        and consumer(a) exists
        and provider(a) exists
        and consumer(a) != provider(a) }
```

One `ExplorerEdge` groups members of `V` by ordered
`consumer -> provider` owner pair. Existing access IDs, nested selections,
status precedence, reasons, edge IDs and deterministic ordering remain.

The following report accesses are absent from the explorer model:

- npm/package, Node builtin and standard-library targets;
- outside-module and unresolved targets;
- application accesses whose importer and target have the same owner; and
- accesses without both module owners.

They remain in `AnalysisReport`; omission here is not an analysis outcome.

## Metric units

All import-related explorer metrics derive from `V`, never from all report
accesses.

| Field | Unit after this amendment |
| --- | --- |
| edge `accessCount` | `SourceAccess` occurrences in `V` for the owner pair |
| edge `symbolCount` | distinct non-null selected original/name pairs in those occurrences |
| module `dependencies` | distinct providers reached by the module's accesses in `V` |
| module `dependents` | distinct consumers whose accesses in `V` target the module |
| module `accessOccurrences` | occurrences in `V` imported by the module |
| module `selectedSymbols` | distinct non-null selected original/name pairs in those occurrences |
| module `deniedAccesses` | denied occurrences in `V` imported by the module |
| module `limitedAccesses` | limited occurrences in `V` imported by the module |
| summary import fields | corresponding totals or distinct pairs over `V` |

Owned/subtree file counts, exports and purpose do not depend on `V` and remain
unchanged. Approximate complexity continues to use owned files and visible
module dependencies, which already excludes non-module targets.

## Coverage preservation

Every report `SourceLimit` still produces one `ExplorerCoverage` entry:

- `moduleIds` contains the owner of the limit's source location when known;
- `edgeIds` contains visible edges whose accesses cite the limit; and
- a limit with neither association remains globally visible.

A limit cited only by an omitted access commonly has a module association and
empty `edgeIds`. It must not be dropped, converted to zero or treated as proof
of complete analysis. `ProjectExplorerModel.state` and
`summary.coverageNotes` still derive from the whole report.

## Presentation behavior

- Radial nodes consist of in-scope modules and out-of-view Ramify modules.
- Selectable graph relations consist only of `ExplorerEdge`s.
- The sidebar has module, module-edge and empty states; there is no other-target
  detail state or target coverage lookup.
- Filters and drill-down never introduce a non-module node.
- Refresh reconciliation retains a selected module or edge only if its ID still
  exists in the newer model.
- Empty projects and roots without cross-module imports remain useful module
  hierarchy views with zero dependency edges.

## Serialization and compatibility

The service serializes the narrowed object directly; it must not calculate
other-target groups and discard them later. A JSON assertion rejects the four
removed keys and any target discriminator. The 16 MiB refusal is applied to
the narrowed payload through the unchanged service result contract.

This amendment changes no tRPC procedure name, input, revision binding,
unavailable result, CLI command or web-process protocol. Consumers compiled
against the old DTO must update; no wire-version negotiation is added for the
current in-repository consumers.
