import { describe, expect, it } from 'vitest';

import { allSymbols, ancestorsOf, buildTree, type ModuleDeclaration } from './tree.js';

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

describe('allSymbols', () => {
  it('lists every declared symbol in pre-order, including never-exposed ones', () => {
    expect(allSymbols(buildTree(line))).toEqual([
      { owner: 'root', name: 'A' },
      { owner: 'leaf', name: 'B' },
    ]);
  });
});
