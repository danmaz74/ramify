import { spawnSync } from 'node:child_process';
import { it, expect } from 'vitest';
import { repositoryRoot } from './plan.js';

it('preserves measurement failures, archive integrity and process cleanup without crediting missing resident evidence', () => {
  const result = spawnSync(process.execPath, ['scripts/measurements/verify-tooling.mjs'], {
    cwd: repositoryRoot, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Measurement tooling controls passed');
}, 20000);
