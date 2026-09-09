import { describe, expect, it } from 'vitest';
import { validateProject } from '../../subs/analysis/src/validation-entry.js';
import { plan1Instances } from './cases.js';
import { linkingHandlers } from './linking-cases.js';
import { assertReference, validated, validationInputs } from './linking-expectations.js';
import { Assertions } from './runner.js';

describe('iteration 7 integration evidence', () => {
  it('implements exactly every assigned matrix instance and syntax variant', () => {
    expect([...linkingHandlers.keys()].sort()).toEqual(plan1Instances.filter(instance => instance.iteration === 7).map(instance => instance.id).sort());
  });
  it('matches the unchanged reference contract map statement by statement', async () => {
    const assertions = new Assertions();
    const result = await validated('examples/collection-review', assertions);
    assertReference(result, assertions);
    expect(assertions.finish().every(item => item.status === 'passed')).toBe(true);
  }, 90_000);
  it('validates all nine current toolkit descriptions against actual staged exports', async () => {
    const result = await validateProject(validationInputs('.'));
    expect(result.status, JSON.stringify('diagnostics' in result ? result.diagnostics : '')).toBe('valid');
    if (result.status !== 'valid') throw new Error(JSON.stringify(result));
    expect(result.input.inventory.modules.map(module => module.id).sort()).toEqual([
      'ramify', 'ramify/analysis', 'ramify/analysis/model', 'ramify/analysis/descriptions', 'ramify/analysis/project',
      'ramify/analysis/typescript', 'ramify/presentation', 'ramify/presentation/layout', 'ramify/cli',
    ].sort());
    expect(result.linked.selections.some(item => item.pairs.some(pair => pair.name === 'validateProject'))).toBe(true);
    expect(result.linked.selections.flatMap(item => item.pairs).some(pair => pair.name === 'createAnalysisSession')).toBe(false);
  }, 90_000);
});
