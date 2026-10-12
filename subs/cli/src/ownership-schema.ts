import { z } from 'zod';
import { isProjectExclusion, isProjectOwnership } from '../../analysis/subs/project/src/ownership-validation.js';
import type { ProjectExclusion, ProjectOwnership } from '../../analysis/subs/project/src/interfaces/project.js';
import type { AnalysisCode } from '../../analysis/src/interfaces/analysis.js';
import type { OwnershipDocument } from './interfaces/cli.js';

const location = z.strictObject({ file: z.string(), start: z.int().nonnegative(), end: z.int().nonnegative(),
  line: z.int().positive(), column: z.int().positive() });
const diagnosticCodes = [
  'invalid-registry', 'unknown-tag', 'invalid-module-id', 'duplicate-module', 'invalid-tree',
  'invalid-original', 'missing-required-tag', 'conflicting-tags', 'ungrounded-exposure', 'same-owner',
  'exposed', 'symbol-free', 'testing-origin', 'not-visible', 'required-importer-tag',
  'required-symbol-tag', 'invalid-encoding', 'bare-cr', 'invalid-whitespace', 'unterminated-string',
  'invalid-escape', 'invalid-scalar', 'invalid-name', 'empty-name', 'reserved-name',
  'missing-version', 'unsupported-version', 'missing-header', 'duplicate-header', 'invalid-order',
  'unknown-clause', 'invalid-selection', 'invalid-list', 'invalid-destination', 'duplicate-tag',
  'duplicate-destination', 'invalid-tag-syntax', 'unknown-statement', 'test-profile-declaration', 'missing-from',
  'missing-to', 'trailing-token', 'missing-file', 'missing-export', 'foreign-original',
  'incomplete-expansion', 'ambiguous-expansion', 'invalid-wildcard-target', 'unknown-child', 'name-collision',
  'auxiliary-original-exposure', 'invalid-prerequisite', 'root-not-found', 'missing-root-description', 'unmarked-root-description',
  'configuration-not-found', 'references-only-configuration', 'invalid-layout', 'invalid-description', 'duplicate-name',
  'description-in-src', 'stray-description', 'reserved-container', 'undeclared-project-boundary', 'invalid-nested-tree',
  'missing-owned-unwired', 'missing-owned-nested-project', 'overlapping-nested-tree', 'symlink-root', 'symlink-description',
  'symlink-reference', 'case-mismatch', 'invalid-path', 'resource-limit', 'read-failure',
  'changed-input', 'invalid-invocation', 'unavailable-capability', 'missing-stage', 'session-used',
  'session-disposed', 'output-failure', 'internal-error', 'exposed-without-companion', 'project-boundary-import'
] as const satisfies readonly AnalysisCode[];
const diagnostic = z.strictObject({ id: z.string(), category: z.enum(['invocation', 'registry', 'layout', 'description',
  'missing-export', 'import', 'exposure', 'acquisition', 'unavailable', 'execution', 'limit']), code: z.enum(diagnosticCodes), message: z.string(),
  location: location.nullable(), related: z.array(location),
  importer: z.strictObject({ owner: z.string(), kind: z.enum(['ordinary', 'tests']), root: z.string(), profile: z.array(z.string()) }).nullable(),
  original: z.strictObject({ kind: z.enum(['code', 'resource']), owner: z.string(), file: z.string(), binding: z.string() }).nullable(),
  accessId: z.string().nullable(), limit: z.strictObject({ name: z.string(), maximum: z.int().nonnegative(), observed: z.int().nonnegative(),
    collectedPrefix: z.literal(true) }).optional() });
const stageId = z.enum(['registry', 'acquisition', 'parse', 'catalog', 'link', 'access', 'decide', 'report']);
const stage = z.strictObject({ stage: stageId, status: z.enum(['completed', 'invalid', 'blocked', 'unavailable', 'failed', 'not-requested']),
  blockedBy: z.array(stageId), diagnosticIds: z.array(z.string()) });
/** Shared exact producer records for owner-local response decoders. */
export const diagnosticSchema = diagnostic;
export const stageSchema = stage;
export const sourceLocationSchema = location;
const exclusion = z.custom<ProjectExclusion>(isProjectExclusion, 'Invalid project exclusion');
const pathOwnership = z.union([
  z.strictObject({ status: z.literal('owned'), module: z.string(), directory: z.string(), exclusion: exclusion.nullable() }),
  z.strictObject({ status: z.literal('excluded'), module: z.null(), exclusion }),
  z.strictObject({ status: z.literal('outside-project'), module: z.null() }),
  z.strictObject({ status: z.literal('invalid-path'), message: z.string() }),
]);
const common = { schemaVersion: z.literal('ramify.ownership/1'), ramifyVersion: z.string() };
export const projectWarningSchema = z.strictObject({ code: z.enum(['compiler-selected-owned-unwired', 'compiler-selected-owned-nested-project', 'compiler-selected-scratch', 'ignored-but-walked']), path: z.string(), message: z.string(), files: z.array(z.string()).optional(),
  count: z.int().nonnegative().optional() });
const failure = { ...common, root: z.string().nullable(), diagnostics: z.array(diagnostic), stages: z.array(stage).optional() };
/** Strict ownership decoder; the project owner supplies the shared table and exclusion rules. */
export const ownershipDocumentSchema: z.ZodType<OwnershipDocument> = z.union([
  z.strictObject({ ...common, status: z.literal('answered'), exitCode: z.literal(0), root: z.string(), inputId: z.string(),
    scope: z.strictObject({ configuration: z.string(), ownership: z.custom<ProjectOwnership>(isProjectOwnership, 'Invalid project ownership') }),
    paths: z.array(z.strictObject({ path: z.string(), ownership: pathOwnership })),
    warnings: z.array(projectWarningSchema) }),
  z.strictObject({ ...failure, status: z.literal('invalid'), exitCode: z.literal(1) }),
  z.strictObject({ ...failure, status: z.literal('incomplete'), exitCode: z.literal(2) }),
  z.strictObject({ ...failure, status: z.literal('unavailable'), exitCode: z.literal(2) }),
]);
