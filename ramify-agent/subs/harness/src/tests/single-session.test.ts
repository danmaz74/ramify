import { chmod, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createScriptedAgent, type ScriptStep } from '../../subs/agent/src/scripted.js';
import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { observationSchema, type Observation } from '../run/observations.js';
import { gateAttemptSchema } from '../run/records.js';
import {
  sessionOutcomeSchema, sessionRecordSchema, sessionsDirectory, sessionSubmissionSchema, type SessionOutcomeRecord,
} from '../sessions/records.js';
import { runSingleSession, sessionAcceptance, type SessionProgress, type SingleSessionOptions, type SingleSessionResult } from '../sessions/single.js';
import { acquireProjectLock, lockPath } from '../store/lock.js';
import { copyFixture } from './helpers/fixture.js';
import { addModule, completionProposed, edit, installMiniRunner, readDeclaredTree, shell, unsuitableScope, write } from './helpers/iterations.js';
import { git, initRepository, testPolicy } from './helpers/runs.js';

/*
 * One engineer session on one module, from a prompt, on the scripted fake.
 *
 * The session is given the equipment of an implementation run: the guard,
 * the hook check, the shell, the scoped test tool and the validated
 * submission. What these tests hold it to is what the command promises: it
 * refuses before any agent starts when it cannot run, it never commits, its
 * records are plain files git ignores, and nothing follows a submission.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const notesSource = `${notesDirectory}/src/notes.ts`;

/** A fixture copy with a module whose test asks for a limit its source does not have yet. */
async function project(): Promise<string> {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  const root = fixture.root;
  await addModule(root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 400;\n',
    'src/tests/notes.test.ts': [
      'import { test, expect } from \'vitest\';',
      'import { noteLimit } from \'../notes.ts\';',
      '',
      'test(\'the limit is what the prompt asks for\', () => { expect(noteLimit).toBe(500); });',
      '',
    ].join('\n'),
  });
  await installMiniRunner(root);
  await initRepository(root);
  return root;
}

/**
 * A `ramify` whose hook check reports a module violation in every file that
 * holds the word FORBIDDEN, and a clean check otherwise. Materializing
 * succeeds and writes nothing, so no API view is found.
 */
async function stubRamify(): Promise<RamifyCli> {
  const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-session-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const executable = join(directory, 'ramify');
  const finding = '{"schemaVersion":"ramify.check/1","outcome":"findings","findings":[{"code":"not-visible","category":"import",'
    + '"message":"collection-review:interfaces/protocol.ts#ToolResult: not-visible","location":{"file":"%s","line":1,"column":1},'
    + '"importer":{"owner":"collection-review/workspace/reviews/notes"},'
    + '"original":{"kind":"code","owner":"collection-review","file":"interfaces/protocol.ts","binding":"ToolResult"}}]}';
  await writeFile(executable, [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then echo "ramify 0.0.0 (the session tests\' stub)"; exit 0; fi',
    'if [ "$1" = "materialize" ]; then exit 0; fi',
    'if [ "$1" = "check" ] && [ "$2" = "--changed" ]; then',
    `  if grep -q FORBIDDEN "$3" 2>/dev/null; then printf '${finding}\\n' "$3"; exit 1; fi`,
    '  echo \'{"schemaVersion":"ramify.check/1","outcome":"checked","findings":[]}\'',
    '  exit 0',
    'fi',
    'echo \'{"schemaVersion":"ramify.cli/1","status":"unavailable","reason":"stub","exitCode":2}\'',
    'exit 2',
    '',
  ].join('\n'));
  await chmod(executable, 0o755);
  return new RamifyCli({ executable, timeoutMs: 30_000 });
}

interface Session {
  readonly result: SingleSessionResult;
  readonly agent: ReturnType<typeof createScriptedAgent>;
  readonly events: SessionProgress[];
}

async function session(root: string, steps: readonly ScriptStep[], extra: Partial<SingleSessionOptions> = {}): Promise<Session> {
  const agent = createScriptedAgent(steps);
  const events: SessionProgress[] = [];
  const result = await runSingleSession({
    projectRoot: root,
    module: notes,
    prompt: 'Raise the note limit to 500.',
    agent,
    ramify: await stubRamify(),
    refresh: readDeclaredTree,
    policy: testPolicy(root),
    onProgress: event => events.push(event),
    ...extra,
  });
  return { result, agent, events };
}

function finished(result: SingleSessionResult) {
  if (result.status !== 'finished') throw new Error(`the session did not start: ${result.reason}`);
  return result.summary;
}

async function outcomeOf(records: string): Promise<SessionOutcomeRecord> {
  return sessionOutcomeSchema.parse(JSON.parse(await readFile(join(records, 'outcome.json'), 'utf8')));
}

async function observationsOf(records: string): Promise<Observation[]> {
  return (await readFile(join(records, 'observations.jsonl'), 'utf8'))
    .split('\n').filter(Boolean).map(line => observationSchema.parse(JSON.parse(line)));
}

async function commitCount(root: string): Promise<number> {
  return Number((await git(root, 'rev-list', '--count', 'HEAD')).trim());
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

describe('a single engineer session', () => {
  test('a completed change is in the tree, recorded as submitted, answered with what follows, and not committed', async () => {
    const root = await project();

    const { result, agent, events } = await session(root, [
      edit(notesSource, 'noteLimit = 400', 'noteLimit = 500'),
      { kind: 'submit', input: completionProposed('The limit is 500.') },
    ]);

    const summary = finished(result);
    expect(result.exitStatus).toBe(0);
    expect(summary.ended).toBe('submitted');
    expect(summary.submission).toMatchObject({ kind: 'completion-proposed' });
    expect(summary.gate).toBeNull();
    expect(summary.changed).toEqual([notesSource]);
    expect(summary.outsideScope).toEqual([]);
    expect(await readFile(join(root, notesSource), 'utf8')).toBe('export const noteLimit = 500;\n');
    expect((await outcomeOf(summary.records)).ended).toBe('submitted');
    expect(await commitCount(root)).toBe(1);

    // Decision 7: the answer names what follows, and never that the work is complete.
    const answer = agent.sessions[0]!.results.at(-1)!.text;
    expect(answer).toBe(sessionAcceptance('completion-proposed', false));
    expect(answer).toContain('a person to review');
    expect(answer).not.toContain('complete');

    // The stream: the start, the tool call, the submission and its answer, the summary.
    expect(events.map(event => event.type)).toEqual(['started', 'tool-call', 'submission', 'summary']);
    expect(events[2]).toMatchObject({ type: 'submission', accepted: true, answer });
    // The prompt is the goal; what the person did not give reads "not stated".
    const started = events[0] as Extract<SessionProgress, { type: 'started' }>;
    expect(started.message).toContain('## Goal\n\nRaise the note limit to 500.');
    expect(started.message).toContain('## Approach the architect asked for\n\nNot stated.');
    expect(started.message).toContain('## Completion evidence\n\nNot stated.');
    expect(agent.sessions[0]!.spec.prompt).toBe(started.message);
  }, 120_000);

  test('a write outside the module is refused by the guard, writes nothing, and is observed; an extra write path is allowed', async () => {
    const root = await project();
    const outside = 'subs/workspace/subs/reviews/src/stray.ts';

    const { result, agent, events } = await session(root, [
      write(outside, 'export const stray = 1;\n'),
      write('docs/notes.md', '# Notes\n'),
      { kind: 'submit', input: unsuitableScope('The limit lives outside this module.') },
    ], { write: ['docs/notes.md'] });

    const summary = finished(result);
    expect(await exists(join(root, outside))).toBe(false);
    expect(await readFile(join(root, 'docs/notes.md'), 'utf8')).toBe('# Notes\n');
    expect(agent.sessions[0]!.denied).toHaveLength(1);

    const guards = (await observationsOf(summary.records)).filter(line => line.type === 'guard');
    expect(guards.map(line => (line.type === 'guard' ? [line.data.requested, line.data.verdict] : null))).toEqual([
      [outside, 'blocked-scope'],
      ['docs/notes.md', 'allowed'],
    ]);
    const refusal = events.find(event => event.type === 'harness-text' && event.kind === 'refusal');
    expect(refusal).toMatchObject({ tool: 'write' });
    expect(agent.sessions[0]!.results[0]!.text).toBe((refusal as Extract<SessionProgress, { type: 'harness-text' }>).text);
  }, 120_000);

  test('a module violation is told in the edit\'s result, refuses completion while it stands, and completion is accepted after the fix', async () => {
    const root = await project();

    const { result, agent, events } = await session(root, [
      edit(notesSource, 'noteLimit = 400;', 'noteLimit = 500; // FORBIDDEN'),
      { kind: 'submit', input: completionProposed('The limit is 500.') },
      edit(notesSource, ' // FORBIDDEN', ''),
      { kind: 'submit', input: completionProposed('The limit is 500, with the violation removed.') },
    ]);

    const summary = finished(result);
    const record = agent.sessions[0]!;
    expect(record.results[0]!.text).toContain('RAMIFY MODULE VIOLATION');
    expect(record.results[0]!.text).toContain(`${notesSource}:1 imports \`ToolResult\``);
    expect(record.verdicts[0]).toMatchObject({ accepted: false });
    expect(JSON.stringify(record.verdicts[0])).toContain('module violation');
    expect(record.verdicts[1]).toMatchObject({ accepted: true });
    expect(summary.ended).toBe('submitted');
    expect(summary.rejectedSubmissions).toBe(1);
    expect(summary.standingViolations).toEqual([]);
    expect(result.exitStatus).toBe(0);

    const appended = events.filter(event => event.type === 'harness-text' && event.kind === 'appended');
    expect(appended).toHaveLength(1);
    expect(events.filter(event => event.type === 'submission').map(event => (event.type === 'submission' ? event.accepted : null))).toEqual([false, true]);
  }, 120_000);

  test('unsuitable and contract-needed are recorded and answered, and no further session starts', async () => {
    const root = await project();
    const contractNeeded = {
      kind: 'contract-needed',
      need: {
        capability: 'note-limit',
        useCases: ['a note longer than the limit is refused'],
        inputs: ['the note text'],
        outputs: ['whether the note is acceptable'],
        sideEffects: [],
        constraints: [],
        existingEvidence: [],
      },
      summary: 'The limit is owned by another module.',
    };

    for (const input of [unsuitableScope('The limit lives elsewhere.'), contractNeeded]) {
      const { result, agent } = await session(root, [{ kind: 'submit', input }]);
      const summary = finished(result);
      expect(result.exitStatus).toBe(0);
      expect(summary.submission?.kind).toBe(input.kind);
      expect((await outcomeOf(summary.records)).submission?.kind).toBe(input.kind);
      expect(agent.sessions).toHaveLength(1);
      const answer = agent.sessions[0]!.results.at(-1)!.text;
      expect(answer).toBe(sessionAcceptance(input.kind as 'unsuitable', false));
      expect(answer).toContain('Nothing follows it in this session');
      expect(answer).not.toContain('complete');
    }
    expect(await commitCount(root)).toBe(1);
  }, 120_000);

  test('an unknown module is refused before the agent starts, as a session that could not start, with the lock released', async () => {
    const root = await project();

    const { result, agent } = await session(root, [write(notesSource, 'nothing\n')], { module: 'collection-review/no-such-module' });

    expect(result).toMatchObject({ status: 'not-started', exitStatus: 2, records: null });
    expect(result.status === 'not-started' ? result.reason : '').toContain('"collection-review/no-such-module" is not a module');
    expect(agent.sessions).toHaveLength(0);
    expect(await exists(join(root, lockPath))).toBe(false);
    expect(await exists(join(root, sessionsDirectory))).toBe(false);
  }, 120_000);

  test('a held project lock is refused before the agent starts, and the lock is left untouched', async () => {
    const root = await project();
    const lock = await acquireProjectLock(root);
    cleanups.push(() => lock.release());
    const before = await readFile(join(root, lockPath), 'utf8');

    const { result, agent } = await session(root, [write(notesSource, 'nothing\n')]);

    expect(result).toMatchObject({ status: 'not-started', exitStatus: 2 });
    expect(result.status === 'not-started' ? result.reason : '').toContain('holds the project lock');
    expect(agent.sessions).toHaveLength(0);
    expect(await readFile(join(root, lockPath), 'utf8')).toBe(before);
    expect(await lock.held()).toBe(true);
  }, 120_000);
});

describe('the gate option', () => {
  test('passing work: the iteration checkpoint passes, its attempt is under gate/, and nothing is committed', async () => {
    const root = await project();

    const { result, events } = await session(root, [
      edit(notesSource, 'noteLimit = 400', 'noteLimit = 500'),
      { kind: 'submit', input: completionProposed('The limit is 500.') },
    ], { gate: true });

    const summary = finished(result);
    expect(summary.gate).toMatchObject({ ran: true, verdict: 'passed' });
    expect(result.exitStatus).toBe(0);
    const attempt = gateAttemptSchema.parse(JSON.parse(await readFile(join(summary.records, 'gate', 'attempt.json'), 'utf8')));
    expect(attempt.checkpoint).toBe('iteration');
    expect(attempt.commit).toBeNull();
    expect(attempt.commands.find(command => command.kind === 'tests')?.selection?.resolved).toEqual([`${notesDirectory}/src/tests/notes.test.ts`]);
    expect((await outcomeOf(summary.records)).gate).toEqual({ attempt: join('gate', 'attempt.json'), verdict: 'passed', cause: attempt.cause });
    expect(await commitCount(root)).toBe(1);
    expect(events.map(event => event.type).slice(-3)).toEqual(['gate-started', 'gate', 'summary']);
    expect(events.find(event => event.type === 'submission')).toMatchObject({ answer: sessionAcceptance('completion-proposed', true) });
  }, 120_000);

  test('failing work: the checkpoint fails, its attempt is under gate/, the exit status is 1, and nothing is committed', async () => {
    const root = await project();

    const { result } = await session(root, [
      { kind: 'submit', input: completionProposed('The limit is already right.') },
    ], { gate: true });

    const summary = finished(result);
    expect(summary.ended).toBe('submitted');
    expect(summary.gate).toMatchObject({ ran: true, verdict: 'failed' });
    expect(result.exitStatus).toBe(1);
    const attempt = gateAttemptSchema.parse(JSON.parse(await readFile(join(summary.records, 'gate', 'attempt.json'), 'utf8')));
    expect(attempt.verdict).toBe('failed');
    expect(attempt.commit).toBeNull();
    expect(await commitCount(root)).toBe(1);
  }, 120_000);
});

describe('the session\'s records', () => {
  test('every record exists and validates against its schema, and git sees nothing under plans/.harness/', async () => {
    const root = await project();

    const { result } = await session(root, [
      shell('echo checking'),
      edit(notesSource, 'noteLimit = 400', 'noteLimit = 500'),
      { kind: 'submit', input: completionProposed('The limit is 500.') },
    ], { gate: true });

    const summary = finished(result);
    const records = summary.records;
    expect(records.startsWith(join(root, sessionsDirectory))).toBe(true);

    const record = sessionRecordSchema.parse(JSON.parse(await readFile(join(records, 'session.json'), 'utf8')));
    expect(record).toMatchObject({ id: summary.session, module: notes, directory: notesDirectory, prompt: 'Raise the note limit to 500.', gate: true });
    expect(record.scope.roots).toEqual([`${notesDirectory}/src`]);

    const observations = await observationsOf(records);
    expect(observations.map(line => line.type)).toEqual(expect.arrayContaining(['activity', 'guard', 'mutation', 'hook-check', 'coverage-gap']));
    sessionSubmissionSchema.parse(JSON.parse(await readFile(join(records, 'submission.json'), 'utf8')));
    const outcome = await outcomeOf(records);
    expect(outcome).toMatchObject({ session: summary.session, ended: 'submitted', submission: { kind: 'completion-proposed' } });
    expect(outcome.settled.confirmed).toBe(true);
    gateAttemptSchema.parse(JSON.parse(await readFile(join(records, 'gate', 'attempt.json'), 'utf8')));

    expect(await readdir(join(records, 'shell'))).toEqual(['001.log']);
    const hooks = await readdir(join(records, 'hooks'));
    expect(hooks).toEqual(['001.json', '002.json']);
    for (const hook of hooks) JSON.parse(await readFile(join(records, 'hooks', hook), 'utf8'));
    expect((await stat(join(records, 'session'))).isDirectory()).toBe(true);

    const status = await git(root, 'status', '--porcelain', '--untracked-files=all');
    expect(status.split('\n').filter(line => line.includes('plans/.harness'))).toEqual([]);
    expect(status.trim()).toBe(`M ${notesSource}`);
  }, 120_000);
});
