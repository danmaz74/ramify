import { writeFile } from 'node:fs/promises';
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
