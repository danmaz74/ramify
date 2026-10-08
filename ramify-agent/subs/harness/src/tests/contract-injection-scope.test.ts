import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { localDecision, registryChange } from './helpers/placement.js';
import { addModule, assign, byRole, completionProposed, installMiniRunner, outline, readDeclaredTree, submit, treeInputs, write } from './helpers/iterations.js';
import { onlyRun, openRuns, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { accepted, added, answeredGit, modified, unchanged, type CommitResponse, scenariosCommitted } from './helpers/contracts-git.js';
import { finalCandidate } from './helpers/final-candidate.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));
import { validateEngineer } from '../work/engineer.js';
import { validateContract } from '../contracts/submission.js';
import { contractsLayout, type ConsumerRequirement } from '../contracts/records.js';
import { iterationLayout, type IterationAssignment } from '../work/iterations.js';
import { runLayout } from '../run/records.js';
import type { GateAttempt } from '../checks/records.js';

/*
 * A contract iteration may write the files the agreement names as holding
 * the fake, on the consumer side or the provider side, and nothing else of
 * the provider's internals.
 *
 * The scope is fixed when the assignment is made, before the contract
 * engineer has designed anything, so the files come from what is already
 * named: the consumer engineer's `contract-needed` for a fresh agreement,
 * and the recorded requirements for a revision. Each site lies in the
 * consumer's or the provider's own contents; anywhere else is refused with
 * the rule.
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

const need = {
  capability: 'note-limit',
  useCases: ['a note over the limit is refused'],
  inputs: ['the note text'],
  outputs: ['whether the note is within the limit'],
  sideEffects: [],
  constraints: ['at most 500 characters'],
  existingEvidence: [`${consumerDirectory}/src/tests/notes.test.ts`],
};

const seam = {
  interface: `${providerDirectory}/src/interfaces/note-limit.ts`,
  fake: `${providerDirectory}/src/fakes/note-limit.fake.ts`,
  conformance: `${providerDirectory}/src/tests/note-limit.conformance.test.ts`,
  real: `${providerDirectory}/src/note-limit.ts`,
  /** Where the real limit will act inside the provider, and reach the consumer as data. */
  report: `${providerDirectory}/src/report.ts`,
  unnamed: `${providerDirectory}/src/store.ts`,
  consumer: `${consumerDirectory}/src/notes.ts`,
};

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, consumerDirectory, 'notes', {
    'src/notes.ts': 'export function addNote(note) {\n  throw new Error(\'not available yet\');\n}\n',
    'src/tests/notes.test.ts': "import { test, expect } from 'vitest';\nimport { addNote } from '../notes.ts';\n\ntest('a note over the limit is refused', () => {\n  expect(addNote('x'.repeat(501))).toBe('');\n});\n",
  });
  await addModule(fixture.root, providerDirectory, 'limits', {
    'src/report.ts': 'export function reportNote(note) {\n  return { note, within: true };\n}\n',
  });
  await installMiniRunner(fixture.root);
  return fixture.root;
}

describe('where a fake may be injected', () => {
  test('a need names sites in the consumer or the provider, and a site elsewhere is refused with the rule', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    const index = await readDeclaredTree(fixture.root);
    const seams = { index, consumer, providerOf: (capability: string) => capability === 'note-limit' ? provider : undefined };
    const contractNeeded = (injectionSites: string[]) => ({ kind: 'contract-needed', need, summary: 'The limit is owned elsewhere.', injectionSites });

    // The fixture's tree has neither module; the rule is judged on one that does.
    const withBoth = {
      ...index,
      modules: new Map([
        ...index.modules,
        [consumer, { module: consumer, dir: consumerDirectory, parent: 'collection-review/workspace/reviews', children: [], tags: [], areas: ['src'] }],
        [provider, { module: provider, dir: providerDirectory, parent: 'collection-review/workspace/reviews', children: [], tags: [], areas: ['src'] }],
      ]),
    };
    const accepted = validateEngineer(contractNeeded([seam.consumer, seam.report]), { seams: { ...seams, index: withBoth } });
    expect(accepted.ok).toBe(true);

    const refused = validateEngineer(contractNeeded([
      'subs/workspace/subs/reviews/subs/core/src/tasks.ts',
      'scripts/build.ts',
      `${providerDirectory}/scripts/tool.ts`,
      '../elsewhere.ts',
    ]), { seams: { ...seams, index: withBoth } });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.errors.map(error => error.path)).toEqual(['injectionSites.0', 'injectionSites.1', 'injectionSites.3']);
    expect(refused.errors[0]!.message).toContain('the own contents of "collection-review/workspace/reviews/core"');
    expect(refused.errors[1]!.message).toContain('collection-review');
    expect(validateEngineer(contractNeeded([`${providerDirectory}/scripts/tool.ts`]), { seams: { ...seams, index: withBoth } }).ok).toBe(true);
    for (const error of refused.errors) expect(error.message).toContain("a fake injection site lies in the consumer's or the provider's own contents");

    // Without a view nothing can be placed, and the harness judges the sites
    // again when it resolves the owner.
    expect(validateEngineer(contractNeeded(['scripts/build.ts']), { seams: { ...seams, index: null } }).ok).toBe(true);

    // The established agreement is held to the same rule.
    const established = (fakeInjections: string[]) => ({
      kind: 'established',
      mode: 'fake-backed',
      authority: { kind: 'provider', owner: provider, rationale: 'The limit belongs with its implementation.' },
      provider,
      behavior: 'A note of at most 500 characters is within the limit.',
      artifacts: {
        interface: [{ path: seam.interface, exports: ['noteLimitCases'] }],
        conformance: [{ path: seam.conformance }],
        fake: [{ path: seam.fake, exports: ['createNoteLimitFake'], standsFor: [{ fake: 'createNoteLimitFake', path: seam.real, export: 'createNoteLimit', exposure: { to: [], reexposed: [] } }] }],
        exposure: [],
      },
      fakeInjections,
      summary: 'The agreement is established.',
    });
    const evidence = { index: withBoth, consumer, exists: async () => true };
    expect((await validateContract(established([seam.report, seam.consumer]), evidence)).ok).toBe(true);
    const elsewhere = await validateContract(established([seam.report, 'subs/workspace/subs/reviews/subs/core/src/tasks.ts']), evidence);
    expect(elsewhere.ok).toBe(false);
    if (!elsewhere.ok) {
      expect(elsewhere.errors.map(error => error.path)).toEqual(['fakeInjections.1']);
      expect(elsewhere.errors[0]!.message).toContain("a fake injection site lies in the consumer's or the provider's own contents");
    }
  });
});

const placeTheLimit = localDecision(
  { question: 'Where does the note limit belong?', outcome: 'reuse', capability: 'note-limit', owner: provider, rationale: 'The limit is a rule of its own.' },
  [registryChange({ capability: 'note-limit', owner: provider, behavior: 'A note of at most 500 characters is within the limit.' })],
);

/** The agreement: the fake is injected where the provider's report is made, and the consumer reads the report. */
const establishedContract = {
  kind: 'established' as const,
  mode: 'fake-backed' as const,
  authority: { kind: 'provider' as const, owner: provider, rationale: 'The note limit belongs with its implementation.' },
  provider,
  behavior: 'A note of at most 500 characters is within the limit.',
  artifacts: {
    interface: [{ path: seam.interface, exports: ['noteLimitCases'] }],
    conformance: [{ path: seam.conformance }],
    fake: [{
      path: seam.fake,
      exports: ['createNoteLimitFake'],
      standsFor: [{ fake: 'createNoteLimitFake', path: seam.real, export: 'createNoteLimit', exposure: { to: [], reexposed: [] } }],
    }],
    exposure: [],
  },
  fakeInjections: [seam.report],
  summary: 'The fake stands in where the report is made; the consumer reads the report as it already did.',
};

const fakeFile = '/** The fake the report is made with until the real limit exists. */\nexport function createNoteLimitFake() {\n  return { withinLimit: (note) => note.length <= 500 };\n}\n';
const reportWithFake = "import { createNoteLimitFake } from './fakes/note-limit.fake.ts';\n\nconst limit = createNoteLimitFake();\n\nexport function reportNote(note) {\n  return { note, within: limit.withinLimit(note) };\n}\n";
const reportWithReal = "import { createNoteLimit } from './note-limit.ts';\n\nconst limit = createNoteLimit();\n\nexport function reportNote(note) {\n  return { note, within: limit.withinLimit(note) };\n}\n";
const consumerReadingReport = "import { reportNote } from '../../limits/src/report.ts';\n\nexport function addNote(note) {\n  return reportNote(note).within ? note : '';\n}\n";

async function run(root: string, plan: Parameters<typeof byRole>[0], commits: readonly CommitResponse[], finalHead: string) {
  const final = finalCandidate(root, finalHead);
  const git = answeredGit(root, { head: 'revision-00', commits: [scenariosCommitted('review-notes'), ...commits], previews: final.previews });
  const opened = await openRuns(root, { script: byRole(plan), inputs: treeInputs(), git,
    candidates: final.candidates, });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  return { ...opened, git, runId: receipt.jobId };
}

describe('the contract iteration writes the named injection sites', () => {
  test('a provider-side site the need names is writable, one it does not name is refused, and the provider retires the fake there', async () => {
    const root = await target();
    const { service, runId, git } = await run(root, {
      'initial-architect': [submit(analysis([entry('review-notes', consumer)]))],
      'local-architect': [
        submit({ ...assign(consumer, {}, outline()), localDecisions: [placeTheLimit] }),
        submit({ kind: 'yield-for-providers', requirements: ['rq-001'], summary: 'Waiting for the real limit.' }),
        submit(assign(provider, {}, outline({ changes: 'Implement the agreed limit and make the report with it.' }))),
        submit(requestCompletion()),
        submit(assign(consumer, { kind: 'verification', goal: 'Confirm the notes run against the real limit.' })),
        submit(requestCompletion()),
      ],
      engineer: [
        submit({ kind: 'contract-needed', need, summary: 'The limit is owned elsewhere; it reaches the notes as the report says.', injectionSites: [seam.report] }),
        submit(completionProposed('The real limit is implemented and the report is made with it.'),
          write(join(root, seam.real), 'export function createNoteLimit() {\n  return { withinLimit: (note) => note.length <= 500 };\n}\n'),
          write(join(root, seam.report), reportWithReal)),
        submit(completionProposed('The notes read the report, which the real limit now makes.'),
          write(join(root, seam.consumer), `${consumerReadingReport}// verified against the real limit\n`)),
      ],
      'contract-engineer': [submit(establishedContract,
        write(seam.interface, "export const noteLimitCases = [{ note: 'x'.repeat(501), within: false }];\n"),
        write(seam.fake, fakeFile),
        write(seam.conformance, "import { test, expect } from 'vitest';\ntest('the agreement holds', () => { expect(1).toBe(1); });\n"),
        // The named site is written; a provider file the need did not name is refused and left unwritten.
        write(seam.report, reportWithFake),
        write(seam.unnamed, 'export const store = [];\n'),
        write(seam.consumer, consumerReadingReport))],
    }, [
      accepted('wi-001.i02', 'revision-01', [...added(seam.interface, seam.fake, seam.conformance), ...modified(seam.report, seam.consumer)]),
      accepted('wi-002.i01', 'revision-02', [...added(seam.real), ...modified(seam.report)]),
      unchanged('wi-002'),
      accepted('wi-001.i03', 'revision-03', modified(seam.consumer)),
      unchanged('wi-001'),
      unchanged('final verification of plan "review-notes"'),
    ], 'revision-03');
    expect(onlyRun(service, 'review-notes').failure).toBeNull();
    expect(onlyRun(service, 'review-notes').state).toBe('completed');

    // The named site holds the fake and the unnamed provider file was never written.
    expect(await readFile(join(root, seam.report), 'utf8')).toBe(reportWithReal);
    await expect(stat(join(root, seam.unnamed))).rejects.toThrow();

    // The contract assignment's scope names the site, and its resolved files hold it.
    const assignment = await readJson<IterationAssignment>(root, runId, iterationLayout.assignment('wi-001', 2));
    expect(assignment.kind).toBe('contract');
    expect(assignment.scope.extra).toContainEqual({ path: seam.report, purpose: 'fake-injection' });
    expect(assignment.scope.extra.map(extra => extra.path)).not.toContain(seam.unnamed);
    expect(assignment.scope.resolved.files.some(file => file.endsWith(`/${seam.report}`))).toBe(true);
    expect(assignment.scope.resolved.roots.some(root => root.endsWith(`/${providerDirectory}/src`))).toBe(false);

    // The gate passed, the requirement records the provider-side site, and
    // verification closed once the provider's own iteration retired the fake.
    const log = await runEventsOnDisk(root, 'review-notes', runId);
    const gateIds = [...new Set(log.filter(event => event.type === 'gate-attempted').map(event => event.data.gate))];
    const attempts = await Promise.all(gateIds.map(id => readJson<GateAttempt>(root, runId, runLayout.gate(id))));
    expect(attempts.find(attempt => attempt.checkpoint === 'contract')!.verdict).toBe('passed');
    const requirement = await readJson<ConsumerRequirement>(root, runId, contractsLayout.requirement('rq-001', 1));
    expect(requirement.evidence.fakeInjections).toEqual([seam.report]);
    expect(log.map(event => event.type)).toContain('requirement-verified');
    git.assertAnswered();
  }, 120_000);
});

async function readJson<T>(root: string, runId: string, path: string): Promise<T> {
  return JSON.parse(await readFile(runPath(root, 'review-notes', runId, path), 'utf8')) as T;
}
