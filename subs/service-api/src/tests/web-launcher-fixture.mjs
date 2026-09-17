import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

// Mirrors the entry's arguments: `--root <dir>`, with the endpoint directory from the environment.
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--root') throw new Error(`Unexpected fixture arguments ${JSON.stringify(args)}`);
const root = args[1], directory = process.env.RAMIFY_ENDPOINT_DIR;
const buildKey = process.env.EXPLORER_FIXTURE_BUILD_KEY, version = process.env.EXPLORER_FIXTURE_VERSION;
const context = process.env.EXPLORER_FIXTURE_CONTEXT, projectKey = context.slice('ctx/1:'.length, 'ctx/1:'.length + 16);
if (version.endsWith('-unready')) {
  await writeFile(join(directory, 'unready.pid'), String(process.pid));
  setInterval(() => {}, 1000);
} else {
  const instanceId = randomUUID();
  const server = createServer((request, response) => {
    if (request.url !== '/health/ready') { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ schemaVersion: 'ramify.explorer-record/1', instanceId, version, buildKey,
      protocol: 'ramify.explorer-http/1' }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(), startedAt = Date.now();
  const recordPath = join(directory, `explorer-${buildKey}-${projectKey}.json`);
  const running = { schemaVersion: 'ramify.explorer-record/1', instanceId, pid: process.pid, version, buildKey,
    protocol: 'ramify.explorer-http/1', root, context, host: '127.0.0.1', port: address.port,
    origin: `http://127.0.0.1:${address.port}`, startedAt, state: 'running', stopped: null };
  await writeFile(recordPath, JSON.stringify(running), { mode: 0o600 });
  const stop = () => server.close(async () => {
    await writeFile(recordPath, JSON.stringify({ ...running, state: 'stopped', stopped: { at: Date.now(), reason: 'explicit' } }), { mode: 0o600 });
    process.exit(0);
  });
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
