import type { z } from 'zod';
import { errorResponseSchema, type ErrorCode } from '../../harness/src/interfaces/protocol/errors.js';
import {
  commandResponseSchema,
  eventPageSchema,
  jobResponseSchema,
  type Command,
  type EventPage,
  type JobSnapshot,
  type Receipt,
} from '../../harness/src/interfaces/protocol/jobs.js';
import {
  moduleTreeResponseSchema,
  revisionListResponseSchema,
  revisionResponseSchema,
  type MapRevision,
  type ModuleTree,
  type RevisionEntry,
} from '../../harness/src/interfaces/protocol/maps.js';
import { protocolPaths } from '../../harness/src/interfaces/protocol/paths.js';
import {
  planListResponseSchema,
  planResponseSchema,
  projectResponseSchema,
  type PlanDocument,
  type PlanEntry,
  type ProjectResponse,
} from '../../harness/src/interfaces/protocol/queries.js';

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
    /** The job's version, on a `stale-version` rejection. */
    readonly currentVersion?: number,
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
  /** A job's snapshot. */
  getJob(planId: string, jobId: string): Promise<JobSnapshot>;
  /** A job's snapshot and its events after `after`. */
  getEvents(planId: string, jobId: string, after: number): Promise<EventPage>;
  /** A plan's saved map revisions, newest first. */
  listRevisions(planId: string): Promise<RevisionEntry[]>;
  /** One saved map revision with its approval. */
  getRevision(planId: string, revision: number): Promise<MapRevision>;
  /** The project's module tree, as the architect view was last materialized. */
  getModuleTree(): Promise<ModuleTree>;
  /**
   * Sends a command and returns its receipt. When the harness does not
   * answer, the identical command is sent again, which is safe: a retry
   * returns the original receipt.
   */
  sendCommand(command: Command): Promise<Receipt>;
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

/** How often a command is sent when the harness does not answer, and the pause before a retry. */
const commandAttempts = 3;

/** A client of the harness at `origin`, the page's own origin by default. */
export function createProtocolClient(origin = '', fetchImpl: typeof fetch = (...args) => fetch(...args), retryDelay = 500): ProtocolClient {
  let state: ConnectionState = 'connecting';
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
      throw new ClientError('protocol', failure.data.error.message, failure.data.error.code, failure.data.error.currentVersion);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ClientError('invalid-response', `The answer to ${path} does not match the protocol`);
    return parsed.data;
  }

  return {
    getProject: async () => (await get(protocolPaths.project, projectResponseSchema)).project,
    listPlans: async () => (await get(protocolPaths.plans, planListResponseSchema)).plans,
    getPlan: async planId => (await get(protocolPaths.plan(planId), planResponseSchema)).plan,
    getJob: async (planId, jobId) => (await get(protocolPaths.job(planId, jobId), jobResponseSchema)).job,
    getEvents: (planId, jobId, after) => get(protocolPaths.events(planId, jobId, after), eventPageSchema),
    listRevisions: async planId => (await get(protocolPaths.maps(planId), revisionListResponseSchema)).revisions,
    getRevision: async (planId, revision) => (await get(protocolPaths.map(planId, revision), revisionResponseSchema)).revision,
    getModuleTree: async () => (await get(protocolPaths.modules, moduleTreeResponseSchema)).tree,
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
