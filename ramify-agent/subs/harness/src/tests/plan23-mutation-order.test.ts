import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { FindingsSeen, openFindingsMessage, runHookCheck, type HookCheckReservation } from '../hooks/post-write.js';
import { changesBetween, MutationOrder, type MutationChange, type MutationSnapshot } from '../hooks/mutation-order.js';
import { createShellTool } from '../tools/shell.js';
import { ScriptedCli } from '../../subs/evidence/src/tests/helpers/scripted-cli.js';
import type { CommandRun, CommandRunner } from '../../subs/evidence/src/run-command.js';
import { changedDocument } from './helpers/check-payloads.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'plan23-mutation-'));
  cleanups.push(() => rm(root, { recursive: true, force: true })); return root;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve };
}
function finding(id: string, message = 'not exposed'): Record<string, unknown> {
  return { id, category: 'import', code: 'denied-access', message,
    location: { file: 'src/a.ts', start: 0, end: 1, line: 1, column: 1 }, importer: null, original: null };
}
function declareChanged(cli: ScriptedCli, root: string, document: Record<string, unknown>, code: number) {
  cli.declare({ cwd: root, argv: ['check', '--changed', 'src/a.ts', '--format', 'json', '--deadline', '2000'],
    result: { code, stdout: JSON.stringify(document), stderr: '' } });
}
function completeDocument(root: string, execution = 'completed', diagnostics: readonly Record<string, unknown>[] = []) {
  return { schemaVersion: 'ramify.analysis/3', runId: 'run', inputId: 'input/1:fixture',
    request: { project: { cwd: root, root, configuration: 'discover', scope: 'whole-project' } },
    scope: null, registry: null, capabilities: [], stages: [],
    outcome: { execution, check: execution === 'completed' && diagnostics.length === 0 ? 'passed' : 'failed', coverage: execution === 'completed' ? 'complete' : 'partial' },
    snapshot: null, diagnostics: diagnostics.map(item => ({ related: [], accessId: null, ...item })), warnings: [], coverage: [], summary: {} };
}
function declareComplete(cli: ScriptedCli, root: string, document: unknown, code: number) {
  cli.declare({ cwd: root, argv: ['check', '--batch', '--root', root, '--format', 'json', '--no-snapshot'],
    result: { code, stdout: JSON.stringify(document), stderr: '' } });
}
function options(cli: ScriptedCli, root: string, seen = new FindingsSeen()) {
  return { ramify: cli, projectRoot: root, seen, ran: 0, hookTimeoutMs: 2000,
    logFile: (number: number) => join(root, 'output', `check-${number}.json`) };
}
function commandResult(exitCode = 0): CommandRun {
  return { outcome: { kind: 'completed', exitCode }, startedAt: '2026-10-08T00:00:00.000Z', elapsedMs: 10,
    output: { path: null, bytes: 0, truncated: false, tail: '' }, stdout: '', stderr: '' };
}
function inventory(files: Readonly<Record<string, string>>, scopeIdentity = 'project-content/1'): MutationSnapshot {
  return { kind: 'complete', scopeIdentity, files: { ...files } };
}

describe('Plan 23 observed mutation checks', () => {
  test('H01: unchanged/refused mutations run no check and clear no standing findings', async () => {
    const root = await workspace(); const cli = new ScriptedCli(); const seen = new FindingsSeen();
    seen.settle({ covered: [] }, [{ identity: 'standing', category: 'import', code: 'denied', message: 'standing', file: 'src/a.ts', line: 1, importer: null, original: null }]);
    for (const change of [{ kind: 'known', paths: [] }, { kind: 'refused', reason: 'not permitted' }] as const)
      expect(await runHookCheck({ ...options(cli, root, seen), change })).toEqual({ checks: [], gaps: [], text: null });
    expect(await runHookCheck({ ...options(cli, root, seen), paths: [] })).toEqual({ checks: [], gaps: [], text: null });
    expect(cli.calls).toEqual([]); expect(seen.open().map(item => item.identity)).toEqual(['standing']); cli.assertComplete();
  });
  test('H01/H03: unknown changes retain a complete check; completion independently checks after an empty mutation', async () => {
    const root = await workspace(); const cli = new ScriptedCli(); const seen = new FindingsSeen();
    declareComplete(cli, root, completeDocument(root), 0); declareComplete(cli, root, completeDocument(root), 0);
    const unknown = await runHookCheck({ ...options(cli, root, seen), change: { kind: 'unknown', reason: 'no inventory' } });
    expect(unknown.checks.map(check => [check.mode, check.outcome])).toEqual([['changed', 'not-checked'], ['complete', 'passed']]);
    expect(unknown.gaps.map(gap => gap.kind)).toEqual(['changed-paths-unknown']);
    expect((await runHookCheck({ ...options(cli, root, seen), paths: [] })).checks).toEqual([]);
    const completion = await runHookCheck({ ...options(cli, root, seen), paths: [], purpose: 'completion' });
    expect(completion.checks.map(check => [check.mode, check.outcome])).toEqual([['complete', 'passed']]);
    expect(completion.gaps).toEqual([]); expect(cli.calls).toHaveLength(2); cli.assertComplete();
  });
  test('H01: only comparable complete inventories prove no change; added/deleted/edited files remain changes', () => {
    expect(changesBetween(inventory({ a: 'same' }), inventory({ a: 'same' }))).toEqual({ kind: 'known', paths: [] });
    expect(changesBetween(inventory({ a: 'old', removed: 'hash' }), inventory({ a: 'new', added: 'hash' })))
      .toEqual({ kind: 'known', paths: ['a', 'added', 'removed'] });
    expect(changesBetween(inventory({}), inventory({}, 'different'))).toEqual({ kind: 'unknown', reason: 'mutation snapshot scopes differ' });
    expect(changesBetween({ kind: 'unknown', reason: 'partial' }, inventory({}))).toEqual({ kind: 'unknown', reason: 'partial' });
    expect(changesBetween(inventory({}), { kind: 'unknown', reason: 'missing' })).toEqual({ kind: 'unknown', reason: 'missing' });
  });
  test.each([{ diagnostics: [] }, { diagnostics: [finding('genuine', 'genuine partial finding')] }])('H03: incomplete changed check retains actual diagnostics and cannot clear earlier findings ($diagnostics)', async ({ diagnostics }) => {
    const root = await workspace(); const cli = new ScriptedCli(); const seen = new FindingsSeen();
    declareChanged(cli, root, changedDocument(root, ['src/a.ts'], [finding('old')]), 1);
    await runHookCheck({ ...options(cli, root, seen), paths: ['src/a.ts'] });
    declareChanged(cli, root, changedDocument(root, ['src/a.ts'], diagnostics, { execution: 'incomplete', removed: ['old'] }), 1);
    const partial = await runHookCheck({ ...options(cli, root, seen), paths: ['src/a.ts'] });
    expect(partial.checks[0]).toMatchObject({ outcome: 'not-checked', reason: 'incomplete', newFindings: diagnostics.length });
    expect(seen.open().map(item => item.identity)).toEqual(diagnostics.length ? ['old', 'genuine'] : ['old']);
    expect(partial.text).toContain('not a pass'); expect(partial.text).not.toContain('Cleared:');
    if (diagnostics.length === 0) expect(partial.text).not.toContain('MODULE VIOLATION'); else expect(partial.text).toContain('genuine partial finding');
    cli.assertComplete();
  });
  test('H03: incomplete complete-check findings survive without a passing project verdict', async () => {
    const root = await workspace(); const cli = new ScriptedCli();
    declareComplete(cli, root, completeDocument(root, 'incomplete', [finding('genuine')]), 1);
    const result = await runHookCheck({ ...options(cli, root), paths: null });
    expect(result.checks[1]).toMatchObject({ outcome: 'not-checked', reason: 'incomplete', newFindings: 1 });
    expect(result.text).toContain('not exposed'); expect(result.text).toContain('not a pass'); cli.assertComplete();
  });
  test('H03: changed-input command failure creates neither a fake module violation nor a pass', async () => {
    const root = await workspace(); const cli = new ScriptedCli();
    declareChanged(cli, root, { schemaVersion: 'ramify.cli/1', status: 'unavailable', reason: 'changed-input', exitCode: 2 }, 2);
    const result = await runHookCheck({ ...options(cli, root), paths: ['src/a.ts'] });
    expect(result.checks[0]).toMatchObject({ outcome: 'not-checked', reason: 'changed-input', newFindings: 0 });
    expect(result.text).toContain('not a pass'); expect(result.text).not.toContain('MODULE VIOLATION'); cli.assertComplete();
  });
  test('H03: cancellation during a checker retains standing findings even if the checker later returns a pass', async () => {
    const root = await workspace(); const cli = new ScriptedCli(); const seen = new FindingsSeen(); const entered = deferred(); const finish = deferred();
    seen.settle({ covered: [] }, [{ identity: 'standing', category: 'import', code: 'denied', message: 'standing', file: 'src/a.ts', line: 1, importer: null, original: null }]);
    declareChanged(cli, root, changedDocument(root, ['src/a.ts'], [], { removed: ['standing'] }), 0);
    const original = cli.run.bind(cli);
    vi.spyOn(cli, 'run').mockImplementation(async (argv, cwd, signal) => { const result = await original(argv, cwd, signal); entered.resolve(); await finish.promise; return result; });
    const controller = new AbortController();
    const pending = runHookCheck({ ...options(cli, root, seen), paths: ['src/a.ts'], signal: controller.signal });
    await entered.promise; controller.abort(); finish.resolve(); const result = await pending;
    expect(result.checks[0]).toMatchObject({ outcome: 'not-checked', reason: 'stopped' });
    expect(seen.open().map(item => item.identity)).toEqual(['standing']); expect(result.text).toContain('not a pass'); cli.assertComplete();
  });
  test('H04: new/repeated/completion findings name only the current capability-role legal outcomes', async () => {
    const root = await workspace(); const cli = new ScriptedCli(); const seen = new FindingsSeen();
    const submissions = { legalOutcomes: ['completion-proposed', 'partial', 'unsuitable', 'capability-needed'], completionOutcome: 'completion-proposed' };
    declareChanged(cli, root, changedDocument(root, ['src/a.ts'], [finding('capability')]), 1);
    declareChanged(cli, root, changedDocument(root, ['src/a.ts'], [finding('capability')]), 1);
    const first = await runHookCheck({ ...options(cli, root, seen), paths: ['src/a.ts'], submissions });
    const repeated = await runHookCheck({ ...options(cli, root, seen), paths: ['src/a.ts'], submissions });
    for (const text of [first.text, repeated.text, openFindingsMessage(seen.open(), submissions)]) {
      expect(text).toContain('`capability-needed`'); expect(text).toContain('`partial`');
      expect(text).toContain('`completion-proposed` is refused'); expect(text).not.toContain('contract-needed');
    } cli.assertComplete();
  });
});

describe('Plan 23 mutation and check ordering', () => {
  test('H02: overlapping shell calls reserve logs before awaits and serialize mutation, check and settlement', async () => {
    const root = await workspace(); const cli = new ScriptedCli(); const order = new MutationOrder(); const seen = new FindingsSeen();
    const firstCheck = deferred(); const secondCheck = deferred(); const thirdCheck = deferred(); const started = deferred(); const bReserved = deferred(); const cReserved = deferred();
    thirdCheck.resolve(); secondCheck.resolve(); // Reversed readiness cannot overtake A.
    const trace: string[] = []; let checks = 0; const original = cli.run.bind(cli);
    vi.spyOn(cli, 'run').mockImplementation(async (argv, cwd, signal) => {
      const reply = await original(argv, cwd, signal); const index = ++checks; trace.push(`check-${index}-start`);
      if (index === 1) started.resolve(); await [firstCheck, secondCheck, thirdCheck][index - 1]!.promise;
      trace.push(`check-${index}-end`); return reply;
    });
    declareChanged(cli, root, changedDocument(root, ['src/a.ts']), 0);
    declareChanged(cli, root, changedDocument(root, ['src/a.ts'], [finding('newer')]), 1);
    declareChanged(cli, root, changedDocument(root, ['src/a.ts'], [finding('newer')]), 1);
    const files = { 'src/a.ts': 'base' }; const reservations = new Map<number, HookCheckReservation>(); const numbers: number[] = [];
    const runner: CommandRunner = async request => { const name = request.argv[2]!; trace.push(`mutate-${name}`); files['src/a.ts'] = name; return commandResult(); };
    const shell = createShellTool({ commandExecution: runner, workingDirectory: join(root, 'src'), judge: async () => ({ ok: true }),
      outputFile: call => join(root, 'output', `shell-${call}.log`), starting: async () => {}, ended: async () => {},
      mutation: { worktree: root, order, reserve: call => { const r = seen.reserveCheck(); reservations.set(call.call, r); numbers.push(r.number); if (call.call === 2) bReserved.resolve(); if (call.call === 3) cReserved.resolve(); },
        snapshot: async () => inventory(files), settled: async (call, _result, change, lease) => {
          const hook = await runHookCheck({ ...options(cli, root, seen), change, lease, reservation: reservations.get(call.call) });
          trace.push(`settled-${call.call}`); return hook.text === null ? null : { text: hook.text };
        } } });
    const signal = new AbortController().signal;
    const a = shell.definition.execute({ command: 'A' }, signal); await started.promise;
    const b = shell.definition.execute({ command: 'B' }, signal); await bReserved.promise;
    const c = shell.definition.execute({ command: 'C' }, signal); await cReserved.promise;
    expect(numbers).toEqual([1, 2, 3]); expect(trace).toEqual(['mutate-A', 'check-1-start']);
    await order.run(join(root, 'other-worktree'), async () => { trace.push('independent'); });
    expect(trace).toEqual(['mutate-A', 'check-1-start', 'independent']); firstCheck.resolve();
    const results = await Promise.all([a, b, c]);
    expect(trace).toEqual(['mutate-A', 'check-1-start', 'independent', 'check-1-end', 'settled-1', 'mutate-B', 'check-2-start', 'check-2-end', 'settled-2', 'mutate-C', 'check-3-start', 'check-3-end', 'settled-3']);
    expect(seen.open().map(item => item.identity)).toEqual(['newer']); expect(results[1]!.text).toContain('not exposed'); expect(results[2]!.text).toContain('still standing');
    for (const number of [1, 2, 3]) expect(await readFile(join(root, 'output', `check-${number}.json`), 'utf8')).toContain('ramify.check/3');
    cli.assertComplete(); await shell.settle();
  });
  test('H02: concurrent direct checks cannot settle findings out of order or overwrite logs with stale ran', async () => {
    const root = await workspace(); const cli = new ScriptedCli(); const seen = new FindingsSeen(); const started = deferred(); const wait = deferred(); const logs: number[] = [];
    const original = cli.run.bind(cli); let calls = 0;
    vi.spyOn(cli, 'run').mockImplementation(async (argv, cwd, signal) => { const reply = await original(argv, cwd, signal); if (++calls === 1) { started.resolve(); await wait.promise; } return reply; });
    declareChanged(cli, root, changedDocument(root, ['src/a.ts']), 0); declareChanged(cli, root, changedDocument(root, ['src/a.ts'], [finding('latest')]), 1);
    const input = { ...options(cli, root, seen), paths: ['src/a.ts'], logFile: (number: number) => { logs.push(number); return join(root, 'output', `${number}.json`); } };
    const a = runHookCheck(input); const b = runHookCheck(input); await started.promise; expect(calls).toBe(1); expect(logs).toEqual([1]);
    wait.resolve(); await Promise.all([a, b]); expect(logs).toEqual([1, 2]); expect(seen.open().map(item => item.identity)).toEqual(['latest']); cli.assertComplete();
  });
  test('H02: reserved check IDs are invocation-bound and consumed once', async () => {
    const root = await workspace(); const cli = new ScriptedCli(); const seen = new FindingsSeen(); const reservation = seen.reserveCheck();
    declareChanged(cli, root, changedDocument(root, ['src/a.ts']), 0); await runHookCheck({ ...options(cli, root, seen), paths: ['src/a.ts'], reservation });
    await expect(runHookCheck({ ...options(cli, root, seen), paths: ['src/a.ts'], reservation })).rejects.toThrow('already consumed');
    await expect(runHookCheck({ ...options(cli, root, seen), paths: ['src/a.ts'], reservation: new FindingsSeen().reserveCheck() })).rejects.toThrow('foreign'); cli.assertComplete();
  });
  test('H02: denied guards, thrown handlers and cancelled queue entries release without executing cancelled work', async () => {
    const root = await workspace(); const order = new MutationOrder(); const lease = await order.acquire(root); lease.assertHeld(root);
    const controller = new AbortController(); let executed = false;
    const cancelled = order.run(root, async () => { executed = true; }, controller.signal); const assertion = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await assertion; expect(executed).toBe(false); lease.release(); lease.release();
    expect(() => lease.assertHeld(root)).toThrow('not held');
    await expect(order.run(root, async () => { throw new Error('handler failed'); })).rejects.toThrow('handler failed');
    expect(await order.run(root, async () => 'after failure')).toBe('after failure');
  });
  test('H02: a borrowed lease must be held for the checked worktree', async () => {
    const root = await workspace(); const cli = new ScriptedCli(); const order = new MutationOrder(); const lease = await order.acquire(root);
    await expect(runHookCheck({ ...options(cli, join(root, 'other')), paths: ['src/a.ts'], lease })).rejects.toThrow('not held'); lease.release();
    await expect(runHookCheck({ ...options(cli, root), paths: ['src/a.ts'], lease })).rejects.toThrow('not held'); expect(cli.calls).toEqual([]); cli.assertComplete();
  });
});

describe('Plan 23 shell mutation settlement', () => {
  test.each([0, 7])('H01: actual changes are checked even with command exit %i', async exitCode => {
    const root = await workspace(); const cli = new ScriptedCli(); const files = { 'src/a.ts': 'before' }; const observed: MutationChange[] = [];
    declareChanged(cli, root, changedDocument(root, ['src/a.ts']), 0);
    const shell = createShellTool({ workingDirectory: root, judge: async () => ({ ok: true }), outputFile: n => join(root, 'output', `${n}.log`), starting: async () => {}, ended: async () => {},
      commandExecution: async () => { files['src/a.ts'] = 'after'; return commandResult(exitCode); },
      mutation: { worktree: root, snapshot: async () => inventory(files), settled: async (_call, result, change, lease) => {
        observed.push(change); expect(result.exitCode).toBe(exitCode); await runHookCheck({ ...options(cli, root), change, lease }); return null;
      } } });
    const result = await shell.definition.execute({ command: 'scripted-change' }, new AbortController().signal);
    expect(result.isError).toBe(exitCode !== 0); expect(observed).toEqual([{ kind: 'known', paths: ['src/a.ts'] }]); expect(cli.calls).toHaveLength(1); cli.assertComplete(); await shell.settle();
  });
  test('H01: unchanged snapshots skip checks while unavailable observations retain a complete check', async () => {
    const root = await workspace(); const cli = new ScriptedCli(); let missing = false;
    const shell = createShellTool({ workingDirectory: root, judge: async () => ({ ok: true }), outputFile: n => join(root, 'output', `${n}.log`), starting: async () => {}, ended: async () => {}, commandExecution: async () => commandResult(),
      mutation: { worktree: root, snapshot: async () => { if (missing) throw new Error('cannot inventory'); return inventory({ 'src/a.ts': 'same' }); }, settled: async (_call, _result, change, lease) => { await runHookCheck({ ...options(cli, root), change, lease }); return null; } } });
    await shell.definition.execute({ command: 'unchanged' }, new AbortController().signal); expect(cli.calls).toEqual([]);
    missing = true; declareComplete(cli, root, completeDocument(root), 0); await shell.definition.execute({ command: 'unknown' }, new AbortController().signal); expect(cli.calls).toHaveLength(1); cli.assertComplete(); await shell.settle();
  });
  test('H01: refusal reaches no snapshots, command executor or check settlement', async () => {
    const root = await workspace(); const phases: string[] = [];
    const shell = createShellTool({ workingDirectory: root, judge: async () => ({ ok: false, text: 'input refused' }), outputFile: n => join(root, 'output', `${n}.log`), starting: async () => {}, ended: async () => {},
      commandExecution: async () => { phases.push('command'); return commandResult(); }, mutation: { worktree: root, snapshot: async () => { phases.push('snapshot'); return inventory({}); }, settled: async () => { phases.push('check'); return null; } } });
    expect((await shell.definition.execute({ command: 'mutate' }, new AbortController().signal)).text).toBe('input refused'); expect(phases).toEqual([]); expect(shell.calls).toBe(0); await shell.settle();
  });
  test('H01/H02: executor rejection after mutation retains unknown-effect evidence and checks before releasing the lease', async () => {
    const root = await workspace(); const cli = new ScriptedCli(); const error = new Error('executor lost completion'); const files = { 'src/a.ts': 'before' }; const trace: string[] = []; const order = new MutationOrder();
    declareComplete(cli, root, completeDocument(root), 0);
    const shell = createShellTool({ workingDirectory: root, judge: async () => ({ ok: true }), outputFile: n => join(root, 'output', `${n}.log`), starting: async () => {}, ended: async (_call, result) => { expect(result.outcome).toMatchObject({ kind: 'runner-error', error: { kind: 'executor-rejected', message: error.message } }); },
      commandExecution: async () => { files['src/a.ts'] = 'changed'; trace.push('changed'); throw error; }, mutation: { worktree: root, order, snapshot: async () => inventory(files), settled: async (_call, _result, change, lease) => {
        expect(change.kind).toBe('unknown'); await runHookCheck({ ...options(cli, root), change, lease }); trace.push('checked'); return null;
      } } });
    await expect(shell.definition.execute({ command: 'reject-after-change' }, new AbortController().signal)).rejects.toBe(error);
    await order.run(root, async () => { trace.push('released'); }); expect(trace).toEqual(['changed', 'checked', 'released']); cli.assertComplete(); await shell.settle();
  });
  test('H02/H03: Stop aborts queued commands, waits through settlement and leaves cancelled checks not-checked', async () => {
    const root = await workspace(); const cli = new ScriptedCli(); const entered = deferred(); const finish = deferred(); const queuedReserved = deferred(); const order = new MutationOrder(); const phases: string[] = [];
    const shell = createShellTool({ workingDirectory: root, judge: async () => ({ ok: true }), outputFile: n => join(root, 'output', `${n}.log`), starting: async () => {}, ended: async () => {},
      commandExecution: async request => { phases.push(request.argv[2]!); return { ...commandResult(), outcome: { kind: 'cancelled' } }; }, mutation: { worktree: root, order, reserve: call => { if (call.call === 2) queuedReserved.resolve(); }, snapshot: async () => inventory({}), settled: async (_call, _result, change, lease, signal) => {
        expect(change.kind).toBe('unknown'); entered.resolve(); await finish.promise;
        const hook = await runHookCheck({ ...options(cli, root), change, lease, signal }); expect(hook.checks[0]).toMatchObject({ outcome: 'not-checked', reason: 'stopped' }); phases.push('check-settled'); return null;
      } } });
    const first = shell.definition.execute({ command: 'first' }, new AbortController().signal); await entered.promise;
    const queued = shell.definition.execute({ command: 'queued' }, new AbortController().signal); const rejection = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    await queuedReserved.promise; let settled = false; const stop = shell.settle().then(() => { settled = true; }); await rejection;
    expect(settled).toBe(false); expect(phases).toEqual(['first']); finish.resolve(); await first; await stop;
    expect(phases).toEqual(['first', 'check-settled']); expect((await shell.definition.execute({ command: 'late' }, new AbortController().signal)).isError).toBe(true);
    expect(phases).toEqual(['first', 'check-settled']); expect(cli.calls).toEqual([]); cli.assertComplete(); expect(await order.run(root, async () => 'released')).toBe('released');
  });
  test('H02: failed executor and failed observation preserve both errors, settle once and release the queue', async () => {
    const root = await workspace(); const order = new MutationOrder(); const original = new Error('executor rejected'); const observation = new Error('observation rejected'); const phases: string[] = [];
    const shell = createShellTool({ workingDirectory: root, judge: async () => ({ ok: true }), outputFile: n => join(root, 'output', `${n}.log`), starting: async () => {},
      ended: async () => { phases.push('ended'); throw observation; }, commandExecution: async () => { throw original; },
      mutation: { worktree: root, order, snapshot: async () => inventory({}), settled: async (_call, _result, change, lease) => { lease.assertHeld(root); expect(change.kind).toBe('unknown'); phases.push('settled'); return null; } } });
    const rejected = await shell.definition.execute({ command: 'reject' }, new AbortController().signal).catch(error => error as unknown);
    expect(rejected).toBeInstanceOf(AggregateError); expect((rejected as AggregateError).cause).toBe(original); expect((rejected as AggregateError).errors).toEqual([original, observation]);
    await order.run(root, async () => { phases.push('released'); }); expect(phases).toEqual(['ended', 'settled', 'released']); await shell.settle();
  });
  test('H02: Stop during input judgment fences a late command', async () => {
    const root = await workspace(); const judged = deferred(); let commands = 0;
    const shell = createShellTool({ workingDirectory: root, judge: async () => { await judged.promise; return { ok: true }; }, outputFile: n => join(root, 'output', `${n}.log`), starting: async () => {}, ended: async () => {}, commandExecution: async () => { commands++; return commandResult(); } });
    const pending = shell.definition.execute({ command: 'late' }, new AbortController().signal); await shell.settle(); judged.resolve(); expect((await pending).isError).toBe(true); expect(commands).toBe(0);
  });
});
