import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { loadCucumberConfiguration } from '../../subs/evidence/src/cucumber-configuration.js';
import { childEnvironment, runCommand } from '../../subs/evidence/src/run-command.js';
import { classifyShellTestRun } from '../tools/shell-tests.js';
import { buildFocusedScenarioCommand } from '../work/focused-scenarios.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'plan23-cucumber-native-')); directories.push(cwd);
  await mkdir(join(cwd, 'features')); await mkdir(join(cwd, 'support')); await mkdir(join(cwd, 'scratch'));
  await symlink(join(root, 'node_modules'), join(cwd, 'node_modules'), 'dir');
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ type: 'module' }));
  for (const name of ['A', 'B', 'U']) await writeFile(join(cwd, `features/${name}.feature`), `${name === 'U' ? '@unselected' : '@ramify-pending'}\nFeature: ${name}\n Scenario: selected ${name}\n  When record "${name}"\n`);
  const output = join(cwd, 'executed.jsonl');
  await writeFile(join(cwd, 'support/world.mjs'), `import {setWorldConstructor} from '@cucumber/cucumber'; class World { constructor({parameters}) {this.marker=parameters.marker;} } setWorldConstructor(World);\n`);
  await writeFile(join(cwd, 'support/steps.mjs'), `import {When} from '@cucumber/cucumber'; import {appendFileSync} from 'node:fs'; When('record {string}',function(label){appendFileSync(${JSON.stringify(output)},JSON.stringify({label,world:this.marker,environment:process.env.PLAN23_CUCUMBER_MARKER,support:this.additional})+'\\n');});\n`);
  await writeFile(join(cwd, 'support/additional.mjs'), `import {Before} from '@cucumber/cucumber'; Before(function(){this.additional='profile-support';});\n`);
  await writeFile(join(cwd, 'fixture-loader.mjs'), `import {appendFileSync} from 'node:fs'; export async function load(url,context,next){if(url.endsWith('/support/steps.mjs'))appendFileSync(${JSON.stringify(join(cwd, 'loader.log'))},'support-loaded\\n');return next(url,context); }\n`);
  const config = { default: { paths: ['features/**/*.feature'], import: ['support/world.mjs', 'support/steps.mjs'], loader: ['./fixture-loader.mjs'], worldParameters: { marker: 'declared-world' }, format: ['summary'], tags: 'not @ramify-pending' }, declared: { import: ['support/additional.mjs'] } };
  const text = JSON.stringify(config); await writeFile(join(cwd, 'cucumber.json'), text);
  const effective = await loadCucumberConfiguration({ cwd, file: 'cucumber.json', profiles: ['default', 'declared'], provided: {}, environment: childEnvironment({ PLAN23_CUCUMBER_MARKER: 'declared-env' }), configurationIdentity: createHash('sha256').update(text).digest('hex'), nodeExecutable: process.execPath });
  expect(effective.kind).toBe('available');
  const focused = buildFocusedScenarioCommand({ effective, featurePaths: ['features/A.feature', 'features/B.feature'], scratchDirectory: join(cwd, 'scratch'), cucumberExecutable: join(cwd, 'node_modules/.bin/cucumber-js') });
  if (focused.kind !== 'available') throw new Error(focused.reason);
  await writeFile(focused.configPath, focused.configText);
  const execute = (argv: readonly string[] = focused.argv) => runCommand({ argv, cwd: focused.cwd, env: focused.environment, timeoutMs: 30_000 });
  const observed = async () => (await readFile(output, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as { label: string; world: string; environment: string });
  return { cwd, effective, focused, execute, observed, output };
}
it('installed Cucumber executes only assigned pending A and B with declared support world and loader', async () => {
  const f = await fixture(); const run = await f.execute(); expect(run.outcome).toEqual({ kind: 'completed', exitCode: 0 });
  expect(await f.observed()).toEqual([{ label: 'A', world: 'declared-world', environment: 'declared-env', support: 'profile-support' }, { label: 'B', world: 'declared-world', environment: 'declared-env', support: 'profile-support' }]);
  expect(await readFile(join(f.cwd, 'loader.log'), 'utf8')).toContain('support-loaded');
  expect(createHash('sha256').update(await readFile(f.focused.configPath)).digest('hex')).toBe(f.focused.configurationIdentity);
}, 30_000);
it('installed Cucumber default profile merges broad paths while dedicated profile remains exact', async () => {
  const f = await fixture(); const baseline = await f.execute([f.focused.argv[0]!, '--config', 'cucumber.json']); expect(baseline.outcome).toEqual({ kind: 'completed', exitCode: 0 }); expect((await f.observed()).map(item => item.label)).toEqual(['U']); await rm(f.output); const broad = await f.execute([f.focused.argv[0]!, '--config', 'cucumber.json', 'features/A.feature']); expect(broad.outcome).toEqual({ kind: 'completed', exitCode: 0 });
  expect((await f.observed()).map(item => item.label)).toEqual(['U']);
  const merged = await loadCucumberConfiguration({ cwd: f.cwd, file: 'cucumber.json', profiles: ['default'], provided: { paths: ['features/A.feature'] }, environment: f.focused.environment, configurationIdentity: f.focused.sourceIdentity, nodeExecutable: process.execPath }); expect(merged.kind).toBe('available'); if (merged.kind === 'available') expect(merged.configuration['paths']).toEqual(['features/**/*.feature', 'features/A.feature']);
  expect(classifyShellTestRun('cucumber-js features/A.feature', { workingDirectory: f.cwd, testScripts: {} }).kind).toBe('unverified');
  await rm(f.output); const exact = await f.execute(); expect(exact.outcome).toEqual({ kind: 'completed', exitCode: 0 }); expect((await f.observed()).map(item => item.label)).toEqual(['A', 'B']);
}, 30_000);
it('installed Cucumber help version dry-run and changed scratch configuration do not earn focused execution', async () => {
  const f = await fixture();
  for (const [flag, mode] of [['--help', 'help'], ['--version', 'version'], ['--dry-run', 'dry-run']] as const) { expect(classifyShellTestRun(`${f.focused.shellCommand} ${flag}`, { workingDirectory: f.cwd, testScripts: {}, focusedCucumber: [f.focused.selection] })).toMatchObject({ kind: 'non-executing', mode }); const run = await f.execute([...f.focused.argv, flag]); expect(run.outcome).toEqual({ kind: 'completed', exitCode: 0 }); await expect(readFile(f.output)).rejects.toMatchObject({ code: 'ENOENT' }); }
  const changed = JSON.parse(f.focused.configText); changed['ramify-focused'].paths = [join(f.cwd, 'features/U.feature')]; await writeFile(f.focused.configPath, JSON.stringify(changed));
  expect(createHash('sha256').update(await readFile(f.focused.configPath)).digest('hex')).not.toBe(f.focused.configurationIdentity);
  // Changed content is actually executed here as a negative native control; prepared selection is now stale.
  expect((await f.execute()).outcome).toEqual({ kind: 'completed', exitCode: 0 }); expect((await f.observed()).map(item => item.label)).toEqual(['U']);
}, 30_000);
