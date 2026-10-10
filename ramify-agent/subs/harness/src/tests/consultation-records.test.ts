import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { consultationId, consultationLayout, type ConsultationOutcome, type ConsultationStart } from '../consultations/records.js';
import { consultationOutcome, recordConsultationDelivery, recordConsultationOutcome, recordConsultationStart } from '../consultations/store.js';
import { RunLog } from '../run/log.js';
import { sessionPointReference } from '../run/session-operations.js';
import { ContentStore } from '../transcripts/store.js';
import { temporaryDirectory } from './helpers/fixture.js';
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const now = '2026-10-10T10:00:00.000Z';
async function fixture() {
  const directory = await temporaryDirectory(); cleanup.push(directory.remove);
  const path = join(directory.path, 'events.jsonl'); const log = await RunLog.open(path, 'R');
  const content = new ContentStore(join(directory.path, 'blobs'));
  const stored = await content.put('Exact question\nwith useful context.');
  const start: ConsultationStart = { schema: 'ramify-agent.consultation-start/1', id: consultationId('inv-1', 'tool-1'),
    caller: { invocation: 'inv-1', toolCall: 'tool-1', session: 'ses-0001', role: 'engineer', work: { workItem: 'wi-001', iteration: 'wi-001.i01' } }, parent: null,
    target: { role: 'local-architect', run: { planId: 'P', runId: 'R' }, session: 'ses-0003', point: { session: 'ses-0003', invocation: 'inv-local' },
      ref: sessionPointReference('R', { sessionId: 'provider-local', kind: 'turn', turn: 1, checkpoint: 'L0' }) },
    globalTarget: null, startedAt: now, message: { stored: 'blob', ...stored, preview: 'Exact question' }, request: { session: 'ses-0001', entry: 5 } };
  const outcome: ConsultationOutcome = { schema: 'ramify-agent.consultation-outcome/1', id: start.id, status: 'answered', endedAt: '2026-10-10T10:00:01.000Z',
    child: { invocation: 'inv-2', session: 'ses-0002' }, accepted: { submission: 'invocations/inv-2/submission.json', answer: { stored: 'inline', text: 'Exact answer', bytes: 12 } },
    error: null, delivery: 'recorded', result: { session: 'ses-0001', entry: 8 } };
  return { log, path, content, start, outcome };
}
describe('Plan 33 C04 durable consultation associations', () => {
  test('start and outcome commit exact content references and completed replay is one exchange', async () => {
    const { log, path, content, start, outcome } = await fixture();
    expect(await recordConsultationStart(log, start)).toEqual(start);
    expect(await recordConsultationOutcome(log, outcome)).toEqual(outcome);
    const reopened = await RunLog.open(path, 'R');
    expect(await recordConsultationStart(reopened, start)).toEqual(start);
    expect(await recordConsultationStart(reopened, { ...start, message: { stored: 'inline', text: 'different question', bytes: 18 } })).toEqual(start);
    expect(await recordConsultationOutcome(reopened, outcome)).toEqual(outcome);
    expect(reopened.all('consultation-started')).toHaveLength(1); expect(reopened.all('consultation-finished')).toHaveLength(1);
    if (start.message.stored !== 'blob') throw new Error('blob expected');
    expect(await content.read(start.message.hash)).toBe('Exact question\nwith useful context.');
    expect(reopened.ledger.replay().flatMap(entry => entry.transaction.records).map(record => record.path)).toEqual([consultationLayout.start(start.id), consultationLayout.outcome(start.id)]);
    expect(consultationId('a-b', 'c')).not.toBe(consultationId('a', 'b-c'));
  });
  test('nested start preserves parent/target; interrupted acceptance has unknown result delivery', async () => {
    const { log, path, start, outcome } = await fixture();
    await recordConsultationStart(log, start);
    const nested: ConsultationStart = { ...start, id: consultationId('inv-2', 'inner'), parent: start.id,
      caller: { invocation: 'inv-2', session: 'ses-0002', role: 'local-architect', toolCall: 'inner', work: { workItem: 'wi-001' } }, target: { ...start.target, role: 'global-fork' } };
    await recordConsultationStart(log, nested);
    await recordConsultationOutcome(log, { ...outcome, status: 'incomplete', endedAt: null, delivery: 'unknown', result: null });
    const reopened = await RunLog.open(path, 'R');
    expect(reopened.all('consultation-started')[1]?.data.parent).toBe(start.id);
    expect(reopened.all('consultation-finished')).toHaveLength(1);
    const kept = reopened.ledger.replay().flatMap(entry => entry.transaction.records).find(record => record.path === consultationLayout.outcome(start.id))!.body;
    expect(kept).toMatchObject({ accepted: outcome.accepted, delivery: 'unknown', result: null, endedAt: null });
    expect(reopened.all('consultation-finished').some(event => event.data.consultation === nested.id)).toBe(false);
  });
  test('legacy dispatch events read without manufactured context and orphan outcomes are refused', async () => {
    const { log, path, outcome } = await fixture();
    await log.append({ type: 'work-item-started', data: { workItem: 'wi-001', module: 'M', origin: 'entry' } });
    const reopened = await RunLog.open(path, 'R'); expect(reopened.events[0]?.data).not.toHaveProperty('globalTarget');
    await expect(recordConsultationOutcome(reopened, outcome)).rejects.toThrow('no recorded start');
  });
  test('answer acceptance and later caller-result observation preserve immutable outcome revisions', async () => {
    const { log, path, start, outcome } = await fixture();
    await recordConsultationStart(log, start);
    const accepted = { ...outcome, delivery: 'unknown' as const, result: null };
    await recordConsultationOutcome(log, accepted);
    const original = log.ledger.replay().at(-1)!.transaction.records[0]!;
    await expect(recordConsultationDelivery(log, start.id, { session: start.caller.session, entry: null })).rejects.toThrow('observed');
    await expect(recordConsultationDelivery(log, start.id, { session: 'ses-9999', entry: 8 })).rejects.toThrow('another caller');
    const result = { session: start.caller.session, entry: 8 };
    const delivered = await recordConsultationDelivery(log, start.id, result);
    expect(delivered).toEqual(outcome);
    const reopened = await RunLog.open(path, 'R');
    expect(consultationOutcome(reopened, start.id)).toEqual(outcome);
    expect(await recordConsultationOutcome(reopened, accepted)).toEqual(outcome);
    expect(await recordConsultationDelivery(reopened, start.id, result)).toEqual(outcome);
    await expect(recordConsultationDelivery(reopened, start.id, { ...result, entry: 9 })).rejects.toThrow('immutable');
    expect(reopened.ledger.replay().flatMap(entry => entry.transaction.records).find(record => record.path === original.path)).toEqual(original);
    expect(reopened.all('consultation-started')).toHaveLength(1);
    expect(reopened.all('consultation-finished')).toHaveLength(1);
    expect(reopened.all('consultation-delivery-recorded')).toHaveLength(1);
    expect(reopened.ledger.replay().at(-1)!.transaction.records[0]!.path).toBe(consultationLayout.outcome(start.id, 2));
    expect(delivered).not.toHaveProperty('consumed');
  });
});
