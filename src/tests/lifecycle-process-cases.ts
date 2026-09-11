import assert from 'node:assert/strict';
import { appendFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { processAlive, withProcessScope } from './lifecycle-process.js';
import type { ProcessScope } from './lifecycle-process.js';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const fixture = fileURLToPath(new URL('./lifecycle-process-fixture.mjs', import.meta.url));
const start = (scope: ProcessScope, mode: string) => scope.start({ cwd, args: [fixture, mode], timeoutMs: 10_000 });
const removed = (path: string) => assert.rejects(stat(path), { code: 'ENOENT' });
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** The direct smoke and Vitest wrappers run these same process assertions.
 * They prove fixture control/cleanup, never a resident acceptance instance. */
export const lifecycleProcessCases: readonly { readonly name: string; readonly run: () => Promise<void> }[] = [
  { name: 'suspends and resumes input, traces concurrent socket peers, and interrupts cleanly', run: async () => {
    let endpoint = '';
    const pids: number[] = [];
    await withProcessScope(async scope => {
      endpoint = scope.endpointDirectory;
      assert.equal((await stat(endpoint)).mode & 0o777, 0o700);
      const child = start(scope, 'io'); pids.push(child.pid);
      await child.waitForOutput('ready\n', 3000);
      const peer = start(scope, 'peer'); pids.push(peer.pid);
      const peerExit = await peer.waitForExit(3000);
      assert.deepEqual([peerExit.code, peerExit.signal, peer.stdout, peer.stderr], [0, null, 'fixture-only', '']);
      child.signal('SIGSTOP');
      await child.send('after-stop\n');
      await pause(150);
      assert.equal(child.stdout.includes('received:after-stop'), false);
      assert.equal(child.exit, null);
      child.signal('SIGCONT');
      await child.waitForOutput('received:after-stop\n', 3000);
      child.signal('SIGINT');
      const exit = await child.waitForExit(3000);
      assert.deepEqual([exit.code, exit.signal, child.stderr], [130, null, '']);
      const events = await scope.events();
      assert.ok(events.some(event => event.pid === child.pid && event.event === 'listen' && event.path === join(endpoint, 'p.sock')));
      assert.ok(events.some(event => event.pid === peer.pid && event.event === 'connect' && event.path === join(endpoint, 'p.sock')));
      assert.ok(events.some(event => event.pid === child.pid && event.event === 'exit' && event.code === 130));
      await removed(join(endpoint, 'p.sock'));
    });
    await removed(endpoint);
    assert.ok(pids.every(pid => !processAlive(pid)));
  } },
  { name: 'records abrupt SIGKILL without inventing a graceful exit', run: async () => {
    let endpoint = '', pid = 0;
    await withProcessScope(async scope => {
      endpoint = scope.endpointDirectory;
      const child = start(scope, 'io'); pid = child.pid;
      await child.waitForOutput('ready\n', 3000);
      child.signal('SIGKILL');
      const exit = await child.waitForExit(3000);
      assert.deepEqual([exit.code, exit.signal], [null, 'SIGKILL']);
      const events = await scope.events();
      assert.ok(events.some(event => event.pid === pid && event.event === 'start'));
      assert.equal(events.some(event => event.pid === pid && event.event === 'exit'), false);
      assert.equal(processAlive(pid), false);
    });
    await removed(endpoint);
  } },
  { name: 'traces and reaps a detached descendant on orderly interruption', run: async () => {
    await withProcessScope(async scope => {
      const child = start(scope, 'family');
      await child.waitForOutput('leaf-ready\n', 3000);
      const spawned = (await scope.events()).find(event => event.pid === child.pid && event.event === 'spawn')?.child;
      assert.ok(spawned && processAlive(spawned));
      child.signal('SIGINT');
      assert.equal((await child.waitForExit(3000)).code, 130);
      assert.equal(processAlive(spawned), false);
      assert.ok((await scope.events()).some(event => event.event === 'child-close' && event.child === spawned));
    });
  } },
  { name: 'preserves callback failures while cleaning suspended parents and detached grandchildren', run: async () => {
    const failure = new Error('deliberate process-fixture failure');
    let endpoint = '';
    const pids: number[] = [];
    await assert.rejects(withProcessScope(async scope => {
      endpoint = scope.endpointDirectory;
      const child = start(scope, 'nested'); pids.push(child.pid);
      await child.waitForOutput('leaf-ready\n', 3000);
      const descendants = (await scope.events()).filter(event => event.event === 'spawn').map(event => event.child!);
      assert.equal(descendants.length, 2); pids.push(...descendants);
      process.kill(descendants[0], 'SIGSTOP');
      child.signal('SIGSTOP');
      throw failure;
    }), error => error === failure);
    assert.ok(pids.every(pid => !processAlive(pid)));
    await removed(endpoint);
  } },
  { name: 'fails a successful callback that leaks a process family, even after killing it', run: async () => {
    let endpoint = '';
    const pids: number[] = [];
    await assert.rejects(withProcessScope(async scope => {
      endpoint = scope.endpointDirectory;
      const child = start(scope, 'family'); pids.push(child.pid);
      await child.waitForOutput('leaf-ready\n', 3000);
      const spawned = (await scope.events()).find(event => event.event === 'spawn')?.child;
      assert.ok(spawned); pids.push(spawned);
    }), error => error instanceof AggregateError && error.errors.some(cause => /leaked pids/.test(String(cause))));
    assert.ok(pids.every(pid => !processAlive(pid)));
    await removed(endpoint);
  } },
  { name: 'retains descendant cleanup identities when trace evidence is malformed', run: async () => {
    let endpoint = '';
    const pids: number[] = [];
    await assert.rejects(withProcessScope(async scope => {
      endpoint = scope.endpointDirectory;
      await appendFile(join(endpoint, 'trace.jsonl'), 'malformed\n');
      const child = start(scope, 'family'); pids.push(child.pid);
      await child.waitForOutput('leaf-ready\n', 3000);
      // Read identities independently because the public trace reader must fail.
      await assert.rejects(scope.events(), /Malformed process trace/);
      const lines = (await readFile(join(endpoint, 'trace.jsonl'), 'utf8')).split('\n');
      const spawned = lines.filter(line => line.startsWith('{')).map(line => JSON.parse(line) as { event: string; child?: number })
        .find(event => event.event === 'spawn')?.child;
      assert.ok(spawned); pids.push(spawned);
    }), error => error instanceof AggregateError
      && error.errors.some(cause => /Malformed process trace/.test(String(cause)))
      && error.errors.every(cause => /Malformed process trace|Process scope leaked pids/.test(String(cause))));
    assert.ok(pids.every(pid => !processAlive(pid)));
    await removed(endpoint);
  } },
  { name: 'bounds a missing output observation and cleans the running process', run: async () => {
    let endpoint = '', pid = 0;
    await assert.rejects(withProcessScope(async scope => {
      endpoint = scope.endpointDirectory;
      const child = start(scope, 'io'); pid = child.pid;
      await child.waitForOutput('ready\n', 3000);
      await child.waitForOutput('never-produced', 40);
    }), /never-produced.*exceeded 40 ms/);
    assert.equal(processAlive(pid), false);
    await removed(endpoint);
  } },
  { name: 'bounds the child lifetime even while the caller waits for exit', run: async () => {
    let endpoint = '', pid = 0;
    await assert.rejects(withProcessScope(async scope => {
      endpoint = scope.endpointDirectory;
      const child = scope.start({ cwd, args: [fixture, 'leaf'], timeoutMs: 200 }); pid = child.pid;
      await child.waitForExit(3000);
    }), error => error instanceof AggregateError && error.errors.some(cause => /exceeded 200 ms/.test(String(cause))));
    assert.equal(processAlive(pid), false);
    await removed(endpoint);
  } },
  { name: 'reports executable startup failure and removes its endpoint directory', run: async () => {
    let endpoint = '';
    await assert.rejects(withProcessScope(async scope => {
      endpoint = scope.endpointDirectory;
      const child = scope.start({ cwd, executable: join(endpoint, 'absent'), args: [], timeoutMs: 1000 });
      await child.waitForOutput('ready', 3000);
    }), error => error instanceof AggregateError && error.errors.some(cause => (cause as NodeJS.ErrnoException).code === 'ENOENT'));
    await removed(endpoint);
  } },
];
