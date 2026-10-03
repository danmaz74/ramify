import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MeasureDocument, MeasureParams } from '../../../../src/interfaces/service.js';
import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import type { ServiceConnector } from '../../../daemon/src/interfaces/daemon.js';
import type { CliEnvironment } from '../interfaces/cli.js';
import { runCli } from '../run-cli.js';

async function put(root: string, path: string, value: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), value);
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-measure-command-')));
  await put(root, 'module.ramify', 'ramify 1\nroot module fixture\n');
  await put(root, 'README.md', '# Fixture\n\nMeasured fixture.\n');
  await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' },
    include: ['src', 'subs', 'outside.ts'] }));
  await put(root, 'src/main.ts', 'export const value = 1;\n');
  await put(root, 'src/tests/main.test.ts', 'void 1;\n');
  await put(root, 'src/data.txt', 'resource\n');
  await put(root, 'subs/child/module.ramify', 'ramify 1\nmodule child\n');
  await put(root, 'subs/child/src/child.ts', 'export const child = 2;\n');
  await put(root, 'outside.ts', 'export const outside = true;\n');
  const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
  return { root, quick, async dispose() { try { await quick.dispose(); } finally { await rm(root, { recursive: true, force: true }); } } };
}

async function invoke(root: string, connect: ServiceConnector, args: readonly string[]) {
  const stdout: string[] = [], stderr: string[] = [];
  let batchCalls = 0;
  const exit = await runCli(args, { cwd: root, version: '0', connect,
    stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); },
    batch: async () => { batchCalls++; throw new Error('measure must never call batch'); } });
  return { exit, stdout: stdout.join(''), stderr: stderr.join(''), writes: stdout.length, batchCalls };
}

function hiddenCapability(connect: ServiceConnector): ServiceConnector {
  return async options => {
    const connected = await connect(options);
    if (connected.status !== 'connected') return connected;
    return { ...connected, connection: { ...connected.connection,
      daemon: { ...connected.connection.daemon,
        capabilities: connected.connection.daemon.capabilities.filter(capability => capability !== 'measure') } } };
  };
}

type Attribution = { readonly state: 'generated' | 'inventoried' | 'outside' | 'excluded' | 'unobserved';
  readonly provisional?: { readonly owner: string; readonly area: 'ordinary' | 'tests' | 'documentation' } };

/** Independent implementation of the rule printed in the public document. */
function attribute(document: MeasureDocument, path: string): Attribution {
  const segments = path.split('/');
  if (!path || path.startsWith('/') || segments.some(segment => segment === '..' || segment === '')) return { state: 'unobserved' };
  const generated = segments.some(segment => segment === '.ramify' || segment === '.ramify-architect'
    || /^\.ramify(?:-architect)?\.(?:tmp|old)-.+(?:\.marker\.json)?$/.test(segment));
  if (generated) return { state: 'generated' };
  if (document.files.some(file => file.path === path)) return { state: 'inventoried' };
  if (document.outsideModuleFiles.includes(path)) return { state: 'outside' };
  if (segments.some(segment => ['.git', 'node_modules', 'bower_components', 'jspm_packages'].includes(segment))) return { state: 'excluded' };
  const module = [...document.modules].filter(item => item.dir === '' ? true : path === item.dir || path.startsWith(`${item.dir}/`))
    .sort((a, b) => b.dir.length - a.dir.length)[0];
  if (!module) return { state: 'unobserved' };
  const relative = module.dir === '' ? path : path.slice(module.dir.length + 1);
  const area = relative.startsWith('src/tests/') ? 'tests' : relative.startsWith('src/') ? 'ordinary'
    : relative === 'README.md' || relative === 'module.ramify' ? 'documentation' : null;
  return area ? { state: 'unobserved', provisional: { owner: module.id, area } } : { state: 'unobserved' };
}

describe('measure command', { timeout: 60_000 }, () => {
  it('MM10: prints the service document unchanged as JSON and a short exact/subtree table', async () => {
    const f = await fixture();
    try {
      const requests: MeasureParams[] = [];
      const connect: ServiceConnector = async options => {
        const connected = await f.quick.connect(options);
        if (connected.status !== 'connected') return connected;
        return { ...connected, connection: { ...connected.connection,
          measure: (params, control) => { requests.push(structuredClone(params)); return connected.connection.measure(params, control); } } };
      };
      const json = await invoke(f.root, connect, ['measure', '--format', 'json']);
      expect([json.exit, json.stderr, json.batchCalls, json.writes]).toEqual([0, '', 0, 1]);
      const document = JSON.parse(json.stdout) as MeasureDocument;
      expect(document).toMatchObject({ schema: 'ramify.measure/1', root: f.root, views: 'measured' });
      expect(document.modules.map(module => module.id)).toEqual(['fixture', 'fixture/child']);
      expect(document.files.map(file => file.path)).toEqual([...document.files.map(file => file.path)].sort());
      expect(document.outsideModuleFiles).toContain('outside.ts');
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ freshness: { mode: 'synchronized', expect: [] } });
      const human = await invoke(f.root, f.quick.connect, ['measure']);
      expect([human.exit, human.stderr, human.batchCalls]).toEqual([0, '', 0]);
      expect(human.stdout).toContain(`Root: ${f.root}\nRevision: ${document.revision}\nViews: measured\n`);
      expect(human.stdout).toContain('Module         Scope    Prod src');
      expect(human.stdout).toMatch(/fixture\/child\s+exact/);
      expect(human.stdout).toMatch(/fixture\/child\s+subtree/);
    } finally { await f.dispose(); }
  });

  it('MM10: requires the advertised measure capability before opening a context', async () => {
    const f = await fixture();
    try {
      const result = await invoke(f.root, hiddenCapability(f.quick.connect), ['measure', '--format', 'json']);
      expect([result.exit, result.batchCalls]).toEqual([2, 0]);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: 'ramify.cli/1', status: 'unavailable',
        diagnostics: [{ code: 'incompatible-service' }], exitCode: 2 });
      const status = await f.quick.service.daemonStatus();
      expect(status.ok && status.value.contexts).toEqual([]);
    } finally { await f.dispose(); }
  });

  it('preserves an explicit service resource refusal as exit 2 without a partial document', async () => {
    const f = await fixture();
    try {
      const refusing: ServiceConnector = async options => {
        const connected = await f.quick.connect(options);
        if (connected.status !== 'connected') return connected;
        return { ...connected, connection: { ...connected.connection, measure: async params => ({ ok: true, value: {
          status: 'unavailable', requestId: params.requestId, reason: 'resource-unavailable',
          message: 'Measure response exceeds maxResponseBytes (700)',
        } }) } };
      };
      const result = await invoke(f.root, refusing, ['measure', '--format', 'json']);
      expect([result.exit, result.stderr, result.batchCalls, result.writes]).toEqual([2, '', 0, 1]);
      const refusal = JSON.parse(result.stdout);
      expect(refusal).toMatchObject({ schemaVersion: 'ramify.cli/1', status: 'unavailable', exitCode: 2 });
      expect(refusal.schema).toBeUndefined();
      expect(JSON.stringify(refusal)).toContain('resource-unavailable');
    } finally { await f.dispose(); }
  });

  it('MM18: keeps generated, excluded, outside, symlink and unobserved paths distinct until refresh inventories a new file', async () => {
    const f = await fixture();
    try {
      await put(f.root, 'src/.ramify/deep/catalog.md', 'generated\n');
      await put(f.root, 'subs/child/src/.ramify.tmp-run/staged.ts', 'generated\n');
      await put(f.root, 'src/tests/.ramify.old-run.marker.json', '{}\n');
      await put(f.root, '.ramify-architect.old-run/nested/module.json', '{}\n');
      await put(f.root, 'src/.ramify-other/real.ts', 'export const similar = true;\n');
      await put(f.root, 'node_modules/pkg/index.ts', 'export const dependency = true;\n');
      await put(f.root, 'dist/output.ts', 'export const output = true;\n');
      await put(f.root, 'examples/independent/module.ramify', 'ramify 1\nroot module independent\n');
      await put(f.root, 'examples/independent/tsconfig.json', '{}\n');
      await put(f.root, 'examples/independent/src/own.ts', 'export const independent = true;\n');
      await symlink(join(f.root, 'outside.ts'), join(f.root, 'src/link.ts'));

      const first = await invoke(f.root, f.quick.connect, ['measure', '--format', 'json']);
      expect(first.exit).toBe(0);
      const document = JSON.parse(first.stdout) as MeasureDocument;
      expect(attribute(document, 'src/main.ts')).toEqual({ state: 'inventoried' });
      expect(attribute(document, 'outside.ts')).toEqual({ state: 'outside' });
      for (const path of ['src/.ramify/deep/catalog.md', 'subs/child/src/.ramify.tmp-run/staged.ts',
        'src/tests/.ramify.old-run.marker.json', '.ramify-architect.old-run/nested/module.json']) {
        expect(attribute(document, path), path).toEqual({ state: 'generated' });
      }
      expect(attribute(document, 'node_modules/pkg/missing.ts')).toEqual({ state: 'excluded' });
      expect(attribute(document, 'src/.ramify-other/real.ts')).toEqual({ state: 'inventoried' });
      expect(attribute(document, 'src/link.ts')).toEqual({ state: 'unobserved', provisional: { owner: 'fixture', area: 'ordinary' } });
      expect(attribute(document, 'dist/output.ts')).toEqual({ state: 'unobserved' });
      expect(attribute(document, 'examples/independent/src/own.ts')).toEqual({ state: 'unobserved' });
      expect(attribute(document, 'subs/child/src/future.ts')).toEqual({ state: 'unobserved',
        provisional: { owner: 'fixture/child', area: 'ordinary' } });
      expect(attribute(document, 'subs/child/other/future.ts')).toEqual({ state: 'unobserved' });

      await put(f.root, 'subs/child/src/future.ts', 'export const future = true;\n');
      const refreshed = await invoke(f.root, f.quick.connect, ['measure', '--format', 'json']);
      expect(refreshed.exit).toBe(0);
      const next = JSON.parse(refreshed.stdout) as MeasureDocument;
      expect(next.revision).not.toBe(document.revision);
      expect(attribute(next, 'subs/child/src/future.ts')).toEqual({ state: 'inventoried' });
      expect(next.files.find(file => file.path === 'subs/child/src/future.ts')).toMatchObject({ owner: 'fixture/child', area: 'ordinary', kind: 'source' });
      expect(await readFile(join(f.root, 'subs/child/src/future.ts'), 'utf8')).toContain('future');
    } finally { await f.dispose(); }
  });
});
