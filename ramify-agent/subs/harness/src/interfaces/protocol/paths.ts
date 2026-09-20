/** The protocol's URL prefix. A breaking change moves to `/api/v2`. */
export const apiPrefix = '/api/v1';

const plan = (planId: string): string => `${apiPrefix}/plans/${encodeURIComponent(planId)}`;
const job = (planId: string, jobId: string): string => `${plan(planId)}/jobs/${encodeURIComponent(jobId)}`;

/** The paths of the queries and commands, relative to the server's origin. */
export const protocolPaths = {
  project: `${apiPrefix}/project`,
  /** The project's module tree, as the architect view last materialized it. */
  modules: `${apiPrefix}/project/modules`,
  plans: `${apiPrefix}/plans`,
  plan,
  jobs: (planId: string): string => `${plan(planId)}/jobs`,
  job,
  /** The events after `after`, which defaults to 0. */
  events: (planId: string, jobId: string, after = 0): string => `${job(planId, jobId)}/events?after=${after}`,
  /** The plan's saved map revisions, newest first. */
  maps: (planId: string): string => `${plan(planId)}/maps`,
  /** One saved map revision with its approval. */
  map: (planId: string, revision: number): string => `${plan(planId)}/maps/${revision}`,
  commands: `${apiPrefix}/commands`,
} as const;
