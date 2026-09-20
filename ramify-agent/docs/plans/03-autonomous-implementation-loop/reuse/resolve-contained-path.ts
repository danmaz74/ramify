/*
 * Adapted from cucumber-viz 0.7.0,
 * src/domain-sub-apps/implementation-studio/core/runtime/sealed-files/sealed-path-containment.ts,
 * lines 40-71 (`resolveContainedPath`). The sealed-approval error type is replaced by a result;
 * the containment logic is unchanged. Same author; licensed here under GPL-3.0 with ramify-agent.
 * Reference copy. It is lexical only: the write guard first takes `realpath` of the target, or of
 * the existing parent of a new file, and then applies this check to the result.
 */
import * as path from 'node:path';

export type Containment =
  | { readonly ok: true; readonly resolved: string }
  | { readonly ok: false; readonly resolved: string; readonly reason: 'absolute' | 'escapes-root' };

/** Resolves a relative path only when it stays lexically inside the given root. */
export function resolveContainedPath(root: string, candidate: string): Containment {
  const containmentRoot = path.resolve(root);
  const resolved = path.resolve(containmentRoot, candidate);

  if (path.isAbsolute(candidate)) return { ok: false, resolved, reason: 'absolute' };

  const relative = path.relative(containmentRoot, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, resolved, reason: 'escapes-root' };
  }
  return { ok: true, resolved };
}
