import { writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { startServerWith } from '../../http/server.js';
import { FakeRamifyCli } from './fake-ramify.js';
import { progressFixture, type FixtureRun } from './progress-fixture.js';
import { addSessionRuns, liveRunSettings, Pacer, startLiveRun } from './session-fixture.js';

/*
 * Serves the capability-progress fixture and the session fixture to the
 * built web client, for the browser acceptance. It builds the fixture's
 * finished runs with the scripted fake, starts the real harness server on
 * them with `dist/web` as its assets, starts the live run the server itself
 * drives, and prints the origin, each run's page and the live session's
 * control. It never calls a model.
 *
 *   npm run build:web
 *   npx tsx subs/harness/src/tests/helpers/serve-progress-fixture.ts \
 *     [--port 4190] [--control-port 4191] [--live-steps 40] [--pace <ms>] [--out runs.json]
 *
 * The live run's engineer waits between its steps. `POST <control>/step`
 * releases one step, which adds its entries to the transcript; `POST
 * <control>/finish` releases the rest and lets it submit, and the run then
 * completes; `GET <control>/status` answers how many steps were released.
 * `--pace <ms>` releases a step every `ms` milliseconds as well.
 *
 * SIGINT or SIGTERM closes both servers and removes the fixture copy.
 */

const assetsDirectory = fileURLToPath(new URL('../../../../../dist/web', import.meta.url));

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

const route = (planId: string, runId: string) => `#/plans/${encodeURIComponent(planId)}/runs/${encodeURIComponent(runId)}`;

// The run service's waits hold no handle of their own, which a test worker
// masks: this keeps the process alive until a signal stops it.
const alive = setInterval(() => undefined, 60_000);
const fixture = await progressFixture();
const sessionRuns = await addSessionRuns(fixture.root).catch(async (error: unknown) => {
  await fixture.remove();
  throw error;
});
const pacer = new Pacer(Number(option('--live-steps') ?? 40));
const live = liveRunSettings(fixture.root, pacer);
const server = await startServerWith({
  projectRoot: fixture.root,
  port: Number(option('--port') ?? 0),
  assetsDirectory,
  ramify: new FakeRamifyCli(),
  agent: live.agent,
  runs: live.runs,
});
if (!server.servesWebClient) console.warn(`The web client is not built in ${assetsDirectory}; run \`npm run build:web\`.`);
const liveRun = await startLiveRun(server.url, fixture.root);

const status = () => ({ released: pacer.released, steps: pacer.steps, finished: pacer.done });
const control: Server = createServer((request, response) => {
  const answer = (code: number, body: unknown) => {
    response.writeHead(code, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.method === 'POST' && request.url === '/step') return answer(200, { stepped: pacer.step(), ...status() });
  if (request.method === 'POST' && request.url === '/finish') {
    pacer.finish();
    return answer(200, status());
  }
  if (request.method === 'GET' && request.url === '/status') return answer(200, status());
  return answer(404, { error: 'POST /step, POST /finish or GET /status' });
});
await new Promise<void>(accept => control.listen(Number(option('--control-port') ?? 0), '127.0.0.1', accept));
const controlUrl = `http://127.0.0.1:${(control.address() as AddressInfo).port}`;
const pace = option('--pace');
const pacing = pace === undefined ? undefined : setInterval(() => { if (!pacer.step()) clearInterval(pacing); }, Number(pace));

const pages = Object.fromEntries((Object.keys(fixture.runs) as FixtureRun[]).map(name => [name, {
  ...fixture.runs[name],
  // The web client's run route, `#/plans/<plan>/runs/<run>`.
  page: `${server.url}/${route(fixture.runs[name].planId, fixture.runs[name].runId)}`,
}]));
const sessionPages = {
  lineage: { ...sessionRuns.lineage, page: `${server.url}/${route(sessionRuns.lineage.planId, sessionRuns.lineage.runId)}` },
  interrupted: { ...sessionRuns.interrupted, page: `${server.url}/${route(sessionRuns.interrupted.planId, sessionRuns.interrupted.runId)}` },
  live: {
    ...liveRun,
    state: 'running',
    page: `${server.url}/${route(liveRun.planId, liveRun.runId)}`,
    transcript: `${server.url}/${route(liveRun.planId, liveRun.runId)}/sessions/${liveRun.engineer}`,
  },
};
const description = {
  url: server.url,
  root: fixture.root,
  pid: process.pid,
  sessionsPage: `${server.url}/#/sessions`,
  runs: pages,
  sessionRuns: sessionPages,
  control: { step: `POST ${controlUrl}/step`, finish: `POST ${controlUrl}/finish`, status: `GET ${controlUrl}/status`, ...status() },
};
console.log(JSON.stringify(description, null, 2));
const out = option('--out');
if (out !== undefined) await writeFile(out, JSON.stringify(description, null, 2));

let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  clearInterval(alive);
  clearInterval(pacing);
  control.close();
  void server.close().then(() => fixture.remove()).then(() => process.exit(0));
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
