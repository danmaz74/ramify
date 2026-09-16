import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

const args = process.argv.slice(2), fields = new Map();
for (let index = 0; index < args.length; index += 2) fields.set(args[index], args[index + 1]);
const directory = fields.get('--endpoint-dir'), buildKey = fields.get('--build-key'), version = fields.get('--version');
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
  const recordPath = join(directory, `explorer-${buildKey}.json`);
  const running = { schemaVersion: 'ramify.explorer-record/1', instanceId, pid: process.pid, version, buildKey,
    protocol: 'ramify.explorer-http/1', host: '127.0.0.1', port: address.port,
    origin: `http://127.0.0.1:${address.port}`, startedAt, state: 'running', stopped: null };
  await writeFile(recordPath, JSON.stringify(running), { mode: 0o600 });
  const stop = () => server.close(async () => {
    await writeFile(recordPath, JSON.stringify({ ...running, state: 'stopped', stopped: { at: Date.now(), reason: 'failed' } }), { mode: 0o600 });
    process.exit(0);
  });
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
