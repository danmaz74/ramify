import { openUnchangedRuns as openRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { extractPlanScenarios } from '../../subs/scenarios/src/extraction.js';
import { scenarioSourceHash, type ScenarioRecord } from '../../subs/scenarios/src/records.js';
import { acceptAnalysis } from '../analysis/accept.js';
import { describePlan, validateInitialAnalysis, type InitialAnalysisSubmission } from '../analysis/submission.js';
import { runLayout, runRecordSchema, type InvocationOutcome } from '../run/records.js';
import { runSnapshot } from '../run/snapshot.js';
import { constructedRecord } from './helpers/constructed.js';
import { copyFixture } from './helpers/fixture.js';
import { analysis, architectScenario, entry, requestCompletion } from './helpers/analysis.js';
import { installTestRunner, onlyRun, runEventsOnDisk, runPath, shapeOnlyInputs, startRun } from './helpers/runs.js';
import { architectIndex, moduleEntry } from './helpers/views.js';

/*
 * The acceptance scenarios of the initial analysis, `initial-architect/2`:
 * the plan's own scenarios captured with the plan and shown to the initial
 * architect, the form rules applied after every other rule under the same
 * per-turn bound, and one frozen `ScenarioRecord` per scenario committed by
 * `analysis-accepted` beside the entries, every one `pending`.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

const reviews = 'collection-review/workspace/reviews';
const sharedUi = 'collection-review/workspace/shared-ui';

/** The fixture's `review-notes` plan with a section of scenarios: a background, two scenarios, and a block that does not parse. */
async function planWithScenarios(root: string): Promise<string> {
  const path = join(root, 'plans', 'review-notes', 'plan.md');
  const plan = [
    (await readFile(path, 'utf8')).trimEnd(),
    '',
    '## Scenarios',
    '',
    '```gherkin',
    'Feature: Reviewer notes',
    '',
    '  Background:',
    '    Given a completed review run of the record "rec-1"',
    '',
    '  Scenario: A reviewer attaches a note',
    '    When the reviewer attaches the note "Looks right"',
    '    Then the review run shows the note "Looks right"',
    '',
    '  Scenario: The panel shows an attached note',
    '    When the reviewer attaches the note "Checked"',
    '    And the reviewer opens the review panel',
    '    Then the panel shows the note "Checked" under the findings',
    '```',
    '',
    '```gherkin',
    'Scenario: A note is too long',
    '  Given a note of 501 characters',
    '  this line is not a step',
    '```',
    '',
  ].join('\n');
  await writeFile(path, plan);
  return plan;
}

/**
 * The analysis of that plan: ps-01 is the note entry's own plan scenario,
 * and ps-02 an integration scenario decomposed into one sub-scenario per
 * entry, the panel's bridged with a Given.
 */
function scenarioAnalysis(plan: string): InitialAnalysisSubmission {
  const [attach, panel] = extractPlanScenarios(plan).scenarios;
  const note = { ...entry('reviewer-note', reviews, 'A reviewer can attach one note to a completed review run.'), acceptanceRefs: [{ lines: [attach!.lines[0], attach!.lines[1]] as [number, number] }] };
  const inPanel = entry('note-in-panel', sharedUi, 'The review panel shows the note under the findings.');
  return analysis([note, inPanel], [], [], [
    { key: 'attach-note', entry: 'reviewer-note', origin: { kind: 'plan', planScenario: attach!.id }, gherkin: attach!.source.join('\n') },
    {
      key: 'attach-for-panel', entry: 'reviewer-note', origin: { kind: 'architect' }, partOf: panel!.id,
      gherkin: [
        'Scenario: A note is attached for the panel',
        '  Given a completed review run of the record "rec-1"',
        '  When the reviewer attaches the note "Checked"',
        '  Then the review run shows the note "Checked"',
      ].join('\n'),
    },
    {
      key: 'panel-shows-note', entry: 'note-in-panel', origin: { kind: 'architect' }, partOf: panel!.id, refs: [{ anchor: 'Acceptance' }],
      gherkin: [
        'Scenario: The panel shows the attached note',
        '  Given the note "Checked" was attached to the review run',
        '  When the reviewer opens the review panel',
        '  Then the panel shows the note "Checked" under the findings',
      ].join('\n'),
    },
  ], [{ planScenario: panel!.id, subScenarios: ['attach-for-panel', 'panel-shows-note'] }]);
}

/** The scripted fake: the analysis, then a local architect that asks for completion. */
function script(initial: unknown) {
  return (spec: SessionSpec) => [{ kind: 'submit' as const, input: spec.role === 'initial-architect' ? initial : requestCompletion() }];
}

async function target(): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  return fixture.root;
}

describe('plan capture', () => {
  test('a plan with gherkin blocks: its scenarios and the unparsable block are in job.json and in the initial architect\'s briefing', async () => {
    const project = await target();
    const plan = await planWithScenarios(project);
    const { service, agent } = await openRuns(project, {
      script: script(scenarioAnalysis(plan)),
      unchangedCheckpoints: [scenariosCommit('review-notes'), 'wi-001', 'wi-002', 'wi-003', 'final verification of plan "review-notes"'],
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    expect(onlyRun(service, 'review-notes').state).toBe('completed');

    const record = runRecordSchema.parse(JSON.parse(await readFile(runPath(project, 'review-notes', receipt.jobId, runLayout.record), 'utf8')));
    expect(record.planScenarios).toEqual(extractPlanScenarios(plan));
    expect(record.planScenarios.scenarios.map(scenario => [scenario.id, scenario.name])).toEqual([
      ['ps-01', 'A reviewer attaches a note'],
      ['ps-02', 'The panel shows an attached note'],
    ]);
    expect(record.planScenarios.limitations).toHaveLength(1);
    const [limitation] = record.planScenarios.limitations;

    // The briefing lists each by ID, with its text and plan lines, and the limitation.
    const prompt = agent!.sessions.find(session => session.spec.role === 'initial-architect')!.spec.prompt;
    const [attach, panel] = record.planScenarios.scenarios;
    expect(prompt).toContain('# The plan\'s scenarios');
    expect(prompt).toContain(`## ps-01: A reviewer attaches a note\n\nPlan lines ${attach!.lines[0]}–${attach!.lines[1]}.`);
    expect(prompt).toContain(`## ps-02: The panel shows an attached note\n\nPlan lines ${panel!.lines[0]}–${panel!.lines[1]}.`);
    expect(prompt).toContain(['```gherkin', ...attach!.source, '```'].join('\n'));
    expect(prompt).toContain('  Given a completed review run of the record "rec-1"');
    expect(prompt).toContain(`- Plan lines ${limitation!.lines[0]}–${limitation!.lines[1]}: `);
    expect(prompt).toContain('this line is not a step');
  }, 180_000);

  test('a plan without gherkin blocks says so in one line, and records no scenario and no limitation', async () => {
    const project = await target();
    const { service, agent } = await openRuns(project, {
      script: script(analysis([entry('reviewer-note', reviews)])),
      unchangedCheckpoints: [scenariosCommit('review-notes'), 'wi-001', 'final verification of plan "review-notes"'],
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const record = runRecordSchema.parse(JSON.parse(await readFile(runPath(project, 'review-notes', receipt.jobId, runLayout.record), 'utf8')));
    expect(record.planScenarios).toEqual({ scenarios: [], limitations: [] });
    const prompt = agent!.sessions.find(session => session.spec.role === 'initial-architect')!.spec.prompt;
    expect(prompt).toContain('The plan has no `gherkin` block, so it states no scenario: write every entry\'s scenarios yourself.');
    expect(prompt).not.toContain('## ps-01');
  }, 180_000);
});

describe('acceptance', () => {
  test('analysis-accepted commits one pending scenario record per scenario, with IDs, owners, hashes and the integration owner', async () => {
    const project = await target();
    const plan = await planWithScenarios(project);
    const { service } = await openRuns(project, {
      script: script(scenarioAnalysis(plan)),
      unchangedCheckpoints: [scenariosCommit('review-notes'), 'wi-001', 'wi-002', 'wi-003', 'final verification of plan "review-notes"'],
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    const runId = receipt.jobId;

    const [attach, panel] = extractPlanScenarios(plan).scenarios;
    const read = async (id: string) => JSON.parse(await readFile(runPath(project, 'review-notes', runId, runLayout.scenario(id)), 'utf8')) as ScenarioRecord;
    const records = await Promise.all(['sc-001', 'sc-002', 'sc-003', 'sc-004'].map(read));
    const features = 'src/tests/features/review-notes';

    // Entry scenarios in submission order, then the integration scenario.
    expect(records.map(record => [record.id, record.kind, record.entry, record.owner, record.partOf, record.subScenarios, record.file])).toEqual([
      ['sc-001', 'entry', 'reviewer-note', reviews, null, [], `subs/workspace/subs/reviews/${features}/reviewer-note.feature`],
      ['sc-002', 'entry', 'reviewer-note', reviews, 'sc-004', [], `subs/workspace/subs/reviews/${features}/reviewer-note.feature`],
      ['sc-003', 'entry', 'note-in-panel', sharedUi, 'sc-004', [], `subs/workspace/subs/shared-ui/${features}/note-in-panel.feature`],
      // The lowest common ancestor of the sub-scenarios' owners.
      ['sc-004', 'integration', null, 'collection-review/workspace', null, ['sc-002', 'sc-003'], `subs/workspace/${features}/integration.feature`],
    ]);
    // A plan scenario keeps the plan's lines and text, background folded in.
    expect(records[0]!.origin).toEqual({ kind: 'plan', planScenario: 'ps-01', ref: { lines: attach!.lines } });
    expect(records[0]!.source).toEqual(attach!.source);
    expect(records[3]!.origin).toEqual({ kind: 'plan', planScenario: 'ps-02', ref: { lines: panel!.lines } });
    expect(records[3]!.source).toEqual(panel!.source);
    expect(records[2]!.origin).toEqual({ kind: 'architect', refs: [{ anchor: 'Acceptance' }] });
    expect(records[2]!.name).toBe('The panel shows the attached note');
    for (const record of records) expect(record.hash).toBe(scenarioSourceHash(record.source));

    // One transaction: the event carries every scenario beside the entries, and its data counts them.
    const lines = (await readFile(runPath(project, 'review-notes', runId, runLayout.events), 'utf8')).split('\n').filter(Boolean)
      .map(line => JSON.parse(line) as { event: { type: string; data: Record<string, unknown> }; records: Array<{ path: string; id: string }> });
    const accepted = lines.find(line => line.event.type === 'analysis-accepted')!;
    expect(accepted.event.data).toMatchObject({ entries: 2, workItems: 2, scenarios: 4, warnings: [] });
    expect(accepted.records.filter(entry => entry.path.startsWith('scenarios/')).map(entry => entry.id)).toEqual(['sc-001', 'sc-002', 'sc-003', 'sc-004']);
    expect(accepted.records.map(entry => entry.path)).toEqual(expect.arrayContaining([runLayout.entries, 'work-items/wi-001/item.json']));

    // Every record was committed pending. Each work item's completion request
    // then declared its entry's scenarios and its gate implemented them; the
    // implementation of the last sub-scenario created the integration work
    // item at the common ancestor, whose request declared the integration
    // scenario, and its gate implemented it.
    expect(onlyRun(service, 'review-notes').counts.scenarios).toEqual({ pending: 0, bound: 0, declared: 0, implemented: 4 });
    const started = (await runEventsOnDisk(project, 'review-notes', runId)).filter(event => event.type === 'work-item-started').map(event => event.data);
    expect(started).toEqual([
      { workItem: 'wi-001', module: reviews, origin: 'entry' },
      { workItem: 'wi-002', module: sharedUi, origin: 'entry' },
      { workItem: 'wi-003', module: 'collection-review/workspace', origin: 'integration', scenario: 'sc-004' },
    ]);
    // The submission is recorded under the analysis's version.
    const outcome = JSON.parse(await readFile(runPath(project, 'review-notes', runId, runLayout.outcome('inv-0001')), 'utf8')) as InvocationOutcome;
    expect(outcome.ended).toBe('submitted');
    const submission = JSON.parse(await readFile(runPath(project, 'review-notes', runId, runLayout.submission('inv-0001')), 'utf8')) as { schema: string };
    expect(submission.schema).toBe('ramify-agent.initial-analysis/2');
  }, 180_000);

  test('with an architect view: a module\'s own directory and testing area, and every warning, by scenario ID', async () => {
    const project = await target();
    const index: ArchitectIndex = architectIndex([
      moduleEntry('collection-review', '', null),
      moduleEntry('collection-review/workspace', 'subs/workspace', 'collection-review'),
      moduleEntry(reviews, 'subs/workspace/subs/reviews', 'collection-review/workspace'),
      moduleEntry(`${reviews}/checks`, 'subs/workspace/subs/reviews/subs/checks', reviews, { tags: ['testing'] }),
      // Readiness judges the fixture's scenario support code against the view.
      moduleEntry('collection-review/integration-tests', 'subs/integration-tests', 'collection-review', { tags: ['testing', 'dispatch'] }),
    ], new Map([[reviews, [{ module: reviews, name: 'attachReviewNote', file: 'subs/workspace/subs/reviews/src/notes.ts' }]]]));
    const plan = await planWithScenarios(project);
    const [, panel] = extractPlanScenarios(plan).scenarios;
    const note = entry('reviewer-note', reviews);
    const checks = entry('note-checks', `${reviews}/checks`);
    const step = (text: string) => `Scenario: ${text}\n  When the reviewer attaches the note "Checked"\n  Then the review run shows the note "Checked"`;
    const submitted = analysis([note, checks], [], [], [
      {
        key: 'attach-note', entry: 'reviewer-note', origin: { kind: 'architect' }, refs: [{ anchor: 'Acceptance' }],
        gherkin: 'Scenario: The note is stored\n  When the reviewer calls attachReviewNote with "Checked"\n  Then notes.ts holds the note "Checked"',
      },
      { key: 'attach-again', entry: 'reviewer-note', origin: { kind: 'architect' }, gherkin: step('The note is attached once') },
      { key: 'attach-twice', entry: 'reviewer-note', origin: { kind: 'architect' }, gherkin: step('The note is attached twice') },
      {
        key: 'panel-all', entry: 'note-checks', origin: { kind: 'architect' }, partOf: panel!.id, refs: [{ anchor: 'Acceptance' }],
        gherkin: ['Scenario: The whole panel', ...panel!.source.slice(1)].join('\n'),
      },
      {
        key: 'panel-unrelated', entry: 'note-checks', origin: { kind: 'architect' }, partOf: panel!.id,
        gherkin: 'Scenario: Nothing of the panel\n  Given a reviewer\n  Then nothing happens',
      },
    ], [{ planScenario: panel!.id, subScenarios: ['panel-all', 'panel-unrelated'] }]);
    // ps-01 is the plan's too, and appears as an origin once.
    const [attach] = extractPlanScenarios(plan).scenarios;
    submitted.scenarios.push({ key: 'plan-attach', entry: 'reviewer-note', origin: { kind: 'plan', planScenario: attach!.id }, gherkin: attach!.source.join('\n') });

    const { service } = await openRuns(project, {
      inputs: { ...shapeOnlyInputs, index: async () => index },
      script: script(submitted),
      unchangedCheckpoints: [scenariosCommit('review-notes'), 'wi-001', 'wi-002', 'wi-003', 'final verification of plan "review-notes"'],
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const events = await runEventsOnDisk(project, 'review-notes', receipt.jobId);
    const accepted = events.find(event => event.type === 'analysis-accepted')!;
    if (accepted.type !== 'analysis-accepted') throw new Error('unreachable');
    expect(accepted.data.scenarios).toBe(7);
    expect(accepted.data.warnings.map(warning => [warning.kind, warning.scenarios])).toEqual([
      ['names-view-symbol', ['sc-001']],
      ['names-view-file', ['sc-001']],
      ['sub-scenario-shares-no-step', ['sc-005']],
      ['duplicate-architect-steps', ['sc-002', 'sc-003']],
    ]);

    // A testing module's features sit in its own src/, and the integration
    // scenario of two sub-scenarios of one owner is that owner's.
    const read = async (id: string) => JSON.parse(await readFile(runPath(project, 'review-notes', receipt.jobId, runLayout.scenario(id)), 'utf8')) as ScenarioRecord;
    expect((await read('sc-004')).file).toBe('subs/workspace/subs/reviews/subs/checks/src/features/review-notes/note-checks.feature');
    const integration = await read('sc-007');
    expect([integration.kind, integration.owner, integration.file]).toEqual(['integration', `${reviews}/checks`, 'subs/workspace/subs/reviews/subs/checks/src/features/review-notes/integration.feature']);
    expect(onlyRun(service, 'review-notes').state).toBe('completed');
  }, 180_000);

  test('without a view, a proposed owner is placed where its proposal puts it', () => {
    const plan = describePlan('# Plan\n\n## Request\n\nDo it.\n\n## Acceptance\n\nDone.\n');
    const proposed = entry('note-archive', 'collection-review/archive', 'Keeps notes.', { parent: 'collection-review', directory: 'subs/archive/', purpose: 'Keeps notes.', tags: ['testing'] });
    const submitted = analysis([proposed, entry('reviewer-note', reviews)]);
    expect(validateInitialAnalysis(submitted, { index: null, plan, planScenarios: [] }).ok).toBe(true);
    const accepted = acceptAnalysis(submitted, { invocation: 'inv-0001', view: { status: 'placeholder' }, planId: 'p', planScenarios: [], index: null });
    expect(accepted.scenarios.map(record => [record.id, record.owner, record.file])).toEqual([
      ['sc-001', 'collection-review/archive', 'subs/archive/src/features/p/note-archive.feature'],
      ['sc-002', reviews, 'subs/workspace/subs/reviews/src/tests/features/p/reviewer-note.feature'],
    ]);
    expect(accepted.warnings).toEqual([]);
  });
});

describe('the form rules, through the real validation path', () => {
  const plan = describePlan(['# A plan', '', '## Request', '', 'Do the thing.', '', '## Acceptance', '', 'It is done.', '', '## Scenarios', '', '```gherkin', 'Scenario: It works', '  When it is used', '  Then it works', '```'].join('\n'));
  const planScenarios = extractPlanScenarios(['# A plan', '', '## Request', '', 'Do the thing.', '', '## Acceptance', '', 'It is done.', '', '## Scenarios', '', '```gherkin', 'Scenario: It works', '  When it is used', '  Then it works', '```'].join('\n')).scenarios;
  const one = entry('reviewer-note', reviews);
  const own = { key: 'plan-one', entry: 'reviewer-note', origin: { kind: 'plan' as const, planScenario: 'ps-01' }, gherkin: 'Scenario: It works\n  When it is used\n  Then it works' };
  const valid = analysis([one], [], [], [own, architectScenario(one)]);
  const rejected = (submission: InitialAnalysisSubmission) => {
    const result = validateInitialAnalysis(submission, { index: null, plan, planScenarios });
    if (result.ok) throw new Error('the submission was accepted');
    return result.errors;
  };

  test('the valid analysis is accepted', () => {
    expect(validateInitialAnalysis(valid, { index: null, plan, planScenarios }).ok).toBe(true);
  });

  test('rule 1: a gherkin value that is not one untagged scenario with a step', () => {
    const errors = rejected({ ...valid, scenarios: [own, { ...architectScenario(one), gherkin: '@tagged\nScenario: Tagged\n  Given a' }] });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe('scenarios.1.gherkin');
    expect(errors[0]!.message).toMatch(/^Scenario form rule 1 \(one scenario per gherkin value\)/);
    expect(errors[0]!.expected).toBe('a submission that keeps scenario form rule 1');
  });

  test('rule 2: a scenario naming no entry of the submission', () => {
    const errors = rejected({ ...valid, scenarios: [own, { ...architectScenario(one), entry: 'elsewhere' }] });
    expect([errors[0]!.path, errors[0]!.message]).toEqual(['scenarios.1.entry', expect.stringMatching(/^Scenario form rule 2 /)]);
  });

  test('rule 3: a plan scenario that is missing, or restated otherwise', () => {
    expect(rejected({ ...valid, scenarios: [architectScenario(one)] })[0]!.message).toMatch(/^Scenario form rule 3 .*ps-01/);
    const paraphrased = rejected({ ...valid, scenarios: [{ ...own, gherkin: 'Scenario: It works\n  When it is used\n  Then it works well' }, architectScenario(one)] });
    expect([paraphrased[0]!.path, paraphrased[0]!.message]).toEqual(['scenarios.0.gherkin', expect.stringMatching(/^Scenario form rule 3 .*as the plan states it/)]);
  });

  test('rule 4: an entry without a scenario', () => {
    const two = entry('note-in-panel', sharedUi);
    const errors = rejected(analysis([one, two], [], [], [own, architectScenario(one)]));
    expect([errors[0]!.path, errors[0]!.message]).toEqual(['entries.1', expect.stringMatching(/^Scenario form rule 4 .*"note-in-panel" has no scenario/)]);
  });

  test('rule 5: an integration step no sub-scenario picks', () => {
    const two = entry('note-in-panel', sharedUi);
    const sub = { key: 'use-it', entry: 'note-in-panel', origin: { kind: 'architect' as const }, partOf: 'ps-01', refs: [{ anchor: 'Acceptance' }], gherkin: 'Scenario: Used\n  When it is used\n  Then it is used' };
    const errors = rejected(analysis([one, two], [], [], [architectScenario(one), sub], [{ planScenario: 'ps-01', subScenarios: ['use-it'] }]));
    expect([errors[0]!.path, errors[0]!.message]).toEqual(['integrationScenarios.0.subScenarios', expect.stringMatching(/^Scenario form rule 5 .*"Then it works"/)]);
  });

  test('rule 6: an acceptance reference no scenario cites', () => {
    const errors = rejected({ ...valid, scenarios: [own, { ...architectScenario(one), refs: [] }] });
    expect([errors[0]!.path, errors[0]!.message]).toEqual(['entries.0.acceptanceRefs.0', expect.stringMatching(/^Scenario form rule 6 /)]);
  });

  test('the form rules follow every other rule: an analysis with other errors answers those alone', () => {
    const errors = rejected({ ...valid, entries: [{ ...one, requirementRefs: [{ anchor: 'Nowhere' }] }], scenarios: [] });
    expect(errors.map(error => error.path)).toEqual(['entries.0.requirementRefs.0.anchor']);
  });

  test('an architect scenario\'s refs lie inside the captured plan', () => {
    const errors = rejected({ ...valid, scenarios: [own, { ...architectScenario(one), refs: [{ anchor: 'Acceptance' }, { lines: [1, 400] }] }] });
    expect(errors.map(error => error.path)).toEqual(['scenarios.1.refs.1.lines']);
  });

  test('the capability slug "integration" is reserved for the integration scenarios\' file', () => {
    const reserved = entry('integration', reviews);
    const errors = rejected(analysis([reserved]));
    expect(errors.map(error => error.path)).toEqual(['entries.0.capability']);
    expect(errors[0]!.message).toContain('integration.feature');
  });

  test('an initial-architect/1 analysis, without scenarios, is not accepted', () => {
    const errors = rejected({ entries: [], hypotheses: [], coverageLimits: [] } as unknown as InitialAnalysisSubmission);
    expect(errors.map(error => error.path).sort()).toEqual(['integrationScenarios', 'scenarios']);
  });
});

describe('a form rule broken in a run', () => {
  test('counts against the per-turn bound: a correction is accepted, and three rejections end the invocation', async () => {
    const project = await target();
    const noScenario = analysis([entry('reviewer-note', reviews)], [], [], []);
    const { service, agent } = await openRuns(project, {
      script: [{ kind: 'submit', input: noScenario }, { kind: 'submit', input: noScenario }, { kind: 'submit', input: noScenario }],
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);

    const verdicts = agent!.sessions[0]!.verdicts;
    expect(verdicts).toHaveLength(3);
    const first = JSON.parse((verdicts[0] as { errors: string[] }).errors[0]!.split('\n\n')[0]!) as { errors: Array<{ path: string; message: string }>; remainingAttempts: number };
    expect(first.errors).toEqual([expect.objectContaining({ path: 'entries.0', message: expect.stringMatching(/^Scenario form rule 4 /) })]);
    expect(first.remainingAttempts).toBe(2);
    expect(verdicts.at(-1)).toMatchObject({ accepted: false, final: true });

    const snapshot = onlyRun(service, 'review-notes');
    expect([snapshot.state, snapshot.failure?.reason]).toEqual(['failed', 'invalid-submission']);
    expect(snapshot.counts.scenarios).toEqual({ pending: 0, bound: 0, declared: 0, implemented: 0 });
    const outcome = JSON.parse(await readFile(runPath(project, 'review-notes', receipt.jobId, runLayout.outcome('inv-0001')), 'utf8')) as InvocationOutcome;
    expect(outcome).toMatchObject({ ended: 'invalid-submission', rejectedSubmissions: 3 });
    const events = await runEventsOnDisk(project, 'review-notes', receipt.jobId);
    expect(events.some(event => event.type === 'analysis-accepted')).toBe(false);
  }, 180_000);
});

describe('the snapshot\'s scenario counts', () => {
  test('are zero before the analysis, all pending after it, and follow the scenario events', () => {
    const at = '2026-09-23T08:00:00.000Z';
    let sequence = 0;
    const line = (type: string, data: unknown) => ({ sequence: ++sequence, jobId: constructedRecord().jobId, at, type, data });
    const accepted = line('analysis-accepted', { invocation: 'inv-0001', entries: 1, hypotheses: 0, registry: 1, workItems: 1, scenarios: 3, warnings: [] });
    const record = constructedRecord();
    type Events = Parameters<typeof runSnapshot>[1];
    expect(runSnapshot(record, [] as unknown as Events).counts.scenarios).toEqual({ pending: 0, bound: 0, declared: 0, implemented: 0 });
    expect(runSnapshot(record, [accepted] as unknown as Events).counts.scenarios).toEqual({ pending: 3, bound: 0, declared: 0, implemented: 0 });
    // The events a later iteration writes move states by the table; one it rejects moves nothing.
    const moved = [
      accepted,
      line('scenario-declared', { scenario: 'sc-001', by: 'inv-0003', state: 'declared' }),
      line('scenario-declared', { scenario: 'sc-002', by: 'inv-0003', state: 'bound' }),
      line('scenario-implemented', { scenario: 'sc-001', gate: 'ga-0004' }),
      line('scenario-implemented', { scenario: 'sc-003', gate: 'ga-0004' }),
    ];
    expect(runSnapshot(record, moved as unknown as Events).counts.scenarios).toEqual({ pending: 1, bound: 1, declared: 0, implemented: 1 });
  });
});
