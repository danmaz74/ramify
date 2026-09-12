// Observation-only worker/socket tracing. The optional filesystem barrier holds
// native events, never manufactures them or replaces the production watcher.
import fs from 'node:fs';
import net from 'node:net';
import { channel } from 'node:diagnostics_channel';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';

const record = (event, data = {}) => fs.appendFileSync(process.env.RAMIFY_CLI_TRACE,
  JSON.stringify({ pid: process.pid, event, at: performance.timeOrigin + performance.now(), ...data }) + '\n');
channel('ramify:session-worker').subscribe(({ worker }) => {
  const commands = new Map();
  record('live-worker', { child: worker.pid });
  worker.on('thread-created', threadId => record('live-thread', { child: worker.pid, threadId }));
  worker.on('exit', code => record('live-thread-exit', { child: worker.pid, code }));
  const post = worker.postMessage;
  worker.postMessage = function (message, ...rest) {
    if (message.operation !== 'cancel') commands.set(message.id, message.operation);
    record('live-work', { child: worker.pid, id: message.id, operation: message.operation, changes: message.changes });
    return Reflect.apply(post, this, [message, ...rest]);
  };
  worker.on('message', message => {
    if (!['reply', 'error'].includes(message.kind)) return;
    const operation = commands.get(message.id); commands.delete(message.id);
    record('live-work-result', { child: worker.pid, id: message.id, operation, kind: message.kind,
      message: message.message, status: message.result?.status,
      sequence: message.result?.revision?.sequence ?? message.result?.sequence ?? message.status?.sequence,
      fields: message.result?.fields, identical: message.result?.identical });
  });
});

const write = net.Socket.prototype.write;
net.Socket.prototype.write = function (chunk, ...rest) {
  if (chunk instanceof Uint8Array && chunk.length > 4) {
    const bytes = Buffer.from(chunk);
    if (bytes.readUInt32BE(0) === bytes.length - 4) {
      let message;
      try { message = JSON.parse(bytes.subarray(4).toString('utf8')); } catch { /* Not a frame. */ }
      if (message?.type === 'request' && message.op === 'check') record('live-check', { id: message.id, params: message.params });
      if (message?.type === 'response' && message.result?.ok && message.result.value?.requestId) {
        const value = message.result.value;
        record('live-check-result', { id: message.id, requestId: value.requestId, status: value.status,
          published: value.published, sequence: value.revision?.sequence, freshness: value.freshness });
      }
    }
  }
  return Reflect.apply(write, this, [chunk, ...rest]);
};

const watch = fs.watch;
fs.watch = function (...args) {
  const watcher = Reflect.apply(watch, this, args), emit = watcher.emit;
  const gate = join(process.env.RAMIFY_ENDPOINT_DIR, 'hold-native-events');
  let timer;
  const pending = [];
  const flush = () => {
    timer = undefined;
    if (fs.existsSync(gate)) { timer = setTimeout(flush, 5); return; }
    for (const values of pending.splice(0)) {
      record('live-native-delivered', { directory: String(args[0]), kind: values[1], name: String(values[2]) });
      Reflect.apply(emit, watcher, values);
    }
  };
  watcher.emit = function (...values) {
    if (values[0] === 'change') {
      const held = fs.existsSync(gate);
      record('live-native-event', { directory: String(args[0]), kind: values[1], name: String(values[2]), held });
      if (held || pending.length) { pending.push(values); timer ??= setTimeout(flush, 5); return true; }
    }
    if (values[0] === 'close') { clearTimeout(timer); pending.splice(0); }
    return Reflect.apply(emit, this, values);
  };
  return watcher;
};
syncBuiltinESMExports();
