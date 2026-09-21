import type { ArchitectIndex, ModuleEntry, SymbolRecord } from '../../../subs/evidence/src/views.js';

/*
 * The architect view a test works from, built in memory. Its shape is the
 * reader's: a test that needs a materialized view reads a real one instead.
 */

/** One module of a view, with the fields a caller cares about and defaults for the rest. */
export function moduleEntry(
  module: string,
  dir: string,
  parent: string | null,
  extra: { readonly children?: readonly string[]; readonly tags?: readonly string[]; readonly areas?: readonly string[] } = {},
): ModuleEntry {
  return {
    module,
    dir,
    parent,
    children: extra.children ?? [],
    tags: extra.tags ?? [],
    areas: extra.areas ?? ['src', 'src/tests'],
  };
}

/** An architect index over the given modules, with the children filled in from each parent. */
export function architectIndex(
  entries: readonly ModuleEntry[],
  symbols: ReadonlyMap<string, readonly SymbolRecord[]> = new Map(),
  identity: { readonly revision?: string; readonly input?: string } = {},
): ArchitectIndex {
  const children = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.parent === null) continue;
    children.set(entry.parent, [...(children.get(entry.parent) ?? []), entry.module]);
  }
  return {
    revision: identity.revision ?? 'rev/1:x:1',
    input: identity.input ?? 'input/1:abc',
    modules: new Map(entries.map(entry => [entry.module, {
      ...entry,
      children: entry.children.length > 0 ? entry.children : (children.get(entry.module) ?? []),
    }])),
    symbols,
  };
}
