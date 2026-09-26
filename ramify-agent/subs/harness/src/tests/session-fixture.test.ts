import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { startServerWith, type RunningServer } from '../http/server.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { runResponseSchema } from '../interfaces/protocol/runs.js';
import {
  runSessionsResponseSchema, sessionListResponseSchema, sessionUpdatesResponseSchema, type RunSessionView,
} from '../interfaces/protocol/sessions.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { copyFixture } from './helpers/fixture.js';
import { installTestRunner, until } from './helpers/runs.js';
import { addSessionRuns, liveRunSettings, Pacer, startLiveRun, type FinishedSessionRuns, type LiveRunSettings } from './helpers/session-fixture.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * The session fixture over HTTP, read by a plain Node client with the
 * protocol's schemas: sessions in every state and every lineage relation,
 * which `serve-progress-fixture.ts` serves to the built web client. The live
 * run is driven by the serving process, and its paced engineer receives
 * entries step by step until it is let finish.
 */

let fixture: { root: string; remove: () => Promise<void> };
let runs: FinishedSessionRuns;
let server: RunningServer;
let settings: LiveRunSettings;
let live: { planId: string; runId: string; engineer: string };
const pacer = new Pacer(3);

beforeAll(async () => {
  fixture = await copyFixture();
  await installTestRunner(fixture.root);
  runs = await addSessionRuns(fixture.root);
  settings = liveRunSettings(fixture.root, pacer);
  server = await startServerWith({
    projectRoot: fixture.root, port: 0, assetsDirectory: join(fixture.root, 'no-such-build'), ramify: new FakeRamifyCli(),
    agent: settings.agent, runs: settings.runs,
  });
  live = await startLiveRun(server.url, fixture.root);
}, 240_000);

afterAll(async () => {
  try {
    await server?.close();
    await fixture?.remove();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

async function get<T>(path: string, schema: { parse(value: unknown): T }): Promise<T> {
  const response = await fetch(`${server.url}${path}`);
  expect([path, response.status]).toEqual([path, 200]);
  return schema.parse(await response.json());
}

const sessionsOf = async (run: { planId: string; runId: string }) => (await get(protocolPaths.runSessions(run.planId, run.runId), runSessionsResponseSchema)).sessions;
const byRole = (sessions: readonly RunSessionView[], role: string) => sessions.filter(session => session.role === role);

describe('the session fixture over HTTP', () => {
  test('lineage: forks, appends, continuations, a requested session, a replacement and a degraded start, all finished', async () => {
    expect(runs.lineage.state).toBe('completed');
    const sessions = await sessionsOf(runs.lineage);
    expect(sessions.every(session => session.state === 'finished')).toBe(true);
    // The intake is ses-0001; the architect context is the initial architect's.
    const architect = sessions.find(session => session.session === 'ses-0002')!;
    expect(architect.role).toBe('initial-architect');
    expect(architect.reaches).toEqual({ kind: 'run' });
    expect(architect.appends.length).toBeGreaterThan(0);
    expect(architect.lineage.forks.length).toBeGreaterThan(0);
    expect(byRole(sessions, 'global-fork')[0]!.lineage.fork).toMatchObject({ from: { session: 'ses-0002' }, reason: 'placement-request' });
    expect(sessions.flatMap(session => session.invocations).some(invocation => invocation.continues?.reason === 'iteration-closed')).toBe(true);
    expect(byRole(sessions, 'contract-engineer')[0]!.lineage.requestedBy).toMatchObject({ reason: 'contract-needed' });
    const reconstruction = sessions.find(session => session.lineage.replaces !== null)!;
    expect(reconstruction).toMatchObject({ role: 'engineer', lineage: { replaces: { reason: 'reconstructed' } } });
    expect(sessions.find(session => session.session === reconstruction.lineage.replaces!.session)).toMatchObject({ finished: 'replaced' });
    expect(sessions.flatMap(session => session.invocations).filter(invocation => invocation.degraded !== null).map(invocation => invocation.degraded))
      .toContainEqual(expect.objectContaining({ requested: 'fork', actual: 'fresh' }));
    // The project's list and the run's snapshot count the degraded starts the log records.
    const degraded = sessions.map(session => [session.session, session.invocations.filter(invocation => invocation.degraded !== null).length] as const)
      .filter(([, count]) => count > 0);
    const list = await get(protocolPaths.sessions(), sessionListResponseSchema);
    expect(list.sessions.filter(entry => entry.ref.source === 'run' && entry.ref.runId === runs.lineage.runId && entry.degradedStarts > 0)
      .map(entry => [entry.ref.session, entry.degradedStarts]).sort()).toEqual([...degraded].sort());
    const { run } = await get(protocolPaths.run(runs.lineage.planId, runs.lineage.runId), runResponseSchema);
    expect(run.counts.degradedStarts).toBe(degraded.reduce((total, [, count]) => total + count, 0));
  });

  test('interrupted: a stopped run whose architect its log leaves live', async () => {
    expect(runs.interrupted.state).toBe('stopped');
    const [intake, architect] = await sessionsOf(runs.interrupted);
    expect(intake).toMatchObject({ session: 'ses-0001', role: 'catalog-extractor', state: 'finished', awaiting: null });
    expect(architect).toMatchObject({ session: 'ses-0002', role: 'initial-architect', state: 'interrupted', awaiting: 'inv-0002', reaches: { kind: 'run' } });
  });

  test('live: the served run\'s engineer is live, its local architect and the architect context suspended, the fork finished', async () => {
    const sessions = await sessionsOf(live);
    expect(sessions.map(session => [session.session, session.role, session.state])).toEqual([
      ['ses-0001', 'catalog-extractor', 'finished'],
      ['ses-0002', 'initial-architect', 'suspended'],
      ['ses-0003', 'catalog-extractor', 'finished'],
      ['ses-0004', 'local-architect', 'suspended'],
      ['ses-0005', 'context-selector', 'finished'],
      ['ses-0006', 'global-fork', 'finished'],
      ['ses-0007', 'engineer', 'live'],
    ]);
    expect(live.engineer).toBe('ses-0007');
    expect(byRole(sessions, 'engineer')[0]!.reaches).toEqual({ kind: 'work-item', workItem: 'wi-001', capability: 'badge-tone', module: 'collection-review/workspace/shared-ui' });
    expect(byRole(sessions, 'global-fork')[0]!.reaches).toMatchObject({ kind: 'request', capability: 'badge-tone' });
    // The project's list: live and suspended first, across the runs.
    const list = await get(protocolPaths.sessions(), sessionListResponseSchema);
    expect(list.sessions.slice(0, 3).map(entry => entry.state)).toEqual(['live', 'suspended', 'suspended']);
    expect(list.sessions.map(entry => entry.state)).toContain('interrupted');
  });

  test('live: each step adds entries to the engineer\'s transcript, and finishing it completes the run', async () => {
    const { planId, runId, engineer } = live;
    const version = (await get(protocolPaths.runSessions(planId, runId), runSessionsResponseSchema)).version;
    const opening = await get(protocolPaths.runSessionUpdates(planId, runId, version, [{ session: engineer, after: 0 }]), sessionUpdatesResponseSchema);
    const cursor = opening.transcripts[0]!.page.cursor;
    expect(pacer.step()).toBe(true);
    let after = opening;
    await until(async () => {
      after = await get(protocolPaths.runSessionUpdates(planId, runId, version, [{ session: engineer, after: cursor }]), sessionUpdatesResponseSchema);
      return after.transcripts[0]!.page.entries.length > 0;
    });
    expect(after.sessions).toEqual([]);
    expect(after.transcripts[0]!.page.entries[0]!).toMatchObject({ n: cursor + 1, type: 'message', invocation: expect.stringMatching(/^inv-/) });

    pacer.finish();
    await until(async () => runResponseSchema.parse(await (await fetch(`${server.url}${protocolPaths.run(planId, runId)}`)).json()).run.state === 'completed', 60_000);
    const ended = await get(protocolPaths.runSessionUpdates(planId, runId, version, [{ session: engineer, after: cursor }]), sessionUpdatesResponseSchema);
    expect(ended.sessions.map(session => [session.session, session.state]).sort()).toEqual([
      ['ses-0002', 'finished'], ['ses-0004', 'finished'], ['ses-0007', 'finished'],
    ]);
    settings.git.assertComplete();
  }, 90_000);
});
