import { consultationLayout, consultationOutcomeSchema, consultationStartSchema, type ConsultationOutcome, type ConsultationStart } from './records.js';
import type { RunLog } from '../run/log.js';
/** Caller holds its run mutex; existing ledger transactions make replay one exchange. */
export async function recordConsultationStart(log: RunLog, value: ConsultationStart): Promise<ConsultationStart> {
  const record = consultationStartSchema.parse(value);
  const previous = log.ledger.replay().flatMap(entry => entry.transaction.records).find(entry => entry.path === consultationLayout.start(record.id));
  if (previous !== undefined) return consultationStartSchema.parse(previous.body);
  await log.ledger.append({ event: log.next({ type: 'consultation-started', data: { consultation: record.id, caller: record.caller.invocation, toolCall: record.caller.toolCall, parent: record.parent } }),
    records: [{ path: consultationLayout.start(record.id), id: record.id, revision: 1, body: record }] });
  return record;
}
export async function recordConsultationOutcome(log: RunLog, value: ConsultationOutcome): Promise<ConsultationOutcome> {
  const record = consultationOutcomeSchema.parse(value);
  if (!log.all('consultation-started').some(event => event.data.consultation === record.id)) throw new Error(`Consultation ${record.id} has no recorded start`);
  const previous = consultationOutcome(log, record.id);
  if (previous !== null) return previous;
  await log.ledger.append({ event: log.next({ type: 'consultation-finished', data: { consultation: record.id, status: record.status, delivery: record.delivery } }),
    records: [{ path: consultationLayout.outcome(record.id), id: record.id, revision: 1, body: record }] });
  return record;
}

/** Latest retained observation; null means that the fork has no recorded outcome. */
export function consultationOutcome(log: RunLog, id: string): ConsultationOutcome | null {
  const prefix = `consultations/${encodeURIComponent(id)}/outcome.`;
  const latest = log.ledger.replay().flatMap(entry => entry.transaction.records).filter(record => record.path.startsWith(prefix)).at(-1);
  return latest === undefined ? null : consultationOutcomeSchema.parse(latest.body);
}

/** Record only an actually observed caller transcript result, never model consumption. Caller holds the run mutex. */
export async function recordConsultationDelivery(log: RunLog, id: string, result: NonNullable<ConsultationOutcome['result']>): Promise<ConsultationOutcome> {
  const previous = consultationOutcome(log, id);
  if (previous === null) throw new Error(`Consultation ${id} has no recorded outcome`);
  if (result.entry === null) throw new Error('Delivery needs an observed caller transcript entry');
  const start = log.ledger.replay().flatMap(entry => entry.transaction.records).find(record => record.path === consultationLayout.start(id));
  const caller = consultationStartSchema.parse(start?.body).caller;
  if (result.session !== caller.session) throw new Error('Delivery names another caller session');
  if (previous.delivery === 'recorded') {
    if (previous.result?.session !== result.session || previous.result.entry !== result.entry) throw new Error('Recorded consultation delivery is immutable');
    return previous;
  }
  const revision = 2 + log.all('consultation-delivery-recorded').filter(event => event.data.consultation === id).length;
  const record = consultationOutcomeSchema.parse({ ...previous, delivery: 'recorded', result });
  await log.ledger.append({ event: log.next({ type: 'consultation-delivery-recorded', data: { consultation: id, revision } }),
    records: [{ path: consultationLayout.outcome(id, revision), id, revision, body: record }] });
  return record;
}
