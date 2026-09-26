import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { decideCheckFindingChange } from '../../subs/check-findings/src/decide.js';
import { applyCheckFindingEvent, emptyCheckFindingState } from '../../subs/check-findings/src/replay.js';
import type { Assessment, Candidate } from '../../subs/nonfunctional/src/interfaces/contracts.js';
import type { CatalogElement } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import type { DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { isPlanDeviation } from '../deviations/finding.js';
import { nonfunctionalDeviationCommands, prepareNonfunctionalDeviation } from '../deviations/nonfunctional.js';

const source = Buffer.from('# Request\n\nThe service must preserve a 30 second timeout.\n');
const sha256 = createHash('sha256').update(source).digest('hex');
const quote = 'The service must preserve a 30 second timeout.';
const manifest: DocumentManifest = { schema: 'ramify-agent.document-manifest/1', root: 'doc-001', documents: [{
  id: 'doc-001', path: 'plans/example/plan.md', kind: 'plan', sha256, bytes: source.length,
  storedAt: 'input/plan.md', revision: { commit: null, dirty: null },
}], missing: [], principlesScan: { status: 'empty', unreadable: [] } };
const item: CatalogElement = { id: 'nfr-001', kind: 'non-functional', document: 'doc-001',
  text: quote, conditions: [{ text: 'for the service', source: 'inferred' }], uncertainty: '' };
const candidate: Candidate = { tree: 'a'.repeat(40), head: null, preparedAt: '2026-09-25T00:00:00.000Z' };
const result: Assessment['results'][number] = { nfr: 'nfr-001', result: 'not-satisfied',
  inspectedScope: ['src/service.ts'], evidence: ['A 45 second timeout remains.'], uncertainty: 'No repair was safe.' };
const assessment: Assessment = { schema: 'ramify-agent.nonfunctional-assessment/1', id: 'nfa-001', candidate,
  round: 3, phase: 'after-repair', coordinatorInvocation: 'inv-0100', results: [result] };

const input = { id: 'pd-001', checkFinding: 'cf-0001', item, assessment, result, candidate,
  coordinatorInvocation: 'inv-0100', proposedAlternative: 'A 45 second timeout remains.', uncertainty: 'No repair was safe.' };

describe('non-functional deviation builder', () => {
  test('keeps the frozen element, assessment evidence, and NFR-only origin', () => {
    const prepared = prepareNonfunctionalDeviation(input);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.record).toMatchObject({ element: { id: 'nfr-001', document: 'doc-001', text: quote }, evidence: result.evidence,
      origin: { kind: 'nonfunctional-assessment', nfr: 'nfr-001', assessment: 'nfa-001', candidate,
        coordinatorInvocation: 'inv-0100' } });
    expect('request' in prepared.record).toBe(false);
    expect('workItem' in prepared.record).toBe(false);
    expect('passage' in prepared.record).toBe(false);
  });

  test('assesses fixed requirements too, but never a recommendation, context or functional element', () => {
    expect(prepareNonfunctionalDeviation({ ...input, item: { ...item, id: 'fix-001', kind: 'fixed' },
      result: { ...result, nfr: 'fix-001' }, assessment: { ...assessment, results: [{ ...result, nfr: 'fix-001' }] } }).ok).toBe(true);
    for (const kind of ['recommendation', 'context', 'functional'] as const) {
      expect(prepareNonfunctionalDeviation({ ...input, item: { ...item, kind } }).ok).toBe(false);
    }
  });

  test('rejects another candidate, another coordinator and a caller-invented result', () => {
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
    const built = nonfunctionalDeviationCommands(emptyCheckFindingState(), prepared.record, manifest, ref);
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
    expect(nonfunctionalDeviationCommands(state, prepared.record, manifest, ref).ok).toBe(false);
    expect(nonfunctionalDeviationCommands(emptyCheckFindingState(), { ...prepared.record, element: { ...prepared.record.element, document: 'doc-002' } }, manifest, ref).ok).toBe(false);
  });

  test('a long element text remains in the record while bounded report text names its canonical source', () => {
    const longQuote = 'Keep a bounded response. '.repeat(210);
    const longBytes = Buffer.from(`# Request\n${longQuote}\n`);
    const longHash = createHash('sha256').update(longBytes).digest('hex');
    const longManifest: DocumentManifest = { ...manifest, documents: [{ ...manifest.documents[0]!, sha256: longHash, bytes: longBytes.length }] };
    const longItem = { ...item, text: longQuote };
    const prepared = prepareNonfunctionalDeviation({ ...input, item: longItem });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.record.element.text).toBe(longQuote);
    const ref = 'deviations/pd-001.json';
    const built = nonfunctionalDeviationCommands(emptyCheckFindingState(), prepared.record, longManifest, ref);
    expect(built.ok).toBe(true);
    if (!built.ok || built.commands[0]?.type !== 'report' || built.commands[1]?.type !== 'dispose') return;
    expect(built.commands[0].report.observation.summary).toContain(ref);
    expect(built.commands[0].report.observation.evidence[0]).toMatchObject({ ref, hash: expect.stringMatching(/^sha256:/u) });
    expect(built.commands[1].decision.decision).toMatchObject({
      conflicts: [{ text: expect.stringContaining(ref), document: 'plans/example/plan.md', revision: `sha256:${longHash}` }],
    });
  });
});
