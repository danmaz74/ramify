import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { selectCheckFindings } from '../../subs/check-findings/src/queries.js';
import type { CheckFindingCommand } from '../../subs/check-findings/src/interfaces/check-findings.js';
import { checkFindingLayout, checkFindingSchemas } from '../check-findings/records.js';
import { checkFindingContentHash, reportCommand } from '../check-findings/report.js';
import { checkFindingStateOf, replayCheckFindingState } from '../check-findings/state.js';
import { commitCheckFindingChange, type CheckFindingBuild, type CheckFindingCommit } from '../check-findings/transition.js';
import { readCommitted } from '../jobs/commit.js';
import { CorruptRunLogError, RunLog } from '../run/log.js';
import {
  checkFindingTarget, concern, decision, dispose, failure, faulting, InjectedFault, recorded, report, runId, started,
} from './helpers/check-findings.js';
import { temporaryDirectory } from './helpers/fixture.js';

/*
 * The CheckFinding transition over a real run log (appendix §2): one ledger
 * line carries the decided events, their record copies and the carrier's
 * own records, decided under the run mutex against the log as it stands.
 * A crash is what the ledger's file system seam makes of one failed write,
 * flush, rename or directory sync, read back through a fresh log.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function directory(): Promise<string> {
  const made = await temporaryDirectory();
  cleanups.push(made.remove);
  return made.path;
}

/** A running run's log in a directory of its own. */
async function running(path?: string) {
  const root = path ?? await directory();
  const target = await checkFindingTarget(root);
  await started(target.log);
  return { root, target };
}

const carriers = (log: RunLog) => log.events.filter(event => event.type === 'check-findings-recorded');

function committed(result: CheckFindingCommit): Extract<CheckFindingCommit, { kind: 'committed' }> {
  if (result.kind !== 'committed') throw new Error(`expected a commit, got ${JSON.stringify(result)}`);
  return result;
}

describe('one CheckFinding transition is one ledger line', () => {
  test('carries the decided events in order, with a record copy of each, and the harness computes every content hash', async () => {
    const { root, target } = await running();
    const first = concern();
    const second = concern({ key: 'concern-02', summary: 'Rounding is duplicated in the same file' });
    const result = committed(await commitCheckFindingChange(target, recorded([report(first), report(second)])));

    expect(result.decided.outcomes).toEqual([{ touched: ['cf-0001'], replayed: false }, { touched: ['cf-0002'], replayed: false }]);
    expect(target.log.version).toBe(2);
    const line = target.log.ledger.replay().at(-1)!;
    expect(line.transaction.event).toMatchObject({ type: 'check-findings-recorded', data: { cause: { kind: 'producer', attempt: 'rq-0001.a01' } } });
    expect(line.transaction.event.type === 'check-findings-recorded' && line.transaction.event.data.checkFindings.map(event => [event.type, event.data]))
      .toEqual([
        ['check-finding-opened', expect.objectContaining({ checkFinding: 'cf-0001', revision: 1 })],
        ['check-finding-opened', expect.objectContaining({ checkFinding: 'cf-0002', revision: 1 })],
      ]);
    expect(line.transaction.records.map(record => record.path)).toEqual([
      checkFindingLayout.report('cf-0001', 'cfr-0001'),
      checkFindingLayout.report('cf-0002', 'cfr-0002'),
    ]);

    // The hash is the harness's: over the canonical content without the ingestion key.
    const hash = checkFindingContentHash(first);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(checkFindingContentHash({ ...first, attempt: 'rq-0009.a01', reportKey: 'concern-09' })).toBe(hash);
    expect(checkFindingContentHash(second)).not.toBe(hash);
    const reversed = Object.fromEntries(Object.entries(first).reverse()) as typeof first;
    expect(checkFindingContentHash(reversed)).toBe(hash);

    const read = await readCommitted(target.log.ledger, checkFindingLayout.report('cf-0001', 'cfr-0001'), checkFindingSchemas.report);
    expect(read).toMatchObject({ kind: 'valid', value: { id: 'cfr-0001', checkFinding: 'cf-0001', revision: 1, contentHash: hash } });
    expect(JSON.parse(await readFile(join(root, checkFindingLayout.report('cf-0002', 'cfr-0002')), 'utf8'))).toMatchObject({
      schema: 'ramify-agent.check-finding-report/1', id: 'cfr-0002',
    });
  });

  test('a carrier composes its own records with the CheckFinding copies, and the build sees the log it is decided against', async () => {
    const { target } = await running();
    let seen: number | null = null;
    const build: CheckFindingBuild = basis => {
      seen = basis.log.version;
      return {
        commands: [report(concern())],
        compose: decided => ({
          event: { type: 'check-findings-recorded', data: { cause: { kind: 'recovery', detail: 'redelivered' }, checkFindings: [...decided.events] } },
          records: [{ path: 'reviews/rq-0001/attempts/01/attempt.json', id: 'rq-0001.a01', revision: 1, body: { schema: 'test/1', checkFindings: decided.outcomes.flatMap(outcome => outcome.touched) } }],
        }),
      };
    };
    committed(await commitCheckFindingChange(target, build));
    expect(seen).toBe(1);
    expect(target.log.ledger.replay().at(-1)!.transaction.records.map(record => record.path)).toEqual([
      'reviews/rq-0001/attempts/01/attempt.json', checkFindingLayout.report('cf-0001', 'cfr-0001'),
    ]);
    expect(target.log.ledger.replay().at(-1)!.transaction.records[0]!.body).toEqual({ schema: 'test/1', checkFindings: ['cf-0001'] });
  });
});

describe('CF01: exactly one CheckFinding per report key', () => {
  test('concurrent callbacks with one report key produce one issue; the others are replays that append nothing', async () => {
    const { target } = await running();
    const deliveries = await Promise.all(Array.from({ length: 5 }, () => commitCheckFindingChange(target, recorded([report(concern())]))));

    expect(deliveries.map(delivery => delivery.kind).sort()).toEqual(['committed', 'replayed', 'replayed', 'replayed', 'replayed']);
    for (const delivery of deliveries) {
      if (delivery.kind === 'refused') throw new Error('refused');
      expect(delivery.decided.outcomes).toEqual([{ touched: ['cf-0001'], replayed: delivery.kind === 'replayed' }]);
    }
    expect(carriers(target.log)).toHaveLength(1);
    expect([...checkFindingStateOf(target.log.ledger).findings.keys()]).toEqual(['cf-0001']);
  });

  test('changed content under the same key is refused as a conflict, and nothing is appended', async () => {
    const { target } = await running();
    committed(await commitCheckFindingChange(target, recorded([report(concern())])));
    const version = target.log.version;

    const changed = await commitCheckFindingChange(target, recorded([report(concern({ summary: 'Another text under the same key' }))]));
    expect(changed).toMatchObject({ kind: 'refused', refusal: { reason: 'check-finding', command: 0, rejection: { code: 'report-key-conflict' } } });
    expect(target.log.version).toBe(version);
  });

  test('an ambiguous issue key is refused without appending, and the report may be resubmitted without its key', async () => {
    const { target } = await running();
    const authority = { kind: 'user-decision' as const, ref: 'cfd-0000' };
    committed(await commitCheckFindingChange(target, recorded([
      report(failure({ attempt: 'ga-0005', subject: 'scenario:sc-004', tree: 't-02' })),
      report(failure({ attempt: 'ga-0006', subject: 'scenario:sc-004', tree: 't-02', revision: 2 })),
      // An authorized obligation revision gives cf-0001 the scoped key cf-0002 already holds.
      dispose('cf-0001', 1, decision({
        action: 'revise-obligation', authority,
        from: { subject: 'scenario:sc-004', revision: 1 }, to: { subject: 'scenario:sc-004', revision: 2 },
      }, { actor: { kind: 'user', name: 'dana' } })),
    ], { kind: 'user-response', command: 'answer-1' })));
    const version = target.log.version;

    const again = failure({ attempt: 'ga-0007', subject: 'scenario:sc-004', tree: 't-03', revision: 2 });
    const ambiguous = await commitCheckFindingChange(target, recorded([report(again)]));
    expect(ambiguous).toMatchObject({ kind: 'refused', refusal: { reason: 'check-finding', rejection: { code: 'ambiguous-issue-key' } } });
    expect(target.log.version).toBe(version);

    const keyless = committed(await commitCheckFindingChange(target, recorded([report({ ...again, issueKey: null })])));
    expect(keyless.decided.outcomes).toEqual([{ touched: ['cf-0003'], replayed: false }]);
  });

  test('a transition commits all of its reports or none: a partial replay is refused', async () => {
    const { target } = await running();
    committed(await commitCheckFindingChange(target, recorded([report(concern())])));
    const mixed = await commitCheckFindingChange(target, recorded([report(concern()), report(concern({ key: 'concern-02', summary: 'A second concern' }))]));
    expect(mixed).toMatchObject({ kind: 'refused', refusal: { reason: 'partial-replay' } });
    expect(carriers(target.log)).toHaveLength(1);
  });

  test('a refusal of a later command refuses the whole transition', async () => {
    const { target } = await running();
    const result = await commitCheckFindingChange(target, recorded([
      report(concern()),
      dispose('cf-0001', 7, decision({ action: 'plan-repair', repair: { kind: 'intent', ref: 'wi-001.rc01' } })),
    ]));
    expect(result).toMatchObject({ kind: 'refused', refusal: { reason: 'check-finding', command: 1, rejection: { code: 'stale-revision' } } });
    expect(target.log.version).toBe(1);
  });
});

describe('the transition refuses without appending', () => {
  test('a terminal run accepts no new issue', async () => {
    const { target } = await running();
    await target.log.append({ type: 'job-stopped', data: { settled: true } });
    const result = await commitCheckFindingChange(target, recorded([report(concern())]));
    expect(result).toMatchObject({ kind: 'refused', refusal: { reason: 'run-ended' } });
    expect(target.log.version).toBe(2);
  });

  test('a basis the slow work captured is revalidated under the mutex', async () => {
    const { target } = await running();
    // The producer captured the log at version 1; a write landed before its result was committed.
    const captured = target.log.version;
    await target.log.append({ type: 'review-requested', data: {} });
    const build: CheckFindingBuild = basis => (basis.log.version === captured
      ? recorded([report(concern())])(basis)
      : { stale: `the log moved from ${captured} to ${basis.log.version}` });
    const result = await commitCheckFindingChange(target, build);
    expect(result).toMatchObject({ kind: 'refused', refusal: { reason: 'stale-basis', message: 'the log moved from 1 to 2' } });
    expect(carriers(target.log)).toHaveLength(0);
  });

  test('a transaction over the ledger line bound is refused before anything is appended', async () => {
    const { target } = await running();
    const huge: CheckFindingBuild = () => ({
      commands: [report(concern())],
      compose: decided => ({
        event: { type: 'check-findings-recorded', data: { cause: { kind: 'recovery', detail: 'large' }, checkFindings: [...decided.events] } },
        records: [{ path: 'reviews/large.json', id: 'large', revision: 1, body: { text: 'x'.repeat(9 * 1024 * 1024) } }],
      }),
    });
    expect(await commitCheckFindingChange(target, huge)).toMatchObject({ kind: 'refused', refusal: { reason: 'too-large' } });
    expect(target.log.version).toBe(1);
    // The log is still usable.
    committed(await commitCheckFindingChange(target, recorded([report(concern())])));
  });

  test('no other path appends a CheckFinding event, and a log whose carried events do not replay is corrupt', async () => {
    const { root, target } = await running();
    const result = committed(await commitCheckFindingChange(target, recorded([report(concern())])));
    const events = result.event.type === 'check-findings-recorded' ? result.event.data.checkFindings : [];
    await expect(target.log.append({ type: 'check-findings-recorded', data: { cause: { kind: 'recovery', detail: 'bypass' }, checkFindings: [...events] } }))
      .rejects.toThrow(/only the CheckFinding transition commits/);

    // A hand-copied carrier line repeats cf-0001: the log no longer replays.
    const path = join(root, 'events.jsonl');
    const lines = (await readFile(path, 'utf8')).split('\n').filter(Boolean);
    const copy = JSON.parse(lines.at(-1)!) as { sequence: number; event: { sequence: number } };
    copy.sequence = 3;
    copy.event.sequence = 3;
    await writeFile(path, `${[...lines, JSON.stringify(copy)].join('\n')}\n`);
    await expect(RunLog.open(path, runId)).rejects.toThrow(CorruptRunLogError);
    await expect(RunLog.open(path, runId)).rejects.toThrow(/3: its CheckFinding events do not replay/);
  });
});

describe('CF06 and CF11: crashes around the commit keep exactly-once history', () => {
  /** A report and the repair planned for it, committed together: a decision is never without its report or intent. */
  const withRepair: readonly CheckFindingCommand[] = [
    report(concern()),
    dispose('cf-0001', 1, decision({ action: 'plan-repair', repair: { kind: 'intent', ref: 'wi-001.rc01' } })),
  ];

  test('a crash at every file system operation of the commit leaves all of it or none; a redelivery then commits once', async () => {
    // Count the operations of one commit with nothing failing.
    const counting = await directory();
    const points: string[] = [];
    const counted = await checkFindingTarget(counting, faulting(point => { points.push(point); }));
    await started(counted.log);
    const before = points.length;
    committed(await commitCheckFindingChange(counted, recorded(withRepair)));
    const total = points.length - before;
    expect(total).toBeGreaterThanOrEqual(6);

    let survived = 0;
    for (let target = 1; target <= total; target += 1) {
      const root = await directory();
      const prior = await checkFindingTarget(root);
      await started(prior.log);
      const crashing = await checkFindingTarget(root, faulting((point, index) => {
        if (index === target) throw new InjectedFault(point, index);
      }));
      let producerCalls = 0;
      const producer: CheckFindingBuild = basis => {
        producerCalls += 1;
        return recorded(withRepair)(basis);
      };
      await commitCheckFindingChange(crashing, producer).catch((error: unknown) => {
        expect(error).toBeInstanceOf(InjectedFault);
      });
      expect(producerCalls).toBe(1);

      // The restart: a fresh log on the real file system.
      const restarted = await checkFindingTarget(root);
      const lines = carriers(restarted.log);
      expect(lines.length === 0 || lines.length === 1).toBe(true);
      const state = checkFindingStateOf(restarted.log.ledger);
      if (lines.length === 1) {
        survived += 1;
        // Both events, never the decision alone.
        expect(lines[0]!.type === 'check-findings-recorded' && lines[0]!.data.checkFindings.map(event => event.type))
          .toEqual(['check-finding-opened', 'check-finding-decided']);
        expect(state.findings.get('cf-0001')).toMatchObject({ reason: 'repair-planned', repair: { kind: 'intent', ref: 'wi-001.rc01' } });
      } else {
        expect(state.findings.size).toBe(0);
      }
      // Recovery rewrites every record copy from the log, without the producer.
      await restarted.log.ledger.materialize();
      for (const line of restarted.log.ledger.replay()) {
        for (const record of line.transaction.records) {
          expect(JSON.parse(await readFile(join(root, record.path), 'utf8'))).toEqual(record.body);
        }
      }

      // Redelivering the result commits it once, whatever the crash left:
      // the report replays by its ingestion key, and the decision, made at
      // the revision it captured, cannot apply twice.
      const again = await commitCheckFindingChange(restarted, recorded(withRepair));
      if (lines.length === 1) {
        expect(again).toMatchObject({ kind: 'refused', refusal: { reason: 'check-finding', command: 1, rejection: { code: 'stale-revision' } } });
        expect(await commitCheckFindingChange(restarted, recorded([withRepair[0]!]))).toMatchObject({ kind: 'replayed' });
      } else {
        expect(again.kind).toBe('committed');
      }
      expect(carriers(restarted.log)).toHaveLength(1);
      expect([...checkFindingStateOf(restarted.log.ledger).findings.keys()]).toEqual(['cf-0001']);
    }
    // Some crashes precede the line and some follow it.
    console.log(`check-findings fault sweep: ${total} fault points in one commit, ${survived} of which left the committed line`);
    expect(survived).toBeGreaterThan(0);
    expect(survived).toBeLessThan(total);
  }, 60_000);

  test('a crash after the commit, before the record files, rebuilds from the log without invoking the producer', async () => {
    const root = await directory();
    const prior = await checkFindingTarget(root);
    await started(prior.log);
    // The log's write and flush are operations 1 and 2; the first record file is the next.
    const crashing = await checkFindingTarget(root, faulting((point, index) => {
      if (point.startsWith('write:') && !point.endsWith('events.jsonl') && index >= 3) throw new InjectedFault(point, index);
    }));
    let producerCalls = 0;
    const producer: CheckFindingBuild = basis => {
      producerCalls += 1;
      return recorded(withRepair)(basis);
    };
    committed(await commitCheckFindingChange(crashing, producer));
    const live = selectCheckFindings(checkFindingStateOf(crashing.log.ledger), { kind: 'list', owner: null, select: 'all' });
    await expect(readFile(join(root, checkFindingLayout.report('cf-0001', 'cfr-0001')), 'utf8')).rejects.toThrow(/ENOENT/);

    const restarted = await checkFindingTarget(root);
    const rewritten = await restarted.log.ledger.materialize();
    expect(rewritten.rewritten).toEqual([checkFindingLayout.report('cf-0001', 'cfr-0001'), checkFindingLayout.decision('cf-0001', 'cfd-0001')]);
    expect(await readCommitted(restarted.log.ledger, checkFindingLayout.decision('cf-0001', 'cfd-0001'), checkFindingSchemas.decision))
      .toMatchObject({ kind: 'valid', value: { checkFinding: 'cf-0001', revision: 2, decision: { action: 'plan-repair', repair: { kind: 'intent', ref: 'wi-001.rc01' } } } });
    expect(selectCheckFindings(checkFindingStateOf(restarted.log.ledger), { kind: 'list', owner: null, select: 'all' })).toEqual(live);
    expect(producerCalls).toBe(1);
  });

  test('a repair decision keeps its intent through a restart, and a claim stays open until it is verified', async () => {
    const root = await directory();
    const first = await checkFindingTarget(root);
    await started(first.log);
    committed(await commitCheckFindingChange(first, recorded(withRepair)));
    committed(await commitCheckFindingChange(first, recorded([
      dispose('cf-0001', 2, decision({ action: 'claim-repair', candidate: { kind: 'tree', id: 't-04' }, change: 'wi-001.i04' }, { source: { kind: 'tree', id: 't-04' } })),
    ], { kind: 'recovery', detail: 'the correction closed accepted' })));

    const restarted = await checkFindingTarget(root);
    const claimed = checkFindingStateOf(restarted.log.ledger).findings.get('cf-0001')!;
    expect(claimed).toMatchObject({ standing: 'open', reason: 'repair-claimed', revision: 3, repair: { kind: 'intent', ref: 'wi-001.rc01' } });
    const summary = selectCheckFindings(checkFindingStateOf(restarted.log.ledger), { kind: 'list', owner: null, select: 'attention' });
    expect(summary).toMatchObject({ ok: true, view: { items: [{ id: 'cf-0001', standing: 'open', awaiting: 'assessment' }] } });

    committed(await commitCheckFindingChange(restarted, recorded([
      dispose('cf-0001', 3, decision({ action: 'fix-by-assessment', reassessed: ['cfr-0001'] }, { source: { kind: 'tree', id: 't-04' } })),
    ], { kind: 'recovery', detail: 'fresh assessment' })));
    expect(checkFindingStateOf(restarted.log.ledger).findings.get('cf-0001')).toMatchObject({ standing: 'closed', reason: 'fixed-by-assessment' });
  });
});

describe('the CheckFinding projection is rebuilt from the ledger', () => {
  test('the incremental state equals a replay of a reopened log, key index included', async () => {
    const { root, target } = await running();
    committed(await commitCheckFindingChange(target, recorded([report(concern())])));
    const early = checkFindingStateOf(target.log.ledger);
    committed(await commitCheckFindingChange(target, recorded([report(concern({ attempt: 'rq-0002.a01', summary: 'Scope differs' }))], { kind: 'producer', producer: 'review:scope', attempt: 'rq-0002.a01' })));
    committed(await commitCheckFindingChange(target, recorded([
      dispose('cf-0001', 1, decision({ action: 'supersede', reassessed: ['cfr-0001'], replacement: 'a later iteration removed the second discount' })),
    ], { kind: 'recovery', detail: 'assessed' })));
    const live = checkFindingStateOf(target.log.ledger);
    expect(live).not.toBe(early);
    expect(live.applied).toBe(3);

    const reopened = await RunLog.open(join(root, 'events.jsonl'), runId);
    const rebuilt = replayCheckFindingState(reopened.ledger.replay());
    expect(rebuilt).toEqual(live);
    expect(checkFindingStateOf(reopened.ledger)).toEqual(live);
    expect([...rebuilt.ingested.keys()]).toHaveLength(2);
    for (const query of [{ kind: 'list', owner: null, select: 'all' }, { kind: 'detail', checkFinding: 'cf-0001' }] as const) {
      expect(selectCheckFindings(rebuilt, query)).toEqual(selectCheckFindings(live, query));
    }
  });

  test('a log without a carrier has the empty state, and a record copy that was lost is only a projection', async () => {
    const { root, target } = await running();
    expect(checkFindingStateOf(target.log.ledger).applied).toBe(0);
    committed(await commitCheckFindingChange(target, recorded([report(concern())])));
    await rm(join(root, 'check-findings'), { recursive: true });
    const reopened = await RunLog.open(join(root, 'events.jsonl'), runId);
    expect(checkFindingStateOf(reopened.ledger).findings.get('cf-0001')).toMatchObject({ standing: 'open', reason: 'new' });
    expect((await reopened.ledger.materialize()).rewritten).toEqual([checkFindingLayout.report('cf-0001', 'cfr-0001')]);
    // A redelivery after the rebuild is still a replay.
    expect(await commitCheckFindingChange({ mutex: target.mutex, log: reopened }, recorded([reportCommand(concern())])))
      .toMatchObject({ kind: 'replayed' });
  });
});
