import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnAttempts } from './helpers/process-guard.js';

vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('./helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});

afterEach(() => {
  expect(spawnAttempts(), 'ordinary setup/flow/teardown process attempts').toEqual([]);
});

import { gateAuditOutcomeSchema } from '../run/records.js';

describe('a standalone session\'s in-place diagnosis', () => {
  it('retains an indeterminate published audit outcome', () => {
    const record = gateAuditOutcomeSchema.parse({
      schema: 'ramify-agent.gate-audit-outcome/1', gate: 'ga-indeterminate', overall: 'indeterminate', audited: 'a'.repeat(40),
    });
    expect(record.overall).toBe('indeterminate');
  });
});
