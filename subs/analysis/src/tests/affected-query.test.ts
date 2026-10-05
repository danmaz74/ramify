import { describe, expect, it } from 'vitest';
import { affectedLimits, projectAffected } from '../affected-query.js';
import type { AffectedFacts, AffectedProjection } from '../affected-query.js';
import type { AffectedSelection } from '../interfaces/affected.js';
import type { ProjectExclusion } from '../../subs/project/src/interfaces/project.js';
import { access, chain, coverageGraph, diamondCycle, graphFacts, inventoryFile, isolated, note, origin, rootGraph, selection,
  shimGraph } from './affected-fixtures.js';

const seeds = (modules: readonly string[] = [], paths: readonly string[] = []) => ({ modules, paths });
function answered(outcome: AffectedProjection): AffectedSelection {
  if (outcome.status !== 'answered') throw new Error(`Expected an answer: ${JSON.stringify(outcome)}`);
  return outcome.result;
}
const select = (facts: AffectedFacts, modules: readonly string[] = [], paths: readonly string[] = []): AffectedSelection =>
  answered(projectAffected(facts, seeds(modules, paths), affectedLimits));
/** Module IDs of a list, in the order the answer gives them. */
const ids = (list: readonly { readonly id: string }[]): string[] => list.map(module => module.id);
/** A module of the `subs/<name>` fixtures. */
const sub = (id: string) => ({ id, directory: `subs/${id}` });

describe('affected-module projection: graph (A7-01)', () => {
  it('A7-01:chain: A->B->C seeded at C selects A and B as affected and A, B, C as tests', () => {
    const { scope } = chain();
    expect(select(chain(), ['c'])).toEqual({
      schemaVersion: 'ramify.affected/2', inputId: 'input/1', paths: [],
      changedModules: [sub('c')], affectedModules: [sub('a'), sub('b')], testModules: [sub('a'), sub('b'), sub('c')],
      selection: 'dependency-closure', widening: [], scope, coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed',
    });
  });

  it('A7-01:diamond-cycle: seed d reaches a, b and c once and terminates', () => {
    const result = select(diamondCycle(), ['d']);
    expect(ids(result.changedModules)).toEqual(['d']);
    expect(ids(result.affectedModules)).toEqual(['a', 'b', 'c']);
    expect(ids(result.testModules)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.selection).toBe('dependency-closure');
  });

  it('A7-01:multiple-seeds: seeds c and z answer one union with z a seed, not an affected module', () => {
    const result = select(diamondCycle(), ['c', 'z']);
    expect(ids(result.changedModules)).toEqual(['c', 'z']);
    expect(ids(result.affectedModules)).toEqual(['a']);
    expect(ids(result.testModules)).toEqual(['a', 'c', 'z']);
  });

  it('A7-01:isolated: a seed with no dependents selects only itself', () => {
    const result = select(isolated(), ['z']);
    expect(result.affectedModules).toEqual([]);
    expect(result.testModules).toEqual([sub('z')]);
    expect(result.selection).toBe('dependency-closure');
  });

  it('A7-01:duplicates-order: duplicate seeds collapse and every list is in UTF-8 byte order of ID', () => {
    // a, B and é depend on z. Byte order is B (0x42), a (0x61), z (0x7a), é (0xc3 0xa9).
    const facts = graphFacts({ modules: { z: 'subs/z', a: 'subs/a', B: 'subs/B', é: 'subs/é' },
      edges: [['é', 'z'], ['a', 'z'], ['B', 'z']] });
    const result = select(facts, ['z', 'z'], ['subs/z/src/z.ts', 'subs/B/src/B.ts', 'subs/z/src/z.ts']);
    expect(result.paths).toEqual([
      { path: 'subs/B/src/B.ts', status: 'owned', module: 'B', basis: 'inventory', exclusion: null },
      { path: 'subs/z/src/z.ts', status: 'owned', module: 'z', basis: 'inventory', exclusion: null },
    ]);
    expect(ids(result.changedModules)).toEqual(['B', 'z']);
    expect(ids(result.affectedModules)).toEqual(['a', 'é']);
    expect(ids(result.testModules)).toEqual(['B', 'a', 'z', 'é']);
  });

  it('A7-01:empty: no seeds answer empty lists and still report coverage and widening', () => {
    expect(select(chain())).toMatchObject({ paths: [], changedModules: [], affectedModules: [], testModules: [],
      selection: 'dependency-closure', widening: [], coverage: { status: 'complete', notes: [] } });
    const dynamic = note('nonliteral-target', 'subs/d/src/d.ts');
    expect(select(coverageGraph(dynamic))).toMatchObject({ paths: [], changedModules: [], affectedModules: [],
      testModules: [sub('a'), sub('b'), sub('c'), sub('d')], selection: 'all-modules', widening: ['partial-coverage'],
      coverage: { status: 'partial', notes: [dynamic] } });
  });

  it('A7-01:root-module: the root module at "." is a valid seed and a valid dependent', () => {
    // r/a depends on the root r, and r depends on r/b.
    const root = { id: 'r', directory: '.' }, a = { id: 'r/a', directory: 'subs/a' };
    const fromRoot = select(rootGraph(), ['r']);
    expect(fromRoot.changedModules).toEqual([root]);
    expect(fromRoot.affectedModules).toEqual([a]);
    const fromChild = select(rootGraph(), ['r/b']);
    expect(fromChild.affectedModules).toEqual([root, a]);
    expect(ids(fromChild.testModules)).toEqual(['r', 'r/a', 'r/b']);
  });

  it('A7-01:unknown-module: unknown IDs fail the whole query with the complete sorted unknown set', () => {
    expect(projectAffected(chain(), seeds(['a', 'zzz', 'nope', 'nope']), affectedLimits)).toEqual({
      status: 'unavailable', reason: 'unknown-module', message: expect.stringContaining('nope'), unknownModules: ['nope', 'zzz'] });
  });

  it('A7-01:invalid-query: a non-string or empty seed, a non-array list and more than 4,096 seeds are invalid', () => {
    const invalid = { status: 'unavailable', reason: 'invalid-query', message: expect.any(String), unknownModules: [] };
    expect(projectAffected(chain(), seeds([1 as unknown as string]), affectedLimits)).toEqual(invalid);
    expect(projectAffected(chain(), seeds([], [null as unknown as string]), affectedLimits)).toEqual(invalid);
    expect(projectAffected(chain(), seeds(['']), affectedLimits)).toEqual(invalid);
    expect(projectAffected(chain(), { modules: 'a' as unknown as string[], paths: [] }, affectedLimits)).toEqual(invalid);
    expect(projectAffected(chain(), seeds(Array(4000).fill('a'), Array(97).fill('subs/a/src/a.ts')), affectedLimits)).toEqual(invalid);
    // Exactly 4,096 seeds are accepted, and their duplicates collapse.
    const bounded = select(chain(), Array(4000).fill('a'), Array(96).fill('subs/a/src/a.ts'));
    expect(ids(bounded.changedModules)).toEqual(['a']);
  });

  it('A7-01:self-edge: a file importing a file of its own module adds no edge and no dependent', () => {
    const own = origin('subs/a/src/a.ts', 'a');
    const facts = graphFacts({ modules: { a: 'subs/a', b: 'subs/b' },
      accesses: [access(own, { kind: 'application', origin: origin('subs/a/src/other.ts', 'a') },
        [selection({ owner: 'a', file: 'subs/a/src/other.ts' }, [origin('subs/a/src/index.ts', 'a')])])] });
    expect(select(facts, ['a']).affectedModules).toEqual([]);
    // Self-edges are not counted against the edge limit either.
    expect(projectAffected(facts, seeds(['a']), { maxModules: 2, maxEdges: 0 }).status).toBe('answered');
  });
});

describe('affected-module projection: forwarding and shims', () => {
  it('A7-03:barrel-original (unit): the target owner, each forwarding owner and the original owner are providers', () => {
    // `user` imports `value` through `barrel`'s file; `value` is defined by `core`, and `relay` forwards it on the way.
    const facts = graphFacts({ modules: { user: 'subs/user', barrel: 'subs/barrel', relay: 'subs/relay', core: 'subs/core' },
      accesses: [access(origin('subs/user/src/user.ts', 'user'), { kind: 'application', origin: origin('subs/barrel/src/barrel.ts', 'barrel') },
        [selection({ owner: 'core', file: 'subs/core/src/core.ts' }, [origin('subs/barrel/src/barrel.ts', 'barrel'),
          origin('subs/relay/src/relay.ts', 'relay')])])] });
    expect(ids(select(facts, ['barrel']).affectedModules)).toEqual(['user']);
    expect(ids(select(facts, ['relay']).affectedModules)).toEqual(['user']);
    expect(ids(select(facts, ['core']).affectedModules)).toEqual(['user']);
  });

  it('A7-03:side-effect (unit): an application target without selections is an edge; external and unresolved targets are not', () => {
    const user = origin('subs/user/src/user.ts', 'user');
    const facts = graphFacts({ modules: { user: 'subs/user', core: 'subs/core' },
      accesses: [access(user, { kind: 'application', origin: origin('subs/core/src/core.ts', 'core') }, [], 'side-effect-import'),
        access(user, { kind: 'external', resolution: 'builtin', name: 'node:path', resolvedFile: null }),
        access(user, { kind: 'outside-project', file: 'lib/helper.ts' }), access(user, { kind: 'unresolved' })] });
    expect(ids(select(facts, ['core']).affectedModules)).toEqual(['user']);
    expect(ids(select(facts, ['user']).affectedModules)).toEqual([]);
  });

  it('A7-03:shim (unit): a resource depends on the owner of its owned shim; an external shim adds no edge', () => {
    expect(ids(select(shimGraph(), ['shims']).affectedModules)).toEqual(['styles']);
    expect(ids(select(shimGraph(), ['styles']).affectedModules)).toEqual([]);
    expect(ids(select(shimGraph(), ['other']).affectedModules)).toEqual([]);
  });

  it('A7-03:owned-tests-import-edge: a file in x\'s src/tests/ area importing y makes x a dependent of y', () => {
    const test = 'subs/x/src/tests/x.test.ts';
    const facts = graphFacts({ modules: { x: 'subs/x', y: 'subs/y' }, files: [inventoryFile(test, 'x', 'tests')],
      accesses: [access(origin(test, 'x', 'tests'), { kind: 'application', origin: origin('subs/y/src/y.ts', 'y') },
        [selection({ owner: 'y', file: 'subs/y/src/y.ts' })])] });
    expect(select(facts, ['y'])).toMatchObject({ changedModules: [sub('y')], affectedModules: [sub('x')],
      testModules: [sub('x'), sub('y')], selection: 'dependency-closure', widening: [] });
    expect(select(facts, ['x']).affectedModules).toEqual([]);
  });
});

describe('affected-module projection: path seeds (A7-02)', () => {
  // r/a depends on the root r, and r depends on r/b; r/c is unrelated.
  const facts = (): AffectedFacts => {
    const base = rootGraph();
    return { ...base, inventory: { ...base.inventory, files: [...base.inventory.files,
      inventoryFile('subs/b/src/tests/b.test.ts', 'r/b', 'tests')] } };
  };
  const root = { id: 'r', directory: '.' }, a = { id: 'r/a', directory: 'subs/a' };
  const b = { id: 'r/b', directory: 'subs/b' }, c = { id: 'r/c', directory: 'subs/c' };
  const owned = (path: string, module: string, basis: 'inventory' | 'declaration' | 'area' | 'containment', exclusion: ProjectExclusion | null = null) =>
    ({ path, status: 'owned', module, basis, exclusion });

  it('A7-02:inventory-file: an inventoried source file seeds its owner', () => {
    const result = select(facts(), [], ['subs/b/src/b.ts']);
    expect(result.paths).toEqual([owned('subs/b/src/b.ts', 'r/b', 'inventory')]);
    expect(result.changedModules).toEqual([b]);
    expect(result.affectedModules).toEqual([root, a]);
    expect(result.testModules).toEqual([root, a, b]);
    expect(result.selection).toBe('dependency-closure');
  });

  it('A7-02:owned-test-file: a file under src/tests/ seeds its own module', () => {
    const result = select(facts(), [], ['subs/b/src/tests/b.test.ts']);
    expect(result.paths).toEqual([owned('subs/b/src/tests/b.test.ts', 'r/b', 'inventory')]);
    expect(result.changedModules).toEqual([b]);
    expect(result.affectedModules).toEqual([root, a]);
  });

  it('A7-02:declaration-file: <dir>/module.ramify seeds that module, and the root description seeds the root', () => {
    const result = select(facts(), [], ['subs/b/module.ramify', 'module.ramify']);
    expect(result.paths).toEqual([owned('module.ramify', 'r', 'declaration'), owned('subs/b/module.ramify', 'r/b', 'declaration')]);
    expect(result.changedModules).toEqual([root, b]);
    expect(result.affectedModules).toEqual([a]);
  });

  it('A7-02:readme: <dir>/README.md seeds that module with basis declaration', () => {
    expect(select(facts(), [], ['subs/c/README.md', 'README.md']).paths).toEqual([
      owned('README.md', 'r', 'declaration'), owned('subs/c/README.md', 'r/c', 'declaration')]);
  });

  it('A7-02:area-fixture: a non-inventoried path under an area root seeds its owner with basis area', () => {
    const result = select(facts(), [], ['subs/b/src/tests/fixtures/input.json', 'src/tests/fixtures/root.json']);
    expect(result.paths).toEqual([
      owned('src/tests/fixtures/root.json', 'r', 'area'), owned('subs/b/src/tests/fixtures/input.json', 'r/b', 'area')]);
    expect(result.changedModules).toEqual([root, b]);
  });

  it('A7-02:area-fixture boundary: an area root matches whole path segments only; other owned paths resolve by containment', () => {
    // a's area is subs/a/src and ab's is subs/ab/src; subs/ab/srcx lies in ab outside its areas.
    const result = select(graphFacts({ modules: { a: 'subs/a', ab: 'subs/ab' } }), [], ['subs/ab/src/new.ts', 'subs/ab/srcx/x.ts', 'subs/a']);
    expect(result.paths).toEqual([
      owned('subs/a', 'a', 'containment'), owned('subs/ab/src/new.ts', 'ab', 'area'), owned('subs/ab/srcx/x.ts', 'ab', 'containment')]);
    expect(result.changedModules).toEqual([sub('a'), sub('ab')]);
    expect(result.affectedModules).toEqual([]);
    expect(result.testModules).toEqual([sub('a'), sub('ab')]);
    expect(result.selection).toBe('dependency-closure');
    expect(result.widening).toEqual([]);
  });

  it('A7-02:deleted-file: a missing, non-inventoried path in an area seeds that module and keeps the closure', () => {
    const result = select(facts(), [], ['subs/a/src/removed.ts']);
    expect(result.paths).toEqual([owned('subs/a/src/removed.ts', 'r/a', 'area')]);
    expect(result.changedModules).toEqual([a]);
    expect(result.affectedModules).toEqual([]);
    expect(result.testModules).toEqual([a]);
    expect(result.selection).toBe('dependency-closure');
  });

  it('A7-02:unowned-root-file: package.json is the root\'s by containment and selects the root\'s closure without widening', () => {
    const result = select(facts(), [], ['package.json', 'subs/b/src/b.ts']);
    expect(result.paths).toEqual([owned('package.json', 'r', 'containment'), owned('subs/b/src/b.ts', 'r/b', 'inventory')]);
    expect(result.changedModules).toEqual([root, b]);
    expect(result.affectedModules).toEqual([a]);
    expect(result.testModules).toEqual([root, a, b]);
    expect(result.selection).toBe('dependency-closure');
    expect(result.widening).toEqual([]);
  });

  it('A7-02:docs-path: documentation and loose files belong to their nearest module and select no descendant by ancestry', () => {
    const result = select(facts(), [], ['docs/notes.md', 'subs/c/tests/loose.ts', '.']);
    expect(result.paths).toEqual([
      owned('.', 'r', 'containment'), owned('docs/notes.md', 'r', 'containment'), owned('subs/c/tests/loose.ts', 'r/c', 'containment')]);
    // a imports the root, so it is affected; b and c are descendants of the root and are not.
    expect(result.changedModules).toEqual([root, c]);
    expect(result.affectedModules).toEqual([a]);
    expect(result.testModules).toEqual([root, a, c]);
    expect(result).toMatchObject({ selection: 'dependency-closure', widening: [] });
  });

  it('a path in a scratch directory is its module\'s by containment, inside that module\'s area root', () => {
    const result = select(facts(), [], ['subs/b/src/tmp/new.ts']);
    expect(result.paths).toEqual([owned('subs/b/src/tmp/new.ts', 'r/b', 'containment', { kind: 'scratch', directory: 'subs/b/src/tmp', owner: 'r/b' })]);
    expect(result).toMatchObject({ changedModules: [b], affectedModules: [root, a], testModules: [root, a, b], selection: 'dependency-closure', widening: [] });
  });

  it('a path in an owned-ignored tree selects its owner; a path in an external tree selects nothing and does not widen', () => {
    const base = facts();
    const ownership = { ...base.scope.ownership, exclusions: [...base.scope.ownership.exclusions,
      { kind: 'external' as const, directory: 'external-project', owner: null },
      { kind: 'owned-ignored' as const, directory: 'subs/a/fixtures/sample', owner: 'r/a' }] };
    const scope = { ...base.scope, ownership };
    const declared: AffectedFacts = { ...base, scope, inventory: { ...base.inventory, scope } };
    const ignored = { kind: 'owned-ignored', directory: 'subs/a/fixtures/sample', owner: 'r/a' } as const;
    const result = select(declared, [], ['subs/a/fixtures/sample/src/world.ts', 'subs/a/fixtures/sample/module.ramify',
      'external-project/file.ts', 'external-project']);
    expect(result.paths).toEqual([
      { path: 'external-project', status: 'excluded', module: null, basis: 'excluded', exclusion: ownership.exclusions.at(-2) },
      { path: 'external-project/file.ts', status: 'excluded', module: null, basis: 'excluded', exclusion: ownership.exclusions.at(-2) },
      owned('subs/a/fixtures/sample/module.ramify', 'r/a', 'containment', ignored),
      owned('subs/a/fixtures/sample/src/world.ts', 'r/a', 'containment', ignored)]);
    expect(result).toMatchObject({ changedModules: [a], affectedModules: [], testModules: [a], selection: 'dependency-closure', widening: [] });
  });

  it('a reserved path selects nothing with its excluded basis and unowned exclusion, wherever the segment occurs', () => {
    const result = select(facts(), [], ['node_modules/sample/index.ts', 'subs/a/src/.ramify/index.json', '.git/HEAD',
      'subs/c/node_modules/x']);
    expect(result.paths).toEqual([
      { path: '.git/HEAD', status: 'excluded', module: null, basis: 'excluded', exclusion: { kind: 'repository', directory: '.git', owner: null } },
      { path: 'node_modules/sample/index.ts', status: 'excluded', module: null, basis: 'excluded',
        exclusion: { kind: 'packages', directory: 'node_modules', owner: null } },
      { path: 'subs/a/src/.ramify/index.json', status: 'excluded', module: null, basis: 'excluded',
        exclusion: { kind: 'generated', directory: 'subs/a/src/.ramify', owner: null } },
      { path: 'subs/c/node_modules/x', status: 'excluded', module: null, basis: 'excluded',
        exclusion: { kind: 'packages', directory: 'subs/c/node_modules', owner: null } }]);
    expect(result).toMatchObject({ changedModules: [], affectedModules: [], testModules: [], selection: 'dependency-closure', widening: [] });
  });

  it('A7-02:outside-path: only a path outside the project, written with leading "..", widens, keeping the known seeds and closure', () => {
    const result = select(facts(), [], ['../outside.ts', '..', '../../elsewhere/x.ts', 'subs/b/src/b.ts', 'node_modules/x.ts']);
    expect(result.paths).toEqual([
      { path: '..', status: 'outside-project', module: null, basis: 'none', exclusion: null },
      { path: '../../elsewhere/x.ts', status: 'outside-project', module: null, basis: 'none', exclusion: null },
      { path: '../outside.ts', status: 'outside-project', module: null, basis: 'none', exclusion: null },
      { path: 'node_modules/x.ts', status: 'excluded', module: null, basis: 'excluded', exclusion: { kind: 'packages', directory: 'node_modules', owner: null } },
      owned('subs/b/src/b.ts', 'r/b', 'inventory')]);
    expect(result.changedModules).toEqual([b]);
    expect(result.affectedModules).toEqual([root, a]);
    expect(result.testModules).toEqual([root, a, b, c]);
    expect(result.selection).toBe('all-modules');
    expect(result.widening).toEqual(['unowned-path']);
  });

  it('A7-02:absolute-rejected: an absolute path is invalid-query', () => {
    for (const path of ['/project/src/r.ts', 'C:/project/src/r.ts']) {
      expect(projectAffected(facts(), seeds([], [path]), affectedLimits)).toMatchObject({ status: 'unavailable', reason: 'invalid-query' });
    }
  });

  it('A7-02:dotdot-rejected: an interior ".." segment, a "." or empty segment or a backslash is invalid-query', () => {
    for (const path of ['subs/a/../b/src/b.ts', 'subs/..', '../a/./b', '../', './src/r.ts', 'subs//b/src/b.ts', 'subs/b/', 'subs\\b\\src\\b.ts']) {
      expect(projectAffected(facts(), seeds([], [path]), affectedLimits), path)
        .toMatchObject({ status: 'unavailable', reason: 'invalid-query' });
    }
  });

  it('a scope whose ownership names a module the inventory lacks is invalid-current, never a guessed answer', () => {
    const base = facts();
    const ownership = { ...base.scope.ownership, modules: [...base.scope.ownership.modules, { id: 'r/d', parent: 'r', directory: 'subs/d' }] };
    const scope = { ...base.scope, ownership };
    expect(projectAffected({ ...base, scope }, seeds([], ['subs/d/x.ts']), affectedLimits))
      .toMatchObject({ status: 'unavailable', reason: 'invalid-current' });
    expect(projectAffected({ ...base, scope }, seeds([], ['subs/c/x.ts']), affectedLimits).status).toBe('answered');
  });
});

describe('affected-module projection: coverage (A7-04)', () => {
  const widened = { changedModules: [sub('c')], affectedModules: [sub('a'), sub('b')],
    testModules: [sub('a'), sub('b'), sub('c'), sub('d')], selection: 'all-modules', widening: ['partial-coverage'] };

  it('A7-04:nonliteral-dynamic: a nonliteral dynamic import anywhere makes coverage partial and widens', () => {
    const dynamic = note('nonliteral-target', 'subs/d/src/d.ts');
    expect(select(coverageGraph(dynamic), ['c'])).toMatchObject({ ...widened, coverage: { status: 'partial', notes: [dynamic] } });
  });

  it('A7-04:unresolved-target: an import of a deleted file makes coverage partial and widens', () => {
    const unresolved = note('unresolved-target', 'subs/a/src/a.ts');
    expect(select(coverageGraph(unresolved), ['c'])).toMatchObject({ ...widened, coverage: { status: 'partial', notes: [unresolved] } });
  });

  it('A7-04:outside-module-target: an import of a file outside every module makes coverage partial and widens', () => {
    const outside = note('outside-module-target', 'subs/b/src/b.ts');
    expect(select(coverageGraph(outside), ['c'])).toMatchObject({ ...widened, coverage: { status: 'partial', notes: [outside] } });
  });

  it('a boundary import into an owned-ignored tree, which carries no note, still depends on the tree\'s owner', () => {
    // Project-boundary iteration 11: the import is a definite finding without a
    // coverage note, so it widens nothing. Iteration 14: a path in an
    // owned-ignored tree is its owner's, and a seed there selects the owner and
    // its importers, so the importer of that path depends on the owner. An
    // external tree has no owner and adds no edge.
    const consumer = origin('subs/b/src/b.ts', 'b');
    const facts = graphFacts({ modules: { a: 'subs/a', b: 'subs/b', c: 'subs/c' }, accesses: [
      access(consumer, { kind: 'nested-tree', file: 'subs/a/fixtures/sample/index.ts',
        exclusion: { kind: 'owned-ignored', directory: 'subs/a/fixtures/sample', owner: 'a' } }),
      access(origin('subs/c/src/c.ts', 'c'), { kind: 'nested-tree', file: 'external-project/lib.ts',
        exclusion: { kind: 'external', directory: 'external-project', owner: null } }),
    ] });
    expect(select(facts, ['a'])).toMatchObject({ changedModules: [sub('a')], affectedModules: [sub('b')],
      testModules: [sub('a'), sub('b')], selection: 'dependency-closure', widening: [], coverage: { status: 'complete', notes: [] } });
    expect(select(facts, [], ['subs/a/fixtures/sample/index.ts'])).toMatchObject({ changedModules: [sub('a')], affectedModules: [sub('b')] });
    expect(select(facts, ['c'])).toMatchObject({ affectedModules: [], testModules: [sub('c')], widening: [] });
  });

  it('an import of a scratch file depends on the scratch directory\'s owner; other excluded targets add no edge', () => {
    // A scratch path is its module's, like an owned-ignored one. The import's
    // excluded-target note still makes coverage partial, so the closure is
    // reported and the test selection widens.
    const excluded = note('excluded-target', 'subs/b/src/b.ts');
    const facts = graphFacts({ modules: { a: 'subs/a', b: 'subs/b', c: 'subs/c' }, coverage: [excluded, note('excluded-target', 'subs/c/src/c.ts')],
      accesses: [
        access(origin('subs/b/src/b.ts', 'b'), { kind: 'excluded', file: 'subs/a/src/tmp/scratch.ts',
          exclusion: { kind: 'scratch', directory: 'subs/a/src/tmp', owner: 'a' } }),
        access(origin('subs/c/src/c.ts', 'c'), { kind: 'excluded', file: 'dist/a.js', exclusion: { kind: 'output', directory: 'dist', owner: null } }),
      ] });
    expect(select(facts, [], ['subs/a/src/tmp/scratch.ts'])).toMatchObject({ changedModules: [sub('a')], affectedModules: [sub('b')],
      testModules: [sub('a'), sub('b'), sub('c')], selection: 'all-modules', widening: ['partial-coverage'] });
    expect(select(facts, ['c'])).toMatchObject({ changedModules: [sub('c')], affectedModules: [] });
  });

  it('partial coverage widens whatever the seeds are; an excluded seed cannot hide it', () => {
    const dynamic = note('nonliteral-target', 'subs/d/src/d.ts');
    expect(select(coverageGraph(dynamic), [], ['node_modules/x/index.ts', 'subs/c/src/tmp/new.ts'])).toMatchObject({
      paths: [{ path: 'node_modules/x/index.ts', status: 'excluded' }, { path: 'subs/c/src/tmp/new.ts', status: 'owned', module: 'c' }],
      changedModules: [sub('c')], affectedModules: [sub('a'), sub('b')], testModules: [sub('a'), sub('b'), sub('c'), sub('d')],
      selection: 'all-modules', widening: ['partial-coverage'], coverage: { status: 'partial', notes: [dynamic] } });
  });

  it('A7-04:signature-only-complete: owner-known notes keep coverage complete and return every note in report order', () => {
    const inferred = note('signature-inferred', 'subs/c/src/c.ts', 5);
    const unresolved = note('unresolved-original', 'subs/a/src/a.ts');
    const rest = (['incomplete-exports', 'ambiguous-original', 'unknown-key', 'namespace-escape', 'signature-unresolved'] as const)
      .map((code, index) => note(code, 'subs/b/src/b.ts', index));
    const result = select(coverageGraph(inferred, ...rest, unresolved), ['c']);
    expect(result).toMatchObject({ changedModules: [sub('c')], affectedModules: [sub('a'), sub('b')],
      testModules: [sub('a'), sub('b'), sub('c')], selection: 'dependency-closure', widening: [] });
    // Report order: by file, then position.
    expect(result.coverage).toEqual({ status: 'complete', notes: [unresolved, ...rest, inferred] });
  });

  it('A7-04:resource-limit: more unique edges or modules than the limits is resource-limit, never a truncated list', () => {
    // The diamond has five unique non-self edges and five modules.
    const limit = { status: 'unavailable', reason: 'resource-limit', message: expect.any(String), unknownModules: [] };
    expect(projectAffected(diamondCycle(), seeds(['d']), { maxModules: 5, maxEdges: 4 })).toEqual(limit);
    expect(projectAffected(diamondCycle(), seeds(['d']), { maxModules: 4, maxEdges: 5 })).toEqual(limit);
    // A duplicated edge counts once.
    const duplicated = graphFacts({ modules: { a: 'subs/a', b: 'subs/b' }, edges: [['a', 'b'], ['a', 'b']] });
    expect(ids(answered(projectAffected(duplicated, seeds(['b']), { maxModules: 2, maxEdges: 1 })).affectedModules)).toEqual(['a']);
    expect(ids(answered(projectAffected(diamondCycle(), seeds(['d']), { maxModules: 5, maxEdges: 5 })).affectedModules))
      .toEqual(['a', 'b', 'c']);
  });
});

describe('affected-module projection: cancellation', () => {
  it('A7-05:worker-cancel (projector): an aborted signal answers cancelled', () => {
    const controller = new AbortController(); controller.abort();
    expect(projectAffected(chain(), seeds(['c']), affectedLimits, { signal: controller.signal })).toEqual({ status: 'cancelled' });
  });

  it('A7-05:worker-cancel stride: a signal aborted after the entry check cancels inside the access loop', () => {
    // 1,099 self accesses add no edge; the last access adds a -> b, which exceeds
    // maxEdges 0. Only a check inside the loop can answer before that edge.
    const own = origin('subs/a/src/a.ts', 'a');
    const accesses = Array.from({ length: 1099 }, () => access(own, { kind: 'application', origin: origin('subs/a/src/other.ts', 'a') }));
    accesses.push(access(own, { kind: 'application', origin: origin('subs/b/src/b.ts', 'b') }));
    const facts = graphFacts({ modules: { a: 'subs/a', b: 'subs/b' }, accesses });
    const limits = { maxModules: 2, maxEdges: 0 };
    expect(projectAffected(facts, seeds(['b']), limits)).toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
    let reads = 0;
    const signal = { get aborted() { return reads++ > 0; } } as unknown as AbortSignal;
    expect(projectAffected(facts, seeds(['b']), limits, { signal })).toEqual({ status: 'cancelled' });
    // The entry check and the check at the 1,024th access.
    expect(reads).toBe(2);
  });
});
