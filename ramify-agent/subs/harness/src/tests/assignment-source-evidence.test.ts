import { describe, expect, test } from 'vitest';
import type { ContextSelection } from '../context-selection/contracts.js';
import { contractMessage } from '../contracts/session.js';
import { iterationMessage } from '../work/engineer.js';
import type { IterationAssignment } from '../work/iterations.js';
import { validateLocalArchitect } from '../work/submission.js';
import { assign } from './helpers/iterations.js';

const selection = {
  schema: 'ramify-agent.context-selection/1', workItem: 'wi-001', orientationInvocation: 'orient-1',
  orientationPoint: null, selectorInvocation: 'select-1', degraded: true,
  examined: ['nfr-001', 'adv-001'], selected: [{ item: 'nfr-001', passage: {
    document: 'doc-001', sha256: 'a'.repeat(64), start: 0, end: 8, quote: 'Keep fast',
  }, reason: 'This module owns the warm path', conditions: [], uncertainty: '' }],
  unavailable: [], packageHash: 'b'.repeat(64),
} satisfies ContextSelection;
const evidence = { index: null, registry: new Map(), selection };

const assignment = {
  id: 'wi-001.i01', goal: 'Implement the endpoint', approach: 'Change the handler.', completionEvidence: 'Tests pass',
  scope: { base: { module: 'app/reviews', includedChildren: [] }, bootstrap: [],
    resolved: { roots: ['/p/subs/reviews'], files: [] }, extra: [] },
  gate: { checkpoint: 'iteration', tests: { policy: 'owned-by-scope', exactOwners: ['app/reviews'], subtrees: [], extraSuites: [] } },
  externalCapabilities: [],
} as unknown as IterationAssignment;
const sourceEvidence = '## nfr-001: non-functional-requirement\nSource: plans/sample/plan.md\nExact captured source passage:\nKeep fast';

describe('assignment source citations', () => {
  test('new selection requires an explicit array and only selected, unique IDs', () => {
    const missing = validateLocalArchitect(assign('app/reviews', { citedItems: undefined }), evidence);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.map(error => error.path)).toContain('assignment.citedItems');
    expect(validateLocalArchitect(assign('app/reviews', { citedItems: [] }), evidence).ok).toBe(true);
    expect(validateLocalArchitect(assign('app/reviews', { citedItems: ['nfr-001'] }), evidence).ok).toBe(true);
    const invalid = validateLocalArchitect(assign('app/reviews', { citedItems: ['adv-001', 'nfr-001', 'nfr-001'] }), evidence);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errors.map(error => error.path)).toEqual(['assignment.citedItems.0', 'assignment.citedItems.2']);
    expect(validateLocalArchitect(assign('app/reviews', { citedItems: undefined }), { index: null, registry: new Map() }).ok).toBe(true);
  });

  test('engineer and contract briefs render the same evidence without rewriting approach', () => {
    const engineer = iterationMessage({ assignment, projectRoot: '/p', base: 'abc', sourceEvidence });
    const contract = contractMessage({ assignment, projectRoot: '/p', base: 'abc',
      consumer: { module: 'app/reviews', iteration: null }, provider: 'app/core', existingConsumers: [], sourceEvidence });
    const continuedContract = contractMessage({ assignment, projectRoot: '/p', base: 'abc',
      consumer: { module: 'app/reviews', iteration: null }, provider: 'app/core', existingConsumers: [], sourceEvidence,
      failedGate: { id: 'ga-002', cause: 'in-scope', summary: ['The conformance test failed'] } });
    expect(engineer).toContain(sourceEvidence);
    expect(contract).toContain(sourceEvidence);
    expect(continuedContract).toContain(sourceEvidence);
    expect(continuedContract).toContain('The conformance test failed');
    expect(engineer).toContain('## Approach the architect asked for\n\nChange the handler.');
    expect(engineer).not.toContain(`## Approach the architect asked for\n\n${sourceEvidence}`);
  });
});
