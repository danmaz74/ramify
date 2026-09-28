import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { startPi, until, validMap, workspace } from './helpers/session.js';
import { call, text } from './helpers/scripted-provider.js';

/*
 * Session modes and appended context through the real pi adapter, on the
 * offline scripted provider: a continue resumes with its history, a fork
 * starts from a named point and leaves its parent alone, and a brief is
 * appended without a model call.
 */

beforeAll(() => { process.env.PI_OFFLINE = '1'; });
const hadPiDirectory = existsSync(join(homedir(), '.pi'));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe('session modes', () => {
  test('a fresh session reports its mode and names a point at once', async () => {
    const harness = await startPi(cleanups, [call('submit_implementation_map', validMap)]);
    expect(harness.session.start).toEqual({ mode: 'fresh' });
    // The ref names a session file and an entry within it, before anything ran.
    expect(harness.session.ref).toContain('.jsonl#');
    await harness.session.outcome;
    expect(harness.session.ref).toMatch(/\.jsonl#.+/);
  });

  test('a continue resumes the session the ref names, with its history', async () => {
    const places = await workspace(cleanups);
    const first = await startPi(cleanups, [text('reply ALPHA')], { reuse: places });
    await first.session.outcome;
    const ref = first.session.ref;

    const second = await startPi(cleanups, [text('reply BETA')], { reuse: places, session: { mode: 'continue', ref } });
    expect(second.session.start).toEqual({ mode: 'continue' });
    await second.session.outcome;
    // The resumed request carries the first session's turn.
    expect(second.requestText(0)).toContain('ALPHA');
    // And it wrote into the same session file, not a new one.
    expect(readdirSync(places.sessionDirectory)).toHaveLength(1);
  });

  test('a retained engineer session replaces its equipment on read-only consultation', async () => {
    const places = await workspace(cleanups);
    const first = await startPi(cleanups, [call('submit_implementation_map', validMap)], {
      reuse: places, builtinTools: ['read', 'grep', 'ls', 'edit', 'write'],
    });
    await first.session.outcome;
    expect(first.toolNames(0)).toContain('write');

    const consultation = await startPi(cleanups, [call('read', { path: 'module.ramify' }),
      call('submit_implementation_map', validMap)], {
      reuse: places, session: { mode: 'continue', ref: first.session.ref },
      builtinTools: ['read', 'grep', 'ls'],
    });
    expect(consultation.session.start).toEqual({ mode: 'continue' });
    await consultation.session.outcome;
    expect(consultation.toolNames(0)).toEqual(['read', 'grep', 'ls', 'submit_implementation_map']);
    expect(consultation.toolNames(0)).not.toContain('write');
    expect(consultation.toolNames(0)).not.toContain('edit');

    const experiment = await startPi(cleanups, [call('submit_implementation_map', validMap)], {
      reuse: places, session: { mode: 'continue', ref: consultation.session.ref },
      builtinTools: ['read', 'grep', 'ls', 'edit', 'write'],
    });
    expect(experiment.session.start).toEqual({ mode: 'continue' });
    await experiment.session.outcome;
    expect(experiment.toolNames(0)).toContain('write');
  });

  test('a fork starts from the point and does not carry the parent\'s later entries', async () => {
    const places = await workspace(cleanups);
    const parent = await startPi(cleanups, [call('ls', { path: '.' }, 'c-1'), text('reply ALPHA')], { reuse: places });
    await parent.session.outcome;
    const point = parent.session.ref;
    const parentFile = point.slice(0, point.lastIndexOf('#'));
    const parentBytes = readFileSync(parentFile, 'utf8');

    // The parent runs on, past the point the fork was taken at.
    const later = await startPi(cleanups, [text('reply BETA')], { reuse: places, session: { mode: 'continue', ref: point } });
    await later.session.outcome;

    const fork = await startPi(cleanups, [text('reply from the fork')], { reuse: places, session: { mode: 'fork', from: point } });
    expect(fork.session.start).toEqual({ mode: 'fork' });
    await fork.session.outcome;
    const sent = fork.requestText(0);
    expect(sent).toContain('ALPHA');
    expect(sent).not.toContain('BETA');
    // The fork is a file of its own; the parent's bytes up to the fork point are still there.
    expect(fork.session.ref.slice(0, fork.session.ref.lastIndexOf('#'))).not.toBe(parentFile);
    expect(readFileSync(parentFile, 'utf8').startsWith(parentBytes)).toBe(true);
  });

  test('a mode that could not be honored degrades to fresh and says why', async () => {
    const forked = await startPi(cleanups, [text('hello')], { session: { mode: 'fork', from: '/nowhere/missing.jsonl#abc' } });
    expect(forked.session.start.mode).toBe('fresh');
    expect(forked.session.start.degradedReason).toContain('/nowhere/missing.jsonl#abc');

    const resumed = await startPi(cleanups, [text('hello')], { session: { mode: 'continue', ref: '/nowhere/missing.jsonl#' } });
    expect(resumed.session.start.mode).toBe('fresh');
    expect(resumed.session.start.degradedReason).toContain('no longer exists');

    // A fork with no entry named cannot be a fork: pi branches at an entry.
    const unpointed = await startPi(cleanups, [text('hello')], { session: { mode: 'fork', from: '/nowhere/missing.jsonl#' } });
    expect(unpointed.session.start.mode).toBe('fresh');
  });
});

describe('appendContext', () => {
  test('appends to a session this adapter holds, without a model call, and the next request carries it', async () => {
    const harness = await startPi(cleanups, [call('ls', { path: '.' }, 'c-1'), text('done')]);
    await harness.session.outcome;
    // The session is disposed, so the append goes through the file.
    const appended = await harness.agent.appendContext(harness.session.ref, 'decision-1', 'BRIEF: the gate passed on iteration two.');
    expect(appended).toMatchObject({ outcome: 'appended' });
    expect(harness.scripted.requests).toHaveLength(2);

    const resumed = await startPi(cleanups, [text('acknowledged')], {
      reuse: { workingDirectory: harness.workingDirectory, sessionDirectory: harness.sessionDirectory },
      session: { mode: 'continue', ref: 'ref' in appended ? appended.ref : harness.session.ref },
    });
    await resumed.session.outcome;
    expect(resumed.requestText(0)).toContain('BRIEF: the gate passed on iteration two.');
  });

  // A session this adapter still holds takes the live route. The port gives a
  // session one prompt, so that session's own next model input cannot be
  // observed here; probe 4 of the spike verified that route at the SDK level.
  test('appends through a session this adapter is still holding, without a model call', async () => {
    const harness = await startPi(cleanups, [call('ls', { path: '.' }, 'c-1'), { kind: 'hold' }]);
    await until(() => harness.scripted.requests.length === 2);
    const before = harness.scripted.requests.length;
    const appended = await harness.agent.appendContext(harness.session.ref, 'decision-2', 'BRIEF-LIVE: the contract was delivered.');
    expect(appended).toMatchObject({ outcome: 'appended' });
    expect(harness.scripted.requests).toHaveLength(before);
    await harness.session.stop();

    // The live route wrote the entry, so a session continuing the file carries it.
    const resumed = await startPi(cleanups, [text('acknowledged')], {
      reuse: { workingDirectory: harness.workingDirectory, sessionDirectory: harness.sessionDirectory },
      session: { mode: 'continue', ref: harness.session.ref },
    });
    await resumed.session.outcome;
    expect(resumed.requestText(0)).toContain('BRIEF-LIVE: the contract was delivered.');
  });

  test('a repeated key answers already-present and adds nothing', async () => {
    const harness = await startPi(cleanups, [text('done')]);
    await harness.session.outcome;
    const first = await harness.agent.appendContext(harness.session.ref, 'decision-7', 'once');
    expect(first).toMatchObject({ outcome: 'appended' });
    const repeat = await harness.agent.appendContext(harness.session.ref, 'decision-7', 'and again, differently');
    expect(repeat).toMatchObject({ outcome: 'already-present' });

    const resumed = await startPi(cleanups, [text('acknowledged')], {
      reuse: { workingDirectory: harness.workingDirectory, sessionDirectory: harness.sessionDirectory },
      session: { mode: 'continue', ref: harness.session.ref },
    });
    await resumed.session.outcome;
    const sent = resumed.requestText(0);
    expect(sent).toContain('once');
    expect(sent).not.toContain('and again, differently');
  });

  test('a lost session answers session-lost', async () => {
    const harness = await startPi(cleanups, [text('done')]);
    await harness.session.outcome;
    expect(await harness.agent.appendContext('/nowhere/missing.jsonl#abc', 'decision-1', 'text')).toEqual({ outcome: 'session-lost' });
    expect(await harness.agent.appendContext('', 'decision-1', 'text')).toEqual({ outcome: 'session-lost' });
  });

  test('an appended brief reaches a fork taken after it', async () => {
    const harness = await startPi(cleanups, [call('ls', { path: '.' }, 'c-1'), text('done')]);
    await harness.session.outcome;
    const appended = await harness.agent.appendContext(harness.session.ref, 'decision-3', 'BRIEF-FORK: inherit this.');
    const point = 'ref' in appended ? appended.ref : harness.session.ref;

    const fork = await startPi(cleanups, [text('acknowledged')], {
      reuse: { workingDirectory: harness.workingDirectory, sessionDirectory: harness.sessionDirectory },
      session: { mode: 'fork', from: point },
    });
    expect(fork.session.start).toEqual({ mode: 'fork' });
    await fork.session.outcome;
    expect(fork.requestText(0)).toContain('BRIEF-FORK: inherit this.');
  });
});

test('leaves the person\'s pi directory alone', () => {
  expect(existsSync(join(homedir(), '.pi'))).toBe(hadPiDirectory);
});
