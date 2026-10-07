import { readFile } from 'node:fs/promises';
import { afterEach, expect, test } from 'vitest';
import { gitService } from '../../subs/evidence/src/git.js';
import { copyCapabilityFixture } from './helpers/capability.js';
import { initRepository, openRuns, runEventsOnDisk, runPath, startRun, until } from './helpers/runs.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

test('CA24: production restart preserves an incomplete historical run and refuses its old workflow', async () => {
  const fixture = await copyCapabilityFixture();
  cleanups.push(fixture.remove);
  await initRepository(fixture.root);

  const historical = await openRuns(fixture.root, {
    git: gitService,
    script: spec => spec.role === 'initial-architect' ? [{ kind: 'wait', ms: 60_000 }] : [],

  });
  cleanups.push(() => historical.service.close());
  const receipt = await historical.service.execute(startRun('need'));
  await until(() => (historical.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'invocation-started' && event.data.role === 'initial-architect'));
  const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  expect(before.some(event => event.type === 'job-interrupted' || event.type === 'job-failed' || event.type === 'job-completed')).toBe(false);
  await historical.service.close();

  const reopened = await openRuns(fixture.root, {
    production: true, git: gitService, script: () => [],

  });
  cleanups.push(() => reopened.service.close());
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  const interruptions = events.filter(event => event.type === 'job-interrupted');
  expect(interruptions).toHaveLength(1);
  expect(interruptions[0]?.type === 'job-interrupted' ? interruptions[0].data.message : null)
    .toContain('Unsupported historical workflow run-policy/4');
  expect(events.some(event => event.type === 'capability-delegated' || event.type === 'capability-handed-back')).toBe(false);
  expect(events.some(event => event.type === 'job-completed' || event.type === 'job-failed')).toBe(false);
  expect(events.filter(event => event.type === 'invocation-started').length)
    .toBe(before.filter(event => event.type === 'invocation-started').length);
  expect(reopened.service.getRun('need', receipt.jobId)?.state).toBe('interrupted');
  const record = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId, 'job.json'), 'utf8')) as {
    policy: { version: string };
  };
  expect(record.policy.version).toBe('run-policy/4');
  expect(reopened.service.events('need', receipt.jobId)?.at(-1)?.type).toBe('job-interrupted');
}, 30_000);
