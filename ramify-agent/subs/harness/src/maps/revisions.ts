import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  implementationMapSchema,
  mapApprovalSchema,
  type ImplementationMap,
  type MapApproval,
} from '../interfaces/map.js';
import type { RevisionEntry } from '../interfaces/protocol/maps.js';
import { approvalFileName, mapDirectory, revisionFileName } from '../jobs/records.js';
import { sha256 } from '../mapping/procedure.js';

/*
 * A plan's saved map revisions, `plans/<plan-id>/map/<n>.json`, and their
 * approval records beside them. Both are read as files: a revision is
 * immutable once saved, and an approval is written once.
 */

/** A saved revision as read: its parsed map, its file's hash and its approval, or why it cannot be read. */
export type SavedRevision =
  | { readonly status: 'readable'; readonly revision: number; readonly path: string; readonly mapHash: string; readonly map: ImplementationMap; readonly approval: MapApproval | null }
  | { readonly status: 'unreadable'; readonly revision: number; readonly path: string; readonly message: string };

/** The revision numbers saved for a plan, newest first. */
export async function savedRevisionNumbers(projectRoot: string, planId: string): Promise<number[]> {
  let names: string[];
  try {
    names = await readdir(mapDirectory(projectRoot, planId));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return [];
    throw error;
  }
  // Only a file named as the harness names revisions, such as `001.json`.
  return names
    .filter(name => /^\d+\.json$/.test(name))
    .map(name => ({ name, revision: Number(name.slice(0, -'.json'.length)) }))
    .filter(({ name, revision }) => revision > 0 && revisionFileName(revision) === name)
    .map(({ revision }) => revision)
    .sort((a, b) => b - a);
}

/** One saved revision, or `undefined` when no file holds it. */
export async function readRevision(projectRoot: string, planId: string, revision: number): Promise<SavedRevision | undefined> {
  const path = `plans/${planId}/map/${revisionFileName(revision)}`;
  let bytes: Buffer;
  try {
    bytes = await readFile(join(mapDirectory(projectRoot, planId), revisionFileName(revision)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return { status: 'unreadable', revision, path, message: errorMessage(error) };
  }
  let map: ImplementationMap;
  try {
    map = implementationMapSchema.parse(JSON.parse(bytes.toString('utf8')));
  } catch (error) {
    return { status: 'unreadable', revision, path, message: `Not a valid implementation map: ${errorMessage(error).slice(0, 500)}` };
  }
  if (map.identity.planId !== planId || map.identity.revision !== revision) {
    return { status: 'unreadable', revision, path, message: `The map names plan "${map.identity.planId}" revision ${map.identity.revision}` };
  }
  let approval: MapApproval | null;
  try {
    approval = await readApproval(projectRoot, planId, revision);
  } catch (error) {
    return { status: 'unreadable', revision, path, message: `The approval record cannot be read: ${errorMessage(error).slice(0, 500)}` };
  }
  return { status: 'readable', revision, path, mapHash: sha256(bytes), map, approval };
}

/** A revision's approval record, or `null` when it was never approved. */
export async function readApproval(projectRoot: string, planId: string, revision: number): Promise<MapApproval | null> {
  let text: string;
  try {
    text = await readFile(join(mapDirectory(projectRoot, planId), approvalFileName(revision)), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return mapApprovalSchema.parse(JSON.parse(text));
}

/** Every saved revision of a plan, newest first, as the protocol lists them. */
export async function listRevisions(projectRoot: string, planId: string): Promise<RevisionEntry[]> {
  const entries: RevisionEntry[] = [];
  for (const revision of await savedRevisionNumbers(projectRoot, planId)) {
    const saved = await readRevision(projectRoot, planId, revision);
    if (!saved) continue;
    entries.push(saved.status === 'readable'
      ? { status: 'readable', revision, path: saved.path, jobId: saved.map.identity.jobId, mapHash: saved.mapHash, approval: saved.approval }
      : saved);
  }
  return entries;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
