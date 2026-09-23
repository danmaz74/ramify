import { describe, expect, test } from 'vitest';
import { bridgingGivens, compositionFailures } from '../composition.js';
import { scenarioSourceHash, type ScenarioRecord } from '../records.js';

/*
 * An integration scenario that fails while its sub-scenarios pass, and the
 * sub-scenario whose bridging Given is suspect. The plan's scenario attaches
 * a note and opens the panel; its sub-scenarios attach the note, and show
 * the panel from a Given that states the attached note instead of taking
 * the action.
 */

function record(id: string, kind: ScenarioRecord['kind'], source: string[], extra: Partial<ScenarioRecord> = {}): ScenarioRecord {
  return {
    schema: 'ramify-agent.scenario/1',
    id,
    kind,
    entry: kind === 'entry' ? 'reviewer-note' : null,
    owner: 'collection-review/workspace',
    origin: { kind: 'plan', planScenario: 'ps-01', ref: { lines: [1, 4] } },
    partOf: null,
    subScenarios: [],
    name: source[0]!.replace(/^Scenario: /u, ''),
    source,
    hash: scenarioSourceHash(source),
    file: 'subs/workspace/src/tests/features/review-notes/integration.feature',
    ...extra,
  };
}

const integration = record('sc-003', 'integration', [
  'Scenario: The panel shows an attached note',
  '  Given a completed review run of the record "rec-1"',
  '  When the reviewer attaches the note "Checked"',
  '  And the reviewer opens the review panel',
  '  Then the panel shows the note "Checked" under the findings',
], { subScenarios: ['sc-001', 'sc-002'] });
const attach = record('sc-001', 'entry', [
  'Scenario: A note is attached for the panel',
  '  Given a completed review run of the record "rec-1"',
  '  When the reviewer attaches the note "Checked"',
  '  Then the review run shows the note "Checked"',
], { partOf: 'sc-003' });
const panel = record('sc-002', 'entry', [
  'Scenario: The panel shows the attached note',
  '  Given a completed review run of the record "rec-1"',
  '  And the note "Checked" was attached to the review run',
  '  When the reviewer opens the review panel',
  '  Then the panel shows the note "Checked" under the findings',
], { partOf: 'sc-003', entry: 'note-in-panel' });
const records = [attach, panel, integration];

describe('bridging Givens', () => {
  test('a context step of the sub-scenario that no step of the integration scenario states, with an And taking the Given\'s kind', () => {
    expect(bridgingGivens(integration, panel)).toEqual(['And the note "Checked" was attached to the review run']);
    // A Given picked verbatim bridges nothing, and neither does an outcome
    // the integration scenario does not state.
    expect(bridgingGivens(integration, attach)).toEqual([]);
  });
});

describe('composition failures', () => {
  test('the integration scenario failed while both sub-scenarios passed: the panel\'s bridging Given is the suspect', () => {
    expect(compositionFailures(records, [
      { id: 'sc-001', status: 'passed' },
      { id: 'sc-002', status: 'passed' },
      { id: 'sc-003', status: 'failed' },
    ])).toEqual([{
      scenario: 'sc-003',
      passed: ['sc-001', 'sc-002'],
      suspects: [{ scenario: 'sc-002', givens: ['And the note "Checked" was attached to the review run'] }],
    }]);
  });

  test('none where a sub-scenario failed or did not run, where the integration scenario passed, or where it is undefined', () => {
    expect(compositionFailures(records, [{ id: 'sc-001', status: 'passed' }, { id: 'sc-002', status: 'failed' }, { id: 'sc-003', status: 'failed' }])).toEqual([]);
    expect(compositionFailures(records, [{ id: 'sc-001', status: 'passed' }, { id: 'sc-003', status: 'failed' }])).toEqual([]);
    expect(compositionFailures(records, [{ id: 'sc-001', status: 'passed' }, { id: 'sc-002', status: 'passed' }, { id: 'sc-003', status: 'passed' }])).toEqual([]);
    expect(compositionFailures(records, [{ id: 'sc-001', status: 'passed' }, { id: 'sc-002', status: 'passed' }, { id: 'sc-003', status: 'undefined' }])).toEqual([]);
  });
});
