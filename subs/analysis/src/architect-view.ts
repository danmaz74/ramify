import { originalKey } from '../subs/model/src/index.js';
import type { Destination, Model, ModuleId, ModuleRecord, Original } from '../subs/model/src/interfaces/model.js';
import type { InventoryModule, ProjectOwnership } from '../subs/project/src/interfaces/project.js';
import type { ExportShape, SymbolDetail, SymbolDetailLimits, SymbolDetailRequest, TestFileTitles,
  TestTitleLimits } from '../subs/typescript/src/interfaces/source.js';
import { validFacts } from './api-view.js';
import { readFeatureTitles } from './feature-titles.js';
import type { ArchitectModuleFacts, ArchitectSymbol, ArchitectTestRecord, ArchitectViewProjection,
  ArchitectViewQuery, ArchitectViewQueryOutcome } from './interfaces/architect-view.js';
import { byteOrder } from './report.js';
import type { SessionFacts } from './session-facts.js';

/**
 * Pure joins that build `ArchitectViewProjection` from retained session facts,
 * without filesystem, compiler or retention access. As with the API view, the
 * caller works in two steps: `planArchitectView` names the compiler requests
 * and the `.feature` files a projection needs; once their results are known,
 * `projectArchitectView` performs the same join again and folds them in.
 */

/** The outcomes `projectArchitectView` can give; supersession and cancellation
 * belong to `RetainedSession.architectView`. */
export type ArchitectViewProjectOutcome = Extract<ArchitectViewQueryOutcome, { readonly status: 'projected' }>
  | { readonly status: 'unavailable'; readonly reason: 'resource-limit' | 'analysis-failed'; readonly message: string };
type Unavailable = { readonly status: 'unavailable'; readonly reason: 'analysis-failed'; readonly message: string };

export interface ArchitectViewPlan {
  readonly status: 'planned';
  /** One detail and shape request per selected original, under its `name`, in byte order. */
  readonly requests: readonly SymbolDetailRequest[];
  /** TypeScript and JavaScript files of `testing`-profile areas, in byte order. */
  readonly testFiles: readonly string[];
  /** `.feature` resources of `testing`-profile areas, in byte order. */
  readonly features: readonly string[];
}

/** What the session supplies for a plan: one detail and one shape per request, one
 * title result per test file, and the text of each feature file as captured. */
export interface ArchitectViewProvided {
  readonly details: readonly SymbolDetail[];
  readonly shapes: readonly ExportShape[];
  readonly tests: readonly TestFileTitles[];
  readonly features: readonly { readonly file: string; readonly text: string }[];
}

/** The eight extensions `RetainedSourceAnalysis.testTitles` reads. */
const testSource = /\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;

interface Selected {
  readonly module: ModuleId;
  readonly original: Original;
  readonly name: string;
  readonly file: string;
}
type Boundary = ArchitectModuleFacts['boundaries'][number];
interface Selection {
  readonly modules: readonly { readonly record: ModuleRecord; readonly inventory: InventoryModule }[];
  readonly order: ReadonlyMap<ModuleId, number>;
  /** Each module's declared nested trees, joined to the revision's ownership exclusions. */
  readonly boundaries: ReadonlyMap<ModuleId, readonly Boundary[]>;
  readonly symbols: readonly Selected[];
  readonly testFiles: readonly { readonly module: ModuleId; readonly file: string; readonly feature: boolean }[];
}

const positive = (value: unknown): boolean => Number.isSafeInteger(value) && (value as number) > 0;

/** Why a query's limits cannot be used, or null. Every limit must be a positive safe integer. */
export function architectLimitIssue(query: Pick<ArchitectViewQuery, 'details' | 'tests' | 'maxProjectionBytes'>): string | null {
  const details: SymbolDetailLimits | undefined = query.details, tests: TestTitleLimits | undefined = query.tests;
  const values = [details?.maxSignatureBytes, details?.maxDocumentationBytes, details?.maxOverloads, details?.maxResultBytes,
    tests?.maxTitleBytes, tests?.maxTitlesPerRecord, tests?.maxResultBytes, query.maxProjectionBytes];
  return values.every(positive) ? null : 'Architect view limits must be positive safe integers';
}

const requestKey = (request: SymbolDetailRequest): string => `${originalKey(request.original)} ${request.exportName}`;

/** Modules in tree order: a module before its children, children in byte order. */
function treeOrder(model: Model): ModuleRecord[] | null {
  const children = new Map<ModuleId | null, ModuleRecord[]>();
  for (const module of model.modules) {
    const list = children.get(module.parent) ?? [];
    list.push(module);
    children.set(module.parent, list);
  }
  const roots = children.get(null) ?? [];
  if (roots.length !== 1) return null;
  const ordered: ModuleRecord[] = [];
  const stack = [roots[0]!];
  while (stack.length) {
    const module = stack.pop()!;
    ordered.push(module);
    const below = [...children.get(module.id) ?? []].sort((a, b) => byteOrder(b.id, a.id));
    stack.push(...below);
  }
  return ordered.length === model.modules.length ? ordered : null;
}

/**
 * The project-relative directory a nested-tree statement names, resolved
 * against its module's directory. Valid facts guarantee the statement decoded
 * strictly beneath its module; the result is only ever looked up in the
 * revision's ownership exclusions, never used on its own.
 */
function declaredDirectory(moduleDirectory: string, written: string): string {
  const segments = moduleDirectory === '.' ? [] : moduleDirectory.split('/');
  for (const segment of written.split('/')) {
    if (segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return segments.join('/');
}

/**
 * Each module's declared owned nested and external trees, from its parsed
 * description joined to the scope's ownership exclusions: a statement whose
 * directory is no exclusion of its kind and owner, or a declared exclusion no
 * statement accounts for, makes the facts unusable.
 */
function boundariesOf(modules: readonly InventoryModule[], ownership: ProjectOwnership):
  ReadonlyMap<ModuleId, readonly Boundary[]> | Unavailable {
  const declared = ownership.exclusions.filter(exclusion => exclusion.kind === 'owned-unwired' || exclusion.kind === 'owned-nested-project' || exclusion.kind === 'external');
  const byDirectory = new Map(declared.map(exclusion => [exclusion.directory, exclusion]));
  const claimed = new Set<string>();
  const result = new Map<ModuleId, Boundary[]>();
  for (const module of modules) {
    const boundaries: Boundary[] = [];
    if (module.description.status === 'valid') {
      const document = module.description.document;
      for (const statement of document.statements) {
        if (!('directory' in statement)) continue;
        const dir = declaredDirectory(module.directory, statement.directory.value);
        const exclusion = byDirectory.get(dir);
        if (!exclusion || exclusion.kind !== statement.kind || exclusion.owner !== ((statement.kind === 'owned-unwired' || statement.kind === 'owned-nested-project') ? module.id : null)
          || claimed.has(dir)) {
          return { status: 'unavailable', reason: 'analysis-failed',
            message: `The ${statement.kind} tree "${dir}" that module "${module.id}" declares is not one of the revision's exclusions` };
        }
        claimed.add(dir);
        boundaries.push({ kind: statement.kind, dir, description: document.file, line: statement.span.line, column: statement.span.column });
      }
    }
    result.set(module.id, boundaries.sort((a, b) => byteOrder(a.dir, b.dir)));
  }
  if (claimed.size !== declared.length) {
    return { status: 'unavailable', reason: 'analysis-failed', message: 'A declared tree of the revision has no declaring module statement' };
  }
  return result;
}

/**
 * The join both steps share: the declared modules in tree order, the catalog
 * originals of declared owners that their defining files export, once each
 * under their byte-least export name, and the test files of `testing`-profile
 * areas. A catalog original missing from the model, or a module the inventory
 * and the model disagree on, makes the facts unusable.
 */
function select(facts: SessionFacts): Selection | Unavailable {
  const invalid = validFacts(facts);
  if (invalid) return invalid;
  const model = facts.model!, inventory = facts.inventory!;
  const ordered = treeOrder(model);
  if (!ordered) return { status: 'unavailable', reason: 'analysis-failed', message: 'The linked model is not one module tree' };
  const inventoryModules = new Map(inventory.modules.map(module => [module.id, module]));
  if (inventoryModules.size !== ordered.length) {
    return { status: 'unavailable', reason: 'analysis-failed', message: 'The inventory and the linked model declare different modules' };
  }
  const modules: { record: ModuleRecord; inventory: InventoryModule }[] = [];
  for (const record of ordered) {
    const found = inventoryModules.get(record.id);
    if (!found) return { status: 'unavailable', reason: 'analysis-failed', message: `Module "${record.id}" is missing from the inventory` };
    modules.push({ record, inventory: found });
  }
  const order = new Map(ordered.map((module, index) => [module.id, index]));
  const boundaries = boundariesOf(modules.map(module => module.inventory), inventory.scope.ownership);
  if ('status' in boundaries) return boundaries;
  const originals = new Map(model.originals.map(original => [originalKey(original.id), original]));
  const files = new Map(facts.catalog.files.map(file => [file.file, file]));
  const seen = new Set<string>();
  const symbols: Selected[] = [];
  for (const candidate of facts.catalog.originals) {
    const key = originalKey(candidate.id);
    if (seen.has(key) || !order.has(candidate.id.owner)) continue;
    seen.add(key);
    const file = candidate.origin.file;
    const names = (files.get(file)?.exports ?? []).filter(entry => entry.original && originalKey(entry.original) === key)
      .map(entry => entry.name).sort(byteOrder);
    if (!names.length) continue;
    const original = originals.get(key);
    if (!original) return { status: 'unavailable', reason: 'analysis-failed', message: `Original ${key} is missing from the linked model` };
    symbols.push({ module: candidate.id.owner, original, name: names[0]!, file });
  }
  symbols.sort((a, b) => order.get(a.module)! - order.get(b.module)! || byteOrder(a.name, b.name) || byteOrder(a.file, b.file)
    || byteOrder(originalKey(a.original.id), originalKey(b.original.id)));
  const testing = new Set(model.modules.flatMap(module => module.areas.filter(area => area.profile.includes('testing'))
    .map(area => `${area.owner}\u0000${area.kind}`)));
  const testFiles = inventory.files.filter(file => testing.has(`${file.owner}\u0000${file.area}`)
    && (file.kind === 'source' ? testSource.test(file.path) : file.path.endsWith('.feature')))
    .map(file => ({ module: file.owner, file: file.path, feature: file.kind === 'resource' }))
    .sort((a, b) => order.get(a.module)! - order.get(b.module)! || byteOrder(a.file, b.file));
  return { modules, order, boundaries, symbols, testFiles };
}

/** The compiler requests and `.feature` files a projection of `facts` needs. */
export function planArchitectView(facts: SessionFacts): ArchitectViewPlan | Unavailable {
  const selection = select(facts);
  if ('status' in selection) return selection;
  return {
    status: 'planned',
    requests: selection.symbols.map(symbol => ({ original: symbol.original.id, exportName: symbol.name }))
      .sort((a, b) => byteOrder(requestKey(a), requestKey(b))),
    testFiles: selection.testFiles.filter(file => !file.feature).map(file => file.file).sort(byteOrder),
    features: selection.testFiles.filter(file => file.feature).map(file => file.file).sort(byteOrder),
  };
}

function moduleFacts(selection: Selection, facts: SessionFacts): ArchitectModuleFacts[] {
  const directory = (module: InventoryModule): string => module.directory === '.' ? '' : module.directory;
  const docsRoots = new Map(selection.modules.map(({ inventory }) => [inventory.id, `${directory(inventory) ? `${directory(inventory)}/` : ''}src/docs/`]));
  const own = new Map<ModuleId, number>(), docs = new Map<ModuleId, string[]>(), children = new Map<ModuleId, ModuleId[]>();
  for (const file of facts.inventory!.files) {
    if (file.kind === 'source') own.set(file.owner, (own.get(file.owner) ?? 0) + 1);
    if (file.path.startsWith(docsRoots.get(file.owner) ?? '\u0000')) docs.set(file.owner, [...docs.get(file.owner) ?? [], file.path]);
  }
  const subtree = new Map<ModuleId, number>();
  // Children follow their parent in tree order, so a reverse pass sums each subtree once.
  for (const { record } of [...selection.modules].reverse()) {
    subtree.set(record.id, (subtree.get(record.id) ?? 0) + (own.get(record.id) ?? 0));
    if (record.parent === null) continue;
    subtree.set(record.parent, (subtree.get(record.parent) ?? 0) + subtree.get(record.id)!);
    children.set(record.parent, [...children.get(record.parent) ?? [], record.id]);
  }
  return selection.modules.map(({ record, inventory: module }) => ({
    module: record.id, dir: directory(module), parent: record.parent,
    children: [...children.get(record.id) ?? []].sort(byteOrder),
    tags: [...record.headerTags],
    areas: module.areas.filter(area => area.present).map(area => area.kind === 'ordinary' ? 'src' : 'src/tests').sort(byteOrder),
    boundaries: [...selection.boundaries.get(record.id) ?? []],
    purpose: module.purpose.state === 'present' ? { state: 'present', path: module.purpose.readme, text: module.purpose.paragraph } : { state: 'missing' },
    docs: [...docs.get(record.id) ?? []].sort(byteOrder),
    files: { own: own.get(record.id) ?? 0, subtree: subtree.get(record.id) ?? 0 },
  }));
}

/** Owner exposures and effective relays of each original, by original key. */
function exposureIndex(model: Model, depth: ReadonlyMap<ModuleId, number>) {
  const owned = new Map<string, { destinations: Set<Destination>; names: Set<string> }>();
  const relayed = new Map<string, Map<ModuleId, Set<Destination>>>();
  for (const exposure of model.exposures) {
    const key = originalKey(exposure.original);
    if (exposure.provider === null) {
      if (exposure.module !== exposure.original.owner) continue;
      const entry = owned.get(key) ?? { destinations: new Set(), names: new Set() };
      for (const destination of exposure.destinations) entry.destinations.add(destination);
      for (const name of exposure.names) entry.names.add(name);
      owned.set(key, entry);
    } else if (exposure.effective) {
      const byModule = relayed.get(key) ?? new Map<ModuleId, Set<Destination>>();
      const destinations = byModule.get(exposure.module) ?? new Set<Destination>();
      for (const destination of exposure.destinations) destinations.add(destination);
      byModule.set(exposure.module, destinations);
      relayed.set(key, byModule);
    }
  }
  const reexposed = (key: string) => [...relayed.get(key) ?? []]
    .sort(([a], [b]) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0) || byteOrder(a, b))
    .map(([by, to]) => ({ by, to: [...to].sort(byteOrder) }));
  return { owned, reexposed };
}

function lookup<T>(values: readonly T[], keyOf: (value: T) => string, what: string): (key: string) => T {
  const map = new Map(values.map(value => [keyOf(value), value]));
  return key => {
    const found = map.get(key);
    if (found === undefined) throw new Error(`No ${what} was provided for ${key}`);
    return found;
  };
}

/** The feature's records, its scenarios split at `maxTitlesPerRecord`; none when it names no feature and no scenario. */
function featureRecords(module: ModuleId, file: string, text: string, limits: TestTitleLimits): { records: ArchitectTestRecord[]; cut: number } {
  const titles = readFeatureTitles(text, limits);
  if (titles.feature === null && !titles.scenarios.length) return { records: [], cut: titles.cut };
  const records: ArchitectTestRecord[] = [];
  for (let start = 0; start === 0 || start < titles.scenarios.length; start += limits.maxTitlesPerRecord) {
    records.push({ kind: 'feature', module, file, feature: titles.feature,
      scenarios: titles.scenarios.slice(start, start + limits.maxTitlesPerRecord) });
  }
  return { records, cut: titles.cut };
}

/**
 * The complete projection of `facts` at `sequence`/`inputId`, folding in the
 * results the session obtained for `planArchitectView(facts)`. A result missing
 * for a planned request or file throws: the caller skipped or mismatched a
 * request. Performs no filesystem, compiler or retention access and returns no
 * partial projection: invalid limits or an encoded size above
 * `maxProjectionBytes` answer `resource-limit`.
 */
export function projectArchitectView(facts: SessionFacts, sequence: number, inputId: string, provided: ArchitectViewProvided,
  limits: Pick<ArchitectViewQuery, 'details' | 'tests' | 'maxProjectionBytes'>): ArchitectViewProjectOutcome {
  const selection = select(facts);
  if ('status' in selection) return selection;
  const issue = architectLimitIssue(limits);
  if (issue) return { status: 'unavailable', reason: 'resource-limit', message: issue };
  const model = facts.model!;
  const modules = moduleFacts(selection, facts);
  const depth = new Map(modules.map(module => [module.module, module.module.split('/').length]));
  const { owned, reexposed } = exposureIndex(model, depth);
  const detailOf = lookup(provided.details, detail => requestKey(detail), 'symbol detail');
  const shapeOf = lookup(provided.shapes, shape => requestKey(shape), 'export shape');
  const titlesOf = lookup(provided.tests, titles => titles.file, 'test titles');
  const textOf = lookup(provided.features, feature => feature.file, 'feature text');
  const counts = { coverage: 0, detailsUnavailable: 0, unknownShapes: 0, dynamicTitles: 0, testsUnavailable: 0, cut: 0 };
  const symbols: ArchitectSymbol[] = selection.symbols.map(({ module, original, name, file }) => {
    const key = originalKey(original.id);
    const request = requestKey({ original: original.id, exportName: name });
    const detail = detailOf(request), shape = shapeOf(request);
    // An unresolved export comes back as an `unknown` value; an original without a
    // runtime value stays supporting whatever the compiler answered.
    const behavior = original.hasValue ? shape.behavior : null;
    const exposure = owned.get(key);
    if (detail.state === 'unavailable') counts.detailsUnavailable++;
    else if (detail.state === 'truncated') counts.cut++;
    if (behavior === 'unknown') counts.unknownShapes++;
    return {
      module, original: original.id, name,
      binding: name === 'default' && original.id.binding !== 'default' ? original.id.binding : null,
      exposureNames: [...exposure?.names ?? []].filter(candidate => candidate !== name).sort(byteOrder),
      role: exposure ? 'exposed' : 'internal',
      destinations: [...exposure?.destinations ?? []].sort(byteOrder),
      kind: shape.kind, behavior, hasValue: original.hasValue, tags: [...original.tags],
      reexposed: reexposed(key), detail, file,
    };
  });
  const tests: ArchitectTestRecord[] = [];
  for (const { module, file, feature } of selection.testFiles) {
    if (feature) {
      const read = featureRecords(module, file, textOf(file).text, limits.tests);
      tests.push(...read.records);
      counts.cut += read.cut;
      continue;
    }
    const titles = titlesOf(file);
    if (titles.state === 'unavailable') { counts.testsUnavailable++; continue; }
    counts.dynamicTitles += titles.dynamic;
    counts.cut += titles.cut;
    for (const entry of titles.suites) tests.push({ kind: 'suite', module, file, suite: entry.suite, tests: entry.tests });
  }
  // The catalog limits a check report publishes: a resource description counts only when the inventory references it.
  counts.coverage = new Set(facts.catalog.coverage.filter(note => note.code !== 'resource-description'
    || facts.inventory!.references.some(reference => reference.normalized === note.location.file)).map(note => note.id)).size;
  const draft = { schema: 'ramify.architect-projection/3' as const, sequence, inputId, root: modules[0]!.module,
    modules, symbols, tests, counts, bytes: 0 };
  const bytes = Buffer.byteLength(JSON.stringify(draft), 'utf8');
  if (bytes > limits.maxProjectionBytes) {
    return { status: 'unavailable', reason: 'resource-limit',
      message: `Architect projection is ${bytes} bytes, over the ${limits.maxProjectionBytes}-byte limit` };
  }
  const projection: ArchitectViewProjection = { ...draft, bytes };
  return { status: 'projected', sequence, inputId, projection };
}
