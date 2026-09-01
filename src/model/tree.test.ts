import { describe, expect, it } from 'vitest';

import {
  allSymbols,
  ancestorsOf,
  buildTree,
  moduleTagsOf,
  symbolTagsOf,
  requireImporterContext,
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
      contexts: [{ name: 'ui-tests', tags: ['testing'] }],
      children: [{ id: 'widgets' }],
    });

    expect(tree.modules.get('app')).toMatchObject({
      moduleTags: ['browser'],
      contexts: [{ name: 'ui-tests', tags: ['testing'] }],
    });
    // The record holds the declaration; what a submodule inherits is read
    // through `moduleTagsOf`, never stored twice.
    expect(tree.modules.get('widgets')?.moduleTags).toBeUndefined();
  });

  it('rejects two importer contexts with the same name', () => {
    expect(() =>
      buildTree({
        id: 'a',
        contexts: [
          { name: 'tests', tags: ['testing'] },
          { name: 'tests', tags: [] },
        ],
      }),
    ).toThrow(/declares the importer context "tests" twice/);
  });

  it('rejects an importer context without a name', () => {
    expect(() => buildTree({ id: 'a', contexts: [{ name: '', tags: ['testing'] }] })).toThrow(
      /importer context without a name/,
    );
  });

  it('accepts an importer context with no tags — representable and inert', () => {
    const tree = buildTree({ id: 'a', contexts: [{ name: 'scratch', tags: [] }] });
    expect(tree.modules.get('a')?.contexts).toEqual([{ name: 'scratch', tags: [] }]);
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
    children: [
      {
        id: 'ui',
        moduleTags: ['browser'],
        contexts: [{ name: 'ui-tests', tags: ['testing'] }],
        children: [{ id: 'widgets' }],
      },
      { id: 'server' },
    ],
  });

  it('names each tag once, most specific first', () => {
    expect(moduleTagsOf(tree, 'ui', 'ui-tests')).toEqual(['testing', 'browser']);
  });

  it('gives an unclassified module no tags', () => {
    expect(moduleTagsOf(tree, 'server')).toEqual([]);
    expect(moduleTagsOf(tree, 'root')).toEqual([]);
  });

  it('carries a classification into the declaring module’s subtree', () => {
    expect(moduleTagsOf(tree, 'widgets')).toEqual(['browser']);
  });

  it('throws for a context the module does not declare', () => {
    expect(() => moduleTagsOf(tree, 'server', 'ui-tests')).toThrow(
      /Module "server" declares no importer context "ui-tests"/,
    );
    // A context is declared by exactly one module: a submodule does not inherit it.
    expect(() => requireImporterContext(tree, 'widgets', 'ui-tests')).toThrow(
      /declares no importer context/,
    );
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
