import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { z } from 'zod';
import { errorHttpStatus, errorResponseSchema, type ErrorCode } from '../interfaces/protocol/errors.js';
import {
  commandResponseSchema,
  commandSchema,
  eventPageSchema,
  jobListResponseSchema,
  jobResponseSchema,
} from '../interfaces/protocol/jobs.js';
import { moduleTreeResponseSchema, revisionListResponseSchema, revisionResponseSchema } from '../interfaces/protocol/maps.js';
import { apiPrefix, protocolPaths } from '../interfaces/protocol/paths.js';
import {
  planListResponseSchema,
  planResponseSchema,
  projectResponseSchema,
  type PlanEntry,
} from '../interfaces/protocol/queries.js';
import { CommandRejection, type JobService } from '../jobs/service.js';
import { listRevisions, readRevision } from '../maps/revisions.js';
import { loadModuleTree } from '../mapping/views.js';
import { discoverPlans, readPlan } from '../plans/discover.js';

export interface AppOptions {
  /** The absolute root of the project this harness serves. */
  readonly projectRoot: string;
  /** The built web client. Absent or missing, only the protocol is served. */
  readonly assetsDirectory?: string | undefined;
  /** The project's mapping jobs. */
  readonly jobs: JobService;
}

/** A failure the protocol reports with a code; anything else is `internal`. */
class ProtocolFailure extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly currentVersion?: number) {
    super(message);
  }
}

type PlanRequest = Request<{ planId: string }>;
type JobRequest = Request<{ planId: string; jobId: string }>;
type RevisionRequest = Request<{ planId: string; revision: string }>;

/**
 * The Express application: the protocol's queries and commands under
 * `/api/v1`, every response validated against its `interfaces/protocol`
 * schema, and the web client's assets when they are built.
 */
export function createApp(options: AppOptions): express.Express {
  const { projectRoot, jobs } = options;
  const app = express();
  app.disable('x-powered-by');

  app.get(protocolPaths.project, (_request, response) => {
    send(response, projectResponseSchema, {
      protocolVersion: 1,
      project: { name: basename(projectRoot), root: projectRoot, planPattern: 'plans/<plan-id>/plan.md' },
    });
  });

  app.get(protocolPaths.modules, async (_request, response) => {
    let tree;
    try {
      tree = { status: 'available' as const, ...await loadModuleTree(projectRoot) };
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      tree = {
        status: 'unavailable' as const,
        message: missing
          ? 'The architect view has not been materialized yet; a mapping job materializes it.'
          : `The architect view cannot be read: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    send(response, moduleTreeResponseSchema, { tree });
  });

  app.get(protocolPaths.plans, async (_request, response) => {
    const plans: PlanEntry[] = [];
    for (const plan of await discoverPlans(projectRoot)) {
      plans.push(plan.status === 'readable'
        ? { status: 'readable', id: plan.id, title: plan.title, path: plan.path, mapping: await jobs.mappingState(plan.id) }
        : plan);
    }
    send(response, planListResponseSchema, { plans });
  });

  app.get(`${apiPrefix}/plans/:planId`, async (request: PlanRequest, response) => {
    const plan = await readPlan(projectRoot, request.params.planId);
    if (!plan) throw new ProtocolFailure('not-found', `No plan with ID "${request.params.planId}"`);
    if (plan.status === 'unreadable') throw new ProtocolFailure('unreadable', `${plan.path}: ${plan.message}`);
    send(response, planResponseSchema, {
      plan: { id: plan.id, title: plan.title, path: plan.path, markdown: plan.markdown, mapping: await jobs.mappingState(plan.id) },
    });
  });

  app.get(`${apiPrefix}/plans/:planId/jobs`, async (request: PlanRequest, response) => {
    const plan = await readPlan(projectRoot, request.params.planId);
    if (!plan) throw new ProtocolFailure('not-found', `No plan with ID "${request.params.planId}"`);
    send(response, jobListResponseSchema, { jobs: jobs.listJobs(plan.id) });
  });

  app.get(`${apiPrefix}/plans/:planId/maps`, async (request: PlanRequest, response) => {
    const plan = await readPlan(projectRoot, request.params.planId);
    if (!plan) throw new ProtocolFailure('not-found', `No plan with ID "${request.params.planId}"`);
    send(response, revisionListResponseSchema, { revisions: await listRevisions(projectRoot, plan.id) });
  });

  app.get(`${apiPrefix}/plans/:planId/maps/:revision`, async (request: RevisionRequest, response) => {
    const plan = await readPlan(projectRoot, request.params.planId);
    if (!plan) throw new ProtocolFailure('not-found', `No plan with ID "${request.params.planId}"`);
    if (!/^[1-9]\d{0,8}$/.test(request.params.revision)) throw new ProtocolFailure('invalid-request', 'A revision is a positive number');
    const revision = Number(request.params.revision);
    const saved = await readRevision(projectRoot, plan.id, revision);
    if (!saved) throw new ProtocolFailure('not-found', `Plan "${plan.id}" has no revision ${revision}`);
    if (saved.status === 'unreadable') throw new ProtocolFailure('unreadable', `${saved.path}: ${saved.message}`);
    send(response, revisionResponseSchema, {
      revision: { revision, path: saved.path, mapHash: saved.mapHash, map: saved.map, approval: saved.approval },
    });
  });

  app.get(`${apiPrefix}/plans/:planId/jobs/:jobId`, (request: JobRequest, response) => {
    const job = jobs.getJob(request.params.planId, request.params.jobId);
    if (!job) throw new ProtocolFailure('not-found', `No job ${request.params.jobId} for plan "${request.params.planId}"`);
    send(response, jobResponseSchema, { job });
  });

  app.get(`${apiPrefix}/plans/:planId/jobs/:jobId/events`, (request: JobRequest, response) => {
    const after = request.query['after'] ?? '0';
    if (typeof after !== 'string' || !/^\d+$/.test(after)) throw new ProtocolFailure('invalid-request', '"after" must be a sequence number');
    const page = jobs.eventPage(request.params.planId, request.params.jobId, Number(after));
    if (!page) throw new ProtocolFailure('not-found', `No job ${request.params.jobId} for plan "${request.params.planId}"`);
    send(response, eventPageSchema, page);
  });

  app.post(protocolPaths.commands, express.json({ limit: '64kb' }), async (request, response) => {
    const parsed = commandSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ProtocolFailure('invalid-request', `Not a command: ${parsed.error.issues.map(issue => `${issue.path.join('.') || 'command'}: ${issue.message}`).join('; ')}`);
    }
    try {
      const receipt = await jobs.execute(parsed.data);
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
      error: { code: failure.code, message: failure.message, ...(failure.currentVersion === undefined ? {} : { currentVersion: failure.currentVersion }) },
    }));
  });

  return app;
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
