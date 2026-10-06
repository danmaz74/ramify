import { relative } from 'node:path';
import type { CapturedInput, InventoryArea, PathOwnership, ProjectInventory, ProjectScope } from '../subs/project/src/interfaces/project.js';
import { classifyProjectPath } from '../subs/project/src/ownership.js';
import type { SourceAccess, SourceLimit } from '../subs/typescript/src/interfaces/source.js';
import type { AffectedModule, AffectedPathSeed, AffectedSelection, AffectedWideningReason,
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
  /** The revision's captured inputs, which decide the `captured-input` kind. */
  readonly inputs: readonly CapturedInput[];
  /** Each observation path to the analyzed files whose description reads, resolves or probed it. */
  readonly contributors: Readonly<Record<string, readonly string[]>>;
  /**
   * Whether an owned path outside every `src/` would be auxiliary source under
   * the revision's configuration, JavaScript admission included. Reads nothing.
   */
  readonly auxiliarySource: (path: string) => boolean;
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
 * Assemble the projector's input from one revision's retained facts, its
 * captured inputs and its configuration's auxiliary-source predicate. The
 * access, shim, input and contributor lists refer to the retained objects;
 * nothing is cloned. Coverage is every note a report of these facts records,
 * in the report's order.
 */
export function assembleAffectedFacts(facts: SessionFacts, inputId: string, scope: ProjectScope,
  analysisCheck: 'passed' | 'failed', inputs: readonly CapturedInput[], auxiliarySource: (path: string) => boolean): AffectedFacts {
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
  return { inventory: facts.inventory, accesses, shims, coverage: [...notes.values()].sort(locatedOrder), scope, inputId, analysisCheck,
    inputs, contributors: facts.indexes.contributors, auxiliarySource };
}

const emptySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const readRoles: ReadonlySet<CapturedInput['role']> = new Set(['description', 'readme', 'source', 'resource', 'configuration', 'absent']);
/**
 * Whether the revision read the input's content or absence. A directory and a
 * dependency existence probe, recorded with no bytes and a signature hash, are
 * not captured inputs for affected selection. The counterpart of the contexts'
 * `analysisInput()` in `subs/daemon/subs/contexts/src/dispositions.ts`, which
 * leaves out absence; keep the two in step.
 */
function capturedInput(input: CapturedInput): boolean {
  return readRoles.has(input.role) || input.role === 'dependency' && (input.bytes > 0 || input.sha256 === emptySha256);
}
const lastSegment = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const parentDirectory = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
const within = (directory: string, path: string): boolean =>
  directory === '.' || path === directory || path.startsWith(`${directory}/`);

type Classified = Exclude<PathOwnership, { readonly status: 'invalid-path' }>;
/**
 * Validate both seed lists and classify each distinct path against the scope's
 * ownership; returns the distinct modules and classified paths, or the reason
 * the seeds are invalid. A path is canonical project-relative, `'.'` for the
 * root, or such a path after leading `..` segments, which is outside the project.
 */
function validateSeeds(seeds: { readonly modules: unknown; readonly paths: unknown }, scope: ProjectScope):
  { readonly modules: readonly string[]; readonly paths: ReadonlyMap<string, Classified> } | string {
  const { modules, paths } = seeds;
  if (!Array.isArray(modules) || !Array.isArray(paths)) return 'Seed modules and paths must be arrays of nonempty strings';
  if (modules.length + paths.length > maximumAffectedSeeds) {
    return `A query names at most ${maximumAffectedSeeds} seeds; it named ${modules.length + paths.length}`;
  }
  for (const value of [...modules, ...paths]) {
    if (typeof value !== 'string' || value === '') return 'Seed modules and paths must be arrays of nonempty strings';
  }
  const classified = new Map<string, Classified>();
  for (const path of paths as string[]) {
    if (classified.has(path)) continue;
    const ownership = classifyProjectPath(scope, path);
    if (ownership.status === 'invalid-path') return ownership.message;
    classified.set(path, ownership);
  }
  return { modules: [...new Set(modules as string[])], paths: classified };
}

/**
 * Select the modules affected by the given seeds from one revision's facts.
 * Builds one temporary reverse module graph, traverses it once from every seed
 * and discards it. Path seeds resolve by the scope's ownership without an
 * inventory entry or a read, so absent, new and deleted paths resolve alike.
 * Each owned seed takes the kind of the first rule row that applies and
 * selects exactly the modules that kind names: its owner, a captured input's
 * governed modules, or none. The changed modules are the module seeds and
 * every selected module. Unknown module IDs fail the whole query; a path
 * outside the project or partial coverage widens the test selection to every
 * module while the changed modules and their closure are still reported.
 */
export function projectAffected(facts: AffectedFacts, seeds: { readonly modules: readonly string[]; readonly paths: readonly string[] },
  limits: AffectedLimits, control: RunControl = {}): AffectedProjection {
  const signal = control.signal;
  if (signal?.aborted) return { status: 'cancelled' };
  const valid = validateSeeds(seeds, facts.scope);
  if (typeof valid === 'string') return unavailable('invalid-query', valid);
  const { inventory } = facts;
  const modules = new Map(inventory.modules.map(module => [module.id, module]));
  const unknown = valid.modules.filter(id => !modules.has(id)).sort(byteOrder);
  if (unknown.length) return unavailable('unknown-module', `Unknown module IDs: ${unknown.join(', ')}`, unknown);
  if (modules.size > limits.maxModules) {
    return unavailable('resource-limit', `The inventory has ${modules.size} modules; a query supports at most ${limits.maxModules}`);
  }

  // Path seeds by the scope's ownership, which reads nothing: an owned path outside
  // every exclusion resolves by its inventory entry, its module's description or
  // README, or one of its module's areas, else by containment, as does an owned
  // path in an owned-ignored tree or a scratch directory. An excluded path and a
  // path outside the project name no module. The basis only attributes a path;
  // its kind decides the modules it selects.
  const fileOwners = new Map(inventory.files.map(file => [file.path, file.owner]));
  const auxiliaryFiles = new Set(inventory.files.flatMap(file => file.placement === 'auxiliary' ? [file.path] : []));
  const declarations = new Map<string, string>();
  const readmes = new Set<string>();
  const areas = new Map<string, readonly InventoryArea[]>();
  for (const module of inventory.modules) {
    const prefix = module.directory === '.' ? '' : `${module.directory}/`;
    declarations.set(`${prefix}module.ramify`, module.id);
    declarations.set(`${prefix}README.md`, module.id);
    readmes.add(`${prefix}README.md`);
    areas.set(module.id, module.areas);
  }
  const captured = new Map<string, CapturedInput>();
  for (const input of facts.inputs) if (input.role !== 'directory' && !captured.has(input.path)) captured.set(input.path, input);
  const allModules = [...modules.keys()].sort(byteOrder);
  /** The module owning a directory and every module whose directory lies at or beneath it. */
  const governedBy = (directory: string, owner: string): string[] => [...new Set([owner,
    ...inventory.modules.filter(module => within(directory, module.directory)).map(module => module.id)])].sort(byteOrder);
  const selected = relative(facts.scope.root, facts.scope.configuration);
  const selectedDirectory = selected.startsWith('../') || selected === '..' ? '.' : parentDirectory(selected);
  const ownerOf = (path: string): string | undefined => {
    const owner = fileOwners.get(path);
    if (owner !== undefined) return owner;
    const ownership = classifyProjectPath(facts.scope, path);
    return ownership.status === 'owned' ? ownership.module : undefined;
  };
  /** The modules a captured input governs; never empty. */
  const governed = (path: string, input: CapturedInput, owner: string): string[] => {
    // The selected configuration and the configurations it extends: Ramify captures
    // only that chain, so each governs the selected configuration's set.
    if (input.role === 'configuration') return governedBy(selectedDirectory, ownerOf(selected) ?? owner);
    if (lastSegment(path) === 'package.json') return governedBy(parentDirectory(path), owner);
    const readers = (facts.contributors[path] ?? []).flatMap(file => { const id = ownerOf(file); return id === undefined ? [] : [id]; });
    return readers.length ? [...new Set(readers)].sort(byteOrder) : allModules;
  };
  type Owned = Extract<AffectedPathSeed, { status: 'owned' }>;
  /** The first of the rule's eight rows that applies to an owned path. */
  const classify = (path: string, module: string, exclusion: Owned['exclusion']): Pick<Owned, 'kind' | 'selects'> => {
    if (exclusion !== null) return { kind: 'ignored', selects: [] };
    const name = lastSegment(path);
    if (name === 'module.ramify') return { kind: 'description', selects: [module] };
    if (readmes.has(path)) return { kind: 'readme', selects: [] };
    if (name.endsWith('.md')) return { kind: 'inert', selects: [] };
    const directory = modules.get(module)!.directory;
    if (within(directory === '.' ? 'src' : `${directory}/src`, path)) return { kind: 'source-area', selects: [module] };
    if (auxiliaryFiles.has(path) || !fileOwners.has(path) && facts.auxiliarySource(path)) {
      return { kind: 'auxiliary-source', selects: [module] };
    }
    const input = captured.get(path);
    if (input && capturedInput(input)) return { kind: 'captured-input', selects: governed(path, input, module) };
    return { kind: 'inert', selects: [] };
  };
  const resolvePath = (path: string, ownership: Classified): AffectedPathSeed | string => {
    if (ownership.status === 'outside-project') {
      return { path, status: 'outside-project', module: null, basis: 'none', exclusion: null, kind: null, selects: [] };
    }
    if (ownership.status === 'excluded') {
      return { path, status: 'excluded', module: null, basis: 'excluded', exclusion: ownership.exclusion, kind: null, selects: [] };
    }
    const { module, exclusion } = ownership;
    if (!modules.has(module)) return module;
    const basis = exclusion !== null ? 'containment'
      : fileOwners.get(path) === module ? 'inventory'
        : declarations.get(path) === module ? 'declaration'
          : (areas.get(module) ?? []).some(area => path === area.root || path.startsWith(`${area.root}/`)) ? 'area' : 'containment';
    return { path, status: 'owned', module, basis, exclusion, ...classify(path, module, exclusion) };
  };
  const resolved = [...valid.paths.entries()].sort(([a], [b]) => byteOrder(a, b)).map(([path, ownership]) => resolvePath(path, ownership));
  const strangers = resolved.filter((seed): seed is string => typeof seed === 'string');
  if (strangers.length) {
    return unavailable('invalid-current', `The scope's ownership names modules the inventory lacks: ${[...new Set(strangers)].sort(byteOrder).join(', ')}`);
  }
  const pathSeeds = resolved as AffectedPathSeed[];
  const seedIds = new Set(valid.modules);
  for (const path of pathSeeds) for (const id of path.selects) seedIds.add(id);

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
    // A path in an owned-ignored tree or a scratch directory is its owner's,
    // although its contents are not analyzed: an import of it depends on the owner.
    if ((access.target.kind === 'nested-tree' || access.target.kind === 'excluded') && access.target.exclusion.owner !== null
      && !depend(consumer, access.target.exclusion.owner)) return edgeLimit();
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
  // Only a path outside the project is unowned; an excluded path selects nothing and widens nothing.
  if (pathSeeds.some(path => path.status === 'outside-project')) widening.push('unowned-path');
  widening.sort(byteOrder);
  const listed = (ids: Iterable<string>): AffectedModule[] => [...ids].sort(byteOrder)
    .map(id => ({ id, directory: modules.get(id)!.directory }));
  const changedModules = listed(seedIds);
  const affectedModules = listed([...reached].filter(id => !seedIds.has(id)));
  return { status: 'answered', result: {
    schemaVersion: 'ramify.affected/3', inputId: facts.inputId, paths: pathSeeds, changedModules, affectedModules,
    testModules: widening.length ? listed(modules.keys()) : listed(reached),
    selection: widening.length ? 'all-modules' : 'dependency-closure', widening, scope: facts.scope,
    coverage: { status: partial ? 'partial' : 'complete', notes: [...facts.coverage].sort(locatedOrder) },
    analysisCheck: facts.analysisCheck,
  } };
}
