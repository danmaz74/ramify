import { chmod, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { CommandRequest, CommandRun } from '../../../subs/evidence/src/run-command.js';
import { projectConfigSchema, type ProjectConfig } from '../../run/records.js';
import { commandResult } from './command-result.js';

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
const messages = [{ meta: { protocolVersion: '34.2.0', implementation: { name: 'scripted-cucumber', version: '1' } } }, { testRunStarted: { timestamp: time } }];
for (const file of features) {
  const uri = relative(process.cwd(), file).split(sep).join('/');
  for (const [lineIndex, line] of readFileSync(file, 'utf8').split('\n').entries()) {
    const tags = line.trim().split(/\s+/);
    const identity = tags.find(tag => /^@ramify-sc-\d{3,}$/.test(tag));
    if (identity === undefined || !selects(tags)) continue;
    const id = identity.slice('@ramify-'.length);
    messages.push(
      { pickle: { id: 'pickle-' + id, uri, name: id, location: { line: lineIndex + 1, column: 1 }, language: 'en', astNodeIds: ['node-' + id], tags: tags.map(name => ({ name, astNodeId: 'tag-' + name })), steps: [] } },
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

/**
 * The scripted `cucumber-js` answered in the test's own process, for a test
 * whose command runner is a function rather than an installed program: the
 * same selection and the same stream as `scriptedCucumberProgram`, read from
 * the profile the request names. Undefined for a request with no `--config`.
 */
export async function scriptedScenarioRun(request: CommandRequest): Promise<CommandRun | undefined> {
  const at = request.argv.indexOf('--config');
  if (at < 0 || request.argv[at + 1] === undefined) return undefined;
  // The profile is the module `buildScenarioProfile` writes, one JSON value
  // per property line, so it is read as text rather than imported.
  const text = await readFile(resolve(request.cwd, request.argv[at + 1]!), 'utf8');
  const property = <T>(name: string): T | undefined => {
    const found = new RegExp(`^  ${name}: (.+),$`, 'mu').exec(text);
    return found === null ? undefined : JSON.parse(found[1]!) as T;
  };
  const profile = { format: property<string[]>('format'), tags: property<string>('tags'), paths: property<string[]>('paths') };
  const format = (profile.format ?? []).find(entry => entry.startsWith('message:'));
  if (format === undefined) return commandResult(request, { outcome: { kind: 'completed', exitCode: 0 } });

  const expression = profile.tags ?? null;
  const selects = (tags: readonly string[]): boolean => {
    if (expression === null) return true;
    if (expression.startsWith('not ')) return !tags.includes(expression.slice(4).trim());
    return expression.split(' or ').some(tag => tags.includes(tag.trim()));
  };
  const features: string[] = [];
  const walk = async (path: string): Promise<void> => {
    const found = await stat(path).catch(() => null);
    if (found === null) return;
    if (found.isDirectory()) for (const name of (await readdir(path)).sort()) await walk(join(path, name));
    else if (path.endsWith('.feature')) features.push(path);
  };
  for (const path of profile.paths ?? []) await walk(resolve(request.cwd, path));

  const time = { seconds: 0, nanos: 0 };
  const messages: unknown[] = [{ meta: { protocolVersion: '34.2.0', implementation: { name: 'scripted-cucumber', version: '1' } } }, { testRunStarted: { timestamp: time } }];
  for (const file of features) {
    const uri = relative(request.cwd, file).split(sep).join('/');
    for (const [lineIndex, line] of (await readFile(file, 'utf8')).split('\n').entries()) {
      const tags = line.trim().split(/\s+/);
      const identity = tags.find(tag => /^@ramify-sc-\d{3,}$/.test(tag));
      if (identity === undefined || !selects(tags)) continue;
      const id = identity.slice('@ramify-'.length);
      messages.push(
        { pickle: { id: `pickle-${id}`, uri, name: id, location: { line: lineIndex + 1, column: 1 }, language: 'en', astNodeIds: [`node-${id}`], tags: tags.map(name => ({ name, astNodeId: `tag-${name}` })), steps: [] } },
        { testCase: { id: `case-${id}`, pickleId: `pickle-${id}`, testSteps: [] } },
        { testCaseStarted: { id: `started-${id}`, testCaseId: `case-${id}`, attempt: 0, timestamp: time } },
        { testCaseFinished: { testCaseStartedId: `started-${id}`, willBeRetried: false, timestamp: time } },
      );
    }
  }
  messages.push({ testRunFinished: { success: true, timestamp: time } });
  await writeFile(format.slice('message:'.length), `${messages.map(message => JSON.stringify(message)).join('\n')}\n`);
  return commandResult(request, { outcome: { kind: 'completed', exitCode: 0 } });
}
