import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, cp, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { machine, tmpdir, type } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { affectedFixture, fixture } from './fixture.js';
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

  it('A7-11:compiled-child: runs affected --batch in a Node child and prints the Node entry document', async () => affectedFixture(async root => {
    for (const args of [['affected', '--path', 'subs/core/src/interfaces/api.ts', '--batch', '--format', 'json'],
      ['affected', 'example/mid', '--path', 'docs/notes.md', '--batch']]) {
      const [compiled, node] = [await run(launcher, args, { cwd: root, env }), await run(process.execPath, [nodeEntry, ...args], { cwd: root, env })];
      expect([compiled.code, compiled.signal, compiled.stdout, compiled.stderr], args.join(' ')).toEqual([0, null, node.stdout, node.stderr]);
    }
    const document = JSON.parse((await run(launcher, ['affected', '--path', 'subs/core/src/interfaces/api.ts', '--batch', '--format', 'json'],
      { cwd: root, env })).stdout);
    expect(document).toMatchObject({ schemaVersion: 'ramify.affected-cli/1', root, mode: 'batch', revision: { sequence: null },
      selection: { changedModules: [{ id: 'example/core' }], affectedModules: [{ id: 'example/app' }, { id: 'example/mid' }],
        selection: 'dependency-closure' } });
    expect(document.revision.inputId).toBe(document.selection.inputId);
    // The compiled client carries no engine: without Node on PATH its batch child cannot start.
    const isolated = await realpath(await mkdtemp('/tmp/rca-')), tools = join(isolated, 'bin');
    try {
      await mkdir(tools);
      for (const tool of ['uname', 'readlink']) {
        const { stdout } = await promisify(execFile)('sh', ['-c', `command -v ${tool}`]);
        await symlink(stdout.trim(), join(tools, tool));
      }
      const refused = await run(launcher, ['affected', 'example/core', '--batch'], { cwd: root, env: { ...env, PATH: tools } });
      expect([refused.code, refused.stdout, refused.stderr]).toEqual([2, '', 'Error [internal-error]: Cannot start node for batch analysis (ENOENT)\n']);
    } finally { await rm(isolated, { recursive: true, force: true }); }
    const invalid = await realpath(await mkdtemp('/tmp/rcv-'));
    try {
      const refusal = await run(launcher, ['affected', 'x', '--batch', '--format', 'json'], { cwd: invalid, env });
      expect([refusal.code, refusal.stderr]).toEqual([1, '']);
      expect(JSON.parse(refusal.stdout)).toMatchObject({ schemaVersion: 'ramify.cli/1', exitCode: 1, diagnostics: [{ code: 'invalid-project' }] });
    } finally { await rm(invalid, { recursive: true, force: true }); }
    expect(await processesMentioning(root)).toEqual([]);
    expect(await readdir(endpoint)).toEqual([]);
  }), 90_000);

  it('starts the Node daemon and matches the Node entry on the resident path', async () => fixture(async root => {
    const cold = await run(launcher, ['check', '--format', 'json'], { cwd: root, env, timeoutMs: 60_000 });
    expect([cold.code, cold.stderr]).toEqual([0, '']);
    const status = JSON.parse((await run(launcher, ['daemon', 'status', '--format', 'json'], { cwd: root, env })).stdout);
    expect(await processesMentioning(`${status.status.pid} node ${join(repositoryRoot, 'dist/src/daemon-entry.js')}`)).toHaveLength(1);
    for (const args of [['check'], ['check', '--format', 'json'], ['check', '--changed', 'src/interfaces/api.ts', '--format', 'json']]) {
      const [compiled, node] = [await run(launcher, args, { cwd: root, env }), await run(process.execPath, [nodeEntry, ...args], { cwd: root, env })];
      const normalize = (text: string) => withoutRunId(text).replace(/"(?:requestId|[a-zA-Z]*Ms)":("[^"]*"|[\d.]+)/g, '"<varies>"')
        .replace(/"reply":\{[^}]*\}/g, '"reply":"<varies>"');
      expect([compiled.code, normalize(compiled.stdout), compiled.stderr], args.join(' ')).toEqual([node.code, normalize(node.stdout), node.stderr]);
    }
    const nodeStatus = JSON.parse((await run(process.execPath, [nodeEntry, 'daemon', 'status', '--format', 'json'], { cwd: root, env })).stdout);
    expect(nodeStatus.status.instanceId).toBe(status.status.instanceId);
  }), 120_000);

  it('compiled-identity-bound: refuses a package whose runtime identity differs from the embedded one', async () => fixture(async root => {
    const isolated = await realpath(await mkdtemp('/tmp/rci-')), copy = join(isolated, 'pkg'), endpoints = join(isolated, 'e');
    try {
      await mkdir(endpoints, { mode: 0o700 });
      const copied = { ...env, RAMIFY_ENDPOINT_DIR: endpoints };
      await cp(join(repositoryRoot, 'dist'), join(copy, 'dist'), { recursive: true, filter: path => path !== client });
      // The executable locates its package from its own path; a hard link avoids copying the embedded runtime.
      const copiedClient = join(copy, 'dist/src', `ramify-client-${type()}-${machine()}`);
      await link(client, copiedClient).catch(() => copyFile(client, copiedClient));
      await copyFile(join(repositoryRoot, 'package.json'), join(copy, 'package.json'));
      await symlink(join(repositoryRoot, 'node_modules'), join(copy, 'node_modules'));
      const matching = await run(copiedClient, ['check', '--batch', '--format', 'json'], { cwd: root, env: copied });
      expect([matching.code, matching.stderr]).toEqual([0, '']);
      // Change one runtime file and rewrite the identity consistently: a complete build, but not the compiled one.
      const identityPath = join(copy, 'dist/runtime-identity.json');
      const identity = JSON.parse(await readFile(identityPath, 'utf8')) as { buildIdentity: string; packageJson: string;
        files: { path: string; sha256: string; bytes: number }[] };
      const changed = identity.files.find(file => file.path === 'dist/src/batch-entry.js')!;
      const bytes = Buffer.concat([await readFile(join(copy, changed.path)), Buffer.from('// another build\n')]);
      await writeFile(join(copy, changed.path), bytes);
      Object.assign(changed, { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
      identity.buildIdentity = createHash('sha256').update(JSON.stringify({ packageJson: identity.packageJson,
        files: identity.files.map(file => [file.path, file.sha256]) })).digest('hex');
      await writeFile(identityPath, JSON.stringify(identity));
      const prefix = `Error [incompatible]: this compiled client was built from runtime identity `;
      for (const args of [['check'], ['check', '--batch'], ['check', '--changed', 'src/interfaces/api.ts'], ['watch'], ['daemon', 'status']]) {
        const refused = await run(copiedClient, args, { cwd: root, env: copied });
        expect([refused.code, refused.stdout], args.join(' ')).toEqual([2, '']);
        expect(refused.stderr.startsWith(prefix), refused.stderr).toBe(true);
        expect(refused.stderr).toContain(`but ${copy} holds ${identity.buildIdentity.slice(0, 12)}; rebuild the package with npm run build\n`);
      }
      const json = await run(copiedClient, ['check', '--format', 'json'], { cwd: root, env: copied });
      expect([json.code, json.stderr]).toEqual([2, '']);
      expect(JSON.parse(json.stdout)).toMatchObject({ schemaVersion: 'ramify.cli/1', status: 'unavailable', exitCode: 2,
        diagnostics: [{ category: 'execution', code: 'incompatible' }] });
      const version = await run(copiedClient, ['--version'], { cwd: root, env: copied });
      const manifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8')) as { version: string };
      expect([version.code, version.stdout, version.stderr]).toEqual([0, `${manifest.version}\n`, '']);
      expect(await readdir(endpoints)).toEqual([]);
      expect(await processesMentioning(copy)).toEqual([]);
    } finally { await rm(isolated, { recursive: true, force: true }); }
  }), 60_000);

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
