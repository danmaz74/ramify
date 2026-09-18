/**
 * The one canonical predicate for Ramify's reserved generated-output path
 * segments. It reserves two generated views, each with its two transient
 * publisher siblings:
 *
 * - the API view's `.ramify` catalog, `.ramify.tmp-<suffix>` (staging) and
 *   `.ramify.old-<suffix>` (rollback);
 * - the architect view's `.ramify-architect` directory,
 *   `.ramify-architect.tmp-<suffix>` and `.ramify-architect.old-<suffix>`.
 *
 * It is a closed enumeration, not a prefix match: `.ramify-other`,
 * `.ramify-architects`, `.ramify2`, `.ramify.tmp` and `.ramify-architect.tmp`
 * (no trailing `-<suffix>`) and `.ramifyx` are ordinary segments and never
 * match. A publisher's marker file, `<sibling>.marker.json`, matches its
 * sibling's form.
 *
 * The predicate applies at any segment position of a project-relative (or
 * absolute) path, not only directly beneath a module's `src/` or
 * `src/tests/` or at the project root, so a single check covers both views
 * and their transient siblings wherever the publisher places them. Callers
 * apply it before a path can become application source, an outside-module
 * input, a declared exposure target, a captured/observed input or a watched
 * event.
 */
const reservedNames = new Set(['.ramify', '.ramify-architect']);
const transientPattern = /^\.ramify(?:-architect)?\.(?:tmp|old)-.+$/;

/** True when `segment` alone (no separators) is one of the six reserved forms. */
export function isRamifyGeneratedSegment(segment: string): boolean {
  return reservedNames.has(segment) || transientPattern.test(segment);
}

/**
 * True when any `/`-separated segment of `path` is reserved. Accepts a
 * relative or absolute path; a bare segment name (no `/`) is checked
 * directly, so the same predicate serves both a full path and one path
 * component.
 */
export function isRamifyGeneratedPath(path: string): boolean {
  return path.split('/').some(isRamifyGeneratedSegment);
}
