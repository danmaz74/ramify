import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { localDecision, registryChange } from './helpers/placement.js';
import {
  addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline, submit, treeInputs, write,
} from './helpers/iterations.js';
import { onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { accepted, added, answeredGit, modified, unchanged, type CommitResponse, scenariosCommitted } from './helpers/contracts-git.js';
import { finalCandidate } from './helpers/final-candidate.js';
import type { RunEvent } from '../run/log.js';
import { contractsLayout, type ConsumerRequirement, type ContractRecord, type ProviderObligation } from '../contracts/records.js';
import { workLayout, type WorkItem } from '../work/records.js';
import { iterationLayout, type IterationAssignment } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import type { GateAttempt } from '../checks/records.js';
import { createLocalCommandCheckExecution } from './helpers/direct-check-execution.js';

/*
 * One delegation, end to end on the review-notes fixture: a consumer that
 * needs behavior outside its scope, a contract sub-session that establishes
 * the agreement, one provider obligation, one provider work item, and a
 * verification that closes the requirement against the real provider.
 *
 * This retained integration scenario executes the selected conformance tests.
 * Nothing here simulates a transition. Every submission goes through the
 * same judge an agent's would, and every file is written through the port's
 * own built-ins behind the write guard. Git is external and answered from
 * this file's own data; K4 keeps the real local command executor because its
 * subject is what those commands selected, ran and printed.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const consumer = 'collection-review/workspace/reviews/notes';
const consumerDirectory = 'subs/workspace/subs/reviews/subs/notes';
const provider = 'collection-review/workspace/reviews/limits';
const providerDirectory = 'subs/workspace/subs/reviews/subs/limits';

const stub = [
  'export function addNote(note) {',
  '  throw new Error(\'the note limit is not available here yet\');',
  '}',
  '',
].join('\n');

const consumerTest = [
  "import { test, expect } from 'vitest';",
  "import { addNote } from '../notes.ts';",
  '',
  "test('a note within the limit is kept', () => {",
  "  expect(addNote('a short note')).toBe('a short note');",
  '});',
  '',
  "test('a note over the limit is refused', () => {",
  "  expect(addNote('x'.repeat(501))).toBe('');",
  '});',
  '',
].join('\n');

const contractFile = [
  '/** A note of at most 500 characters is within the limit. */',
  'export const noteLimitCases = [',
  "  { note: 'a short note', within: true },",
  "  { note: 'x'.repeat(500), within: true },",
  "  { note: 'x'.repeat(501), within: false },",
  '];',
  '',
].join('\n');

const fakeFile = [
  "import { noteLimitCases } from '../interfaces/note-limit.ts';",
  '',
  '/** The fake the consumer implements against until the real provider exists. */',
  'export function createNoteLimitFake() {',
  '  void noteLimitCases;',
  '  return { withinLimit: (note) => note.length <= 500 };',
  '}',
  '',
].join('\n');

const subjectsFile = [
  "import { createNoteLimitFake } from '../fakes/note-limit.fake.ts';",
  '',
  "export const subjects = [{ name: 'the fake', create: createNoteLimitFake }];",
  '',
].join('\n');

const conformanceFile = [
  "import { test, expect } from 'vitest';",
  "import { noteLimitCases } from '../interfaces/note-limit.ts';",
  "import { subjects } from './note-limit.subjects.ts';",
  '',
  'for (const subject of subjects) {',
  '  for (const agreed of noteLimitCases) {',
  '    test(subject.name + \' answers \' + agreed.within + \' for \' + agreed.note.length, () => {',
  '      expect(subject.create().withinLimit(agreed.note)).toBe(agreed.within);',
  '    });',
  '  }',
  '}',
  '',
].join('\n');

const integrated = [
  "import { createNoteLimitFake } from '../../limits/src/fakes/note-limit.fake.ts';",
  '',
  'const limit = createNoteLimitFake();',
  '',
  'export function addNote(note) {',
  "  return limit.withinLimit(note) ? note : '';",
  '}',
  '',
].join('\n');

const realProvider = [
  '/** The real note limit. */',
  'export function createNoteLimit() {',
  '  return { withinLimit: (note) => note.length <= 500 };',
  '}',
  '',
].join('\n');

const bothSubjects = [
  "import { createNoteLimitFake } from '../fakes/note-limit.fake.ts';",
  "import { createNoteLimit } from '../note-limit.ts';",
  '',
  'export const subjects = [',
  "  { name: 'the fake', create: createNoteLimitFake },",
  "  { name: 'the real provider', create: createNoteLimit },",
  '];',
  '',
].join('\n');

const verified = [
  "import { createNoteLimit } from '../../limits/src/note-limit.ts';",
  '',
  'const limit = createNoteLimit();',
  '',
  'export function addNote(note) {',
  "  return limit.withinLimit(note) ? note : '';",
  '}',
  '',
].join('\n');

/** A project with the consumer that needs the behavior and the owner that will provide it. */
async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, consumerDirectory, 'notes', {
    'src/notes.ts': stub,
    'src/tests/notes.test.ts': consumerTest,
  });
  await addModule(fixture.root, providerDirectory, 'limits', {});
  await installMiniRunner(fixture.root);
  return fixture.root;
}

/**
 * A run over this fixture whose Git answers are the scenario's own data:
 * the revision Git reports for each commit the harness attempts, or that
 * the tree was unchanged.
 */
async function run(
  root: string,
  plan: Parameters<typeof byRole>[0],
  commits: readonly CommitResponse[],
  finalHead: string,
  options: Omit<Parameters<typeof openRuns>[1], 'git'> = {},
) {
  const final = finalCandidate(root, finalHead);
  const git = answeredGit(root, { head: 'revision-00', commits: [scenariosCommitted('review-notes'), ...commits], previews: final.previews });
  const opened = await openRuns(root, {
    script: byRole(plan), inputs: treeInputs(), git, candidates: final.candidates,
     ...options,
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  return { ...opened, git, runId: receipt.jobId };
}

const need = {
  capability: 'note-limit',
  useCases: ['a reviewer attaches a note to a review run, and a note over the limit is refused'],
  inputs: ['the note text'],
  outputs: ['whether the note is within the limit'],
  sideEffects: [],
  constraints: ['at most 500 characters'],
  existingEvidence: [`${consumerDirectory}/src/tests/notes.test.ts`],
};

/** The `contract-needed` submission, as the engineer writes it. */
const contractNeeded = {
  kind: 'contract-needed' as const,
  need,
  suggestedProvider: provider,
  summary: 'The note limit is not behavior this module owns, so nothing here was changed.',
};

/** The `established` submission, as the contract sub-session writes it. */
const establishedContract = {
  kind: 'established' as const,
  mode: 'fake-backed' as const,
  authority: {
    kind: 'provider' as const,
    owner: provider,
    rationale: 'The note limit is a capability of its own, so its public contract belongs with the module that implements it.',
  },
  provider,
  behavior: 'A note of at most 500 characters is within the limit; a longer one is not.',
  artifacts: {
    interface: [{ path: `${providerDirectory}/src/interfaces/note-limit.ts`, exports: ['noteLimitCases'] }],
    conformance: [{ path: `${providerDirectory}/src/tests/note-limit.conformance.test.ts` }],
    fake: [{
      path: `${providerDirectory}/src/fakes/note-limit.fake.ts`,
      exports: ['createNoteLimitFake'],
      standsFor: [{ fake: 'createNoteLimitFake', path: `${providerDirectory}/src/note-limit.ts`, export: 'createNoteLimit', exposure: { to: [], reexposed: [] } }],
    }],
    exposure: [{ path: `${providerDirectory}/module.ramify`, declaration: 'expose-src noteLimitCases from "interfaces/note-limit.ts" to parent' }],
  },
  fakeInjections: [`${consumerDirectory}/src/notes.ts`],
  summary: 'The note limit is agreed, the consumer runs against its fake, and the conformance suite states what the provider owes.',
};

/** The writes of the contract sub-session, in the order it makes them. */
const contractWrites = [
  write(`${providerDirectory}/src/interfaces/note-limit.ts`, contractFile),
  write(`${providerDirectory}/src/fakes/note-limit.fake.ts`, fakeFile),
  write(`${providerDirectory}/src/tests/note-limit.subjects.ts`, subjectsFile),
  write(`${providerDirectory}/src/tests/note-limit.conformance.test.ts`, conformanceFile),
  write(`${consumerDirectory}/src/notes.ts`, integrated),
];

/** The local decision that places the capability the consumer needs. */
const placeTheLimit = localDecision(
  {
    question: 'Where does the note limit belong?',
    outcome: 'reuse',
    capability: 'note-limit',
    owner: provider,
    rationale: 'The limit is a rule of its own, and this subtree is mine to place work in.',
  },
  [registryChange({ capability: 'note-limit', owner: provider, behavior: 'A note of at most 500 characters is within the limit.' })],
);

/** The files each side of the seam owns, as the scenario's Git answers name them. */
const seam = {
  interface: `${providerDirectory}/src/interfaces/note-limit.ts`,
  fake: `${providerDirectory}/src/fakes/note-limit.fake.ts`,
  subjects: `${providerDirectory}/src/tests/note-limit.subjects.ts`,
  conformance: `${providerDirectory}/src/tests/note-limit.conformance.test.ts`,
  real: `${providerDirectory}/src/note-limit.ts`,
  consumer: `${consumerDirectory}/src/notes.ts`,
};

/**
 * What Git reports through one delegation: the agreement's files, the real
 * provider beside them, the consumer's move off the fake, and an unchanged
 * tree for the gates that follow a commit without a write of their own.
 */
const delegationCommits = (verification: string): CommitResponse[] => [
  accepted('wi-001.i02', 'revision-01', [...added(seam.interface, seam.fake, seam.subjects, seam.conformance), ...modified(seam.consumer)]),
  accepted('wi-002.i01', 'revision-02', [...added(seam.real), ...modified(seam.subjects)]),
  unchanged('wi-002'),
  accepted(verification, 'revision-03', modified(seam.consumer)),
  unchanged('wi-001'),
  unchanged('final verification of plan "review-notes"'),
];

async function events(root: string, runId: string): Promise<RunEvent[]> {
  return runEventsOnDisk(root, 'review-notes', runId);
}

function typesOf(log: readonly RunEvent[]): string[] {
  return log.map(event => event.type);
}

async function readJson<T>(root: string, runId: string, path: string): Promise<T> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, path), 'utf8')) as T;
}

describe('P1: one consumer delegates, resumes after provider conformance and verifies against the real provider', () => {
  test('K4: the contract gate runs the suite against the fake and the provider gate runs it against the real provider', async () => {
    const root = await target();
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', consumer)]))],
      'local-architect': [
        submit({ ...assign(consumer, {}, outline()), localDecisions: [placeTheLimit] }),
        submit({ kind: 'yield-for-providers', requirements: ['rq-001'], summary: 'Waiting for the real limit.' }),
        submit(assign(provider, {}, outline({ changes: 'Implement the agreed limit.' }))),
        submit(requestCompletion()),
        submit(assign(consumer, { kind: 'verification', goal: 'Replace the fake with the real note limit.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit(contractNeeded),
        submit(completionProposed('The real note limit is implemented.'),
          write(join(root, providerDirectory, 'src/note-limit.ts'), realProvider),
          write(join(root, providerDirectory, 'src/tests/note-limit.subjects.ts'), bothSubjects)),
        submit(completionProposed('The consumer uses the real note limit.'),
          write(join(root, consumerDirectory, 'src/notes.ts'), verified)),
      ],
      'contract-engineer': [submit(establishedContract, ...contractWrites)],
      // A retained real boundary: this scenario is about what the gate's
      // own commands ran and printed, so the project's test runner really
      // runs. Git and the command line remain answered.
    }, delegationCommits('wi-001.i03'), 'revision-03', { checkExecution: createLocalCommandCheckExecution() });
    expect(onlyRun(service, 'review-notes').state).toBe('completed');

    const log = await events(root, runId);
    const gateIds = [...new Set(log.filter(event => event.type === 'gate-attempted').map(event => event.data.gate))];
    const attempts = await Promise.all(gateIds.map(id => readJson<GateAttempt>(root, runId, runLayout.gate(id))));
    const suite = `${providerDirectory}/src/tests/note-limit.conformance.test.ts`;

    // The contract gate required the suite it had just been given, and ran
    // it while the fake was its only subject.
    const contractGate = attempts.find(attempt => attempt.checkpoint === 'contract')!;
    expect(contractGate.verdict).toBe('passed');
    const contractSelection = contractGate.commands.find(command => command.selection !== undefined)!.selection!;
    expect(contractSelection.extraSuites).toEqual([suite]);
    expect(contractSelection.resolved).toEqual(expect.arrayContaining([suite, `${consumerDirectory}/src/tests/notes.test.ts`]));
    // The fixture's declared module tree records no originals, so the
    // parity rule says it compared nothing rather than passing silently.
    expect(contractGate.rules).toEqual([
      { rule: 'fake-naming', outcome: 'passed', violations: [] },
      { rule: 'fake-exposure-parity', outcome: 'passed', violations: [], limits: [expect.stringContaining('the architect view records no such original')] },
      { rule: 'scratch-safety', outcome: 'passed', violations: [] },
      { rule: 'write-scope', outcome: 'passed', violations: [] },
    ]);

    // The provider's gate ran the same suite, and its assignment carried the
    // obligation that says it runs against the real implementation.
    const providerAssignment = await readJson<IterationAssignment>(root, runId, iterationLayout.assignment('wi-002', 1));
    expect(providerAssignment.evidenceObligations).toEqual([{
      obligation: { id: 'ob-ct-001', revision: 1, hash: expect.any(String) },
      suite: [suite],
      against: 'real',
    }]);
    expect(providerAssignment.gate.tests.extraSuites).toEqual([suite]);

    const providerGate = attempts.find(attempt =>
      attempt.subject.iteration === 'wi-002.i01' && attempt.checkpoint === 'iteration')!;
    expect(providerGate.verdict).toBe('passed');
    expect(providerGate.commands.find(command => command.selection !== undefined)!.selection!.resolved).toContain(suite);
    // The same file, and a different subject: the real provider was in the
    // suite's subjects when the provider's gate ran it, and was not when the
    // contract gate did.
    const subjects = await readFile(`${root}/${providerDirectory}/src/tests/note-limit.subjects.ts`, 'utf8');
    expect(subjects).toContain('the real provider');
    expect(providerGate.commands[0]!.output.tail).toContain('the real provider');
    expect(contractGate.commands[0]!.output.tail).not.toContain('the real provider');

    // Neither substitutes for the other: the verification gate runs it again
    // with the consumer's own tests and the fake gone.
    const verification = await readJson<IterationAssignment>(root, runId, iterationLayout.assignment('wi-001', 3));
    expect(verification.kind).toBe('verification');
    expect(verification.evidenceObligations).toEqual([{
      requirement: { id: 'rq-001', revision: 1, hash: expect.any(String) },
      suite: [suite],
      against: 'real',
    }]);

    // The commands ran for real here; Git did not. Every answer this
    // scenario stated was used, and the run asked Git for nothing else.
    expect(git.minted()).toEqual(['scenarios-of-review-notes', 'revision-01', 'revision-02', 'revision-03']);
    git.assertAnswered();
  }, 120_000);
});
