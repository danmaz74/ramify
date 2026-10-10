import { posix } from 'node:path';
import { z } from 'zod';
import { elementCatalogSchema, packageDeviationSchema } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { scenarioStateSchema } from '../../subs/scenarios/src/states.js';
import { apiViewEvidenceSchema } from '../interfaces/protocol/jobs.js';
import { reviewRequestSchema } from '../reviews/records.js';
import { viewIdentitySchema } from '../interfaces/protocol/evidence.js';
import { continueReasonSchema, contextPolicySchema, runPolicySchema, sessionIdSchema } from '../run/records.js';
import { readSessionPointReference } from '../run/session-operations.js';
import { iterationAssignmentSchema } from '../work/iterations.js';
import { workItemOutlineSchema, workItemSchema } from '../work/records.js';
import { startingPointSchema } from '../work/starting-points.js';

/*
 * The inputs of one harness step: everything a role's invocation is built
 * from, as it is on disk or as it was authored, and nothing that exists only
 * in memory. A run writes them beside each invocation before it starts; a
 * step reads them from a file. The same constructor builds the invocation
 * from them in both places.
 *
 * Every path field names its base, `{ project }` or `{ run }`, and is
 * relative to it: an absolute path or one that leaves its base is refused.
 * Captured text, such as a gate's diagnostics or an assignment package, is
 * not a path field and may name any path. Records the run captured, such as
 * the iteration assignment, keep their own schema.
 */

export const stepInputsSchemaId = 'ramify-agent.step-inputs/1';

/** A normalized relative path that stays beneath its base; `.` is the base itself. */
const relativePath = z.string().min(1).refine(path =>
  !path.startsWith('/') && !path.includes('\\') && !/^[A-Za-z]:/u.test(path) && !path.includes('\0')
    && posix.normalize(path) === path && path !== '..' && !path.startsWith('../'),
'a normalized path relative to its base, without absolute paths or traversal out of it');

/** A path relative to the project root. */
export const projectPathSchema = z.object({ project: relativePath }).strict();
export type ProjectPath = z.infer<typeof projectPathSchema>;
/** A path relative to the run's directory. */
export const runPathSchema = z.object({ run: relativePath }).strict();
export type RunPath = z.infer<typeof runPathSchema>;

/** Plain JSON: no function, symbol, undefined or non-finite number. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema),
]));

const text = z.string().min(1);

/** A durable session point reference, as the session operations record it. */
const pointReferenceSchema = z.string().refine(ref => readSessionPointReference(ref) !== null, 'a recorded session point reference');

/** One scenario as an engineer's briefing carries it. */
const briefedScenarioSchema = z.object({
  id: text, name: text, state: scenarioStateSchema, file: relativePath, source: z.array(z.string()), partOf: z.string().nullable(),
}).strict();

const engineerScenariosSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('entry'), scenarios: z.array(briefedScenarioSchema) }).strict(),
  z.object({
    kind: z.literal('integration'),
    state: scenarioStateSchema,
    integration: z.object({
      scenario: z.object({ id: text, name: text, owner: text, file: relativePath, source: z.array(z.string()), steps: relativePath }).strict(),
      subScenarios: z.array(z.object({ id: text, name: text, owner: text, file: relativePath, source: z.array(z.string()) }).strict()),
      owners: z.array(z.object({ module: text, directory: relativePath, files: z.array(relativePath) }).strict()),
      scope: z.object({ module: text, includedChildren: z.array(text) }).strict(),
    }).strict(),
  }).strict(),
]);

/**
 * The focused scenario command the run prepared, as captured: its shell
 * text, selection and declared environment, or why none is available. Its
 * own paths are captured facts of the preparation, not path fields.
 */
const focusedCommandSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('available'), cwd: text, environment: z.record(z.string(), z.string()), argv: z.array(z.string()), shellCommand: text,
    configPath: text, configText: z.string(), configurationIdentity: text, sourceIdentity: text,
    selection: z.object({ cwd: text, config: text, profile: text, paths: z.array(text), configurationIdentity: text }).strict(),
    support: z.record(z.string(), jsonValueSchema),
  }).strict(),
  z.object({ kind: z.literal('unavailable'), reason: text }).strict(),
]);

/** What the run told the engineer of one written module's API views. */
const apiViewsSchema = z.object({
  module: text,
  views: z.array(z.object({ area: text, path: projectPathSchema, revision: text, coverage: z.number().nullable() }).strict()),
  unavailable: z.string().nullable(),
}).strict();

/** The starting points the assignment recorded, with the origin the harness's records supply. */
const startingPointGroupSchema = z.object({
  origin: z.object({
    producer: text, workItem: text, iteration: text.optional(), invocation: text.optional(), boundary: text.optional(), capabilityTask: text.optional(),
  }).strict(),
  points: z.array(startingPointSchema).optional(),
}).strict();

/** What a role that works in the source is told of the project. */
export const knownFactsSchema = z.object({
  declaredChecks: z.object({ checks: z.array(jsonValueSchema), paths: z.array(projectPathSchema) }).strict(),
  modules: z.array(z.object({ module: text, directory: projectPathSchema, apiPaths: z.array(projectPathSchema) }).strict()),
  testAreas: z.array(z.object({ module: text, area: projectPathSchema }).strict()),
  scenarioFeatures: z.array(projectPathSchema),
  stepDirectories: z.array(z.object({ directory: projectPathSchema, files: z.array(projectPathSchema) }).strict()),
}).strict();

/** Where an imported step came from: the source invocation and the start it originally had. */
/** The run whose records an invocation's inputs belong to. */
const runIdentitySchema = z.object({ planId: text, runId: text }).strict();

/**
 * The run identity of inputs that may be authored without a run: null until
 * the manual run that executes them supplies its own.
 */
const optionalRunSchema = runIdentitySchema.nullable();

/** Inputs imported from one invocation of a run, with what an author replaced. */
const runProvenanceSchema = z.object({
  run: runIdentitySchema,
  invocation: text,
  record: runPathSchema,
  originalStart: z.enum(['fresh', 'repair-continuation', 'resumed-after-handback', 'continued', 'fork']),
  /** The session point the original start continued or forked, where it had one. */
  originalPoint: pointReferenceSchema.optional(),
  /** The inputs an author supplied in place of what the source invocation recorded, each validated as its producing role's output. */
  authored: z.array(z.enum(['work-item', 'outline', 'selection', 'assignment', 'review-request'])).optional(),
}).strict();

/**
 * Inputs authored without a run: the work item, the outline revisions and
 * the assignment an author supplied, each judged as the local architect's
 * output. The assignment is the inputs' own; the work item and the outlines
 * are carried here, so the manual run that executes the inputs records all
 * three before its invocation starts.
 */
const authoredProvenanceSchema = z.object({
  origin: z.literal('authored'),
  authored: z.array(z.enum(['work-item', 'outline', 'assignment'])).min(1),
  workItem: workItemSchema,
  outlines: z.array(workItemOutlineSchema),
}).strict();

/**
 * Engineer inputs derived from an assignment a manual run recorded: the
 * local architect invocation whose accepted `assign` made it, and the
 * assignment record `step after` committed for it.
 */
const assignmentProvenanceSchema = z.object({
  origin: z.literal('assignment'),
  run: runIdentitySchema,
  invocation: text,
  assignment: runPathSchema,
}).strict();

const provenanceSchema = z.union([runProvenanceSchema, authoredProvenanceSchema, assignmentProvenanceSchema]);
export type StepProvenance = z.infer<typeof provenanceSchema>;
export type RunProvenance = z.infer<typeof runProvenanceSchema>;

/** The fields every engineer start shares: the fresh inputs. */
const engineerFields = {
  schema: z.literal(stepInputsSchemaId),
  role: z.literal('engineer'),
  run: optionalRunSchema,
  work: z.object({ workItem: text, iteration: text }).strict(),
  /** The count of engineer invocations of this iteration, this one included. */
  attempt: z.int().positive(),
  /** The work item's own module: a `contract-needed` injection site is judged against it. */
  consumer: text,
  assignment: iterationAssignmentSchema,
  /** The last accepted boundary. */
  base: text,
  /** The tree a capability task's iteration starts from, where it has one. */
  candidateBefore: text.optional(),
  /** Whether the run coordinates capability needs, which selects the handback the engineer may submit. */
  capabilityWorkflow: z.boolean(),
  /** Whether the run's policy offers the capability submission. */
  capabilityPolicy: z.boolean(),
  workingDirectory: projectPathSchema,
  views: z.array(apiViewsSchema),
  testAreas: z.array(z.object({ module: text, area: projectPathSchema }).strict()),
  scenarios: engineerScenariosSchema.optional(),
  obligations: z.array(z.object({ id: text, text: z.string().nullable() }).strict()),
  /** The assignment package as rendered when it was assigned. */
  assignmentPackage: z.string().optional(),
  /** The assigned scenarios' feature files and the focused command prepared for them. */
  focused: z.object({ featurePaths: z.array(projectPathSchema), command: focusedCommandSchema, sourceFiles: z.record(z.string(), z.string()) }).strict(),
  failedGate: z.object({ id: text, cause: z.string().nullable(), summary: z.array(z.string()) }).strict().optional(),
  /** What an earlier invocation reported before it ran out of context. */
  handoff: z.object({ done: z.array(z.string()), unfinished: z.array(z.string()), returns: z.int().nonnegative() }).strict().optional(),
  /** The qualified existing behavior a returned capability handback delivers. */
  guidance: z.string().optional(),
  startingPoints: startingPointGroupSchema.nullable(),
  known: knownFactsSchema,
  /** Files the harness protects, refused to the engineer whatever its scope: the run's own and the unauthorized guarded ones. */
  protectedFiles: z.object({ harness: z.array(projectPathSchema), unauthorized: z.array(projectPathSchema) }).strict(),
  bounds: z.object({ idleMs: z.int().positive(), absoluteMs: z.int().positive(), commandTimeoutMs: z.int().positive() }).strict(),
  limits: runPolicySchema.shape.limits,
  context: contextPolicySchema,
  provenance: provenanceSchema.optional(),
};

const freshEngineerSchema = z.object({
  ...engineerFields,
  start: z.object({
    kind: z.literal('fresh'),
    /** A continued start the harness could not honor, which this fresh one replaces. */
    degraded: z.object({ requested: z.literal('continued'), reason: text }).strict().optional(),
  }).strict(),
}).strict();

const repairEngineerSchema = z.object({
  ...engineerFields,
  failedGate: engineerFields.failedGate.unwrap(),
  start: z.object({ kind: z.literal('repair-continuation'), session: text, point: pointReferenceSchema }).strict(),
}).strict();

const resumedEngineerSchema = z.object({
  ...engineerFields,
  guidance: z.string(),
  start: z.object({ kind: z.literal('resumed-after-handback'), session: text, point: pointReferenceSchema }).strict(),
}).strict();

/** The engineer's inputs: fresh, a repair continuing its session, or resumed after a capability handback. */
export const engineerStepInputsSchema = z.union([freshEngineerSchema, repairEngineerSchema, resumedEngineerSchema]);
export type EngineerStepInputs = z.infer<typeof engineerStepInputsSchema>;
export type EngineerStart = EngineerStepInputs['start']['kind'];
export type KnownFactsInputs = z.infer<typeof knownFactsSchema>;

/** A view the task environment names: a path field with the revision, modules and coverage limits the task is told of. */
const environmentViewSchema = z.object({ path: projectPathSchema, revision: z.string().nullable(), modules: z.array(text), coverage: z.array(z.string()) }).strict();

/** One delivered section of a task brief, as captured text. */
const sectionSchema = z.object({ key: text, text: z.string() }).strict();

/** The fields every role's inputs share besides its own. */
const commonFields = {
  schema: z.literal(stepInputsSchemaId),
  run: runIdentitySchema,
  attempt: z.int().positive(),
  /** Whether the run coordinates capability needs, which selects its prompt packages and submission schemas. */
  capabilityWorkflow: z.boolean(),
  limits: runPolicySchema.shape.limits,
  context: contextPolicySchema,
  provenance: provenanceSchema.optional(),
};

/**
 * The local architect's briefing of one work item, as the run collected it:
 * the work item and its outlines as their records, the rest as captured
 * facts. The runtime locations it is rendered with are not part of it: the
 * project root and the run directory come from the environment and the
 * working directory from the inputs.
 */
export const workBriefingSchema = z.object({
  item: workItemSchema,
  /** The module's project-relative directory: empty for the root module, whose directory is the project root. */
  moduleDirectory: z.string().optional(),
  testAreas: z.array(z.object({ module: text, area: text }).strict()).optional(),
  setup: z.string().optional(),
  onboarding: z.object({ path: text, purpose: z.string().nullable(), missing: z.string().optional() }).strict(),
  views: z.object({ evidence: apiViewEvidenceSchema.nullable(), unavailable: z.string().nullable() }).strict(),
  defaultWriteScope: z.array(jsonValueSchema).optional(),
  hypotheses: z.array(jsonValueSchema),
  registry: z.array(jsonValueSchema),
  decisions: z.array(jsonValueSchema),
  unresolvedRequest: z.object({ id: text, findings: z.array(z.string()), gaps: z.array(z.string()) }).strict().optional(),
  deviationRecorded: z.string().optional(),
  environmentResumed: jsonValueSchema.optional(),
  outlines: z.array(workItemOutlineSchema),
  delegation: jsonValueSchema.optional(),
  failedGate: z.object({ id: text, cause: z.string().nullable(), summary: z.array(z.string()) }).strict().optional(),
  integration: jsonValueSchema.optional(),
  scenarios: z.array(jsonValueSchema).optional(),
  lastIteration: jsonValueSchema.optional(),
  bounds: jsonValueSchema.optional(),
  reconciliation: jsonValueSchema.optional(),
}).strict();
export type WorkBriefingInputs = z.infer<typeof workBriefingSchema>;

const orientationFields = {
  ...commonFields,
  role: z.literal('local-architect'),
  phase: z.literal('orientation'),
  work: z.object({ workItem: text }).strict(),
  workingDirectory: projectPathSchema,
  briefing: workBriefingSchema,
  /** The plan elements of the work item, as the package creator rendered them. */
  requirements: z.array(z.string()),
  known: knownFactsSchema,
  architectView: z.array(environmentViewSchema),
};

/** The local architect's orientation: always a fresh start, before any assignment. */
const orientationSchema = z.object({ ...orientationFields, start: z.object({ kind: z.literal('fresh') }).strict() }).strict();

const selectorFields = {
  ...commonFields,
  role: z.literal('context-selector'),
  work: z.object({ workItem: text }).strict(),
  kind: z.enum(['selection', 'reselection']),
  goal: text,
  requirements: z.array(z.string()),
  /** The briefing a fresh selector is given: the orientation packet, or the reselection's own. */
  packet: z.string(),
  /** What a fork of a session that holds the briefing is given instead, where it differs. */
  update: z.string().optional(),
  catalog: elementCatalogSchema,
  planDeviations: z.array(packageDeviationSchema),
  workItemElements: z.array(text),
  /** The orientation a selection is identified by, and the point the run retained of it. */
  orientation: z.object({ invocation: text, point: pointReferenceSchema.nullable() }).strict(),
  workspace: runPathSchema,
  /** What a fresh selector is told of the project; a fork inherits it. */
  known: knownFactsSchema,
  /** The starting points a fresh selector is given; a fork inherits them. */
  startingPoints: z.array(startingPointGroupSchema),
  architectView: z.array(environmentViewSchema),
};

const selectorFreshSchema = z.object({ ...selectorFields,
  start: z.object({ kind: z.literal('fresh'), degraded: z.object({ requested: z.literal('fork'), reason: text }).strict().optional() }).strict() }).strict();
const selectorForkSchema = z.object({ ...selectorFields,
  start: z.object({ kind: z.literal('fork'), session: sessionIdSchema, invocation: text, point: pointReferenceSchema }).strict() }).strict();

const workTurnFields = {
  ...commonFields,
  /** A work turn's inputs are built without a run when an authored assignment is judged. */
  run: optionalRunSchema,
  role: z.literal('local-architect'),
  phase: z.literal('work-turn'),
  work: z.object({ workItem: text }).strict(),
  workingDirectory: projectPathSchema,
  briefing: workBriefingSchema,
  /** The work item's selected package: its citation, and its text where the message carries it. */
  package: z.object({ hash: text, elements: z.array(text), deviations: z.array(text), text: z.string() }).strict().optional(),
  /** Whether the message carries the package text: a session that lacks it receives it once. */
  packageInPrompt: z.boolean(),
  /** The plan deviations recorded after the package, rendered by the package creator. */
  deviations: z.string().optional(),
  /** The obligation briefing of this work item's architect. */
  obligationLines: z.array(z.string()),
  /** Capability work that intervened since this work item was deferred. */
  intervening: z.string().optional(),
  /** The plan package of the work item's elements, which a turn without a selected package is given as its requirements. */
  requirements: z.array(z.string()),
  known: knownFactsSchema,
  /** The last iteration's starting points, and the orientation's, which a session without the orientation is given. */
  startingPoints: z.array(startingPointGroupSchema),
  orientation: z.object({ session: sessionIdSchema.nullable(), group: startingPointGroupSchema }).strict().optional(),
  /**
   * What a submission is judged against besides the briefing: the run's
   * committed hypotheses, decisions, work items and agreements, this work
   * item's open requirements, the guarded and harness-only paths, the
   * obligation projection, and the view and revision a scope is captured with.
   */
  validation: z.object({
    hypotheses: z.array(jsonValueSchema),
    decisions: z.array(jsonValueSchema),
    workItems: z.array(text),
    openRequirements: z.array(text),
    contracts: z.array(text),
    guardedPaths: z.array(text),
    harnessOnly: z.array(text),
    obligations: z.object({ entries: z.array(z.tuple([text, jsonValueSchema])), tests: z.int().nonnegative() }).strict(),
    scope: z.object({ view: viewIdentitySchema, revision: z.int().positive() }).strict(),
  }).strict(),
};

const workTurnFreshSchema = z.object({ ...workTurnFields, start: z.object({ kind: z.literal('fresh'),
  /** Why the turn was to continue a session the run no longer holds; the task kind follows it. */
  continuing: continueReasonSchema.optional(),
  degraded: z.object({ requested: z.literal('continued'), reason: text }).strict().optional() }).strict() }).strict();
const workTurnContinuedSchema = z.object({ ...workTurnFields,
  start: z.object({ kind: z.literal('continued'), point: pointReferenceSchema,
    /** The session the run holds the point in, where its log names one. */
    session: sessionIdSchema.optional(),
    /** Why the turn continues its session, where the run recorded why. */
    continuing: continueReasonSchema.optional() }).strict() }).strict();

const reviewFields = {
  ...commonFields,
  role: z.literal('reviewer'),
  question: z.enum(['code', 'scope', 'design']),
  work: z.object({ workItem: text, iteration: text }).strict(),
  request: reviewRequestSchema,
  /** The audited candidate's tree, as Git named it when the snapshot was opened. */
  snapshotTree: text,
  /**
   * The question's message inputs, captured from the audited candidate and
   * the run's records: the iteration's intent, the work item's
   * CheckFindings, the cited package, the plan document, the pending-tag
   * bindings, the declared checks, the delivered patches, the changed paths,
   * and the candidate's test directories the message names.
   */
  briefing: z.object({
    assignment: z.object({ goal: z.string(), approach: z.string(), completionEvidence: z.string(), scopeRationale: z.string(), testAreas: z.array(text) }).strict().nullable(),
    checkFindings: z.array(z.object({ id: text, standing: text, title: z.string() }).strict()),
    package: z.string().optional(),
    planDocument: text.nullable().optional(),
    pendingBindings: z.array(z.object({ path: text, sha256: text, scenario: text, invocation: text, submission: text }).strict()).optional(),
    setup: z.string().optional(),
    diffPayload: z.string(),
    changes: z.array(z.object({ status: text, path: text }).strict()),
    directories: z.array(z.string()),
  }).strict(),
  /** The starting points the candidate's assignment and engineer declared, rendered against the candidate. */
  discovery: sectionSchema.optional(),
  workspace: runPathSchema,
  bounds: z.object({ absoluteMs: z.int().positive() }).strict(),
};

const reviewFreshSchema = z.object({ ...reviewFields,
  start: z.object({ kind: z.literal('fresh'), degraded: z.object({ requested: z.literal('fork'), reason: text }).strict().optional() }).strict() }).strict();
const reviewForkSchema = z.object({ ...reviewFields,
  start: z.object({ kind: z.literal('fork'), session: sessionIdSchema, invocation: text, point: pointReferenceSchema,
    reason: z.enum(['scope-review', 'design-orientation']), briefs: z.array(text) }).strict() }).strict();

/** The design orientation: a reviewer that reads one guidance selection, kept so the design reviews of its key fork it. */
const designOrientationSchema = z.object({
  ...commonFields,
  role: z.literal('reviewer'),
  question: z.literal('design-orientation'),
  work: z.object({ workItem: text, iteration: text }).strict(),
  /** The request whose attempt made the orientation, and the orientation's key. */
  request: text,
  key: text,
  guidance: z.array(z.object({ ref: text, hash: text, text: z.string() }).strict()),
  workspace: runPathSchema,
  bounds: z.object({ absoluteMs: z.int().positive() }).strict(),
  architectView: z.array(environmentViewSchema),
  start: z.object({ kind: z.literal('fresh') }).strict(),
}).strict();

export type OrientationStepInputs = z.infer<typeof orientationSchema>;
export type SelectorStepInputs = z.infer<typeof selectorFreshSchema> | z.infer<typeof selectorForkSchema>;
export type WorkTurnStepInputs = z.infer<typeof workTurnFreshSchema> | z.infer<typeof workTurnContinuedSchema>;
export type ReviewStepInputs = z.infer<typeof reviewFreshSchema> | z.infer<typeof reviewForkSchema>;
export type DesignOrientationStepInputs = z.infer<typeof designOrientationSchema>;
export type LocalArchitectStepInputs = OrientationStepInputs | WorkTurnStepInputs;
export type ReviewerStepInputs = ReviewStepInputs | DesignOrientationStepInputs;

/** The inputs of every step this harness can construct, by role and start. */
export type StepInputs = EngineerStepInputs | LocalArchitectStepInputs | SelectorStepInputs | ReviewerStepInputs;
/** The roles whose steps this harness constructs. */
export const stepRoles = ['engineer', 'local-architect', 'context-selector', 'reviewer'] as const;

/** Each member's schema, by role, its variant and its start. */
const members: Readonly<Record<string, z.ZodType>> = {
  'engineer/fresh': freshEngineerSchema,
  'engineer/repair-continuation': repairEngineerSchema,
  'engineer/resumed-after-handback': resumedEngineerSchema,
  'local-architect/orientation/fresh': orientationSchema,
  'local-architect/work-turn/fresh': workTurnFreshSchema,
  'local-architect/work-turn/continued': workTurnContinuedSchema,
  'context-selector/fresh': selectorFreshSchema,
  'context-selector/fork': selectorForkSchema,
  'reviewer/code/fresh': reviewFreshSchema,
  'reviewer/scope/fresh': reviewFreshSchema,
  'reviewer/design/fresh': reviewFreshSchema,
  'reviewer/code/fork': reviewForkSchema,
  'reviewer/scope/fork': reviewForkSchema,
  'reviewer/design/fork': reviewForkSchema,
  'reviewer/design-orientation/fresh': designOrientationSchema,
};

/** The variant field of a role's inputs, where its inputs have one. */
const variantField: Readonly<Record<string, 'phase' | 'question' | undefined>> = {
  engineer: undefined, 'local-architect': 'phase', 'context-selector': undefined, reviewer: 'question',
};

/** Why a value is not step inputs: each error with its path. */
export class StepInputsError extends Error {
  constructor(readonly errors: readonly string[]) {
    super(`Invalid step inputs (${stepInputsSchemaId}): ${errors.join('; ')}`);
    this.name = 'StepInputsError';
  }
}

/**
 * Validates step inputs: the schema of their role, variant and start, and
 * that they survive JSON unchanged. A TypeScript type alone does not
 * establish either.
 */
export function validateStepInputs(value: unknown): StepInputs {
  const fields = value !== null && typeof value === 'object' ? value as Record<string, unknown> & { start?: { kind?: unknown } } : {};
  if (fields.schema !== stepInputsSchemaId) throw new StepInputsError([`schema: expected "${stepInputsSchemaId}"`]);
  const role = fields.role;
  if (typeof role !== 'string' || !(stepRoles as readonly string[]).includes(role)) {
    throw new StepInputsError([`role: no step inputs are defined for ${JSON.stringify(role)}; supported: ${stepRoles.map(name => `"${name}"`).join(', ')}`]);
  }
  // Each member is judged by its own schema, so the errors name what that role and start lack.
  const variant = variantField[role];
  const prefix = variant === undefined ? role : `${role}/${String(fields[variant])}`;
  const starts = Object.keys(members).filter(key => key.startsWith(`${prefix}/`)).map(key => key.slice(prefix.length + 1));
  if (starts.length === 0) {
    const variants = [...new Set(Object.keys(members).filter(key => key.startsWith(`${role}/`)).map(key => key.split('/')[1]))];
    throw new StepInputsError([`${variant}: expected one of ${variants.map(name => `"${name}"`).join(', ')}`]);
  }
  const kind = String(fields.start?.kind);
  const member = starts.includes(kind) ? members[`${prefix}/${kind}`] : undefined;
  if (member === undefined) throw new StepInputsError([`start.kind: expected one of ${starts.map(name => `"${name}"`).join(', ')}`]);
  const parsed = member.safeParse(value);
  if (!parsed.success) throw new StepInputsError(parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`));
  const bytes = JSON.stringify(parsed.data);
  if (canonical(JSON.parse(bytes) as unknown) !== canonical(parsed.data)) throw new StepInputsError(['(root): the inputs do not survive JSON unchanged']);
  return parsed.data as StepInputs;
}

/** Validates inputs that must be one role's and variant's, refusing any other. */
function validateAs<R extends StepInputs>(value: unknown, matches: (inputs: StepInputs) => inputs is R, what: string): R {
  const inputs = validateStepInputs(value);
  if (!matches(inputs)) throw new StepInputsError([`(root): these are not ${what} inputs`]);
  return inputs;
}

export const validateEngineerInputs = (value: unknown): EngineerStepInputs =>
  validateAs(value, (inputs): inputs is EngineerStepInputs => inputs.role === 'engineer', 'engineer');
export const validateWorkTurnInputs = (value: unknown): WorkTurnStepInputs =>
  validateAs(value, (inputs): inputs is WorkTurnStepInputs => inputs.role === 'local-architect' && inputs.phase === 'work-turn', 'local architect work-turn');
export const validateSelectorInputs = (value: unknown): SelectorStepInputs =>
  validateAs(value, (inputs): inputs is SelectorStepInputs => inputs.role === 'context-selector', 'context selector');
export const validateReviewInputs = (value: unknown): ReviewStepInputs =>
  validateAs(value, (inputs): inputs is ReviewStepInputs => inputs.role === 'reviewer' && inputs.question !== 'design-orientation', 'review');
export const validateDesignOrientationInputs = (value: unknown): DesignOrientationStepInputs =>
  validateAs(value, (inputs): inputs is DesignOrientationStepInputs => inputs.role === 'reviewer' && inputs.question === 'design-orientation', 'design orientation');
export const validateOrientationInputs = (value: unknown): OrientationStepInputs =>
  validateAs(value, (inputs): inputs is OrientationStepInputs => inputs.role === 'local-architect' && inputs.phase === 'orientation', 'local architect orientation');

/** The bytes step inputs are written as. */
export function serializeStepInputs(inputs: StepInputs): string {
  return `${JSON.stringify(validateStepInputs(inputs), null, 2)}\n`;
}

/** Reads step inputs from their written bytes. */
export function parseStepInputs(bytes: string): StepInputs {
  let value: unknown;
  try { value = JSON.parse(bytes); }
  catch (error) { throw new StepInputsError([`(root): not JSON: ${error instanceof Error ? error.message : String(error)}`]); }
  return validateStepInputs(value);
}

/** A project-relative path field. */
export const projectPath = (path: string): ProjectPath => ({ project: path === '' ? '.' : path });

function canonical(value: unknown): string {
  const order = (item: unknown): unknown => Array.isArray(item) ? item.map(order)
    : item !== null && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, child]) => [key, order(child)]))
      : item;
  return JSON.stringify(order(value));
}
