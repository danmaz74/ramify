import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { copyFixture } from './helpers/fixture.js';
import { emptyAnalysis, onlyRun, openRuns, runEventsOnDisk, startRun } from './helpers/runs.js';
import { RunQueries } from '../projections/queries.js';

import { nfrBoundaries } from './helpers/nonfunctional-boundaries.js';
import { resetSpawnAttempts, spawnAttempts } from './helpers/process-guard.js';
vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});
beforeEach(resetSpawnAttempts);
const answers: ReturnType<typeof nfrBoundaries>[] = [];

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  const errors: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) try { await cleanup(); } catch (error) { errors.push(error); }
  for (const answer of answers.splice(0)) try { answer.assertComplete(); } catch (error) { errors.push(error); }
  try { expect(spawnAttempts(), 'ordinary NFR setup/flow/teardown process attempts').toEqual([]); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(errors, 'NFR fixture teardown failed');
});

test('an empty fixed catalog records a candidate-bound empty assessment and audits its exact tree', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = nfrBoundaries(fixture.root);
  answers.push(boundaryAnswers);
  const { service } = await openRuns(fixture.root, { ...boundaryAnswers.options,
    script: [{ kind: 'submit', input: emptyAnalysis() }] });
  cleanups.push(() => service.close());

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
  expect(await boundaryAnswers.options.candidates.commitTree(fixture.root, bound.data.commit)).toBe(prepared.data.tree);
  const readiness = await new RunQueries(service).mergeReadiness('review-notes', receipt.jobId,
    service.getRun('review-notes', receipt.jobId)!.version);
  expect(readiness.readiness.status, readiness.readiness.reason).toBe('ready');
  expect(readiness.readiness).toMatchObject({ candidate: { tree: prepared.data.tree },
    finalGate: bound.data.gate, gateCommit: bound.data.commit, checkFindings: [] });
  // The final gate asked the committed audit for a full audit of the bound commit.
  const finalAttempted = events.find(event => event.type === 'gate-attempted' && event.data.gate === bound.data.gate);
  expect(finalAttempted).toBeDefined();
}, 30_000);

test('a mutation during final verification refuses completion after auditing the assessed commit', async () => {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  const boundaryAnswers = nfrBoundaries(fixture.root);
  answers.push(boundaryAnswers);
  boundaryAnswers.afterFinalAudit = async () => {
    await writeFile(join(fixture.root, 'late-source.ts'), 'export const late = true;\n');
    boundaryAnswers.drift('late-source.ts');
  };
  const { service } = await openRuns(fixture.root, { ...boundaryAnswers.options,
    script: [{ kind: 'submit', input: emptyAnalysis() }] });
  cleanups.push(() => service.close());
  const receipt = await service.execute(startRun('review-notes'));
  await service.settled('review-notes', receipt.jobId);
  const run = onlyRun(service, 'review-notes');
  expect(run.state).toBe('failed');
  expect(run.failure?.reason).toBe('inputs-changed');
  const events = await runEventsOnDisk(fixture.root, 'review-notes', receipt.jobId);
  expect(events.some(event => event.type === 'candidate-bound-to-gate')).toBe(true);
  expect(events.some(event => event.type === 'job-completed')).toBe(false);
  expect(await readFile(join(fixture.root, 'late-source.ts'), 'utf8')).toBe('export const late = true;\n');
}, 30_000);
