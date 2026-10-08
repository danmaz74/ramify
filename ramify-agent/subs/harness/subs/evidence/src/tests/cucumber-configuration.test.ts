import { describe, expect, test } from 'vitest';
import { loadCucumberConfiguration, type CucumberConfigurationSelection } from '../cucumber-configuration.js';
import type { CommandRun } from '../run-command.js';

const selection: CucumberConfigurationSelection = { cwd: '/target', file: 'cucumber.mjs', profiles: ['base', 'support'],
  provided: { parallel: 2 }, environment: { PATH: '/target/bin', FIXTURE_MARKER: 'declared' }, configurationIdentity: 'captured-source-sha', nodeExecutable: '/usr/bin/node' };
const configuration = { paths: ['features/**/*.feature'], tags: 'not @ramify-pending', name: ['source-filter'], dryRun: false,
  import: ['support/world.mjs', 'support/steps.mjs'], require: [], requireModule: [], loader: ['fixture-loader.mjs'], worldParameters: { marker: 'declared-world' } };
function answer(stdout: string): CommandRun { return { outcome: { kind: 'completed', exitCode: 0 }, startedAt: '2026-10-08T00:00:00Z', elapsedMs: 3,
  output: { path: null, bytes: Buffer.byteLength(stdout), truncated: false, tail: stdout }, stdout, stderr: '' }; }
const valid = () => answer(`target log output\nRAMIFY_CUCUMBER_CONFIGURATION=${JSON.stringify({ schema: 'ramify-agent.cucumber-configuration/1', apiPath: '/target/node_modules/@cucumber/cucumber/lib/api/index.js', configuration })}\n`);

describe('effective target Cucumber configuration adapter', () => {
  test('resolves target public API through its own package and retains exact file/profiles/arguments/environment', async () => {
    let calls = 0;
    const result = await loadCucumberConfiguration(selection, async request => {
      calls += 1;
      expect(request.cwd).toBe('/target'); expect(request.env).toEqual(selection.environment);
      expect(request.argv.slice(0, 3)).toEqual(['/usr/bin/node', '--input-type=module', '--eval']);
      expect(request.argv[3]).toContain("createRequire(join(input.cwd, 'package.json'))");
      expect(request.argv[3]).toContain("require.resolve('@cucumber/cucumber/api')");
      expect(request.argv[3]).toContain('result.useConfiguration');
      expect(JSON.parse(request.stdin!)).toEqual(selection);
      return valid();
    });
    expect(calls).toBe(1); expect(result.kind).toBe('available');
    if (result.kind !== 'available') throw new Error(result.reason);
    expect(result.configuration).toEqual(configuration); expect(result.selection).toEqual(selection);
    expect(result.identity).toMatch(/^[a-f0-9]{64}$/);
    const changed = await loadCucumberConfiguration({ ...selection, environment: { ...selection.environment, FIXTURE_MARKER: 'different' } }, async () => valid());
    expect(changed.kind === 'available' && changed.identity).not.toBe(result.identity);
  });
  test.each(['missing-source', 'nonzero', 'truncated', 'invalid-shape'])('retains an explicit limitation for %s', async cause => {
    const result = await loadCucumberConfiguration(selection, async () => {
      const response = valid();
      if (cause === 'nonzero') return { ...response, outcome: { kind: 'completed', exitCode: 1 } };
      if (cause === 'truncated') return { ...response, output: { ...response.output, truncated: true } };
      return answer(cause === 'missing-source' ? 'configuration file not found' : 'RAMIFY_CUCUMBER_CONFIGURATION={"schema":"wrong"}');
    });
    expect(result.kind).toBe('unavailable');
  });
  test('unknown declared config and dynamic selection fail before external dispatch', async () => {
    let calls = 0;
    const runner = async () => { calls += 1; return valid(); };
    expect((await loadCucumberConfiguration({ ...selection, file: '' }, runner)).kind).toBe('unavailable');
    expect((await loadCucumberConfiguration({ ...selection, provided: { dynamic: () => [] } }, runner)).kind).toBe('unavailable');
    expect(calls).toBe(0);
  });
});
