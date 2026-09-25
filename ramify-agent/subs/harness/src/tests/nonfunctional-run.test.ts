import { afterEach, expect, test } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { copyFixture } from './helpers/fixture.js';
import { emptyAnalysis, initRepository, installTestRunner, onlyRun, openRuns, runEventsOnDisk, startRun } from './helpers/runs.js';
import { commitTree, gitService } from '../../subs/evidence/src/git.js';
import { createAuditCheckExecution } from '../../subs/audit/src/check-execution.js';
import { RunQueries } from '../projections/queries.js';
import { createAuditWorkspaceOwnership } from '../run/audit-workspaces.js';
import { createPassingCheckExecution } from './helpers/direct-check-execution.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

test('an empty fixed catalog records a candidate-bound empty assessment and audits its exact tree', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  await initRepository(fixture.root);
  const { service } = await openRuns(fixture.root, { git: gitService,
    checkExecution: createAuditCheckExecution({ workspaceOwnership: createAuditWorkspaceOwnership(fixture.root) }),
    script: [{ kind: 'submit', input: emptyAnalysis() }] });
  cleanups.unshift(() => service.close());

  const receipt = await service.execute(startRun('review-notes'));
  await service.settled('review-notes', receipt.jobId);
  const run = onlyRun(service, 'review-notes');
  expect(run.failure).toBeNull();
  expect(run.state).toBe('completed');
  const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
  const prepared = events.find(event => event.type === 'candidate-prepared');
  const assessed = events.find(event => event.type === 'nonfunctional-assessed');
  const bound = events.find(event => event.type === 'candidate-bound-to-gate');
  expect(prepared?.type).toBe('candidate-prepared');
  expect(assessed?.type).toBe('nonfunctional-assessed');
  expect(bound?.type).toBe('candidate-bound-to-gate');
  if (prepared?.type !== 'candidate-prepared' || bound?.type !== 'candidate-bound-to-gate') return;
  expect(bound.data.tree).toBe(prepared.data.tree);
  expect(await commitTree(fixture.root, bound.data.commit)).toBe(prepared.data.tree);
  const readiness = await new RunQueries(service).mergeReadiness('review-notes', receipt.jobId,
    service.getRun('review-notes', receipt.jobId)!.version);
  expect(readiness.readiness.status, readiness.readiness.reason).toBe('ready');
  expect(readiness.readiness).toMatchObject({ candidate: { tree: prepared.data.tree },
    finalGate: bound.data.gate, gateCommit: bound.data.commit, checkFindings: [] });
}, 30_000);

test('a mutation during final verification refuses completion after auditing the assessed commit', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  await initRepository(fixture.root);
  const passing = createPassingCheckExecution();
  const { service } = await openRuns(fixture.root, {
    git: gitService,
    script: [{ kind: 'submit', input: emptyAnalysis() }],
    checkExecution: {
      async run(checks, request) {
        const result = await passing.run(checks, request);
        if (request.context.checkpoint === 'final') {
          await writeFile(join(fixture.root, 'late-source.ts'), 'export const late = true;\n');
        }
        return result;
      },
    },
  });
  cleanups.unshift(() => service.close());
  const receipt = await service.execute(startRun('review-notes'));
  await service.settled('review-notes', receipt.jobId);
  const run = onlyRun(service, 'review-notes');
  expect(run.state).toBe('failed');
  expect(run.failure?.reason).toBe('inputs-changed');
  const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
  expect(events.some(event => event.type === 'candidate-bound-to-gate')).toBe(true);
  expect(events.some(event => event.type === 'job-completed')).toBe(false);
}, 30_000);
