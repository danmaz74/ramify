import { describe, expect, it } from 'vitest';

import {
  allSymbols,
  ancestorsOf,
  buildTree,
  moduleTagsOf,
  symbolTagsOf,
  type ModuleDeclaration,
} from './tree.js';

const line: ModuleDeclaration = {
  id: 'root',
  owns: [{ symbol: 'A' }],
  children: [
    {
      id: 'middle',
      children: [{ id: 'leaf', owns: [{ symbol: 'B' }] }],
    },
    { id: 'aside' },
  ],
};

describe('buildTree', () => {
  it('indexes every declared module with its parent and children', () => {
    const tree = buildTree(line);

    expect(tree.root).toBe('root');
    expect([...tree.modules.keys()]).toEqual(['root', 'middle', 'leaf', 'aside']);
    expect(tree.modules.get('root')).toMatchObject({ parent: null, children: ['middle', 'aside'] });
    expect(tree.modules.get('middle')).toMatchObject({ parent: 'root', children: ['leaf'] });
    expect(tree.modules.get('leaf')).toMatchObject({ parent: 'middle', children: [] });
  });

  it('defaults owns, reExposes and children to empty', () => {
    const tree = buildTree({ id: 'solo' });
    expect(tree.modules.get('solo')).toEqual({
      id: 'solo',
      parent: null,
      children: [],
      owns: [],
      reExposes: [],
    });
  });

  it('rejects duplicate module ids', () => {
    expect(() => buildTree({ id: 'a', children: [{ id: 'a' }] })).toThrow(/Duplicate module id "a"/);
  });

  it('rejects an empty module id', () => {
    expect(() => buildTree({ id: '' })).toThrow(/missing an id/);
  });

  it('rejects the same symbol declared twice by one module', () => {
    expect(() =>
      buildTree({ id: 'a', owns: [{ symbol: 'X' }, { symbol: 'X', exposeToParent: true }] }),
    ).toThrow(/declares the symbol "X" twice/);
  });

  it('rejects a re-exposure from a module that is not a direct child', () => {
    expect(() =>
      buildTree({
        id: 'a',
        reExposes: [{ symbol: 'X', from: 'grandchild', exposeToDescendants: true }],
        children: [{ id: 'b', children: [{ id: 'grandchild' }] }],
      }),
    ).toThrow(/not one of its direct children/);
  });

  it('keeps a module’s declared classification as written', () => {
    const tree = buildTree({
      id: 'app',
      moduleTags: ['browser'],
      children: [{ id: 'widgets' }],
    });

    expect(tree.modules.get('app')).toMatchObject({
      moduleTags: ['browser'],
    });
    // Each module keeps its own classification.
    expect(tree.modules.get('widgets')?.moduleTags).toBeUndefined();
  });

  it('rejects a duplicated re-exposure declaration', () => {
    expect(() =>
      buildTree({
        id: 'a',
        reExposes: [
          { symbol: 'X', from: 'b', exposeToParent: true },
          { symbol: 'X', from: 'b', exposeToDescendants: true },
        ],
        children: [{ id: 'b' }],
      }),
    ).toThrow(/re-exposure of "X" from "b" twice/);
  });
});

describe('ancestorsOf', () => {
  const tree = buildTree(line);

  it('lists proper ancestors nearest first', () => {
    expect(ancestorsOf(tree, 'leaf')).toEqual(['middle', 'root']);
    expect(ancestorsOf(tree, 'aside')).toEqual(['root']);
  });

  it('gives the root no ancestors, and never includes the module itself', () => {
    expect(ancestorsOf(tree, 'root')).toEqual([]);
    expect(ancestorsOf(tree, 'middle')).not.toContain('middle');
  });

  it('throws for an unknown module', () => {
    expect(() => ancestorsOf(tree, 'nowhere')).toThrow(/Unknown module "nowhere"/);
  });
});

describe('moduleTagsOf', () => {
  const tree = buildTree({
    id: 'root',
    moduleTags: ['browser'],
    children: [
      { id: 'tests', moduleTags: ['testing', 'testing'] },
      { id: 'plain' },
    ],
  });

  it('deduplicates only the module’s declared tags', () => {
    expect(moduleTagsOf(tree, 'root')).toEqual(['browser']);
    expect(moduleTagsOf(tree, 'tests')).toEqual(['testing']);
    expect(moduleTagsOf(tree, 'plain')).toEqual([]);
  });

  it('throws for an unknown module', () => {
    expect(() => moduleTagsOf(tree, 'missing')).toThrow(/Unknown module/);
  });
});

describe('symbolTagsOf', () => {
  const tree = buildTree({
    id: 'root',
    owns: [{ symbol: 'Money' }],
    children: [
      {
        id: 'fakes',
        moduleTags: ['testing'],
        owns: [{ symbol: 'fakeClock', exposeToParent: true }],
      },
    ],
  });

  it('gives an untagged symbol no tags', () => {
    expect(symbolTagsOf(tree, 'root', 'Money')).toEqual([]);
  });

  it('gives a symbol its owner’s classification implies its tag', () => {
    expect(symbolTagsOf(tree, 'fakes', 'fakeClock')).toEqual(['testing']);
  });

  it('gives a symbol the named module does not own no tags', () => {
    expect(symbolTagsOf(tree, 'root', 'fakeClock')).toEqual([]);
  });
});

describe('allSymbols', () => {
  it('lists every declared symbol in pre-order, including never-exposed ones', () => {
    expect(allSymbols(buildTree(line))).toEqual([
      { owner: 'root', name: 'A' },
      { owner: 'leaf', name: 'B' },
    ]);
  });
});
