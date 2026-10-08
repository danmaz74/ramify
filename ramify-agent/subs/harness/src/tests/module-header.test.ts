import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { candidateModuleIndex } from '../reviews/signals.js';
import { parseModuleHeader } from '../run/module-header.js';
import { moduleTestAreas } from '../run/project-config.js';
import { openCandidateSnapshot } from '../reviews/snapshot.js';
import { scriptedCandidates } from './helpers/candidates.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { readDeclaredTree } from './helpers/iterations.js';
import { rootDescription } from './helpers/root-description.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe('module header recognition', () => {
  test.each(['module', 'root module'] as const)('%s accepts a quoted name and tags after a comment', spelling => {
    expect(parseModuleHeader(`ramify 1\n// purpose\n${spelling} "shop" tagged [testing, ui]\n`))
      .toEqual({ name: 'shop', tags: ['testing', 'ui'] });
    expect(parseModuleHeader(`${spelling} shop\n`)).toEqual({ name: 'shop', tags: [] });
  });

  test('returns no header when the statement is absent or the quoted name is incomplete', () => {
    expect(parseModuleHeader('ramify 1\n// no module\n')).toBeNull();
    expect(parseModuleHeader('module "unclosed\n')).toBeNull();
  });

  test.each(['module', 'root module'] as const)('%s keeps the same root test area and complete descendant tree', async spelling => {
    const directory = await temporaryDirectory();
    cleanups.push(directory.remove);
    const files = {
      'module.ramify': rootDescription('"shop" tagged [ui]', '', spelling),
      'src/tests/features/shop.feature': 'Feature: shop\n',
      'subs/cart/module.ramify': 'ramify 1\nmodule cart\n',
      'subs/cart/subs/pricing/module.ramify': 'ramify 1\nmodule "pricing" tagged [testing]\n',
    };
    for (const [path, contents] of Object.entries(files)) {
      await mkdir(join(directory.path, path, '..'), { recursive: true });
      await writeFile(join(directory.path, path), contents);
    }

    const expected = ['shop', 'shop/cart', 'shop/cart/pricing'];
    const declared = await readDeclaredTree(directory.path);
    expect([...declared.modules.keys()]).toEqual(expected);
    expect(declared.modules.get('shop')).toMatchObject({ dir: '', parent: null, children: ['shop/cart'], tags: ['ui'] });
    expect(declared.modules.get('shop/cart/pricing')).toMatchObject({ parent: 'shop/cart', tags: ['testing'] });
    expect(await moduleTestAreas(directory.path, null)).toEqual([
      { module: 'shop', area: 'src/tests' },
      { module: 'cart', area: 'subs/cart/src/tests' },
      { module: 'pricing', area: 'subs/cart/subs/pricing/src' },
    ]);

    const source = scriptedCandidates(directory.path, {
      c1: { tree: 't1', base: 'c0', changes: [], files },
    });
    const snapshot = await openCandidateSnapshot(source, directory.path, { commit: 'c1', base: 'c0' });
    const candidate = await candidateModuleIndex(source, directory.path, snapshot);
    expect([...candidate.modules.keys()]).toEqual(['shop/cart/pricing', 'shop/cart', 'shop']);
    expect(candidate.modules.get('shop')).toMatchObject({ dir: '', parent: null, children: ['shop/cart'], tags: ['ui'] });
    expect(candidate.modules.get('shop/cart/pricing')).toMatchObject({ parent: 'shop/cart', tags: ['testing'] });
  });
});
