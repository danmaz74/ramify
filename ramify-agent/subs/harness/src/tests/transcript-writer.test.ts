import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { noMessageDetail, type AgentEvent } from '../../subs/agent/src/interfaces/port.js';
import { transcriptEntrySchema, type TranscriptEntry } from '../interfaces/protocol/transcripts.js';
import { InvocationTranscript, recordAppend, type InvocationStart } from '../transcripts/recorder.js';
import { ContentStore } from '../transcripts/store.js';
import { readTranscript, TranscriptWriter } from '../transcripts/writer.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { blobsIn, portEventsOf, transcribed } from './helpers/transcripts.js';

/*
 * One session's transcript, written from port events and the harness's own
 * decisions. Each entry is one synced line, numbered one above the last,
 * so a crash keeps every entry before the one it interrupted, a torn last
 * line is discarded, and a number is never reset. A body over the inline
 * limit is stored once by content. A failed write is one coverage gap and
 * never ends the session.
 */

const cleanups: Array<() => Promise<void>> = [];
const writes = vi.hoisted(() => ({
  path: '', opens: 0, lines: [] as string[], syncs: 0, closes: 0,
  partialAt: 0, syncFailureAt: 0, closeFailureAt: 0,
  beforeSync: undefined as ((n: number) => Promise<void>) | undefined,
  beforeClose: undefined as ((n: number) => Promise<void>) | undefined,
}));
vi.mock('node:fs/promises', async original => {
  const fs = await original<typeof import('node:fs/promises')>();
  return { ...fs, open: async (...args: Parameters<typeof fs.open>) => {
    const handle = await fs.open(...args);
    if (String(args[0]) !== writes.path || args[1] !== 'a') return handle;
    writes.opens++;
    return new Proxy(handle, { get(target, property) {
      if (property === 'appendFile') return async (line: string) => {
        writes.lines.push(line);
        if (writes.lines.length === writes.partialAt) {
          await target.appendFile(line.slice(0, 9));
          throw new Error('injected partial transcript append');
        }
        await target.appendFile(line);
      };
      if (property === 'datasync') return async () => {
        const n = ++writes.syncs;
        await writes.beforeSync?.(n);
        if (n === writes.syncFailureAt) throw new Error('injected transcript datasync');
        await target.datasync();
      };
      if (property === 'close') return async () => {
        const n = ++writes.closes;
        await writes.beforeClose?.(n);
        await target.close();
        if (n === writes.closeFailureAt) throw new Error('injected transcript close');
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
});
afterEach(async () => {
  Object.assign(writes, { path: '', opens: 0, lines: [], syncs: 0, closes: 0, partialAt: 0, syncFailureAt: 0, closeFailureAt: 0, beforeSync: undefined, beforeClose: undefined });
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const inlineBytes = 8 * 1024;

async function directory() {
  const made = await temporaryDirectory();
  cleanups.push(made.remove);
  const root = made.path;
  const store = new ContentStore(join(root, 'blobs'));
  const path = join(root, 'transcripts', 'ses-0001.jsonl');
  const writer = (session = 'ses-0001', file = path) => new TranscriptWriter({ session, path: file, root, store, inlineBytes });
  return { root, store, path, writer };
}

/** An invocation's transcript whose coverage gaps are collected. */
function invocation(writer: TranscriptWriter, id: string) {
  const gaps: string[] = [];
  const transcript = new InvocationTranscript(writer, id, async detail => { gaps.push(detail); });
  return { transcript, gaps };
}

const start = (systemPrompt = 'You are the engineer.', prompt = 'Raise the note limit to 500.'): InvocationStart => ({
  role: 'engineer', work: { workItem: 'wi-001', iteration: 'wi-001.i01' }, start: 'opened', requested: 'fresh',
  executor: 'scripted', model: null, systemPrompt, prompt,
});

const user = (text: string): AgentEvent => ({ type: 'message', role: 'user', blocks: [{ type: 'text', text }] });
const result = (callId: string, text: string, tool = 'read'): AgentEvent => ({
  type: 'message', role: 'tool-result', callId, tool, isError: false, blocks: [{ type: 'text', text }],
});

async function lines(path: string): Promise<TranscriptEntry[]> {
  return (await readFile(path, 'utf8')).split('\n').filter(Boolean).map(line => transcriptEntrySchema.parse(JSON.parse(line)));
}

describe('a transcript', () => {
  test('a crash after an entry keeps every earlier entry, a torn last line is discarded, and numbering goes on', async () => {
    const { path, writer } = await directory();
    const first = invocation(writer(), 'inv-0001');
    await first.transcript.started(start());
    first.transcript.event(user('Raise the note limit to 500.'));
    first.transcript.event({
      type: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'Reading the module.' }], text: 'Reading the module.',
      usage: null, detail: noMessageDetail,
    });
    await first.transcript.drain();
    // The harness dies while it appends the fourth entry.
    await appendFile(path, '{"n":4,"at":"2026-09-23T10:00:00.000Z","type":"mess');

    const read = await readTranscript(path);
    expect(read.discardedPartial).toBe(true);
    expect(read.unreadable).toEqual([]);
    expect(read.entries.map(entry => [entry.n, entry.type])).toEqual([[1, 'started'], [2, 'message'], [3, 'message']]);

    // A writer after the restart removes the torn line and numbers on from
    // the last entry the file holds.
    const after = invocation(writer(), 'inv-0001');
    await after.transcript.end({ ended: 'failed', interruption: 'session-lost', error: 'The harness stopped.', actual: null });
    const reread = await readTranscript(path);
    expect(reread.discardedPartial).toBe(false);
    expect(reread.entries.map(entry => [entry.n, entry.type])).toEqual([[1, 'started'], [2, 'message'], [3, 'message'], [4, 'ended'], [5, 'point']]);
    expect(reread.entries.at(-1)).toMatchObject({ point: { session: 'ses-0001', invocation: 'inv-0001' } });
    expect(first.gaps).toEqual([]);
    expect(after.gaps).toEqual([]);
  });

  test('a reader skips a complete line that is not JSON, keeps every other entry, and says a missing file is missing', async () => {
    const { path, writer, root } = await directory();
    expect(await readTranscript(path)).toEqual({ missing: true, entries: [], discardedPartial: false, unreadable: [] });
    const first = invocation(writer(), 'inv-0001');
    await first.transcript.started(start());
    await first.transcript.drain();
    // A damaged line, then an entry after it.
    await appendFile(path, 'not a JSON value\n');
    await appendFile(path, `${JSON.stringify({ n: 2, at: '2026-09-23T10:00:00.000Z', type: 'message', invocation: 'inv-0001', role: 'user', blocks: [] })}\n`);
    const read = await readTranscript(path);
    expect(read).toMatchObject({ missing: false, discardedPartial: false, unreadable: [2] });
    expect(read.entries.map(entry => entry.n)).toEqual([1, 2]);
    // An empty file exists, and has no entries.
    const empty = join(root, 'transcripts', 'ses-0002.jsonl');
    await writeFile(empty, '');
    expect(await readTranscript(empty)).toEqual({ missing: false, entries: [], discardedPartial: false, unreadable: [] });
  });

  test('a session\'s entries are numbered across its invocations and appends, and a number is never reused', async () => {
    const { path, writer } = await directory();
    const session = writer();
    const first = invocation(session, 'inv-0001');
    await first.transcript.started(start());
    first.transcript.event(user('first'));
    await first.transcript.end({ ended: 'submitted', interruption: null, error: null, actual: { mode: 'fresh', degradedReason: null } });
    await recordAppend(session, { kind: 'brief-appended', decision: 'gd-001', generation: 1, outcome: 'appended', text: 'The note stays here.' }, 12);
    // A second process's writer, as after a restart, for the next invocation.
    const second = invocation(writer(), 'inv-0004');
    await second.transcript.started({ ...start(), start: 'continued', requested: 'continue' });
    await second.transcript.end({ ended: 'submitted', interruption: null, error: null, actual: { mode: 'continue', degradedReason: null } });

    const entries = await lines(path);
    expect(entries.map(entry => entry.n)).toEqual(entries.map((_, index) => index + 1));
    expect(entries.map(entry => `${entry.type} ${entry.invocation ?? '-'}`)).toEqual([
      'started inv-0001', 'message inv-0001', 'ended inv-0001', 'point inv-0001',
      'harness -', 'point -',
      'started inv-0004', 'ended inv-0004', 'point inv-0004',
    ]);
    expect(entries[5]).toMatchObject({ point: { session: 'ses-0001', append: 12 } });
  });

  test('a body over the inline limit is stored once by content: a file read twice, and the system prompt every invocation shares', async () => {
    const { root, store, writer } = await directory();
    const file = `${'export const noteLimit = 500;\n'.repeat(400)}`;
    expect(Buffer.byteLength(file)).toBeGreaterThan(inlineBytes);
    const systemPrompt = 'You are the engineer. Work only inside your scope.';

    const first = invocation(writer(), 'inv-0001');
    await first.transcript.started(start(systemPrompt));
    first.transcript.event(result('call-1', file));
    first.transcript.event(result('call-2', file));
    first.transcript.event(result('call-3', 'a short result'));
    await first.transcript.drain();
    // Another session of the same role shares the prompt and reads the file too.
    const other = invocation(writer('ses-0002', join(root, 'transcripts', 'ses-0002.jsonl')), 'inv-0002');
    await other.transcript.started(start(systemPrompt, 'Another goal.'));
    other.transcript.event(result('call-1', file));
    await other.transcript.drain();

    // One blob for the file and one for the prompt, however often each is named.
    expect(await blobsIn(join(root, 'blobs'))).toHaveLength(2);
    const entries = [...await lines(join(root, 'transcripts', 'ses-0001.jsonl')), ...await lines(join(root, 'transcripts', 'ses-0002.jsonl'))];
    const results = entries.flatMap(entry => (entry.type === 'message' && entry.role === 'tool-result' ? entry.blocks : []));
    const hashes = new Set(results.flatMap(block => (block.type === 'text' && block.body.stored === 'blob' ? [block.body.hash] : [])));
    expect(hashes.size).toBe(1);
    expect(results.filter(block => block.type === 'text' && block.body.stored === 'blob')).toHaveLength(3);
    // The short result stays in its entry; the stored ones carry their size and a preview.
    expect(results[2]).toEqual({ type: 'text', body: { stored: 'inline', text: 'a short result', bytes: 14 } });
    expect(results[0]).toMatchObject({ body: { stored: 'blob', bytes: Buffer.byteLength(file), preview: 'export const noteLimit = 500;' } });
    const prompts = entries.flatMap(entry => (entry.type === 'started' ? [entry.systemPrompt] : []));
    expect(prompts).toHaveLength(2);
    expect(prompts.every(prompt => prompt.stored === 'blob')).toBe(true);
    expect(new Set(prompts.map(prompt => (prompt.stored === 'blob' ? prompt.hash : '')))).toEqual(new Set([prompts[0]!.stored === 'blob' ? prompts[0]!.hash : '']));
    expect(await store.read((prompts[0] as { hash: string }).hash)).toBe(systemPrompt);
  });

  test('entries read back to the port events that produced them, with optional detail present and absent', async () => {
    const { root, store, path, writer } = await directory();
    const large = 'x'.repeat(inlineBytes + 1);
    const events: AgentEvent[] = [
      user('Raise the note limit to 500.'),
      {
        type: 'message', role: 'assistant', text: 'Reading.',
        blocks: [
          { type: 'thinking', visibility: 'unmarked', text: 'The limit is in notes.ts.' },
          { type: 'thinking', visibility: 'redacted', text: '' },
          { type: 'text', text: 'Reading.' },
          { type: 'tool-call', callId: 'call-1', tool: 'read', input: { path: 'src/notes.ts', offset: 3 }, action: { kind: 'read', path: 'src/notes.ts', range: { start: 3, count: null } } },
          { type: 'other', kind: 'image', description: 'a screenshot, 20 KiB' },
        ],
        usage: { input: 100, output: 20, cacheRead: 5, cacheWrite: 1, total: 126 },
        detail: {
          model: 'provider/model-7', thinkingLevel: 'high', stopReason: 'tool-use', error: null, reasoningTokens: 12,
          cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 }, cacheWrites: { short: 1, long: 0 },
        },
      },
      { type: 'tool-started', callId: 'call-1', tool: 'read', input: { path: 'src/notes.ts', offset: 3 }, action: { kind: 'read', path: 'src/notes.ts', range: { start: 3, count: null } }, mutating: false },
      { type: 'tool-finished', callId: 'call-1', tool: 'read', isError: false, reachedTool: true },
      result('call-1', large),
      { type: 'context-observed', tokens: 1000, window: 200_000 },
      { type: 'message', role: 'assistant', blocks: [], text: '', usage: null, detail: { ...noMessageDetail, stopReason: 'error', error: '529 overloaded' } },
      { type: 'retry', phase: 'started', attempt: 1, maxAttempts: 3, delayMs: null, errorText: '529 overloaded' },
      { type: 'retry', phase: 'ended', attempt: 1, succeeded: true, errorText: null },
      { type: 'compaction', phase: 'started', reason: 'threshold' },
      { type: 'compaction', phase: 'ended', reason: 'threshold', tokensBefore: null, tokensAfter: null, aborted: false, errorText: null },
      { type: 'message', role: 'tool-result', callId: 'call-2', tool: 'shell', isError: true, blocks: [{ type: 'other', kind: 'image', description: 'not carried' }] },
    ];
    const { transcript, gaps } = invocation(writer(), 'inv-0001');
    await transcript.started(start());
    for (const event of events) transcript.event(event);
    await transcript.end({ ended: 'submitted', interruption: null, error: null, actual: { mode: 'fresh', degradedReason: null } });

    const read = await readTranscript(path);
    expect(await portEventsOf(read.entries, root, store)).toEqual(transcribed(events));
    expect(gaps).toEqual([]);
    // Absent detail stays absent, and is never written as zero.
    const failed = read.entries.find(entry => entry.type === 'message' && entry.role === 'assistant' && entry.detail.error !== null);
    expect(failed).toMatchObject({ usage: null, detail: { model: null, cost: null, reasoningTokens: null, stopReason: 'error' } });
  });

  test('a shell call\'s result names its complete output, which the harness already keeps, rather than copying it', async () => {
    const { root, path, writer } = await directory();
    const log = join(root, 'invocations', 'inv-0001', 'shell', '001.log');
    await mkdir(join(root, 'invocations', 'inv-0001', 'shell'), { recursive: true });
    await writeFile(log, 'line\n'.repeat(5000));
    const { transcript } = invocation(writer(), 'inv-0001');
    transcript.output('call-3', log);
    transcript.event(result('call-3', '... the last 8 KiB ...', 'shell'));
    transcript.event(result('call-4', 'no log', 'read'));
    await transcript.drain();

    const results = (await lines(path)).filter(entry => entry.type === 'message' && entry.role === 'tool-result');
    expect(results.map(entry => (entry.type === 'message' && entry.role === 'tool-result' ? entry.output : undefined))).toEqual([
      { stored: 'file', path: 'invocations/inv-0001/shell/001.log', bytes: 25_000 },
      null,
    ]);
  });

  test('a failed write is one coverage gap, and the transcript goes on with the next entry', async () => {
    const { root, path, writer } = await directory();
    // The content store cannot be created, so a stored body cannot be written.
    await writeFile(join(root, 'blobs'), 'not a directory');
    const { transcript, gaps } = invocation(writer(), 'inv-0001');
    await transcript.started(start());
    transcript.event(user('a short prompt'));
    transcript.event(result('call-1', 'y'.repeat(inlineBytes + 1)));
    transcript.event(result('call-2', 'short'));
    await transcript.end({ ended: 'submitted', interruption: null, error: null, actual: { mode: 'fresh', degradedReason: null } });
    await transcript.drain();

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('the started entry of ses-0001\'s transcript could not be written');
    const entries = await lines(path);
    // Every entry that could be written was, numbered without a hole.
    expect(entries.map(entry => [entry.n, entry.type])).toEqual([[1, 'message'], [2, 'message'], [3, 'ended'], [4, 'point']]);
  });

  test('what a session reports after its end is not its transcript', async () => {
    const { path, writer } = await directory();
    const { transcript } = invocation(writer(), 'inv-0001');
    await transcript.end({ ended: 'stopped', interruption: null, error: null, actual: { mode: 'fresh', degradedReason: null } });
    transcript.event(user('late'));
    transcript.note({ kind: 'read-reminder', callId: null, text: 'late' });
    await transcript.drain();
    expect((await lines(path)).map(entry => entry.type)).toEqual(['ended', 'point']);
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const fixedAt = '2026-10-09T01:40:00.000Z';
const simpleEntry = (text: string) => ({ type: 'message' as const, invocation: 'inv-0001', role: 'user' as const, blocks: [{ type: 'text' as const, body: { stored: 'inline' as const, text, bytes: Buffer.byteLength(text) } }] });

async function observedWriter() {
  const f = await directory();
  writes.path = f.path;
  const writer = new TranscriptWriter({ session: 'ses-0001', path: f.path, root: f.root, store: f.store, inlineBytes, now: () => new Date(fixedAt) });
  return { ...f, writer };
}

describe('explicit independent transcript bursts', () => {
  test('three rows have exact independent bytes, individual flushes, and no acknowledgement or drain before actual close', async () => {
    const f = await observedWriter(); const closing = deferred(); const release = deferred();
    writes.beforeClose = async n => { if (n === 1) { closing.resolve(); await release.promise; } };
    const inputs = ['α\nfirst', 'second', 'third'].map(simpleEntry);
    let answered = 0; const order: number[] = [];
    const promises = inputs.map((input, index) => f.writer.appendIndependent(() => { order.push(index); return input; }).then(entry => { answered++; return entry; }));
    const draining = f.writer.drain(); let drained = false; void draining.then(() => { drained = true; });
    await closing.promise;
    expect(order).toEqual([0, 1, 2]); expect(writes.opens).toBe(1); expect(writes.syncs).toBe(3);
    expect(answered).toBe(0); expect(drained).toBe(false);
    const expected = inputs.map((input, index) => `${JSON.stringify({ n: index + 1, at: fixedAt, ...input })}\n`).join('');
    expect(await readFile(f.path, 'utf8')).toBe(expected);
    release.resolve(); await draining;
    expect((await Promise.all(promises)).map(entry => entry.n)).toEqual([1, 2, 3]);
    expect(writes.closes).toBe(1); expect(answered).toBe(3);
  });

  test('ordinary builders can await an earlier append acknowledgement and remain hard boundaries between independent bursts', async () => {
    const f = await observedWriter();
    const first = f.writer.appendIndependent(() => simpleEntry('first'));
    const ordinary = f.writer.append(async () => { expect((await first).n).toBe(1); return simpleEntry('ordinary'); });
    const dependent = f.writer.append(async () => { expect((await ordinary).n).toBe(2); return simpleEntry('dependent'); });
    const last = f.writer.appendIndependent(() => simpleEntry('last'));
    expect((await Promise.all([first, ordinary, dependent, last])).map(entry => entry.n)).toEqual([1, 2, 3, 4]);
    expect(writes.opens).toBe(4); expect(writes.closes).toBe(4);
    expect((await lines(f.path)).map(entry => entry.type === 'message' ? entry.blocks[0] : null)).toEqual(['first', 'ordinary', 'dependent', 'last'].map(text => simpleEntry(text).blocks[0]));
  });

  test('ordinary acknowledgement callbacks update state before the next builder, including after an independent prefix', async () => {
    const f = await observedWriter(); let state = 'before-ack';
    const first = f.writer.append(() => simpleEntry('first'));
    void first.then(() => { state = 'after-ack'; });
    const second = f.writer.append(() => { expect(state).toBe('after-ack'); return simpleEntry('second'); });
    await Promise.all([first, second]);
    state = 'before-burst-ack';
    const burst = f.writer.appendIndependent(() => simpleEntry('independent'));
    void burst.then(() => { state = 'after-burst-ack'; });
    const fenced = f.writer.append(() => { expect(state).toBe('after-burst-ack'); return simpleEntry('fenced'); });
    await Promise.all([burst, fenced]);
    expect(writes.opens).toBe(4); expect(writes.closes).toBe(4);
  });

  test('a failed first independent builder plus failed scope close leaves later builders untouched until reload', async () => {
    const f = await observedWriter(); writes.closeFailureAt = 1; let calls = 0;
    const bad = f.writer.appendIndependent(() => { throw new Error('builder failure before a row'); });
    const rejected = bad.then(() => 'unexpected success', error => (error as Error).message);
    const later = f.writer.appendIndependent(() => { calls++; return simpleEntry('later'); });
    expect(await rejected).toBe('injected transcript close'); expect((await later).n).toBe(1); expect(calls).toBe(1);
    expect(writes.opens).toBe(2); expect(writes.syncs).toBe(1); expect(writes.closes).toBe(2);
    expect((await lines(f.path)).map(entry => entry.n)).toEqual([1]);
  });

  test('a builder and its actual datasync finish before the next independent builder begins', async () => {
    const f = await observedWriter(); const building = deferred(); const releaseBuild = deferred(); const syncing = deferred(); const releaseSync = deferred();
    const order: string[] = [];
    writes.beforeSync = async n => { if (n === 1) { syncing.resolve(); await releaseSync.promise; } };
    const first = f.writer.appendIndependent(async () => { order.push('first'); building.resolve(); await releaseBuild.promise; return simpleEntry('first'); });
    const second = f.writer.appendIndependent(() => { order.push('second'); return simpleEntry('second'); });
    await building.promise; expect(order).toEqual(['first']); expect(writes.lines).toHaveLength(0);
    releaseBuild.resolve(); await syncing.promise; expect(order).toEqual(['first']); expect(writes.lines).toHaveLength(1);
    releaseSync.resolve(); await Promise.all([first, second]); expect(order).toEqual(['first', 'second']); expect(writes.syncs).toBe(2);
  });

  test('already admitted bursts are bounded and a finite drain does not wait for later arrivals', async () => {
    const f = await observedWriter(); const closing = deferred(); const releaseClose = deferred(); const lateStarted = deferred(); const releaseLate = deferred();
    writes.beforeClose = async n => { if (n === 1) { closing.resolve(); await releaseClose.promise; } };
    const early = Array.from({ length: 70 }, (_, index) => f.writer.appendIndependent(() => simpleEntry(`early-${index}`)));
    const draining = f.writer.drain();
    await closing.promise; expect(writes.lines).toHaveLength(64); expect(writes.opens).toBe(1);
    const late = f.writer.appendIndependent(async () => { lateStarted.resolve(); await releaseLate.promise; return simpleEntry('late'); });
    releaseClose.resolve(); await draining; await lateStarted.promise;
    expect(writes.lines).toHaveLength(70); expect(writes.opens).toBe(3); expect(writes.closes).toBe(2);
    expect((await Promise.all(early)).map(entry => entry.n)).toEqual(Array.from({ length: 70 }, (_, index) => index + 1));
    releaseLate.resolve(); expect((await late).n).toBe(71); await f.writer.drain(); expect(writes.closes).toBe(3);
  });

  test('a failed builder runs once, earlier rows acknowledge after close, and later unstarted builders retain their place', async () => {
    const f = await observedWriter(); let failedBuilds = 0; let lastBuilds = 0;
    const first = f.writer.appendIndependent(() => simpleEntry('first'));
    const bad = f.writer.appendIndependent(() => { failedBuilds++; throw new Error('independent builder failed'); });
    const failure = bad.then(() => 'unexpected success', error => (error as Error).message);
    const last = f.writer.appendIndependent(() => { lastBuilds++; return simpleEntry('last'); });
    expect((await first).n).toBe(1); expect(await failure).toBe('independent builder failed'); expect((await last).n).toBe(2);
    expect(failedBuilds).toBe(1); expect(lastBuilds).toBe(1); expect(writes.syncs).toBe(2); expect(writes.closes).toBe(2);
    expect((await lines(f.path)).map(entry => entry.n)).toEqual([1, 2]);
  });

  test.each(['partial', 'datasync'] as const)('a %s failure rejects unanswered prefix rows, reloads physical bytes, and preserves the later queued builder', async fault => {
    const f = await observedWriter(); if (fault === 'partial') writes.partialAt = 2; else writes.syncFailureAt = 2;
    let lastBuilds = 0;
    const first = f.writer.appendIndependent(() => simpleEntry('first'));
    const bad = f.writer.appendIndependent(() => simpleEntry('uncertain'));
    const prefix = Promise.allSettled([first, bad]);
    const last = f.writer.appendIndependent(() => { lastBuilds++; return simpleEntry('last'); });
    expect((await prefix).map(result => result.status)).toEqual(['rejected', 'rejected']);
    expect((await last).n).toBe(fault === 'partial' ? 2 : 3); expect(lastBuilds).toBe(1);
    const read = await readTranscript(f.path); expect(read.discardedPartial).toBe(false); expect(read.unreadable).toEqual([]);
    expect(read.entries.map(entry => entry.n)).toEqual(fault === 'partial' ? [1, 2] : [1, 2, 3]);
    expect(read.entries[0]).toEqual({ n: 1, at: fixedAt, ...simpleEntry('first') });
    expect(writes.closes).toBe(2);
  });

  test('a failed close rejects all staged acknowledgements and reopens after the complete physical prefix', async () => {
    const f = await observedWriter(); writes.closeFailureAt = 1;
    const entries = ['first', 'second', 'third'].map(text => f.writer.appendIndependent(() => simpleEntry(text)));
    expect((await Promise.allSettled(entries)).map(entry => entry.status)).toEqual(['rejected', 'rejected', 'rejected']);
    const next = await f.writer.appendIndependent(() => simpleEntry('after close failure'));
    expect(next.n).toBe(4); expect(writes.opens).toBe(2); expect(writes.closes).toBe(2);
    expect((await lines(f.path)).map(entry => entry.n)).toEqual([1, 2, 3, 4]);
    const reopened = f.writer; expect((await reopened.append(() => simpleEntry('ordinary after failure'))).n).toBe(5);
  });

  test('owning event and note admissions group while started, ended and point remain fenced and captured output identity stays original', async () => {
    const f = await observedWriter(); const observed = invocation(f.writer, 'inv-0001');
    const original = join(f.root, 'original-output.txt'); const changed = join(f.root, 'later-output.txt');
    await writeFile(original, 'original'); await writeFile(changed, 'later');
    await observed.transcript.started(start()); expect(writes.opens).toBe(1); expect(writes.closes).toBe(1);
    observed.transcript.event(user('first')); observed.transcript.note({ kind: 'read-reminder', callId: null, text: 'Read here.' });
    observed.transcript.output('c1', original); observed.transcript.event(result('c1', 'result')); observed.transcript.output('c1', changed);
    await observed.transcript.end({ ended: 'submitted', interruption: null, error: null, actual: { mode: 'fresh', degradedReason: null } });
    observed.transcript.event(user('too late')); observed.transcript.note({ kind: 'note-appended', text: 'too late' });
    await observed.transcript.drain();
    const recorded = await lines(f.path);
    expect(recorded.map(entry => [entry.n, entry.type])).toEqual([[1, 'started'], [2, 'message'], [3, 'harness'], [4, 'message'], [5, 'ended'], [6, 'point']]);
    expect(recorded[3]).toMatchObject({ output: { stored: 'file', path: 'original-output.txt', bytes: 8 } });
    expect(writes.opens).toBe(4); expect(writes.closes).toBe(4); expect(writes.syncs).toBe(6); expect(observed.gaps).toEqual([]);
  });

  test('an owning independent burst close failure is one coverage gap and later end and point are still recorded', async () => {
    const f = await observedWriter(); const observed = invocation(f.writer, 'inv-0001'); await observed.transcript.started(start());
    writes.closeFailureAt = 2;
    observed.transcript.event(user('first')); observed.transcript.note({ kind: 'note-appended', text: 'note' }); observed.transcript.event(user('second'));
    await observed.transcript.end({ ended: 'submitted', interruption: null, error: null, actual: { mode: 'fresh', degradedReason: null } });
    await observed.transcript.drain();
    expect(observed.gaps).toHaveLength(1); expect(observed.gaps[0]).toContain('injected transcript close');
    expect((await lines(f.path)).map(entry => entry.type)).toEqual(['started', 'message', 'harness', 'message', 'ended', 'point']);
    expect(writes.opens).toBe(4); expect(writes.closes).toBe(4); expect(writes.syncs).toBe(6);
  });
});
