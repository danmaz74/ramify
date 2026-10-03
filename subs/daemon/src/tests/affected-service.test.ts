import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AffectedSelection } from '../../../analysis/src/interfaces/affected.js';
import type { Capability } from '../../../analysis/src/interfaces/analysis.js';
import type { AffectedParams, ServiceResult } from '../../../../src/interfaces/service.js';
import { createQuickEnvironment, type QuickEnvironment } from '../../../../src/tests/quick-environment.js';

/** `example/app -> example/mid -> example/core`, where an arrow means "depends on", and an unrelated `example/lone`. */
const files: Record<string, string> = {
  'module.ramify': 'ramify 1\nroot module example\nexpose-sub * from core to descendants\nexpose-sub * from mid to descendants\n',
  'README.md': '# Example\n\nAn affected-module service fixture.\n',
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', types: [], skipLibCheck: true },
    include: ['src', 'subs'] }),
  'subs/core/module.ramify': 'ramify 1\nmodule core\nexpose-src * from "interfaces/api.ts" to parent\n',
  'subs/core/src/interfaces/api.ts': 'export const coreValue: number = 1;\n',
  'subs/mid/module.ramify': 'ramify 1\nmodule mid\nexpose-src * from "interfaces/api.ts" to parent\n',
  'subs/mid/src/interfaces/api.ts': "import { coreValue } from '../../../core/src/interfaces/api.js';\nexport const midValue: number = coreValue + 1;\n",
  'subs/app/module.ramify': 'ramify 1\nmodule app\n',
  'subs/app/src/main.ts': "import { midValue } from '../../mid/src/interfaces/api.js';\nvoid midValue;\n",
  'subs/lone/module.ramify': 'ramify 1\nmodule lone\n',
  'subs/lone/src/alone.ts': 'export const alone: number = 1;\n',
};
const capabilities: readonly Capability[] = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking',
  'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'];
const core = { id: 'example/core', directory: 'subs/core' }, mid = { id: 'example/mid', directory: 'subs/mid' };
const app = { id: 'example/app', directory: 'subs/app' };

const environments: QuickEnvironment[] = [];
const roots: string[] = [];
/** The same value with every JSON number at its shortest form, one byte. Its encoded size is a lower
 * bound for the same answer at any timings, which differ between runs. */
function shortest(value: unknown): unknown {
  if (typeof value === 'number') return 0;
  if (Array.isArray(value)) return value.map(shortest);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shortest(item)]));
  return value;
}

afterEach(async () => {
  for (const environment of environments.splice(0)) await environment.dispose();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function opened(fixture: Parameters<typeof createQuickEnvironment>[1] = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-affected-service-')));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  const environment = await createQuickEnvironment({}, fixture);
  environments.push(environment);
  const project = { cwd: root, root, scope: 'whole-project' as const, configuration: 'discover' as const };
  const setup = { registry: 'default' as const, capabilities };
  const result = await environment.service.openContext({ project, setup });
  if (!result.ok || result.value.status !== 'opened') throw new Error(JSON.stringify(result));
  const token = result.value.token;
  const request = (requestId: string, seeds: Pick<AffectedParams, 'modules' | 'paths'>): AffectedParams =>
    ({ token, requestId, freshness: { mode: 'synchronized', expect: [] }, ...seeds });
  return { root, environment, project, setup, token, request };
}

describe('daemon affected operation (A7-07)', { timeout: 120_000 }, () => {
  it('A7-07:capability lists affected in the welcome the quick connection negotiates', async () => {
    const environment = await createQuickEnvironment();
    environments.push(environment);
    const connected = await environment.connect({ start: 'never' });
    if (connected.status !== 'connected') throw new Error(JSON.stringify(connected));
    expect(connected.connection.daemon.capabilities).toContain('affected');
    expect(connected.connection.daemon.capabilities).toContain('measure');
  });

  it('A7-07:validation refuses malformed params as invalid-request, directly and on the wire', async () => {
    const environment = await createQuickEnvironment();
    environments.push(environment);
    const token = { context: `ctx/1:${'0'.repeat(64)}`, generation: 'gen/1:d5f257c2-2058-499f-9098-045de98690a2' };
    const base = { token, requestId: 'shape', freshness: { mode: 'synchronized', expect: [] } };
    const malformed: readonly [string, unknown][] = [
      ['missing token', { requestId: 'shape', freshness: base.freshness }],
      ['non-array modules', { ...base, modules: 'example/core' }],
      ['negative deadline', { ...base, deadlineMs: -1 }],
      ['zero deadline', { ...base, deadlineMs: 0 }],
      ['deadline above the cap', { ...base, deadlineMs: 600_001 }],
      ['fractional deadline', { ...base, deadlineMs: 1.5 }],
      ['unknown field', { ...base, since: 'x' }],
      ['empty module ID', { ...base, modules: [''] }],
      ['non-string path', { ...base, paths: [1] }],
      ['null paths', { ...base, paths: null }],
      ['unknown freshness', { ...base, freshness: { mode: 'eventual' } }],
      ['published freshness without wait', { ...base, freshness: { mode: 'published' } }],
      ['empty request id', { ...base, requestId: '' }],
      // The wire bound of each seed list is 10,000 entries.
      ['modules above the wire cap', { ...base, modules: Array.from({ length: 10_001 }, (_, index) => `example/m${index}`) }],
    ];
    for (const [label, params] of malformed) {
      const expected = { ok: false, error: { code: 'invalid-request', message: 'Invalid parameters for affected', details: { operation: 'affected' } } };
      expect([label, await environment.service.affected(params as never)]).toEqual([label, expected]);
      expect([label, await environment.request('affected', params)]).toEqual([label, expected]);
    }
    const status = await environment.service.daemonStatus();
    expect(status.ok && status.value.counters.rejectedRequests).toBe(malformed.length * 2);
    // Well-formed wire data with an unknown context is a domain answer, not a service error.
    expect(await environment.service.affected(base as never)).toEqual({ ok: true, value: { status: 'unavailable', requestId: 'shape',
      revision: null, reason: 'unknown-context', message: 'unknown-context', unknownModules: [] } });

    // Within the wire cap, more seeds than the session's 4,096 is the session's domain answer.
    const f = await opened();
    const many = Array.from({ length: 4_097 }, (_, index) => `example/m${index}`);
    const answer = await f.environment.request('affected', f.request('many', { modules: many }));
    const context = await f.environment.service.contextStatus({ token: f.token });
    if (!context.ok) throw new Error(JSON.stringify(context));
    expect(answer).toEqual({ ok: true, value: { status: 'unavailable', requestId: 'many', revision: context.value.published,
      reason: 'invalid-query', message: 'A query names at most 4096 seeds; it named 4097', unknownModules: [] } });
  });

  it('A7-07:validation response-bound refuses an answer over maxResponseBytes whole, as resource-unavailable', async () => {
    const seeds = { paths: ['subs/core/src/interfaces/api.ts'] };
    const generous = await opened();
    const baseline = await generous.environment.service.affected(generous.request('bound', seeds));
    if (!baseline.ok || baseline.value.status !== 'answered') throw new Error(JSON.stringify(baseline));
    // The direct binding counts the complete envelope with the largest legal request id.
    const envelope = (result: unknown) => ({ type: 'response', id: '~'.repeat(128), result });
    const encoded = Buffer.byteLength(JSON.stringify(envelope(shortest(baseline))), 'utf8');
    expect(encoded).toBeLessThanOrEqual(Buffer.byteLength(JSON.stringify(envelope(baseline)), 'utf8'));

    const over = await opened({ maxResponseBytes: encoded - 1 });
    const refused = await over.environment.service.affected(over.request('bound', seeds));
    const status = await over.environment.service.contextStatus({ token: over.token });
    if (!status.ok || !status.value.published) throw new Error(JSON.stringify(status));
    expect(refused).toEqual({ ok: true, value: { status: 'unavailable', requestId: 'bound', revision: status.value.published,
      reason: 'resource-unavailable', message: `Affected response exceeds maxResponseBytes (${encoded - 1})`, unknownModules: [] } });
    // Refused whole, never truncated: no partial selection accompanies the refusal.
    if (!refused.ok) throw new Error(JSON.stringify(refused));
    expect(refused.value).not.toHaveProperty('result');
  });

  it('A7-07:unknown-module-domain answers an unknown module ID and invalid seeds as unavailable outcomes, not service errors', async () => {
    const f = await opened();
    const unknown = await f.environment.service.affected(f.request('unknown', { modules: ['example/ghost', 'example/core', 'example/zombie'] }));
    if (!unknown.ok || unknown.value.status !== 'unavailable') throw new Error(JSON.stringify(unknown));
    const status = await f.environment.service.contextStatus({ token: f.token });
    if (!status.ok) throw new Error(JSON.stringify(status));
    expect(unknown.value).toEqual({ status: 'unavailable', requestId: 'unknown', revision: status.value.published,
      reason: 'unknown-module', message: expect.any(String), unknownModules: ['example/ghost', 'example/zombie'] });
    // Seed syntax is the session's domain answer as well.
    expect(await f.environment.request('affected', f.request('absolute', { paths: ['/etc/passwd'] }))).toMatchObject({ ok: true,
      value: { status: 'unavailable', requestId: 'absolute', reason: 'invalid-query', unknownModules: [] } });
    expect(await f.environment.request('affected', f.request('dotdot', { paths: ['subs/../core'] }))).toMatchObject({ ok: true,
      value: { status: 'unavailable', requestId: 'dotdot', reason: 'invalid-query' } });
  });

  it('A7-07:equivalence-with-session answers exactly what a retained session opened on the same inputs answers', async () => {
    const f = await opened();
    const seeds = { paths: ['subs/core/src/interfaces/api.ts'] };
    const result = await f.environment.request('affected', f.request('equivalence', seeds)) as ServiceResult<unknown>;
    if (!result.ok) throw new Error(JSON.stringify(result));
    const daemon = result.value as { status: string; revision: { fingerprints: { inputId: string } }; result: AffectedSelection };
    expect(daemon).toMatchObject({ status: 'answered', requestId: 'equivalence', freshness: { mode: 'synchronized', verified: true } });

    // The independently expected answer for the stated edges.
    const expected = {
      schemaVersion: 'ramify.affected/2', paths: [{ path: 'subs/core/src/interfaces/api.ts', module: 'example/core', basis: 'inventory' }],
      changedModules: [core], affectedModules: [app, mid], testModules: [app, core, mid],
      selection: 'dependency-closure', widening: [], coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed',
    };
    expect(daemon.result).toMatchObject(expected);
    expect(daemon.result.inputId).toBe(daemon.revision.fingerprints.inputId);

    const driver = f.environment.sessionDriver();
    try {
      const session = await driver.open(f.project, f.setup);
      if (session.status !== 'opened') throw new Error(JSON.stringify(session));
      // One input identity: the direct session observed exactly the inputs the daemon answered from.
      expect(session.revision.inputId).toBe(daemon.result.inputId);
      const direct = await session.session.affected({ sequence: session.revision.sequence, ...seeds });
      if (direct.status !== 'answered') throw new Error(JSON.stringify(direct));
      expect(JSON.parse(JSON.stringify(daemon.result))).toEqual(JSON.parse(JSON.stringify(direct.result)));
      expect(JSON.stringify(daemon.result)).toBe(JSON.stringify(direct.result));
    } finally { await driver.dispose(); }
  });
});
