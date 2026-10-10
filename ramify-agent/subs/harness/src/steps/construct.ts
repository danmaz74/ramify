import type { ConstructedStepCommon } from './constructed.js';
import { constructEngineerStep, type StepEnvironment } from './engineer.js';
import { validateStepInputs } from './inputs.js';
import { constructOrientationStep, constructSelectorStep, constructWorkTurnStep } from './local-architect.js';
import { constructDesignOrientationStep, constructReviewStep } from './reviewer.js';

/** Builds the step its inputs describe, by role and variant. The inputs are validated first; nothing is read or written. */
export function constructStep(value: unknown, environment: StepEnvironment): ConstructedStepCommon {
  const inputs = validateStepInputs(value);
  switch (inputs.role) {
    case 'engineer': return constructEngineerStep(inputs, environment);
    case 'local-architect': return inputs.phase === 'orientation' ? constructOrientationStep(inputs, environment) : constructWorkTurnStep(inputs, environment);
    case 'context-selector': return constructSelectorStep(inputs, environment);
    case 'reviewer': return inputs.question === 'design-orientation' ? constructDesignOrientationStep(inputs, environment) : constructReviewStep(inputs, environment);
  }
}

/**
 * The fresh start the run falls back to where the session a step continues
 * or forks is unavailable, with the reason recorded as its degradation: the
 * complete fresh briefing of the same inputs. An engineer's fallback keeps
 * its construction, as the run does; a fresh step has none.
 */
export function freshFallback(value: unknown, reason: string): Exclude<ReturnType<typeof validateStepInputs>, { role: 'engineer' }> | null {
  const inputs = validateStepInputs(value);
  if (inputs.role === 'engineer' || inputs.start.kind === 'fresh') return null;
  const { provenance: _provenance, ...fields } = inputs;
  const degraded = (requested: 'fork' | 'continued') => ({ kind: 'fresh', degraded: { requested, reason } });
  const fallback = inputs.role === 'local-architect' ? { ...fields, start: degraded('continued') }
    : { ...fields, start: degraded('fork') };
  const fresh = validateStepInputs({ ...fallback, ...(inputs.provenance === undefined ? {} : { provenance: inputs.provenance }) });
  if (fresh.role === 'engineer') throw new Error('unreachable');
  return fresh;
}
