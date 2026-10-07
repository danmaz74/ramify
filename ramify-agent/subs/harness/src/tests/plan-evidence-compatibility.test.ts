import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { inputManifestSchema } from '../interfaces/protocol/evidence.js';
import { RunLog } from '../run/log.js';
import { defaultRunPolicy } from '../run/policy.js';
import { planRefSchema, runRecordSchema } from '../run/records.js';
import { constructedRecord, runId } from './helpers/constructed.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

it('refuses earlier run policy at the current decoder instead of adapting its records', () => {
  const current = defaultRunPolicy({ projectRoot: '/tmp/legacy-project', nested: [] });
  expect(runRecordSchema.safeParse({ ...constructedRecord(), policy: { ...current, version: 'run-policy/3' } }).success).toBe(false);
});
