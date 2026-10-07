import { dirname } from 'node:path';
import { lockPath } from '../store/lock.js';
import { planStateDirectory } from '../jobs/records.js';
import { plansDirectory } from '../plans/discover.js';
import { readFile, readdir, stat } from 'node:fs/promises';
import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { AffectedDocument } from 'ramify.ts/cli';
import { join, posix, relative, resolve, sep } from 'node:path';
import { guardedFilesHash } from '../../subs/evidence/src/guarded-files.js';
import { projectConfigurationFile } from '../../subs/evidence/src/project-configuration.js';
import { findModule, type ArchitectIndex, type ModuleEntry } from '../../subs/evidence/src/views.js';
import { z } from 'zod';
import { modulePathSchema, viewIdentitySchema, sha256Schema } from '../interfaces/protocol/evidence.js';
import type { ViewIdentity } from '../interfaces/protocol/evidence.js';
import { resolveRealTarget } from '../guard/resolve-contained-path.js';
import type { GuardedScope } from '../guard/write-guard.js';
import type { IterationKind } from './iterations.js';

/*
 * Capturing and resolving one iteration's write scope.
 *
 * The scope of an ordinary assignment is the assigned module's own contents
 * including ordinary documentation, auxiliary source and owned ignored trees — plus the complete
 * subtree of each immediate child it names. A child subtree is wholly
 * included or wholly excluded, so a sibling the architect did not name is
 * outside the scope whatever lies beneath it.
 *
 * The paths are canonical and are captured once. A later refresh of the view
 * never widens them, and a module created inside an authorized bootstrap
 * scope is reached through the nearest existing ancestor rather than through
 * a second capture.
 */

const text = z.string().min(1);

/**
 * What a location beyond the base was assigned for. `fake-injection` is a
 * file the agreement names as holding the fake, in the consumer or on the
 * provider side, which a contract iteration may write. Whole included trees
 * use the one inclusion list rather than an extra purpose.
 */
export const extraPurposeSchema = z.enum(['contract', 'conformance', 'fake', 'exposure-declaration', 'consumer', 'fake-injection']);

/**
 * What one iteration may write. `base` is the assigned module's own contents
 * plus whole included immediate child subtrees and declared owned nested
 * project roots. Provider exclusions remain boundaries within every root.
 *
 * `resolved` is what the guard compares against: canonical paths, captured
 * when the assignment was accepted, with the view they were resolved from.
 * A later refresh never widens them.
 */
export const writeScopeSchema = z.object({
  /** Per work item; only an assignment raises it. */
  revision: z.int().nonnegative(),
  base: z.union([
    z.object({ module: modulePathSchema, included: z.array(z.object({ directory: text, reason: text, instructions: text }).strict()) }).strict(),
    z.object({ modules: z.array(modulePathSchema).min(1), rationale: text }).strict(),
  ]),
  /**
   * Locations assigned beyond the base. A contract iteration is given
   * directories, because the files it will write do not exist yet and their
   * names are the agreement's to choose. An architect's extra location is one file.
   */
  extra: z.array(z.object({
    path: text,
    purpose: extraPurposeSchema,
    kind: z.enum(['file', 'directory']).optional(),
    /** Optional context for this narrow extra location. */
    reason: text.optional(),
  }).strict()),
  /** The declared read scope beyond the base; soft. */
  read: z.array(modulePathSchema),
  /** Creation authority captured from accepted registry entries, never from hypotheses. */
  bootstrap: z.array(z.object({ capability: z.object({ id: z.string(), revision: z.int().nonnegative(), hash: sha256Schema }).strict(), owner: text, parent: text, directory: text }).strict()),
  rationale: text,
  /** Captured canonical paths, including validated absent bootstrap paths under a real ancestor. */
  resolved: z.object({
    roots: z.array(text),
    files: z.array(text),
    view: viewIdentitySchema,
    ownership: z.object({
      provider: z.literal('ramify.affected-cli/4'), ramifyVersion: text, inputId: text, configuration: text, root: text,
      modules: z.array(z.object({ id: text, parent: text.nullable(), directory: text }).strict()),
      exclusions: z.array(z.object({ kind: z.enum(['owned-unwired', 'owned-nested-project', 'external', 'scratch', 'repository', 'packages', 'output', 'generated']), directory: text, owner: text.nullable() }).strict()),
    }).strict(),
    excluded: z.array(text),
    included: z.array(z.object({ directory: text, kind: z.enum(['child-subtree', 'owned-nested-project']), owner: text,
      reason: text, instructions: text, projectInstructions: z.array(z.object({ path: text, text: z.string() }).strict()) }).strict()),
  }).strict(),
}).strict();
export type WriteScope = z.infer<typeof writeScopeSchema>;

/** The configuration a run guards: the files that decide what the checks discover and run. */
export const guardedConfigurationFiles = [
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', '.gitignore', 'tsconfig.json', 'vitest.config.ts', 'vitest.config.js', 'vitest.config.mts',
  'vite.config.ts', 'vite.config.js', 'vite.config.mts', 'cucumber.js', 'ramify-agent.json',
  'ramify-audit.json',
] as const;

/** Project-relative audit and preparation inputs from one captured committed definition. */
export async function auditPreparationPaths(configuration: { readonly path: string; readonly projectRoot: string;
  readonly checks?: readonly unknown[]; readonly undetectedConfigFilesForcingFullAudit?: readonly string[];
  readonly workspace: { readonly packageDirectories: readonly string[] } }, projectRoot: string): Promise<string[]> {
  const prefix = configuration.projectRoot === '.' ? '' : `${configuration.projectRoot.replace(/\/$/u, '')}/`;
  if (prefix !== '' && !configuration.path.startsWith(prefix)) {
    throw new Error(`Audit configuration ${configuration.path} is outside the audited project ${configuration.projectRoot}`);
  }
  const path = prefix === '' ? configuration.path : configuration.path.slice(prefix.length);
  return [...new Set([path, ...(configuration.undetectedConfigFilesForcingFullAudit ?? []), ...await declaredCommandConfiguration(configuration.checks ?? [], projectRoot), ...configuration.workspace.packageDirectories.flatMap(directory =>
    guardedConfigurationFiles.map(name => directory === '' || directory === '.' ? name : posix.join(directory, name)))])];
}

/** Applicable configuration at explicit included roots, without discovering independent packages. */
export function includedConfigurationPaths(base: WriteScope['base']): string[] {
  return 'module' in base ? base.included.flatMap(entry => guardedConfigurationFiles.map(name => posix.join(entry.directory, name))) : [];
}

/** Captured enclosing configuration plus applicable inputs at the explicitly included roots. */
export function scopeConfigurationPaths(scope: WriteScope): string[] {
  return [scope.resolved.ownership.configuration, ...includedConfigurationPaths(scope.base)];
}

/** Runner/compiler configuration explicitly named by committed command declarations. */
async function declaredCommandConfiguration(checks: readonly unknown[], projectRoot: string): Promise<string[]> {
  const result: string[] = [];
  for (const check of checks) {
    const commands = (check as { executor?: { commands?: readonly { cmd?: string; args?: readonly string[]; cwd?: string }[] } }).executor?.commands ?? [];
    for (const command of commands) {
      const args = command.args ?? [];
      const executable = posix.basename(command.cmd ?? '');
      // Only the executable position of known wrappers determines tool roles;
      // a runner project selector or test filter may itself be named "tsc".
      const wrapped = ['node', 'nodejs', 'npx', 'pnpm', 'npm', 'yarn', 'bun'].includes(executable)
        ? (args[0] === 'exec' ? args[1] : args[0]) : undefined;
      const tools = [executable, ...(wrapped === undefined ? [] : [posix.basename(wrapped)])];
      const compiler = tools.some(tool => ['tsc', 'tsc.js'].includes(tool));
      const runner = tools.some(tool => ['vitest', 'vite', 'cucumber-js'].includes(tool));
      const flags = compiler ? ['--project', '-p'] : runner ? ['--config', '-c'] : [];
      for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]!;
        const value = flags.includes(arg) ? args[index + 1]
          : flags.some(flag => arg.startsWith(`${flag}=`)) ? arg.slice(arg.indexOf('=') + 1) : undefined;
        if (value !== undefined && !value.startsWith('-')) {
          const path = posix.join(command.cwd ?? '.', value);
          if (!compiler) { result.push(path); continue; }
          const metadata = await stat(join(projectRoot, path)).catch(error => {
            if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
            throw error;
          });
          if (metadata?.isDirectory() === true || path === '.') result.push(posix.join(path, 'tsconfig.json'));
          else {
            result.push(path);
            // An absent named directory can become a compiler project; protect
            // that effective input as well, without traversing the directory.
            if (metadata === null && !path.endsWith('.json')) result.push(posix.join(path, 'tsconfig.json'));
          }
        }
      }
    }
  }
  return result;
}

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

/**
 * Whether a project-relative path lies in the own contents of the module at
 * `dir`. This architect-view helper estimates placement for assignment validation;
 * captured and current provider answers decide write authority.
 */
export function inOwnContents(dir: string, path: string): boolean {
  return within(toPosix(path), toPosix(dir));
}

/** The module of the view whose own contents hold a project-relative path, or undefined for a path outside every module. */
export function moduleOwning(index: ArchitectIndex, path: string): ModuleEntry | undefined {
  return [...index.modules.values()]
    .filter(entry => inOwnContents(entry.dir, path))
    .sort((a, b) => b.dir.length - a.dir.length)[0];
}

/**
 * The rule a fake injection site is judged by: it lies in the own contents
 * of the consumer or of the provider, so a contract iteration may write it
 * and nothing else of either module's internals is opened by naming it.
 */
export const injectionSiteRule = 'a fake injection site lies in the consumer\'s or the provider\'s own contents';

/** Whether any part of the own contents of the module at `dir` lies inside `directory`. */
export function ownContentsWithin(dir: string, directory: string): boolean {
  return [ownArea(dir), ownFile(dir, 'module.ramify'), ownFile(dir, 'README.md')].some(path => within(path, directory));
}

/** What a scope resolution was asked for, once the harness has validated it. */
export interface ScopeCapture {
  readonly projectRoot: string;
  readonly ramify?: RamifyCli;
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

  const ramify = capture.ramify ?? new RamifyCli();
  const answer = await ramify.queryOwnership(capture.projectRoot, [...new Set(['.', ...('module' in capture.base ? capture.base.included.map(entry => entry.directory) : []), ...capture.extra.map(entry => entry.path), ...capture.bootstrap.map(entry => entry.directory)])]);
  const configuration = toPosix(relative(capture.projectRoot, resolve(capture.projectRoot, answer.selection.scope.configuration)));
  if (configuration === '' || configuration === '..' || configuration.startsWith('../')) throw new Error('Provider configuration is outside the captured project');
  const topology = answer.selection.scope.ownership;
  const included: WriteScope['resolved']['included'] = [];
  const excluded: string[] = [];
  const baseModules = 'module' in capture.base ? [capture.base.module] : capture.base.modules;
  const byId = new Map(topology.modules.map(module => [module.id, module]));
  for (const id of baseModules) {
    const module = byId.get(id);
    const bootstrap = bootstrapDirectory(capture.bootstrap, id);
    if (module === undefined && bootstrap === null) throw new Error(`Ownership answer has no assigned owner ${id}`);
    await addRoot(module?.directory ?? bootstrap!);
  }
  if ('module' in capture.base) {
    if (new Set(capture.base.included.map(entry => entry.directory)).size !== capture.base.included.length) throw new Error('Duplicate included tree');
    const base = capture.base;
    for (const entry of capture.base.included) {
      if (entry.reason.trim() === '' || entry.instructions.trim() === '') throw new Error('An included tree requires reason and instructions');
      const child = topology.modules.find(module => module.directory === entry.directory && module.parent === base.module);
      const project = topology.exclusions.find(exclusion => exclusion.directory === entry.directory && exclusion.kind === 'owned-nested-project');
      if (child === undefined && project === undefined) throw new Error(`Included directory ${entry.directory} must be one whole immediate child subtree or declared owned-nested-project root`);
      const owner = child?.id ?? project!.owner!;
      if (project !== undefined && !baseModules.includes(owner) && !capture.base.included.some(candidate => {
        const ancestor = topology.modules.find(module => module.directory === candidate.directory && module.parent === base.module);
        return ancestor !== undefined && (owner === ancestor.id || owner.startsWith(`${ancestor.id}/`));
      })) throw new Error(`Included project ${entry.directory} has owner ${owner} outside the assigned owners`);
      const projectInstructions: Array<{ path: string; text: string }> = [];
      if (project !== undefined) for (const name of ['AGENTS.md', 'CLAUDE.md']) {
        const path = posix.join(entry.directory, name);
        const text = await readFile(join(capture.projectRoot, path), 'utf8').catch(() => null);
        if (text !== null) projectInstructions.push({ path, text });
      }
      included.push({ ...entry, kind: child === undefined ? 'owned-nested-project' : 'child-subtree', owner, projectInstructions });
      await addRoot(entry.directory);
    }
  }
  for (const exclusion of topology.exclusions) {
    if (exclusion.owner !== null && exclusion.kind !== 'owned-nested-project') continue;
    if (exclusion.kind === 'owned-nested-project' && included.some(entry => entry.kind === 'owned-nested-project' && entry.directory === exclusion.directory)) continue;
    const target = await resolveRealTarget(capture.projectRoot, exclusion.directory);
    if (!target.ok) throw new Error(`Excluded region ${exclusion.directory} cannot be resolved`);
    excluded.push(target.resolved);
  }
  for (const entry of capture.bootstrap) {
    const parent = byId.get(entry.parent);
    const existing = byId.get(entry.owner);
    if (existing !== undefined && (existing.directory !== entry.directory || existing.parent !== entry.parent)) throw new Error('Bootstrap authority conflicts with declared owner identity');
    if (parent === undefined || !entry.owner.startsWith(`${entry.parent}/`) || entry.owner.slice(entry.parent.length + 1).includes('/') || !within(entry.directory, posix.join(parent.directory === '.' ? '' : parent.directory, 'subs'))) throw new Error('Bootstrap authority does not match the accepted owner/parent/directory identity');
    await addRoot(entry.directory);
  }
  // Harness-owned layout roots remain protected even under root owner authority.
  excluded.push(join(capture.projectRoot, dirname(lockPath)));
  for (const entry of await readdir(join(capture.projectRoot, plansDirectory), { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory()) excluded.push(planStateDirectory(capture.projectRoot, entry.name));
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
    resolved: { roots, files, view: capture.view, excluded, included, ownership: { provider: 'ramify.affected-cli/4', ramifyVersion: answer.ramifyVersion, root: capture.projectRoot, inputId: answer.revision.inputId, configuration, modules: [...topology.modules], exclusions: [...topology.exclusions] } },
  };
}

/** The bootstrap directory a proposed owner was given, by the owner's own name. */
function bootstrapDirectory(bootstrap: WriteScope['bootstrap'], module: string): string | null {
  const entry = bootstrap.find(candidate => candidate.owner === module && module.slice(0, module.lastIndexOf('/')) === candidate.parent);
  return entry?.directory ?? null;
}

/**
 * The scope as the guard compares against it. `denied` are canonical files
 * the guard refuses whatever the scope contains: tracked feature files,
 * captured source documents, and project configuration.
 */
export function guardedScopeOf(scope: WriteScope, denied: readonly string[] = [], ramify = new RamifyCli(), current?: AffectedDocument): GuardedScope {
  return { revision: scope.revision, roots: scope.resolved.roots, files: scope.resolved.files, denied,
    excluded: scope.resolved.excluded,
    placement: async paths => {
      const answer = current ?? await ramify.queryOwnership(scope.resolved.ownership.root, paths);
      if (paths.some(path => !answer.selection.paths.some(seed => seed.path === path))) {
        throw new Error('Ownership query did not answer every candidate path');
      }
      return answer.selection.paths.filter(seed => paths.includes(seed.path)).map(seed => ({ path: seed.path, allowed: permittedPlacement(scope, answer, seed) }));
    }, projectRoot: scope.resolved.ownership.root };
}

/** Current placement narrows captured owner and tree authority; it cannot add an owner or remove an exclusion. */
function permittedPlacement(scope: WriteScope, answer: AffectedDocument, seed: AffectedDocument['selection']['paths'][number]): boolean {
  if (seed.status !== 'owned') return false;
  const captured = scope.resolved.ownership;
  const withinPath = (path: string, directory: string) => within(path === '.' ? '' : path, directory === '.' ? '' : directory);
  const segments = seed.path.split('/');
  if (segments[0] === plansDirectory && segments[1] !== undefined && within(seed.path, toPosix(relative(captured.root, planStateDirectory(captured.root, segments[1]))))) return false;
  const current = answer.selection.scope.ownership.modules.find(module => module.id === seed.module);
  const previous = captured.modules.find(module => module.id === seed.module);
  const bootstrapped = scope.bootstrap.some(entry => withinPath(seed.path, entry.directory) &&
    ((seed.module === entry.parent && previous?.id === entry.parent) ||
      (seed.module === entry.owner && current?.directory === entry.directory && current.parent === entry.parent && previous === undefined)));
  if (current === undefined || (previous === undefined ? !bootstrapped : previous.directory !== current.directory || previous.parent !== current.parent)) return false;
  // Creating a module description needs the accepted registry creation entry, beyond ordinary inert ownership.
  if (seed.exclusion === null && seed.path.endsWith('/module.ramify') && !captured.modules.some(module => seed.path === posix.join(module.directory === '.' ? '' : module.directory, 'module.ramify')) && !scope.bootstrap.some(entry => seed.path === posix.join(entry.directory, 'module.ramify'))) return false;
  // Exact extras keep their narrow authority, but cannot open nested projects or hard exclusions.
  const explicit = scope.extra.some(entry => entry.kind === 'directory' ? withinPath(seed.path, entry.path) : seed.path === entry.path)
    || scope.resolved.files.includes(join(captured.root, seed.path));
  const modules = 'module' in scope.base ? [scope.base.module] : scope.base.modules;
  const owners = new Set([...modules, ...scope.resolved.included.filter(entry => entry.kind === 'child-subtree').flatMap(entry =>
    captured.modules.filter(module => withinPath(module.directory, entry.directory)).map(module => module.id))]);
  const capturedExclusions = captured.exclusions.filter(exclusion => withinPath(seed.path, exclusion.directory));
  if (capturedExclusions.some(exclusion => exclusion.owner === null)) return false;
  const nested = [...capturedExclusions.filter(exclusion => exclusion.kind === 'owned-nested-project'),
    ...(seed.exclusion?.kind === 'owned-nested-project' ? [seed.exclusion] : [])];
  if (nested.some(exclusion => !scope.resolved.included.some(entry => entry.kind === 'owned-nested-project' && entry.directory === exclusion.directory && entry.owner === exclusion.owner))) return false;
  const capturedOwner = captured.modules.filter(module => withinPath(seed.path, module.directory)).sort((a, b) => b.directory.length - a.directory.length)[0];
  const capturedPermission = (capturedOwner !== undefined && owners.has(capturedOwner.id)) || bootstrapped || explicit;
  if (!capturedPermission) return false;
  if (nested.length > 0) return true;
  return owners.has(seed.module) || bootstrapped || explicit;
}

/**
 * The canonical files no agent may edit or write, whatever its scope: the
 * project's configuration for the harness and every tracked feature file,
 * both project-relative in. A path that cannot be resolved is left out,
 * since nothing could write it either.
 */
export async function deniedFiles(projectRoot: string, protectedFiles: readonly string[]): Promise<string[]> {
  const denied: string[] = [];
  for (const path of [projectConfigurationFile, ...protectedFiles]) {
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
  extra: WriteScope['extra'] = [],
  included: WriteScope['resolved']['included'] = [],
): { policy: 'owned-by-scope' | 'all-project'; exactOwners: string[]; subtrees: string[]; extraSuites: string[] } {
  const extraSuites = [...new Set(evidenceObligations.flatMap(obligation => [...obligation.suite]))].sort();
  if (kind === 'breaking' || !('module' in base)) {
    return { policy: 'all-project', exactOwners: [], subtrees: [], extraSuites };
  }
  return { policy: 'owned-by-scope', exactOwners: [base.module], subtrees: included.filter(entry => entry.kind === 'child-subtree').map(entry => entry.owner), extraSuites };
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
 * Absent applicable inputs are captured with a null hash, so creating a new
 * effective configuration requires the same recorded authorization as changing
 * or deleting an existing one.
 */
export async function captureGuardedFiles(
  projectRoot: string,
  requiredArtifacts: readonly string[] = [],
  scenarios: GuardedScenarioFiles = {},
  declaredAuditConfiguration: readonly string[] = [],
): Promise<Array<{ path: string; hash: string | null }>> {
  const expected = scenarios.expected ?? [];
  const rendered = new Set(expected.map(file => file.path));
  const hashed = await guardedFilesHash(projectRoot, [...new Set([
    ...guardedConfigurationFiles, ...declaredAuditConfiguration, ...requiredArtifacts, ...(scenarios.support ?? []),
  ])].filter(path => !rendered.has(path)));
  return [
    ...hashed.map(file => ({ path: file.path, hash: file.hash })),
    ...expected.map(file => ({ path: file.path, hash: file.hash })),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
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
