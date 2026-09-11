import { describe, expect, it } from 'vitest';
import { createDefaultTagRegistry } from '../../subs/model/src/registry.js';
import { ReportDraft } from '../report.js';
import { diagnostic } from '../report-data.js';

const MiB = 1024 ** 2;
function report(maximum: number, message: string) {
  const draft = new ReportDraft({ project: { cwd: '/capacity', root: '/capacity', scope: 'whole-project', configuration: 'discover' },
    registry: createDefaultTagRegistry(), capabilities: [], limits: {
      acquisition: { attempts: 1, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * MiB,
        maxInputBytes: 256 * MiB, maxApplicationBytes: 64 * MiB, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
      source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
      maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: maximum, disposeTimeoutMs: 5000, deadlineMs: 120_000,
    } });
  draft.execution = 'completed';
  draft.diagnostics.push(diagnostic('unavailable-capability', message, 'invocation'));
  return draft.finish();
}

describe('bounded large report evidence', () => {
  it('preserves evidence above 32 MiB with an explicit 96 MiB allowance', () => {
    const message = 'x'.repeat(34 * MiB);
    const old = report(32 * MiB, message);
    expect(old.diagnostics.some(item => item.limit?.name === 'maxReportBytes')).toBe(true);
    const current = report(96 * MiB, message);
    expect(current.diagnostics.some(item => item.limit?.name === 'maxReportBytes')).toBe(false);
    expect(current.diagnostics[0].message).toBe(message);
    expect(current.stages.find(stage => stage.stage === 'report')?.status).toBe('completed');
    expect(Buffer.byteLength(JSON.stringify(current))).toBeLessThan(96 * MiB);
  });

  it('still returns a bounded incomplete result when evidence exceeds 96 MiB', () => {
    const current = report(96 * MiB, 'x'.repeat(96 * MiB));
    expect(current.outcome.execution).toBe('incomplete');
    expect(current.diagnostics.some(item => item.limit?.name === 'maxReportBytes' && item.limit.maximum === 96 * MiB)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(current))).toBeLessThanOrEqual(96 * MiB);
  });
});
