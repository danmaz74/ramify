import { describe, expect, it } from 'vitest';
import { diagnostic, projectDiagnostics } from '../report-data.js';
import { AcquisitionFailure, failureReport } from '../session-revision.js';
import type { SessionState } from '../session-revision.js';
import { ReportDraft, WorkLimit } from '../report.js';
import { withRecoverySmall } from './recovery-fixtures.js';

describe('analysis current failure evidence', () => {
  it('FR05 FR09 converts all acquisition records with actual spans and no fabricated locations', () => {
    const span = { start: 8, end: 12, line: 2, column: 3 };
    const produced = projectDiagnostics(null, [
      { code: 'read-failure', path: 'tsconfig.json', message: 'Cannot read configuration' },
      { code: 'invalid-layout', path: 'module.ramify', message: 'Conflicting nested trees', span },
    ], new Map());
    expect(produced).toMatchObject([
      { code: 'read-failure', location: null, related: [], message: 'tsconfig.json: Cannot read configuration' },
      { code: 'invalid-layout', location: { file: 'module.ramify', ...span }, related: [] },
    ]);
    expect(new Set(produced.map(item => item.id)).size).toBe(2);
  });

  it.each(['invalid', 'incomplete', 'unavailable'] as const)('FR09 FR10 retains acquisition %s evidence and execution', execution => withRecoverySmall(async fixture => {
    const location = { file: 'module.ramify', start: 8, end: 12, line: 2, column: 3 };
    const related = { file: 'subs/provider/module.ramify', start: 9, end: 18, line: 2, column: 1 };
    const records = [diagnostic('invalid-layout', 'First issue', 'layout', [location, related]),
      diagnostic('read-failure', 'Second issue', 'acquisition')];
    const state: SessionState = { request: fixture.analysisInputs, project: fixture.analysisInputs.project,
      registry: fixture.analysisInputs.registry, parsed: new Map(), stale: true, observer: null, adapter: null,
      adapterAreas: null, facts: null, limits: { updateDeadlineMs: 2000, sweepIntervalMs: 30_000, maxRetainedFactBytes: 96 * 1024 ** 2 } };
    const result = failureReport(state, new AcquisitionFailure(records, execution), 'acquisition');
    expect(result.outcome.execution).toBe(execution);
    expect(result.diagnostics).toEqual(expect.arrayContaining(records));
    expect(result.diagnostics).toHaveLength(2);
    expect(result.stages.find(item => item.stage === 'acquisition')).toEqual({ stage: 'acquisition',
      status: execution === 'incomplete' ? 'failed' : execution, blockedBy: [], diagnosticIds: records.map(item => item.id) });
    expect(result.scope).toBeNull(); expect(result.inputId).toBeNull();
  }));

  it('FR10 a bare failure path supplies context without inventing a source span', () => withRecoverySmall(async fixture => {
    const draft = new ReportDraft(fixture.analysisInputs);
    draft.failure(Object.assign(new Error('Input changed during capture'), { code: 'changed-input', path: 'src/use.ts' }), 'acquisition');
    const result = draft.finish();
    expect(result.outcome.execution).toBe('incomplete');
    expect(result.diagnostics).toMatchObject([{ code: 'changed-input', message: 'src/use.ts: Input changed during capture', location: null, related: [] }]);
  }));

  it('FR11 preserves admitted diagnostics, explicit producer truncation and failed stages', () => withRecoverySmall(async fixture => {
    const draft = new ReportDraft({ ...fixture.analysisInputs, limits: { ...fixture.analysisInputs.limits, maxDiagnostics: 1 } });
    const first = diagnostic('missing-export', 'First export absent', 'missing-export', [
      { file: 'module.ramify', start: 12, end: 17, line: 2, column: 4 },
      { file: 'src/api.ts', start: 0, end: 9, line: 1, column: 1 },
    ]);
    draft.record([first]);
    try { draft.record([diagnostic('missing-export', 'Second export absent', 'missing-export')]); }
    catch (error) { expect(error).toBeInstanceOf(WorkLimit); draft.failure(error, 'link'); }
    const result = draft.finish();
    expect(result.outcome.execution).toBe('incomplete');
    expect(result.diagnostics).toContainEqual(first);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'resource-limit', category: 'limit',
      limit: { name: 'maxDiagnostics', maximum: 1, observed: 2, collectedPrefix: true } }));
    expect(result.stages.find(item => item.stage === 'link')?.status).toBe('failed');
  }));
});
