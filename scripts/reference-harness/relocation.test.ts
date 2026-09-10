import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { plan1Instances } from './cases.js';
import { verificationCapabilities } from './instances.js';
import { runIsolatedProject } from './mutation.js';
import { readReviewedPlan } from './plan.js';
import { command } from './processes.js';
import { relocationEnvironment } from './relocation.js';
import { verifyInstances } from './runner.js';
import type { InstanceHandler } from './runner.js';

describe('relocation fixture isolation', () => {
  it('runs an npm script using only its fixture-local bin with a colon-bearing matrix ID', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-npm-bin-'));
    try {
      const result = await runIsolatedProject({ workRoot: directory, instanceId: 'I1-28:relocated-package',
        fixture: { kind: 'create', create: async root => {
          await mkdir(join(root, 'node_modules/.bin'), { recursive: true });
          await writeFile(join(root, 'package.json'), '{"scripts":{"probe":"ramify-fixture-local-command"}}');
          const executable = join(root, 'node_modules/.bin/ramify-fixture-local-command');
          await writeFile(executable, '#!/usr/bin/env node\nconsole.log("fixture-local");\n');
          await chmod(executable, 0o755);
        } },
      }, async ({ root, runDirectory }) => command(root, 'npm', ['run', '--silent', 'probe'], 10_000, relocationEnvironment(runDirectory)));
      expect(result.ok).toBe(true);
      if (!result.ok) throw result.error;
      expect([result.value.code, result.value.error, result.value.stdout]).toEqual([0, null, 'fixture-local\n']);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('removes ambient loaders package prefixes and checkout command paths from actual children', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-environment-'));
    try {
      const environment = relocationEnvironment(directory, { NODE_OPTIONS: '--import=/missing-loader.mjs',
        NODE_PATH: '/ambient/node_modules', PATH: '/enclosing/node_modules/.bin',
        npm_config_prefix: '/enclosing', npm_config_userconfig: '/enclosing/.npmrc' });
      const result = await command(directory, process.execPath, ['--input-type=module', '-e',
        'console.log(JSON.stringify({ nodeOptions: process.env.NODE_OPTIONS ?? null, nodePath: process.env.NODE_PATH ?? null, prefix: process.env.npm_config_prefix ?? null, path: process.env.PATH, home: process.env.HOME, config: process.env.npm_config_userconfig }))'], 10_000, environment);
      expect([result.code, result.error, result.stderr]).toEqual([0, null, '']);
      expect(JSON.parse(result.stdout)).toEqual({ nodeOptions: null, nodePath: null, prefix: null,
        path: environment.PATH, home: join(directory, 'home'), config: join(directory, 'empty.npmrc') });
      expect(environment.PATH).not.toContain('/enclosing');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  for (const fail of [false, true]) it(`uses the project handler's external root and ${fail ? 'preserves a failed copy' : 'cleans a completed copy'}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-external-handler-'));
    try {
      const defaultRoot = join(directory, 'enclosing/.reference-work');
      const externalRoot = join(directory, 'external');
      const handler: InstanceHandler = { kind: 'project', workRoot: externalRoot,
        fixture: { kind: 'create', create: async root => { await writeFile(join(root, 'marker'), 'unchanged'); } },
        baseline: ({ root, assertions }) => { assertions.ok('copy uses explicit external root', root.startsWith(externalRoot + '/')); },
        mutate: async ({ root }) => { await writeFile(join(root, 'marker'), 'mutated'); },
        run: async ({ assertions }) => { assertions.equal('independent control assertion', fail, false); },
      };
      const report = await verifyInstances({ plan: readReviewedPlan(), records: plan1Instances,
        runtime: { capabilities: new Set(verificationCapabilities), handlers: new Map([['I1-28:relocated-package', handler]]) },
        workRoot: defaultRoot, preserveOnFailure: true });
      const instance = report.instances.find(item => item.id === 'I1-28:relocated-package')!;
      expect(instance.status).toBe(fail ? 'failed' : 'passed');
      expect(instance.baselineAssertions).toEqual([{ name: 'copy uses explicit external root', status: 'passed' }]);
      await expect(readdir(defaultRoot)).rejects.toMatchObject({ code: 'ENOENT' });
      if (fail) {
        expect(instance.preservedDirectory).toMatch(new RegExp(`^${externalRoot}/run-`));
        expect(await readFile(join(instance.preservedDirectory!, 'I1-28-relocated-package/project/marker'), 'utf8')).toBe('mutated');
      } else expect(await readdir(externalRoot)).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
