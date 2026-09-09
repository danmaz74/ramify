import { CompilerBridge } from './bridge.js';
import { SourceFailure } from './wire.js';
import type { SourceAnalysis, SourceAnalysisInputs } from './interfaces/source.js';

/** Own one compiler lifetime; the supplied captured view remains caller-owned. */
export async function createSourceAnalysis(inputs: SourceAnalysisInputs): Promise<SourceAnalysis> {
  if (inputs.signal?.aborted) throw new SourceFailure('cancelled', 'Source analysis was cancelled before startup');
  if (Object.values(inputs.limits).some(value => !Number.isSafeInteger(value) || value <= 0)) {
    throw new SourceFailure('resource-limit', 'Source work limits must be positive safe integers');
  }
  const bridge = new CompilerBridge(inputs);
  try {
    await bridge.ready();
    return Object.freeze({
      catalog: (signal?: AbortSignal) => bridge.catalog(signal),
      dispose: () => bridge.dispose(),
    });
  } catch (error) { await bridge.dispose(); throw error; }
}
