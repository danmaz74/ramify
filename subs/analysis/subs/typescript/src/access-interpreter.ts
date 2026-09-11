import { CompilerBridge } from './bridge.js';
import { SourceFailure } from './wire.js';
import type { AccessInterpreter, SourceAnalysisInputs } from './interfaces/source.js';

/** Own finite compiler setup while leaving the captured input view caller-owned. */
export async function createAccessInterpreter(inputs: SourceAnalysisInputs): Promise<AccessInterpreter> {
  if (inputs.signal?.aborted) throw new SourceFailure('cancelled', 'Access interpretation was cancelled before startup');
  if (Object.values(inputs.limits).some(value => !Number.isSafeInteger(value) || value <= 0)) {
    throw new SourceFailure('resource-limit', 'Source work limits must be positive safe integers');
  }
  const bridge = new CompilerBridge(inputs);
  try {
    await bridge.ready();
    await bridge.prepareInterpreter();
    return Object.freeze({
      interpret: (files: readonly string[], signal?: AbortSignal) => bridge.interpret(files, signal),
      replaceDescriptions: (descriptions: Parameters<AccessInterpreter['replaceDescriptions']>[0], removed: readonly string[]) =>
        bridge.replaceDescriptions(descriptions, removed),
      dispose: () => bridge.dispose(),
    });
  } catch (error) { await bridge.dispose(); throw error; }
}
