import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDaemonRecord, selectEndpoint } from '../discovery.js';
import { processAlive, writeDaemonRecord } from '../records.js';
import { daemonRecord, deadPid, discoveryFixture } from './discovery-fixture.js';

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

  it('prefers the option, RAMIFY_ENDPOINT_DIR, XDG_RUNTIME_DIR/ramify, then the user temporary directory', async () => {
    const value = await fixture();
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
