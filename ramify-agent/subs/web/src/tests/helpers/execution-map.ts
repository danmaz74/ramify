import type { ExecutionMapPage, ExecutionNode } from '../../../../harness/src/interfaces/protocol/execution-map.js';

const methodLimit = 'Two worktree snapshots can miss edits reverted before the second snapshot.' as const;
const source = { kind: 'work-item' as const, id: 'wi-000', sequence: 1, revision: 1 };
const lines = (added = 0) => ({ totals: { added, deleted: 2, textPaths: 1, invocationIds: [] as string[] },
  coverage: 'partial' as const, gaps: [] as string[], binary: { paths: 0, invocationIds: [] as string[] }, methodLimit });

/** Browser-owned wire pages, independent of the harness page producer. */
export function executionPages(version = 42, input = 'tree-input-1'): [ExecutionMapPage, ExecutionMapPage] {
  const nodes: ExecutionNode[] = Array.from({ length: 110 }, (_, i) => ({
    kind: 'work-item', key: `work-item:wi-${String(i).padStart(3, '0')}`, runVersion: version,
    label: `Work item ${i}`, sourceRefs: [source], modules: [{ module: 'project/ui', role: 'owner', source }],
    state: 'working', module: 'project/ui', goal: `Implement item ${i}.`,
  }));
  const treeOf = (first: boolean): ExecutionMapPage['tree'] => ({ status: 'available', revision: 'tree-rev-1', input,
    modules: first ? [{ module: 'project', parent: null, dir: '' },
      { module: 'project/ui', parent: 'project', dir: 'subs/ui' }] : [] });
  const moduleMapOf = (tree: ExecutionMapPage['tree']): ExecutionMapPage['moduleMap'] => ({
    tree, modules: tree.status === 'available' && tree.modules.length > 0 ? [
      { module: 'project', parent: null, dir: '', direct: [], workedIn: false, involvedDescendants: 1, lines: lines() },
      { module: 'project/ui', parent: 'project', dir: 'subs/ui', direct: [], workedIn: true,
        involvedDescendants: 0, lines: lines(5) },
    ] : [], outsideTree: [], proposed: [], unplaced: [], unmapped: lines(), lines: lines(5),
  });
  const total = { nodes: 110, links: 1, modules: 2, moduleRelations: 110, lineRefs: 4 };
  const coverage = (shown: typeof total): ExecutionMapPage['coverage'] => ({
    nodes: { shown: shown.nodes, total: total.nodes }, links: { shown: shown.links, total: total.links },
    modules: { shown: shown.modules, total: total.modules },
    moduleRelations: { shown: shown.moduleRelations, total: total.moduleRelations },
    lineRefs: { shown: shown.lineRefs, total: total.lineRefs }, gaps: [],
  });
  const firstTree = treeOf(true), secondTree = treeOf(false);
  const common = { schema: 'execution-map/1' as const, runVersion: version,
    current: { awaitedSession: null, runningGate: null, source: null } };
  const relation = (node: ExecutionNode) => ({ module: 'project/ui', element: node.key,
    role: 'owner' as const, source });
  const first: ExecutionMapPage = { ...common, cursor: null, nextCursor: 'second',
    tree: firstTree, moduleMap: moduleMapOf(firstTree), nodes: nodes.slice(0, 100),
    links: [{ id: 'follows:0:101', runVersion: version, kind: 'follows',
      from: { coverage: 'shown', key: nodes[0]!.key },
      to: { coverage: 'other-page', key: nodes[101]!.key }, source }],
    moduleRelations: nodes.slice(0, 100).map(relation),
    lineRefs: [
      { scope: 'module', module: 'project/ui', field: 'text-invocation', value: 'inv-001' },
      { scope: 'module', module: 'project/ui', field: 'gap', value: 'Partial writer capture.' },
      { scope: 'all', module: null, field: 'text-invocation', value: 'inv-001' },
      { scope: 'all', module: null, field: 'gap', value: 'Partial writer capture.' },
    ],
    coverage: coverage({ nodes: 100, links: 1, modules: 2, moduleRelations: 100, lineRefs: 4 }),
  };
  const second: ExecutionMapPage = { ...common, cursor: 'second', nextCursor: null,
    tree: secondTree, moduleMap: moduleMapOf(secondTree), nodes: nodes.slice(100), links: [],
    moduleRelations: nodes.slice(100).map(relation), lineRefs: [],
    coverage: coverage({ nodes: 10, links: 0, modules: 0, moduleRelations: 10, lineRefs: 0 }),
  };
  return [first, second];
}
