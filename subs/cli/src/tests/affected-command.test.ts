import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AffectedParams } from '../../../../src/interfaces/service.js';
import { createQuickEnvironment, type QuickEnvironment } from '../../../../src/tests/quick-environment.js';
import type { ServiceConnection, ServiceConnector } from '../../../daemon/src/interfaces/daemon.js';
import type { RunControl } from '../../../analysis/src/interfaces/analysis.js';
import type { AffectedDocument } from '../interfaces/cli.js';
import { runCli } from '../run-cli.js';

/** `example/app -> example/mid -> example/core`, where an arrow means "depends on", and an unrelated `example/lone`. */
const files: Record<string, string> = {
  'module.ramify': 'ramify 1\nroot module example\nexpose-sub * from core to descendants\nexpose-sub * from mid to descendants\n',
  'README.md': '# Example\n\nAn affected-command fixture.\n',
  'package.json': '{"type":"module"}',
  'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', types: [], skipLibCheck: true },
    include: ['src', 'subs'] }),
  'docs/notes.md': '# Notes\n',
  'subs/core/module.ramify': 'ramify 1\nmodule core\nexpose-src * from "interfaces/api.ts" to parent\n',
  'subs/core/src/interfaces/api.ts': 'export const coreValue: number = 1;\n',
  'subs/mid/module.ramify': 'ramify 1\nmodule mid\nexpose-src * from "interfaces/api.ts" to parent\n',
  'subs/mid/src/interfaces/api.ts': "import { coreValue } from '../../../core/src/interfaces/api.js';\nexport const midValue: number = coreValue + 1;\n",
  'subs/app/module.ramify': 'ramify 1\nmodule app\n',
  'subs/app/src/main.ts': "import { midValue } from '../../mid/src/interfaces/api.js';\nvoid midValue;\n",
  'subs/lone/module.ramify': 'ramify 1\nmodule lone\n',
  'subs/lone/src/alone.ts': 'export const alone: number = 1;\n',
};
const example = { id: 'example', directory: '.' }, core = { id: 'example/core', directory: 'subs/core' };
const mid = { id: 'example/mid', directory: 'subs/mid' }, app = { id: 'example/app', directory: 'subs/app' };
const lone = { id: 'example/lone', directory: 'subs/lone' };

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ramify-affected-command-')));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
  return { root, quick, async dispose() { try { await quick.dispose(); } finally { await rm(root, { recursive: true, force: true }); } } };
}

async function invoke(root: string, connect: ServiceConnector, args: readonly string[], control?: RunControl) {
  const stdout: string[] = [], stderr: string[] = [];
  let batchCalls = 0;
  const exit = await runCli(args, { cwd: root, version: '0.1.2', connect,
    stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); },
    batch: async () => { batchCalls++; throw new Error('affected must never call the check batch'); },
    affectedBatch: async () => { batchCalls++; throw new Error('the resident form must never call batch'); } }, control);
  return { exit, stdout: stdout.join(''), stderr: stderr.join(''), writes: stdout.length, batchCalls };
}

/** Replace the connection's affected method, keeping every other operation real. */
function replacing(quick: QuickEnvironment, affected: (connection: ServiceConnection) => ServiceConnection['affected']): ServiceConnector {
  return async options => {
    const connected = await quick.connect(options);
    if (connected.status !== 'connected') return connected;
    return { ...connected, connection: { ...connected.connection, affected: affected(connected.connection) } };
  };
}

async function expectReleased(quick: QuickEnvironment): Promise<void> {
  const status = await quick.service.daemonStatus();
  if (!status.ok) throw new Error('Expected daemon status after CLI completion');
  expect(status.value.connections).toBe(0);
  for (const context of status.value.contexts) {
    expect(context.leases).toEqual({ subscriptions: 0, requests: 0 });
    expect(context.pending.requests).toBe(0);
  }
}

describe('affected command through the real resident service (A7-10)', { timeout: 60_000 }, () => {
  it('A7-10:json-document: prints one ramify.affected-cli/2 document with root, resident mode, revision and selection', async () => {
    const f = await fixture();
    try {
      const requests: AffectedParams[] = [];
      const connect = replacing(f.quick, connection => (params, control) => {
        requests.push(structuredClone(params)); return connection.affected(params, control);
      });
      const result = await invoke(f.root, connect, ['affected', '--path', 'subs/core/src/interfaces/api.ts', '--format', 'json']);
      expect([result.exit, result.stderr, result.batchCalls, result.writes]).toEqual([0, '', 0, 1]);
      expect(requests).toEqual([{ token: expect.any(Object), requestId: expect.any(String),
        freshness: { mode: 'synchronized', expect: [] }, modules: [], paths: ['subs/core/src/interfaces/api.ts'] }]);
      const document = JSON.parse(result.stdout) as AffectedDocument;
      expect(Object.keys(document)).toEqual(['schemaVersion', 'root', 'mode', 'revision', 'ramifyVersion', 'selection']);
      expect(document).toMatchObject({ schemaVersion: 'ramify.affected-cli/2', root: f.root, mode: 'resident', ramifyVersion: '0.1.2' });
      expect(document.revision.sequence).toEqual(expect.any(Number));
      expect(document.revision.inputId).toMatch(/.+/);
      expect(document.selection).toMatchObject({ schemaVersion: 'ramify.affected/2', inputId: document.revision.inputId,
        paths: [{ path: 'subs/core/src/interfaces/api.ts', status: 'owned', module: 'example/core', basis: 'inventory', exclusion: null }],
        changedModules: [core], affectedModules: [app, mid], testModules: [app, core, mid],
        selection: 'dependency-closure', widening: [], coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed',
        scope: { root: f.root } });
      await expectReleased(f.quick);
    } finally { await f.dispose(); }
  });

  it('A7-10:human: lists root, mode, revision, selection, each path with module and basis, and the three module lists', async () => {
    const f = await fixture();
    try {
      const json = await invoke(f.root, f.quick.connect, ['affected', 'example/mid', '--path', 'subs/core/module.ramify', '--format', 'json']);
      expect(json.exit).toBe(0);
      const { revision } = JSON.parse(json.stdout) as AffectedDocument;
      const result = await invoke(f.root, f.quick.connect, ['affected', 'example/mid', '--path', 'subs/core/module.ramify']);
      expect([result.exit, result.stderr, result.batchCalls]).toEqual([0, '', 0]);
      expect(result.stdout).toBe([
        `Root: ${f.root}`,
        'Mode: resident',
        `Revision: sequence ${revision.sequence}, input ${revision.inputId}`,
        'Selection: dependency-closure',
        'Path subs/core/module.ramify: example/core (declaration)',
        'Changed modules (2):', '  example/core (subs/core)', '  example/mid (subs/mid)',
        'Affected modules (1):', '  example/app (subs/app)',
        'Test modules (3):', '  example/app (subs/app)', '  example/core (subs/core)', '  example/mid (subs/mid)',
        'Coverage: complete, 0 notes',
        'Analysis check: passed', ''].join('\n'));
      await expectReleased(f.quick);
    } finally { await f.dispose(); }
  });

  it('A7-10:widened-exit-0: an all-modules answer exits 0 and names its widening reason', async () => {
    const f = await fixture();
    try {
      // Only a path outside the project widens (project-boundary contracts, "Reports, affected queries and freshness").
      const json = await invoke(f.root, f.quick.connect, ['affected', 'example/lone', '--path', '../notes.md', '--format', 'json']);
      expect([json.exit, json.stderr, json.writes]).toEqual([0, '', 1]);
      expect((JSON.parse(json.stdout) as AffectedDocument).selection).toMatchObject({
        paths: [{ path: '../notes.md', status: 'outside-project', module: null, basis: 'none', exclusion: null }],
        changedModules: [lone], affectedModules: [], testModules: [example, app, core, lone, mid],
        selection: 'all-modules', widening: ['unowned-path'] });
      const human = await invoke(f.root, f.quick.connect, ['affected', 'example/lone', '--path', '../notes.md']);
      expect(human.exit).toBe(0);
      expect(human.stdout).toContain('Selection: all-modules (widened: unowned-path)\nPath ../notes.md: no module (none)\n');
      expect(human.stdout).toContain('Test modules (5):\n  example (.)\n');
      // Root-owned documentation selects the root by containment, and an installed-package path selects nothing; neither widens.
      const owned = await invoke(f.root, f.quick.connect, ['affected', '--path', 'docs/notes.md', '--path', 'node_modules/x/index.js']);
      expect(owned.exit).toBe(0);
      expect(owned.stdout).toContain('Selection: dependency-closure\nPath docs/notes.md: example (containment)\n'
        + 'Path node_modules/x/index.js: no module (excluded, packages node_modules)\nChanged modules (1):\n  example (.)\n'
        + 'Affected modules (0):\nTest modules (1):\n  example (.)\n');
    } finally { await f.dispose(); }
  });

  it('A7-10:unknown-module-exit-1: an unknown module ID exits 1 with the unknown set', async () => {
    const f = await fixture();
    try {
      const json = await invoke(f.root, f.quick.connect, ['affected', 'example/core', 'example/nope', 'other', '--format', 'json']);
      expect([json.exit, json.stderr, json.writes, json.batchCalls]).toEqual([1, '', 1, 0]);
      const refusal = JSON.parse(json.stdout);
      expect(refusal).toEqual({ schemaVersion: 'ramify.cli/1', status: 'unavailable', exitCode: 1,
        diagnostics: [{ category: 'execution', code: 'unknown-module', message: expect.stringContaining('example/nope') }] });
      expect(refusal.diagnostics[0].message).toContain('other');
      expect(refusal.diagnostics[0].message).not.toContain('example/core');
      const human = await invoke(f.root, f.quick.connect, ['affected', 'example/nope']);
      expect(human.exit).toBe(1);
      expect(human.stdout).toMatch(new RegExp(`^Root: ${f.root}\\nNot selected \\(unknown-module\\): .*example/nope`));
      await expectReleased(f.quick);
    } finally { await f.dispose(); }
  });

  it('A7-10:unavailable-exit-2: cold and superseded outcomes exit 2 with the ramify.cli/1 diagnostic form', async () => {
    const f = await fixture();
    try {
      const cold = replacing(f.quick, connection => async params => {
        const current = await connection.contextStatus({ token: params.token });
        if (!current.ok) throw new Error('Expected context status');
        return { ok: true, value: { status: 'cold', requestId: params.requestId, current: current.value } };
      });
      const superseded = replacing(f.quick, () => async params => ({ ok: true,
        value: { status: 'superseded', requestId: params.requestId, revision: null } }));
      for (const [reason, connect] of [['cold', cold], ['superseded', superseded]] as const) {
        const result = await invoke(f.root, connect, ['affected', 'example/core', '--format', 'json']);
        expect([result.exit, result.stderr, result.writes, result.batchCalls], reason).toEqual([2, '', 1, 0]);
        expect(JSON.parse(result.stdout)).toEqual({ schemaVersion: 'ramify.cli/1', status: 'unavailable', exitCode: 2,
          diagnostics: [{ category: 'execution', code: reason, message: expect.any(String) }] });
        const human = await invoke(f.root, connect, ['affected', 'example/core']);
        expect(human.exit).toBe(2);
        expect(human.stdout).toContain(`Not selected (${reason}): `);
      }
      const failed = replacing(f.quick, () => async params => ({ ok: true, value: { status: 'unavailable', requestId: params.requestId,
        revision: null, reason: 'analysis-failed', message: 'Worker failed', unknownModules: [] } }));
      const result = await invoke(f.root, failed, ['affected', 'example/core', '--format', 'json']);
      expect(result.exit).toBe(2);
      expect(JSON.parse(result.stdout).diagnostics).toEqual([{ category: 'execution', code: 'analysis-failed', message: 'Worker failed' }]);
      await expectReleased(f.quick);
    } finally { await f.dispose(); }
  });

  it('A7-10:cancel-130: an interrupt exits 130, claims no result and releases the context', async () => {
    const f = await fixture();
    try {
      const controller = new AbortController();
      let calls = 0;
      const connect = replacing(f.quick, connection => (params, control) => {
        calls++;
        const pending = connection.affected(params, control);
        controller.abort();
        return pending;
      });
      const result = await invoke(f.root, connect, ['affected', '--path', 'subs/app/src/main.ts', '--format', 'json'],
        { signal: controller.signal });
      expect([result.exit, result.stdout, result.stderr, result.batchCalls, calls]).toEqual([130, '', 'Interrupted; no result claimed.\n', 0, 1]);
      const status = await f.quick.service.daemonStatus();
      if (!status.ok) throw new Error('Expected daemon status');
      expect(status.value.contexts.every(context => context.leases.requests === 0)).toBe(true);
      await expectReleased(f.quick);
      // An explicit cancelled outcome without an interrupt is also exit 130.
      const cancelled = replacing(f.quick, () => async params => ({ ok: true, value: { status: 'cancelled', requestId: params.requestId } }));
      const explicit = await invoke(f.root, cancelled, ['affected', 'example/core']);
      expect([explicit.exit, explicit.stdout, explicit.stderr]).toEqual([130, '', 'Interrupted; no result claimed.\n']);
      await expectReleased(f.quick);
    } finally { await f.dispose(); }
  });

  it('A7-10: requires the advertised affected capability before opening a context', async () => {
    const f = await fixture();
    try {
      const hidden: ServiceConnector = async options => {
        const connected = await f.quick.connect(options);
        if (connected.status !== 'connected') return connected;
        return { ...connected, connection: { ...connected.connection, daemon: { ...connected.connection.daemon,
          capabilities: connected.connection.daemon.capabilities.filter(capability => capability !== 'affected') } } };
      };
      const result = await invoke(f.root, hidden, ['affected', 'example/core', '--format', 'json']);
      expect([result.exit, result.stderr, result.batchCalls]).toEqual([2, '', 0]);
      expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: 'ramify.cli/1', diagnostics: [{ code: 'incompatible-service' }] });
      const status = await f.quick.service.daemonStatus();
      expect(status.ok && status.value.contexts).toEqual([]);
    } finally { await f.dispose(); }
  });
});
