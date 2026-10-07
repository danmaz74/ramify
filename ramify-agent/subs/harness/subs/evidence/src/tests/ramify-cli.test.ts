import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RamifyCli } from '../ramify-cli.js';
import { decodeOwnershipAnswer } from '../ownership.js';
import { temporaryDirectory } from './helpers/temporary.js';

/**
 * Ramify's two check forms, read from their exit codes alone: 0 is checked
 * with no findings, 1 is findings or an invalid revision, and 2 is not checked
 * with the CLI's reason. Exit 2 is never a pass, so a caller that needs a
 * verdict runs the complete check instead of claiming hook coverage.
 *
 * The CLI is answered here by a stand-in, so that no test starts a daemon. The
 * installed CLI's own exit codes are the contract these forms follow.
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

  it('reads a complete check with no findings as checked', async () => {
    const ramify = await cli(JSON.stringify({ schemaVersion: 'ramify.analysis/1', outcome: { execution: 'completed', check: 'passed', coverage: 'complete' } }), 0);

    const result = await ramify.checkComplete(directory.path);

    expect(result).toMatchObject({ form: 'complete', exitCode: 0, outcome: 'checked', reason: null });
    expect((result.report as { outcome: { check: string } }).outcome.check).toBe('passed');
    expect(await argv()).toEqual(['check', '--batch', '--root', directory.path, '--format', 'json', '--no-snapshot']);
  });

  it('reads exit 1 as findings', async () => {
    const ramify = await cli(JSON.stringify({ schemaVersion: 'ramify.analysis/1', outcome: { execution: 'completed', check: 'failed', coverage: 'complete' } }), 1);

    const result = await ramify.checkComplete(directory.path);

    expect(result.outcome).toBe('findings');
    expect(result.reason).toBeNull();
  });

  it('reads a complete check that could not complete as not checked, with the reason it gave', async () => {
    const ramify = await cli(JSON.stringify({ schemaVersion: 'ramify.analysis/1', outcome: { execution: 'failed', check: 'not-checked', coverage: 'none' } }), 2);

    const result = await ramify.checkComplete(directory.path);

    expect(result.outcome).toBe('not-checked');
    expect(result.reason).toBe('failed');
  });

  it('runs the hook check for the named paths, with its deadline', async () => {
    const ramify = await cli(JSON.stringify({ schemaVersion: 'ramify.check/1', outcome: 'checked', reason: null, findings: [] }), 0);

    const result = await ramify.checkChanged(['src/one.ts', 'src/two.ts'], directory.path, 2_000);

    expect(result).toMatchObject({ form: 'changed', outcome: 'checked', reason: null });
    expect(await argv()).toEqual(['check', '--changed', 'src/one.ts', 'src/two.ts', '--format', 'json', '--deadline', '2000']);
  });

  it('reads a cold daemon and a named configuration file as not checked, never as a pass', async () => {
    const cold = await (await cli(JSON.stringify({ schemaVersion: 'ramify.check/1', outcome: 'not-checked', reason: 'cold' }), 2))
      .checkChanged(['src/one.ts'], directory.path, 2_000);
    const configuration = await (await cli(JSON.stringify({ schemaVersion: 'ramify.check/1', outcome: 'not-checked', reason: 'configuration-changed' }), 2))
      .checkChanged(['tsconfig.json'], directory.path, 2_000);

    expect(cold).toMatchObject({ outcome: 'not-checked', reason: 'cold' });
    expect(configuration).toMatchObject({ outcome: 'not-checked', reason: 'configuration-changed' });
  });

  it('names the invocation and its exit code where the CLI gave no reason', async () => {
    const ramify = await cli('ramify: the daemon could not be reached', 2);

    const result = await ramify.checkChanged(['src/one.ts'], directory.path, 500);

    expect(result.report).toBeNull();
    expect(result.reason).toContain('--deadline 500');
    expect(result.reason).toContain('exited with 2');
    expect(result.reason).toContain('the daemon could not be reached');
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
