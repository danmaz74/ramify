import { describe, expect, test } from 'vitest';
import { contractMessage } from '../contracts/session.js';
import { assignmentErrors } from '../work/assignment.js';
import { iterationMessage } from '../work/engineer.js';
import type { IterationAssignment } from '../work/iterations.js';
import { validateLocalArchitect } from '../work/submission.js';
import { assign } from './helpers/iterations.js';

const assignment = {
  id: 'wi-001.i01', goal: 'Implement the endpoint', approach: 'Change the handler.', completionEvidence: 'Tests pass',
  scope: { base: { module: 'app/reviews', includedChildren: [] }, bootstrap: [],
    resolved: { roots: ['/p/subs/reviews'], files: [] }, extra: [] },
  gate: { checkpoint: 'iteration', tests: { policy: 'owned-by-scope', exactOwners: ['app/reviews'], subtrees: [], extraSuites: [] } },
  externalCapabilities: [],
} as unknown as IterationAssignment;
const packageText = '# Plan context package\n\nCatalog: abc\nElements: fr-001, nfr-001\nDeviations: none\n\n## Functional requirements\n\n### fr-001: functional requirement from plans/sample/plan.md\n\n> Keep fast\n';
const body = (citedElements: unknown) => ({ ...assign('app/reviews').assignment, citedElements }) as ReturnType<typeof assign>['assignment'];
const evidence = { index: null, registry: new Map(), outline: null, package: new Set(['fr-001', 'fr-002', 'nfr-001']) };

describe('assignment element citations', () => {
  test('an assignment cites an explicit array of elements; the removed fields are refused', () => {
    const missing = validateLocalArchitect(assign('app/reviews', { citedElements: undefined as unknown as string[] }), { index: null, registry: new Map() });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.map(error => error.path)).toContain('assignment.citedElements');
    expect(validateLocalArchitect(assign('app/reviews', { citedElements: [] }), { index: null, registry: new Map() }).ok).toBe(true);
    for (const removed of [{ citedItems: [] }, { requirementRefs: [{ anchor: 'Request' }] }]) {
      const refused = validateLocalArchitect({ ...assign('app/reviews'), assignment: { ...assign('app/reviews').assignment, ...removed } }, { index: null, registry: new Map() });
      expect(refused.ok).toBe(false);
    }
  });

  test('only IDs of the work-item package, each once, with the path of each offender', () => {
    expect(assignmentErrors(body([]), evidence)).toEqual([]);
    expect(assignmentErrors(body(['fr-001', 'nfr-001']), evidence)).toEqual([]);
    const errors = assignmentErrors(body(['fr-001', 'Request', 'nfr-009', 'fr-001']), evidence);
    expect(errors.map(error => error.path)).toEqual(['assignment.citedElements.1', 'assignment.citedElements.2', 'assignment.citedElements.3']);
    expect(errors[0]).toMatchObject({ message: '"Request" is not an element of this work item\'s package', expected: 'an element ID of the work-item package' });
    expect(errors[2]).toMatchObject({ message: '"fr-001" is cited more than once' });
    // A run without a catalog has no package to judge against.
    expect(assignmentErrors(body(['nfr-009']), { ...evidence, package: undefined })).toEqual([]);
  });

  test('engineer and contract briefs render the same package once, without rewriting the approach', () => {
    const engineer = iterationMessage({ assignment, projectRoot: '/p', base: 'abc', package: packageText });
    const contract = contractMessage({ assignment, projectRoot: '/p', base: 'abc',
      consumer: { module: 'app/reviews', iteration: null }, provider: 'app/core', existingConsumers: [], package: packageText });
    const continuedContract = contractMessage({ assignment, projectRoot: '/p', base: 'abc',
      consumer: { module: 'app/reviews', iteration: null }, provider: 'app/core', existingConsumers: [], package: packageText,
      failedGate: { id: 'ga-002', cause: 'in-scope', summary: ['The conformance test failed'] } });
    expect(engineer).toContain(`## What the plan asks of this iteration\n\nThe elements your assignment cites, whole, with the plan deviations in force when it was assigned. The captured documents are not yours to read: what these elements do not settle is a finding.\n\n${packageText.trimEnd()}\n`);
    expect(contract).toContain(`## What the plan asks of the requesting iteration\n\nThe elements its assignment cites, whole, with the plan deviations in force when it was assigned.\n\n${packageText.trimEnd()}\n`);
    expect(continuedContract).toContain(packageText.trimEnd());
    expect(continuedContract).toContain('The conformance test failed');
    expect(engineer.split(packageText.trimEnd())).toHaveLength(2);
    expect(engineer).toContain('## Approach the architect asked for\n\nChange the handler.');
    expect(engineer).not.toContain(`## Approach the architect asked for\n\n${packageText}`);
    // A continued session's brief carries no package: it is given once.
    expect(iterationMessage({ assignment, projectRoot: '/p', base: 'abc' })).not.toContain('## What the plan asks of this iteration');
    expect(contractMessage({ assignment, projectRoot: '/p', base: 'abc', consumer: { module: 'app/reviews', iteration: null },
      provider: 'app/core', existingConsumers: [] })).not.toContain('## What the plan asks of the requesting iteration');
  });
});
