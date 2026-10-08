import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { FindingsSeen, runHookCheck } from '../hooks/post-write.js';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) try { await cleanup(); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'native deadline cleanup failed');
});
async function stub(body: string, options: { readonly timeoutMs?: number } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-hook-native-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const executable = join(directory, 'ramify');
  // Replace the shell with its single producer: execFile's timeout then owns sleep itself.
  const ownedPid = join(directory, 'producer.pid');
  await writeFile(executable, `#!/bin/sh\necho $$ > '${ownedPid}'\nexec ${body}\n`);
  cleanups.push(async () => {
    const pid = Number((await readFile(ownedPid, 'utf8')).trim());
    expect(pid, 'owned producer PID was recorded').toBeGreaterThan(0);
    let alive = true;
    try { process.kill(pid, 0); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false; else throw error;
    }
    expect(alive, `owned unanswered producer ${pid} retired by timeout`).toBe(false);
  });
  await chmod(executable, 0o755);
  return { ramify: new RamifyCli({ executable, timeoutMs: options.timeoutMs ?? 30_000 }), root: directory };
}
function request(ramify: RamifyCli, root: string, paths: readonly string[] | null, seen = new FindingsSeen()) {
  return { ramify, projectRoot: root, paths, hookTimeoutMs: 2_000, seen, ran: 0, logFile: (check: number) => join(root, 'hooks', `${check}.json`) };
}
describe('a hook check after a settled mutation', () => {
  test('an executable that never answers within the harness\'s own bound is not checked either', async () => {
    const { ramify, root } = await stub('sleep 30', { timeoutMs: 400 });

    const result = await runHookCheck(request(ramify, root, ['a.ts']));

    expect(result.checks[0]!.outcome).toBe('not-checked');
    expect(result.checks[0]!.reason).toContain('exited with');
    expect(result.checks[0]).toMatchObject({ provider: null, dispositions: [] });
    expect(result.text).toContain('Nothing was verified by this check');
  });

});
