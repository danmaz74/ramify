import { describe, expect, it } from 'vitest';
import type { ExecutionModuleMap, ExecutionNode } from '../interfaces/protocol/execution-map.js';
import { executionMapPageSchema } from '../interfaces/protocol/execution-map.js';
import { ExecutionPageError, executionPageOf } from '../projections/execution-pages.js';
import { executionMapFixtureNodes, executionMapFixturePage } from './helpers/execution-map-fixture.js';

const version = 42;
const methodLimit = 'Two worktree snapshots can miss edits reverted before the second snapshot.' as const;
const summary = () => ({ totals: { added: 5, deleted: 2, textPaths: 1,
  invocationIds: Array.from({ length: 130 }, (_, i) => `inv-${i}`) }, coverage: 'partial' as const,
  gaps: Array.from({ length: 110 }, (_, i) => `Gap ${i}`),
  binary: { paths: 1, invocationIds: ['inv-binary'] }, methodLimit });

function largeMap() {
  const template = executionMapFixtureNodes.find(node => node.kind === 'work-item')!;
  const nodes: ExecutionNode[] = Array.from({ length: 610 }, (_, i) =>
    ({ ...template, key: `work-item:wi-${String(i).padStart(4, '0')}`, runVersion: version }));
  const links = Array.from({ length: 551 }, (_, i) => ({
    id: `link-${i}`, runVersion: version, kind: 'follows' as const,
    from: { coverage: 'shown' as const, key: nodes[0]!.key },
    to: { coverage: 'shown' as const, key: i === 550 ? 'work-item:missing' : nodes[i + 1]!.key },
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
  it('finishes link and provenance pages after the node stream is exhausted', () => {
    const map = largeMap();
    map.nodes.splice(2);
    map.moduleMap.modules[0]!.direct.splice(2);
    map.links.forEach(link => { link.to.key = map.nodes[1]!.key; });
    const first = executionPageOf(map, { version }, 'plan\0run');
    expect(first.nodes).toHaveLength(2);
    expect(first.links).toHaveLength(200);
    const second = executionPageOf(map, { version, cursor: first.nextCursor }, 'plan\0run');
    expect(second.nodes).toHaveLength(0);
    expect(second.links).toHaveLength(200);
    let cursor = second.nextCursor;
    while (cursor !== null) {
      const page = executionPageOf(map, { version, cursor }, 'plan\0run');
      expect(page.nodes).toHaveLength(0);
      cursor = page.nextCursor;
    }
  });

  it('enumerates 610 nodes, 551 links, direct relations and line provenance with bounded pages', () => {
    const map = largeMap();
    const pages = [];
    let cursor: string | undefined;
    do {
      const page = executionPageOf(map, { version, cursor, limit: 37 }, 'plan\0run');
      expect(executionMapPageSchema.parse(page)).toEqual(page);
      expect(page.nodes.length).toBeLessThanOrEqual(37);
      expect(page.links.length).toBeLessThanOrEqual(74);
      expect(page.moduleMap.modules.length).toBeLessThanOrEqual(37);
      expect(page.moduleRelations.length).toBeLessThanOrEqual(100);
      expect(page.lineRefs.length).toBeLessThanOrEqual(100);
      expect(page.moduleMap.modules.every(row => row.direct.length === 0 && row.lines.gaps.length === 0)).toBe(true);
      pages.push(page);
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    expect(pages.flatMap(page => page.nodes)).toHaveLength(610);
    expect(pages.flatMap(page => page.links)).toHaveLength(551);
    expect(pages.flatMap(page => page.moduleRelations)).toHaveLength(610);
    expect(pages.flatMap(page => page.lineRefs).length).toBeGreaterThan(300);
    expect(pages.flatMap(page => page.links).at(-1)?.to).toEqual({ coverage: 'unresolved', key: 'work-item:missing',
      reason: 'The target has no retained execution-map element.' });
    expect(pages[0]?.links[0]?.to.coverage).toBe('shown');
    expect(pages[1]?.links[0]?.to.coverage).toBe('other-page');
    expect(pages.at(-1)?.coverage).toMatchObject({ nodes: { total: 610 }, links: { total: 551 },
      modules: { total: 1 }, moduleRelations: { total: 610 } });
  });

  it('rejects stale run, changed tree and retained line evidence, and a cursor from another run', () => {
    const map = largeMap();
    const first = executionPageOf(map, { version, limit: 20 }, 'plan\0run');
    const cursor = first.nextCursor!;
    expect(() => executionPageOf(map, { version: 41, cursor, limit: 20 }, 'plan\0run'))
      .toThrowError(ExecutionPageError);
    expect(() => executionPageOf(map, { version, cursor, limit: 20 }, 'plan\0other'))
      .toThrowError(/does not belong/);
    expect(() => executionPageOf(map, { version, cursor, limit: 21 }, 'plan\0run'))
      .toThrowError(/does not belong/);
    const treeChanged = largeMap();
    if (treeChanged.moduleMap.tree.status !== 'available') throw new Error('tree');
    treeChanged.moduleMap.tree.input = 'input-2';
    expect(() => executionPageOf(treeChanged, { version, cursor, limit: 20 }, 'plan\0run'))
      .toThrowError(/module tree or retained line evidence changed/);
    const linesChanged = largeMap();
    linesChanged.moduleMap.lines.totals.added++;
    expect(() => executionPageOf(linesChanged, { version, cursor, limit: 20 }, 'plan\0run'))
      .toThrowError(/module tree or retained line evidence changed/);
    expect(() => executionPageOf(map, { version, cursor: 'invalid!', limit: 20 }, 'plan\0run'))
      .toThrowError(/Invalid execution-map cursor/);
    const duplicate = largeMap();
    duplicate.nodes[1]!.key = duplicate.nodes[0]!.key;
    expect(() => executionPageOf(duplicate, { version }, 'plan\0run')).toThrowError(/Duplicate execution-map node/);
    const missingRelation = largeMap();
    missingRelation.moduleMap.modules[0]!.direct[0]!.element = 'work-item:missing';
    expect(() => executionPageOf(missingRelation, { version }, 'plan\0run')).toThrowError(/Module project refers to missing/);
  });
});
