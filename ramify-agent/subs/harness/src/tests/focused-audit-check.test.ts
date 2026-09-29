import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { runFocusedCheck } from '../../subs/audit/src/focused-check.js';
import { checkCommand } from '../checks/records.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

it('uses the provider dispatch for a dirty focused failure and reports unknown counts explicitly', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ramify-focused-provider-'));
  directories.push(cwd);
  const result = await runFocusedCheck(checkCommand({ argv: [process.execPath, '-e', 'process.stderr.write("two failures\\n"); process.exit(2)'], cwd, timeoutMs: 10_000 }), new AbortController().signal);
  expect(result).toMatchObject({ outcome: 'failed', notVerified: null, exitCode: 2 });
  expect(result.diagnostics).toContain('Counts: unknown');
  expect(result.diagnostics).toContain('two failures');
});
