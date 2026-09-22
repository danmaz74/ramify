import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { localDecision, registryChange } from './helpers/placement.js';
import { addModule, assign, byRole, completionProposed, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { accepted, added, answeredGit, modified, unchanged, type CommitResponse } from './helpers/contracts-git.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));
import { remainingInjections } from '../contracts/verification.js';
import type { ContractRecord } from '../contracts/records.js';
import { runLayout } from '../run/records.js';
import type { GateAttempt } from '../checks/records.js';

/*
 * The guard this iteration owns: a requirement whose fake is still injected
 * is not verified.
 *
 * A passing gate is not enough to close a delegation. `requirement-verified`
 * also requires that no location the requirement named still reaches the
 * fake, and the check reads the consumer's source rather than what the
 * engineer said about it. Passing against a fake is never completion.
 *
 * The lifecycle scenarios below answer Git and the gate's commands from
 * their own data and read the consumer's real source for the guard. The
 * architect view of an accepted delegation, which needs the real command
 * line, is in `requirement-architect-view.test.ts`.
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

const contract: ContractRecord = {
  schema: 'ramify-agent.contract/1',
  id: 'ct-001',
  revision: 1,
  capability: { id: 'note-limit', revision: 1, hash: 'a'.repeat(64) },
  decision: null,
  authority: { kind: 'provider', owner: provider, rationale: 'The contract belongs with the implementation.' },
  provider,
  behavior: 'A note of at most 500 characters is within the limit.',
  mode: 'fake-backed',
  artifacts: {
    interface: [{ path: `${providerDirectory}/src/interfaces/note-limit.ts`, exports: ['noteLimitCases'], hash: 'b'.repeat(64) }],
    conformance: [{ path: `${providerDirectory}/src/tests/note-limit.conformance.test.ts`, hash: 'c'.repeat(64) }],
    fake: [{ path: `${providerDirectory}/src/fakes/note-limit.fake.ts`, exports: ['createNoteLimitFake'], hash: 'd'.repeat(64) }],
    exposure: [],
  },
  establishedBy: { iteration: 'wi-001.i02', gate: 'ga-0002' },
};

describe('the check that closes a delegation', () => {
  test('a location that still imports the fake, or still names one of its exports, is still an injection', () => {
    const importing = remainingInjections(contract, [{
      path: `${consumerDirectory}/src/notes.ts`,
      text: "import { createNoteLimitFake } from '../../limits/src/fakes/note-limit.fake.js';\nconst limit = createNoteLimitFake();\n",
    }]);
    expect(importing).toEqual([{ path: `${consumerDirectory}/src/notes.ts`, reference: '../../limits/src/fakes/note-limit.fake.js' }]);

    // The import is gone and the name is still there: the delegation is not
    // closed by deleting a line.
    const named = remainingInjections(contract, [{
      path: `${consumerDirectory}/src/notes.ts`,
      text: 'const limit = createNoteLimitFake();\n',
    }]);
    expect(named).toEqual([{ path: `${consumerDirectory}/src/notes.ts`, reference: 'createNoteLimitFake' }]);

    // The fake named in a comment is not a reference to it.
    expect(remainingInjections(contract, [{
      path: `${consumerDirectory}/src/notes.ts`,
      text: "// This used to use createNoteLimitFake.\nimport { createNoteLimit } from '../../limits/src/note-limit.js';\n",
    }])).toEqual([]);
  });
});

const stub = 'export function addNote(note) {\n  throw new Error(\'not available yet\');\n}\n';
const consumerTest = [
  "import { test, expect } from 'vitest';",
  "import { addNote } from '../notes.ts';",
  '',
  "test('a note over the limit is refused', () => {",
  "  expect(addNote('x'.repeat(501))).toBe('');",
  '});',
  '',
].join('\n');

const contractFile = "export const noteLimitCases = [{ note: 'a short note', within: true }, { note: 'x'.repeat(501), within: false }];\n";
const fakeFile = [
  '/** The fake the consumer implements against. */',
  'export function createNoteLimitFake() {',
  '  return { withinLimit: (note) => note.length <= 500 };',
  '}',
  '',
].join('\n');
const subjectsFile = "import { createNoteLimitFake } from '../fakes/note-limit.fake.ts';\n\nexport const subjects = [{ name: 'the fake', create: createNoteLimitFake }];\n";
const conformanceFile = [
  "import { test, expect } from 'vitest';",
  "import { noteLimitCases } from '../interfaces/note-limit.ts';",
  "import { subjects } from './note-limit.subjects.ts';",
  '',
  'for (const subject of subjects) {',
  '  for (const agreed of noteLimitCases) {',
  "    test(subject.name + ' ' + agreed.note.length, () => {",
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
const realProvider = 'export function createNoteLimit() {\n  return { withinLimit: (note) => note.length <= 500 };\n}\n';
const bothSubjects = [
  "import { createNoteLimitFake } from '../fakes/note-limit.fake.ts';",
  "import { createNoteLimit } from '../note-limit.ts';",
  '',
  "export const subjects = [",
  "  { name: 'the fake', create: createNoteLimitFake },",
  "  { name: 'the real provider', create: createNoteLimit },",
  '];',
  '',
].join('\n');
const replaced = [
  "import { createNoteLimit } from '../../limits/src/note-limit.ts';",
  '',
  'const limit = createNoteLimit();',
  '',
  'export function addNote(note) {',
  "  return limit.withinLimit(note) ? note : '';",
  '}',
  '',
].join('\n');

const need = {
  capability: 'note-limit',
  useCases: ['a note over the limit is refused'],
  inputs: ['the note text'],
  outputs: ['whether the note is within the limit'],
  sideEffects: [],
  constraints: ['at most 500 characters'],
  existingEvidence: [`${consumerDirectory}/src/tests/notes.test.ts`],
};

const placeTheLimit = localDecision(
  {
    question: 'Where does the note limit belong?',
    outcome: 'reuse',
    capability: 'note-limit',
    owner: provider,
    rationale: 'The limit is a rule of its own, in a subtree that is mine to place work in.',
  },
  [registryChange({ capability: 'note-limit', owner: provider, behavior: 'A note of at most 500 characters is within the limit.' })],
);

function establishedWith(fakePath: string, fakeExports: readonly string[]) {
  return {
    kind: 'established' as const,
    mode: 'fake-backed' as const,
    authority: { kind: 'provider' as const, owner: provider, rationale: 'The contract belongs with the implementation.' },
    provider,
    behavior: 'A note of at most 500 characters is within the limit.',
    artifacts: {
      interface: [{ path: `${providerDirectory}/src/interfaces/note-limit.ts`, exports: ['noteLimitCases'] }],
      conformance: [{ path: `${providerDirectory}/src/tests/note-limit.conformance.test.ts` }],
      fake: [{ path: fakePath, exports: [...fakeExports] }],
      exposure: [{ path: `${providerDirectory}/module.ramify`, declaration: 'expose-src noteLimitCases from "interfaces/note-limit.ts" to parent' }],
    },
    fakeInjections: [`${consumerDirectory}/src/notes.ts`],
    summary: 'The agreement is established and the consumer runs against the fake.',
  };
}

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
 * A run whose Git answers are this scenario's own fixture data: the revision
 * it reports for each commit the harness attempts, or that the tree was
 * unchanged.
 */
/** The files of the seam, as this scenario's Git answers name them. */
const seam = {
  interface: `${providerDirectory}/src/interfaces/note-limit.ts`,
  fake: `${providerDirectory}/src/fakes/note-limit.fake.ts`,
  standIn: `${providerDirectory}/src/fakes/note-limit-stand-in.ts`,
  subjects: `${providerDirectory}/src/tests/note-limit.subjects.ts`,
  conformance: `${providerDirectory}/src/tests/note-limit.conformance.test.ts`,
  real: `${providerDirectory}/src/note-limit.ts`,
  consumer: `${consumerDirectory}/src/notes.ts`,
  note: `${consumerDirectory}/src/limit-note.ts`,
};

async function run(root: string, plan: Parameters<typeof byRole>[0], commits: readonly CommitResponse[]) {
  const git = answeredGit(root, { head: 'revision-00', commits });
  const opened = await openRuns(root, {
    script: byRole(plan), inputs: treeInputs(), git, readinessExecution: directReadinessExecution(),
  });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  return { ...opened, git, runId: receipt.jobId };
}

describe('a requirement whose fake is still injected is not verified', () => {
  test('a passing verification that left the fake in place closes nothing, and completion is refused until it is gone', async () => {
    const root = await target();
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', consumer)]))],
      'local-architect': [
        submit({ ...assign(consumer, {}, outline()), localDecisions: [placeTheLimit] }),
        submit({ kind: 'yield-for-providers', requirements: ['rq-001'], summary: 'Waiting for the real limit.' }),
        submit(assign(provider, {}, outline({ changes: 'Implement the agreed limit.' }))),
        submit(requestCompletion()),
        // The first verification passes its gate and leaves the fake in place.
        submit(assign(consumer, { kind: 'verification', goal: 'Replace the fake with the real note limit.' })),
        // Completion is refused while the requirement is open.
        submit(requestCompletion()),
        submit(assign(consumer, { kind: 'verification', goal: 'Actually replace the fake this time.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit({ kind: 'contract-needed', need, summary: 'The limit is owned elsewhere.' }),
        submit(completionProposed('The real limit is implemented.'),
          write(`${providerDirectory}/src/note-limit.ts`, realProvider),
          write(`${providerDirectory}/src/tests/note-limit.subjects.ts`, bothSubjects)),
        // The tests pass, and the fake is exactly where it was.
        submit(completionProposed('The behavior is verified.'),
          write(`${consumerDirectory}/src/limit-note.ts`, '/** Where the limit came from. */\nexport const provider = \'the limits module\';\n')),
        submit(completionProposed('The consumer now uses the real note limit.'),
          write(`${consumerDirectory}/src/notes.ts`, replaced)),
      ],
      'contract-engineer': [submit(
        establishedWith(`${providerDirectory}/src/fakes/note-limit.fake.ts`, ['createNoteLimitFake']),
        write(`${providerDirectory}/src/interfaces/note-limit.ts`, contractFile),
        write(`${providerDirectory}/src/fakes/note-limit.fake.ts`, fakeFile),
        write(`${providerDirectory}/src/tests/note-limit.subjects.ts`, subjectsFile),
        write(`${providerDirectory}/src/tests/note-limit.conformance.test.ts`, conformanceFile),
        write(`${consumerDirectory}/src/notes.ts`, integrated),
      )],
    }, [
      // The agreement, the real provider, the verification that wrote a note
      // of its own and left the fake, and the one that replaced it.
      accepted('wi-001.i02', 'revision-01', [...added(seam.interface, seam.fake, seam.subjects, seam.conformance), ...modified(seam.consumer)]),
      accepted('wi-002.i01', 'revision-02', [...added(seam.real), ...modified(seam.subjects)]),
      unchanged('wi-002'),
      accepted('wi-001.i03', 'revision-03', added(seam.note)),
      accepted('wi-001.i04', 'revision-04', modified(seam.consumer)),
      unchanged('wi-001'),
      unchanged('final verification of plan "review-notes"'),
    ]);

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const log = await runEventsOnDisk(root, 'review-notes', runId);
    const types = log.map(event => event.type);

    // The first verification passed its gate and closed nothing.
    const firstVerification = log.findIndex(event => event.type === 'iteration-closed' && event.data.iteration === 'wi-001.i03');
    expect((log[firstVerification]!.data as { outcome: string; gate: string | null }).outcome).toBe('accepted');
    expect((log[firstVerification]!.data as { gate: string | null }).gate).not.toBeNull();
    const closedAt = types.indexOf('requirement-verified');
    expect(closedAt).toBeGreaterThan(firstVerification);

    // Exactly one `requirement-verified`, and it followed the iteration that
    // actually replaced the fake.
    expect(types.filter(type => type === 'requirement-verified')).toHaveLength(1);
    expect(log[closedAt]!.data).toMatchObject({ requirement: 'rq-001', revision: 1, iteration: 'wi-001.i04' });

    // Between the passing verification that left the fake and the one that
    // removed it, the consumer's work item did not complete.
    const completed = log.findIndex(event => event.type === 'work-item-completed' && event.data.workItem === 'wi-001');
    expect(completed).toBeGreaterThan(closedAt);

    const source = await readFile(`${root}/${consumerDirectory}/src/notes.ts`, 'utf8');
    expect(source).not.toContain('Fake');

    // The verification that left the fake in place still committed what it
    // wrote: nothing is rewound, and the requirement closed over the commit
    // that followed it.
    expect(git.branch()).toBe(`ramify-agent/run-${runId}`);
    expect(git.minted()).toEqual(['revision-01', 'revision-02', 'revision-03', 'revision-04']);
    git.assertAnswered();
  }, 60_000);
});

describe('P2: the contract gate rejects a fake under a production-looking name', () => {
  test('a file without .fake, an export without Fake and a re-export that drops it each fail the gate', async () => {
    const root = await target();
    const badFake = [
      'export function createNoteLimitFake() {',
      '  return { withinLimit: (note) => note.length <= 500 };',
      '}',
      '',
      '/** A second name, with the designation dropped. */',
      'export function createNoteLimit() {',
      '  return createNoteLimitFake();',
      '}',
      '',
    ].join('\n');
    const standIn = 'export function createNoteLimitStandInFake() {\n  return { withinLimit: () => true };\n}\n';
    const reExporting = [
      "export { createNoteLimitFake as createNoteLimit } from '../../limits/src/fakes/note-limit.fake.ts';",
      "import { createNoteLimitFake } from '../../limits/src/fakes/note-limit.fake.ts';",
      '',
      'const limit = createNoteLimitFake();',
      '',
      'export function addNote(note) {',
      "  return limit.withinLimit(note) ? note : '';",
      '}',
      '',
    ].join('\n');

    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', consumer)]))],
      'local-architect': [
        submit({ ...assign(consumer, {}, outline()), localDecisions: [placeTheLimit] }),
        submit(assign(consumer, { goal: 'Carry the limit here, since the agreement was refused.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit({ kind: 'contract-needed', need, summary: 'The limit is owned elsewhere.' }),
        submit(completionProposed('The limit is carried here instead.'),
          write(`${consumerDirectory}/src/notes.ts`, "export function addNote(note) {\n  return note.length <= 500 ? note : '';\n}\n")),
      ],
      // Every command of this agreement passes; only the naming rule fails.
      'contract-engineer': [submit(
        {
          ...establishedWith(`${providerDirectory}/src/fakes/note-limit.fake.ts`, ['createNoteLimitFake', 'createNoteLimit']),
          artifacts: {
            interface: [{ path: `${providerDirectory}/src/interfaces/note-limit.ts`, exports: ['noteLimitCases'] }],
            conformance: [{ path: `${providerDirectory}/src/tests/note-limit.conformance.test.ts` }],
            fake: [
              { path: `${providerDirectory}/src/fakes/note-limit.fake.ts`, exports: ['createNoteLimitFake', 'createNoteLimit'] },
              { path: `${providerDirectory}/src/fakes/note-limit-stand-in.ts`, exports: ['createNoteLimitStandInFake'] },
            ],
            exposure: [],
          },
        },
        write(`${providerDirectory}/src/interfaces/note-limit.ts`, contractFile),
        write(`${providerDirectory}/src/fakes/note-limit.fake.ts`, badFake),
        write(`${providerDirectory}/src/fakes/note-limit-stand-in.ts`, standIn),
        write(`${providerDirectory}/src/tests/note-limit.conformance.test.ts`, "import { test, expect } from 'vitest';\ntest('the agreement holds', () => { expect(1).toBe(1); });\n"),
        write(`${consumerDirectory}/src/notes.ts`, reExporting),
      )],
    }, [
      // The first attempt at the agreement commits what it wrote. Each
      // repair round writes the same files with the same content, and Git
      // reports an unchanged tree for both, so those attempts audit the
      // revision the first one made.
      accepted('wi-001.i02', 'revision-01', [
        ...added(seam.interface, seam.fake, seam.standIn, seam.conformance), ...modified(seam.consumer),
      ]),
      unchanged('wi-001.i02'),
      unchanged('wi-001.i02'),
      accepted('wi-001.i03', 'revision-02', modified(seam.consumer)),
      unchanged('wi-001'),
      unchanged('final verification of plan "review-notes"'),
    ]);

    // The run finishes: the agreement was refused, and the caller carried
    // the work itself.
    expect(onlyRun(service, 'review-notes').failure).toBeNull();
    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const log = await runEventsOnDisk(root, 'review-notes', runId);
    expect(log.map(event => event.type)).not.toContain('contract-registered');

    const gateIds = [...new Set(log.filter(event => event.type === 'gate-attempted').map(event => event.data.gate))];
    const attempts = await Promise.all(gateIds.map(async id =>
      JSON.parse(await readFile(runPath(root, 'review-notes', runId, runLayout.gate(id)), 'utf8')) as GateAttempt));
    const contractGates = attempts.filter(attempt => attempt.checkpoint === 'contract');
    expect(contractGates.length).toBeGreaterThan(0);

    const first = contractGates[0]!;
    expect(first.verdict).toBe('failed');
    // Nothing the harness spawned failed: the verdict is the rule's.
    expect(first.commands.every(command => command.outcome === 'passed')).toBe(true);
    // The rule is the engineer's to repair, so the attempt's cause is in-scope.
    expect(first.cause).toBe('in-scope');
    expect(first.commit).not.toBeNull();
    expect(first.audited).toBe(first.commit);
    expect(first.evidence).not.toBeNull();
    const rule = first.rules![0]!;
    expect(rule.rule).toBe('fake-naming');
    expect(rule.outcome).toBe('failed');
    expect(rule.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'file-suffix', path: `${providerDirectory}/src/fakes/note-limit-stand-in.ts` }),
      expect.objectContaining({ rule: 'export-name', path: `${providerDirectory}/src/fakes/note-limit.fake.ts` }),
      expect.objectContaining({ rule: 're-export', path: `${consumerDirectory}/src/notes.ts` }),
    ]));
    expect(rule.violations.find(violation => violation.rule === 'export-name')!.detail).toContain('createNoteLimit');

    // Every attempt of the same agreement fails the same way over an exact
    // audited commit; an unchanged retry may audit its head without making a
    // second commit.
    for (const attempt of contractGates) {
      expect(attempt.verdict).toBe('failed');
      expect(attempt.rules![0]!.outcome).toBe('failed');
      expect(attempt.audited).toBe(attempt.commit ?? attempt.head);
      expect(attempt.evidence).not.toBeNull();
    }

    // Exactly one of the three attempts at the agreement changed the tree,
    // and the two that repeated it audited the revision it made.
    expect(git.minted()).toEqual(['revision-01', 'revision-02']);
    expect(contractGates.map(attempt => attempt.commit)).toEqual(['revision-01', null, null]);
    expect(contractGates.slice(1).map(attempt => attempt.head)).toEqual(['revision-01', 'revision-01']);
    // No attempt at the agreement was ever accepted, so every observation
    // the run made was taken against the revision it started from: a failed
    // attempt's commit is not a boundary.
    expect([...new Set(git.bases('changedPaths'))]).toEqual(['revision-00']);
    expect([...new Set(git.bases('changedEntries'))]).toEqual(['revision-00']);
    expect(git.bases('diffNameStatus')).toEqual(['revision-00']);
    git.assertAnswered();
  }, 60_000);
});
