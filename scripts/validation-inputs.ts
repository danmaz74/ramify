import { resolve } from 'node:path';
import { createDefaultTagRegistry } from '../subs/analysis/subs/model/src/index.js';
import type { AnalysisInputs } from '../subs/analysis/src/validation-entry.js';

/**
 * Whole-project validation inputs for a project root: the default registry,
 * every capability through exposure linking and the reviewed capacity.
 * `validate-final-contracts.ts` validates the toolkit with them, and the
 * reference harness's linking cases receive them from here.
 */
export function validationInputs(root: string): AnalysisInputs {
  root = resolve(root);
  return { project: { root, cwd: root, scope: 'whole-project', configuration: 'discover' },
    registry: createDefaultTagRegistry(), capabilities: ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking'],
    limits: { acquisition: { attempts: 3, maxFiles: 50_000, maxApplicationFiles: 20_000,
      maxFileBytes: 8 * 1024 ** 2, maxInputBytes: 256 * 1024 ** 2, maxApplicationBytes: 64 * 1024 ** 2,
      maxOwners: 1000, maxDepth: 128, deadlineMs: 30_000 }, source: { maxExports: 250_000,
      maxAccesses: 250_000, maxSelections: 1_000_000, maxForwardingDepth: 256, deadlineMs: 90_000 },
    // Match the reviewed dispatch capacity when comparing direct API and CLI reports.
    maxExposurePairs: 1_000_000, maxDiagnostics: 100_000, maxReportBytes: 96 * 1024 ** 2,
    disposeTimeoutMs: 5000, deadlineMs: 120_000 } };
}
