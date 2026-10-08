import { invocationEvaluationSchema, type InvocationEvaluation } from '../../../../harness/src/interfaces/protocol/runs.js';
import {
  runSessionViewSchema, sessionUpdatesResponseSchema, transcriptPageSchema,
  type RunSessionView, type SessionInvocation, type SessionUpdatesResponse, type TranscriptPage,
} from '../../../../harness/src/interfaces/protocol/sessions.js';
import { transcriptEntrySchema, type TranscriptBody, type TranscriptEntry } from '../../../../harness/src/interfaces/protocol/transcripts.js';

/*
 * A run's sessions and transcripts as the session queries answer them, for
 * the web's session tests. Every value is parsed by the protocol's schema.
 */

export const planId = 'review-notes';
export const runId = '20260921T080000Z-c0ffee';

export function at(second: number): string {
  return `2026-09-21T08:${String(Math.floor(second / 60)).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}.000Z`;
}

export function inline(text: string): TranscriptBody {
  return { stored: 'inline', text, bytes: new TextEncoder().encode(text).byteLength };
}

export function blob(digit: string, preview: string, bytes = 9000): TranscriptBody {
  return { stored: 'blob', hash: digit.repeat(64), bytes, preview };
}

export function evaluation(invocation: string, extra: Partial<InvocationEvaluation> = {}): InvocationEvaluation {
  return invocationEvaluationSchema.parse({
    invocation, role: 'engineer', workItem: 'wi-001', iteration: 'wi-001.i02', request: null, ended: 'submitted', writer: true,
    guarding: { guarded: ['edit'], unguarded: ['shell'], verdicts: { allowed: 2, 'blocked-scope': 1, 'blocked-unresolved': 0 }, complete: false, statement: 'Guarded: edit.' },
    outsideScope: [], hookChecks: { passed: 2, findings: 1, notChecked: 0, newFindings: 1 }, excursions: ['shop/search'], gaps: [],
    lines: { coverage: 'complete', paths: 1, added: 12, deleted: 3, gaps: [] },
    usage: { input: 100, cacheRead: 50, cacheWrite: 10, output: 40 },
    ...extra,
  });
}

export function invocation(id: string, extra: Partial<SessionInvocation> = {}): SessionInvocation {
  return {
    invocation: id, start: 'opened', started: { sequence: 5, at: at(5) }, ended: { sequence: 9, at: at(9) }, outcome: 'submitted', kept: true,
    continues: null, degraded: null, point: { session: 'ses-0002', invocation: id }, evaluation: evaluation(id),
    ...extra,
  };
}

const noLineage = { fork: null, replaces: null, replacedBy: null, requestedBy: null, requested: [], forks: [] };

export function sessionView(session: string, extra: Partial<RunSessionView> = {}): RunSessionView {
  return runSessionViewSchema.parse({
    session, state: 'finished', finished: 'work-closed', role: 'engineer', work: { workItem: 'wi-001', iteration: 'wi-001.i02' },
    executor: 'scripted', model: null, reaches: { kind: 'work-item', workItem: 'wi-001', capability: 'send-button', module: 'shop/reviews' },
    opened: { sequence: 5, at: at(5) }, changed: { sequence: 9, at: at(9) }, awaiting: null, point: null,
    invocations: [], appends: [], suspended: [], lineage: noLineage,
    ...extra,
  });
}

/** The engineer session ses-0002: inv-0002, then a note, and the continued inv-0004, live. */
export function liveEngineer(extra: Partial<RunSessionView> = {}): RunSessionView {
  return sessionView('ses-0002', {
    state: 'live', finished: null, changed: { sequence: 14, at: at(14) }, awaiting: 'inv-0004',
    point: { session: 'ses-0002', invocation: 'inv-0002' },
    invocations: [
      invocation('inv-0002'),
      invocation('inv-0004', {
        start: 'continued', started: { sequence: 14, at: at(14) }, ended: null, outcome: null, kept: null, point: null,
        continues: { from: { session: 'ses-0002', invocation: 'inv-0002' }, reason: 'iteration-closed', briefs: [] },
        evaluation: evaluation('inv-0004', { ended: null, usage: { unavailable: 'the invocation has not ended' } }),
      }),
    ],
    suspended: [{ from: { sequence: 9, at: at(9) }, until: { sequence: 14, at: at(14) } }],
    ...extra,
  });
}

/** The architect ses-0001, finished, and the global fork ses-0003 forked from its first end. */
export const architect = sessionView('ses-0001', {
  role: 'initial-architect', work: {}, reaches: { kind: 'run' }, opened: { sequence: 2, at: at(2) }, changed: { sequence: 4, at: at(4) },
  point: { session: 'ses-0001', invocation: 'inv-0001' },
  invocations: [invocation('inv-0001', { point: { session: 'ses-0001', invocation: 'inv-0001' }, evaluation: evaluation('inv-0001', { role: 'initial-architect', writer: false, lines: null }) })],
  lineage: { ...noLineage, forks: ['ses-0003'] },
});

export const globalFork = sessionView('ses-0003', {
  role: 'global-fork', work: { request: 'pr-001' }, reaches: { kind: 'request', request: 'pr-001', workItem: 'wi-001', capability: 'send-button' },
  opened: { sequence: 10, at: at(10) }, changed: { sequence: 12, at: at(12) },
  invocations: [invocation('inv-0003', {
    started: { sequence: 10, at: at(10) }, ended: { sequence: 12, at: at(12) }, kept: false,
    point: { session: 'ses-0003', invocation: 'inv-0003' },
    degraded: { requested: 'fork', actual: 'fresh', reason: 'the source session file is gone' },
    evaluation: evaluation('inv-0003', { role: 'global-fork', writer: false, lines: null }),
  })],
  lineage: { ...noLineage, fork: { from: { session: 'ses-0001', invocation: 'inv-0001' }, reason: 'placement-request', generation: 1, briefs: [] } },
});

export function entries(values: readonly unknown[]): TranscriptEntry[] {
  return values.map(value => transcriptEntrySchema.parse(value));
}

const noDetail = { model: null, thinkingLevel: null, stopReason: null, error: null, reasoningTokens: null, cost: null, cacheWrites: null };
const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 };

/** ses-0002's entries 1 to 10: inv-0002 whole, the note between, and inv-0004's start. */
export const engineerEntries: TranscriptEntry[] = entries([
  {
    n: 1, at: at(5), type: 'started', invocation: 'inv-0002', role: 'engineer', work: { workItem: 'wi-001', iteration: 'wi-001.i01' },
    start: 'opened', requested: 'fresh', continues: null, fork: null, replaces: null, requestedBy: null, executor: 'scripted', model: null,
    systemPrompt: blob('a', 'You are the engineer of shop/reviews.', 12000), prompt: inline('Implement the iteration wi-001.i01.'),
  },
  { n: 2, at: at(5), type: 'message', invocation: 'inv-0002', role: 'user', blocks: [{ type: 'text', body: inline('Implement the iteration wi-001.i01.') }] },
  {
    n: 3, at: at(6), type: 'message', invocation: 'inv-0002', role: 'assistant',
    blocks: [
      { type: 'thinking', visibility: 'full', body: inline('I should read the app first.') },
      { type: 'text', body: inline('Reading the app.') },
      { type: 'tool-call', callId: 'call-1', tool: 'read', action: { kind: 'read', path: 'src/app.ts', range: { start: 10, count: 3 } }, input: inline('{"path":"src/app.ts","offset":10,"limit":3}') },
    ],
    usage, detail: { ...noDetail, model: 'model-a', stopReason: 'tool-use' },
  },
  { n: 4, at: at(6), type: 'message', invocation: 'inv-0002', role: 'tool-result', callId: 'call-1', tool: 'read', isError: false, blocks: [{ type: 'text', body: blob('b', 'const a = 1;') }], output: null },
  {
    n: 5, at: at(7), type: 'message', invocation: 'inv-0002', role: 'assistant',
    blocks: [
      { type: 'thinking', visibility: 'redacted', body: inline('') },
      { type: 'tool-call', callId: 'call-2', tool: 'bash', action: { kind: 'command', command: 'npm test' }, input: inline('{"command":"npm test"}') },
    ],
    usage: null, detail: noDetail,
  },
  {
    n: 6, at: at(8), type: 'message', invocation: 'inv-0002', role: 'tool-result', callId: 'call-2', tool: 'bash', isError: false,
    blocks: [{ type: 'text', body: inline('all passed') }], output: { stored: 'file', path: 'invocations/inv-0002/shell/001.log', bytes: 120 },
  },
  { n: 7, at: at(9), type: 'ended', invocation: 'inv-0002', ended: 'submitted', interruption: null, error: null, actual: { mode: 'fresh', degradedReason: null } },
  { n: 8, at: at(9), type: 'point', invocation: 'inv-0002', point: { session: 'ses-0002', invocation: 'inv-0002' } },
  { n: 9, at: at(13), type: 'harness', invocation: null, decision: { kind: 'note-appended', text: inline('Continuing iteration wi-001.i02.') } },
  {
    n: 10, at: at(14), type: 'started', invocation: 'inv-0004', role: 'engineer', work: { workItem: 'wi-001', iteration: 'wi-001.i02' },
    start: 'continued', requested: 'continue', continues: { from: { session: 'ses-0002', invocation: 'inv-0002' }, reason: 'iteration-closed', briefs: [] },
    fork: null, replaces: null, requestedBy: null, executor: 'scripted', model: null,
    systemPrompt: blob('a', 'You are the engineer of shop/reviews.', 12000), prompt: inline('Continue with wi-001.i02.'),
  },
]);

/** An assistant message of inv-0004 with one text. */
export function reply(n: number, text: string): TranscriptEntry {
  return transcriptEntrySchema.parse({ n, at: at(14 + n), type: 'message', invocation: 'inv-0004', role: 'assistant', blocks: [{ type: 'text', body: inline(text) }], usage, detail: noDetail });
}

export function page(values: readonly TranscriptEntry[], extra: Partial<TranscriptPage> = {}): TranscriptPage {
  return transcriptPageSchema.parse({ file: 'present', entries: values, cursor: values.at(-1)?.n ?? 0, more: false, partial: false, unreadable: [], ...extra });
}

export function update(version: number, sessions: readonly RunSessionView[], session: string, values: readonly TranscriptEntry[], after: number): SessionUpdatesResponse {
  return sessionUpdatesResponseSchema.parse({ version, sessions, transcripts: [{ session, page: page(values, { cursor: values.at(-1)?.n ?? after }) }] });
}

/**
 * A post-write check of inv-0002 after call-2, as iteration 4's hook records
 * it: the project's verdict passed, while each named path keeps its own
 * disposition, two of them in declared trees Ramify does not analyze.
 */
export function postWriteCheckEntry(n: number): TranscriptEntry {
  return transcriptEntrySchema.parse({
    n, at: at(8), type: 'harness', invocation: 'inv-0002', decision: {
      kind: 'post-write-check', callId: 'call-2', atCompletion: false, text: inline('Ramify checked src/app.ts; docs/guide.md and fixture/src/f.ts are not analyzed.'),
      checks: [{
        paths: ['src/app.ts', 'docs/guide.md', 'fixture/src/f.ts'], mode: 'changed', outcome: 'passed', reason: null, newFindings: 0, log: null,
        provider: { schema: 'ramify.check/1', revision: null },
        dispositions: [
          { path: 'src/app.ts', disposition: 'checked', reason: 'content', module: 'shop', exclusion: null, sha256: 'c'.repeat(64) },
          { path: 'docs/guide.md', disposition: 'not-analyzed', reason: 'owned-unwired', module: 'shop',
            exclusion: { kind: 'owned-unwired', directory: 'docs', owner: 'shop' }, sha256: null },
          { path: 'fixture/src/f.ts', disposition: 'not-analyzed', reason: 'owned-nested-project', module: 'shop',
            exclusion: { kind: 'owned-nested-project', directory: 'fixture', owner: 'shop' }, sha256: null },
        ],
      }],
    },
  });
}
