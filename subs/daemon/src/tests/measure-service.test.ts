import { afterEach, describe, expect, it } from 'vitest';
import type { MeasureOutcome, ServiceResult } from '../../../../src/interfaces/service.js';
import type { SessionMeasurements } from '../../../analysis/src/interfaces/measurements.js';
import type { MeasurementFileRecord } from '../../../analysis/src/interfaces/measurements.js';
import { createQuickEnvironment, type QuickEnvironment } from '../../../../src/tests/quick-environment.js';
import { createMeasureDriver } from './measure-driver.js';
import { countJsonBytesBounded, measurementOwnershipRule } from '../measure-response.js';

const environments: QuickEnvironment[] = [];
afterEach(async () => { for (const environment of environments.splice(0)) await environment.dispose(); });

const size = (sourceFiles: number, sourceBytes: number) => ({ production: { sourceFiles, sourceBytes,
  resourceFiles: 0, resourceBytes: 0 }, tests: { sourceFiles: 0, sourceBytes: 0, resourceFiles: 0, resourceBytes: 0 },
documentation: { files: 2, bytes: 37 } });

function measurementFacts(count = 700): SessionMeasurements {
  const files: MeasurementFileRecord[] = Array.from({ length: count }, (_, index) => ({
    path: `src/深い-\"quoted\"-\\backslash-${String(index).padStart(5, '0')}-${'long'.repeat(30)}.ts`,
    owner: 'fixture', area: 'ordinary' as const, kind: 'source' as const, bytes: index + 1,
  }));
  files.push({ path: 'README.md', owner: 'fixture', area: 'documentation', kind: 'documentation', bytes: 15 });
  files.push({ path: 'module.ramify', owner: 'fixture', area: 'documentation', kind: 'documentation', bytes: 22 });
  return { sequence: 1, inputId: 'input-scripted', modules: [{ id: 'fixture', dir: '', parent: null,
    exact: size(count, count * (count + 1) / 2), subtree: size(count, count * (count + 1) / 2) }],
  files, outsideModuleFiles: ['loose/外部-\"quoted\"-\\path.ts'] };
}

async function scriptedFixture(maxResponseBytes: number, apiFailure = false) {
  const facts = measurementFacts();
  const driver = createMeasureDriver(facts, apiFailure);
  const environment = await createQuickEnvironment({}, { driver, maxResponseBytes });
  environments.push(environment);
  const opened = await environment.service.openContext({ project: { cwd: '/fixture', root: '/fixture', scope: 'whole-project', configuration: 'discover' },
    setup: { registry: 'default', capabilities: [] } });
  if (!opened.ok || opened.value.status !== 'opened') throw new Error('Expected scripted context');
  const token = opened.value.token;
  const request = (requestId: string, deadlineMs?: number) => ({ token, requestId,
    freshness: { mode: 'synchronized' as const, expect: [] }, ...(deadlineMs === undefined ? {} : { deadlineMs }) });
  return { environment, request };
}

describe('measure service (MM08-MM09, MM16-MM17)', { timeout: 60_000 }, () => {
  it('returns the exact schema, ordered inventory facts, ownership rule and measured view bytes deterministically', async () => {
    const f = await scriptedFixture(128 * 1024 ** 2);
    const first = await f.environment.service.measure(f.request('measure-direct'));
    const second = await f.environment.service.measure(f.request('measure-repeat'));
    for (const result of [first, second]) {
      if (!result.ok || result.value.status !== 'measured') throw new Error(JSON.stringify(result));
      expect(result.value.document).toMatchObject({ schema: 'ramify.measure/1', root: '/fixture', views: 'measured',
        modules: [{ id: 'fixture', parent: null, exact: { production: { sourceFiles: 700 },
          views: { ordinaryBytes: expect.any(Number), testsBytes: 0 } } }],
        outsideModuleFiles: ['loose/外部-"quoted"-\\path.ts'] });
      expect(result.value.document.ownershipRule).toBe(measurementOwnershipRule);
      expect(result.value.document.files).toHaveLength(702);
      expect(result.value.document.files[0]!.path).toContain('深い-"quoted"-\\backslash');
    }
    if (!first.ok || first.value.status !== 'measured' || !second.ok || second.value.status !== 'measured') return;
    expect(second.value.document).toEqual({ ...first.value.document, revision: second.value.document.revision });
    expect(second.value.document.revision).toBe(first.value.document.revision);
  });

  it('keeps valid inventory when only the API projection is resource-unavailable', async () => {
    const f = await scriptedFixture(128 * 1024 ** 2, true);
    const result = await f.environment.service.measure(f.request('measure-api-limit'));
    expect(result).toMatchObject({ ok: true, value: { status: 'measured', document: {
      views: { state: 'unavailable', reason: 'resource-unavailable' }, files: expect.any(Array),
      modules: [{ exact: { production: { sourceFiles: 700 } } }],
    } } });
    if (result.ok && result.value.status === 'measured') {
      expect(result.value.document.modules[0]!.exact).not.toHaveProperty('views');
      expect(result.value.document.modules[0]!.subtree).not.toHaveProperty('views');
    }
  });

  it('enforces the direct-call ceiling at the exact escaped UTF-8 envelope boundary', async () => {
    const generous = await scriptedFixture(128 * 1024 ** 2);
    const baseline = await generous.environment.service.measure(generous.request('measure-boundary'));
    if (!baseline.ok || baseline.value.status !== 'measured') throw new Error(JSON.stringify(baseline));
    const envelope = { type: 'response', id: '~'.repeat(128), result: baseline };
    const encoded = Buffer.byteLength(JSON.stringify(envelope), 'utf8');
    expect(encoded).toBeGreaterThan(100_000);
    expect(await countJsonBytesBounded(envelope, encoded, undefined, () => true)).toEqual({ status: 'within', bytes: encoded });
    expect(await countJsonBytesBounded(envelope, encoded - 1, undefined, () => true)).toMatchObject({ status: 'exceeded' });

    const atLimit = await scriptedFixture(encoded);
    expect(await atLimit.environment.service.measure(atLimit.request('measure-boundary')))
      .toMatchObject({ ok: true, value: { status: 'measured', document: { files: expect.any(Array) } } });
    const over = await scriptedFixture(encoded - 1);
    expect(await over.environment.service.measure(over.request('measure-boundary'))).toEqual({ ok: true, value: {
      status: 'unavailable', requestId: 'measure-boundary', reason: 'resource-unavailable',
      message: `Measure response exceeds maxResponseBytes (${encoded - 1})`,
    } });
  });

  it('interrupts mid-assembly for cancellation and deadline, then recovers without truncated success', async () => {
    const cancelledFixture = await scriptedFixture(128 * 1024 ** 2);
    const controller = new AbortController();
    const cancelled = cancelledFixture.environment.service.measure(cancelledFixture.request('cancel-mid'), { signal: controller.signal });
    setImmediate(() => controller.abort());
    expect(await cancelled).toEqual({ ok: true, value: { status: 'cancelled', requestId: 'cancel-mid' } });
    expect(await cancelledFixture.environment.service.measure(cancelledFixture.request('cancel-recovery')))
      .toMatchObject({ ok: true, value: { status: 'measured', document: { files: expect.any(Array) } } });

    const deadlineFixture = await scriptedFixture(128 * 1024 ** 2);
    const deadline = deadlineFixture.environment.service.measure(deadlineFixture.request('deadline-mid', 1));
    setTimeout(() => deadlineFixture.environment.clock.advance(1), 0);
    expect(await deadline).toMatchObject({ ok: true, value: { status: 'deadline-exceeded', requestId: 'deadline-mid' } });
    expect(await deadlineFixture.environment.service.measure(deadlineFixture.request('deadline-recovery')))
      .toMatchObject({ ok: true, value: { status: 'measured' } });
  });
});
