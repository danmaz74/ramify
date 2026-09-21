import type { Model, ModuleId, ModuleRecord, Original, OriginalId } from './interfaces/model.js';

/**
 * Effective exposure of one model, by exposing module. Derived once per frozen
 * model and never retained across models, so it needs no invalidation. No
 * per-original reach set is expanded: a visibility test walks the module's
 * ancestors with set lookups.
 */
export interface ExposureIndex {
  readonly modules: ReadonlyMap<ModuleId, ModuleRecord>;
  readonly children: ReadonlyMap<ModuleId, readonly ModuleId[]>;
  readonly originals: ReadonlyMap<string, Original>;
  /** Per module, the originals it effectively exposes to a parent. The root has none. */
  readonly toParent: ReadonlyMap<ModuleId, ReadonlySet<string>>;
  /** Per module, the originals it effectively exposes to its descendants. */
  readonly toDescendants: ReadonlyMap<ModuleId, ReadonlySet<string>>;
  /** Per original, the modules that receive it from a direct child. */
  readonly receivers: ReadonlyMap<string, ReadonlySet<ModuleId>>;
}

const indexes = new WeakMap<Model, ExposureIndex>();

/** Stored identities have already passed buildModel validation; equal to `originalKey`. */
export const storedKey = (id: OriginalId): string => JSON.stringify([id.kind, id.owner, id.file, id.binding]);

function add<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const set = map.get(key) ?? new Set<V>();
  set.add(value);
  map.set(key, set);
}

export function exposureIndexFor(model: Model): ExposureIndex {
  const cached = indexes.get(model);
  if (cached) return cached;
  const modules = new Map(model.modules.map(module => [module.id, module]));
  const children = new Map<ModuleId, ModuleId[]>(model.modules.map(module => [module.id, []]));
  for (const module of model.modules) if (module.parent !== null) children.get(module.parent)?.push(module.id);
  const toParent = new Map<ModuleId, Set<string>>();
  const toDescendants = new Map<ModuleId, Set<string>>();
  const receivers = new Map<string, Set<ModuleId>>();
  for (const exposure of model.exposures) {
    if (!exposure.effective) continue;
    const key = storedKey(exposure.original);
    const parent = modules.get(exposure.module)?.parent ?? null;
    if (exposure.destinations.includes('parent') && parent !== null) {
      add(toParent, exposure.module, key);
      add(receivers, key, parent);
    }
    if (exposure.destinations.includes('descendants')) add(toDescendants, exposure.module, key);
  }
  const index: ExposureIndex = { modules, children,
    originals: new Map(model.originals.map(original => [storedKey(original.id), original])),
    toParent, toDescendants, receivers };
  // Only a model whose arrays cannot change may retain an index.
  if ([model, model.modules, model.originals, model.exposures].every(Object.isFrozen)) indexes.set(model, index);
  return index;
}

/** Whether a proper ancestor of `module` exposes `key` to its descendants. */
function receivedFromAncestor(index: ExposureIndex, key: string, module: ModuleId): boolean {
  let parent = index.modules.get(module)?.parent ?? null;
  while (parent !== null) {
    if (index.toDescendants.get(parent)?.has(key)) return true;
    parent = index.modules.get(parent)?.parent ?? null;
  }
  return false;
}

/** Visibility of `id` in `module`: ownership, receipt from a child, or an ancestor's exposure to descendants. */
export function visibleIn(index: ExposureIndex, id: OriginalId, module: ModuleId): boolean {
  const key = storedKey(id);
  return id.owner === module || (index.receivers.get(key)?.has(module) ?? false) || receivedFromAncestor(index, key, module);
}

/**
 * Visibility of `id` in every proper descendant of `module`. The exposures to
 * descendants of `module` and its ancestors answer it first; descendants are
 * visited only when those do not.
 */
export function visibleInEveryProperDescendant(index: ExposureIndex, id: OriginalId, module: ModuleId): boolean {
  const key = storedKey(id);
  if (index.toDescendants.get(module)?.has(key) || receivedFromAncestor(index, key, module)) return true;
  const pending = [...(index.children.get(module) ?? [])];
  while (pending.length) {
    const descendant = pending.pop()!;
    if (!visibleIn(index, id, descendant)) return false;
    pending.push(...(index.children.get(descendant) ?? []));
  }
  return true;
}
