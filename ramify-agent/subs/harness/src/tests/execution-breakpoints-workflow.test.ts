import { afterEach, expect, test } from 'vitest';
import { completionProposed, submit, write } from './helpers/iterations.js';
import { reviewRun, reviewTarget, eventsOf, plan, store, limit, notesDirectory, tool, revisionGates, unchanged } from './helpers/reviews.js';
import { mappedAudit } from './helpers/direct-check-execution.js';
import { until } from './helpers/runs.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

test('B16: explanatory exchanges resume through gates, reviews, architect handling and a distinct later engineer boundary', async () => {
  const root = await reviewTarget(cleanups);
  const opened = await reviewRun(root, cleanups, { detached: true, breakpoint: 'before-agent:engineer',
    gates: [revisionGates[0]!, unchanged, revisionGates[1]!, revisionGates[2]!, unchanged, unchanged],
    engineer: [[{ kind: 'message', text: 'The normal store task is understood.' }, { kind: 'end', message: 'The normal store task is understood.' }],
      [{ kind: 'message', text: 'The test belongs with this owner.' }, { kind: 'end', message: 'The test belongs with this owner.' }],
      submit(completionProposed(), write(store, 'export const store = new Map(); // v1\n')), submit(completionProposed(), write(store, 'export const store = new Map(); // v1\n')), submit(completionProposed(), write(limit, 'export const limit = (text: string) => text.length <= 50;\n')), submit(completionProposed(), write(store, 'export const store = new Map(); // v3\n'), write(`${notesDirectory}/src/index.ts`, "export * from './store.js';\n"))],
    configuredAudit: mappedAudit(({ context, check }) => context.attemptId === 'ga-0002' && check.kind === 'tests'
      ? { outcome: { kind: 'completed', exitCode: 1 }, stdout: 'The ordinary regression failed.' } : {}),
    reviewers: Object.fromEntries([[store], [limit], [store, `${notesDirectory}/src/index.ts`]].flatMap((paths, i) => [0, 1].map(offset => [`rq-${String(i * 2 + offset + 1).padStart(4, '0')}`, [...paths.map(path => tool('snapshot_diff', { path })), ...submit({ inspected: paths, missing: [], concerns: [] })]]))) });
  cleanups.push(() => opened.service.close());
  const { service, runId } = opened;
  await until(() => service.debugState(plan, runId)?.state === 'paused');
  const first = service.debugState(plan, runId)!;
  for (const [index, text] of ['Explain without editing or submitting.', 'Where should the regression live?'].entries()) {
    const commandId = `workflow-message-${index}`;
    await service.execute({ commandId, expectedVersion: 0, type: 'debug-message', payload: {
      planId: plan, jobId: runId, pauseId: first.pauseId, expectedRevision: index + 1, message: text } });
    await until(() => service.debugResult(plan, runId, commandId)?.status === 'settled');
    expect(service.debugResult(plan, runId, commandId)?.taskState).toBe('pending');
  }
  expect(eventsOf(service.events(plan, runId)!, 'iteration-closed')).toHaveLength(0);
  await service.execute({ commandId: 'workflow-release-first', expectedVersion: 0, type: 'debug-resume', payload: {
    planId: plan, jobId: runId, pauseId: first.pauseId, expectedRevision: 3, message: 'Now implement the ordinary assignment.' } });
  await until(() => service.debugState(plan, runId)?.state === 'paused' && service.debugState(plan, runId)?.pauseId !== first.pauseId);
  const later = service.debugState(plan, runId)!;
  expect(later.work.iteration).toBe(first.work.iteration);
  expect(later.goal).toBe(first.goal);
  expect(eventsOf(service.events(plan, runId)!, 'iteration-closed')).toHaveLength(0);
  expect(service.events(plan, runId)!.some(event => event.type === 'gate-attempted')).toBe(true);
  // The remaining ordinary assignments also park once each and are explicitly released.
  const occurrences = new Set([first.pauseId]);
  while (!['completed', 'failed', 'stopped', 'interrupted'].includes(service.getRun(plan, runId)!.state)) {
    const current = service.debugState(plan, runId);
    if (current?.state === 'paused' && !occurrences.has(current.pauseId)) {
      occurrences.add(current.pauseId);
      await service.execute({ commandId: `workflow-release-${current.pauseId}`, expectedVersion: 0, type: 'debug-resume', payload: {
        planId: plan, jobId: runId, pauseId: current.pauseId, expectedRevision: current.revision } });
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  await service.settled(plan, runId);
  expect(service.getRun(plan, runId)?.state, JSON.stringify(service.getRun(plan, runId)?.failure)).toBe('completed');
  expect(occurrences.size).toBe(4);
  const events = service.events(plan, runId)!;
  expect(eventsOf(events, 'iteration-closed')).toHaveLength(3);
  expect(events.some(event => event.type === 'review-attempt-finished')).toBe(true);
  expect(opened.agent!.sessions.filter(session => session.spec.role === 'engineer')).toHaveLength(6);
  opened.git.assertComplete();
}, 30_000);
