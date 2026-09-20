import { z } from 'zod';
import { implementationMapSchema, mapApprovalSchema, sha256Schema } from '../map.js';
import { jobIdSchema } from './ids.js';

/*
 * The queries the Map page reads: a plan's saved map revisions with their
 * approvals, one revision, and the project's module tree the modules touched
 * are drawn on. Revisions are immutable; an approval is a separate record.
 */

/** A saved revision whose file is a valid map. `path` is relative to the project root. */
export const readableRevisionSchema = z.object({
  status: z.literal('readable'),
  revision: z.int().positive(),
  path: z.string().min(1),
  /** The job that saved it. */
  jobId: jobIdSchema,
  /** The SHA-256 of the file's bytes. */
  mapHash: sha256Schema,
  approval: mapApprovalSchema.nullable(),
}).strict();

/** A revision file that cannot be read as a map, or whose approval record cannot be read. */
export const unreadableRevisionSchema = z.object({
  status: z.literal('unreadable'),
  revision: z.int().positive(),
  path: z.string().min(1),
  message: z.string().min(1),
}).strict();

export const revisionEntrySchema = z.discriminatedUnion('status', [readableRevisionSchema, unreadableRevisionSchema]);
export type RevisionEntry = z.infer<typeof revisionEntrySchema>;
export type ReadableRevision = z.infer<typeof readableRevisionSchema>;

/** `GET /api/v1/plans/:planId/maps`: the plan's saved revisions, newest first. */
export const revisionListResponseSchema = z.object({ revisions: z.array(revisionEntrySchema) }).strict();
export type RevisionListResponse = z.infer<typeof revisionListResponseSchema>;

/** `GET /api/v1/plans/:planId/maps/:revision`: one saved revision, its hash and its approval. */
export const revisionResponseSchema = z.object({
  revision: z.object({
    revision: z.int().positive(),
    path: z.string().min(1),
    mapHash: sha256Schema,
    map: implementationMapSchema,
    approval: mapApprovalSchema.nullable(),
  }).strict(),
}).strict();
export type RevisionResponse = z.infer<typeof revisionResponseSchema>;
export type MapRevision = RevisionResponse['revision'];

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
