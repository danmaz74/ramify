import { describe, expect, test } from 'vitest';
import { loadPromptPackages, renderEngineerPrompt } from '../prompts/packages.js';
import { iterationMessage } from '../work/engineer.js';
import type { IterationAssignment } from '../work/iterations.js';

/** Only what the message reads of an assignment. */
function assignment(): IterationAssignment {
  return {
    id: 'wi-001.i01',
    goal: 'Add the count tool.',
    approach: 'Extend mcp.ts.',
    completionEvidence: 'A test calls the tool.',
    scope: {
      base: { module: 'app/reviews', includedChildren: [] },
      bootstrap: [],
      resolved: { roots: ['/p/subs/reviews'], files: [] },
    },
    gate: { checkpoint: 'iteration', tests: { policy: 'owned-by-scope', exactOwners: ['app/reviews'], subtrees: [], extraSuites: [] } },
    externalCapabilities: [],
  } as unknown as IterationAssignment;
}

describe('what an engineer is told about the Ramify project it works in', () => {
  test('the system prompt says what crosses a module boundary, where the answer is and how an unexposed symbol is reported', async () => {
    const { packages } = await loadPromptPackages();
    const prompt = renderEngineerPrompt(packages.get('engineer')!, '/p');
    expect(prompt).toContain('## This is a Ramify project');
    expect(prompt).toContain('only the symbols your module\n  *receives*');
    expect(prompt).toContain('`import type` is checked exactly as a value import is');
    expect(prompt).toContain('`src/.ramify/`');
    expect(prompt).toContain('`src/tests/.ramify/`');
    expect(prompt).toContain('not by reading\nother modules\' source');
    expect(prompt).toContain('`RAMIFY MODULE VIOLATION`');
    expect(prompt).toContain('the harness\nchecks your whole write scope once more before it accepts');
    expect(prompt).toContain('submit `unsuitable` with reason `scope`');
    expect(prompt).toContain('do not copy its definition');
    expect(prompt).toContain('Expose a symbol together with every named type its signature mentions');
    expect(prompt).toContain('it is an incomplete exposure');
    expect(prompt).not.toContain('Awaited<');
    expect(prompt).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
  });

  test('the iteration message names the API view of each module it writes', () => {
    const text = iterationMessage({
      assignment: assignment(),
      projectRoot: '/p',
      base: 'abc',
      views: [{ module: 'app/reviews', views: [{ area: 'ordinary', path: 'subs/reviews/src/.ramify', coverage: null }], unavailable: null }],
    });
    expect(text).toContain('## What you may import');
    expect(text).toContain('- `app/reviews` (ordinary): `subs/reviews/src/.ramify/`; coverage complete, so a symbol it does not list is not importable.');
    expect(text).toContain('reported with `unsuitable`, reason `scope`');
  });

  test('a module without a view is told that absence is not permission', () => {
    const text = iterationMessage({
      assignment: assignment(),
      projectRoot: '/p',
      base: 'abc',
      views: [{ module: 'app/reviews', views: [], unavailable: 'the API view could not be materialized: daemon down' }],
    });
    expect(text).toContain('no API view, because the API view could not be materialized: daemon down. Absence of a view is not permission');
  });
});
