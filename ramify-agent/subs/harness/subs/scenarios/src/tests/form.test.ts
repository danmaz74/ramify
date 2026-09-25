import { describe, expect, test } from 'vitest';
import { extractDocumentScenarios, extractPlanScenarios } from '../extraction.js';
import { validateScenarioForm, type ScenarioFormEntry, type ScenarioFormResult, type ScenarioFormRule, type ScenarioFormSubmission } from '../form.js';

/*
 * The plan of architecture §2's example: ps-01 belongs to one entry, ps-02
 * combines two. Each test breaks one rule of an otherwise valid submission.
 */
const plan = [
  '# Send customer email',
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
  '## History',
  'The history lists sent emails.',
].join('\n');
const { scenarios: planScenarios } = extractPlanScenarios(plan);

const entries: ScenarioFormEntry[] = [
  { capability: 'send-customer-email', acceptanceRefs: [{ lines: [4, 7] }] },
  { capability: 'email-history', acceptanceRefs: [{ anchor: 'acceptance' }] },
];

function valid(): ScenarioFormSubmission {
  return {
    scenarios: [
      {
        key: 'send-email',
        entry: 'send-customer-email',
        origin: { kind: 'plan', planScenario: 'ps-01' },
        gherkin: [
          'Scenario: A customer receives the email',
          '  Given a customer with the address ada@example.com',
          '  When the user   activates email sending',
          '  Then the customer ada@example.com receives one email',
          '',
        ].join('\n'),
      },
      {
        key: 'history-lists-sent-email',
        entry: 'email-history',
        origin: { kind: 'architect' },
        partOf: 'ps-02',
        gherkin: [
          'Scenario: Sent emails appear in the history',
          '  Given an email to ada@example.com was sent',
          '  When the user opens the email history',
          '  Then the history lists one email to ada@example.com',
        ].join('\n'),
      },
    ],
    integrationScenarios: [{ planScenario: 'ps-02', subScenarios: ['send-email', 'history-lists-sent-email'] }],
  };
}

function rejected(result: ScenarioFormResult, rule: ScenarioFormRule, path: string): string {
  if (result.ok) throw new Error('expected a rejection');
  expect(result.rule).toBe(rule);
  expect(result.path).toBe(path);
  expect(result.message).toMatch(new RegExp(`^Scenario form rule ${rule} \\(`));
  return result.message;
}

describe('an accepted form', () => {
  test('identical headings and lines in two documents keep distinct origins and citations', () => {
    const text = '# Same\n```gherkin\nScenario: Same\n  Given one\n  Then done\n```\n';
    const extracted = extractDocumentScenarios([{ id: 'doc-001', text }, { id: 'doc-002', text }]);
    expect(extracted.scenarios.map(item => [item.id, item.document, item.lines])).toEqual([
      ['ps-01', 'doc-001', [3, 5]], ['ps-02', 'doc-002', [3, 5]],
    ]);
    const submission: ScenarioFormSubmission = {
      scenarios: [
        { key: 'one', entry: 'first', origin: { kind: 'plan', planScenario: 'ps-01' }, gherkin: extracted.scenarios[0]!.source.join('\n') },
        { key: 'two', entry: 'second', origin: { kind: 'plan', planScenario: 'ps-02' }, gherkin: extracted.scenarios[1]!.source.join('\n') },
      ], integrationScenarios: [],
    };
    const correct = [
      { capability: 'first', acceptanceRefs: [{ document: 'doc-001', lines: [3, 5] as [number, number] }] },
      { capability: 'second', acceptanceRefs: [{ document: 'doc-002', lines: [3, 5] as [number, number] }] },
    ];
    const accepted = validateScenarioForm(submission, extracted.scenarios, correct);
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.form.scenarios[1]!.origin).toMatchObject({ document: 'doc-002' });
    expect(rejected(validateScenarioForm(submission, extracted.scenarios, [
      correct[0]!, { capability: 'second', acceptanceRefs: [{ document: 'doc-001', lines: [3, 5] }] },
    ]), 6, 'entries.1.acceptanceRefs.0')).toContain('cited by none');
  });
  test('carries the plan\'s text for a plan scenario, the submitted text for an architect scenario, and sub-scenarios by integration', () => {
    const result = validateScenarioForm(valid(), planScenarios, entries);
    if (!result.ok) throw new Error(result.message);
    expect(result.warnings).toEqual([]);
    expect(result.form.scenarios.map((scenario) => [scenario.key, scenario.origin.kind, scenario.partOf, scenario.name])).toEqual([
      ['send-email', 'plan', 'ps-02', 'A customer receives the email'],
      ['history-lists-sent-email', 'architect', 'ps-02', 'Sent emails appear in the history'],
    ]);
    expect(result.form.scenarios[0]!.source).toEqual(planScenarios[0]!.source);
    expect(result.form.scenarios[0]!.origin).toEqual({ kind: 'plan', planScenario: 'ps-01', lines: [4, 7] });
    expect(result.form.integrations).toEqual([{
      planScenario: 'ps-02',
      lines: [9, 13],
      subScenarios: ['send-email', 'history-lists-sent-email'],
      name: 'A sent email is listed',
      source: planScenarios[1]!.source,
    }]);
  });

  test('a plan without scenarios needs only architect scenarios', () => {
    const submission: ScenarioFormSubmission = {
      scenarios: [{ key: 'only', entry: 'send-customer-email', origin: { kind: 'architect' }, refs: [{ lines: [5, 5] }], gherkin: 'Scenario: Only\n  Given a step' }],
      integrationScenarios: [],
    };
    const result = validateScenarioForm(submission, [], [entries[0]!]);
    expect(result.ok).toBe(true);
  });
});

describe('rule 1: one scenario per gherkin value', () => {
  test('a value that does not parse', () => {
    const submission = valid();
    submission.scenarios[1]!.gherkin = 'Scenario: Broken\n  Given a table\n    | a | b |\n    | c |';
    expect(rejected(validateScenarioForm(submission, planScenarios, entries), 1, 'scenarios.1.gherkin')).toContain('does not parse');
  });

  test('two scenarios in one value', () => {
    const submission = valid();
    submission.scenarios[1]!.gherkin += '\nScenario: Another\n  Given a step';
    expect(rejected(validateScenarioForm(submission, planScenarios, entries), 1, 'scenarios.1.gherkin')).toContain('not exactly one Scenario');
  });

  test('a background beside the scenario', () => {
    const submission = valid();
    submission.scenarios[1]!.gherkin = `Background:\n  Given a step\n${submission.scenarios[1]!.gherkin}`;
    rejected(validateScenarioForm(submission, planScenarios, entries), 1, 'scenarios.1.gherkin');
  });

  test('a scenario without a step', () => {
    const submission = valid();
    submission.scenarios[1]!.gherkin = 'Scenario: Empty';
    expect(rejected(validateScenarioForm(submission, planScenarios, entries), 1, 'scenarios.1.gherkin')).toContain('has no step');
  });

  test('a tag on the scenario or on its examples', () => {
    const tagged = valid();
    tagged.scenarios[1]!.gherkin = `@wip\n${tagged.scenarios[1]!.gherkin}`;
    expect(rejected(validateScenarioForm(tagged, planScenarios, entries), 1, 'scenarios.1.gherkin')).toContain('tags');
    const examples = valid();
    examples.scenarios[1]!.gherkin = 'Scenario Outline: O\n  Given <n>\n  @x\n  Examples:\n    | n |\n    | 1 |';
    rejected(validateScenarioForm(examples, planScenarios, entries), 1, 'scenarios.1.gherkin');
  });
});

describe('rule 2: one entry per scenario', () => {
  test('a scenario naming no entry of the submission', () => {
    const submission = valid();
    submission.scenarios[1]!.entry = 'unknown-entry';
    expect(rejected(validateScenarioForm(submission, planScenarios, entries), 2, 'scenarios.1.entry')).toContain('"unknown-entry"');
  });

  test('a key used twice', () => {
    const submission = valid();
    submission.scenarios[1]!.key = 'send-email';
    rejected(validateScenarioForm(submission, planScenarios, entries), 2, 'scenarios.1.key');
  });
});

describe('rule 3: every plan scenario exactly once', () => {
  test('a plan scenario that appears nowhere', () => {
    const submission = valid();
    submission.integrationScenarios = [];
    delete submission.scenarios[1]!.partOf;
    expect(rejected(validateScenarioForm(submission, planScenarios, entries), 3, 'scenarios')).toContain('ps-02');
  });

  test('a plan scenario that appears twice', () => {
    const submission = valid();
    submission.integrationScenarios[0]!.planScenario = 'ps-01';
    delete submission.scenarios[1]!.partOf;
    expect(rejected(validateScenarioForm(submission, planScenarios, entries), 3, 'integrationScenarios.0.planScenario')).toContain('appears twice');
  });

  test('a plan scenario the plan does not have', () => {
    const submission = valid();
    submission.scenarios[0]!.origin = { kind: 'plan', planScenario: 'ps-09' };
    rejected(validateScenarioForm(submission, planScenarios, entries), 3, 'scenarios.0.origin.planScenario');
  });

  test('a plan scenario restated in other words', () => {
    const submission = valid();
    submission.scenarios[0]!.gherkin = submission.scenarios[0]!.gherkin.replace('receives one email', 'gets an email');
    const message = rejected(validateScenarioForm(submission, planScenarios, entries), 3, 'scenarios.0.gherkin');
    expect(message).toContain('Then the customer ada@example.com receives one email');
  });

  test('normalization trims lines and collapses spaces, and nothing else: a doc string\'s blank line is text', () => {
    const docPlan = extractPlanScenarios([
      '```gherkin',
      'Scenario: A note is kept',
      '  When the user writes the note',
      '    """',
      '    first',
      '',
      '    second',
      '    """',
      '```',
    ].join('\n')).scenarios;
    const docEntries: ScenarioFormEntry[] = [{ capability: 'notes', acceptanceRefs: [] }];
    const submission = (gherkin: string): ScenarioFormSubmission => ({
      scenarios: [{ key: 'note', entry: 'notes', origin: { kind: 'plan', planScenario: 'ps-01' }, gherkin }],
      integrationScenarios: [],
    });
    const spaced = 'Scenario:   A note is kept\n\t When the user  writes the note  \n      """\n  first\n\n second   \n   """';
    expect(validateScenarioForm(submission(spaced), docPlan, docEntries).ok).toBe(true);
    const joined = 'Scenario: A note is kept\n  When the user writes the note\n    """\n    first\n    second\n    """';
    rejected(validateScenarioForm(submission(joined), docPlan, docEntries), 3, 'scenarios.0.gherkin');
  });

  test('an integration scenario without sub-scenarios', () => {
    const submission = valid();
    submission.integrationScenarios[0]!.subScenarios = [];
    rejected(validateScenarioForm(submission, planScenarios, entries), 3, 'integrationScenarios.0.subScenarios');
  });

  test('a sub-scenario key the submission does not have', () => {
    const submission = valid();
    submission.integrationScenarios[0]!.subScenarios.push('missing');
    rejected(validateScenarioForm(submission, planScenarios, entries), 3, 'integrationScenarios.0.subScenarios.2');
  });

  test('a partOf that no integration scenario confirms', () => {
    const submission = valid();
    submission.integrationScenarios[0]!.subScenarios = ['send-email'];
    rejected(validateScenarioForm(submission, planScenarios, entries), 3, 'scenarios.1.partOf');
  });
});

describe('rule 4: every entry has a scenario', () => {
  test('an entry without one', () => {
    const extra: ScenarioFormEntry[] = [...entries, { capability: 'unsubscribe', acceptanceRefs: [] }];
    expect(rejected(validateScenarioForm(valid(), planScenarios, extra), 4, 'entries.2')).toContain('"unsubscribe"');
  });
});

describe('rule 5: integration steps verbatim', () => {
  test('an integration step in no sub-scenario', () => {
    const submission = valid();
    submission.scenarios[1]!.gherkin = submission.scenarios[1]!.gherkin.replace('When the user opens the email history', 'When the user views the history');
    expect(rejected(validateScenarioForm(submission, planScenarios, entries), 5, 'integrationScenarios.0.subScenarios'))
      .toContain('"And the user opens the email history"');
  });

  test('a conjunction matches the step kind it continues, and a keyword of another kind does not', () => {
    const submission = valid();
    submission.scenarios[1]!.gherkin = submission.scenarios[1]!.gherkin.replace('When the user opens', 'Given the user opens');
    rejected(validateScenarioForm(submission, planScenarios, entries), 5, 'integrationScenarios.0.subScenarios');
  });
});

describe('rule 6: every acceptance reference cited', () => {
  test('a reference by lines no scenario of the entry overlaps', () => {
    const cited: ScenarioFormEntry[] = [{ ...entries[0]!, acceptanceRefs: [{ lines: [15, 16] }] }, entries[1]!];
    expect(rejected(validateScenarioForm(valid(), planScenarios, cited), 6, 'entries.0.acceptanceRefs.0')).toContain('lines 15–16');
  });

  test('a reference by anchor, cited through the plan scenario a sub-scenario is part of, or through explicit refs', () => {
    const byAnchor: ScenarioFormEntry[] = [entries[0]!, { capability: 'email-history', acceptanceRefs: [{ anchor: 'history' }] }];
    rejected(validateScenarioForm(valid(), planScenarios, byAnchor), 6, 'entries.1.acceptanceRefs.0');
    const submission = valid();
    submission.scenarios[1]!.refs = [{ anchor: '#History' }];
    expect(validateScenarioForm(submission, planScenarios, byAnchor).ok).toBe(true);
  });
});

describe('warnings', () => {
  test('a step naming an exported symbol or a file of the view', () => {
    const submission = valid();
    submission.scenarios[1]!.gherkin = submission.scenarios[1]!.gherkin
      .replace('Given an email to ada@example.com was sent', 'Given sendEmail wrote to ada@example.com')
      .replace('When the user opens the email history', 'When the user opens history.ts and the email history');
    submission.integrationScenarios[0]!.subScenarios = ['send-email'];
    delete submission.scenarios[1]!.partOf;
    submission.scenarios.push({
      key: 'opens-history', entry: 'email-history', origin: { kind: 'architect' }, partOf: 'ps-02',
      gherkin: 'Scenario: Opening\n  When the user opens the email history\n  Then the history lists one email to ada@example.com',
    });
    submission.integrationScenarios[0]!.subScenarios.push('opens-history');
    const result = validateScenarioForm(submission, planScenarios, entries, { symbols: ['sendEmail', 'order', 'Email'], files: ['subs/history/src/history.ts'] });
    if (!result.ok) throw new Error(result.message);
    expect(result.warnings.map((warning) => [warning.kind, warning.scenarios])).toEqual([
      ['names-view-symbol', ['history-lists-sent-email']],
      ['names-view-file', ['history-lists-sent-email']],
    ]);
  });

  test('a sub-scenario that takes none of its integration scenario\'s steps', () => {
    const submission = valid();
    submission.scenarios.push({
      key: 'bridge', entry: 'email-history', origin: { kind: 'architect' },
      gherkin: 'Scenario: Bridge only\n  Given an email was sent\n  Then nothing else happens',
    });
    submission.integrationScenarios[0]!.subScenarios.push('bridge');
    const result = validateScenarioForm(submission, planScenarios, entries);
    if (!result.ok) throw new Error(result.message);
    expect(result.warnings.map((warning) => [warning.kind, warning.scenarios])).toEqual([['sub-scenario-shares-no-step', ['bridge']]]);
  });

  test('two architect scenarios of one entry with identical steps', () => {
    const submission = valid();
    submission.scenarios.push({
      key: 'history-again', entry: 'email-history', origin: { kind: 'architect' },
      gherkin: submission.scenarios[1]!.gherkin.replace('Sent emails appear in the history', 'The same steps again'),
    });
    const result = validateScenarioForm(submission, planScenarios, entries);
    if (!result.ok) throw new Error(result.message);
    expect(result.warnings.map((warning) => [warning.kind, warning.scenarios])).toEqual([
      ['duplicate-architect-steps', ['history-lists-sent-email', 'history-again']],
    ]);
  });
});
