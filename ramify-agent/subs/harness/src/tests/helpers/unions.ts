import type { z } from 'zod';

/*
 * The union inventory of the composition suite: every closed set of values
 * a durable record, a log line, an agent submission or a public projection
 * can hold, found by walking the schemas themselves rather than by a list a
 * person keeps. A union a later change adds is found without anyone naming
 * it, and must then be given a producer before the suite passes.
 *
 * A union is a `z.enum`, a union of literals, or the discriminator of a
 * discriminated union. A single literal, such as a record's schema version,
 * is not a union.
 */

type Schema = z.ZodType;

interface Def {
  readonly type: string;
  readonly [key: string]: unknown;
}

function defOf(schema: unknown): Def | undefined {
  return (schema as { _zod?: { def?: Def } } | undefined)?._zod?.def;
}

/** One union: where it was first found, and every value it admits. */
export interface UnionSite {
  readonly name: string;
  readonly values: readonly string[];
}

function literalValues(schema: unknown): string[] | undefined {
  const def = defOf(schema);
  if (def?.type !== 'literal') return undefined;
  return (def.values as unknown[]).map(String);
}

/** The discriminator values of each option, where the union is discriminated. */
function discriminated(def: Def): { key: string; options: Array<{ values: string[]; option: unknown }> } | undefined {
  const key = def.discriminator as string | undefined;
  if (key === undefined) return undefined;
  const options = (def.options as unknown[]).map(option => {
    const shape = defOf(option)?.shape as Record<string, unknown> | undefined;
    return { values: literalValues(shape?.[key]) ?? [], option };
  });
  return { key, options };
}

const wrappers = new Set(['optional', 'nullable', 'default', 'readonly', 'catch', 'nonoptional', 'prefault', 'success']);

/**
 * Every union reachable from the roots, keyed by the schema that declares
 * it. A union reached by two paths is one union, named by the first.
 */
export function unionInventory(roots: Readonly<Record<string, unknown>>): Map<unknown, UnionSite> {
  const sites = new Map<unknown, UnionSite>();
  const visited = new Set<unknown>();

  function walk(schema: unknown, path: string, depth: number): void {
    const def = defOf(schema);
    if (def === undefined || depth > 40) return;
    if (def.type === 'enum') {
      if (!sites.has(schema)) sites.set(schema, { name: path, values: Object.values(def.entries as Record<string, string>).map(String) });
      return;
    }
    if (def.type === 'literal') {
      // One literal with several values is a union of them.
      const values = (def.values as unknown[]).map(String);
      if (values.length > 1 && !sites.has(schema)) sites.set(schema, { name: path, values });
      return;
    }
    if (visited.has(schema)) return;
    visited.add(schema);
    switch (def.type) {
      case 'object':
        for (const [key, value] of Object.entries(def.shape as Record<string, unknown>)) walk(value, `${path}.${key}`, depth + 1);
        return;
      case 'union': {
        const byKey = discriminated(def);
        if (byKey !== undefined) {
          sites.set(schema, { name: `${path}.${byKey.key}`, values: byKey.options.flatMap(option => option.values) });
          for (const option of byKey.options) walk(option.option, `${path}[${option.values.join('|')}]`, depth + 1);
          return;
        }
        const options = def.options as unknown[];
        const literals = options.map(literalValues);
        if (literals.every(values => values !== undefined)) {
          sites.set(schema, { name: path, values: literals.flatMap(values => values!) });
          return;
        }
        options.forEach((option, index) => walk(option, `${path}|${index}`, depth + 1));
        return;
      }
      case 'array': walk(def.element, `${path}[]`, depth + 1); return;
      case 'record': walk(def.valueType, `${path}{}`, depth + 1); return;
      case 'tuple': (def.items as unknown[]).forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1)); return;
      case 'pipe': walk(def.in, path, depth + 1); walk(def.out, path, depth + 1); return;
      case 'lazy': walk((def.getter as () => unknown)(), path, depth + 1); return;
      case 'intersection': walk(def.left, path, depth + 1); walk(def.right, path, depth + 1); return;
      default:
        if (wrappers.has(def.type)) walk(def.innerType, path, depth + 1);
    }
  }

  for (const [name, schema] of Object.entries(roots)) walk(schema, name, 0);
  return sites;
}

/**
 * Records, beside `observed`, every union value `value` holds, walking the
 * schema and the value together. A value that does not fit the schema is
 * walked as far as it fits: what is recorded is what the record holds.
 */
export function observeValues(schema: unknown, value: unknown, observed: Map<unknown, Set<string>>): void {
  const def = defOf(schema);
  if (def === undefined || value === undefined || value === null) return;
  const add = (key: unknown, found: string) => {
    let set = observed.get(key);
    if (set === undefined) observed.set(key, set = new Set());
    set.add(found);
  };
  switch (def.type) {
    case 'enum':
      if (typeof value === 'string') add(schema, value);
      return;
    case 'literal':
      if ((def.values as unknown[]).length > 1) add(schema, String(value));
      return;
    case 'object': {
      if (typeof value !== 'object') return;
      for (const [key, field] of Object.entries(def.shape as Record<string, unknown>)) {
        observeValues(field, (value as Record<string, unknown>)[key], observed);
      }
      return;
    }
    case 'union': {
      const byKey = discriminated(def);
      if (byKey !== undefined) {
        const tag = typeof value === 'object' ? (value as Record<string, unknown>)[byKey.key] : undefined;
        const option = byKey.options.find(candidate => candidate.values.includes(String(tag)));
        if (option === undefined) return;
        add(schema, String(tag));
        observeValues(option.option, value, observed);
        return;
      }
      const options = def.options as unknown[];
      if (options.every(option => literalValues(option) !== undefined)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') add(schema, String(value));
        return;
      }
      const fitting = options.find(option => (option as Schema).safeParse(value).success);
      if (fitting !== undefined) observeValues(fitting, value, observed);
      return;
    }
    case 'array':
      if (Array.isArray(value)) for (const item of value) observeValues(def.element, item, observed);
      return;
    case 'record':
      if (typeof value === 'object') for (const item of Object.values(value as Record<string, unknown>)) observeValues(def.valueType, item, observed);
      return;
    case 'tuple':
      if (Array.isArray(value)) (def.items as unknown[]).forEach((item, index) => observeValues(item, value[index], observed));
      return;
    case 'pipe': observeValues(def.in, value, observed); return;
    case 'lazy': observeValues((def.getter as () => unknown)(), value, observed); return;
    case 'intersection': observeValues(def.left, value, observed); observeValues(def.right, value, observed); return;
    default:
      if (wrappers.has(def.type)) observeValues(def.innerType, value, observed);
  }
}
