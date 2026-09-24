import { afterEach, describe, expect, it, vi } from 'vitest';
import { executionCoreOf, executionCapabilityDetailOf, executionScenarioDetailOf } from '../projections/execution-map.js';
import { runView } from '../projections/inputs.js';
import { RunQueries } from '../projections/queries.js';
import type { RunService } from '../run/service.js';
import { analysis, entry } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { installTestRunner, startRun, stopRun, until } from './helpers/runs.js';
import { assertUnchangedGit, openUnchangedRuns } from './helpers/unchanged-run.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  try {
    for (const release of cleanup.splice(0).reverse()) await release();
    assertUnchangedGit();
    expectNoProcesses();
  } finally { forgetExternalTools(); }
});

function indexOf(service: RunService, runId: string) {
  const committed = service.committed('review-notes', runId);
  if (committed === undefined) throw new Error(`Missing committed run ${runId}`);
  const view = runView(committed);
  return { index: executionCoreOf(view), view };
}

describe('execution projection over a persisted run', () => {
  it('replays the same complete roots, scenario blocks and sessions after service restart', async () => {
    const fixture = await copyFixture();
    cleanup.push(fixture.remove);
    await installTestRunner(fixture.root);
    const accepted = analysis([
      entry('first-root', 'collection-review/workspace/reviews', 'The first complete capability description.'),
      entry('second-root', 'collection-review', 'The second complete capability description.'),
    ]);
    const first = await openUnchangedRuns(fixture.root, { script: [{ kind: 'submit', input: accepted }] });
    cleanup.push(() => first.service.close());
    const receipt = await first.service.execute(startRun('review-notes', 'scripted', 'start-map', true));
    await until(() => first.service.getRun('review-notes', receipt.jobId)?.phase === 'awaiting-review');
    const beforeStop = indexOf(first.service, receipt.jobId);
    const queries = new RunQueries(first.service);
    expect(await queries.executionCore('review-notes', receipt.jobId)).toEqual(beforeStop.index);
    expect(beforeStop.index.nodes.filter(node => node.kind === 'capability').map(node => node.key))
      .toEqual(['capability:first-root', 'capability:second-root']);
    expect(beforeStop.index.nodes.filter(node => node.kind === 'scenario')).toHaveLength(2);
    expect(beforeStop.index.nodes.filter(node => node.kind === 'work-item')).toHaveLength(2);
    expect(beforeStop.index.nodes.filter(node => node.kind === 'session')).toHaveLength(1);
    expect(executionCapabilityDetailOf(beforeStop.view, 'first-root').detail).toMatchObject({
      state: 'available', description: 'The first complete capability description.',
    });
    expect((await queries.executionCapabilityDetail('review-notes', receipt.jobId, 'first-root')).detail).toMatchObject({
      state: 'available', description: 'The first complete capability description.',
    });
    const scenarioId = beforeStop.index.nodes.find(node => node.kind === 'scenario')?.key.slice('scenario:'.length);
    if (scenarioId === undefined) throw new Error('Missing tracked scenario');
    expect(executionScenarioDetailOf(beforeStop.view, scenarioId).detail).toMatchObject({ state: 'available', source: expect.arrayContaining([expect.stringMatching(/^Scenario:/)]) });
    expect((await queries.executionScenarioDetail('review-notes', receipt.jobId, scenarioId)).detail.state).toBe('available');

    const version = first.service.getRun('review-notes', receipt.jobId)!.version;
    await first.service.execute(stopRun('review-notes', receipt.jobId, version));
    await first.service.settled('review-notes', receipt.jobId);
    const settled = indexOf(first.service, receipt.jobId);
    await first.service.close();

    const reopened = await openUnchangedRuns(fixture.root, { script: [] });
    cleanup.push(() => reopened.service.close());
    const replayed = indexOf(reopened.service, receipt.jobId);
    expect(replayed.index).toEqual(settled.index);
    expect(executionCapabilityDetailOf(replayed.view, 'first-root')).toEqual(executionCapabilityDetailOf(settled.view, 'first-root'));
    expect(executionScenarioDetailOf(replayed.view, scenarioId)).toEqual(executionScenarioDetailOf(settled.view, scenarioId));
  }, 120_000);
});
