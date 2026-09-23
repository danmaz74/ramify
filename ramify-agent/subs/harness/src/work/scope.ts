import { join, posix, relative, sep } from 'node:path';
import { guardedFilesHash } from '../../subs/evidence/src/guarded-files.js';
import { projectConfigurationFile } from '../../subs/evidence/src/project-configuration.js';
import { findModule, type ArchitectIndex, type ModuleEntry } from '../../subs/evidence/src/views.js';
import type { ViewIdentity } from '../interfaces/protocol/evidence.js';
import { resolveRealTarget } from '../guard/resolve-contained-path.js';
import type { GuardedScope } from '../guard/write-guard.js';
import type { IterationKind, WriteScope } from './iterations.js';

/*
 * Capturing and resolving one iteration's write scope.
 *
 * The scope of an ordinary assignment is the assigned module's own contents
 * — its source area and its two declaration files — plus the complete
 * subtree of each immediate child it names. A child subtree is wholly
 * included or wholly excluded, so a sibling the architect did not name is
 * outside the scope whatever lies beneath it.
 *
 * The paths are canonical and are captured once. A later refresh of the view
 * never widens them, and a module created inside an authorized bootstrap
 * scope is reached through the nearest existing ancestor rather than through
 * a second capture.
 */

/** The configuration a run guards: the files that decide what the checks discover and run. */
export const guardedConfigurationFiles = [
  'package.json', 'tsconfig.json', 'vitest.config.ts', 'vitest.config.js', 'vitest.config.mts',
  'vite.config.ts', 'vite.config.js', 'cucumber.js', 'ramify-agent.json',
] as const;

/** The project-relative source area of a module's own contents. */
function ownArea(dir: string): string {
  return dir === '' ? 'src' : posix.join(toPosix(dir), 'src');
}

function ownFile(dir: string, name: string): string {
  return dir === '' ? name : posix.join(toPosix(dir), name);
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

/** What a scope resolution was asked for, once the harness has validated it. */
export interface ScopeCapture {
  readonly projectRoot: string;
  readonly index: ArchitectIndex | null;
  readonly view: ViewIdentity;
  readonly revision: number;
  readonly base: WriteScope['base'];
  readonly extra: WriteScope['extra'];
  readonly read: readonly string[];
  readonly bootstrap: WriteScope['bootstrap'];
  readonly rationale: string;
}

/** The project-relative directory of one module, from the view. */
export function directoryOf(index: ArchitectIndex | null, module: string): string | null {
  const entry = index === null ? undefined : findModule(index, module);
  return entry === undefined ? null : entry.dir;
}

/**
 * Resolves the write scope's real paths. Each is canonical: an existing path
 * is its own real path, and one that does not exist yet — a bootstrap
 * module's declaration, README or source area — is resolved through its
 * nearest existing ancestor, so an absent directory is not a scope failure.
 */
export async function resolveWriteScope(capture: ScopeCapture): Promise<WriteScope> {
  const roots: string[] = [];
  const files: string[] = [];

  const addRoot = async (relativePath: string) => {
    const target = await resolveRealTarget(capture.projectRoot, relativePath);
    if (target.ok && !roots.includes(target.resolved)) roots.push(target.resolved);
  };
  const addFile = async (relativePath: string) => {
    const target = await resolveRealTarget(capture.projectRoot, relativePath);
    if (target.ok && !files.includes(target.resolved)) files.push(target.resolved);
  };

  if ('module' in capture.base) {
    const dir = directoryOf(capture.index, capture.base.module)
      ?? bootstrapDirectory(capture.bootstrap, capture.base.module);
    if (dir !== null) {
      await addRoot(ownArea(dir));
      await addFile(ownFile(dir, 'module.ramify'));
      await addFile(ownFile(dir, 'README.md'));
    }
    for (const child of capture.base.includedChildren) {
      const childDir = directoryOf(capture.index, child);
      if (childDir !== null) await addRoot(toPosix(childDir));
    }
  } else {
    for (const module of capture.base.modules) {
      const dir = directoryOf(capture.index, module);
      if (dir !== null) await addRoot(dir === '' ? '.' : toPosix(dir));
    }
  }

  for (const entry of capture.bootstrap) {
    await addRoot(ownArea(entry.directory));
    await addFile(ownFile(entry.directory, 'module.ramify'));
    await addFile(ownFile(entry.directory, 'README.md'));
  }
  for (const entry of capture.extra) {
    if (entry.kind === 'directory') await addRoot(entry.path);
    else await addFile(entry.path);
  }

  return {
    revision: capture.revision,
    base: capture.base,
    extra: [...capture.extra],
    read: [...capture.read],
    bootstrap: [...capture.bootstrap],
    rationale: capture.rationale,
    resolved: { roots, files, view: capture.view },
  };
}

/** The bootstrap directory a proposed owner was given, by the owner's own name. */
function bootstrapDirectory(bootstrap: WriteScope['bootstrap'], module: string): string | null {
  const name = module.split('/').at(-1);
  const entry = bootstrap.find(candidate => candidate.directory.split('/').at(-1) === name);
  return entry?.directory ?? null;
}

/**
 * The scope as the guard compares against it. `denied` are canonical files
 * the guard refuses whatever the scope contains: the tracked feature files
 * and the project's configuration, which only the harness writes.
 */
export function guardedScopeOf(scope: WriteScope, denied: readonly string[] = []): GuardedScope {
  return { revision: scope.revision, roots: scope.resolved.roots, files: scope.resolved.files, denied };
}

/**
 * The canonical files no agent may edit or write, whatever its scope: the
 * project's configuration for the harness and every tracked feature file,
 * both project-relative in. A path that cannot be resolved is left out,
 * since nothing could write it either.
 */
export async function deniedFiles(projectRoot: string, featureFiles: readonly string[]): Promise<string[]> {
  const denied: string[] = [];
  for (const path of [projectConfigurationFile, ...featureFiles]) {
    const target = await resolveRealTarget(projectRoot, path);
    if (target.ok && !denied.includes(target.resolved)) denied.push(target.resolved);
  }
  return denied;
}

/** The project-relative paths of the scope, for a prompt and for a reader. */
export function scopePaths(projectRoot: string, scope: WriteScope): { readonly roots: string[]; readonly files: string[] } {
  const shorten = (path: string) => toPosix(relative(projectRoot, path)) || '.';
  return { roots: scope.resolved.roots.map(shorten), files: scope.resolved.files.map(shorten) };
}

/** Which checkpoint one iteration's gate is, from its kind alone. */
export function checkpointOf(kind: IterationKind): 'iteration' | 'contract' | 'breaking-iteration' {
  if (kind === 'breaking') return 'breaking-iteration';
  if (kind === 'contract') return 'contract';
  return 'iteration';
}

/**
 * The test-selection policy the harness derives. No submission carries it:
 * it follows from the kind, the scope and the evidence the iteration must
 * satisfy.
 */
export function testPolicyOf(
  kind: IterationKind,
  base: WriteScope['base'],
  evidenceObligations: ReadonlyArray<{ readonly suite: readonly string[] }>,
): { policy: 'owned-by-scope' | 'all-project'; exactOwners: string[]; subtrees: string[]; extraSuites: string[] } {
  const extraSuites = [...new Set(evidenceObligations.flatMap(obligation => [...obligation.suite]))].sort();
  if (kind === 'breaking' || !('module' in base)) {
    return { policy: 'all-project', exactOwners: [], subtrees: [], extraSuites };
  }
  return { policy: 'owned-by-scope', exactOwners: [base.module], subtrees: [...base.includedChildren], extraSuites };
}

/** What a run guards beyond the configuration and the contract artifacts. */
export interface GuardedScenarioFiles {
  /** The files `acceptance.support` names, project-relative, hashed as they stand. */
  readonly support?: readonly string[] | undefined;
  /**
   * Every tracked feature file with the hash of its expected rendering. It
   * is guarded whether or not the tree holds it, and against the rendering
   * rather than the tree, so drift already there is found.
   */
  readonly expected?: ReadonlyArray<{ readonly path: string; readonly hash: string }> | undefined;
}

/**
 * The guarded files of one assignment: the project's compiler and
 * test-runner configuration, its package manifests, its configuration for
 * the harness, the contract artifacts a registered agreement requires and
 * the scenario harness's support files, hashed as they stand, and every
 * tracked feature file with the hash of its expected rendering. A gate
 * compares the tree with these, so a change no record authorized is the
 * attempt's cause, and a deletion is `after: null` rather than an absent
 * file that passes.
 *
 * A file the project does not have is not guarded: there is nothing to
 * compare. One it does have is captured whether or not this assignment has
 * any business with it.
 */
export async function captureGuardedFiles(
  projectRoot: string,
  requiredArtifacts: readonly string[] = [],
  scenarios: GuardedScenarioFiles = {},
): Promise<Array<{ path: string; hash: string }>> {
  const expected = scenarios.expected ?? [];
  const rendered = new Set(expected.map(file => file.path));
  const hashed = await guardedFilesHash(projectRoot, [...guardedConfigurationFiles, ...requiredArtifacts, ...(scenarios.support ?? [])]
    .filter(path => !rendered.has(path)));
  return [
    ...hashed.flatMap(file => (file.hash === null ? [] : [{ path: file.path, hash: file.hash }])),
    ...expected.map(file => ({ path: file.path, hash: file.hash })),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The probe an all-project checkpoint runs beside the project's own tests:
 * the modules of the assignment's base, as an ordinary owned selection. It
 * is what tells a failure inside the iteration's own scope from one outside
 * it, and it selects nothing more than the base names.
 */
export function scopeProbePolicyOf(base: WriteScope['base']): {
  policy: 'owned-by-scope'; exactOwners: string[]; subtrees: string[]; extraSuites: string[];
} {
  return 'module' in base
    ? { policy: 'owned-by-scope', exactOwners: [base.module], subtrees: [...base.includedChildren], extraSuites: [] }
    : { policy: 'owned-by-scope', exactOwners: [...base.modules], subtrees: [], extraSuites: [] };
}

/** Every module of the view that lies inside one directory, the directory's own owner included. */
export function modulesBeneath(index: ArchitectIndex, dir: string): ModuleEntry[] {
  const prefix = toPosix(dir);
  return [...index.modules.values()].filter(entry => {
    const candidate = toPosix(entry.dir);
    return prefix === '' || candidate === prefix || candidate.startsWith(`${prefix}/`);
  });
}

/** Whether one project-relative path lies inside another. */
export function within(path: string, directory: string): boolean {
  const target = toPosix(path);
  const root = toPosix(directory);
  return root === '' || target === root || target.startsWith(`${root}/`);
}

/** The absolute path of a project-relative one. */
export function absolute(projectRoot: string, path: string): string {
  return join(projectRoot, path);
}
