import { describe, expect, it } from 'vitest';
import { plan1Instances } from './cases.js';
import { gateHandlers } from './gate-cases.js';
import { referenceRuntime } from './runtime.js';
import { requiredCapabilities } from './runner.js';
import { checkerSummary } from './report.js';
import { captureObservations, recordObservation } from './observations.js';
import { portableValue } from './artifact.js';

describe('reference gate registration and evidence', () => {
  it('activates all fifteen reference variants and preserves complete plan membership', () => {
    const assigned = plan1Instances.filter(instance => instance.iteration === 14);
    expect([...gateHandlers.keys()].sort()).toEqual(assigned.map(instance => instance.id).sort());
    expect(assigned).toHaveLength(15);
    for (const instance of assigned) expect(requiredCapabilities(instance).every(capability => referenceRuntime.capabilities.has(capability))).toBe(true);
    expect(plan1Instances.filter(instance => !referenceRuntime.handlers.has(instance.id)).map(instance => instance.id))
      .toEqual([]);
  });

  it('cannot present a zero violation total when the checker did not run', () => {
    expect(checkerSummary(undefined).join('\n')).toContain('not measured');
    expect(checkerSummary(undefined).join('\n')).not.toContain('violations: 0');
    const text = checkerSummary({ outcome: { execution: 'completed', check: 'failed', coverage: 'partial' },
      summary: { complete: true, owners: 3, sourceFiles: 4, resources: 0, originals: 5, accesses: 2,
        allowed: 0, denied: 2, errors: 2, warnings: 0, coverageNotes: 1, external: 0 },
      diagnostics: [], warnings: [], coverage: [] }).join('\n');
    expect(text).toContain('violations: 2 (checker-derived)');
    expect(text).toContain('coverage: partial; 1 analysis limits');
    expect(text).toContain('check: failed');
  });

  it('detaches observations and isolates concurrent and nested gate evidence', async () => {
    const source = { count: 1 };
    const [first, second] = await Promise.all([
      captureObservations(async () => {
        recordObservation('outer', source);
        const nested = await captureObservations(async () => { recordObservation('inner', { count: 2 }); });
        expect(nested.observations.map(item => item.kind)).toEqual(['inner']);
        source.count = 9;
      }),
      captureObservations(async () => { recordObservation('concurrent', { count: 3 }); }),
    ]);
    expect(first.observations).toEqual([{ kind: 'outer', data: { count: 1 } }]);
    expect(second.observations).toEqual([{ kind: 'concurrent', data: { count: 3 } }]);
  });

  it('makes absolute machine and preserved-copy paths portable without losing source locations', () => {
    const result = portableValue({ root: '/tmp/private/toolkit/example',
      diagnostic: '/tmp/private/toolkit/example/.reference-work/run-AbCd/I1-01:baseline/project/src/a.ts:3',
      original: 'subs/provider/src/api.ts', command: ['/usr/bin/node', '/tmp/private/toolkit/dist/src/cli-entry.js'] },
    [['/tmp/private/toolkit/', '<toolkit>'], ['/tmp/private/toolkit/example/', '<reference>'], ['/usr/bin/node', 'node']]);
    expect(result).toEqual({ root: '<reference>', diagnostic: '<reference>/.reference-work/<run>/I1-01:baseline/project/src/a.ts:3',
      original: 'subs/provider/src/api.ts', command: ['node', '<toolkit>/dist/src/cli-entry.js'] });
  });
});
