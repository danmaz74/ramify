import { classifyProjectPath } from '../../../analysis/subs/project/src/ownership.js';
import type { PathOwner, ProjectExclusion, ProjectScope } from '../../../analysis/subs/project/src/interfaces/project.js';
import type { WatchScope } from '../../subs/contexts/src/interfaces/contexts.js';

/**
 * A watch scope as contexts builds one: Project's classifier over an ownership table.
 * Without a table only the canonical reserved-path rules exclude, as before a project's
 * first completed revision.
 */
export function watchScope(table: { readonly modules: readonly PathOwner[]; readonly exclusions: readonly ProjectExclusion[] } | null,
  sequence: number | null = table ? 1 : null): WatchScope {
  const scope: ProjectScope = { root: '/project', selection: 'given', invokedFrom: '/project', configuration: '/project/tsconfig.json',
    walkedAreas: [], ownership: table ?? { modules: [], exclusions: [] } };
  return Object.freeze({ sequence: table ? sequence : null, exclusions: scope.ownership.exclusions,
    excluded(path: string): ProjectExclusion | null {
      const owner = classifyProjectPath(scope, path);
      return owner.status === 'excluded' || owner.status === 'owned' ? owner.exclusion : null;
    } });
}

/** The reserved-path rules alone. */
export const reservedOnly: WatchScope = watchScope(null);
