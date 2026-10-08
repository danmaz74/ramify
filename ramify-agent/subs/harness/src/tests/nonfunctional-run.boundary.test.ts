import { afterEach, expect, test } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { copyFixture } from './helpers/fixture.js';
import { emptyAnalysis, initRepository, installTestRunner, onlyRun, openRuns, runEventsOnDisk, startRun } from './helpers/runs.js';
import { commitTree, gitService } from '../../subs/evidence/src/git.js';
import { RunQueries } from '../projections/queries.js';
import { createAuditWorkspaceOwnership } from '../run/audit-workspaces.js';
import { auditDefinition, commandCheck, privateConfiguredAudit } from './helpers/configured-repository.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

test('an empty fixed catalog records a candidate-bound empty assessment and audits its exact tree', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  await writeFile(join(fixture.root, 'ramify-audit.json'), auditDefinition([
    commandCheck('passes', [{ name: 'passes', cmd: process.execPath, args: ['-e', 'process.exit(0)'] }]),
  ]));
  await initRepository(fixture.root);
  const configured = await privateConfiguredAudit(createAuditWorkspaceOwnership(fixture.root));
  cleanups.push(configured.remove);
  const { service } = await openRuns(fixture.root, { git: gitService,
    configuredAudit: configured.audit,
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
  // The final gate asked the committed audit for a full audit of the bound commit.
  const finalAttempted = events.find(event => event.type === 'gate-attempted' && event.data.gate === bound.data.gate);
  expect(finalAttempted).toBeDefined();
}, 30_000);

