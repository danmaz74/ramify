import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { loadArchitectIndex, readApiView, readArchitectMeta, type ModuleEntry } from '../views.js';
import { temporaryDirectory } from './helpers/temporary.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function fixture() {
  const temp = await temporaryDirectory();
  cleanups.push(temp.remove);
  const write = async (path: string, value: unknown) => {
    const target = resolve(temp.path, path);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, JSON.stringify(value));
  };
  return { root: temp.path, write };
}

const architect = { schema: 'ramify.architect-view/3', revision: 'rev/1:test', input: 'input/1:test', modules: 1,
  dependencies: 'measured', dependencyScope: 'production', testReferences: 'measured', metrics: 'measured' };
const entry: ModuleEntry = { module: 'app', dir: '', parent: null, children: [], tags: [], areas: ['src', 'src/tests'] };

describe('current generated view readers', () => {
  test('architect metadata and module documents refuse stale schemas', async () => {
    const f = await fixture();
    await f.write('.ramify-architect/_meta.json', architect);
    expect((await readArchitectMeta(f.root)).input).toBe('input/1:test');
    await f.write('.ramify-architect/module.json', { schema: 'ramify.architect-module/2', ...entry });
    await expect(loadArchitectIndex(f.root)).rejects.toThrow('ramify.architect-module/3');
    await f.write('.ramify-architect/module.json', { schema: 'ramify.architect-module/3', ...entry, areas: ['src', 'unknown'] });
    await expect(loadArchitectIndex(f.root)).rejects.toThrow('ramify.architect-module/3');
    await f.write('.ramify-architect/_meta.json', { ...architect, schema: 'ramify.architect-view/2' });
    await expect(readArchitectMeta(f.root)).rejects.toThrow('ramify.architect-view/3');
  });

  test('ordinary and testing API areas have separate exact metadata and reject mismatches', async () => {
    const f = await fixture();
    expect(await readApiView(f.root, entry, 'src')).toBeUndefined();
    await f.write('src/.ramify/_meta.json', { schema: 'ramify.api-view/1', module: 'app', area: 'ordinary', revision: 'rev/1:test' });
    await f.write('src/tests/.ramify/_meta.json', { schema: 'ramify.api-view/1', module: 'app', area: 'tests', revision: 'rev/1:test', coverage: 2 });
    expect((await readApiView(f.root, entry, 'src'))?.coverage).toBeNull();
    expect((await readApiView(f.root, entry, 'src/tests'))?.coverage).toBe(2);
    await f.write('src/tests/.ramify/_meta.json', { schema: 'ramify.api-view/1', module: 'app', area: 'ordinary', revision: 'rev/1:test' });
    await expect(readApiView(f.root, entry, 'src/tests')).rejects.toThrow('app src/tests');
    await f.write('src/tests/.ramify/_meta.json', { schema: 'ramify.api-view/2', module: 'app', area: 'tests', revision: 'rev/1:test' });
    await expect(readApiView(f.root, entry, 'src/tests')).rejects.toThrow('ramify.api-view/1');
    await f.write('src/tests/.ramify/_meta.json', { schema: 'ramify.api-view/1', module: 'other', area: 'tests', revision: 'rev/1:test' });
    await expect(readApiView(f.root, entry, 'src/tests')).rejects.toThrow('app src/tests');
    await f.write('src/tests/.ramify/_meta.json', { schema: 'ramify.api-view/1', module: 'app', area: 'tests', revision: '' });
    await expect(readApiView(f.root, entry, 'src/tests')).rejects.toThrow('app src/tests');
  });
});
