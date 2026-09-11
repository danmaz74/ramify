import { readFile, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { launchDaemon } from '../launcher.js';
import { processAlive, writeDaemonRecord } from '../records.js';
import { daemonRecord, deadPid, discoveryFixture, fakeEntry } from './discovery-fixture.js';

const fixtures: Awaited<ReturnType<typeof discoveryFixture>>[] = [];
async function fixture(entry = fakeEntry) { const value = await discoveryFixture(entry); fixtures.push(value); return value; }
afterEach(async () => { for (const value of fixtures.splice(0)) await value.dispose(); });

async function waitForPid(recordPath: string): Promise<number> {
  const deadline = performance.now() + 3000;
  while (true) {
    try {
      const pid = Number(await readFile(recordPath.replace(/\.json$/, '.pid'), 'utf8'));
      if (Number.isSafeInteger(pid) && pid > 0) return pid;
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || performance.now() >= deadline) throw error; }
    if (performance.now() >= deadline) throw new Error('Fake entry did not publish its pid');
    await new Promise(done => setTimeout(done, 10));
  }
}

describe('private coordinated launcher with a fake entry', () => {
  it('serializes eight contenders and supplies the reviewed arguments to one detached child', async () => {
    const value = await fixture();
    const results = await Promise.all(Array.from({ length: 8 }, () => launchDaemon(value.launch)));
    expect(results.filter(result => result.started)).toHaveLength(1);
    expect(new Set(results.map(result => result.record.pid)).size).toBe(1);
    expect(results[0].record).toMatchObject({ buildKey: value.endpoint.buildKey, engine: 'fake-engine', version: '1' });
    expect((await readFile(value.endpoint.record.replace(/\.json$/, '.launches'), 'utf8')).trim().split('\n')).toHaveLength(1);
    await expect(readFile(value.endpoint.lock)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reclaims only a proven dead holder before removing a stale record and socket', async () => {
    const value = await fixture(), pid = await deadPid();
    await writeFile(value.endpoint.lock, JSON.stringify({ pid, at: Date.now() - 31_000 }), { mode: 0o600 });
    await writeDaemonRecord(value.endpoint, daemonRecord(value.endpoint, { pid }));
    await writeFile(value.endpoint.socket, 'stale socket');
    const results = await Promise.all(Array.from({ length: 8 }, () => launchDaemon(value.launch)));
    expect(results.filter(result => result.started)).toHaveLength(1);
    expect(results[0].record.pid).not.toBe(pid);
    await expect(readFile(`${value.endpoint.lock}.reclaim`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not reclaim an old live holder', async () => {
    const value = await fixture();
    const content = JSON.stringify({ pid: process.pid, at: 0 });
    await writeFile(value.endpoint.lock, content, { mode: 0o600 });
    await expect(launchDaemon({ ...value.launch, startupMs: 100 })).rejects.toThrow('timed out');
    expect(await readFile(value.endpoint.lock, 'utf8')).toBe(content);
    await expect(readFile(value.endpoint.log)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('leaves malformed locks intact and does not spawn', async () => {
    const value = await fixture();
    await writeFile(value.endpoint.lock, '{}', { mode: 0o600 });
    await expect(launchDaemon(value.launch)).rejects.toThrow('Malformed daemon start lock');
    expect(await readFile(value.endpoint.lock, 'utf8')).toBe('{}');
    await expect(readFile(value.endpoint.log)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reports malformed legacy guard ownership without removing its lock', async () => {
    const value = await fixture();
    const content = JSON.stringify({ pid: await deadPid(), at: 0 });
    await writeFile(value.endpoint.lock, content, { mode: 0o600 });
    await writeFile(`${value.endpoint.lock}.reclaim`, 'interrupted reclamation', { mode: 0o600 });
    await expect(launchDaemon({ ...value.launch, startupMs: 100 })).rejects.toThrow();
    expect(await readFile(value.endpoint.lock, 'utf8')).toBe(content);
  });

  it('never removes a refused socket or record while its pid is alive', async () => {
    const value = await fixture();
    await writeDaemonRecord(value.endpoint, daemonRecord(value.endpoint));
    await writeFile(value.endpoint.socket, 'occupied');
    const before = await readFile(value.endpoint.record, 'utf8');
    await expect(launchDaemon({ ...value.launch, startupMs: 100 })).rejects.toThrow('timed out');
    expect(await readFile(value.endpoint.record, 'utf8')).toBe(before);
    expect(await readFile(value.endpoint.socket, 'utf8')).toBe('occupied');
  });

  it('reports an entry exit and releases its start lock', async () => {
    const value = await fixture(fakeEntry.slice(0, fakeEntry.indexOf('const server')) + 'process.exit(23);');
    await expect(launchDaemon(value.launch)).rejects.toThrow('exited before readiness (23)');
    await expect(readFile(value.endpoint.lock)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('aborts a wait without killing the child or permitting another startup', async () => {
    const value = await fixture(fakeEntry.slice(0, fakeEntry.indexOf('const server')) + 'setInterval(() => {}, 1000);');
    const control = new AbortController();
    const result = launchDaemon({ ...value.launch, signal: control.signal }).catch(error => error);
    const pid = await waitForPid(value.endpoint.record);
    const interruption = new Error('cancel startup');
    control.abort(interruption);
    expect(await result).toBe(interruption);
    expect(processAlive(pid)).toBe(true);
    expect(JSON.parse(await readFile(value.endpoint.lock, 'utf8')).pid).toBe(pid);
    await expect(launchDaemon({ ...value.launch, startupMs: 100 })).rejects.toThrow('timed out');
    expect((await readFile(value.endpoint.record.replace(/\.json$/, '.launches'), 'utf8')).trim().split('\n')).toHaveLength(1);
  });

  it('aborts before acquiring a lock and rejects unsafe or invalid startup options', async () => {
    const value = await fixture();
    const control = new AbortController(); control.abort(new Error('already aborted'));
    await expect(launchDaemon({ ...value.launch, signal: control.signal })).rejects.toThrow('already aborted');
    await expect(readFile(value.endpoint.lock)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(launchDaemon({ ...value.launch, startupMs: Infinity })).rejects.toThrow('Invalid daemon launch');
    await expect(launchDaemon({ ...value.launch, daemonEntry: './relative.js' })).rejects.toThrow('Invalid daemon launch');
  });
});


describe('startup crash recovery regressions', () => {
  it('terminates its own timed-out unready child before releasing the start lock', async () => {
    const value = await fixture(fakeEntry.slice(0, fakeEntry.indexOf('const server')) + 'setInterval(() => {}, 1000);');
    const result = launchDaemon({ ...value.launch, startupMs: 300 }).catch(error => error);
    const pid = await waitForPid(value.endpoint.record);
    expect(await result).toHaveProperty('message', 'Daemon startup timed out');
    expect(processAlive(pid)).toBe(false);
    await expect(readFile(value.endpoint.lock)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('serializes reclamation of a dead legacy guard and dead lock among eight contenders', async () => {
    const value = await fixture();
    const content = JSON.stringify({ pid: await deadPid(), at: 0 });
    await writeFile(value.endpoint.lock, content, { mode: 0o600 });
    await writeFile(`${value.endpoint.lock}.reclaim`, content, { mode: 0o600 });
    const results = await Promise.all(Array.from({ length: 8 }, () => launchDaemon(value.launch)));
    expect(results.filter(result => result.started)).toHaveLength(1);
    expect(new Set(results.map(result => result.record.pid)).size).toBe(1);
    await expect(readFile(`${value.endpoint.lock}.reclaim`)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reports an ambiguous legacy empty lock immediately instead of retrying to timeout', async () => {
    const value = await fixture();
    await writeFile(value.endpoint.lock, '', { mode: 0o600 });
    await expect(launchDaemon(value.launch)).rejects.toThrow('Empty legacy daemon start lock');
    expect(await readFile(value.endpoint.lock, 'utf8')).toBe('');
  });
});
