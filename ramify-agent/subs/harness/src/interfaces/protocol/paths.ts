/** The protocol's URL prefix. A breaking change moves to `/api/v2`. */
export const apiPrefix = '/api/v1';

const plan = (planId: string): string => `${apiPrefix}/plans/${encodeURIComponent(planId)}`;
const runs = (planId: string): string => `${plan(planId)}/runs`;
const run = (planId: string, runId: string): string => `${runs(planId)}/${encodeURIComponent(runId)}`;
const runSession = (planId: string, runId: string, session: string): string => `${run(planId, runId)}/sessions/${encodeURIComponent(session)}`;
const standaloneSession = (session: string): string => `${apiPrefix}/sessions/standalone/${encodeURIComponent(session)}`;

/** The query of a CheckFinding list, each field optional. */
export type CheckFindingPathQuery = {
  readonly version?: number | undefined;
  readonly workItem?: string | undefined;
  readonly module?: string | undefined;
  readonly select?: 'attention' | 'reported' | 'all' | undefined;
  readonly order?: 'attention' | 'id' | undefined;
  readonly after?: string | undefined;
  readonly limit?: number | undefined;
};

/** A path with the given query fields, in the order given, leaving out those not set. */
function withQuery(path: string, query: Readonly<Record<string, string | number | undefined>>): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) if (value !== undefined) search.set(name, String(value));
  const text = search.toString();
  return text === '' ? path : `${path}?${text}`;
}

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
  runMergeReadiness: (planId: string, runId: string, version: number): string =>
    withQuery(`${run(planId, runId)}/merge-readiness`, { version }),
  runDecisions: (planId: string, runId: string): string => `${run(planId, runId)}/decisions`,
  runWorkItems: (planId: string, runId: string): string => `${run(planId, runId)}/work-items`,
  runWorkItem: (planId: string, runId: string, workItem: string): string => `${run(planId, runId)}/work-items/${encodeURIComponent(workItem)}`,
  runCapabilities: (planId: string, runId: string): string => `${run(planId, runId)}/capabilities`,
  /** Durable capability tasks at a committed run version, separate from registry capability progress. */
  runCapabilityTasks: (planId: string, runId: string, version: number): string =>
    withQuery(`${run(planId, runId)}/capability-tasks`, { version }),
  /** The initial analysis's module associations beside the capabilities verified at their current owners. */
  runModuleCapabilities: (planId: string, runId: string): string => `${run(planId, runId)}/module-capabilities`,
  /** Every tracked acceptance scenario with its state and the gates it ran in. */
  runScenarios: (planId: string, runId: string): string => `${run(planId, runId)}/scenarios`,
  runGate: (planId: string, runId: string, gate: string): string => `${run(planId, runId)}/gates/${encodeURIComponent(gate)}`,
  runMetrics: (planId: string, runId: string): string => `${run(planId, runId)}/metrics`,
  /** A page of the execution-map/1 snapshot at one committed run version. */
  runExecutionMap: (planId: string, runId: string, version: number, cursor?: string, limit?: number): string => {
    const query = new URLSearchParams({ version: String(version) });
    if (cursor !== undefined) query.set('cursor', cursor);
    if (limit !== undefined) query.set('limit', String(limit));
    return `${run(planId, runId)}/execution-map?${query}`;
  },
  runExecutionCapability: (planId: string, runId: string, capability: string, version: number): string =>
    `${run(planId, runId)}/execution-map/capabilities/${encodeURIComponent(capability)}?version=${version}`,
  runExecutionScenario: (planId: string, runId: string, scenario: string, version: number): string =>
    `${run(planId, runId)}/execution-map/scenarios/${encodeURIComponent(scenario)}?version=${version}`,
  /**
   * A page of a run's CheckFindings, of one work item or one module, with the
   * run's review coverage. A `version` that is not the run's is refused as stale.
   */
  runCheckFindings: (planId: string, runId: string, query: CheckFindingPathQuery = {}): string =>
    withQuery(`${run(planId, runId)}/check-findings`, query),
  /** The unsettled CheckFindings of every module they concern. */
  runCheckFindingModules: (planId: string, runId: string, version?: number): string =>
    withQuery(`${run(planId, runId)}/check-findings/modules`, { version }),
  /** One CheckFinding with its history and links. */
  runCheckFinding: (planId: string, runId: string, checkFinding: string, version?: number): string =>
    withQuery(`${run(planId, runId)}/check-findings/${encodeURIComponent(checkFinding)}`, { version }),
  /** A run's review requests, of one work item when named, with their attempts and coverage. */
  runReviews: (planId: string, runId: string, query: { readonly version?: number | undefined; readonly workItem?: string | undefined; readonly after?: string | undefined; readonly limit?: number | undefined } = {}): string =>
    withQuery(`${run(planId, runId)}/reviews`, query),
  /** Every session of the project, a page of at most 200 from `offset`. */
  sessions: (offset = 0): string => `${apiPrefix}/sessions?offset=${offset}`,
  /** A run's sessions, with their invocations, lineage and the diagram elements each reaches. */
  runSessions: (planId: string, runId: string): string => `${run(planId, runId)}/sessions`,
  runSession: (planId: string, runId: string, session: string): string => runSession(planId, runId, session),
  /** The entries of one of a run's sessions after entry `after`. */
  runSessionTranscript: (planId: string, runId: string, session: string, after: number): string =>
    `${runSession(planId, runId, session)}/transcript?after=${after}`,
  /** A poll of one run: the sessions changed after run version `version`, and the entries of each followed session after its cursor. */
  runSessionUpdates: (planId: string, runId: string, version: number, cursors: ReadonlyArray<{ readonly session: string; readonly after: number }>): string =>
    `${run(planId, runId)}/sessions/updates?version=${version}&cursors=${encodeURIComponent(cursors.map(cursor => `${cursor.session}:${cursor.after}`).join(','))}`,
  /** A body of the run's content store, by its hash. */
  runBody: (planId: string, runId: string, hash: string): string => `${run(planId, runId)}/bodies/${encodeURIComponent(hash)}`,
  /** A file one of the run's session transcripts names, by its path relative to the run's directory. */
  runSessionFile: (planId: string, runId: string, session: string, path: string): string =>
    `${runSession(planId, runId, session)}/files?path=${encodeURIComponent(path)}`,
  /** One standalone session: its summary, prompt, outcome and evaluation. */
  standaloneSession,
  standaloneTranscript: (session: string, after: number): string => `${standaloneSession(session)}/transcript?after=${after}`,
  standaloneBody: (session: string, hash: string): string => `${standaloneSession(session)}/bodies/${encodeURIComponent(hash)}`,
  /** A file the standalone session's transcript names, by its path relative to the session's directory. */
  standaloneFile: (session: string, path: string): string => `${standaloneSession(session)}/files?path=${encodeURIComponent(path)}`,
} as const;
