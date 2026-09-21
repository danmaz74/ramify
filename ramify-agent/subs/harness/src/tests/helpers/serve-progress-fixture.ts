import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServerWith } from '../../http/server.js';
import { progressFixture, type FixtureRun } from './progress-fixture.js';
import { stubRamify, testPolicy } from './runs.js';
import { treeInputs } from './iterations.js';

/*
 * Serves the capability-progress fixture to the built web client, for the
 * browser acceptance. It builds the fixture's runs with the scripted fake,
 * starts the real harness server on it with `dist/web` as its assets, and
 * prints the origin and each run's page. It never calls a model.
 *
 *   npm run build:web
 *   npx tsx subs/harness/src/tests/helpers/serve-progress-fixture.ts [--port 4190] [--out runs.json]
 *
 * SIGINT or SIGTERM closes the server and removes the fixture copy.
 */

const assetsDirectory = fileURLToPath(new URL('../../../../../dist/web', import.meta.url));

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

// The run service's waits hold no handle of their own, which a test worker
// masks: this keeps the process alive until a signal stops it.
const alive = setInterval(() => undefined, 60_000);
const fixture = await progressFixture();
const server = await startServerWith({
  projectRoot: fixture.root,
  port: Number(option('--port') ?? 0),
  assetsDirectory,
  ramify: await stubRamify(),
  runs: { inputs: treeInputs(), policy: projectRoot => testPolicy(projectRoot), stopGraceMs: 500, warn: () => undefined },
});
if (!server.servesWebClient) console.warn(`The web client is not built in ${assetsDirectory}; run \`npm run build:web\`.`);

const pages = Object.fromEntries((Object.keys(fixture.runs) as FixtureRun[]).map(name => [name, {
  ...fixture.runs[name],
  // The web client's run route, `#/plans/<plan>/runs/<run>`.
  page: `${server.url}/#/plans/${encodeURIComponent(fixture.runs[name].planId)}/runs/${encodeURIComponent(fixture.runs[name].runId)}`,
}]));
const description = { url: server.url, root: fixture.root, pid: process.pid, runs: pages };
console.log(JSON.stringify(description, null, 2));
const out = option('--out');
if (out !== undefined) await writeFile(out, JSON.stringify(description, null, 2));

let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  clearInterval(alive);
  void server.close().then(() => fixture.remove()).then(() => process.exit(0));
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
