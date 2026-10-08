import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractPlanScenarios, planScenarioExtractionSchema } from '../extraction.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const collectionReview = join(here, '../../../../fixtures/collection-review/plans');

const plan = [
  '# Send customer email', //                                      1
  '',
  '## Acceptance', //                                                3
  '',
  '```gherkin', //                                                   5
  'Background:',
  '  Given a customer with the address ada@example.com',
  '  # a comment the record leaves out',
  '',
  '@smoke', //                                                      10
  'Scenario: A customer receives the email',
  '  The first send.',
  '  When the user activates email sending',
  '  Then the customer ada@example.com receives one email',
  '', //                                                            15
  'Scenario Outline: Several sends',
  '  When the user sends <count> emails',
  '  Then the history lists <count> emails',
  '    """',
  '    kept exactly', //                                            20
  '',
  '    """',
  '',
  '  @slow',
  '  Examples:', //                                                 25
  '    | count |',
  '    | 1     |',
  '    | 2     |',
  '```',
  '', //                                                            30
  '### History',
  '',
  '~~~ gherkin',
  'Feature: History',
  '  Scenario: Sent emails appear in the history', //               35
  '    Given an email to ada@example.com was sent',
  '    When the user opens the email history',
  '    Then the history lists one email to ada@example.com',
  '~~~',
  '', //                                                            40
  '```gherkin',
  'Scenario: Broken',
  '  Given a table',
  '    | a | b |',
  '    | c |', //                                                   45
  '```',
  '',
  '```ts',
  'Scenario: not gherkin',
  '```', //                                                         50
].join('\n');

describe('extracting plan scenarios', () => {
  const extraction = extractPlanScenarios(plan);

  test('every scenario of every gherkin block, numbered in document order', () => {
    expect(extraction.scenarios.map((scenario) => [scenario.id, scenario.name, scenario.outline])).toEqual([
      ['ps-01', 'A customer receives the email', false],
      ['ps-02', 'Several sends', true],
      ['ps-03', 'Sent emails appear in the history', false],
    ]);
    expect(planScenarioExtractionSchema.parse(extraction)).toEqual(extraction);
  });

  test('a background is folded into each scenario of its block, before its own steps and after its description', () => {
    expect(extraction.scenarios[0]!.source).toEqual([
      'Scenario: A customer receives the email',
      '  The first send.',
      '  Given a customer with the address ada@example.com',
      '  When the user activates email sending',
      '  Then the customer ada@example.com receives one email',
    ]);
  });

  test('an outline stays one scenario with its examples, doc strings whole, tags and comments left out', () => {
    expect(extraction.scenarios[1]!.source).toEqual([
      'Scenario Outline: Several sends',
      '  Given a customer with the address ada@example.com',
      '  When the user sends <count> emails',
      '  Then the history lists <count> emails',
      '    """',
      '    kept exactly',
      '',
      '    """',
      '  Examples:',
      '    | count |',
      '    | 1     |',
      '    | 2     |',
    ]);
  });

  test('line ranges and anchors are the plan\'s', () => {
    expect(extraction.scenarios.map((scenario) => scenario.lines)).toEqual([[11, 14], [16, 28], [35, 38]]);
    expect(extraction.scenarios[0]!.anchors).toEqual(['send-customer-email', 'acceptance']);
    expect(extraction.scenarios[2]!.anchors).toEqual(['send-customer-email', 'acceptance', 'history']);
  });

  test('a block with its own feature is parsed as written and dedented', () => {
    expect(extraction.scenarios[2]!.source).toEqual([
      'Scenario: Sent emails appear in the history',
      '  Given an email to ada@example.com was sent',
      '  When the user opens the email history',
      '  Then the history lists one email to ada@example.com',
    ]);
  });

  test('a block that does not parse is a limitation with the parser\'s message and the block\'s lines', () => {
    expect(extraction.limitations).toEqual([
      { kind: 'unparsable-gherkin', lines: [41, 46], message: '(plan line 45): inconsistent cell count within the table' },
    ]);
  });

  test('a plan without gherkin blocks has no scenario and no limitation', () => {
    expect(extractPlanScenarios('# Plan\n\n```ts\nconst a = 1;\n```\n')).toEqual({ scenarios: [], limitations: [] });
  });

  test('an unclosed block runs to the end of the plan', () => {
    const extraction = extractPlanScenarios('# Plan\n```gherkin\nScenario: Open\n  Given a step\n');
    expect(extraction.scenarios.map((scenario) => [scenario.name, scenario.lines])).toEqual([['Open', [3, 4]]]);
  });

  test('backgrounds of a rule and its feature both fold in, and a rule\'s scenarios are extracted', () => {
    const extraction = extractPlanScenarios([
      '```gherkin',
      'Feature: Ruled',
      '  Background:',
      '    Given the feature background',
      '  Rule: One rule',
      '    Background:',
      '      Given the rule background',
      '    Scenario: Inside the rule',
      '      When something happens',
      '```',
    ].join('\n'));
    expect(extraction.scenarios[0]!.source).toEqual([
      'Scenario: Inside the rule',
      '  Given the feature background',
      '  Given the rule background',
      '  When something happens',
    ]);
  });
});

describe('the collection-review plans', () => {
  const plans = readdirSync(collectionReview);

  test('are all read; status-badge-tone states its first two acceptance bullets as scenarios, the others state none', () => {
    expect(plans.length).toBeGreaterThan(0);
    for (const name of plans) {
      const extraction = extractPlanScenarios(readFileSync(join(collectionReview, name, 'plan.md'), 'utf8'));
      if (name === 'status-badge-tone') continue;
      expect(extraction, name).toEqual({ scenarios: [], limitations: [] });
    }
    const badge = extractPlanScenarios(readFileSync(join(collectionReview, 'status-badge-tone', 'plan.md'), 'utf8'));
    expect(badge.limitations).toEqual([]);
    expect(badge.scenarios.map(scenario => [scenario.id, scenario.name, scenario.lines, scenario.anchors])).toEqual([
      ['ps-01', 'A badge given a tone carries that tone in its markup', [34, 38], ['a-tone-for-the-status-badge', 'acceptance']],
      ['ps-02', 'A badge given no tone carries neutral', [40, 43], ['a-tone-for-the-status-badge', 'acceptance']],
    ]);
    expect(badge.scenarios[1]!.source).toEqual([
      'Scenario: A badge given no tone carries neutral',
      '  Given a badge for a failed review with no tone',
      '  When the badge is rendered',
      '  Then its markup carries the tone "neutral"',
    ]);
  });

  test('gain their scenarios when a gherkin block is added to one', () => {
    const text = readFileSync(join(collectionReview, 'revision-diff', 'plan.md'), 'utf8');
    const extended = `${text}\n\`\`\`gherkin\nScenario: The badge shows its tone\n  Given a review in state approved\n  When the reviewer opens it\n  Then the badge is green\n\`\`\`\n`;
    const extraction = extractPlanScenarios(extended);
    const lines = text.split('\n').length;
    expect(extraction.scenarios).toHaveLength(1);
    expect(extraction.scenarios[0]!.lines).toEqual([lines + 2, lines + 5]);
  });
});
