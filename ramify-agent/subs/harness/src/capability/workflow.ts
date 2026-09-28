/** The internal composition key. A test helper supplies this factory to the
 * real service. No public command accepts a workflow or a policy version. */
export interface CapabilityWorkflow {
  readonly version: 'capability-coordination/1';
}

export function createCapabilityWorkflow(): CapabilityWorkflow {
  return { version: 'capability-coordination/1' };
}
