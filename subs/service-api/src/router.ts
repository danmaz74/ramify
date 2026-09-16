import { randomUUID } from 'node:crypto';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { RamifyService } from '../../../src/interfaces/service.js';
import { createProjectExplorerModel } from './project-view.js';

const context = z.string().regex(/^ctx\/1:[0-9a-f]{64}$/);
const generation = z.string().regex(/^gen\/1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const revision = z.string().regex(/^rev\/1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]*$/);
const token = z.strictObject({ context, generation });
const canonical = z.string().min(1).refine(value => !/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value));
const moduleId = z.string().refine(value => value.split('/').every(part => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(part)));
const path = canonical.refine(value => !value.includes('\\') && !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
  && value.split('/').every(part => part !== '' && part !== '.' && part !== '..'));
const detailRequest = z.strictObject({
  original: z.strictObject({ kind: z.enum(['code', 'resource']), owner: moduleId, file: path, binding: canonical }),
  exportName: canonical,
});

export interface ExplorerRouterOptions {
  readonly service: RamifyService;
  readonly requestId?: () => string;
}

const reason = (value: unknown): string => value instanceof Error ? value.message : String(value);

/** The browser's only three procedures. Every fact comes from the injected resident service. */
export function createExplorerRouter(options: ExplorerRouterOptions) {
  const t = initTRPC.create();
  const requestId = options.requestId ?? randomUUID;
  return t.router({
    projectView: t.procedure.input(z.strictObject({ token, revision: revision.optional() })).query(async ({ input }) => {
      const freshness = input.revision === undefined
        ? { mode: 'published' as const, wait: false }
        : { mode: 'published' as const, wait: false, revision: input.revision };
      const result = await options.service.check({ token: input.token, requestId: requestId(), freshness, scope: 'report' });
      if (!result.ok) return { status: 'unavailable' as const, reason: result.error.message };
      const outcome = result.value;
      if (outcome.status === 'pending' || outcome.status === 'cold') {
        return { status: 'pending' as const, current: outcome.current };
      }
      if (outcome.status !== 'reported' || outcome.report === null || outcome.revision === null) {
        return { status: 'unavailable' as const,
          reason: outcome.status === 'unavailable' ? outcome.message : `Project view ${outcome.status}`,
        };
      }
      return createProjectExplorerModel({ revision: outcome.revision, report: outcome.report });
    }),
    explorerDetails: t.procedure.input(z.strictObject({ token, revision,
      requests: z.array(detailRequest).max(10_000).superRefine((requests, issue) => {
        const unique = new Set(requests.map(item => JSON.stringify([item.original.kind, item.original.owner,
          item.original.file, item.original.binding, item.exportName])));
        if (unique.size > 50) issue.addIssue({ code: 'custom', message: 'At most 50 distinct detail requests are accepted' });
      }) })).query(async ({ input }) => {
      const result = await options.service.explorerDetails({ ...input, requestId: requestId() });
      if (!result.ok) return { status: 'unavailable' as const, reason: result.error.message };
      const outcome = result.value;
      if (outcome.status === 'ready') return { status: 'ready' as const, revision: outcome.revision, details: outcome.details };
      if (outcome.status === 'superseded') return { status: 'superseded' as const,
        reason: 'The displayed revision is no longer current' };
      return { status: 'unavailable' as const,
        reason: outcome.status === 'unavailable' ? outcome.message : `Detail request ${outcome.status}` };
    }),
    contextStatus: t.procedure.input(z.strictObject({ token })).query(async ({ input }) => {
      try {
        const result = await options.service.contextStatus(input);
        return result.ok ? { status: 'ready' as const, current: result.value }
          : { status: 'unavailable' as const, reason: result.error.message };
      } catch (error) {
        return { status: 'unavailable' as const, reason: reason(error) };
      }
    }),
  });
}

export type ExplorerRouter = ReturnType<typeof createExplorerRouter>;
