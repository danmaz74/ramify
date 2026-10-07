import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import { createScriptedAgent, type Script, type ScriptedAgent } from '../../../subs/agent/src/scripted.js';
import { declaringScenarios } from './declarations.js';
import type { RunEvent } from '../../run/log.js';
import type { RunService, RunWrite } from '../../run/service.js';
import type { CommandRunner } from '../../../subs/evidence/src/run-command.js';
import type { RunInputs } from '../../run/inputs.js';
import { analysis, entry, hypothesis, requestCompletion } from './analysis.js';
import {
  consumerAgainstReal, consumerStub, consumerTest, contractNeeded, contractWrites, established, paths, providerWrites,
  type Seam,
} from './contracts.js';
import { copyFixture } from './fixture.js';
import {
  addModule, assign, byRole, byWork, completionProposed, installMiniRunner, outline, read, runScopeTests, shell, submit, treeInputs,
  write, type Turn,
} from './iterations.js';
import { decision as decisionBody, forkDecision, forkPartial, localDecision, registryChange, requestPlacement } from './placement.js';
import { commandResult } from './command-result.js';
import { scriptedScenarioRun } from './project-config.js';
import { announcingCheckExecution, createPassingCheckExecution } from './direct-check-execution.js';
import { deleted, modified, scenarioGit, untracked, type GitResponses, type ScenarioGit } from './recovery-git.js';
import { scriptedCandidates } from './candidates.js';
import {
  staleCrashLock, freeze, installTestRunner, openRuns, shapeOnlyInputs, startRun, stopRun, testPolicy,
  type OpenRunsOptions,
} from './runs.js';

/*
 * The composition of the loop, as iteration 12's suite runs it: the
 * scenarios that together reach every durable boundary of the run log, the
 * recovery table of all ten state machines keyed by those boundaries, and
 * the checks every recovered state is held to.
 *
 * Nothing here simulates a transition. Each scenario is the scripted agent
 * driving the real run service over a real copy of the fixture, and a crash
 * is what it is on disk: the service is abandoned at the boundary and the
 * lock is left held by a process that is gone.
 *
 * Git and the commands readiness would run are external, and are answered
 * rather than run: each scenario states, as fixture data, what its commits
 * answer and what the tree holds against the accepted boundary when each one
 * is made. One `ScenarioGit` outlives the crashed service, because the commit
 * an interrupted run made is one its restart finds again.
 */

export const plan = 'review-notes';

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const limits = 'collection-review/workspace/reviews/limits';
const limitsDirectory = 'subs/workspace/subs/reviews/subs/limits';
const reviews = 'collection-review/workspace/reviews';
const draftsDirectory = `${notesDirectory}/subs/drafts`;

/** The note limit, as `notes` needs it from `limits`. */
const noteLimit: Seam = {
  capability: 'note-limit',
  name: 'NoteLimit',
  providerDirectory: limitsDirectory,
  provider: limits,
  consumerDirectory: notesDirectory,
  consumerFile: 'notes.ts',
  reach: '../../limits',
  behavior: 'A note of at most 500 characters is within the limit; a longer one is not.',
};

/** The revised agreement: the length the provider can keep. */
const relaxed: Seam = { ...noteLimit, limit: 300, behavior: 'A note of at most 300 characters is within the limit, which is what the store can index.' };

/** The capability `limits` needs back from `notes`, which closes a cycle. */
const backToNotes: Seam = {
  capability: 'review-notes',
  name: 'ReviewNotes',
  providerDirectory: notesDirectory,
  provider: notes,
  consumerDirectory: limitsDirectory,
  consumerFile: 'limit-work.ts',
  reach: '../../notes',
  behavior: 'The limit reports what the review notes say about it.',
};

function place(capability: string, owner: string) {
  return localDecision(
    {
      question: `Where does ${capability} belong?`,
      outcome: 'reuse',
      capability,
      owner,
      rationale: 'The rule is a capability of its own, in a subtree this architect may place work in.',
    },
    [registryChange({ capability, owner, behavior: `The module provides ${capability}.` })],
  );
}

const yieldFor = (requirements: readonly string[]) => ({
  kind: 'yield-for-providers' as const,
  requirements: [...requirements],
  summary: 'This work item runs against its fake and waits for the real provider.',
});

/** An engineer turn that reaches its context budget: it is never a completion. */
const budgetTurn: Turn = [
  { kind: 'context', tokens: 200_000, window: null },
  { kind: 'message', text: 'I have read the module and have not changed anything yet.' },
];

/**
 * One command a scenario's engineer runs, and what it is stated to leave
 * behind. The command line is external, like Git: what the harness does with
 * the result is the run's own, and a command no scenario states is a
 * failure rather than a silent success. A shell command's side effect is
 * performed directly, from what the scenario states it leaves; nothing here
 * interprets or runs a shell.
 */
export interface StatedCommand {
  /** The exact process arguments, with the fixture root resolved for this scenario. */
  readonly argv: (root: string) => readonly string[];
  /** The exact working directory; the project root where omitted. */
  readonly cwd?: ((root: string) => string) | undefined;
  readonly exitCode?: number | undefined;
  readonly stdout?: string | undefined;
  /** What the command is stated to leave in the project. */
  readonly leaves?: ((root: string) => Promise<void>) | undefined;
  /**
   * A scenario run: `argv` is the mode's command, which `--config` and the
   * profile the harness wrote follow, and the scripted runner answers it
   * from that profile.
   */
  readonly scenarios?: boolean | undefined;
}

/**
 * The command runner of one scenario: every command its engineer runs is
 * answered from what the scenario states, and no process is started for it.
 */
export interface ScenarioCommands extends CommandRunner {
  /** Fails for a request that did not match the next exact fixture response. */
  assertAnswered(): void;
  /** Fails unless every stated response was consumed exactly once. */
  assertComplete(): void;
}

export function statedCommands(root: string, commands: readonly StatedCommand[]): ScenarioCommands {
  let cursor = 0;
  const failures: string[] = [];
  const runner: CommandRunner = async request => {
    const stated = commands[cursor];
    const expectedArgv = stated?.argv(root);
    const expectedCwd = stated?.cwd?.(root) ?? root;
    const received = stated?.scenarios === true && request.argv.length === (expectedArgv?.length ?? 0) + 2 && request.argv.at(-2) === '--config'
      ? request.argv.slice(0, -2)
      : request.argv;
    if (stated === undefined || expectedArgv === undefined
      || JSON.stringify(received) !== JSON.stringify(expectedArgv) || request.cwd !== expectedCwd) {
      const expected = stated === undefined
        ? `only ${commands.length} command response(s) were stated`
        : `expected \`${expectedArgv.join(' ')}\` in ${expectedCwd}`;
      const detail = `command ${cursor + 1}: ${expected}; received \`${request.argv.join(' ')}\` in ${request.cwd}`;
      failures.push(detail);
      throw new Error(detail);
    }
    cursor += 1;
    await stated.leaves?.(root);
    if (stated.scenarios === true) return (await scriptedScenarioRun(request))!;
    return commandResult(request, {
      outcome: { kind: 'completed', exitCode: stated.exitCode ?? 0 },
      ...(stated.stdout === undefined ? {} : { stdout: stated.stdout }),
    });
  };
  return Object.assign(runner, {
    assertAnswered() {
      expect(failures, 'command responses this scenario was asked for wrongly').toEqual([]);
    },
    assertComplete() {
      expect(failures, 'command responses this scenario was asked for wrongly').toEqual([]);
      expect(cursor, 'stated command responses consumed').toBe(commands.length);
    },
  });
}

/** One scenario of the composition: a target, the script that drives it, and the inputs its run reads. */
export interface Scenario {
  readonly name: ScenarioName;
  /** What it exercises, in a sentence. */
  readonly exercises: string;
  /** The terminal state an uninterrupted run of it reaches. */
  readonly ends: 'completed' | 'failed' | 'stopped';
  target(): Promise<{ root: string; remove: () => Promise<void> }>;
  script(root: string): Script;
  inputs(): RunInputs;
  /** What Git answers this scenario, in the order its commits are made. */
  readonly git: GitResponses;
  /** The final audited revision and its exact tree for a completed run. */
  readonly finalCandidate?: { readonly head: string; readonly tree: string };
  /** The commands this scenario's engineer runs, and what each one answers. */
  readonly commands?: readonly StatedCommand[] | undefined;
  /** A command the scenario sends while it runs, such as a stop. */
  readonly during?: ((write: RunWrite, context: DuringContext) => void) | undefined;
  /** The policy the run captures, where the scenario needs other limits than the tests' own. */
  readonly policy?: OpenRunsOptions['policy'];
}

export interface DuringContext {
  readonly runId: string;
  readonly root: string;
  stop(): void;
}

export type ScenarioName =
  | 'iteration' | 'delegation' | 'placement' | 'access' | 'breaking' | 'repair' | 'testless' | 'revision' | 'cycle' | 'stop'
  | 'agent-fails' | 'no-submission' | 'invalid-analysis' | 'over-limit';

async function fixtureWith(modules: ReadonlyArray<{ directory: string; name: string; files: Record<string, string> }>, runner: 'mini' | 'exit-0' = 'mini') {
  const fixture = await copyFixture();
  for (const module of modules) await addModule(fixture.root, module.directory, module.name, module.files);
  if (runner === 'mini') await installMiniRunner(fixture.root);
  else await installTestRunner(fixture.root);
  return fixture;
}

/**
 * The revisions a scenario's commits answer with. A scenario states one
 * response per commit it makes: a revision where the tree changed, and null
 * where the checkpoint found nothing to commit.
 */
export const source = (n: number) => `source-${String(n).padStart(2, '0')}`;

/** The revision every scenario's fixture is on before its run commits anything. */
const base = source(0);

/** A checkpoint over a tree with nothing to commit. */
const unchanged = (against: string) => ({ commit: null, against });

/**
 * The revision of the harness's own commit, "Scenarios of review-notes",
 * which writes the run's feature files onto its branch once readiness has
 * passed. Every scenario that passes readiness makes it before any gate.
 */
export const materialized = 'scenarios-00';

/** The feature file of one entry, in its owner's test area, for this plan. */
const featureOf = (ownerDirectory: string, capability: string) => `${ownerDirectory}/src/tests/features/${plan}/${capability}.feature`;

/** The materialization commit over the tree readiness found: every feature file is new. */
const materialize = (...files: string[]) => ({ commit: materialized, against: base, changes: untracked(...files) });

/**
 * The engineer's own test run. The policy these scenarios capture answers it
 * with a cheap command of the run's own, and the scenarios stating it here
 * run no process for it.
 */
const scopeTestRun = (...files: string[]): StatedCommand => ({
  argv: root => [join(root, 'node_modules', '.bin', 'vitest'), 'run', ...files],
});

/** The quick scenario run `run_scope_tests` makes beside the tests, with the fixture's configured command. */
const scopeScenarioRun: StatedCommand = { argv: () => ['npm', 'run', 'acceptance:quick', '--'], scenarios: true };

/** The command the iteration's engineer runs through the unguarded shell. */
const shellCommand = (root: string) => `rm -r '${join(root, draftsDirectory)}' && printf "left by the shell\\n" > '${join(root, notesDirectory, 'shell-note.txt')}'`;

const notesModule = { directory: notesDirectory, name: 'notes', files: { 'src/notes.ts': consumerStub, 'src/tests/notes.test.ts': consumerTest('notes.ts') } };
const limitsModule = { directory: limitsDirectory, name: 'limits', files: {} };

/**
 * One work item worked by one iteration, with every observation the loop
 * makes along the way: a hypothesis delivered to it, an architect that
 * compacts, an engineer that returns at its context budget and then, in a
 * fresh session, reads outside its scope, has a submission rejected, writes
 * through the guard and through the unguarded shell, and proposes
 * completion; the gate, its commit, the work-item gate and the final gate.
 */
const iteration: Scenario = {
  name: 'iteration',
  commands: [
    // Each call of the engineer's test tool runs the tests, then the scope's
    // scenarios: the work item's pending one, selected by its identity.
    { ...scopeTestRun(`${notesDirectory}/src/tests/notes.test.ts`), exitCode: 1 },
    scopeScenarioRun,
    scopeTestRun(`${notesDirectory}/src/tests/notes.test.ts`),
    scopeScenarioRun,
    {
      // What the shell leaves: the assigned included child removed and an
      // ordinary documentation file under the assigned owner. It is stated here and written directly; no shell runs.
      argv: root => ['bash', '-c', shellCommand(root)],
      cwd: root => join(root, notesDirectory, 'src'),
      async leaves(root) {
        await rm(join(root, draftsDirectory), { recursive: true });
        await writeFile(join(root, notesDirectory, 'shell-note.txt'), 'left by the shell\n');
      },
    },
  ],
  git: {
    head: base,
    after: source(1),
    recovered: [{ gate: 'ga-0004', answers: [null, source(1)] }],
    commits: [
      materialize(featureOf(notesDirectory, 'review-note')),
      // The work-item checkpoint commits the original assignments' authorized
      // source, included-child removal and ordinary owner documentation.
      // The earlier scoped discovery fails after the child declaration is removed.
      {
        commit: source(1),
        against: materialized,
        changes: [
          ...modified(`${notesDirectory}/src/notes.ts`),
          ...deleted(`${draftsDirectory}/README.md`, `${draftsDirectory}/module.ramify`),
          ...untracked(`${notesDirectory}/shell-note.txt`),
        ],
      },
      // The repair iteration reports partial work and reaches no checkpoint;
      // the final checkpoint finds the work-item commit unchanged.
      unchanged(source(1)),
    ],
  },
  exercises: 'the run, the analysis, readiness, one work item worked by an ordinary and a repair iteration, a budget return, the shell, a module removed, the gates and their commits',
  ends: 'completed',
  finalCandidate: { head: source(1), tree: '1'.repeat(40) },
  target: () => fixtureWith([
    {
      directory: notesDirectory, name: 'notes', files: {
        'src/notes.ts': 'export const noteLimit = 400;\n',
        'src/tests/notes.test.ts': [
          'import { test, expect } from \'vitest\';',
          'import { noteLimit } from \'../notes.ts\';',
          '',
          'test(\'the note limit is what the plan asks for\', () => { expect(noteLimit).toBe(500); });',
          '',
        ].join('\n'),
      },
    },
    // An explicitly included child module, which the engineer's shell removes.
    { directory: draftsDirectory, name: 'drafts', files: {} },
  ]),
  script: root => byRole({
    'initial-architect': [submit(analysis(
      [entry('review-note', notes)],
      [
        hypothesis('note-storage', { change: 'create', changesExistingSymbols: true, suggestedOwner: notes, involvedModules: [notes], confidence: 'medium' }),
        hypothesis('note-index', { change: 'reuse', suggestedOwner: notes, confidence: 'low' }),
        hypothesis('note-export', { change: 'create', suggestedOwner: notes, confidence: 'high' }),
        hypothesis('note-drafts', { change: 'create-by-extraction', suggestedOwner: notes, confidence: 'high' }),
      ],
    ))],
    'local-architect': [
      submit(assign(notes, {
        scope: {
          base: { module: notes, included: [{ directory: draftsDirectory, reason: 'Remove the obsolete drafts child', instructions: 'Remove the assigned child and verify the notes owner' }] },
          extra: [{ path: 'subs/workspace/subs/reviews/module.ramify', purpose: 'exposure-declaration' }],
          read: [reviews],
          rationale: 'The limit is the notes module\'s own; its parent\'s declaration may need to say so.',
        },
        externalCapabilities: [{ capability: 'review-note', owner: notes, role: 'use' }],
      }, outline()), { kind: 'compaction', reason: 'threshold', tokensBefore: 120_000, tokensAfter: 30_000 }),
      submit(assign(notes, {
        kind: 'repair',
        goal: 'Repair what the first iteration left: the limit\'s wording.',
        externalCapabilities: [{ capability: 'review-note', owner: notes, role: 'request' }],
      }), { kind: 'compaction', reason: 'manual', tokensBefore: 90_000, tokensAfter: 20_000 }),
      submit(
        requestCompletion({ changes: 'The iterations carried the goal; the work item is ready.', revisionReason: 'The iterations are closed.' }),
        { kind: 'compaction', reason: 'overflow', tokensBefore: 210_000, tokensAfter: 40_000 },
      ),
    ],
    engineer: [
      budgetTurn,
      [
        read(join(root, 'subs/workspace/subs/shared-ui/src/status-badge.tsx')),
        { kind: 'tool', tool: 'grep', input: { pattern: 'noteLimit', path: join(root, notesDirectory) } },
        runScopeTests(),
        { kind: 'submit', input: { kind: 'completion-proposed' } },
        // One write outside the scope, and one whose target cannot be resolved: both refused.
        write(join(root, 'subs/workspace/subs/shared-ui/src/status-badge.tsx'), 'export {};\n'),
        write(join(root, notesDirectory, 'src/notes.ts/inside-a-file.ts'), 'export {};\n'),
        write(join(root, notesDirectory, 'src/notes.ts'), 'export const noteLimit = 500;\n'),
        runScopeTests(),
        shell(shellCommand(root)),
        { kind: 'submit', input: completionProposed('Raised the note limit to the 500 characters the plan asks for.') },
      ],
      submit({ kind: 'partial', done: ['Read the limit\'s wording.'], unfinished: ['The wording is the plan\'s, not this module\'s, to change.'], findings: [] }),
    ],
  }),
  inputs: treeInputs,
};

/**
 * One delegation to completion: a consumer that needs behavior another
 * module owns, a contract sub-session, one obligation, the provider's work,
 * and verification against the real provider on return.
 */
const delegation: Scenario = {
  name: 'delegation',
  git: {
    head: base,
    after: source(3),
    commits: [
      materialize(featureOf(notesDirectory, 'review-notes')),
      // The contract iteration: the agreement's artifacts and the consumer
      // against its fake.
      { commit: source(1), against: materialized, changes: [...modified(paths(noteLimit).consumer), ...untracked(paths(noteLimit).fake, paths(noteLimit).contract, paths(noteLimit).conformance, paths(noteLimit).subjects)] },
      // The provider's own iteration, and the work-item checkpoint over the
      // tree it left.
      { commit: source(2), against: source(1), changes: [...modified(paths(noteLimit).subjects), ...untracked(paths(noteLimit).real)] },
      unchanged(source(2)),
      // The consumer's verification against the real provider, and the two
      // checkpoints that follow it.
      { commit: source(3), against: source(2), changes: modified(paths(noteLimit).consumer) },
      unchanged(source(3)),
      unchanged(source(3)),
    ],
    // The one scenario whose line measurements Git answers. Every other
    // scenario leaves them unavailable, which is what a run records when the
    // measurement cannot be had, and the two are the states a line event has.
    lines: [
      { path: paths(noteLimit).consumer, added: 8, deleted: 3, binary: false, bytes: null },
      { path: paths(noteLimit).real, added: 12, deleted: 0, binary: false, bytes: null },
    ],
  },
  exercises: 'a contract sub-session, registration, a yield, the provider, conformance, resumption and verification',
  ends: 'completed',
  finalCandidate: { head: source(3), tree: '2'.repeat(40) },
  target: () => fixtureWith([notesModule, limitsModule]),
  script: root => byWork({
    'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
    'local-architect:wi-001': [
      submit({ ...assign(notes, {}, outline()), localDecisions: [place('note-limit', limits)] }),
      submit(yieldFor(['rq-001'])),
      submit(assign(notes, { kind: 'verification', goal: 'Replace the fake with the real note limit and rerun the behavior.' })),
      submit(requestCompletion()),
    ],
    'engineer:wi-001': [
      submit(contractNeeded(noteLimit)),
      submit(completionProposed('The notes now use the real limit.'), write(join(root, paths(noteLimit).consumer), consumerAgainstReal(noteLimit))),
    ],
    'contract-engineer:wi-001': [submit(established(noteLimit), ...contractWrites(noteLimit))],
    'local-architect:wi-002': [
      submit(assign(limits, {}, outline({ changes: 'Implement the agreed limit and run the conformance suite against it.' }))),
      submit(requestCompletion()),
    ],
    'engineer:wi-002': [submit(completionProposed('The real limit is implemented.'), ...providerWrites(noteLimit, root))],
  }),
  inputs: treeInputs,
};

/**
 * Two placement requests: the first answered by a fork that returns partial
 * findings and then one that registers a new capability in the module that
 * already holds the behavior it extends, the second by one that finds the
 * capability outside the project. Each decision revises a hypothesis the
 * request tested.
 */
const placement: Scenario = {
  name: 'placement',
  // Every iteration of this scenario is a placement request: nothing is
  // written, so both checkpoints find nothing to commit after the feature
  // files are.
  git: {
    head: base, after: materialized,
    commits: [materialize(featureOf('subs/workspace/subs/reviews', 'reviewer-note')), unchanged(materialized), unchanged(materialized)],
  },
  exercises: 'placement requests, the view refresh, a partial fork, the decisions, the parent appends and the deliveries',
  ends: 'completed',
  finalCandidate: { head: materialized, tree: '3'.repeat(40) },
  target: () => fixtureWith([], 'exit-0'),
  script: () => byRole({
    'initial-architect': [submit(analysis(
      [entry('reviewer-note', reviews)],
      [
        hypothesis('note-home', { change: 'reuse', suggestedOwner: reviews, involvedModules: [reviews] }),
        hypothesis('note-mail', { change: 'create', suggestedOwner: reviews, involvedModules: [reviews] }),
      ],
    ))],
    'local-architect': [
      submit(requestPlacement({
        forCapability: 'reviewer-note',
        hypotheses: [
          { hypothesis: 'note-home', stance: 'supports', evidence: 'A review run already holds what a note is attached to.' },
          { hypothesis: 'note-mail', stance: 'contradicts', evidence: 'Nothing in the request sends a note anywhere.' },
        ],
      })),
      submit(requestPlacement({
        forCapability: 'reviewer-note',
        question: 'Where would a notification of a new note be sent from?',
        hypotheses: [{ hypothesis: 'note-mail', stance: 'departs', evidence: 'The notification would be another service\'s.' }],
      })),
      submit(requestCompletion()),
    ],
    'global-fork': [
      submit(forkPartial()),
      submit(forkDecision({
        // An extension: a new capability named for itself, owned by the module
        // that already holds the behavior, whose implementation changes symbols
        // that already have consumers.
        decision: decisionBody({
          outcome: 'create', capability: 'reviewer-note-attachment', changesExistingSymbols: true, owner: reviews,
          rationale: 'The note is attached to the review run this module already owns, so the attached note is a capability of its own here.',
        }),
        registry: [registryChange({ capability: 'reviewer-note-attachment', owner: reviews, behavior: 'A reviewer note is attached to a completed review run.' })],
        hypothesisRevisions: [{ hypothesis: 'note-home', standing: 'confirmed', reason: 'The review run is where the note belongs.', confidence: 'high' }],
        brief: 'The attached note is a new capability of the reviews module, which already holds a review run; implementing it changes symbols that already have consumers.',
      })),
      submit(forkDecision({
        decision: decisionBody({ outcome: 'external', capability: 'note-mail', owner: null, rationale: 'Notifications are sent by a service outside this project.' }),
        hypothesisRevisions: [
          { hypothesis: 'note-mail', standing: 'superseded', reason: 'No module of this project sends mail.', confidence: 'low' },
          { hypothesis: 'note-home', standing: 'tentative', reason: 'Only the note\'s home is settled, not how it is shown.', confidence: 'medium' },
        ],
        brief: 'Notification of a note is outside this project.',
      })),
    ],
  }),
  inputs: () => shapeOnlyInputs,
};

/**
 * Two agreements that give the consumer access to behavior another module
 * already has: no fake, no conformance suite and no obligation, one under
 * the consumer's authority and one under an independent owner's.
 */
const access: Scenario = {
  name: 'access',
  git: {
    head: base,
    after: source(2),
    commits: [
      materialize(featureOf(notesDirectory, 'review-notes')),
      // Each access-only agreement is an exposure the provider declares.
      { commit: source(1), against: materialized, changes: modified(`${limitsDirectory}/module.ramify`, `${notesDirectory}/src/notes.ts`) },
      { commit: source(2), against: source(1), changes: modified(`${limitsDirectory}/module.ramify`) },
      unchanged(source(2)),
      unchanged(source(2)),
    ],
  },
  exercises: 'two access-only agreements, under the consumer\'s and an independent authority, and the work that uses them',
  ends: 'completed',
  finalCandidate: { head: source(2), tree: '4'.repeat(40) },
  target: () => fixtureWith([
    notesModule,
    {
      directory: limitsDirectory, name: 'limits', files: {
        'src/note-limit.ts': 'export function createNoteLimit() {\n  return { accepts: (note) => note.length <= 500 };\n}\n',
        'src/note-trim.ts': 'export function trimNote(note) {\n  return note.trim();\n}\n',
      },
    },
  ]),
  script: () => byWork({
    'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
    'local-architect:wi-001': [
      submit({ ...assign(notes, {}, outline()), localDecisions: [place('note-limit', limits), place('note-trim', limits)] }),
      submit(assign(notes, { goal: 'Use the trimming rule too.' })),
      submit(requestCompletion()),
    ],
    'engineer:wi-001': [
      submit(contractNeeded(noteLimit)),
      submit(contractNeeded({ ...noteLimit, capability: 'note-trim', name: 'NoteTrim', behavior: 'A note is trimmed before it is kept.' })),
    ],
    'contract-engineer:wi-001': [
      submit(accessOnly('note-limit', 'consumer', 'expose-src createNoteLimit from "note-limit.ts" to parent'),
        write(`${limitsDirectory}/module.ramify`, 'ramify 1\nmodule limits\n\nexpose-src createNoteLimit from "note-limit.ts" to parent\n'),
        write(paths(noteLimit).consumer, consumerAgainstReal(noteLimit))),
      submit(accessOnly('note-trim', 'independent', 'expose-src trimNote from "note-trim.ts" to parent'),
        write(`${limitsDirectory}/module.ramify`, 'ramify 1\nmodule limits\n\nexpose-src createNoteLimit from "note-limit.ts" to parent\nexpose-src trimNote from "note-trim.ts" to parent\n')),
    ],
  }),
  inputs: treeInputs,
};

/** An access-only agreement over behavior `limits` already has. */
function accessOnly(capability: string, authority: 'consumer' | 'independent', declaration: string) {
  return {
    kind: 'established' as const,
    mode: 'access-only' as const,
    authority: {
      kind: authority,
      owner: authority === 'consumer' ? notes : reviews,
      rationale: authority === 'consumer'
        ? 'The consumer asked for access to behavior that already exists; the agreement is its own.'
        : 'Both sides are beneath the reviews feature, which owns the exposure between them.',
    },
    provider: limits,
    behavior: `The notes module reaches ${capability} as it is.`,
    artifacts: { interface: [], conformance: [], fake: [], exposure: [{ path: `${limitsDirectory}/module.ramify`, declaration }] },
    fakeInjections: [],
    summary: `${capability} is exposed to the notes module as it is; nothing is faked and nothing is owed.`,
  };
}

const panel = 'collection-review/workspace/reviews/panel';
const panelDirectory = 'subs/workspace/subs/reviews/subs/panel';

const lines = (...parts: string[]) => `${parts.join('\n')}\n`;

/**
 * A break staged across two iterations: the structured limit is added
 * beside the plain number, then the number goes and its one reader moves in
 * the same explicitly broad iteration, whose checkpoint is the whole
 * project.
 */
const breaking: Scenario = {
  name: 'breaking',
  git: {
    head: base,
    after: source(2),
    commits: [
      materialize(featureOf(notesDirectory, 'structured-limit')),
      // The compatible stage, then the breaking one, which moves the reader
      // in the same commit.
      { commit: source(1), against: materialized, changes: modified(`${notesDirectory}/src/notes.ts`) },
      {
        commit: source(2),
        against: source(1),
        changes: modified(`${notesDirectory}/src/notes.ts`, `${notesDirectory}/src/tests/notes.test.ts`, `${panelDirectory}/src/panel.ts`),
      },
      unchanged(source(2)),
      unchanged(source(2)),
    ],
  },
  exercises: 'a staged outline with a breaking change, a compatible stage, and a breaking iteration with a broad scope and an all-project gate',
  ends: 'completed',
  finalCandidate: { head: source(2), tree: '5'.repeat(40) },
  target: () => fixtureWith([
    {
      directory: notesDirectory, name: 'notes', files: {
        'src/notes.ts': 'export const noteLimit = 500;\n',
        'src/tests/notes.test.ts': lines(
          "import { test, expect } from 'vitest';",
          "import { noteLimit } from '../notes.ts';",
          "test('the note limit is 500', () => { expect(noteLimit).toBe(500); });",
        ),
      },
    },
    {
      directory: panelDirectory, name: 'panel', files: {
        'src/panel.ts': lines(
          "import { noteLimit } from '../../notes/src/notes.ts';",
          'export function describeLimit() { return `at most ${noteLimit}`; }',
        ),
        'src/tests/panel.test.ts': lines(
          "import { test, expect } from 'vitest';",
          "import { describeLimit } from '../panel.ts';",
          "test('the panel states the limit', () => { expect(describeLimit()).toBe('at most 500'); });",
        ),
      },
    },
  ]),
  script: () => byRole({
    'initial-architect': [submit(analysis([entry('structured-limit', notes)]))],
    'local-architect': [
      submit(assign(notes, { goal: 'Add the structured limit beside the plain number.' }, outline({
        changes: 'The limit becomes a structure; the plain number goes.',
        decomposition: { kind: 'staged', rationale: 'The number has a reader, so the structure arrives first and the number goes second.' },
        breakingChanges: [{ guarantee: 'noteLimit is a plain number', reason: 'The request asks for a structured limit.', affectedConsumers: [panel], citations: [] }],
        stages: [
          { title: 'Add the structure beside the number', approach: 'non-breaking', dependsOn: [], note: '' },
          { title: 'Remove the number and move its reader', approach: 'breaking', dependsOn: [0], note: '' },
        ],
      }))),
      submit(assign(notes, {
        kind: 'breaking',
        stage: 1,
        goal: 'Remove the plain number and move its one reader to the structure.',
        scope: {
          base: { modules: [notes, panel], rationale: 'The number goes and its reader moves in the same step, or the project stops compiling.' },
          extra: [],
          read: [],
          rationale: 'The break and its adaptation are one boundary.',
        },
      })),
      submit(requestCompletion()),
    ],
    engineer: [
      submit(completionProposed('The structure is there beside the number.'),
        write(`${notesDirectory}/src/notes.ts`, lines('export const noteLimit = 500;', 'export const limit = { max: 500 };'))),
      submit(completionProposed('The number is gone and the panel reads the structure.'),
        write(`${notesDirectory}/src/notes.ts`, lines('export const limit = { max: 500 };')),
        write(`${notesDirectory}/src/tests/notes.test.ts`, lines(
          "import { test, expect } from 'vitest';",
          "import { limit } from '../notes.ts';",
          "test('the note limit is 500', () => { expect(limit.max).toBe(500); });",
        )),
        write(`${panelDirectory}/src/panel.ts`, lines(
          "import { limit } from '../../notes/src/notes.ts';",
          'export function describeLimit() { return `at most ${limit.max}`; }',
        ))),
    ],
  }),
  inputs: treeInputs,
};

/** The notes module with a test its source does not yet satisfy. */
const failingNotes = {
  directory: notesDirectory, name: 'notes', files: {
    'src/notes.ts': 'export const noteLimit = 400;\n',
    'src/tests/notes.test.ts': lines(
      "import { test, expect } from 'vitest';",
      "import { noteLimit } from '../notes.ts';",
      "test('the note limit is what the plan asks for', () => { expect(noteLimit).toBe(500); });",
    ),
  },
};

/**
 * A gate that fails in scope, three repair rounds that change nothing, the
 * iteration exhausted, a local architect that reports the request cannot be
 * met, and a global architect that finds nothing of the plan possible.
 */
const repair: Scenario = {
  name: 'repair',
  // The engineer changes nothing, so the one checkpoint it reaches finds
  // nothing to commit after the feature files.
  git: { head: base, after: materialized, commits: [materialize(featureOf(notesDirectory, 'review-note')), unchanged(materialized)] },
  exercises: 'a failing gate, its repair rounds, exhaustion, and an architect that reports the request unresolved',
  ends: 'failed',
  target: () => fixtureWith([failingNotes]),
  script: () => byRole({
    'initial-architect': [submit(analysis([entry('review-note', notes)]))],
    'local-architect': [
      submit(assign(notes, {}, outline())),
      submit({ kind: 'unresolved', conflict: 'The limit the test states is not one this module can meet as asked.', evidence: [`${notesDirectory}/src/tests/notes.test.ts`] }),
    ],
    engineer: [submit(completionProposed('Nothing needed changing.'))],
    // The global architect answers the unresolved request: no deviation
    // leaves anything of the plan worth doing, so the run ends.
    'global-fork': [submit({ kind: 'nothing-possible', reason: 'The plan asks for exactly the limit the module cannot meet.', evidence: [`${notesDirectory}/src/tests/notes.test.ts`] })],
  }),
  inputs: treeInputs,
};

/**
 * An owner with no test at all: its iteration gate is not verified with an
 * empty selection, which returns to the architect, and the work-item gate
 * over the whole project then passes.
 */
const testless: Scenario = {
  name: 'testless',
  // The engineer's test tool finds no test to run, and still runs the work
  // item's pending scenario.
  commands: [scopeScenarioRun],
  // The owner has no test of its own: its iteration checkpoint is not
  // verified and commits nothing, and neither checkpoint that follows has
  // anything to commit after the feature files.
  git: {
    head: base, after: materialized,
    commits: [materialize(featureOf(limitsDirectory, 'note-limits')), unchanged(materialized), unchanged(materialized)],
  },
  exercises: 'an engineer that reports the goal outside its scope, and an empty required selection: not verified, never a pass, and back to the architect',
  ends: 'completed',
  finalCandidate: { head: materialized, tree: '6'.repeat(40) },
  target: () => fixtureWith([{ directory: limitsDirectory, name: 'limits', files: { 'src/limits.ts': 'export const limits = [];\n' } }]),
  script: () => byRole({
    'initial-architect': [submit(analysis([entry('note-limits', limits)]))],
    'local-architect': [
      submit(assign(limits, {}, outline())),
      submit(assign(limits, { goal: 'Declare the limits the notes need, here.' })),
      submit(requestCompletion()),
    ],
    engineer: [
      submit({ kind: 'unsuitable', reason: 'scope', detail: 'The limits the goal names are the notes module\'s to define, not this one\'s.' }),
      submit(completionProposed('The limits are declared.'), runScopeTests()),
    ],
  }),
  inputs: treeInputs,
};

/** A provider that cannot conform, the revision its consumer assigns, and the reopening that follows. */
const revision: Scenario = {
  name: 'revision',
  git: {
    head: base,
    after: source(4),
    commits: [
      materialize(featureOf(notesDirectory, 'review-notes')),
      // The agreement at its first revision, and the consumer against its fake.
      { commit: source(1), against: materialized, changes: [...modified(paths(noteLimit).consumer), ...untracked(paths(noteLimit).fake, paths(noteLimit).contract, paths(noteLimit).conformance, paths(noteLimit).subjects)] },
      // The revised agreement.
      { commit: source(2), against: source(1), changes: modified(paths(relaxed).fake, paths(relaxed).contract) },
      // The provider implements the revised length.
      { commit: source(3), against: source(2), changes: [...modified(paths(relaxed).subjects), ...untracked(paths(relaxed).real)] },
      unchanged(source(3)),
      // The consumer verifies against it, and the two checkpoints that follow.
      { commit: source(4), against: source(3), changes: modified(paths(relaxed).consumer) },
      unchanged(source(4)),
      unchanged(source(4)),
    ],
  },
  exercises: 'a provider that cannot conform, the revision its consumer assigns, and the evidence it reopens',
  ends: 'completed',
  finalCandidate: { head: source(4), tree: '7'.repeat(40) },
  target: () => fixtureWith([notesModule, limitsModule]),
  script: root => byWork({
    'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
    'local-architect:wi-001': [
      submit({ ...assign(notes, {}, outline()), localDecisions: [place('note-limit', limits)] }),
      submit(yieldFor(['rq-001'])),
      submit(assign(notes, {
        kind: 'contract',
        revisesContract: 'ct-001',
        goal: 'Revise ct-001 so that it states the behavior this module needs.',
        approach: 'The provider cannot index 500 characters; agree the length it can.',
        completionEvidence: 'The revised conformance suite passes against the fake, and this module runs against it.',
      })),
      submit(yieldFor(['rq-001'])),
      submit(assign(notes, { kind: 'verification', goal: 'Replace the fake with the revised real limit.' })),
      submit(requestCompletion()),
    ],
    'engineer:wi-001': [
      submit(contractNeeded(noteLimit)),
      submit(completionProposed('The notes now use the revised real limit.'), write(join(root, paths(relaxed).consumer), consumerAgainstReal(relaxed))),
    ],
    'contract-engineer:wi-001': [
      submit(established(noteLimit), ...contractWrites(noteLimit)),
      submit(established(relaxed), ...contractWrites(relaxed)),
    ],
    'local-architect:wi-002': [
      submit(assign(limits, {}, outline({ changes: 'Implement the agreed limit.' }))),
      submit(assign(limits, {}, outline({ changes: 'Implement the limit the revised agreement states.' }))),
      submit(requestCompletion()),
    ],
    'engineer:wi-002': [
      submit({
        kind: 'unsuitable',
        reason: 'provider-cannot-conform',
        detail: 'The agreed suite requires a note of 500 characters to be kept, and the store this module writes to indexes 300.',
      }),
      submit(completionProposed('The real limit is implemented at the revised length.'), ...providerWrites(relaxed, root)),
    ],
  }),
  inputs: treeInputs,
};

/** A capability that comes to depend on itself, twice: a notice, then a failed run. */
const cycle: Scenario = {
  name: 'cycle',
  git: {
    head: base,
    after: source(2),
    commits: [
      materialize(featureOf(notesDirectory, 'review-notes')),
      // The first agreement, and then the one that closes the cycle.
      { commit: source(1), against: materialized, changes: [...modified(paths(noteLimit).consumer), ...untracked(paths(noteLimit).fake, paths(noteLimit).contract, paths(noteLimit).conformance, paths(noteLimit).subjects)] },
      { commit: source(2), against: source(1), changes: [...modified(paths(backToNotes).consumer), ...untracked(paths(backToNotes).fake, paths(backToNotes).contract, paths(backToNotes).conformance, paths(backToNotes).subjects)] },
      unchanged(source(2)),
    ],
  },
  exercises: 'a capability cycle, the return to its architect, and the same cycle again',
  ends: 'failed',
  target: () => fixtureWith([
    notesModule,
    { directory: limitsDirectory, name: 'limits', files: { 'src/limit-work.ts': consumerStub, 'src/tests/limit-work.test.ts': consumerTest('limit-work.ts') } },
  ]),
  script: () => byRole({
    'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
    'local-architect': [
      submit({ ...assign(notes, {}, outline()), localDecisions: [place('note-limit', limits)] }),
      submit(yieldFor(['rq-001'])),
      submit(assign(limits, {}, outline({ changes: 'Implement the agreed limit.' }))),
      submit(assign(limits, { goal: 'Try the same need again.' })),
    ],
    engineer: [
      submit(contractNeeded(noteLimit)),
      submit(contractNeeded(backToNotes)),
      submit(contractNeeded(backToNotes)),
    ],
    'contract-engineer': [
      submit(established(noteLimit), ...contractWrites(noteLimit)),
      submit(established(backToNotes), ...contractWrites(backToNotes)),
      submit(established(backToNotes), ...contractWrites(backToNotes)),
    ],
  }),
  inputs: treeInputs,
};

/** A stop that arrives while an engineer holds the writer. */
const stopping: Scenario = {
  name: 'stop',
  // The stop arrives while the writer is held: no checkpoint is reached,
  // and the feature files were committed before the first work item.
  git: { head: base, after: materialized, commits: [materialize(featureOf(notesDirectory, 'review-notes'))] },
  exercises: 'a stop while a writer is in flight: the invocation is superseded and the run stops',
  ends: 'stopped',
  target: () => fixtureWith([notesModule]),
  script: () => byRole({
    'initial-architect': [submit(analysis([entry('review-notes', notes)]))],
    'local-architect': [submit(assign(notes, {}, outline()))],
    engineer: [[{ kind: 'wait', ms: 60_000 }, { kind: 'submit', input: completionProposed('Too late.') }]],
  }),
  inputs: treeInputs,
  during(write, context) {
    if (write === 'writer-acquired') context.stop();
  },
};

/** An analysis that cannot be had, four ways: each ends the run failed, with its own reason. */
function failingAnalysis(name: ScenarioName, exercises: string, turn: Turn, policy?: Scenario['policy']): Scenario {
  return {
    name,
    exercises,
    ends: 'failed',
    // The run fails before any work item is assigned, so it commits nothing.
    git: { head: base, after: base, commits: [] },
    target: () => fixtureWith([notesModule], 'exit-0'),
    script: () => byRole({ 'initial-architect': [turn], 'local-architect': [submit(requestCompletion())] }),
    inputs: treeInputs,
    ...(policy === undefined ? {} : { policy }),
  };
}

const agentFails = failingAnalysis('agent-fails', 'an initial architect whose session fails: agent-failed', [{ kind: 'fail', error: 'the provider refused the request' }]);
const noSubmission = failingAnalysis('no-submission', 'an initial architect that ends without a submission: analysis-invalid', [{ kind: 'end', message: 'I have nothing to submit.' }]);
const invalidAnalysis = failingAnalysis('invalid-analysis', 'an initial architect whose every submission is invalid: invalid-submission at the bound',
  [1, 2, 3, 4].map(() => ({ kind: 'submit' as const, input: { entries: 'none' } })));
const overLimit: Scenario = {
  ...failingAnalysis('over-limit', 'a run whose policy allows fewer work items than its analysis assigns: limit-exceeded',
    submit(analysis([entry('review-notes', notes), entry('review-note-limit', notes)]))),
  // The work items are counted after readiness, once the feature files
  // are committed.
  git: {
    head: base, after: materialized,
    commits: [materialize(featureOf(notesDirectory, 'review-note-limit'), featureOf(notesDirectory, 'review-notes'))],
  },
  policy: projectRoot => {
    const policy = testPolicy(projectRoot);
    return { ...policy, limits: { ...policy.limits, maxWorkItems: 1 } };
  },
};

export const scenarios: Readonly<Record<ScenarioName, Scenario>> = {
  iteration, delegation, placement, access, breaking, repair, testless, revision, cycle, stop: stopping,
  'agent-fails': agentFails, 'no-submission': noSubmission, 'invalid-analysis': invalidAnalysis, 'over-limit': overLimit,
};

/** The completed path makes four exact tree previews; the final gate's unchanged commit keeps its head. */
export function compositionGit(root: string, scenario: Scenario): ScenarioGit {
  const final = scenario.finalCandidate;
  if (scenario.ends === 'completed' && final === undefined) {
    throw new Error(`${scenario.name} must state the final audited candidate`);
  }
  if (final !== undefined && (scenario.ends !== 'completed' || final.head !== scenario.git.after)) {
    throw new Error(`${scenario.name} has a final candidate inconsistent with its stated Git outcome`);
  }
  return scenarioGit(root, {
    ...scenario.git,
    ...(final === undefined ? {} : { previews: Array.from({ length: 4 }, () => ({ repositoryRoot: root, head: final.head, tree: final.tree })) }),
  });
}

/** Only the revision audited by a completed scenario has a scripted candidate tree. */
export function compositionCandidates(root: string, scenario: Scenario) {
  const final = scenario.finalCandidate;
  return scriptedCandidates(root, final === undefined ? {} : {
    [final.head]: { tree: final.tree, files: {}, base: scenario.git.head, changes: [] },
  });
}

/**
 * One run of a scenario, driven to its end, with nothing interrupting it.
 * `watch` is called after every durable write, while the run is running.
 */
export async function runToEnd(scenario: Scenario, watch?: (service: RunService, runId: string) => Promise<void>) {
  const target = await scenario.target();
  const agent = createScriptedAgent(declaringScenarios(scenario.script(target.root)));
  const git = compositionGit(target.root, scenario);
  const commands = statedCommands(target.root, scenario.commands ?? []);
  let runId = '';
  let stopped = false;
  const opened = await openRuns(target.root, {
    agent,
    git,
    candidates: compositionCandidates(target.root, scenario),
    // Every gate announces its commands, as the real executors do.

    checkExecution: announcingCheckExecution(createPassingCheckExecution()),
    commandExecution: commands,
    inputs: scenario.inputs(),
    ...(scenario.policy === undefined ? {} : { policy: scenario.policy }),
    afterWrite: async (write, id) => {
      runId = id;
      scenario.during?.(write, { runId: id, root: target.root, stop: () => { if (!stopped) { stopped = true; void sendStop(opened.service, id); } } });
      await watch?.(opened.service, id);
    },
  });
  const receipt = await opened.service.execute(startRun(plan));
  await opened.service.settled(plan, receipt.jobId);
  commands.assertComplete();
  try { git.assertComplete(); } catch (error) { throw new Error(`${scenario.name}: Git script incomplete`, { cause: error }); }
  void runId;
  return {
    root: target.root,
    runId: receipt.jobId,
    service: opened.service,
    agent,
    git,
    async dispose() {
      await opened.service.close();
      await target.remove();
    },
  };
}

async function sendStop(service: RunService, runId: string): Promise<void> {
  // A stop names the version it expects; a write in between is answered
  // stale with the current version, and the stop is sent again.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const version = service.getRun(plan, runId)?.version ?? 0;
    try {
      await service.execute(stopRun(plan, runId, version));
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
}

/** Where a crash is placed: the first write of a boundary, optionally narrowed by what the log holds. */
export interface CrashPoint {
  readonly write: RunWrite;
  /** Narrows the boundary: the crash happens at the first write of `write` for which this holds. */
  readonly when?: ((events: readonly RunEvent[]) => boolean) | undefined;
}

/** A scenario run up to one boundary and abandoned there, as a crash leaves it. */
export async function crashAt(scenario: Scenario, point: CrashPoint) {
  const target = await scenario.target();
  const agent = createScriptedAgent(declaringScenarios(scenario.script(target.root)));
  const git = compositionGit(target.root, scenario);
  const commands = statedCommands(target.root, scenario.commands ?? []);
  let resolveFrozen: (runId: string) => void = () => undefined;
  const frozen = new Promise<string>(resolve => { resolveFrozen = resolve; });
  let crashed = false;
  let stopped = false;
  const opened = await openRuns(target.root, {
    agent,
    git,
    candidates: compositionCandidates(target.root, scenario),
    // Every gate announces its commands, as the real executors do.

    checkExecution: announcingCheckExecution(createPassingCheckExecution()),
    commandExecution: commands,
    inputs: scenario.inputs(),
    // A stop waits for the invocation the driver has open before it writes
    // the run's terminal event. A crashed driver never closes it, and a
    // process that crashed writes nothing more, so the wait must outlast
    // the test.
    stopGraceMs: 600_000,
    ...(scenario.policy === undefined ? {} : { policy: scenario.policy }),
    afterWrite: async (write, runId) => {
      if (crashed) {
        await freeze();
        return;
      }
      scenario.during?.(write, { runId, root: target.root, stop: () => { if (!stopped) { stopped = true; void sendStop(opened.service, runId); } } });
      if (write !== point.write) return;
      if (point.when !== undefined && !point.when(await logEvents(target.root, runId))) return;
      crashed = true;
      resolveFrozen(runId);
      await freeze();
    },
  });
  const receipt = await opened.service.execute(startRun(plan));
  const endedBeforeBoundary = opened.service.settled(plan, receipt.jobId).then(() => {
    commands.assertAnswered();
    throw new Error(`${scenario.name} ended before it reached ${point.write}`);
  });
  const runId = await Promise.race([
    frozen,
    endedBeforeBoundary,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${scenario.name} never reached ${point.write}`)), 240_000)),
  ]);
  await staleCrashLock(target.root);
  // The Git of the crashed run is the Git of the restarts that follow it:
  // the commit it made is the one they find again.
  return { root: target.root, runId, agent, git, remove: target.remove };
}

/** The directory of the run beneath the project. */
export function runDirectory(root: string, runId: string): string {
  return join(root, 'plans', plan, '.harness', 'jobs', runId);
}

/** One complete line of the run log, as the ledger wrote it. */
export interface LogLine {
  readonly text: string;
  readonly sequence: number;
  readonly event: RunEvent;
  readonly records: ReadonlyArray<{ path: string; id: string; revision: number; body: unknown }>;
  readonly effect?: { key: string; phase: 'intent' | 'completion' } | undefined;
}

/** Every complete line of the run log; a torn last line is what a reader mid-write sees, and is left out. */
export async function logLines(root: string, runId: string): Promise<LogLine[]> {
  let text: string;
  try {
    text = await readFile(join(runDirectory(root, runId), 'events.jsonl'), 'utf8');
  } catch {
    return [];
  }
  const lines: LogLine[] = [];
  for (const raw of text.split('\n').filter(Boolean)) {
    try {
      const parsed = JSON.parse(raw) as Omit<LogLine, 'text'>;
      lines.push({ ...parsed, text: raw });
    } catch {
      break;
    }
  }
  return lines;
}

export async function logEvents(root: string, runId: string): Promise<RunEvent[]> {
  return (await logLines(root, runId)).map(line => line.event);
}

/** The bytes the ledger materializes for a record body. */
export function recordText(body: unknown): string {
  return `${JSON.stringify(body, null, 2)}\n`;
}

/** Every record path the log commits, with the body of its last committed revision. */
export function committedRecords(lines: readonly LogLine[]): Map<string, unknown> {
  const records = new Map<string, unknown>();
  for (const line of lines) for (const record of line.records) records.set(record.path, record.body);
  return records;
}

/** Removes every record file the log commits, so recovery has to materialize each of them again. */
export async function removeRecordFiles(root: string, runId: string, lines: readonly LogLine[]): Promise<number> {
  let removed = 0;
  for (const path of committedRecords(lines).keys()) {
    const absolute = join(runDirectory(root, runId), path);
    if (existsSync(absolute)) {
      await rm(absolute);
      removed += 1;
    }
  }
  return removed;
}

/** The SHA-256 of every file beneath a directory, by relative path. */
export async function fileHashes(directory: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  async function walk(absolute: string, relative: string): Promise<void> {
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(join(absolute, entry.name), path);
      else if ((await stat(join(absolute, entry.name))).isFile()) {
        hashes[path] = createHash('sha256').update(await readFile(join(absolute, entry.name))).digest('hex');
      }
    }
  }
  await walk(directory, '');
  return hashes;
}

/**
 * The gates the run branch holds a commit for: one entry per commit Git
 * answered with a revision, named by the gate whose identity trailers the
 * harness looked the commit up by, or `scenarios` for the commit that
 * materialized the feature files. A commit a restart found again rather
 * than made is already here, from the attempt that made it.
 */
export function committedGates(git: ScenarioGit): string[] {
  return git.commits().flatMap(call => (call.commit === null ? [] : [call.gate ?? 'without a gate']));
}

/**
 * The identity of an event where the log may hold it once only. A second
 * event with the same identity is a duplicate: of work, of an obligation, of
 * a decision, of a brief, or of an effect.
 */
export function identityOf(event: RunEvent): string | null {
  const data = event.data as Record<string, unknown>;
  const ref = (value: unknown) => (typeof value === 'object' && value !== null ? `${(value as { id: string }).id}@${(value as { revision: number }).revision}` : String(value));
  switch (event.type) {
    case 'job-started': case 'analysis-accepted': case 'job-completed': case 'job-failed': case 'job-stopped': case 'job-interrupted':
    case 'scenarios-materializing': case 'scenarios-materialized':
      return event.type;
    case 'invocation-started': case 'invocation-ended': return `${event.type}:${String(data.invocation)}`;
    case 'session-opened': case 'session-finished': return `${event.type}:${String(data.session)}`;
    case 'writer-acquired': case 'writer-released': return `${event.type}:${String(data.invocation)}`;
    case 'readiness-passed': case 'readiness-failed': return `${event.type}:${String(data.attempt)}`;
    case 'work-item-started': case 'work-item-completed': return `${event.type}:${String(data.workItem)}`;
    case 'iteration-assigned': case 'iteration-closed': return `${event.type}:${String(data.iteration)}`;
    case 'contract-requested': return `${event.type}:${String(data.iteration)}`;
    case 'outline-revised': return `${event.type}:${String(data.workItem)}@${String(data.revision)}`;
    case 'gate-committing': case 'gate-attempted': return `${event.type}:${String(data.gate)}`;
    case 'placement-requested': return `${event.type}:${String(data.request)}`;
    case 'decision-accepted': case 'brief-appended': return `${event.type}:${String(data.decision)}`;
    case 'decision-delivered': return `${event.type}:${String(data.decision)}->${String(data.workItem)}`;
    case 'contract-registered': case 'evidence-reopened': return `${event.type}:${String(data.contract)}@${String(data.revision)}`;
    case 'provider-conformed': return `${event.type}:${String(data.obligation)}@${String(data.revision)}`;
    case 'requirement-verified': return `${event.type}:${String(data.requirement)}@${String(data.revision)}`;
    case 'revision-needed': return `${event.type}:${ref(data.obligation)}`;
    case 'dependency-cycle-detected': return `${event.type}:${String(data.detection)}`;
    case 'fork-returned-partial': return `${event.type}:${String(data.request)}#${String(data.retry)}`;
    case 'view-refreshed': return `${event.type}:${String(data.request)}#${String(data.attempt)}`;
    case 'global-context-rebuilt': return `${event.type}:${String(data.generation)}`;
    default: return null;
  }
}

/**
 * The events recovery may append, and only where the log holds an intent or
 * an open start with no completion. Anything else appended by a restart
 * would be new work.
 */
export const recoveryCompletions: ReadonlySet<RunEvent['type']> = new Set([
  'invocation-ended', 'writer-released', 'gate-attempted', 'brief-appended', 'global-context-rebuilt',
  'decision-delivered', 'scenarios-materialized', 'session-finished', 'job-interrupted',
  'context-package-appended',
]);
