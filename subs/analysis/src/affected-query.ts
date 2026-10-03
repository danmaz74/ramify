import type { ProjectInventory, ProjectScope } from '../subs/project/src/interfaces/project.js';
import type { SourceAccess, SourceLimit } from '../subs/typescript/src/interfaces/source.js';
import type { AffectedModule, AffectedPathBasis, AffectedPathSeed, AffectedSelection, AffectedWideningReason,
  SessionAffectedOutcome } from './interfaces/affected.js';
import type { RunControl } from './interfaces/analysis.js';
import { byteOrder, locatedOrder } from './report.js';
import type { SessionFacts } from './session-facts.js';
import { reportedCatalogCoverage } from './session-facts.js';

/** The plain input of one affected-module projection, assembled from one revision's retained facts. */
export interface AffectedFacts {
  readonly inventory: ProjectInventory;
  readonly accesses: readonly SourceAccess[];
  readonly shims: readonly { readonly file: string; readonly shims: readonly string[] }[];
  readonly coverage: readonly SourceLimit[];
  readonly scope: ProjectScope;
  readonly inputId: string;
  readonly analysisCheck: 'passed' | 'failed';
}
export interface AffectedLimits {
  readonly maxModules: number;
  readonly maxEdges: number;
}
export type AffectedProjection =
  | Exclude<SessionAffectedOutcome, { status: 'answered' }>
  | { readonly status: 'answered'; readonly result: AffectedSelection };

/** The bounds of one session query. */
export const affectedLimits: AffectedLimits = Object.freeze({ maxModules: 4096, maxEdges: 100_000 });
export const maximumAffectedSeeds = 4096;
/** Coverage codes that leave the accessed file's owner known, so the module graph stays complete. */
const ownerKnownCodes: ReadonlySet<SourceLimit['code']> = new Set<SourceLimit['code']>(['incomplete-exports',
  'ambiguous-original', 'unresolved-original', 'unknown-key', 'namespace-escape', 'signature-inferred', 'signature-unresolved']);
/** Cancellation is observed at least this often, in accesses and traversal steps. */
const cancellationStride = 1024;

type Unavailable = Extract<SessionAffectedOutcome, { status: 'unavailable' }>;
const unavailable = (reason: Unavailable['reason'], message: string, unknownModules: readonly string[] = []): Unavailable =>
  ({ status: 'unavailable', reason, message, unknownModules });

/**
 * Assemble the projector's input from one revision's retained facts. The
 * access and shim lists refer to the retained objects; nothing is cloned.
 * Coverage is every note a report of these facts records, in the report's order.
 */
export function assembleAffectedFacts(facts: SessionFacts, inputId: string, scope: ProjectScope,
  analysisCheck: 'passed' | 'failed'): AffectedFacts {
  if (!facts.inventory) throw new Error('Affected-module facts require an inventory');
  const files = Object.entries(facts.files);
  const accesses: SourceAccess[] = [];
  const shims: { readonly file: string; readonly shims: readonly string[] }[] = [];
  const notes = new Map<string, SourceLimit>();
  const note = (item: SourceLimit): void => { if (!notes.has(item.id)) notes.set(item.id, item); };
  reportedCatalogCoverage(facts).forEach(note);
  for (const [file, retained] of files) {
    for (const access of retained.accesses) accesses.push(access);
    retained.coverage.forEach(note);
    if (retained.description.dependencies.shims.length) shims.push({ file, shims: retained.description.dependencies.shims });
  }
  facts.companions.coverage.forEach(note);
  return { inventory: facts.inventory, accesses, shims, coverage: [...notes.values()].sort(locatedOrder), scope, inputId, analysisCheck };
}

/** A path is project-relative and `/`-separated, without empty, `.` or `..` segments. */
function pathProblem(path: string): string | null {
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return `Path ${JSON.stringify(path)} is absolute`;
  if (path.includes('\\')) return `Path ${JSON.stringify(path)} contains a backslash`;
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') return `Path ${JSON.stringify(path)} has an empty, "." or ".." segment`;
  }
  return null;
}

/** Validate both seed lists; returns their distinct values or the reason they are invalid. */
function validateSeeds(seeds: { readonly modules: unknown; readonly paths: unknown }):
  { readonly modules: readonly string[]; readonly paths: readonly string[] } | string {
  const { modules, paths } = seeds;
  if (!Array.isArray(modules) || !Array.isArray(paths)) return 'Seed modules and paths must be arrays of nonempty strings';
  if (modules.length + paths.length > maximumAffectedSeeds) {
    return `A query names at most ${maximumAffectedSeeds} seeds; it named ${modules.length + paths.length}`;
  }
  for (const value of [...modules, ...paths]) {
    if (typeof value !== 'string' || value === '') return 'Seed modules and paths must be arrays of nonempty strings';
  }
  for (const path of paths as string[]) {
    const problem = pathProblem(path);
    if (problem) return problem;
  }
  return { modules: [...new Set(modules as string[])], paths: [...new Set(paths as string[])] };
}

/**
 * Select the modules affected by the given seeds from one revision's facts.
 * Builds one temporary reverse module graph, traverses it once from every seed
 * and discards it. Unknown module IDs fail the whole query; an unowned path or
 * partial coverage widens the test selection to every module while the seeds
 * and their closure are still reported.
 */
export function projectAffected(facts: AffectedFacts, seeds: { readonly modules: readonly string[]; readonly paths: readonly string[] },
  limits: AffectedLimits, control: RunControl = {}): AffectedProjection {
  const signal = control.signal;
  if (signal?.aborted) return { status: 'cancelled' };
  const valid = validateSeeds(seeds);
  if (typeof valid === 'string') return unavailable('invalid-query', valid);
  const { inventory } = facts;
  const modules = new Map(inventory.modules.map(module => [module.id, module]));
  const unknown = valid.modules.filter(id => !modules.has(id)).sort(byteOrder);
  if (unknown.length) return unavailable('unknown-module', `Unknown module IDs: ${unknown.join(', ')}`, unknown);
  if (modules.size > limits.maxModules) {
    return unavailable('resource-limit', `The inventory has ${modules.size} modules; a query supports at most ${limits.maxModules}`);
  }

  // Path seeds: an inventoried file, a module's declaration or README, a path in a module's area, or none.
  const fileOwners = new Map(inventory.files.map(file => [file.path, file.owner]));
  const declarations = new Map<string, string>();
  for (const module of inventory.modules) {
    const prefix = module.directory === '.' ? '' : `${module.directory}/`;
    declarations.set(`${prefix}module.ramify`, module.id);
    declarations.set(`${prefix}README.md`, module.id);
  }
  const areas = inventory.modules.flatMap(module => module.areas);
  const resolvePath = (path: string): AffectedPathSeed => {
    const owner = fileOwners.get(path);
    if (owner !== undefined) return seed(path, owner, 'inventory');
    const declared = declarations.get(path);
    if (declared !== undefined) return seed(path, declared, 'declaration');
    let area: { readonly owner: string; readonly root: string } | null = null;
    for (const candidate of areas) {
      if ((path === candidate.root || path.startsWith(`${candidate.root}/`)) && (!area || candidate.root.length > area.root.length)) area = candidate;
    }
    return area ? seed(path, area.owner, 'area') : seed(path, null, 'none');
  };
  const pathSeeds = [...valid.paths].sort(byteOrder).map(resolvePath);
  const seedIds = new Set(valid.modules);
  for (const path of pathSeeds) if (path.module !== null) seedIds.add(path.module);

  // Reverse edges: each provider to the modules depending on it.
  const dependents = new Map<string, Set<string>>();
  let edges = 0;
  /** Record one edge; false when the unique edge count exceeds the limit. */
  const depend = (consumer: string | undefined, provider: string | undefined): boolean => {
    if (consumer === undefined || provider === undefined || consumer === provider || !modules.has(consumer) || !modules.has(provider)) return true;
    let set = dependents.get(provider);
    if (!set) { set = new Set(); dependents.set(provider, set); }
    if (set.has(consumer)) return true;
    set.add(consumer);
    return ++edges <= limits.maxEdges;
  };
  const edgeLimit = (): Unavailable => unavailable('resource-limit',
    `The module graph has more than ${limits.maxEdges} dependency edges`);
  let visited = 0;
  for (const access of facts.accesses) {
    if (++visited % cancellationStride === 0 && signal?.aborted) return { status: 'cancelled' };
    const consumer = access.importer.area.owner;
    if (access.target.kind === 'application' && !depend(consumer, access.target.origin.area.owner)) return edgeLimit();
    for (const selection of access.selections) {
      if (selection.original && !depend(consumer, selection.original.owner)) return edgeLimit();
      for (const origin of selection.forwarding) if (!depend(consumer, origin.area.owner)) return edgeLimit();
    }
  }
  for (const entry of facts.shims) {
    if (++visited % cancellationStride === 0 && signal?.aborted) return { status: 'cancelled' };
    const consumer = fileOwners.get(entry.file);
    for (const shim of entry.shims) if (!depend(consumer, fileOwners.get(shim))) return edgeLimit();
  }

  // One traversal from every seed; each module is visited once, so cycles terminate.
  const reached = new Set(seedIds);
  const pending = [...seedIds];
  let steps = 0;
  while (pending.length) {
    if (++steps % cancellationStride === 0 && signal?.aborted) return { status: 'cancelled' };
    for (const consumer of dependents.get(pending.pop()!) ?? []) {
      if (reached.has(consumer)) continue;
      reached.add(consumer);
      pending.push(consumer);
    }
  }
  if (signal?.aborted) return { status: 'cancelled' };

  const partial = facts.coverage.some(note => !ownerKnownCodes.has(note.code));
  const widening: AffectedWideningReason[] = [];
  if (partial) widening.push('partial-coverage');
  if (pathSeeds.some(path => path.basis === 'none')) widening.push('unowned-path');
  widening.sort(byteOrder);
  const listed = (ids: Iterable<string>): AffectedModule[] => [...ids].sort(byteOrder)
    .map(id => ({ id, directory: modules.get(id)!.directory }));
  const changedModules = listed(seedIds);
  const affectedModules = listed([...reached].filter(id => !seedIds.has(id)));
  return { status: 'answered', result: {
    schemaVersion: 'ramify.affected/2', inputId: facts.inputId, paths: pathSeeds, changedModules, affectedModules,
    testModules: widening.length ? listed(modules.keys()) : listed(reached),
    selection: widening.length ? 'all-modules' : 'dependency-closure', widening, scope: facts.scope,
    coverage: { status: partial ? 'partial' : 'complete', notes: [...facts.coverage].sort(locatedOrder) },
    analysisCheck: facts.analysisCheck,
  } };
}

const seed = (path: string, module: string | null, basis: AffectedPathBasis): AffectedPathSeed => ({ path, module, basis });
