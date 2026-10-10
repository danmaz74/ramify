import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import type { CommandRunner } from '../../subs/evidence/src/run-command.js';
import { gateAttemptSchema, invocationSchema, manualRunRecordSchema } from '../run/records.js';
import { engineerSubmissionSchema } from '../work/engineer.js';
import { sessionAcceptance, type SessionProgress } from '../sessions/single.js';
import { acquireProjectLock, lockPath } from '../store/lock.js';
import type { AgentPort } from '../../subs/agent/src/interfaces/port.js';
import type { TranscriptEntry } from '../interfaces/protocol/transcripts.js';
import { readTranscript } from '../transcripts/writer.js';
import { blobsIn } from './helpers/transcripts.js';
import { completionProposed, edit, read, shell, unsuitableScope, write } from './helpers/iterations.js';

import { commandResult } from './helpers/command-result.js';
import { testPolicy } from './helpers/runs.js';

// This file includes the physical session-store persistence witness.
vi.unmock('../run/session-store.js');

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));
import { cleanups, notes, notesDirectory, notesSource, project, session, checked, passingGate, finished, outcomeOf, observationsOf, exists, recordsOf, summaryOf } from './single-session-fixture.js';

/** Where every session's manual run is, beneath the project. */
const sessionRuns = join('plans', 'sessions', '.harness', 'jobs');
/** Where an earlier session command wrote its own records, which nothing writes any more. */
const legacySessions = join('plans', '.harness', 'sessions');

describe('a single engineer session', () => {
  test('the prepared standalone packet preserves a multiline literal goal and fenced consecutive headings byte for byte', async () => {
    const root = await project();
    const prompt = 'Keep every byte.\n\nEmbedded prose: Keep every byte.\n\n````text\n# comment\n# second\n## nested\n\nKeep every byte.\n```\n# still literal\n````\n\n~~~text\n# tilde\n# another\nKeep every byte.\n~~~';
    const { result, events, agent } = await session(root, [{ kind: 'submit', input: unsuitableScope('Only capture the current packet.') }], { prompt });
    expect(finished(result).ended).toBe('submitted');
    const packet = events.find(event => event.type === 'started')!;
    if (packet.type !== 'started') throw new Error('missing packet');
    expect(packet.message).toContain(`# Goal\n${prompt}`);
    expect(packet.message.split(prompt)).toHaveLength(2);
    expect(agent.sessions[0]!.spec.prompt).toBe(packet.message);
    const paths = await recordsOf(finished(result).records);
    const recorded = invocationSchema.parse(JSON.parse(await readFile(paths.record, 'utf8')));
    expect(recorded.prompt.manifest).toMatchObject({ schema: 'ramify-agent.delivered-inputs/2', currentMessage: { bytes: Buffer.byteLength(packet.message) } });
    expect(recorded.sessionOperation).toMatchObject({ runId: finished(result).session, operationId: paths.invocation, turn: 1, sourcePoint: { turn: 0, kind: 'checkpoint' } });
    expect(packet.message).toContain('## Approach the architect asked for\n\nNot stated.');
    expect(packet.message).toContain(`${root}/${notesDirectory}/src/tests/`);
    expect(packet.message).toContain(`${root}/${notesDirectory}/module.ramify`);
    expect(packet.message).not.toContain('npx vitest run <path/to/file.test.ts>');
  });

  test('an unconfirmed operation barrier retains project ownership and scratch and refuses the gate', async () => {
    const root = await project();
    const scratch = join(root, notesDirectory, 'src/tmp/unfinished.txt');
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
    let settled!: Promise<unknown>;
    const scripted = createScriptedAgent([{ kind: 'submit', input: unsuitableScope('Controlled unfinished operation.') }]);
    const agent: AgentPort = { ...scripted, bindSessionStore(store) {
      const operations = scripted.bindSessionStore(store);
      return { ...operations, async continue(value) {
        await mkdir(join(root, notesDirectory, 'src/tmp'), { recursive: true });
        await writeFile(scratch, 'Still owned by the operation.');
        const handle = await operations.continue(value);
        settled = pending.then(() => handle.settled());
        return { ...handle, settled: () => settled as ReturnType<typeof handle.settled> };
      } };
    } };
    const policy = testPolicy(root);
    try {
      const { result } = await session(root, [], { agent, policy: { ...policy, limits: { ...policy.limits, stopSettleMs: 50, writerSettleMs: 50 } } });
      const summary = finished(result);
      expect((await outcomeOf(summary.records)).settled.confirmed).toBe(false);
      expect(result.exitStatus).toBe(1);
      expect(summary.gate).toBeNull();
      const guarded = await session(root, [], { gate: true }, { starts: false });
      expect(guarded.result).toMatchObject({ status: 'not-started', reason: expect.stringContaining('holds the project lock') });
      expect(await exists(scratch)).toBe(true); expect(await exists(join(root, lockPath))).toBe(true);
      await expect(acquireProjectLock(root)).rejects.toThrow('holds the project lock');
    } finally { release(); await settled; }
  }, 120_000);

  test('relative reads, writes, and shell start in module src while observations remain project-relative', async () => {
    const root = await project();
    const cwd = join(root, notesDirectory, 'src');
    const sibling = 'subs/workspace/subs/reviews/src/stray.ts';
    const commandExecution: CommandRunner = async request => {
      expect(request.cwd).toBe(cwd);
      return commandResult(request, { stdout: 'module shell\n' });
    };
    const { result, agent } = await session(root, [
      read('notes.ts'),
      edit('notes.ts', '400', '500'),
      write('new.ts', 'export const added = true;\n'),
      write(relative(cwd, join(root, sibling)), 'export const stray = true;\n'),
      shell('pwd'),
      { kind: 'submit', input: unsuitableScope('The sibling is outside this assignment.') },
    ], {}, {
      changed: [notesSource, `${notesDirectory}/src/new.ts`],
      ramify: [checked('changed'), checked('changed')],
      commandExecution, command: 'pwd',
    });
    const summary = finished(result);
    expect(agent.sessions[0]!.spec.scope.workingDirectory).toBe(cwd);
    expect(await readFile(join(root, notesSource), 'utf8')).toContain('500');
    expect(await readFile(join(cwd, 'new.ts'), 'utf8')).toContain('added');
    expect(await exists(join(root, sibling))).toBe(false);
    const observations = await observationsOf(summary.records);
    const activities = observations.filter(line => line.type === 'activity').map(line => line.data.activity);
    const { invocation } = await recordsOf(summary.records);
    expect(activities).toEqual(expect.arrayContaining([{ kind: 'read', callId: `${invocation}:call-1`, path: notesSource }]));
    const guards = observations.filter(line => line.type === 'guard');
    expect(guards.map(line => line.data.resolved)).toEqual([
      join(root, notesSource), join(cwd, 'new.ts'), join(root, sibling),
    ]);
    const mutations = observations.filter(line => line.type === 'mutation');
    expect(mutations[0]?.data.paths).toEqual([notesSource]);
    expect(mutations[1]?.data.paths).toEqual([`${notesDirectory}/src/new.ts`]);
    const hooks = observations.filter(line => line.type === 'hook-check');
    expect(hooks[0]?.data.paths).toEqual([notesSource]);
    expect(hooks[1]?.data.paths).toEqual([`${notesDirectory}/src/new.ts`]);
  }, 120_000);

  test('a completed change is in the tree, recorded as submitted, answered with what follows, and not committed', async () => {
    const root = await project();

    const { result, agent, events, git } = await session(root, [
      edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'),
      { kind: 'submit', input: completionProposed('The limit is 500.') },
    ], {}, { changed: [notesSource], ramify: [checked('changed'), checked('complete')] });

    const summary = finished(result);
    expect(result.exitStatus).toBe(0);
    expect(summary.ended).toBe('submitted');
    expect(summary.submission).toMatchObject({ kind: 'completion-proposed' });
    expect(summary.gate).toBeNull();
    expect(summary.changed).toEqual([notesSource]);
    expect(summary.outsideScope).toEqual([]);
    expect(await readFile(join(root, notesSource), 'utf8')).toBe('export const noteLimit = 500;\n');
    expect((await outcomeOf(summary.records)).ended).toBe('submitted');
    expect(git.commitAccepted).not.toHaveBeenCalled();

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
    expect(started.message).toContain('# Goal\nRaise the note limit to 500.');
    expect(started.message.split('Raise the note limit to 500.')).toHaveLength(2);
    expect(started.message).toContain('## Approach the architect asked for\n\nNot stated.');
    expect(started.message).toContain('# Requirements\n- Not stated.');
    expect(started.message).not.toContain('## Completion evidence');
    expect(agent.sessions[0]!.spec.prompt).toBe(started.message);
  }, 120_000);

  test('a write outside the module is refused by the guard, writes nothing, and is observed; an extra write path is allowed', async () => {
    const root = await project();
    const outside = 'subs/workspace/subs/reviews/src/stray.ts';

    const { result, agent, events } = await session(root, [
      write(join(root, outside), 'export const stray = 1;\n'),
      write(join(root, 'docs/notes.md'), '# Notes\n'),
      { kind: 'submit', input: unsuitableScope('The limit lives outside this module.') },
    ], { write: ['docs/notes.md'] }, { changed: ['docs/notes.md'], ramify: [checked('changed')] });

    const summary = finished(result);
    expect(await exists(join(root, outside))).toBe(false);
    expect(await readFile(join(root, 'docs/notes.md'), 'utf8')).toBe('# Notes\n');
    expect(agent.sessions[0]!.results[0]!.isError).toBe(true);

    const guards = (await observationsOf(summary.records)).filter(line => line.type === 'guard');
    expect(guards.map(line => (line.type === 'guard' ? [line.data.requested, line.data.verdict] : null))).toEqual([
      [join(root, outside), 'blocked-scope'],
      [join(root, 'docs/notes.md'), 'allowed'],
    ]);
    const refusal = events.find(event => event.type === 'harness-text' && event.kind === 'refusal');
    expect(refusal).toMatchObject({ tool: 'write' });
    expect(agent.sessions[0]!.results[0]!.text).toBe((refusal as Extract<SessionProgress, { type: 'harness-text' }>).text);
  }, 120_000);

  test('a module violation is told in the edit\'s result, refuses completion while it stands, and completion is accepted after the fix', async () => {
    const root = await project();

    const { result, agent, events } = await session(root, [
      edit('notes.ts', 'noteLimit = 400;', 'noteLimit = 500; // FORBIDDEN'),
      { kind: 'submit', input: completionProposed('The limit is 500.') },
      edit('notes.ts', ' // FORBIDDEN', ''),
      { kind: 'submit', input: completionProposed('The limit is 500, with the violation removed.') },
    ], {}, { changed: [notesSource], ramify: [
      { form: 'changed', outcome: 'findings' },
      { form: 'complete', outcome: 'findings' },
      checked('changed'),
      checked('complete'),
    ] });

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

    // Two appended texts: the violation, and the one line that says the
    // edit removing it cleared what was reported.
    const appended = events.filter(event => event.type === 'harness-text' && event.kind === 'appended');
    expect(appended).toHaveLength(2);
    expect((appended[1] as Extract<SessionProgress, { type: 'harness-text' }>).text)
      .toBe(`Cleared: the Ramify module violation reported earlier (${notesSource}:1) no longer stands.`);
    expect(events.filter(event => event.type === 'submission').map(event => (event.type === 'submission' ? event.accepted : null))).toEqual([false, true]);
  }, 120_000);

  test('unsuitable and capability-needed are recorded and answered, and no further session starts', async () => {
    const root = await project();
    const capabilityNeeded = {
      kind: 'capability-needed',
      request: {
        need: 'Refuse a note longer than the provider limit.',
        usage: [{ path: notesSource, use: 'The note validator calls the limit provider.', prospective: false }],
        constraints: [],
        knownInterface: { kind: 'none-known' },
        examples: [{ title: 'Long note', code: 'expect(validateNote(longNote)).toBe(false)', designation: 'pseudocode' }],
      },
      summary: 'The limit is owned by another module.',
    };

    for (const input of [unsuitableScope('The limit lives elsewhere.'), capabilityNeeded]) {
      const { result, agent, git } = await session(root, [{ kind: 'submit', input }]);
      const summary = finished(result);
      expect(result.exitStatus).toBe(0);
      expect(summary.submission?.kind).toBe(input.kind);
      expect((await outcomeOf(summary.records)).submission).not.toBeNull();
      expect(JSON.parse(await readFile((await recordsOf(summary.records)).submission, 'utf8'))).toMatchObject({ kind: input.kind });
      expect(agent.sessions).toHaveLength(1);
      const answer = agent.sessions[0]!.results.at(-1)!.text;
      expect(answer).toBe(sessionAcceptance(input.kind as 'unsuitable', false));
      expect(answer).toContain('Nothing follows it in this session');
      expect(answer).not.toContain('complete');
      expect(git.commitAccepted).not.toHaveBeenCalled();
    }
  }, 120_000);

  test('an unknown module is refused before the agent starts, as a session that could not start, with the lock released', async () => {
    const root = await project();

    const { result, agent } = await session(
      root,
      [write(notesSource, 'nothing\n')],
      { module: 'collection-review/no-such-module' },
      { starts: false },
    );

    expect(result).toMatchObject({ status: 'not-started', exitStatus: 2, records: null });
    expect(result.status === 'not-started' ? result.reason : '').toContain('"collection-review/no-such-module" is not a module');
    expect(agent.sessions).toHaveLength(0);
    expect(await exists(join(root, lockPath))).toBe(false);
    expect(await exists(join(root, sessionRuns))).toBe(false);
    expect(await exists(join(root, legacySessions))).toBe(false);
  }, 120_000);

  test('a declared module with missing src is refused before the agent starts', async () => {
    const root = await project();
    await rm(join(root, notesDirectory, 'src'), { recursive: true });
    const { result, agent } = await session(root, [], {}, { starts: false, preparationChangedPaths: 1 });
    expect(result).toMatchObject({ status: 'not-started', exitStatus: 2 });
    expect(result.status === 'not-started' ? result.reason : '').toContain('has no src directory');
    expect(agent.sessions).toHaveLength(0);
  }, 120_000);

  test('a held project lock is refused before the agent starts, and the lock is left untouched', async () => {
    const root = await project();
    const lock = await acquireProjectLock(root);
    cleanups.push(() => lock.release());
    const before = await readFile(join(root, lockPath), 'utf8');

    const { result, agent } = await session(root, [write(notesSource, 'nothing\n')], {}, { starts: false });

    expect(result).toMatchObject({ status: 'not-started', exitStatus: 2 });
    expect(result.status === 'not-started' ? result.reason : '').toContain('holds the project lock');
    expect(agent.sessions).toHaveLength(0);
    expect(await readFile(join(root, lockPath), 'utf8')).toBe(before);
    expect(await lock.held()).toBe(true);
  }, 120_000);
});

describe('the gate option', () => {

  test('passing work: the iteration checkpoint passes, its attempt is the invocation\'s diagnosis, and nothing is committed', async () => {
    const root = await project();

    const { result, events, git } = await session(root, [
      edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'),
      { kind: 'submit', input: completionProposed('The limit is 500.') },
    ], { gate: true }, {
      changed: [notesSource],
      ramify: [checked('changed'), checked('complete')],
      gate: passingGate,
    });

    const summary = finished(result);
    expect(summary.gate).toMatchObject({ ran: true, verdict: 'passed' });
    expect(result.exitStatus).toBe(0);
    const attempt = gateAttemptSchema.parse(JSON.parse(await readFile((await recordsOf(summary.records)).diagnosis, 'utf8')));
    expect(attempt.checkpoint).toBe('iteration');
    expect(attempt.commit).toBeNull();
    // A standalone diagnosis runs the project's type check and Ramify check in
    // place; it selects and runs no test, which a committing gate's audit owns.
    expect(attempt.commands.map(command => command.kind)).toEqual(['type-check', 'ramify-check']);
    const { invocation } = await recordsOf(summary.records);
    expect((await summaryOf(summary.records)).gate).toEqual({ attempt: join('invocations', invocation, 'diagnosis', 'attempt.json'), verdict: 'passed', cause: attempt.cause });
    expect(git.commitAccepted).not.toHaveBeenCalled();
    expect(events.map(event => event.type).slice(-3)).toEqual(['gate-started', 'gate', 'summary']);
    expect(events.find(event => event.type === 'submission')).toMatchObject({ answer: sessionAcceptance('completion-proposed', true) });
  }, 120_000);

  test('failing work: the checkpoint fails, its attempt is the invocation\'s diagnosis, the exit status is 1, and nothing is committed', async () => {
    const root = await project();

    const { result, git } = await session(root, [
      { kind: 'submit', input: completionProposed('The limit is already right.') },
    ], { gate: true }, {
      ramify: [checked('complete')],
      gate: [{ outcome: { kind: 'completed', exitCode: 1 } }, {}],
    });

    const summary = finished(result);
    expect(summary.ended).toBe('submitted');
    expect(summary.gate).toMatchObject({ ran: true, verdict: 'failed' });
    expect(result.exitStatus).toBe(1);
    const attempt = gateAttemptSchema.parse(JSON.parse(await readFile((await recordsOf(summary.records)).diagnosis, 'utf8')));
    expect(attempt.verdict).toBe('failed');
    expect(attempt.commit).toBeNull();
    expect(git.commitAccepted).not.toHaveBeenCalled();
  }, 120_000);
});

describe('the session\'s records', () => {
  test('every record is a manual run\'s in a run\'s own layout and validates against its schema', async () => {
    const root = await project();

    const commandExecution: CommandRunner = request => {
      expect(request.argv).toEqual(['bash', '-c', 'echo checking']);
      expect(request.cwd).toBe(join(root, notesDirectory, 'src'));
      return commandResult(request, { stdout: 'checking\n' });
    };
    const { result, git } = await session(root, [
      shell('echo checking'),
      edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'),
      { kind: 'submit', input: completionProposed('The limit is 500.') },
    ], { gate: true }, {
      changed: [notesSource],
      ramify: [checked('changed'), checked('complete')],
      gate: passingGate,
      commandExecution, command: 'echo checking',
    });

    const summary = finished(result);
    const records = summary.records;
    // A manual run in a run's own layout; nothing is written under plans/.harness/sessions/.
    expect(records).toBe(join(root, sessionRuns, summary.session));
    expect(await exists(join(root, legacySessions))).toBe(false);
    expect(manualRunRecordSchema.parse(JSON.parse(await readFile(join(records, 'job.json'), 'utf8'))))
      .toMatchObject({ kind: 'manual', planId: 'sessions', jobId: summary.session, origin: 'session', branch: null, base: 'single-session-base' });
    const paths = await recordsOf(records);

    const record = invocationSchema.parse(JSON.parse(await readFile(paths.record, 'utf8')));
    expect(record).toMatchObject({ id: paths.invocation, role: 'engineer', base: 'single-session-base', startingTree: { dirty: false, changed: [] } });
    // The session's start records its executor and the model it was asked for: none, for the fake.
    expect((await readTranscript(paths.transcript)).entries[0]).toMatchObject({ type: 'started', executor: 'scripted', model: null });
    expect(await summaryOf(records)).toMatchObject({ schema: 'ramify-agent.session-summary/1', session: summary.session, module: notes, records });

    const observations = await observationsOf(records);
    expect(observations.map(line => line.type)).toEqual(expect.arrayContaining(['activity', 'guard', 'mutation', 'hook-check', 'coverage-gap']));
    const { schema, ...submitted } = JSON.parse(await readFile(paths.submission, 'utf8')) as Record<string, unknown>;
    expect(schema).toBe('ramify-agent.engineer-submission/1');
    engineerSubmissionSchema.parse(submitted);
    const outcome = await outcomeOf(records);
    expect(outcome).toMatchObject({ ended: 'submitted' });
    expect(outcome.settled.confirmed).toBe(true);
    gateAttemptSchema.parse(JSON.parse(await readFile(paths.diagnosis, 'utf8')));

    expect(await readdir(paths.shell)).toEqual(['001.log']);
    // The no-op shell reserves identity 1 without launching a check; the edit and independent completion use 2 and 3.
    const hooks = await readdir(paths.hooks);
    expect(hooks).toEqual(['002.json', '003.json']);
    for (const hook of hooks) JSON.parse(await readFile(join(paths.hooks, hook), 'utf8'));
    // Durable operations use the shared owned ledger every run uses.
    const store = join(root, 'plans', '.harness', 'session-operations', 'store');
    expect((await stat(store)).isDirectory()).toBe(true);
    expect((await stat(join(store, 'session-ledger.jsonl'))).size).toBeGreaterThan(0);
    expect((await stat(paths.transcript)).isFile()).toBe(true);

    expect(summary.changed.filter(path => path.includes('plans/.harness'))).toEqual([]);
    expect(summary.changed).toEqual([notesSource]);
    expect(git.commitAccepted).not.toHaveBeenCalled();
  }, 120_000);

  test('its transcript is a run\'s: the start before the model call, the harness\'s decisions, and the shell\'s log by reference', async () => {
    const root = await project();
    const outside = 'subs/workspace/subs/reviews/src/stray.ts';
    const commandExecution: CommandRunner = request => commandResult(request, { stdout: 'checking\n' });
    const scripted = createScriptedAgent([
      shell('echo checking'),
      write(join(root, outside), 'export const stray = 1;\n'),
      edit('notes.ts', 'noteLimit = 400', 'noteLimit = 500'),
      { kind: 'submit', input: completionProposed('The limit is 500.') },
    ]);
    // What the transcript held when the session was started.
    let atStart: TranscriptEntry[] | undefined;
    const agent: AgentPort = {
      name: scripted.name,
      support: scripted.support,
      bindSessionStore(store) {
        const operations = scripted.bindSessionStore(store);
        return { ...operations, async continue(input) {
          const [run] = await readdir(join(root, sessionRuns));
          const path = join(root, sessionRuns, run!, 'transcripts', 'ses-0001.jsonl');
          atStart = existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as TranscriptEntry) : [];
          return operations.continue(input);
        } };
      },
    };
    const { result } = await session(root, [], { agent }, {
      changed: [notesSource],
      ramify: [checked('changed'), checked('complete')],
      commandExecution, command: 'echo checking',
    });

    const summary = finished(result);
    expect(summary.ended).toBe('submitted');
    const paths = await recordsOf(summary.records);
    const id = paths.invocation;
    expect(atStart?.map(entry => entry.type)).toEqual(['started']);

    const read = await readTranscript(paths.transcript);
    expect([read.discardedPartial, read.unreadable]).toEqual([false, []]);
    const entries = read.entries;
    expect(entries.map(entry => entry.n)).toEqual(entries.map((_, index) => index + 1));
    // The manual run's one invocation.
    expect(entries.every(entry => entry.invocation === id)).toBe(true);
    expect(entries[0]).toMatchObject({
      type: 'started', role: 'engineer', work: {}, start: 'opened', requested: 'fresh', executor: 'scripted', model: null,
      continues: null, fork: null, systemPrompt: { stored: 'blob' },
    });
    expect(entries.slice(-2)).toEqual([
      expect.objectContaining({ type: 'ended', ended: 'submitted', interruption: null, error: null, actual: { mode: 'fresh', degradedReason: null } }),
      expect.objectContaining({ type: 'point', point: { session: paths.session, invocation: id } }),
    ]);
    const started = entries[0]!;
    if (started.type !== 'started' || started.systemPrompt.stored !== 'blob') throw new Error('Missing stored role prefix');
    const user = entries.find(entry => entry.type === 'message' && entry.role === 'user');
    if (!user || user.type !== 'message' || user.role !== 'user') throw new Error('Missing task message');
    const taskBody = user.blocks.find(block => block.type === 'text');
    if (!taskBody || taskBody.type !== 'text' || taskBody.body.stored !== 'blob') throw new Error('Missing stored framed task');
    expect(await blobsIn(paths.blobs)).toEqual(expect.arrayContaining([started.systemPrompt.hash, taskBody.body.hash]));
    for (const body of [started.systemPrompt, taskBody.body]) {
      const content = await readFile(join(summary.records, 'blobs', body.hash), 'utf8');
      expect(Buffer.byteLength(content)).toBe(body.bytes);
      expect(createHash('sha256').update(content).digest('hex')).toBe(body.hash);
    }
    expect(await readFile(join(summary.records, 'blobs', taskBody.body.hash), 'utf8')).toBe(scripted.sessions[0]!.spec.prompt);

    // The shell's result is what the agent saw, and names the complete output.
    const shellResult = entries.find(entry => entry.type === 'message' && entry.role === 'tool-result' && entry.tool === 'shell');
    expect(shellResult).toMatchObject({ output: { stored: 'file', path: join('invocations', id, 'shell', '001.log'), bytes: 9 } });

    const decisions = entries.flatMap(entry => (entry.type === 'harness' ? [entry.decision] : []));
    expect(decisions.map(decision => decision.kind)).toEqual([
      'post-write-check', 'guard-denied', 'post-write-check', 'post-write-check', 'submission-verdict',
    ]);
    // The complete content inventory proves this shell changed nothing; it launches no mutation check.
    expect(decisions[0]).toMatchObject({
      callId: `${id}:call-1`, atCompletion: false,
      checks: [],
    });
    expect(decisions[1]).toMatchObject({ callId: `${id}:call-2`, tool: 'write', verdict: 'blocked-scope', requested: join(root, outside) });
    expect(decisions[3]).toMatchObject({ atCompletion: true, callId: null, checks: [{ mode: 'complete' }] });
    expect(decisions[4]).toMatchObject({
      callId: `${id}:call-4`, verdict: 'accepted', text: { stored: 'inline', text: sessionAcceptance('completion-proposed', false) },
    });
    // The records hold none of it.
    const recordText = await readFile(paths.record, 'utf8') + await readFile(paths.outcome, 'utf8') + await readFile(paths.observations, 'utf8');
    expect(recordText).not.toContain(sessionAcceptance('completion-proposed', false));
  }, 120_000);
});
