import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
const packageRoot = process.argv[2];
const { connectDaemon } = await import(pathToFileURL(join(packageRoot, 'dist/subs/daemon/src/client-entry.js')).href);
const { version } = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
const capabilities = ['registry', 'layout', 'metadata', 'descriptions', 'source-catalog', 'exposure-linking', 'static-access', 'tags-origin', 'namespace-access', 'lazy-access', 'symbol-free-access', 'resource-access', 'coverage'];
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const opened = await connectDaemon({ client: { name: 'lifecycle-child', version }, engine: `ramify.ts@${version}+typescript@7.0.2`,
  endpointDirectory: process.env.RAMIFY_ENDPOINT_DIR, daemonEntry: join(packageRoot, 'dist/src/daemon-entry.js'), start: 'if-needed',
  onState: (state, reason) => emit({ event: 'state', state, reason }) });
if (opened.status !== 'connected') { emit({ event: 'startup-failed', result: opened }); process.exitCode = 1; }
else {
  const connection = opened.connection;
  const input = createInterface({ input: process.stdin });
  emit({ event: 'ready', daemon: connection.daemon });
  const operation = async request => {
    switch (request.op) {
      case 'open': return connection.openContext({ project: { cwd: request.root, root: request.root, scope: 'whole-project', configuration: 'discover' }, setup: { registry: 'default', capabilities } });
      case 'check': {
        const result = await connection.check({ token: request.token, requestId: request.id, freshness: { mode: request.published ? 'published' : 'synchronized', ...(request.published ? { wait: true } : { expect: [] }) } });
        if (!result.ok || result.value.status !== 'reported') return result;
        const value = result.value;
        return { ok: true, value: { status: value.status, published: value.published, revision: value.revision, freshness: value.freshness,
          report: { inputId: value.report.inputId, runId: value.report.runId, outcome: value.report.outcome, summary: value.report.summary } } };
      }
      case 'subscribe': return connection.subscribe({ token: request.token }, event => emit({ event: 'context', value: event }));
      case 'unsubscribe': return connection.unsubscribe({ subscription: request.subscription });
      case 'closeContext': return connection.closeContext({ token: request.token });
      case 'status': return connection.daemonStatus();
      case 'state': return { state: connection.state, reason: connection.reason };
      case 'recover': return connection.recover(request.authorization ?? 'automatic');
      case 'close': await connection.close(); input.close(); return null;
      default: throw new Error(`Unknown lifecycle control ${request.op}`);
    }
  };
  for await (const line of input) {
    const request = JSON.parse(line);
    try { emit({ id: request.id, result: await operation(request) }); }
    catch (error) { emit({ id: request.id, error: String(error) }); }
    if (request.op === 'close') break;
  }
  await connection.close();
}
