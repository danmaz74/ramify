import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
 * A scripted `cucumber-js` for lifecycle tests: it runs no scenario. Given
 * `--config <profile>`, it writes the message stream the profile asks for,
 * holding only a finished, successful run, and exits 0, so a scenario check
 * over it passes with nothing executed. Without a profile it only exits 0.
 */
export const scriptedCucumber = [
  '#!/bin/sh',
  'config=""',
  'while [ $# -gt 0 ]; do',
  '  if [ "$1" = "--config" ]; then config="$2"; shift; fi',
  '  shift',
  'done',
  'if [ -n "$config" ] && [ -f "$config" ]; then',
  '  stream=$(sed -n \'s/.*"message:\\([^"]*\\)".*/\\1/p\' "$config")',
  '  if [ -n "$stream" ]; then',
  '    printf \'%s\\n\' \'{"testRunStarted":{"timestamp":{"seconds":0,"nanos":0}}}\' \'{"testRunFinished":{"success":true,"timestamp":{"seconds":0,"nanos":0}}}\' > "$stream"',
  '  fi',
  'fi',
  'exit 0',
  '',
].join('\n');

/** Writes the scripted `cucumber-js` at `path`, executable. */
export async function installScriptedCucumber(path: string): Promise<void> {
  await writeFile(path, scriptedCucumber);
  await chmod(path, 0o755);
}
