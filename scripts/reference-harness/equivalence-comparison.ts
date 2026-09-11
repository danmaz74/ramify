import assert from 'node:assert/strict';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';

/** JSON document comparison: object key order is irrelevant; array order is not. */
export function firstDifference(left: unknown, right: unknown, path = '$'): string | null {
  if (Object.is(left, right)) return null;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return path;
  if (Array.isArray(left) !== Array.isArray(right)) return path;
  if (Array.isArray(left) && Array.isArray(right)) {
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      const difference = firstDifference(left[i], right[i], `${path}[${i}]`);
      if (difference) return difference;
    }
    return left.length === right.length ? null : `${path}.length`;
  }
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const child = /^[a-zA-Z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
    if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) return child;
    const difference = firstDifference(a[key], b[key], child);
    if (difference) return difference;
  }
  return null;
}

export function parseAnalysisDocument(text: string): AnalysisReport {
  const report = JSON.parse(text) as AnalysisReport;
  assert.equal(report?.schemaVersion, 'ramify.analysis/1', 'Expected the bare analysis document');
  assert.equal(typeof report.runId, 'string', 'Missing runId');
  assert.deepEqual(Object.keys(report).sort(), ['schemaVersion', 'runId', 'inputId', 'request', 'scope', 'registry',
    'stages', 'capabilities', 'outcome', 'snapshot', 'diagnostics', 'warnings', 'coverage', 'summary'].sort(),
  'Expected exactly the Plan 1 report members');
  return report;
}

/** Only top-level runId is replaced. In particular, inputId and paths survive. */
export function assertEquivalentReports(batch: AnalysisReport, resident: AnalysisReport): void {
  const difference = firstDifference({ ...batch, runId: 'comparison' }, { ...resident, runId: 'comparison' });
  assert.equal(difference, null, `Batch/resident reports differ at ${difference}`);
}
