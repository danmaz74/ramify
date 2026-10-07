import type { AffectedDocument } from 'ramify.ts/cli';

/** Decode the installed CLI's revision-bound ownership answer before any caller uses it. */
export function decodeOwnershipAnswer(value: unknown, expectedRoot: string): AffectedDocument {
  const fail = (field: string): never => { throw new Error(`Invalid ramify.affected-cli/4 ownership answer: ${field}`); };
  const object = (candidate: unknown, field: string): Record<string, unknown> => {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) fail(field);
    return candidate as Record<string, unknown>;
  };
  const string = (candidate: unknown, field: string): string => typeof candidate === 'string' && candidate.length > 0 ? candidate : fail(field);
  const strings = (candidate: unknown, field: string): string[] =>
    Array.isArray(candidate) && candidate.every(item => typeof item === 'string') ? candidate : fail(field);
  const list = (candidate: unknown, field: string): unknown[] => Array.isArray(candidate) ? candidate : fail(field);
  const safePath = (candidate: unknown, field: string, outside = false): string => {
    const path = string(candidate, field);
    if (path === '.') return path;
    if (path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/u.test(path) || path.includes('\0') || path.split('/').some(part => part === '' || part === '.' || (!outside && part === '..'))) fail(field);
    return path;
  };
  const contains = (path: string, directory: string): boolean => directory === '.' || path === directory || path.startsWith(`${directory}/`);
  const answer = object(value, 'document');
  if (answer.schemaVersion !== 'ramify.affected-cli/4' || answer.root !== expectedRoot || answer.mode !== 'batch') fail('schema, root or mode');
  const revision = object(answer.revision, 'revision');
  if (revision.sequence !== null) fail('batch revision sequence');
  const inputId = string(revision.inputId, 'revision.inputId');
  string(answer.ramifyVersion, 'ramifyVersion');
  const selection = object(answer.selection, 'selection');
  if (selection.schemaVersion !== 'ramify.affected/4' || selection.inputId !== inputId) fail('selection identity');
  if (selection.selection !== 'all-modules' && selection.selection !== 'dependency-closure') fail('selection.selection');
  const widening = strings(selection.widening, 'selection.widening');
  if (widening.some(item => item !== 'unowned-path' && item !== 'partial-coverage') ||
      (selection.selection === 'dependency-closure' && widening.length !== 0)) fail('selection.widening');
  if (selection.analysisCheck !== 'passed' && selection.analysisCheck !== 'failed') fail('selection.analysisCheck');
  const coverage = object(selection.coverage, 'selection.coverage');
  if (coverage.status !== 'complete' && coverage.status !== 'partial') fail('selection.coverage.status');
  list(coverage.notes, 'selection.coverage.notes');
  const scope = object(selection.scope, 'selection.scope');
  if (scope.root !== expectedRoot || (scope.selection !== 'given' && scope.selection !== 'found')) fail('scope identity');
  string(scope.configuration, 'scope.configuration');
  strings(scope.walkedAreas, 'scope.walkedAreas');
  const ownership = object(scope.ownership, 'scope.ownership');
  const modules = list(ownership.modules, 'ownership.modules');
  const owners = new Map<string, string>();
  const ownerDirectories = new Set<string>();
  const parents = new Map<string, string | null>();
  for (const item of modules) {
    const module = object(item, 'ownership.module');
    const id = string(module.id, 'ownership.module.id');
    if (module.parent !== null) string(module.parent, 'ownership.module.parent');
    const directory = safePath(module.directory, 'ownership.module.directory');
    if (owners.has(id) || ownerDirectories.has(directory)) fail('duplicate ownership module or directory');
    owners.set(id, directory);
    ownerDirectories.add(directory);
    parents.set(id, module.parent as string | null);
  }
  if ([...parents.values()].filter(parent => parent === null).length !== 1 ||
      [...parents.values()].some(parent => parent !== null && !owners.has(parent))) fail('ownership parent');
  const rootOwner = [...parents].find(([, parent]) => parent === null)![0];
  if (owners.get(rootOwner) !== '.') fail('root directory');
  for (const [id, parent] of parents) {
    const visited = new Set<string>();
    let cursor: string | null = id;
    while (cursor !== null) {
      if (visited.has(cursor)) fail('ownership cycle');
      visited.add(cursor); cursor = parents.get(cursor)!;
    }
    if (parent !== null) {
      const directory = owners.get(id)!;
      const parentDirectory = owners.get(parent)!;
      if (!id.startsWith(`${parent}/`) || id.slice(parent.length + 1).includes('/') || directory === parentDirectory || !contains(directory, parentDirectory) || [...owners].some(([other, otherDirectory]) => other !== id && other !== parent && contains(directory, otherDirectory) && otherDirectory.length > parentDirectory.length)) fail('ownership parent directory');
    }
  }
  const exclusions = list(ownership.exclusions, 'ownership.exclusions');
  const exclusionKinds = new Set(['owned-unwired', 'owned-nested-project', 'external', 'scratch', 'repository', 'packages', 'output', 'generated']);
  const exclusionDirectories = new Set<string>();
  const checkExclusion = (item: unknown): void => {
    const exclusion = object(item, 'exclusion');
    if (!exclusionKinds.has(String(exclusion.kind))) fail('exclusion.kind');
    const directory = safePath(exclusion.directory, 'exclusion.directory');
    if (directory === '.') fail('root exclusion');
    if (exclusion.owner !== null && !owners.has(string(exclusion.owner, 'exclusion.owner'))) fail('exclusion.owner');
    if (['owned-unwired', 'owned-nested-project', 'scratch'].includes(String(exclusion.kind)) && exclusion.owner === null) fail('owned exclusion owner');
    if (exclusion.owner !== null && !contains(directory, owners.get(String(exclusion.owner))!)) fail('exclusion outside owner');
    if (!['owned-unwired', 'owned-nested-project', 'scratch'].includes(String(exclusion.kind)) && exclusion.owner !== null) fail('unowned exclusion owner');
  };
  for (const item of exclusions) {
    checkExclusion(item);
    const directory = (item as { directory: string }).directory;
    if (exclusionDirectories.has(directory)) fail('duplicate exclusion directory');
    exclusionDirectories.add(directory);
  }
  const knownExclusion = (item: unknown): Record<string, unknown> => {
    checkExclusion(item);
    const exclusion = item as Record<string, unknown>;
    if (!exclusions.some(candidate => {
      const current = candidate as Record<string, unknown>;
      return current.directory === exclusion.directory && current.kind === exclusion.kind && current.owner === exclusion.owner;
    }) && !['repository', 'packages', 'generated'].includes(String(exclusion.kind))) fail('path exclusion absent from topology');
    return exclusion;
  };
  for (const field of ['changedModules', 'affectedModules', 'testModules']) {
    const identities = new Set<string>();
    for (const item of list(selection[field], field)) {
      const module = object(item, field);
      const id = string(module.id, `${field}.id`);
      if (identities.has(id)) fail(`${field} duplicate identity`);
      identities.add(id);
      if (owners.get(id) !== string(module.directory, `${field}.directory`)) fail(`${field} topology`);
    }
  }
  const pathKinds = new Set(['source-area', 'auxiliary-source', 'description', 'readme', 'captured-input', 'inert', 'ignored']);
  const pathIdentities = new Set<string>();
  for (const item of list(selection.paths, 'selection.paths')) {
    const path = object(item, 'selection.path');
    const target = safePath(path.path, 'selection.path.path', path.status === 'outside-project');
    if (pathIdentities.has(target)) fail('duplicate path identity');
    pathIdentities.add(target);
    const selects = strings(path.selects, 'selection.path.selects');
    if (new Set(selects).size !== selects.length || selects.some(module => !owners.has(module))) fail('selection.path.selects');
    if (path.status !== 'outside-project') {
      const containing = exclusions.filter(candidate => contains(target, String((candidate as Record<string, unknown>).directory))) as Record<string, unknown>[];
      const hard = containing.filter(exclusion => exclusion.owner === null);
      if (hard.length > 0 && path.status !== 'excluded') fail('owned path crosses hard exclusion');
      if (path.status === 'owned' && containing.length > 0 && path.exclusion === null) fail('missing path exclusion');
    }
    if (path.status === 'owned') {
      if (!owners.has(string(path.module, 'selection.path.module')) ||
          !['inventory', 'declaration', 'area', 'containment'].includes(String(path.basis)) ||
          !pathKinds.has(String(path.kind))) fail('owned path');
      if (!contains(target, owners.get(String(path.module))!) || [...owners].some(([id, directory]) => id !== path.module && directory !== owners.get(String(path.module)) && contains(target, directory) && directory.length > owners.get(String(path.module))!.length)) fail('path owner containment');
      if (['ignored', 'inert'].includes(String(path.kind)) && selects.length !== 0) fail('nonselecting path');
      if (path.exclusion !== null) {
        const exclusion = knownExclusion(path.exclusion);
        if (!contains(target, String(exclusion.directory))) fail('path exclusion containment');
        if (exclusion.owner !== path.module || path.kind !== 'ignored' || selects.length !== 0) fail('owned excluded path');
      }
    } else if (path.status === 'excluded') {
      if (path.module !== null || path.basis !== 'excluded' || path.kind !== null || selects.length !== 0) fail('excluded path');
      const exclusion = knownExclusion(path.exclusion);
      if (exclusion.owner !== null || !contains(target, String(exclusion.directory))) fail('excluded path owner');
    } else if (path.status === 'outside-project') {
      if (target !== '..' && !target.startsWith('../')) fail('outside path containment');
      if (path.module !== null || path.basis !== 'none' || path.exclusion !== null || path.kind !== null || selects.length !== 0) fail('outside path');
    } else fail('selection.path.status');
  }
  return value as AffectedDocument;
}
