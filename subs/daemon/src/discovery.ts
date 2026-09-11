import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';
import type { DaemonRecord, EndpointSelection } from './interfaces/daemon.js';
import { readRecord, verifyDirectory, verifyEndpoint } from './records.js';

function sha256(bytes: string | Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

async function runtimeFiles(root: string, directory: string): Promise<string[]> {
  if (!(await lstat(join(root, directory))).isDirectory()) throw new Error(`Invalid build directory: ${directory}`);
  const result: string[] = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = posix.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await runtimeFiles(root, path));
    else if (!entry.isFile()) throw new Error(`Unexpected build artifact: ${path}`);
    else if (/\.(?:js|mjs)$/.test(entry.name)) result.push(path);
  }
  return result;
}

function runtimeEntries(value: unknown, result: string[] = []): string[] {
  if (typeof value === 'string') result.push(value.replace(/^\.\//, ''));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) if (key !== 'types') runtimeEntries(item, result);
  }
  return result;
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
  try {
    paths = [...await runtimeFiles(root, 'dist/src'), ...await runtimeFiles(root, 'dist/subs')]
      .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    const required = ['dist/src/daemon-entry.js', ...runtimeEntries(manifest.exports),
      ...runtimeEntries(manifest.main), ...runtimeEntries(manifest.bin)];
    if (required.some(path => !paths.includes(path)) || !paths.some(path => path.startsWith('dist/subs/'))) {
      throw new Error('Missing production entry or owner runtime');
    }
  } catch (error) { throw new Error(`Missing or incomplete daemon build in ${root}`, { cause: error }); }
  const files: [string, string][] = [];
  for (const path of paths) files.push([path, sha256(await readFile(join(root, path)))]);
  const buildIdentity = sha256(JSON.stringify({ packageJson: sha256(manifestBytes), files }));
  const buildKey = sha256(JSON.stringify([root, options.version, buildIdentity])).slice(0, 16);
  const prefix = join(directory, `daemon-${buildKey}`);
  const endpoint = Object.freeze({ directory, buildKey, socket: `${prefix}.sock`, record: `${prefix}.json`,
    lock: `${prefix}.lock`, log: `${prefix}.log` });
  await verifyEndpoint(endpoint);
  return endpoint;
}

export async function readDaemonRecord(endpoint: EndpointSelection): Promise<DaemonRecord | null> {
  return readRecord(endpoint);
}
