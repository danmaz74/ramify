import type { AnalysisReport } from './interfaces/analysis.js';
import type {
  LoadVariants,
  Metric,
  MetricCoverage,
  OwnershipModule,
  Ratio,
  SourceFilter,
} from './interfaces/modularity.js';
import type { ModuleId, OriginalId, SourceOrigin } from '../subs/model/src/interfaces/model.js';
import type { InventoryFile } from '../subs/project/src/interfaces/project.js';
import type { CatalogOriginal, SourceAccess } from '../subs/typescript/src/interfaces/source.js';

/**
 * Shared facts of the modularity projection: ordering, ratios, the ownership
 * resolver, per-occurrence facts and coverage attribution. See
 * docs/architecture/modularity-report.spec.md.
 */

export type CompleteReport = AnalysisReport & {
  readonly inputId: string;
  readonly registry: NonNullable<AnalysisReport['registry']>;
  readonly snapshot: NonNullable<AnalysisReport['snapshot']> & {
    readonly catalog: NonNullable<NonNullable<AnalysisReport['snapshot']>['catalog']>;
    readonly model: NonNullable<NonNullable<AnalysisReport['snapshot']>['model']>;
  };
};

/** A completed analysis with the registry, snapshot, catalog and model every projection reads. */
export function completeReport(report: AnalysisReport): report is CompleteReport {
  return report.outcome.execution === 'completed' && report.inputId !== null && report.registry !== null
    && report.snapshot !== null && report.snapshot.catalog !== null && report.snapshot.model !== null;
}

/** UTF-8 byte order without encoding: UTF-16 units reordered to code point order. */
export function byteOrder(left: string, right: string): number {
  if (left === right) return 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    let a = left.charCodeAt(index);
    let b = right.charCodeAt(index);
    if (a === b) continue;
    if (a >= 0xd800) a += a < 0xe000 ? 0x2000 : -0x800;
    if (b >= 0xd800) b += b < 0xe000 ? 0x2000 : -0x800;
    return a - b;
  }
  return left.length - right.length;
}
export function sequenceOrder(left: readonly string[], right: readonly string[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const order = byteOrder(left[index]!, right[index]!);
    if (order) return order;
  }
  return left.length - right.length;
}
export function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
export const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort(byteOrder);

export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}
export function variants<T>(build: (variant: LoadVariant) => T): LoadVariants<T> {
  return { all: build('all'), runtime: build('runtime'), typeOnly: build('typeOnly') };
}
export type LoadVariant = keyof LoadVariants<unknown>;
export const loadVariants: readonly LoadVariant[] = ['all', 'runtime', 'typeOnly'];
export const inVariant = (occurrence: Occurrence, variant: LoadVariant): boolean =>
  variant === 'all' || occurrence.runtime === (variant === 'runtime');

/**
 * The ownership in use. Declared ownership reads the inventory; iteration 5
 * substitutes a validated candidate mapping behind the same interface.
 */
export interface OwnershipResolver {
  readonly mode: 'declared' | 'candidate';
  readonly candidateId: string | null;
  /** The ownership tree in use, ordered by id. */
  readonly modules: readonly OwnershipModule[];
  /** The owner of an inventory file, or null for a path outside the inventory. */
  ownerOf(path: string): ModuleId | null;
  /** False under candidate ownership: declared exposures do not describe candidate modules. */
  readonly declaredExposure: boolean;
}

export function declaredOwnership(report: CompleteReport): OwnershipResolver {
  const owners = new Map(report.snapshot.inventory.files.map(file => [file.path, file.owner]));
  const modules = report.snapshot.model.modules
    .map(module => ({ id: module.id, name: module.name, parent: module.parent, headerTags: [...module.headerTags] }))
    .sort((left, right) => byteOrder(left.id, right.id));
  return { mode: 'declared', candidateId: null, modules, ownerOf: path => owners.get(path) ?? null, declaredExposure: true };
}

/** Tree queries over the ownership in use. */
export class OwnershipTree {
  readonly ids: readonly ModuleId[];
  private readonly parents: ReadonlyMap<ModuleId, ModuleId | null>;
  private readonly subtrees = new Map<ModuleId, ReadonlySet<ModuleId>>();

  constructor(readonly ownership: OwnershipResolver) {
    this.ids = ownership.modules.map(module => module.id);
    this.parents = new Map(ownership.modules.map(module => [module.id, module.parent]));
    const children = new Map<ModuleId, ModuleId[]>();
    for (const module of ownership.modules) if (module.parent !== null) {
      push(children, module.parent, module.id);
    }
    const collect = (id: ModuleId, into: Set<ModuleId>): Set<ModuleId> => {
      into.add(id);
      for (const child of children.get(id) ?? []) if (!into.has(child)) collect(child, into);
      return into;
    };
    for (const id of this.ids) this.subtrees.set(id, collect(id, new Set()));
  }

  subtree(id: ModuleId): ReadonlySet<ModuleId> {
    return this.subtrees.get(id) ?? new Set([id]);
  }

  /** Whether `ancestor` is a proper ancestor of `id`. */
  private above(ancestor: ModuleId, id: ModuleId): boolean {
    const seen = new Set<ModuleId>();
    for (let current = this.parents.get(id) ?? null; current !== null && !seen.has(current); current = this.parents.get(current) ?? null) {
      if (current === ancestor) return true;
      seen.add(current);
    }
    return false;
  }

  /** The provider's relation to the consumer. */
  relation(consumer: ModuleId, provider: ModuleId): 'child' | 'descendant' | 'parent' | 'ancestor' | 'unrelated' {
    if (this.parents.get(provider) === consumer) return 'child';
    if (this.above(consumer, provider)) return 'descendant';
    if (this.parents.get(consumer) === provider) return 'parent';
    if (this.above(provider, consumer)) return 'ancestor';
    return 'unrelated';
  }
}

/** One access occurrence with its ownership and coverage facts resolved once. */
export interface Occurrence {
  readonly access: SourceAccess;
  readonly importer: string;
  readonly consumer: ModuleId;
  readonly kind: 'application' | 'external' | 'outside-module' | 'unresolved';
  /** Target file and its owner, for an application occurrence. */
  readonly target: string | null;
  readonly provider: ModuleId | null;
  readonly runtime: boolean;
  /** Distinct selected-symbol keys. */
  readonly symbols: readonly string[];
  /** Distinct original identity keys of the selections. */
  readonly originals: readonly string[];
  readonly limitIds: readonly string[];
  readonly unattributed: boolean;
  readonly unresolvedSelection: boolean;
}
export const crossOwner = (occurrence: Occurrence): boolean =>
  occurrence.kind === 'application' && occurrence.provider !== occurrence.consumer;

interface FileLimits { readonly ids: readonly string[] }

/** Coverage attribution shared by every metric; see the spec's "Scope of a metric". */
export class CoverageFacts {
  private readonly files = new Map<string, FileLimits>();
  readonly globalLimitIds: readonly string[];

  constructor(report: CompleteReport) {
    const inventory = new Map(report.snapshot.inventory.files.map(file => [file.path, file]));
    const add = (path: string, ids: readonly string[]) => {
      this.files.set(path, { ids: [...(this.files.get(path)?.ids ?? []), ...ids] });
    };
    for (const exports of report.snapshot.catalog.files) {
      // Rule 4 reads export descriptions of source files; resource descriptions surface through access limits.
      if (exports.state !== 'complete' && inventory.get(exports.file)?.kind === 'source') add(exports.file, exports.issueIds);
    }
    const global: string[] = [];
    for (const limit of report.coverage) {
      if (inventory.has(limit.location.file)) add(limit.location.file, [limit.id]);
      else global.push(limit.id);
    }
    this.globalLimitIds = sorted(global);
  }

  scope(): CoverageScope {
    return new CoverageScope(this);
  }
  fileLimits(path: string): FileLimits | undefined {
    return this.files.get(path);
  }
}

export class CoverageScope {
  private readonly limitIds = new Set<string>();
  private unattributed = 0;
  private unknown = 0;
  private partial = false;

  constructor(private readonly facts: CoverageFacts) {}

  /** An occurrence in scope; `fromScopeFile` when its importer is one of the scope's files. */
  occurrence(occurrence: Occurrence, fromScopeFile: boolean): this {
    if (occurrence.limitIds.length) {
      this.partial = true;
      for (const id of occurrence.limitIds) this.limitIds.add(id);
    }
    if (occurrence.unresolvedSelection) this.partial = true;
    if (fromScopeFile && occurrence.unattributed) {
      this.partial = true;
      this.unattributed++;
    }
    return this;
  }
  file(path: string): this {
    const limits = this.facts.fileLimits(path);
    if (limits) {
      this.partial = true;
      for (const id of limits.ids) this.limitIds.add(id);
    }
    return this;
  }
  files(paths: Iterable<string>): this {
    for (const path of paths) this.file(path);
    return this;
  }
  /** Behavior rule 6: an unknown dependency, a named limit or a failed classification. */
  behavior(limitIds: readonly string[], unknownDependency: boolean, failed = false): this {
    if (limitIds.length || unknownDependency || failed) this.partial = true;
    for (const id of limitIds) this.limitIds.add(id);
    if (unknownDependency) this.unknown++;
    return this;
  }
  merge(coverage: MetricCoverage | null): this {
    if (!coverage) return this;
    this.partial = true;
    for (const id of coverage.limitIds) this.limitIds.add(id);
    this.unattributed += coverage.unattributedAccesses;
    this.unknown += coverage.unknownDependencies;
    return this;
  }
  metric<T>(value: T): Metric<T> {
    for (const id of this.facts.globalLimitIds) this.limitIds.add(id);
    if (!this.partial && !this.facts.globalLimitIds.length) return { state: 'measured', value };
    return { state: 'partial', observed: value, coverage: {
      limitIds: sorted(this.limitIds), unattributedAccesses: this.unattributed, unknownDependencies: this.unknown,
    } };
  }
}

export const metricValue = <T>(metric: Metric<T>): T | null =>
  metric.state === 'measured' ? metric.value : metric.state === 'partial' ? metric.observed : null;
export const metricCoverage = (metric: Metric<unknown>): MetricCoverage | null =>
  metric.state === 'partial' ? metric.coverage : null;

/** Original identities and selected symbols independent of the declared `owner` field. */
export class OriginalFacts {
  private readonly defining = new Map<string, string>();
  private readonly roots = new Map<ModuleId, string>();
  readonly catalog = new Map<string, CatalogOriginal>();

  constructor(report: CompleteReport) {
    for (const area of report.snapshot.areas) if (area.kind === 'ordinary') this.roots.set(area.owner, area.root);
    for (const original of report.snapshot.catalog.originals) {
      this.defining.set(declaredKey(original.id), original.origin.file);
      this.catalog.set(this.identity(original.id), original);
    }
  }

  /** The project-relative defining file; `OriginalId.file` is relative to its declared owner's `src/`. */
  definingFile(original: OriginalId): string {
    const known = this.defining.get(declaredKey(original));
    if (known !== undefined) return known;
    const root = this.roots.get(original.owner);
    return root === undefined ? original.file : `${root}/${original.file}`;
  }
  identity(original: OriginalId): string {
    return JSON.stringify([original.kind, this.definingFile(original), original.binding]);
  }
  symbol(original: OriginalId, exportedName: string): string {
    return JSON.stringify([original.kind, this.definingFile(original), original.binding, exportedName]);
  }
}
const declaredKey = (original: OriginalId): string =>
  JSON.stringify([original.kind, original.owner, original.file, original.binding]);

/** Testing classification is fixed by declarations; candidate ownership may not change it. */
export function testingClassified(report: CompleteReport, file: InventoryFile): boolean {
  if (file.area === 'tests') return true;
  return report.snapshot.areas.some(area => area.owner === file.owner && area.kind === 'ordinary'
    && area.profile.includes('testing'));
}

export function resolveOccurrence(access: SourceAccess, ownership: OwnershipResolver, originals: OriginalFacts): Occurrence {
  const owner = (origin: SourceOrigin) => ownership.ownerOf(origin.file) ?? origin.area.owner;
  const target = access.target;
  const selected = access.selections.filter(selection => selection.original !== null);
  return {
    access,
    importer: access.importer.file,
    consumer: owner(access.importer),
    kind: target.kind,
    target: target.kind === 'application' ? target.origin.file : null,
    provider: target.kind === 'application' ? owner(target.origin) : null,
    runtime: access.runtimeLoad,
    symbols: sorted(selected.map(selection => originals.symbol(selection.original!, selection.exportedName))),
    originals: sorted(selected.map(selection => originals.identity(selection.original!))),
    limitIds: sorted(access.coverageIds),
    unattributed: target.kind === 'unresolved' || target.kind === 'outside-module',
    // External selections never resolve to an original; only application selections bear on coverage.
    unresolvedSelection: target.kind === 'application' && access.selections.some(selection => selection.status !== 'resolved'),
  };
}

/** The files, resources and occurrences of one source filter. */
export interface ViewFacts {
  readonly filter: SourceFilter;
  /** Subset source files by owner, each list in byte order. */
  readonly filesByOwner: ReadonlyMap<ModuleId, readonly string[]>;
  readonly resourcesByOwner: ReadonlyMap<ModuleId, readonly InventoryFile[]>;
  readonly sources: ReadonlyMap<string, InventoryFile>;
  readonly occurrences: readonly Occurrence[];
}

export function viewFacts(report: CompleteReport, filter: SourceFilter, ownership: OwnershipResolver,
  occurrences: readonly Occurrence[]): ViewFacts {
  const filesByOwner = new Map<ModuleId, string[]>();
  const resourcesByOwner = new Map<ModuleId, InventoryFile[]>();
  const sources = new Map<string, InventoryFile>();
  const files = [...report.snapshot.inventory.files].sort((left, right) => byteOrder(left.path, right.path));
  for (const file of files) {
    if (testingClassified(report, file) !== (filter === 'test')) continue;
    const owner = ownership.ownerOf(file.path) ?? file.owner;
    if (file.kind === 'source') {
      sources.set(file.path, file);
      push(filesByOwner, owner, file.path);
    } else {
      push(resourcesByOwner, owner, file);
    }
  }
  return {
    filter, filesByOwner, resourcesByOwner, sources,
    occurrences: occurrences.filter(occurrence => sources.has(occurrence.importer)),
  };
}
