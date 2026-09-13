import { execFile, spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { machine, tmpdir, type } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixture } from './fixture.js';
import { repositoryRoot } from './process.js';

// The compiled client is observed from outside: the Node process probe cannot load into it.
const launcher = join(repositoryRoot, 'dist/src/ramify');
const client = join(repositoryRoot, 'dist/src', `ramify-client-${type()}-${machine()}`);
const nodeEntry = join(repositoryRoot, 'dist/src/cli-entry.js');

interface Outcome { readonly code: number | null; readonly signal: NodeJS.Signals | null; readonly stdout: string; readonly stderr: string; readonly ms: number }
function run(command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv; brokenStdout?: boolean;
  timeoutMs?: number; onStarted?: (pid: number) => void }): Promise<Outcome> {
  return new Promise((accept, reject) => {
    const started = performance.now();
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${command} ${args.join(' ')} exceeded its deadline`)); }, options.timeoutMs ?? 30_000);
    if (options.brokenStdout) child.stdout.destroy(); else child.stdout.on('data', bytes => { stdout += String(bytes); });
    child.stderr.on('data', bytes => { stderr += String(bytes); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('spawn', () => options.onStarted?.(child.pid!));
    child.once('close', (code, signal) => { clearTimeout(timer); accept({ code, signal, stdout, stderr, ms: performance.now() - started }); });
  });
}
const withoutRunId = (text: string) => text.replace(/"runId":"[^"]+"/g, '"runId":"<run>"');
async function processesMentioning(text: string): Promise<string[]> {
  const { stdout } = await promisify(execFile)('ps', ['-eo', 'pid=,args=']);
  return stdout.split('\n').filter(line => line.includes(text) && !line.includes('ps -eo'));
}

let endpoint: string, env: NodeJS.ProcessEnv;
beforeAll(async () => {
  await access(client);
  // Socket paths are bounded to 100 bytes; keep the endpoint short on every platform.
  endpoint = await realpath(await mkdtemp('/tmp/rcc-'));
  env = { ...process.env, RAMIFY_ENDPOINT_DIR: endpoint, NODE_OPTIONS: '' };
});
afterAll(async () => {
  await run(process.execPath, [nodeEntry, 'daemon', 'stop'], { cwd: repositoryRoot, env });
  await rm(endpoint, { recursive: true, force: true });
});

describe('compiled client process contracts', () => {
  it('matches the Node entry for help, version and an invalid invocation', async () => {
    for (const args of [['--help'], ['--version'], ['bogus'], ['check', '--format', 'xml']]) {
      const [compiled, node] = [await run(launcher, args, { cwd: '/', env }), await run(process.execPath, [nodeEntry, ...args], { cwd: '/', env })];
      expect([compiled.code, compiled.stdout, compiled.stderr], args.join(' ')).toEqual([node.code, node.stdout, node.stderr]);
    }
    expect(await readdir(endpoint)).toEqual([]);
  }, 30_000);

  it('runs --batch in a Node child with the Node entry report bytes', async () => fixture(async root => {
    for (const format of [[], ['--format', 'json']]) {
      const args = ['check', '--batch', ...format];
      const [compiled, node] = [await run(launcher, args, { cwd: root, env }), await run(process.execPath, [nodeEntry, ...args], { cwd: root, env })];
      expect([compiled.code, compiled.signal, withoutRunId(compiled.stdout), compiled.stderr]).toEqual([0, null, withoutRunId(node.stdout), node.stderr]);
    }
    expect(await processesMentioning(root)).toEqual([]);
  }), 60_000);

  it('starts the Node daemon and matches the Node entry on the resident path', async () => fixture(async root => {
    const cold = await run(launcher, ['check', '--format', 'json'], { cwd: root, env, timeoutMs: 60_000 });
    expect([cold.code, cold.stderr]).toEqual([0, '']);
    const status = JSON.parse((await run(launcher, ['daemon', 'status', '--format', 'json'], { cwd: root, env })).stdout);
    expect(await processesMentioning(`${status.status.pid} node ${join(repositoryRoot, 'dist/src/daemon-entry.js')}`)).toHaveLength(1);
    for (const args of [['check'], ['check', '--format', 'json'], ['check', '--changed', 'src/interfaces/api.ts', '--format', 'json']]) {
      const [compiled, node] = [await run(launcher, args, { cwd: root, env }), await run(process.execPath, [nodeEntry, ...args], { cwd: root, env })];
      const normalize = (text: string) => withoutRunId(text).replace(/"(?:requestId|[a-zA-Z]*Ms)":("[^"]*"|[\d.]+)/g, '"<varies>"');
      expect([compiled.code, normalize(compiled.stdout), compiled.stderr], args.join(' ')).toEqual([node.code, normalize(node.stdout), node.stderr]);
    }
    const nodeStatus = JSON.parse((await run(process.execPath, [nodeEntry, 'daemon', 'status', '--format', 'json'], { cwd: root, env })).stdout);
    expect(nodeStatus.status.instanceId).toBe(status.status.instanceId);
  }), 120_000);

  it('fails promptly and releases the start lock when Node is not on PATH', async () => fixture(async root => {
    const isolated = await realpath(await mkdtemp('/tmp/rcn-')), tools = join(isolated, 'bin');
    try {
      await mkdir(tools);
      for (const tool of ['uname', 'readlink']) {
        const { stdout } = await promisify(execFile)('sh', ['-c', `command -v ${tool}`]);
        await symlink(stdout.trim(), join(tools, tool));
      }
      const result = await run(launcher, ['check'], { cwd: root, env: { ...env, PATH: tools, RAMIFY_ENDPOINT_DIR: join(isolated, 'e') }, timeoutMs: 20_000 });
      expect([result.code, result.stdout]).toEqual([2, '']);
      expect(result.stderr).toBe('Error [internal-error]: Cannot start node for batch analysis (ENOENT)\n');
      expect(result.ms).toBeLessThan(10_000);
      expect((await readdir(join(isolated, 'e'))).filter(name => name.endsWith('.lock'))).toEqual([]);
    } finally { await rm(isolated, { recursive: true, force: true }); }
  }), 30_000);

  it('interrupts a batch run, stops its Node child and claims no result', async () => fixture(async root => {
    let client = 0;
    const pending = run(launcher, ['check', '--batch', '--format', 'json'], { cwd: root, env, onStarted: pid => { client = pid; } });
    const deadline = performance.now() + 10_000;
    while (!(await processesMentioning(root)).some(line => line.includes('batch-entry.js'))) {
      if (performance.now() > deadline) throw new Error('Batch child did not start');
      await new Promise(done => setTimeout(done, 20));
    }
    process.kill(client, 'SIGINT');
    const result = await pending;
    expect([result.code, result.stdout, result.stderr]).toEqual([130, '', 'Interrupted; no result claimed.\n']);
    expect(await processesMentioning(root)).toEqual([]);
  }), 30_000);

  it('reports an output failure when stdout closes', async () => fixture(async root => {
    const result = await run(launcher, ['check', '--batch', '--format', 'json'], { cwd: root, env, brokenStdout: true });
    expect([result.code, result.stderr]).toEqual([2, 'Error [output-failure]: Could not write the complete CLI output.\n']);
  }), 30_000);

  it('installs a local package whose ramify bin runs the compiled client', async () => fixture(async root => {
    const installation = await mkdtemp(join(tmpdir(), 'ramify-bin-install-'));
    try {
      await writeFile(join(installation, 'package.json'), '{"private":true}');
      await promisify(execFile)('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', repositoryRoot],
        { cwd: installation, timeout: 20_000 });
      const bin = join(installation, 'node_modules/.bin/ramify');
      const batch = await run(bin, ['check', '--batch', '--format', 'json'], { cwd: root, env });
      expect([batch.code, batch.signal, batch.stderr]).toEqual([0, null, '']);
      expect(JSON.parse(batch.stdout)).toMatchObject({ schemaVersion: 'ramify.analysis/1', summary: { complete: true, owners: 2 } });
      // Only the compiled client can answer without Node on PATH.
      const version = await run(bin, ['--version'], { cwd: root, env: { ...env, PATH: '/usr/bin:/bin' } });
      expect([version.code, version.stderr]).toEqual([0, '']);
    } finally { await rm(installation, { recursive: true, force: true }); }
  }), 60_000);
});
