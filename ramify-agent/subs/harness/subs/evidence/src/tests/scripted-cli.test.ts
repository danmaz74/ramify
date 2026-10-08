import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ScriptedCli } from './helpers/scripted-cli.js';
import { spawnAttempts } from '../../../../src/tests/helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('../../../../src/tests/helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
afterEach(() => expect(spawnAttempts(), 'strict CLI controls start no process').toEqual([]));
const root = '/independently-declared-project';
const argv = ['check', '--batch', '--root', root, '--format', 'json', '--no-snapshot'];
const reply = { argv, cwd: root, result: { code: 2, stdout: '', stderr: 'declared provider unavailable' } };

describe('finite raw CLI replies', () => {
  test('the real complete decoder preserves the independently stated stderr and exit', async () => {
    const cli = new ScriptedCli(); cli.declare(reply);
    const result = await cli.checkComplete(root);
    expect(result.exitCode).toBe(2); expect(result.stderr).toBe(reply.result.stderr);
    expect(result.reason).toContain('declared provider unavailable'); cli.assertComplete();
  });
  test('an unknown operation fails even when its refusal is caught', async () => {
    const cli = new ScriptedCli();
    await expect(cli.run(['invented'], root)).rejects.toThrow('no unconsumed');
    expect(() => cli.assertComplete()).toThrow('persistent caught CLI refusals');
  });
  test('wrong argv fails and its reply remains unconsumed', async () => {
    const cli = new ScriptedCli(); cli.declare(reply);
    await expect(cli.run(['check', '--changed', 'foreign.ts'], root)).rejects.toThrow('declared CLI argv');
    expect(() => cli.assertComplete()).toThrow('persistent caught CLI refusals');
  });
  test('wrong cwd cannot decode a reply for another project', async () => {
    const cli = new ScriptedCli(); cli.declare(reply);
    await expect(cli.run(argv, '/other')).rejects.toThrow('declared CLI cwd');
    expect(() => cli.assertComplete()).toThrow('persistent caught CLI refusals');
  });
  test('a consumed reply cannot silently repeat', async () => {
    const cli = new ScriptedCli(); cli.declare(reply); await cli.run(argv, root);
    await expect(cli.run(argv, root)).rejects.toThrow('no unconsumed');
    expect(() => cli.assertComplete()).toThrow('persistent caught CLI refusals');
  });
  test('an unused required reply fails completion', () => {
    const cli = new ScriptedCli(); cli.declare(reply);
    expect(() => cli.assertComplete()).toThrow('required reply');
  });
  test('an explicitly repeated reply exhausts at exactly its declared count', async () => {
    const cli = new ScriptedCli(); cli.declare({ ...reply, times: 2 });
    await cli.run(argv, root); expect(() => cli.assertComplete()).toThrow('required reply');
    await cli.run(argv, root); cli.assertComplete();
  });
});
