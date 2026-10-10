import { posix } from 'node:path';
import { z } from 'zod';
import { scenarioStateSchema } from '../../subs/scenarios/src/states.js';
import { contextPolicySchema, runPolicySchema } from '../run/records.js';
import { readSessionPointReference } from '../run/session-operations.js';
import { iterationAssignmentSchema } from '../work/iterations.js';
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
const knownFactsSchema = z.object({
  declaredChecks: z.object({ checks: z.array(jsonValueSchema), paths: z.array(projectPathSchema) }).strict(),
  modules: z.array(z.object({ module: text, directory: projectPathSchema, apiPaths: z.array(projectPathSchema) }).strict()),
  testAreas: z.array(z.object({ module: text, area: projectPathSchema }).strict()),
  scenarioFeatures: z.array(projectPathSchema),
  stepDirectories: z.array(z.object({ directory: projectPathSchema, files: z.array(projectPathSchema) }).strict()),
}).strict();

/** Where an imported step came from: the source invocation and the start it originally had. */
const provenanceSchema = z.object({
  run: z.object({ planId: text, runId: text }).strict(),
  invocation: text,
  record: runPathSchema,
  originalStart: z.enum(['fresh', 'repair-continuation', 'resumed-after-handback']),
  /** The session point the original start continued, where it continued one. */
  originalPoint: pointReferenceSchema.optional(),
}).strict();

/** The fields every engineer start shares: the fresh inputs. */
const engineerFields = {
  schema: z.literal(stepInputsSchemaId),
  role: z.literal('engineer'),
  run: z.object({ planId: text, runId: text }).strict(),
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

/** The inputs of every step this harness can construct, by role and start. */
export const stepInputsSchema = engineerStepInputsSchema;
export type StepInputs = z.infer<typeof stepInputsSchema>;

/** Why a value is not step inputs: each error with its path. */
export class StepInputsError extends Error {
  constructor(readonly errors: readonly string[]) {
    super(`Invalid step inputs (${stepInputsSchemaId}): ${errors.join('; ')}`);
    this.name = 'StepInputsError';
  }
}

/**
 * Validates step inputs: the schema of their role and start, and that they
 * survive JSON unchanged. A TypeScript type alone does not establish either.
 */
export function validateStepInputs(value: unknown): StepInputs {
  const fields = value !== null && typeof value === 'object' ? value as { schema?: unknown; role?: unknown; start?: { kind?: unknown } } : {};
  if (fields.schema !== stepInputsSchemaId) throw new StepInputsError([`schema: expected "${stepInputsSchemaId}"`]);
  if (fields.role !== 'engineer') throw new StepInputsError([`role: no step inputs are defined for ${JSON.stringify(fields.role)}; supported: "engineer"`]);
  // Each start is judged by its own member, so the errors name what that start lacks.
  const members: Readonly<Record<string, typeof freshEngineerSchema | typeof repairEngineerSchema | typeof resumedEngineerSchema>> = {
    fresh: freshEngineerSchema, 'repair-continuation': repairEngineerSchema, 'resumed-after-handback': resumedEngineerSchema,
  };
  const member = Object.hasOwn(members, String(fields.start?.kind)) ? members[String(fields.start?.kind)] : undefined;
  if (member === undefined) throw new StepInputsError([`start.kind: expected one of "fresh", "repair-continuation", "resumed-after-handback"`]);
  const parsed = member.safeParse(value);
  if (!parsed.success) throw new StepInputsError(parsed.error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`));
  const bytes = JSON.stringify(parsed.data);
  if (canonical(JSON.parse(bytes) as unknown) !== canonical(parsed.data)) throw new StepInputsError(['(root): the inputs do not survive JSON unchanged']);
  return parsed.data;
}

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
