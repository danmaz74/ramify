import { z } from 'zod';
import { modulePathSchema, moduleTreeResponseSchema } from './evidence.js';
import { jobVersionSchema } from './jobs.js';
import {
  capabilityStateSchema, gateCauseSchema, gateCheckpointSchema, gateVerdictSchema, roleSchema,
  scenarioKindSchema, scenarioStatusSchema, trackedScenarioStateSchema, workItemStateSchema,
} from './runs.js';
import { sessionReachSchema, sessionStateSchema } from './sessions.js';

/** A browser-safe, read-only projection of one committed run version. */
export const executionMapPolicySchema = z.literal('execution-map/1');
export const executionMapLimits = {
  nodes: 100,
  links: 200,
  modules: 100,
  sourceRefsPerElement: 32,
  moduleRelationsPerElement: 16,
} as const;

const text = z.string().min(1);
const count = z.int().nonnegative();
const sequence = z.int().positive();

export const executionElementKindSchema = z.enum([
  'capability', 'scenario', 'work-item', 'iteration', 'placement-request',
  'contract', 'requirement', 'session', 'gate',
]);
export type ExecutionElementKind = z.infer<typeof executionElementKindSchema>;

/** The durable ID is scoped by kind. Capability IDs are the registry's exact slugs. */
export const executionElementKeySchema = z.string().regex(
  /^(capability|scenario|work-item|iteration|placement-request|contract|requirement|session|gate):[^\s:]+$/,
).refine(key => !key.startsWith('capability:') || /^capability:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key),
  'Capability identity uses the exact kebab-case registry slug');
export type ExecutionElementKey = z.infer<typeof executionElementKeySchema>;

export const executionSourceRefSchema = z.object({
  kind: z.enum([
    'run-event', 'analysis-entry', 'capability-record', 'tracked-scenario', 'capability-progress', 'work-item',
    'iteration-assignment', 'placement-request', 'placement-decision', 'contract',
    'requirement', 'session', 'gate', 'audit', 'line-event', 'module-tree',
  ]),
  id: text,
  /** Null for a record without a corresponding run event. */
  sequence: sequence.nullable(),
  /** The owning record's revision, when it has one. */
  revision: z.int().positive().nullable(),
}).strict();
export type ExecutionSourceRef = z.infer<typeof executionSourceRefSchema>;

export const executionModuleRelationSchema = z.object({
  module: modulePathSchema,
  role: z.enum(['owner', 'consumer', 'provider', 'candidate', 'authorized-scope', 'observed-write',
    'local-architect', 'engineer', 'contract-engineer']),
  /** Candidate and authorized scope do not imply recorded participation. */
  source: executionSourceRefSchema,
}).strict();
export type ExecutionModuleRelation = z.infer<typeof executionModuleRelationSchema>;

const lineTotals = z.object({ added: count, deleted: count, textPaths: count,
  invocationIds: z.array(text) }).strict();
/** Binary changes have no line counts; coverage describes every started writer. */
export const executionLineSummarySchema = z.object({
  totals: lineTotals,
  coverage: z.enum(['complete', 'partial', 'pending', 'unavailable']),
  gaps: z.array(text),
  binary: z.object({ paths: count, invocationIds: z.array(text) }).strict(),
  methodLimit: z.literal('Two worktree snapshots can miss edits reverted before the second snapshot.'),
}).strict();
export type ExecutionLineSummary = z.infer<typeof executionLineSummarySchema>;

export const executionModuleMapSchema = z.object({
  tree: moduleTreeResponseSchema.shape.tree,
  modules: z.array(z.object({
    module: modulePathSchema, parent: modulePathSchema.nullable(), dir: z.string(),
    direct: z.array(z.object({ element: executionElementKeySchema,
      role: executionModuleRelationSchema.shape.role, source: executionSourceRefSchema }).strict()),
    workedIn: z.boolean(), involvedDescendants: count,
    lines: executionLineSummarySchema,
  }).strict()),
  /** Recorded modules absent from the current tree retain their relations and captured totals. */
  outsideTree: z.array(z.object({ module: modulePathSchema,
    direct: z.array(z.object({ element: executionElementKeySchema,
      role: executionModuleRelationSchema.shape.role, source: executionSourceRefSchema }).strict()),
    workedIn: z.boolean(), lines: executionLineSummarySchema,
  }).strict()),
  proposed: z.array(z.object({ module: modulePathSchema, parent: modulePathSchema,
    directory: text, element: executionElementKeySchema }).strict()),
  unplaced: z.array(z.object({ element: executionElementKeySchema, reason: text }).strict()),
  unmapped: executionLineSummarySchema,
  lines: executionLineSummarySchema,
}).strict();
export type ExecutionModuleMap = z.infer<typeof executionModuleMapSchema>;

/** A known subtotal never silently becomes a complete or zero-valued total. */
export const executionCountCoverageSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('complete'), known: count, total: count }).strict().refine(v => v.known === v.total),
  z.object({ state: z.literal('partial'), known: count, total: count.nullable(), gaps: z.array(text).min(1) }).strict()
    .refine(v => v.total === null || v.total > v.known, 'Partial coverage has an unknown or larger total'),
  z.object({ state: z.literal('unavailable'), reason: text }).strict(),
]);
export type ExecutionCountCoverage = z.infer<typeof executionCountCoverageSchema>;

/** Only a latest non-dry-run pass of an implemented scenario is green. */
export const executionScenarioResultSchema = z.enum([
  'no-real-run', ...scenarioStatusSchema.options, 'unavailable',
]);
export type ExecutionScenarioResult = z.infer<typeof executionScenarioResultSchema>;

export const executionRequirementStateSchema = z.enum([
  'not-started', 'working', 'provider-conformed', 'verified', 'reopened', 'unavailable',
]);
export const executionProviderStageSchema = z.enum([
  'not-started', 'working', 'conformed', 'access-established', 'unavailable',
]);
export const executionAuditLifecycleSchema = z.enum([
  'not-applicable', 'not-started', 'passed', 'failed', 'incomplete', 'unavailable',
]);
export type ExecutionAuditLifecycle = z.infer<typeof executionAuditLifecycleSchema>;

const nodeBase = {
  key: executionElementKeySchema,
  runVersion: jobVersionSchema,
  label: text,
  sourceRefs: z.array(executionSourceRefSchema).min(1).max(executionMapLimits.sourceRefsPerElement),
  modules: z.array(executionModuleRelationSchema).max(executionMapLimits.moduleRelationsPerElement),
};

/** One canonical card per durable element; graph links carry relationships. */
export const executionNodeSchema = z.discriminatedUnion('kind', [
  z.object({ ...nodeBase, kind: z.literal('capability'), level: z.enum(['entry', 'lower']),
    state: capabilityStateSchema, reason: text, owner: modulePathSchema.nullable(),
    proposed: z.object({ parent: modulePathSchema, directory: text, purpose: text, tags: z.array(z.string()) }).strict().nullable(),
    scenarios: z.object({ coverage: executionCountCoverageSchema,
      passed: count, failed: count, other: count, noRealRun: count, unavailable: count }).strict(),
    directRequirements: z.object({ coverage: executionCountCoverageSchema, verified: count,
      keys: z.array(executionElementKeySchema) }).strict(),
  }).strict(),
  z.object({ ...nodeBase, kind: z.literal('scenario'), scenarioKind: scenarioKindSchema,
    state: trackedScenarioStateSchema, latestRealResult: executionScenarioResultSchema,
    entry: executionElementKeySchema.nullable(), detailAvailable: z.boolean(),
  }).strict(),
  z.object({ ...nodeBase, kind: z.literal('work-item'), state: workItemStateSchema,
    module: modulePathSchema.nullable(), goal: text,
  }).strict(),
  z.object({ ...nodeBase, kind: z.literal('iteration'), workItem: executionElementKeySchema,
    ordinal: z.int().positive(), outlineRevision: z.int().positive(), state: z.enum(['assigned', 'working', 'completed', 'failed']),
    outcome: z.enum(['accepted', 'partial', 'unsuitable', 'exhausted', 'superseded']).nullable(),
    module: modulePathSchema.nullable(),
    scopeExceptions: z.array(z.object({ path: text, purpose: text }).strict()),
  }).strict(),
  z.object({ ...nodeBase, kind: z.literal('placement-request'), state: z.enum(['open', 'decided', 'unavailable']),
    requestedBy: executionElementKeySchema,
  }).strict(),
  z.object({ ...nodeBase, kind: z.literal('contract'), state: z.enum(['proposed', 'working', 'conformed', 'reopened', 'unavailable']),
    revision: z.int().positive(), mode: z.enum(['fake-backed', 'access-only']),
  }).strict(),
  z.object({ ...nodeBase, kind: z.literal('requirement'), state: executionRequirementStateSchema,
    consumer: executionElementKeySchema, contract: executionElementKeySchema, currentRevision: z.int().positive(),
    verifiedRevision: z.int().positive().nullable(), providerStage: executionProviderStageSchema,
    provider: executionElementKeySchema.nullable(),
  }).strict(),
  z.object({ ...nodeBase, kind: z.literal('session'), role: roleSchema, state: sessionStateSchema,
    executor: text, workItem: executionElementKeySchema.nullable(),
    reach: sessionReachSchema, invocations: z.array(text),
  }).strict(),
  z.object({ ...nodeBase, kind: z.literal('gate'), checkpoint: gateCheckpointSchema,
    /** Null while the attempt is active; no verdict has been established yet. */
    verdict: gateVerdictSchema.nullable(), audit: executionAuditLifecycleSchema, repairRound: count,
    commit: text.nullable(), auditedCommit: text.nullable(), active: z.boolean(),
    subject: z.object({ workItem: text.nullable(), iteration: text.nullable() }).strict(),
    cause: gateCauseSchema.nullable(), evidencePresent: z.boolean(),
  }).strict(),
]).superRefine((node, context) => {
  if (!node.key.startsWith(`${node.kind}:`)) context.addIssue({ code: 'custom', path: ['key'], message: 'Key kind differs from node kind' });
  if (node.kind === 'requirement' && (node.state === 'verified') !== (node.verifiedRevision === node.currentRevision)) {
    context.addIssue({ code: 'custom', path: ['verifiedRevision'], message: 'Only the current verified revision is green' });
  }
  if (node.kind === 'gate' && node.active !== (node.verdict === null)) {
    context.addIssue({ code: 'custom', path: ['verdict'], message: 'An active gate has no verdict; a settled gate has one' });
  }
  if (node.kind === 'capability') {
    const sum = node.scenarios.passed + node.scenarios.failed + node.scenarios.other + node.scenarios.noRealRun + node.scenarios.unavailable;
    if (node.scenarios.coverage.state !== 'unavailable' && sum !== node.scenarios.coverage.known) {
      context.addIssue({ code: 'custom', path: ['scenarios'], message: 'Scenario buckets must equal known membership' });
    }
    if (node.directRequirements.coverage.state !== 'unavailable') {
      if (node.directRequirements.keys.length !== node.directRequirements.coverage.known ||
          new Set(node.directRequirements.keys).size !== node.directRequirements.keys.length ||
          node.directRequirements.verified > node.directRequirements.keys.length) {
        context.addIssue({ code: 'custom', path: ['directRequirements'], message: 'Direct current requirements must be unique and counted' });
      }
    }
  }
});
export type ExecutionNode = z.infer<typeof executionNodeSchema>;

export const executionLinkKindSchema = z.enum([
  'started-for', 'follows', 'requested-by', 'established-by', 'provider-for',
  'verification-of', 'proposed-by', 'repair-of', 'depends-on', 'tracks-scenario',
  'assigned-iteration', 'session-for', 'gate-for',
]);
export type ExecutionLinkKind = z.infer<typeof executionLinkKindSchema>;

/** Other-page is a known graph element; unresolved is missing from retained evidence. */
export const executionEndpointSchema = z.discriminatedUnion('coverage', [
  z.object({ coverage: z.literal('shown'), key: executionElementKeySchema }).strict(),
  z.object({ coverage: z.literal('other-page'), key: executionElementKeySchema }).strict(),
  z.object({ coverage: z.literal('unresolved'), key: executionElementKeySchema, reason: text }).strict(),
]);

export const executionLinkSchema = z.object({
  id: text,
  runVersion: jobVersionSchema,
  kind: executionLinkKindSchema,
  from: executionEndpointSchema,
  to: executionEndpointSchema,
  source: executionSourceRefSchema,
}).strict();
export type ExecutionLink = z.infer<typeof executionLinkSchema>;

/** Exact activity references; null means there is no recorded active target. */
export const executionCurrentActivitySchema = z.object({
  awaitedSession: executionElementKeySchema.nullable(),
  runningGate: executionElementKeySchema.nullable(),
  source: executionSourceRefSchema.nullable(),
}).strict().refine(v => (v.awaitedSession !== null || v.runningGate !== null) === (v.source !== null))
  .refine(v => v.awaitedSession === null || v.awaitedSession.startsWith('session:'))
  .refine(v => v.runningGate === null || v.runningGate.startsWith('gate:'));

/** Cursor is opaque; the server binds it to the version and ordering. */
export const executionMapQuerySchema = z.object({
  version: jobVersionSchema,
  cursor: text.optional(),
  limit: z.int().positive().max(executionMapLimits.nodes).default(executionMapLimits.nodes),
}).strict();

export const executionMapPageSchema = z.object({
  schema: executionMapPolicySchema,
  runVersion: jobVersionSchema,
  cursor: text.nullable(),
  nextCursor: text.nullable(),
  tree: moduleTreeResponseSchema.shape.tree,
  moduleMap: executionModuleMapSchema,
  current: executionCurrentActivitySchema,
  nodes: z.array(executionNodeSchema).max(executionMapLimits.nodes),
  links: z.array(executionLinkSchema).max(executionMapLimits.links),
  /** Direct module relations are a separate census so one busy module cannot overflow a row. */
  moduleRelations: z.array(z.object({ module: modulePathSchema, element: executionElementKeySchema,
    role: executionModuleRelationSchema.shape.role, source: executionSourceRefSchema }).strict()).max(executionMapLimits.modules),
  /** Line provenance is paged independently of numeric summaries. */
  lineRefs: z.array(z.object({ scope: z.enum(['module', 'outside', 'unmapped', 'all', 'core']),
    module: modulePathSchema.nullable(), field: z.enum(['text-invocation', 'binary-invocation', 'gap']), value: text }).strict())
    .max(executionMapLimits.modules),
  coverage: z.object({ nodes: z.object({ shown: count, total: count }).strict(),
    links: z.object({ shown: count, total: count }).strict(),
    modules: z.object({ shown: count, total: count }).strict(),
    moduleRelations: z.object({ shown: count, total: count }).strict(),
    lineRefs: z.object({ shown: count, total: count }).strict(),
    gaps: z.array(text).max(32),
  }).strict(),
}).strict().superRefine((page, context) => {
  const issue = (message: string, path: PropertyKey[]) => context.addIssue({ code: 'custom', message, path });
  if (JSON.stringify(page.tree) !== JSON.stringify(page.moduleMap.tree)) issue('Module map and page must name the same current tree', ['moduleMap', 'tree']);
  const keys = new Set<string>();
  const linkIds = new Set<string>();
  for (const [i, node] of page.nodes.entries()) {
    if (node.runVersion !== page.runVersion) issue('Mixed run versions', ['nodes', i, 'runVersion']);
    if (keys.has(node.key)) issue('Duplicate node key', ['nodes', i, 'key']);
    keys.add(node.key);
  }
  for (const [i, link] of page.links.entries()) {
    if (link.runVersion !== page.runVersion) issue('Mixed run versions', ['links', i, 'runVersion']);
    if (linkIds.has(link.id)) issue('Duplicate link ID', ['links', i, 'id']);
    linkIds.add(link.id);
    for (const side of ['from', 'to'] as const) {
      const endpoint = link[side];
      if (endpoint.coverage === 'shown' && !keys.has(endpoint.key)) issue('Shown endpoint is absent', ['links', i, side]);
      if (endpoint.coverage === 'other-page' && (keys.has(endpoint.key) || page.coverage.nodes.total <= page.nodes.length)) {
        issue('Other-page endpoint needs page coverage', ['links', i, side]);
      }
    }
  }
  if (page.coverage.nodes.shown !== page.nodes.length || page.coverage.links.shown !== page.links.length ||
      page.coverage.nodes.total < page.nodes.length || page.coverage.links.total < page.links.length) {
    issue('Page coverage must count returned elements', ['coverage']);
  }
  const moduleRows = page.moduleMap.modules.length + page.moduleMap.outsideTree.length +
    page.moduleMap.proposed.length + page.moduleMap.unplaced.length;
  if (moduleRows > executionMapLimits.modules || page.coverage.modules.shown !== moduleRows ||
      page.coverage.modules.total < moduleRows ||
      (page.tree.status === 'available' && (page.tree.modules.length !== page.moduleMap.modules.length ||
        page.tree.modules.some((module, i) => module.module !== page.moduleMap.modules[i]?.module)))) {
    issue('Module page must count its bounded rows and match the tree', ['coverage', 'modules']);
  }
  if (page.coverage.moduleRelations.shown !== page.moduleRelations.length ||
      page.coverage.moduleRelations.total < page.moduleRelations.length ||
      page.coverage.lineRefs.shown !== page.lineRefs.length ||
      page.coverage.lineRefs.total < page.lineRefs.length ||
      [...page.moduleMap.modules, ...page.moduleMap.outsideTree].some(row => row.direct.length > 0) ||
      [...page.moduleMap.modules, ...page.moduleMap.outsideTree].some(row =>
        row.lines.totals.invocationIds.length > 0 || row.lines.binary.invocationIds.length > 0 || row.lines.gaps.length > 0) ||
      [page.moduleMap.lines, page.moduleMap.unmapped].some(lines =>
        lines.totals.invocationIds.length > 0 || lines.binary.invocationIds.length > 0 || lines.gaps.length > 0)) {
    issue('Relation and line provenance arrays must be paged separately', ['moduleMap']);
  }
  // End-of-census totals are checked by the cursor producer and by the client
  // across every page; a final page may contain no nodes and only late links.
});
export type ExecutionMapPage = z.infer<typeof executionMapPageSchema>;

/** A targeted description, full scenario block, or explicit absent detail. */
export const executionCapabilityDetailSchema = z.object({
  schema: executionMapPolicySchema, runVersion: jobVersionSchema, key: executionElementKeySchema,
  detail: z.discriminatedUnion('state', [
    z.object({ state: z.literal('available'), level: z.enum(['entry', 'lower']), description: text,
      source: executionSourceRefSchema }).strict(),
    z.object({ state: z.literal('unavailable'), reason: text }).strict(),
  ]),
}).strict().refine(v => v.key.startsWith('capability:'));
export type ExecutionCapabilityDetail = z.infer<typeof executionCapabilityDetailSchema>;

export const executionScenarioDetailSchema = z.object({
  schema: executionMapPolicySchema, runVersion: jobVersionSchema, key: executionElementKeySchema,
  detail: z.discriminatedUnion('state', [
    z.object({ state: z.literal('available'), name: text,
      source: z.array(z.string()).min(1),
      record: executionSourceRefSchema }).strict(),
    z.object({ state: z.literal('unavailable'), reason: text }).strict(),
  ]),
}).strict().refine(v => v.key.startsWith('scenario:'));
export type ExecutionScenarioDetail = z.infer<typeof executionScenarioDetailSchema>;
