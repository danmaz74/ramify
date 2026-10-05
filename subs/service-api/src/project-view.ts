import type { AccessResult, AnalysisReport } from '../../analysis/src/interfaces/analysis.js';
import type {
  BindingRequest,
  Destination,
  ImportReason,
  Model,
  ModuleId,
  OriginalId,
  ResolvedTagRegistry,
  SourceLocation,
  SourceOrigin,
} from '../../analysis/subs/model/src/interfaces/model.js';
import type {
  InventoryFile,
  ModulePurpose,
  ProjectInventory,
} from '../../analysis/subs/project/src/interfaces/project.js';
import type {
  CatalogExport,
  SourceAccess,
  SourceLimit,
  SourceTarget,
  SymbolDetailRequest,
  WrittenForm,
} from '../../analysis/subs/typescript/src/interfaces/source.js';
import type { ContextRevision } from '../../daemon/subs/contexts/src/interfaces/contexts.js';
import type { ExplorerProjectionInput } from './interfaces/explorer-service.js';

export const maximumProjectViewBytes = 16 * 1024 * 1024;

/**
 * What the projection answers with: the model of one revision, or the reason it
 * is unavailable. Written out so `createProjectExplorerModel` declares its
 * result instead of leaving it to inference; every member states exactly the
 * type the projection already produced.
 */
export type ExplorerProjectionResult =
  | {
    status: 'unavailable';
    reason: string;
    limit?: { readonly maximumBytes: number; readonly observedBytes: number } | undefined;
  }
  | {
    status: 'ready';
    revision: ContextRevision;
    view: {
      revision: string;
      rootModuleId: string;
      state: 'complete' | 'partial';
      registry: ResolvedTagRegistry;
      modules: {
        id: string;
        name: string;
        directory: string;
        parent: string | null;
        children: string[];
        tags: string[];
        presentationClass: string;
        purpose: ModulePurpose;
        files: {
          path: string;
          area: 'ordinary' | 'tests';
          kind: 'resource' | 'source';
        }[];
        exports: {
          id: string;
          name: string;
          aliases: string[];
          original: OriginalId | null;
          file: string;
          locations: SourceLocation[];
          capability: 'resource' | 'type' | 'unknown' | 'value' | 'value-and-type';
          tags: string[];
          forwarded: boolean;
          exposures: {
            module: string;
            names: string[];
            destinations: Destination[];
            provider: string | null;
            effective: boolean;
            evidence: SourceLocation[];
          }[];
          signature:
            | { state: 'loadable'; request: SymbolDetailRequest; reason?: undefined }
            | { request?: undefined; state: 'unavailable'; reason: 'missing-original' };
        }[];
        metrics: {
          ownedFiles: number;
          subtreeFiles: number;
          dependencies: number;
          dependents: number;
          accessOccurrences: number;
          selectedSymbols: number;
          deniedAccesses: number;
          limitedAccesses: number;
          approximateIcs: number;
        };
      }[];
      edges: {
        id: string;
        consumer: string;
        provider: string;
        consumerFiles: string[];
        providerFiles: string[];
        accessCount: number;
        symbolCount: number;
        accesses: {
          id: string;
          importerFile: string;
          targetFile: string | null;
          specifier: string | null;
          writtenForm: WrittenForm;
          selectionForm: 'default' | 'destructure' | 'direct-member' | 'literal-key' | 'named' | 'none'
            | 'qualified-type' | 'then-destructure' | 'then-member' | 'unknown' | 'whole-namespace' | 'whole-star';
          runtimeLoad: boolean;
          selections: {
            exportedName: string;
            localName: string | null;
            original: OriginalId | null;
            request: BindingRequest;
            explicitType: boolean;
            forwarding: readonly SourceOrigin[];
            status: 'missing-export' | 'resolved' | 'unresolved';
            location: SourceLocation;
          }[];
          status: 'allowed' | 'denied' | 'limited';
          reasons: ImportReason[];
          coverageIds: string[];
          location: SourceLocation;
        }[];
        status: 'allowed' | 'denied' | 'limited';
        reasons: ImportReason[];
        coverageIds: string[];
      }[];
      coverage: {
        limit: SourceLimit;
        moduleIds: readonly string[];
        edgeIds: string[];
      }[];
      summary: {
        owners: number;
        ownedFiles: number;
        edges: number;
        accessOccurrences: number;
        selectedSymbols: number;
        deniedAccesses: number;
        limitedAccesses: number;
        coverageNotes: number;
      };
    };
  };

const utf8Order = (left: string, right: string): number => Buffer.compare(Buffer.from(left), Buffer.from(right));
const ordered = (values: Iterable<string>): string[] => [...new Set(values)].sort(utf8Order);
const originalKey = (original: OriginalId): string => JSON.stringify([
  original.kind,
  original.owner,
  original.file,
  original.binding,
]);
const tupleId = (fields: readonly string[]): string => fields
  .map(field => `${Buffer.byteLength(field, 'utf8')}:${field}`)
  .join('');
const locationOrder = (left: SourceLocation, right: SourceLocation): number =>
  utf8Order(left.file, right.file) || left.start - right.start || left.end - right.end;

function unavailable(reason: string, limit?: { readonly maximumBytes: number; readonly observedBytes: number }) {
  return { status: 'unavailable' as const, reason, ...(limit ? { limit } : {}) };
}

function completeReport(report: AnalysisReport): report is AnalysisReport & {
  readonly registry: NonNullable<AnalysisReport['registry']>;
  readonly snapshot: NonNullable<AnalysisReport['snapshot']> & {
    readonly catalog: NonNullable<NonNullable<AnalysisReport['snapshot']>['catalog']>;
    readonly model: NonNullable<NonNullable<AnalysisReport['snapshot']>['model']>;
  };
} {
  return report.outcome.execution === 'completed'
    && report.stages.some(stage => stage.stage === 'report' && stage.status === 'completed')
    && report.registry !== null
    && report.snapshot !== null
    && report.snapshot.inventory !== null
    && report.snapshot.catalog !== null
    && report.snapshot.model !== null;
}

function accessStatus(access: SourceAccess, result: AccessResult): 'allowed' | 'denied' | 'limited' {
  if (result.outcome === 'denied' || result.decisions.some(decision => decision.status === 'denied')) return 'denied';
  return result.outcome === 'unverifiable' || result.outcome === 'mixed' || access.coverageIds.length
    ? 'limited' : 'allowed';
}

function selectedKey(original: OriginalId, exportedName: string): string {
  return `${originalKey(original)}\u0000${exportedName}`;
}

function ownerOf(inventory: ProjectInventory): ReadonlyMap<string, InventoryFile> {
  return new Map(inventory.files.map(file => [file.path, file]));
}

function exposureOrder(left: Model['exposures'][number], right: Model['exposures'][number]): number {
  return utf8Order(left.module, right.module)
    || utf8Order(left.provider ?? '', right.provider ?? '')
    || utf8Order(left.names.join('\u0000'), right.names.join('\u0000'))
    || utf8Order(left.destinations.join('\u0000'), right.destinations.join('\u0000'));
}

function detailNames(report: AnalysisReport & { readonly snapshot: NonNullable<AnalysisReport['snapshot']> & {
  readonly catalog: NonNullable<NonNullable<AnalysisReport['snapshot']>['catalog']>;
} }): ReadonlyMap<string, string> {
  const names = new Map<string, string[]>();
  const originals = new Map(report.snapshot.catalog.originals.map(original => [originalKey(original.id), original]));
  for (const file of report.snapshot.catalog.files) {
    for (const exported of file.exports) {
      if (!exported.original) continue;
      const key = originalKey(exported.original);
      if (originals.get(key)?.origin.file !== file.file) continue;
      const list = names.get(key) ?? [];
      list.push(exported.name);
      names.set(key, list);
    }
  }
  return new Map([...names].map(([key, entries]) => [key, ordered(entries)[0]!]));
}

function exportGroups(
  inventory: ProjectInventory,
  model: Model,
  report: AnalysisReport & { readonly snapshot: NonNullable<AnalysisReport['snapshot']> & {
    readonly catalog: NonNullable<NonNullable<AnalysisReport['snapshot']>['catalog']>;
  } },
) {
  const files = ownerOf(inventory);
  const modelOriginals = new Map(model.originals.map(original => [originalKey(original.id), original]));
  const catalogOriginals = new Map(report.snapshot.catalog.originals.map(original => [originalKey(original.id), original]));
  const requestNames = detailNames(report);
  const byOwner = new Map<ModuleId, ReturnType<typeof buildGroup>[] >();

  function buildGroup(file: string, exports: readonly CatalogExport[]) {
    const aliases = ordered(exports.map(item => item.name));
    const original = exports[0]!.original;
    const key = original ? originalKey(original) : null;
    const established = key ? modelOriginals.get(key) : undefined;
    const catalog = key ? catalogOriginals.get(key) : undefined;
    const exposures = key ? model.exposures
      .filter(exposure => originalKey(exposure.original) === key)
      .sort(exposureOrder)
      .map(exposure => ({
        module: exposure.module,
        names: ordered(exposure.names),
        destinations: ordered(exposure.destinations) as Destination[],
        provider: exposure.provider,
        effective: exposure.effective,
        evidence: [...exposure.evidence].sort(locationOrder),
      })) : [];
    let capability: 'value' | 'type' | 'value-and-type' | 'resource' | 'unknown' = 'unknown';
    if (original?.kind === 'resource') capability = 'resource';
    else if (established ?? catalog) {
      const source = established ?? catalog!;
      capability = source.hasValue && source.hasType ? 'value-and-type' : source.hasValue ? 'value' : source.hasType ? 'type' : 'unknown';
    }
    const primary = aliases[0]!;
    const requestName = key ? requestNames.get(key) : undefined;
    const request: SymbolDetailRequest | null = original?.kind === 'code' && requestName
      ? { original, exportName: requestName } : null;
    return {
      id: tupleId(['export', file, key ?? file, primary]),
      name: primary,
      aliases,
      original,
      file,
      locations: [...(established?.declarations ?? catalog?.declarations ?? [])].sort(locationOrder),
      capability,
      tags: ordered(established?.tags ?? []),
      forwarded: exports.some(item => item.forwarding.length > 0) || exposures.some(exposure => exposure.provider !== null),
      exposures,
      signature: request
        ? { state: 'loadable' as const, request }
        : { state: 'unavailable' as const, reason: 'missing-original' as const },
    };
  }

  for (const file of report.snapshot.catalog.files) {
    const owner = files.get(file.file)?.owner;
    if (!owner) continue;
    const groups = new Map<string, CatalogExport[]>();
    for (const exported of file.exports) {
      const key = exported.original ? originalKey(exported.original) : `missing\u0000${exported.name}`;
      const list = groups.get(key) ?? [];
      list.push(exported);
      groups.set(key, list);
    }
    const entries = byOwner.get(owner) ?? [];
    for (const group of groups.values()) entries.push(buildGroup(file.file, group));
    byOwner.set(owner, entries);
  }
  for (const entries of byOwner.values()) entries.sort((left, right) => utf8Order(left.id, right.id));
  return byOwner;
}

/**
 * Pure, deterministic compatibility projection over exactly one revision and
 * its matching detached report. This module deliberately imports no filesystem,
 * compiler, session, context-manager or daemon-host implementation.
 */
export function createProjectExplorerModel(input: ExplorerProjectionInput): ExplorerProjectionResult {
  const { revision, report } = input;
  if (!completeReport(report)) return unavailable('The report is not a completed structural analysis');
  if (report.inputId !== revision.fingerprints.inputId) return unavailable('The report does not match the requested revision');

  const { inventory, catalog, model, accesses, results } = report.snapshot;
  const roots = model.modules.filter(module => module.parent === null);
  if (roots.length !== 1) return unavailable('The report does not contain exactly one root module');
  const inventoryModules = new Map(inventory.modules.map(module => [module.id, module]));
  const resultByAccess = new Map(results.map(result => [result.accessId, result]));
  const fileByPath = ownerOf(inventory);
  const moduleIds = new Set(model.modules.map(module => module.id));
  const structurallyComplete = inventoryModules.size === model.modules.length
    && model.registry.id === report.registry.id
    && model.modules.every(module => {
      const inventoried = inventoryModules.get(module.id);
      return inventoried?.name === module.name && inventoried.parent === module.parent;
    })
    && inventory.files.every(file => moduleIds.has(file.owner))
    && catalog.files.every(file => fileByPath.has(file.file))
    && accesses.every(access => {
      const importer = fileByPath.get(access.importer.file);
      if (!resultByAccess.has(access.id) || importer?.owner !== access.importer.area.owner
        || !moduleIds.has(access.importer.area.owner)) return false;
      if (access.target.kind !== 'application') return true;
      return fileByPath.get(access.target.origin.file)?.owner === access.target.origin.area.owner
        && moduleIds.has(access.target.origin.area.owner);
    });
  if (!structurallyComplete) {
    return unavailable('The report snapshot is structurally incomplete');
  }

  const children = new Map<ModuleId, ModuleId[]>();
  for (const module of model.modules) if (module.parent !== null) {
    const list = children.get(module.parent) ?? [];
    list.push(module.id);
    children.set(module.parent, list);
  }
  const visibleAccesses = accesses.filter(access => {
    if (access.target.kind !== 'application') return false;
    const consumer = fileByPath.get(access.importer.file)?.owner;
    const provider = fileByPath.get(access.target.origin.file)?.owner;
    return consumer !== undefined && provider !== undefined && consumer !== provider;
  });
  const accessRows = visibleAccesses.map(access => {
    const result = resultByAccess.get(access.id)!;
    const status = accessStatus(access, result);
    const reasons = ordered(result.decisions.map(decision => decision.reason)) as ImportReason[];
    return {
      source: access,
      result,
      consumer: access.importer.area.owner,
      provider: access.target.kind === 'application' ? access.target.origin.area.owner : null,
      row: {
        id: access.id,
        importerFile: access.importer.file,
        targetFile: access.target.kind === 'application' ? access.target.origin.file : null,
        specifier: access.specifier,
        writtenForm: access.form,
        selectionForm: access.selectionForm,
        runtimeLoad: access.runtimeLoad,
        selections: access.selections.map(selection => ({
          exportedName: selection.exportedName,
          localName: selection.localName,
          original: selection.original,
          request: selection.request,
          explicitType: selection.explicitType,
          forwarding: selection.forwarding,
          status: selection.status,
          location: selection.location,
        })),
        status,
        reasons,
        coverageIds: ordered(access.coverageIds),
        location: access.location,
      },
    };
  });

  const edgeGroups = new Map<string, typeof accessRows>();
  for (const item of accessRows) {
    const key = `${item.consumer}\u0000${item.provider!}`;
    const list = edgeGroups.get(key) ?? [];
    list.push(item);
    edgeGroups.set(key, list);
  }
  const edges = [...edgeGroups.values()].map(group => {
    const consumer = group[0]!.consumer;
    const provider = group[0]!.provider!;
    const rows = group.map(item => item.row).sort((left, right) => utf8Order(left.id, right.id));
    const statuses = new Set(rows.map(row => row.status));
    const symbols = new Set(group.flatMap(item => item.source.selections
      .filter(selection => selection.original !== null)
      .map(selection => selectedKey(selection.original!, selection.exportedName))));
    return {
      id: tupleId(['edge', consumer, provider]),
      consumer,
      provider,
      consumerFiles: ordered(group.map(item => item.source.importer.file)),
      providerFiles: ordered(group.map(item => (item.source.target as Extract<SourceTarget, { kind: 'application' }>).origin.file)),
      accessCount: rows.length,
      symbolCount: symbols.size,
      accesses: rows,
      status: (statuses.has('denied') ? 'denied' : statuses.has('limited') ? 'limited' : 'allowed') as 'allowed' | 'denied' | 'limited',
      reasons: ordered(rows.flatMap(row => row.reasons)) as ImportReason[],
      coverageIds: ordered(rows.flatMap(row => row.coverageIds)),
    };
  }).sort((left, right) => utf8Order(left.id, right.id));

  const exportsByOwner = exportGroups(inventory, model, report);
  const dependencies = new Map<ModuleId, Set<ModuleId>>();
  const dependents = new Map<ModuleId, Set<ModuleId>>();
  for (const edge of edges) {
    (dependencies.get(edge.consumer) ?? dependencies.set(edge.consumer, new Set()).get(edge.consumer)!).add(edge.provider);
    (dependents.get(edge.provider) ?? dependents.set(edge.provider, new Set()).get(edge.provider)!).add(edge.consumer);
  }
  const ownedCounts = new Map(model.modules.map(module => [module.id,
    inventory.files.filter(file => file.owner === module.id).length]));
  const subtreeCount = (id: ModuleId): number => (ownedCounts.get(id) ?? 0)
    + (children.get(id) ?? []).reduce((sum, child) => sum + subtreeCount(child), 0);
  const rawComplexity = new Map(model.modules.map(module => [module.id,
    0.5 * (ownedCounts.get(module.id) ?? 0) + 0.5 * (dependencies.get(module.id)?.size ?? 0)]));
  const maximumComplexity = Math.max(0, ...rawComplexity.values());

  const modules = model.modules.map(module => {
    const inventoryModule = inventoryModules.get(module.id)!;
    const imported = accessRows.filter(item => item.consumer === module.id);
    const selected = new Set(imported.flatMap(item => item.source.selections
      .filter(selection => selection.original !== null)
      .map(selection => selectedKey(selection.original!, selection.exportedName))));
    return {
      id: module.id,
      name: module.name,
      directory: inventoryModule.directory,
      parent: module.parent,
      children: ordered(children.get(module.id) ?? []),
      tags: ordered(module.headerTags),
      presentationClass: module.headerTags.length ? ordered(module.headerTags).join('+') : 'untagged',
      purpose: inventoryModule.purpose,
      files: inventory.files.filter(file => file.owner === module.id)
        .map(file => ({ path: file.path, area: file.area, kind: file.kind }))
        .sort((left, right) => utf8Order(left.path, right.path)),
      exports: exportsByOwner.get(module.id) ?? [],
      metrics: {
        ownedFiles: ownedCounts.get(module.id) ?? 0,
        subtreeFiles: subtreeCount(module.id),
        dependencies: dependencies.get(module.id)?.size ?? 0,
        dependents: dependents.get(module.id)?.size ?? 0,
        accessOccurrences: imported.length,
        selectedSymbols: selected.size,
        deniedAccesses: imported.filter(item => item.row.status === 'denied').length,
        limitedAccesses: imported.filter(item => item.row.status === 'limited').length,
        approximateIcs: maximumComplexity ? rawComplexity.get(module.id)! / maximumComplexity : 0,
      },
    };
  }).sort((left, right) => utf8Order(left.id, right.id));

  const edgeIdsByCoverage = new Map<string, string[]>();
  for (const edge of edges) for (const id of edge.coverageIds) {
    const entries = edgeIdsByCoverage.get(id) ?? [];
    entries.push(edge.id);
    edgeIdsByCoverage.set(id, entries);
  }
  const moduleForLimit = (limit: SourceLimit): readonly ModuleId[] => {
    const owner = fileByPath.get(limit.location.file)?.owner;
    return owner ? [owner] : [];
  };
  const coverage = [...report.coverage].sort((left, right) => utf8Order(left.id, right.id)).map(limit => ({
    limit,
    moduleIds: moduleForLimit(limit),
    edgeIds: ordered(edgeIdsByCoverage.get(limit.id) ?? []),
  }));
  const allSelected = new Set(accessRows.flatMap(item => item.source.selections
    .filter(selection => selection.original !== null)
    .map(selection => selectedKey(selection.original!, selection.exportedName))));
  const view = {
    revision: revision.revision,
    rootModuleId: roots[0]!.id,
    state: report.outcome.coverage === 'complete' ? 'complete' as const : 'partial' as const,
    registry: report.registry,
    modules,
    edges,
    coverage,
    summary: {
      owners: modules.length,
      ownedFiles: inventory.files.length,
      edges: edges.length,
      accessOccurrences: accessRows.length,
      selectedSymbols: allSelected.size,
      deniedAccesses: accessRows.filter(item => item.row.status === 'denied').length,
      limitedAccesses: accessRows.filter(item => item.row.status === 'limited').length,
      coverageNotes: report.coverage.length,
    },
  };
  const observedBytes = Buffer.byteLength(JSON.stringify(view), 'utf8');
  if (observedBytes > maximumProjectViewBytes) {
    return unavailable('The project explorer model exceeds its encoded response limit', {
      maximumBytes: maximumProjectViewBytes,
      observedBytes,
    });
  }
  return { status: 'ready' as const, revision, view };
}
