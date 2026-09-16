import { randomBytes } from 'node:crypto';
import {
  lstat as fsLstat, readdir as fsReaddir, readFile as fsReadFile, mkdir as fsMkdir,
  writeFile as fsWriteFile, open as fsOpen, rename as fsRename, rm as fsRm,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { RunControl } from '../../analysis/src/interfaces/analysis.js';
import type { ApiViewProjection } from '../../analysis/src/interfaces/session.js';
import type { RevisionId } from '../subs/contexts/src/interfaces/contexts.js';
import type { ApiViewPublisher, ApiViewPublishLimits, MaterializedTarget, PublishApiViewOutcome } from './interfaces/daemon.js';
import { renderApiView, type RenderedArea, type RenderedDocument } from './api-view-documents.js';

/**
 * The daemon's transactional filesystem publisher
 * (docs/plans/iteration-2a-materialized-api-view/scope.md
 * "Publication and recovery", contracts.md "Renderer and publisher"). Renders
 * every requested module/area with `api-view-documents.ts`, validates every
 * target and document path, refuses any symlink in the existing path chain or
 * target contents, stages every changed target completely before switching
 * any of them, keeps rollback backups until the whole request commits, and
 * recovers only its own marked, exact-form stage/rollback siblings on the
 * next invocation. Identical reruns write zero target bytes and change zero
 * mtimes.
 */

const PUBLISHER_VERSION = 'ramify.api-view-publisher/1';
/** Appended to a `.ramify.tmp-<suffix>` or `.ramify.old-<suffix>` directory's
 * own path to name its sibling marker *file* (never written inside the
 * directory — see "Ownership marker and crash recovery" below). */
const MARKER_NAME = '.marker.json';
const TARGET_NAME = '.ramify';
const TMP_MARKER_PATTERN = /^\.ramify\.tmp-[0-9a-f]+\.marker\.json$/;
const OLD_MARKER_PATTERN = /^\.ramify\.old-[0-9a-f]+\.marker\.json$/;

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

interface Target {
  readonly module: string;
  readonly area: 'ordinary' | 'tests';
  readonly areaRoot: string;
  readonly rendered: RenderedArea;
  readonly bytes: number;
}
type Targets = { readonly status: 'ok'; readonly targets: readonly Target[] } | { readonly status: 'invalid'; readonly message: string };

/** Pure: renders the projection, then validates every target and document
 * path defensively — the publisher never trusts a caller-supplied projection
 * to already be safe, even though `analysis` also validates its own joins. */
function collectTargets(projection: ApiViewProjection, revision: string): Targets {
  const areas = renderApiView(projection, revision);
  const targets: Target[] = [];
  for (const area of areas) {
    if (!isSafeRelativePath(area.root)) return { status: 'invalid', message: `Area root "${area.root}" is not a safe project-relative path` };
    for (const file of area.files) {
      if (!isSafeRelativePath(file.relativePath)) return { status: 'invalid', message: `Document path "${file.relativePath}" is not a safe relative path` };
    }
    const bytes = area.files.reduce((total, file) => total + file.bytes.byteLength, 0);
    targets.push({ module: area.module, area: area.area, areaRoot: area.root, rendered: area, bytes });
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

/* ------------------------------------------------------------------------ */
/* Ownership marker and crash recovery                                      */
/* ------------------------------------------------------------------------ */

interface Marker { readonly schema: 'ramify.api-view-publisher-marker/1'; readonly version: string; readonly suffix: string; readonly kind: 'tmp' | 'old' }

/** The ownership marker for `dirAbs` (a `.ramify.tmp-<suffix>` or
 * `.ramify.old-<suffix>` directory) lives as a *sibling file*, never inside
 * the directory itself: `.ramify.tmp-<suffix>` is later renamed verbatim
 * into the live target, and a marker written inside it would otherwise leak
 * into published output. The marker path still matches the same reserved
 * segment pattern (`^\.ramify\.(tmp|old)-.+$`), so it stays excluded from
 * inventory, observation and watching regardless. */
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

/** Recovers only this publisher's own, exact-form, correctly marked stage or
 * rollback siblings of one target — never an unmarked or foreign-version
 * lookalike (a marker file that fails to parse or match leaves its directory
 * untouched). A lone `.tmp-` marker means a prior switch never started for
 * this target (the live directory is untouched): discard the stale stage. A
 * lone `.old-` marker with the live target present means a prior switch
 * already committed before cleanup ran: discard the stale backup. An
 * `.old-` marker with the live target absent means a prior process crashed
 * between the two switch renames: restore the backup byte-for-byte. */
async function recoverSiblings(fs: ApiViewFilesystemPort, parentDir: string): Promise<void> {
  let entries: readonly ApiViewFsEntry[];
  try { entries = await fs.readdir(parentDir); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const targetPath = join(parentDir, TARGET_NAME);
  for (const entry of entries) {
    if (entry.kind !== 'file') continue;
    const isTmp = TMP_MARKER_PATTERN.test(entry.name);
    const isOld = OLD_MARKER_PATTERN.test(entry.name);
    if (!isTmp && !isOld) continue;
    const markerFilePath = join(parentDir, entry.name);
    const dirPath = join(parentDir, entry.name.slice(0, -MARKER_NAME.length));
    const marker = await readMarkerAt(fs, markerFilePath);
    if (!marker || marker.version !== PUBLISHER_VERSION || marker.kind !== (isTmp ? 'tmp' : 'old')) continue;
    if (isTmp) {
      try { await fs.rm(dirPath); } catch { /* the stage may not have been created before the crash */ }
      await fs.rm(markerFilePath);
      continue;
    }
    const targetStat = await fs.lstat(targetPath);
    if (targetStat) {
      // The live target still exists: either the rename this marker
      // describes never happened (crash right after the marker write), or
      // it already fully committed and this is a stale backup pending
      // cleanup. Either way the `.old-` directory, if present, is discarded.
      try { await fs.rm(dirPath); } catch { /* the rename may never have happened */ }
      await fs.rm(markerFilePath);
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

interface Prepared {
  readonly module: string;
  readonly area: 'ordinary' | 'tests';
  readonly relativeDir: string;
  readonly parentAbs: string;
  readonly targetAbs: string;
  readonly tmpAbs: string;
  readonly oldAbs: string;
  readonly rendered: RenderedArea;
  readonly bytes: number;
  readonly changed: boolean;
}

async function stageTarget(fs: ApiViewFilesystemPort, target: Prepared, suffix: string): Promise<void> {
  // The marker is a sibling of `target.tmpAbs`, in the same parent directory
  // as the eventual live target (`target.parentAbs`, the source area's own
  // root). `checkAncestors` already refused the whole publish if that parent
  // did not exist, so staging never creates it: materialization never
  // creates a source area.
  // The marker is written before the directory it describes exists (it is a
  // sibling file, independent of the directory), so a crash between the two
  // can never leave an unmarked stage for this suffix.
  await writeMarker(fs, target.tmpAbs, suffix, 'tmp');
  await fs.mkdir(target.tmpAbs);
  const directories = new Set<string>();
  for (const file of target.rendered.files) {
    const dir = dirname(join(target.tmpAbs, file.relativePath));
    if (dir !== target.tmpAbs && !directories.has(dir)) { await fs.mkdir(dir); directories.add(dir); }
  }
  // `target.rendered.files` already ends with `_meta.json` (see api-view-documents.ts),
  // so writing in array order writes it last, as the publication contract requires.
  for (const file of target.rendered.files) {
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

async function cleanupTmp(fs: ApiViewFilesystemPort, targets: readonly Prepared[]): Promise<void> {
  for (const target of targets) {
    try { await fs.rm(target.tmpAbs); } catch { /* a future publish's recovery step reclaims it via the marker */ }
    await removeMarker(fs, target.tmpAbs);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateLimits(limits: ApiViewPublishLimits): void {
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid publish limit "${key}": must be a positive finite number`);
  }
}

/* ------------------------------------------------------------------------ */
/* Publisher                                                                 */
/* ------------------------------------------------------------------------ */

function createPublisher(limits: ApiViewPublishLimits, fs: ApiViewFilesystemPort, randomSuffix: () => string): ApiViewPublisher {
  validateLimits(limits);
  return {
    async publish(root: string, revision: RevisionId, projection: ApiViewProjection, _requestId: string, control?: RunControl): Promise<PublishApiViewOutcome> {
      try {
        if (control?.signal?.aborted) return { status: 'cancelled' };

        const collected = collectTargets(projection, revision);
        if (collected.status === 'invalid') return { status: 'unavailable', reason: 'invalid-path', message: collected.message };

        const suffix = randomSuffix();
        if (!/^[0-9a-f]{32}$/.test(suffix)) throw new Error('The publisher\'s suffix generator must return 32 lowercase hexadecimal characters');

        const prepared: Prepared[] = [];
        for (const target of collected.targets) {
          const parentAbs = resolve(root, target.areaRoot);
          const targetAbs = join(parentAbs, TARGET_NAME);
          const relativeDir = `${target.areaRoot}/${TARGET_NAME}`;

          const ancestorSafety = await checkAncestors(fs, root, target.areaRoot);
          if (ancestorSafety.status === 'symlink') return { status: 'unavailable', reason: 'symlink', message: `A symlink blocks the path to "${relativeDir}"` };
          if (ancestorSafety.status === 'invalid-path') return { status: 'unavailable', reason: 'invalid-path', message: ancestorSafety.message };

          // Recovery runs at the start of handling each target, before this
          // invocation reads its "existing" content, so a prior crash never
          // makes this call compare against a transient, half-switched state.
          await recoverSiblings(fs, parentAbs);

          const existing = await readExistingTarget(fs, targetAbs);
          if (existing.status === 'symlink') return { status: 'unavailable', reason: 'symlink', message: `"${relativeDir}" or one of its contents is a symlink` };
          if (existing.status === 'invalid-path') return { status: 'unavailable', reason: 'invalid-path', message: existing.message };
          const changed = existing.status === 'absent' || !sameContent(existing.files, target.rendered.files);

          prepared.push({
            module: target.module, area: target.area, relativeDir, parentAbs, targetAbs,
            tmpAbs: join(parentAbs, `.ramify.tmp-${suffix}`), oldAbs: join(parentAbs, `.ramify.old-${suffix}`),
            rendered: target.rendered, bytes: target.bytes, changed,
          });
        }

        for (const target of prepared) {
          if (target.bytes > limits.maxAreaBytes) {
            return { status: 'unavailable', reason: 'resource-limit', message: `"${target.relativeDir}" is ${target.bytes} bytes, over the ${limits.maxAreaBytes}-byte area limit` };
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
          module: target.module, area: target.area, path: target.relativeDir,
          files: target.rendered.files.length, entries: target.rendered.entries,
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
