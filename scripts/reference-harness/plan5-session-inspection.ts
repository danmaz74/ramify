import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { RetainedSession, SessionInputs, SessionRevision } from '../../subs/analysis/src/interfaces/session.js';
import type { SessionState } from '../../subs/analysis/src/session-revision.js';
import { retainedCompilerEvidence } from '../../subs/analysis/subs/typescript/src/retained-source-analysis.js';
import type { Assertions } from './runner.js';

/**
 * Observe private state only in the harness, without a production testing API.
 * The synchronous load hook matches one unique module URL; ordinary imports,
 * other sessions and concurrent loads cannot match it. It changes only the
 * factory's final construction to hand this test its state, and is removed
 * immediately after open, including on failure.
 */
export async function openInspectedSession(inputs: SessionInputs): Promise<{
  readonly session: RetainedSession; readonly revision: SessionRevision; readonly state: SessionState;
}> {
  const url = new URL('../../subs/analysis/src/retained-session.ts', import.meta.url);
  url.searchParams.set('plan5-inspection', randomUUID());
  const key = `ramify.plan5.session.${randomUUID()}`;
  const globals = globalThis as unknown as Record<symbol, unknown>;
  let state: SessionState | undefined;
  globals[Symbol.for(key)] = (captured: SessionState) => { state = captured; };
  const hook = registerHooks({ load(request, context, next) {
    if (request !== url.href) return next(request, context);
    const source = readFileSync(fileURLToPath(url), 'utf8');
    const anchor = 'const session = new Session(state, request.limits.acquisition);';
    if (source.split(anchor).length !== 2) throw new Error('The session inspection factory anchor changed');
    const inspected = source.replace(anchor, `${anchor}\nglobalThis[Symbol.for(${JSON.stringify(key)})](state);`);
    return { format: 'module', source: stripTypeScriptTypes(inspected, { mode: 'strip', sourceUrl: url.href }), shortCircuit: true };
  } });
  try {
    const module = await import(url.href) as typeof import('../../subs/analysis/src/retained-session.js');
    const opened = await module.openRetainedSession(inputs);
    if (opened.status !== 'opened') throw new Error(`The inspected session did not open: ${JSON.stringify(opened)}`);
    if (!state) { await opened.session.dispose(); throw new Error('The session inspection did not capture its state'); }
    return { session: opened.session, revision: opened.revision, state };
  } finally { hook.deregister(); delete globals[Symbol.for(key)]; }
}

export function compilerPid(state: SessionState): number | null {
  return state.adapter ? retainedCompilerEvidence(state.adapter).serverPid ?? null : null;
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}

/** Dispose on every exit, and assert the resources actually held in iteration 7. */
export async function disposeInspectedSession(session: RetainedSession, state: SessionState, assertions: Assertions): Promise<void> {
  let pid: number | null = null;
  try { pid = compilerPid(state); }
  finally { await session.dispose(); }
  const until = Date.now() + 5_000;
  while (pid !== null && alive(pid) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
  assertions.equal('disposal releases the observer and adapter handles', [state.observer, state.adapter], [null, null]);
  assertions.equal('disposal releases all historical versions', session.status().factBytes, 0);
  assertions.equal('disposed session cannot project a report', await session.report(), null);
  assertions.ok('the session compiler process is gone after disposal', pid === null || !alive(pid));
}
