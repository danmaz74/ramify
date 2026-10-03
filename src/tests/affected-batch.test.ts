import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAffectedBatch } from '../batch.js';
import type { AffectedBatchOperation } from '../interfaces/batch.js';
import { runCli } from '../../subs/cli/src/run-cli.js';
import type { AffectedDocument } from '../../subs/cli/src/interfaces/cli.js';
import type { RunControl } from '../../subs/analysis/src/interfaces/analysis.js';
import type { ServiceConnector } from '../../subs/daemon/src/interfaces/daemon.js';
import { createQuickEnvironment } from './quick-environment.js';
import { affectedFixture, put } from './fixture.js';

const core = { id: 'example/core', directory: 'subs/core' }, mid = { id: 'example/mid', directory: 'subs/mid' };
const app = { id: 'example/app', directory: 'subs/app' };

async function invoke(cwd: string, argv: readonly string[], affectedBatch: AffectedBatchOperation = runAffectedBatch,
  connect: ServiceConnector = async () => { throw new Error('Unexpected daemon connection'); }, control?: RunControl) {
  const stdout: string[] = [], stderr: string[] = [];
  const exitCode = await runCli(argv, { cwd, version: '1.2.3', connect, stdout: text => { stdout.push(text); },
    stderr: text => { stderr.push(text); }, affectedBatch,
    batch: async () => { throw new Error('affected --batch must not run the check batch'); } }, control);
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join(''), writes: stdout.length };
}

describe('affected batch form (A7-11)', () => {
  it('A7-11:reference-json: prints a batch document with a null sequence and the session inputId', () => affectedFixture(async root => {
    const result = await invoke(join(root, 'subs/app'), ['affected', '--path', 'subs/core/src/interfaces/api.ts', '--batch', '--format', 'json']);
    expect([result.exitCode, result.stderr, result.writes]).toEqual([0, '', 1]);
    const document = JSON.parse(result.stdout) as AffectedDocument;
    expect(Object.keys(document)).toEqual(['schemaVersion', 'root', 'mode', 'revision', 'ramifyVersion', 'selection']);
    expect(document).toMatchObject({ schemaVersion: 'ramify.affected-cli/2', root, mode: 'batch', ramifyVersion: '1.2.3' });
    expect(document.revision.sequence).toBeNull();
    expect(document.revision.inputId).toMatch(/.+/);
    expect(document.selection).toMatchObject({ schemaVersion: 'ramify.affected/2', inputId: document.revision.inputId,
      paths: [{ path: 'subs/core/src/interfaces/api.ts', module: 'example/core', basis: 'inventory' }],
      changedModules: [core], affectedModules: [app, mid], testModules: [app, core, mid],
      selection: 'dependency-closure', widening: [], coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed',
      scope: { root, selection: 'found' } });
    const human = await invoke(root, ['affected', 'example/mid', '--batch']);
    expect([human.exitCode, human.stderr]).toEqual([0, '']);
    expect(human.stdout).toMatch(/^Root: .*\nMode: batch\nRevision: fresh session, input \S+\n/);
    expect(human.stdout).toContain(`Root: ${root}\nMode: batch\n`);
    expect(human.stdout).toContain('Selection: dependency-closure\nChanged modules (1):\n  example/mid (subs/mid)\nAffected modules (1):\n  example/app (subs/app)\n');
    expect(human.stdout).toContain('Test modules (2):\n  example/app (subs/app)\n  example/mid (subs/mid)\nCoverage: complete, 0 notes\n');
  }), 60_000);

  it('A7-11:resident-batch-agree: resident and batch selections on the unchanged project are equal', () => affectedFixture(async root => {
    const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
    try {
      for (const seeds of [['--path', 'subs/core/src/interfaces/api.ts'], ['example/lone', '--path', 'docs/notes.md'],
        ['example/app', '--path', 'subs/mid/module.ramify']]) {
        const args = ['affected', ...seeds, '--root', root, '--format', 'json'];
        const resident = await invoke(root, args, async () => { throw new Error('Unexpected batch'); }, quick.connect);
        const batch = await invoke(root, [...args, '--batch']);
        expect([resident.exitCode, batch.exitCode, resident.stderr, batch.stderr], seeds.join(' ')).toEqual([0, 0, '', '']);
        const [one, two] = [JSON.parse(resident.stdout) as AffectedDocument, JSON.parse(batch.stdout) as AffectedDocument];
        expect([one.mode, two.mode, two.revision.sequence]).toEqual(['resident', 'batch', null]);
        expect(one.revision.sequence).toEqual(expect.any(Number));
        expect(two.revision.inputId).toBe(one.revision.inputId);
        expect(two.selection).toEqual(one.selection);
        expect(JSON.stringify(two.selection)).toBe(JSON.stringify(one.selection));
        expect({ ...two, mode: 'resident', revision: one.revision }).toEqual(one);
      }
    } finally { await quick.dispose(); }
  }), 90_000);

  it('A7-11:invalid-project: a directory without a root description exits 1 as invalid-project', async () => {
    const empty = await realpath(await mkdtemp(join(tmpdir(), 'ramify-affected-empty-')));
    try {
      await put(empty, 'src/value.ts', 'export const value = 1;\n');
      const direct = await runAffectedBatch({ cwd: empty, root: empty, modules: ['x'], paths: [] });
      expect(direct).toMatchObject({ status: 'unavailable', reason: 'invalid-project', unknownModules: [], exitCode: 1 });
      const json = await invoke(empty, ['affected', 'x', '--root', empty, '--batch', '--format', 'json']);
      expect([json.exitCode, json.stderr, json.writes]).toEqual([1, '', 1]);
      expect(JSON.parse(json.stdout)).toEqual({ schemaVersion: 'ramify.cli/1', status: 'unavailable', exitCode: 1,
        diagnostics: [{ category: 'execution', code: 'invalid-project', message: expect.any(String) }] });
      const human = await invoke(empty, ['affected', 'x', '--root', empty, '--batch']);
      expect(human.exitCode).toBe(1);
      expect(human.stdout).toContain(`Root: ${empty}\nNot selected (invalid-project): `);
      const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
      try {
        const resident = await invoke(empty, ['affected', 'x', '--root', empty, '--format', 'json'], runAffectedBatch, quick.connect);
        expect([resident.exitCode, resident.stderr]).toEqual([1, '']);
        expect(JSON.parse(resident.stdout)).toMatchObject({ exitCode: 1, diagnostics: [{ code: 'invalid-project' }] });
      } finally { await quick.dispose(); }
    } finally { await rm(empty, { recursive: true, force: true }); }
  }, 30_000);

  it('A7-11:invalid-project not-found-exit-2: no project found from the directory is project-unavailable, exit 2, in both forms', async () => {
    const empty = await realpath(await mkdtemp(join(tmpdir(), 'ramify-affected-none-')));
    try {
      await put(empty, 'src/value.ts', 'export const value = 1;\n');
      const direct = await runAffectedBatch({ cwd: empty, modules: ['x'], paths: [] });
      expect(direct).toMatchObject({ status: 'unavailable', reason: 'project-unavailable', unknownModules: [], exitCode: 2 });
      const human = await invoke(empty, ['affected', 'x', '--batch']);
      expect([human.exitCode, human.stderr]).toEqual([2, '']);
      expect(human.stdout).toContain(`Root: (discovered from ${empty})\nNot selected (project-unavailable): `);
      const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
      try {
        for (const form of [[], ['--batch']]) {
          const json = await invoke(empty, ['affected', 'x', '--format', 'json', ...form], runAffectedBatch, quick.connect);
          expect([json.exitCode, json.stderr, json.writes], form.join(' ')).toEqual([2, '', 1]);
          expect(JSON.parse(json.stdout)).toEqual({ schemaVersion: 'ramify.cli/1', status: 'unavailable', exitCode: 2,
            diagnostics: [{ category: 'execution', code: 'project-unavailable', message: expect.any(String) }] });
        }
      } finally { await quick.dispose(); }
    } finally { await rm(empty, { recursive: true, force: true }); }
  }, 30_000);

  it('A7-11: maps unknown modules, invalid seeds and an invalid revision to exit 1 in both forms', () => affectedFixture(async root => {
    expect(await runAffectedBatch({ cwd: root, modules: ['example/nope', 'example/core'], paths: [] })).toEqual({ status: 'unavailable',
      reason: 'unknown-module', message: 'Unknown module IDs: example/nope', unknownModules: ['example/nope'], exitCode: 1 });
    expect(await runAffectedBatch({ cwd: root, modules: [], paths: ['/abs.ts'] })).toMatchObject({ status: 'unavailable',
      reason: 'invalid-query', exitCode: 1 });
    // An exposure of a symbol the file does not export leaves the project invalid and access blocked.
    await put(root, 'subs/core/module.ramify', 'ramify 1\nmodule core\nexpose-src missing from "interfaces/api.ts" to parent\n');
    expect(await runAffectedBatch({ cwd: root, modules: ['example/core'], paths: [] })).toMatchObject({ status: 'unavailable',
      reason: 'invalid-project', exitCode: 1 });
    const quick = await createQuickEnvironment({ sweepIntervalMs: 600_000 });
    try {
      for (const form of [[], ['--batch']]) {
        const json = await invoke(root, ['affected', 'example/core', '--format', 'json', ...form], runAffectedBatch, quick.connect);
        expect([json.exitCode, json.stderr], form.join(' ')).toEqual([1, '']);
        expect(JSON.parse(json.stdout)).toEqual({ schemaVersion: 'ramify.cli/1', status: 'unavailable', exitCode: 1,
          diagnostics: [{ category: 'execution', code: 'invalid-project', message: expect.any(String) }] });
      }
    } finally { await quick.dispose(); }
  }), 60_000);

  it('A7-11: an interrupt during the batch form exits 130 and claims no result', () => affectedFixture(async root => {
    const controller = new AbortController();
    const result = await invoke(root, ['affected', 'example/core', '--batch', '--format', 'json'], async (invocation, control) => {
      const completed = await runAffectedBatch(invocation, control); controller.abort(); return completed;
    }, undefined, { signal: controller.signal });
    expect(result).toMatchObject({ exitCode: 130, stdout: '', stderr: 'Interrupted; no result claimed.\n' });
    expect(await runAffectedBatch({ cwd: root, modules: ['example/core'], paths: [] }, { signal: AbortSignal.abort() }))
      .toEqual({ status: 'cancelled', exitCode: 130 });
  }), 30_000);
});
