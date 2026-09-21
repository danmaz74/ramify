/** The protocol's URL prefix. A breaking change moves to `/api/v2`. */
export const apiPrefix = '/api/v1';

const plan = (planId: string): string => `${apiPrefix}/plans/${encodeURIComponent(planId)}`;
const runs = (planId: string): string => `${plan(planId)}/runs`;
const run = (planId: string, runId: string): string => `${runs(planId)}/${encodeURIComponent(runId)}`;

/** The paths of the queries and of the command endpoint, relative to the server's origin. */
export const protocolPaths = {
  project: `${apiPrefix}/project`,
  /** The project's module tree, as the architect view last materialized it. */
  modules: `${apiPrefix}/project/modules`,
  plans: `${apiPrefix}/plans`,
  plan,
  /** `POST`: every command, answered `202` with its receipt. */
  commands: `${apiPrefix}/commands`,
  runs,
  run,
  runEvents: (planId: string, runId: string, after: number): string => `${run(planId, runId)}/events?after=${after}`,
  runAnalysis: (planId: string, runId: string): string => `${run(planId, runId)}/analysis`,
  runDecisions: (planId: string, runId: string): string => `${run(planId, runId)}/decisions`,
  runWorkItems: (planId: string, runId: string): string => `${run(planId, runId)}/work-items`,
  runWorkItem: (planId: string, runId: string, workItem: string): string => `${run(planId, runId)}/work-items/${encodeURIComponent(workItem)}`,
  runCapabilities: (planId: string, runId: string): string => `${run(planId, runId)}/capabilities`,
  /** The initial analysis's module associations beside the capabilities verified at their current owners. */
  runModuleCapabilities: (planId: string, runId: string): string => `${run(planId, runId)}/module-capabilities`,
  runGate: (planId: string, runId: string, gate: string): string => `${run(planId, runId)}/gates/${encodeURIComponent(gate)}`,
  runMetrics: (planId: string, runId: string): string => `${run(planId, runId)}/metrics`,
} as const;
