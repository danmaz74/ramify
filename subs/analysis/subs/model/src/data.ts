import type { ModelIssue, SourceLocation } from './interfaces/model.js';

export const namePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedNames(names: readonly string[]): string[] {
  return [...new Set(names)].sort(compare);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function validText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
    && !/[\u0000-\u001f\u007f]/u.test(value) && !/[\uD800-\uDFFF]/u.test(value);
}

/** Captured paths are already normalized; never probe or repair them here. */
export function validPath(value: unknown): value is string {
  return validText(value) && !value.includes('\\') && !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
    && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

export function validLocation(value: unknown): value is SourceLocation {
  return isRecord(value) && validPath(value.file)
    && Number.isInteger(value.start) && Number(value.start) >= 0
    && Number.isInteger(value.end) && Number(value.end) >= Number(value.start)
    && Number.isInteger(value.line) && Number(value.line) >= 1
    && Number.isInteger(value.column) && Number(value.column) >= 1;
}

export function locations(values: readonly SourceLocation[]): SourceLocation[] {
  const canonical = values.map(({ file, start, end, line, column }) => ({ file, start, end, line, column }));
  const unique = new Map(canonical.map((value) => [JSON.stringify(value), value]));
  return [...unique.values()].sort((a, b) => compare(a.file, b.file)
    || a.start - b.start || a.end - b.end || a.line - b.line || a.column - b.column);
}

export function issue(code: ModelIssue['code'], message: string,
  evidence: readonly SourceLocation[] = []): ModelIssue {
  return { code, message, locations: locations(evidence) };
}

/** Detach retained data and reject non-JSON state, including cycles. */
export function immutable<T>(input: T): T {
  const active = new Set<object>();
  function copy(value: unknown): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || (!Array.isArray(value) && !isRecord(value))) {
      throw new TypeError('Model data must contain only finite JSON values');
    }
    if (active.has(value)) throw new TypeError('Model data must be acyclic');
    active.add(value);
    const result = Array.isArray(value) ? value.map(copy)
      : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    active.delete(value);
    return Object.freeze(result);
  }
  return copy(input) as T;
}
