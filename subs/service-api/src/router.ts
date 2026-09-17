import { randomUUID } from 'node:crypto';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { ServerStatusResult } from './interfaces/explorer-service.js';
import type { ProjectBinding } from './project-binding.js';
import { createProjectExplorerModel } from './project-view.js';

const revision = z.string().regex(/^rev\/1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]*$/);
const canonical = z.string().min(1).refine(value => !/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value));
const moduleId = z.string().refine(value => value.split('/').every(part => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(part)));
const path = canonical.refine(value => !value.includes('\\') && !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
  && value.split('/').every(part => part !== '' && part !== '.' && part !== '..'));
const detailRequest = z.strictObject({
  original: z.strictObject({ kind: z.enum(['code', 'resource']), owner: moduleId, file: path, binding: canonical }),
  exportName: canonical,
});

export interface ExplorerRouterOptions {
  readonly binding: ProjectBinding;
  readonly requestId?: () => string;
}

const reason = (value: unknown): string => value instanceof Error ? value.message : String(value);

/** `rev/1:<uuid>:<sequence>` belongs to generation `gen/1:<uuid>`. */
const generationOf = (id: string): string => `gen/1:${id.slice('rev/1:'.length, id.lastIndexOf(':'))}`;

function unavailableReason(binding: ProjectBinding): string {
  const state = binding.state();
  switch (state.kind) {
    case 'connecting': return 'Connecting to the project';
    case 'daemon-stopped': return 'Daemon stopped explicitly';
    case 'retrying': case 'project-unavailable': return state.message;
    case 'ready': return 'Project connection changed';
  }
}

/** The browser's three procedures. No input carries a token: every request reads
 * the server's project binding, and every fact comes from its resident service. */
export function createExplorerRouter(options: ExplorerRouterOptions) {
  const t = initTRPC.create();
  const { binding } = options;
  const requestId = options.requestId ?? randomUUID;
  /** The token and service of one ready state, read together. */
  const current = () => {
    const state = binding.state(), service = binding.service();
    return state.kind === 'ready' && service ? { token: state.token, service } : null;
  };
  return t.router({
    serverStatus: t.procedure.input(z.undefined()).query(async (): Promise<ServerStatusResult> => {
      const state = binding.state();
      const message = state.kind === 'retrying' || state.kind === 'project-unavailable' ? state.message : null;
      const base = { root: binding.root, binding: state.kind, message };
      const ready = current();
      if (!ready) return { ...base, published: null, daemonPid: null };
      const [status, daemon] = await Promise.all([
        ready.service.contextStatus({ token: ready.token }).catch(() => null),
        ready.service.daemonStatus().catch(() => null),
      ]);
      return { ...base, published: status?.ok ? status.value.published : null, daemonPid: daemon?.ok ? daemon.value.pid : null };
    }),
    projectView: t.procedure.input(z.strictObject({ revision: revision.optional() })).query(async ({ input }) => {
      const ready = current();
      if (!ready) return { status: 'unavailable' as const, reason: unavailableReason(binding) };
      // A revision of an earlier generation cannot be served; the latest is returned instead.
      const requested = input.revision !== undefined && generationOf(input.revision) === ready.token.generation
        ? input.revision : undefined;
      const freshness = requested === undefined
        ? { mode: 'published' as const, wait: false }
        : { mode: 'published' as const, wait: false, revision: requested };
      let result;
      try { result = await ready.service.check({ token: ready.token, requestId: requestId(), freshness, scope: 'report' }); }
      catch (error) { return { status: 'unavailable' as const, reason: reason(error) }; }
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
    explorerDetails: t.procedure.input(z.strictObject({ revision,
      requests: z.array(detailRequest).max(10_000).superRefine((requests, issue) => {
        const unique = new Set(requests.map(item => JSON.stringify([item.original.kind, item.original.owner,
          item.original.file, item.original.binding, item.exportName])));
        if (unique.size > 50) issue.addIssue({ code: 'custom', message: 'At most 50 distinct detail requests are accepted' });
      }) })).query(async ({ input }) => {
      const superseded = { status: 'superseded' as const, reason: 'The displayed revision is no longer current' };
      const ready = current();
      if (!ready) return { status: 'unavailable' as const, reason: unavailableReason(binding) };
      if (generationOf(input.revision) !== ready.token.generation) return superseded;
      let result;
      try { result = await ready.service.explorerDetails({ ...input, token: ready.token, requestId: requestId() }); }
      catch (error) { return { status: 'unavailable' as const, reason: reason(error) }; }
      if (!result.ok) return { status: 'unavailable' as const, reason: result.error.message };
      const outcome = result.value;
      if (outcome.status === 'ready') return { status: 'ready' as const, revision: outcome.revision, details: outcome.details };
      if (outcome.status === 'superseded') return superseded;
      return { status: 'unavailable' as const,
        reason: outcome.status === 'unavailable' ? outcome.message : `Detail request ${outcome.status}` };
    }),
  });
}

export type ExplorerRouter = ReturnType<typeof createExplorerRouter>;
