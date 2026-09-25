import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { localDecision, registryChange } from './helpers/placement.js';
import {
  addModule, assign, byRole, completionProposed, edit, installMiniRunner, outline, submit, treeInputs, write,
} from './helpers/iterations.js';
import { onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { accepted, added, answeredGit, modified, unchanged, type CommitResponse, scenariosCommitted } from './helpers/contracts-git.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import type { RunEvent } from '../run/log.js';
import { contractsLayout, type ConsumerRequirement, type ContractRecord, type ProviderObligation } from '../contracts/records.js';
import { workLayout, type WorkItem } from '../work/records.js';
import { iterationLayout, type IterationAssignment } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import type { GateAttempt } from '../checks/records.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * One delegation, end to end on the review-notes fixture: a consumer that
 * needs behavior outside its scope, a contract sub-session that establishes
 * the agreement, one provider obligation, one provider work item, and a
 * verification that closes the requirement against the real provider.
 *
 * Nothing here simulates a transition. Every submission goes through the
 * same judge an agent's would, and every file is written through the port's
 * own built-ins behind the write guard. Git is external and answered from
 * this file's own data, as are the gate's commands. The real selected-command
 * witness lives in `contract-delegation-integration.test.ts`.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0)) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
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
  options: Omit<Parameters<typeof openRuns>[1], 'git'> = {},
) {
  const git = answeredGit(root, { head: 'revision-00', commits: [scenariosCommitted('review-notes'), ...commits] });
  const opened = await openRuns(root, {
    script: byRole(plan), inputs: treeInputs(), git, readinessExecution: directReadinessExecution(), ...options,
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
  test('the delegation runs end to end and only the real provider closes it', async () => {
    const root = await target();
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', consumer)]))],
      'local-architect': [
        // The consumer's own turn: it places the capability within its own
        // authority and assigns the work that discovers the need.
        submit({ ...assign(consumer, {}, outline()), localDecisions: [placeTheLimit] }),
        // The agreement is registered; the consumer has done what it can
        // against the fake and waits for the provider.
        submit({ kind: 'yield-for-providers', requirements: ['rq-001'], summary: 'The consumer runs against the fake and waits for the real limit.' }),
        // The provider work item the registration started.
        submit(assign(provider, {}, outline({ changes: 'Implement the agreed limit and run the conformance suite against it.' }))),
        submit(requestCompletion()),
        // The consumer, resumed: verification replaces the fake.
        submit(assign(consumer, { kind: 'verification', goal: 'Replace the fake with the real note limit and rerun the behavior.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit(contractNeeded),
        submit(completionProposed('The real note limit is implemented and the conformance suite runs against it.'),
          write(`${providerDirectory}/src/note-limit.ts`, realProvider),
          write(`${providerDirectory}/src/tests/note-limit.subjects.ts`, bothSubjects)),
        submit(completionProposed('The consumer now uses the real note limit.'),
          write(`${consumerDirectory}/src/notes.ts`, verified)),
      ],
      'contract-engineer': [submit(establishedContract, ...contractWrites)],
    }, delegationCommits('wi-001.i03'));

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const log = await events(root, runId);
    const types = typesOf(log);

    // One contract iteration, one registration, one obligation, one
    // requirement and one provider work item.
    expect(types.filter(type => type === 'contract-requested')).toHaveLength(1);
    expect(types.filter(type => type === 'contract-registered')).toHaveLength(1);
    const registered = log.find(event => event.type === 'contract-registered')!;
    expect(registered.data).toMatchObject({
      contract: 'ct-001',
      revision: 1,
      mode: 'fake-backed',
      obligation: 'ob-ct-001',
      requirements: ['rq-001'],
      providerWorkItem: 'wi-002',
    });

    const contract = await readJson<ContractRecord>(root, runId, contractsLayout.contract('ct-001', 1));
    expect(contract.provider).toBe(provider);
    expect(contract.authority.kind).toBe('provider');
    expect(contract.mode).toBe('fake-backed');
    // The hashes are the harness's, taken from the files the gate passed over.
    expect(contract.artifacts.fake[0]!.hash).toMatch(/^[0-9a-f]{64}$/);

    const obligation = await readJson<ProviderObligation>(root, runId, contractsLayout.obligation('ob-ct-001', 1));
    expect(obligation.evidence.against).toBe('real');
    expect(obligation.evidence.conformance).toEqual([`${providerDirectory}/src/tests/note-limit.conformance.test.ts`]);

    const requirement = await readJson<ConsumerRequirement>(root, runId, contractsLayout.requirement('rq-001', 1));
    expect(requirement.consumer).toBe(consumer);
    expect(requirement.forCapability).toBe('review-notes');
    expect(requirement.evidence.fakeInjections).toEqual([`${consumerDirectory}/src/notes.ts`]);

    const providerItem = await readJson<WorkItem>(root, runId, workLayout.item('wi-002'));
    expect(providerItem.module).toBe(provider);
    expect(providerItem.startedFor).toBe('wi-001');
    expect(providerItem.origin).toEqual({ obligation: { id: 'ob-ct-001', revision: 1, hash: expect.any(String) } });

    // The consumer yields, the provider runs, and the consumer comes back
    // only once the provider has conformed. The requirement is still open
    // when it resumes: waiting for its own verification would deadlock.
    const order = types.filter(type => ['work-item-yielded', 'provider-conformed', 'work-item-resumed', 'requirement-verified'].includes(type));
    expect(order).toEqual(['work-item-yielded', 'provider-conformed', 'work-item-resumed', 'requirement-verified']);

    // The provider work item ran between the yield and the resumption.
    const yielded = types.indexOf('work-item-yielded');
    const resumed = types.indexOf('work-item-resumed');
    const started = log.findIndex(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002');
    expect(started).toBeGreaterThan(yielded);
    expect(started).toBeLessThan(resumed);

    const conformed = log.find(event => event.type === 'provider-conformed')!;
    expect(conformed.data).toMatchObject({ obligation: 'ob-ct-001', revision: 1, workItem: 'wi-002' });
    const closed = log.find(event => event.type === 'requirement-verified')!;
    expect(closed.data).toMatchObject({ requirement: 'rq-001', revision: 1, workItem: 'wi-001' });

    // The consumer's source no longer reaches the fake, which is what
    // `requirement-verified` required.
    const source = await readFile(`${root}/${consumerDirectory}/src/notes.ts`, 'utf8');
    expect(source).not.toContain('Fake');
    expect(source).toContain('createNoteLimit');

    // Both work items completed, and the run's final gate followed them.
    expect(types.filter(type => type === 'work-item-completed')).toHaveLength(2);
    expect(types.at(-1)).toBe('job-completed');
    const snapshot = onlyRun(service, 'review-notes');
    expect(snapshot.counts.openRequirements).toBe(0);
    expect(snapshot.counts.completedWorkItems).toBe(2);

    // The run committed on its own branch: the agreement, the real provider
    // and the verification, in that order, each over the one before it.
    expect(git.branch()).toBe(`ramify-agent-run/${runId}`);
    expect(git.minted()).toEqual(['scenarios-of-review-notes', 'revision-01', 'revision-02', 'revision-03']);
    git.assertAnswered();
  }, 60_000);


});

describe('X1b: a contract sub-session that returns incomplete registers nothing', () => {
  test('no contract and no obligation are committed, and its caller accounts for the partial work', async () => {
    const root = await target();
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', consumer)]))],
      'local-architect': [
        submit({ ...assign(consumer, {}, outline()), localDecisions: [placeTheLimit] }),
        // Nothing was registered, so there is no requirement to wait for.
        // The caller accounts for the partial work itself.
        submit(assign(consumer, { goal: 'Carry the limit in this module, since the agreement was not established.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit(contractNeeded),
        submit(completionProposed('The limit is carried here, because the agreement was not established.'),
          write(`${consumerDirectory}/src/notes.ts`, [
            'export function addNote(note) {',
            "  return note.length <= 500 ? note : '';",
            '}',
            '',
          ].join('\n'))),
      ],
      'contract-engineer': [submit({
        kind: 'incomplete',
        done: ['read both sides of the seam'],
        unfinished: ['the fake does not pass the conformance suite yet'],
        findings: ['the limit is stated in two places that disagree'],
      }, write(`${providerDirectory}/src/interfaces/note-limit.ts`, contractFile))],
    }, [
      // Nothing was committed while the agreement was open, so the first
      // commit of the run carries the interface the unfinished session left
      // beside the work its caller carried itself.
      accepted('wi-001.i03', 'revision-01', [...added(seam.interface), ...modified(seam.consumer)]),
      unchanged('wi-001'),
      unchanged('final verification of plan "review-notes"'),
    ]);

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const log = await events(root, runId);
    const types = typesOf(log);
    expect(types).toContain('contract-requested');
    expect(types).not.toContain('contract-registered');
    expect(types).not.toContain('work-item-yielded');

    // One work item, and no provider item: registration is what starts one.
    expect(types.filter(type => type === 'work-item-started')).toHaveLength(1);
    expect(onlyRun(service, 'review-notes').counts.openRequirements).toBe(0);

    // The caller accounts for the partial work: the contract iteration's own
    // result is `partial` and says what is unfinished, and the requesting
    // work item's architect was told.
    const result = await readJson<{ outcome: string; findings: string[] }>(root, runId, iterationLayout.result('wi-001', 2));
    expect(result.outcome).toBe('partial');
    expect(result.findings.join(' ')).toContain('registered nothing');
    expect(result.findings.join(' ')).toContain('the fake does not pass the conformance suite yet');

    // One commit, for the work its caller carried: a session that registered
    // nothing has no gate and no commit of its own.
    expect(git.minted()).toEqual(['scenarios-of-review-notes', 'revision-01']);
    expect(git.subjects()).toHaveLength(4);
    git.assertAnswered();
  }, 60_000);
});
