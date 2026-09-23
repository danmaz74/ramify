import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AstBuilder, GherkinClassicTokenMatcher, Parser, compile } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import { describe, expect, test } from 'vitest';
import { extractPlanScenarios } from '../extraction.js';
import { validateScenarioForm, type ScenarioFormSubmission } from '../form.js';
import { assignScenarioIds, scenarioSourceHash, type ScenarioRecord } from '../records.js';
import { renderFeatureFiles, type FeatureRenderingRun } from '../rendering.js';
import type { ScenarioState } from '../states.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const golden = join(here, 'golden');
/** Set to rewrite the golden files from the renderer; review the diff before committing. */
const update = process.env.UPDATE_GOLDEN === '1';

function expectGolden(name: string, content: string): void {
  const path = join(golden, name);
  if (update || !existsSync(path)) writeFileSync(path, content);
  expect(content).toBe(readFileSync(path, 'utf8'));
}

/** A run of architecture §2's example, through extraction, the form rules and numbering. */
function exampleRun(): { records: readonly ScenarioRecord[]; run: FeatureRenderingRun } {
  const plan = [
    '## Acceptance',
    '```gherkin',
    'Scenario: A customer receives the email',
    '  Given a customer with the address ada@example.com',
    '  When the user activates email sending',
    '  Then the customer ada@example.com receives one email',
    '',
    'Scenario: A sent email is listed',
    '  Given a customer with the address ada@example.com',
    '  When the user activates email sending',
    '  And the user opens the email history',
    '  Then the history lists one email to ada@example.com',
    '```',
  ].join('\n');
  const submission: ScenarioFormSubmission = {
    scenarios: [
      { key: 'send-email', entry: 'send-customer-email', origin: { kind: 'plan', planScenario: 'ps-01' }, gherkin: extractPlanScenarios(plan).scenarios[0]!.source.join('\n') },
      {
        key: 'history-lists-sent-email', entry: 'email-history', origin: { kind: 'architect' }, partOf: 'ps-02',
        gherkin: [
          'Scenario: Sent emails appear in the history',
          '  Given an email to ada@example.com was sent',
          '  When the user opens the email history',
          '  Then the history lists one email to ada@example.com',
        ].join('\n'),
      },
      {
        key: 'history-orders', entry: 'email-history', origin: { kind: 'architect' },
        gherkin: [
          'Scenario Outline: The history lists emails newest first',
          '  Given emails to <first> and <second> were sent in that order',
          '  When the user opens the email history',
          '  Then the history lists <second> before <first>',
          '    """',
          '    newest first',
          '    """',
          '  Examples:',
          '    | first | second |',
          '    | ada   | grace  |',
        ].join('\n'),
      },
      {
        key: 'audit', entry: 'audit-trail', origin: { kind: 'architect' },
        gherkin: 'Scenario: Every send is audited\n  When the user activates email sending\n  Then one audit line records the send',
      },
    ],
    integrationScenarios: [{ planScenario: 'ps-02', subScenarios: ['send-email', 'history-lists-sent-email'] }],
  };
  const entries = [
    { capability: 'send-customer-email', owner: 'shop/customers', description: 'A user activates email sending for a customer, and that customer receives one email.', acceptanceRefs: [] },
    { capability: 'email-history', owner: 'shop/history', description: 'Scenario by scenario, the #1 view of sent email @ a glance: every email a user sent to a customer, newest first, with its recipient and the time of sending, as a | table | row.', acceptanceRefs: [] },
    { capability: 'audit-trail', owner: 'shop/audit-checks', description: 'Every send leaves one audit line.', acceptanceRefs: [] },
  ];
  const result = validateScenarioForm(submission, extractPlanScenarios(plan).scenarios, entries);
  if (!result.ok) throw new Error(result.message);
  const { records } = assignScenarioIds(result.form, {
    planId: 'send-customer-email',
    entries,
    modules: [
      { module: 'shop', dir: '', testing: false },
      { module: 'shop/customers', dir: 'subs/customers', testing: false },
      { module: 'shop/history', dir: 'subs/history', testing: false },
      { module: 'shop/audit-checks', dir: 'subs/audit-checks', testing: true },
    ],
  });
  return { records, run: { planId: 'send-customer-email', runId: '20260923T1200Z-1a2b3c', entries } };
}

function parse(content: string) {
  const document = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher()).parse(content);
  return { document, pickles: compile(document, 'rendered.feature', IdGenerator.incrementing()) };
}

describe('rendering feature files', () => {
  const { records, run } = exampleRun();
  const states = new Map<string, ScenarioState>([['sc-001', 'declared'], ['sc-002', 'bound'], ['sc-003', 'implemented'], ['sc-004', 'pending'], ['sc-005', 'pending']]);
  const files = renderFeatureFiles(records, states, run);

  test('one file per entry in its owner\'s test area, and one per common ancestor for integration scenarios', () => {
    expect(files.map((file) => file.path)).toEqual([
      'src/tests/features/send-customer-email/integration.feature',
      'subs/audit-checks/src/features/send-customer-email/audit-trail.feature',
      'subs/customers/src/tests/features/send-customer-email/send-customer-email.feature',
      'subs/history/src/tests/features/send-customer-email/email-history.feature',
    ]);
  });

  test('the golden files', () => {
    expectGolden('integration.feature', files[0]!.content);
    expectGolden('audit-trail.feature', files[1]!.content);
    expectGolden('send-customer-email.feature', files[2]!.content);
    expectGolden('email-history.feature', files[3]!.content);
  });

  test('every file parses, with the identity tag on each scenario and the pending tag exactly for pending and bound', () => {
    const tags = files.flatMap((file) => parse(file.content).pickles.map((pickle) => [pickle.name, pickle.tags.map((tag) => tag.name)]));
    expect(tags).toEqual([
      ['A sent email is listed', ['@ramify-sc-005', '@ramify-pending']],
      ['Every send is audited', ['@ramify-sc-004', '@ramify-pending']],
      ['A customer receives the email', ['@ramify-sc-001']],
      ['Sent emails appear in the history', ['@ramify-sc-002', '@ramify-pending']],
      ['The history lists emails newest first', ['@ramify-sc-003']],
    ]);
  });

  test('a description is one parsed paragraph, whatever words it holds', () => {
    const history = parse(files[3]!.content).document.feature!;
    expect(history.name).toBe('email-history');
    expect(history.description.split('\n').map((line) => line.trim()).join(' ')).toBe(`Description: ${run.entries[1]!.description}`);
  });

  test('source lines are written verbatim, so each scenario\'s lines hash to its record\'s', () => {
    for (const record of records) {
      const file = files.find((candidate) => candidate.path === record.file)!;
      const lines = file.content.split('\n');
      const start = lines.indexOf(`  ${record.source[0]}`);
      const written = lines.slice(start, start + record.source.length).map((line) => line.replace(/^ {2}/, ''));
      expect(scenarioSourceHash(written)).toBe(record.hash);
    }
  });

  test('is deterministic: the same input yields byte-identical output, in any record order', () => {
    expect(renderFeatureFiles(records, states, run)).toEqual(files);
    expect(renderFeatureFiles([...records].reverse(), new Map([...states].reverse()), run)).toEqual(files);
  });

  test('a state change changes only the tags of that scenario', () => {
    const next = renderFeatureFiles(records, new Map(states).set('sc-002', 'declared'), run);
    expect(next[3]!.content).toBe(files[3]!.content.replace('@ramify-sc-002 @ramify-pending', '@ramify-sc-002'));
    expect(next.filter((file, index) => file.content !== files[index]!.content)).toHaveLength(1);
  });

  test('a record without a state is a caller\'s error', () => {
    expect(() => renderFeatureFiles(records, new Map([['sc-001', 'pending']]), run)).toThrow('No state was given for sc-00');
  });
});

describe('the sample project\'s tracked file', () => {
  test('is exactly what the renderer writes for its records and states', () => {
    const path = 'subs/shelf/src/tests/features/demo-plan/shelf.feature';
    const sources: [string, string[]][] = [
      ['A shelved book is listed', ['Given an empty shelf', 'When the user shelves "Dune"', 'Then the shelf lists 1 book']],
      ['A miscounted shelf fails', ['Given an empty shelf', 'When the user shelves "Dune"', 'Then the shelf lists 2 books']],
      ['Lending is not defined yet', ['Given an empty shelf', 'When the user lends "Dune" to Ada', 'Then the shelf lists 0 books']],
      ['Dusting matches two definitions', ['Given an empty shelf', 'When the user dusts the shelf', 'Then the shelf lists 0 books']],
      ['Sorting is pending', ['Given an empty shelf', 'When the user sorts the shelf', 'Then the shelf lists 0 books']],
    ];
    const records: ScenarioRecord[] = sources.map(([name, steps], index) => record(index + 1, path, [`Scenario: ${name}`, ...steps.map((step) => `  ${step}`)]));
    records.push(record(6, path, [
      'Scenario Outline: Several shelved books are listed',
      '  Given an empty shelf',
      '  When the user shelves <count> books',
      '  Then the shelf lists <listed> books',
      '  Examples:',
      '    | count | listed |',
      '    | 1     | 1      |',
      '    | 2     | 3      |',
    ]));
    records.push(record(7, path, ['Scenario: A bound scenario runs when its identity selects it', '  Given an empty shelf', '  Then the shelf lists 0 books']));
    const states = new Map<string, ScenarioState>(records.map((entry) => [entry.id, entry.id === 'sc-007' ? 'bound' : 'declared']));
    const [file] = renderFeatureFiles(records, states, {
      planId: 'demo-plan',
      runId: '20260923T1200Z-000000',
      entries: [{ capability: 'shelf-books', description: 'A user shelves books, and the shelf lists them.' }],
    });
    expect(file!.content).toBe(readFileSync(join(here, 'fixtures/sample-project', path), 'utf8'));
  });
});

function record(position: number, file: string, source: string[]): ScenarioRecord {
  return {
    schema: 'ramify-agent.scenario/1',
    id: `sc-${String(position).padStart(3, '0')}`,
    kind: 'entry',
    entry: 'shelf-books',
    owner: 'sample/shelf',
    origin: { kind: 'architect', refs: [] },
    partOf: null,
    subScenarios: [],
    name: source[0]!.replace(/^Scenario( Outline)?: /, ''),
    source,
    hash: scenarioSourceHash(source),
    file,
  };
}
