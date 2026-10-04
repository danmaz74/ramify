import { describe, expect, it } from 'vitest';
import { validateServiceRequest } from '../validation.js';

const uuid = 'd5f257c2-2058-499f-9098-045de98690a2';
const token = { context: `ctx/1:${'a'.repeat(64)}`, generation: `gen/1:${uuid}` };
const revision = `rev/1:${uuid}:1`;
const selection = { project: { cwd: '/project', scope: 'whole-project', configuration: 'discover' },
  setup: { registry: 'default', capabilities: ['registry', 'layout', 'coverage'] } };
const synchronized = { token, requestId: 'check-1', freshness: { mode: 'synchronized', expect: [] } };

describe('service request structure', () => {
  it('accepts the basic operation shapes without changing the input', () => {
    const cases: readonly [string, unknown][] = [
      ['openContext', selection], ['contextStatus', { token }], ['check', synchronized],
      ['subscribe', { token }], ['unsubscribe', { subscription: 'subscription-1' }],
      ['closeContext', { token }], ['daemonStatus', {}], ['stopDaemon', { instanceId: 'daemon-1' }],
    ];
    for (const [operation, params] of cases) {
      const before = JSON.stringify(params);
      expect(validateServiceRequest(operation, params), operation).toBeNull();
      expect(JSON.stringify(params)).toBe(before);
    }
  });

  it('MM09: accepts only synchronized measure requests with bounded optional deadlines', () => {
    const params = { token, requestId: 'measure-1', freshness: { mode: 'synchronized', expect: [] } };
    for (const deadlineMs of [undefined, 1, 600_000]) {
      const request = deadlineMs === undefined ? params : { ...params, deadlineMs };
      expect(validateServiceRequest('measure', request)).toBeNull();
    }
    for (const invalid of [
      { ...params, freshness: { mode: 'published', wait: true } }, { ...params, deadlineMs: 0 },
      { ...params, deadlineMs: 600_001 }, { ...params, selection: { scope: 'all' } },
      { token, freshness: params.freshness },
    ]) expect(validateServiceRequest('measure', invalid)?.code).toBe('invalid-request');
  });

  it('permits unsupported setups structurally so dispatch can return a domain outcome', () => {
    for (const setup of [{ registry: 'custom', capabilities: ['coverage'] },
      { registry: 'default', capabilities: ['browser-verification'] },
      { registry: 'future', capabilities: ['future-capability'] }]) {
      expect(validateServiceRequest('openContext', { ...selection, setup })).toBeNull();
    }
  });

  it('rejects invalid scope, configuration and project shape', () => {
    for (const project of [null, {}, [], { ...selection.project, scope: 'subtree' },
      { ...selection.project, configuration: 'custom' }, { ...selection.project, cwd: 1 },
      { ...selection.project, root: undefined }, { ...selection.project, root: 1 },
      { ...selection.project, extra: true }]) {
      expect(validateServiceRequest('openContext', { ...selection, project })?.code).toBe('invalid-request');
    }
    expect(validateServiceRequest('openContext', { ...selection, project: { ...selection.project, root: 'relative/root' } })).toBeNull();
  });

  it('rejects malformed setups, sparse arrays and extra array properties', () => {
    const extra = Object.assign(['coverage'], { other: true });
    for (const setup of [null, {}, { registry: 1, capabilities: [] },
      { registry: 'default', capabilities: [1] }, { registry: 'default', capabilities: 'coverage' },
      { registry: 'default', capabilities: new Array(1) }, { registry: 'default', capabilities: extra },
      { ...selection.setup, overlay: {} }]) {
      expect(validateServiceRequest('openContext', { ...selection, setup })?.code).toBe('invalid-request');
    }
  });

  it('validates token shape and complete identifier formats on every token operation', () => {
    for (const invalidToken of [null, 'context', {}, { context: token.context },
      { ...token, generation: 'gen/1:invalid' }, { ...token, context: `ctx/1:${'a'.repeat(63)}` },
      { ...token, generation: `${token.generation}\n` }, { ...token, extra: true }]) {
      for (const operation of ['contextStatus', 'subscribe', 'closeContext', 'check']) {
        const params = operation === 'check' ? { ...synchronized, token: invalidToken } : { token: invalidToken };
        expect(validateServiceRequest(operation, params)?.code).toBe('invalid-request');
      }
    }
    // A structurally valid foreign token is the manager's unknown/expired outcome.
    expect(validateServiceRequest('contextStatus', { token: { ...token, context: `ctx/1:${'b'.repeat(64)}` } })).toBeNull();
  });

  it('enforces the inclusive printable ASCII request ID bounds', () => {
    for (const requestId of [' ', '~'.repeat(128)]) expect(validateServiceRequest('check', { ...synchronized, requestId })).toBeNull();
    for (const requestId of ['', 'a'.repeat(129), 'id\n', 'id\r', 'tab\t', 'id\0', 'é', '\x7f', 1]) {
      expect(validateServiceRequest('check', { ...synchronized, requestId })?.code).toBe('invalid-request');
    }
  });

  it('keeps published and synchronized freshness separate and validates revision identifiers', () => {
    expect(validateServiceRequest('check', { ...synchronized, freshness: { mode: 'published', wait: true } })).toBeNull();
    expect(validateServiceRequest('check', { ...synchronized, freshness: { mode: 'published', wait: false, revision } })).toBeNull();
    for (const freshness of [{ mode: 'overlay' }, { mode: 'published' }, { mode: 'published', wait: 1 },
      { mode: 'synchronized', expect: [], revision }, { mode: 'published', wait: false, expect: [] },
      ...['rev/1:bad', `rev/1:${uuid}:0`, `rev/1:${uuid}:01`, `${revision}\n`, null]
        .map(revision => ({ mode: 'published', wait: false, revision }))]) {
      expect(validateServiceRequest('check', { ...synchronized, freshness })?.code).toBe('invalid-request');
    }
  });

  it('accepts content identities and absence while rejecting bytes and invalid labels', () => {
    const valid = [{ path: 'src/value.ts', sha256: 'a'.repeat(64) }, { path: 'missing.ts', sha256: null }];
    function check(expectations: unknown) {
      return validateServiceRequest('check', { ...synchronized, freshness: { mode: 'synchronized', expect: expectations } });
    }
    expect(check(valid)).toBeNull();
    for (const entry of [{ path: '/absolute.ts', sha256: null }, { path: '../escape.ts', sha256: null },
      { path: 'src/../../escape.ts', sha256: null }, { path: 'src/./value.ts', sha256: null },
      { path: 'src\\value.ts', sha256: null }, { path: '', sha256: null }, { path: '.', sha256: null },
      { path: 'src/value.ts', sha256: 'not-a-digest' }, { path: 'src/value.ts', sha256: `${'a'.repeat(64)}\n` },
      { path: 'src/value.ts', sha256: null, bytes: 'overlay' }]) {
      expect(check([entry])?.code).toBe('invalid-request');
    }
    expect(check([valid[0], valid[0]])?.code).toBe('invalid-request');
    expect(check(null)?.code).toBe('invalid-request');
  });

  it('accepts optional report/delta scope, retained revision and inclusive deadline bounds', () => {
    for (const scope of ['report', 'delta']) for (const deadlineMs of [1, 2000, 600_000]) {
      expect(validateServiceRequest('check', { ...synchronized, scope, since: revision, deadlineMs })).toBeNull();
    }
    for (const params of [{ ...synchronized, scope: 'delta' }, { ...synchronized, since: revision },
      { ...synchronized, deadlineMs: 100 }]) expect(validateServiceRequest('check', params)).toBeNull();
  });

  it('rejects malformed compact-check parameters instead of silently using defaults', () => {
    const invalid = [
      ...[undefined, null, '', 'changed', 1, {}, ['delta']].map(scope => ({ scope })),
      ...[undefined, null, '', 'rev/1:bad', `rev/1:${uuid}:0`, `rev/1:${uuid}:01`, `${revision}\n`, 1].map(since => ({ since })),
      ...[undefined, null, 0, -1, 1.5, 600_001, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '2000'].map(deadlineMs => ({ deadlineMs })),
    ];
    for (const params of invalid) {
      expect(validateServiceRequest('check', { ...synchronized, ...params })?.code).toBe('invalid-request');
    }
    let reads = 0;
    expect(validateServiceRequest('check', { ...synchronized, get deadlineMs() { reads++; return 2000; } })?.code).toBe('invalid-request');
    expect(reads).toBe(0);
  });

  it('accepts a changed check\'s paths with their classification and rejects every malformed variant', () => {
    const sha256 = 'b'.repeat(64);
    const changed = { ...synchronized, scope: 'delta', paths: ['src/main.ts', 'site/package.json'], classification: null };
    expect(validateServiceRequest('check', changed)).toBeNull();
    expect(validateServiceRequest('check', { ...changed, classification: 7,
      freshness: { mode: 'synchronized', expect: [{ path: 'src/main.ts', sha256 }] } })).toBeNull();
    const invalid: Record<string, unknown>[] = [
      // Present together or not at all.
      { paths: ['src/main.ts'] }, { classification: null },
      // Distinct, normalized paths inside the root.
      ...[[], ['src/main.ts', 'src/main.ts'], ['../outside.ts'], ['/absolute.ts'], ['./src/main.ts'], ['src//main.ts'],
        ['src\\main.ts'], ['.'], [''], [1], 'src/main.ts', null].map(paths => ({ paths, classification: null })),
      // A positive revision sequence or null.
      ...[0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1].map(classification => ({ paths: ['src/main.ts'], classification })),
      // Every expectation names a requested path, under synchronized freshness only.
      { paths: ['src/main.ts'], classification: 1, freshness: { mode: 'synchronized', expect: [{ path: 'src/other.ts', sha256 }] } },
      { paths: ['src/main.ts'], classification: 1, freshness: { mode: 'published', wait: true } },
    ];
    for (const params of invalid) expect(validateServiceRequest('check', { ...synchronized, ...params })?.code, JSON.stringify(params)).toBe('invalid-request');
    expect(validateServiceRequest('check', { ...changed, paths: Array.from({ length: 10_001 }, (_, index) => `${index}.ts`) })?.code).toBe('invalid-request');
  });

  it('validates explorer detail identities and limits distinct requests to 50', () => {
    const detail = (index: number) => ({ original: { kind: 'code', owner: 'fixture', file: 'api.ts', binding: `value${index}` }, exportName: `value${index}` });
    const requests = Array.from({ length: 50 }, (_, index) => detail(index));
    const params = { token, requestId: 'details-1', revision, requests };
    expect(validateServiceRequest('explorerDetails', params)).toBeNull();
    expect(validateServiceRequest('explorerDetails', { ...params, requests: [...requests, requests[0]] })).toBeNull();
    expect(validateServiceRequest('explorerDetails', { ...params, requests: [...requests, detail(50)] })?.code).toBe('invalid-request');
    for (const invalid of [
      { ...params, revision: 'rev/1:bad' },
      { ...params, requests: [{ ...detail(0), exportName: '' }] },
      { ...params, requests: [{ ...detail(0), original: { ...detail(0).original, kind: 'external' } }] },
      { ...params, requests: [{ ...detail(0), original: { ...detail(0).original, owner: 'Fixture' } }] },
      { ...params, requests: [{ ...detail(0), original: { ...detail(0).original, file: '../api.ts' } }] },
      { ...params, requests: [{ ...detail(0), extra: true }] },
    ]) expect(validateServiceRequest('explorerDetails', invalid)?.code).toBe('invalid-request');
  });

  it('BD23: validates a dependency diagram request as exactly a token, request ID and revision', () => {
    const params = { token, requestId: 'diagram-1', revision };
    const before = JSON.stringify(params);
    expect(validateServiceRequest('dependencyDiagram', params)).toBeNull();
    expect(JSON.stringify(params)).toBe(before);
    const { requestId: _requestId, ...missing } = params;
    for (const invalid of [
      missing, { ...params, revision: 'rev/1:bad' }, { ...params, revision: `rev/1:${uuid}:0` }, { ...params, requestId: '' },
      { ...params, requestId: 'x'.repeat(129) }, { ...params, token: { ...token, generation: 'gen/1:bad' } },
      { ...params, extra: true }, { ...params, requests: [] }, null, [],
    ]) expect(validateServiceRequest('dependencyDiagram', invalid)?.code).toBe('invalid-request');
  });

  it('AV25: accepts materialize views as a non-empty list of distinct known identifiers, and their absence', () => {
    const params = { token, requestId: 'materialize-1', freshness: { mode: 'synchronized', expect: [] }, selection: { scope: 'all' } };
    for (const views of [undefined, ['api'], ['architect'], ['api', 'architect'], ['architect', 'api']]) {
      const request = views ? { ...params, views } : params;
      const before = JSON.stringify(request);
      expect(validateServiceRequest('materialize', request), JSON.stringify(views)).toBeNull();
      expect(JSON.stringify(request)).toBe(before);
    }
    const sparse: unknown[] = ['api']; sparse.length = 2;
    for (const views of [[], ['api', 'api'], ['architect', 'api', 'architect'], ['other'], ['API'], [''], [null], ['api', 1], 'api', null, {},
      { 0: 'api', length: 1 }, sparse, Object.assign(['api'], { extra: true })]) {
      expect(validateServiceRequest('materialize', { ...params, views })?.code, JSON.stringify(views)).toBe('invalid-request');
    }
    // The selection stays required and the freshness synchronized with any views.
    const { selection: _selection, ...unselected } = params;
    expect(validateServiceRequest('materialize', { ...unselected, views: ['architect'] })?.code).toBe('invalid-request');
    expect(validateServiceRequest('materialize', { ...params, views: ['architect'], freshness: { mode: 'published', wait: false } })?.code)
      .toBe('invalid-request');
  });

  it('accepts 10,000 expectations and rejects 10,001 before processing them', () => {
    const expectList = Array.from({ length: 10_000 }, (_, index) => ({ path: `src/${index}.ts`, sha256: null }));
    const request = { ...synchronized, freshness: { mode: 'synchronized', expect: expectList } };
    expect(validateServiceRequest('check', request)).toBeNull();
    expectList.push({ path: 'src/10000.ts', sha256: null });
    expect(validateServiceRequest('check', request)?.code).toBe('invalid-request');
  });

  it('rejects unknown properties on control and top-level parameter objects', () => {
    for (const [operation, params] of [['openContext', { ...selection, extra: true }],
      ['check', { ...synchronized, bytes: 'extra' }], ['unsubscribe', { subscription: 1 }],
      ['unsubscribe', { subscription: 's', extra: true }], ['stopDaemon', { instanceId: 'd', extra: true }],
      ['stopDaemon', { instanceId: null }], ['daemonStatus', { extra: true }]] as const) {
      expect(validateServiceRequest(operation, params)?.code).toBe('invalid-request');
    }
  });

  it('rejects non-data values without invoking getters or propagating proxy errors', () => {
    let reads = 0;
    const accessor = { get subscription() { reads++; throw new Error('must not read'); } };
    const prototype = Object.create({ subscription: 'inherited' });
    const proxy = new Proxy({}, { getPrototypeOf() { throw new Error('not JSON data'); } });
    for (const params of [accessor, prototype, proxy, new Date(), null, [],
      { subscription: 's', [Symbol('extra')]: true }]) {
      expect(validateServiceRequest('unsubscribe', params)?.code).toBe('invalid-request');
    }
    expect(reads).toBe(0);
  });

  it('returns unsupported-operation for unknown commands without inspecting parameters', () => {
    for (const operation of ['inspect', 'overlay', '', null, 1]) {
      expect(validateServiceRequest(operation, null)).toEqual({ code: 'unsupported-operation', message: 'Unsupported service operation', details: {} });
    }
  });
});
