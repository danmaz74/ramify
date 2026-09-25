import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { inputManifestSchema } from '../interfaces/protocol/evidence.js';
import { RunLog } from '../run/log.js';
import { defaultRunPolicy } from '../run/policy.js';
import { legacyNonfunctionalCoverage } from '../run/nonfunctional-records.js';
import { planRefSchema, runRecordSchema } from '../run/records.js';
import { constructedRecord, runId } from './helpers/constructed.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

it('reads an old single-plan record and replays its terminal stream as coverage unavailable', async () => {
  const current = defaultRunPolicy({ projectRoot: '/tmp/legacy-project', nested: [] });
  const { nonfunctionalRoundsPerPlan: _rounds, ...oldLimits } = current.limits;
  const { 'context-selector': _selector, 'nonfunctional-coordinator': _coordinator, 'nonfunctional-repair-engineer': _repair, ...oldContext } = current.context;
  const record = runRecordSchema.parse(constructedRecord({ policy: { ...current, version: 'run-policy/3', limits: oldLimits, context: oldContext } }));
  expect(record.manifest.documentManifest).toBeUndefined();
  expect(inputManifestSchema.safeParse(record.manifest).success).toBe(true);
  expect(planRefSchema.parse({ lines: [1, 2] }).document).toBeUndefined();
  const directory = await mkdtemp(join(tmpdir(), 'plan13-legacy-'));
  directories.push(directory);
  const log = await RunLog.open(join(directory, 'events.jsonl'), runId);
  await log.append({ type: 'job-completed', data: { gate: 'ga-0001', commit: null, workItems: 0 } });
  const replayed = await RunLog.open(join(directory, 'events.jsonl'), runId);
  expect(replayed.terminal?.type).toBe('job-completed');
  expect(legacyNonfunctionalCoverage(record.manifest).status).toBe('unavailable');
});
