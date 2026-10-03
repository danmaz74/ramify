import type { AnalysisDriver } from '../context-types.js';
import type { AnalysisReport } from '../../../analysis/src/interfaces/analysis.js';
import type { SessionMeasurements } from '../../../analysis/src/interfaces/measurements.js';
import type { RetainedSession, SessionRevision } from '../../../analysis/src/interfaces/session.js';
import type { RunControl } from '../../../analysis/src/interfaces/analysis.js';
import type { AffectedQuery, SessionAffectedOutcome } from '../../../analysis/src/interfaces/affected.js';

/** Minimal retained-session provider for parent-owner measure protocol tests. */
export function createMeasureDriver(facts: Omit<SessionMeasurements, 'sequence' | 'inputId'>,
  apiFailure = false, hooks: { readonly apiView?: () => void;
    readonly affected?: (query: AffectedQuery, control?: RunControl) => Promise<SessionAffectedOutcome> } = {}): AnalysisDriver {
  const inputId = `input/1:${'a'.repeat(64)}`;
  const revision: SessionRevision = { sequence: 1, inputId,
    inputs: [{ path: 'src/index.ts', role: 'source', sha256: 'b'.repeat(64), bytes: 1 }], changed: ['src/index.ts'],
    checked: { path: 'cold', files: ['src/index.ts'], accesses: 0, modelRebuilt: true },
    outcome: { execution: 'completed', check: 'passed', coverage: 'complete' },
    summary: { complete: true, owners: facts.modules.length, sourceFiles: facts.files.filter(file => file.kind === 'source').length,
      resources: facts.files.filter(file => file.kind === 'resource').length, originals: 0, accesses: 0, allowed: 0,
      denied: 0, errors: 0, warnings: 0, coverageNotes: 0, external: 0 },
    diagnostics: [], warnings: [], coverage: [], delta: { added: [], removed: [], positionOnly: [] },
    timings: { classify: 0, inventory: 0, compiler: 0, descriptions: 0, accesses: 0, link: 0, decide: 0, companions: 0, publish: 0, total: 0 } };
  const report = { schemaVersion: 'ramify.analysis/2', inputId, outcome: revision.outcome, summary: revision.summary,
    diagnostics: [], warnings: [], coverage: [] } as unknown as AnalysisReport;
  let disposed = false;
  return {
    async resolve(request) { return { status: 'resolved', root: request.root ?? request.cwd, selection: request.root ? 'given' : 'found',
      invokedFrom: request.cwd, configuration: 'tsconfig.json' }; },
    async open() {
      const session: RetainedSession = {
        get current() { return disposed ? null : revision; },
        async update(_changes, control) { return control?.signal?.aborted ? { status: 'cancelled' }
          : { status: 'revised', revision, identical: true, reacquired: false }; },
        async sweep(control) { return control?.signal?.aborted ? { status: 'cancelled' } : { status: 'unchanged' }; },
        async verify(control) { return control?.signal?.aborted ? { status: 'cancelled' }
          : { status: 'equal', sequence: 1, elapsedMs: 0 }; },
        async report() { return report; }, async releaseRevision() {},
        status() { return { level: 'hot', sequence: 1, observedInputs: 1, factBytes: 1,
          worker: { heapUsed: 1, rss: 1 }, compiler: { pid: 1, rss: 1 }, lastSweepAt: null }; },
        async releaseCompiler() {},
        async apiView(query, control) {
          if (control?.signal?.aborted) return { status: 'cancelled' };
          if (apiFailure) return { status: 'unavailable', reason: 'resource-limit', message: 'scripted render input limit' };
          hooks.apiView?.();
          return { status: 'projected', projection: { schema: 'ramify.api-view-projection/1', sequence: query.sequence, inputId,
            modules: facts.modules.map(module => ({ module: module.id, directory: module.dir,
              ordinary: { area: 'ordinary' as const, root: module.dir ? `${module.dir}/src` : 'src', files: [], coverage: 0,
                detailsUnavailable: 0, truncated: 0 }, tests: null })), bytes: 0 } };
        },
        async architectView() { return { status: 'unavailable', reason: 'analysis-failed', message: 'not used' }; },
        async measurements(sequence, control) { return control?.signal?.aborted ? { status: 'cancelled' }
          : { status: 'measured', measurements: { ...facts, sequence, inputId } }; },
        async explorerDetails() { return { status: 'unavailable', reason: 'analysis-failed', message: 'not used' }; },
        async affected(query, control) {
          if (hooks.affected) return hooks.affected(query, control);
          return { status: 'unavailable', reason: 'missing-facts', message: 'not used', unknownModules: [] };
        },
        async dispose() { disposed = true; },
      };
      return { status: 'opened', session, revision };
    },
    async dispose() { disposed = true; },
  };
}
