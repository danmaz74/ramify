import type { AnalysisInputs, AnalysisRun, RunControl } from './interfaces/analysis.js';
import { createAnalysisSession } from './session.js';

/** Direct service binding: every invocation creates and releases a real session. */
export async function analyzeProject(inputs: AnalysisInputs, control: RunControl = {}): Promise<AnalysisRun> {
  const session = createAnalysisSession(inputs);
  try { return await session.analyze(control); }
  finally { await session.dispose(); }
}
