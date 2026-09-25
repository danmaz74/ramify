import { expect } from 'vitest';
import type { AgentPort } from '../../../subs/agent/src/interfaces/port.js';
import { createScriptedAgent, type Script, type ScriptedAgent, type ScriptStep } from '../../../subs/agent/src/scripted.js';
import type { Role } from '../../interfaces/protocol/runs.js';
import type { RunEvent } from '../../run/log.js';
import type { RunService } from '../../run/service.js';
import { analysis, entry, requestCompletion } from './analysis.js';
import { copyFixture } from './fixture.js';
import { decision as decisionBody, forkDecision, localDecision, registryChange, requestPlacement } from './placement.js';
import { addModule, assign, byRole, completionProposed, installMiniRunner, outline, submit, treeInputs, write, type Turn } from './iterations.js';
import { openRuns, runEventsOnDisk, runPath, startRun } from './runs.js';
import { accepted, added, answeredGit, modified, scenariosCommitted, unchanged } from './contracts-git.js';
import { declaringScenarios } from './declarations.js';
import { directReadinessExecution } from './external-tools.js';

/*
 * One scripted run whose sessions take every relation a run records: a
 * local architect continued across a placement request, an iteration and a
 * yield; a global fork of the architect context, whose brief is appended
 * back to it; an engineer iteration whose need opens a contract
 * sub-session; a provider engineer continued for a repair after its first
 * gate failed; and the resumed consumer's fresh architect.
 *
 * Git is external and answered from this file's own data, as are the gate's
 * commands; nothing here simulates a transition.
 */

const consumer = 'collection-review/workspace/reviews/notes';
const consumerDirectory = 'subs/workspace/subs/reviews/subs/notes';
const provider = 'collection-review/workspace/reviews/limits';
const providerDirectory = 'subs/workspace/subs/reviews/subs/limits';

const lines = (...parts: string[]) => `${parts.join('\n')}\n`;

const stub = lines('export function addNote(note) {', '  throw new Error(\'the note limit is not available here yet\');', '}');
const consumerTest = lines(
  "import { test, expect } from 'vitest';",
  "import { addNote } from '../notes.ts';",
  "test('a note within the limit is kept', () => { expect(addNote('a short note')).toBe('a short note'); });",
  "test('a note over the limit is refused', () => { expect(addNote('x'.repeat(501))).toBe(''); });",
);
const contractFile = lines(
  '/** A note of at most 500 characters is within the limit. */',
  "export const noteLimitCases = [{ note: 'a short note', within: true }, { note: 'x'.repeat(501), within: false }];",
);
const fakeFile = lines(
  "import { noteLimitCases } from '../interfaces/note-limit.ts';",
  'export function createNoteLimitFake() {',
  '  void noteLimitCases;',
  '  return { withinLimit: (note) => note.length <= 500 };',
  '}',
);
const subjectsFile = lines(
  "import { createNoteLimitFake } from '../fakes/note-limit.fake.ts';",
  "export const subjects = [{ name: 'the fake', create: createNoteLimitFake }];",
);
const conformanceFile = lines(
  "import { test, expect } from 'vitest';",
  "import { noteLimitCases } from '../interfaces/note-limit.ts';",
  "import { subjects } from './note-limit.subjects.ts';",
  'for (const subject of subjects) for (const agreed of noteLimitCases) {',
  "  test(subject.name + ' answers ' + agreed.within, () => { expect(subject.create().withinLimit(agreed.note)).toBe(agreed.within); });",
  '}',
);
const integrated = lines(
  "import { createNoteLimitFake } from '../../limits/src/fakes/note-limit.fake.ts';",
  'const limit = createNoteLimitFake();',
  "export function addNote(note) { return limit.withinLimit(note) ? note : ''; }",
);
const realProvider = lines('export function createNoteLimit() {', '  return { withinLimit: (note) => note.length <= 500 };', '}');
const bothSubjects = lines(
  "import { createNoteLimitFake } from '../fakes/note-limit.fake.ts';",
  "import { createNoteLimit } from '../note-limit.ts';",
  "export const subjects = [{ name: 'the fake', create: createNoteLimitFake }, { name: 'the real provider', create: createNoteLimit }];",
);
const verified = lines(
  "import { createNoteLimit } from '../../limits/src/note-limit.ts';",
  'const limit = createNoteLimit();',
  "export function addNote(note) { return limit.withinLimit(note) ? note : ''; }",
);

const seam = {
  interface: `${providerDirectory}/src/interfaces/note-limit.ts`,
  fake: `${providerDirectory}/src/fakes/note-limit.fake.ts`,
  subjects: `${providerDirectory}/src/tests/note-limit.subjects.ts`,
  conformance: `${providerDirectory}/src/tests/note-limit.conformance.test.ts`,
  real: `${providerDirectory}/src/note-limit.ts`,
  consumer: `${consumerDirectory}/src/notes.ts`,
};

const contractNeeded = {
  kind: 'contract-needed' as const,
  need: {
    capability: 'note-limit',
    useCases: ['a reviewer attaches a note to a review run, and a note over the limit is refused'],
    inputs: ['the note text'],
    outputs: ['whether the note is within the limit'],
    sideEffects: [],
    constraints: ['at most 500 characters'],
    existingEvidence: [`${consumerDirectory}/src/tests/notes.test.ts`],
  },
  suggestedProvider: provider,
  summary: 'The note limit is not behavior this module owns, so nothing here was changed.',
};

const establishedContract = {
  kind: 'established' as const,
  mode: 'fake-backed' as const,
  authority: { kind: 'provider' as const, owner: provider, rationale: 'The note limit is a capability of its own, so its contract belongs with its provider.' },
  provider,
  behavior: 'A note of at most 500 characters is within the limit; a longer one is not.',
  artifacts: {
    interface: [{ path: seam.interface, exports: ['noteLimitCases'] }],
    conformance: [{ path: seam.conformance }],
    fake: [{
      path: seam.fake,
      exports: ['createNoteLimitFake'],
      standsFor: [{ fake: 'createNoteLimitFake', path: seam.real, export: 'createNoteLimit', exposure: { to: [], reexposed: [] } }],
    }],
    exposure: [{ path: `${providerDirectory}/module.ramify`, declaration: 'expose-src noteLimitCases from "interfaces/note-limit.ts" to parent' }],
  },
  fakeInjections: [seam.consumer],
  summary: 'The note limit is agreed, the consumer runs against its fake, and the conformance suite states what the provider owes.',
};

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

/** The consumer and provider modules, in `root` or in a fresh copy of the fixture. */
async function target(cleanup: (step: () => Promise<void>) => void, given?: string) {
  let root = given;
  if (root === undefined) {
    const fixture = await copyFixture();
    cleanup(fixture.remove);
    root = fixture.root;
  }
  await addModule(root, consumerDirectory, 'notes', { 'src/notes.ts': stub, 'src/tests/notes.test.ts': consumerTest });
  await addModule(root, providerDirectory, 'limits', {});
  await installMiniRunner(root);
  return root;
}


export interface SessionScenarioOptions {
  /** Registers what the test removes afterwards. */
  readonly cleanup: (step: () => Promise<void>) => void;
  /** Steps each named role takes before its first turn's own. */
  readonly before?: Partial<Record<Role, readonly ScriptStep[]>> | undefined;
  /** The port the run drives, built around the scenario's scripted fake. */
  readonly port?: ((scripted: ScriptedAgent) => AgentPort) | undefined;
  /**
   * A copy of the fixture to add the scenario's modules to and run it in,
   * beside the runs it already holds. Default: a fresh copy, removed by
   * `cleanup`.
   */
  readonly root?: string | undefined;
}

export interface SessionScenario {
  readonly root: string;
  readonly runId: string;
  readonly service: RunService;
  readonly events: readonly RunEvent[];
  /** A path beneath the run's directory. */
  readonly path: (...parts: string[]) => string;
}

/** Runs the scenario to completion and answers its log. */
export async function runSessionScenario(options: SessionScenarioOptions): Promise<SessionScenario> {
  const root = await target(options.cleanup, options.root);
  const git = answeredGit(root, {
    head: 'revision-00',
    commits: [
      // The run's feature files, committed once readiness has passed.
      scenariosCommitted('review-notes'),
      accepted('wi-001.i02', 'revision-01', [...added(seam.interface, seam.fake, seam.subjects, seam.conformance), ...modified(seam.consumer)]),
      // The provider's first attempt commits its work and fails; the
      // repair it is continued for finds the tree unchanged, and passes.
      accepted('wi-002.i01', 'revision-02', [...added(seam.real), ...modified(seam.subjects)]),
      unchanged('wi-002.i01'),
      unchanged('wi-002'),
      accepted('wi-001.i03', 'revision-03', modified(seam.consumer)),
      unchanged('wi-001'),
      unchanged('final verification of plan "review-notes"'),
    ],
  });
  const turns: Partial<Record<Role, Turn[]>> = {
    'initial-architect': [submit(analysis([entry('review-notes', consumer)]))],
    'local-architect': [
      // The consumer asks where its own capability belongs; the global
      // fork decides, and the same architect is continued.
      submit(requestPlacement({ forCapability: 'review-notes', question: 'Is the reviewer note the notes module\'s own?' })),
      submit({ ...assign(consumer, {}, outline()), localDecisions: [placeTheLimit] }),
      submit({ kind: 'yield-for-providers', requirements: ['rq-001'], summary: 'The consumer runs against the fake and waits for the real limit.' }),
      // The provider work item the registration started.
      submit(assign(provider, {}, outline({ changes: 'Implement the agreed limit and run the conformance suite against it.' }))),
      submit(requestCompletion()),
      // The consumer, resumed in a session of its own.
      submit(assign(consumer, { kind: 'verification', goal: 'Replace the fake with the real note limit and rerun the behavior.' })),
      submit(requestCompletion()),
    ],
    'global-fork': [submit(forkDecision({
      decision: decisionBody({ capability: 'review-notes', owner: consumer, rationale: 'The reviewer note is what the notes module is for.' }),
      brief: 'The reviewer note stays with the notes module.',
    }))],
    engineer: [
      submit(contractNeeded),
      submit(completionProposed('The real note limit is implemented.'), write(seam.real, realProvider), write(seam.subjects, bothSubjects)),
      submit(completionProposed('The failing suite passes now; nothing else needed changing.')),
      submit(completionProposed('The consumer now uses the real note limit.'), write(seam.consumer, verified)),
    ],
    'contract-engineer': [submit(establishedContract,
      write(seam.interface, contractFile), write(seam.fake, fakeFile), write(seam.subjects, subjectsFile),
      write(seam.conformance, conformanceFile), write(seam.consumer, integrated))],
  };
  for (const [role, steps] of Object.entries(options.before ?? {}) as Array<[Role, readonly ScriptStep[]]>) {
    const [first, ...rest] = turns[role] ?? [];
    turns[role] = [[...steps, ...(first ?? [])], ...rest];
  }
  // Each completion request declares its entry's scenarios.
  const script: Script = declaringScenarios(byRole(turns));
  const scripted = createScriptedAgent(script);
  let providerAttempt: string | undefined;
  const opened = await openRuns(root, {
    git,
    inputs: treeInputs(),
    readinessExecution: directReadinessExecution(),
    model: 'provider/model-7',
    agent: options.port?.(scripted) ?? scripted,
    checkScript: ({ check, context }) => {
      if (context.checkpoint !== 'iteration') return {};
      providerAttempt ??= context.attemptId;
      return context.attemptId === providerAttempt && check.kind === 'tests'
        ? { outcome: { kind: 'completed', exitCode: 1 }, stderr: 'not ok\n' }
        : {};
    },
  });
  options.cleanup(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes'));
  await opened.service.settled('review-notes', receipt.jobId);
  expect(opened.service.getRun('review-notes', receipt.jobId)?.state).toBe('completed');
  git.assertAnswered();
  return {
    root,
    runId: receipt.jobId,
    service: opened.service,
    events: await runEventsOnDisk(root, 'review-notes', receipt.jobId),
    path: (...parts) => runPath(root, 'review-notes', receipt.jobId, ...parts),
  };
}
