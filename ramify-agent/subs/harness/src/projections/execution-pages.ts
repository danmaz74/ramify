import { createHash } from 'node:crypto';
import {
  executionMapLimits, executionMapPageSchema, executionMapQuerySchema,
  type ExecutionLink, type ExecutionLineSummary, type ExecutionMapPage, type ExecutionModuleMap,
} from '../interfaces/protocol/execution-map.js';
import type { ExecutionCoreIndex } from './execution-map.js';

type FullMap = ExecutionCoreIndex & { readonly moduleMap: ExecutionModuleMap };
type Offset = { readonly nodes: number; readonly links: number; readonly modules: number;
  readonly relations: number; readonly lineRefs: number };
type Cursor = Offset & { readonly scope: string; readonly version: number; readonly digest: string; readonly limit: number };

export class ExecutionPageError extends Error {
  constructor(readonly code: 'invalid-request' | 'stale-version' | 'unreadable', message: string,
    readonly currentVersion?: number) {
    super(message);
    this.name = 'ExecutionPageError';
  }
}

const rowsOf = (map: FullMap) => [
  ...map.moduleMap.modules.map(row => ({ kind: 'module' as const, row })),
  ...map.moduleMap.outsideTree.map(row => ({ kind: 'outside' as const, row })),
  ...map.moduleMap.proposed.map(row => ({ kind: 'proposed' as const, row })),
  ...map.moduleMap.unplaced.map(row => ({ kind: 'unplaced' as const, row })),
];

function readCursor(encoded: string): Cursor {
  if (!/^[A-Za-z0-9_-]{1,4096}$/.test(encoded)) throw new ExecutionPageError('invalid-request', 'Invalid execution-map cursor');
  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (value === null || typeof value !== 'object') throw new Error('object required');
    const c = value as Record<string, unknown>;
    if (Object.keys(c).sort().join(',') !== 'digest,limit,lineRefs,links,modules,nodes,relations,scope,version' ||
        typeof c['scope'] !== 'string' || typeof c['digest'] !== 'string' ||
        !Number.isSafeInteger(c['version']) || !Number.isSafeInteger(c['limit']) ||
        !Number.isSafeInteger(c['nodes']) || !Number.isSafeInteger(c['links']) || !Number.isSafeInteger(c['modules']) ||
        !Number.isSafeInteger(c['relations']) || !Number.isSafeInteger(c['lineRefs'])) {
      throw new Error('invalid fields');
    }
    return c as Cursor;
  } catch {
    throw new ExecutionPageError('invalid-request', 'Invalid execution-map cursor');
  }
}

function lineRefsOf(map: FullMap): ExecutionMapPage['lineRefs'] {
  const refs: ExecutionMapPage['lineRefs'] = [];
  const add = (scope: ExecutionMapPage['lineRefs'][number]['scope'], module: string | null,
    summary: ExecutionLineSummary) => {
    for (const value of summary.totals.invocationIds) refs.push({ scope, module, field: 'text-invocation', value });
    for (const value of summary.binary.invocationIds) refs.push({ scope, module, field: 'binary-invocation', value });
    for (const value of summary.gaps) refs.push({ scope, module, field: 'gap', value });
  };
  for (const row of map.moduleMap.modules) add('module', row.module, row.lines);
  for (const row of map.moduleMap.outsideTree) add('outside', row.module, row.lines);
  add('unmapped', null, map.moduleMap.unmapped);
  add('all', null, map.moduleMap.lines);
  for (const value of map.gaps) refs.push({ scope: 'core', module: null, field: 'gap', value });
  return refs;
}

function compactLines(lines: ExecutionLineSummary): ExecutionLineSummary {
  return { ...lines, totals: { ...lines.totals, invocationIds: [] },
    binary: { ...lines.binary, invocationIds: [] }, gaps: [] };
}

/** Slice all three censuses together. No page embeds the unbounded architect tree. */
export function executionPageOf(map: FullMap, input: unknown, scope: string): ExecutionMapPage {
  const query = executionMapQuerySchema.safeParse(input);
  if (!query.success) throw new ExecutionPageError('invalid-request', 'Invalid execution-map version, limit or cursor');
  const { version, limit } = query.data;
  if (version !== map.runVersion) throw new ExecutionPageError('stale-version',
    `Execution map changed from version ${version} to ${map.runVersion}`, map.runVersion);
  const nodeKeys = new Set(map.nodes.map(node => node.key));
  const linkIds = new Set(map.links.map(link => link.id));
  const moduleNames = [...map.moduleMap.modules, ...map.moduleMap.outsideTree].map(row => row.module);
  if (nodeKeys.size !== map.nodes.length) throw new ExecutionPageError('unreadable', 'Duplicate execution-map node identity');
  if (linkIds.size !== map.links.length) throw new ExecutionPageError('unreadable', 'Duplicate execution-map link identity');
  if (new Set(moduleNames).size !== moduleNames.length) throw new ExecutionPageError('unreadable', 'Duplicate module identity in execution map');
  if (map.nodes.some(node => node.runVersion !== version) || map.links.some(link => link.runVersion !== version)) {
    throw new ExecutionPageError('unreadable', 'An execution-map element carries another run version');
  }
  const missingRelation = [...map.moduleMap.modules, ...map.moduleMap.outsideTree]
    .flatMap(row => row.direct.map(relation => ({ module: row.module, key: relation.element })))
    .find(relation => !nodeKeys.has(relation.key));
  if (missingRelation !== undefined) throw new ExecutionPageError('unreadable',
    `Module ${missingRelation.module} refers to missing execution element ${missingRelation.key}`);
  if (map.moduleMap.tree.status === 'available' && (map.moduleMap.tree.modules.length !== map.moduleMap.modules.length ||
      map.moduleMap.tree.modules.some((row, i) => row.module !== map.moduleMap.modules[i]?.module))) {
    throw new ExecutionPageError('unreadable', 'Module rows disagree with the current architect tree');
  }
  const digest = createHash('sha256').update(JSON.stringify(map)).digest('hex');
  const cursor = query.data.cursor === undefined ? null : readCursor(query.data.cursor);
  if (cursor !== null && (cursor.scope !== scope || cursor.version !== version || cursor.limit !== limit)) {
    throw new ExecutionPageError('invalid-request', 'Execution-map cursor does not belong to this query');
  }
  if (cursor !== null && cursor.digest !== digest) {
    throw new ExecutionPageError('stale-version', 'Execution map, module tree or retained line evidence changed', map.runVersion);
  }
  const at: Offset = cursor ?? { nodes: 0, links: 0, modules: 0, relations: 0, lineRefs: 0 };
  const rows = rowsOf(map);
  const relations = [...map.moduleMap.modules, ...map.moduleMap.outsideTree]
    .flatMap(row => row.direct.map(relation => ({ module: row.module, ...relation })));
  const allLineRefs = lineRefsOf(map);
  if (at.nodes < 0 || at.links < 0 || at.modules < 0 || at.nodes > map.nodes.length ||
      at.links > map.links.length || at.modules > rows.length || at.relations < 0 || at.relations > relations.length ||
      at.lineRefs < 0 || at.lineRefs > allLineRefs.length ||
      (cursor !== null && at.nodes === 0 && at.links === 0 && at.modules === 0 && at.relations === 0 && at.lineRefs === 0)) {
    throw new ExecutionPageError('invalid-request', 'Execution-map cursor is outside the census');
  }
  const nodes = map.nodes.slice(at.nodes, at.nodes + limit);
  const shownKeys = new Set(nodes.map(node => node.key));
  const knownKeys = new Set(map.nodes.map(node => node.key));
  const links: ExecutionLink[] = map.links.slice(at.links, at.links + Math.min(executionMapLimits.links, limit * 2))
    .map(link => ({ ...link,
      from: endpoint(link.from.key, link.from.coverage === 'unresolved' ? link.from.reason : undefined, shownKeys, knownKeys),
      to: endpoint(link.to.key, link.to.coverage === 'unresolved' ? link.to.reason : undefined, shownKeys, knownKeys),
    }));
  const selected = rows.slice(at.modules, at.modules + Math.min(limit, executionMapLimits.modules));
  const modules = selected.filter(row => row.kind === 'module').map(row =>
    ({ ...row.row, direct: [], lines: compactLines(row.row.lines) }));
  const outsideTree = selected.filter(row => row.kind === 'outside').map(row =>
    ({ ...row.row, direct: [], lines: compactLines(row.row.lines) }));
  const proposed = selected.filter(row => row.kind === 'proposed').map(row => row.row);
  const unplaced = selected.filter(row => row.kind === 'unplaced').map(row => row.row);
  const moduleRelations = relations.slice(at.relations, at.relations + executionMapLimits.modules);
  const lineRefs = allLineRefs.slice(at.lineRefs, at.lineRefs + executionMapLimits.modules);
  const next: Offset = { nodes: at.nodes + nodes.length, links: at.links + links.length,
    modules: at.modules + selected.length, relations: at.relations + moduleRelations.length,
    lineRefs: at.lineRefs + lineRefs.length };
  const done = next.nodes === map.nodes.length && next.links === map.links.length && next.modules === rows.length &&
    next.relations === relations.length && next.lineRefs === allLineRefs.length;
  const nextCursor = done ? null : Buffer.from(JSON.stringify({ scope, version, digest, limit, ...next })).toString('base64url');
  const tree = map.moduleMap.tree.status === 'available'
    ? { ...map.moduleMap.tree, modules: modules.map(row => ({ module: row.module, parent: row.parent, dir: row.dir })) }
    : map.moduleMap.tree;
  return executionMapPageSchema.parse({
    schema: 'execution-map/1', runVersion: version, cursor: query.data.cursor ?? null, nextCursor,
    tree, moduleMap: { ...map.moduleMap, tree, modules, outsideTree, proposed, unplaced,
      unmapped: compactLines(map.moduleMap.unmapped), lines: compactLines(map.moduleMap.lines) }, current: map.current,
    nodes, links, moduleRelations, lineRefs, coverage: { nodes: { shown: nodes.length, total: map.nodes.length },
      links: { shown: links.length, total: map.links.length },
      modules: { shown: selected.length, total: rows.length },
      moduleRelations: { shown: moduleRelations.length, total: relations.length },
      lineRefs: { shown: lineRefs.length, total: allLineRefs.length }, gaps: [] },
  });
}

function endpoint(key: string, missingReason: string | undefined, shown: ReadonlySet<string>,
  known: ReadonlySet<string>): ExecutionLink['from'] {
  if (known.has(key)) return shown.has(key) ? { coverage: 'shown', key } : { coverage: 'other-page', key };
  return { coverage: 'unresolved', key, reason: missingReason ?? 'The target has no retained execution-map element.' };
}
