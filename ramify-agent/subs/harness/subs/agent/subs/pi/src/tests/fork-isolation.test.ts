import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, expect, test } from 'vitest';
import type { ToolDefinition } from '../../../../src/interfaces/port.js';
import { startPi, validMap, workspace } from './helpers/session.js';
import { call, text } from './helpers/scripted-provider.js';

/*
 * A reviewer's fork of another role's session, through the real pi adapter
 * on the offline scripted provider (Plan 12 iteration 4). The parent is an
 * architect-like session in the project directory with pi's read tools; the
 * fork runs in a directory of its own with no built-in tool and one
 * harness tool standing for the snapshot tools. What makes the fork
 * isolated is the tool set it is given, not its working directory: the
 * fork still holds what its parent read before the point, and pi would
 * record the parent's directory in the fork's header unless it is told
 * otherwise.
 */

beforeAll(() => { process.env.PI_OFFLINE = '1'; });
const hadPiDirectory = existsSync(join(homedir(), '.pi'));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const snapshotRead: ToolDefinition = {
  name: 'snapshot_read',
  description: 'Read a file of the audited candidate.',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
  async execute() { return { text: 'const store = 1; // the audited candidate' }; },
};

test('a fork from a pinned point in another directory holds the parent\'s history to the point, and only the tools it was given', async () => {
  const project = await workspace(cleanups, { 'live.ts': 'const store = 3; // the live tree' });
  const parent = await startPi(cleanups, [call('read', { path: 'live.ts' }, 'c-1'), text('reply ALPHA')], { reuse: project, role: 'local-architect' });
  await parent.session.outcome;
  const point = parent.session.ref;

  // The parent runs on past the point.
  const later = await startPi(cleanups, [text('reply BETA')], { reuse: project, role: 'local-architect', session: { mode: 'continue', ref: point } });
  await later.session.outcome;

  // The reviewer's own directory and session directory, as the harness gives one.
  const own = await mkdtemp(join(tmpdir(), 'ramify-agent-pi-reviewer-'));
  cleanups.push(() => rm(own, { recursive: true, force: true }));
  const reviewer = { workingDirectory: join(own, 'workspace'), sessionDirectory: join(own, 'session') };
  await mkdir(reviewer.workingDirectory);
  await mkdir(reviewer.sessionDirectory);
  await writeFile(join(reviewer.workingDirectory, 'module.ramify'), 'ramify 1\nmodule demo\n');

  const fork = await startPi(cleanups, [
    // Its parent's read tool is gone, even for the parent's own path.
    call('read', { path: join(project.workingDirectory, 'live.ts') }, 'r-1'),
    call('snapshot_read', { path: 'store.ts' }, 'r-2'),
    call('submit_implementation_map', validMap, 'r-3'),
  ], {
    reuse: reviewer,
    role: 'reviewer',
    systemPrompt: 'You are the reviewer. Exactly this prompt.',
    session: { mode: 'fork', from: point },
    builtinTools: [],
    tools: [snapshotRead],
  });
  expect(fork.session.start).toEqual({ mode: 'fork' });
  const outcome = await fork.session.outcome;
  expect(outcome.kind).toBe('submitted');

  // The fork's model sees the parent's history up to the point, including
  // what the parent read from the live tree then, and nothing after it.
  const first = fork.requestText(0);
  expect(first).toContain('ALPHA');
  expect(first).toContain('the live tree');
  expect(first).not.toContain('BETA');
  expect(fork.scripted.requests[0]!.systemPrompt).toBe('You are the reviewer. Exactly this prompt.');
  // Only the tools the fork was given are offered, whatever its parent had.
  expect(fork.toolNames(0)).toEqual(['snapshot_read', 'submit_implementation_map']);
  const finished = fork.events.filter(event => event.type === 'tool-finished');
  expect(finished).toContainEqual(expect.objectContaining({ callId: 'r-1', isError: true }));
  expect(finished).toContainEqual(expect.objectContaining({ callId: 'r-2', tool: 'snapshot_read', isError: false }));
  expect(fork.requestText(1)).toContain('Tool read not found');
  expect(fork.requestText(2)).toContain('the audited candidate');

  // The fork is a file of the reviewer's own session directory, and its
  // header names the reviewer's directory, not the project's.
  const forkFile = fork.session.ref.slice(0, fork.session.ref.lastIndexOf('#'));
  expect(forkFile.startsWith(reviewer.sessionDirectory)).toBe(true);
  const header = JSON.parse(readFileSync(forkFile, 'utf8').split('\n')[0]!) as { type: string; cwd: string };
  expect(header).toMatchObject({ type: 'session', cwd: reviewer.workingDirectory });
  expect(header.cwd).not.toBe(project.workingDirectory);
});

test('leaves the person\'s pi directory alone', () => {
  expect(existsSync(join(homedir(), '.pi'))).toBe(hadPiDirectory);
});
