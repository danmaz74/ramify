import { afterEach, describe, expect, test, vi } from 'vitest';
import { architectAnswerSchema, consultationMessageSchema, consultationTool } from '../consultations/tools.js';
import { consultationId, consultationLayout } from '../consultations/records.js';
import { consultationOutcome } from '../consultations/store.js';
import { readSessionPointReference, sessionPointReference } from '../run/session-operations.js';
import { readTranscript, readBody } from '../transcripts/writer.js';
import { runLayout } from '../run/records.js';
import { answer, ask, consultationFixture, retainConsultationExample } from './helpers/consultations.js';
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.useRealTimers(); });

describe('Plan 33 C05-C12 advisory tools', () => {
  test('C05/C08: local and capability exact pinned forks preserve literal strings and current read-only tools, caller resumes', async () => {
    const fixture = await consultationFixture(cleanup, input => input.task.submissionTool === 'answer_architect_consultation'
      ? [{ kind: 'tool', tool: 'submit_work_item_result', input: {} }, { kind: 'tool', tool: 'update_capability_plan', input: {} }, { kind: 'tool', tool: 'write', input: { path: 'unowned.ts', content: 'bad' } }, answer()]
      : [ask(), { kind: 'message', payload: { text: 'Caller resumed ordinary task' } }, { kind: 'submit', input: { ordinary: true } }]);
    for (const source of Object.values(fixture.seeds).filter(target => target.role !== 'global-fork')) {
      const point = readSessionPointReference(source.ref)!.point;
      expect((await fixture.operations.appendContext({ runId: 'R', operationId: `later-${source.role}`, sessionId: point.sessionId, expectedPoint: point,
        additions: [{ key: 'later-update', kind: 'brief', text: 'Later parent update excluded from L0/K0', revision: 'later' }] })).status).toBe('completed');
    }
    const advanced = await Promise.all(Object.values(fixture.seeds).map(seed => fixture.operations.inspect('R', readSessionPointReference(seed.ref)!.point.sessionId)));
    for (const role of ['local-architect', 'capability-architect', 'local-architect', 'capability-architect'] as const) {
      const source = fixture.seeds[role]!;
      const caller = await fixture.caller('engineer', source);
      expect(caller.ended, caller.error).toBe('submitted'); expect(caller.value).toEqual({ ordinary: true });
      const record = consultationOutcome(fixture.run.log, consultationId(caller.id, 'ask'))!;
      expect(record).toMatchObject({ status: 'answered', delivery: 'recorded', accepted: { answer: { text: '  Exact answer\nEvidence.  ' } } });
      const start = fixture.run.log.ledger.replay().flatMap(entry => entry.transaction.records).find(record => record.path === consultationLayout.start(record.id) && record.id === consultationId(caller.id, 'ask'))!.body;
      expect(start).toMatchObject({ target: source, message: { text: '  Exact question\nNew facts.  ' }, request: { entry: expect.any(Number) } });
      const child = fixture.seen.find(input => input.key.operationId === record.child!.invocation)!;
      expect(child.session.parent).toEqual(readSessionPointReference(source.ref)!.point);
      expect(child.session.additions.map(item => item.text)).not.toContain('Later parent update excluded from L0/K0');
      const history = await Promise.all(child.session.transcript.map(entry => fixture.store.getPayload(entry.payloadId).then(bytes => bytes === null ? '' : new TextDecoder().decode(bytes))));
      expect(history.join('\n')).not.toContain('Exact answer');
      expect(child.session.activeTools).toEqual(['read', 'grep', 'ls', 'answer_architect_consultation']);
      expect(child.task.message).toContain('advisory'); expect(child.task.message).toContain('No source snapshot or view refresh');
      expect(child.task.message + child.session.additions.map(item => item.text).join('\n')).toContain('Fixture view may be stale');
      const callerTranscript = await readTranscript(fixture.run.path(runLayout.transcript(caller.session)));
      const delivered = callerTranscript.entries.find(entry => entry.n === record.result!.entry)!;
      expect(delivered).toMatchObject({ type: 'message', role: 'tool-result', callId: 'ask', isError: false });
      expect(callerTranscript.entries.some(entry => entry.type === 'message' && entry.role === 'assistant' && entry.blocks.some(block => block.type === 'text' && block.body.stored === 'inline' && block.body.text === 'Caller resumed ordinary task'))).toBe(true);
      const childTranscript = await readTranscript(fixture.run.path(runLayout.transcript(record.child!.session!)));
      expect(childTranscript.entries.filter(entry => entry.type === 'message' && entry.role === 'tool-result' && entry.isError)).toHaveLength(3);
    }
    const after = await Promise.all(Object.values(fixture.seeds).map(seed => fixture.operations.inspect('R', readSessionPointReference(seed.ref)!.point.sessionId)));
    expect(after).toEqual(advanced);
    await retainConsultationExample(fixture, 'direct-and-capability');
  });
  test('C09: missing source, provider failure and exhausted answer repair are distinct without a fresh substitute', async () => {
    for (const scenario of ['invalid', 'missing', 'provider', 'exhausted'] as const) {
      const fixture = await consultationFixture(cleanup, input => input.task.submissionTool !== 'answer_architect_consultation' ? [ask(), { kind: 'submit', input: {} }]
        : scenario === 'provider' ? [{ kind: 'fail', error: 'Provider explicitly failed' }] : [answer(' '), answer(''), answer('\n')]);
      const original = fixture.seeds['local-architect']!;
      const source = scenario === 'invalid' ? { ...original, run: { ...original.run, runId: 'other' }, ref: sessionPointReference('other', readSessionPointReference(original.ref)!.point) } : original;
      if (scenario === 'missing') fixture.agent.loseSession(readSessionPointReference(source.ref)!.point);
      const caller = await fixture.caller('engineer', source);
      expect(caller.ended, caller.error).toBe('submitted');
      const record = consultationOutcome(fixture.run.log, consultationId(caller.id, 'ask'))!;
      expect(record.status).toBe('failed'); expect(record.accepted).toBeNull();
      expect(record.error!.code).toBe({ invalid: 'invalid-source', missing: 'unavailable-source', provider: 'provider-failure', exhausted: 'answer-exhausted' }[scenario]);
      expect(fixture.run.log.all('invocation-ended').filter(event => event.data.degraded !== undefined)).toHaveLength(0);
      expect(fixture.run.log.all('invocation-started').filter(event => event.data.work.request === record.id)).toHaveLength(scenario === 'invalid' ? 0 : 1);
      expect(fixture.seen.filter(input => input.task.submissionTool === 'answer_architect_consultation')).toHaveLength(scenario === 'missing' || scenario === 'invalid' ? 0 : 1);
      await retainConsultationExample(fixture, `error-${scenario}`);
    }
  });
  test('C09/C12: unrelated fork still uses existing fresh fallback after history loss', async () => {
    const fixture = await consultationFixture(cleanup, [{ kind: 'submit', input: {} }]);
    const source = fixture.seeds['local-architect']!;
    fixture.agent.loseSession(readSessionPointReference(source.ref)!.point);
    const result = await fixture.runner.runInvocation(fixture.run, fixture.agent, { ...fixture.request('local-architect', 'Ordinary fork fallback'), start: { mode: 'fork', from: source.ref }, fork: { from: source.point, reason: 'reconciliation', briefs: [] } });
    expect(result.ended, result.error).toBe('submitted'); expect(result.actual).toBe('fresh');
    expect(fixture.run.log.all('invocation-started')).toHaveLength(5);
  });
  test('C10: already aborted and blank requests dispatch no child and release no unnecessary hold', async () => {
    const fixture = await consultationFixture(cleanup, []);
    const abort = new AbortController(); abort.abort();
    const hold = vi.fn(() => vi.fn());
    const tool = consultationTool({ run: fixture.run, runner: fixture.runner, agent: fixture.agent, packages: fixture.packages, target: fixture.seeds['local-architect']!, global: null,
      caller: { role: 'engineer', session: 'ses-0001', work: {} }, projectRoot: fixture.directory, holdMs: 500, views: [], now: () => new Date() }, {
      invocation: 'caller', observations: {} as never, callId: () => 'abort', reminders: () => [], hold });
    expect((await tool.execute({ message: 'Question' }, abort.signal, 'abort')).isError).toBe(true);
    expect(consultationOutcome(fixture.run.log, consultationId('caller', 'abort'))).toMatchObject({ status: 'cancelled', child: null });
    expect((await tool.execute({ message: ' ' }, new AbortController().signal, 'blank')).isError).toBe(true);
    expect(hold).not.toHaveBeenCalled(); expect(fixture.run.log.all('invocation-started')).toHaveLength(3);
    expect(consultationMessageSchema.safeParse({ message: '  literal\n' }).success).toBe(true); expect(architectAnswerSchema.safeParse({ answer: '\n' }).success).toBe(false);
  });
  test('C11: completed effect replay returns answer without another fork, accepted and observed delivery stay separate', async () => {
    const fixture = await consultationFixture(cleanup, input => input.task.submissionTool === 'answer_architect_consultation' ? [answer()] : [ask('Replay exact', 'same'), ask('Replay exact', 'same'), { kind: 'submit', input: {} }]);
    const caller = await fixture.caller('engineer', fixture.seeds['local-architect']!);
    expect(caller.ended, caller.error).toBe('submitted');
    expect(fixture.run.log.all('consultation-started')).toHaveLength(1);
    expect(fixture.seen.filter(input => input.task.submissionTool === 'answer_architect_consultation')).toHaveLength(1);
    const records = fixture.run.log.ledger.replay().flatMap(entry => entry.transaction.records);
    const first = records.find(record => record.path === consultationLayout.outcome(consultationId(caller.id, 'same')))!.body;
    expect(first).toMatchObject({ status: 'answered', accepted: { answer: { text: expect.any(String) } }, delivery: 'unknown', result: null });
    expect(consultationOutcome(fixture.run.log, consultationId(caller.id, 'same'))).toMatchObject({ delivery: 'recorded' });
    expect(first).not.toHaveProperty('consumed');
    await retainConsultationExample(fixture, 'completed-replay');
  });
});
