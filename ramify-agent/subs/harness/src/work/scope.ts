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
import type { SubmissionError } from '../run/submissions.js';
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
  'vite.config.ts', 'vite.config.js', 'vite.config.mts',
  'cucumber.js', 'cucumber.cjs', 'cucumber.mjs', 'cucumber.json', 'cucumber.yaml', 'cucumber.yml', 'ramify-agent.json',
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

/**
 * What an assignment based on one owner gives its engineer by default, for
 * an architect's briefing: the owner's directory, the directories `included`
 * may name, and the guarded files the base would otherwise reach.
 */
export interface DefaultWriteScope {
  readonly module: string;
  /** Project-relative; `''` for the root module. */
  readonly directory: string;
  /** Its immediate child modules, each excluded unless `included` names its directory. */
  readonly children: ReadonlyArray<{ readonly module: string; readonly directory: string }>;
  /** Its own owned nested-project roots, or null where the provider gave no answer. */
  readonly nestedProjects: readonly string[] | null;
  /** Existing guarded files in its own contents, writable only with an authorization. */
  readonly guarded: readonly string[];
}

/**
 * The default write scope of one owner, for an architect's briefing. The
 * provider's topology decides it, as it decides the submission rules; where
 * the provider gave no answer the architect view supplies the owner and its
 * children, and the nested-project roots are unknown. Undefined for an owner
 * neither knows yet.
 */
export function defaultWriteScopeOf(
  index: ArchitectIndex | null,
  module: string,
  topology: AffectedDocument['selection']['scope']['ownership'] | null,
  guarded: readonly string[],
): DefaultWriteScope | undefined {
  const relativeDirectory = (directory: string) => (directory === '.' ? '' : directory);
  let directory: string;
  let children: Array<{ module: string; directory: string }>;
  if (topology !== null) {
    const entry = topology.modules.find(candidate => candidate.id === module);
    if (entry === undefined) return undefined;
    directory = relativeDirectory(entry.directory);
    children = topology.modules.filter(candidate => candidate.parent === module)
      .map(child => ({ module: child.id, directory: relativeDirectory(child.directory) }));
  } else {
    const entry = index === null ? undefined : findModule(index, module);
    if (entry === undefined) return undefined;
    directory = entry.dir;
    children = entry.children.flatMap(child => {
      const found = findModule(index!, child);
      return found === undefined ? [] : [{ module: found.module, directory: found.dir }];
    });
  }
  children.sort((a, b) => (a.directory < b.directory ? -1 : a.directory > b.directory ? 1 : 0));
  const nestedProjects = topology === null ? null : topology.exclusions
    .filter(exclusion => exclusion.kind === 'owned-nested-project' && exclusion.owner === module).map(exclusion => exclusion.directory).sort();
  const closed = [...children.map(child => child.directory), ...(nestedProjects ?? [])];
  return {
    module,
    directory,
    children,
    nestedProjects,
    guarded: [...new Set(guarded)].filter(path => within(path, directory) && !closed.some(child => within(path, child))).sort(),
  };
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

/** The paths one ownership query answers for a scope: the root, each included tree, each extra and each bootstrap directory. */
export function ownershipQueryPaths(capture: Pick<ScopeCapture, 'base' | 'extra' | 'bootstrap'>): string[] {
  return [...new Set(['.', ...('module' in capture.base ? capture.base.included.map(entry => entry.directory) : []),
    ...capture.extra.map(entry => entry.path), ...capture.bootstrap.map(entry => entry.directory)])];
}

/** The directories an ordinary base may name in `included`: its immediate child modules and its own nested-project roots. */
export function includedChoices(module: string, topology: AffectedDocument['selection']['scope']['ownership']): string[] {
  return [...topology.modules.filter(entry => entry.parent === module).map(entry => entry.directory),
    ...topology.exclusions.filter(exclusion => exclusion.kind === 'owned-nested-project' && exclusion.owner === module).map(exclusion => exclusion.directory)].sort();
}

/**
 * The rules of an ordinary base's `included` list against one ownership
 * answer, each error at its entry's path. An entry names exactly one
 * immediate child module directory or one owned nested-project root, once,
 * with a reason and instructions; a nested project's owner is assigned or
 * lies in an included child. A directory inside the owner is already part of
 * the base. Submission validation reports these; `resolveWriteScope` keeps
 * them as its backstop.
 */
export function includedTreeErrors(
  base: Extract<WriteScope['base'], { readonly module: string }>,
  answer: AffectedDocument,
): SubmissionError[] {
  const topology = answer.selection.scope.ownership;
  const errors: SubmissionError[] = [];
  const choices = includedChoices(base.module, topology);
  const expected = choices.length === 0
    ? `no entry: "${base.module}" has no immediate child module and no owned nested project`
    : `one of ${choices.map(directory => `"${directory}"`).join(', ')}, or no entry`;
  const seen = new Set<string>();
  base.included.forEach((entry, position) => {
    const at = `assignment.scope.base.included.${position}`;
    if (seen.has(entry.directory)) {
      errors.push({ path: `${at}.directory`, message: `"${entry.directory}" is already named by an earlier entry`, expected: 'each directory once' });
      return;
    }
    seen.add(entry.directory);
    if (entry.reason.trim() === '') errors.push({ path: `${at}.reason`, message: 'An included tree states why the engineer needs it, and this reason is blank' });
    if (entry.instructions.trim() === '') errors.push({ path: `${at}.instructions`, message: 'An included tree carries instructions for the engineer, and these are blank' });
    const child = topology.modules.find(module => module.directory === entry.directory && module.parent === base.module);
    const project = topology.exclusions.find(exclusion => exclusion.directory === entry.directory && exclusion.kind === 'owned-nested-project');
    if (child === undefined && project === undefined) {
      const seed = answer.selection.paths.find(candidate => candidate.path === entry.directory);
      errors.push({
        path: `${at}.directory`,
        message: seed?.status === 'owned' && seed.module === base.module
          ? `"${entry.directory}" lies inside the own contents of "${base.module}", which the base already gives the engineer whole; remove this entry`
          : `"${entry.directory}" is neither an immediate child module directory of "${base.module}" nor an owned nested-project root`,
        expected,
      });
      return;
    }
    const owner = child?.id ?? project!.owner!;
    if (project !== undefined && owner !== base.module && !base.included.some(candidate => {
      const ancestor = topology.modules.find(module => module.directory === candidate.directory && module.parent === base.module);
      return ancestor !== undefined && (owner === ancestor.id || owner.startsWith(`${ancestor.id}/`));
    })) {
      errors.push({
        path: `${at}.directory`,
        message: `The nested project "${entry.directory}" belongs to "${owner}", which is neither the assigned owner nor inside an included child`,
        expected: `the child of "${base.module}" that holds "${owner}" in \`included\` as well, or no entry`,
      });
    }
  });
  return errors;
}

/**
 * Resolves the write scope's real paths. Each is canonical: an existing path
 * is its own real path, and one that does not exist yet — a bootstrap
 * module's declaration, README or source area — is resolved through its
 * nearest existing ancestor, so an absent directory is not a scope failure.
 * An ownership answer already obtained for the same paths may be given.
 */
export async function resolveWriteScope(capture: ScopeCapture, ownership?: AffectedDocument): Promise<WriteScope> {
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
  const answer = ownership ?? await ramify.queryOwnership(capture.projectRoot, ownershipQueryPaths(capture));
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
    // The submission rules, kept here as the backstop of every capture.
    const problems = includedTreeErrors(capture.base, answer);
    if (problems.length > 0) throw new Error(problems.map(problem => problem.message).join('; '));
    const base = capture.base;
    for (const entry of capture.base.included) {
      const child = topology.modules.find(module => module.directory === entry.directory && module.parent === base.module);
      const project = topology.exclusions.find(exclusion => exclusion.directory === entry.directory && exclusion.kind === 'owned-nested-project');
      const owner = child?.id ?? project!.owner!;
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
  return placementRefusal(scope, answer, seed) === null;
}

/** Why one path is not writable under a captured scope and a current ownership answer, or null where it is. */
function placementRefusal(scope: WriteScope, answer: AffectedDocument, seed: AffectedDocument['selection']['paths'][number]): string | null {
  if (seed.status === 'outside-project') return 'lies outside the project';
  if (seed.status !== 'owned') return `lies in the ${seed.exclusion.kind} region "${seed.exclusion.directory}", which no assignment opens`;
  const captured = scope.resolved.ownership;
  const withinPath = (path: string, directory: string) => within(path === '.' ? '' : path, directory === '.' ? '' : directory);
  const segments = seed.path.split('/');
  if (segments[0] === plansDirectory && segments[1] !== undefined && within(seed.path, toPosix(relative(captured.root, planStateDirectory(captured.root, segments[1]))))) return 'is plan state the harness alone writes';
  const current = answer.selection.scope.ownership.modules.find(module => module.id === seed.module);
  const previous = captured.modules.find(module => module.id === seed.module);
  const bootstrapped = scope.bootstrap.some(entry => withinPath(seed.path, entry.directory) &&
    ((seed.module === entry.parent && previous?.id === entry.parent) ||
      (seed.module === entry.owner && current?.directory === entry.directory && current.parent === entry.parent && previous === undefined)));
  if (current === undefined || (previous === undefined ? !bootstrapped : previous.directory !== current.directory || previous.parent !== current.parent)) return `belongs to "${seed.module}", whose identity differs from the captured one`;
  // Creating a module description needs the accepted registry creation entry, beyond ordinary inert ownership.
  if (seed.exclusion === null && seed.path.endsWith('/module.ramify') && !captured.modules.some(module => seed.path === posix.join(module.directory === '.' ? '' : module.directory, 'module.ramify')) && !scope.bootstrap.some(entry => seed.path === posix.join(entry.directory, 'module.ramify'))) return 'would create a module description, which only an accepted proposal authorizes';
  // Exact extras keep their narrow authority, but cannot open nested projects or hard exclusions.
  const explicit = scope.extra.some(entry => entry.kind === 'directory' ? withinPath(seed.path, entry.path) : seed.path === entry.path)
    || scope.resolved.files.includes(join(captured.root, seed.path));
  const modules = 'module' in scope.base ? [scope.base.module] : scope.base.modules;
  const owners = new Set([...modules, ...scope.resolved.included.filter(entry => entry.kind === 'child-subtree').flatMap(entry =>
    captured.modules.filter(module => withinPath(module.directory, entry.directory)).map(module => module.id))]);
  const capturedExclusions = captured.exclusions.filter(exclusion => withinPath(seed.path, exclusion.directory));
  const unowned = capturedExclusions.find(exclusion => exclusion.owner === null);
  if (unowned !== undefined) return `lies in the ${unowned.kind} region "${unowned.directory}", which no assignment opens`;
  const nested = [...capturedExclusions.filter(exclusion => exclusion.kind === 'owned-nested-project'),
    ...(seed.exclusion?.kind === 'owned-nested-project' ? [seed.exclusion] : [])];
  const closed = nested.find(exclusion => !scope.resolved.included.some(entry => entry.kind === 'owned-nested-project' && entry.directory === exclusion.directory && entry.owner === exclusion.owner));
  if (closed !== undefined) return `lies in the owned nested project "${closed.directory}", which this scope does not include`;
  const capturedOwner = captured.modules.filter(module => withinPath(seed.path, module.directory)).sort((a, b) => b.directory.length - a.directory.length)[0];
  const capturedPermission = (capturedOwner !== undefined && owners.has(capturedOwner.id)) || bootstrapped || explicit;
  if (!capturedPermission) return 'lies outside the write scope';
  if (nested.length > 0) return null;
  return owners.has(seed.module) || bootstrapped || explicit ? null : 'lies outside the write scope';
}

/**
 * The placement rules of each architect `extra` file against the resolved
 * scope and the ownership answer it was resolved from: the file is owned,
 * outside every unowned exclusion and harness-held region, and outside any
 * owned nested project the scope does not include. These are the rules the
 * guard applies at write time, judged at submission instead.
 */
export function extraPlacementErrors(scope: WriteScope, answer: AffectedDocument): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const root = scope.resolved.ownership.root;
  scope.extra.forEach((entry, position) => {
    if (entry.kind === 'directory') return;
    const seed = answer.selection.paths.find(candidate => candidate.path === entry.path);
    if (seed === undefined) return;
    const held = scope.resolved.excluded.find(region => within(entry.path, toPosix(relative(root, region))));
    const refusal = placementRefusal(scope, answer, seed)
      ?? (held === undefined ? null : `lies in "${toPosix(relative(root, held))}", which this scope excludes`);
    if (refusal === null) return;
    errors.push({
      path: `assignment.scope.extra.${position}.path`,
      message: `"${entry.path}" ${refusal}, so no engineer could write it`,
      expected: 'a file an owner holds outside every excluded region, or inside an owned nested project this scope includes',
    });
  });
  return errors;
}

/** The captured scope, or the structural errors that refused it. */
export type WriteScopeCheckResult =
  | { readonly scope: WriteScope; readonly errors: readonly [] }
  | { readonly scope: null; readonly errors: readonly SubmissionError[] };

/**
 * A submitted scope judged by one ownership query: the `included` rules,
 * then the capture itself, then the placement of each `extra`. A capture
 * that throws is a rejection of the scope rather than a failure of the run.
 * The query's own failure is the provider's, and propagates.
 */
export async function checkWriteScope(capture: ScopeCapture): Promise<WriteScopeCheckResult> {
  const ramify = capture.ramify ?? new RamifyCli();
  const answer = await ramify.queryOwnership(capture.projectRoot, ownershipQueryPaths(capture));
  const included = 'module' in capture.base ? includedTreeErrors(capture.base, answer) : [];
  if (included.length > 0) return { scope: null, errors: included };
  let scope: WriteScope;
  try {
    scope = await resolveWriteScope(capture, answer);
  } catch (error) {
    return { scope: null, errors: [{
      path: 'assignment.scope',
      message: `The write scope cannot be captured: ${error instanceof Error ? error.message : String(error)}`,
      expected: 'a scope the installed provider can capture',
    }] };
  }
  const extra = extraPlacementErrors(scope, answer);
  return extra.length > 0 ? { scope: null, errors: extra } : { scope, errors: [] };
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
 * the harness and its committed audit definition, and the contract
 * artifacts a registered agreement requires, hashed as they stand, and every
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
    ...guardedConfigurationFiles, ...declaredAuditConfiguration, ...requiredArtifacts,
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
