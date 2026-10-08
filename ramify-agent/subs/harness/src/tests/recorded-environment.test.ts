import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runGate } from '../checks/gate.js';
import { inPlaceCheckExecution } from '../checks/execution.js';
import { checkCommand, checkCommandEnvironment } from '../checks/records.js';
import { defaultRunPolicy } from '../run/policy.js';
import { checkCommandSchema, runPolicySchema } from '../run/records.js';
import { temporaryDirectory } from './helpers/fixture.js';

/*
 * What a record holds of an environment.
 *
 * The harness runs under whatever a person's session holds. A session token
 * of theirs once reached committed trial records through the complete
 * environment a captured command carried, so a record now holds the names of
 * the variables a command received and no value of one, and a child receives
 * the allowlist of `childEnvironment` and nothing else.
 *
 * `RAMIFY_AGENT_TEST_SECRET` stands for such a variable here: it is set in
 * this process, which is the parent of every command these tests run.
 */

const secretName = 'RAMIFY_AGENT_TEST_SECRET';
const secretValue = 'hunter2';

beforeAll(() => {
  process.env[secretName] = secretValue;
});
afterAll(() => {
  delete process.env[secretName];
});

describe('the policy a run captures in job.json', () => {
  it('names the variables each command receives and holds no value of one', () => {
    const policy = defaultRunPolicy({ projectRoot: '/project' });
    const recorded = JSON.stringify(runPolicySchema.parse(policy));

    expect(recorded).not.toContain(secretValue);
    expect(recorded).not.toContain(secretName);

    for (const command of [policy.commands.typeCheck, policy.commands.ramifyCheck, policy.commands.ramifyChanged]) {
      expect(command.env).toContain('PATH');
      expect(command.env).toContain('HOME');
      expect(command.env).not.toContain(secretName);
      expect([...command.env].sort()).toEqual(command.env);
      expect(Array.isArray(command.env)).toBe(true);
    }
  });

  it('refuses a historical environment map instead of executing or migrating it', () => {
    expect(checkCommandSchema.safeParse({ argv: ['npm', 'test'], cwd: '/project',
      env: { PATH: '/usr/bin', [secretName]: secretValue }, timeoutMs: 1000 }).success).toBe(false);
    expect(checkCommandSchema.safeParse({ argv: ['npm', 'test'], cwd: '/project',
      env: ['PATH'], timeoutMs: 1000 }).success).toBe(false);
  });

});
