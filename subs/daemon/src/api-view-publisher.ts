import { randomBytes } from 'node:crypto';
import {
  lstat as fsLstat, readdir as fsReaddir, readFile as fsReadFile, mkdir as fsMkdir,
  writeFile as fsWriteFile, open as fsOpen, rename as fsRename, rm as fsRm,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { ApiViewProjection } from '../../analysis/src/interfaces/session.js';
import type { RenderedArchitectView } from '../../analysis/src/interfaces/architect-view.js';
import type { RevisionId } from '../subs/contexts/src/interfaces/contexts.js';
import type {
  ApiViewPublisher, ApiViewPublishLimits, MaterializedTarget, MaterializedViewId, PublishApiViewOutcome, PublishInput,
} from './interfaces/daemon.js';
import { renderApiView, type RenderedArea, type RenderedDocument } from './api-view-documents.js';

/**
 * The daemon's transactional filesystem publisher
 * (docs/plans/iteration-2a-materialized-api-view/scope.md
 * "Publication and recovery", contracts.md "Renderer and publisher"; Plan 2B
 * contracts.md C6). Renders every requested module/area with
 * `api-view-documents.ts` and takes the architect view already rendered,
 * validates every target and document path, refuses any symlink in the
 * existing path chain or target contents, replaces an existing
 * `.ramify-architect` only when it is recognizably the architect view, stages
 * every changed target completely before switching any of them, keeps
 * rollback backups until the whole request commits, and recovers only its own
 * marked, exact-form stage/rollback siblings on the next invocation.
 * Identical reruns write zero target bytes and change zero mtimes.
 */

const PUBLISHER_VERSION = 'ramify.api-view-publisher/1';
/** Appended to a `<name>.tmp-<suffix>` or `<name>.old-<suffix>` directory's
 * own path to name its sibling marker *file* (never written inside the
 * directory — see "Ownership marker and crash recovery" below). */
const MARKER_NAME = '.marker.json';
const META_NAME = '_meta.json';
/** The API view's directory name, beside each module source area. */
const TARGET_NAME = '.ramify';
/** The architect view's directory name, at the project root. */
const ARCHITECT_NAME = '.ramify-architect';
const ARCHITECT_SCHEMA = 'ramify.architect-view/1';

/** The exact marker file names of each target name's stage and rollback siblings. */
const MARKER_PATTERNS: ReadonlyMap<string, { readonly tmp: RegExp; readonly old: RegExp }> = new Map([
  [TARGET_NAME, { tmp: /^\.ramify\.tmp-[0-9a-f]+\.marker\.json$/, old: /^\.ramify\.old-[0-9a-f]+\.marker\.json$/ }],
  [ARCHITECT_NAME, { tmp: /^\.ramify-architect\.tmp-[0-9a-f]+\.marker\.json$/, old: /^\.ramify-architect\.old-[0-9a-f]+\.marker\.json$/ }],
]);

/* ------------------------------------------------------------------------ */
/* Injected filesystem seam                                                 */
/* ------------------------------------------------------------------------ */

export type ApiViewEntryKind = 'file' | 'directory' | 'symlink' | 'other';
export interface ApiViewFsStat { readonly kind: ApiViewEntryKind; readonly size: number }
export interface ApiViewFsEntry { readonly name: string; readonly kind: ApiViewEntryKind }

/** Every filesystem operation the publisher performs, isolated behind one
 * seam so tests can inject a failure at any boundary (mkdir, write, fsync,
 * rename, rm) without touching real disks, and so a crash-recovery fixture
 * can pause a real process at a controlled point. */
export interface ApiViewFilesystemPort {
  /** `null` for a nonexistent path; never follows a symlink. */
  lstat(path: string): Promise<ApiViewFsStat | null>;
  readdir(path: string): Promise<readonly ApiViewFsEntry[]>;
  readFile(path: string): Promise<Buffer>;
  /** Recursive, like `mkdir -p`. */
  mkdir(path: string): Promise<void>;
  writeFile(path: string, data: Buffer): Promise<void>;
  fsyncFile(path: string): Promise<void>;
  fsyncDir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Recursive; the path must exist. */
  rm(path: string): Promise<void>;
}

function classify(stat: { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean }): ApiViewEntryKind {
  return stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
}

/** The real, production Node adapter: `createFilesystemApiViewPublisher` is
 * the only exposed factory and always uses this. */
export function createNodeApiViewFilesystem(): ApiViewFilesystemPort {
  return {
    async lstat(path) {
      try {
        const stat = await fsLstat(path);
        return { kind: classify(stat), size: stat.size };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    async readdir(path) {
      const entries = await fsReaddir(path, { withFileTypes: true });
      return entries.map(entry => ({ name: entry.name, kind: classify(entry) }));
    },
    readFile: path => fsReadFile(path),
    async mkdir(path) { await fsMkdir(path, { recursive: true }); },
    async writeFile(path, data) { await fsWriteFile(path, data); },
    async fsyncFile(path) {
      const handle = await fsOpen(path, 'r');
      try { await handle.sync(); } finally { await handle.close(); }
    },
    async fsyncDir(path) {
      const handle = await fsOpen(path, 'r');
      try { await handle.sync(); } finally { await handle.close(); }
    },
    async rename(from, to) { await fsRename(from, to); },
    async rm(path) { await fsRm(path, { recursive: true, force: false }); },
  };
}

export type ApiViewFsOp = 'mkdir' | 'writeFile' | 'fsyncFile' | 'fsyncDir' | 'rename' | 'rm';
interface QueuedFault {
  readonly op: ApiViewFsOp;
  readonly predicate?: (...args: readonly string[]) => boolean;
  readonly error?: Error;
}
/** A same-owner test double wrapping a real (usually temp-rooted) port: every
 * call is recorded, and a queued one-shot fault fires the next time a
 * matching operation (optionally filtered by its path arguments) is called.
 * Never exposed outside `daemon`; tests import it directly. */
export interface ControlledApiViewFilesystem extends ApiViewFilesystemPort {
  readonly calls: readonly { readonly op: string; readonly args: readonly string[] }[];
  failNext(op: ApiViewFsOp, predicate?: (...args: readonly string[]) => boolean, error?: Error): void;
}
export function createControlledApiViewFilesystem(base: ApiViewFilesystemPort = createNodeApiViewFilesystem()): ControlledApiViewFilesystem {
  const queue: QueuedFault[] = [];
  const calls: { op: string; args: string[] }[] = [];
  function guard(op: ApiViewFsOp, ...args: string[]): void {
    calls.push({ op, args });
    const index = queue.findIndex(item => item.op === op && (!item.predicate || item.predicate(...args)));
    if (index === -1) return;
    const [fault] = queue.splice(index, 1);
    throw fault.error ?? new Error(`Injected ${op} failure`);
  }
  return {
    lstat: path => base.lstat(path),
    readdir: path => base.readdir(path),
    readFile: path => base.readFile(path),
    async mkdir(path) { guard('mkdir', path); await base.mkdir(path); },
    async writeFile(path, data) { guard('writeFile', path); await base.writeFile(path, data); },
    async fsyncFile(path) { guard('fsyncFile', path); await base.fsyncFile(path); },
    async fsyncDir(path) { guard('fsyncDir', path); await base.fsyncDir(path); },
    async rename(from, to) { guard('rename', from, to); await base.rename(from, to); },
    async rm(path) { guard('rm', path); await base.rm(path); },
    get calls() { return calls.map(entry => ({ ...entry })); },
    failNext(op, predicate, error) { queue.push({ op, predicate, error }); },
  };
}

/* ------------------------------------------------------------------------ */
/* Path and content validation                                              */
/* ------------------------------------------------------------------------ */

function isSafeRelativePath(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\')
    && value.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..');
}

/** One target directory of one invocation, rendered and validated before any
 * filesystem access. */
interface Target {
  readonly view: MaterializedViewId;
  /** `null` for the architect view. */
  readonly module: string | null;
  /** `null` for the architect view. */
  readonly area: 'ordinary' | 'tests' | null;
  /** The project-relative directory that holds the target: a module source
   * area's root for the API view, `''` (the project root) for the architect view. */
  readonly parent: string;
  /** The target directory's own name: `.ramify` or `.ramify-architect`. */
  readonly name: string;
  /** Every file in write order, `_meta.json` last. */
  readonly files: readonly RenderedDocument[];
  readonly entries: number;
  readonly bytes: number;
}
type Targets = { readonly status: 'ok'; readonly targets: readonly Target[] } | { readonly status: 'invalid'; readonly message: string };

/** Pure: renders the projection, then validates every target and document
 * path defensively — the publisher never trusts a caller-supplied projection
 * to already be safe, even though `analysis` also validates its own joins. */
function collectRenderedApiTargets(areas: readonly RenderedArea[]): Targets {
  const targets: Target[] = [];
  for (const area of areas) {
    if (!isSafeRelativePath(area.root)) return { status: 'invalid', message: `Area root "${area.root}" is not a safe project-relative path` };
    for (const file of area.files) {
      if (!isSafeRelativePath(file.relativePath)) return { status: 'invalid', message: `Document path "${file.relativePath}" is not a safe relative path` };
    }
    const bytes = area.files.reduce((total, file) => total + file.bytes.byteLength, 0);
    // `area.files` already ends with `_meta.json` (see api-view-documents.ts).
    targets.push({ view: 'api', module: area.module, area: area.area, parent: area.root, name: TARGET_NAME,
      files: area.files, entries: area.entries, bytes });
  }
  return { status: 'ok', targets };
}
function collectApiTargets(projection: ApiViewProjection, revision: string): Targets {
  return collectRenderedApiTargets(renderApiView(projection, revision));
}

/** True when `bytes` parse as a JSON object whose `schema` is the architect view's. */
function namesArchitectSchema(bytes: Buffer): boolean {
  try {
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    return typeof parsed === 'object' && parsed !== null && (parsed as { schema?: unknown }).schema === ARCHITECT_SCHEMA;
  } catch { return false; }
}

/** Pure: validates the rendered architect view defensively. Every path must
 * be a safe relative path, name one file only and never also name a
 * directory; the view root must hold a `_meta.json` that names the
 * architect schema, so a published view is always one a later invocation
 * recognizes. The files are reordered to write `_meta.json` last. */
function collectArchitectTarget(view: RenderedArchitectView): Targets {
  const paths = new Set<string>();
  const documents: RenderedDocument[] = [];
  let meta: RenderedDocument | undefined;
  for (const file of view.files) {
    if (!isSafeRelativePath(file.path)) return { status: 'invalid', message: `Architect view path "${file.path}" is not a safe relative path` };
    if (paths.has(file.path)) return { status: 'invalid', message: `Architect view path "${file.path}" occurs twice` };
    paths.add(file.path);
    const document = { relativePath: file.path, bytes: Buffer.from(file.text, 'utf8') };
    if (file.path === META_NAME) meta = document; else documents.push(document);
  }
  const directories = impliedDirectories([...documents, ...(meta ? [meta] : [])]);
  for (const path of paths) {
    if (directories.has(path)) return { status: 'invalid', message: `Architect view path "${path}" names both a file and a directory` };
  }
  if (!meta || !namesArchitectSchema(meta.bytes)) {
    return { status: 'invalid', message: `The architect view has no ${META_NAME} naming ${ARCHITECT_SCHEMA}` };
  }
  const files = [...documents, meta];
  const bytes = files.reduce((total, file) => total + file.bytes.byteLength, 0);
  return { status: 'ok', targets: [{ view: 'architect', module: null, area: null, parent: '', name: ARCHITECT_NAME,
    files, entries: view.records, bytes }] };
}

/** Every target of one invocation: the API view's areas in render order, then
 * the architect view, so the architect target switches last. */
function collectTargets(input: PublishInput, revision: string): Targets {
  const targets: Target[] = [];
  for (const collected of [input.renderedApi ? collectRenderedApiTargets(input.renderedApi)
    : input.api ? collectApiTargets(input.api, revision) : null,
    input.architect ? collectArchitectTarget(input.architect) : null]) {
    if (!collected) continue;
    if (collected.status === 'invalid') return collected;
    targets.push(...collected.targets);
  }
  return { status: 'ok', targets };
}

type PathSafety = { readonly status: 'ok' } | { readonly status: 'symlink' } | { readonly status: 'invalid-path'; readonly message: string };

/** Every segment of `areaRoot` (all of them are ancestors of the `.ramify`
 * target itself, and the last of them is the source area itself — `<module>/src`
 * or `<module>/src/tests`) must exist as an ordinary directory; any symlink
 * refuses the whole publish before any write. Materialization never creates a
 * source area: an absent `areaRoot` — including one whose ancestors are
 * absent too — refuses the target with `invalid-path` rather than being
 * silently created by staging. */
async function checkAncestors(fs: ApiViewFilesystemPort, root: string, areaRoot: string): Promise<PathSafety> {
  let current = root;
  let stat: ApiViewFsStat | null = null;
  for (const segment of areaRoot.split('/')) {
    current = join(current, segment);
    stat = await fs.lstat(current);
    if (!stat) continue;
    if (stat.kind === 'symlink') return { status: 'symlink' };
    if (stat.kind !== 'directory') return { status: 'invalid-path', message: `"${current}" exists and is not a directory` };
  }
  if (!stat) return { status: 'invalid-path', message: `"${current}" does not exist; materialize never creates a source area` };
  return { status: 'ok' };
}

type ExistingTarget =
  | { readonly status: 'absent' }
  | { readonly status: 'symlink' }
  | { readonly status: 'invalid-path'; readonly message: string }
  | { readonly status: 'present'; readonly files: ReadonlyMap<string, Buffer> };

async function readExistingContents(fs: ApiViewFilesystemPort, dir: string, prefix = ''):
  Promise<{ readonly status: 'ok'; readonly files: Map<string, Buffer> } | { readonly status: 'symlink' }> {
  const files = new Map<string, Buffer>();
  for (const entry of await fs.readdir(dir)) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    const entryPath = join(dir, entry.name);
    if (entry.kind === 'symlink' || entry.kind === 'other') return { status: 'symlink' };
    if (entry.kind === 'directory') {
      const nested = await readExistingContents(fs, entryPath, key);
      if (nested.status === 'symlink') return nested;
      for (const [nestedKey, value] of nested.files) files.set(nestedKey, value);
    } else {
      files.set(key, await fs.readFile(entryPath));
    }
  }
  return { status: 'ok', files };
}

/** `lstat`s the target itself, then recursively walks and reads its existing
 * contents (files only; any symlink or other non-regular entry anywhere in
 * the tree refuses the whole publish). Absent is a legitimate first-
 * publication state, never an error. */
async function readExistingTarget(fs: ApiViewFilesystemPort, targetAbs: string): Promise<ExistingTarget> {
  const stat = await fs.lstat(targetAbs);
  if (!stat) return { status: 'absent' };
  if (stat.kind === 'symlink') return { status: 'symlink' };
  if (stat.kind !== 'directory') return { status: 'invalid-path', message: `"${targetAbs}" exists and is not a directory` };
  const walk = await readExistingContents(fs, targetAbs);
  if (walk.status === 'symlink') return { status: 'symlink' };
  return { status: 'present', files: walk.files };
}

function sameContent(existing: ReadonlyMap<string, Buffer>, rendered: readonly RenderedDocument[]): boolean {
  if (existing.size !== rendered.length) return false;
  for (const file of rendered) {
    const current = existing.get(file.relativePath);
    if (!current || !current.equals(file.bytes)) return false;
  }
  return true;
}

type Inspection =
  | { readonly status: 'ok'; readonly changed: boolean }
  | { readonly status: 'symlink' }
  | { readonly status: 'invalid-path'; readonly message: string };

/** The API view's rule: any existing directory is replaced; its bytes decide `changed`. */
async function inspectApiTarget(fs: ApiViewFilesystemPort, targetAbs: string, files: readonly RenderedDocument[]): Promise<Inspection> {
  const existing = await readExistingTarget(fs, targetAbs);
  if (existing.status === 'symlink' || existing.status === 'invalid-path') return existing;
  return { status: 'ok', changed: existing.status === 'absent' || !sameContent(existing.files, files) };
}

type Listing =
  | { readonly status: 'ok'; readonly sizes: Map<string, number>; readonly directories: Set<string> }
  | { readonly status: 'symlink' }
  | { readonly status: 'other'; readonly path: string };

/** Lists every regular file beneath `dir` with its size, and every directory,
 * reading no content. */
async function listExistingFiles(fs: ApiViewFilesystemPort, dir: string, prefix = '',
  sizes = new Map<string, number>(), directories = new Set<string>()): Promise<Listing> {
  for (const entry of await fs.readdir(dir)) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    const entryPath = join(dir, entry.name);
    if (entry.kind === 'symlink') return { status: 'symlink' };
    if (entry.kind === 'directory') {
      directories.add(key);
      const nested = await listExistingFiles(fs, entryPath, key, sizes, directories);
      if (nested.status !== 'ok') return nested;
    } else if (entry.kind === 'file') {
      const stat = await fs.lstat(entryPath);
      if (!stat || stat.kind !== 'file') return stat?.kind === 'symlink' ? { status: 'symlink' } : { status: 'other', path: key };
      sizes.set(key, stat.size);
    } else return { status: 'other', path: key };
  }
  return { status: 'ok', sizes, directories };
}

/** Every directory the files' paths imply, relative to the target. */
function impliedDirectories(files: readonly RenderedDocument[]): Set<string> {
  const directories = new Set<string>();
  for (const file of files) {
    const segments = file.relativePath.split('/');
    for (let end = 1; end < segments.length; end++) directories.add(segments.slice(0, end).join('/'));
  }
  return directories;
}

/** The architect view's rule (Plan 2B C6): an existing `.ramify-architect` is
 * replaced only when it is a real directory holding only regular files and
 * directories, with a `_meta.json` that names the architect schema. A
 * symbolic link at or in it refuses with `symlink`; anything else refuses
 * with `invalid-path`, so a directory the user owns is never replaced. Sizes
 * are compared before any content is read. */
async function inspectArchitectTarget(fs: ApiViewFilesystemPort, targetAbs: string, relativeDir: string,
  files: readonly RenderedDocument[]): Promise<Inspection> {
  const stat = await fs.lstat(targetAbs);
  if (!stat) return { status: 'ok', changed: true };
  if (stat.kind === 'symlink') return { status: 'symlink' };
  const refuse = (reason: string): Inspection => ({ status: 'invalid-path',
    message: `"${relativeDir}" ${reason}, so it is not a generated architect view; it was left untouched` });
  if (stat.kind !== 'directory') return refuse('exists and is not a directory');
  const listing = await listExistingFiles(fs, targetAbs);
  if (listing.status === 'symlink') return listing;
  if (listing.status === 'other') return refuse(`contains "${listing.path}", which is neither a regular file nor a directory`);
  if (!listing.sizes.has(META_NAME)) return refuse(`has no ${META_NAME}`);
  if (!namesArchitectSchema(await fs.readFile(join(targetAbs, META_NAME)))) return refuse(`has a ${META_NAME} that does not name ${ARCHITECT_SCHEMA}`);
  const directories = impliedDirectories(files);
  if (listing.sizes.size !== files.length || files.some(file => listing.sizes.get(file.relativePath) !== file.bytes.byteLength)
    || listing.directories.size !== directories.size || [...listing.directories].some(path => !directories.has(path))) {
    return { status: 'ok', changed: true };
  }
  for (const file of files) {
    if (!(await fs.readFile(join(targetAbs, file.relativePath))).equals(file.bytes)) return { status: 'ok', changed: true };
  }
  return { status: 'ok', changed: false };
}

/* ------------------------------------------------------------------------ */
/* Ownership marker and crash recovery                                      */
/* ------------------------------------------------------------------------ */

interface Marker { readonly schema: 'ramify.api-view-publisher-marker/1'; readonly version: string; readonly suffix: string; readonly kind: 'tmp' | 'old' }

/** The ownership marker for `dirAbs` (a `<name>.tmp-<suffix>` or
 * `<name>.old-<suffix>` directory, `<name>` being `.ramify` or
 * `.ramify-architect`) lives as a *sibling file*, never inside the directory
 * itself: `<name>.tmp-<suffix>` is later renamed verbatim into the live
 * target, and a marker written inside it would otherwise leak into published
 * output. The marker path still matches the same reserved segment pattern
 * (`^<name>\.(tmp|old)-.+$`), so it stays excluded from inventory,
 * observation and watching regardless. */
function markerPath(dirAbs: string): string { return `${dirAbs}${MARKER_NAME}`; }

function markerBytes(suffix: string, kind: Marker['kind']): Buffer {
  const marker: Marker = { schema: 'ramify.api-view-publisher-marker/1', version: PUBLISHER_VERSION, suffix, kind };
  return Buffer.from(JSON.stringify(marker), 'utf8');
}
async function writeMarker(fs: ApiViewFilesystemPort, dirAbs: string, suffix: string, kind: Marker['kind']): Promise<void> {
  const path = markerPath(dirAbs);
  await fs.writeFile(path, markerBytes(suffix, kind));
  await fs.fsyncFile(path);
}
async function removeMarker(fs: ApiViewFilesystemPort, dirAbs: string): Promise<void> {
  try { await fs.rm(markerPath(dirAbs)); } catch { /* already absent */ }
}
async function readMarkerAt(fs: ApiViewFilesystemPort, path: string): Promise<Marker | null> {
  try {
    const parsed: unknown = JSON.parse((await fs.readFile(path)).toString('utf8'));
    if (parsed && typeof parsed === 'object' && (parsed as Marker).schema === 'ramify.api-view-publisher-marker/1'
      && typeof (parsed as Marker).version === 'string' && typeof (parsed as Marker).suffix === 'string'
      && ((parsed as Marker).kind === 'tmp' || (parsed as Marker).kind === 'old')) {
      return parsed as Marker;
    }
    return null;
  } catch { return null; }
}

/** Removes a marked sibling directory; true when it is gone, whether removed now or never
 * created. A directory whose removal failed keeps its marker, so a later publication retries:
 * an unmarked sibling is never reclaimed. */
async function removeMarked(fs: ApiViewFilesystemPort, dirAbs: string): Promise<boolean> {
  try { await fs.rm(dirAbs); return true; }
  catch {
    try { return await fs.lstat(dirAbs) === null; } catch { return false; }
  }
}

/** Recovers only this publisher's own, exact-form, correctly marked stage or
 * rollback siblings of the target `name` in `parentDir` — never an unmarked or
 * foreign-version lookalike (a marker file that fails to parse or match
 * leaves its directory untouched). A lone `.tmp-` marker means a prior switch
 * never started for this target (the live directory is untouched): discard
 * the stale stage. A lone `.old-` marker with the live target present means a
 * prior switch already committed before cleanup ran: discard the stale
 * backup. An `.old-` marker with the live target absent means a prior process
 * crashed between the two switch renames: restore the backup byte-for-byte. */
async function recoverSiblings(fs: ApiViewFilesystemPort, parentDir: string, name: string): Promise<void> {
  let entries: readonly ApiViewFsEntry[];
  try { entries = await fs.readdir(parentDir); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const targetPath = join(parentDir, name);
  const patterns = MARKER_PATTERNS.get(name)!;
  for (const entry of entries) {
    if (entry.kind !== 'file') continue;
    const isTmp = patterns.tmp.test(entry.name);
    const isOld = patterns.old.test(entry.name);
    if (!isTmp && !isOld) continue;
    const markerFilePath = join(parentDir, entry.name);
    const dirPath = join(parentDir, entry.name.slice(0, -MARKER_NAME.length));
    const marker = await readMarkerAt(fs, markerFilePath);
    if (!marker || marker.version !== PUBLISHER_VERSION || marker.kind !== (isTmp ? 'tmp' : 'old')) continue;
    if (isTmp) {
      // The stage may not have been created before the crash.
      if (await removeMarked(fs, dirPath)) await fs.rm(markerFilePath);
      continue;
    }
    const targetStat = await fs.lstat(targetPath);
    if (targetStat) {
      // The live target still exists: either the rename this marker
      // describes never happened (crash right after the marker write), or
      // it already fully committed and this is a stale backup pending
      // cleanup. Either way the `.old-` directory, if present, is discarded.
      if (await removeMarked(fs, dirPath)) await fs.rm(markerFilePath);
      continue;
    }
    await fs.rename(dirPath, targetPath);
    await fs.fsyncDir(parentDir);
    await fs.rm(markerFilePath);
  }
}

/* ------------------------------------------------------------------------ */
/* Staging and switching                                                    */
/* ------------------------------------------------------------------------ */

interface Prepared extends Target {
  readonly relativeDir: string;
  readonly parentAbs: string;
  readonly targetAbs: string;
  readonly tmpAbs: string;
  readonly oldAbs: string;
  readonly changed: boolean;
}

async function stageTarget(fs: ApiViewFilesystemPort, target: Prepared, suffix: string): Promise<void> {
  // The marker is a sibling of `target.tmpAbs`, in the same parent directory
  // as the eventual live target (`target.parentAbs`: the source area's own
  // root, or the project root for the architect view). `checkAncestors`
  // already refused the whole publish if a source area did not exist, so
  // staging never creates it: materialization never creates a source area.
  // The marker is written before the directory it describes exists (it is a
  // sibling file, independent of the directory), so a crash between the two
  // can never leave an unmarked stage for this suffix.
  await writeMarker(fs, target.tmpAbs, suffix, 'tmp');
  await fs.mkdir(target.tmpAbs);
  const directories = new Set<string>();
  for (const file of target.files) {
    const dir = dirname(join(target.tmpAbs, file.relativePath));
    if (dir !== target.tmpAbs && !directories.has(dir)) { await fs.mkdir(dir); directories.add(dir); }
  }
  // `target.files` ends with `_meta.json` (`collectApiTargets` and
  // `collectArchitectTarget`), so writing in array order writes it last, as
  // the publication contract requires.
  for (const file of target.files) {
    const filePath = join(target.tmpAbs, file.relativePath);
    await fs.writeFile(filePath, file.bytes);
    await fs.fsyncFile(filePath);
  }
  for (const dir of [...directories].sort()) await fs.fsyncDir(dir);
  await fs.fsyncDir(target.tmpAbs);
}

/** Either the target is fully adopted (both renames done, and this
 * publisher's own markers no longer exist anywhere) or it throws with the
 * target restored to exactly its pre-call state — a caller never needs to
 * distinguish a fully- from a partially-switched target. */
async function switchTarget(fs: ApiViewFilesystemPort, target: Prepared, suffix: string): Promise<void> {
  const existingStat = await fs.lstat(target.targetAbs);
  if (existingStat) {
    // Marker before rename, for the same reason as in `stageTarget`: a crash
    // immediately after the rename must never leave an unmarked `.old-`
    // directory recovery would have to guess about.
    await writeMarker(fs, target.oldAbs, suffix, 'old');
    await fs.rename(target.targetAbs, target.oldAbs);
    // The rename changes the parent directory's own entries; fsync it too,
    // where the platform supports the guarantee, so the rename itself
    // survives a crash immediately after.
    await fs.fsyncDir(target.parentAbs);
  }
  try {
    await fs.rename(target.tmpAbs, target.targetAbs);
    await fs.fsyncDir(target.parentAbs);
  } catch (error) {
    if (existingStat) {
      await fs.rename(target.oldAbs, target.targetAbs);
      await removeMarker(fs, target.oldAbs);
      await fs.fsyncDir(target.parentAbs);
    }
    throw error;
  }
  await removeMarker(fs, target.tmpAbs);
}

/** Restores one already-switched target to its pre-publish state: discards
 * the newly adopted content and, if a backup exists (it may not, for a
 * target that had no previous view), renames it back byte-for-byte. */
async function rollbackTarget(fs: ApiViewFilesystemPort, target: Prepared): Promise<void> {
  const currentStat = await fs.lstat(target.targetAbs);
  if (currentStat) await fs.rm(target.targetAbs);
  const oldStat = await fs.lstat(target.oldAbs);
  if (oldStat) {
    await fs.rename(target.oldAbs, target.targetAbs);
    await removeMarker(fs, target.oldAbs);
  }
  await fs.fsyncDir(target.parentAbs);
}

/** Removes each stage, then its marker. A stage whose removal failed keeps its marker, so a
 * future publish's recovery step reclaims it. A stage that was never created (its `mkdir`
 * failed) loses only the marker. */
async function cleanupTmp(fs: ApiViewFilesystemPort, targets: readonly Prepared[]): Promise<void> {
  for (const target of targets) {
    if (await removeMarked(fs, target.tmpAbs)) await removeMarker(fs, target.tmpAbs);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateLimits(limits: ApiViewPublishLimits): void {
  for (const key of ['maxAreaBytes', 'maxArchitectBytes', 'maxInvocationBytes', 'maxStagedBytes'] as const) {
    const value = limits[key];
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid publish limit "${key}": must be a positive finite number`);
  }
}

/* ------------------------------------------------------------------------ */
/* Publisher                                                                 */
/* ------------------------------------------------------------------------ */

function createPublisher(limits: ApiViewPublishLimits, fs: ApiViewFilesystemPort, randomSuffix: () => string): ApiViewPublisher {
  validateLimits(limits);
  return {
    async publish(root: string, revision: RevisionId, input: PublishInput, _requestId: string, control?: RunControl): Promise<PublishApiViewOutcome> {
      try {
        if (control?.signal?.aborted) return { status: 'cancelled' };

        const collected = collectTargets(input, revision);
        if (collected.status === 'invalid') return { status: 'unavailable', reason: 'invalid-path', message: collected.message };

        const suffix = randomSuffix();
        if (!/^[0-9a-f]{32}$/.test(suffix)) throw new Error('The publisher\'s suffix generator must return 32 lowercase hexadecimal characters');

        const prepared: Prepared[] = [];
        for (const target of collected.targets) {
          const parentAbs = resolve(root, target.parent);
          const targetAbs = join(parentAbs, target.name);
          const relativeDir = target.parent ? `${target.parent}/${target.name}` : target.name;

          // The architect view's parent is the project root itself, which the
          // caller supplies and which is never created or replaced.
          if (target.parent) {
            const ancestorSafety = await checkAncestors(fs, root, target.parent);
            if (ancestorSafety.status === 'symlink') return { status: 'unavailable', reason: 'symlink', message: `A symlink blocks the path to "${relativeDir}"` };
            if (ancestorSafety.status === 'invalid-path') return { status: 'unavailable', reason: 'invalid-path', message: ancestorSafety.message };
          }

          // Recovery runs at the start of handling each target, before this
          // invocation reads its "existing" content, so a prior crash never
          // makes this call compare against a transient, half-switched state.
          await recoverSiblings(fs, parentAbs, target.name);

          const existing = target.view === 'api' ? await inspectApiTarget(fs, targetAbs, target.files)
            : await inspectArchitectTarget(fs, targetAbs, relativeDir, target.files);
          if (existing.status === 'symlink') return { status: 'unavailable', reason: 'symlink', message: `"${relativeDir}" or one of its contents is a symlink` };
          if (existing.status === 'invalid-path') return { status: 'unavailable', reason: 'invalid-path', message: existing.message };

          prepared.push({
            ...target, relativeDir, parentAbs, targetAbs,
            tmpAbs: join(parentAbs, `${target.name}.tmp-${suffix}`), oldAbs: join(parentAbs, `${target.name}.old-${suffix}`),
            changed: existing.changed,
          });
        }

        for (const target of prepared) {
          const [limit, label] = target.view === 'api' ? [limits.maxAreaBytes, 'area'] : [limits.maxArchitectBytes, 'architect view'];
          if (target.bytes > limit) {
            return { status: 'unavailable', reason: 'resource-limit', message: `"${target.relativeDir}" is ${target.bytes} bytes, over the ${limit}-byte ${label} limit` };
          }
        }
        const invocationBytes = prepared.reduce((total, target) => total + target.bytes, 0);
        if (invocationBytes > limits.maxInvocationBytes) {
          return { status: 'unavailable', reason: 'resource-limit', message: `This invocation is ${invocationBytes} bytes, over the ${limits.maxInvocationBytes}-byte invocation limit` };
        }
        const changedTargets = prepared.filter(target => target.changed);
        const stagedBytes = changedTargets.reduce((total, target) => total + target.bytes, 0);
        if (stagedBytes > limits.maxStagedBytes) {
          return { status: 'unavailable', reason: 'resource-limit', message: `Staging ${stagedBytes} bytes exceeds the ${limits.maxStagedBytes}-byte staged limit` };
        }

        if (control?.signal?.aborted) return { status: 'cancelled' };

        const attempted: Prepared[] = [];
        try {
          for (const target of changedTargets) {
            attempted.push(target);
            await stageTarget(fs, target, suffix);
          }
        } catch (error) {
          await cleanupTmp(fs, attempted);
          return { status: 'unavailable', reason: 'output-failure', message: messageOf(error) };
        }

        if (control?.signal?.aborted) {
          await cleanupTmp(fs, changedTargets);
          return { status: 'cancelled' };
        }

        const switched: Prepared[] = [];
        let failure: unknown;
        let cancelledMidSwitch = false;
        for (const target of changedTargets) {
          try {
            await switchTarget(fs, target, suffix);
            switched.push(target);
          } catch (error) { failure = error; break; }
          if (control?.signal?.aborted) { cancelledMidSwitch = true; break; }
        }

        if (failure !== undefined || cancelledMidSwitch) {
          try {
            for (const target of [...switched].reverse()) await rollbackTarget(fs, target);
            await cleanupTmp(fs, changedTargets.filter(target => !switched.includes(target)));
          } catch (rollbackError) {
            return { status: 'unavailable', reason: 'rollback-failure', message: messageOf(rollbackError) };
          }
          if (cancelledMidSwitch) return { status: 'cancelled' };
          return { status: 'unavailable', reason: 'output-failure', message: messageOf(failure) };
        }

        // Every requested target now holds its new (or unchanged) content.
        // Removing the rollback backups is best-effort: a failure here never
        // retracts an already-correct publish, since the next invocation's
        // recovery step reclaims any leftover, marked `.old-` directory.
        for (const target of changedTargets) {
          try {
            await fs.rm(target.oldAbs);
            await removeMarker(fs, target.oldAbs);
          } catch { /* self-heals on the next publish */ }
        }

        const targets: MaterializedTarget[] = prepared.map(target => ({
          view: target.view, module: target.module, area: target.area, path: target.relativeDir,
          files: target.files.length, entries: target.entries,
          bytes: target.bytes, changed: target.changed,
        }));
        return { status: 'published', targets, bytesWritten: stagedBytes };
      } catch (error) {
        return { status: 'unavailable', reason: 'output-failure', message: messageOf(error) };
      }
    },
  };
}

/** The production adapter: always the real Node filesystem and a
 * cryptographically random 32-hex-character suffix per invocation. This is
 * the only export `subs/daemon/module.ramify` exposes to the parent. */
export function createFilesystemApiViewPublisher(limits: ApiViewPublishLimits): ApiViewPublisher {
  return createPublisher(limits, createNodeApiViewFilesystem(), () => randomBytes(16).toString('hex'));
}

/** A same-owner test factory: an injected filesystem seam (typically
 * `createControlledApiViewFilesystem` over a real temp directory) and,
 * optionally, a deterministic suffix generator for reproducible assertions. */
export function createControlledFilesystemApiViewPublisher(
  limits: ApiViewPublishLimits,
  fs: ApiViewFilesystemPort,
  randomSuffix: () => string = () => randomBytes(16).toString('hex'),
): ApiViewPublisher {
  return createPublisher(limits, fs, randomSuffix);
}
