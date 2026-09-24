import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : sources(join(directory, entry.name));
    return entry.name.endsWith('.ts') ? [join(directory, entry.name)] : [];
  });
}

describe('purity', () => {
  it('imports nothing but zod and its own files outside its tests', () => {
    const imported = sources(sourceRoot).flatMap(file => [...readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)].map(match => match[1] ?? ''));
    expect(imported.length).toBeGreaterThan(0);
    expect(imported.filter(specifier => specifier !== 'zod' && !specifier.startsWith('./') && !specifier.startsWith('../'))).toEqual([]);
    expect(imported.filter(specifier => specifier.startsWith('../') && !specifier.startsWith('../identity') && !specifier.startsWith('../interfaces'))).toEqual([]);
  });
});
