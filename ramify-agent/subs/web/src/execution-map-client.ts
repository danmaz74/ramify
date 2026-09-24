import type {
  ExecutionLink, ExecutionMapPage, ExecutionNode,
} from '../../harness/src/interfaces/protocol/execution-map.js';
import { ClientError } from './client.js';

export interface ExecutionMapSnapshot {
  readonly runVersion: number;
  readonly tree: ExecutionMapPage['tree'];
  readonly moduleMap: ExecutionMapPage['moduleMap'];
  readonly current: ExecutionMapPage['current'];
  readonly nodes: readonly ExecutionNode[];
  readonly links: readonly ExecutionLink[];
  readonly coverage: ExecutionMapPage['coverage'];
  /** A disconnected client may show its previous complete read with this explicit label. */
  readonly freshness: 'fresh' | 'stale';
}

function invalid(message: string): never {
  throw new ClientError('invalid-response', `Inconsistent execution-map pages: ${message}`);
}

function treeIdentity(tree: ExecutionMapPage['tree']): string {
  return tree.status === 'available' ? JSON.stringify([tree.status, tree.revision, tree.input])
    : JSON.stringify([tree.status, tree.message]);
}

function copyLines(lines: ExecutionMapPage['moduleMap']['lines']): ExecutionMapPage['moduleMap']['lines'] {
  return { ...lines, totals: { ...lines.totals, invocationIds: [...lines.totals.invocationIds] },
    binary: { ...lines.binary, invocationIds: [...lines.binary.invocationIds] }, gaps: [...lines.gaps] };
}

/** Assemble one complete bounded census before making it visible to the UI. */
export async function loadExecutionMapPages(version: number,
  fetchPage: (cursor?: string) => Promise<ExecutionMapPage>): Promise<ExecutionMapSnapshot> {
  const nodes: ExecutionNode[] = [];
  const links: ExecutionLink[] = [];
  const modules: ExecutionMapPage['moduleMap']['modules'] = [];
  const outsideTree: ExecutionMapPage['moduleMap']['outsideTree'] = [];
  const proposed: ExecutionMapPage['moduleMap']['proposed'] = [];
  const unplaced: ExecutionMapPage['moduleMap']['unplaced'] = [];
  const treeModules: Extract<ExecutionMapPage['tree'], { status: 'available' }>['modules'] = [];
  const moduleRelations: ExecutionMapPage['moduleRelations'] = [];
  const lineRefs: ExecutionMapPage['lineRefs'] = [];
  const seenNodes = new Set<string>();
  const seenLinks = new Set<string>();
  const seenModules = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let first: ExecutionMapPage | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    if (page.runVersion !== version || page.cursor !== (cursor ?? null)) invalid('version or cursor changed');
    if (first === undefined) first = page;
    else if (treeIdentity(page.tree) !== treeIdentity(first.tree) ||
      JSON.stringify(page.current) !== JSON.stringify(first.current) ||
      JSON.stringify(page.moduleMap.lines) !== JSON.stringify(first.moduleMap.lines) ||
      JSON.stringify(page.moduleMap.unmapped) !== JSON.stringify(first.moduleMap.unmapped) ||
      JSON.stringify(page.coverage) !== JSON.stringify({
        ...first.coverage, nodes: { ...first.coverage.nodes, shown: page.coverage.nodes.shown },
        links: { ...first.coverage.links, shown: page.coverage.links.shown },
        modules: { ...first.coverage.modules, shown: page.coverage.modules.shown },
        moduleRelations: { ...first.coverage.moduleRelations, shown: page.coverage.moduleRelations.shown },
        lineRefs: { ...first.coverage.lineRefs, shown: page.coverage.lineRefs.shown },
      })) invalid('snapshot identity or coverage changed');
    for (const node of page.nodes) {
      if (seenNodes.has(node.key)) invalid(`duplicate node ${node.key}`);
      seenNodes.add(node.key);
      nodes.push(node);
    }
    for (const link of page.links) {
      if (seenLinks.has(link.id)) invalid(`duplicate link ${link.id}`);
      seenLinks.add(link.id);
      links.push(link);
    }
    for (const row of page.moduleMap.modules) {
      if (seenModules.has(row.module)) invalid(`duplicate module ${row.module}`);
      seenModules.add(row.module);
      modules.push({ ...row, direct: [], lines: copyLines(row.lines) });
    }
    for (const row of page.moduleMap.outsideTree) {
      if (seenModules.has(row.module)) invalid(`duplicate outside module ${row.module}`);
      seenModules.add(row.module);
      outsideTree.push({ ...row, direct: [], lines: copyLines(row.lines) });
    }
    proposed.push(...page.moduleMap.proposed);
    unplaced.push(...page.moduleMap.unplaced);
    moduleRelations.push(...page.moduleRelations);
    lineRefs.push(...page.lineRefs);
    if (page.tree.status === 'available') treeModules.push(...page.tree.modules);
    if (nodes.length > page.coverage.nodes.total || links.length > page.coverage.links.total ||
        modules.length + outsideTree.length + proposed.length + unplaced.length > page.coverage.modules.total ||
        moduleRelations.length > page.coverage.moduleRelations.total || lineRefs.length > page.coverage.lineRefs.total) {
      invalid('a census exceeded its reported total');
    }
    if (page.nextCursor === null) {
      if (nodes.length !== page.coverage.nodes.total || links.length !== page.coverage.links.total ||
          modules.length + outsideTree.length + proposed.length + unplaced.length !== page.coverage.modules.total ||
          moduleRelations.length !== page.coverage.moduleRelations.total || lineRefs.length !== page.coverage.lineRefs.total) {
        invalid('a census ended before its reported total');
      }
      break;
    }
    if (page.coverage.nodes.shown + page.coverage.links.shown + page.coverage.modules.shown +
        page.coverage.moduleRelations.shown + page.coverage.lineRefs.shown === 0) {
      invalid('cursor advanced without a census row');
    }
    if (cursors.has(page.nextCursor)) invalid('cursor repeated');
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  if (first === undefined) invalid('no page');
  const allKeys = new Set(nodes.map(node => node.key));
  const resolvedLinks = links.map(link => ({ ...link,
    from: resolveEndpoint(link.from, allKeys), to: resolveEndpoint(link.to, allKeys),
  }));
  const byModule = new Map([...modules, ...outsideTree].map(row => [row.module, row]));
  for (const relation of moduleRelations) {
    const row = byModule.get(relation.module);
    if (row === undefined || !allKeys.has(relation.element)) invalid(`module relation target ${relation.element} is absent`);
    if (row.direct.some(existing => existing.element === relation.element && existing.role === relation.role)) {
      invalid(`duplicate module relation ${relation.module}:${relation.element}:${relation.role}`);
    }
    row.direct.push({ element: relation.element, role: relation.role, source: relation.source });
  }
  const unmapped = copyLines(first.moduleMap.unmapped);
  const allLines = copyLines(first.moduleMap.lines);
  const gaps: string[] = [...first.coverage.gaps];
  for (const ref of lineRefs) {
    if (ref.scope === 'core') {
      if (ref.field !== 'gap' || ref.module !== null) invalid('invalid core coverage reference');
      if (!gaps.includes(ref.value)) gaps.push(ref.value);
      continue;
    }
    const lines = ref.scope === 'unmapped' ? unmapped : ref.scope === 'all' ? allLines : byModule.get(ref.module ?? '')?.lines;
    if (lines === undefined || ((ref.scope === 'module' || ref.scope === 'outside') !== (ref.module !== null))) {
      invalid('line reference has no summary');
    }
    if (ref.field === 'text-invocation') lines.totals.invocationIds.push(ref.value);
    else if (ref.field === 'binary-invocation') lines.binary.invocationIds.push(ref.value);
    else lines.gaps.push(ref.value);
  }
  const tree = first.tree.status === 'available' ? { ...first.tree, modules: treeModules } : first.tree;
  return {
    runVersion: version, tree,
    moduleMap: { ...first.moduleMap, tree, modules, outsideTree, proposed, unplaced,
      unmapped, lines: allLines },
    current: first.current, nodes, links: resolvedLinks,
    coverage: { nodes: { shown: nodes.length, total: first.coverage.nodes.total },
      links: { shown: links.length, total: first.coverage.links.total },
      modules: { shown: modules.length + outsideTree.length + proposed.length + unplaced.length,
        total: first.coverage.modules.total },
      moduleRelations: { shown: moduleRelations.length, total: first.coverage.moduleRelations.total },
      lineRefs: { shown: lineRefs.length, total: first.coverage.lineRefs.total }, gaps },
    freshness: 'fresh',
  };
}

function resolveEndpoint(endpoint: ExecutionLink['from'], keys: ReadonlySet<string>): ExecutionLink['from'] {
  if (endpoint.coverage === 'unresolved') return endpoint;
  if (!keys.has(endpoint.key)) invalid(`missing endpoint ${endpoint.key} was not marked unresolved`);
  return { coverage: 'shown', key: endpoint.key };
}
