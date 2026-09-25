import { z } from 'zod';

/*
 * The vocabulary of the evidence a run works from: how a module is named,
 * how a digest is written, how a claim is cited, which architect view an
 * input manifest describes, and the module tree a client draws.
 *
 * These were the implementation map's, and they outlived it: the initial
 * analysis, the registry, the hypotheses and the work items all name modules
 * and cite the view. Like every file beside it, this one imports nothing but
 * `zod` and its siblings, so every export promises browser safety.
 */

const text = z.string().trim().min(1);

/** A module's declared-name path from the root, such as `app/orders/pricing`. */
export const modulePathSchema = z.string().regex(/^[^/\s]+(?:\/[^/\s]+)*$/, 'A module is named by its declared-name path, such as "app/orders"');
export type ModulePath = z.infer<typeof modulePathSchema>;

/** A SHA-256 digest in lowercase hexadecimal. */
export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, 'A SHA-256 digest in lowercase hexadecimal');

/**
 * Where a claim can be verified. It names the module whose view records it,
 * and may narrow that to a file of the view and a symbol the module owns.
 * What it names must exist in the view it cites.
 */
export const citationSchema = z.object({
  module: modulePathSchema,
  /** A path within the cited view, or of the project's source. */
  file: z.string().optional(),
  /** An exported name the cited module owns. */
  symbol: z.string().optional(),
  note: z.string().optional(),
}).strict();
export type Citation = z.infer<typeof citationSchema>;

/**
 * The architect view a run worked from. Until the harness materializes it,
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
 * A run's input manifest. A `null` version names an input the harness does
 * not have yet; `source` is `null` outside a git checkout.
 */
export const inputManifestSchema = z.object({
  planHash: sha256Schema,
  /** Present for Plan 13 runs; old single-plan runs intentionally omit it. */
  documentManifest: z.object({ path: z.string().min(1), hash: sha256Schema }).strict().optional(),
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

/** Whether `module` is `ancestor` or lies beneath it. */
export function isWithin(module: string, ancestor: string): boolean {
  return module === ancestor || module.startsWith(`${ancestor}/`);
}

/** A module of the tree: its declared-name path, its project-relative directory (`''` for the root) and its parent. */
export const treeModuleSchema = z.object({
  module: z.string().min(1),
  dir: z.string(),
  parent: z.string().min(1).nullable(),
}).strict();
export type TreeModule = z.infer<typeof treeModuleSchema>;

/**
 * `GET /api/v1/project/modules`: the module tree of the architect view as
 * last materialized, with that view's revision and input identity, or why
 * there is none yet.
 */
export const moduleTreeResponseSchema = z.object({
  tree: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('available'),
      revision: z.string().min(1),
      input: z.string().min(1),
      modules: z.array(treeModuleSchema),
    }).strict(),
    z.object({ status: z.literal('unavailable'), message: z.string().min(1) }).strict(),
  ]),
}).strict();
export type ModuleTreeResponse = z.infer<typeof moduleTreeResponseSchema>;
export type ModuleTree = ModuleTreeResponse['tree'];
