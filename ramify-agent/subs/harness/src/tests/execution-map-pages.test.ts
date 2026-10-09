import { describe, expect, it } from 'vitest';
import type { ExecutionModuleMap, ExecutionNode } from '../interfaces/protocol/execution-map.js';
import { executionMapPageSchema } from '../interfaces/protocol/execution-map.js';
import { ExecutionPageError, executionPageOf } from '../projections/execution-pages.js';
import { executionMapFixtureNodes, executionMapFixturePage } from './helpers/execution-map-fixture.js';

const version = 42;
const methodLimit = 'Per-writer net changes are summed, so a line a later writer changes again can count more than once.' as const;
const summary = () => ({ totals: { added: 5, deleted: 2, textPaths: 1,
  invocationIds: Array.from({ length: 2 }, (_, i) => `inv-${i}`) }, coverage: 'partial' as const,
  gaps: Array.from({ length: 1 }, (_, i) => `Gap ${i}`),
  binary: { paths: 1, invocationIds: ['inv-binary'] }, methodLimit });

function smallMap() {
  const template = executionMapFixtureNodes.find(node => node.kind === 'work-item')!;
  const nodes: ExecutionNode[] = Array.from({ length: 5 }, (_, i) =>
    ({ ...template, key: `work-item:wi-${String(i).padStart(4, '0')}`, runVersion: version }));
  const links = Array.from({ length: 6 }, (_, i) => ({
    id: `link-${i}`, runVersion: version, kind: 'follows' as const,
    from: { coverage: 'shown' as const, key: nodes[0]!.key },
    to: { coverage: 'shown' as const, key: i === 5 ? 'work-item:missing' : nodes[(i % 4) + 1]!.key },
    source: template.sourceRefs[0]!,
  }));
  const root = 'project';
  const tree = { status: 'available' as const, revision: 'revision-1', input: 'input-1',
    modules: [{ module: root, parent: null, dir: '' }] };
  const moduleMap: ExecutionModuleMap = {
    tree, modules: [{ module: root, parent: null, dir: '', workedIn: true,
      involvedDescendants: 0, lines: summary(), direct: nodes.map(node => ({
        element: node.key, role: 'owner' as const, source: template.sourceRefs[0]!,
      })) }], outsideTree: [], proposed: [], unplaced: [], unmapped: summary(), lines: summary(),
  };
  return { runVersion: version, nodes, links, gaps: ['A retained record is partial.'],
    current: executionMapFixturePage.current, moduleMap };
}

describe('execution-map cursor pages', () => {
  it('finishes link pages after the node stream is exhausted', () => {
    const map = smallMap();
    map.nodes.splice(2);
    map.moduleMap.modules[0]!.direct.splice(2);
    map.links.splice(5);
    map.links.forEach(link => { link.to.key = map.nodes[1]!.key; });
    const first = executionPageOf(map, { version, limit: 1 }, 'plan\0run');
    expect(first.nodes).toHaveLength(1);
    expect(first.links).toHaveLength(2);
    const second = executionPageOf(map, { version, cursor: first.nextCursor, limit: 1 }, 'plan\0run');
    expect(second.nodes).toHaveLength(1);
    expect(second.links).toHaveLength(2);
    let cursor = second.nextCursor;
    while (cursor !== null) {
      const page = executionPageOf(map, { version, cursor, limit: 1 }, 'plan\0run');
      expect(page.nodes).toHaveLength(0);
      cursor = page.nextCursor;
    }
  });

  it('pages nodes, cross-page links, relations and provenance with a small map', () => {
    const map = smallMap();
    const pages = [];
    let cursor: string | undefined;
    do {
      const page = executionPageOf(map, { version, cursor, limit: 2 }, 'plan\0run');
      expect(executionMapPageSchema.parse(page)).toEqual(page);
      expect(page.nodes.length).toBeLessThanOrEqual(2);
      expect(page.links.length).toBeLessThanOrEqual(4);
      expect(page.moduleMap.modules.length).toBeLessThanOrEqual(2);
      expect(page.moduleRelations.length).toBeLessThanOrEqual(100);
      expect(page.lineRefs.length).toBeLessThanOrEqual(100);
      expect(page.moduleMap.modules.every(row => row.direct.length === 0 && row.lines.gaps.length === 0)).toBe(true);
      pages.push(page);
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    expect(pages.flatMap(page => page.nodes)).toHaveLength(5);
    expect(pages.flatMap(page => page.links)).toHaveLength(6);
    expect(pages.flatMap(page => page.moduleRelations)).toHaveLength(5);
    expect(pages.flatMap(page => page.lineRefs)).toEqual(expect.arrayContaining([
      { scope: 'all', module: null, field: 'text-invocation', value: 'inv-0' },
      { scope: 'all', module: null, field: 'binary-invocation', value: 'inv-binary' },
      { scope: 'all', module: null, field: 'gap', value: 'Gap 0' },
    ]));
    expect(pages.flatMap(page => page.links).at(-1)?.to).toEqual({ coverage: 'unresolved', key: 'work-item:missing',
      reason: 'The target has no retained execution-map element.' });
    expect(pages[0]?.links[0]?.to.coverage).toBe('shown');
    expect(pages[1]?.links[0]?.to.coverage).toBe('other-page');
    expect(pages.at(-1)?.coverage).toMatchObject({ nodes: { total: 5 }, links: { total: 6 },
      modules: { total: 1 }, moduleRelations: { total: 5 } });
  });

  it('rejects stale run, changed tree and retained line evidence, and a cursor from another run', () => {
    const map = smallMap();
    const first = executionPageOf(map, { version, limit: 2 }, 'plan\0run');
    const cursor = first.nextCursor!;
    expect(() => executionPageOf(map, { version: 41, cursor, limit: 2 }, 'plan\0run'))
      .toThrowError(ExecutionPageError);
    expect(() => executionPageOf(map, { version, cursor, limit: 2 }, 'plan\0other'))
      .toThrowError(/does not belong/);
    expect(() => executionPageOf(map, { version, cursor, limit: 3 }, 'plan\0run'))
      .toThrowError(/does not belong/);
    const treeChanged = smallMap();
    if (treeChanged.moduleMap.tree.status !== 'available') throw new Error('tree');
    treeChanged.moduleMap.tree.input = 'input-2';
    expect(() => executionPageOf(treeChanged, { version, cursor, limit: 2 }, 'plan\0run'))
      .toThrowError(/module tree or retained line evidence changed/);
    const linesChanged = smallMap();
    linesChanged.moduleMap.lines.totals.added++;
    expect(() => executionPageOf(linesChanged, { version, cursor, limit: 2 }, 'plan\0run'))
      .toThrowError(/module tree or retained line evidence changed/);
    expect(() => executionPageOf(map, { version, cursor: 'invalid!', limit: 2 }, 'plan\0run'))
      .toThrowError(/Invalid execution-map cursor/);
    const duplicate = smallMap();
    duplicate.nodes[1]!.key = duplicate.nodes[0]!.key;
    expect(() => executionPageOf(duplicate, { version }, 'plan\0run')).toThrowError(/Duplicate execution-map node/);
    const missingRelation = smallMap();
    missingRelation.moduleMap.modules[0]!.direct[0]!.element = 'work-item:missing';
    expect(() => executionPageOf(missingRelation, { version }, 'plan\0run')).toThrowError(/Module project refers to missing/);
  });
});
