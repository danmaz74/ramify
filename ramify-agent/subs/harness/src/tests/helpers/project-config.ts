import { chmod, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { projectConfigSchema, type ProjectConfig } from '../../run/records.js';

/*
 * The project configuration a test project needs to pass readiness's
 * `project-config` and `acceptance-runner` steps. The fixture carries its own
 * `ramify-agent.json`; a project a test writes from nothing carries this one.
 */

/**
 * The smallest valid `ramify-agent.project/1`: no support code, and both
 * modes starting the installed runner by path, so that no script is needed
 * beside the `cucumber-js` that `installTestRunner` provides.
 */
export const minimalProjectConfig: ProjectConfig = projectConfigSchema.parse({
  schema: 'ramify-agent.project/1',
  acceptance: {
    support: [],
    modes: {
      quick: { command: ['node_modules/.bin/cucumber-js'] },
      full: { command: ['node_modules/.bin/cucumber-js'] },
    },
  },
});

/** Writes `ramify-agent.json` at the project root, the minimal one unless another is given. */
export async function writeProjectConfig(root: string, config: unknown = minimalProjectConfig): Promise<void> {
  await writeFile(join(root, 'ramify-agent.json'), `${JSON.stringify(config, null, 2)}\n`);
}

/**
 * A scripted `cucumber-js` for lifecycle tests: it runs no step. Given
 * `--config <profile>`, it reads the profile the harness wrote, finds every
 * tracked scenario in the feature files of its `paths` whose tags its `tags`
 * expression selects, and writes the message stream the profile asks for:
 * each of those scenarios executed with no step, which the reducer reads as
 * passed, and a finished, successful run. It exits 0. The expressions it
 * reads are the three the harness builds: none, `not @ramify-pending` and
 * identity tags joined by `or`. Without a profile it only exits 0.
 */
export const scriptedCucumber = [
  '#!/bin/sh',
  // A project's script may start the runner with loaders it installs, such
  // as the fixture's `--import tsx`; the scripted one needs none of them.
  'NODE_OPTIONS= exec node "$(dirname "$0")/scripted-cucumber.mjs" "$@"',
  '',
].join('\n');

/** The program the scripted `cucumber-js` runs. */
export const scriptedCucumberProgram = String.raw`import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const at = args.indexOf('--config');
if (at < 0 || args[at + 1] === undefined) process.exit(0);
const profile = (await import(pathToFileURL(resolve(args[at + 1])).href)).default ?? {};
const format = (profile.format ?? []).find(entry => entry.startsWith('message:'));
if (format === undefined) process.exit(0);

const expression = profile.tags ?? null;
const selects = tags => {
  if (expression === null) return true;
  if (expression.startsWith('not ')) return !tags.includes(expression.slice(4).trim());
  return expression.split(' or ').some(tag => tags.includes(tag.trim()));
};
const features = [];
const walk = path => {
  let stat;
  try { stat = statSync(path); } catch { return; }
  if (stat.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
  else if (path.endsWith('.feature')) features.push(path);
};
for (const path of profile.paths ?? []) walk(resolve(path));

const time = { seconds: 0, nanos: 0 };
const messages = [{ testRunStarted: { timestamp: time } }];
for (const file of features) {
  const uri = relative(process.cwd(), file).split(sep).join('/');
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const tags = line.trim().split(/\s+/);
    const identity = tags.find(tag => /^@ramify-sc-\d{3,}$/.test(tag));
    if (identity === undefined || !selects(tags)) continue;
    const id = identity.slice('@ramify-'.length);
    messages.push(
      { pickle: { id: 'pickle-' + id, uri, name: id, language: 'en', astNodeIds: ['node-' + id], tags: tags.map(name => ({ name, astNodeId: 'tag-' + name })), steps: [] } },
      { testCase: { id: 'case-' + id, pickleId: 'pickle-' + id, testSteps: [] } },
      { testCaseStarted: { id: 'started-' + id, testCaseId: 'case-' + id, attempt: 0, timestamp: time } },
      { testCaseFinished: { testCaseStartedId: 'started-' + id, willBeRetried: false, timestamp: time } },
    );
  }
}
messages.push({ testRunFinished: { success: true, timestamp: time } });
writeFileSync(format.slice('message:'.length), messages.map(message => JSON.stringify(message)).join('\n') + '\n');
`;

/** Writes the scripted `cucumber-js` at `path`, executable, with the program it runs beside it. */
export async function installScriptedCucumber(path: string): Promise<void> {
  await writeFile(path, scriptedCucumber);
  await chmod(path, 0o755);
  await writeFile(join(dirname(path), 'scripted-cucumber.mjs'), scriptedCucumberProgram);
}
