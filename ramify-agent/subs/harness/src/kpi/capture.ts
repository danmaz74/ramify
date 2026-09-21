import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { architectViewDirectory } from '../../subs/evidence/src/views.js';
import { readMeasurement, type MeasurementDocument, type ModuleMeasurement } from '../../subs/evidence/src/measure.js';
import type { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { ViewIdentity } from '../interfaces/protocol/evidence.js';
import { sha256 } from '../prompts/packages.js';
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
 */

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
  /** Named support documents: the captured plan, the prompt package, the skill. */
  readonly supportDocuments: readonly string[];
}

/** The scope the baseline `B` is frozen over: the root subtree and everything once. */
export function baselineScope(rootModule: string, supportDocuments: readonly string[]): DeclaredScope {
  return { exactOwners: [], subtrees: [rootModule], apiViews: true, architectView: true, supportDocuments };
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
 * Captures one `ramify.measure/1` document verbatim, with its revision and
 * the hash of the producer's own bytes. A producer that cannot be run leaves
 * the snapshot with the reason and no document, which is a coverage gap and
 * never a zero.
 *
 * The architect view's published bytes are measured from the published
 * directory and recorded as a supplementary entry: `ramify.measure/1` carries
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
    policy: 'scope-size/1',
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
    components.push(ownedSource(selected, unresolved));
    components.push(apiViews(selected, scope));
  }

  components.push(architectView(snapshot, scope));
  components.push(supportDocuments(snapshot, document, scope));

  const measured = components.filter(component => component.state === 'measured');
  const subtotal = measured.reduce((total, component) => total + (component.bytes ?? 0), 0);
  const complete = components.every(component => component.state === 'measured');
  return scopeSizeSchema.parse({
    policy: 'scope-size/1',
    snapshot: snapshot.id,
    components,
    bytes: complete ? subtotal : null,
    subtotal,
    coverage: complete ? 'complete' : 'partial',
  });
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
): ScopeComponent {
  const buckets = { production: 0, tests: 0, documentation: 0 };
  for (const { module, bucket } of selected) {
    const measured = module[bucket];
    buckets.production += measured.production.sourceBytes + measured.production.resourceBytes;
    buckets.tests += measured.tests.sourceBytes + measured.tests.resourceBytes;
    buckets.documentation += measured.documentation.bytes;
  }
  const bytes = buckets.production + buckets.tests + buckets.documentation;
  const named = selected.map(entry => `${entry.module.id} (${entry.bucket})`).join(', ');
  if (unresolved.length > 0) {
    return {
      component: 'owned-source',
      detail: named === '' ? 'nothing selected' : named,
      bytes: null,
      state: 'unknown',
      reason: `no measured module for ${unresolved.join(', ')}; a module that does not exist yet has an unknown size, not a zero one`,
      buckets,
    };
  }
  return { component: 'owned-source', detail: named === '' ? 'nothing selected' : named, bytes, state: 'measured', buckets };
}

function apiViews(selected: ReadonlyArray<{ module: ModuleMeasurement; bucket: 'exact' | 'subtree' }>, scope: DeclaredScope): ScopeComponent {
  if (!scope.apiViews) {
    return { component: 'api-views', detail: 'no API-view area is declared', bytes: 0, state: 'measured', buckets: { ordinary: 0, tests: 0 } };
  }
  const buckets = { ordinary: 0, tests: 0 };
  for (const { module, bucket } of selected) {
    const measured = module[bucket];
    buckets.ordinary += measured.views.ordinaryBytes;
    buckets.tests += measured.views.testsBytes;
  }
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

function supportDocuments(snapshot: MeasurementSnapshot, document: MeasurementDocument | null, scope: DeclaredScope): ScopeComponent {
  const inventoried = inventoryPaths(document);
  const counted = snapshot.supplementary.filter(entry => scope.supportDocuments.includes(entry.path) && !inventoried.has(entry.path));
  const missing = scope.supportDocuments.filter(path => !snapshot.supplementary.some(entry => entry.path === path) && !inventoried.has(path));
  if (missing.length > 0) {
    return {
      component: 'support-documents',
      detail: scope.supportDocuments.join(', '),
      bytes: null,
      state: 'unavailable',
      reason: `the snapshot captured no bytes for ${missing.join(', ')}`,
    };
  }
  return {
    component: 'support-documents',
    detail: counted.length === 0 ? 'none outside Ramify\'s inventory' : counted.map(entry => entry.path).join(', '),
    bytes: counted.reduce((total, entry) => total + entry.bytes, 0),
    state: 'measured',
  };
}

/** What Ramify's inventory already supplied, so a support document is never counted twice. */
function inventoryPaths(document: MeasurementDocument | null): Set<string> {
  const files = (document as { files?: unknown } | null)?.files;
  if (!Array.isArray(files)) return new Set();
  const paths = new Set<string>();
  for (const file of files) {
    const path = (file as { path?: unknown }).path;
    if (typeof path === 'string') paths.add(path);
  }
  return paths;
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
    if (entry.isDirectory()) total += (await directoryBytes(path)) ?? 0;
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
