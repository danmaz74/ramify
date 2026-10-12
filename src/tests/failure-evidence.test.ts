import { describe, expect, it, vi } from 'vitest';
import { runAffectedBatch } from '../batch.js';
import { analyzeProject } from '../../subs/analysis/src/analyze-project.js';
import { openRetainedSession } from '../../subs/analysis/src/retained-session.js';
import type { AnalysisDiagnostic, StageExecution } from '../../subs/analysis/src/interfaces/analysis.js';
import { recoverySmallPaths, withRecoverySmall } from '../../subs/analysis/src/tests/recovery-fixtures.js';

vi.mock('../../subs/analysis/src/retained-session.js', async importOriginal => {
  const original = await importOriginal<typeof import('../../subs/analysis/src/retained-session.js')>();
  return { ...original, openRetainedSession: vi.fn(original.openRetainedSession) };
});

const location = { file: 'subs/provider/module.ramify', start: 31, end: 36, line: 3, column: 12 };
const related = { file: 'subs/provider/src/api.ts', start: 0, end: 6, line: 1, column: 1 };
const diagnostics: readonly AnalysisDiagnostic[] = ['first', 'second'].map((name, index) => ({
  id: `producer:${name}`, code: 'missing-export', category: 'missing-export', message: `Missing ${name}`,
  location: { ...location, start: location.start + index }, related: [related],
  importer: null, original: null, accessId: null,
}));
const stages: readonly StageExecution[] = [{ stage: 'link', status: 'invalid', blockedBy: [], diagnosticIds: diagnostics.map(item => item.id) }];

describe('current failure evidence at batch assembly', () => {
  it('FR04 FR09 preserves both missing exports and the finalized producer stages without an affected answer', () => withRecoverySmall(async fixture => {
    const passing = await runAffectedBatch({ cwd: fixture.root, modules: [], paths: [recoverySmallPaths.provider] });
    expect(passing.status).toBe('answered');
    await fixture.removeExports();
    const producer = await analyzeProject(fixture.analysisInputs);
    if (producer.status !== 'reported') throw new Error('Expected producer report');
    expect(producer.report.outcome.execution).toBe('invalid');
    expect(producer.report.diagnostics.map(item => item.code)).toEqual(['missing-export', 'missing-export']);
    expect(producer.report.diagnostics.map(item => item.location)).toEqual([
      { file: recoverySmallPaths.providerDescription, start: 36, end: 41, line: 3, column: 12 },
      { file: recoverySmallPaths.providerDescription, start: 43, end: 49, line: 3, column: 19 },
    ]);
    const result = await runAffectedBatch({ cwd: fixture.root, modules: [], paths: [recoverySmallPaths.provider] });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid-project', exitCode: 1,
      diagnostics: producer.report.diagnostics, stages: producer.report.stages });
    expect(result).not.toHaveProperty('result');
  }), 45_000);

  it.each([
    ['root parsing', 'module.ramify', 'ramify 1\nroot module\n'],
    ['child parsing', 'subs/provider/module.ramify', 'ramify 1\nmodule\n'],
    ['layout', 'module.ramify', 'ramify 1\nroot module recovery\nexternal "vendor"\nowned-unwired "vendor"\n'],
    ['configuration', 'tsconfig.json', '{broken'],
  ])('FR05 FR09 retains %s producer records through batch refusal', (_variant, path, source) => withRecoverySmall(async fixture => {
    await fixture.write(path, source);
    const producer = await analyzeProject(fixture.analysisInputs);
    if (producer.status !== 'reported') throw new Error('Expected producer report');
    expect(producer.report.diagnostics.length).toBeGreaterThan(0);
    expect(producer.report.outcome.execution).toBe(_variant === 'configuration' ? 'incomplete' : 'invalid');
    const result = await runAffectedBatch({ cwd: fixture.root, modules: [], paths: [] });
    expect(result).toMatchObject({ status: 'unavailable', diagnostics: producer.report.diagnostics, stages: producer.report.stages,
      reason: _variant === 'configuration' ? 'analysis-failed' : 'invalid-project', exitCode: _variant === 'configuration' ? 2 : 1 });
    expect(result).not.toHaveProperty('inputId'); expect(result).not.toHaveProperty('result');
    if (_variant === 'configuration') expect(producer.report.diagnostics.every(item => item.location === null && item.related.length === 0)).toBe(true);
  }), 30_000);

  it.each(['analysis-failed', 'resource-limit', 'invalid-query', 'invalid-revision'] as const)(
    'FR10 retains a no-report %s reason, all supplied records and stages', reason => withRecoverySmall(async fixture => {
      const original = await vi.importActual<typeof import('../../subs/analysis/src/retained-session.js')>('../../subs/analysis/src/retained-session.js');
      let disposed = false;
      vi.mocked(openRetainedSession).mockImplementationOnce(async (...args) => {
        const opened = await original.openRetainedSession(...args);
        if (opened.status !== 'opened') throw new Error('Expected a valid retained session');
        const dispose = opened.session.dispose.bind(opened.session);
        vi.spyOn(opened.session, 'dispose').mockImplementation(async () => { await dispose(); disposed = true; });
        vi.spyOn(opened.session, 'affected').mockResolvedValue({ status: 'unavailable', reason,
          message: `Operation ${reason}`, unknownModules: [], diagnostics, stages });
        return opened;
      });
      const result = await runAffectedBatch({ cwd: fixture.root, modules: [], paths: [] });
      expect(result).toEqual({ status: 'unavailable', reason, message: `Operation ${reason}`, unknownModules: [], diagnostics, stages,
        exitCode: reason === 'invalid-query' ? 1 : 2 });
      expect(disposed).toBe(true);
    }), 30_000);

  it('FR10 cancellation claims no result or evidence', async () => {
    const result = await runAffectedBatch({ cwd: '/unused', modules: [], paths: [] }, { signal: AbortSignal.abort() });
    expect(result).toEqual({ status: 'cancelled', exitCode: 130 });
  });

  it('FR11 batch refusal keeps the explicit incomplete producer prefix and its limit diagnostic', () => withRecoverySmall(async fixture => {
    await fixture.removeExports();
    const producer = await analyzeProject({ ...fixture.analysisInputs, limits: { ...fixture.analysisInputs.limits, maxDiagnostics: 1 } });
    if (producer.status !== 'reported') throw new Error('Expected producer report');
    expect(producer.report.outcome.execution).toBe('incomplete');
    expect(producer.report.diagnostics).toContainEqual(expect.objectContaining({ code: 'missing-export' }));
    expect(producer.report.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource-limit',
      limit: { name: 'maxDiagnostics', maximum: 1, observed: 2, collectedPrefix: true } }));
    vi.mocked(openRetainedSession).mockResolvedValueOnce({ status: 'reported', report: producer.report });
    const result = await runAffectedBatch({ cwd: fixture.root, modules: [], paths: [] });
    expect(result).toMatchObject({ status: 'unavailable', reason: 'analysis-failed', exitCode: 2,
      diagnostics: producer.report.diagnostics, stages: producer.report.stages });
  }), 30_000);
});
