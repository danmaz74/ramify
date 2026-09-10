import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { fixture, put } from './fixture.js';
import { cliProcess, repositoryRoot } from './process.js';

describe('compiled CLI process lifetime', () => {
  it('installs a local package and runs its ramify bin through the Node shebang', async () => fixture(async root => {
    const installation = await mkdtemp(join(tmpdir(), 'ramify-bin-install-'));
    try {
      await writeFile(join(installation, 'package.json'), '{"private":true}');
      await promisify(execFile)('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', repositoryRoot],
        { cwd: installation, timeout: 20_000 });
      const result = await cliProcess(root, ['check', '--format', 'json'], { executable: join(installation, 'node_modules/.bin/ramify') });
      expect([result.code, result.signal, result.stderr]).toEqual([0, null, '']);
      expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: 'ramify.analysis/1', summary: { complete: true, owners: 2 } });
      expect(result.survivingChildren).toEqual([]);
    } finally { await rm(installation, { recursive: true, force: true }); }
  }), 30_000);
  for (const option of ['--help', '--version']) it(`${option} loads no engine, compiler, UI or server stack`, async () => {
    const result = await cliProcess('/', [option]);
    expect([result.code, result.signal, result.stderr]).toEqual([0, null, '']);
    const loads = result.events.flatMap(event => [event.url ?? '', ...event.commonjs ?? []]);
    expect(loads.some(path => /dist\/subs\/cli\/src\/run-cli\.js$/.test(path))).toBe(true);
    expect(loads.filter(path => /\/(?:typescript|react|react-dom|express|@modelcontextprotocol|d3-[^/]+)\//.test(path)
      || /\/dist\/(?:subs\/analysis\/|src\/batch\.js)/.test(path))).toEqual([]);
    expect(result.events.filter(event => ['spawn', 'other-launch', 'listen', 'bind'].includes(event.event))).toEqual([]);
    expect(result.events.find(event => event.event === 'exit' && event.pid === result.pid)).toMatchObject({ handles: 0, signalListeners: 0 });
  });

  it('finishes a real check and closes only its finite compiler helpers', async () => fixture(async root => {
    const result = await cliProcess(root, ['check', '--format', 'json']);
    expect([result.code, result.signal, result.stderr]).toEqual([0, null, '']);
    expect(JSON.parse(result.stdout).summary.complete).toBe(true);
    expect(result.events.filter(event => ['listen', 'bind', 'other-launch'].includes(event.event))).toEqual([]);
    const children = result.events.filter(event => event.event === 'spawn');
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      expect([child.command, ...child.args ?? []].join(' ')).toMatch(/configuration-helper\.js|compiler-helper\.js|\/@typescript\/typescript-(?:linux|darwin)-[^/]+\/lib\/tsc --api /);
    }
    expect(result.survivingChildren).toEqual([]);
    expect(result.events.find(event => event.event === 'exit' && event.pid === result.pid)).toMatchObject({ handles: 0, signalListeners: 0 });
  }), 20_000);

  for (const stage of ['acquisition', 'catalog'] as const) it(`SIGINT during ${stage} exits 130 after disposal without a result`, async () => fixture(async root => {
    const result = await cliProcess(root, ['check', '--format', 'json'], { mode: `interrupt-${stage}`, readTarget: join(root, 'src/interfaces/api.ts') });
    expect(result.events.some(event => event.event === 'barrier')).toBe(true);
    expect([result.code, result.signal, result.stdout]).toEqual([130, null, '']);
    expect(result.stderr).toBe('Interrupted; no result claimed.\n');
    expect(result.events.find(event => event.event === 'exit' && event.pid === result.pid)).toMatchObject({ handles: 0, signalListeners: 0 });
    for (const child of result.events.filter(event => event.event === 'spawn' && event.pid === result.pid)) {
      expect(result.events.some(event => event.event === 'child-close' && event.child === child.child)).toBe(true);
    }
  }), 20_000);

  it('returns a failed resolver report and releases acquired files and compiler state', async () => fixture(async root => {
    const result = await cliProcess(root, ['check', '--format', 'json'], { mode: 'fail-catalog' });
    expect([result.code, result.signal, result.stderr]).toEqual([2, null, '']);
    expect(result.events.filter(event => event.event === 'resolver-fault')).toHaveLength(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: { execution: 'incomplete', check: 'not-run' },
      stages: expect.arrayContaining([expect.objectContaining({ stage: 'catalog', status: 'failed' }),
        expect.objectContaining({ stage: 'decide', status: 'blocked' })]),
      diagnostics: expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('Injected compiler catalog failure') })]) });
    expect(result.events.find(event => event.event === 'exit' && event.pid === result.pid)).toMatchObject({ handles: 0, signalListeners: 0 });
  }), 20_000);

  it('reports a broken stdout pipe as exit 2 after completing session disposal', async () => fixture(async root => {
    const result = await cliProcess(root, ['check', '--format', 'json'], { brokenStdout: true });
    expect([result.code, result.signal, result.stdout]).toEqual([2, null, '']);
    expect(result.stderr).toContain('output-failure');
    expect(result.events.find(event => event.event === 'exit' && event.pid === result.pid)).toMatchObject({ handles: 0, signalListeners: 0 });
  }), 20_000);

  for (const action of ['resume', 'interrupt'] as const) it(`${action} during backpressured JSON publication keeps output and exit consistent`, async () => fixture(async root => {
    const purpose = 'Large résumé 🧪 report purpose. '.repeat(64 * 1024);
    await put(root, 'README.md', `# Fixture\n\n${purpose}\n`);
    const result = await cliProcess(root, ['check', '--format', 'json'], { backpressuredStdout: action });
    expect(result.events.filter(event => event.event === 'stdout-backpressure' && event.pid === result.pid)).toHaveLength(1);
    expect(result.signal).toBeNull();
    expect(result.survivingChildren).toEqual([]);
    expect(result.events.find(event => event.event === 'exit' && event.pid === result.pid)).toMatchObject({ handles: 0, signalListeners: 0 });
    if (action === 'resume') {
      expect([result.code, result.stderr]).toEqual([0, '']);
      const report = JSON.parse(result.stdout);
      expect(report).toMatchObject({ outcome: { execution: 'completed', check: 'passed' }, summary: { complete: true } });
      expect(result.stdout).toContain(purpose.trim());
    } else {
      expect([result.code, result.stderr]).toEqual([130, 'Interrupted; no result claimed.\n']);
      expect.soft(result.exitedWhilePaused, 'SIGINT must not wait for stdout to resume').toBe(true);
      expect.soft(result.interruptionMs).toBeLessThan(2000);
      expect(result.stdout.length).toBeGreaterThan(0);
      expect.soft(() => JSON.parse(result.stdout), 'exit 130 cannot publish a complete report').toThrow();
    }
  }), 20_000);
});
