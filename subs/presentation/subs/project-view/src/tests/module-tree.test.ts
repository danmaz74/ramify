import { describe, expect, it } from 'vitest';
import type { ExplorerModule } from '../interfaces/project-view.js';
import {
  ancestorsOf,
  collapsibleAtDepth,
  indexModuleTree,
  layoutModuleTree,
  PROJECT_NODE_ID,
  visibleModuleIds,
} from '../module-tree.js';
import { createTreeFixture } from './module-tree-fixture.js';

describe('module tree helpers', () => {
  const model = createTreeFixture();
  const index = indexModuleTree(model.modules, model.rootModuleId);

  it('MT01 indexes depth, subtree counts and name-ordered children', () => {
    expect(index.rootId).toBe('app');
    expect(index.maxDepth).toBe(2);
    expect(index.depth.get('app/core/model')).toBe(2);
    expect(index.descendants.get('app')).toBe(16);
    expect(index.descendants.get('app/ui')).toBe(12);
    expect(index.children.get('app/core')).toEqual(['app/core/model', 'app/core/store']);
  });

  it('MT01 hides the descendants of a collapsed middle level', () => {
    const visible = visibleModuleIds(index, new Set(['app/ui']));
    expect(visible).toEqual(['app', 'app/core', 'app/core/model', 'app/core/store', 'app/ui']);
    expect(visibleModuleIds(index, new Set())).toHaveLength(17);
  });

  it('MT01 lists ancestors root first', () => {
    expect(ancestorsOf(index, 'app/core/store')).toEqual(['app', 'app/core']);
    expect(ancestorsOf(index, 'app')).toEqual([]);
  });

  it('MT01 selects modules with children at or below a depth', () => {
    expect([...collapsibleAtDepth(index, 1)].sort()).toEqual(['app/core', 'app/ui']);
    expect([...collapsibleAtDepth(index, 2)]).toEqual([]);
  });

  it('MT01 places several parentless modules under the project node', () => {
    const orphans: ExplorerModule[] = model.modules
      .filter(module => module.id === 'app/core/model' || module.id === 'app/core/store')
      .map(module => ({ ...module, parent: null }));
    const forest = indexModuleTree(orphans);
    expect(forest.rootId).toBe(PROJECT_NODE_ID);
    expect(forest.topLevel).toEqual(['app/core/model', 'app/core/store']);
    const layout = layoutModuleTree(forest, new Set());
    expect(layout.nodes.map(node => node.id)).toEqual([PROJECT_NODE_ID, 'app/core/model', 'app/core/store']);
    expect(layout.edges.map(edge => edge.parent)).toEqual([PROJECT_NODE_ID, PROJECT_NODE_ID]);
  });

  it('MT07 lays out 500 modules within the budget', () => {
    const modules = syntheticTree(500, 6);
    const synthetic = indexModuleTree(modules, modules[0]!.id);
    expect(visibleModuleIds(synthetic, new Set())).toHaveLength(500);
    expect(synthetic.maxDepth).toBe(6);
    const timings: number[] = [];
    for (let run = 0; run < 20; run += 1) {
      const started = performance.now();
      layoutModuleTree(synthetic, new Set());
      timings.push(performance.now() - started);
    }
    timings.sort((left, right) => left - right);
    const median = timings[10]!;
    expect(median).toBeLessThanOrEqual(25);
  });
});

/** A breadth-first tree of `count` modules whose deepest level is `depth`. */
function syntheticTree(count: number, depth: number): ExplorerModule[] {
  const base = createTreeFixture().modules[2]!;
  const modules: { id: string; parent: string | null; children: string[]; level: number }[] = [
    { id: 'm0', parent: null, children: [], level: 0 },
  ];
  for (let index = 1; index < count; index += 1) {
    const candidates = modules.filter(module => module.level < depth);
    const parent = candidates[Math.floor((index - 1) / 3) % candidates.length]!;
    const module = { id: `m${index}`, parent: parent.id, children: [], level: parent.level + 1 };
    parent.children.push(module.id);
    modules.push(module);
  }
  return modules.map(module => ({ ...base, id: module.id, name: module.id, parent: module.parent,
    children: module.children }));
}
