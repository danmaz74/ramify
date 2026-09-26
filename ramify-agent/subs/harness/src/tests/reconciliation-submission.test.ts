import { describe, expect, test } from 'vitest';
import type { CheckFindingCommand } from '../../subs/check-findings/src/interfaces/check-findings.js';
import {
  basisChange, needsLaterRound, nextOf, roundFloor, validateReconciliation, withinFloor, withinModule,
  type AttentionEntry, type ReconciliationContext,
} from '../reviews/reconciliation.js';

/*
 * The rules a reconciliation submission is judged by before the child
 * decides anything (Plan 12 appendix §6): one disposition per CheckFinding
 * that needs one, the round's correction floor, the local architect's waive
 * authority over its own module, a next action that follows from the
 * dispositions, and a user decision's exact citation. Pure: the context is
 * literal, and the child is stood in for by a decision that accepts.
 */

const entry = (risk: AttentionEntry['risk'], extra: Partial<AttentionEntry> = {}): AttentionEntry => ({
  revision: 1, reason: 'new', awaiting: 'assessment', risk, modules: ['app/notes'], ...extra,
});

function context(extra: Partial<ReconciliationContext> = {}): ReconciliationContext & { readonly decided: CheckFindingCommand[] } {
  const decided: CheckFindingCommand[] = [];
  return {
    decided,
    id: 'wi-001.rc02',
    workItem: 'wi-001',
    module: 'app/notes',
    floor: 'non-low',
    laterRoundMinimumRisk: 'medium',
    attention: new Map([['cf-0001', entry('high')], ['cf-0002', entry('low')]]),
    held: new Map([['cf-0001', 1], ['cf-0002', 1], ['cf-0003', 2]]),
    actor: { kind: 'agent', role: 'local-architect', invocation: 'inv-0009' },
    source: { kind: 'tree', id: 'tree-04' },
    evidence: () => [{ kind: 'reconciliation-submission', ref: 'invocations/inv-0009/submission.json', hash: null }],
    // An element of the frozen catalog, bound at the catalog's hash, and a file of the basis source at its tree.
    document: async path => (path === 'fr-002' ? { text: 'A note belongs to exactly one review run.', revision: `sha256:${'c'.repeat(64)}` }
      : path === 'docs/notes.md' ? { text: 'Notes are kept per run.', revision: 'tree-04' } : null),
    decide: command => { decided.push(command); return null; },
    ...extra,
  };
}

const disposition = (checkFinding: string, action: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  checkFinding, rationale: 'assessed', communication: { mode: 'quiet' }, action, ...extra,
});
const submission = (dispositions: unknown[], next: Record<string, unknown>, relations: unknown[] = []) => ({ relations, dispositions, next, brief: 'brief' });

const messages = (result: Awaited<ReturnType<typeof validateReconciliation>>): string[] => (result.ok ? [] : result.errors.map(error => `${error.path}: ${error.message}`));

describe('floors and rounds', () => {
  test('the first round corrects anything, a later one only what clears the minimum, and the last nothing', () => {
    expect([1, 2, 3].map(round => roundFloor(round, 3))).toEqual(['any', 'non-low', 'none']);
    expect(roundFloor(1, 1)).toBe('none');
    expect(withinFloor('any', 'low', 'medium')).toBe(true);
    expect(withinFloor('non-low', 'low', 'medium')).toBe(false);
    expect(withinFloor('non-low', 'medium', 'medium')).toBe(true);
    expect(withinFloor('non-low', 'medium', 'high')).toBe(false);
    expect(withinFloor('none', 'high', 'medium')).toBe(false);
  });

  test('a later round is warranted by a signal that clears the minimum, a claimed repair or a user\'s answer, and never by one waiting for a user', () => {
    expect(needsLaterRound([entry('low')], 'medium')).toBe(false);
    expect(needsLaterRound([entry('medium')], 'medium')).toBe(true);
    expect(needsLaterRound([entry('low', { reason: 'repair-claimed' })], 'medium')).toBe(true);
    expect(needsLaterRound([entry('low', { reason: 'user-decision-answered' })], 'medium')).toBe(true);
    expect(needsLaterRound([entry('high', { awaiting: 'user-decision' })], 'medium')).toBe(false);
  });

  test('the next action follows the dispositions', () => {
    expect(nextOf(['waive', 'fixed'])).toBe('complete');
    expect(nextOf(['waive', 'leave'])).toBe('unresolved');
    expect(nextOf(['leave', 'repair'])).toBe('correct');
    expect(nextOf(['repair', 'request-user-decision'])).toBe('await-user');
  });

  test('a local architect waives within its own module and beneath it', () => {
    expect(withinModule('app/notes', ['app/notes', 'app/notes/store'])).toBe(true);
    expect(withinModule('app/notes', ['app/notes-extra'])).toBe(false);
    expect(withinModule('app/notes', ['app/notes', 'app/cart'])).toBe(false);
  });
});

describe('validating a submission', () => {
  test('a valid submission binds actor, source, authority, revisions and the repair intent, relations first, and leaves no command for a signal left open', async () => {
    const ctx = context();
    const result = await validateReconciliation(submission([
      disposition('cf-0001', { action: 'repair' }, { risk: 'high' }),
      disposition('cf-0002', { action: 'leave' }),
    ], { kind: 'correct', goal: 'Correct it.' }, [
      { from: 'cf-0003', to: 'cf-0001', relation: 'same-issue', shared: 'one behavior', evidence: ['src/a.ts:1'], rationale: 'the same default' },
    ]), ctx);
    expect(messages(result)).toEqual([]);
    if (!result.ok) return;
    expect(result.value.commands).toEqual([
      expect.objectContaining({ type: 'relate', relation: expect.objectContaining({ from: { checkFinding: 'cf-0003', revision: 2 }, to: { checkFinding: 'cf-0001', revision: 1 } }) }),
      {
        type: 'dispose', checkFinding: 'cf-0001', expectedRevision: 1,
        decision: {
          actor: ctx.actor, source: ctx.source, evidence: [...ctx.evidence(result.value.submission)], rationale: 'assessed', communication: { mode: 'quiet' },
          risk: 'high', decision: { action: 'plan-repair', repair: { kind: 'intent', ref: 'wi-001.rc02' } },
        },
      },
    ]);
    expect(ctx.decided).toEqual([{ type: 'assess', commands: result.value.commands }]);
  });

  test('a correction below the floor, a signal left open above it and a waiver outside the module are refused before the child decides', async () => {
    const ctx = context({ attention: new Map([['cf-0001', entry('high', { modules: ['app/cart'] })], ['cf-0002', entry('low')], ['cf-0004', entry('medium')]]) });
    const result = await validateReconciliation(submission([
      disposition('cf-0001', { action: 'waive', uncertainty: 'none' }),
      disposition('cf-0002', { action: 'repair' }),
      disposition('cf-0004', { action: 'leave' }),
    ], { kind: 'correct', goal: 'x' }), ctx);
    expect(messages(result)).toEqual([
      'dispositions.0.action: insufficient-authority: cf-0001 concerns app/cart, and this architect may waive only within app/notes',
      'dispositions.1.action: correction-floor: cf-0002 is of low risk, and this round may plan a correction for a signal of at least medium risk',
      'dispositions.2.action: cf-0004 can be corrected in this round (medium risk, floor non-low); only a signal below the floor is left open',
    ]);
    expect(ctx.decided).toEqual([]);
  });

  test('a risk correction below the floor keeps a repair out of a later round', async () => {
    const result = await validateReconciliation(submission([
      disposition('cf-0001', { action: 'repair' }, { risk: 'low' }),
      disposition('cf-0002', { action: 'leave' }),
    ], { kind: 'correct', goal: 'x' }), context());
    expect(messages(result)).toEqual(['dispositions.0.action: correction-floor: cf-0001 is of low risk, and this round may plan a correction for a signal of at least medium risk']);
  });

  test('every signal needs one disposition, one waiting for someone else none, and the next action must follow', async () => {
    const ctx = context({ attention: new Map([['cf-0001', entry('high')], ['cf-0002', entry('low')], ['cf-0005', entry('high', { awaiting: 'user-decision' })]]) });
    const result = await validateReconciliation(submission([
      disposition('cf-0001', { action: 'fixed', reassessed: ['cfr-0001'] }),
      disposition('cf-0001', { action: 'fixed', reassessed: ['cfr-0001'] }),
      disposition('cf-0005', { action: 'waive', uncertainty: 'none' }),
      disposition('cf-0009', { action: 'supersede', reassessed: ['cfr-0009'], replacement: 'r' }),
    ], { kind: 'complete' }, [{ from: 'cf-0001', to: 'cf-0042', relation: 'distinct', shared: 's', evidence: ['e'], rationale: 'r' }]), ctx);
    expect(messages(result)).toEqual([
      'relations.0.to: cf-0042 is not a CheckFinding of wi-001',
      'dispositions.1.checkFinding: cf-0001 already has the disposition at dispositions.0',
      'dispositions.2.checkFinding: cf-0005 waits for a user\'s answer; it is not this assessment\'s to decide',
      'dispositions.3.checkFinding: cf-0009 is not in this reconciliation\'s attention set',
      'dispositions: cf-0002 is in the attention set and has no disposition',
    ]);
  });

  test('a user decision cites the exact text of a document the harness can read, and its revision is the harness\'s', async () => {
    const options = [{ id: 'a', summary: 'a', consequence: 'a' }, { id: 'b', summary: 'b', consequence: 'b' }];
    const ask = (document: string, text: string) => submission([
      disposition('cf-0001', { action: 'request-user-decision', conflicts: [{ document, text }], options }),
      disposition('cf-0002', { action: 'leave' }),
    ], { kind: 'await-user' });
    expect(messages(await validateReconciliation(ask('fr-002', 'A note belongs to one run.'), context()))).toEqual([
      `dispositions.0.action.conflicts.0.text: The text is not in "fr-002" as it stands at sha256:${'c'.repeat(64)}; cite the conflicting text exactly`,
    ]);
    for (const unknown of ['docs/other.md', 'plan', 'fr-009']) {
      const refused = await validateReconciliation(ask(unknown, 'x'), context());
      expect(messages(refused)).toEqual([
        `dispositions.0.action.conflicts.0.document: "${unknown}" is neither an element of the run's catalog nor a file of the source this reconciliation assesses`,
      ]);
      expect(refused.ok ? [] : refused.errors.map(error => error.expected)).toEqual(['an element ID or a path of the source']);
    }
    const accepted = await validateReconciliation(ask('fr-002', 'exactly one review run'), context());
    expect(accepted.ok && accepted.value.conflicts).toEqual([{ checkFinding: 'cf-0001', conflicts: [{ text: 'exactly one review run', document: 'fr-002', revision: `sha256:${'c'.repeat(64)}` }] }]);
    const sourced = await validateReconciliation(ask('docs/notes.md', 'Notes are kept per run.'), context());
    expect(sourced.ok && sourced.value.conflicts).toEqual([{ checkFinding: 'cf-0001', conflicts: [{ text: 'Notes are kept per run.', document: 'docs/notes.md', revision: 'tree-04' }] }]);
  });

  test('a refusal of the child is returned at the disposition it names', async () => {
    const result = await validateReconciliation(submission([
      disposition('cf-0001', { action: 'fixed', reassessed: ['cfr-0001'] }),
      disposition('cf-0002', { action: 'supersede', reassessed: ['cfr-0002'], replacement: 'r' }),
    ], { kind: 'complete' }), context({ decide: () => ({ code: 'factual-obligation', message: 'cf-0002 is verified by a check', index: 1 }) }));
    expect(messages(result)).toEqual(['dispositions.1: The CheckFinding rules refuse it (factual-obligation): cf-0002 is verified by a check']);
  });
});

describe('the basis', () => {
  const captured = {
    source: { commit: 'revision-03', tree: 'tree-03' },
    requests: [{ request: 'rq-0001', attempt: 'rq-0001.a01', result: 'complete' as const }],
    checkFindings: [{ checkFinding: 'cf-0001', revision: 1 }],
  };
  const current = { source: captured.source, requests: captured.requests, unsettled: [] as string[], revisions: new Map([['cf-0001', 1]]) };

  test('holds while the source, the settled requests and every captured revision hold', () => {
    expect(basisChange(captured, current)).toBeNull();
    // A new CheckFinding is the caller's to weigh, not a changed basis.
    expect(basisChange(captured, { ...current, revisions: new Map([['cf-0001', 1], ['cf-0002', 1]]) })).toBeNull();
  });

  test('names what changed: the source, an unsettled or another request, or a revision', () => {
    expect(basisChange(captured, { ...current, source: { commit: 'revision-04', tree: 'tree-04' } })).toBe('the audited source is revision-04, not revision-03');
    expect(basisChange(captured, { ...current, unsettled: ['rq-0002'] })).toBe('rq-0002 is not settled');
    expect(basisChange(captured, { ...current, requests: [...captured.requests, { request: 'rq-0002', attempt: 'rq-0002.a01', result: 'complete' }] }))
      .toBe('the work item\'s settled review requests changed: rq-0002:rq-0002.a01:complete');
    expect(basisChange(captured, { ...current, revisions: new Map([['cf-0001', 2]]) })).toBe('cf-0001 is at revision 2, not 1');
  });
});
