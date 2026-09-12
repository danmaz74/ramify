import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parentPort } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { deepFreeze } from '../../subs/analysis/src/session-facts.js';
import type { SessionState } from '../../subs/analysis/src/session-revision.js';

// Establish a separate inspection channel before the real worker installs its
// protocol listener. No inspection request reaches the production protocol.
if (!parentPort) throw new Error('The inspected session requires a worker');
const port = parentPort;
const inspection = await new Promise<MessagePort>(resolve => {
  port.once('message', (message: { kind: string; port: MessagePort }) => {
    if (message.kind !== 'plan5-inspection') throw new Error('Missing inspection channel');
    resolve(message.port);
  });
});
port.once('close', () => inspection.close());

// This isolate owns one engine instance. Match only its factory, capture the
// actual state once, and remove the hook and temporary global immediately.
const engine = new URL('../../subs/analysis/src/session-engine.ts', import.meta.url);
const key = `ramify.plan5.session.${randomUUID()}`;
const globals = globalThis as unknown as Record<symbol, unknown>;
let state: SessionState | undefined;
const hook = registerHooks({ load(request, context, next) {
  if (request !== engine.href) return next(request, context);
  const source = readFileSync(fileURLToPath(engine), 'utf8');
  const anchor = 'const session = new Session(state, request.limits.acquisition);';
  if (source.split(anchor).length !== 2) throw new Error('The session inspection factory anchor changed');
  const inspected = source.replace(anchor, `${anchor}\nglobalThis[Symbol.for(${JSON.stringify(key)})](state);`);
  return { format: 'module', source: stripTypeScriptTypes(inspected, { mode: 'strip', sourceUrl: engine.href }), shortCircuit: true };
} });
globals[Symbol.for(key)] = (captured: SessionState): void => {
  state = captured;
  hook.deregister();
  delete globals[Symbol.for(key)];
};
const stamps = new WeakMap<object, number>();
let nextStamp = 0;
inspection.on('message', (request: { id: number; operation: 'decisions' | 'corrupt-access' }) => {
  try {
    if (!state?.facts) throw new Error('The worker has no captured session facts');
    let result: unknown;
    if (request.operation === 'decisions') {
      result = Object.fromEntries(Object.entries(state.facts.decisions).map(([id, decision]) => {
        let stamp = stamps.get(decision);
        if (stamp === undefined) { stamp = ++nextStamp; stamps.set(decision, stamp); }
        return [id, stamp];
      }));
    } else {
      const facts = state.facts;
      const entry = Object.entries(facts.files).find(([, file]) => file.accesses.length > 0);
      if (!entry) throw new Error('The fixture has no access fact to corrupt');
      const [path, file] = entry;
      result = { path, frozen: Object.isFrozen(file.accesses[0]) };
      // Replace a cloned immutable fact as a faulty revision implementation
      // would; preserve the published revision and the actual source on disk.
      state.facts = deepFreeze({ ...facts, files: { ...facts.files, [path]: { ...file,
        accesses: [{ ...file.accesses[0], specifier: './injected-audit-drift.js' }, ...file.accesses.slice(1)] } } });
    }
    inspection.postMessage({ id: request.id, result });
  } catch (error) {
    inspection.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) });
  }
});
await import('../../subs/analysis/src/session-worker.js');
