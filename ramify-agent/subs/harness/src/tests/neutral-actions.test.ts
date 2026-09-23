import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AgentEvent, ToolAction } from '../../subs/agent/src/interfaces/port.js';
import { createScriptedAgent, type ScriptedAgentOptions, type ScriptStep } from '../../subs/agent/src/scripted.js';
import { activityOf } from '../jobs/activity.js';
import { runLayout } from '../run/records.js';
import type { Observation } from '../run/observations.js';
import { iterationLayout, type IterationResult } from '../work/iterations.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { addModule, assign, byRole, completionProposed, edit, outline, read, submit, treeInputs, write } from './helpers/iterations.js';
import { declaringScenarios } from './helpers/declarations.js';
import { gateGit, scenariosCommit } from './helpers/gate-git.js';
import { directReadinessExecution, expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { installTestRunner, onlyRun, openRuns, runPath, startRun } from './helpers/runs.js';

/*
 * Neutral tool actions. What a call does reaches the harness as its action,
 * which the executor classifies; activity, read excursions and the write
 * guard read that and never the executor's tool or argument names. An
 * executor whose tools are named otherwise is recorded and guarded the same.
 */

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

function started(tool: string, input: unknown, action: ToolAction): AgentEvent {
  return { type: 'tool-started', callId: 'c-1', tool, input, action, mutating: false };
}

describe('activity is read from the action', () => {
  const root = '/project';

  test('a read is a read whatever the tool and its input are called', () => {
    const action: ToolAction = { kind: 'read', path: 'subs/orders/src/orders.ts', range: { start: 10, count: 20 } };
    expect(activityOf(started('read', { path: 'subs/orders/src/orders.ts' }, action), root, root))
      .toEqual({ kind: 'read', callId: 'c-1', path: 'subs/orders/src/orders.ts' });
    expect(activityOf(started('Read', { file_path: '/project/subs/orders/src/orders.ts' }, action), root, root))
      .toEqual({ kind: 'read', callId: 'c-1', path: 'subs/orders/src/orders.ts' });
    // A tool named `read` whose action is not a read records no read.
    expect(activityOf(started('read', { path: 'a.ts' }, { kind: 'other' }), root, root))
      .toEqual({ kind: 'tool', callId: 'c-1', tool: 'read' });
  });

  test('a search shows its pattern, where and which files; a listing shows its directory', () => {
    expect(activityOf(started('Grep', { query: 'x' }, { kind: 'search', pattern: 'noteLimit', path: 'subs', glob: '*.ts' }), root, root))
      .toEqual({ kind: 'search', callId: 'c-1', tool: 'Grep', query: 'noteLimit in subs (*.ts)' });
    expect(activityOf(started('LS', {}, { kind: 'search', pattern: null, path: null, glob: null }), root, root))
      .toEqual({ kind: 'search', callId: 'c-1', tool: 'LS', query: '.' });
  });

  test('a command is recorded as its text, and a write or a harness tool as the call only', () => {
    expect(activityOf(started('Bash', { cmd: 'ls' }, { kind: 'command', command: 'ls' }), root, root))
      .toEqual({ kind: 'tool', callId: 'c-1', tool: 'Bash', command: 'ls' });
    // An input field called `command` is not a command unless the action says so.
    expect(activityOf(started('echo', { command: 'rm -rf /' }, { kind: 'harness' }), root, root))
      .toEqual({ kind: 'tool', callId: 'c-1', tool: 'echo' });
    expect(activityOf(started('Create', { file_path: 'a.ts' }, { kind: 'write', paths: ['a.ts'] }), root, root))
      .toEqual({ kind: 'tool', callId: 'c-1', tool: 'Create' });
  });
});

const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const outside = 'subs/workspace/subs/shared-ui/src/status-badge.tsx';
const store = `${notesDirectory}/src/store.ts`;

/** The engineer's calls as one executor names them. */
interface Naming {
  readonly options: ScriptedAgentOptions;
  read(path: string): ScriptStep;
  search(pattern: string, path: string): ScriptStep;
  write(path: string, content: string): ScriptStep;
  edit(path: string, oldText: string, newText: string): ScriptStep;
}

/** The port's own names, which are pi's: the fake classifies them itself. */
const piNames: Naming = {
  options: {},
  read,
  search: (pattern, path) => ({ kind: 'tool', tool: 'grep', input: { pattern, path } }),
  write,
  edit,
};

/** An executor whose tools and inputs are named otherwise; its script supplies each call's action. */
const otherNames: Naming = {
  options: { toolNames: { read: 'Read', grep: 'Grep', write: 'CreateFile', edit: 'ReplaceText' } },
  read: path => ({ kind: 'tool', tool: 'Read', input: { file_path: path }, action: { kind: 'read', path, range: null } }),
  search: (pattern, path) => ({
    kind: 'tool', tool: 'Grep', input: { regex: pattern, in: path }, action: { kind: 'search', pattern, path, glob: null },
  }),
  write: (path, content) => ({
    kind: 'tool', tool: 'CreateFile', input: { file_path: path, content }, action: { kind: 'write', paths: [path] },
  }),
  edit: (path, oldText, newText) => ({
    kind: 'tool', tool: 'ReplaceText', input: { file_path: path, edits: [{ oldText, newText }] }, action: { kind: 'write', paths: [path] },
  }),
};

/** What one engineer invocation left: its reads, searches, excursions, guard decisions and mutations, without tool names. */
async function engineerRecord(naming: Naming) {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await addModule(fixture.root, notesDirectory, 'notes', {
    'src/notes.ts': 'export const noteLimit = 400;\n',
    'src/tests/notes.test.ts': 'export const covered = true;\n',
  });
  await installTestRunner(fixture.root);
  const root = fixture.root;
  const badge = await readFile(join(root, outside), 'utf8');

  const scripted = gateGit(root, {
    head: 'revision-00',
    commits: [
      // The run's feature files, committed once readiness has passed.
      scenariosCommit('review-notes', 'scenarios-00', 'revision-00'),
      { commit: 'revision-01', changes: [{ status: 'A', path: store }, { status: 'M', path: `${notesDirectory}/src/notes.ts` }] },
      { commit: null },
      { commit: null },
    ],
  });
  const agent = createScriptedAgent(declaringScenarios(byRole({
    'initial-architect': [submit(analysis([entry('review-note', notes)]))],
    'local-architect': [submit(assign(notes, {}, outline())), submit(requestCompletion())],
    engineer: [submit(
      completionProposed('Wrote the store and raised the limit; the badge is not mine to write.'),
      // Two reads of another module: one excursion, on first entry.
      naming.read('subs/workspace/subs/reviews/src/router.ts'),
      naming.read('subs/workspace/subs/reviews/src/session.ts'),
      naming.read(`${notesDirectory}/src/notes.ts`),
      naming.search('noteLimit', notesDirectory),
      // Denied outside the scope, allowed inside it.
      naming.write(outside, 'export const tampered = true;\n'),
      naming.write(store, 'export const store = new Map();\n'),
      naming.edit(`${notesDirectory}/src/notes.ts`, 'noteLimit = 400', 'noteLimit = 500'),
    )],
  })), naming.options);
  const { service } = await openRuns(root, {
    agent,
    inputs: treeInputs(),
    git: scripted.git,
    readinessExecution: directReadinessExecution(),
  });
  cleanups.push(() => service.close());
  const receipt = await service.execute(startRun('review-notes'));
  await service.settled('review-notes', receipt.jobId);
  expect(onlyRun(service, 'review-notes').state).toBe('completed');
  scripted.assertComplete();

  const result = JSON.parse(await readFile(runPath(root, 'review-notes', receipt.jobId, iterationLayout.result('wi-001', 1)), 'utf8')) as IterationResult;
  const observations = (await readFile(runPath(root, 'review-notes', receipt.jobId, runLayout.observations(result.invocations[0]!)), 'utf8'))
    .split('\n').filter(Boolean).map(line => JSON.parse(line) as Observation);
  // The port events' recorder and the guard write to the log independently,
  // so each keeps its own order and the two are compared apart.
  const recorded = observations.flatMap((line): Array<Record<string, unknown>> => {
    switch (line.type) {
      case 'activity': {
        const { activity } = line.data;
        if (activity.kind === 'read') return [{ read: activity.path, callId: activity.callId }];
        if (activity.kind === 'search') return [{ search: activity.query, callId: activity.callId }];
        return [];
      }
      case 'excursion':
        return [{ [line.type]: line.data }];
      default:
        return [];
    }
  });
  const guarded = observations.flatMap((line): Array<Record<string, unknown>> => {
    switch (line.type) {
      case 'mutation':
        return [{ [line.type]: line.data }];
      case 'guard': {
        const { tool: _tool, ...decision } = line.data;
        return [{ guard: decision }];
      }
      default:
        return [];
    }
  });
  return {
    neutral: { recorded, guarded },
    guardedTools: observations.flatMap(line => (line.type === 'guard' ? [line.data.tool] : [])),
    badgeUnchanged: await readFile(join(root, outside), 'utf8') === badge,
    stored: await readFile(join(root, store), 'utf8'),
    edited: await readFile(join(root, notesDirectory, 'src', 'notes.ts'), 'utf8'),
    root,
  };
}

describe('ST05: an executor whose tools are named otherwise is recorded and guarded identically', () => {
  test('`Read` with `file_path` and a write tool of another name leave the same reads, excursions and guard decisions', async () => {
    const pi = await engineerRecord(piNames);
    const other = await engineerRecord(otherNames);

    // The records are the same once the project directory is set aside;
    // only the tool names differ, and they are kept for display.
    const relativeTo = (record: typeof pi) => JSON.parse(JSON.stringify(record.neutral).split(record.root).join('<root>')) as unknown;
    expect(relativeTo(other)).toEqual(relativeTo(pi));
    expect(pi.guardedTools).toEqual(['write', 'write', 'edit']);
    expect(other.guardedTools).toEqual(['CreateFile', 'CreateFile', 'ReplaceText']);

    // And what they are is what the calls did.
    const { recorded, guarded } = relativeTo(pi) as Record<'recorded' | 'guarded', ReadonlyArray<Record<string, unknown>>>;
    expect(recorded.filter(line => 'read' in line).map(line => line['read'])).toEqual([
      'subs/workspace/subs/reviews/src/router.ts',
      'subs/workspace/subs/reviews/src/session.ts',
      `${notesDirectory}/src/notes.ts`,
    ]);
    expect(recorded.filter(line => 'search' in line).map(line => line['search'])).toEqual([`noteLimit in ${notesDirectory}`]);
    expect(recorded.filter(line => 'excursion' in line).map(line => line['excursion'])).toEqual([
      { callId: 'call-1', module: 'collection-review/workspace/reviews', firstEntry: true },
    ]);
    expect(guarded.filter(line => 'guard' in line).map(line => (line['guard'] as { verdict: string; requested: string })))
      .toEqual([
        expect.objectContaining({ verdict: 'blocked-scope', requested: outside }),
        expect.objectContaining({ verdict: 'allowed', requested: store }),
        expect.objectContaining({ verdict: 'allowed', requested: `${notesDirectory}/src/notes.ts` }),
      ]);
    for (const record of [pi, other]) {
      expect(record.badgeUnchanged).toBe(true);
      expect(record.stored).toBe('export const store = new Map();\n');
      expect(record.edited).toBe('export const noteLimit = 500;\n');
    }
  }, 240_000);
});
