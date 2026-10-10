import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { noMessageDetail } from '../../subs/agent/src/interfaces/port.js';
import { consultationId, consultationLayout, type ConsultationStart, type ConsultationOutcome } from '../consultations/records.js';
import { runConsultationsCommand } from '../consultations/command.js';
import { readConsultations, consultationText } from '../projections/consultations.js';
import { defaultRunPolicy } from '../run/policy.js';
import { sessionPointReference } from '../run/session-operations.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { constructedRecord } from './helpers/constructed.js';
import { answer, ask, consultationFixture } from './helpers/consultations.js';
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
const at = '2026-10-10T10:00:00.000Z';
const inline = (text: string) => ({ stored: 'inline' as const, text, bytes: Buffer.byteLength(text) });

async function fixture() {
  const dir = await temporaryDirectory(); cleanup.push(dir.remove);
  await writeFile(join(dir.path, 'job.json'), JSON.stringify({ schema: 'ramify-agent.job/3', kind: 'manual', planId: 'P', jobId: 'R', createdAt: at,
    projectRoot: dir.path, base: '', branch: null, origin: 'step-run', policy: defaultRunPolicy({ projectRoot: dir.path }) }));
  const start: ConsultationStart = { schema: 'ramify-agent.consultation-start/1', id: consultationId('inv-caller', 'ask'), caller: {
    invocation: 'inv-caller', session: 'ses-0001', role: 'engineer', toolCall: 'ask', work: { workItem: 'W', iteration: 'W.i01' } }, parent: null,
    target: { role: 'local-architect', run: { planId: 'P', runId: 'R' }, session: 'ses-0003', point: { session: 'ses-0003', invocation: 'inv-original' },
      ref: sessionPointReference('R', { sessionId: 'original', kind: 'turn', turn: 1, checkpoint: 'L0' }) }, globalTarget: null,
    startedAt: at, message: inline('  Exact question\nnew facts.  '), request: { session: 'ses-0001', entry: null } };
  const outcome: ConsultationOutcome = { schema: 'ramify-agent.consultation-outcome/1', id: start.id, status: 'cancelled', endedAt: '2026-10-10T10:00:01.000Z',
    child: { invocation: 'inv-child', session: 'ses-0002' }, accepted: { submission: 'invocations/inv-child/submission.json', answer: inline('  Accepted but undelivered\nanswer.  ') },
    error: { code: 'cancelled', message: inline('Cancelled before delivery') }, delivery: 'unknown', result: null };
  type Row = { type: string; data: unknown; records?: Array<{ path: string; id: string; revision: number; body: unknown }> };
  async function events(rows: Row[], partial = '') {
    await writeFile(join(dir.path, 'events.jsonl'), rows.map((row, i) => JSON.stringify({ sequence: i + 1, at,
      event: { sequence: i + 1, at, jobId: 'R', type: row.type, data: row.data }, records: row.records ?? [] })).join('\n') + (rows.length > 0 ? '\n' : '') + partial);
  }
  const begin: Row = { type: 'consultation-started', data: { consultation: start.id, caller: start.caller.invocation, toolCall: 'ask', parent: null },
    records: [{ path: consultationLayout.start(start.id), id: start.id, revision: 1, body: start }] };
  const end: Row = { type: 'consultation-finished', data: { consultation: start.id, status: outcome.status, delivery: outcome.delivery },
    records: [{ path: consultationLayout.outcome(start.id), id: start.id, revision: 1, body: outcome }] };
  return { dir: dir.path, start, outcome, begin, end, events };
}
async function bytes(directory: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function walk(path: string) { for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = join(path, entry.name); if (entry.isDirectory()) await walk(target); else files[target] = `${(await stat(target)).mtimeMs}:${createHash('sha256').update(await readFile(target)).digest('hex')}`;
  } }
  await walk(directory); return files;
}

test('C13/C14/C15: actual nested exchanges, session descendants, complete per-invocation categories and detail chain totals', async () => {
  const f = await consultationFixture(cleanup, input => input.task.submissionTool !== 'answer_architect_consultation'
    ? [ask('  Exact engineer question\n facts  '), { kind: 'message', payload: { text: 'Caller subsequent work' } }, { kind: 'submit', input: {} }]
    : input.task.role === 'local-architect' ? [ask('Exact inner question', 'inner'), answer('  Exact local answer\n  ')] : [answer('Exact global answer')],
  base => ({ dispatch: (input, runtime) => {
    // Historical parents and caller have large usage; only actual consultation children enter the totals.
    if (input.task.submissionTool === 'answer_architect_consultation') runtime.onEvent({ type: 'message', role: 'assistant',
      observation: { sourceId: `${input.key.operationId}:usage` }, blocks: [], text: '', detail: noMessageDetail,
      usage: input.task.role === 'global-fork' ? { input: 100, output: 2, cacheRead: 20, cacheWrite: 30, total: 152 } : { input: 10, output: 1, cacheRead: 2, cacheWrite: 3, total: 16 } });
    else runtime.onEvent({ type: 'message', role: 'assistant', observation: { sourceId: `${input.key.operationId}:historical-usage` }, blocks: [], text: '', detail: noMessageDetail,
      usage: { input: 9000, output: 1000, cacheRead: 2000, cacheWrite: 3000, total: 15000 } });
    return base.dispatch(input, runtime);
  } }));
  const caller = await f.caller('engineer', f.seeds['local-architect']!, f.seeds['global-fork']!);
  await writeFile(join(f.directory, 'job.json'), JSON.stringify(f.run.record));
  for (const writer of f.run.transcripts.values()) await writer.drain();
  const before = await bytes(f.directory); const seen = f.seen.length;
  const view = await readConsultations({ run: f.directory });
  const outer = view.consultations[0]!; const inner = view.consultations[1]!;
  expect(view.count).toBe(2); expect(inner.parent).toBe(outer.id); expect(outer.question).toBe('  Exact engineer question\n facts  ');
  expect(outer.accepted?.text).toBe('  Exact local answer\n  '); expect(outer.delivery.result?.blocks[0]).toMatchObject({ text: outer.accepted!.text });
  expect(outer.delivery).toMatchObject({ observed: 'recorded', modelConsumption: 'unknown' });
  expect(outer.delivery.result?.position.entry).toBeGreaterThan(0); expect(outer.delivery.subsequentCaller.entry).toBeGreaterThan(outer.delivery.result!.position.entry!);
  expect(outer.child?.model).toBe('scripted-model'); expect(outer.child?.fork?.from).toEqual(f.seeds['local-architect']!.point);
  expect(view.usage).toMatchObject({ complete: true, knownSubtotal: { input: 110, output: 3, cacheRead: 22, cacheWrite: 33, total: 168 } });
  expect(f.run.log.ledger.replay().flatMap(line => line.transaction.records).some(record => (record.body as { schema?: string; usage?: { input?: number } })?.schema === 'ramify-agent.invocation-outcome/1' && (record.body as { usage: { input?: number } }).usage.input === 9000)).toBe(true);
  expect(view.usage.invocations).toHaveLength(2); expect(view.usage.invocations).not.toContain('inv-0001');
  expect(view.cumulativeCallTime.totalMs).toBe(outer.elapsedMs); expect(outer.elapsedMs).toBeGreaterThanOrEqual(inner.elapsedMs!);
  const filtered = await readConsultations({ run: f.directory, session: caller.session }); expect(filtered.consultations.map(value => value.id)).toEqual([outer.id, inner.id]);
  const detail = await readConsultations({ run: f.directory, id: outer.id }); expect(detail.consultations).toHaveLength(1); expect(detail.usage).toEqual(view.usage);
  const json = await runConsultationsCommand({ run: f.directory, format: 'json' }); expect(JSON.parse(json.stdout)).toEqual(view);
  const text = consultationText(view); expect(text).toContain(`  ${inner.id}`); expect(text).toContain('cumulative top-level call time (not session wall time)');
  expect(text).toContain(outer.child!.investigation!.path); expect(consultationText(detail, true)).toContain(outer.question);
  expect(await bytes(f.directory)).toEqual(before); expect(f.seen.length).toBe(seen);
});

test('C14: accepted answer and cancellation error remain distinct from absent delivery; unknown IDs and malformed bodies fail', async () => {
  const f = await fixture(); await f.events([f.begin, f.end]);
  const view = await readConsultations({ run: f.dir, id: f.start.id });
  expect(view.consultations[0]).toMatchObject({ accepted: { text: f.outcome.accepted!.answer.stored === 'inline' ? f.outcome.accepted!.answer.text : '' }, error: { text: 'Cancelled before delivery' },
    delivery: { observed: 'unknown', recordedOutcome: 'unknown', result: null, modelConsumption: 'unknown' } });
  expect(consultationText(view, true)).toContain('Accepted but undelivered');
  expect(await runConsultationsCommand({ run: f.dir, id: 'no-such-call' })).toMatchObject({ exitStatus: 2, stdout: '', stderr: expect.stringContaining('Unknown consultation') });
  await f.events([{ ...f.begin, records: [{ ...f.begin.records![0]!, body: { ...f.start, caller: {} } }] }]);
  expect(await runConsultationsCommand({ run: f.dir })).toMatchObject({ exitStatus: 2, stdout: '' });
  await f.events([f.begin, { ...f.end, data: { consultation: f.start.id, status: 'answered', delivery: 'unknown' } }]);
  expect(await runConsultationsCommand({ run: f.dir })).toMatchObject({ exitStatus: 2, stderr: expect.stringContaining('disagrees') });
  await f.events([f.begin, { ...f.end, records: [] }]);
  expect(await runConsultationsCommand({ run: f.dir })).toMatchObject({ exitStatus: 2, stderr: expect.stringContaining('no committed outcome') });
});

test('C14: unfinished child correlation uses actual invocation and opened session, partial tail/missing mirrors are never repaired', async () => {
  const f = await fixture();
  await f.events([f.begin, { type: 'session-opened', data: { session: 'ses-0002', role: 'local-architect', work: { request: f.start.id }, executor: 'scripted', model: 'selected/model', fork: { from: f.start.target.point, reason: 'architect-consultation', briefs: [] } } },
    { type: 'invocation-started', data: { invocation: 'inv-child', role: 'local-architect', session: 'ses-0002', work: { request: f.start.id }, start: 'opened' } }], '{unfinished');
  const before = await bytes(f.dir); const view = await readConsultations({ run: f.dir });
  expect(view.consultations[0]).toMatchObject({ status: 'incomplete', elapsedMs: null, child: { invocation: 'inv-child', session: 'ses-0002', model: 'selected/model' }, delivery: { observed: 'unknown' } });
  expect(view.usage.complete).toBe(false); expect(view.cumulativeCallTime.totalMs).toBeNull(); expect(view.limits[0]).toContain('unfinished');
  expect(await bytes(f.dir)).toEqual(before);
});

test('C15: missing/truncated provider usage retains known categories as a subtotal; overlapping top-level times are cumulative', async () => {
  const f = await fixture();
  const second = { ...f.start, id: consultationId('inv-caller', 'again'), caller: { ...f.start.caller, toolCall: 'again' } };
  await f.events([f.begin, f.end, { ...f.begin, data: { ...f.begin.data as object, consultation: second.id, toolCall: 'again' }, records: [{ path: consultationLayout.start(second.id), id: second.id, revision: 1, body: second }] },
    { ...f.end, data: { consultation: second.id, status: 'cancelled', delivery: 'unknown' }, records: [{ path: consultationLayout.outcome(second.id), id: second.id, revision: 1, body: { ...f.outcome, id: second.id, child: { invocation: 'inv-other', session: 'ses-0004' } } }] }]);
  await mkdir(join(f.dir, 'invocations', 'inv-child'), { recursive: true });
  await writeFile(join(f.dir, 'invocations', 'inv-child', 'observations.jsonl'), JSON.stringify({ n: 1, at, type: 'usage', data: { usage: { input: 10, output: 3, cacheRead: 2, cacheWrite: 1, total: 16 }, charge: null, modelElapsedMs: null } }) + '\n{truncated');
  const view = await readConsultations({ run: f.dir });
  expect(view.usage).toMatchObject({ complete: false, total: null, knownSubtotal: { input: 10, output: 3, cacheRead: 2, cacheWrite: 1, total: 16 } });
  expect(view.consultations[0]!.usage.limits.join(' ')).toContain('trailing partial=true');
  expect(view.consultations[1]!.usage.knownSubtotal).toBeNull();
  expect(view.cumulativeCallTime).toMatchObject({ knownSubtotalMs: 2000, totalMs: 2000, complete: true });
});

test('C14/C16: valid pre-feature manual and ordinary run logs return empty JSON/text; invalid run is an explicit read error', async () => {
  const f = await fixture(); await f.events([]);
  expect(await runConsultationsCommand({ run: f.dir })).toMatchObject({ exitStatus: 0, stdout: expect.stringContaining('Consultations: 0') });
  const json = await runConsultationsCommand({ run: f.dir, format: 'json' }); expect(JSON.parse(json.stdout).consultations).toEqual([]);
  await writeFile(join(f.dir, 'job.json'), JSON.stringify(constructedRecord()));
  expect(await runConsultationsCommand({ run: f.dir })).toMatchObject({ exitStatus: 0, stdout: expect.stringContaining('Consultations: 0') });
  await writeFile(join(f.dir, 'job.json'), '{malformed');
  expect(await runConsultationsCommand({ run: f.dir })).toMatchObject({ exitStatus: 2, stdout: '' });
});


test('C14: child acceptance committed before consultation outcome stays known, with hash verification and incomplete delivery', async () => {
  const f = await fixture();
  const accepted = JSON.stringify({ schema: 'ramify-agent.architect-consultation-answer/1', answer: '  Exact accepted answer\n  ' });
  const hash = createHash('sha256').update(accepted).digest('hex');
  await mkdir(join(f.dir, 'invocations', 'inv-child'), { recursive: true });
  await writeFile(join(f.dir, 'invocations', 'inv-child', 'submission.json'), accepted);
  await f.events([f.begin,
    { type: 'invocation-started', data: { invocation: 'inv-child', role: 'local-architect', session: 'ses-0002', work: { request: f.start.id }, start: 'opened' } },
    { type: 'invocation-ended', data: { invocation: 'inv-child', session: 'ses-0002', ended: 'submitted', submission: hash, kept: false, finished: 'not-kept' }, records: [{
      path: 'invocations/inv-child/outcome.json', id: 'inv-child', revision: 1, body: { schema: 'ramify-agent.invocation-outcome/1', invocation: 'inv-child', ended: 'submitted',
        rejectedSubmissions: 0, disposition: 'applied', submission: { hash }, settled: { confirmed: true, at, groupsKilled: 0, lateWrites: [] }, outsideScope: [], usage: { unavailable: 'not reported' }, elapsedMs: 100 }
    }] }]);
  const view = await readConsultations({ run: f.dir });
  expect(view.consultations[0]).toMatchObject({ status: 'incomplete', accepted: { text: '  Exact accepted answer\n  ' }, references: { outcome: null }, delivery: { observed: 'unknown' } });
  await writeFile(join(f.dir, 'invocations', 'inv-child', 'submission.json'), accepted + ' ');
  expect(await runConsultationsCommand({ run: f.dir })).toMatchObject({ exitStatus: 2, stderr: expect.stringContaining('hash mismatch') });
});
