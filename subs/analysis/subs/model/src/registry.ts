import type { ModelIssue, ModelResult, ResolvedTagRegistry, TagDefinition } from './interfaces/model.js';
import { compare, immutable, isRecord, issue, namePattern } from './data.js';

const defaults: readonly TagDefinition[] = [
  { name: 'browser', kind: 'required-symbol' },
  { name: 'dispatch', kind: 'required-importer' },
  { name: 'testing', kind: 'required-importer' },
  { name: 'ui', kind: 'required-importer' },
];

function identity(definitions: readonly TagDefinition[]): string {
  return 'registry/1:' + JSON.stringify(definitions.map(({ name, kind, description }) =>
    [name, kind, description ?? null]));
}

export function resolveTagRegistry(definitions: unknown): ModelResult<ResolvedTagRegistry> {
  if (!Array.isArray(definitions)) {
    return immutable({ status: 'invalid', issues: [issue('invalid-registry', 'Tag definitions must be an array')] });
  }
  const issues: ModelIssue[] = [];
  const names = new Set<string>();
  const resolved: TagDefinition[] = [];
  for (const [index, definition] of definitions.entries()) {
    if (!isRecord(definition) || typeof definition.name !== 'string' || !namePattern.test(definition.name)) {
      issues.push(issue('invalid-registry', `Invalid tag definition name at index ${index}`));
      continue;
    }
    const { name, kind, description } = definition;
    if (names.has(name)) issues.push(issue('invalid-registry', `Duplicate tag definition "${name}"`));
    names.add(name);
    if (kind !== 'required-importer' && kind !== 'required-symbol') {
      issues.push(issue('invalid-registry', `Invalid kind for tag "${name}"`));
      continue;
    }
    if (Object.keys(definition).some((key) => !['name', 'kind', 'description'].includes(key))
      || (description !== undefined && typeof description !== 'string')) {
      issues.push(issue('invalid-registry', `Invalid definition fields for tag "${name}"`));
      continue;
    }
    resolved.push({ name, kind, ...(description === undefined ? {} : { description }) });
  }
  if (!resolved.some(({ name, kind }) => name === 'testing' && kind === 'required-importer')
    || resolved.some(({ name, kind }) => name === 'testing' && kind !== 'required-importer')) {
    issues.push(issue('invalid-registry', 'Reserved tag "testing" must remain required-importer'));
  }
  if (issues.length) return immutable({ status: 'invalid', issues });
  resolved.sort((a, b) => compare(a.name, b.name));
  const id = identity(resolved);
  return immutable({ status: 'valid', value: { id, definitions: resolved, isDefault: id === identity(defaults) } });
}

export function createDefaultTagRegistry(): ResolvedTagRegistry {
  const result = resolveTagRegistry(defaults);
  if (result.status === 'invalid') throw new Error('Invalid built-in tag registry');
  return result.value;
}

/** Public structural types must not let callers forge resolved identities. */
export function validateRegistry(registry: ResolvedTagRegistry): ModelResult<ResolvedTagRegistry> {
  const result = resolveTagRegistry(registry?.definitions);
  if (result.status === 'invalid') return result;
  if (registry.id !== result.value.id || registry.isDefault !== result.value.isDefault) {
    return immutable({ status: 'invalid', issues: [issue('invalid-registry', 'Resolved registry identity or default claim does not match its definitions')] });
  }
  return result;
}
