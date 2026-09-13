import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, readFile, readdir, rename, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDaemonRecord, runtimeIdentityPath, selectEndpoint } from '../discovery.js';
import { processAlive, writeDaemonRecord } from '../records.js';
import { daemonRecord, deadPid, discoveryFixture, writeRuntimeIdentity } from './discovery-fixture.js';

const fixtures: Awaited<ReturnType<typeof discoveryFixture>>[] = [];
async function fixture() { const value = await discoveryFixture(); fixtures.push(value); return value; }
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); for (const value of fixtures.splice(0)) await value.dispose(); });

describe('endpoint selection', () => {
  it('hashes the real package path, version, manifest and sorted runtime bytes without importing them', async () => {
    const value = await fixture();
    const sha = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
    const files = [];
    for (const path of ['dist/src/daemon-entry.js', 'dist/subs/analysis/src/index.js']) {
      files.push([path, sha(await readFile(join(value.packageRoot, path)))]);
    }
    const identity = sha(JSON.stringify({ packageJson: sha(await readFile(join(value.packageRoot, 'package.json'))), files }));
    expect(value.endpoint.buildKey).toBe(sha(JSON.stringify([value.packageRoot, '1', identity])).slice(0, 16));
    expect((await stat(value.endpoint.directory)).mode & 0o777).toBe(0o700);
    await symlink(value.packageRoot, join(value.root, 'alias'));
    expect(await selectEndpoint({ ...value.options, packageRoot: join(value.root, 'alias') })).toEqual(value.endpoint);
    await writeFile(join(value.packageRoot, 'dist/subs/analysis/src/index.js'), 'export const changed = true;');
    expect((await selectEndpoint(value.options)).buildKey).not.toBe(value.endpoint.buildKey);
  });

  it('tracks runtime additions and removals while ignoring declarations and maps', async () => {
    const value = await fixture();
    await writeFile(join(value.packageRoot, 'dist/src/types.d.ts'), 'export interface T {}');
    await writeFile(join(value.packageRoot, 'dist/src/daemon-entry.js.map'), '{}');
    expect(await selectEndpoint(value.options)).toEqual(value.endpoint);
    const path = join(value.packageRoot, 'dist/src/helper.mjs');
    await writeFile(path, 'export const helper = 1;');
    expect((await selectEndpoint(value.options)).buildKey).not.toBe(value.endpoint.buildKey);
    await rm(path);
    expect(await selectEndpoint(value.options)).toEqual(value.endpoint);
  });

  it('requires JavaScript bin entries but leaves a native launcher bin out of the build identity', async () => {
    const value = await fixture();
    const manifest = JSON.parse(await readFile(join(value.packageRoot, 'package.json'), 'utf8'));
    await writeFile(join(value.packageRoot, 'package.json'), JSON.stringify({ ...manifest, bin: { ramify: 'dist/src/ramify' } }));
    const launcher = await selectEndpoint(value.options);
    await writeFile(join(value.packageRoot, 'dist/src/ramify'), '#!/bin/sh\n');
    expect(await selectEndpoint(value.options)).toEqual(launcher);
    await writeFile(join(value.packageRoot, 'package.json'), JSON.stringify({ ...manifest, bin: { ramify: 'dist/src/cli-entry.js' } }));
    await expect(selectEndpoint(value.options)).rejects.toThrow('Missing or incomplete daemon build');
  });

  it('prefers the option, RAMIFY_ENDPOINT_DIR, XDG_RUNTIME_DIR/ramify, then the user temporary directory', async () => {
    // macOS's per-user TMPDIR can leave insufficient space for this nested
    // precedence fixture under the independently enforced 100-byte socket bound.
    const value = await discoveryFixture(undefined, '/tmp');
    fixtures.push(value);
    const environmentDirectory = join(value.root, 'env');
    vi.stubEnv('RAMIFY_ENDPOINT_DIR', environmentDirectory);
    vi.stubEnv('XDG_RUNTIME_DIR', join(value.root, 'xdg'));
    expect((await selectEndpoint(value.options)).directory).toBe(value.endpoint.directory);
    const { endpointDirectory: _, ...options } = value.options;
    expect((await selectEndpoint(options)).directory).toBe(environmentDirectory);
    vi.stubEnv('RAMIFY_ENDPOINT_DIR', undefined);
    expect((await selectEndpoint(options)).directory).toBe(join(value.root, 'xdg/ramify'));
    vi.stubEnv('XDG_RUNTIME_DIR', undefined);
    vi.stubEnv('TMPDIR', join(value.root, 'tmp'));
    expect((await selectEndpoint(options)).directory).toBe(join(value.root, `tmp/ramify-${process.getuid!()}`));
  });

  it('rejects unsafe directory modes, foreign ownership and symlink directories', async () => {
    const value = await fixture();
    await chmod(value.endpoint.directory, 0o755);
    await expect(selectEndpoint(value.options)).rejects.toThrow('Unsafe daemon endpoint');
    await chmod(value.endpoint.directory, 0o700);
    const uid = process.getuid!();
    vi.spyOn(process, 'getuid').mockReturnValue(uid + 1);
    await expect(selectEndpoint(value.options)).rejects.toThrow('Unsafe daemon endpoint');
    vi.restoreAllMocks();
    await symlink(value.endpoint.directory, join(value.root, 'link'));
    await expect(selectEndpoint({ ...value.options, endpointDirectory: join(value.root, 'link') })).rejects.toThrow('Unsafe daemon endpoint');
  });

  it('enforces socket bytes and names the short-directory override', async () => {
    const value = await fixture();
    const length = 100 - Buffer.byteLength(`${value.root}//daemon-${'0'.repeat(16)}.sock`);
    const boundary = await selectEndpoint({ ...value.options, endpointDirectory: join(value.root, 'x'.repeat(length)) });
    expect(Buffer.byteLength(boundary.socket)).toBe(100);
    await expect(selectEndpoint({ ...value.options, endpointDirectory: join(value.root, 'é'.repeat(40)) })).rejects.toThrow('RAMIFY_ENDPOINT_DIR');
    await expect(selectEndpoint({ ...value.options, endpointDirectory: '' })).rejects.toThrow('RAMIFY_ENDPOINT_DIR');
  });

  it('rejects missing entries, incomplete owner runtimes, build symlinks and a mismatched version', async () => {
    const value = await fixture();
    await expect(selectEndpoint({ ...value.options, version: '2' })).rejects.toThrow('version');
    const entry = join(value.packageRoot, 'dist/src/daemon-entry.js');
    await rename(entry, `${entry}.away`);
    await expect(selectEndpoint(value.options)).rejects.toThrow('incomplete');
    await rename(`${entry}.away`, entry);
    await symlink(entry, join(value.packageRoot, 'dist/src/link.js'));
    await expect(selectEndpoint(value.options)).rejects.toThrow('incomplete');
    await rm(join(value.packageRoot, 'dist/src/link.js'));
    await rm(join(value.packageRoot, 'dist/subs'), { recursive: true });
    await mkdir(join(value.packageRoot, 'dist/subs'));
    await expect(selectEndpoint(value.options)).rejects.toThrow('incomplete');
  });
});

describe('build-time runtime identity', () => {
  const sha = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
  const index = 'dist/subs/analysis/src/index.js';
  // npm pack stores every entry with this one modification time.
  const packed = new Date('1985-10-26T08:15:00Z');

  it('build-identity-read: selection reads the written identity and yields the key hashing yields', async () => {
    const value = await fixture();
    const identity = await writeRuntimeIdentity(value.packageRoot);
    expect(identity).toEqual({ schemaVersion: 'ramify.runtime-identity/1', buildIdentity: value.endpoint.buildIdentity,
      packageJson: sha(await readFile(join(value.packageRoot, 'package.json'))), client: null, files: [
        { path: 'dist/src/daemon-entry.js', sha256: sha(await readFile(join(value.packageRoot, 'dist/src/daemon-entry.js'))),
          bytes: (await stat(join(value.packageRoot, 'dist/src/daemon-entry.js'))).size },
        { path: index, sha256: sha(await readFile(join(value.packageRoot, index))), bytes: (await stat(join(value.packageRoot, index))).size }] });
    expect(await selectEndpoint(value.options)).toEqual(value.endpoint);
    // A same-size replacement no newer than the identity is not read: the recorded hash still derives the key.
    const original = await readFile(join(value.packageRoot, index), 'utf8');
    await writeFile(join(value.packageRoot, index), original.replace('engine', 'ENGINE'));
    await utimes(join(value.packageRoot, index), packed, packed);
    expect(await selectEndpoint(value.options)).toEqual(value.endpoint);
    await rm(join(value.packageRoot, runtimeIdentityPath));
    const hashed = await selectEndpoint(value.options);
    expect(hashed.buildKey).not.toBe(value.endpoint.buildKey);
    // A missing, malformed, inconsistent or linked identity falls back to hashing, never to the recorded hashes.
    const text = `${JSON.stringify(identity)}\n`;
    for (const bad of ['{', text.replace('ramify.runtime-identity/1', 'ramify.runtime-identity/2'),
      JSON.stringify({ ...identity, buildIdentity: sha('other') }), JSON.stringify({ ...identity, files: [...identity.files].reverse() }),
      JSON.stringify({ ...identity, extra: true }), JSON.stringify({ ...identity, files: [{ ...identity.files[0], bytes: -1 }, identity.files[1]] })]) {
      await writeFile(join(value.packageRoot, runtimeIdentityPath), bad);
      expect(await selectEndpoint(value.options), bad.slice(0, 40)).toEqual(hashed);
    }
    await writeFile(join(value.root, 'identity.json'), text);
    await rm(join(value.packageRoot, runtimeIdentityPath));
    await symlink(join(value.root, 'identity.json'), join(value.packageRoot, runtimeIdentityPath));
    expect(await selectEndpoint(value.options)).toEqual(hashed);
  });

  it('mixed-build-detected: a changed, missing or added runtime file after the build fails selection', async () => {
    const value = await fixture();
    const helper = join(value.packageRoot, 'dist/subs/analysis/src/helper.js');
    await writeFile(helper, 'export const helper = 1;');
    await writeRuntimeIdentity(value.packageRoot);
    const built = await selectEndpoint(value.options);
    const path = join(value.packageRoot, index), original = await readFile(path, 'utf8');
    await writeFile(path, `${original}\n`);
    await expect(selectEndpoint(value.options)).rejects.toThrow(`Mixed daemon build in ${value.packageRoot}: ${index} differs`);
    // The same size, modified after the identity was written: undecided by size, so hashed.
    await writeFile(path, original.replace('engine', 'ENGINE'));
    await expect(selectEndpoint(value.options)).rejects.toThrow(`${index} differs`);
    await writeFile(path, original);
    expect(await selectEndpoint(value.options)).toEqual(built);
    await rm(helper);
    await expect(selectEndpoint(value.options)).rejects.toThrow('dist/subs/analysis/src/helper.js is listed in dist/runtime-identity.json but absent');
    await writeFile(helper, 'export const helper = 1;');
    await writeFile(join(value.packageRoot, 'dist/src/extra.mjs'), 'export {};');
    await expect(selectEndpoint(value.options)).rejects.toThrow('dist/src/extra.mjs is not listed in dist/runtime-identity.json');
    await rm(join(value.packageRoot, 'dist/src/extra.mjs'));
    expect(await selectEndpoint(value.options)).toEqual(built);
    // Declarations, maps and the identity itself are not runtime files.
    await writeFile(join(value.packageRoot, 'dist/src/types.d.ts'), 'export interface T {}');
    expect(await selectEndpoint(value.options)).toEqual(built);
    // Required entries are still enforced before the identity is consulted.
    await rename(join(value.packageRoot, 'dist/src/daemon-entry.js'), join(value.root, 'entry.js'));
    await expect(selectEndpoint(value.options)).rejects.toThrow('Missing or incomplete daemon build');
  });

  it('installed-identity: a copy without build modification times derives the hashing key and still detects changes', async () => {
    const value = await fixture();
    const identity = await writeRuntimeIdentity(value.packageRoot);
    const installed = join(value.root, 'installed');
    await cp(value.packageRoot, installed, { recursive: true });
    const files = ['package.json', runtimeIdentityPath, ...identity.files.map(file => file.path)];
    const options = { ...value.options, packageRoot: installed };
    const key = sha(JSON.stringify([installed, '1', value.endpoint.buildIdentity])).slice(0, 16);
    // Packed: every entry has one fixed time.
    for (const path of files) await utimes(join(installed, path), packed, packed);
    const selected = await selectEndpoint(options);
    expect([selected.buildIdentity, selected.buildKey]).toEqual([value.endpoint.buildIdentity, key]);
    // Copied in an order that leaves the identity older than runtime files: those files are hashed and still agree.
    await utimes(join(installed, runtimeIdentityPath), new Date(0), new Date(0));
    expect(await selectEndpoint(options)).toEqual(selected);
    await rm(join(installed, runtimeIdentityPath));
    expect(await selectEndpoint(options)).toEqual(selected);
    await cp(join(value.packageRoot, runtimeIdentityPath), join(installed, runtimeIdentityPath));
    for (const path of files) await utimes(join(installed, path), packed, packed);
    const original = await readFile(join(installed, index), 'utf8');
    await writeFile(join(installed, index), original.replace('engine', 'ENGINE'));
    await expect(selectEndpoint(options)).rejects.toThrow(`Mixed daemon build in ${installed}: ${index} differs`);
    await writeFile(join(installed, index), `${original};`);
    await utimes(join(installed, index), packed, packed);
    await expect(selectEndpoint(options)).rejects.toThrow(`${index} differs`);
  });
});

describe('daemon records', () => {
  it('distinguishes absence and atomically preserves every lifecycle disposition', async () => {
    const { endpoint } = await fixture();
    expect(await readDaemonRecord(endpoint)).toBeNull();
    for (const reason of ['idle', 'explicit', 'retired', 'failed'] as const) {
      const record = daemonRecord(endpoint, { state: 'stopped', stopped: { at: 200, reason, requestId: 'stop-1' } });
      await writeDaemonRecord(endpoint, record);
      const read = await readDaemonRecord(endpoint);
      expect(read).toEqual(record);
      expect(Object.isFrozen(read)).toBe(true);
      expect(Object.isFrozen(read!.stopped)).toBe(true);
    }
    expect((await stat(endpoint.record)).mode & 0o777).toBe(0o600);
    expect(await readdir(endpoint.directory)).toEqual([endpoint.record.split('/').at(-1)]);
  });

  it('readers see only whole old or new records during repeated replacements', async () => {
    const { endpoint } = await fixture();
    await writeDaemonRecord(endpoint, daemonRecord(endpoint));
    let finished = false, reads = 0;
    const writer = (async () => {
      try { for (let n = 0; n < 30; n++) await writeDaemonRecord(endpoint, daemonRecord(endpoint, { instanceId: String(n) })); }
      finally { finished = true; }
    })();
    await Promise.all([writer, (async () => {
      while (!finished) { expect((await readDaemonRecord(endpoint))?.state).toBe('running'); reads++; }
    })()]);
    expect(reads).toBeGreaterThan(0);
    expect((await readDaemonRecord(endpoint))?.instanceId).toBe('29');
  });

  it('rejects malformed, foreign, inconsistent, oversized and invalid UTF-8 records', async () => {
    const { endpoint } = await fixture();
    const valid = daemonRecord(endpoint);
    for (const bad of ['{', JSON.stringify({ ...valid, pid: -1 }), JSON.stringify({ ...valid, extra: true }),
      JSON.stringify({ ...valid, socket: '/foreign' }), JSON.stringify({ ...valid, state: 'stopped' }),
      ' '.repeat(65_537), Buffer.from([0xff])]) {
      await writeFile(endpoint.record, bad, { mode: 0o600 });
      await expect(readDaemonRecord(endpoint)).rejects.toThrow();
    }
    await expect(writeDaemonRecord(endpoint, { ...valid, stopped: { at: 200, reason: 'idle', requestId: null } })).rejects.toThrow();
  });

  it('rechecks directory permissions and rejects symlinked control files and forged selections', async () => {
    const { endpoint, root } = await fixture();
    await writeFile(join(root, 'other'), '{}', { mode: 0o600 });
    await symlink(join(root, 'other'), endpoint.record);
    await expect(readDaemonRecord(endpoint)).rejects.toThrow();
    await expect(readDaemonRecord({ ...endpoint, record: join(root, 'other') })).rejects.toThrow('Invalid daemon endpoint');
    await chmod(endpoint.directory, 0o755);
    await expect(writeDaemonRecord(endpoint, daemonRecord(endpoint))).rejects.toThrow('Unsafe daemon endpoint');
  });

  it('only ESRCH proves a dead pid; ambiguous permission failures remain errors', async () => {
    expect(processAlive(process.pid)).toBe(true);
    expect(processAlive(await deadPid())).toBe(false);
    expect(() => processAlive(0)).toThrow('Invalid daemon pid');
    vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); });
    expect(() => processAlive(123)).toThrow('Cannot establish liveness');
  });
});
