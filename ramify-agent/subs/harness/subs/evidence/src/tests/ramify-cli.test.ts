import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RamifyCli } from '../ramify-cli.js';
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
