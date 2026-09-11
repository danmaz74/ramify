import type { AnalysisReport } from '../../../../../analysis/src/interfaces/analysis.js';

/** A plain report for storage tests; it claims no analysis execution. */
export function historyReport(runId = 'run/1:history'): AnalysisReport {
  return {
    schemaVersion: 'ramify.analysis/1', runId, inputId: null,
    request: {
      project: { cwd: '/fixture', scope: 'whole-project', configuration: 'discover' },
      registry: { id: 'registry/1:history-fixture', definitions: [], isDefault: false }, capabilities: [],
      limits: {
        acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000, maxFileBytes: 8 * 1024 ** 2,
          maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2, maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 },
        source: { maxExports: 250_000, maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
        maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 32 * 1024 ** 2, disposeTimeoutMs: 5000, deadlineMs: 120_000,
      },
    },
    scope: null, registry: null, capabilities: [], stages: [], snapshot: null,
    outcome: { execution: 'unavailable', check: 'not-run', coverage: 'not-run' },
    diagnostics: [], warnings: [], coverage: [],
    summary: { complete: false, owners: 0, sourceFiles: 0, resources: 0, originals: 0,
      accesses: 0, allowed: 0, denied: 0, errors: 0, warnings: 0, coverageNotes: 0, external: 0 },
  };
}
