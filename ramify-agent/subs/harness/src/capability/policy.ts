import type { RunPolicy } from '../run/records.js';

/** The version reserved for capability workflow runs. Production continues
 * capturing run-policy/4 until the replacement workflow is enabled. */
export const capabilityRunPolicyVersion = 'run-policy/5';

export interface CapabilityLimits {
  readonly maxAssignments: number;
  readonly maxWorkUnits: number;
  readonly maxInvocations: number;
}

/** Capture limits in the task record at delegation. A task never reads live
 * defaults, and owner changes, repairs and reconstruction cannot reset them. */
export function captureCapabilityLimits(policy: RunPolicy): CapabilityLimits {
  if (policy.version !== capabilityRunPolicyVersion || policy.limits.maxIterationsPerCapabilityTask === undefined) {
    throw new Error('Capability coordination requires a captured run-policy/5 task limit');
  }
  return {
    maxAssignments: policy.limits.maxIterationsPerCapabilityTask,
    maxWorkUnits: policy.limits.maxWorkItems,
    maxInvocations: policy.limits.maxInvocationsPerRun,
  };
}

/** The first capability policy uses the existing per-work-item assignment
 * limit as its default, while recording the distinct task limit explicitly. */
export function capabilityPolicyFrom(previous: RunPolicy): RunPolicy {
  return {
    ...previous,
    version: capabilityRunPolicyVersion,
    limits: { ...previous.limits, maxIterationsPerCapabilityTask: previous.limits.maxIterationsPerWorkItem },
  };
}

export function canStartInvocation(committedInvocations: number, limits: CapabilityLimits): boolean {
  return committedInvocations < limits.maxInvocations;
}
