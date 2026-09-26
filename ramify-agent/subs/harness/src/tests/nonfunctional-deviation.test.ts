import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { decideCheckFindingChange } from '../../subs/check-findings/src/decide.js';
import { applyCheckFindingEvent, emptyCheckFindingState } from '../../subs/check-findings/src/replay.js';
import type { Assessment, Candidate } from '../../subs/nonfunctional/src/interfaces/contracts.js';
import type { Catalog, DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { isPlanDeviation } from '../deviations/finding.js';
import { nonfunctionalDeviationCommands, prepareNonfunctionalDeviation } from '../deviations/nonfunctional.js';

const source = Buffer.from('# Request\n\nThe service must preserve a 30 second timeout.\n');
const sha256 = createHash('sha256').update(source).digest('hex');
const quote = 'The service must preserve a 30 second timeout.';
const passage = { document: 'doc-001', quote };
const manifest: DocumentManifest = { schema: 'ramify-agent.document-manifest/1', root: 'doc-001', documents: [{
  id: 'doc-001', path: 'plans/example/plan.md', kind: 'plan', sha256, bytes: source.length,
  storedAt: 'input/plan.md', revision: { commit: null, dirty: null },
}], missing: [], principlesScan: { status: 'empty', unreadable: [] } };
const item: Catalog['items'][number] = { id: 'nfr-001', classification: 'non-functional-requirement',
  passage, conditions: [{ text: 'for the service', source: 'inferred' }], uncertainty: '' };
const candidate: Candidate = { tree: 'a'.repeat(40), head: null, preparedAt: '2026-09-25T00:00:00.000Z' };
const result: Assessment['results'][number] = { nfr: 'nfr-001', result: 'not-satisfied',
  inspectedScope: ['src/service.ts'], evidence: ['A 45 second timeout remains.'], uncertainty: 'No repair was safe.' };
const assessment: Assessment = { schema: 'ramify-agent.nonfunctional-assessment/1', id: 'nfa-001', candidate,
  round: 3, phase: 'after-repair', coordinatorInvocation: 'inv-0100', results: [result] };

const input = { id: 'pd-001', checkFinding: 'cf-0001', item, manifest,
  bytes: new Map([['doc-001', source]]), assessment, result, candidate,
  coordinatorInvocation: 'inv-0100', proposedAlternative: 'A 45 second timeout remains.', uncertainty: 'No repair was safe.' };

describe('non-functional deviation builder', () => {
  test('keeps the architect excerpt, assessment evidence, and NFR-only origin', () => {
    const prepared = prepareNonfunctionalDeviation(input);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.record).toMatchObject({ passage, evidence: result.evidence,
      origin: { kind: 'nonfunctional-assessment', nfr: 'nfr-001', assessment: 'nfa-001', candidate,
        coordinatorInvocation: 'inv-0100' } });
    expect('request' in prepared.record).toBe(false);
    expect('workItem' in prepared.record).toBe(false);
  });

  test('rejects stale bytes, another candidate, another coordinator and a caller-invented result', () => {
    expect(prepareNonfunctionalDeviation({ ...input, bytes: new Map([['doc-001', Buffer.from('changed')]]) }).ok).toBe(false);
    expect(prepareNonfunctionalDeviation({ ...input, candidate: { ...candidate, tree: 'b'.repeat(40) } }).ok).toBe(false);
    expect(prepareNonfunctionalDeviation({ ...input, coordinatorInvocation: 'inv-other' }).ok).toBe(false);
    expect(prepareNonfunctionalDeviation({ ...input, result: { ...result, evidence: ['Invented'] } }).ok).toBe(false);
    expect(prepareNonfunctionalDeviation({ ...input, result: { ...result, result: 'satisfied' } }).ok).toBe(false);
    expect(prepareNonfunctionalDeviation({ ...input, proposedAlternative: '', uncertainty: '' }).ok).toBe(false);
  });

  test('commands link the full canonical record and replay as a run-owned plan deviation', () => {
    const prepared = prepareNonfunctionalDeviation(input);
    if (!prepared.ok) throw new Error(prepared.errors.join('; '));
    const ref = 'deviations/pd-001.json';
    const built = nonfunctionalDeviationCommands(emptyCheckFindingState(), prepared.record, manifest, input.bytes, ref);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const [report, request] = built.commands;
    if (report?.type !== 'report' || request?.type !== 'dispose') throw new Error('Wrong command shape');
    expect(report.report).toMatchObject({ owner: { kind: 'run' },
      source: { kind: 'document', id: `plans/example/plan.md@sha256:${sha256}` },
      observation: { kind: 'plan-deviation', locations: [],
        evidence: [{ kind: 'plan-deviation', ref }] }, judgment: { ground: { ref } } });
    expect(request.decision.decision).toMatchObject({ action: 'request-user-decision',
      conflicts: [{ text: quote, document: 'plans/example/plan.md', revision: `sha256:${sha256}` }],
      options: [{ id: 'accept' }, { id: 'reject' }] });
    let state = emptyCheckFindingState();
    for (const command of built.commands) {
      const decided = decideCheckFindingChange(state, command);
      expect(decided.ok).toBe(true);
      if (!decided.ok) return;
      for (const event of decided.events) {
        const applied = applyCheckFindingEvent(state, event);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        state = applied.state;
      }
    }
    expect(isPlanDeviation(state.findings.get('cf-0001')!)).toBe(true);
    expect(state.findings.get('cf-0001')?.pendingUserDecision).not.toBeNull();
    expect(nonfunctionalDeviationCommands(state, prepared.record, manifest, input.bytes, ref).ok).toBe(false);
  });

  test('a long architect excerpt remains in the record while bounded report text names its canonical source', () => {
    const longQuote = 'Keep a bounded response. '.repeat(210);
    const longBytes = Buffer.from(`# Request\n${longQuote}\n`);
    const longHash = createHash('sha256').update(longBytes).digest('hex');
    const longManifest: DocumentManifest = { ...manifest, documents: [{ ...manifest.documents[0]!, sha256: longHash, bytes: longBytes.length }] };
    const longItem = { ...item, passage: { document: 'doc-001', quote: longQuote } };
    const prepared = prepareNonfunctionalDeviation({ ...input, item: longItem, manifest: longManifest,
      bytes: new Map([['doc-001', longBytes]]) });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.record.passage.quote).toBe(longQuote);
    const ref = 'deviations/pd-001.json';
    const built = nonfunctionalDeviationCommands(emptyCheckFindingState(), prepared.record,
      longManifest, new Map([['doc-001', longBytes]]), ref);
    expect(built.ok).toBe(true);
    if (!built.ok || built.commands[0]?.type !== 'report' || built.commands[1]?.type !== 'dispose') return;
    expect(built.commands[0].report.observation.summary).toContain(ref);
    expect(built.commands[0].report.observation.evidence[0]).toMatchObject({ ref, hash: expect.stringMatching(/^sha256:/u) });
    expect(built.commands[1].decision.decision).toMatchObject({
      conflicts: [{ text: expect.stringContaining(ref), document: 'plans/example/plan.md', revision: `sha256:${longHash}` }],
    });
  });
});
