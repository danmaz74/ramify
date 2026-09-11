import { channel } from 'node:diagnostics_channel';
import type { IncrementInputs, IncrementRun, RunControl } from './interfaces/analysis.js';
import { detached } from './report-data.js';
import { createRetainedWork, finishRetained, changedInputs } from './retained-products.js';
import { createRetainedSession } from './session.js';

const incrementEvents = channel('ramify.analysis.increment');

export async function analyzeIncrement(request: IncrementInputs, control: RunControl = {}): Promise<IncrementRun> {
  const inputs = detached(request.inputs), work = createRetainedWork(request.previous, request.changes);
  const session = createRetainedSession(inputs, work);
  try {
    const run = await session.analyze(control);
    if (run.status === 'cancelled') return run;
    const changed = changedInputs(work.previous, work.sealed ?? run.report.snapshot?.inputs ?? []);
    const result = Object.freeze({ ...run, retained: finishRetained(work, run.report, inputs), reused: Object.freeze([...work.reused]),
      changed: changed === null ? null : Object.freeze(changed) });
    if (incrementEvents.hasSubscribers) incrementEvents.publish({ status: run.status, execution: run.report.outcome.execution,
      inputId: result.retained?.inputId ?? null, reused: result.reused });
    return result;
  } finally { await session.dispose(); }
}
