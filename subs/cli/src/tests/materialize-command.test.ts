import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createQuickEnvironment } from '../../../../src/tests/quick-environment.js';
import type { CliEnvironment } from '../interfaces/cli.js';
import { runCli } from '../run-cli.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ramify-materialize-command-'));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'module.ramify'), 'ramify 1\nmodule fixture\n');
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' } }));
  await writeFile(join(root, 'src/main.ts'), 'export const value = 1;\n');
  const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
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
