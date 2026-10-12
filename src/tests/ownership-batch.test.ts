import * as analysis from '../../subs/analysis/src/index.js';
import * as retained from '../../subs/analysis/src/retained-session.js';
import { symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runAffectedBatch, runOwnershipBatch } from '../batch.js';
import { withRecoverySmall, recoverySmallPaths } from '../../subs/analysis/src/tests/recovery-fixtures.js';
import { ownershipDocumentSchema } from '../../subs/cli/src/index.js';
import { runCli } from '../../subs/cli/src/run-cli.js';

async function invoke(cwd: string, args: readonly string[]) {
  const stdout: string[] = [], stderr: string[] = [];
  const exitCode = await runCli(args, { cwd, version: '0.4.3', stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); },
    ownershipBatch: runOwnershipBatch, connect: async () => { throw new Error('Ownership must not connect'); },
    batch: async () => { throw new Error('Ownership must not run full batch analysis'); },
    affectedBatch: async () => { throw new Error('Ownership must not query dependencies'); } });
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
}

describe('FR03–FR07 fresh ownership assembly', () => {
  it('FR03 FR04 executes neither full analysis nor dependency sessions on real link-invalid input', () => withRecoverySmall(async fixture => {
    await fixture.removeExports();
    const analyze = vi.spyOn(analysis, 'analyzeProject').mockImplementation(async () => { throw new Error('Unexpected full analysis'); });
    const session = vi.spyOn(retained, 'openRetainedSession').mockImplementation(async () => { throw new Error('Unexpected retained session'); });
    try {
      const result = await invoke(fixture.root, ['ownership', '--format', 'json']);
      expect(result.exitCode).toBe(0); expect(JSON.parse(result.stdout)).toMatchObject({ status: 'answered' });
      expect(analyze).not.toHaveBeenCalled(); expect(session).not.toHaveBeenCalled();
    } finally { analyze.mockRestore(); session.mockRestore(); }
  }));

  it('FR03 FR04 answers the affected table before and after two exposed exports disappear', () => withRecoverySmall(async fixture => {
    const paths = [recoverySmallPaths.provider, recoverySmallPaths.consumer];
    const valid = await runOwnershipBatch({ cwd: fixture.root, paths });
    const affected = await runAffectedBatch({ cwd: fixture.root, modules: [], paths });
    expect(valid.status).toBe('answered'); expect(affected.status).toBe('answered');
    if (valid.status !== 'answered' || affected.status !== 'answered') throw new Error('Expected valid controls');
    expect(valid.scope.ownership).toEqual(affected.result.scope.ownership);
    expect(valid.paths.map(item => [item.path, item.ownership])).toEqual([
      [paths[0], { status: 'owned', module: 'recovery/provider', directory: 'subs/provider', exclusion: null }],
      [paths[1], { status: 'owned', module: 'recovery/consumer', directory: 'subs/consumer', exclusion: null }],
    ]);
    await fixture.removeExports();
    const invalidAffected = await runAffectedBatch({ cwd: fixture.root, modules: [], paths });
    expect(invalidAffected).toMatchObject({ status: 'unavailable', reason: 'invalid-project', exitCode: 1 });
    const cli = await invoke(fixture.root, ['ownership', '--format', 'json', '--path', paths[0]!]);
    expect([cli.exitCode, cli.stderr]).toEqual([0, '']);
    const document = ownershipDocumentSchema.parse(JSON.parse(cli.stdout));
    expect(document.status).toBe('answered');
    if (document.status !== 'answered') throw new Error('Ownership became unavailable');
    expect(document.scope.ownership).toEqual(valid.scope.ownership);
    expect(document.inputId).not.toBe(valid.inputId);
    for (const key of ['selection', 'walkedAreas', 'invokedFrom', 'recovery', 'catalog', 'dependencies']) expect(document).not.toHaveProperty(key);
  }), 30_000);

  it('FR06 FR07 discovers from a descendant, defaults to root and keeps repeated path order', () => withRecoverySmall(async fixture => {
    const defaultAnswer = await invoke(join(fixture.root, 'subs/consumer'), ['ownership', '--format', 'json']);
    expect(defaultAnswer.exitCode).toBe(0);
    expect(JSON.parse(defaultAnswer.stdout)).toMatchObject({ root: fixture.root,
      paths: [{ path: '.', ownership: { status: 'owned', module: 'recovery', directory: '.', exclusion: null } }] });
    const paths = ['../outside', 'dist/deleted.js', 'subs/provider/src/new.ts', 'subs/provider/src/tmp/new.ts', 'src/.ramify/new.ts'];
    const result = await invoke(fixture.root, ['ownership', '--root', fixture.root, '--format', 'json',
      ...[...paths, paths[0]!].flatMap(path => ['--path', path])]);
    const document = ownershipDocumentSchema.parse(JSON.parse(result.stdout));
    expect(result.exitCode).toBe(0);
    if (document.status !== 'answered') throw new Error('Expected answer');
    expect(document.paths.map(item => item.path)).toEqual(paths);
    expect(document.paths.map(item => item.ownership.status)).toEqual(['outside-project', 'excluded', 'owned', 'owned', 'excluded']);
    const human = await invoke(fixture.root, ['ownership', '--path', paths[0]!]);
    expect(human).toMatchObject({ exitCode: 0, stderr: '' }); expect(human.stdout).toContain('Path ../outside: outside the project');
  }));

  it('FR06 answers owned trees, hard exclusions and supported invocation symlinks', () => withRecoverySmall(async fixture => {
    await fixture.write('module.ramify', 'ramify 1\nroot module recovery\nexpose-sub * from provider to descendants\nowned-unwired "data"\nowned-nested-project "fixture"\nexternal "vendor"\n');
    await fixture.write('data/notes.txt', 'data');
    await fixture.write('fixture/module.ramify', 'ramify 1\nroot module nested\n');
    const paths = ['data/new.ts', 'fixture/deleted.ts', 'vendor/absent.ts', 'data/node_modules/new.ts', '.git/HEAD', 'subs/provider'];
    const answer = await runOwnershipBatch({ cwd: fixture.root, paths });
    if (answer.status !== 'answered') throw new Error(JSON.stringify(answer));
    expect(answer.paths.map(({ ownership }) => ownership)).toEqual([
      { status: 'owned', module: 'recovery', directory: '.', exclusion: { kind: 'owned-unwired', directory: 'data', owner: 'recovery' } },
      { status: 'owned', module: 'recovery', directory: '.', exclusion: { kind: 'owned-nested-project', directory: 'fixture', owner: 'recovery' } },
      { status: 'excluded', module: null, exclusion: { kind: 'external', directory: 'vendor', owner: null } },
      { status: 'excluded', module: null, exclusion: { kind: 'packages', directory: 'data/node_modules', owner: null } },
      { status: 'excluded', module: null, exclusion: { kind: 'repository', directory: '.git', owner: null } },
      { status: 'owned', module: 'recovery/provider', directory: 'subs/provider', exclusion: null },
    ]);
    const link = fixture.root + '-link';
    await symlink(join(fixture.root, 'subs/provider'), link);
    try {
      expect(await runOwnershipBatch({ cwd: link, paths: ['.'] })).toMatchObject({ status: 'answered', root: fixture.root });
      expect(await runOwnershipBatch({ cwd: fixture.root, root: link, paths: ['.'] }))
        .toMatchObject({ status: 'invalid', root: null, exitCode: 1, diagnostics: [{ code: 'symlink-root', location: null }] });
    } finally { await rm(link); }
  }));

  it('FR05 returns canonical selected root and no success fields on declaration failure', () => withRecoverySmall(async fixture => {
    await fixture.write('subs/provider/module.ramify', 'ramify 1\nmodule provider\nexpose-test * from "api.ts" to parent\n');
    const result = await invoke(fixture.root, ['ownership', '--format', 'json']);
    expect(result.exitCode).toBe(1);
    const document = ownershipDocumentSchema.parse(JSON.parse(result.stdout));
    expect(document).toMatchObject({ status: 'invalid', root: fixture.root, diagnostics: expect.arrayContaining([
      expect.objectContaining({ location: expect.objectContaining({ file: 'subs/provider/module.ramify', line: 3 }) }),
    ]) });
    for (const key of ['inputId', 'scope', 'paths', 'warnings']) expect(document).not.toHaveProperty(key);
  }));
});
