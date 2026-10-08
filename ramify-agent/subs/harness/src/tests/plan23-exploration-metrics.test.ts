import { describe, expect, test } from 'vitest';
import { explorationDetails, explorationIdentity, explorationMetrics, type ExplorationObservation } from '../kpi/exploration.js';
import { estimateRecordedCharge, invocationTiming } from '../kpi/efficiency.js';

const observation = (id: string, extra: Partial<ExplorationObservation> = {}): ExplorationObservation => ({
  id, invocationId: 'inv1', operationId: 'op1', role: 'engineer', sessionId: 'session1', turn: 1, callId: id,
  kind: 'read', requestedScope: ['a.ts'], resolvedScope: ['a.ts'], files: ['a.ts'], returnedBytes: 10,
  startedAt: null, endedAt: null, elapsedMs: 5, outcome: 'completed', broad: false, outsideScope: false, coverage: [], ...extra,
});

const fixture = [observation('r1'), observation('r2', { returnedBytes: 6, elapsedMs: 3 }),
  observation('r3', { requestedScope: ['b.ts'], resolvedScope: ['b.ts'], files: ['b.ts'], returnedBytes: 4, elapsedMs: null }),
  observation('s1', { kind: 'search', requestedScope: ['**'], resolvedScope: ['.'], files: [], returnedBytes: 0, broad: true, elapsedMs: 7 }),
  observation('s2', { kind: 'search', requestedScope: ['outside'], resolvedScope: ['outside'], files: ['outside/c.ts'], returnedBytes: 2, outsideScope: true, elapsedMs: 2 })];

describe('Plan23 F6 exploration over recorded calls only', () => {
  test('known returned bytes/duration, unique and repeated reads, and broad zero-match searches', () => {
    const { metrics, zeroMatchSearches } = explorationDetails(fixture);
    expect(metrics).toMatchObject({ reads: 3, uniqueFilesRead: 2, repeatedReads: 1, returnedBytes: 22,
      searches: 2, broadSearches: 1, outsideScopeSearches: 1, toolElapsedMs: 17 });
    expect(zeroMatchSearches).toBe(1);
    expect(metrics.coverage).toEqual([`${explorationIdentity(fixture[2]!)}: duration unknown`]);
    expect(metrics).not.toHaveProperty('scannedBytes');
  });

  test('copied/replayed/inherited rows retain source identity; new operation/invocation/turn/kind adds a call', () => {
    const first = fixture[0]!;
    expect(explorationMetrics([first, { ...first, id: 'replayed' }, { ...first, id: 'inherited-copy' }])).toMatchObject({ reads: 1, returnedBytes: 10, toolElapsedMs: 5, coverage: [] });
    const additional = [{ ...first, operationId: 'op2' }, { ...first, invocationId: 'inv2' }, { ...first, turn: 2 }, { ...first, kind: 'search' as const }];
    expect(explorationMetrics([first, ...additional])).toMatchObject({ reads: 4, searches: 1, returnedBytes: 50 });
  });

  test('unknown bytes/files/breadth/duration and failed calls stay explicit, not fabricated zero evidence', () => {
    const metrics = explorationMetrics([observation('binary', { files: null, returnedBytes: null, elapsedMs: null, resolvedScope: null, outcome: 'failed', coverage: ['binary bytes not collected'] }),
      observation('search', { kind: 'search', files: null, broad: null, outsideScope: null })], ['observation log truncated']);
    expect(metrics).toMatchObject({ reads: 1, searches: 1, returnedBytes: 10 });
    expect(metrics.coverage.join('\n')).toContain('returned bytes unknown');
    expect(metrics.coverage.join('\n')).toContain('files read unknown');
    expect(metrics.coverage.join('\n')).toContain('duration unknown');
    expect(metrics.coverage.join('\n')).toContain('search breadth unknown');
    expect(metrics.coverage).toContain('observation log truncated');
    expect(explorationDetails([observation('s', { kind: 'search', files: null })]).zeroMatchSearches).toBe(0);
  });

  test('conflicting replays are excluded with a limit, and explicit timestamps give duration without scanned-byte estimates', () => {
    const first = fixture[0]!;
    expect(explorationMetrics([first, { ...first, returnedBytes: 11 }])).toMatchObject({ reads: 0, returnedBytes: 0, coverage: [expect.stringContaining('conflicting observations')] });
    expect(explorationMetrics([observation('t', { elapsedMs: null, startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:00:00.010Z' })]).toolElapsedMs).toBe(10);
  });
});

describe('Plan23 F6 timing and charges with recorded inputs', () => {
  test('parallel 10ms tools sum to 20ms, while invocation wall time is 10ms and milestone is explicit', () => {
    const timing = invocationTiming({ startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:00:00.010Z',
      milestone: 'first-engineering-action', milestoneAt: '2026-01-01T00:00:00.004Z', modelElapsedMs: 3, checkElapsedMs: 0,
      exploration: [observation('a', { elapsedMs: 10 }), observation('b', { elapsedMs: 10 })] });
    expect(timing).toMatchObject({ elapsedMs: 10, toolElapsedMs: 20, toMilestoneMs: 4, milestone: 'first-engineering-action', coverage: [] });
    expect(invocationTiming({ startedAt: timing.startedAt, endedAt: null, milestone: null, milestoneAt: null })).toMatchObject({ elapsedMs: null, toolElapsedMs: null, toMilestoneMs: null, milestone: null });
    expect(invocationTiming({ startedAt: timing.startedAt, endedAt: timing.endedAt, exploration: fixture, milestone: null, milestoneAt: null })).toMatchObject({ toolElapsedMs: null, coverage: expect.arrayContaining([expect.stringContaining('known subtotal 17 ms')]) });
    expect(invocationTiming({ startedAt: timing.startedAt, endedAt: timing.endedAt, milestone: 'first-designated-submission', milestoneAt: '2026-01-01T00:00:00.011Z' }).toMilestoneMs).toBeNull();
  });

  test('new/cached/write/output categories use recorded rates and preserve absent rates/usage as unknown', () => {
    const input = { model: 'recorded-model', newInputTokens: 100, cachedInputTokens: 50, cacheWriteTokens: 0, outputTokens: 10,
      ratesPerMillion: { newInput: 2, cachedInput: 0.2, cacheWrite: 0, output: 8 } };
    expect(estimateRecordedCharge(input)).toMatchObject({ source: 'estimated-from-recorded-rates', currency: 'USD',
      newInput: 0.0002, cachedInput: 0.00001, cacheWrite: 0, output: 0.00008, coverage: [] });
    expect(estimateRecordedCharge(input).total).toBeCloseTo(0.00029, 12);
    expect(estimateRecordedCharge({ ...input, cachedInputTokens: null })).toMatchObject({ newInput: 0.0002, cachedInput: null, total: null });
    expect(estimateRecordedCharge({ ...input, ratesPerMillion: { ...input.ratesPerMillion, output: null } })).toMatchObject({ output: null, total: null });
  });
});
