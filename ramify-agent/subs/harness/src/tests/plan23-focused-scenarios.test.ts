import { describe, expect, test } from 'vitest';
import { buildFocusedScenarioCommand } from '../work/focused-scenarios.js';
import { classifyShellTestRun } from '../tools/shell-tests.js';
import { loadCucumberConfiguration } from '../../subs/evidence/src/cucumber-configuration.js';
import type { CommandRun } from '../../subs/evidence/src/run-command.js';

const configuration = { paths: ['features/**/*.feature'], tags: 'not @ramify-pending', name: ['only-old-name'], dryRun: true,
  import: ['support/world.mjs', 'support/steps.mjs', '/shared/absolute-step.mjs'], require: ['support/old.cjs'], requireModule: ['target-loader/register'],
  loader: ['fixture-loader.mjs'], worldParameters: { marker: 'declared-world' }, parallel: 3, order: 'defined', retry: 1, shard: '1/2' };
async function effective(profiles: string[] = []) {
  let calls = 0;
  const result = await loadCucumberConfiguration({ cwd: '/project', file: 'cucumber.mjs', profiles, provided: {}, environment: { PATH: '/project/bin', WORLD: 'declared' }, configurationIdentity: 'source-config-r1', nodeExecutable: '/usr/bin/node' }, async request => {
    calls += 1;
    expect(JSON.parse(request.stdin!).profiles).toEqual(profiles);
    const stdout = `RAMIFY_CUCUMBER_CONFIGURATION=${JSON.stringify({ schema: 'ramify-agent.cucumber-configuration/1', apiPath: '/project/node_modules/@cucumber/cucumber/lib/api/index.js', configuration })}`;
    return { outcome: { kind: 'completed', exitCode: 0 }, startedAt: '2026-10-08T00:00:00Z', elapsedMs: 1, stdout, stderr: '',
      output: { path: null, bytes: stdout.length, truncated: false, tail: stdout } } satisfies CommandRun;
  });
  expect(calls).toBe(1); return result;
}
describe('H05/H06: declared focused pending scenario preparation', () => {
  test.each([{ profiles: [] }, { profiles: ['base', 'support'] }])('flattens selected profiles $profiles and selects exactly pending A/B, retaining world/loader/support', async ({ profiles }) => {
    const source = await effective(profiles);
    const result = buildFocusedScenarioCommand({ effective: source, featurePaths: ['features/A.feature', 'features/B.feature'], scratchDirectory: '/project/subs/status/src/tmp', cucumberExecutable: '/project/node_modules/.bin/cucumber-js' });
    expect(result.kind).toBe('available'); if (result.kind !== 'available') throw new Error(result.reason);
    const generated = JSON.parse(result.configText);
    expect(Object.keys(generated)).toEqual(['ramify-focused']);
    expect(generated['ramify-focused']).toEqual({ ...configuration, paths: ['/project/features/A.feature', '/project/features/B.feature'], tags: '', name: [], shard: '', dryRun: false });
    expect(generated.default).toBeUndefined();
    expect(generated['ramify-focused'].paths).not.toContain('/project/features/U.feature');
    expect(result.argv).toEqual(['/project/node_modules/.bin/cucumber-js', '--config', result.configPath, '--profile', 'ramify-focused']);
    expect(result.environment).toEqual({ PATH: '/project/bin', WORLD: 'declared' });
    expect(source.kind === 'available' && source.configuration['paths']).toEqual(['features/**/*.feature']);
    expect(source.kind === 'available' && source.configuration['tags']).toBe('not @ramify-pending');
    expect(classifyShellTestRun(result.shellCommand, { workingDirectory: '/project/subs/status/src', testScripts: {}, focusedCucumber: [result.selection] }).kind).toBe('focused');
  });
  test('CLI-path-plus-default-profile remains unverified and cannot hide behind another focused command', () => {
    const facts = { workingDirectory: '/project', testScripts: {} };
    expect(classifyShellTestRun('cucumber-js features/A.feature', facts)).toMatchObject({ kind: 'unverified', reason: expect.stringContaining('broader paths') });
    expect(classifyShellTestRun('cucumber-js features/A.feature && vitest run src/a.test.ts', facts).kind).toBe('unverified');
  });
  test('explicit config without matching prepared evidence and extra filtering cannot be called verified', async () => {
    const result = buildFocusedScenarioCommand({ effective: await effective(), featurePaths: ['features/A.feature'], scratchDirectory: '/scratch', cucumberExecutable: '/project/node_modules/.bin/cucumber-js' });
    if (result.kind !== 'available') throw new Error(result.reason);
    expect(classifyShellTestRun(result.shellCommand, { workingDirectory: '/project', testScripts: {} }).kind).toBe('unverified');
    expect(classifyShellTestRun(`${result.shellCommand} --tags @other`, { workingDirectory: '/project', testScripts: {}, focusedCucumber: [result.selection] }).kind).toBe('unverified');
  });
  test.each(['--help', '--version', '--dry-run'])('%s is non-executing rather than scenario evidence', flag => {
    expect(classifyShellTestRun(`cucumber-js features/A.feature ${flag}`, { workingDirectory: '/project', testScripts: {} })).toMatchObject({ kind: 'non-executing', mode: flag.slice(2) });
  });
  test('empty/dynamic/outside selection and missing configuration produce limitations rather than guessed commands', async () => {
    const source = await effective();
    for (const paths of [[], ['features/*.feature'], ['../escape.feature']]) expect(buildFocusedScenarioCommand({ effective: source, featurePaths: paths, scratchDirectory: '/scratch', cucumberExecutable: '/target/cucumber-js' }).kind).toBe('unavailable');
    expect(buildFocusedScenarioCommand({ effective: { kind: 'unavailable', reason: 'missing source configuration', command: null }, featurePaths: ['features/A.feature'], scratchDirectory: '/scratch', cucumberExecutable: '/target/cucumber-js' })).toEqual({ kind: 'unavailable', reason: 'missing source configuration' });
  });
  test('relative features resolve only against declared cwd, absolute support remains unchanged and quoting is safe', async () => {
    const result = buildFocusedScenarioCommand({ effective: await effective(), featurePaths: ['/project/features/A.feature', 'features/A.feature', 'features/B.feature'], scratchDirectory: "/scratch/path with 'quote'", cucumberExecutable: '/target/cucumber-js' });
    if (result.kind !== 'available') throw new Error(result.reason);
    expect(result.selection.paths).toEqual(['/project/features/A.feature', '/project/features/B.feature']);
    expect(result.support['import']).toEqual(configuration.import);
    expect(result.shellCommand).toContain("'\"'\"'");
    expect(result.shellCommand.startsWith("cd '/project' &&")).toBe(true);
  });
});
