import { describe, expect, test } from 'vitest';
import { loadPromptPackages, renderEngineerPrompt } from '../prompts/packages.js';
import { iterationMessage } from '../work/engineer.js';
import type { IterationAssignment } from '../work/iterations.js';
import { declaredCheckInputs, moduleInputPointers } from '../work/starting-inputs.js';

/** Only what the message reads of an assignment. */
function assignment(): IterationAssignment {
  return {
    id: 'wi-001.i01',
    goal: 'Add the count tool.',
    approach: 'Extend mcp.ts.',
    completionEvidence: 'A test calls the tool.',
    scope: {
      base: { module: 'app/reviews', included: [] },
      bootstrap: [],
      resolved: { excluded: [], included: [], ownership: { provider: 'ramify.affected-cli/4', ramifyVersion: 'scripted-lifecycle-only', inputId: 'scripted-scope', configuration: 'tsconfig.json', root: '/p', modules: [{ id: 'app', parent: null, directory: '.' }], exclusions: [] }, roots: ['/p/subs/reviews'], files: [] },
    },
    gate: { checkpoint: 'iteration', tests: { policy: 'owned-by-scope', exactOwners: ['app/reviews'], subtrees: [], extraSuites: [] } },
    externalCapabilities: [],
  } as unknown as IterationAssignment;
}

describe('what an engineer is told about the Ramify project it works in', () => {
  test('known setup renders the declared project runner and rooted references without an invented focused command', () => {
    const setup = declaredCheckInputs({ projectRoot: '/p', paths: ['ramify-audit.json', 'checks/cucumber.json'], checks: [
      { id: 'scenario-check', executor: { kind: 'command', commands: [{ cmd: 'npm', args: ['run', 'acceptance', '--', '--profile', 'integration'], cwd: 'checks', parser: 'cucumber', env: { WORLD: 'secret-value' } }] } },
    ] });
    const message = iterationMessage({ assignment: assignment(), projectRoot: '/p', workingDirectory: '/p/subs/reviews/src', base: 'abc', setup });
    expect(message).toContain('argv ["npm","run","acceptance","--","--profile","integration"]; cwd `/p/checks`');
    expect(message).toContain('`/p/checks/cucumber.json`');
    expect(message).toContain('environment names: WORLD');
    expect(message).not.toContain('secret-value'); expect(message).not.toContain('npx vitest');
    expect(declaredCheckInputs({ projectRoot: '/p', checks: [] })).toBe('');
  });

  test('module pointers keep module-cwd and selector-workspace references rooted and testing modules use their known test area', () => {
    const pointers = moduleInputPointers({ projectRoot: '/p', modules: [{ module: 'app/checks', directory: 'subs/checks', apiPaths: ['subs/checks/src/.ramify'] }],
      testAreas: [{ module: 'app/checks', area: 'subs/checks/src' }] });
    expect(pointers).toContain('declaration `/p/subs/checks/module.ramify`');
    expect(pointers).toContain('Test area: `/p/subs/checks/src/`');
    expect(pointers).toContain('Observed API view: `/p/subs/checks/src/.ramify/`');
    expect(pointers).not.toContain('src/tests/');
  });
  test('the system prompt says what crosses a module boundary, where the answer is and how an unexposed symbol is reported', async () => {
    const { packages } = await loadPromptPackages();
    const prompt = renderEngineerPrompt(packages.get('engineer')!, '/p');
    expect(prompt).toContain('## This is a Ramify project');
    expect(prompt).toContain('only the symbols your module\n  *receives*');
    expect(prompt).toContain('`import type` is checked exactly as a value import is');
    expect(prompt).toContain('`.ramify/external` and `.ramify/children`');
    expect(prompt).toContain('`tests/.ramify/external` and `tests/.ramify/children`');
    expect(prompt).toContain('Foreign source never establishes importability');
    expect(prompt).toContain('`RAMIFY MODULE VIOLATION`');
    expect(prompt).toContain('the harness\nchecks your whole write scope once more before it accepts');
    expect(prompt).toContain('submit `capability-needed` with the actual usage');
    expect(prompt).toContain('do not copy its definition');
    expect(prompt).toContain('Expose a symbol together with every named type its signature mentions');
    expect(prompt).toContain('cannot use it cleanly');
    expect(prompt).not.toContain('Awaited<');
    expect(prompt).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
  });

  test('the iteration message names the API view of each module it writes', () => {
    const text = iterationMessage({
      assignment: assignment(),
      projectRoot: '/p',
      base: 'abc',
      views: [{ module: 'app/reviews', views: [{ area: 'ordinary', path: 'subs/reviews/src/.ramify', revision: 'rev/1:current:2', coverage: null }], unavailable: null }],
    });
    expect(text).toContain('## What you may import');
    expect(text).toContain('- `app/reviews` (ordinary): `subs/reviews/src/.ramify/` (project-relative; open `/p/subs/reviews/src/.ramify/` from this cwd); revision `rev/1:current:2`; coverage complete, so a symbol it does not list is not importable.');
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

  test('capability assignments and gate repairs retain the current handback and execution controls', async () => {
    const text = iterationMessage({ assignment: assignment(), projectRoot: '/p', base: 'abc', capabilityWorkflow: true,
      views: [{ module: 'app/reviews', views: [{ area: 'ordinary', path: 'subs/reviews/src/.ramify', revision: 'r1', coverage: null }], unavailable: null }],
      failedGate: { id: 'ga-1', cause: 'check', summary: ['A required check failed.'] } });
    expect(text).toContain('reported with `capability-needed`');
    expect(text).not.toContain('reported with `unsuitable`, reason `scope`');
    expect(text).not.toContain('`git diff');
    expect(text).toContain('A required check failed.');
    const { packages } = await loadPromptPackages();
    expect(renderEngineerPrompt(packages.get('engineer')!, '/p')).not.toContain('one\n  repair round');
  });

  test('the iteration message names the owners\' test areas as text and leaves every test run to the gate\'s audit', () => {
    const text = iterationMessage({
      assignment: assignment(), projectRoot: '/p', base: 'abc',
      testAreas: [{ module: 'app/reviews', area: 'subs/reviews/src/tests' }],
    });
    expect(text).toContain('The gate commits a candidate and asks for the project\'s committed audit of it at the `iteration` checkpoint:');
    expect(text).toContain('The tests this assignment owns are those of app/reviews, in:\n- `subs/reviews/src/tests/` (`app/reviews`)');
    expect(text).toContain('A whole-suite run is refused there: the gate\'s audit runs it.');
    expect(text).not.toContain('run_scope_tests');
    // Without assigned scenarios, the audit's description names none.
    expect(text).toContain('its tests among them');
    expect(text).not.toContain('tests and scenarios among them');
  });

  test('no role\'s prompt package offers a scoped test tool or a harness scenario run', async () => {
    for (const capabilityWorkflow of [true, false]) {
      const { packages } = await loadPromptPackages({ capabilityWorkflow });
      for (const [role, loaded] of packages) {
        const texts = [loaded.system, loaded.procedure, loaded.skill, loaded.extraSkill, loaded.submissionSchema,
          ...Object.values(loaded.reviewer?.procedures ?? {}), loaded.reconciliation?.procedure ?? '', loaded.workOrientation?.procedure ?? ''];
        for (const text of texts) {
          expect(text, role).not.toContain('run_scope_tests');
          expect(text, role).not.toMatch(/acceptance:quick|quick mode|scenario check mode/u);
        }
      }
    }
  });
});
