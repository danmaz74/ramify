import { sep } from 'node:path';
import { gitService, type GitService } from '../../subs/evidence/src/git.js';
import type { ArchitectIndex, ModuleEntry } from '../../subs/evidence/src/views.js';
import { lineEventSummarySchema, type LineEventSummary } from '../run/records.js';

/*
 * The line events of one writer invocation, captured when the observation
 * happens and never added after a trial.
 *
 * The figures come from git and nowhere else: `git diff --numstat` against
 * the last accepted commit, with the lines of each untracked file beside it.
 * One snapshot is taken before the writer starts and one after it settles,
 * and the difference is what that invocation contributed. A session that
 * changed nothing has an empty summary and still counts as a session.
 *
 * A binary file carries its byte count and no line count: git reports no
 * lines for it, and a figure invented here would be counted by every KPI
 * that reads this record. A path the module tree maps to no owner goes to
 * the `unmapped` bucket rather than to the root, which owns its own source
 * area and not everything beneath the project.
 *
 * Two snapshots see the tree, not the history between them. A command that
 * changed a file and put it back is invisible to them, so an invocation that
 * used the unguarded shell says so in its gaps instead of reporting a
 * complete count.
 */

/** What one path changed, as git reports it. */
export interface LineChange {
  readonly path: string;
  readonly added: number;
  readonly deleted: number;
  readonly binary: boolean;
  /** The file's size where git reports no lines for it; null where it has none or could not be read. */
  readonly bytes: number | null;
}

/** A snapshot of the working directory's line changes against the last accepted commit. */
export type LineSnapshot =
  | { readonly available: true; readonly changes: readonly LineChange[] }
  | { readonly available: false; readonly reason: string };

/** Takes one snapshot. A repository that cannot answer leaves its reason, never a zero. */
export async function takeLineSnapshot(projectRoot: string, accepted: string = 'HEAD', git: GitService = gitService): Promise<LineSnapshot> {
  try {
    return { available: true, changes: await git.worktreeLineChanges(projectRoot, accepted) };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export interface LineEventRequest {
  readonly invocation: string;
  readonly before: LineSnapshot;
  readonly after: LineSnapshot;
  /** The refreshed architect view, for the owner of each path. */
  readonly index: ArchitectIndex | null;
  /**
   * Gaps the caller observed that these two snapshots cannot show, such as
   * an invocation that used the unguarded shell.
   */
  readonly gaps?: readonly string[] | undefined;
}

/**
 * What one invocation added and deleted, per path, with the owner of each
 * path where the view has one. A path the view maps to no module is counted
 * in `unmapped` rather than attributed to a module that does not own it.
 */
export function lineEvents(request: LineEventRequest): LineEventSummary {
  const gaps: string[] = [...(request.gaps ?? [])];
  if (!request.before.available) gaps.push(`changed-paths-unknown: the snapshot before the session failed (${request.before.reason})`);
  if (!request.after.available) gaps.push(`changed-paths-unknown: the snapshot after the session failed (${request.after.reason})`);
  if (request.index === null) gaps.push('the architect view was unavailable, so no path could be attributed to an owner');

  const before = new Map((request.before.available ? request.before.changes : []).map(change => [change.path, change]));
  const paths: LineEventSummary['paths'] = [];
  const unmapped = { paths: 0, added: 0, deleted: 0 };

  for (const change of request.after.available ? request.after.changes : []) {
    const earlier = before.get(change.path);
    const added = Math.max(0, change.added - (earlier?.added ?? 0));
    const deleted = Math.max(0, change.deleted - (earlier?.deleted ?? 0));
    const binaryChanged = change.binary && (earlier === undefined || earlier.bytes !== change.bytes);
    if (added === 0 && deleted === 0 && !binaryChanged) continue;
    const owner = ownerOf(request.index, change.path);
    paths.push({ path: change.path, owner, added, deleted, binary: change.binary, bytes: change.binary ? change.bytes : null });
    if (owner === null) {
      unmapped.paths += 1;
      unmapped.added += added;
      unmapped.deleted += deleted;
    }
  }

  return lineEventSummarySchema.parse({
    schema: 'ramify-agent.line-events/1',
    invocation: request.invocation,
    paths: paths.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    unmapped,
    coverage: gaps.length === 0 ? 'complete' : 'partial',
    gaps,
  } satisfies LineEventSummary);
}

/**
 * The module that owns this path: the one whose own contents contain it.
 * An owner's own contents are its source areas and its two declaration
 * files, which is what an assignment's write scope reaches. A path no
 * module's contents hold — the project's manifest, a document beside a
 * module, the run's own state — has no owner, and the root is never made to
 * stand in for one because its directory is the whole project.
 */
export function ownerOf(index: ArchitectIndex | null, path: string): string | null {
  if (index === null) return null;
  const target = path.split(sep).join('/');
  let best: { module: string; length: number } | null = null;
  for (const entry of index.modules.values()) {
    if (!owns(entry, target)) continue;
    const length = entry.dir.split(sep).join('/').length;
    if (best === null || length > best.length) best = { module: entry.module, length };
  }
  return best?.module ?? null;
}

/** Whether this module's own contents hold the path. */
function owns(entry: ModuleEntry, target: string): boolean {
  const dir = entry.dir.split(sep).join('/').replace(/\/+$/, '');
  const within = (suffix: string) => {
    const location = dir === '' ? suffix : `${dir}/${suffix}`;
    return target === location || target.startsWith(`${location}/`);
  };
  if (entry.areas.some(area => within(area))) return true;
  return ['module.ramify', 'README.md'].some(file => target === (dir === '' ? file : `${dir}/${file}`));
}
