import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { scenarioRunSummarySchema, summarizeScenarioRun, type ScenarioRunSummary, type TrackedScenario } from '../messages.js';

/*
 * The reducer over the streams `fixtures/record-streams.ts` recorded with the
 * real cucumber-js over `fixtures/sample-project/`. The tracked file carries
 * sc-001 to sc-007 (sc-007 bound, so pending-tagged); `own.feature` holds the
 * project's own scenarios, two passing and one failing. No test here starts
 * the runner.
 */

const here = fileURLToPath(new URL('.', import.meta.url));
const file = 'subs/shelf/src/tests/features/demo-plan/shelf.feature';
const steps = 'subs/shelf/src/tests/steps/shelf.steps.ts';
const tracked: TrackedScenario[] = ['sc-001', 'sc-002', 'sc-003', 'sc-004', 'sc-005', 'sc-006', 'sc-007'].map((id) => ({ id, file }));

function stream(name: string): string {
  return readFileSync(join(here, 'fixtures/streams', `${name}.ndjson`), 'utf8');
}

function summarize(name: string, scenarios: readonly TrackedScenario[] = tracked): ScenarioRunSummary {
  const summary = summarizeScenarioRun(stream(name), scenarios);
  expect(scenarioRunSummarySchema.parse(summary)).toEqual(summary);
  return summary;
}

const others = (...ids: string[]): string[] => tracked.map((scenario) => scenario.id).filter((id) => !ids.includes(id));

describe('one recording per outcome', () => {
  test('passing: status, file, line and the definition that bound each step', () => {
    const summary = summarize('passing');
    expect(summary.scenarios).toEqual([{
      id: 'sc-001',
      status: 'passed',
      file,
      line: 10,
      binding: [
        { step: 'Given an empty shelf', definition: `${steps}:8` },
        { step: 'When the user shelves "Dune"', definition: `${steps}:12` },
        { step: 'Then the shelf lists 1 book', definition: `${steps}:28` },
      ],
      undefined: [],
    }]);
    expect(summary.excluded).toEqual(others('sc-001'));
    expect(summary.untracked).toEqual({ passed: 0, skipped: 0, failed: 0 });
    expect(summary.finished).toEqual({ success: true });
    expect(summary.malformedLines).toEqual([]);
  });

  test('failing: the failing step and the assertion\'s message', () => {
    const summary = summarize('failing');
    expect(summary.scenarios).toHaveLength(1);
    const [scenario] = summary.scenarios;
    expect(scenario).toMatchObject({ id: 'sc-002', status: 'failed', line: 16, undefined: [] });
    expect(scenario!.failure!.step).toBe('Then the shelf lists 2 books');
    expect(scenario!.failure!.message).toMatch(/^AssertionError/);
    expect(scenario!.failure!.message).toContain('1 !== 2');
    expect(summary.finished).toEqual({ success: false });
  });

  test('undefined: the step text with no definition, and the steps that did bind', () => {
    const [scenario] = summarize('undefined').scenarios;
    expect(scenario).toEqual({
      id: 'sc-003',
      status: 'undefined',
      file,
      line: 22,
      binding: [
        { step: 'Given an empty shelf', definition: `${steps}:8` },
        { step: 'Then the shelf lists 0 books', definition: `${steps}:28` },
      ],
      failure: { step: 'When the user lends "Dune" to Ada', message: 'No step definition matches this step' },
      undefined: ['the user lends "Dune" to Ada'],
    });
  });

  test('ambiguous: one binding entry per matching definition', () => {
    const [scenario] = summarize('ambiguous').scenarios;
    expect(scenario).toMatchObject({ id: 'sc-004', status: 'ambiguous', line: 28 });
    expect(scenario!.binding.filter((entry) => entry.step === 'When the user dusts the shelf')).toEqual([
      { step: 'When the user dusts the shelf', definition: `${steps}:20` },
      { step: 'When the user dusts the shelf', definition: `${steps}:22` },
    ]);
    expect(scenario!.failure).toEqual({ step: 'When the user dusts the shelf', message: 'More than one step definition matches this step' });
  });

  test('pending: the pending step', () => {
    const [scenario] = summarize('pending').scenarios;
    expect(scenario).toMatchObject({
      id: 'sc-005',
      status: 'pending',
      line: 34,
      failure: { step: 'When the user sorts the shelf', message: 'The step definition is pending' },
    });
  });

  test('an outline with a failing example: one scenario, the worst of its pickles, both examples\' bindings', () => {
    const summary = summarize('outline');
    expect(summary.scenarios).toHaveLength(1);
    const [scenario] = summary.scenarios;
    expect(scenario).toMatchObject({ id: 'sc-006', status: 'failed', line: 40 });
    expect(scenario!.binding.map((entry) => entry.step)).toEqual([
      'Given an empty shelf',
      'When the user shelves 1 books',
      'Then the shelf lists 1 books',
      'When the user shelves 2 books',
      'Then the shelf lists 3 books',
    ]);
    expect(scenario!.failure!.step).toBe('Then the shelf lists 3 books');
    expect(scenario!.failure!.message).toContain('2 !== 3');
  });

  test('a bound scenario runs when its identity selects it, pending tag and all', () => {
    const summary = summarize('bound');
    expect(summary.scenarios.map((scenario) => [scenario.id, scenario.status, scenario.line])).toEqual([['sc-001', 'passed', 10], ['sc-007', 'passed', 50]]);
    expect(summary.excluded).toEqual(others('sc-001', 'sc-007'));
    expect(summary.finished).toEqual({ success: true });
  });

  test('all-untagged: every tracked scenario but the pending one, and the project\'s own by count', () => {
    const summary = summarize('all-untagged');
    expect(summary.scenarios.map((scenario) => [scenario.id, scenario.status])).toEqual([
      ['sc-001', 'passed'],
      ['sc-002', 'failed'],
      ['sc-003', 'undefined'],
      ['sc-004', 'ambiguous'],
      ['sc-005', 'pending'],
      ['sc-006', 'failed'],
    ]);
    expect(summary.excluded).toEqual(['sc-007']);
    expect(summary.untracked).toEqual({ passed: 2, skipped: 0, failed: 1 });
    expect(summary.finished).toEqual({ success: false });
  });

  test('a dry run: defined steps are skipped, undefined and ambiguous ones still say so', () => {
    const summary = summarize('dry-run');
    expect(summary.scenarios.map((scenario) => [scenario.id, scenario.status])).toEqual([
      ['sc-001', 'skipped'],
      ['sc-002', 'skipped'],
      ['sc-003', 'undefined'],
      ['sc-004', 'ambiguous'],
      ['sc-005', 'skipped'],
      ['sc-006', 'skipped'],
      ['sc-007', 'skipped'],
    ]);
    expect(summary.scenarios[0]!.failure).toBeUndefined();
    expect(summary.scenarios[2]!.undefined).toEqual(['the user lends "Dune" to Ada']);
    expect(summary.excluded).toEqual([]);
    // The project's own scenarios are all defined, so a dry run skips them all.
    expect(summary.untracked).toEqual({ passed: 0, skipped: 3, failed: 0 });
    // The binding of a dry run is what a real run would use.
    expect(summary.scenarios[0]!.binding).toEqual(summarize('passing').scenarios[0]!.binding);
  });
});

describe('recognizing tracked scenarios', () => {
  test('a scenario is tracked by its identity tag in the file its record names', () => {
    const elsewhere = tracked.map((scenario) => (scenario.id === 'sc-001' ? { ...scenario, file: 'subs/other/src/tests/features/demo-plan/other.feature' } : scenario));
    const summary = summarize('passing', elsewhere);
    expect(summary.scenarios).toEqual([]);
    expect(summary.untracked).toEqual({ passed: 1, skipped: 0, failed: 0 });
  });

  test('an identity tag no record names is the project\'s own scenario', () => {
    const summary = summarize('all-untagged', tracked.filter((scenario) => scenario.id !== 'sc-002'));
    expect(summary.scenarios.map((scenario) => scenario.id)).not.toContain('sc-002');
    expect(summary.untracked).toEqual({ passed: 2, skipped: 0, failed: 2 });
  });

  test('a record path written with ./ or backslashes names the same file', () => {
    const summary = summarize('passing', [{ id: 'sc-001', file: `./${file.replaceAll('/', '\\')}` }]);
    expect(summary.scenarios.map((scenario) => scenario.id)).toEqual(['sc-001']);
  });
});

describe('a damaged stream', () => {
  test('a torn last line is reported, and the rest is read', () => {
    const text = stream('passing');
    const lines = text.trimEnd().split('\n');
    const torn = [...lines.slice(0, -1), lines.at(-1)!.slice(0, 20)].join('\n');
    const summary = summarizeScenarioRun(torn, tracked);
    expect(summary.malformedLines).toEqual([lines.length]);
    expect(summary.finished).toBeNull();
    expect(summary.scenarios.map((scenario) => [scenario.id, scenario.status])).toEqual([['sc-001', 'passed']]);
  });

  test('a stream cut before a step finished does not pass that scenario', () => {
    const lines = stream('passing').trimEnd().split('\n');
    const lastStep = lines.map((line, index) => (line.startsWith('{"testStepFinished"') ? index : -1)).filter((index) => index >= 0).at(-1)!;
    const summary = summarizeScenarioRun(lines.slice(0, lastStep).join('\n'), tracked);
    expect(summary.scenarios[0]).toMatchObject({ id: 'sc-001', status: 'failed', failure: { step: 'Then the shelf lists 1 book', message: 'The stream has no result for this step' } });
    // The gap is recorded apart from what the run observed: the finished
    // steps passed, so this is no failure a reader may count.
    expect(summary.scenarios[0]!.unfinished).toEqual({ pickles: 0, steps: 1, observed: 'passed' });
    expect(summary.finished).toBeNull();
  });

  test('a stream that lost one step\'s result keeps the observed failure beside the gap', () => {
    const lines = stream('failing').trimEnd().split('\n');
    const first = lines.findIndex((line) => line.startsWith('{"testStepFinished"'));
    const summary = summarizeScenarioRun(lines.filter((_, index) => index !== first).join('\n'), tracked);
    expect(summary.scenarios[0]).toMatchObject({ id: 'sc-002', status: 'failed', unfinished: { pickles: 0, steps: 1, observed: 'failed' } });
  });

  test('an outline cut before its second example names the pickle that never started', () => {
    const lines = stream('outline').trimEnd().split('\n');
    const starts = lines.map((line, index) => (line.startsWith('{"testCaseStarted"') ? index : -1)).filter((index) => index >= 0);
    const summary = summarizeScenarioRun(lines.slice(0, starts[1]).join('\n'), tracked);
    expect(summary.scenarios[0]).toMatchObject({ id: 'sc-006', unfinished: { pickles: 1, steps: 0 } });
  });

  test('a complete stream records no gap', () => {
    for (const name of ['passing', 'failing', 'outline']) {
      expect(summarize(name).scenarios.every((scenario) => scenario.unfinished === undefined)).toBe(true);
    }
  });

  test('an empty stream is an unfinished run with nothing in it', () => {
    expect(summarizeScenarioRun('', tracked)).toEqual({
      scenarios: [],
      excluded: [],
      untracked: { passed: 0, skipped: 0, failed: 0 },
      finished: null,
      malformedLines: [],
    });
  });
});

describe('a retried pickle', () => {
  test('its status is its last attempt\'s', () => {
    // Replays the failing recording's test case as a first attempt, then the
    // passing recording's steps as a second attempt of the same test case.
    const failing = stream('failing').trimEnd().split('\n').map((line) => JSON.parse(line) as Record<string, any>);
    const started = failing.find((envelope) => envelope.testCaseStarted)!.testCaseStarted;
    const retried = failing.flatMap((envelope) => {
      if (envelope.testCaseStarted) {
        return [envelope, { testCaseStarted: { ...started, id: 'retry', attempt: 1 } }];
      }
      if (envelope.testStepFinished && envelope.testStepFinished.testCaseStartedId === started.id) {
        return [envelope, { testStepFinished: { ...envelope.testStepFinished, testCaseStartedId: 'retry', testStepResult: { status: 'PASSED', duration: { seconds: 0, nanos: 0 } } } }];
      }
      return [envelope];
    });
    const summary = summarizeScenarioRun(retried.map((envelope) => JSON.stringify(envelope)).join('\n'), tracked);
    expect(summary.scenarios).toMatchObject([{ id: 'sc-002', status: 'passed' }]);
    expect(summary.scenarios[0]!.failure).toBeUndefined();
  });
});
