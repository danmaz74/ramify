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

describe('a gate attempt', () => {
  it('records the names of a command\'s environment, and no secret reaches the command or the record', async () => {
    const directory = await temporaryDirectory();
    try {
      await writeFile(join(directory.path, 'package.json'), '{"name":"project"}\n');
      const gates = join(directory.path, 'gates', 'ga-0001');

      // The command prints its own environment, so what it received is
      // evidence and not an assumption about how it was spawned.
      const command = checkCommand({
        argv: ['bash', '-c', 'env'],
        cwd: directory.path,
        timeoutMs: 30_000,
      });
      expect(checkCommandEnvironment(command)).not.toHaveProperty(secretName);

      const attempt = await runGate(inPlaceCheckExecution, 'iteration', {
        id: 'ga-0001',
        projectRoot: directory.path,
        directory: gates,
        head: 'a'.repeat(40),
        checks: [{ kind: 'type-check', command }],
      });

      expect(attempt.verdict).toBe('passed');

      // What the command's own environment held.
      const printed = await readFile(attempt.commands[0]!.output.path, 'utf8');
      expect(printed).toContain('PATH=');
      expect(printed).not.toContain(secretName);
      expect(printed).not.toContain(secretValue);

      // What the attempt records of it.
      expect(attempt.commands[0]!.command.env).toContain('PATH');
      expect(attempt.commands[0]!.command.env).not.toContain(secretName);
      const recorded = await readFile(join(gates, 'attempt.json'), 'utf8').catch(() => JSON.stringify(attempt));
      expect(recorded).not.toContain(secretValue);
      expect(recorded).not.toContain(secretName);
    } finally {
      await directory.remove();
    }
  });
});
