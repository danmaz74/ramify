import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { documentManifestSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { openElementCatalog, type ElementCatalog, type SubmittedElement } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { acceptIntake, acceptPrinciples, applyCheck, type CheckState, type CheckSubmission, type IntakeSubmission } from '../analysis/extraction.js';
import { acceptArchitectElements, type AnalysisEvidence } from '../analysis/submission.js';
import { analysis, entry } from './helpers/analysis.js';

/*
 * The catalog extractor's turns, as pure acceptances: the intake adds the
 * plan's non-functional requirements and recommendations, a principles
 * extraction its document's fixed requirements, and a checker corrects the
 * reading of one document and re-cites what the analysis cites of it.
 * Nothing compares element text with the captured bytes.
 */

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const manifest = documentManifestSchema.parse({
  schema: 'ramify-agent.document-manifest/1', root: 'doc-001',
  documents: [
    { id: 'doc-001', path: 'plans/mail/plan.md', kind: 'plan', sha256: hash('plan'), bytes: 4, storedAt: 'input/plan.md', revision: { commit: null, dirty: null } },
    { id: 'doc-002', path: 'docs/mail.principles.md', kind: 'principle', sha256: hash('principles'), bytes: 10, storedAt: 'input/documents/doc-002.bin', revision: { commit: null, dirty: null } },
  ],
  missing: [], principlesScan: { status: 'complete', unreadable: [] },
});
const open = openElementCatalog(hash('manifest'), manifest);
const evidence = (catalog: ElementCatalog): AnalysisEvidence => ({ index: null, catalog, planScenarios: [] });

function element(key: string, kind: SubmittedElement['kind'], document: string, text = `The source states ${key}.`): SubmittedElement {
  return { key, kind, document, text, conditions: [], uncertainty: '' };
}

function intake(elements: readonly SubmittedElement[]): IntakeSubmission {
  return { goal: 'Customers receive their email.', elements: [...elements],
    incorporation: { documents: [{ document: 'doc-001', scenarios: true, uncertainty: '' }], missing: [] } };
}

/** The catalog after the intake, the principles extraction and the architect, and the analysis citing it. */
function extracted(): CheckState {
  const read = acceptIntake(open, manifest, intake([element('within-a-minute', 'non-functional', 'doc-001'), element('prefer-a-queue', 'recommendation', 'doc-001')]));
  if (!read.ok) throw new Error(JSON.stringify(read.errors));
  const fixed = acceptPrinciples(read.catalog, 'doc-002', { elements: [element('audited', 'fixed', 'doc-002')] });
  if (!fixed.ok) throw new Error(JSON.stringify(fixed.errors));
  return acceptArchitectElements(fixed.catalog, analysis([entry('send-email', 'mail')]));
}

function check(extra: Partial<CheckSubmission> = {}): CheckSubmission {
  return { corrections: [], entries: [], scenarios: [], ...extra };
}

const ids = (catalog: ElementCatalog) => catalog.elements.map(item => item.id);

describe('the intake', () => {
  test('numbers the plan\'s non-functional requirements and recommendations, and keeps the incorporation judgment', () => {
    const accepted = acceptIntake(open, manifest, intake([
      element('within-a-minute', 'non-functional', 'doc-001'), element('prefer-a-queue', 'recommendation', 'doc-001'), element('retries', 'non-functional', 'doc-001'),
    ]));
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.errors));
    expect(accepted.catalog.elements.map(item => [item.id, item.kind, item.document])).toEqual([
      ['nfr-001', 'non-functional', 'doc-001'], ['rec-001', 'recommendation', 'doc-001'], ['nfr-002', 'non-functional', 'doc-001'],
    ]);
    expect(accepted.incorporation).toEqual({ schema: 'ramify-agent.document-incorporation/2',
      documents: [{ document: 'doc-001', scenarios: true, uncertainty: '' }], missing: [] });
  });

  test('reads neither functional elements nor the principles documents, and nothing is accepted on an error', () => {
    const rejected = acceptIntake(open, manifest, intake([
      element('delivers', 'functional', 'doc-001'), element('audited', 'non-functional', 'doc-002'), element('fixed', 'fixed', 'doc-001'),
    ]));
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.errors.map(error => error.path)).toEqual(['elements.0.kind', 'elements.1.document', 'elements.2.kind']);
    const twice = acceptIntake(open, manifest, intake([element('same', 'non-functional', 'doc-001'), element('same', 'recommendation', 'doc-001')]));
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.errors.map(error => error.path)).toEqual(['elements.1.key']);
    expect(open.elements).toEqual([]);
  });
});

describe('a principles extraction', () => {
  test('adds fixed requirements and recommendations of its own document, numbered past the intake\'s', () => {
    const read = acceptIntake(open, manifest, intake([element('prefer-a-queue', 'recommendation', 'doc-001')]));
    if (!read.ok) throw new Error(JSON.stringify(read.errors));
    const accepted = acceptPrinciples(read.catalog, 'doc-002', { elements: [element('audited', 'fixed', 'doc-002'), element('small-modules', 'recommendation', 'doc-002')] });
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.errors));
    expect(accepted.catalog.elements.map(item => [item.id, item.document])).toEqual([['rec-001', 'doc-001'], ['fix-001', 'doc-002'], ['rec-002', 'doc-002']]);
  });

  test('rejects an element of another document and a kind the principles do not supply', () => {
    const rejected = acceptPrinciples(open, 'doc-002', { elements: [element('audited', 'fixed', 'doc-001'), element('fast', 'non-functional', 'doc-002')] });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.errors.map(error => error.path)).toEqual(['elements.0.document', 'elements.1.kind']);
  });
});

describe('a checker', () => {
  test('the elements every reader works from before any check: the architect\'s beside the extractors\'', () => {
    const state = extracted();
    expect(ids(state.catalog)).toEqual(['nfr-001', 'rec-001', 'fix-001', 'fr-001', 'fr-002']);
    expect(state.analysis.entries[0]).toMatchObject({ requirementRefs: ['fr-001'], acceptanceRefs: ['fr-002'], contextRefs: [] });
    expect(state.analysis.scenarios[0]!.refs).toEqual(['fr-002']);
  });

  test('adds a constraint its document states and the reading omitted, with a finding naming the new ID', () => {
    const state = extracted();
    const applied = applyCheck(state, 'doc-002', 'inv-0005', check({ corrections: [
      { action: 'add', reason: 'The principles also bound the retry count.', elements: [element('three-retries', 'fixed', 'doc-002')] },
    ] }), evidence(state.catalog));
    if (!applied.ok) throw new Error(JSON.stringify(applied.errors));
    expect(ids(applied.catalog)).toEqual(['nfr-001', 'rec-001', 'fix-001', 'fr-001', 'fr-002', 'fix-002']);
    expect(applied.analysis).toEqual(state.analysis);
    expect(applied.findings).toEqual([{ document: 'doc-002', invocation: 'inv-0005', action: 'add', reason: 'The principles also bound the retry count.',
      elements: ['fix-002'], retired: [] }]);

    const elsewhere = applyCheck(state, 'doc-002', 'inv-0005', check({ corrections: [
      { action: 'add', reason: 'The plan says so.', elements: [element('from-the-plan', 'fixed', 'doc-001')] },
    ] }), evidence(state.catalog));
    expect(elsewhere.ok).toBe(false);
    if (!elsewhere.ok) expect(elsewhere.errors.map(error => error.path)).toEqual(['corrections.0.elements.0.document']);
  });

  test('splits a cited functional element, and the entry and its scenario are re-cited to the new IDs', () => {
    const state = extracted();
    const split = check({
      corrections: [{ action: 'replace', reason: 'The acceptance states two outcomes.', retire: ['fr-002'],
        elements: [element('sent', 'functional', 'doc-001'), element('logged', 'functional', 'doc-001')] }],
      entries: [{ capability: 'send-email', requirementRefs: ['fr-001'], acceptanceRefs: ['sent', 'logged'], contextRefs: [] }],
      scenarios: [{ key: 'send-email-is-used', refs: ['sent', 'logged'] }],
    });
    const applied = applyCheck(state, 'doc-001', 'inv-0004', split, evidence(state.catalog));
    if (!applied.ok) throw new Error(JSON.stringify(applied.errors));
    // The new elements are numbered past the retired one, which is never issued again.
    expect(ids(applied.catalog)).toEqual(['nfr-001', 'rec-001', 'fix-001', 'fr-001', 'fr-003', 'fr-004']);
    expect(applied.catalog.retired).toEqual(['fr-002']);
    expect(applied.analysis.entries[0]).toMatchObject({ requirementRefs: ['fr-001'], acceptanceRefs: ['fr-003', 'fr-004'] });
    expect(applied.analysis.scenarios[0]!.refs).toEqual(['fr-003', 'fr-004']);
    expect(applied.findings).toEqual([{ document: 'doc-001', invocation: 'inv-0004', action: 'replace', reason: 'The acceptance states two outcomes.',
      elements: ['fr-003', 'fr-004'], retired: ['fr-002'] }]);

    // Without the re-citation the entry and the scenario would cite a retired element.
    const unrecited = applyCheck(state, 'doc-001', 'inv-0004', { ...split, entries: [], scenarios: [] }, evidence(state.catalog));
    expect(unrecited.ok).toBe(false);
    if (!unrecited.ok) expect(unrecited.errors.map(error => [error.path, error.message])).toEqual([
      ['entries.0.acceptanceRefs.0', 'Unknown element fr-002'], ['scenarios.0.refs.0', 'Unknown element fr-002'],
    ]);
    // Re-citing the entry alone leaves one new acceptance element no scenario cites.
    const partly = applyCheck(state, 'doc-001', 'inv-0004', { ...split, scenarios: [{ key: 'send-email-is-used', refs: ['sent'] }] }, evidence(state.catalog));
    expect(partly.ok).toBe(false);
    if (!partly.ok) expect(partly.errors).toEqual([expect.objectContaining({ path: 'entries.0.acceptanceRefs.1', expected: 'citations that keep scenario form rule 6' })]);
  });

  test('a re-citation to a retired ID is rejected with its path', () => {
    const state = extracted();
    const split = applyCheck(state, 'doc-001', 'inv-0004', check({
      corrections: [{ action: 'replace', reason: 'Two outcomes.', retire: ['fr-002'], elements: [element('sent', 'functional', 'doc-001')] }],
      entries: [{ capability: 'send-email', requirementRefs: ['fr-001'], acceptanceRefs: ['sent'], contextRefs: [] }],
      scenarios: [{ key: 'send-email-is-used', refs: ['sent'] }],
    }), evidence(state.catalog));
    if (!split.ok) throw new Error(JSON.stringify(split.errors));
    const later = { catalog: split.catalog, analysis: split.analysis };
    const retired = applyCheck(later, 'doc-001', 'inv-0006', check({
      entries: [{ capability: 'send-email', requirementRefs: ['fr-001'], acceptanceRefs: ['fr-003', 'fr-002'], contextRefs: [] }],
    }), evidence(later.catalog));
    expect(retired.ok).toBe(false);
    if (!retired.ok) expect(retired.errors).toEqual([{ path: 'entries.0.acceptanceRefs.1', message: 'unknown element fr-002' }]);
    // A retired ID cannot be retired or rewritten again either.
    const again = applyCheck(later, 'doc-001', 'inv-0006', check({ corrections: [
      { action: 'rewrite', reason: 'Stronger than the plan.', element: { id: 'fr-002', text: 'Weaker.', conditions: [], uncertainty: '' } },
    ] }), evidence(later.catalog));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.errors.map(error => error.path)).toEqual(['corrections.0.element.id']);
  });

  test('rewrites a reading in place, and corrects only elements of its own document', () => {
    const state = extracted();
    const rewritten = applyCheck(state, 'doc-001', 'inv-0004', check({ corrections: [
      { action: 'rewrite', reason: 'The reading made the requirement stronger than the plan.',
        element: { id: 'fr-001', text: 'The module sends one email when asked.', conditions: [{ text: 'when asked', source: 'stated' }], uncertainty: '' } },
    ] }), evidence(state.catalog));
    if (!rewritten.ok) throw new Error(JSON.stringify(rewritten.errors));
    expect(ids(rewritten.catalog)).toEqual(ids(state.catalog));
    expect(rewritten.catalog.elements.find(item => item.id === 'fr-001')).toMatchObject({ kind: 'functional', document: 'doc-001', text: 'The module sends one email when asked.' });
    expect(rewritten.findings).toEqual([expect.objectContaining({ action: 'rewrite', elements: ['fr-001'], retired: [] })]);

    const foreign = applyCheck(state, 'doc-002', 'inv-0005', check({ corrections: [
      { action: 'rewrite', reason: 'Not this document.', element: { id: 'fr-001', text: 'Other.', conditions: [], uncertainty: '' } },
      { action: 'replace', reason: 'Not this document either.', retire: ['nfr-001'], elements: [element('bounded', 'fixed', 'doc-002')] },
    ] }), evidence(state.catalog));
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.errors.map(error => error.path)).toEqual(['corrections.0.element.id', 'corrections.1.retire.0']);
  });

  test('findings name the IDs each correction produced, in correction order', () => {
    const state = extracted();
    const applied = applyCheck(state, 'doc-001', 'inv-0004', check({
      corrections: [
        { action: 'add', reason: 'An omitted limit.', elements: [element('per-hour', 'non-functional', 'doc-001')] },
        { action: 'replace', reason: 'A reclassification: the request is context.', retire: ['fr-001'], elements: [element('why-mail', 'context', 'doc-001')] },
        { action: 'add', reason: 'An omitted outcome.', elements: [element('bounced', 'functional', 'doc-001'), element('prefer-templates', 'recommendation', 'doc-001')] },
      ],
      entries: [{ capability: 'send-email', requirementRefs: ['bounced'], acceptanceRefs: ['fr-002'], contextRefs: ['why-mail'] }],
    }), evidence(state.catalog));
    if (!applied.ok) throw new Error(JSON.stringify(applied.errors));
    expect(applied.findings.map(finding => [finding.action, finding.elements, finding.retired])).toEqual([
      ['add', ['nfr-002'], []], ['replace', ['ctx-001'], ['fr-001']], ['add', ['fr-003', 'rec-002'], []],
    ]);
    expect(applied.findings.every(finding => finding.document === 'doc-001' && finding.invocation === 'inv-0004')).toBe(true);
    expect(applied.analysis.entries[0]).toMatchObject({ requirementRefs: ['fr-003'], acceptanceRefs: ['fr-002'], contextRefs: ['ctx-001'] });
  });
});
