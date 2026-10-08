import { describe, expect, test } from 'vitest';
import { architectViewDirectory } from '../../subs/evidence/src/views.js';
import { baselineScope, scopeSize, writeScopeMeasurement, type DeclaredScope } from '../kpi/capture.js';
import type { MeasurementSnapshot, ScopeComponent } from '../run/records.js';
import type { WriteScope } from '../work/scope.js';

/*
 * The `scope-size/2` recipe over a constructed snapshot: each file once,
 * the architect view in its own component only, a role's own support
 * documents and brief, the write scope's extra locations and nested
 * projects, and no numbers merged from two revisions.
 */

const bucket = (bytes: number, tests = 0, documentation = 0, views = 0) => ({
  production: { sourceFiles: 1, sourceBytes: bytes, resourceFiles: 0, resourceBytes: 0 },
  tests: { sourceFiles: 1, sourceBytes: tests, resourceFiles: 0, resourceBytes: 0 },
  documentation: { files: 1, bytes: documentation },
  views: { ordinaryBytes: views, testsBytes: 0 },
});

function snapshot(options: { viewRevision?: string; supplementary?: MeasurementSnapshot['supplementary'] } = {}): MeasurementSnapshot {
  const document = {
    schema: 'ramify.measure/2', revision: 'rev/1:g:1', root: '/project', ownershipRule: 'nearest', views: 'measured',
    modules: [
      { id: 'p', dir: '', parent: null, exact: bucket(100, 0, 10, 5), subtree: bucket(1100, 200, 30, 25) },
      { id: 'p/a', dir: 'subs/a', parent: 'p', exact: bucket(400, 100, 10, 10), subtree: bucket(400, 100, 10, 10) },
      { id: 'p/b', dir: 'subs/b', parent: 'p', exact: bucket(600, 100, 10, 10), subtree: bucket(600, 100, 10, 10) },
    ],
    files: [
      { path: 'src/main.ts', owner: 'p', area: 'ordinary', kind: 'source', bytes: 100 },
      { path: 'subs/a/src/a.ts', owner: 'p/a', area: 'ordinary', kind: 'source', bytes: 400 },
      { path: 'subs/b/src/b.ts', owner: 'p/b', area: 'ordinary', kind: 'source', bytes: 350 },
      { path: 'subs/b/src/fakes/b.ts', owner: 'p/b', area: 'ordinary', kind: 'source', bytes: 250 },
      { path: 'subs/b/src/tests/b.test.ts', owner: 'p/b', area: 'tests', kind: 'source', bytes: 100 },
    ],
  };
  return {
    schema: 'ramify-agent.measurement-snapshot/1', id: 'ms-0001', policy: 'scope-size/2', head: '',
    measure: { revision: 'rev/1:g:1', document, hash: 'a'.repeat(64) },
    view: { status: 'materialized', revision: options.viewRevision ?? 'rev/1:g:1', input: 'input/1:x', coverageLimits: [] },
    supplementary: options.supplementary ?? [
      { path: 'plans/x/plan.md', bytes: 50 },
      { path: 'engineer.system.md', bytes: 300 },
      { path: 'skills/SKILL.md', bytes: 200 },
      { path: 'architect.system.md', bytes: 400 },
      // A second role's package carries the same skill.
      { path: 'skills/SKILL.md', bytes: 200 },
      { path: architectViewDirectory, bytes: 5000 },
    ],
  };
}

const component = (components: readonly ScopeComponent[], name: ScopeComponent['component']) => components.find(entry => entry.component === name)!;

function scope(extra: Partial<DeclaredScope>): DeclaredScope {
  return { exactOwners: [], subtrees: [], apiViews: false, architectView: false, supportDocuments: [], ...extra };
}

describe('scope-size/2 counts each file once', () => {
  test('B counts every support document once, and the architect view in its own component only', () => {
    const taken = snapshot();
    const size = scopeSize(taken, baselineScope('p', taken.supplementary.map(entry => entry.path)));
    expect(size.policy).toBe('scope-size/2');
    expect(component(size.components, 'architect-view')).toMatchObject({ state: 'measured', bytes: 5000 });
    // 50 + 300 + 200 + 400: the skill once, and the architect view not again.
    expect(component(size.components, 'support-documents')).toMatchObject({ state: 'measured', bytes: 950, buckets: { documents: 950 } });
    expect(size.bytes).toBe(1100 + 200 + 30 + 25 + 5000 + 950);
  });

  test('a role is measured over its own support documents and the brief it was delivered', () => {
    const size = scopeSize(snapshot(), scope({ exactOwners: ['p/a'], supportDocuments: ['plans/x/plan.md', 'engineer.system.md', 'skills/SKILL.md', 'skills/SKILL.md'], brief: 700 }));
    expect(component(size.components, 'support-documents')).toMatchObject({
      state: 'measured', bytes: 50 + 300 + 200 + 700, buckets: { documents: 550, brief: 700 },
      detail: '3 distinct documents: plans/x/plan.md, engineer.system.md, skills/SKILL.md; the delivered brief',
    });
  });

  test('a support document the snapshot did not capture leaves the component unavailable, never zero', () => {
    const size = scopeSize(snapshot(), scope({ supportDocuments: ['nowhere.md'] }));
    expect(component(size.components, 'support-documents')).toMatchObject({ state: 'unavailable', bytes: null, reason: expect.stringContaining('nowhere.md') });
    expect(size.bytes).toBeNull();
  });
});

describe('scope-size/2 measures what a writer was given to write', () => {
  const writeScope = (extra: WriteScope['extra'], included: WriteScope['resolved']['included'] = [], bootstrap: WriteScope['bootstrap'] = []): WriteScope => ({
    revision: 1, base: { module: 'p/a', included: [] }, extra, read: ['p/b'], bootstrap, rationale: 'r',
    resolved: {
      roots: [], files: [], view: { status: 'placeholder' }, excluded: [], included,
      ownership: { provider: 'ramify.affected-cli/4', ramifyVersion: '0', inputId: 'i', configuration: 'tsconfig.json', root: '/project', modules: [], exclusions: [] },
    },
  });

  test('an extra location counts the inventoried files beneath it that the selection does not hold, each once; the soft read scope counts nothing', () => {
    const declared = writeScopeMeasurement(writeScope([
      { path: 'subs/b/src/fakes', purpose: 'fake', kind: 'directory' },
      { path: 'subs/b/src/fakes/b.ts', purpose: 'fake-injection' },
      { path: 'subs/a/src/a.ts', purpose: 'consumer' },
    ]));
    expect(declared.exactOwners).toEqual(['p/a']);
    const size = scopeSize(snapshot(), { ...declared, apiViews: false });
    // p/a exactly (400 + 100 + 10), and b.ts's 250 bytes once; a.ts is already held.
    expect(component(size.components, 'owned-source')).toMatchObject({ state: 'measured', bytes: 760, buckets: { production: 650, tests: 100, documentation: 10 } });
  });

  test('an extra location outside the inventory counts its bytes on disk, and one absent when the invocation started counts nothing', () => {
    const size = scopeSize(snapshot(), scope({ exactOwners: ['p/a'], locations: [{ path: 'package.json', bytes: 90 }, { path: 'subs/a/new.ts', bytes: null }] }));
    const owned = component(size.components, 'owned-source');
    expect(owned).toMatchObject({ state: 'measured', bytes: 510 + 90, buckets: { 'outside-inventory': 90 } });
    expect(owned.detail).toContain('package.json (extra, outside Ramify\'s inventory, bytes on disk)');
    expect(owned.detail).toContain('subs/a/new.ts (extra, absent when the invocation started)');
  });

  test('an included child subtree counts as a subtree, an owned nested project is named without bytes, and a bootstrapped module is unknown until it exists', () => {
    const declared = writeScopeMeasurement(writeScope([], [
      { directory: 'subs/a/subs/c', kind: 'child-subtree', owner: 'p/b', reason: 'r', instructions: 'i', projectInstructions: [] },
      { directory: 'subs/a/nested', kind: 'owned-nested-project', owner: 'p/a', reason: 'r', instructions: 'i', projectInstructions: [] },
    ], [{ capability: { id: 'cap-1', revision: 1, hash: 'b'.repeat(64) }, owner: 'p/a/new', parent: 'p/a', directory: 'subs/a/subs/new' }]));
    expect(declared).toMatchObject({ exactOwners: ['p/a', 'p/a/new'], subtrees: ['p/b'], nestedProjects: ['subs/a/nested'] });
    const owned = component(scopeSize(snapshot(), declared).components, 'owned-source');
    expect(owned).toMatchObject({ state: 'unknown', bytes: null, reason: expect.stringContaining('p/a/new') });
    expect(owned.detail).toContain('p/b (subtree)');
    expect(owned.detail).toContain('subs/a/nested (owned nested project, not inventoried by Ramify and outside the proxy, as in B)');
    const withoutNew = writeScopeMeasurement(writeScope([], [
      { directory: 'subs/a/nested', kind: 'owned-nested-project', owner: 'p/a', reason: 'r', instructions: 'i', projectInstructions: [] },
    ]));
    expect(component(scopeSize(snapshot(), withoutNew).components, 'owned-source')).toMatchObject({ state: 'measured', bytes: 510 });
  });

  test('a contract engineer is given its provider whole beside its write scope', () => {
    expect(writeScopeMeasurement(writeScope([]), ['p/b']).exactOwners).toEqual(['p/a', 'p/b']);
  });
});

describe('scope-size/2 never merges numbers of two revisions', () => {
  test('a measurement of another revision than the view leaves every measured component but the support documents unavailable, with the reason', () => {
    const taken = snapshot({ viewRevision: 'rev/1:g:2' });
    const size = scopeSize(taken, baselineScope('p', taken.supplementary.map(entry => entry.path)));
    for (const name of ['owned-source', 'api-views', 'architect-view'] as const) {
      expect(component(size.components, name)).toMatchObject({ state: 'unavailable', bytes: null, reason: expect.stringContaining('revision rev/1:g:1 and the architect view of revision rev/1:g:2') });
    }
    expect(component(size.components, 'support-documents')).toMatchObject({ state: 'measured', bytes: 950 });
    expect(size).toMatchObject({ bytes: null, subtotal: 950, coverage: 'partial' });
  });

  test('a scope without the architect view keeps that component measured at zero, but its source is still of the other state', () => {
    const size = scopeSize(snapshot({ viewRevision: 'rev/1:g:2' }), scope({ exactOwners: ['p/a'] }));
    expect(component(size.components, 'architect-view')).toMatchObject({ state: 'measured', bytes: 0 });
    expect(component(size.components, 'owned-source')).toMatchObject({ state: 'unavailable', bytes: null });
  });
});
