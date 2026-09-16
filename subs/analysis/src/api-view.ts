import { listAvailableOriginals, originalKey } from '../subs/model/src/index.js';
import type { Model, ModuleId, OriginalId, SourceArea } from '../subs/model/src/interfaces/model.js';
import type { ProjectInventory } from '../subs/project/src/interfaces/project.js';
import type { SourceCatalog, SymbolDetail, SymbolDetailRequest } from '../subs/typescript/src/interfaces/source.js';
import type {
  ApiViewAreaProjection, ApiViewCategory, ApiViewEntry, ApiViewFile, ApiViewModuleProjection,
  ApiViewProjection, ApiViewQueryOutcome, ApiViewSelection,
} from './interfaces/session.js';
import { byteOrder } from './report.js';
import type { SessionFacts } from './session-facts.js';

/**
 * Pure joins that materialize `ApiViewProjection` from retained session facts,
 * without filesystem, compiler or retention access. `SymbolDetail` extraction
 * is asynchronous and owned by `analysis/typescript`; this module never calls
 * it. Callers split the work in two: `planApiViewRequests` names the unique
 * `SymbolDetailRequest`s a query needs, then, once their `SymbolDetail`
 * results are known, `projectApiView` performs the same deterministic join a
 * second time (a cheap pure computation, not a second project inventory or
 * model build) and folds each result in through a synchronous `detailsOf`
 * lookup, enforcing the area and invocation byte bounds before returning.
 */

/** The outcome of `projectApiView`, minus the sequence/cancellation states
 * that only `RetainedSession.apiView` (iteration 7) can produce: it never
 * compares against a later observation and never crosses an abortable
 * asynchronous boundary itself. */
export type ApiViewProjectOutcome = Exclude<ApiViewQueryOutcome, { readonly status: 'superseded' | 'cancelled' }>;

interface JoinedEntry {
  readonly name: string;
  readonly form: ApiViewEntry['form'];
  readonly original: OriginalId;
  readonly category: ApiViewCategory;
  readonly definingFile: string;
}
type JoinOutcome =
  | { readonly status: 'ok'; readonly entries: readonly JoinedEntry[] }
  | { readonly status: 'invalid-projection'; readonly message: string };
type ModuleResolution =
  | { readonly status: 'ok'; readonly modules: readonly ProjectInventory['modules'][number][] }
  | { readonly status: 'invalid-location'; readonly message: string };

/** A canonical project-relative path: `/`-separated, no leading/trailing
 * slash, no empty, `.` or `..` segment. Mirrors `project`'s own `validPath`
 * check locally, since that helper is not exposed outside its owner. */
function canonicalPath(path: unknown): path is string {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !path.endsWith('/')
    && path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

function invalid(reason: 'analysis-failed', message: string): { readonly status: 'unavailable'; readonly reason: 'analysis-failed'; readonly message: string } {
  return { status: 'unavailable', reason, message };
}

/** Facts must represent one completed, model-bearing analysis: an access
 * decision or import-check failure never blocks a view, but an invalid
 * acquisition, area derivation or link stage does. */
function validFacts(facts: SessionFacts): ReturnType<typeof invalid> | null {
  if (facts.invalid) return invalid('analysis-failed', 'Session facts record an invalid acquisition');
  if (!facts.inventory) return invalid('analysis-failed', 'Session facts have no inventory');
  if (facts.areaIssues.length) return invalid('analysis-failed', 'Session facts have unresolved source-area issues');
  if (facts.linkIssues.length || !facts.model) return invalid('analysis-failed', 'Session facts have no valid model');
  return null;
}

/** The declared module whose directory is the longest prefix of `from`, or
 * every inventory module in byte order for `scope: 'all'`. A module's own
 * root always matches (its directory is `.`), so an invalid location is
 * reserved for a non-canonical `from` string. */
function resolveModules(inventory: ProjectInventory, selection: ApiViewSelection): ModuleResolution {
  const modules = [...inventory.modules].sort((a, b) => byteOrder(a.directory, b.directory));
  if (selection.scope === 'all') return { status: 'ok', modules };
  const { from } = selection;
  if (from !== '.' && !canonicalPath(from)) {
    return { status: 'invalid-location', message: `"${String(from)}" is not a canonical project-relative path` };
  }
  const target = from === '.' ? [] : from.split('/');
  let best: ProjectInventory['modules'][number] | null = null;
  let bestLength = -1;
  for (const candidate of modules) {
    const directory = candidate.directory === '.' ? [] : candidate.directory.split('/');
    if (directory.length > target.length || directory.length <= bestLength) continue;
    if (directory.every((segment, index) => segment === target[index])) { best = candidate; bestLength = directory.length; }
  }
  if (!best) return { status: 'invalid-location', message: `No declared module directory contains "${from}"` };
  return { status: 'ok', modules: [best] };
}

function parentIndex(model: Model): ReadonlyMap<ModuleId, ModuleId | null> {
  return new Map(model.modules.map(module => [module.id, module.parent]));
}
function originalsIndex(model: Model): ReadonlyMap<string, Model['originals'][number]> {
  return new Map(model.originals.map(original => [originalKey(original.id), original]));
}

/** `children` when `originalOwner` is a proper descendant of `consumerOwner`
 * at any depth; `external` otherwise (ancestor, sibling or cousin). Same-owner
 * originals never reach this: `listAvailableOriginals` already excludes them. */
function categoryFor(consumerOwner: ModuleId, originalOwner: ModuleId, ancestry: ReadonlyMap<ModuleId, ModuleId | null>): ApiViewCategory {
  let current = ancestry.get(originalOwner) ?? null;
  while (current !== null) {
    if (current === consumerOwner) return 'children';
    current = ancestry.get(current) ?? null;
  }
  return 'external';
}

/**
 * Every available original of `area`, joined to its defining-file export
 * names and classified by owner ancestry.
 *
 * `OriginalId.file` (the identity `listAvailableOriginals` returns) is
 * relative to the *original's own owner's* `src/`, the same convention the
 * TypeScript adapter's `SymbolDetailRequest.original` uses; it is not the
 * project-relative path the generated document and `SourceCatalog.files`
 * both key on. The join therefore resolves each available identity back to
 * its full `Original` record for `origin.file` (project-relative,
 * `SourceOrigin`'s own convention) before looking up its defining file's
 * export table. A missing model record, a non-canonical `origin.file`, an
 * absent catalog file, or zero matching export names for the identity makes
 * the whole join `invalid-projection`: the catalog and model disagree, and
 * the entry is never silently dropped.
 */
function joinArea(model: Model, catalog: SourceCatalog, consumerOwner: ModuleId, area: SourceArea,
  ancestry: ReadonlyMap<ModuleId, ModuleId | null>, originals: ReadonlyMap<string, Model['originals'][number]>): JoinOutcome {
  const filesByPath = new Map(catalog.files.map(file => [file.file, file]));
  const entries: JoinedEntry[] = [];
  for (const available of listAvailableOriginals(model, area)) {
    const identity = available.original;
    const key = originalKey(identity);
    const full = originals.get(key);
    if (!full) return { status: 'invalid-projection', message: `Original ${key} is available but missing from the linked model's original list` };
    const definingFile = full.origin.file;
    if (!canonicalPath(definingFile)) {
      return { status: 'invalid-projection', message: `Original ${key} has a non-canonical defining file path "${String(definingFile)}"` };
    }
    const file = filesByPath.get(definingFile);
    const matches = file ? file.exports.filter(candidate => candidate.original && originalKey(candidate.original) === key) : [];
    if (!matches.length) {
      return { status: 'invalid-projection', message: `Original ${key} has no defining export name in "${definingFile}"` };
    }
    const category = categoryFor(consumerOwner, identity.owner, ancestry);
    for (const exported of matches) entries.push({ name: exported.name, form: available.form, original: identity, category, definingFile });
  }
  return { status: 'ok', entries };
}

function requestKey(request: SymbolDetailRequest): string {
  return `${originalKey(request.original)} ${request.exportName}`;
}
function requestOrder(a: SymbolDetailRequest, b: SymbolDetailRequest): number {
  return byteOrder(requestKey(a), requestKey(b));
}

/** The unique `SymbolDetailRequest`s a query needs, across every module and
 * area it will project, in byte order. Callers fetch every result with one
 * `RetainedSourceAnalysis.details(...)` call before calling `projectApiView`. */
export function planApiViewRequests(facts: SessionFacts, selection: ApiViewSelection):
  | { readonly status: 'planned'; readonly requests: readonly SymbolDetailRequest[] }
  | { readonly status: 'unavailable'; readonly reason: 'invalid-location' | 'invalid-projection' | 'analysis-failed'; readonly message: string } {
  const invalidFacts = validFacts(facts);
  if (invalidFacts) return invalidFacts;
  const resolved = resolveModules(facts.inventory!, selection);
  if (resolved.status === 'invalid-location') return { status: 'unavailable', reason: 'invalid-location', message: resolved.message };
  const ancestry = parentIndex(facts.model!);
  const originals = originalsIndex(facts.model!);
  const requests = new Map<string, SymbolDetailRequest>();
  for (const inventoryModule of resolved.modules) {
    const moduleRecord = facts.model!.modules.find(candidate => candidate.id === inventoryModule.id);
    if (!moduleRecord) return { status: 'unavailable', reason: 'invalid-projection', message: `Module "${inventoryModule.id}" is missing from the linked model` };
    const areas = [];
    if (inventoryModule.areas.find(candidate => candidate.kind === 'ordinary')?.present) {
      areas.push(moduleRecord.areas.find(candidate => candidate.kind === 'ordinary')!);
    }
    if (inventoryModule.areas.find(candidate => candidate.kind === 'tests')?.present) {
      areas.push(moduleRecord.areas.find(candidate => candidate.kind === 'tests')!);
    }
    for (const area of areas) {
      const joined = joinArea(facts.model!, facts.catalog, moduleRecord.id, area, ancestry, originals);
      if (joined.status === 'invalid-projection') return { status: 'unavailable', reason: 'invalid-projection', message: joined.message };
      for (const entry of joined.entries) {
        const request: SymbolDetailRequest = { original: entry.original, exportName: entry.name };
        requests.set(requestKey(request), request);
      }
    }
  }
  return { status: 'planned', requests: [...requests.values()].sort(requestOrder) };
}

function groupEntries(entries: readonly JoinedEntry[], detailsOf: (request: SymbolDetailRequest) => SymbolDetail): ApiViewFile[] {
  const groups = new Map<string, { category: ApiViewCategory; definingFile: string; entries: ApiViewEntry[] }>();
  for (const entry of entries) {
    const key = `${entry.category} ${entry.definingFile}`;
    let group = groups.get(key);
    if (!group) { group = { category: entry.category, definingFile: entry.definingFile, entries: [] }; groups.set(key, group); }
    group.entries.push({ name: entry.name, form: entry.form, detail: detailsOf({ original: entry.original, exportName: entry.name }) });
  }
  return [...groups.values()]
    .map(group => ({ ...group, entries: [...group.entries].sort((a, b) => byteOrder(a.name, b.name)) }))
    .sort((a, b) => byteOrder(a.category, b.category) || byteOrder(a.definingFile, b.definingFile));
}

/** Distinct catalog/source-description limits (`facts.catalog.coverage`) that
 * may have omitted an API visible to `area`: a foreign file's limit counts
 * only when that file's owner is not testing-blocked from `area`'s profile,
 * mirroring the same test `listAvailableOriginals` applies to availability
 * itself. An access-only limit (`facts.files[*].coverage`, from interpreting
 * one file's own accesses) never contributes: it cannot hide a foreign API,
 * only how one file happens to use it. */
function coverageCount(facts: SessionFacts, consumerOwner: ModuleId, area: SourceArea): number {
  const owners = new Map(facts.inventory!.files.map(file => [file.path, file]));
  const ids = new Set<string>();
  for (const note of facts.catalog.coverage) {
    const owned = owners.get(note.location.file);
    if (!owned || owned.owner === consumerOwner) continue;
    const ownerModule = facts.model!.modules.find(candidate => candidate.id === owned.owner);
    const originArea = ownerModule?.areas.find(candidate => candidate.kind === owned.area);
    if (!originArea) continue;
    if (!area.profile.includes('testing') && originArea.profile.includes('testing')) continue;
    ids.add(note.id);
  }
  return ids.size;
}

function encodedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

type AreaBuild =
  | { readonly status: 'ok'; readonly area: ApiViewAreaProjection }
  | { readonly status: 'error'; readonly outcome: ApiViewProjectOutcome };

function buildArea(facts: SessionFacts, consumerOwner: ModuleId, kind: 'ordinary' | 'tests', area: SourceArea,
  ancestry: ReadonlyMap<ModuleId, ModuleId | null>, originals: ReadonlyMap<string, Model['originals'][number]>,
  detailsOf: (request: SymbolDetailRequest) => SymbolDetail, maxAreaBytes: number): AreaBuild {
  const joined = joinArea(facts.model!, facts.catalog, consumerOwner, area, ancestry, originals);
  if (joined.status === 'invalid-projection') return { status: 'error', outcome: { status: 'unavailable', reason: 'invalid-projection', message: joined.message } };
  const files = groupEntries(joined.entries, detailsOf);
  let detailsUnavailable = 0, truncated = 0;
  for (const file of files) for (const entry of file.entries) {
    if (entry.detail.state === 'unavailable') detailsUnavailable++;
    else if (entry.detail.state === 'truncated') truncated++;
  }
  const projection: ApiViewAreaProjection = { area: kind, root: area.root, files, coverage: coverageCount(facts, consumerOwner, area), detailsUnavailable, truncated };
  const bytes = encodedBytes(projection);
  if (bytes > maxAreaBytes) {
    return { status: 'error', outcome: { status: 'unavailable', reason: 'resource-limit', message: `Area "${area.root}" projection is ${bytes} bytes, over the ${maxAreaBytes}-byte limit` } };
  }
  return { status: 'ok', area: projection };
}

/**
 * The complete, bounded, deterministic projection for `selection` at
 * `sequence`/`inputId`, folding each joined entry through the synchronous
 * `detailsOf` lookup. `detailsOf` must return a result for every request
 * `planApiViewRequests` named for the same `facts`/`selection`; it throws
 * otherwise, since that indicates the caller skipped or mismatched a request
 * rather than a projectable outcome. Performs no filesystem, compiler or
 * retention access and returns no partial projection: an area or invocation
 * byte-bound crossing, or an invalid join, discards everything computed so far.
 */
export function projectApiView(facts: SessionFacts, sequence: number, inputId: string, selection: ApiViewSelection,
  detailsOf: (request: SymbolDetailRequest) => SymbolDetail,
  limits: { readonly maxAreaBytes: number; readonly maxInvocationBytes: number }): ApiViewProjectOutcome {
  const invalidFacts = validFacts(facts);
  if (invalidFacts) return invalidFacts;
  const resolved = resolveModules(facts.inventory!, selection);
  if (resolved.status === 'invalid-location') return { status: 'unavailable', reason: 'invalid-location', message: resolved.message };
  const ancestry = parentIndex(facts.model!);
  const originals = originalsIndex(facts.model!);
  const modules: ApiViewModuleProjection[] = [];
  for (const inventoryModule of resolved.modules) {
    const moduleRecord = facts.model!.modules.find(candidate => candidate.id === inventoryModule.id);
    if (!moduleRecord) return { status: 'unavailable', reason: 'invalid-projection', message: `Module "${inventoryModule.id}" is missing from the linked model` };
    let ordinary: ApiViewAreaProjection | null = null;
    if (inventoryModule.areas.find(candidate => candidate.kind === 'ordinary')?.present) {
      const ordinaryArea = moduleRecord.areas.find(candidate => candidate.kind === 'ordinary')!;
      const built = buildArea(facts, moduleRecord.id, 'ordinary', ordinaryArea, ancestry, originals, detailsOf, limits.maxAreaBytes);
      if (built.status === 'error') return built.outcome;
      ordinary = built.area;
    }
    let tests: ApiViewAreaProjection | null = null;
    if (inventoryModule.areas.find(candidate => candidate.kind === 'tests')?.present) {
      const testsArea = moduleRecord.areas.find(candidate => candidate.kind === 'tests')!;
      const built = buildArea(facts, moduleRecord.id, 'tests', testsArea, ancestry, originals, detailsOf, limits.maxAreaBytes);
      if (built.status === 'error') return built.outcome;
      tests = built.area;
    }
    modules.push({ module: moduleRecord.id, directory: inventoryModule.directory, ordinary, tests });
  }
  const draft = { schema: 'ramify.api-view-projection/1' as const, sequence, inputId, modules, bytes: 0 };
  const bytes = encodedBytes(draft);
  if (bytes > limits.maxInvocationBytes) {
    return { status: 'unavailable', reason: 'resource-limit', message: `Projection is ${bytes} bytes, over the ${limits.maxInvocationBytes}-byte invocation limit` };
  }
  const projection: ApiViewProjection = { ...draft, bytes };
  return { status: 'projected', projection };
}
