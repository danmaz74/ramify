import type { AnalysisDriver } from '../../subs/daemon/subs/contexts/src/interfaces/contexts.js';
import type { RetainedSession, SessionUpdate } from '../../subs/analysis/src/interfaces/session.js';

/** Fault injection surrounds actual session operations; no replacement engine. */
export function interceptSessionOperations(driver: AnalysisDriver, intercept: (
  run: () => Promise<SessionUpdate | { readonly status: 'unchanged' }>, session: RetainedSession,
) => Promise<SessionUpdate | { readonly status: 'unchanged' }>): AnalysisDriver {
  return { ...driver, async open(project, setup, control) {
    const opened = await driver.open(project, setup, control);
    if (opened.status !== 'opened') return opened;
    const session = opened.session;
    // The production handle is frozen. A separate port preserves its property
    // invariants and keeps the original receiver for every forwarded operation.
    const wrapped: RetainedSession = {
      get current() { return session.current; },
      async update(...args) {
        const result = await intercept(() => session.update(...args), session);
        if (result.status === 'unchanged') throw new Error('An update cannot return unchanged');
        return result;
      },
      sweep: (...args) => intercept(() => session.sweep(...args), session),
      verify: session.verify.bind(session),
      report: session.report.bind(session),
      releaseRevision: session.releaseRevision.bind(session),
      status: session.status.bind(session),
      releaseCompiler: session.releaseCompiler.bind(session),
      dispose: session.dispose.bind(session),
    };
    return { ...opened, session: wrapped };
  } };
}
