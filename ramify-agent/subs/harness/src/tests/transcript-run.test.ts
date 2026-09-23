import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AgentEvent, AgentPort } from '../../subs/agent/src/interfaces/port.js';
import type { TranscriptBody, TranscriptEntry } from '../interfaces/protocol/transcripts.js';
import { runView } from '../projections/inputs.js';
import { metricsOf } from '../projections/metrics.js';
import { observationSchema } from '../run/observations.js';
import { runLayout, type InvocationOutcome } from '../run/records.js';
import { reduceSessions } from '../run/sessions.js';
import { ContentStore } from '../transcripts/store.js';
import { readBody, readTranscript } from '../transcripts/writer.js';
import { copyFixture } from './helpers/fixture.js';
import { expectNoProcesses, forgetExternalTools, openRunsWithoutProcesses } from './helpers/external-tools.js';
import { read } from './helpers/iterations.js';
import { emptyAnalysis, installTestRunner, onlyRun, runPath, startRun } from './helpers/runs.js';
import { scriptedGit } from './helpers/scripted-git.js';
import { runSessionScenario } from './helpers/session-scenario.js';
import { blobsIn, portEventsOf, transcribed } from './helpers/transcripts.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * The transcripts of a scripted run: one per session, written from the port
 * events and the harness's own decisions. Each invocation's start is durable
 * before its session starts; each invocation's end and each append is a
 * point; a fork's first entry names its source point. The transcripts read
 * back to the port events that produced them, and no record, event or
 * observation quotes one of their bodies. A transcript that cannot be
 * written is a coverage gap, and the run completes.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0)) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

const thinking = 'The notes module owns the reviewer note; the limit is a rule of its own.';

/**
 * The scripted fake, with every port event of each invocation kept, and
 * whether the transcript's last entry was that invocation's start when its
 * session was started.
 */
function capturing(scripted: AgentPort) {
  const events = new Map<string, AgentEvent[]>();
  const startedFirst = new Map<string, boolean>();
  const port: AgentPort = {
    name: scripted.name,
    support: scripted.support,
    appendContext: (ref, key, text) => scripted.appendContext(ref, key, text),
    startSession(spec) {
      // `invocations/<id>/session`, beneath the run's directory.
      const invocation = basename(dirname(spec.sessionDirectory));
      const transcripts = join(dirname(dirname(dirname(spec.sessionDirectory))), 'transcripts');
      const last = readdirSync(transcripts).map(name => {
        const lines = readFileSync(join(transcripts, name), 'utf8').split('\n').filter(Boolean);
        return JSON.parse(lines.at(-1)!) as TranscriptEntry;
      });
      startedFirst.set(invocation, last.some(entry => entry.type === 'started' && entry.invocation === invocation));
      const list: AgentEvent[] = [];
      events.set(invocation, list);
      return scripted.startSession({ ...spec, onEvent: event => { list.push(event); spec.onEvent(event); } });
    },
  };
  return { port, events, startedFirst };
}

/** Every body an entry holds, with what holds it. */
function bodiesOf(entry: TranscriptEntry): Array<{ readonly what: string; readonly body: TranscriptBody }> {
  const found: Array<{ what: string; body: TranscriptBody }> = [];
  if (entry.type === 'started') found.push({ what: 'system prompt', body: entry.systemPrompt }, { what: 'prompt', body: entry.prompt });
  if (entry.type === 'message') {
    for (const block of entry.blocks) {
      if (block.type === 'text') found.push({ what: `${entry.role} text`, body: block.body });
      if (block.type === 'thinking') found.push({ what: 'thinking', body: block.body });
      if (block.type === 'tool-call') found.push({ what: `${block.tool} input`, body: block.input });
    }
  }
  if (entry.type === 'harness' && 'text' in entry.decision && entry.decision.text !== null) found.push({ what: entry.decision.kind, body: entry.decision.text });
  return found;
}

/** The run's records, events and observations: every file that is not raw output. */
async function recordFiles(directory: string): Promise<string[]> {
  const raw = new Set(['transcripts', 'blobs', 'session', 'shell', 'hooks']);
  const files: string[] = [];
  const walk = async (path: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!raw.has(entry.name)) await walk(join(path, entry.name));
      } else if (entry.name.endsWith('.json') || entry.name === 'events.jsonl' || entry.name === 'observations.jsonl') {
        files.push(join(path, entry.name));
      }
    }
  };
  await walk(directory);
  return files;
}

describe('ST07, ST08: the transcripts of a scripted run', () => {
  test('every session has one, each start precedes its model call, points and forks are named, and each reads back to its port events', async () => {
    let captured: ReturnType<typeof capturing> | undefined;
    const scenario = await runSessionScenario({
      cleanup: step => { cleanups.push(step); },
      before: {
        // The initial architect thinks, retries a failed call, compacts and reads.
        'initial-architect': [
          {
            kind: 'message', text: 'Orienting.', blocks: [{ type: 'thinking', visibility: 'unmarked', text: thinking }],
            usage: { input: 1000, output: 40, cacheRead: 0, cacheWrite: 0, total: 1040 },
            detail: { model: 'provider/model-7', stopReason: 'tool-use', reasoningTokens: 12 },
          },
          { kind: 'retry', errorText: '529 overloaded', maxAttempts: 3, delayMs: 10 },
          { kind: 'compaction', reason: 'threshold', tokensBefore: 1000, tokensAfter: 400 },
          read('plans/review-notes/plan.md'),
        ],
      },
      port: scripted => (captured = capturing(scripted)).port,
    });
    const { events } = scenario;
    const store = new ContentStore(scenario.path(runLayout.blobs));
    const sessions = reduceSessions(events);
    const transcripts = new Map<string, TranscriptEntry[]>();
    for (const session of sessions.values()) {
      const read = await readTranscript(scenario.path(runLayout.transcript(session.id)));
      expect([read.discardedPartial, read.unreadable], session.id).toEqual([false, []]);
      transcripts.set(session.id, [...read.entries]);
    }
    expect(await readdir(scenario.path('transcripts'))).toEqual([...sessions.keys()].map(id => `${id}.jsonl`).sort());

    for (const [session, entries] of transcripts) {
      // Numbers rise by one from 1.
      expect(entries.map(entry => entry.n), session).toEqual(entries.map((_, index) => index + 1));
      // A fork's first entry is its start, naming the point it was forked from.
      expect(entries[0], session).toMatchObject({ type: 'started', start: 'opened', fork: sessions.get(session)!.fork });
    }
    expect(transcripts.get('ses-0003')![0]).toMatchObject({
      requested: 'fork', fork: { from: { session: 'ses-0001', invocation: 'inv-0001' }, reason: 'placement-request', generation: 1 },
    });

    for (const event of events) {
      if (event.type === 'invocation-started') {
        const entries = transcripts.get(event.data.session)!;
        const started = entries.find(entry => entry.type === 'started' && entry.invocation === event.data.invocation);
        expect(started, event.data.invocation).toMatchObject({
          role: event.data.role, work: event.data.work, continues: event.data.continues ?? null, executor: 'scripted', model: 'provider/model-7',
        });
        // Durable before the session started, and so before the model call.
        expect(captured!.startedFirst.get(event.data.invocation), event.data.invocation).toBe(true);
        // The invocation's entries read back to the port events it produced.
        const own = entries.filter(entry => entry.invocation === event.data.invocation);
        expect(own.map(entry => entry.type).at(0)).toBe('started');
        expect(own.map(entry => entry.type).slice(-2)).toEqual(['ended', 'point']);
        expect(await portEventsOf(own, scenario.path(), store), event.data.invocation)
          .toEqual(transcribed(captured!.events.get(event.data.invocation)!));
      }
      if (event.type === 'invocation-ended') {
        // Its end, and the point that end is.
        const entries = transcripts.get(event.data.session)!;
        const at = entries.findIndex(entry => entry.type === 'ended' && entry.invocation === event.data.invocation);
        const outcome = JSON.parse(await readFile(scenario.path(runLayout.outcome(event.data.invocation)), 'utf8')) as InvocationOutcome;
        expect(entries[at], event.data.invocation).toMatchObject({
          ended: event.data.ended, interruption: null, actual: { mode: outcome.session!.mode === 'continued' ? 'continue' : outcome.session!.mode },
        });
        expect(entries[at + 1]).toMatchObject({ type: 'point', point: { session: event.data.session, invocation: event.data.invocation } });
      }
      if (event.type === 'brief-appended') {
        // The brief, and the point the append is, between invocations.
        const entries = transcripts.get(event.data.session)!;
        const at = entries.findIndex(entry => entry.type === 'harness' && entry.decision.kind === 'brief-appended' && entry.decision.decision === event.data.decision);
        expect(entries[at]).toMatchObject({ invocation: null, decision: { generation: event.data.generation, outcome: event.data.outcome } });
        expect(entries[at + 1]).toMatchObject({ type: 'point', invocation: null, point: { session: event.data.session, append: event.sequence } });
      }
    }

    // The initial architect's thinking, retry and compaction are there.
    const architect = transcripts.get('ses-0001')!;
    expect(architect.map(entry => (entry.type === 'message' ? `${entry.type} ${entry.role}` : entry.type)).slice(0, 10)).toEqual([
      'started', 'message user', 'message assistant', 'message assistant', 'retry', 'retry', 'compaction', 'compaction',
      'message assistant', 'message tool-result',
    ]);
    // The harness's own decisions are beside the messages: every submission
    // judged, each post-write check, and the note that continued the repair.
    const decisions = [...transcripts.values()].flat().flatMap(entry => (entry.type === 'harness' ? [entry.decision.kind] : []));
    expect(decisions.filter(kind => kind === 'submission-verdict')).toHaveLength(
      events.filter(event => event.type === 'invocation-ended' && event.data.submission !== null).length,
    );
    expect(decisions).toEqual(expect.arrayContaining(['post-write-check', 'brief-appended', 'note-appended']));
    const repair = transcripts.get('ses-0007')!;
    const note = repair.findIndex(entry => entry.type === 'harness' && entry.decision.kind === 'note-appended');
    expect(repair[note + 1]).toMatchObject({ type: 'started', invocation: 'inv-0010', start: 'continued' });
    expect(repair[note]).toMatchObject({ invocation: null, decision: { text: { stored: 'inline', text: 'Continuing iteration wi-002.i01.' } } });

    // Every invocation of a role shares one stored system prompt.
    const prompts = new Map<string, Set<string>>();
    for (const entry of [...transcripts.values()].flat()) {
      if (entry.type !== 'started' || entry.systemPrompt.stored !== 'blob') continue;
      prompts.set(entry.role, (prompts.get(entry.role) ?? new Set()).add(entry.systemPrompt.hash));
    }
    expect(prompts.size).toBe(5);
    expect([...prompts.values()].map(hashes => hashes.size)).toEqual([1, 1, 1, 1, 1]);
    expect((await blobsIn(scenario.path(runLayout.blobs))).length).toBeGreaterThanOrEqual(prompts.size);

    // No record, event or observation quotes a body. An assistant's text is
    // the one exception the activity observation already records, and an
    // accepted submission is a record by design.
    const records = await Promise.all((await recordFiles(scenario.path())).map(async path => ({ path, text: await readFile(path, 'utf8') })));
    expect(records.some(record => record.path.endsWith('events.jsonl'))).toBe(true);
    expect(records.some(record => record.path.endsWith('observations.jsonl'))).toBe(true);
    let checked = 0;
    for (const entry of [...transcripts.values()].flat()) {
      for (const { what, body } of bodiesOf(entry)) {
        if (what === 'assistant text' || what.startsWith('submit')) continue;
        const content = (await readBody(scenario.path(), store, body))!;
        if (content.length < 32) continue;
        checked += 1;
        for (const variant of [content, JSON.stringify(content).slice(1, -1)]) {
          const quoting = records.filter(record => record.text.includes(variant)).map(record => record.path);
          expect(quoting, `${what} of ${entry.invocation}`).toEqual([]);
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(records.some(record => record.text.includes(thinking))).toBe(false);
  }, 180_000);
});

describe('a transcript that cannot be written', () => {
  test('is a coverage gap in its invocation\'s observations, and the run completes', async () => {
    const fixture = await copyFixture();
    cleanups.push(fixture.remove);
    await installTestRunner(fixture.root);
    const git = scriptedGit(fixture.root, { head: 'transcript-base', checkpoints: [
      { subject: 'final verification of plan "review-notes"', commit: null, changes: [] },
    ] });
    const { service } = await openRunsWithoutProcesses(fixture.root, git, {
      script: [{ kind: 'message', text: 'Orienting.' }, { kind: 'submit', input: emptyAnalysis() }],
      // A directory where the first session's transcript would be: every
      // append to it fails.
      afterWrite: async (write, runId) => {
        if (write === 'job-created') await mkdir(runPath(fixture.root, 'review-notes', runId, runLayout.transcript('ses-0001')), { recursive: true });
      },
    });
    cleanups.push(() => service.close());
    const receipt = await service.execute(startRun('review-notes'));
    await service.settled('review-notes', receipt.jobId);
    git.assertComplete();

    expect(onlyRun(service, 'review-notes').state).toBe('completed');
    const outcome = JSON.parse(await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.outcome('inv-0001')), 'utf8')) as InvocationOutcome;
    expect(outcome.ended).toBe('submitted');
    const observations = (await readFile(runPath(fixture.root, 'review-notes', receipt.jobId, runLayout.observations('inv-0001')), 'utf8'))
      .split('\n').filter(Boolean).map(line => observationSchema.parse(JSON.parse(line)));
    const gaps = observations.filter(line => line.type === 'coverage-gap' && line.data.kind === 'transcript-incomplete');
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.data).toMatchObject({ detail: expect.stringContaining('the started entry of ses-0001\'s transcript could not be written') });

    // The gap is raw output: the observations are complete, so it lowers no
    // observation coverage, and the invocation's evaluation still names it.
    // The scripted executor reports no usage or context, which are
    // observation gaps.
    const metrics = await metricsOf(runView(service.committed('review-notes', receipt.jobId)!));
    expect(metrics.metrics.filter(metric => metric.id.startsWith('observation-coverage.')).map(metric => metric.id))
      .toEqual(['observation-coverage.context-unavailable', 'observation-coverage.usage-unavailable']);
    const evaluation = metrics.evaluation.invocations.find(entry => entry.invocation === 'inv-0001');
    expect(evaluation?.gaps).toContainEqual({ kind: 'transcript-incomplete', count: 1 });
  }, 180_000);
});
