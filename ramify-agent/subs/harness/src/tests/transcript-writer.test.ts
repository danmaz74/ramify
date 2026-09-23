import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
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
afterEach(async () => {
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
