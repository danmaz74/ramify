import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnAttempts } from '../../../../src/tests/helpers/process-guard.js';

vi.mock('node:child_process', async importOriginal => {
  const { guardedChildProcess } = await import('../../../../src/tests/helpers/process-guard.js');
  return guardedChildProcess(await importOriginal<typeof import('node:child_process')>());
});

afterEach(() => {
  expect(spawnAttempts(), 'ordinary setup/flow/teardown process attempts').toEqual([]);
});

import { childEnvironment, environmentNames } from '../run-command.js';

describe('childEnvironment', () => {
  it('builds a complete environment, so no caller merges this process again', () => {
    const env = childEnvironment({ RAMIFY_AGENT_PROBE: 'given' });

    expect(env['PATH']).toBe(process.env['PATH']);
    expect(env['RAMIFY_AGENT_PROBE']).toBe('given');
    expect(Object.values(env).every(value => typeof value === 'string')).toBe(true);
  });
});

describe('environmentNames', () => {
  it('answers the names of an environment, sorted, and no value of it', () => {
    expect(environmentNames({ PATH: '/bin', HOME: '/home/app', CI: undefined })).toEqual(['CI', 'HOME', 'PATH']);
    expect(JSON.stringify(environmentNames({ SECRET: 'hunter2' }))).not.toContain('hunter2');
  });
});
