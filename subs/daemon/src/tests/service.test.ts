import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import { dispatchServiceRequest } from '../service.js';
import type { QuickEnvironment } from '../../../../src/tests/quick-environment.js';

const roots: string[] = [], environments: QuickEnvironment[] = [];
afterEach(async () => { for (const environment of environments.splice(0)) await environment.dispose(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ramify-service-test-')); roots.push(root);
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture\n');
  await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"types":[],"module":"ESNext","moduleResolution":"bundler"},"include":["src"]}');
  await writeFile(join(root, 'src/index.ts'), 'export const value = 1;\n');
  const environment = await createQuickEnvironment(); environments.push(environment);
  return { root, environment, params: { project: { cwd: root, root, scope: 'whole-project' as const, configuration: 'discover' as const }, setup: { registry: 'default' as const, capabilities: ['registry', 'layout', 'descriptions'] as const } } };
}

describe('validated daemon service', () => {
  it('returns compact covering replies, forwards since and preserves the plain report default', async () => {
    const { environment, params } = await fixture();
    const opened = await environment.service.openContext(params);
    if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected opened context');
    const token = opened.value.token;
    const plain = await environment.service.check({ token, requestId: 'plain', freshness: { mode: 'synchronized', expect: [] } });
    expect(plain).toMatchObject({ ok: true, value: { status: 'reported', published: true, report: { schemaVersion: 'ramify.analysis/1' } } });
    if (!plain.ok || plain.value.status !== 'reported' || !plain.value.published) throw new Error('Expected publication');
    const since = plain.value.revision.revision;
    const sha256 = createHash('sha256').update('export const value = 1;\n').digest('hex');
    const compact = await environment.service.check({ token, requestId: 'compact', scope: 'delta', since, deadlineMs: 2000,
      freshness: { mode: 'synchronized', expect: [{ path: 'src/index.ts', sha256 }] } });
    expect(compact).toMatchObject({ ok: true, value: { status: 'reported', published: true, report: null,
      delta: { since, findings: [], removed: [] }, revision: { revision: since } } });
    const evicted = await environment.service.check({ token, requestId: 'evicted', scope: 'delta',
      since: 'rev/1:d5f257c2-2058-499f-9098-045de98690a2:1', freshness: { mode: 'synchronized', expect: [] } });
    expect(evicted).toMatchObject({ ok: true, value: { status: 'unavailable', reason: 'evicted-revision' } });
  });

  it('forwards deadlines and counts explicit cold and warm outcomes while analysis continues', async () => {
    const { environment, params } = await fixture();
    const opened = await environment.service.openContext(params);
    if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected opened context');
    const token = opened.value.token;
    const cold = environment.service.check({ token, requestId: 'cold', scope: 'delta', deadlineMs: 7,
      freshness: { mode: 'synchronized', expect: [] } });
    environment.clock.advance(7);
    expect(await cold).toMatchObject({ ok: true, value: { status: 'cold', elapsedMs: 7 } });
    const completed = await environment.service.check({ token, requestId: 'completed', freshness: { mode: 'synchronized', expect: [] } });
    expect(completed).toMatchObject({ ok: true, value: { status: 'reported', published: true } });
    const warm = environment.service.check({ token, requestId: 'deadline', scope: 'delta', deadlineMs: 9,
      freshness: { mode: 'synchronized', expect: [] } });
    environment.clock.advance(9);
    expect(await warm).toMatchObject({ ok: true, value: { status: 'deadline-exceeded', elapsedMs: 9 } });
    const continued = await environment.service.check({ token, requestId: 'continued', freshness: { mode: 'synchronized', expect: [] } });
    expect(continued).toMatchObject({ ok: true, value: { status: 'reported', published: true } });
    const status = await environment.service.daemonStatus();
    expect(status.ok && status.value.counters).toMatchObject({ coldOutcomes: 1, deadlineOutcomes: 1 });
  });

  it('rejects malformed compact parameters through codec-backed dispatch before manager work', async () => {
    const { environment, params } = await fixture();
    const opened = await environment.service.openContext(params);
    if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected opened context');
    const token = opened.value.token;
    for (const extension of [{ scope: 'changed' }, { since: 'rev/1:bad' }, { deadlineMs: 0 }, { deadlineMs: 600_001 }, { deadlineMs: '2000' }]) {
      expect(await environment.request('check', { token, requestId: 'invalid', freshness: { mode: 'synchronized', expect: [] }, ...extension }))
        .toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    }
    const status = await environment.service.daemonStatus();
    expect(status.ok && status.value.counters.rejectedRequests).toBe(5);
  });

  it('validates structure before context work and keeps unsupported setup as a value', async () => {
    const { environment, params } = await fixture();
    const invalid = await environment.service.openContext({ ...params, hidden: true } as never);
    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(await environment.service.openContext({ ...params, setup: { ...params.setup, registry: 'custom' } } as never)).toMatchObject({ ok: true, value: { status: 'unavailable', reason: 'unsupported-setup' } });
    const status = await environment.service.daemonStatus(); expect(status.ok && status.value.contexts).toEqual([]);
    expect(await dispatchServiceRequest(environment.service, 'unknown', {})).toMatchObject({ ok: false, error: { code: 'unsupported-operation' } });
  });
  it('releases one client/context pair while retaining its other subscription', async () => {
    const { environment, params, root } = await fixture();
    const secondRoot = await mkdtemp(join(tmpdir(), 'ramify-service-second-')); roots.push(secondRoot);
    const { cp } = await import('node:fs/promises'); await cp(root, secondRoot, { recursive: true });
    const lease = environment.service.lease('client');
    const first = await lease.service.openContext(params); const second = await lease.service.openContext({ ...params, project: { ...params.project, root: secondRoot, cwd: secondRoot } });
    if (!first.ok || first.value.status !== 'opened' || !second.ok || second.value.status !== 'opened') throw new Error('Expected opened contexts');
    await lease.service.subscribe({ token: first.value.token }, () => {});
    await lease.service.subscribe({ token: second.value.token }, () => {});
    expect(await lease.service.closeContext({ token: first.value.token })).toEqual({ ok: true, value: null });
    const secondToken = second.value.token;
    const status = await lease.service.daemonStatus();
    expect(status.ok && status.value.subscriptions).toBe(1);
    expect(status.ok && status.value.contexts.find(context => context.token.context === secondToken.context)?.leases.subscriptions).toBe(1);
    lease.release();
    expect(await lease.service.daemonStatus()).toMatchObject({ ok: false, error: { code: 'cancelled' } });
    const released = await environment.service.daemonStatus(); expect(released.ok && released.value.subscriptions).toBe(0);
  });
  it('binds subscription cancellation to the owning client and validates stop instance', async () => {
    const { environment, params } = await fixture();
    const first = environment.service.lease('first'), second = environment.service.lease('second');
    const opened = await first.service.openContext(params); if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected open');
    const subscription = await first.service.subscribe({ token: opened.value.token }, () => {}); if (!subscription.ok) throw new Error('Expected subscription');
    expect(await second.service.unsubscribe({ subscription: subscription.value.subscription })).toMatchObject({ ok: false, error: { code: 'unknown-subscription' } });
    expect(await second.service.stopDaemon({ instanceId: 'wrong' })).toMatchObject({ ok: false, error: { code: 'wrong-instance' } });
    const stops: unknown[] = []; environment.service.onStop(event => stops.push(event));
    expect(await first.service.stopDaemon({ instanceId: environment.service.instance.instanceId })).toMatchObject({ ok: true, value: { stopping: true } });
    expect(stops).toEqual([{ reason: 'explicit', requestId: null, at: environment.clock.now() }]);
    first.release(); second.release();
  });
});
