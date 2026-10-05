import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import type { MaterializeParams } from '../../../../src/interfaces/service.js';
import type { DependencyDiagramRunner } from '../../../analysis/src/interfaces/dependency-analyzer.js';
import type { ServiceConnector } from '../../../daemon/src/interfaces/daemon.js';
import type { CliEnvironment } from '../interfaces/cli.js';
import { runCli } from '../run-cli.js';

/** Dependency facts unavailable at once: the architect view publishes without waiting. */
const failingRunner: DependencyDiagramRunner = { async run() { return { status: 'unavailable', reason: 'analysis-failed', message: 'scripted' }; } };

/** Records every materialize request the CLI sends, and optionally hides a daemon capability. */
function recording(connect: ServiceConnector, hidden?: string) {
  const requests: MaterializeParams[] = [];
  const wrapped: ServiceConnector = async options => {
    const connected = await connect(options);
    if (connected.status !== 'connected') return connected;
    const connection = connected.connection;
    return { ...connected, connection: { ...connection,
      daemon: { ...connection.daemon, capabilities: connection.daemon.capabilities.filter(capability => capability !== hidden) },
      materialize: (params, control) => { requests.push(structuredClone(params)); return connection.materialize(params, control); } } };
  };
  return { connect: wrapped, requests };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ramify-materialize-command-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'module.ramify'), 'ramify 1\nroot module fixture\n');
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' } }));
  await writeFile(join(root, 'src/main.ts'), 'export const value = 1;\n');
  const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 }, { dependencyDiagrams: failingRunner });
  return { root, quick, async dispose() { try { await quick.dispose(); } finally { await rm(root, { recursive: true, force: true }); } } };
}

// Real compiler startup and teardown need room under parallel regression.
describe('materialize command', { timeout: 30_000 }, () => {
  it('materializes the real project and writes a real generated document, with no batch fallback', async () => {
    const f = await fixture();
    try {
      let batchCalls = 0;
      const stdout: string[] = [], stderr: string[] = [];
      const environment: CliEnvironment = { cwd: f.root, version: '0', connect: f.quick.connect,
        stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); },
        batch: async () => { batchCalls++; throw new Error('materialize must never call batch'); } };
      const exit = await runCli(['materialize', '--all'], environment);
      expect([exit, batchCalls, stderr]).toEqual([0, 0, []]);
      expect(stdout.join('')).toMatch(/^Root: .+\nMaterialized: revision 1; 1 target\(s\), 0 entries, \d+ bytes written, 0 unchanged\n$/);
      const meta = JSON.parse(await readFile(join(f.root, 'src/.ramify/_meta.json'), 'utf8')) as { schema: string };
      expect(meta.schema).toBe('ramify.api-view/1');
    } finally { await f.dispose(); }
  });

  it('AV24: sends no views field without --view, and prints Plan 2A\'s two lines', async () => {
    const f = await fixture();
    try {
      const recorded = recording(f.quick.connect);
      const stdout: string[] = [], stderr: string[] = [];
      const environment: CliEnvironment = { cwd: f.root, version: '0', connect: recorded.connect,
        stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); }, batch: async () => { throw new Error('Unexpected batch'); } };
      expect(await runCli(['materialize', '--all'], environment)).toBe(0);
      expect(recorded.requests).toHaveLength(1);
      expect(Object.keys(recorded.requests[0]!).sort()).toEqual(['freshness', 'requestId', 'selection', 'token']);
      expect(stdout.join('')).toMatch(/^Root: .+\nMaterialized: revision 1; 1 target\(s\), 0 entries, \d+ bytes written, 0 unchanged\n$/);
      // The same request works against a daemon without materialize-views.
      const plain = recording(f.quick.connect, 'materialize-views');
      stdout.splice(0);
      expect(await runCli(['materialize', '--all'], { ...environment, connect: plain.connect })).toBe(0);
      expect(stdout.join('')).toMatch(/^Root: .+\nMaterialized: revision 1; 1 target\(s\), 0 entries, 0 bytes written, 1 unchanged\n$/);
      expect(stderr).toEqual([]);
    } finally { await f.dispose(); }
  });

  it('AV24: sends the views given, publishes the architect view and prints its line', async () => {
    const f = await fixture();
    try {
      const recorded = recording(f.quick.connect);
      const stdout: string[] = [], stderr: string[] = [];
      // Only the architect view: the working directory selects nothing, and any selection is sent.
      const environment: CliEnvironment = { cwd: join(f.root, 'src'), version: '0', connect: recorded.connect,
        stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); }, batch: async () => { throw new Error('Unexpected batch'); } };
      expect(await runCli(['materialize', '--view', 'architect'], environment)).toBe(0);
      expect(recorded.requests.map(request => [request.views, request.selection])).toEqual([[['architect'], { scope: 'all' }]]);
      // The fixture's one export, `value`, is its one record.
      const lines = stdout.join('').split('\n');
      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe(`Root: ${f.root}`);
      expect(lines[1]).toMatch(/^Materialized: revision 1; 1 target\(s\), 1 entries, \d+ bytes written, 0 unchanged$/);
      expect(lines.slice(2)).toEqual(['Architect view: .ramify-architect, 1 modules, 1 records, dependencies unavailable (analysis-failed)', '']);
      const meta = JSON.parse(await readFile(join(f.root, '.ramify-architect/_meta.json'), 'utf8')) as { schema: string };
      expect(meta.schema).toBe('ramify.architect-view/2');
      expect(stderr).toEqual([]);
    } finally { await f.dispose(); }
  });

  it('AV25: exits 2 with incompatible-service before opening a context when the daemon lacks materialize-views', async () => {
    const f = await fixture();
    try {
      const recorded = recording(f.quick.connect, 'materialize-views');
      const stdout: string[] = [], stderr: string[] = [];
      const environment: CliEnvironment = { cwd: f.root, version: '0', connect: recorded.connect,
        stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); }, batch: async () => { throw new Error('Unexpected batch'); } };
      expect(await runCli(['materialize', '--view', 'api', '--all'], environment)).toBe(2);
      expect([stdout, recorded.requests]).toEqual([[], []]);
      expect(stderr.join('')).toMatch(/^Error \[incompatible-service\]: .*materialize-views/);
      const status = await f.quick.service.daemonStatus();
      expect(status.ok && status.value.contexts).toEqual([]);
    } finally { await f.dispose(); }
  });

  it('reports a compact failure and claims no complete refresh for an invalid project description', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ramify-materialize-invalid-'));
    // A malformed root description (not "no project"): the general CLI
    // invocation rule reserves plain exit 2 for no project/no configuration
    // found at all; an explicit --root naming a directory with no
    // module.ramify is a genuinely invalid project resolution, exit 1, per
    // the CLI grammar's own exit table (distinct from an unresolvable
    // configuration or an unreachable --from, both exit 2).
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' } }));
    const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
    try {
      const stdout: string[] = [], stderr: string[] = [];
      const environment: CliEnvironment = { cwd: root, version: '0', connect: quick.connect,
        stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); }, batch: async () => { throw new Error('Unexpected batch'); } };
      const exit = await runCli(['materialize', '--all', '--root', root], environment);
      expect([exit, stderr]).toEqual([1, []]);
      expect(stdout.join('')).toMatch(/^Root: .*\nNot materialized \(project-invalid\): .+\nNo complete refresh was claimed\.\n$/);
    } finally { await quick.dispose(); await rm(root, { recursive: true, force: true }); }
  });

  it('exits with output-failure and no batch call when stdout itself fails', async () => {
    const f = await fixture();
    try {
      let batchCalls = 0;
      const stderr: string[] = [];
      const environment: CliEnvironment = { cwd: f.root, version: '0', connect: f.quick.connect,
        stdout: () => { throw new Error('Broken pipe'); }, stderr: value => { stderr.push(value); },
        batch: async () => { batchCalls++; throw new Error('Unexpected batch'); } };
      const exit = await runCli(['materialize', '--all'], environment);
      expect([exit, batchCalls]).toEqual([2, 0]);
      expect(stderr.join('')).toContain('output-failure');
    } finally { await f.dispose(); }
  });

  it('interrupts before a complete result and claims nothing on an already-aborted signal', async () => {
    const f = await fixture();
    try {
      let connectCalls = 0;
      const stderr: string[] = [];
      const environment: CliEnvironment = { cwd: f.root, version: '0',
        connect: async options => { connectCalls++; return f.quick.connect(options); },
        stdout: () => {}, stderr: value => { stderr.push(value); }, batch: async () => { throw new Error('Unexpected batch'); } };
      const exit = await runCli(['materialize', '--all'], environment, { signal: AbortSignal.abort() });
      expect([exit, connectCalls]).toEqual([130, 0]);
      expect(stderr.join('')).toContain('Interrupted');
    } finally { await f.dispose(); }
  });
});
