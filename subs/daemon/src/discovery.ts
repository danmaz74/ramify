import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';
import type { DaemonRecord, EndpointSelection } from './interfaces/daemon.js';
import { readRecord, verifyDirectory, verifyEndpoint } from './records.js';

function sha256(bytes: string | Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
const byteOrder = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** The build-time runtime identity, written beside the runtime files it describes. */
export const runtimeIdentityPath: string = 'dist/runtime-identity.json';
const maximumIdentityBytes = 4 * 1024 ** 2;
const digest = /^[0-9a-f]{64}$/;

export interface RuntimeIdentity {
  readonly schemaVersion: 'ramify.runtime-identity/1';
  /** Derived from `packageJson` and the files' paths and hashes, exactly as selection derives it by hashing. */
  readonly buildIdentity: string;
  readonly packageJson: string;
  readonly files: readonly { readonly path: string; readonly sha256: string; readonly bytes: number }[];
  /** The compiled client's hash, for tooling; no client reads it. Null before the client is compiled. */
  readonly client: { readonly path: string; readonly sha256: string } | null;
}

/** `dist` is the build directory, which need not be named dist yet; paths keep the `dist/` prefix.
 * Directories are read concurrently, and the result is unordered. */
async function runtimeFiles(dist: string, directory: string, top = true): Promise<string[]> {
  if (top && !(await lstat(join(dist, directory))).isDirectory()) throw new Error(`Invalid build directory: dist/${directory}`);
  const entries = await readdir(join(dist, directory), { withFileTypes: true });
  return (await Promise.all(entries.map(async entry => {
    const path = posix.join(directory, entry.name);
    if (entry.isDirectory()) return runtimeFiles(dist, path, false);
    if (!entry.isFile()) throw new Error(`Unexpected build artifact: dist/${path}`);
    return /\.(?:js|mjs)$/.test(entry.name) ? [`dist/${path}`] : [];
  }))).flat();
}

function runtimeEntries(value: unknown, result: string[] = []): string[] {
  if (typeof value === 'string') result.push(value.replace(/^\.\//, ''));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) if (key !== 'types') runtimeEntries(item, result);
  }
  return result;
}

/** Unordered runtime paths of a complete build. */
async function runtimePaths(dist: string, manifest: Record<string, unknown>): Promise<string[]> {
  const paths = (await Promise.all([runtimeFiles(dist, 'src'), runtimeFiles(dist, 'subs')])).flat();
  // The bin may be a native launcher beside the Node entry; only JavaScript entries join the build identity.
  const required = ['dist/src/daemon-entry.js', ...runtimeEntries(manifest.exports),
    ...runtimeEntries(manifest.main), ...runtimeEntries(manifest.bin)].filter(path => /\.(?:js|mjs)$/.test(path));
  if (required.some(path => !paths.includes(path)) || !paths.some(path => path.startsWith('dist/subs/'))) {
    throw new Error('Missing production entry or owner runtime');
  }
  return paths;
}

function deriveIdentity(packageJson: string, files: readonly (readonly [string, string])[]): string {
  return sha256(JSON.stringify({ packageJson, files }));
}

/** Describe the runtime files of a build directory that is or becomes `dist`, for the build to write. */
export async function describeRuntime(dist: string, manifestBytes: Uint8Array): Promise<RuntimeIdentity> {
  const paths = await runtimePaths(dist, JSON.parse(Buffer.from(manifestBytes).toString('utf8')));
  const files: RuntimeIdentity['files'][number][] = [];
  for (const path of paths.sort(byteOrder)) {
    const bytes = await readFile(join(dist, path.slice('dist/'.length)));
    files.push({ path, sha256: sha256(bytes), bytes: bytes.length });
  }
  const packageJson = sha256(manifestBytes);
  const buildIdentity = deriveIdentity(packageJson, files.map(file => [file.path, file.sha256]));
  return { schemaVersion: 'ramify.runtime-identity/1', buildIdentity, packageJson, files, client: null };
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validIdentity(value: unknown): value is RuntimeIdentity {
  if (!exactKeys(value, ['schemaVersion', 'buildIdentity', 'packageJson', 'files', 'client'])
    || value.schemaVersion !== 'ramify.runtime-identity/1' || typeof value.buildIdentity !== 'string'
    || typeof value.packageJson !== 'string' || !digest.test(value.packageJson) || !Array.isArray(value.files)) return false;
  if (!(value.client === null || exactKeys(value.client, ['path', 'sha256'])
    && typeof value.client.path === 'string' && typeof value.client.sha256 === 'string' && digest.test(value.client.sha256))) return false;
  let previous: string | undefined;
  for (const file of value.files as unknown[]) {
    if (!exactKeys(file, ['path', 'sha256', 'bytes']) || typeof file.path !== 'string' || !/^dist\/(?:src|subs)\/.*\.(?:js|mjs)$/.test(file.path)
      || typeof file.sha256 !== 'string' || !digest.test(file.sha256) || !Number.isSafeInteger(file.bytes) || (file.bytes as number) < 0
      || previous !== undefined && byteOrder(previous, file.path) >= 0) return false;
    previous = file.path;
  }
  const files = (value.files as RuntimeIdentity['files']).map(file => [file.path, file.sha256] as const);
  return value.buildIdentity === deriveIdentity(value.packageJson, files);
}

/** A missing, unreadable or malformed identity yields null, and selection hashes every runtime file. */
async function recordedIdentity(root: string): Promise<{ readonly identity: RuntimeIdentity; readonly writtenMs: number } | null> {
  try {
    const info = await lstat(join(root, runtimeIdentityPath));
    if (!info.isFile() || info.size > maximumIdentityBytes) return null;
    const value: unknown = JSON.parse(await readFile(join(root, runtimeIdentityPath), 'utf8'));
    return validIdentity(value) ? { identity: value, writtenMs: info.mtimeMs } : null;
  } catch { return null; }
}

async function hashedFiles(root: string, paths: readonly string[]): Promise<[string, string][]> {
  const files: [string, string][] = [];
  for (const path of [...paths].sort(byteOrder)) files.push([path, sha256(await readFile(join(root, path)))]);
  return files;
}

/** Mixed-build check without reading every file. The listed paths must equal the runtime files and
 * each size must equal its recorded size. Sizes and paths decide most mixtures; a file modified after
 * the identity was written cannot be decided that way and is hashed. Packing and installing may
 * reset every modification time to one value, which still leaves no file newer than the identity. */
async function verifiedFiles(root: string, paths: readonly string[],
  recorded: { readonly identity: RuntimeIdentity; readonly writtenMs: number }): Promise<(readonly [string, string])[]> {
  const mixed = (detail: string): Error => new Error(`Mixed daemon build in ${root}: ${detail}; rebuild the package`);
  const { files } = recorded.identity;
  const listed = new Set(files.map(file => file.path)), present = new Set(paths);
  const added = paths.find(path => !listed.has(path));
  if (added !== undefined) throw mixed(`${added} is not listed in ${runtimeIdentityPath}`);
  const missing = files.find(file => !present.has(file.path));
  if (missing) throw mixed(`${missing.path} is listed in ${runtimeIdentityPath} but absent`);
  const infos = await Promise.all(files.map(file => lstat(join(root, file.path))));
  for (const [index, file] of files.entries()) {
    const info = infos[index]!;
    if (info.size !== file.bytes) throw mixed(`${file.path} differs from ${runtimeIdentityPath}`);
    if (info.mtimeMs > recorded.writtenMs && sha256(await readFile(join(root, file.path))) !== file.sha256) {
      throw mixed(`${file.path} differs from ${runtimeIdentityPath}`);
    }
  }
  return files.map(file => [file.path, file.sha256] as const);
}

export async function selectEndpoint(options: { readonly packageRoot: string; readonly version: string;
  readonly endpointDirectory?: string }): Promise<EndpointSelection> {
  const selected = options.endpointDirectory ?? process.env.RAMIFY_ENDPOINT_DIR
    ?? (process.env.XDG_RUNTIME_DIR ? join(process.env.XDG_RUNTIME_DIR, 'ramify') : join(tmpdir(), `ramify-${process.getuid?.()}`));
  if (!selected) throw new Error('RAMIFY_ENDPOINT_DIR must name a directory');
  const directory = resolve(selected);
  // Bound the path before creating anything or hashing a build.
  if (Buffer.byteLength(join(directory, `daemon-${'0'.repeat(16)}.sock`)) > 100) {
    throw new Error('Daemon socket path exceeds 100 bytes; choose a shorter RAMIFY_ENDPOINT_DIR');
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await verifyDirectory(directory);
  const root = await realpath(options.packageRoot);
  const manifestBytes = await readFile(join(root, 'package.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (!options.version || manifest.version !== options.version) throw new Error('Package version differs from endpoint selection');
  let paths: string[];
  try { paths = await runtimePaths(join(root, 'dist'), manifest); }
  catch (error) { throw new Error(`Missing or incomplete daemon build in ${root}`, { cause: error }); }
  const recorded = await recordedIdentity(root);
  const files = recorded ? await verifiedFiles(root, paths, recorded) : await hashedFiles(root, paths);
  const buildIdentity = deriveIdentity(sha256(manifestBytes), files);
  const buildKey = sha256(JSON.stringify([root, options.version, buildIdentity])).slice(0, 16);
  const prefix = join(directory, `daemon-${buildKey}`);
  const endpoint = Object.freeze({ directory, buildIdentity, buildKey, socket: `${prefix}.sock`, record: `${prefix}.json`,
    lock: `${prefix}.lock`, log: `${prefix}.log` });
  await verifyEndpoint(endpoint);
  return endpoint;
}

export async function readDaemonRecord(endpoint: EndpointSelection): Promise<DaemonRecord | null> {
  return readRecord(endpoint);
}
