import { isAbsolute, relative, resolve, sep } from 'node:path';
import { isContained } from '../guard/resolve-contained-path.js';
import type { GuardedScope } from '../guard/write-guard.js';
import type { ObservationLog } from './observations.js';

/*
 * What a writer changed, as the tree reports it.
 *
 * Two observations describe it and they answer different questions. One is
 * made for each settled mutating call, whether the call succeeded or not,
 * and names the paths the harness knows that call asked for. The other is
 * made once, when the writer settles: `git status` gives every path changed
 * since the last accepted commit, which is the only way a write no guard saw
 * becomes visible. No new machinery is needed for it, and none is added.
 *
 * Comparing that snapshot with the write scope fills
 * `InvocationOutcome.outsideScope`. A path is reported there, never blocked:
 * the shell's writes pass no guard, and the MVP states that limit rather
 * than implying an enforcement it does not have.
 */

/** What the tree said when the writer settled. */
export interface MutationSnapshot {
  /** Every path changed since the last accepted commit, project-relative. */
  readonly paths: readonly string[];
  /** Those of them that lie outside the write scope this invocation held. */
  readonly outsideScope: readonly string[];
  /** Why the snapshot could not be taken, where it could not. */
  readonly failure: string | null;
}

export interface SnapshotRequest {
  readonly projectRoot: string;
  /** What `git status` reports; the caller supplies it so that the tree is read in one place. */
  readonly changed: () => Promise<readonly string[]>;
  /** The scope this writer held, or undefined for an invocation that held none. */
  readonly scope: GuardedScope | undefined;
}

/**
 * The snapshot one settled writer leaves. A repository that cannot answer
 * leaves its reason, and neither an empty list nor an empty `outsideScope`
 * is then reported as evidence.
 */
export async function takeMutationSnapshot(request: SnapshotRequest): Promise<MutationSnapshot> {
  let paths: readonly string[];
  try {
    paths = await request.changed();
  } catch (error) {
    return { paths: [], outsideScope: [], failure: error instanceof Error ? error.message : String(error) };
  }
  const relatives = [...new Set(paths.map(path => toRelative(request.projectRoot, path)))].sort();
  return {
    paths: relatives,
    outsideScope: request.scope === undefined ? [...relatives] : outsideScope(request.projectRoot, request.scope, relatives),
    failure: null,
  };
}

/**
 * Which of these paths lie outside the scope. The check is lexical and takes
 * no `realpath`: a path the snapshot names may have been deleted, and a
 * deletion outside the scope is as much an outside change as a write is.
 */
export function outsideScope(projectRoot: string, scope: GuardedScope, paths: readonly string[]): string[] {
  return paths.filter(path => {
    const absolute = resolve(projectRoot, path);
    if (scope.files.includes(absolute)) return false;
    return !scope.roots.some(root => isContained(root, absolute));
  });
}

/** Project-relative and forward-slashed, which is how every record names a path. */
export function toRelative(projectRoot: string, path: string): string {
  const inside = relative(projectRoot, isAbsolute(path) ? path : resolve(projectRoot, path));
  return inside.split(sep).join('/');
}

/**
 * Takes the snapshot one settled writer leaves and records it: the changed
 * paths as a `mutation` observed by the snapshot, or the gap when the tree
 * could not be read. It is the only observation that sees a write no guard
 * saw, and nothing here blocks anything.
 */
export async function recordSettledSnapshot(request: SnapshotRequest, observations: ObservationLog): Promise<MutationSnapshot> {
  const snapshot = await takeMutationSnapshot(request);
  if (snapshot.failure !== null) {
    await observations.record({
      type: 'coverage-gap',
      data: { kind: 'changed-paths-unknown', detail: `the tree could not be read when the writer settled (${snapshot.failure})` },
    });
    return snapshot;
  }
  await observations.record({
    type: 'mutation',
    data: {
      callId: null,
      paths: [...snapshot.paths],
      added: null,
      deleted: null,
      observedBy: 'snapshot',
      toolFailed: false,
      // The snapshot covers everything since the last accepted commit,
      // which may include an earlier session of the same work, so it is
      // not one call's doing.
      attributable: false,
    },
  });
  return snapshot;
}
