/**
 * The one canonical predicate for Ramify's reserved generated-output path
 * segments: the final `.ramify` catalog directory and its two reserved
 * transient publisher siblings, `.ramify.tmp-<suffix>` (staging) and
 * `.ramify.old-<suffix>` (rollback). It is a closed enumeration, not a
 * prefix match: `.ramify-other`, `.ramify2`, `.ramify.tmp` (no trailing
 * `-<suffix>`) and `.ramifyx` are ordinary segments and never match.
 *
 * The predicate applies at any segment position of a project-relative (or
 * absolute) path, not only directly beneath a module's `src/` or
 * `src/tests/`, so a single check covers both the final catalog and its
 * transient siblings wherever the publisher places them. Callers apply it
 * before a path can become application source, an outside-module input, a
 * declared exposure target, a captured/observed input or a watched event.
 */
const transientStagePattern = /^\.ramify\.tmp-.+$/;
const transientRollbackPattern = /^\.ramify\.old-.+$/;

/** True when `segment` alone (no separators) is one of the three reserved forms. */
export function isRamifyGeneratedSegment(segment: string): boolean {
  return segment === '.ramify' || transientStagePattern.test(segment) || transientRollbackPattern.test(segment);
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
