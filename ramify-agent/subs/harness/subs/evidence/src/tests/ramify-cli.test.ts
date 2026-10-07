import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RamifyCli } from '../ramify-cli.js';
import { decodeOwnershipAnswer } from '../ownership.js';
import { temporaryDirectory } from './helpers/temporary.js';

/**
 * Ramify's two check forms. The exit code gives the project verdict: 0 is
 * checked with no findings, 1 is findings or an invalid revision, and 2 is
 * not checked with the CLI's reason. The printed document is decoded
 * strictly, `ramify.check/3` for the changed form and `ramify.analysis/3`
 * for the complete one; any other answer is unsupported and never a pass.
 *
 * The CLI is answered here by a stand-in, so that no test starts a daemon.
 * The installed CLI's own payloads are decoded in `project-boundary.test.ts`.
 */
describe('the Ramify check forms', () => {
  let directory: { path: string; remove: () => Promise<void> };

  beforeEach(async () => {
    directory = await temporaryDirectory();
  });
  afterEach(async () => {
    await directory.remove();
  });

  const cli = async (body: string, exitCode: number): Promise<RamifyCli> => {
    const executable = join(directory.path, 'ramify-stub.sh');
    await writeFile(executable, `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > ${join(directory.path, 'argv.txt')}\ncat <<'DOCUMENT'\n${body}\nDOCUMENT\nexit ${exitCode}\n`);
    await chmod(executable, 0o755);
    return new RamifyCli({ executable });
  };

  const argv = async (): Promise<string[]> => (await readFile(join(directory.path, 'argv.txt'), 'utf8')).trim().split('\n');

  const complete = (execution: string, check: string, root = directory.path) => JSON.stringify({
    schemaVersion: 'ramify.analysis/3', runId: 'r', inputId: 'input/1:abc', request: { project: { root } },
    outcome: { execution, check, coverage: execution === 'completed' ? 'complete' : 'not-run' }, snapshot: null,
    diagnostics: check === 'failed' ? [{ id: 'd', category: 'import', code: 'not-visible', message: 'm', location: { file: 'src/a.ts', line: 1 } }] : [],
    warnings: [], coverage: [], summary: {},
  });

  const sha = 'a'.repeat(64);
  const changed = (fields: Record<string, unknown> = {}) => ({
    schemaVersion: 'ramify.check/3', root: directory.path, revision: { id: 'rev/1:x:2', sequence: 2, path: 'source' }, since: 'rev/1:x:1',
    paths: [
      { path: 'src/one.ts', disposition: 'checked', module: 'app', exclusion: null, reason: 'content', sha256: sha },
      { path: 'docs/two.md', disposition: 'not-analyzed', module: 'app', exclusion: { kind: 'owned-unwired', directory: 'docs', owner: 'app' }, reason: 'owned-unwired' },
    ],
    outcome: 'checked', reason: null, execution: 'completed', findings: [], removed: ['gone'], warnings: [], coverage: [], checked: null, timings: {}, exitCode: 0,
    ...fields,
  });

  it('reads a complete check with no findings as checked', async () => {
    const ramify = await cli(complete('completed', 'passed'), 0);

    const result = await ramify.checkComplete(directory.path);

    expect(result).toMatchObject({ form: 'complete', exitCode: 0, outcome: 'checked', reason: null, unsupported: null, paths: [] });
    expect(result.provider).toEqual({ schema: 'ramify.analysis/3', revision: 'input/1:abc' });
    expect(await argv()).toEqual(['check', '--batch', '--root', directory.path, '--format', 'json', '--no-snapshot']);
  });

  it('reads exit 1 as findings', async () => {
    const ramify = await cli(complete('completed', 'failed'), 1);

    const result = await ramify.checkComplete(directory.path);

    expect(result.outcome).toBe('findings');
    expect(result.reason).toBeNull();
  });

  it('reads a complete check that could not complete as not checked, with the execution it gave', async () => {
    const ramify = await cli(complete('unavailable', 'not-run'), 2);

    const result = await ramify.checkComplete(directory.path);

    expect(result.outcome).toBe('not-checked');
    expect(result.reason).toBe('unavailable');
  });

  it('runs the hook check for the named paths, with its deadline, and keeps each path\'s disposition', async () => {
    const ramify = await cli(JSON.stringify(changed()), 0);

    const result = await ramify.checkChanged(['src/one.ts', 'docs/two.md'], directory.path, 2_000);

    expect(result).toMatchObject({ form: 'changed', outcome: 'checked', reason: null, execution: 'completed', removed: ['gone'], unsupported: null });
    expect(result.provider).toEqual({ schema: 'ramify.check/3', revision: 'rev/1:x:2' });
    expect(result.paths.map(path => [path.path, path.disposition, path.reason])).toEqual([['src/one.ts', 'checked', 'content'], ['docs/two.md', 'not-analyzed', 'owned-unwired']]);
    expect(await argv()).toEqual(['check', '--changed', 'src/one.ts', 'docs/two.md', '--format', 'json', '--deadline', '2000']);
  });

  it('reads a cold daemon and an uncovered configuration change as not checked, never as a pass', async () => {
    const notChecked = (reason: string, path: string) => JSON.stringify(changed({
      revision: null, since: null, outcome: 'not-checked', reason, execution: null, removed: [], exitCode: 2,
      paths: [{ path, disposition: 'not-checked', module: null, exclusion: null, reason }],
    }));
    const cold = await (await cli(notChecked('cold', 'src/one.ts'), 2)).checkChanged(['src/one.ts'], directory.path, 2_000);
    const configuration = await (await cli(notChecked('configuration-changed', 'tsconfig.json'), 2)).checkChanged(['tsconfig.json'], directory.path, 2_000);

    expect(cold).toMatchObject({ outcome: 'not-checked', reason: 'cold', unsupported: null });
    expect(cold.paths[0]).toMatchObject({ disposition: 'not-checked', reason: 'cold' });
    expect(configuration).toMatchObject({ outcome: 'not-checked', reason: 'configuration-changed' });
  });

  it('refuses a changed document that is not the project\'s, names other paths, or contradicts its exit code', async () => {
    const cases: Array<[unknown, number, string]> = [
      [changed({ root: '/another' }), 0, 'is not the checked project'],
      [changed(), 0, 'are not the named paths'],
      [changed({ exitCode: 1 }), 0, 'states exit 1'],
      [changed({ findings: [{ id: 'f', category: 'import', code: 'c', message: 'm', location: { file: 'src/one.ts' }, new: true }] }), 0, 'contradicts exit 0'],
      [changed({ paths: [{ path: 'src/one.ts', disposition: 'checked', module: 'app', exclusion: null, reason: 'content', sha256: null }] }), 0, 'invalid paths[0].reason'],
      [changed({ paths: [{ path: 'src/one.ts', disposition: 'passed', module: 'app', exclusion: null, reason: 'content' }] }), 0, 'invalid paths[0].disposition'],
      [changed({ paths: [{ path: 'src/one.ts', disposition: 'not-checked', module: null, exclusion: null, reason: 'some-new-reason' }], outcome: 'not-checked', reason: 'cold', exitCode: 2 }), 2, 'invalid paths[0].reason'],
      [changed({ warnings: [{ code: 'outside-module-source', path: 'scripts', message: 'm' }] }), 0, 'invalid warnings[0].code'],
    ];
    for (const [document, exitCode, message] of cases) {
      const named = message === 'are not the named paths' ? ['src/one.ts'] : (document as { paths: Array<{ path: string }> }).paths.map(path => path.path);
      const result = await (await cli(JSON.stringify(document), exitCode)).checkChanged(named, directory.path, 2_000);
      expect(result, message).toMatchObject({ outcome: 'not-checked', provider: null, paths: [] });
      expect(result.unsupported).toContain(message);
      expect(result.reason).toBe(`unsupported result: ${result.unsupported}`);
    }
  });

  it('reads an earlier document version, or a verdict without a document, as unsupported', async () => {
    const earlier = await (await cli(JSON.stringify({ schemaVersion: 'ramify.check/1', outcome: 'checked', findings: [] }), 0)).checkChanged(['src/one.ts'], directory.path, 2_000);
    const bare = await (await cli('', 0)).checkComplete(directory.path);
    const analysis = await (await cli(JSON.stringify({ schemaVersion: 'ramify.analysis/2', outcome: { execution: 'completed', check: 'passed' } }), 0)).checkComplete(directory.path);

    expect(earlier).toMatchObject({ outcome: 'not-checked', unsupported: '`ramify.check/1` where `ramify.check/3` was expected' });
    expect(bare).toMatchObject({ outcome: 'not-checked', unsupported: 'exit 0 without a `ramify.analysis/3` document' });
    expect(analysis.unsupported).toBe('`ramify.analysis/2` where `ramify.analysis/3` was expected');
  });

  it('names the invocation and its exit code where the CLI gave no reason', async () => {
    const ramify = await cli('ramify: the daemon could not be reached', 2);

    const result = await ramify.checkChanged(['src/one.ts'], directory.path, 500);

    expect(result.report).toBeNull();
    expect(result.unsupported).toBeNull();
    expect(result.reason).toContain('--deadline 500');
    expect(result.reason).toContain('exited with 2');
    expect(result.reason).toContain('the daemon could not be reached');
  });

  it('reads an invocation failure as not checked with its own reason', async () => {
    const ramify = await cli(JSON.stringify({ schemaVersion: 'ramify.cli/1', status: 'unavailable', reason: 'stub', exitCode: 2 }), 2);

    const result = await ramify.checkChanged(['src/one.ts'], directory.path, 500);

    expect(result).toMatchObject({ outcome: 'not-checked', reason: 'stub', unsupported: null, provider: null });
  });

  it('reads an exit code the contract does not define as not checked', async () => {
    const ramify = await cli('', 9);

    const result = await ramify.checkComplete(directory.path);

    expect(result.exitCode).toBe(9);
    expect(result.outcome).toBe('not-checked');
  });
});

describe('the released ownership answer', () => {
  const root = '/project';
  const answer = () => ({
    schemaVersion: 'ramify.affected-cli/4', root, mode: 'batch', revision: { sequence: null, inputId: 'input/1:abc' }, ramifyVersion: '0.4.0',
    selection: {
      schemaVersion: 'ramify.affected/4', inputId: 'input/1:abc', selection: 'dependency-closure', widening: [], analysisCheck: 'passed',
      coverage: { status: 'complete', notes: [] }, changedModules: [], affectedModules: [], testModules: [],
      scope: { root, selection: 'given', invokedFrom: root, configuration: `${root}/tsconfig.json`, walkedAreas: ['src'],
        ownership: { modules: [{ id: 'app', parent: null, directory: '.' }, { id: 'app/web', parent: 'app', directory: 'subs/web' }],
          exclusions: [{ kind: 'owned-unwired', directory: 'docs', owner: 'app' }] } },
      paths: [{ path: 'docs/example.mjs', status: 'owned', module: 'app', basis: 'containment', kind: 'ignored', selects: [] as string[],
        exclusion: { kind: 'owned-unwired', directory: 'docs', owner: 'app' } }],
    },
  });

  it('accepts the exact source identity and owned exclusion', () => {
    expect(decodeOwnershipAnswer(answer(), root).selection.paths[0]).toMatchObject({ module: 'app', kind: 'ignored' });
  });

  it('refuses old versions, mismatched input and project identities', () => {
    const old = answer(); old.schemaVersion = 'ramify.affected-cli/3';
    expect(() => decodeOwnershipAnswer(old, root)).toThrow('schema, root or mode');
    const input = answer(); input.selection.inputId = 'input/1:other';
    expect(() => decodeOwnershipAnswer(input, root)).toThrow('selection identity');
    expect(() => decodeOwnershipAnswer(answer(), '/another')).toThrow('schema, root or mode');
  });

  it('accepts renamed child directories and grouping directories, with diagnostic analysis limits', () => {
    const current = answer();
    current.selection.scope.ownership.modules[1]!.directory = 'subs/group/physical';
    current.selection.analysisCheck = 'failed';
    current.selection.coverage = { status: 'partial', notes: [] };
    expect(decodeOwnershipAnswer(current, root).selection.scope.ownership.modules[1]!.id).toBe('app/web');
  });

  it('refuses unsafe paths, duplicate identities, cycles and contradictory excluded placements', () => {
    for (const path of ['/absolute', '../escape', 'docs/../escape', 'docs//x', 'docs/./x', 'docs\\escape', 'C:/escape']) {
      const current = answer(); current.selection.paths[0]!.path = path;
      expect(() => decodeOwnershipAnswer(current, root)).toThrow('selection.path.path');
    }
    const duplicate = answer(); duplicate.selection.paths.push(structuredClone(duplicate.selection.paths[0]!));
    expect(() => decodeOwnershipAnswer(duplicate, root)).toThrow('duplicate path identity');
    const cycles = answer(); cycles.selection.scope.ownership.modules.push({ id: 'app/web/a', parent: 'app/web/a', directory: 'subs/web/subs/a' });
    expect(() => decodeOwnershipAnswer(cycles, root)).toThrow('ownership cycle');
    const incoherent = answer(); incoherent.selection.scope.ownership.modules.push({ id: 'app/other', parent: 'app', directory: 'subs/web/subs/other' });
    expect(() => decodeOwnershipAnswer(incoherent, root)).toThrow('ownership parent directory');
    const denied = answer(); denied.selection.scope.ownership.exclusions.push({ kind: 'output', directory: 'docs/output', owner: null } as never);
    denied.selection.paths[0]!.path = 'docs/output/file';
    expect(() => decodeOwnershipAnswer(denied, root)).toThrow('owned path crosses hard exclusion');
    const missing = answer(); missing.selection.paths[0]!.exclusion = null as never;
    expect(() => decodeOwnershipAnswer(missing, root)).toThrow('missing path exclusion');
  });

  it('refuses contradictory owner parents, directories and path selections', () => {
    const parent = answer(); parent.selection.scope.ownership.modules[1]!.parent = 'missing';
    expect(() => decodeOwnershipAnswer(parent, root)).toThrow('ownership parent');
    const directory = answer(); directory.selection.scope.ownership.modules[1]!.directory = '.';
    expect(() => decodeOwnershipAnswer(directory, root)).toThrow('duplicate ownership module or directory');
    const selected = answer(); selected.selection.paths[0]!.selects.push('app/web');
    expect(() => decodeOwnershipAnswer(selected, root)).toThrow('nonselecting path');
    const foreign = answer(); foreign.selection.paths[0]!.module = 'app/web';
    expect(() => decodeOwnershipAnswer(foreign, root)).toThrow(/path owner containment|owned excluded path/u);
  });
});
