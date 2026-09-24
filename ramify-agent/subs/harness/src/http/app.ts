import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { z } from 'zod';
import { errorHttpStatus, errorResponseSchema, type ErrorCode } from '../interfaces/protocol/errors.js';
import { moduleTreeResponseSchema } from '../interfaces/protocol/evidence.js';
import { executionCapabilityDetailSchema, executionMapPageSchema, executionScenarioDetailSchema } from '../interfaces/protocol/execution-map.js';
import { commandResponseSchema } from '../interfaces/protocol/jobs.js';
import { apiPrefix, protocolPaths } from '../interfaces/protocol/paths.js';
import {
  planListResponseSchema,
  planResponseSchema,
  projectResponseSchema,
  type PlanEntry,
} from '../interfaces/protocol/queries.js';
import {
  analysisResponseSchema, capabilityListResponseSchema, decisionListResponseSchema, gateResponseSchema,
  metricsResponseSchema, moduleCapabilityComparisonResponseSchema, runCommandSchema, runEventPageSchema, runListResponseSchema, runResponseSchema,
  scenarioListResponseSchema, workItemListResponseSchema, workItemResponseSchema,
} from '../interfaces/protocol/runs.js';
import {
  runSessionIdSchema, runSessionResponseSchema, runSessionsResponseSchema, sessionBodyResponseSchema, sessionListResponseSchema, sessionQueryLimits,
  sessionTranscriptResponseSchema, sessionUpdatesResponseSchema, standaloneSessionResponseSchema, type SessionCursor,
} from '../interfaces/protocol/sessions.js';
import { CommandRejection } from '../jobs/commands.js';
import { discoverPlans, readPlan } from '../plans/discover.js';
import { ProjectionError } from '../projections/inputs.js';
import { ExecutionPageError } from '../projections/execution-pages.js';
import { currentModuleTree } from '../projections/tree.js';
import { RunQueries } from '../projections/queries.js';
import { SessionQueries } from '../projections/session-queries.js';
import type { RunService } from '../run/service.js';

export interface AppOptions {
  /** The absolute root of the project this harness serves. */
  readonly projectRoot: string;
  /** The built web client. Absent or missing, only the protocol is served. */
  readonly assetsDirectory?: string | undefined;
  /** The project's implementation runs: the commands act on it and the queries project it. */
  readonly runs: RunService;
}

/** A failure the protocol reports with a code; anything else is `internal`. */
class ProtocolFailure extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly currentVersion?: number,
    readonly evidence?: readonly string[],
  ) {
    super(message);
  }
}

type PlanRequest = Request<{ planId: string }>;
type RunRequest = Request<{ planId: string; runId: string }>;
type WorkItemRequest = Request<{ planId: string; runId: string; workItem: string }>;
type GateRequest = Request<{ planId: string; runId: string; gate: string }>;
type ExecutionCapabilityRequest = Request<{ planId: string; runId: string; capability: string }>;
type ExecutionScenarioRequest = Request<{ planId: string; runId: string; scenario: string }>;
type RunSessionRequest = Request<{ planId: string; runId: string; session: string }>;
type BodyRequest = Request<{ planId: string; runId: string; hash: string }>;
type StandaloneRequest = Request<{ session: string }>;
type StandaloneBodyRequest = Request<{ session: string; hash: string }>;

/**
 * The Express application: the protocol's queries and commands under
 * `/api/v1`, every response validated against its `interfaces/protocol`
 * schema, and the web client's assets when they are built.
 *
 * It serves the project, its module tree, its plans and their runs. A query
 * is a projection of the run's log and records and never appends an event;
 * the command endpoint is the only route that changes anything, and it acts
 * through the run service alone.
 */
export function createApp(options: AppOptions): express.Express {
  const { projectRoot, runs } = options;
  const queries = new RunQueries(runs);
  const sessions = new SessionQueries(runs);
  const app = express();
  app.disable('x-powered-by');

  app.get(protocolPaths.project, (_request, response) => {
    send(response, projectResponseSchema, {
      protocolVersion: 1,
      project: { name: basename(projectRoot), root: projectRoot, planPattern: 'plans/<plan-id>/plan.md' },
    });
  });

  app.get(protocolPaths.modules, async (_request, response) => {
    send(response, moduleTreeResponseSchema, { tree: await currentModuleTree(projectRoot) });
  });

  app.get(protocolPaths.plans, async (_request, response) => {
    const plans: PlanEntry[] = [];
    for (const plan of await discoverPlans(projectRoot)) {
      plans.push(plan.status === 'readable'
        ? { status: 'readable', id: plan.id, title: plan.title, path: plan.path }
        : plan);
    }
    send(response, planListResponseSchema, { plans });
  });

  app.get(`${apiPrefix}/plans/:planId`, async (request: PlanRequest, response) => {
    const plan = await readPlan(projectRoot, request.params.planId);
    if (!plan) throw new ProtocolFailure('not-found', `No plan with ID "${request.params.planId}"`);
    if (plan.status === 'unreadable') throw new ProtocolFailure('unreadable', `${plan.path}: ${plan.message}`);
    send(response, planResponseSchema, {
      plan: { id: plan.id, title: plan.title, path: plan.path, markdown: plan.markdown },
    });
  });

  // The runs of a plan. Every one of these is a projection.

  app.get(`${apiPrefix}/plans/:planId/runs`, async (request: PlanRequest, response) => {
    const plan = await readPlan(projectRoot, request.params.planId);
    if (!plan) throw new ProtocolFailure('not-found', `No plan with ID "${request.params.planId}"`);
    send(response, runListResponseSchema, await projected(() => queries.list(plan.id)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId`, async (request: RunRequest, response) => {
    send(response, runResponseSchema, await projected(() => queries.run(request.params.planId, request.params.runId)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/events`, async (request: RunRequest, response) => {
    const after = request.query['after'] ?? '0';
    if (typeof after !== 'string' || !/^\d{1,15}$/.test(after)) throw new ProtocolFailure('invalid-request', '"after" must be a sequence number');
    send(response, runEventPageSchema, await projected(() => queries.events(request.params.planId, request.params.runId, Number(after))));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/analysis`, async (request: RunRequest, response) => {
    send(response, analysisResponseSchema, await projected(() => queries.analysis(request.params.planId, request.params.runId)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/decisions`, async (request: RunRequest, response) => {
    send(response, decisionListResponseSchema, await projected(() => queries.decisions(request.params.planId, request.params.runId)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/work-items`, async (request: RunRequest, response) => {
    send(response, workItemListResponseSchema, await projected(() => queries.workItems(request.params.planId, request.params.runId)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/work-items/:workItem`, async (request: WorkItemRequest, response) => {
    send(response, workItemResponseSchema, await projected(() => queries.workItem(request.params.planId, request.params.runId, request.params.workItem)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/capabilities`, async (request: RunRequest, response) => {
    send(response, capabilityListResponseSchema, await projected(() => queries.capabilities(request.params.planId, request.params.runId)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/module-capabilities`, async (request: RunRequest, response) => {
    send(response, moduleCapabilityComparisonResponseSchema, await projected(() => queries.moduleCapabilities(request.params.planId, request.params.runId)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/scenarios`, async (request: RunRequest, response) => {
    send(response, scenarioListResponseSchema, await projected(() => queries.scenarios(request.params.planId, request.params.runId)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/execution-map`, async (request: RunRequest, response) => {
    const version = requiredCounter(request.query['version'], 'version');
    const cursor = request.query['cursor'];
    if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length === 0)) {
      throw new ProtocolFailure('invalid-request', '"cursor" must be an opaque cursor');
    }
    const limit = request.query['limit'] === undefined ? undefined : requiredCounter(request.query['limit'], 'limit');
    send(response, executionMapPageSchema, await projected(() => queries.executionMapPage(
      request.params.planId, request.params.runId, { version, ...(cursor === undefined ? {} : { cursor }),
        ...(limit === undefined ? {} : { limit }) },
    )));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/execution-map/capabilities/:capability`,
    async (request: ExecutionCapabilityRequest, response) => {
      const version = requiredCounter(request.query['version'], 'version');
      const detail = await projected(() => queries.executionCapabilityDetail(
        request.params.planId, request.params.runId, request.params.capability, version));
      send(response, executionCapabilityDetailSchema, detail);
    });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/execution-map/scenarios/:scenario`,
    async (request: ExecutionScenarioRequest, response) => {
      const version = requiredCounter(request.query['version'], 'version');
      const detail = await projected(() => queries.executionScenarioDetail(
        request.params.planId, request.params.runId, request.params.scenario, version));
      send(response, executionScenarioDetailSchema, detail);
    });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/gates/:gate`, async (request: GateRequest, response) => {
    send(response, gateResponseSchema, await projected(() => queries.gate(request.params.planId, request.params.runId, request.params.gate)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/metrics`, async (request: RunRequest, response) => {
    send(response, metricsResponseSchema, await projected(() => queries.metrics(request.params.planId, request.params.runId)));
  });

  // Sessions: the project's, a run's, their transcripts and bodies. Every
  // one of these is a projection too.

  app.get(`${apiPrefix}/sessions`, async (request, response) => {
    send(response, sessionListResponseSchema, await projected(() => sessions.list(counter(request.query['offset'], 'offset'))));
  });

  app.get(`${apiPrefix}/sessions/standalone/:session`, async (request: StandaloneRequest, response) => {
    send(response, standaloneSessionResponseSchema, await projected(() => sessions.standaloneSession(request.params.session)));
  });

  app.get(`${apiPrefix}/sessions/standalone/:session/transcript`, async (request: StandaloneRequest, response) => {
    const after = counter(request.query['after'], 'after');
    send(response, sessionTranscriptResponseSchema, await projected(() => sessions.transcript({ source: 'standalone', session: request.params.session }, after)));
  });

  app.get(`${apiPrefix}/sessions/standalone/:session/bodies/:hash`, async (request: StandaloneBodyRequest, response) => {
    send(response, sessionBodyResponseSchema, await projected(() => sessions.standaloneBody(request.params.session, request.params.hash)));
  });

  app.get(`${apiPrefix}/sessions/standalone/:session/files`, async (request: StandaloneRequest, response) => {
    const path = filePath(request.query['path']);
    send(response, sessionBodyResponseSchema, await projected(() => sessions.standaloneFile(request.params.session, path)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/sessions`, async (request: RunRequest, response) => {
    send(response, runSessionsResponseSchema, await projected(() => sessions.runSessions(request.params.planId, request.params.runId)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/sessions/updates`, async (request: RunRequest, response) => {
    const version = counter(request.query['version'], 'version');
    const cursors = sessionCursors(request.query['cursors']);
    send(response, sessionUpdatesResponseSchema, await projected(() => sessions.updates(request.params.planId, request.params.runId, version, cursors)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/sessions/:session`, async (request: RunSessionRequest, response) => {
    const { planId, runId, session } = request.params;
    if (!runSessionIdSchema.safeParse(session).success) throw new ProtocolFailure('not-found', `Run ${runId} has no session ${session}`);
    send(response, runSessionResponseSchema, await projected(() => sessions.runSession(planId, runId, session)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/sessions/:session/transcript`, async (request: RunSessionRequest, response) => {
    const after = counter(request.query['after'], 'after');
    const { planId, runId, session } = request.params;
    if (!runSessionIdSchema.safeParse(session).success) throw new ProtocolFailure('not-found', `Run ${runId} has no session ${session}`);
    send(response, sessionTranscriptResponseSchema, await projected(() => sessions.transcript({ source: 'run', planId, runId, session }, after)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/sessions/:session/files`, async (request: RunSessionRequest, response) => {
    const path = filePath(request.query['path']);
    const { planId, runId, session } = request.params;
    send(response, sessionBodyResponseSchema, await projected(() => sessions.runFile(planId, runId, session, path)));
  });

  app.get(`${apiPrefix}/plans/:planId/runs/:runId/bodies/:hash`, async (request: BodyRequest, response) => {
    send(response, sessionBodyResponseSchema, await projected(() => sessions.runBody(request.params.planId, request.params.runId, request.params.hash)));
  });

  // The one route that changes anything: a command, through the run service.

  app.post(protocolPaths.commands, express.json({ limit: '64kb' }), async (request, response) => {
    const parsed = runCommandSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ProtocolFailure('invalid-request', `Not a command: ${parsed.error.issues.map(issue => `${issue.path.join('.') || 'command'}: ${issue.message}`).join('; ')}`);
    }
    try {
      const receipt = await runs.execute(parsed.data);
      send(response.status(202), commandResponseSchema, { receipt });
    } catch (error) {
      if (error instanceof CommandRejection) throw new ProtocolFailure(error.code, error.message, error.currentVersion);
      throw error;
    }
  });

  app.use(apiPrefix, (request, _response, next) => {
    next(new ProtocolFailure('not-found', `No query ${request.method} ${apiPrefix}${request.path}`));
  });

  const assets = options.assetsDirectory;
  if (assets && existsSync(join(assets, 'index.html'))) {
    app.use(express.static(assets, { index: 'index.html' }));
    // The client routes with the URL fragment, so every other page is its index.
    app.get('/{*path}', (_request, response) => response.sendFile(join(assets, 'index.html')));
  } else {
    app.get('/', (_request, response) => {
      response.status(404).type('text/plain').send('The web client is not built. Run `npm run build:web`; the protocol is served under /api/v1.\n');
    });
  }

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const failure = error instanceof ProtocolFailure
      ? error
      : isBodyError(error)
        ? new ProtocolFailure('invalid-request', `The request body is not accepted: ${error.message}`)
        : new ProtocolFailure('internal', error instanceof Error ? error.message : String(error));
    if (failure.code === 'internal') console.error(error);
    response.status(errorHttpStatus[failure.code]).json(errorResponseSchema.parse({
      error: {
        code: failure.code,
        message: failure.message,
        ...(failure.currentVersion === undefined ? {} : { currentVersion: failure.currentVersion }),
        ...(failure.evidence === undefined || failure.evidence.length === 0 ? {} : { evidence: [...failure.evidence] }),
      },
    }));
  });

  return app;
}

/** A count the query names, such as a cursor; absent, it is 0. */
function counter(value: unknown, name: string): number {
  const given = value ?? '0';
  if (typeof given !== 'string' || !/^\d{1,15}$/.test(given)) throw new ProtocolFailure('invalid-request', `"${name}" must be a count`);
  return Number(given);
}

function requiredCounter(value: unknown, name: string): number {
  if (value === undefined) throw new ProtocolFailure('invalid-request', `"${name}" is required`);
  return counter(value, name);
}

/** A poll's cursors: `<session>:<after>`, comma-separated, each session once, at most 50. */
function sessionCursors(value: unknown): SessionCursor[] {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string') throw new ProtocolFailure('invalid-request', '"cursors" must be <session>:<after>, comma-separated');
  const cursors: SessionCursor[] = [];
  for (const part of value.split(',')) {
    const match = /^(ses-\d{4,}):(\d{1,15})$/.exec(part);
    if (match === null) throw new ProtocolFailure('invalid-request', `"${part}" is not a cursor: <session>:<after>`);
    if (cursors.some(cursor => cursor.session === match[1])) throw new ProtocolFailure('invalid-request', `Session ${match[1]} is followed twice`);
    cursors.push({ session: match[1]!, after: Number(match[2]) });
  }
  if (cursors.length > sessionQueryLimits.pollSessions) {
    throw new ProtocolFailure('invalid-request', `A poll follows at most ${sessionQueryLimits.pollSessions} sessions`);
  }
  return cursors;
}

/** A file body's path, relative to the transcript's directory. */
function filePath(value: unknown): string {
  if (typeof value !== 'string' || value === '') throw new ProtocolFailure('invalid-request', '"path" must name a file the transcript names');
  return value;
}

/** Runs one projection, reporting a record it cannot read with the protocol's code and its evidence. */
async function projected<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (error instanceof ProjectionError) throw new ProtocolFailure(error.code, error.message, undefined, error.evidence);
    if (error instanceof ExecutionPageError) throw new ProtocolFailure(error.code, error.message, error.currentVersion);
    throw error;
  }
}

/** A body Express's JSON parser refused: malformed, too large or of another type. */
function isBodyError(error: unknown): error is Error {
  const status = (error as { status?: unknown } | null)?.status;
  return error instanceof Error && typeof status === 'number' && status >= 400 && status < 500;
}

/** Sends `body` after validating it; a body that fails its schema is a server fault. */
function send<S extends z.ZodType>(response: Response, schema: S, body: z.input<S>): void {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error(`Response failed its protocol schema: ${parsed.error.message}`);
  response.json(parsed.data);
}
