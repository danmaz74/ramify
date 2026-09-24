import type { z } from 'zod';
import {
  checkFindingDetailSchema, checkFindingListResponseSchema, checkFindingModuleCountsSchema, reviewListResponseSchema,
  type CheckFindingDetail, type CheckFindingListResponse, type CheckFindingModuleCounts, type ReviewListResponse,
} from '../../harness/src/interfaces/protocol/check-findings.js';
import { errorResponseSchema, type ErrorCode } from '../../harness/src/interfaces/protocol/errors.js';
import { executionCapabilityDetailSchema, executionMapPageSchema, executionScenarioDetailSchema,
  type ExecutionCapabilityDetail, type ExecutionScenarioDetail } from '../../harness/src/interfaces/protocol/execution-map.js';
import { moduleTreeResponseSchema, type ModuleTree } from '../../harness/src/interfaces/protocol/evidence.js';
import { commandResponseSchema, type Receipt } from '../../harness/src/interfaces/protocol/jobs.js';
import { protocolPaths, type CheckFindingPathQuery } from '../../harness/src/interfaces/protocol/paths.js';
import {
  planListResponseSchema,
  planResponseSchema,
  projectResponseSchema,
  type PlanDocument,
  type PlanEntry,
  type ProjectResponse,
} from '../../harness/src/interfaces/protocol/queries.js';
import {
  analysisResponseSchema, capabilityListResponseSchema, decisionListResponseSchema, gateResponseSchema,
  metricsResponseSchema, moduleCapabilityComparisonResponseSchema, runEventPageSchema, runListResponseSchema, runResponseSchema,
  scenarioListResponseSchema, workItemListResponseSchema, workItemResponseSchema,
  type AnalysisResponse, type CapabilityListResponse, type DecisionListResponse, type GateView,
  type MetricsResponse, type ModuleCapabilityComparisonResponse, type RunCommandInput, type RunEventPage, type RunListResponse, type RunSnapshot,
  type ScenarioListResponse, type WorkItemListResponse, type WorkItemResponse,
} from '../../harness/src/interfaces/protocol/runs.js';
import {
  runSessionResponseSchema, runSessionsResponseSchema, sessionBodyResponseSchema, sessionListResponseSchema, sessionTranscriptResponseSchema,
  sessionUpdatesResponseSchema, standaloneSessionResponseSchema,
  type RunSessionResponse, type RunSessionsResponse, type SessionBodyResponse, type SessionCursor, type SessionListResponse, type SessionRef,
  type SessionTranscriptResponse, type SessionUpdatesResponse, type StandaloneSessionResponse,
} from '../../harness/src/interfaces/protocol/sessions.js';
import type { TranscriptBody } from '../../harness/src/interfaces/protocol/transcripts.js';
import { loadExecutionMapPages, type ExecutionMapSnapshot } from './execution-map-client.js';

export type ProjectInfo = ProjectResponse['project'];

/**
 * Whether the harness answered the last request. It is independent of what
 * the answer said: a `not-found` error still means `connected`.
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

/** Why a request failed: the harness's error, no answer, or an answer outside the protocol. */
export class ClientError extends Error {
  constructor(
    readonly kind: 'protocol' | 'connection' | 'invalid-response',
    message: string,
    readonly code?: ErrorCode,
    /** The run's version, on a `stale-version` rejection. */
    readonly currentVersion?: number,
    /** What establishes the failure, such as a record's path and the schema it declares. */
    readonly evidence?: readonly string[],
  ) {
    super(message);
    this.name = 'ClientError';
  }
}

/** Everything the web client asks of the harness. */
export interface ProtocolClient {
  getProject(): Promise<ProjectInfo>;
  listPlans(): Promise<PlanEntry[]>;
  getPlan(planId: string): Promise<PlanDocument>;
  /** The project's module tree, as the architect view was last materialized. */
  getModuleTree(): Promise<ModuleTree>;
  /** A plan's runs, newest first, the agent runs start with, and run directories not served. */
  listRuns(planId: string): Promise<RunListResponse>;
  getRun(planId: string, runId: string): Promise<RunSnapshot>;
  /** The run's snapshot and its projected events after the cursor. */
  getEvents(planId: string, runId: string, after: number): Promise<RunEventPage>;
  getAnalysis(planId: string, runId: string): Promise<AnalysisResponse>;
  getDecisions(planId: string, runId: string): Promise<DecisionListResponse>;
  getWorkItems(planId: string, runId: string): Promise<WorkItemListResponse>;
  getWorkItem(planId: string, runId: string, workItem: string): Promise<WorkItemResponse>;
  getCapabilities(planId: string, runId: string): Promise<CapabilityListResponse>;
  /** The initial analysis's module associations beside the capabilities verified at their current owners. */
  getModuleCapabilities(planId: string, runId: string): Promise<ModuleCapabilityComparisonResponse>;
  /** Every tracked acceptance scenario with its state and the gates that ran it. */
  getScenarios(planId: string, runId: string): Promise<ScenarioListResponse>;
  /** All three execution censuses from one coherent version; a disconnected read retains the last complete map as stale. */
  getExecutionMap(planId: string, runId: string): Promise<ExecutionMapSnapshot>;
  getExecutionCapability(planId: string, runId: string, capability: string, version: number): Promise<ExecutionCapabilityDetail>;
  getExecutionScenario(planId: string, runId: string, scenario: string, version: number): Promise<ExecutionScenarioDetail>;
  getGate(planId: string, runId: string, gate: string): Promise<GateView>;
  /** A page of the run's CheckFindings, of one work item or module, with its review coverage. */
  getCheckFindings(planId: string, runId: string, query: CheckFindingPathQuery): Promise<CheckFindingListResponse>;
  /** One CheckFinding with its history and what it links to. */
  getCheckFinding(planId: string, runId: string, checkFinding: string): Promise<CheckFindingDetail>;
  /** The unsettled CheckFindings of every module they concern. */
  getCheckFindingModules(planId: string, runId: string): Promise<CheckFindingModuleCounts>;
  /** The run's review requests, of one work item when named, with their coverage. */
  getReviews(planId: string, runId: string, workItem?: string): Promise<ReviewListResponse>;
  getMetrics(planId: string, runId: string): Promise<MetricsResponse>;
  /** Every session of the project, live and suspended first; a page of at most 200 from `offset`. */
  listSessions(offset?: number): Promise<SessionListResponse>;
  /** One standalone session: its summary, prompt, outcome and evaluation. */
  getStandaloneSession(session: string): Promise<StandaloneSessionResponse>;
  /** A run's sessions, with their invocations, lineage and the diagram elements each reaches. */
  getRunSessions(planId: string, runId: string): Promise<RunSessionsResponse>;
  /** One run session independent of the bounded run-session list. */
  getRunSession(planId: string, runId: string, session: string): Promise<RunSessionResponse>;
  /** A session's transcript entries after entry `after`. */
  getTranscript(session: SessionRef, after: number): Promise<SessionTranscriptResponse>;
  /** One poll of a run: the sessions changed after `version`, and each followed session's entries after its cursor. */
  pollSessions(planId: string, runId: string, version: number, cursors: readonly SessionCursor[]): Promise<SessionUpdatesResponse>;
  /** A block's body: an inline one as it is, a stored one or a file the transcript names from the harness. */
  getBody(session: SessionRef, body: TranscriptBody): Promise<SessionBodyResponse>;
  /**
   * Sends a command and returns its receipt. When the harness does not
   * answer, the identical command is sent again, which is safe: a retry
   * returns the original receipt.
   */
  sendCommand(command: RunCommandInput): Promise<Receipt>;
  connection(): ConnectionState;
  /** Calls `listener` on every change of connection state; returns the unsubscribe. */
  onConnectionChange(listener: (state: ConnectionState) => void): () => void;
}

/** A new command ID. Each new command gets one; a retry of the same command reuses it. */
export function newCommandId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** How often a command is sent when the harness does not answer. */
const commandAttempts = 3;

/** A client of the harness at `origin`, the page's own origin by default. */
export function createProtocolClient(origin = '', fetchImpl: typeof fetch = (...args) => fetch(...args), retryDelay = 500): ProtocolClient {
  let state: ConnectionState = 'connecting';
  const lastExecutionMaps = new Map<string, ExecutionMapSnapshot>();
  const listeners = new Set<(state: ConnectionState) => void>();
  const setState = (next: ConnectionState) => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener(next);
  };

  async function get<S extends z.ZodType>(path: string, schema: S, init?: RequestInit): Promise<z.output<S>> {
    let response: Response;
    try {
      response = await fetchImpl(`${origin}${path}`, { ...init, headers: { accept: 'application/json', ...init?.headers } });
    } catch (error) {
      setState('disconnected');
      throw new ClientError('connection', `The harness did not answer: ${error instanceof Error ? error.message : String(error)}`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      setState('disconnected');
      throw new ClientError('invalid-response', `The answer to ${path} is not JSON (HTTP ${response.status})`);
    }
    setState('connected');
    if (!response.ok) {
      const failure = errorResponseSchema.safeParse(body);
      if (!failure.success) throw new ClientError('invalid-response', `HTTP ${response.status} without a protocol error`);
      const { code, message, currentVersion, evidence } = failure.data.error;
      throw new ClientError('protocol', message, code, currentVersion, evidence);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ClientError('invalid-response', `The answer to ${path} does not match the protocol`);
    return parsed.data;
  }

  return {
    getProject: async () => (await get(protocolPaths.project, projectResponseSchema)).project,
    listPlans: async () => (await get(protocolPaths.plans, planListResponseSchema)).plans,
    getPlan: async planId => (await get(protocolPaths.plan(planId), planResponseSchema)).plan,
    getModuleTree: async () => (await get(protocolPaths.modules, moduleTreeResponseSchema)).tree,
    listRuns: planId => get(protocolPaths.runs(planId), runListResponseSchema),
    getRun: async (planId, runId) => (await get(protocolPaths.run(planId, runId), runResponseSchema)).run,
    getEvents: (planId, runId, after) => get(protocolPaths.runEvents(planId, runId, after), runEventPageSchema),
    getAnalysis: (planId, runId) => get(protocolPaths.runAnalysis(planId, runId), analysisResponseSchema),
    getDecisions: (planId, runId) => get(protocolPaths.runDecisions(planId, runId), decisionListResponseSchema),
    getWorkItems: (planId, runId) => get(protocolPaths.runWorkItems(planId, runId), workItemListResponseSchema),
    getWorkItem: (planId, runId, workItem) => get(protocolPaths.runWorkItem(planId, runId, workItem), workItemResponseSchema),
    getCapabilities: (planId, runId) => get(protocolPaths.runCapabilities(planId, runId), capabilityListResponseSchema),
    getModuleCapabilities: (planId, runId) => get(protocolPaths.runModuleCapabilities(planId, runId), moduleCapabilityComparisonResponseSchema),
    getScenarios: (planId, runId) => get(protocolPaths.runScenarios(planId, runId), scenarioListResponseSchema),
    getExecutionMap: async (planId, runId) => {
      const identity = JSON.stringify([planId, runId]);
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const version = (await get(protocolPaths.run(planId, runId), runResponseSchema)).run.version;
          const map = await loadExecutionMapPages(version, cursor => get(
            protocolPaths.runExecutionMap(planId, runId, version, cursor), executionMapPageSchema));
          lastExecutionMaps.set(identity, map);
          return map;
        } catch (error) {
          if (error instanceof ClientError && error.code === 'stale-version' && attempt < 3) continue;
          if (error instanceof ClientError && error.kind === 'connection') {
            const previous = lastExecutionMaps.get(identity);
            if (previous !== undefined) return { ...previous, freshness: 'stale' };
          }
          throw error;
        }
      }
      throw new ClientError('protocol', 'The execution map kept changing during the read', 'stale-version');
    },
    getExecutionCapability: (planId, runId, capability, version) => get(
      protocolPaths.runExecutionCapability(planId, runId, capability, version), executionCapabilityDetailSchema),
    getExecutionScenario: (planId, runId, scenario, version) => get(
      protocolPaths.runExecutionScenario(planId, runId, scenario, version), executionScenarioDetailSchema),
    getGate: async (planId, runId, gate) => (await get(protocolPaths.runGate(planId, runId, gate), gateResponseSchema)).gate,
    getCheckFindings: (planId, runId, query) => get(protocolPaths.runCheckFindings(planId, runId, query), checkFindingListResponseSchema),
    getCheckFinding: (planId, runId, checkFinding) => get(protocolPaths.runCheckFinding(planId, runId, checkFinding), checkFindingDetailSchema),
    getCheckFindingModules: (planId, runId) => get(protocolPaths.runCheckFindingModules(planId, runId), checkFindingModuleCountsSchema),
    getReviews: (planId, runId, workItem) => get(protocolPaths.runReviews(planId, runId, { workItem }), reviewListResponseSchema),
    getMetrics: (planId, runId) => get(protocolPaths.runMetrics(planId, runId), metricsResponseSchema),
    listSessions: (offset = 0) => get(protocolPaths.sessions(offset), sessionListResponseSchema),
    getStandaloneSession: session => get(protocolPaths.standaloneSession(session), standaloneSessionResponseSchema),
    getRunSessions: (planId, runId) => get(protocolPaths.runSessions(planId, runId), runSessionsResponseSchema),
    getRunSession: (planId, runId, session) => get(protocolPaths.runSession(planId, runId, session), runSessionResponseSchema),
    getTranscript: (session, after) => get(session.source === 'run'
      ? protocolPaths.runSessionTranscript(session.planId, session.runId, session.session, after)
      : protocolPaths.standaloneTranscript(session.session, after), sessionTranscriptResponseSchema),
    pollSessions: (planId, runId, version, cursors) => get(protocolPaths.runSessionUpdates(planId, runId, version, cursors), sessionUpdatesResponseSchema),
    getBody: async (session, body) => {
      if (body.stored === 'inline') return { content: body.text, bytes: body.bytes, truncated: false };
      const path = body.stored === 'blob'
        ? (session.source === 'run' ? protocolPaths.runBody(session.planId, session.runId, body.hash) : protocolPaths.standaloneBody(session.session, body.hash))
        : (session.source === 'run'
            ? protocolPaths.runSessionFile(session.planId, session.runId, session.session, body.path)
            : protocolPaths.standaloneFile(session.session, body.path));
      return get(path, sessionBodyResponseSchema);
    },
    sendCommand: async command => {
      const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command) };
      for (let attempt = 1; ; attempt++) {
        try {
          return (await get(protocolPaths.commands, commandResponseSchema, init)).receipt;
        } catch (error) {
          if (!(error instanceof ClientError) || error.kind !== 'connection' || attempt >= commandAttempts) throw error;
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    },
    connection: () => state,
    onConnectionChange: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
