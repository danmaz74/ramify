import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { architectViewDirectory } from '../../subs/evidence/src/views.js';
import { readMeasurement, type MeasurementDocument, type ModuleMeasurement } from '../../subs/evidence/src/measure.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { ViewIdentity } from '../interfaces/protocol/evidence.js';
import { sha256, type LoadedPackage } from '../prompts/packages.js';
import type { DeliveredManifest } from '../prompts/delivered-manifest.js';
import type { WriteScope } from '../work/scope.js';
import {
  measurementSnapshotSchema, scopeSizeSchema,
  type MeasurementSnapshot, type ScopeComponent, type ScopeSize, type SnapshotId,
} from '../run/records.js';

/*
 * Measurement capture. Every figure here is taken when the observation
 * happens, never added after a trial: the run freezes its baseline before
 * its first invocation, and each invocation records the snapshot it was
 * measured against with the components of its own scope.
 *
 * A missing component makes the total unavailable, with the known subtotal
 * and the coverage beside it. It is never a zero, and a module that does not
 * exist yet has an unknown size, not a zero one.
 *
 * The policy is `scope-size/2`. It counts every file once: a support
 * document named twice, or by two roles' packages, counts once, and the
 * architect view is its own component and never a support document too. A
 * role's support documents are its own prompt package and the captured plan,
 * beside the brief it was delivered; the write scope's extra locations,
 * bootstrapped modules and included subtrees are part of its owned source.
 * A measurement document of another revision than the view the sizes were
 * resolved against holds numbers of another state, which are never merged.
 */

/** The policy every size and snapshot is captured under. */
export const scopeSizePolicy = 'scope-size/2' as const;

/** What one invocation declares it works over. */
export interface DeclaredScope {
  /** Modules whose own bytes count, by their declared-name path. */
  readonly exactOwners: readonly string[];
  /** Modules whose subtree counts. A root covers every owner beneath it, once. */
  readonly subtrees: readonly string[];
  /** Whether every ordinary and testing API-view area of the selection counts. */
  readonly apiViews: boolean;
  /** Whether the role's profile includes the global view. */
  readonly architectView: boolean;
  /** Named support documents: the captured plan, the prompt package, the skill. Each counts once. */
  readonly supportDocuments: readonly string[];
  /**
   * Further write locations, as an assignment's extra entries name them:
   * project-relative files and directories. Each counts the inventoried
   * files beneath it that the selected modules do not already hold; one
   * Ramify does not inventory counts its bytes on disk when the invocation
   * started, which are null where nothing was there.
   */
  readonly locations?: ReadonlyArray<{ readonly path: string; readonly bytes: number | null; readonly files?: readonly { readonly path: string; readonly bytes: number }[] }> | undefined;
  /** Owned nested project roots the scope includes. Ramify does not inventory them, so they add no bytes, as in `B`. */
  readonly nestedProjects?: readonly string[] | undefined;
  /** The bytes of the brief the invocation was delivered, a handoff document of its own. */
  readonly brief?: number | undefined;
}

/** The scope the baseline `B` is frozen over: the root subtree and everything once. */
export function baselineScope(rootModule: string, supportDocuments: readonly string[]): DeclaredScope {
  return { exactOwners: [], subtrees: [rootModule], apiViews: true, architectView: true, supportDocuments };
}

/**
 * The declared scope of a writer, from the write scope it was given: its
 * base modules exactly, each included child subtree, each module it may
 * bootstrap, each extra location and each owned nested project root. The
 * soft read scope is not part of it. `providers` adds modules a role is
 * given whole beyond its write scope, as a contract engineer's provider.
 * Disk bytes of the extra locations are added when the invocation starts.
 */
export function writeScopeMeasurement(scope: WriteScope, providers: readonly string[] = []): DeclaredScope {
  const base = 'module' in scope.base ? [scope.base.module] : scope.base.modules;
  return {
    exactOwners: [...new Set([...base, ...scope.bootstrap.map(entry => entry.owner), ...providers])],
    subtrees: scope.resolved.included.filter(entry => entry.kind === 'child-subtree').map(entry => entry.owner),
    nestedProjects: scope.resolved.included.filter(entry => entry.kind === 'owned-nested-project').map(entry => entry.directory),
    locations: scope.extra.map(entry => ({ path: entry.path, bytes: null })),
    apiViews: true,
    architectView: false,
    supportDocuments: [],
  };
}

/** A separate read proxy; callers must never merge it into the writer size. */
export function readScopeMeasurement(scope: WriteScope): DeclaredScope {
  return { exactOwners: [...new Set(scope.read)], subtrees: [], apiViews: true, architectView: false, supportDocuments: [] };
}

/** Actual delivered/inherited files, not the available package inventory. */
export function deliveredScopeInputs(declared: DeclaredScope, manifest: DeliveredManifest): {
  readonly scope: DeclaredScope;
  readonly supplementary: readonly { readonly path: string; readonly bytes: number }[];
} {
  const files = new Map<string, number>();
  const identities = new Map<string, string>();
  const addFile = (path: string, bytes: number, hash: string) => {
    if (identities.has(path) && (identities.get(path) !== hash || files.get(path) !== bytes)) throw new Error(`Conflicting delivered support revisions for ${path}`);
    identities.set(path, hash); files.set(path, bytes);
  };
  const briefs = new Map<string, number>();
  for (const entry of manifest.entries) {
    if (entry.kind === 'brief') continue;
    for (const source of entry.sources) addFile(source.path, source.bytes, source.hash);
    // A declaration/procedure may have one source without an expanded source list.
    if (entry.sources.length === 0 && entry.source !== null) addFile(entry.source, entry.bytes, entry.hash);
    if (entry.sources.length === 0 && entry.source === null && ['role-instructions', 'procedure', 'skill', 'tool-declaration'].includes(entry.kind)) addFile(`delivered-inputs/${entry.kind}/${entry.hash}`, entry.bytes, entry.hash);
  }
  for (const entry of manifest.entries) if (entry.kind === 'brief' &&
    !(entry.source !== null && identities.get(entry.source) === entry.hash && files.get(entry.source) === entry.bytes)) briefs.set(entry.hash, entry.bytes);
  return {
    scope: { ...declared, supportDocuments: [...files.keys()], brief: [...briefs.values()].reduce((sum, bytes) => sum + bytes, 0) },
    supplementary: [...files].map(([path, bytes]) => ({ path, bytes })),
  };
}

/** The captured plan's path, as the baseline's support set names it. */
export function planSupportPath(planId: string): string {
  return `plans/${planId}/plan.md`;
}

/**
 * The scope one invocation is measured over: what it declares, with its own
 * prompt package and the plan as its support documents, the brief it was
 * delivered, and the bytes on disk of each extra location.
 */
export async function invocationScope(
  projectRoot: string, planId: string, declared: DeclaredScope, loaded: LoadedPackage, brief: string, delivered?: DeliveredManifest,
): Promise<DeclaredScope> {
  const locations = [];
  for (const location of declared.locations ?? []) {
    const path = join(projectRoot, location.path);
    const found = await stat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    locations.push({ path: location.path, bytes: found === null ? null : found.isDirectory() ? await directoryBytes(path) : found.size,
      files: found === null ? [] : await locationFiles(projectRoot, path) });
  }
  if (delivered !== undefined) return deliveredScopeInputs({ ...declared, locations }, delivered).scope;
  // Legacy consumers still use their captured package; integration replaces these with delivered manifests.
  return { ...declared, locations, supportDocuments: [planSupportPath(planId), ...loaded.files.map(file => file.path)], brief: Buffer.byteLength(brief, 'utf8') };
}

async function locationFiles(root: string, path: string): Promise<readonly { path: string; bytes: number }[]> {
  const found = await stat(path);
  if (found.isFile()) return [{ path: inventoryPath(root, path), bytes: found.size }];
  if (!found.isDirectory()) return [];
  const files: { path: string; bytes: number }[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory() || entry.isFile()) files.push(...await locationFiles(root, join(path, entry.name)));
  }
  return files;
}

export interface SnapshotRequest {
  readonly id: SnapshotId;
  readonly ramify: RamifyCli;
  readonly projectRoot: string;
  /** The run branch's head when it was taken. */
  readonly head: string;
  readonly view: ViewIdentity | null;
  /** Support documents outside Ramify's inventory, each with the bytes of the captured input. */
  readonly supplementary: ReadonlyArray<{ readonly path: string; readonly bytes: number }>;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Captures one `ramify.measure/2` document verbatim, with its revision and
 * the hash of the producer's own bytes. A producer that cannot be run leaves
 * the snapshot with the reason and no document, which is a coverage gap and
 * never a zero.
 *
 * The architect view's published bytes are measured from the published
 * directory and recorded as a supplementary entry: `ramify.measure/2` carries
 * per-module API-view totals but no publication size for the architect view,
 * so this is where component 3 of the recipe comes from.
 */
export async function captureSnapshot(request: SnapshotRequest): Promise<MeasurementSnapshot> {
  const measurement = await readMeasurement(request.ramify, request.projectRoot, request.signal);
  const architect = await directoryBytes(join(request.projectRoot, architectViewDirectory));
  const supplementary = [...request.supplementary];
  if (architect !== null) supplementary.push({ path: architectViewDirectory, bytes: architect });
  return measurementSnapshotSchema.parse({
    schema: 'ramify-agent.measurement-snapshot/1',
    id: request.id,
    policy: scopeSizePolicy,
    head: request.head,
    measure: measurement.available
      ? { revision: measurement.document.revision, document: measurement.document, hash: sha256(measurement.raw) }
      : { unavailable: measurement.unavailable },
    view: request.view,
    supplementary,
  });
}

/**
 * `S_s` for one declared scope, from one snapshot. The components are the
 * recipe's four, each deduplicated as the policy requires, and every bucket
 * is preserved beside the aggregate.
 */
export function scopeSize(snapshot: MeasurementSnapshot, scope: DeclaredScope): ScopeSize {
  const components: ScopeComponent[] = [];
  const document = 'unavailable' in snapshot.measure ? null : (snapshot.measure.document as MeasurementDocument | null);
  const unavailable = 'unavailable' in snapshot.measure ? snapshot.measure.unavailable : null;

  if (document === null || !Array.isArray(document.modules)) {
    const reason = unavailable ?? 'the snapshot holds no measurement document';
    components.push({ component: 'owned-source', detail: 'selected exact owners and subtrees', bytes: null, state: 'unavailable', reason });
    components.push({ component: 'api-views', detail: 'declared ordinary and testing API-view areas', bytes: null, state: 'unavailable', reason });
  } else {
    const { selected, unresolved } = selectModules(document.modules, scope);
    components.push(ownedSource(selected, unresolved, document, scope));
    components.push(apiViews(selected, scope, document.views));
  }

  components.push(architectView(snapshot, scope));
  components.push(supportDocuments(snapshot, document, scope));

  // Numbers of two states are never merged: the measurement document and
  // the view the scope was resolved against must be of one revision.
  const mismatch = snapshot.policy !== scopeSizePolicy ? `snapshot policy ${snapshot.policy} is not comparable with ${scopeSizePolicy}` : revisionMismatch(snapshot);
  if (mismatch !== null) {
    for (const [index, component] of components.entries()) {
      if (snapshot.policy === scopeSizePolicy && component.component === 'support-documents') continue;
      if (snapshot.policy === scopeSizePolicy && component.component === 'architect-view' && !scope.architectView) continue;
      components[index] = { ...component, bytes: null, buckets: {}, state: 'unavailable', reason: mismatch };
    }
  }

  const subtotal = components.reduce((total, component) => total + componentSubtotal(component), 0);
  const complete = components.every(component => component.state === 'measured');
  return scopeSizeSchema.parse({
    policy: scopeSizePolicy,
    snapshot: snapshot.id,
    components,
    bytes: complete ? subtotal : null,
    subtotal,
    coverage: complete ? 'complete' : 'partial',
  });
}

/** Known disjoint buckets survive partial coverage; incompatible-state buckets are cleared first. */
export function componentSubtotal(component: ScopeComponent): number {
  return component.bytes ?? Object.values(component.buckets ?? {}).reduce((sum, bytes) => sum + bytes, 0);
}

/** Project content excludes architect and delivered support, using the same snapshot and policy. */
export function projectOnlySize(size: ScopeSize): ScopeSize {
  const components = size.components.filter(component => component.component === 'owned-source' || component.component === 'api-views');
  const subtotal = components.reduce((sum, component) => sum + componentSubtotal(component), 0);
  const complete = components.every(component => component.state === 'measured');
  return { ...size, components, subtotal, bytes: complete ? subtotal : null, coverage: complete ? 'complete' : 'partial' };
}

/** Why the snapshot's measurement and its view describe two states, or null where they are of one revision. */
export function revisionMismatch(snapshot: MeasurementSnapshot): string | null {
  if ('unavailable' in snapshot.measure || snapshot.view === null || snapshot.view.status !== 'materialized') return null;
  if (snapshot.measure.revision === snapshot.view.revision) return null;
  return `the measurement document is of revision ${snapshot.measure.revision} and the architect view of revision ${snapshot.view.revision}, so they describe two states whose numbers are not merged`;
}

/**
 * What the scope selects, each module once: a subtree root covers everything
 * beneath it, and an exact owner inside a selected subtree is not counted
 * again. A name the document does not have is unresolved, which makes the
 * component unknown rather than smaller.
 */
function selectModules(modules: readonly ModuleMeasurement[], scope: DeclaredScope): {
  selected: Array<{ module: ModuleMeasurement; bucket: 'exact' | 'subtree' }>;
  unresolved: string[];
} {
  const byId = new Map(modules.map(module => [module.id, module]));
  const roots = [...new Set(scope.subtrees)];
  const known = roots.filter(id => byId.has(id));
  const covering = known.filter(id => !known.some(other => other !== id && isDescendant(byId, id, other)));
  const covered = (id: string): boolean => covering.some(root => root === id || isDescendant(byId, id, root));
  const selected: Array<{ module: ModuleMeasurement; bucket: 'exact' | 'subtree' }> = [];
  for (const root of covering) selected.push({ module: byId.get(root)!, bucket: 'subtree' });
  for (const id of [...new Set(scope.exactOwners)]) {
    const module = byId.get(id);
    if (module !== undefined && !covered(id)) selected.push({ module, bucket: 'exact' });
  }
  const unresolved = [...new Set([...scope.subtrees, ...scope.exactOwners])].filter(id => !byId.has(id));
  return { selected, unresolved };
}

function isDescendant(byId: ReadonlyMap<string, ModuleMeasurement>, id: string, ancestor: string): boolean {
  let current = byId.get(id)?.parent ?? null;
  while (current !== null) {
    if (current === ancestor) return true;
    current = byId.get(current)?.parent ?? null;
  }
  return false;
}

function ownedSource(
  selected: ReadonlyArray<{ module: ModuleMeasurement; bucket: 'exact' | 'subtree' }>,
  unresolved: readonly string[],
  document: MeasurementDocument,
  scope: DeclaredScope,
): ScopeComponent {
  const buckets: Record<string, number> = { production: 0, tests: 0, documentation: 0 };
  for (const { module, bucket } of selected) {
    const measured = module[bucket];
    buckets.production! += measured.production.sourceBytes + measured.production.resourceBytes;
    buckets.tests! += measured.tests.sourceBytes + measured.tests.resourceBytes;
    buckets.documentation! += measured.documentation.bytes;
  }
  const notes = selected.map(entry => `${entry.module.id} (${entry.bucket})`);

  // An extra location adds what the selection does not already hold: the
  // inventoried files beneath it of other owners, each once, or its bytes on
  // disk where Ramify inventories nothing there.
  const byId = new Map(document.modules.map(entry => [entry.id, entry]));
  const held = (owner: string): boolean => selected.some(({ module, bucket }) =>
    module.id === owner || (bucket === 'subtree' && isDescendant(byId, owner, module.id)));
  const counted = new Set<string>();
  const outside = new Set<string>();
  const outsideAggregateCovered = (path: string): boolean => (scope.locations ?? []).some(other =>
    other.path !== path && other.files === undefined && other.bytes !== null &&
    path.startsWith(`${other.path.replace(/\/+$/, '')}/`) &&
    !document.files.some(file => file.path === other.path || file.path.startsWith(`${other.path.replace(/\/+$/, '')}/`)));
  for (const location of scope.locations ?? []) {
    const beneath = document.files.filter(file => file.path === location.path || file.path.startsWith(`${location.path.replace(/\/+$/, '')}/`));
    if (beneath.length > 0) {
      for (const file of beneath) {
        if (held(file.owner) || counted.has(file.path)) continue;
        counted.add(file.path);
        const bucket = file.area === 'ordinary' ? 'production' : file.area;
        buckets[bucket] = (buckets[bucket] ?? 0) + file.bytes;
      }
      notes.push(`${location.path} (extra)`);
    } else if (location.files === undefined && !outside.has(location.path) && !outsideAggregateCovered(location.path)) {
      outside.add(location.path);
      buckets['outside-inventory'] = (buckets['outside-inventory'] ?? 0) + (location.bytes ?? 0);
      notes.push(location.bytes === null ? `${location.path} (extra, absent when the invocation started)` : `${location.path} (extra, outside Ramify's inventory, bytes on disk)`);
    }
    for (const file of location.files ?? []) {
      if (counted.has(file.path) || document.files.some(entry => entry.path === file.path)) continue;
      counted.add(file.path);
      buckets['outside-inventory'] = (buckets['outside-inventory'] ?? 0) + file.bytes;
    }
  }
  for (const directory of scope.nestedProjects ?? []) {
    notes.push(`${directory} (owned nested project, not inventoried by Ramify and outside the proxy, as in B)`);
  }

  const bytes = Object.values(buckets).reduce((total, value) => total + value, 0);
  const detail = notes.length === 0 ? 'nothing selected' : notes.join(', ');
  if (unresolved.length > 0) {
    return {
      component: 'owned-source',
      detail,
      bytes: null,
      state: 'unknown',
      reason: `no measured module for ${unresolved.join(', ')}; a module that does not exist yet has an unknown size, not a zero one`,
      buckets,
    };
  }
  return { component: 'owned-source', detail, bytes, state: 'measured', buckets };
}

function apiViews(
  selected: ReadonlyArray<{ module: ModuleMeasurement; bucket: 'exact' | 'subtree' }>,
  scope: DeclaredScope,
  views: MeasurementDocument['views'],
): ScopeComponent {
  if (!scope.apiViews) {
    return { component: 'api-views', detail: 'no API-view area is declared', bytes: 0, state: 'measured', buckets: { ordinary: 0, tests: 0 } };
  }
  if (views !== 'measured') {
    return { component: 'api-views', detail: 'declared ordinary and testing API-view areas', bytes: null,
      state: 'unavailable', reason: `ramify measure reported API views unavailable: ${views.reason}` };
  }
  const buckets = { ordinary: 0, tests: 0 };
  const missing: string[] = [];
  for (const { module, bucket } of selected) {
    const measured = module[bucket];
    if (measured.views === undefined) { missing.push(module.id); continue; }
    buckets.ordinary += measured.views.ordinaryBytes;
    buckets.tests += measured.views.testsBytes;
  }
  if (missing.length > 0) return { component: 'api-views', detail: 'declared ordinary and testing API-view areas', bytes: null, state: 'unavailable', reason: `ramify measure omitted API-view bytes for ${missing.join(', ')}`, buckets };
  return {
    component: 'api-views',
    detail: 'each declared ordinary and testing area once, by owner and physical source area',
    bytes: buckets.ordinary + buckets.tests,
    state: 'measured',
    buckets,
  };
}

function architectView(snapshot: MeasurementSnapshot, scope: DeclaredScope): ScopeComponent {
  if (!scope.architectView) {
    return { component: 'architect-view', detail: 'the role\'s profile does not include the global view', bytes: 0, state: 'measured' };
  }
  const published = snapshot.supplementary.find(entry => entry.path === architectViewDirectory);
  if (published === undefined) {
    return {
      component: 'architect-view',
      detail: `${architectViewDirectory}/`,
      bytes: null,
      state: 'unavailable',
      reason: `${architectViewDirectory}/ was not published when the snapshot was taken, so its size is not known`,
    };
  }
  return { component: 'architect-view', detail: `${architectViewDirectory}/, at its publication size`, bytes: published.bytes, state: 'measured' };
}

/**
 * The named support documents, each file once whoever names it, and the
 * delivered brief. The architect view is component 3 and is never counted
 * here again, and a file Ramify's inventory already supplied is not either.
 */
function supportDocuments(snapshot: MeasurementSnapshot, document: MeasurementDocument | null, scope: DeclaredScope): ScopeComponent {
  const inventoried = new Set<string>();
  if (document !== null) {
    const { selected } = selectModules(document.modules, scope);
    const byId = new Map(document.modules.map(module => [module.id, module]));
    for (const file of document.files) {
      if (selected.some(({ module, bucket }) => module.id === file.owner || (bucket === 'subtree' && isDescendant(byId, file.owner, module.id))) ||
          (scope.locations ?? []).some(location => file.path === location.path || file.path.startsWith(`${location.path.replace(/\/+$/, '')}/`))) inventoried.add(file.path);
    }
    for (const location of scope.locations ?? []) for (const file of location.files ?? []) inventoried.add(file.path);
  }
  const named = [...new Set(scope.supportDocuments)].filter(path => path !== architectViewDirectory && !path.startsWith(`${architectViewDirectory}/`) && !inventoried.has(path));
  const captured = new Map<string, number>();
  for (const entry of snapshot.supplementary) if (!captured.has(entry.path)) captured.set(entry.path, entry.bytes);
  for (const file of document?.files ?? []) if (!captured.has(file.path)) captured.set(file.path, file.bytes);
  const missing = named.filter(path => !captured.has(path));
  const documents = named.filter(path => captured.has(path)).reduce((total, path) => total + captured.get(path)!, 0);
  const buckets = { documents, ...(scope.brief === undefined ? {} : { brief: scope.brief }) };
  const detail = [
    named.length === 0 ? 'none outside Ramify\'s inventory' : `${named.length} distinct documents: ${named.join(', ')}`,
    ...(scope.brief === undefined ? [] : ['the delivered brief']),
  ].join('; ');
  if (missing.length > 0) {
    return {
      component: 'support-documents',
      detail,
      bytes: null,
      state: 'unavailable',
      reason: `the snapshot captured no bytes for ${missing.join(', ')}`,
      buckets,
    };
  }
  return { component: 'support-documents', detail, bytes: documents + (scope.brief ?? 0), state: 'measured', buckets };
}

/** The bytes of a published directory, or null when it is not there. */
export async function directoryBytes(directory: string): Promise<number | null> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  let total = 0;
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { const bytes = await directoryBytes(path); if (bytes === null) return null; total += bytes; }
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

/** The bytes of one captured input, or null when it cannot be read. */
export async function fileBytes(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

/** The root module of a captured measurement document, or null when it holds none. */
export function rootModuleOfSnapshot(snapshot: MeasurementSnapshot): string | null {
  if ('unavailable' in snapshot.measure) return null;
  const modules = (snapshot.measure.document as { modules?: unknown } | null)?.modules;
  if (!Array.isArray(modules)) return null;
  for (const module of modules) {
    const entry = module as { id?: unknown; parent?: unknown };
    if (entry.parent === null && typeof entry.id === 'string') return entry.id;
  }
  return null;
}

/** A path as the measurement document spells one: project-relative, forward slashes. */
export function inventoryPath(projectRoot: string, path: string): string {
  return relative(projectRoot, path).split(sep).join('/');
}

/** Reads a support document's bytes without keeping its content. */
export async function supportDocument(projectRoot: string, path: string): Promise<{ path: string; bytes: number } | null> {
  try {
    const content = await readFile(path);
    return { path: inventoryPath(projectRoot, path), bytes: content.byteLength };
  } catch {
    return null;
  }
}
