import { describe, expect, it } from 'vitest';
import type { LedgerEntry, RecordBody } from '../../subs/ledger/src/ledger.js';
import type { RunEvent } from '../run/log.js';
import { runEventSchema } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { replayNonfunctionalPhase } from '../run/nonfunctional-phase.js';
import { decideNonfunctionalRound } from '../../subs/nonfunctional/src/rounds.js';

const oid = (character: string) => character.repeat(40);
const hash = 'e'.repeat(64);
const first = { tree: oid('a'), head: oid('b'), preparedAt: '2026-09-25T00:00:00.000Z' };
const second = { tree: oid('c'), head: oid('b'), preparedAt: '2026-09-25T00:01:00.000Z' };
const nfrIds = ['nfr-001'];
const result = (status: 'satisfied' | 'not-satisfied' | 'undetermined') => ({
  nfr: 'nfr-001', result: status, inspectedScope: ['src/'], evidence: [],
  uncertainty: status === 'undetermined' ? 'Intermediate evidence unavailable' : '',
});
const assessment = (id: string, candidate: typeof first, phase: 'initial' | 'after-repair', status: ReturnType<typeof result>['result']) => ({
  schema: 'ramify-agent.nonfunctional-assessment/1', id, candidate, round: 1, phase,
  coordinatorInvocation: `inv-${id}`, results: [result(status)],
});
const initial = assessment('nfa-001', first, 'initial', 'undetermined');
const reassessed = assessment('nfa-002', second, 'after-repair', 'satisfied');
const record = (path: string, id: string, body: unknown): RecordBody => ({ path, id, revision: 1, body });
function entry(type: string, data: unknown, records: readonly RecordBody[] = [], sequence = 1): LedgerEntry<RunEvent> {
  const at = '2026-09-25T00:00:00.000Z';
  return { sequence, at, transaction: { event: runEventSchema.parse({ sequence, at, jobId: 'job-001', type, data }), records } };
}
const prepared = (id: string, candidate: typeof first, sequence: number) => entry('candidate-prepared', { candidate: id, tree: candidate.tree }, [
  record(runLayout.candidate(id), id, { schema: 'ramify-agent.prepared-candidate/1', candidate, scenarioRenderingHash: hash, writerSettled: true }),
], sequence);
const assessed = (value: typeof initial, candidateId: string, sequence: number) => entry('nonfunctional-assessed',
  { assessment: value.id, candidate: candidateId, round: 1, phase: value.phase },
  [record(runLayout.assessment(value.id), value.id, value)], sequence);
const marker = entry('nonfunctional-phase-started', { catalogHash: hash, maxRounds: 3 }, [], 1);
const investigated = entry('nonfunctional-investigated', { round: 1, invocation: 'inv-investigate', assessment: initial.id, nfrs: nfrIds }, [], 4);
const assigned = entry('nonfunctional-repair-assigned', {
  round: 1, assignment: 'nfr-repair-001', assessment: initial.id, candidate: 'cand-001', nfrs: nfrIds, startingModule: 'app',
}, [record(runLayout.nonfunctionalRepairAssignment('nfr-repair-001'), 'nfr-repair-001', {
  schema: 'ramify-agent.nonfunctional-repair-assignment/1', id: 'nfr-repair-001', round: 1,
  assessment: initial.id, candidate: 'cand-001', nfrs: nfrIds, startingModule: 'app',
  task: 'Improve evidence', evidence: [], uncertainty: '',
})], 5);
const repaired = entry('nonfunctional-repair-committed', { round: 1, invocation: 'inv-repair', assignment: 'nfr-repair-001' }, [], 6);
const closed = entry('nonfunctional-round-closed', { round: 1, record: 'nfr-round-001', outcome: 'satisfied' }, [
  record(runLayout.nonfunctionalRound(1), 'nfr-round-001', {
    schema: 'ramify-agent.nonfunctional-round/1', number: 1, initial: initial.id,
    investigation: 'inv-investigate', repair: 'nfr-repair-001', reassessment: reassessed.id, outcome: 'satisfied',
  }),
], 9);
const stream = [marker, prepared('cand-001', first, 2), assessed(initial, 'cand-001', 3), investigated, assigned, repaired,
  prepared('cand-002', second, 7), assessed(reassessed, 'cand-002', 8), closed];

describe('committed non-functional phase replay', () => {
  it('reconstructs valid crash prefixes and the next permitted step', () => {
    const expected = ['prepare-candidate', 'prepare-candidate', 'assess', 'investigate', 'repair-or-close', 'repair-or-close', 'prepare-candidate', 'assess', 'close', 'stop'];
    for (let length = 0; length <= stream.length; length += 1) {
      const replay = replayNonfunctionalPhase(stream.slice(0, length), nfrIds, 3);
      expect(replay.ok).toBe(true);
      if (replay.ok) expect(decideNonfunctionalRound(replay.value.input).action).toBe(expected[length]);
    }
    const afterRepair = replayNonfunctionalPhase(stream.slice(0, 7), nfrIds, 3);
    expect(afterRepair).toMatchObject({ ok: true, value: { candidateId: 'cand-002', initialCandidateId: 'cand-001', repair: { assignment: 'nfr-repair-001' } } });
  });

  it('retains the closed assessment and count for finalization', () => {
    const replay = replayNonfunctionalPhase(stream, nfrIds, 3);
    expect(replay).toMatchObject({ ok: true, value: { final: { candidateId: 'cand-002', assessment: { id: 'nfa-002' } }, input: { closedRounds: [{ number: 1, outcome: 'satisfied' }] } } });
  });

  it('advances from a committed continuing round without resetting the count', () => {
    const unresolved = assessment('nfa-001', first, 'initial', 'not-satisfied');
    const continuation = entry('nonfunctional-round-closed', { round: 1, record: 'nfr-round-001', outcome: 'continue' }, [
      record(runLayout.nonfunctionalRound(1), 'nfr-round-001', {
        schema: 'ramify-agent.nonfunctional-round/1', number: 1, initial: unresolved.id,
        investigation: null, repair: null, reassessment: null, outcome: 'continue',
      }),
    ], 3);
    const replay = replayNonfunctionalPhase([marker, prepared('cand-001', first, 2), assessed(unresolved, 'cand-001', 3), continuation], nfrIds, 3);
    expect(replay).toMatchObject({ ok: true, value: { input: { closedRounds: [{ number: 1, outcome: 'continue' }] } } });
    if (replay.ok) expect(decideNonfunctionalRound(replay.value.input)).toMatchObject({ action: 'prepare-candidate', round: 2 });
  });

  it('rejects missing or conflicting co-committed evidence', () => {
    expect(replayNonfunctionalPhase([marker, entry('candidate-prepared', { candidate: 'cand-001', tree: first.tree })], nfrIds, 3)).toMatchObject({ ok: false, reason: expect.stringContaining('co-committed') });
    const wrongTree = prepared('cand-001', first, 1);
    const tampered = entry('candidate-prepared', { candidate: 'cand-001', tree: second.tree }, wrongTree.transaction.records);
    expect(replayNonfunctionalPhase([marker, tampered], nfrIds, 3)).toMatchObject({ ok: false, reason: expect.stringContaining('tree differs') });
    expect(replayNonfunctionalPhase([marker, stream[1]!, assessed(initial, 'cand-999', 3)], nfrIds, 3)).toMatchObject({ ok: false, reason: expect.stringContaining('no matching prepared') });
    const wrongHead = assessed({ ...initial, candidate: { ...first, head: oid('f') } }, 'cand-001', 2);
    expect(replayNonfunctionalPhase([marker, stream[1]!, wrongHead], nfrIds, 3)).toMatchObject({ ok: false, reason: expect.stringContaining('candidate disagree') });
  });

  it('rejects a new candidate before repair and closure without reassessment', () => {
    expect(replayNonfunctionalPhase([marker, stream[1]!, stream[2]!, prepared('cand-002', second, 4)], nfrIds, 3)).toMatchObject({ ok: false, reason: expect.stringContaining('prior candidate was consumed') });
    expect(replayNonfunctionalPhase([...stream.slice(0, 7), closed], nfrIds, 3)).toMatchObject({ ok: false });
    const falseSatisfied = entry('nonfunctional-round-closed', { round: 1, record: 'nfr-round-001', outcome: 'satisfied' }, [
      record(runLayout.nonfunctionalRound(1), 'nfr-round-001', {
        schema: 'ramify-agent.nonfunctional-round/1', number: 1, initial: initial.id,
        investigation: 'inv-investigate', repair: null, reassessment: null, outcome: 'satisfied',
      }),
    ], 4);
    expect(replayNonfunctionalPhase(stream.slice(0, 4).concat(falseSatisfied), nfrIds, 3)).toMatchObject({ ok: false, reason: expect.stringContaining('disagrees with assessed results') });
  });

  it('refuses a closed round whose earlier assessment omitted the fixed NFR', () => {
    const missing = assessed({ ...initial, results: [] }, 'cand-001', 2);
    expect(replayNonfunctionalPhase([marker, stream[1]!, missing, investigated, closed], nfrIds, 3)).toMatchObject({
      ok: false, reason: expect.stringContaining('does not cover fixed NFR IDs'),
    });
  });

  it('rejects forged repair authority and investigation without progress', () => {
    const satisfied = assessed(assessment('nfa-001', first, 'initial', 'satisfied'), 'cand-001', 3);
    expect(replayNonfunctionalPhase([marker, stream[1]!, satisfied, assigned], nfrIds, 3)).toMatchObject({
      ok: false, reason: expect.stringContaining('repair assignment is not permitted'),
    });
    const repeated = entry('nonfunctional-investigated', {
      round: 1, invocation: 'inv-investigate-again', assessment: initial.id, nfrs: nfrIds,
    });
    expect(replayNonfunctionalPhase(stream.slice(0, 4).concat(repeated), nfrIds, 3)).toMatchObject({
      ok: false, reason: expect.stringContaining('adds no new NFR evidence'),
    });
    const fabricated = entry('nonfunctional-repair-assigned', {
      ...assigned.transaction.event.data, nfrs: ['nfr-999'],
    }, assigned.transaction.records);
    expect(replayNonfunctionalPhase(stream.slice(0, 4).concat(fabricated), nfrIds, 3)).toMatchObject({
      ok: false, reason: expect.stringContaining('repair assignment targets'),
    });
  });
});
