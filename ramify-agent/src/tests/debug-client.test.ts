import { expect, test } from 'vitest';
import { parseCommandLine, UsageError, type DebugOptions } from '../cli.js';
import { parseRealSessionOptions } from '../real-session-options.js';
import { runDebugCommand, runAttachedSession, printControlResult } from '../debug-client.js';
import { runSnapshotSchema, type BreakpointState, type RunSnapshot } from '../../subs/harness/src/interfaces/protocol/runs.js';

const at = '2026-10-10T12:00:00.000Z';
const run = runSnapshotSchema.parse({ jobId: 'r1', planId: 'p', agent: 'pi', version: 10, state: 'running', phase: 'working', stopRequested: false,
  startedAt: at, updatedAt: at, endedAt: null, failure: null, current: null, waits: [], counts: { workItems: 1, completedWorkItems: 0,
    openRequirements: 0, invocations: 1, readinessAttempts: 1, gateAttempts: 0, scenarios: { pending: 0, bound: 1, done: 0 }, degradedStarts: 0 },
  writer: { held: null, unsettled: null }, review: 'not-reviewed', notices: [], decisionRequests: { open: 0, waiting: false, workItems: [] },
  planDeviations: { recorded: 0, toReview: 0 }, environmentProblems: [] });
const pause: BreakpointState = { kind: 'breakpoint', planId: 'p', runId: 'r1', pauseId: 'p1', revision: 1, cursor: 10,
  state: 'paused', role: 'engineer', work: { workItem: 'w1' }, goal: 'Build a thing', nextAction: 'execute the task', taskState: 'pending', summary: 'Prepared task awaits resume.' };
const receipt = { commandId: 'c1', jobId: 'r1', sequence: 11, acceptedAt: at };
const base = ['--server', 'http://host:4180', '--plan', 'p', '--run', 'r1'];
function options(action: string, flags: string[] = []): DebugOptions {
  const parsed = parseCommandLine(['debug', action, ...base, ...flags]);
  if (parsed.command !== 'debug') throw new Error('expected debug');
  return parsed.debug;
}
function script(answers: Array<{ path: string; body?: unknown; status?: number; error?: string; verify?: (init: RequestInit | undefined) => void }>) {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    const answer = answers.shift(); expect(answer).toBeDefined(); expect(new URL(url).pathname + new URL(url).search).toBe(answer!.path);
    answer!.verify?.(init);
    if (answer!.error) throw new Error(answer!.error);
    return new Response(JSON.stringify(answer!.body), { status: answer!.status ?? 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch: fetcher, calls, done: () => expect(answers).toEqual([]) };
}
const state = (current: BreakpointState | null, reached: BreakpointState[] = [], cursor = 10, more = false, snapshot: RunSnapshot = run) => ({ run: snapshot, current, reached, cursor, more });

test('B12: attachment arguments require explicit project/plan/break/id and refuse model/owned conflicts', () => {
  const attached = ['--server', 'http://host:4180', '--project', '/project', '--plan', 'p', '--break', 'before-agent:engineer', '--command-id', 'c1', '--json'];
  expect(parseRealSessionOptions(attached)).toMatchObject({ mode: 'attached', attached: { json: true, timeoutMs: 120000 } });
  for (const argv of [attached.concat('--model', 'x/y'), attached.concat('--break', 'other'), ['--break', 'before-agent:engineer'],
    ['--server', 'http://host:4180'], attached.concat('--timeout-ms', '0'), attached.concat('--unknown')]) expect(() => parseRealSessionOptions(argv)).toThrow(UsageError);
  expect(parseRealSessionOptions([])).toEqual({ mode: 'owned', projectRoot: undefined, planId: 'review-notes', model: undefined });
  expect(parseRealSessionOptions(['--project=/copy', '--plan=p', '--model=x/y'])).toMatchObject({ mode: 'owned', model: 'x/y' });
});

test('B13: debug argument contracts have finite waits and reject invalid mutation identities', () => {
  expect(options('wait')).toMatchObject({ timeoutMs: 120000, after: 0 });
  expect(options('resume', ['--pause=p1', '--command-id=c1', '--expected-revision=2', '--message-file=go.txt', '--json'])).toMatchObject({ json: true, expectedRevision: 2 });
  for (const argv of [['debug', 'wait'], ['debug', 'other', ...base], ['debug', 'inspect', ...base], ['debug', 'message', ...base, '--pause=p1'],
    ['debug', 'wait', ...base, '--timeout-ms=0'], ['debug', 'wait', ...base, '--after=-1'], ['debug', 'wait', ...base, '--model=x/y'],
    ['debug', 'wait', ...base, '--server=http://other']]) expect(() => parseCommandLine(argv)).toThrow(UsageError);
});

test('B12: canonical match starts attached run and returns pause without owning a process', async () => {
  const s = script([{ path: '/api/v1/project', body: { protocolVersion: 1, project: { name: 'project', root: '/canonical', planPattern: 'plans/<plan-id>/plan.md' } } },
    { path: '/api/v1/commands', body: { receipt }, status: 202, verify: init => expect(JSON.parse(String(init!.body))).toMatchObject({ commandId: 'c1', payload: { planId: 'p', breakpoint: 'before-agent:engineer', agent: 'pi' } }) },
    { path: '/api/v1/plans/p/runs/r1/debug?after=0', body: state(pause, [pause]) }]);
  const result = await runAttachedSession({ server: 'http://host:4180', projectRoot: '/alias', planId: 'p', commandId: 'c1', breakpoint: 'before-agent:engineer', timeoutMs: 1000, json: true },
    { ...s, canonical: async () => '/canonical' });
  expect(result).toMatchObject({ exitStatus: 0, output: { kind: 'breakpoint', pauseId: 'p1', current: pause, receipt } }); s.done();
});

test('B12: project mismatch refuses before command admission', async () => {
  const s = script([{ path: '/api/v1/project', body: { protocolVersion: 1, project: { name: 'project', root: '/other', planPattern: 'plans/<plan-id>/plan.md' } } }]);
  expect(await runAttachedSession({ server: 'http://host:4180', projectRoot: '/project', planId: 'p', commandId: 'c1', breakpoint: 'before-agent:engineer', timeoutMs: 1000, json: true },
    { ...s, canonical: async path => path })).toMatchObject({ exitStatus: 2, output: { error: { message: expect.stringContaining('Project mismatch') }, uncertain: false } }); s.done();
});

test('B13: wait drains retained pages and reports historical pause beside current later occurrence', async () => {
  const current = { ...pause, pauseId: 'p2', revision: 3, cursor: 30, summary: 'Later task' };
  const s = script([{ path: '/api/v1/plans/p/runs/r1/debug?after=5', body: state(current, [], 9, true) },
    { path: '/api/v1/plans/p/runs/r1/debug?after=9', body: state(current, [pause], 20, true) },
    { path: '/api/v1/plans/p/runs/r1/debug?after=20', body: state(current, [], 30, false) }]);
  const result = await runDebugCommand(options('wait', ['--after=5']), { ...s, sleep: async () => { throw new Error('must drain before sleeping'); } });
  expect(result).toMatchObject({ exitStatus: 0, output: { pauseId: 'p1', revision: 1, cursor: 30, current, currentSummary: 'Later task' } }); s.done();
});

test('B11/B13: lost reply preserves identity and identical retry fetches retained exchange with actual verdict', async () => {
  const command = options('message', ['--pause=p1', '--expected-revision=1', '--command-id=c1', '--message-file=q.txt']);
  const lost = script([{ path: '/api/v1/commands', error: 'lost response' }]);
  expect(await runDebugCommand(command, { ...lost, readText: async () => 'Explain.\n' })).toMatchObject({ exitStatus: 2, output: { commandId: 'c1', pauseId: 'p1', revision: 1, uncertain: true } }); lost.done();
  const exchange = { ...pause, kind: 'exchange', commandId: 'c1', revision: 2, status: 'settled', answer: 'Answer', invocation: 'inv-1', session: 's1', point: 'point1',
    outcome: 'submission-rejected', error: 'real rejection', continuityLoss: null, verdicts: [{ accepted: false, answer: 'Needs evidence' }], evidence: ['sessions/s1/transcript.jsonl'] };
  const current = { ...pause, pauseId: 'p2', summary: 'New occurrence' };
  const s = script([{ path: '/api/v1/commands', status: 202, body: { receipt }, verify: init => expect(JSON.parse(String(init!.body)).payload.message).toBe('Explain.\n') },
    { path: '/api/v1/plans/p/runs/r1/debug/exchanges/c1', body: { run, current, exchange } }]);
  expect(await runDebugCommand(command, { ...s, readText: async () => 'Explain.\n' })).toMatchObject({ exitStatus: 0, output: { kind: 'exchange', answer: 'Answer', verdicts: exchange.verdicts, current, receipt } }); s.done();
});

test('B13: resume acknowledges admission immediately with current interaction and no polling', async () => {
  const s = script([{ path: '/api/v1/commands', body: { receipt }, status: 202 }, { path: '/api/v1/plans/p/runs/r1/debug?after=0', body: state(null) }]);
  expect(await runDebugCommand(options('resume', ['--pause=p1', '--expected-revision=1', '--command-id=c1']), s)).toMatchObject({ exitStatus: 0, output: { kind: 'resumed', receipt, current: null } }); s.done();
});

test('B13: finite wait timeout returns last cursor and terminal failure uses exit one', async () => {
  let now = 0;
  const s = script([{ path: '/api/v1/plans/p/runs/r1/debug?after=0', body: state(null, [], 42) }]);
  expect(await runDebugCommand(options('wait', ['--timeout-ms=10']), { ...s, now: () => now, sleep: async ms => { now += ms; } })).toMatchObject({ exitStatus: 2, output: { runId: 'r1', cursor: 42, error: { code: 'timeout' }, uncertain: true } }); s.done();
  const stopped = { ...run, state: 'stopped' as const };
  const terminal = script([{ path: '/api/v1/plans/p/runs/r1/debug?after=0', body: state(null, [], 42, false, stopped) }]);
  expect(await runDebugCommand(options('wait'), terminal)).toMatchObject({ exitStatus: 1, output: { kind: 'terminal', run: { state: 'stopped' } } }); terminal.done();
});

test('B13: refusal and transport diagnostics leave JSON stdout exactly one object', async () => {
  const s = script([{ path: '/api/v1/commands', status: 409, body: { error: { code: 'conflict', message: 'Stale pause' } } }]);
  const result = await runDebugCommand(options('resume', ['--pause=p1', '--expected-revision=1', '--command-id=c1']), s);
  const stdout: string[] = [], stderr: string[] = [];
  printControlResult(result, true, { stdout: text => stdout.push(text), stderr: text => stderr.push(text) });
  expect(stdout).toHaveLength(1); expect(JSON.parse(stdout[0]!)).toMatchObject({ error: { code: 'conflict' }, uncertain: false }); expect(stderr).toEqual(['Stale pause\n']); s.done();
});
