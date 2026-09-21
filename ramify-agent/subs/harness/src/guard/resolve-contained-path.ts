import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

/*
 * Adapted from cucumber-viz 0.7.0,
 * src/domain-sub-apps/implementation-studio/core/runtime/sealed-files/sealed-path-containment.ts,
 * lines 40-71 (`resolveContainedPath`). The sealed-approval error type is replaced by a result;
 * the containment logic is unchanged. Same author; licensed here under GPL-3.0 with ramify-agent.
 * The remainder of cucumber-viz's containment file was read, not copied.
 *
 * `resolveContainedPath` is lexical only. This plan's adjustment is
 * `resolveRealTarget` below: the guard first takes `realpath` of the target,
 * or of the nearest existing ancestor of a path that does not exist yet, and
 * appends the remaining components after validating them. That is what lets
 * an authorized bootstrap scope create missing intermediate directories while
 * traversal and symlink escapes stay blocked. A target that cannot be
 * resolved at all is its own answer, distinct from one proven to be outside
 * the scope.
 *
 * Deferred: revalidating device and inode around a rename.
 */

export type Containment =
  | { readonly ok: true; readonly resolved: string }
  | { readonly ok: false; readonly resolved: string; readonly reason: 'absolute' | 'escapes-root' };

/** Resolves a relative path only when it stays lexically inside the given root. */
export function resolveContainedPath(root: string, candidate: string): Containment {
  const containmentRoot = resolve(root);
  const resolved = resolve(containmentRoot, candidate);

  if (isAbsolute(candidate)) return { ok: false, resolved, reason: 'absolute' };

  const relativePath = relative(containmentRoot, resolved);
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return { ok: false, resolved, reason: 'escapes-root' };
  }
  return { ok: true, resolved };
}

/** Whether one already canonical path lies strictly beneath one canonical root. */
export function isContained(root: string, canonicalTarget: string): boolean {
  const within = relative(resolve(root), canonicalTarget);
  return resolveContainedPath(resolve(root), within).ok;
}

/** A target resolved to its real path, or the reason it could not be resolved. */
export type RealTarget =
  | { readonly ok: true; readonly resolved: string; readonly existed: boolean }
  | { readonly ok: false; readonly reason: string };

/**
 * The real path of a write target. An existing path is its own `realpath`; a
 * path that does not exist yet is the `realpath` of its nearest existing
 * ancestor with the remaining components appended, each validated first, so a
 * missing intermediate directory inside an authorized scope is not a failure.
 *
 * Unresolvable is its own answer: no path at all, an ancestor that is not a
 * directory, a symlink the operating system cannot follow, or a component
 * that is not a plain name.
 */
export async function resolveRealTarget(workingDirectory: string, candidate: string): Promise<RealTarget> {
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    return { ok: false, reason: 'the call names no path' };
  }
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(workingDirectory, candidate);
  const remaining: string[] = [];
  let current = absolute;
  for (;;) {
    let real: string;
    try {
      real = await realpath(current);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') return { ok: false, reason: `${current} cannot be resolved (${code ?? 'unknown error'})` };
      const parent = parse(current).dir;
      if (parent === current) return { ok: false, reason: `${absolute} has no existing ancestor` };
      const name = current.slice(parent.length + sep.length);
      if (name === '' || name === '.' || name === '..') return { ok: false, reason: `${absolute} names a component that is not a file name`};
      remaining.unshift(name);
      current = parent;
      continue;
    }
    if (remaining.length === 0) return { ok: true, resolved: real, existed: true };
    const directory = await stat(real).then(entry => entry.isDirectory(), () => false);
    if (!directory) return { ok: false, reason: `${real} is not a directory, so ${remaining.join('/')} cannot lie beneath it` };
    return { ok: true, resolved: join(real, ...remaining), existed: false };
  }
}
