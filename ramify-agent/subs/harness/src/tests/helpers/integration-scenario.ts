import { finalCandidate } from './final-candidate.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GateAttempt, ScenarioCheckSummary } from '../../checks/records.js';
import type { RunEvent } from '../../run/log.js';
import { runLayout } from '../../run/records.js';
import { analysis, entry, requestCompletion } from './analysis.js';
import { accepted, added, answeredGit, modified, scenariosCommitted, unchanged, type CommitResponse } from './contracts-git.js';
import type { DirectCheckScript } from './direct-check-execution.js';
import { copyFixture } from './fixture.js';
import { addModule, assign, byWork, completionProposed, installMiniRunner, outline, submit, treeInputs, write } from './iterations.js';
import { openRuns, runPath, startRun } from './runs.js';

/*
 * One integration scenario on the collection-review fixture, architecture
 * §10, for the tests that drive it with and without the real checker.
 *
 * The plan's one scenario combines two entries: a reviewer writes a note,
 * and tags it. The initial architect decomposes it into one sub-scenario per
 * entry, the tags' bridged with a Given that states the written note instead
 * of taking the action. Each entry's work item binds its own sub-scenario in
 * its own module, under the reviews module; the implementation of the second
 * creates the integration work item at reviews, their common ancestor. Its
 * engineer works there with both children in scope, writes a step file that
 * imports the two step files by name, exposes them with `expose-test`, and
 * declares the scenario.
 *
 * Agents are scripted and Git answers from the scenario's own data. The
 * scenario runner is the direct executor, which reports every scenario its
 * selection reaches as passed unless a test says otherwise.
 */

/** Where a test registers what it removes afterwards. */
export type Cleanups = Array<() => Promise<void>>;

export const plan = 'review-notes';
export const finalSubject = `final verification of plan "${plan}"`;
export const reviews = 'collection-review/workspace/reviews';
export const reviewsDirectory = 'subs/workspace/subs/reviews';
export const notes = `${reviews}/notes`;
export const notesDirectory = `${reviewsDirectory}/subs/notes`;
export const tags = `${reviews}/tags`;
export const tagsDirectory = `${reviewsDirectory}/subs/tags`;

export const featureOf = (directory: string, name: string) => `${directory}/src/tests/features/${plan}/${name}.feature`;
export const noteFeature = featureOf(notesDirectory, 'review-note');
export const tagFeature = featureOf(tagsDirectory, 'review-tags');
export const integrationFeature = featureOf(reviewsDirectory, 'integration');
export const noteSteps = `${notesDirectory}/src/tests/steps/review-note.steps.ts`;
export const tagSteps = `${tagsDirectory}/src/tests/steps/review-tags.steps.ts`;
export const ancestorSteps = `${reviewsDirectory}/src/tests/steps/integration.steps.ts`;

/** The plan's integration scenario, as the plan states it. */
export const planScenario = [
  'Scenario: A written note is shown with its tag',
  '  Given the project as the plan finds it',
  '  When the person uses review-note',
  '  And the person uses review-tags',
  '  Then the outcome review-tags promises is shown',
];

/** The analysis: one sub-scenario per entry, the tags' bridged with a Given. */
export function integrationAnalysis() {
  return analysis([entry('review-note', notes), entry('review-tags', tags)], [], [], [
    {
      key: 'note-for-tags', entry: 'review-note', origin: { kind: 'architect' }, partOf: 'ps-01', refs: ['review-note-acceptance'],
      gherkin: [
        'Scenario: A note is written for tagging',
        '  Given the project as the plan finds it',
        '  When the person uses review-note',
        '  Then the outcome review-note promises is shown',
      ].join('\n'),
    },
    {
      key: 'tags-on-note', entry: 'review-tags', origin: { kind: 'architect' }, partOf: 'ps-01', refs: ['review-tags-acceptance'],
      gherkin: [
        'Scenario: A written note is tagged',
        '  Given a note was written with review-note',
        '  When the person uses review-tags',
        '  Then the outcome review-tags promises is shown',
      ].join('\n'),
    },
  ], [{ planScenario: 'ps-01', subScenarios: ['note-for-tags', 'tags-on-note'] }]);
}

/** Each entry's step file: its own definitions, and one named export the ancestor imports. */
export const noteStepFile = [
  "import { Given, Then, When } from '@cucumber/cucumber';",
  '',
  '/** The definitions of review-note, for a step file that imports them by name. */',
  "export const reviewNoteSteps = 'review-note';",
  '',
  "Given('the project as the plan finds it', () => {});",
  "When('the person uses review-note', () => {});",
  "Then('the outcome review-note promises is shown', () => {});",
  '',
].join('\n');
export const tagStepFile = [
  "import { Given, Then, When } from '@cucumber/cucumber';",
  '',
  '/** The definitions of review-tags, for a step file that imports them by name. */',
  "export const reviewTagsSteps = 'review-tags';",
  '',
  "Given('a note was written with review-note', () => {});",
  "When('the person uses review-tags', () => {});",
  "Then('the outcome review-tags promises is shown', () => {});",
  '',
].join('\n');
/** The ancestor's step file: the sub-scenarios' definitions, imported by name, and none of its own. */
export const ancestorStepFile = [
  "import { reviewNoteSteps } from '../../../subs/notes/src/tests/steps/review-note.steps.js';",
  "import { reviewTagsSteps } from '../../../subs/tags/src/tests/steps/review-tags.steps.js';",
  '',
  '/** The integration scenario binds to its sub-scenarios\' definitions; this file defines no step. */',
  'export const integrationSteps = [reviewNoteSteps, reviewTagsSteps] as const;',
  '',
].join('\n');
export const exposing = (name: string, symbol: string, file: string) => [
  'ramify 1',
  `module ${name}`,
  '',
  '// The step definitions of this module\'s scenarios, for the integration',
  '// scenario\'s step file at the parent.',
  `expose-test ${symbol} from "steps/${file}" to parent`,
  '',
].join('\n');
export const notesModule = `${notesDirectory}/module.ramify`;
export const tagsModule = `${tagsDirectory}/module.ramify`;

/** A copy of the fixture with the two entries' modules and the plan's integration scenario. */
export async function integrationProject(cleanups: Cleanups): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  // Each module has source and a test of its own, which its gates select.
  const owned = (name: string) => ({
    [`src/${name}.ts`]: `export const ${name}Limit = 500;\n`,
    [`src/tests/${name}.test.ts`]: [
      "import { expect, test } from 'vitest';",
      `import { ${name}Limit } from '../${name}.js';`,
      '',
      `test('the ${name} limit is the plan\'s', () => {`,
      `  expect(${name}Limit).toBe(500);`,
      '});',
      '',
    ].join('\n'),
  });
  await addModule(fixture.root, notesDirectory, 'notes', owned('notes'));
  await addModule(fixture.root, tagsDirectory, 'tags', owned('tags'));
  const planPath = join(fixture.root, 'plans', plan, 'plan.md');
  await writeFile(planPath, [(await readFile(planPath, 'utf8')).trimEnd(), '', '## Scenarios', '', '```gherkin', ...planScenario, '```', ''].join('\n'));
  await installMiniRunner(fixture.root);
  return fixture.root;
}

/** The turns of the two entries' work items: each binds its own sub-scenario in one iteration. */
export const entryTurns = {
  'initial-architect': [submit(integrationAnalysis())],
  'local-architect:wi-001': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
  'engineer:wi-001': [submit(completionProposed('The note\'s sub-scenario is bound.', { scenarios: ['sc-001'] }), write('tests/steps/review-note.steps.ts', noteStepFile))],
  'local-architect:wi-002': [submit(assign(tags, {}, outline())), submit(requestCompletion())],
  'engineer:wi-002': [submit(completionProposed('The tags\' sub-scenario is bound.', { scenarios: ['sc-002'] }), write('tests/steps/review-tags.steps.ts', tagStepFile))],
};

/** The integration work item's assignment: the ancestor, with both children on the paths to the owners. */
export const bindAtAncestor = assign(reviews, {
  goal: 'Bind sc-003 at the common ancestor.',
  approach: 'Import both step files by name, and expose them to this module with expose-test.',
  scope: { base: { module: reviews, includedChildren: [notes, tags] }, extra: [], read: [], rationale: 'The ancestor and both paths down to the owners.' },
}, outline());

/** The engineer that binds it: the ancestor's step file, the two exposures, and the declaration. */
export const bindTurn = submit(
  completionProposed('The integration scenario binds to both sub-scenarios\' definitions.', { scenarios: ['sc-003'] }),
  write('tests/steps/integration.steps.ts', ancestorStepFile),
  write('../subs/notes/module.ramify', exposing('notes', 'reviewNoteSteps', 'review-note.steps.ts')),
  write('../subs/tags/module.ramify', exposing('tags', 'reviewTagsSteps', 'review-tags.steps.ts')),
);

/** The commits of the two entries' work items, then the integration item's iteration. */
export const entryCommits: CommitResponse[] = [
  accepted('wi-001.i01', 'revision-01', [...added(noteSteps), ...modified(noteFeature)]),
  unchanged('wi-001'),
  accepted('wi-002.i01', 'revision-02', [...added(tagSteps), ...modified(tagFeature)]),
  unchanged('wi-002'),
];
export const bindCommit = accepted('wi-003.i01', 'revision-03', [...added(ancestorSteps), ...modified(notesModule, tagsModule, integrationFeature)]);

export async function runIntegration(
  cleanups: Cleanups,
  root: string,
  script: Parameters<typeof byWork>[0],
  commits: readonly CommitResponse[],
  checkScript?: DirectCheckScript,
) {
  const before = commits.slice(0, -1).flatMap(commit => commit.commit ?? []).at(-1) ?? 'scenarios-00';
  const candidate = finalCandidate(root, before, commits.at(-1)?.commit ?? before);
  const git = answeredGit(root, { head: 'revision-00', commits: [scenariosCommitted(plan, 'scenarios-00'), ...commits],
    previews: candidate.previews });
  const opened = await openRuns(root, {
    script: byWork(script),
    inputs: treeInputs(),
    git, candidates: candidate.candidates,

    ...(checkScript === undefined ? {} : { checkScript }),
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun(plan));
  await opened.service.settled(plan, receipt.jobId);
  return { ...opened, git, runId: receipt.jobId };
}

export async function gates(root: string, runId: string, log: readonly RunEvent[]): Promise<GateAttempt[]> {
  const ids = [...new Set(log.filter(event => event.type === 'gate-attempted').map(event => (event.data as { gate: string }).gate))];
  return Promise.all(ids.map(async id => JSON.parse(await readFile(runPath(root, plan, runId, runLayout.gate(id)), 'utf8')) as GateAttempt));
}

export function summaryOf(attempt: GateAttempt): ScenarioCheckSummary | undefined {
  return attempt.commands.find(command => command.kind === 'scenarios')?.scenarios;
}

/** The index of the first event of a type that matches. */
export function at(log: readonly RunEvent[], type: string, match: (data: Record<string, unknown>) => boolean = () => true): number {
  return log.findIndex(event => event.type === type && match(event.data as Record<string, unknown>));
}
