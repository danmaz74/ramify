import { z } from 'zod';

/*
 * The implementation map: where the implementation of a plan falls on the
 * module tree. An architect submits the sections below; the harness adds the
 * identity and saves the whole as `plans/<plan-id>/map/<revision>.json`.
 *
 * Modules are named by their declared-name path from the root, as the
 * architect view names them, such as `ramify-agent/harness/agent`.
 */

const text = z.string().trim().min(1);

/** A module's declared-name path from the root, such as `app/orders/pricing`. */
export const modulePathSchema = z.string().regex(/^[^/\s]+(?:\/[^/\s]+)*$/, 'A module is named by its declared-name path, such as "app/orders"');
export type ModulePath = z.infer<typeof modulePathSchema>;

/** A SHA-256 digest in lowercase hexadecimal. */
export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, 'A SHA-256 digest in lowercase hexadecimal');

export const weightSchema = z.enum(['heavy', 'light', 'exposure-only']);
export type Weight = z.infer<typeof weightSchema>;

/** A module the change touches. A proposed module does not exist yet. */
export const touchedModuleSchema = z.object({
  module: modulePathSchema,
  weight: weightSchema,
  why: text,
  proposed: z.object({
    parent: modulePathSchema,
    purpose: text,
    tags: z.array(z.string().min(1)),
  }).strict().optional(),
}).strict();
export type TouchedModule = z.infer<typeof touchedModuleSchema>;

/** Whether the requester may use existing symbols, and the grounds for saying so. */
export const availabilitySchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('available'),
    /** The record in the requester's API view that shows the symbol, as a view path. */
    record: text,
    /** How the requester imports it. */
    importSpelling: text,
  }).strict(),
  z.object({
    status: z.literal('unavailable'),
    /** The exact exposure declarations needed, per affected module. */
    exposures: z.array(z.object({ module: modulePathSchema, declaration: text }).strict()).min(1),
  }).strict(),
  z.object({
    status: z.literal('unknown'),
    reason: text,
  }).strict(),
]);
export type Availability = z.infer<typeof availabilitySchema>;

/** Existing behavior the plan can reuse, per capability. */
export const reuseSchema = z.object({
  capability: text,
  symbols: z.array(z.object({ name: text, owner: modulePathSchema }).strict()).min(1),
  requester: z.object({
    module: modulePathSchema,
    /** The requester's source area: ordinary `src` or its tests. */
    area: z.enum(['src', 'src/tests']),
  }).strict(),
  availability: availabilitySchema,
}).strict();
export type Reuse = z.infer<typeof reuseSchema>;

/** A capability the plan needs and nothing provides yet. */
export const newCapabilitySchema = z.object({
  capability: text,
  goal: text,
  owner: modulePathSchema,
  consumers: z.array(modulePathSchema),
}).strict();
export type NewCapability = z.infer<typeof newCapabilitySchema>;

/** A new or changed capability whose consumer is in a different branch from its owner. */
export const seamSchema = z.object({
  capability: text,
  owner: modulePathSchema,
  consumer: modulePathSchema,
}).strict();
export type Seam = z.infer<typeof seamSchema>;

export const workItemSchema = z.object({
  title: text,
  subtreeRoot: modulePathSchema,
  capabilities: z.array(text).min(1),
}).strict();
export type WorkItem = z.infer<typeof workItemSchema>;

/** Where a factual claim can be verified. */
export const citationSchema = z.object({
  kind: z.enum(['view-record', 'declaration', 'source']),
  /** A path relative to the project root. */
  path: text,
  line: z.int().positive().optional(),
}).strict();
export type Citation = z.infer<typeof citationSchema>;

/** What an architect submits: every section of the map except its identity. */
export const mapSubmissionSchema = z.object({
  summary: z.object({
    /** The intended change, in a few sentences. */
    change: text,
    /** The constraints the change preserves. */
    preserves: z.array(text),
  }).strict(),
  modulesTouched: z.array(touchedModuleSchema).min(1),
  reuse: z.array(reuseSchema),
  newCapabilities: z.array(newCapabilitySchema),
  seams: z.array(seamSchema),
  entryPoint: z.object({
    /** The highest consumer of the feature. */
    module: modulePathSchema,
    /** The feature-level behavior that decides completion. */
    acceptance: text,
  }).strict(),
  workItems: z.array(workItemSchema),
  assumptions: z.object({
    assumed: z.array(text),
    notFound: z.array(text),
    coverageLimits: z.array(text),
  }).strict(),
  evidence: z.array(z.object({ claim: text, citations: z.array(citationSchema).min(1) }).strict()),
}).strict();
export type MapSubmission = z.infer<typeof mapSubmissionSchema>;

/**
 * The architect view a job worked from. Until the harness materializes it,
 * the identity is a placeholder, marked as such.
 */
export const viewIdentitySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('placeholder') }).strict(),
  z.object({
    status: z.literal('materialized'),
    revision: text,
    /** The `input` of `.ramify-architect/_meta.json`: the source state the evidence describes. */
    input: text,
    coverageLimits: z.array(text),
  }).strict(),
]);
export type ViewIdentity = z.infer<typeof viewIdentitySchema>;

/**
 * A job's input manifest. A `null` version names an input the harness does
 * not have yet; `source` is `null` outside a git checkout.
 */
export const inputManifestSchema = z.object({
  planHash: sha256Schema,
  source: z.object({ commit: z.string().min(1), dirty: z.boolean() }).strict().nullable(),
  versions: z.object({
    architectPrompt: z.string().min(1).nullable(),
    procedure: z.string().min(1).nullable(),
    skill: z.string().min(1).nullable(),
    ramify: z.string().min(1).nullable(),
  }).strict(),
  architectView: viewIdentitySchema,
}).strict();
export type InputManifest = z.infer<typeof inputManifestSchema>;

/** A saved map revision: the identity and the submitted sections. */
export const implementationMapSchema = z.object({
  schema: z.literal('ramify-agent.implementation-map/1'),
  identity: z.object({
    planId: z.string().min(1),
    revision: z.int().positive(),
    jobId: z.string().min(1),
    manifest: inputManifestSchema,
  }).strict(),
}).extend(mapSubmissionSchema.shape).strict();
export type ImplementationMap = z.infer<typeof implementationMapSchema>;

/**
 * `plans/<plan-id>/map/<revision>.approval.json`: a person approved one
 * saved revision while its plan and source were those its manifest names.
 * Written once and never changed. A later change to the plan or the source
 * leaves the record as it is; whoever relies on an approval compares its
 * identities with the current ones.
 */
export const mapApprovalSchema = z.object({
  schema: z.literal('ramify-agent.map-approval/1'),
  planId: z.string().min(1),
  revision: z.int().positive(),
  /** The SHA-256 of the saved map file's bytes. */
  mapHash: sha256Schema,
  /** The plan hash of the map's manifest, which `plan.md` still had. */
  planHash: sha256Schema,
  /** The architect view's input identity of the map's manifest, which the source still had. */
  input: text,
  approvedAt: z.iso.datetime(),
}).strict();
export type MapApproval = z.infer<typeof mapApprovalSchema>;

export type ShapeValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Whether `module` is `ancestor` or lies beneath it. */
export function isWithin(module: string, ancestor: string): boolean {
  return module === ancestor || module.startsWith(`${ancestor}/`);
}

/**
 * Validates a submission's shape and its internal consistency: the schema,
 * each module touched once, an entry point among the modules touched, a
 * proposed module beneath its parent, and each seam's two sides in different
 * branches. Checks that need the project's views are the harness's.
 * Errors name the offending path, such as `seams.0.consumer: ...`.
 */
export function validateMapSubmission(input: unknown): ShapeValidation<MapSubmission> {
  const parsed = mapSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map(issue => `${issue.path.length ? issue.path.join('.') : 'submission'}: ${issue.message}`) };
  }
  const map = parsed.data;
  const errors: string[] = [];
  const touched = new Set<string>();
  map.modulesTouched.forEach((entry, index) => {
    if (touched.has(entry.module)) errors.push(`modulesTouched.${index}.module: "${entry.module}" is listed more than once`);
    touched.add(entry.module);
    if (entry.proposed && !isWithin(entry.module, entry.proposed.parent)) {
      errors.push(`modulesTouched.${index}.proposed.parent: "${entry.module}" is not beneath "${entry.proposed.parent}"`);
    }
  });
  if (!touched.has(map.entryPoint.module)) {
    errors.push(`entryPoint.module: "${map.entryPoint.module}" is not among the modules touched`);
  }
  map.seams.forEach((seam, index) => {
    if (isWithin(seam.owner, seam.consumer) || isWithin(seam.consumer, seam.owner)) {
      errors.push(`seams.${index}: "${seam.owner}" and "${seam.consumer}" are in the same branch`);
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: map };
}
