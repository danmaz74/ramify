import type { ProjectExclusion, ProjectOwnership } from './interfaces/project.js';

const string = (value: unknown): value is string => typeof value === 'string';
function shape(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

// Owned nested and scratch exclusions carry their owner; every other kind is unowned.
const ownedExclusions = ['owned-unwired', 'owned-nested-project', 'scratch'];
const unownedExclusions = ['external', 'repository', 'packages', 'output', 'generated'];
export function isProjectExclusion(value: unknown): value is ProjectExclusion {
  return shape(value, ['kind', 'directory', 'owner']) && string(value.directory)
    && (ownedExclusions.includes(value.kind as string) ? string(value.owner) : unownedExclusions.includes(value.kind as string) && value.owner === null);
}
export function isProjectOwnership(value: unknown): value is ProjectOwnership {
  return shape(value, ['modules', 'exclusions']) && Array.isArray(value.modules) && value.modules.every(module =>
    shape(module, ['id', 'parent', 'directory']) && string(module.id) && (module.parent === null || string(module.parent)) && string(module.directory))
    && Array.isArray(value.exclusions) && value.exclusions.every(isProjectExclusion);
}
