import { Buffer } from 'node:buffer';
import { posix } from 'node:path';
import { z } from 'zod';
import type { CheckDocument, CliFailureDocument } from '../interfaces/cli.js';
import { diagnosticSchema, projectWarningSchema, sourceLocationSchema, stageSchema } from '../ownership-schema.js';
import { isProjectExclusion } from '../../../analysis/subs/project/src/ownership-validation.js';
import type { ProjectExclusion } from '../../../analysis/subs/project/src/interfaces/project.js';

const path = z.string();
const exclusion = z.custom<ProjectExclusion>(isProjectExclusion, 'Invalid project exclusion');
const commonPath = { path, module: z.string().nullable(), exclusion: exclusion.nullable() };
const checkedPath = z.union([
  z.strictObject({ path, disposition: z.literal('checked'), module: z.string(), exclusion: z.null(), reason: z.literal('content'), sha256: z.string() }),
  z.strictObject({ path, disposition: z.literal('checked'), module: z.string(), exclusion: z.null(), reason: z.literal('deleted'), sha256: z.null() }),
  z.strictObject({ ...commonPath, disposition: z.literal('not-analyzed'), reason: z.enum(['owned-unwired', 'owned-nested-project', 'external', 'scratch', 'reserved', 'owned-non-source']) }),
  z.strictObject({ ...commonPath, disposition: z.literal('not-checked'), reason: z.enum(['cold', 'deadline-exceeded', 'unobserved-input', 'superseded',
    'incomplete', 'unavailable', 'stopped', 'incompatible', 'evicted-revision', 'resource-unavailable', 'analysis-failed',
    'unknown-context', 'expired-generation', 'unsupported-setup', 'disposed', 'configuration-changed', 'classification-changed']) }),
]);
const revisionPath = z.enum(['cold', 'unchanged-surface', 'source', 'description', 'metadata', 'membership', 'broad']);
const revisionTimings = z.strictObject({ classify: z.number(), inventory: z.number(), compiler: z.number(), descriptions: z.number(),
  accesses: z.number(), link: z.number(), decide: z.number(), companions: z.number(), publish: z.number(), total: z.number() });
const replyTimings = z.strictObject({ invocationCheck: z.number(), promotion: z.number(), workerStatus: z.number(),
  workerRoundTrip: z.number(), sweep: z.number(), publication: z.number(),
  service: z.number().optional(), clientTransport: z.number().optional() });
const coverage = z.strictObject({ id: z.string(), code: z.enum(['unresolved-target', 'unresolved-original', 'incomplete-exports',
  'ambiguous-original', 'unknown-key', 'namespace-escape', 'nonliteral-target', 'unsupported-loader', 'unsupported-commonjs',
  'shared-global', 'resource-target', 'resource-description', 'compiled-source', 'outside-module-target', 'excluded-target',
  'compiler-blocked', 'signature-inferred', 'signature-unresolved']), location: sourceLocationSchema, message: z.string(),
  compilerCode: z.number().optional(), related: z.array(sourceLocationSchema) });

const recoverySchema = z.strictObject({ schemaVersion: z.literal('ramify.recovery/1'),
  lastCompleted: z.strictObject({ context: z.string(), generation: z.string(), revision: z.string(), inputId: z.string() }).nullable(),
  changes: z.strictObject({ paths: z.array(path).max(10_000), coverage: z.enum(['observed', 'unavailable']), reason: z.string().nullable() })
}).superRefine((value, context) => {
  const identity = value.lastCompleted;
  if (identity) {
    const generation = /^gen\/1:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(identity.generation);
    if (!/^ctx\/1:[0-9a-f]{64}$/.test(identity.context) || !generation
      || identity.revision !== `rev/1:${generation[1]}:${identity.revision.split(':').at(-1)}`
      || !/^rev\/1:[0-9a-f-]{36}:[1-9][0-9]*$/.test(identity.revision)
      || !/^input\/1:[0-9a-f]{64}$/.test(identity.inputId)) {
      context.addIssue({ code: 'custom', message: 'Invalid completed identity', path: ['lastCompleted'] });
    }
  }
  const paths = value.changes.paths;
  for (let i = 0; i < paths.length; i++) {
    const item = paths[i]!;
    if (!item || item === '.' || item === '..' || item.startsWith('../') || item.includes('\\') || item.includes('\0')
      || posix.isAbsolute(item) || posix.normalize(item) !== item) {
      context.addIssue({ code: 'custom', message: 'Recovery path is not canonical', path: ['changes', 'paths', i] });
    }
  }
  for (let i = 1; i < paths.length; i++) if (Buffer.compare(Buffer.from(paths[i - 1]!), Buffer.from(paths[i]!)) >= 0) {
    context.addIssue({ code: 'custom', message: 'Recovery paths must be distinct and byte ordered', path: ['changes', 'paths', i] });
  }
  if (identity === null && (value.changes.coverage !== 'unavailable' || !value.changes.reason)) {
    context.addIssue({ code: 'custom', message: 'A missing baseline needs unavailable coverage and a reason', path: ['changes'] });
  }
  if (identity && value.changes.coverage !== (paths.length || value.changes.reason === null ? 'observed' : 'unavailable')) {
    context.addIssue({ code: 'custom', message: 'Coverage disagrees with retained observation', path: ['changes', 'coverage'] });
  }
  if (value.changes.reason === '') {
    context.addIssue({ code: 'custom', message: 'A gap reason must be nonempty', path: ['changes', 'reason'] });
  }
});

/** Test-side exact decoders. They never enter the lightweight command runtime. */
export const checkDocumentSchema: z.ZodType<CheckDocument> = z.strictObject({
  schemaVersion: z.literal('ramify.check/4'), root: z.string(),
  revision: z.strictObject({ id: z.string(), sequence: z.int().positive(), path: revisionPath }).nullable(),
  since: z.string().nullable(), paths: z.array(checkedPath), outcome: z.enum(['checked', 'not-checked']),
  reason: z.enum(['cold', 'deadline-exceeded', 'unobserved-input', 'superseded', 'incomplete', 'unavailable', 'stopped',
    'incompatible', 'evicted-revision', 'resource-unavailable', 'analysis-failed', 'unknown-context', 'expired-generation',
    'unsupported-setup', 'disposed', 'configuration-changed', 'classification-changed']).nullable(),
  execution: z.enum(['completed', 'invalid', 'incomplete', 'unavailable']).nullable(),
  findings: z.array(diagnosticSchema.safeExtend({ new: z.boolean() })), removed: z.array(z.string()),
  warnings: z.array(projectWarningSchema), coverage: z.array(coverage),
  checked: z.strictObject({ path: revisionPath, files: z.array(path), accesses: z.int().nonnegative(), modelRebuilt: z.boolean() }).nullable(),
  timings: z.strictObject({ daemon: revisionTimings.nullable(), waitedMs: z.number(), totalMs: z.number(), reply: replyTimings.optional() }),
  stages: z.array(stageSchema).optional(), recovery: recoverySchema.optional(), exitCode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
}).superRefine((value, context) => {
  if (value.execution === 'completed' && value.outcome === 'checked' && value.recovery !== undefined) {
    context.addIssue({ code: 'custom', message: 'A completed check has no recovery', path: ['recovery'] });
  }
});

export const cliFailureDocumentSchema: z.ZodType<CliFailureDocument> = z.strictObject({
  schemaVersion: z.literal('ramify.cli/2'), status: z.literal('unavailable'),
  diagnostics: z.array(z.union([diagnosticSchema, z.strictObject({ category: z.enum(['invocation', 'execution']), code: z.string(), message: z.string() })])),
  stages: z.array(stageSchema).optional(), recovery: recoverySchema.optional(),
  exitCode: z.union([z.literal(1), z.literal(2)]),
});
