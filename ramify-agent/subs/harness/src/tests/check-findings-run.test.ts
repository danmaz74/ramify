import { readFile, rm } from 'node:fs/promises';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { checkFindingLayout } from '../check-findings/records.js';
import type { RunService } from '../run/service.js';
import { concern, decision, dispose, failure, report } from './helpers/check-findings.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { copyFixture } from './helpers/fixture.js';
import {
  approveRun, emptyAnalysis, installTestRunner, onlyRun, runEventsOnDisk, runPath, staleCrashLock, startRun, until,
} from './helpers/runs.js';
import { assertUnchangedGit, openUnchangedRuns as openRuns } from './helpers/unchanged-run.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * CheckFindings of a run the service drives (appendix §2): every change is
 * one `check-findings-recorded` line decided under the run's own mutex, so
 * concurrent deliveries of one report are one issue; a terminal run accepts
 * none; the run's gates keep their verdicts whatever the CheckFindings say;
 * and a restart rebuilds the CheckFindings and their record copies from the
 * log alone, calling no agent. The run waits at its review stop, so nothing
 * else writes while the test delivers.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

const plan = 'review-notes';
const finalVerification = `final verification of plan "${plan}"`;
const cause = { kind: 'producer', producer: 'review:code', attempt: 'rq-0001.a01' } as const;

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  return fixture.root;
}

async function waiting(service: RunService, commandId: string): Promise<string> {
  const receipt = await service.execute(startRun(plan, 'scripted', commandId, true));
  await until(() => service.getRun(plan, receipt.jobId)?.phase === 'awaiting-review');
  return receipt.jobId;
}

describe('CheckFindings of a driven run', () => {
  test('concurrent deliveries of one report are one issue, gates keep their verdicts, and a terminal run accepts none', async () => {
    const root = await target();
    const { service } = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }], unchangedCheckpoints: [finalVerification] });
    cleanups.push(() => service.close());
    const runId = await waiting(service, 'start-cf-live');

    const deliveries = await Promise.all([
      ...Array.from({ length: 3 }, () => service.recordCheckFindings(plan, runId, { cause, commands: [report(concern())] })),
      service.recordCheckFindings(plan, runId, {
        cause: { kind: 'producer', producer: 'check:scenario', attempt: 'ga-0005' },
        commands: [report(failure({ attempt: 'ga-0005', subject: 'scenario:sc-004', tree: 't-02' }))],
      }),
    ]);
    expect(deliveries.map(delivery => delivery?.kind).sort()).toEqual(['committed', 'committed', 'replayed', 'replayed']);
    const list = service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all' });
    expect(list).toMatchObject({ ok: true, view: { total: 2, items: [{ id: 'cf-0001', standing: 'open' }, { id: 'cf-0002', standing: 'open', verification: { kind: 'check', required: true } }] } });
    expect((await runEventsOnDisk(root, plan, runId)).filter(event => event.type === 'check-findings-recorded')).toHaveLength(2);
    expect(await service.recordCheckFindings(plan, 'no-such-run', { cause, commands: [report(concern())] })).toBeUndefined();

    // An open required CheckFinding does not touch a gate: the run passes its gates and completes.
    await service.execute(approveRun(plan, runId, service.getRun(plan, runId)!.version));
    await service.settled(plan, runId);
    expect(onlyRun(service, plan)).toMatchObject({ state: 'completed' });
    const events = await runEventsOnDisk(root, plan, runId);
    expect(events.filter(event => event.type === 'gate-attempted').map(event => event.data)).toEqual([
      expect.objectContaining({ checkpoint: 'final', verdict: 'passed' }),
    ]);
    expect(events.filter(event => event.type === 'readiness-passed')).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: 'job-completed' });

    // The run has ended: nothing more is recorded, and its CheckFindings stand as they were.
    const version = service.getRun(plan, runId)!.version;
    const late = await service.recordCheckFindings(plan, runId, { cause, commands: [report(concern({ key: 'concern-02', summary: 'A late concern' }))] });
    expect(late).toMatchObject({ kind: 'refused', refusal: { reason: 'run-ended' } });
    expect(service.getRun(plan, runId)!.version).toBe(version);
    expect(service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all' })).toEqual(list);
  }, 120_000);

  test('a crash rebuilds CheckFindings and their record copies from the log, and a restart calls no agent', async () => {
    const root = await target();
    const crashed = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    const runId = await waiting(crashed.service, 'start-cf-crash');
    await crashed.service.recordCheckFindings(plan, runId, { cause, commands: [report(concern())] });
    const planned = await crashed.service.recordCheckFindings(plan, runId, {
      cause: { kind: 'recovery', detail: 'a reconciliation planned the repair' },
      commands: [dispose('cf-0001', 1, decision({ action: 'plan-repair', repair: { kind: 'intent', ref: 'wi-001.rc01' } }))],
    });
    expect(planned).toMatchObject({ kind: 'committed' });
    const list = crashed.service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all' });
    const detail = crashed.service.checkFindings(plan, runId, { kind: 'detail', checkFinding: 'cf-0001' });
    expect(detail).toMatchObject({ ok: true, view: { summary: { reason: 'repair-planned', repair: { kind: 'intent', ref: 'wi-001.rc01' } } } });

    // The crash loses the record copies too; the log is the authority.
    await rm(runPath(root, plan, runId, 'check-findings'), { recursive: true });
    await staleCrashLock(root);

    const restarted = await openRuns(root, { script: [] });
    cleanups.push(() => restarted.service.close());
    expect(restarted.recovery.interrupted).toEqual([`${plan}/${runId}`]);
    expect(restarted.recovery.rematerialized).toEqual([`${plan}/${runId}: 2 record file(s)`]);
    expect(restarted.agent!.sessions).toHaveLength(0);
    expect(restarted.service.checkFindings(plan, runId, { kind: 'list', owner: null, select: 'all' })).toEqual(list);
    expect(restarted.service.checkFindings(plan, runId, { kind: 'detail', checkFinding: 'cf-0001' })).toEqual(detail);
    expect(JSON.parse(await readFile(runPath(root, plan, runId, checkFindingLayout.decision('cf-0001', 'cfd-0001')), 'utf8')))
      .toMatchObject({ schema: 'ramify-agent.check-finding-decision/1', checkFinding: 'cf-0001', revision: 2 });

    // The recovered run is interrupted, and a redelivery after it changes nothing.
    expect(await restarted.service.recordCheckFindings(plan, runId, { cause, commands: [report(concern())] }))
      .toMatchObject({ kind: 'refused', refusal: { reason: 'run-ended' } });
    expect((await runEventsOnDisk(root, plan, runId)).filter(event => event.type === 'check-findings-recorded')).toHaveLength(2);
  }, 120_000);
});
