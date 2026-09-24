import { describe, expect, test } from 'vitest';
import { decideCheckFindingChange } from '../../subs/check-findings/src/decide.js';
import { applyCheckFindingEvent, emptyCheckFindingState } from '../../subs/check-findings/src/replay.js';
import type { CheckFindingActor, CheckFindingCommand, CheckFindingState } from '../../subs/check-findings/src/interfaces/check-findings.js';
import { authorityRank, mayRevoke, mayWaive, userCheckFindingChange } from '../check-findings/user-commands.js';
import { concern, decision, dispose, failure, report } from './helpers/check-findings.js';

/*
 * The authority rules the harness validates before the child decides a
 * waiver or a revocation (appendix §10), and the mapping of a person's
 * command to one child decision bound to the revision the person saw.
 */

const user: CheckFindingActor = { kind: 'user', name: 'dan' };
const global: CheckFindingActor = { kind: 'agent', role: 'global-architect', invocation: 'inv-0002' };
const local: CheckFindingActor = { kind: 'agent', role: 'local-architect', invocation: 'inv-0020' };
const reviewer: CheckFindingActor = { kind: 'agent', role: 'reviewer', invocation: 'inv-0010' };
const harness: CheckFindingActor = { kind: 'harness', reason: 'a re-raise of a waived issue' };

function decided(commands: readonly CheckFindingCommand[]): CheckFindingState {
  let state = emptyCheckFindingState();
  for (const command of commands) {
    const change = decideCheckFindingChange(state, command);
    if (!change.ok) throw new Error(change.rejection.message);
    for (const event of change.events) {
      const applied = applyCheckFindingEvent(state, event);
      if (!applied.ok) throw new Error(applied.rejection.message);
      state = applied.state;
    }
  }
  return state;
}

describe('waive and revoke authority', () => {
  test('ranks: the user, then the global architect, then a local architect, then the harness; a reviewer has none', () => {
    expect([user, global, local, harness, reviewer].map(authorityRank)).toEqual([3, 2, 1, 0, -1]);
  });

  test('the user and the global architect may waive any signal; a local architect only one within its own module', () => {
    expect(mayWaive(user, ['project/cart', 'project/checkout'], null)).toBe(true);
    expect(mayWaive(global, ['project/cart', 'project/checkout'], null)).toBe(true);
    expect(mayWaive(local, ['project/cart', 'project/cart/prices'], 'project/cart')).toBe(true);
    expect(mayWaive(local, ['project/cart', 'project/checkout'], 'project/cart')).toBe(false);
    expect(mayWaive(local, ['project/cart'], null)).toBe(false);
    expect(mayWaive(reviewer, ['project/cart'], 'project/cart')).toBe(false);
    expect(mayWaive(harness, ['project/cart'], 'project/cart')).toBe(false);
  });

  test('a revocation needs a rank at least the waiver actor\'s; the user revokes any', () => {
    for (const waiver of [user, global, local, harness]) expect(mayRevoke(user, waiver)).toBe(true);
    expect(mayRevoke(global, local)).toBe(true);
    expect(mayRevoke(global, global)).toBe(true);
    expect(mayRevoke(global, user)).toBe(false);
    expect(mayRevoke(local, local)).toBe(true);
    expect(mayRevoke(local, harness)).toBe(true);
    expect(mayRevoke(local, global)).toBe(false);
    expect(mayRevoke(harness, harness)).toBe(false);
    expect(mayRevoke(reviewer, harness)).toBe(false);
  });
});

describe('a person\'s command as one child decision', () => {
  const state = decided([
    report(concern()),
    report(failure({ attempt: 'ga-0005', subject: 'scenario:sc-004', tree: 't-02' })),
    dispose('cf-0001', 1, decision({ action: 'waive', authority: { kind: 'work-item-assessment', ref: 'wi-001.rc01' }, acceptedRisk: 'medium', uncertainty: 'little' })),
  ]);
  const payload = { planId: 'review-notes', jobId: 'run-1', responder: 'dan' };

  test('a revocation of the architect\'s waiver is the person\'s, against the latest source, and names the command', () => {
    const change = userCheckFindingChange({ commandId: 'c-1', expectedVersion: 4, type: 'revoke-check-finding-waiver',
      payload: { ...payload, checkFinding: 'cf-0001', expectedRevision: 2, reason: 'The duplicate will drift' } }, state.findings.get('cf-0001'));
    expect(change).toEqual({ ok: true, command: { type: 'dispose', checkFinding: 'cf-0001', expectedRevision: 2, decision: {
      actor: user, source: { kind: 'tree', id: 't-01' }, rationale: 'The duplicate will drift',
      evidence: [{ kind: 'user-command', ref: 'c-1', hash: null }], communication: { mode: 'quiet' },
      decision: { action: 'revoke-waiver', reason: 'The duplicate will drift' },
    } } });
  });

  test('a waiver accepts the current risk under the command\'s authority; the child then refuses it for a required check', () => {
    const change = userCheckFindingChange({ commandId: 'c-2', expectedVersion: 4, type: 'waive-check-finding',
      payload: { ...payload, checkFinding: 'cf-0002', expectedRevision: 1, reason: 'flaky' } }, state.findings.get('cf-0002'));
    expect(change).toMatchObject({ ok: true, command: { decision: { decision: { action: 'waive', authority: { kind: 'user-decision', ref: 'c-2' }, acceptedRisk: 'high' } } } });
    if (!change.ok) throw new Error('refused');
    expect(decideCheckFindingChange(state, change.command)).toMatchObject({ ok: false, rejection: { code: 'required-obligation' } });
  });

  test('an unknown CheckFinding, a moved revision and an answer to no pending request are refused before the child', () => {
    expect(userCheckFindingChange({ commandId: 'c-3', expectedVersion: 4, type: 'waive-check-finding',
      payload: { ...payload, checkFinding: 'cf-0009', expectedRevision: 1, reason: 'x' } }, undefined)).toMatchObject({ ok: false, code: 'not-found' });
    expect(userCheckFindingChange({ commandId: 'c-4', expectedVersion: 4, type: 'revoke-check-finding-waiver',
      payload: { ...payload, checkFinding: 'cf-0001', expectedRevision: 1, reason: 'x' } }, state.findings.get('cf-0001')))
      .toEqual({ ok: false, code: 'conflict', message: expect.stringContaining('revision 2, not 1'), evidence: ['cf-0001 is at revision 2'] });
    expect(userCheckFindingChange({ commandId: 'c-5', expectedVersion: 4, type: 'respond-to-check-finding',
      payload: { ...payload, checkFinding: 'cf-0002', expectedRevision: 1, request: 'cfd-0001', option: 'keep' } }, state.findings.get('cf-0002')))
      .toMatchObject({ ok: false, code: 'conflict', message: expect.stringContaining('awaits none') });
  });
});
