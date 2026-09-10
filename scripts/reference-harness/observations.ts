import { AsyncLocalStorage } from 'node:async_hooks';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';

export interface Observation { readonly kind: string; readonly data: unknown }
const recording = new AsyncLocalStorage<Observation[]>();

/** Run-local evidence only. No compiler objects, caches or cross-run retention. */
export function recordObservation(kind: string, data: unknown): void {
  const destination = recording.getStore();
  if (destination) destination.push({ kind, data: JSON.parse(JSON.stringify(data)) });
}

export async function captureObservations<T>(run: () => Promise<T>): Promise<{ value: T; observations: readonly Observation[] }> {
  const observations: Observation[] = [];
  const value = await recording.run(observations, run);
  return { value, observations };
}

export function analysisEvidence(report: AnalysisReport) {
  return { schemaVersion: report.schemaVersion, runId: report.runId, inputId: report.inputId,
    request: report.request, scope: report.scope, capabilities: report.capabilities,
    stages: report.stages, outcome: report.outcome, summary: report.summary,
    diagnostics: report.diagnostics, warnings: report.warnings, coverage: report.coverage };
}
