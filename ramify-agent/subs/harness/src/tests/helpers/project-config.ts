import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectConfigSchema, type ProjectConfig } from '../../run/records.js';

/*
 * The project configuration a test project needs to pass readiness's
 * `project-config` step. The fixture carries its own `ramify-agent.json`; a
 * project a test writes from nothing carries this one.
 */

/** The smallest valid `ramify-agent.project/1`. */
export const minimalProjectConfig: ProjectConfig = projectConfigSchema.parse({
  schema: 'ramify-agent.project/1',
});

/** Writes `ramify-agent.json` at the project root, the minimal one unless another is given. */
export async function writeProjectConfig(root: string, config: unknown = minimalProjectConfig): Promise<void> {
  await writeFile(join(root, 'ramify-agent.json'), `${JSON.stringify(config, null, 2)}\n`);
}

/**
 * A stand-in `cucumber-js` for a fixture copy without `node_modules`: it
 * runs no scenario and exits 0. The harness never starts it; a gate's
 * scenarios run as the project's configured audit check, which lifecycle
 * tests script.
 */
export const scriptedCucumber = '#!/bin/sh\nexit 0\n';

/** Writes the stand-in `cucumber-js` at `path`, executable. */
export async function installScriptedCucumber(path: string): Promise<void> {
  await writeFile(path, scriptedCucumber);
  await chmod(path, 0o755);
}
