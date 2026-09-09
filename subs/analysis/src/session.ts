import type { AnalysisInputs, AnalysisRun, AnalysisSession, RunControl } from './interfaces/analysis.js';
import { detached, diagnostic } from './report-data.js';
import { ReportDraft } from './report.js';
import { runAnalysis } from './run-analysis.js';

/** Construction captures only plain request data; the single analyze call owns all I/O. */
export function createAnalysisSession(inputs: AnalysisInputs): AnalysisSession {
  const request = detached(inputs);
  let used = false;
  let disposed = false;
  let pending: Promise<AnalysisRun> | undefined;
  let disposal: Promise<void> | undefined;
  const abort = new AbortController();
  return Object.freeze({
    analyze(control: RunControl = {}): Promise<AnalysisRun> {
      if (used || disposed) {
        const draft = new ReportDraft(request);
        const item = diagnostic(disposed ? 'session-disposed' : 'session-used', disposed
          ? 'Analysis session is disposed' : 'Analysis session admits only one analyze call', 'execution');
        draft.diagnostics.push(item); draft.stage('acquisition', 'failed', [item]);
        return Promise.resolve({ status: 'reported', report: draft.finish() });
      }
      used = true;
      const cancel = (): void => abort.abort();
      control.signal?.addEventListener('abort', cancel, { once: true });
      if (control.signal?.aborted) cancel();
      pending = runAnalysis(request, abort.signal).finally(() => {
        control.signal?.removeEventListener('abort', cancel); pending = undefined;
      });
      return pending;
    },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      disposed = true; abort.abort();
      disposal = pending ? pending.then(() => undefined) : Promise.resolve();
      return disposal;
    },
  });
}
