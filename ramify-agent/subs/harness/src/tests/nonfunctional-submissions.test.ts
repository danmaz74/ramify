import { describe, expect, it } from 'vitest';
import { catalogSchema } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import type { Candidate } from '../../subs/nonfunctional/src/interfaces/contracts.js';
import { coordinatorActionPrompt, coordinatorAssessmentPrompt, repairPrompt } from '../nonfunctional/prompts.js';
import {
  bindCoordinatorAssessment, validateCoordinatorAction, validateCoordinatorInvestigation,
  nonfunctionalRepairSubmissionSchema, type ActionContext,
} from '../nonfunctional/submissions.js';

const candidate: Candidate = { tree: 'a'.repeat(40), head: 'b'.repeat(40), preparedAt: '2026-09-25T00:00:00.000Z' };
const passage = { document: 'doc-001', sha256: 'c'.repeat(64), start: 0, end: 19, quote: 'Latency stays low.\n' };
const catalog = catalogSchema.parse({
  schema: 'ramify-agent.nonfunctional-catalog/1', manifestHash: 'd'.repeat(64),
  items: [
    { id: 'nfr-001', classification: 'non-functional-requirement', passage,
      conditions: [{ text: 'At every intermediate load step', source: 'stated' }], uncertainty: '' },
    { id: 'nfr-002', classification: 'non-functional-requirement', passage: { ...passage, start: 20, end: 39 },
      conditions: [{ text: 'The system may need a retry bound', source: 'inferred' }], uncertainty: 'May be advice' },
    { id: 'adv-001', classification: 'advice', passage: { ...passage, start: 40, end: 59 }, conditions: [], uncertainty: '' },
  ],
});

const results = [
  { nfr: 'nfr-001', result: 'undetermined' as const, inspectedScope: ['src/'], evidence: [], uncertainty: 'No intermediate load measurements' },
  { nfr: 'nfr-002', result: 'not-satisfied' as const, inspectedScope: ['src/'], evidence: ['src/retry.ts'], uncertainty: '' },
];

const binding = {
  catalog, candidate, observedTree: candidate.tree, id: 'nfa-001', round: 1, phase: 'initial' as const,
  coordinatorInvocation: 'inv-0007',
};

function actionContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    decision: { action: 'repair-or-close', round: 1, unresolved: ['nfr-001', 'nfr-002'], closeOutcome: 'continue' },
    results, investigatedNfrs: [], moduleNames: ['app/api'], ...overrides,
  };
}

describe('non-functional coordinator submissions', () => {
  it('binds complete results to harness identity and a fresh tree preview', () => {
    const accepted = bindCoordinatorAssessment({ kind: 'assessment', results }, binding);
    expect(accepted).toMatchObject({ ok: true, value: { id: 'nfa-001', candidate, round: 1, phase: 'initial', coordinatorInvocation: 'inv-0007', results } });
    expect(bindCoordinatorAssessment({ kind: 'assessment', results }, { ...binding, observedTree: 'e'.repeat(40) })).toMatchObject({
      ok: false, errors: [{ path: 'candidate' }],
    });
  });

  it('refuses missing, duplicate and advice IDs; an explicit empty catalog accepts []', () => {
    for (const invalid of [results.slice(0, 1), [...results, results[0]!], [...results, { ...results[0]!, nfr: 'adv-001' }]]) {
      expect(bindCoordinatorAssessment({ kind: 'assessment', results: invalid }, binding).ok).toBe(false);
    }
    const empty = catalogSchema.parse({ ...catalog, items: catalog.items.filter(item => item.classification === 'advice') });
    expect(bindCoordinatorAssessment({ kind: 'assessment', results: [] }, { ...binding, catalog: empty }).ok).toBe(true);
  });

  it('permits sequential investigation of unresolved IDs after the first investigation', () => {
    const investigate = { kind: 'investigate', nfrs: ['nfr-002'], question: 'Inspect the retry path', scope: ['src/retry.ts'] };
    expect(validateCoordinatorAction(investigate, actionContext({ investigatedNfrs: ['nfr-001'] })).ok).toBe(true);
    expect(validateCoordinatorAction({ ...investigate, nfrs: ['nfr-001'] }, actionContext({ investigatedNfrs: ['nfr-001'] })).ok).toBe(false);
    expect(validateCoordinatorAction({ ...investigate, nfrs: ['nfr-001'] }, actionContext({ decision: { action: 'investigate', round: 1, undetermined: ['nfr-001'] } })).ok).toBe(true);
    expect(validateCoordinatorAction(investigate, actionContext({ decision: { action: 'investigate', round: 1, undetermined: ['nfr-001'] } })).ok).toBe(false);
    expect(validateCoordinatorAction({ ...investigate, nfrs: ['nfr-999'] }, actionContext()).ok).toBe(false);
  });

  it('requires investigation of the specific undetermined NFR before repair', () => {
    const repair = { kind: 'repair', nfrs: ['nfr-001'], startingModule: 'app/api', task: 'Measure and bound load time', evidence: [], uncertainty: '' };
    expect(validateCoordinatorAction(repair, actionContext()).ok).toBe(false);
    expect(validateCoordinatorAction(repair, actionContext({ investigatedNfrs: ['nfr-001'] })).ok).toBe(true);
    expect(validateCoordinatorAction({ ...repair, nfrs: ['nfr-002'] }, actionContext()).ok).toBe(true);
    expect(validateCoordinatorAction({ ...repair, startingModule: 'unknown' }, actionContext()).ok).toBe(false);
    expect(validateCoordinatorAction(repair, actionContext({ decision: { action: 'assess', round: 1, phase: 'initial' } })).ok).toBe(false);
  });

  it('closes only with every unresolved NFR and an alternative or explicit uncertainty', () => {
    const close = { kind: 'close', deviations: [
      { nfr: 'nfr-001', proposedAlternative: null, uncertainty: 'No intermediate evidence can be obtained' },
      { nfr: 'nfr-002', proposedAlternative: 'Revise the retry bound', uncertainty: '' },
    ] };
    expect(validateCoordinatorAction(close, actionContext()).ok).toBe(true);
    expect(validateCoordinatorAction({ ...close, deviations: close.deviations.slice(0, 1) }, actionContext()).ok).toBe(false);
    expect(validateCoordinatorAction({ ...close, deviations: [{ ...close.deviations[0]!, uncertainty: '' }, close.deviations[1]!] }, actionContext()).ok).toBe(false);
  });

  it('binds investigation output to exactly the requested IDs and does not call it satisfaction', () => {
    const result = { kind: 'investigation-result', summary: 'Inspected load path', findings: [
      { nfr: 'nfr-001', inspectedScope: ['src/'], evidence: ['trace-1'], uncertainty: 'No intermediate trace' },
    ] };
    expect(validateCoordinatorInvestigation(result, ['nfr-001']).ok).toBe(true);
    expect(validateCoordinatorInvestigation(result, ['nfr-002']).ok).toBe(false);
    expect(validateCoordinatorInvestigation({ ...result, findings: [result.findings[0]!, result.findings[0]!] }, ['nfr-001']).ok).toBe(false);
  });

  it('repair reports work without a satisfaction verdict', () => {
    expect(nonfunctionalRepairSubmissionSchema.safeParse({ kind: 'completed', summary: 'Changed two modules', evidence: [], remaining: [] }).success).toBe(true);
    expect(nonfunctionalRepairSubmissionSchema.safeParse({ kind: 'partial', summary: 'Changed one module', evidence: [], remaining: ['Second module'] }).success).toBe(true);
    expect(nonfunctionalRepairSubmissionSchema.safeParse({ kind: 'completed', summary: 'Changed source', evidence: [], remaining: [], satisfied: true }).success).toBe(false);
  });

  it('preserves original quoted passages and stated/inferred conditions in the prompt', () => {
    const assessment = coordinatorAssessmentPrompt(catalog, candidate, 1, 'initial');
    expect(assessment).toContain(JSON.stringify(passage.quote));
    expect(assessment).toContain('At every intermediate load step');
    expect(assessment).toContain('"source": "inferred"');
    expect(assessment).toContain('temporal condition lacks observed intermediate evidence');
    expect(assessment).not.toContain('capability progress as evidence');
    expect(coordinatorActionPrompt(candidate, ['nfr-001'], ['nfr-001'])).toContain('one repair batch');
    expect(repairPrompt('Bound retries', candidate, catalog, ['nfr-001'], 'app/api')).toContain(JSON.stringify(passage.quote));
  });
});
