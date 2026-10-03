import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile, lstat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { analyzeDependencyDiagram } from '../../subs/analysis/src/dependency-analyzer.js';
import { renderArchitectView } from '../../subs/analysis/src/architect-render.js';
import { architectMeasurements, measureApiViewBytes } from '../../subs/daemon/src/measurements.js';
import { openRetainedSession } from '../../subs/analysis/src/retained-session.js';
import type { SessionInputs } from '../../subs/analysis/src/interfaces/session.js';
import type { AnalysisReport } from '../../subs/analysis/src/index.js';
import { limits as batchLimits } from '../../src/batch.js';
import { dependencyAnalyzerCapacity } from '../../src/dependency-analyzer-process.js';
import { reviewedPackage, validatePackageEntries } from '../validate-final-contracts.js';
import { assertClientClosure } from './completion-cases.js';
import { parseAnalysisDocument } from './equivalence-comparison.js';
import { readTrace, withSequenceProcess } from './equivalence-process.js';
import { sessionModulePattern } from './plan5-completion-cases.js';
import { repositoryRoot } from './plan.js';
import { command } from './processes.js';
import type { CommandResult } from './processes.js';
import { Assertions } from './runner.js';
import { sessionInputs } from './session-expectations.js';

/**
 * Plan 2B iteration 8: real runs of the compiled CLI and daemon (AV29–AV31),
 * and the API view, package-entry and closure cases of AV34.
 *
 * Every run owns its endpoint directory under `/tmp` (the socket path is
 * limited to 100 bytes) and its isolated project copies. The owned daemon is
 * stopped in `finally`, its recorded processes are confirmed gone, and the
 * directory is removed. Only processes this harness recorded from its own
 * daemon's status are ever signalled.
 *
 * Each case returns its evidence; `plan2b.test.ts` asserts it.
 */

const currentLauncher = join(repositoryRoot, 'dist/src/ramify');
const viewName = '.ramify-architect';
/** Generated names never copied into an isolated project: Plan 2A's and Plan 2B's reserved directories. */
const generatedName = /^\.ramify(?:-architect)?(?:\.(?:tmp|old)-.+)?$/;
/** Top-level toolkit paths that are not the toolkit project, as Plan 2A's isolated copies exclude them. */
const toolkitExcluded = new Set(['examples', 'site', '.cucumber-viz', '.claude', '.agents', '.devcontainer', '.github', '.reference-work']);

/** The architect limits the specification and contracts C2 and C3 fix, transcribed independently of the daemon. */
export const specifiedArchitectLimits = {
  details: { maxSignatureBytes: 240, maxDocumentationBytes: 280, maxOverloads: 4, maxResultBytes: 32 * 1024 ** 2 },
  tests: { maxTitleBytes: 240, maxTitlesPerRecord: 40, maxResultBytes: 16 * 1024 ** 2 },
  maxProjectionBytes: 64 * 1024 ** 2,
} as const;
/** Plan 2A's frozen API-view bounds (contracts.md, iteration 1), which Plan 2C's
 * architect metrics measure view bytes under, transcribed independently of the daemon. */
export const specifiedApiViewLimits = {
  details: { maxSignatureBytes: 2048, maxDocumentationBytes: 512, maxOverloads: 8, maxResultBytes: 32 * 1024 ** 2 },
  maxAreaBytes: 32 * 1024 ** 2, maxInvocationBytes: 256 * 1024 ** 2,
} as const;

export type ProjectKind = 'reference' | 'toolkit';

// ---------------------------------------------------------------------------
// Isolated copies and owned daemons

function git(cwd: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [], err: Buffer[] = [];
    child.stdout.on('data', chunk => out.push(chunk));
    child.stderr.on('data', chunk => err.push(chunk));
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`git ${args.join(' ')}: ${Buffer.concat(err).toString()}`)));
  });
}

/**
 * An isolated copy of the reference project or the toolkit: its tracked and
 * untracked unignored files, with `node_modules` linked to the source's own.
 * Generated view directories are never copied, so every copy starts without a view.
 */
export async function copyProject(kind: ProjectKind, destination: string): Promise<string> {
  const source = kind === 'reference' ? join(repositoryRoot, 'examples/collection-review') : repositoryRoot;
  const listed = (await git(source, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).toString('utf8').split('\0').filter(Boolean);
  const files = [...new Set(listed)].filter(path => {
    const segments = path.split('/');
    if (segments.some(segment => generatedName.test(segment))) return false;
    return kind === 'reference' || !toolkitExcluded.has(segments[0]!);
  });
  await mkdir(destination, { recursive: true });
  for (const path of files) {
    const from = join(source, path);
    let info;
    try { info = await lstat(from); } catch { continue; } // deleted in the working tree
    if (!info.isFile()) continue;
    await mkdir(dirname(join(destination, path)), { recursive: true });
    await writeFile(join(destination, path), await readFile(from));
  }
  await symlink(join(source, 'node_modules'), join(destination, 'node_modules'));
  return realpath(destination);
}

export interface DaemonCounters { readonly [name: string]: number }
export interface DaemonStatusSample {
  readonly pid: number;
  readonly counters: DaemonCounters;
  readonly memory: { readonly rss: number; readonly heapUsed: number };
  readonly contexts: readonly {
    readonly root: string;
    readonly sequence: number | null;
    readonly revision: string | null;
    readonly inputId: string | null;
    readonly cause: string | null;
    readonly session: { readonly sequence: number; readonly observedInputs: number; readonly factBytes: number; readonly compilerPid: number | null } | null;
    readonly history: number;
    readonly watcher: string;
  }[];
}

export interface OwnedDaemon {
  readonly directory: string;
  readonly endpoint: string;
  run(cwd: string, args: readonly string[], timeoutMs?: number): Promise<CommandResult>;
  status(): Promise<DaemonStatusSample>;
}

export interface DaemonStopEvidence {
  readonly endpoint: string;
  readonly stopCode: number | null;
  readonly statusAfterStop: string;
  readonly recordedPids: readonly number[];
  readonly survivingPids: readonly number[];
  readonly signalledPids: readonly number[];
  readonly removed: boolean;
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}

/**
 * Runs `operation` against a daemon started on demand in an owned endpoint
 * directory, then stops that daemon, confirms its recorded processes exit and
 * removes the directory. `stops` receives the stop evidence.
 */
export async function withOwnedDaemon<T>(operation: (daemon: OwnedDaemon) => Promise<T>, stops: DaemonStopEvidence[],
  launcher = currentLauncher): Promise<T> {
  const directory = await realpath(await mkdtemp('/tmp/rp2b-'));
  const endpoint = join(directory, 'ep');
  await mkdir(endpoint, { mode: 0o700 });
  const environment: NodeJS.ProcessEnv = { ...process.env, RAMIFY_ENDPOINT_DIR: endpoint, NODE_OPTIONS: '' };
  const pids = new Set<number>();
  const run = (cwd: string, args: readonly string[], timeoutMs = 300_000) => command(cwd, launcher, args, timeoutMs, environment);
  const daemon: OwnedDaemon = {
    directory, endpoint, run,
    async status() {
      const result = await run(directory, ['daemon', 'status', '--format', 'json'], 30_000);
      const parsed = JSON.parse(result.stdout) as { running: boolean; status?: Record<string, unknown> };
      if (!parsed.running || !parsed.status) throw new Error(`The owned daemon is not running: ${result.stdout}`);
      const status = parsed.status as {
        pid: number; counters: DaemonCounters; memory: { rss: number; heapUsed: number };
        contexts: { selection: { root: string }; published: { sequence: number; revision: string; cause: string; fingerprints: { inputId: string } } | null;
          session: { sequence: number; observedInputs: number; factBytes: number; compiler: { pid: number | null } } | null;
          history: { retained: number }; watcher: string }[];
      };
      pids.add(status.pid);
      for (const context of status.contexts) if (context.session?.compiler.pid) pids.add(context.session.compiler.pid);
      return {
        pid: status.pid, counters: status.counters, memory: { rss: status.memory.rss, heapUsed: status.memory.heapUsed },
        contexts: status.contexts.map(context => ({
          root: context.selection.root, sequence: context.published?.sequence ?? null, revision: context.published?.revision ?? null,
          inputId: context.published?.fingerprints.inputId ?? null, cause: context.published?.cause ?? null,
          session: context.session ? { sequence: context.session.sequence, observedInputs: context.session.observedInputs,
            factBytes: context.session.factBytes, compilerPid: context.session.compiler.pid } : null,
          history: context.history.retained, watcher: context.watcher,
        })),
      };
    },
  };
  let failure: unknown = null, result: T | undefined;
  try { result = await operation(daemon); } catch (error) { failure = error; }
  // The record names the daemon even when the operation failed before any status call.
  try {
    for (const name of await readdir(endpoint)) {
      if (!/^daemon-[0-9a-f]+\.json$/.test(name)) continue;
      const record = JSON.parse(await readFile(join(endpoint, name), 'utf8')) as { pid?: unknown };
      if (typeof record.pid === 'number') pids.add(record.pid);
    }
  } catch { /* no record: no daemon was started */ }
  const stop = await command(directory, launcher, ['daemon', 'stop', '--format', 'json'], 20_000, environment);
  const after = await command(directory, launcher, ['daemon', 'status', '--format', 'json'], 20_000, environment);
  const deadline = performance.now() + 10_000;
  while ([...pids].some(alive) && performance.now() < deadline) await delay(50);
  const surviving = [...pids].filter(alive);
  // Only processes this harness recorded from its own daemon are signalled.
  for (const pid of surviving) { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }
  let running = true;
  try { running = (JSON.parse(after.stdout) as { running: boolean }).running; } catch { /* reported below */ }
  await rm(directory, { recursive: true, force: true });
  const evidence: DaemonStopEvidence = { endpoint, stopCode: stop.code, statusAfterStop: running ? 'running' : 'not running',
    recordedPids: [...pids].sort((a, b) => a - b), survivingPids: surviving, signalledPids: surviving, removed: true };
  stops.push(evidence);
  if (failure) throw failure;
  if (running || surviving.length) throw new Error(`The owned daemon did not stop cleanly: ${JSON.stringify(evidence)}`);
  return result as T;
}

// ---------------------------------------------------------------------------
// View trees

export interface ViewFileStat { readonly bytes: number; readonly mtimeMs: number; readonly ino: number }

/** Every file of a view directory by its path relative to the view root; refuses anything but files and directories. */
export async function readViewTree(root: string): Promise<{ readonly files: Map<string, string>; readonly stats: Map<string, ViewFileStat> }> {
  const base = join(root, viewName);
  const files = new Map<string, string>(), stats = new Map<string, ViewFileStat>();
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const key = relative(base, path).split('\\').join('/');
        const info = await stat(path);
        files.set(key, await readFile(path, 'utf8'));
        stats.set(key, { bytes: info.size, mtimeMs: info.mtimeMs, ino: info.ino });
      } else throw new Error(`A view entry is neither a file nor a directory: ${path}`);
    }
  }
  await walk(base);
  return { files: new Map([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)), stats };
}

/** The first difference between two trees, or null. */
export function treeDifference(left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>): string | null {
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort();
  for (const path of paths) {
    const a = left.get(path), b = right.get(path);
    if (a === undefined) return `${path}: only on the right`;
    if (b === undefined) return `${path}: only on the left`;
    if (a !== b) {
      let index = 0;
      while (index < a.length && a[index] === b[index]) index++;
      return `${path}: differs at character ${index}: ${JSON.stringify(a.slice(Math.max(0, index - 40), index + 40))} vs ${JSON.stringify(b.slice(Math.max(0, index - 40), index + 40))}`;
    }
  }
  return null;
}

/** The tree with one revision identifier replaced, and where it occurred. */
export function withoutRevision(files: ReadonlyMap<string, string>, revision: string): { readonly files: Map<string, string>; readonly occurrences: Map<string, number> } {
  const out = new Map<string, string>(), occurrences = new Map<string, number>();
  for (const [path, text] of files) {
    const parts = text.split(revision);
    if (parts.length > 1) occurrences.set(path, parts.length - 1);
    out.set(path, parts.join('<revision>'));
  }
  return { files: out, occurrences };
}

export function viewBytes(files: ReadonlyMap<string, string>): number {
  let total = 0;
  for (const text of files.values()) total += Buffer.byteLength(text);
  return total;
}

// ---------------------------------------------------------------------------
// Independent structural expectation, from the declarations and READMEs alone

export interface DeclaredStatement {
  readonly form: 'expose-src' | 'expose-test' | 'expose-sub';
  readonly names: readonly { readonly name: string; readonly alias: string | null }[] | '*';
  readonly from: string;
  readonly to: readonly ('parent' | 'descendants')[];
}
export interface DeclaredModule {
  readonly id: string;
  readonly dir: string;
  readonly parent: string | null;
  readonly children: string[];
  readonly tags: readonly string[];
  readonly readme: boolean;
  readonly statements: readonly DeclaredStatement[];
  /** Child directory name to child module identifier. */
  readonly childByDirectory: Map<string, string>;
}

function parseNames(text: string): DeclaredStatement['names'] {
  if (text.trim() === '*') return '*';
  return text.split(',').map(part => part.trim()).filter(Boolean).map(part => {
    const aliased = /^(\S+)\s+as\s+(\S+)$/.exec(part);
    return aliased ? { name: aliased[1]!, alias: aliased[2]! } : { name: part, alias: null };
  });
}
function parseDestinations(text: string): DeclaredStatement['to'] {
  return text.split(',').map(part => part.trim()).map(part => {
    if (part !== 'parent' && part !== 'descendants') throw new Error(`Unexpected destination: ${part}`);
    return part;
  });
}

/**
 * The declared module tree read from each `module.ramify` with line patterns
 * sufficient for the reference project and the toolkit: the header's name and
 * tags and the one-line exposure statements. It shares no code with the parser.
 */
export async function declaredModules(root: string): Promise<DeclaredModule[]> {
  const modules: DeclaredModule[] = [];
  async function visit(dir: string, parent: DeclaredModule | null): Promise<void> {
    const text = await readFile(join(root, dir, 'module.ramify'), 'utf8');
    const lines = text.split('\n').map(line => line.replace(/\/\/.*$/, '').trim()).filter(Boolean);
    const header = lines.map(line => /^module\s+(?:"([^"]+)"|([a-z0-9-]+))(?:\s+tagged\s+\[([^\]]*)\])?$/.exec(line)).find(Boolean);
    if (!header) throw new Error(`No module header in ${dir || '.'}/module.ramify`);
    const name = header[1] ?? header[2]!;
    const tags = (header[3] ?? '').split(',').map(tag => tag.trim()).filter(Boolean);
    const statements: DeclaredStatement[] = [];
    for (const line of lines) {
      const owned = /^(expose-src|expose-test)\s+(.+?)\s+from\s+"([^"]+)"(?:\s+tagged\s+\[[^\]]*\])?\s+to\s+(.+)$/.exec(line);
      if (owned) { statements.push({ form: owned[1] as 'expose-src' | 'expose-test', names: parseNames(owned[2]!), from: owned[3]!, to: parseDestinations(owned[4]!) }); continue; }
      const relay = /^expose-sub\s+(.+?)\s+from\s+(?:"([^"]+)"|([a-z0-9-]+))\s+to\s+(.+)$/.exec(line);
      if (relay) statements.push({ form: 'expose-sub', names: parseNames(relay[1]!), from: relay[2] ?? relay[3]!, to: parseDestinations(relay[4]!) });
    }
    let readme = true;
    try { await stat(join(root, dir, 'README.md')); } catch { readme = false; }
    const module: DeclaredModule = { id: parent ? `${parent.id}/${name}` : name, dir, parent: parent?.id ?? null, children: [], tags,
      readme, statements, childByDirectory: new Map() };
    modules.push(module);
    parent?.children.push(module.id);
    let entries: string[] = [];
    try { entries = (await readdir(join(root, dir, 'subs'), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name); }
    catch { /* no subs/ */ }
    for (const entry of entries.sort()) {
      const childDir = dir ? `${dir}/subs/${entry}` : `subs/${entry}`;
      try { await stat(join(root, childDir, 'module.ramify')); } catch { continue; }
      const before = modules.length;
      await visit(childDir, module);
      module.childByDirectory.set(entry, modules[before]!.id);
    }
  }
  await visit('', null);
  for (const module of modules) module.children.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return modules;
}

interface ViewRecord { readonly [key: string]: unknown }

function recordsOf(files: ReadonlyMap<string, string>, path: string): ViewRecord[] {
  const text = files.get(path);
  if (text === undefined) return [];
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line) as ViewRecord);
}
function viewDirectory(module: DeclaredModule, rootId: string): string {
  return module.id === rootId ? '' : module.id.slice(rootId.length + 1);
}
function joinView(directory: string, name: string): string { return directory ? `${directory}/${name}` : name; }

/** The one record of several that a statement selects: the only one, else the one defined in the statement's file. */
function pick(found: readonly ViewRecord[], file: string): ViewRecord | undefined {
  if (found.length === 1) return found[0];
  const own = found.filter(record => record.file === file);
  return own.length === 1 ? own[0] : undefined;
}

/** Export names of one TypeScript file, read with line patterns: declarations, named export lists and `default`. */
export function exportNames(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(/^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/gm)) names.add(match[1]!);
  for (const match of text.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    for (const part of match[1]!.split(',').map(item => item.trim()).filter(Boolean)) names.add(part.replace(/^type\s+/, '').split(/\s+as\s+/).pop()!.trim());
  }
  if (/^export\s+default\b/m.test(text)) names.add('default');
  return [...names].sort();
}

export interface StructuralExpectation {
  readonly modules: number;
  readonly checkedExposures: number;
  readonly checkedWildcardFiles: number;
  readonly checkedRelays: number;
  readonly mismatches: readonly string[];
}

/**
 * Compares a materialized tree with what the declarations alone determine: the
 * file set, each module's identity, parent, children, header tags and purpose
 * state, the owned exposures (role and destinations) and the relays (`reexposed`),
 * resolved through each child's contract to its parent.
 */
export async function structuralExpectation(root: string, modules: readonly DeclaredModule[], files: ReadonlyMap<string, string>,
  revision: string, inputId: string, options: { readonly exposures: boolean }): Promise<StructuralExpectation> {
  const mismatches: string[] = [];
  const rootId = modules[0]!.id;
  const byId = new Map(modules.map(module => [module.id, module]));
  const expected = new Set(['_meta.json', 'README.md']);
  for (const module of modules) for (const name of ['module.json', 'behavior.jsonl', 'supporting.jsonl', 'tests.jsonl']) expected.add(joinView(viewDirectory(module, rootId), name));
  const actualPaths = [...files.keys()].sort(), expectedPaths = [...expected].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    mismatches.push(`file set: missing ${expectedPaths.filter(path => !files.has(path)).join(', ') || 'none'}; unexpected ${actualPaths.filter(path => !expected.has(path)).join(', ') || 'none'}`);
  }
  const meta = JSON.parse(files.get('_meta.json') ?? '{}') as Record<string, unknown>;
  // Plan 2C fixed the architect metrics policy as `measure`, and a materialized
  // tree comes from a valid inventory, so its metrics are measured.
  for (const [key, value] of [['schema', 'ramify.architect-view/1'], ['revision', revision], ['input', inputId], ['modules', modules.length],
    ['dependencies', 'measured'], ['dependencyScope', 'production'], ['testReferences', 'measured'], ['metrics', 'measured']] as const) {
    if (meta[key] !== value) mismatches.push(`_meta.json ${key}: ${JSON.stringify(meta[key])}, expected ${JSON.stringify(value)}`);
  }
  if (!(files.get('README.md') ?? '').includes(`Revision ${revision} · input ${inputId}`)) mismatches.push('README.md does not name the revision and input');

  // Records by module, and each module's owned exposures resolved to records.
  const records = new Map<string, ViewRecord[]>();
  for (const module of modules) {
    const directory = viewDirectory(module, rootId);
    const document = JSON.parse(files.get(joinView(directory, 'module.json')) ?? '{}') as Record<string, unknown>;
    const expectations: [string, unknown, unknown][] = [
      ['module', document.module, module.id], ['dir', document.dir, module.dir], ['parent', document.parent, module.parent],
      ['children', document.children, module.children], ['revision', document.revision, revision],
      ['tags', [...(document.tags as string[] ?? [])].sort(), [...module.tags].sort()],
      ['purpose.state', (document.purpose as { state?: string } | undefined)?.state, module.readme ? 'present' : 'missing'],
    ];
    if (module.readme) expectations.push(['purpose.path', (document.purpose as { path?: string }).path, joinView(module.dir, 'README.md')]);
    for (const [field, actual, wanted] of expectations) {
      if (JSON.stringify(actual) !== JSON.stringify(wanted)) mismatches.push(`${module.id} module.json ${field}: ${JSON.stringify(actual)}, expected ${JSON.stringify(wanted)}`);
    }
    const own = [...recordsOf(files, joinView(directory, 'behavior.jsonl')), ...recordsOf(files, joinView(directory, 'supporting.jsonl'))];
    for (const record of own) if (record.module !== module.id) mismatches.push(`${directory || '.'} holds a record of ${String(record.module)}`);
    records.set(module.id, own);
  }
  if (!options.exposures) return { modules: modules.length, checkedExposures: 0, checkedWildcardFiles: 0, checkedRelays: 0, mismatches };
  // A wildcard selects every export of one interface file, read here with line patterns.
  const wildcardNames = new Map<string, readonly string[]>();
  for (const module of modules) for (const statement of module.statements) {
    if (statement.form === 'expose-sub' || statement.names !== '*') continue;
    const file = joinView(module.dir, `${statement.form === 'expose-test' ? 'src/tests' : 'src'}/${statement.from}`);
    wildcardNames.set(file, exportNames(await readFile(join(root, file), 'utf8')));
  }
  const named = (module: DeclaredModule, name: string): ViewRecord[] => (records.get(module.id) ?? [])
    .filter(record => record.name === name || (Array.isArray(record.as) && record.as.includes(name)));

  let checkedExposures = 0, checkedWildcardFiles = 0, checkedRelays = 0;
  const contracts = new Map<string, Map<string, ViewRecord>>();
  const toParent = (module: DeclaredModule): Map<string, ViewRecord> => {
    const known = contracts.get(module.id);
    if (known) return known;
    const contract = new Map<string, ViewRecord>();
    contracts.set(module.id, contract);
    for (const statement of module.statements) {
      if (!statement.to.includes('parent')) continue;
      const add = (name: string, record: ViewRecord | undefined) => { if (record) contract.set(name, record); };
      if (statement.form === 'expose-sub') {
        const child = byId.get(module.childByDirectory.get(statement.from) ?? '');
        if (!child) continue;
        const childContract = toParent(child);
        if (statement.names === '*') for (const [name, record] of childContract) add(name, record);
        else for (const item of statement.names) add(item.alias ?? item.name, childContract.get(item.name));
      } else {
        const area = statement.form === 'expose-test' ? 'src/tests' : 'src';
        const file = joinView(module.dir, `${area}/${statement.from}`);
        const names = statement.names === '*' ? (wildcardNames.get(file) ?? []).map(name => ({ name, alias: null })) : statement.names;
        for (const item of names) add(item.alias ?? item.name, pick(named(module, item.alias ?? item.name), file));
      }
    }
    return contract;
  };
  for (const module of modules) {
    for (const statement of module.statements) {
      if (statement.form !== 'expose-sub') {
        const area = statement.form === 'expose-test' ? 'src/tests' : 'src';
        const file = joinView(module.dir, `${area}/${statement.from}`);
        const names = statement.names === '*' ? (wildcardNames.get(file) ?? []).map(name => ({ name, alias: null })) : statement.names;
        const selected = names.map(item => {
          const record = pick(named(module, item.alias ?? item.name), file);
          if (!record) mismatches.push(`${module.id}: no single record for the exposed name ${item.alias ?? item.name}`);
          return record;
        }).filter((record): record is ViewRecord => !!record);
        if (statement.names === '*') { checkedWildcardFiles++; if (!names.length) mismatches.push(`${module.id}: no export read from the wildcard file ${file}`); }
        for (const record of selected) {
          checkedExposures++;
          const to = record.to as string[] | undefined;
          if (record.role !== 'exposed' || !statement.to.every(destination => to?.includes(destination))) {
            mismatches.push(`${module.id}#${String(record.name)}: role ${String(record.role)} to ${JSON.stringify(to)}, expected exposed to ${statement.to.join(', ')}`);
          }
        }
        continue;
      }
      const child = byId.get(module.childByDirectory.get(statement.from) ?? '');
      if (!child) { mismatches.push(`${module.id}: expose-sub names no child directory ${statement.from}`); continue; }
      const contract = toParent(child);
      const relayed = statement.names === '*' ? [...contract.values()]
        : statement.names.map(item => {
          const record = contract.get(item.name);
          if (!record) mismatches.push(`${module.id}: ${item.name} is not in ${child.id}'s contract to its parent`);
          return record;
        }).filter((record): record is ViewRecord => !!record);
      for (const record of relayed) {
        checkedRelays++;
        const entries = (record.reexposed as { by: string; to: string[] }[] | undefined) ?? [];
        const entry = entries.find(item => item.by === module.id);
        if (!entry || !statement.to.every(destination => entry.to.includes(destination))) {
          mismatches.push(`${String(record.module)}#${String(record.name)}: reexposed ${JSON.stringify(entries)}, expected by ${module.id} to ${statement.to.join(', ')}`);
        }
      }
    }
  }
  return { modules: modules.length, checkedExposures, checkedWildcardFiles, checkedRelays, mismatches };
}

/** The `.feature` titles read with line patterns, independently of the Gherkin reader. */
export async function featureExpectation(root: string, path: string): Promise<{ readonly feature: string | null; readonly scenarios: readonly string[] }> {
  const lines = (await readFile(join(root, path), 'utf8')).split(/\r?\n/).map(line => line.trim());
  const feature = lines.map(line => /^Feature:\s*(.*)$/.exec(line)?.[1]?.trim()).find(value => value !== undefined) ?? null;
  const scenarios = lines.map(line => /^(?:Scenario|Scenario Outline|Scenario Template|Example):\s*(.*)$/.exec(line)?.[1]?.trim())
    .filter((value): value is string => value !== undefined);
  return { feature, scenarios };
}

// ---------------------------------------------------------------------------
// Independent byte expectation: the same facts computed in this process

export interface InProcessFacts {
  readonly inputId: string;
  readonly projectionBytes: number;
  readonly timings: { readonly openMs: number; readonly queryMs: number; readonly analyzerMs: number };
  /** Renders the view for a revision identifier, which only the daemon's context names. */
  render(revision: string): Promise<{ readonly files: Map<string, string>; readonly modules: number; readonly records: number; readonly bytes: number }>;
}

/**
 * The architect view's facts for `root` computed without the daemon: a
 * retained session opened in this process with the CLI's project request, the
 * architect query at its revision with the specified limits, the dependency
 * analyzer called in process on that revision's report, and Plan 2C's module
 * metrics under the delivered `measure` policy: the revision's inventory
 * measurements joined with the encoded bytes of the whole API view, rendered
 * for the daemon's revision identifier under Plan 2A's frozen bounds. Run it
 * before any view exists under `root`: a resident compiler opened beside
 * generated directories records them as inputs (see iteration 8's results).
 */
export async function inProcessArchitectFacts(root: string): Promise<InProcessFacts> {
  const base = sessionInputs(root);
  const inputs: SessionInputs = { ...base, project: { cwd: root, scope: 'whole-project', configuration: 'discover' },
    limits: batchLimits,
    session: { updateDeadlineMs: 2_000, sweepIntervalMs: 30_000, workerHeapMiB: 1024, maxRetainedFactBytes: 96 * 1024 ** 2 } };
  const started = performance.now();
  const opened = await openRetainedSession(inputs);
  if (opened.status !== 'opened') throw new Error(`The in-process session did not open: ${opened.status}`);
  const openMs = performance.now() - started;
  try {
    const sequence = opened.revision.sequence;
    const queried = performance.now();
    const query = await opened.session.architectView({ sequence, ...specifiedArchitectLimits });
    const queryMs = performance.now() - queried;
    if (query.status !== 'projected') throw new Error(`The in-process architect query answered ${JSON.stringify(query).slice(0, 400)}`);
    const report: AnalysisReport | null = await opened.session.report(undefined, sequence);
    if (!report) throw new Error('The in-process session retained no report');
    const analyzed = performance.now();
    const outcome = await analyzeDependencyDiagram({ project: report.request.project, report,
      limits: { source: batchLimits.source, maxResultBytes: dependencyAnalyzerCapacity.maxResultBytes, deadlineMs: dependencyAnalyzerCapacity.analysisDeadlineMs } });
    const analyzerMs = performance.now() - analyzed;
    if (outcome.status !== 'ready') throw new Error(`The in-process analyzer answered ${JSON.stringify(outcome).slice(0, 400)}`);
    const measured = await opened.session.measurements(sequence);
    if (measured.status !== 'measured') throw new Error(`The in-process measurements answered ${JSON.stringify(measured).slice(0, 400)}`);
    const apiView = await opened.session.apiView({ sequence, selection: { scope: 'all' }, ...specifiedApiViewLimits });
    if (apiView.status !== 'projected') throw new Error(`The in-process API view query answered ${JSON.stringify(apiView).slice(0, 400)}`);
    const projection = query.projection;
    return {
      inputId: query.inputId, projectionBytes: projection.bytes, timings: { openMs, queryMs, analyzerMs },
      async render(revision) {
        // The encoded API-view bytes name the revision, so they are measured for the daemon's identifier.
        const views = await measureApiViewBytes(apiView.projection, revision,
          { maxAreaBytes: specifiedApiViewLimits.maxAreaBytes, maxInvocationBytes: specifiedApiViewLimits.maxInvocationBytes });
        if (views.status !== 'rendered') throw new Error(`The in-process API view measurement answered ${JSON.stringify(views).slice(0, 400)}`);
        const view = renderArchitectView({ revision, projection,
          dependencies: { state: 'measured', facts: outcome.diagram, testReferences: outcome.testReferences },
          measurements: architectMeasurements(measured.measurements, 'measured', views.views) });
        return { files: new Map(view.files.map(file => [file.path, file.text])), modules: view.modules, records: view.records, bytes: view.bytes };
      },
    };
  } finally { await opened.session.dispose(); }
}

// ---------------------------------------------------------------------------
// AV29 and AV31: real runs

const materializedLine = /^Root: (.+)\nMaterialized: revision (\d+); (\d+) target\(s\), (\d+) entries, (\d+) bytes written, (\d+) unchanged\nArchitect view: \.ramify-architect, (\d+) modules, (\d+) records, dependencies (measured|unavailable \([a-z-]+\))\n$/;

export interface MaterializeRun {
  readonly code: number | null;
  readonly stderr: string;
  readonly durationMs: number;
  readonly revision: number | null;
  readonly targets: number | null;
  readonly entries: number | null;
  readonly bytesWritten: number | null;
  readonly unchanged: number | null;
  readonly modules: number | null;
  readonly records: number | null;
  readonly dependencies: string | null;
}

export async function materialize(daemon: OwnedDaemon, root: string, args: readonly string[] = ['--view', 'architect']): Promise<MaterializeRun> {
  const result = await daemon.run(root, ['materialize', ...args]);
  const match = materializedLine.exec(result.stdout);
  const number = (index: number) => match ? Number(match[index]) : null;
  return { code: result.code, stderr: result.stderr, durationMs: result.durationMs, revision: number(2), targets: number(3), entries: number(4),
    bytesWritten: number(5), unchanged: number(6), modules: number(7), records: number(8), dependencies: match?.[9] ?? null };
}

export interface ProjectRunEvidence {
  readonly kind: ProjectKind;
  readonly first: MaterializeRun;
  readonly repeat: MaterializeRun;
  readonly rewrite: MaterializeRun;
  readonly revision: string;
  readonly inputId: string;
  readonly sequenceBefore: number | null;
  readonly sequenceAfter: number | null;
  readonly revisionsCounter: { readonly before: number; readonly after: number };
  readonly meta: Record<string, unknown>;
  readonly files: number;
  readonly bytes: number;
  readonly structural: StructuralExpectation;
  readonly feature: { readonly path: string; readonly expected: unknown; readonly actual: unknown } | null;
  /** Paths whose bytes, size, modification time or inode changed across the unchanged repeat. */
  readonly repeatTouched: readonly string[];
  /** The rewrite after deleting the view, compared byte for byte with the first tree. */
  readonly rewriteDifference: string | null;
  readonly inProcess: { readonly inputId: string; readonly difference: string | null; readonly records: number; readonly bytes: number;
    readonly projectionBytes: number; readonly timings: InProcessFacts['timings'] } | null;
  /** The normalized tree, for the determinism comparison. */
  readonly normalized: Map<string, string>;
}

async function contextOf(daemon: OwnedDaemon, root: string) {
  const status = await daemon.status();
  const context = status.contexts.find(item => item.root === root);
  return { status, context };
}

/** AV29 for one project on one daemon: first run, unchanged repeat, a rewrite after deleting the view, and the expectations. */
export async function projectRun(daemon: OwnedDaemon, kind: ProjectKind, root: string, options: { readonly inProcess: boolean }): Promise<ProjectRunEvidence> {
  const facts = options.inProcess ? await inProcessArchitectFacts(root) : null;
  const first = await materialize(daemon, root);
  const afterFirst = await contextOf(daemon, root);
  const revision = afterFirst.context?.revision ?? '';
  const inputId = afterFirst.context?.inputId ?? '';
  const tree = await readViewTree(root);
  const modules = await declaredModules(root);
  const structural = await structuralExpectation(root, modules, tree.files, revision, inputId, { exposures: kind === 'reference' });

  let feature: ProjectRunEvidence['feature'] = null;
  if (kind === 'reference') {
    const path = 'subs/integration-tests/src/features/collection-review.viz.feature';
    const expected = await featureExpectation(root, path);
    const actual = recordsOf(tree.files, 'integration-tests/tests.jsonl').filter(record => record.file === path)
      .map(record => ({ feature: record.feature ?? null, scenarios: record.scenarios }));
    feature = { path, expected: [expected], actual };
  }

  // Publishing starts no revision: wait well past the watcher's debounce, then read the context again.
  await delay(1500);
  const repeat = await materialize(daemon, root);
  const afterRepeat = await contextOf(daemon, root);
  const repeated = await readViewTree(root);
  const repeatTouched = [...new Set([...tree.stats.keys(), ...repeated.stats.keys()])].filter(path => {
    const a = tree.stats.get(path), b = repeated.stats.get(path);
    return !a || !b || a.bytes !== b.bytes || a.mtimeMs !== b.mtimeMs || a.ino !== b.ino || tree.files.get(path) !== repeated.files.get(path);
  });

  await rm(join(root, viewName), { recursive: true, force: true });
  const rewrite = await materialize(daemon, root);
  const rewritten = await readViewTree(root);

  let inProcess: ProjectRunEvidence['inProcess'] = null;
  if (facts) {
    const expected = await facts.render(revision);
    inProcess = { inputId: facts.inputId, difference: treeDifference(expected.files, tree.files), records: expected.records,
      bytes: expected.bytes, projectionBytes: facts.projectionBytes, timings: facts.timings };
  }
  return {
    kind, first, repeat, rewrite, revision, inputId,
    sequenceBefore: afterFirst.context?.sequence ?? null, sequenceAfter: afterRepeat.context?.sequence ?? null,
    revisionsCounter: { before: afterFirst.status.counters.revisions!, after: afterRepeat.status.counters.revisions! },
    meta: JSON.parse(tree.files.get('_meta.json') ?? '{}') as Record<string, unknown>,
    files: tree.files.size, bytes: viewBytes(tree.files), structural, feature, repeatTouched,
    rewriteDifference: treeDifference(tree.files, rewritten.files),
    inProcess, normalized: withoutRevision(tree.files, revision).files,
  };
}

export interface SecondRun {
  readonly kind: ProjectKind;
  /** `same-path`: the first copy again, its view deleted first; `other-path`: a second copy elsewhere. */
  readonly placement: 'same-path' | 'other-path';
  readonly first: MaterializeRun;
  readonly inputId: string;
  readonly revision: string;
  readonly revisionOccurrences: Record<string, number>;
  readonly roots: readonly [string, string];
  /** Against the first daemon's tree with each tree's revision replaced, and for another path its input too. */
  readonly difference: string | null;
}
export interface RealRunsEvidence {
  readonly primary: readonly ProjectRunEvidence[];
  readonly secondary: readonly SecondRun[];
  readonly stops: readonly DaemonStopEvidence[];
}

/**
 * AV29 and AV31. One owned daemon materializes a reference copy and a toolkit
 * copy. A second owned daemon materializes the same copies again, their views
 * deleted first, and a second copy of each at another path. The trees must
 * equal the first byte for byte once each tree's own revision identifier,
 * which names its daemon's context generation, is replaced; at another path
 * the input identity differs too, because it records the absent
 * `module.ramify` of each ancestor directory, and is replaced as well.
 */
export async function realRuns(): Promise<RealRunsEvidence> {
  const stops: DaemonStopEvidence[] = [];
  const scratch = await realpath(await mkdtemp('/tmp/rp2b-copies-'));
  try {
    const primaryRoots = { reference: await copyProject('reference', join(scratch, 'r1')), toolkit: await copyProject('toolkit', join(scratch, 't1')) };
    const primary = await withOwnedDaemon(async daemon => [
      await projectRun(daemon, 'reference', primaryRoots.reference, { inProcess: true }),
      await projectRun(daemon, 'toolkit', primaryRoots.toolkit, { inProcess: false }),
    ], stops);
    const otherRoots = { reference: await copyProject('reference', join(scratch, 'second-r')), toolkit: await copyProject('toolkit', join(scratch, 'second-t')) };
    const secondary = await withOwnedDaemon(async daemon => {
      const results: SecondRun[] = [];
      for (const placement of ['same-path', 'other-path'] as const) {
        for (const kind of ['reference', 'toolkit'] as const) {
          const root = placement === 'same-path' ? primaryRoots[kind] : otherRoots[kind];
          await rm(join(root, viewName), { recursive: true, force: true });
          const first = await materialize(daemon, root);
          const { context } = await contextOf(daemon, root);
          const tree = await readViewTree(root);
          const revision = context?.revision ?? '', inputId = context?.inputId ?? '';
          const normalized = withoutRevision(tree.files, revision);
          const reference = primary.find(item => item.kind === kind)!;
          const replaceInput = (files: ReadonlyMap<string, string>, input: string) => new Map([...files].map(([path, text]) => [path, text.split(input).join('<input>')]));
          const difference = placement === 'same-path' ? treeDifference(reference.normalized, normalized.files)
            : treeDifference(replaceInput(reference.normalized, reference.inputId), replaceInput(normalized.files, inputId));
          results.push({ kind, placement, first, inputId, revision, revisionOccurrences: Object.fromEntries(normalized.occurrences),
            roots: [primaryRoots[kind], root], difference });
        }
      }
      return results;
    }, stops);
    return { primary, secondary, stops };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// AV30: invariance of checks under interleaved materialization

/** Counters a materialization may change: its required sweep and, without retained facts, one analyzer job. */
export const materializeCounters = ['sweeps', 'analyses', 'dependencyDiagrams', 'behaviorRuns'] as const;
/** Every other counter: identical with and without interleaved materialization. */
export const invariantCounters = ['revisions', 'cancelledAnalyses', 'reusedRevisions', 'coalescedEvents', 'evictions', 'rejectedRequests',
  'disconnectedSlowConsumers', 'audits', 'auditMismatches', 'coveredRequests', 'coldOutcomes', 'deadlineOutcomes', 'dependencyDiagramInputChanges'] as const;

export interface InvarianceStep {
  readonly step: string;
  readonly code: number | null;
  readonly report: AnalysisReport | null;
  readonly sequence: number | null;
  readonly cause: string | null;
  readonly counters: DaemonCounters;
  readonly session: DaemonStatusSample['contexts'][number]['session'];
  readonly history: number;
  readonly watcherPublished: boolean | null;
}
export interface MaterializeStep {
  readonly after: string;
  readonly args: readonly string[];
  readonly run: MaterializeRun;
  readonly before: { readonly sequence: number | null; readonly counters: DaemonCounters };
  readonly afterRun: { readonly sequence: number | null; readonly counters: DaemonCounters };
  /** 1.5 s later, past the watcher's debounce. */
  readonly settled: { readonly sequence: number | null; readonly counters: DaemonCounters };
}
export interface InvarianceEvidence {
  readonly root: string;
  readonly edits: readonly { readonly path: string; readonly appended: string }[];
  readonly control: readonly InvarianceStep[];
  readonly interleaved: readonly InvarianceStep[];
  readonly materializations: readonly MaterializeStep[];
  readonly stops: readonly DaemonStopEvidence[];
}

const invarianceEdits = [
  { path: 'subs/workspace/subs/catalog/subs/core/src/catalog.ts', appended: '\nexport function plan2bInvarianceProbe(): number { return 1; }\n' },
  { path: 'subs/workspace/subs/catalog/subs/core/src/tests/catalog.test.ts', appended: "\ndescribe('plan2b invariance probe', () => { it('keeps checks unchanged', () => {}); });\n" },
] as const;

/**
 * AV30. The same copy, at the same path, runs one check sequence twice on two
 * fresh owned daemons: once alone and once with materializations interleaved.
 * Every command runs from the project root without `--root`, so each invocation
 * is the one that opened the context. After an edit, the step waits for the
 * watcher's revision, so both runs publish it by the same path.
 */
export async function invariance(): Promise<InvarianceEvidence> {
  const stops: DaemonStopEvidence[] = [];
  const scratch = await realpath(await mkdtemp('/tmp/rp2b-inv-'));
  try {
    const root = await copyProject('reference', join(scratch, 'project'));
    const originals = new Map<string, Buffer>();
    for (const edit of invarianceEdits) originals.set(edit.path, await readFile(join(root, edit.path)));
    const restore = async () => {
      for (const [path, bytes] of originals) await writeFile(join(root, path), bytes);
      await removeGenerated(root);
    };
    const sequence = async (interleave: boolean) => withOwnedDaemon(async daemon => {
      const steps: InvarianceStep[] = [];
      const materializations: MaterializeStep[] = [];
      const context = async () => (await contextOf(daemon, root));
      const check = async (step: string, watcherPublished: boolean | null) => {
        const result = await daemon.run(root, ['check', '--format', 'json']);
        const { status, context: found } = await context();
        steps.push({ step, code: result.code, report: result.code === 0 || result.code === 1 ? parseAnalysisDocument(result.stdout) : null,
          sequence: found?.sequence ?? null, cause: found?.cause ?? null, counters: status.counters, session: found?.session ?? null,
          history: found?.history ?? 0, watcherPublished });
      };
      const edit = async (index: number) => {
        const before = (await context()).context?.sequence ?? 0;
        const item = invarianceEdits[index]!;
        await writeFile(join(root, item.path), Buffer.concat([originals.get(item.path)!, Buffer.from(item.appended)]));
        const deadline = performance.now() + 15_000;
        while (performance.now() < deadline) {
          if (((await context()).context?.sequence ?? 0) > before) return true;
          await delay(100);
        }
        return false;
      };
      const interleaved = async (after: string, args: readonly string[]) => {
        if (!interleave) return;
        const before = await context();
        const run = await materialize(daemon, root, args);
        const afterRun = await context();
        await delay(1500);
        const settled = await context();
        materializations.push({ after, args, run,
          before: { sequence: before.context?.sequence ?? null, counters: before.status.counters },
          afterRun: { sequence: afterRun.context?.sequence ?? null, counters: afterRun.status.counters },
          settled: { sequence: settled.context?.sequence ?? null, counters: settled.status.counters } });
      };
      await check('open', null);
      await interleaved('open', ['--view', 'architect']);
      await check('edit-source', await edit(0));
      await interleaved('edit-source', ['--view', 'api', '--view', 'architect', '--all']);
      await check('edit-test', await edit(1));
      await interleaved('edit-test', ['--view', 'architect']);
      await check('unchanged', null);
      return { steps, materializations };
    }, stops);
    const control = await sequence(false);
    await restore();
    const interleaved = await sequence(true);
    await restore();
    return { root, edits: invarianceEdits, control: control.steps, interleaved: interleaved.steps, materializations: interleaved.materializations, stops };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

async function removeGenerated(root: string): Promise<void> {
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      const path = join(directory, entry.name);
      if (generatedName.test(entry.name)) await rm(path, { recursive: true, force: true });
      else await walk(path);
    }
  }
  await walk(root);
}

/** A report with its per-run identifier replaced, for comparison. */
export function comparableReport(report: AnalysisReport | null): unknown {
  return report ? { ...report, runId: '<run>' } : null;
}

// ---------------------------------------------------------------------------
// AV34: the API view without --view, byte for byte against the build before Plan 2B

/** The commit the plan's inventory was taken at, before any Plan 2B change. */
export const baselineCommit = '577b980';

/** Every file under every `.ramify` directory of a project, by project-relative path. */
export async function readApiViews(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  async function walk(directory: string, inside: boolean): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === viewName) continue;
        await walk(path, inside || entry.name === '.ramify');
      } else if (inside && entry.isFile()) files.set(relative(root, path), await readFile(path, 'utf8'));
    }
  }
  await walk(root, false);
  return new Map([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

/** Each `_meta.json`'s revision replaced: the only field that names a daemon's context. */
function withoutApiRevisions(files: ReadonlyMap<string, string>): Map<string, string> {
  return new Map([...files].map(([path, text]) => [path, path.endsWith('/_meta.json') ? text.replace(/"revision":"rev\/1:[^"]+"/, '"revision":"<revision>"') : text]));
}

export interface ApiIdentityEvidence {
  readonly baseline: { readonly commit: string; readonly buildCode: number | null; readonly buildMs: number };
  readonly projects: readonly { readonly kind: ProjectKind; readonly baseline: MaterializeRun; readonly current: MaterializeRun;
    readonly files: number; readonly bytes: number; readonly difference: string | null; readonly currentStdoutLines: readonly string[] }[];
  readonly stops: readonly DaemonStopEvidence[];
}

/**
 * `ramify materialize --all` without `--view`, by the build of the baseline
 * commit and by this build, on the same copies of the reference project and
 * the toolkit: the published API views must be byte-identical apart from each
 * `_meta.json`'s revision, and this build's output must have no architect line.
 */
export async function apiViewIdentity(): Promise<ApiIdentityEvidence> {
  const stops: DaemonStopEvidence[] = [];
  const scratch = await realpath(await mkdtemp('/tmp/rp2b-api-'));
  try {
    const base = join(scratch, 'baseline');
    await mkdir(base);
    const archive = await git(repositoryRoot, ['archive', '--format=tar', baselineCommit]);
    await new Promise<void>((resolve, reject) => {
      const child = spawn('tar', ['-x', '-C', base], { stdio: ['pipe', 'ignore', 'pipe'] });
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error(`tar exited ${code}`)));
      child.stdin.end(archive);
    });
    await symlink(join(repositoryRoot, 'node_modules'), join(base, 'node_modules'));
    const build = await command(base, process.execPath, ['--import', 'tsx', 'scripts/build-production.ts'], 300_000, { ...process.env, NODE_OPTIONS: '' });
    if (build.code !== 0) throw new Error(`The baseline build failed: ${build.stderr.slice(0, 2000)}`);
    const projects: ApiIdentityEvidence['projects'][number][] = [];
    for (const kind of ['reference', 'toolkit'] as const) {
      const root = await copyProject(kind, join(scratch, kind));
      const run = async (launcher: string) => withOwnedDaemon(async daemon => {
        const result = await daemon.run(root, ['materialize', '--all']);
        const match = /^Root: .+\nMaterialized: revision (\d+); (\d+) target\(s\), (\d+) entries, (\d+) bytes written, (\d+) unchanged\n$/.exec(result.stdout);
        const number = (index: number) => match ? Number(match[index]) : null;
        const outcome: MaterializeRun = { code: result.code, stderr: result.stderr, durationMs: result.durationMs, revision: number(1), targets: number(2),
          entries: number(3), bytesWritten: number(4), unchanged: number(5), modules: null, records: null, dependencies: null };
        return { outcome, stdout: result.stdout, files: await readApiViews(root) };
      }, stops, launcher);
      const before = await run(join(base, 'dist/src/ramify'));
      await removeGenerated(root);
      const after = await run(currentLauncher);
      await rm(root, { recursive: true, force: true });
      projects.push({ kind, baseline: before.outcome, current: after.outcome, files: after.files.size, bytes: viewBytes(after.files),
        difference: treeDifference(withoutApiRevisions(before.files), withoutApiRevisions(after.files)),
        currentStdoutLines: after.stdout.split('\n').filter(Boolean).map(line => line.replace(/^Root: .*/, 'Root: <root>')) });
    }
    return { baseline: { commit: baselineCommit, buildCode: build.code, buildMs: build.durationMs }, projects, stops };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// AV34: package entries and entry closures

export interface EntryEvidence {
  readonly packageEntries: number;
  readonly manifest: { readonly exports: readonly string[]; readonly baselineExports: readonly string[];
    /** Entry keys beyond the reviewed baseline, and those of them whose target is a string file. */
    readonly additions: readonly string[]; readonly stylesheetAdditions: readonly string[];
    readonly equalToBaseline: boolean };
  readonly client: { readonly code: number | null; readonly closure: readonly string[]; readonly assertions: number };
  readonly cli: { readonly code: number | null; readonly closure: readonly string[]; readonly forbidden: readonly string[];
    /** Process or socket activity of the import: spawns, launches, connections, listeners and binds. */
    readonly activity: number };
}

// The recorded additions beyond the reviewed baseline: the module-tree canvas
// entry and its stylesheet. `relocation.ts` holds the same separation of entry
// imports from stylesheet files.
const recordedEntryAdditions: readonly string[] = ['./module-tree'];
const recordedStylesheetAdditions: readonly string[] = ['./module-tree.css'];

/** Any analysis source, the retained session and its worker, or the compiler package. */
export const excludedFromEntries = /(?:dist\/subs\/analysis\/|node_modules\/(?:typescript|@typescript)\/)/;

/**
 * AV34's package-entry and closure cases: the eight reviewed entries validate
 * against the reviewed Plan 1 and Plan 2 metadata and equal the manifest at
 * `577b980`, the plan's inventory commit, and the only other keys are the
 * recorded additions; importing `./client` loads only its reviewed
 * closure and importing `./cli` loads no analysis, session, worker or
 * compiler module. The imports run in a private npm prefix under the process probe.
 */
export async function entryClosures(): Promise<EntryEvidence> {
  const read = (path: string) => readFile(join(repositoryRoot, path), 'utf8');
  const expected = reviewedPackage(await read('docs/plans/done/iteration-1-project-verifier/contracts.md'),
    await read('docs/plans/done/iteration-2-resident-verification/contracts.md'));
  const packageEntries = await validatePackageEntries(repositoryRoot, expected);
  const current = JSON.parse(await read('package.json')) as Record<string, unknown>;
  const baseline = JSON.parse((await git(repositoryRoot, ['show', '577b980:package.json'])).toString('utf8')) as Record<string, unknown>;
  const fields = ['type', 'main', 'types', 'bin'] as const;
  const currentExports = current.exports as Record<string, unknown>, baselineExports = baseline.exports as Record<string, unknown>;
  const reviewedKeys = Object.keys(baselineExports);
  const additions = Object.keys(currentExports).filter(key => !reviewedKeys.includes(key));
  const stylesheetAdditions = additions.filter(key => typeof currentExports[key] === 'string');
  // The reviewed entries still equal the `577b980` baseline, and the only other
  // keys are the recorded additions: the module-tree canvas entry and its
  // stylesheet, a string target resolved and read but never imported.
  const equalToBaseline = fields.every(field => JSON.stringify(current[field]) === JSON.stringify(baseline[field]))
    && reviewedKeys.every(key => JSON.stringify(currentExports[key]) === JSON.stringify(baselineExports[key]))
    && JSON.stringify(additions) === JSON.stringify([...recordedEntryAdditions, ...recordedStylesheetAdditions]);
  return withSequenceProcess(async processes => {
    const consumer = await realpath(join(dirname(dirname(dirname(processes.executable))), '..', '..'));
    const traced = async (specifier: string) => {
      const before = (await readTrace(processes.traceFile)).length;
      const result = await command(consumer, process.execPath, ['--input-type=module', '--eval',
        `const values = await import(${JSON.stringify(specifier)}); console.log(Object.keys(values).length);`], 30_000, processes.environment);
      return { result, events: (await readTrace(processes.traceFile)).slice(before) };
    };
    const preload = await realpath(join(repositoryRoot, 'src/tests/process-probe.mjs'));
    const client = await traced('ramify.ts/client');
    const assertions = new Assertions();
    const closure = assertClientClosure(client.events, repositoryRoot, preload, consumer, assertions);
    const cli = await traced('ramify.ts/cli');
    const cliFiles = cli.events.filter(event => event.event === 'load' && event.url?.startsWith('file:'))
      .map(event => fileURLToPath(event.url!)).filter(path => path !== preload && path !== join(consumer, '[eval1]'))
      .map(path => relative(repositoryRoot, path));
    return {
      packageEntries,
      manifest: { exports: Object.keys(currentExports), baselineExports: reviewedKeys, additions, stylesheetAdditions, equalToBaseline },
      client: { code: client.result.code, closure: [...closure].sort(), assertions: assertions.finish().length },
      cli: { code: cli.result.code, closure: [...cliFiles].sort(),
        forbidden: cliFiles.filter(path => excludedFromEntries.test(path) || sessionModulePattern.test(path)),
        activity: cli.events.filter(event => ['spawn', 'other-launch', 'connect', 'listen', 'bind'].includes(event.event)).length },
    };
  });
}

/** The instruction block the renderer places at the top of every view's `README.md`. */
export async function renderedInstructionBlock(): Promise<string> {
  const projection = { schema: 'ramify.architect-projection/1' as const, sequence: 1, inputId: 'input/1:0', root: 'm',
    modules: [{ module: 'm', dir: '', parent: null, children: [], tags: [], areas: [], purpose: { state: 'missing' as const }, docs: [],
      files: { own: 0, subtree: 0 } }], symbols: [], tests: [],
    counts: { coverage: 0, detailsUnavailable: 0, unknownShapes: 0, dynamicTitles: 0, testsUnavailable: 0, cut: 0 }, bytes: 0 };
  const view = renderArchitectView({ revision: 'rev/1:0:1', projection,
    dependencies: { state: 'unavailable', reason: 'analysis-failed' },
    measurements: { state: 'unavailable', reason: 'analysis-failed' } });
  const readme = view.files.find(file => file.path === 'README.md')!.text;
  const match = /^```text\n([\s\S]*?)\n```\n/.exec(readme);
  if (!match) throw new Error('The rendered README does not open with a text fence');
  return match[1]!;
}

/** Writes the evidence file named by `RAMIFY_PLAN2B_EVIDENCE`, when set. */
export async function writeEvidence(evidence: Record<string, unknown>): Promise<string | null> {
  const target = process.env.RAMIFY_PLAN2B_EVIDENCE;
  if (!target) return null;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(evidence, (key, value: unknown) => {
    if (value instanceof Map) return Object.fromEntries(value);
    return value;
  }, 2) + '\n');
  return target;
}
